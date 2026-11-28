import type { BoardState, LiveLine, LiveTicket } from './model.ts';
/**
 * What the workers already write, read where it lies (never copied):
 *   .session/sprint-testing/[sprint-<n>/]<KEY>/test-session-memory.md   ## Live Progress
 *   .context/PBI/epics/<epic>/stories/STORY-<KEY>-<slug>/evidence/*.png|jpg
 * A worker that never calls the board still shows movement through these.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { applyAutomated, fold, MARKERS } from './model.ts';
import { readEvents, readSprint, readTracker, REPO_ROOT } from './store.ts';
import { DOCK_VIA } from './sweep.ts';
import { deferralLabel } from './sync.ts';

const PBI = join(REPO_ROOT, '.context', 'PBI');
const SESSIONS = join(REPO_ROOT, '.session', 'sprint-testing');
const IMG = /\.(?:png|jpe?g|gif|webp)$/i;
/** The automated run's outcome records (ADR-0020), written by `tests/KataReporter.ts`. */
const OUTCOMES = join(REPO_ROOT, 'reports', 'test-outcomes.json');

/** The outcomes file as JSON; `null` when absent, `{ unreadable: true }` when it does not parse (the fold refuses it). */
export function readAutomatedFile(path = OUTCOMES): unknown {
  if (!existsSync(path)) { return null; }
  try { return JSON.parse(readFileSync(path, 'utf8')) as unknown; }
  catch { return { unreadable: true }; }
}

const dirsOf = (dir: string): string[] => {
  try { return readdirSync(dir).filter(n => !n.startsWith('.') && statSync(join(dir, n)).isDirectory()); }
  catch { return []; }
};

/**
 * Every story folder of the PBI cache and every sprint-testing session scope, rebuilt at most every
 * 30 s; the trees are large. A ticket's folder is found by its id, never by a key pattern.
 */
let folderCache: { at: number, stories: { name: string, path: string }[], sessions: Map<string, string> } | null = null;
function folders(): NonNullable<typeof folderCache> {
  if (folderCache && Date.now() - folderCache.at < 30_000) { return folderCache; }
  const stories: { name: string, path: string }[] = [];
  const epics = join(PBI, 'epics');
  for (const epic of dirsOf(epics)) {
    const sd = join(epics, epic, 'stories');
    for (const n of dirsOf(sd)) { stories.push({ name: n, path: join(sd, n) }); }
  }
  const sessions = new Map<string, string>();
  for (const n of dirsOf(SESSIONS)) {
    if (n.startsWith('sprint-')) { for (const k of dirsOf(join(SESSIONS, n))) { sessions.set(k.toUpperCase(), join(SESSIONS, n, k)); } }
    else if (!sessions.has(n.toUpperCase())) { sessions.set(n.toUpperCase(), join(SESSIONS, n)); }
  }
  folderCache = { at: Date.now(), stories, sessions };
  return folderCache;
}

/** The ticket's PBI story folder (`STORY-<KEY>-<slug>`), where its `evidence/` lives. */
export function storyFolder(id: string): string | undefined {
  const prefix = `STORY-${id.toUpperCase()}-`;
  return folders().stories.find(s => s.name.toUpperCase().startsWith(prefix))?.path;
}

/** The ticket's sprint-testing session scope, where its `test-session-memory.md` lives. */
const sessionFolder = (id: string): string | undefined => folders().sessions.get(id.toUpperCase());

/** Header line: "## Live Progress" plus trailing horizontal whitespace only. */
const LIVE_HEAD = /^## Live Progress[^\S\n\r\u2028\u2029]*$/gm;
// End of section: the next H2 heading or the end of input. The original pattern used a literal
// `Z` (a Python `\Z` that JS does not have), which cut sections at timestamps like `14:58Z`.
const LIVE_END = /^## |(?![\s\S])/m;

/**
 * Body of the first "## Live Progress" section that has an end marker, or null.
 * Linear rewrite of /^## Live Progress\s*$([\s\S]*?)(?=^## |Z)/m: the body may
 * start a few whitespace-only lines earlier, which the line parser drops anyway.
 */
export function liveProgressSection(md: string): string | null {
  for (const h of md.matchAll(LIVE_HEAD)) {
    const rest = md.slice(h.index + h[0].length);
    const end = LIVE_END.exec(rest);
    if (end) { return rest.slice(0, end.index); }
  }
  return null;
}

export function parseLiveProgress(md: string, fileDate: string): LiveLine[] {
  const body = liveProgressSection(md);
  if (body === null) { return []; }
  const out: LiveLine[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.replace(/^\s*[-*]\s*/, '').trim();
    if (!line) { continue; }
    let at: string | undefined;
    const iso = /(\d{4}-\d{2}-\d{2})[ T~]*(\d{2}:\d{2})Z?/.exec(line);
    // `[HH:MM]` anywhere after it (the source's format), or a bare `HH:MM ` (`agentic-qa-core/references/session-management.md` §3).
    const hm = /^\[(\d{2}):(\d{2})\]/.exec(line) ?? /^(\d{2}):(\d{2})(?=\s)/.exec(line);
    if (iso) { at = `${iso[1]}T${iso[2]}:00Z`; }
    else if (hm) { at = `${fileDate}T${hm[1]}:${hm[2]}:00Z`; }
    const marker = MARKERS.find(k => new RegExp(`\\b${k}\\b`).test(line)) ?? (/\bBLOCKED_[A-Z_]+/.exec(line)?.[0]);
    const text = line.replace(/^\[\d{2}:\d{2}\]\s*/, '').replace(/^\d{2}:\d{2}\s+/, '').slice(0, 300);
    out.push({ at, marker, text });
  }
  return out.slice(-40);
}

export function readLive(ids: string[]): Record<string, LiveTicket> {
  const out: Record<string, LiveTicket> = {};
  for (const id of ids) {
    const story = storyFolder(id);
    const session = sessionFolder(id);
    if (!story && !session) { continue; }
    const t: LiveTicket = { lines: [], evidence: [] };
    const mem = session ? join(session, 'test-session-memory.md') : undefined;
    if (mem && existsSync(mem)) {
      const st = statSync(mem);
      t.memoryPath = relative(REPO_ROOT, mem);
      t.lastActivity = st.mtime.toISOString();
      t.lines = parseLiveProgress(readFileSync(mem, 'utf8'), t.lastActivity.slice(0, 10));
    }
    const ev = story ? join(story, 'evidence') : undefined;
    if (ev && existsSync(ev)) {
      t.evidence = readdirSync(ev).filter(f => IMG.test(f)).sort().map(f => relative(REPO_ROOT, join(ev, f)));
    }
    out[id] = t;
  }
  return out;
}

/** Files whose change should refresh the page: the sprint folder, each ticket's memory file, the automated outcomes. */
export function watchedFiles(ids: string[]): string[] {
  return [OUTCOMES, ...ids.flatMap((id) => {
    const story = storyFolder(id);
    const session = sessionFolder(id);
    return [...(session ? [join(session, 'test-session-memory.md')] : []), ...(story ? [join(story, 'evidence')] : [])];
  })];
}

/**
 * `closingAt` renders the board as closed at that time while still reading the
 * workers' files: the archive is taken BEFORE sprint.json records the close, so
 * the frozen copy keeps the evidence and Live Progress a closed board skips.
 */
export function buildState(slug: string, now = new Date().toISOString(), opts: { closingAt?: string, withoutDock?: boolean } = {}): BoardState {
  const sprint = readSprint(slug);
  const log = readEvents(slug);
  const { bad } = log;
  const events = opts.withoutDock ? log.events.filter(e => !e.kind.startsWith('sweep.') && e.data?.via !== DOCK_VIA) : log.events;
  const tracker = readTracker(slug);
  const ids = [...new Set([...events.map(e => e.ticket).filter((x): x is string => Boolean(x)), ...Object.keys(tracker?.tickets ?? {})])];
  // A closed sprint's worker files moved on to other sprints; do not read them.
  const live = sprint.closedAt ? {} : readLive(ids);
  if (opts.closingAt && !sprint.closedAt) { sprint.closedAt = opts.closingAt; }
  // The automated chip is live state too: a closed board keeps what its tracker said, not a later run.
  const state = applyAutomated(fold({ sprint, events, tracker, live, now, deferralLabel: deferralLabel() }), sprint.closedAt ? null : readAutomatedFile());
  if (bad) { state.warnings.push(`${bad} unreadable line(s) in events.ndjson were skipped`); }
  return state;
}
