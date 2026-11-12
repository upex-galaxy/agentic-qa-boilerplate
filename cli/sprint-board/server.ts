/**
 * Local live server, http://127.0.0.1:4477
 *
 *   /                  the page (app/index.html)
 *   /app.js /app.css   the page bundle, rebuilt when a source file changes
 *   /api/state         folded BoardState (?sprint=<slug>, default CURRENT)
 *   /api/sprints       live sprint folders + archived snapshots
 *   /api/merge         Merge Line: what the Git Flow Master collector last read (merge-read.ts)
 *   /events            SSE: "changed" when anything the board reads changes
 *   /files/<path>      evidence images (repo-relative, allowlisted roots, no SVG)
 *   /archive/<file>    frozen snapshots
 *   POST /api/answer   { ticket, needId?, text }  -> need.answer event
 *   POST /api/ask      { id, state }              -> ask.state event
 *   POST /api/msg      { text, replyTo? }         -> msg event from the owner (the inbox)
 *
 * Change detection is a 1 s fingerprint poll of known files, not fs.watch:
 * FSEvents reports real paths through the .session symlink and atomic renames
 * add noise. ~40 stat calls a second is nothing.
 */
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { brandHtml } from './brand.ts';
import { buildApp, openInBrowser } from './build.ts';
import { readMergeLine } from './merge-read.ts';
import { ASK_STATES, needTarget, oneOf } from './model.ts';
import { buildState, watchedFiles } from './sources.ts';
import { appendEvent, archiveDir, BOARD_DIR, currentSlug, listArchives, listSprints, readSprint, REPO_ROOT, serverFile, sprintDir, writeAtomic } from './store.ts';

const APP_DIR = join(import.meta.dir, 'app');
/** Merge Line's data, shared by every worktree through the .session symlink. */
const MERGE_DIR = process.env.MERGE_STATE_DIR ?? join(REPO_ROOT, '.session', 'gitflow-master');
const COLLECT = join(import.meta.dir, 'merge-collect.ts');
const mergeWatched = () => [join(MERGE_DIR, 'docs', 'meta'), join(MERGE_DIR, 'docs', 'prs'), join(MERGE_DIR, 'notes'), join(MERGE_DIR, 'collector.json')];
const EVIDENCE_ROOTS = ['.session', '.context/PBI'].map(r => join(REPO_ROOT, r));
const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

function fingerprint(paths: string[]): string {
  const parts: string[] = [];
  for (const p of paths) {
    try {
      const st = statSync(p);
      if (st.isDirectory()) {
        for (const n of readdirSync(p)) {
          if (n.endsWith('.tmp')) { continue; }
          try { const s2 = statSync(join(p, n)); parts.push(`${n}:${s2.mtimeMs}:${s2.size}`); }
          catch { /* vanished */ }
        }
      }
      else { parts.push(`${p}:${st.mtimeMs}:${st.size}`); }
    }
    catch { parts.push(`${p}:-`); }
  }
  return parts.join('|');
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function safeEvidence(rel: string): string | null {
  let abs: string;
  try { abs = realpathSync(resolve(REPO_ROOT, decodeURIComponent(rel))); }
  catch { return null; }
  const ok = EVIDENCE_ROOTS.some((root) => {
    try { const r = realpathSync(root); return abs.startsWith(r + sep); }
    catch { return false; }
  });
  return ok && IMAGE_TYPES[extname(abs).toLowerCase()] ? abs : null;
}

async function alreadyRunning(): Promise<string | null> {
  if (!existsSync(serverFile())) { return null; }
  try {
    const { pid, port } = JSON.parse(await Bun.file(serverFile()).text()) as { pid: number, port: number };
    process.kill(pid, 0);
    const r = await fetch(`http://127.0.0.1:${port}/api/sprints`, { signal: AbortSignal.timeout(800) });
    return r.ok ? `http://127.0.0.1:${port}` : null;
  }
  catch {
    return null;
  }
}

/**
 * `discover`: each periodic sync is a `sync --discover`, so new sprint tickets and the UNTRACKED
 * list stay fresh between conductor passes; the sentinel reads them from source.json and never calls the tracker.
 */
/**
 * The Merge Line loop: one `merge-collect.ts` at a time, every `everySec`, its status in
 * collector.json so the page can say whether it is live and why not. Zero model tokens: the
 * collector is plain code, and a 304 from GitHub costs no quota.
 */
function startMergeLoop(everySec: number): void {
  if (everySec <= 0 || !existsSync(COLLECT)) { return; }
  const statusFile = join(MERGE_DIR, 'collector.json');
  let running = false;
  const write = (o: Record<string, unknown>) => {
    try { writeAtomic(statusFile, JSON.stringify({ everySec, ...o })); }
    catch { /* the state dir is not writable; the page will say the loop is missing */ }
  };
  const tick = async () => {
    if (running) { return; }
    running = true;
    const lastStartAt = new Date().toISOString();
    write({ running: true, lastStartAt });
    let day = '';
    try { day = (JSON.parse(await Bun.file(join(MERGE_DIR, 'docs', 'meta', 'day.json')).text()) as { date?: string }).date ?? ''; }
    catch { /* first reading */ }
    const today = new Date().toLocaleDateString('sv-SE');
    const proc = Bun.spawn([process.execPath, COLLECT, ...(day === today ? [] : ['--boot']), '--reason', 'poll'], { stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => proc.kill(), 5 * 60_000);
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    clearTimeout(timer);
    const lastLine = out.trim().split('\n').filter(l => l.startsWith('COLLECT ')).at(-1) ?? `COLLECT fail exit ${proc.exitCode}`;
    write({ running: false, lastStartAt, lastEndAt: new Date().toISOString(), lastLine, ok: lastLine.startsWith('COLLECT ok') });
    running = false;
  };
  setInterval(() => void tick(), everySec * 1000);
  void tick();
}

export async function serve(opts: { port: number, open: boolean, syncMinutes: number, discover?: boolean, mergeEvery?: number }): Promise<void> {
  const running = await alreadyRunning();
  if (running) {
    console.log(`Sprint Board is already live at ${running}`);
    if (opts.open) { openInBrowser(running); }
    return;
  }

  const clients = new Set<ReadableStreamDefaultController<string>>();
  let lastSig = '';
  // tickets per open board, learned from /api/state, so every board the page views stays live
  const idsBySlug = new Map<string, string[]>();
  const push = (msg: string) => {
    for (const c of clients) {
      try { c.enqueue(msg); }
      catch { clients.delete(c); }
    }
  };
  const check = () => {
    let slug = '';
    try { slug = currentSlug(); }
    catch { /* no sprint yet */ }
    const dir = slug ? sprintDir(slug) : BOARD_DIR;
    const dirs = listSprints().map(x => sprintDir(x));
    const ids = [...new Set([...idsBySlug.values()].flat())];
    const sig = `${slug}#${fingerprint([join(BOARD_DIR, 'CURRENT'), dir, ...dirs, ...watchedFiles(ids), ...mergeWatched()])}`;
    if (sig !== lastSig) {
      lastSig = sig;
      push(`event: changed\ndata: ${JSON.stringify({ slug, at: new Date().toISOString() })}\n\n`);
    }
  };
  setInterval(check, 1000);
  setInterval(push, 5000, ': ping\n\n');
  startMergeLoop(opts.mergeEvery ?? 90);

  if (opts.syncMinutes > 0) {
    const { syncFromSource } = await import('./sync.ts');
    // One sync at a time: a slow tracker must not stack ticks on top of each other.
    let syncing = false;
    const tick = async () => {
      if (syncing) { return; }
      syncing = true;
      try {
        const slug = currentSlug();
        if (readSprint(slug).closedAt) { return; }
        await syncFromSource(slug, { discover: opts.discover });
      }
      catch (err) { console.warn(`auto-sync failed: ${(err as Error).message}`); }
      finally { syncing = false; }
    };
    setInterval(() => void tick(), opts.syncMinutes * 60_000);
    void tick();
  }

  const origin = (port: number) => new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: opts.port,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const allowed = origin(server.port ?? opts.port);
      if (!allowed.has(`http://${req.headers.get('host') ?? ''}`)) { return new Response('forbidden host', { status: 403 }); }
      const p = url.pathname;

      if (req.method === 'POST') {
        const o = req.headers.get('origin');
        if ((o && !allowed.has(o)) || req.headers.get('x-sprint-board') !== '1' || !req.headers.get('content-type')?.startsWith('application/json')) {
          return new Response('forbidden', { status: 403 });
        }
        const body = (await req.json().catch(() => ({}))) as Record<string, string>;
        try {
          // write to the board the page is viewing, never silently to CURRENT
          const slug = typeof body.sprint === 'string' && body.sprint ? body.sprint : currentSlug();
          if (!listSprints().includes(slug)) { return json({ error: `no board named ${slug}` }, 400); }
          if (readSprint(slug).closedAt) { return json({ error: `${slug} is closed` }, 400); }
          if (p === '/api/answer') {
            const id = String(body.ticket ?? '').toUpperCase();
            const text = String(body.text ?? '').trim().slice(0, 1500);
            if (!/^[A-Z][A-Z0-9]*-\d+$/.test(id) || !text) { return json({ error: 'ticket and text required' }, 400); }
            const t = buildState(slug).tickets.find(x => x.id === id);
            if (!t?.needs.some(n => !n.answer && !n.synthetic)) { return json({ error: `${id} has no open question to answer` }, 400); }
            const needId = needTarget(t.needs, 'answer', id, body.needId ? String(body.needId) : undefined);
            appendEvent(slug, { kind: 'need.answer', ticket: id, by: 'owner', text: `Owner answered on ${id}: ${text}`, data: { id: needId, text } });
            return json({ ok: true });
          }
          if (p === '/api/msg') {
            const text = String(body.text ?? '').trim().slice(0, 1500);
            const replyTo = body.replyTo ? String(body.replyTo) : undefined;
            if (!text) { return json({ error: 'text required' }, 400); }
            if (replyTo && !buildState(slug).inbox.some(t => t.id === replyTo || t.replies.some(r => r.id === replyTo))) {
              return json({ error: `no message ${replyTo} to reply to` }, 400);
            }
            const id = `msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
            appendEvent(slug, { kind: 'msg', by: 'owner', text: `Owner: ${text}`, data: { id, from: 'owner', text, replyTo } });
            return json({ ok: true, id });
          }
          if (p === '/api/ask') {
            const state = oneOf(ASK_STATES, String(body.state ?? ''), 'state');
            const id = String(body.id ?? '');
            if (!/^ask-[a-z0-9]+$/.test(id)) { return json({ error: 'bad id' }, 400); }
            appendEvent(slug, { kind: 'ask.state', by: 'owner', text: `Draft ${id} marked ${state}`, data: { id, state } });
            return json({ ok: true });
          }
        }
        catch (err) {
          return json({ error: (err as Error).message }, 400);
        }
        return new Response('not found', { status: 404 });
      }

      if (p === '/' || p === '/index.html') {
        return new Response(brandHtml(await Bun.file(join(APP_DIR, 'index.html')).text()), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (p === '/app.js' || p === '/app.css') {
        try {
          const built = await buildApp();
          return new Response(p === '/app.js' ? built.js : built.css, {
            headers: { 'content-type': p === '/app.js' ? 'text/javascript' : 'text/css', 'cache-control': 'no-store' },
          });
        }
        catch (err) {
          return new Response(`/* build failed: ${(err as Error).message} */`, { status: 500 });
        }
      }
      if (p === '/api/state') {
        try {
          const slug = url.searchParams.get('sprint') ?? currentSlug();
          if (!/^sprint-\d+$/.test(slug)) { return json({ error: 'bad sprint' }, 400); }
          const state = buildState(slug);
          if (!state.sprint.closedAt) { idsBySlug.set(slug, state.tickets.map(t => t.id)); }
          return json(state);
        }
        catch (err) {
          return json({ error: (err as Error).message }, 404);
        }
      }
      if (p === '/api/merge') { return json(readMergeLine(MERGE_DIR)); }
      if (p === '/api/sprints') {
        let current = '';
        try { current = currentSlug(); }
        catch { /* none */ }
        return json({
          current,
          sprints: listSprints().map((slug) => {
            const s = readSprint(slug);
            return { slug, name: s.name, startedAt: s.startedAt, closedAt: s.closedAt };
          }),
          archives: listArchives(),
        });
      }
      if (p === '/events') {
        let ctrl: ReadableStreamDefaultController<string>;
        const stream = new ReadableStream<string>({
          start(c) {
            ctrl = c;
            clients.add(c);
            c.enqueue('retry: 2000\nevent: hello\ndata: {}\n\n');
          },
          cancel() { clients.delete(ctrl); },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'connection': 'keep-alive' } });
      }
      if (p.startsWith('/files/')) {
        const abs = safeEvidence(p.slice('/files/'.length));
        if (!abs) { return new Response('not allowed', { status: 403 }); }
        return new Response(Bun.file(abs), { headers: { 'content-type': IMAGE_TYPES[extname(abs).toLowerCase()], 'x-content-type-options': 'nosniff' } });
      }
      if (p.startsWith('/archive/')) {
        const name = p.slice('/archive/'.length);
        if (!/^[\w.-]+\.html$/.test(name)) { return new Response('bad name', { status: 400 }); }
        const f = join(archiveDir(), name);
        return existsSync(f) ? new Response(Bun.file(f), { headers: { 'content-type': 'text/html; charset=utf-8' } }) : new Response('not found', { status: 404 });
      }
      return new Response('not found', { status: 404 });
    },
  });

  writeAtomic(serverFile(), JSON.stringify({ pid: process.pid, port: server.port, startedAt: new Date().toISOString() }));
  const link = `http://127.0.0.1:${server.port}`;
  console.log(`Sprint Board live at ${link}\nData: ${BOARD_DIR}`);
  if (opts.open) { openInBrowser(link); }
}
