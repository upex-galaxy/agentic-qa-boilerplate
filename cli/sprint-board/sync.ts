import type { BoardConfig, Source, SourceKind, SourceSnapshot, Ticket } from '../lib/sprint-source/index.ts';
import type { Sprint, TrackerBug, TrackerSnapshot, TrackerTicket, UntrackedTicket } from './model.ts';
/**
 * Read-only refresh from the tracker into source.json (this is its only writer).
 * The tracker owns: title, dev, QA, priority, type, status (and its bucket), sprint, module, the TC
 * list and each TC's status, and every bug linked to a tracked ticket. The read goes through
 * `cli/lib/sprint-source/` (ADR-0019): jira-xray, jira-native or a `tickets.yaml` (`none`).
 * `--discover` also lists the sprint rows that are not on the board (same read).
 * Every run reports how many rows it searched. A failed read writes nothing: the last good
 * source.json stays.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { createSource, loadBoardConfig, resolveBoardConfig, SOURCE_KINDS } from '../lib/sprint-source/index.ts';
import { boardTicketIds, lapsedDeferrals, printable, SCHEMA, trackerName, untrackedInTest } from './model.ts';
import { appendEvent, readEvents, readSprint, readTracker, withSourceLock, writeSprint, writeTracker } from './store.ts';

const print = (line: string) => console.log(printable(line));
const warn = (line: string) => console.warn(printable(line));

/** The checkout this code runs from: its `.agents/project.yaml` is the config the board reads. */
export const CODE_ROOT = resolve(import.meta.dir, '..', '..');

export interface SyncOptions {
  discover?: boolean
  only?: string[]
  /** Wait this long for another sync's source.json.lock (the CLI); 0 refuses at once (the server's tick). */
  lockWaitMs?: number
  /** `--source`: read another source than `board.source` for this run (`none` renders a `tickets.yaml`). */
  source?: SourceKind
  /** `--tickets`: the `tickets.yaml` the `none` source reads (default `board.tickets_file`). */
  ticketsFile?: string
  /** Tests inject both; the CLI loads `.agents/project.yaml` and builds the configured source. */
  config?: BoardConfig
  createSource?: (config: BoardConfig) => Source
  now?: Date
}

/** The board's config, or a refusal that names what to fix (`bun run board:check`). */
export function boardConfig(opts: Pick<SyncOptions, 'config' | 'source' | 'ticketsFile'> = {}): BoardConfig {
  let config = opts.config;
  if (!config) {
    // SPRINT_BOARD_PROJECT_YAML: read another project.yaml (the demo, the tests) instead of this checkout's.
    const alt = process.env.SPRINT_BOARD_PROJECT_YAML;
    const r = alt
      ? resolveBoardConfig(parseYaml(readFileSync(resolve(process.cwd(), alt), 'utf8')), { workflows: null, fields: null, linkTypes: null }, alt)
      : loadBoardConfig(CODE_ROOT);
    if (r.state === 'unconfigured') { throw new Error(`the board: block is not configured (${r.reason}). Fill it in .agents/project.yaml, then run bun run board:check`); }
    if (r.state === 'invalid') { throw new Error(`the board: block is invalid:\n  ${r.errors.join('\n  ')}\nRun bun run board:check`); }
    config = r.config;
  }
  if (opts.source) {
    if (!(SOURCE_KINDS as readonly string[]).includes(opts.source)) { throw new Error(`--source must be one of: ${SOURCE_KINDS.join(', ')} (got "${opts.source}")`); }
    config = { ...config, source: opts.source };
  }
  if (opts.ticketsFile) { config = { ...config, ticketsFile: resolve(process.cwd(), opts.ticketsFile) }; }
  return config;
}

export function deferralLabel(): string | undefined {
  const path = resolve(process.env.SPRINT_BOARD_PROJECT_YAML || resolve(CODE_ROOT, '.agents', 'project.yaml'));
  try {
    const label: unknown = parseYaml(readFileSync(path, 'utf8'))?.qa?.deferral?.label;
    return typeof label === 'string' && label.trim() ? label.trim() : undefined;
  }
  // An unreadable config still shows the generic mark; board:check is what reports the file.
  catch { return undefined; }
}

const orNone = (v: string | null): string | undefined => v ?? undefined;

/** One tracked ticket as the board persists it. */
export function trackerTicketOf(t: Ticket): TrackerTicket {
  return {
    title: t.title,
    dev: orNone(t.developer),
    qa: orNone(t.qaOwner),
    priority: orNone(t.priority),
    type: orNone(t.type),
    status: t.status,
    statusKey: t.statusKey,
    bucket: t.bucket,
    sprint: orNone(t.sprint),
    module: orNone(t.module),
    updatedAt: orNone(t.updatedAt),
    link: orNone(t.link),
    tcs: t.tests.map(x => ({ id: x.id, name: x.name, status: x.status, updatedAt: orNone(x.updatedAt) })),
    bugs: t.bugs,
  };
}

function trackerBugOf(b: SourceSnapshot['bugs'][string]): TrackerBug {
  return {
    title: b.title,
    status: b.status,
    statusKey: b.statusKey,
    bucket: b.bucket,
    priority: orNone(b.priority),
    sprint: orNone(b.sprint),
    updatedAt: orNone(b.updatedAt),
    createdAt: orNone(b.createdAt),
    dev: orNone(b.developer),
    qa: orNone(b.qaOwner),
    module: orNone(b.module),
    type: orNone(b.type),
    link: orNone(b.link),
  };
}

/** Whether a tracker QA owner is this board's QA: the name `new --qa` stored, or one of that person's aliases. */
function isBoardQa(sprint: Sprint, qaOwner: string | null): boolean {
  if (!qaOwner || !sprint.qa) { return false; }
  const q = qaOwner.trim().toLowerCase();
  const me = (sprint.people ?? []).find(p => p.name.toLowerCase() === sprint.qa!.toLowerCase());
  return sprint.qa.toLowerCase() === q || Boolean(me?.aliases?.some(a => a.toLowerCase() === q));
}

export async function syncFromSource(slug: string, opts: SyncOptions = {}): Promise<void> {
  const sprint = readSprint(slug);
  // A closed board's source.json is the record its archive was taken from.
  if (sprint.closedAt) { throw new Error(`${slug} is closed (${sprint.closedAt}); sync does not rewrite a closed board`); }
  const config = boardConfig(opts);
  await withSourceLock(slug, async () => {
    // Read again under the lock: the board may have been closed or archived while this sync waited.
    const now = readSprint(slug);
    if (now.closedAt) { throw new Error(`${slug} was closed (${now.closedAt}) while this sync waited for the lock; sync does not rewrite a closed board`); }
    return syncOpen(slug, now, config, opts);
  }, {
    waitMs: opts.lockWaitMs,
    onWait: (holder, waitMs) => print(`sync: waiting for the tracker sync lock (held by ${holder || 'another sync'}), up to ${Math.round(waitMs / 1000)} s`),
  });
}

async function syncOpen(slug: string, sprint: Sprint, config: BoardConfig, opts: SyncOptions): Promise<void> {
  const source = (opts.createSource ?? (c => createSource(c, { repoRoot: CODE_ROOT })))(config);
  const name = trackerName(config.source);
  const now = opts.now ?? new Date();
  const { events } = readEvents(slug);
  const prev = readTracker(slug);
  // The bugs linked on this board (`bug <ticket> <bug>`): the source reads them whatever the tracker links.
  const bugKeys = [...new Set(events.filter(e => e.kind === 'bug.link').map(e => String(e.data?.bug ?? '').toUpperCase()).filter(Boolean))];
  const ids = new Set<string>(opts.only?.length
    ? opts.only.map(x => x.toUpperCase())
    : [
        ...events.map(e => e.ticket).filter((x): x is string => Boolean(x)),
        ...Object.keys(prev?.tickets ?? {}),
      ]);

  // The pure fold checks evidence links against the hosts the config allows; keep the copy current.
  if (JSON.stringify(sprint.evidenceHosts ?? null) !== JSON.stringify(config.evidenceHosts)) { writeSprint({ ...sprint, evidenceHosts: [...config.evidenceHosts] }); }

  // --discover: every sprint row whose QA owner is this board's QA joins the board. The same rows
  // also give the sprint's tickets in the test environment that are NOT on the board (QA blank or
  // another QA), so `arrivals` can show them without a second tracker read.
  let discovered: TrackerSnapshot['discover'] = prev?.discover;
  let first: SourceSnapshot | null = null;
  let added = 0;
  if (opts.discover) {
    first = await source.snapshot({ keys: [...ids], discover: true, bugKeys, now });
    const rows = first.discover?.untracked ?? [];
    const sprintRows = first.discover?.sprintRows ?? 0;
    const mine = rows.filter(r => isBoardQa(sprint, r.qaOwner));
    print(`discover: ${sprintRows} rows in the sprint query, ${mine.length} more with QA owner ${sprint.qa ?? '(no QA set: new --qa)'}`);
    for (const r of mine) {
      if (!ids.has(r.id)) {
        ids.add(r.id);
        added++;
        appendEvent(slug, { kind: 'scope.add', ticket: r.id, text: `${r.id} joined the sprint board (found in ${name})` });
      }
    }
    // `ids` holds only the --ticket subset in that mode, so the whole board is added back here.
    const onBoard = boardTicketIds(events, prev, ids);
    const untracked: UntrackedTicket[] = rows.map(r => ({ id: r.id, title: r.title, status: r.status, bucket: r.bucket ?? undefined, qa: r.qaOwner ?? undefined }));
    // A sprint row in a status board.statuses does not list cannot be in test: named, never counted.
    const unclassified = rows.filter(r => r.bucket === null && !onBoard.has(r.id.toUpperCase())).map(r => ({ id: r.id, status: r.status }));
    if (unclassified.length) { warn(`discover: ${unclassified.length} untracked sprint row(s) in a status board.statuses does not list: ${unclassified.map(u => `${u.id} (${u.status})`).join(', ')}`); }
    // The sprint's own bug rows (the Bugs view's second source); absent when the source has no bug query, so the view says "not checked".
    const sprintBugRows = first.discover?.bugs?.map(b => ({ id: b.id, ...trackerBugOf(b) }));
    const lostBugs = first.discover?.unclassifiedBugs ?? [];
    if (lostBugs.length) { warn(`discover: ${lostBugs.length} sprint bug row(s) left out, never counted: ${lostBugs.map(u => `${u.id} (${u.status || 'no status'}): ${u.reason}`).join('; ')}`); }
    if (sprintBugRows) { print(`discover: ${sprintBugRows.length} bug rows in the sprint's bug query`); }
    discovered = { at: now.toISOString(), sprintRows, untracked: untrackedInTest(untracked, onBoard), ...(unclassified.length ? { unclassified } : {}), ...(sprintBugRows ? { bugs: sprintBugRows } : {}), ...(lostBugs.length ? { unclassifiedBugs: lostBugs.map(u => ({ id: u.id, status: u.status, reason: u.reason })) } : {}) };
  }

  if (!ids.size) {
    // Keep what --discover found off the board even when nothing is on it yet.
    if (opts.discover) { writeTracker(slug, { searched: { tickets: 0, tcs: 0, bugs: 0 }, tickets: {}, bugs: {}, ...prev, v: SCHEMA, source: config.source, syncedAt: now.toISOString(), discover: discovered }); }
    print(`sync: 0 tickets on the ${slug} board, nothing searched. Add tickets or use --discover.`);
    return;
  }

  // One keyed read; the discover read already holds every id unless it added some.
  const snap = first && !added ? first : await source.snapshot({ keys: [...ids], bugKeys, now });

  const next: TrackerSnapshot = {
    v: SCHEMA,
    source: snap.source,
    syncedAt: snap.syncedAt,
    // Counted as asked for, like the source: a ticket the tracker cannot find was still searched.
    searched: { tickets: ids.size, tcs: snap.searched.tests, bugs: snap.searched.bugs },
    tickets: { ...(prev?.tickets ?? {}) },
    bugs: { ...(prev?.bugs ?? {}) },
    discover: discovered,
  };
  let missing = 0;
  for (const id of ids) {
    const src = snap.tickets[id];
    if (!src) { missing++; warn(`sync: ${id} not found in ${name}`); continue; }
    const t = trackerTicketOf(src);
    const before = prev?.tickets[id]?.status;
    if (before && t.status && before !== t.status) {
      appendEvent(slug, { kind: 'tracker', ticket: id, text: `${name} status ${before} -> ${t.status}`, data: { from: before, to: t.status, fromBucket: prev?.tickets[id]?.bucket, bucket: t.bucket } });
    }
    const lapsed = lapsedDeferrals(readEvents(slug).events, id, prev?.tickets[id]?.tcs ?? [], t.tcs);
    if (lapsed.length) {
      appendEvent(slug, { kind: 'deferral.lapse', ticket: id, text: `${id}: the recorded owner OK no longer covers ${lapsed.join(', ')} (changed in ${name})`, data: { cases: lapsed } });
    }
    next.tickets[id] = t;
    print(`sync: ${id} ${t.status ?? '?'} (${t.bucket}), ${t.tcs.length} TCs`);
  }
  for (const [id, b] of Object.entries(snap.bugs)) { next.bugs[id] = trackerBugOf(b); }
  // A bug linked on the board that the tracker cannot find is named, never left silently open.
  const lost = snap.missing?.bugs ?? [];
  next.missing = { bugs: lost };
  if (lost.length) { warn(`sync: ${lost.length} board-linked bug(s) not found in ${name}: ${lost.join(', ')}`); }

  writeTracker(slug, next);
  print(`sync: searched ${next.searched.tickets} tickets (${missing} missing), ${next.searched.tcs} TCs, ${next.searched.bugs} bugs from ${name} (${snap.source})`);
}
