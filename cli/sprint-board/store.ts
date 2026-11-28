import type { Stats } from 'node:fs';
import type { BoardEvent, EventKind, Sprint, TrackerSnapshot } from './model.ts';
/**
 * Sprint Board storage. Plain files, gitignored, one log per sprint:
 *
 *   .session/sprint-board/
 *     CURRENT                       active sprint slug
 *     server.json                   pid + port of a running `serve`
 *     sprints/<slug>/sprint.json    meta (written by `new` / `sprint`)
 *     sprints/<slug>/events.ndjson  THE log: every fact, appended, never rewritten
 *     sprints/<slug>/source.json    what the tracker said at the last `sync` (single writer)
 *     sprints/<slug>/watchers/      one <name>.json per registered background process (watchers.ts)
 *     archive/<slug>.html           frozen snapshot of a closed sprint
 *     archive/<slug>.state.json     the state it was rendered from
 *
 * The log needs no lock: it is append-only, and each line goes out in a single
 * appendFileSync well under 4 KB (atomic on local APFS in practice). source.json
 * has two possible writers (the CLI `sync` and `serve --sync-every`), so a
 * sync holds source.json.lock beside it (withSourceLock).
 */
import { appendFileSync, existsSync, linkSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SCHEMA } from './model.ts';

/**
 * The main checkout, resolved through git's common dir, never from cwd: a
 * worktree without the .session symlink would otherwise write into its own
 * .session, and `git worktree remove` deletes that silently (measured).
 */
function resolveRepoRoot(): string {
  const here = resolve(import.meta.dir, '..', '..');
  const r = Bun.spawnSync(['git', '-C', here, 'rev-parse', '--path-format=absolute', '--git-common-dir']);
  const common = r.stdout.toString().trim();
  if (r.exitCode !== 0 || !common) { throw new Error(`sprint-board: cannot resolve the repo root from ${here} (git rev-parse failed)`); }
  return dirname(realpathSync(common));
}

export const REPO_ROOT = resolveRepoRoot();
export const BOARD_DIR = process.env.SPRINT_BOARD_DIR ?? join(REPO_ROOT, '.session', 'sprint-board');

export const sprintDir = (slug: string) => join(BOARD_DIR, 'sprints', slug);
export const archiveDir = () => join(BOARD_DIR, 'archive');

export function currentSlug(): string {
  const p = join(BOARD_DIR, 'CURRENT');
  if (!existsSync(p)) { throw new Error('No active sprint. Run: bun cli/sprint-board/index.ts new --sprint <n>'); }
  const slug = readFileSync(p, 'utf8').trim();
  if (!existsSync(join(sprintDir(slug), 'sprint.json'))) { throw new Error(`CURRENT points at "${slug}" but it has no sprint.json`); }
  return slug;
}

export function setCurrent(slug: string): void {
  mkdirSync(BOARD_DIR, { recursive: true });
  writeAtomic(join(BOARD_DIR, 'CURRENT'), `${slug}\n`);
}

export function listSprints(): string[] {
  const d = join(BOARD_DIR, 'sprints');
  if (!existsSync(d)) { return []; }
  return readdirSync(d)
    .filter(n => existsSync(join(d, n, 'sprint.json')))
    .sort((a, b) => Number(b.replace(/\D/g, '')) - Number(a.replace(/\D/g, '')));
}

export function listArchives(): string[] {
  const d = archiveDir();
  return existsSync(d) ? readdirSync(d).filter(n => n.endsWith('.html')).sort().reverse() : [];
}

/** tmp in the same real directory, then rename: readers never see half a file. */
export function writeAtomic(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
}

export function readSprint(slug: string): Sprint {
  return JSON.parse(readFileSync(join(sprintDir(slug), 'sprint.json'), 'utf8'));
}

export function writeSprint(s: Sprint): void {
  writeAtomic(join(sprintDir(s.slug), 'sprint.json'), `${JSON.stringify({ ...s, v: SCHEMA }, null, 2)}\n`);
}

export function readTracker(slug: string): TrackerSnapshot | null {
  const p = join(sprintDir(slug), 'source.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

export function writeTracker(slug: string, c: TrackerSnapshot): void {
  writeAtomic(join(sprintDir(slug), 'source.json'), `${JSON.stringify(c, null, 2)}\n`);
}

/** A lock older than this is a crashed sync, not a running one. */
const SOURCE_LOCK_STALE_MS = 10 * 60_000;

/**
 * How long a CLI sync waits for the server's periodic sync to release the lock.
 * 240 s, not 120: board:up's first sync of the morning held it ~130 s and the
 * morning watch pass gave up (measured on the source board).
 */
export const SOURCE_LOCK_WAIT_MS = 240_000;

export interface SourceLockWait {
  /** 0 (the default) refuses at once; above 0 polls for the lock up to this long. */
  waitMs?: number
  pollMs?: number
  /** Called once, on the first poll that finds the lock held. */
  onWait?: (holder: string, waitMs: number) => void
}

/**
 * Run `fn` as the only writer of this sprint's source.json. A held lock refuses
 * at once by default (the server's tick just skips); with `waitMs` the caller
 * polls for it instead, because a CLI pass that starts right after `board:up`
 * meets the server's first sync (measured on the source board).
 */
export async function withSourceLock<T>(slug: string, fn: () => Promise<T>, wait: SourceLockWait = {}): Promise<T> {
  const lock = join(sprintDir(slug), 'source.json.lock');
  const waitMs = wait.waitMs ?? 0;
  const pollMs = wait.pollMs ?? 2000;
  const started = Date.now();
  let announced = false;
  let mine = 0;
  const take = () => {
    writeFileSync(lock, `${process.pid} ${new Date().toISOString()}\n`, { flag: 'wx' });
    mine = statSync(lock).ino;
  };
  for (;;) {
    try { take(); break; }
    catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') { throw err; }
    }
    let seen: Stats;
    let holder = '';
    try { seen = statSync(lock); holder = readFileSync(lock, 'utf8').trim(); }
    catch (err) {
      // Only a lock released meanwhile retries at once; anything else would spin forever.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') { continue; }
      throw err;
    }
    if (Date.now() - seen.mtimeMs >= SOURCE_LOCK_STALE_MS) { takeOverStaleLock(lock, seen); continue; }
    const waited = Date.now() - started;
    if (waited >= waitMs) {
      throw new Error(waitMs > 0
        ? `another tracker sync still holds ${lock} after ${Math.round(waited / 1000)} s (holder: ${holder || 'unknown'}); retry when it ends`
        : `another tracker sync is running on ${slug} (${lock}); retry when it ends`);
    }
    if (!announced) { announced = true; wait.onWait?.(holder, waitMs); }
    await Bun.sleep(Math.min(pollMs, waitMs - waited));
  }
  try { return await fn(); }
  finally {
    // Release only our own lock: a sync that outlived the stale age may have been taken over.
    try { if (statSync(lock).ino === mine) { rmSync(lock, { force: true }); } }
    catch { /* already gone */ }
  }
}

/**
 * Remove a stale lock without racing another waiter. Renaming it to a unique
 * tombstone is atomic, so of several waiters that saw the same stale lock only
 * one moves it (the rest get ENOENT and simply retry `take`). If what got moved
 * is not the inode that was judged stale (another waiter already replaced it
 * with a fresh lock in between), it is put back with `link`, which refuses to
 * overwrite. Returns true when the stale lock was removed by this call.
 */
export function takeOverStaleLock(lock: string, seen: Pick<Stats, 'ino' | 'mtimeMs'>): boolean {
  const tomb = `${lock}.stale.${process.pid}.${Math.random().toString(36).slice(2)}`;
  try { renameSync(lock, tomb); }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') { return false; }
    throw err;
  }
  const moved = statSync(tomb);
  if (moved.ino !== seen.ino || moved.mtimeMs !== seen.mtimeMs) {
    try { linkSync(tomb, lock); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') { throw err; } }
    rmSync(tomb, { force: true });
    return false;
  }
  rmSync(tomb, { force: true });
  return true;
}

const MAX_LINE = 3800;

/** A user-given time (`--at`, `--started`) as ISO, so the log sorts and folds on one format. */
export function isoAt(raw: string | undefined): string | undefined {
  if (raw === undefined) { return undefined; }
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) { throw new TypeError(`"${raw}" is not a date/time; use ISO, e.g. 2026-10-15T14:30:00Z`); }
  return t.toISOString();
}

export function appendEvent(
  slug: string,
  e: { kind: EventKind, text: string, ticket?: string, by?: string, at?: string, data?: Record<string, unknown> },
): BoardEvent {
  const ev: BoardEvent = {
    v: SCHEMA,
    id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: isoAt(e.at) ?? new Date().toISOString(),
    kind: e.kind,
    ticket: e.ticket,
    by: e.by,
    text: e.text.slice(0, 400),
    data: e.data,
  };
  const line = `${JSON.stringify(ev)}\n`;
  if (Buffer.byteLength(line) > MAX_LINE) { throw new Error(`event too large (${Buffer.byteLength(line)} bytes > ${MAX_LINE}); shorten the text or use --file for drafts under 3 KB`); }
  appendFileSync(join(sprintDir(slug), 'events.ndjson'), line);
  return ev;
}

/** A last line without its newline is a write in flight: skip it, count the rest. */
export function readEvents(slug: string): { events: BoardEvent[], bad: number } {
  const p = join(sprintDir(slug), 'events.ndjson');
  if (!existsSync(p)) { return { events: [], bad: 0 }; }
  const raw = readFileSync(p, 'utf8');
  const lines = raw.split('\n');
  if (!raw.endsWith('\n')) { lines.pop(); }
  let bad = 0;
  const events: BoardEvent[] = [];
  for (const l of lines) {
    if (!l.trim()) { continue; }
    try { events.push(JSON.parse(l)); }
    catch { bad++; }
  }
  return { events, bad };
}

export const serverFile = () => join(BOARD_DIR, 'server.json');
