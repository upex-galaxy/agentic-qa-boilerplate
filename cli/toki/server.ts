/**
 * WokiToki (`toki`) - Server + blocking handshake.
 *
 * Single Bun process. Serves the spec as an HTML page (`GET /`), then `await`s
 * a `POST /submit` from the browser. Resolves the promise with the submitted
 * `Result`. All logging goes to stderr (`console.error`) - stdout is reserved
 * exclusively for the final result JSON, emitted once by `index.ts`.
 *
 * Bun built-ins only, zero external deps (stays extractable).
 */

import type { NormalizedSpec, Result, ResultBlock, RowResult } from './schema.ts';

// ============================================================================
// ERROR
// ============================================================================

/**
 * Rejected by `serveAndAwait` when no `POST /submit` arrives within
 * `timeoutMs`. Named so `index.ts` can branch on `error.name === 'TimeoutError'`
 * and exit 1 with a clear message.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// OPTIONS / HANDLE
// ============================================================================

export interface ServeOptions {
  port: number
  timeoutMs: number
  render: (spec: NormalizedSpec, submitToken: string) => string
  /** Called once the server is bound, with the actually-bound URL + port. */
  onListening?: (info: { url: string, port: number }) => void
}

/**
 * Returned by `serveAndAwait` so the caller (a SIGINT handler) can tear the
 * server down before the promise has settled.
 */
export interface ServeHandle {
  result: Promise<Result>
  stop: () => void
}

const MAX_PORT_ATTEMPTS = 20;

// ============================================================================
// BODY SHAPING
// ============================================================================

/**
 * Lightly validate + shape an arbitrary JSON body (the browser sends a full
 * Result-shaped object) into a concrete `Result`. Defensive: never throws on a
 * malformed field, just falls back to a safe default, so a slightly-off client
 * payload still resolves the handshake instead of hanging the AI.
 */
function shapeResult(body: unknown): Result {
  const obj = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const rawBlocks = Array.isArray(obj.blocks) ? obj.blocks : [];
  const blocks: ResultBlock[] = rawBlocks.map(shapeResultBlock);

  const submittedAt
    = typeof obj.submittedAt === 'string' && obj.submittedAt.length > 0
      ? obj.submittedAt
      : new Date().toISOString();

  const meta = shapeMeta(blocks);

  return { submittedAt, blocks, meta };
}

/** Shape the answer triple (controlAnswer/text/quotes) shared by blocks + rows. */
function shapeAnswer(obj: Record<string, unknown>): {
  controlAnswer: ResultBlock['controlAnswer']
  text: string
  quotes: string[]
} {
  let controlAnswer: ResultBlock['controlAnswer'] = null;
  const ca = obj.controlAnswer;
  if (typeof ca === 'string' || typeof ca === 'boolean') {
    controlAnswer = ca;
  }
  else if (Array.isArray(ca)) {
    controlAnswer = ca.filter((v): v is string => typeof v === 'string');
  }

  const text = typeof obj.text === 'string' ? obj.text : '';
  const quotes = Array.isArray(obj.quotes)
    ? obj.quotes.filter((q): q is string => typeof q === 'string')
    : [];

  return { controlAnswer, text, quotes };
}

function shapeResultRow(raw: unknown): RowResult {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id : '';
  return { id, ...shapeAnswer(obj) };
}

function shapeResultBlock(raw: unknown): ResultBlock {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id : '';

  const block: ResultBlock = { id, ...shapeAnswer(obj) };

  // Table block: pass through per-row answers (else they would be silently lost).
  if (Array.isArray(obj.rows)) {
    block.rows = obj.rows.map(shapeResultRow);
  }

  return block;
}

function shapeMeta(blocks: ResultBlock[]): Result['meta'] {
  // Authoritative: always recompute from the shaped blocks rather than trusting
  // the client's meta (a forged or buggy client could misreport it).
  return {
    answered: blocks.filter(isAnswered).length,
    total: blocks.length,
  };
}

/** Does an answer triple carry any concrete answer? (text or a control value). */
function hasAnswer(a: { controlAnswer: ResultBlock['controlAnswer'], text: string }): boolean {
  if (a.text.trim().length > 0) {
    return true;
  }
  const ca = a.controlAnswer;
  if (ca === null) {
    return false;
  }
  if (Array.isArray(ca)) {
    return ca.length > 0;
  }
  if (typeof ca === 'boolean') {
    // toggle: only ON counts as answered (matches app.js hasControlSelection).
    return ca;
  }
  // string: any concrete answer counts.
  return true;
}

function isAnswered(block: ResultBlock): boolean {
  // Table block: answered if ANY row carries an answer.
  if (Array.isArray(block.rows)) {
    return block.rows.some(hasAnswer);
  }
  return hasAnswer(block);
}

// ============================================================================
// SERVE + AWAIT
// ============================================================================

/**
 * Start an HTTP server for `spec`, then resolve once the browser POSTs the
 * result. Auto-increments past a busy port (up to ~20 attempts). Rejects with
 * `TimeoutError` if no submit lands within `opts.timeoutMs`. The server is
 * always stopped when the promise settles (resolve, reject, or external
 * `stop()`).
 *
 * The actually-bound URL + port are reported via `opts.onListening` and printed
 * to stderr.
 */
export async function serveAndAwait(
  spec: NormalizedSpec,
  opts: ServeOptions,
): Promise<Result> {
  return serve(spec, opts).result;
}

/**
 * Variant that returns a handle (promise + `stop()`), so `index.ts` can wire a
 * SIGINT teardown. `serveAndAwait` is the thin promise-only wrapper.
 */
export function serve(spec: NormalizedSpec, opts: ServeOptions): ServeHandle {
  // Per-run secret: the served page carries it, the browser echoes it back on
  // /submit (x-toki-token header). Blocks cross-origin / forged submissions from
  // poisoning the human-in-the-loop signal the AI treats as authoritative.
  const submitToken = crypto.randomUUID();
  const html = opts.render(spec, submitToken);

  let server: ReturnType<typeof Bun.serve> | null = null;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  let resolveResult!: (value: Result) => void;
  let rejectResult!: (reason: Error) => void;
  const result = new Promise<Result>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  function cleanup(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (server) {
      // server.stop() returns a Promise in Bun; we do not need to await teardown.
      void server.stop(true);
      server = null;
    }
  }

  function finish(action: () => void): void {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    action();
  }

  // Bind a port, auto-incrementing past EADDRINUSE.
  let boundPort = opts.port;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const candidate = opts.port + attempt;
    try {
      server = Bun.serve({
        port: candidate,
        // Loopback only: the page + /submit must not be reachable from the LAN.
        hostname: '127.0.0.1',
        fetch: handleRequest,
      });
      boundPort = candidate;
      lastError = null;
      break;
    }
    catch (error) {
      lastError = error;
      if (isAddrInUse(error)) {
        console.error(`[toki] port ${candidate} busy, trying ${candidate + 1}...`);
        continue;
      }
      // Non-port error: stop trying.
      break;
    }
  }

  if (!server) {
    const message
      = lastError instanceof Error ? lastError.message : String(lastError);
    finish(() =>
      rejectResult(
        new Error(
          `Failed to bind a port starting at ${opts.port} after ${MAX_PORT_ATTEMPTS} attempts: ${message}`,
        ),
      ),
    );
    return { result, stop: () => finish(() => {}) };
  }

  const url = `http://localhost:${boundPort}/`;
  console.error(`[toki] waiting for input at ${url}`);
  opts.onListening?.({ url, port: boundPort });

  timer = setTimeout(() => {
    finish(() =>
      rejectResult(
        new TimeoutError(
          `No submission received within ${Math.round(opts.timeoutMs / 1000)}s. Aborting.`,
        ),
      ),
    );
  }, opts.timeoutMs);
  // Do not let the timeout keep the event loop alive on its own.
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  async function handleRequest(request: Request): Promise<Response> {
    const { method } = request;
    const path = new URL(request.url).pathname;

    if (method === 'GET' && path === '/') {
      return new Response(html, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    if (method === 'POST' && path === '/submit') {
      // CSRF / forgery gate: only the page we served knows submitToken. A custom
      // header also forces a CORS preflight, blocking cross-origin simple POSTs.
      if (request.headers.get('x-toki-token') !== submitToken) {
        console.error('[toki] rejected /submit: missing or invalid token');
        return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
      }
      let body: unknown;
      try {
        body = await request.json();
      }
      catch {
        console.error('[toki] received a /submit with an unparseable JSON body');
        return Response.json(
          { ok: false, error: 'invalid JSON body' },
          { status: 400 },
        );
      }
      const shaped = shapeResult(body);
      // Defer resolve + teardown so THIS 200 response flushes to the browser
      // first. `resolveResult` lets index.ts write the result and process.exit(0),
      // and `finish()` force-stops the server; doing either inline races the
      // in-flight response and the browser shows a false "submit failed". A short
      // delay lets Bun flush the socket before the process tears down.
      setTimeout(() => finish(() => resolveResult(shaped)), 50);
      return Response.json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  }

  return {
    result,
    stop: () => finish(() => {}),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function isAddrInUse(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const e = error as { code?: unknown, message?: unknown };
  if (e.code === 'EADDRINUSE') {
    return true;
  }
  return typeof e.message === 'string' && e.message.includes('EADDRINUSE');
}
