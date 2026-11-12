/**
 * @fileoverview The local server behind the page (plan §2 and §6).
 *
 *   GET  /r/<token>/          the page (self-contained HTML)
 *   GET  /r/<token>/events    Server-Sent Events: the journal, replayed from Last-Event-ID, then live
 *   POST /r/<token>/answer    { id, value } -> the reporter (first answer wins)
 *
 * Security of a server any local process can reach:
 *   - bound to 127.0.0.1 only;
 *   - a per-run random token in the path, compared in constant time (wrong token = 404);
 *   - `POST answer` also needs the `x-run-token` header, which forces a CORS
 *     preflight a foreign page cannot pass, and an `Origin` that is this server;
 *   - every request needs `Host: 127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding guard).
 *
 * The SSE connection has Bun's idle timeout disabled and gets a heartbeat comment
 * every 15 s. The server stops `stopAfterEndMs` (2 s) after `run.end`; a demo or a
 * saved replay passes `null` to keep it up.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 * Import-closed (`cli/`): node built-ins, Bun globals and sibling files only.
 */

import type { Journal, JournalEntry } from './events.ts';
import type { AnswerResult } from './reporter.ts';

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Distinct from `bun run docs` (4173) and the Dev onboarding page (4321). */
export const DEFAULT_PORT = 4380;

export interface BrowserSinkOptions {
  journal: Journal
  /** Where answers go (`reporter.answer(id, value, 'page')`). Absent = a replay: every answer is refused. */
  answer?: (id: string, value: unknown) => AnswerResult
  /** Builds the page HTML for this server's token. */
  page: (ctx: { token: string }) => string
  port?: number
  /** How many ports after `port` to try before letting the OS pick one. Default 20. */
  portWalk?: number
  token?: string
  /** ms after `run.end` before the server stops. `null` keeps it running. Default 2000. */
  stopAfterEndMs?: number | null
  heartbeatMs?: number
}

export interface BrowserSink {
  readonly url: string
  readonly port: number
  readonly token: string
  /** true while at least one page holds the event stream open. */
  hasClient: () => boolean
  clients: () => number
  stop: () => Promise<void>
  /** Resolves once the server has stopped (after `run.end` or `stop()`). */
  readonly stopped: Promise<void>
}

export function newToken(): string {
  return randomBytes(18).toString('base64url');
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function sse(entry: JournalEntry): string {
  return `id: ${entry.seq}\ndata: ${JSON.stringify(entry)}\n\n`;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const NOT_FOUND = (): Response => new Response('Not found', { status: 404 });

export async function startBrowserSink(opts: BrowserSinkOptions): Promise<BrowserSink> {
  const token = opts.token ?? newToken();
  const heartbeatMs = opts.heartbeatMs ?? 15_000;
  const stopAfterEndMs = opts.stopAfterEndMs === undefined ? 2_000 : opts.stopAfterEndMs;
  const streams = new Set<ReadableStreamDefaultController<Uint8Array>>();
  // One cleanup per open stream: closing a stream from the server side does not
  // run its `cancel`, and a heartbeat left behind keeps the process alive.
  const cleanups = new Set<() => void>();
  const encoder = new TextEncoder();
  let port = 0;
  let stopping = false;
  let resolveStopped!: () => void;
  const stopped = new Promise<void>((r) => { resolveStopped = r; });

  const allowedHosts = (): string[] => [`127.0.0.1:${port}`, `localhost:${port}`];
  const allowedOrigins = (): string[] => allowedHosts().map(h => `http://${h}`);

  const handler = async (req: Request, server: ReturnType<typeof Bun.serve>): Promise<Response> => {
    if (!allowedHosts().includes(req.headers.get('host') ?? '')) { return new Response('Forbidden host', { status: 403 }); }
    const origin = req.headers.get('origin');
    if (origin !== null && !allowedOrigins().includes(origin)) { return new Response('Forbidden origin', { status: 403 }); }

    const url = new URL(req.url);
    const m = /^\/r\/([^/]+)\/(events|answer)?$/.exec(url.pathname);
    if (!m || !sameToken(m[1], token)) { return NOT_FOUND(); }
    const route = m[2] ?? '';

    if (route === '' && req.method === 'GET') {
      return new Response(opts.page({ token }), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    if (route === 'events' && req.method === 'GET') {
      server.timeout(req, 0);
      const fromHeader = Number(req.headers.get('last-event-id') ?? '');
      const fromQuery = Number(url.searchParams.get('last') ?? '');
      const after = Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : (Number.isFinite(fromQuery) && fromQuery > 0 ? fromQuery : 0);
      let unsubscribe = (): void => {};
      let beat: ReturnType<typeof setInterval> | undefined;
      let self: ReadableStreamDefaultController<Uint8Array> | undefined;
      const cleanup = (): void => {
        unsubscribe();
        clearInterval(beat);
        if (self) { streams.delete(self); }
        cleanups.delete(cleanup);
      };
      cleanups.add(cleanup);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          self = controller;
          streams.add(controller);
          const send = (s: string): void => {
            try { controller.enqueue(encoder.encode(s)); }
            catch { /* stream already closed */ }
          };
          send('retry: 1000\n\n');
          // Subscribe BEFORE reading the backlog, then drop duplicates by seq: an
          // event appended in between is neither lost nor sent twice.
          let lastSent = after;
          const queue: JournalEntry[] = [];
          let replaying = true;
          unsubscribe = opts.journal.subscribe((e) => {
            if (replaying) { queue.push(e); return; }
            if (e.seq > lastSent) { lastSent = e.seq; send(sse(e)); }
          });
          for (const e of [...opts.journal.since(after), ...queue]) {
            if (e.seq > lastSent) { lastSent = e.seq; send(sse(e)); }
          }
          replaying = false;
          beat = setInterval(send, heartbeatMs, ': hb\n\n');
        },
        cancel() { cleanup(); },
      });
      return new Response(body, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    if (route === 'answer' && req.method === 'POST') {
      const headerToken = req.headers.get('x-run-token') ?? '';
      if (!sameToken(headerToken, token)) { return json(403, { error: 'token' }); }
      if (origin === null) { return json(403, { error: 'origin' }); }
      if (!(req.headers.get('content-type') ?? '').includes('application/json')) { return json(415, { error: 'content-type' }); }
      let body: unknown;
      try { body = await req.json(); }
      catch { return json(400, { error: 'invalid', message: 'Body is not JSON.' }); }
      const { id, value } = (body ?? {}) as { id?: unknown, value?: unknown };
      if (typeof id !== 'string') { return json(400, { error: 'invalid', message: 'Missing question id.' }); }
      if (!opts.answer) { return json(409, { error: 'answered', message: 'This page is a replay: nothing can be answered.' }); }
      const r = opts.answer(id, value);
      if (r.ok) { return json(200, { ok: true, label: r.label }); }
      return json(r.code === 'invalid' ? 400 : r.code === 'answered' ? 409 : 404, { error: r.code, message: r.message });
    }

    return new Response('Method not allowed', { status: 405 });
  };

  let server: ReturnType<typeof Bun.serve> | undefined;
  const first = opts.port ?? DEFAULT_PORT;
  const walk = opts.portWalk ?? 20;
  const candidates = [...Array.from({ length: walk + 1 }, (_, i) => first + i), 0];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      server = Bun.serve({ hostname: '127.0.0.1', port: candidate, fetch: async (req, srv) => handler(req, srv) });
      break;
    }
    catch (e) { lastError = e; }
  }
  if (!server) { throw lastError instanceof Error ? lastError : new Error('Could not bind a local port for the page.'); }
  port = server.port ?? 0;
  const live = server;

  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribeEnd = (): void => {};

  const stop = async (): Promise<void> => {
    if (stopping) { return stopped; }
    stopping = true;
    clearTimeout(endTimer);
    unsubscribeEnd();
    for (const c of streams) {
      try { c.close(); }
      catch { /* already closed */ }
    }
    for (const fn of [...cleanups]) { fn(); }
    streams.clear();
    // `stop(true)` can wait on a page that still holds its stream open; the run
    // must end anyway, so the wait is capped (the socket dies with the process).
    await Promise.race([live.stop(true), new Promise<void>(r => setTimeout(r, 500).unref?.())]);
    resolveStopped();
    return stopped;
  };

  const armEnd = (): void => {
    if (stopAfterEndMs === null || endTimer) { return; }
    endTimer = setTimeout(() => { void stop(); }, stopAfterEndMs);
  };
  unsubscribeEnd = opts.journal.subscribe((e) => { if (e.t === 'run.end') { armEnd(); } });
  if (opts.journal.ended) { armEnd(); }

  return {
    url: `http://127.0.0.1:${port}/r/${token}/`,
    port,
    token,
    hasClient: () => streams.size > 0,
    clients: () => streams.size,
    stop,
    stopped,
  };
}
