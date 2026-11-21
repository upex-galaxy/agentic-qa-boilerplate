/**
 * Sprint Board model. PURE: no fs, no network, no clock unless passed in.
 * Bundled into the page as well, so the live board, the snapshot and the tour
 * all run the same fold and the same lane rules.
 *
 * Three inputs, one output:
 *   events.ndjson  facts the conductor/owner/workers appended (the only log)
 *   source.json    what the tracker says (`cli/lib/sprint-source/`), written by `sync` alone
 *   live           what the workers' own files say (Live Progress, evidence/)
 *        -> fold() -> BoardState
 */
import type { BugBucket, SourceKind, TicketBucket } from '../lib/sprint-source/types.ts';
import { CASE_STATUSES, VERDICTS as EVIDENCE_VERDICTS } from '../lib/evidence-page/statuses.ts';
import { countedOutcome } from '../lib/sprint-source/types.ts';

export const SCHEMA = 1;

export const WORKER_STATES = ['queued', 'running', 'done', 'stopped'] as const;
export const WORKER_STAGES = ['plan', 'execute', 'report', 'close'] as const;
/** The board's ticket verdicts: every evidence-page verdict plus BLOCKED (checked below). */
export const VERDICTS = ['PENDING', 'PASSED', 'FAILED', 'BLOCKED'] as const;
/** One enum with the evidence page and the sprint source (`cli/lib/evidence-page/statuses.ts`). */
export const TC_STATUSES = CASE_STATUSES as readonly ['PASSED', 'FAILED', 'NOT RUN', 'BLOCKED', 'DEFERRED'];
/** Closed Blocker vocabulary (sprint-testing standby-report-contract.md) plus `decision`. */
export const BLOCKERS = ['decision', 'no-data', 'no-access', 'no-permission', 'partial', 'defect'] as const;
export const HOLD_REASONS = ['deploy', 'no-data', 'no-access', 'no-permission', 'defect', 'other'] as const;
export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
/** `dropped`: the draft is no longer needed and will not be sent (kept on record). */
export const ASK_STATES = ['draft', 'sent', 'answered', 'dropped'] as const;
export const ASK_KINDS = ['blocker', 'bug', 'decision', 'good-news', 'fyi'] as const;
/** Board columns, in priority order: left is where you act first. */
export const LANES = ['Needs you', 'Running', 'Failed', 'Passed'] as const;
/** Not columns: a one-line tray above the board. */
export const TRAYS = ['Held', 'Up next'] as const;
/** Live Progress terminal markers (sprint-orchestration.md heartbeat directive). */
export const MARKERS = ['RUNNING', 'COMPLETE', 'BLOCKED', 'FAILED', 'BUG_FOUND'] as const;

export const EVENT_KINDS = [
  'sprint',
  'scope.add',
  'scope.remove',
  'meta',
  'attempt',
  'worker',
  'tc',
  'verdict',
  'need.open',
  'need.answer',
  'need.close',
  'hold.set',
  'hold.clear',
  'wait.open',
  'wait.close',
  'bug.link',
  'ask.create',
  'ask.state',
  'evidence',
  'evidence.artifact',
  /** The older name of `evidence.artifact`; still read so older logs keep their links. */
  'evidence.page',
  'accept-risk',
  'note',
  'release',
  'tracker',
  'msg',
  'arrival',
  'watch.pass',
  'fixture',
] as const;
/** What the conductor did with a ticket that reached the test environment (`arrival`). */
export const ARRIVAL_ACTIONS = ['launched', 'held', 'skipped'] as const;
/** What an evidence image shows (`evidence --outcome`). */
export const EVIDENCE_OUTCOMES = ['passed', 'failed', 'blocked'] as const;
/** Who may record an evidence artifact link (`evidence-artifact --by`). */
export const EVIDENCE_ARTIFACT_BY = ['worker', 'conductor', 'owner'] as const;
/** The tracker status of a bug, in three classes (`bugStatusClass`). */
export const BUG_STATUS_CLASSES = ['open', 'resolved', 'closed'] as const;
/** The Bugs view's groups: an open bug blocking a ticket, an open bug that blocks nothing, resolved or closed. */
export const BUG_GROUPS = ['blocking', 'not-blocking', 'resolved'] as const;
/** Who writes in the owner <-> Claude inbox. */
export const MSG_FROM = ['owner', 'claude'] as const;

export type WorkerState = (typeof WORKER_STATES)[number];
export type WorkerStage = (typeof WORKER_STAGES)[number];
export type Verdict = (typeof VERDICTS)[number];
export type TcStatus = (typeof TC_STATUSES)[number];
export type Blocker = (typeof BLOCKERS)[number];
export type HoldReason = (typeof HOLD_REASONS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type AskState = (typeof ASK_STATES)[number];
export type AskKind = (typeof ASK_KINDS)[number];
export type Lane = (typeof LANES)[number] | (typeof TRAYS)[number];
export type Marker = (typeof MARKERS)[number];
export type EventKind = (typeof EVENT_KINDS)[number];
export type MsgFrom = (typeof MSG_FROM)[number];
export type EvidenceOutcome = (typeof EVIDENCE_OUTCOMES)[number];
export type BugStatusClass = (typeof BUG_STATUS_CLASSES)[number];
export type BugGroup = (typeof BUG_GROUPS)[number];

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface BoardEvent {
  v: number
  id: string
  at: string
  kind: EventKind
  ticket?: string
  by?: string
  /** Human sentence for the timeline. */
  text: string
  data?: Record<string, unknown>
}

/** `inferred`: seen in the tracker but not declared with `sprint --person`, so its language is unknown. */
export interface Person { name: string, role?: string, lang: 'en' | 'es', aliases?: string[], inferred?: boolean }

export interface Sprint {
  v: number
  slug: string
  number: number
  name: string
  env?: string
  goal?: string
  stp?: string
  qa?: string
  startedAt: string
  closedAt?: string
  releases?: { label: string, at: string, ref?: string }[]
  people?: Person[]
  /** `board.evidence.allowed_hosts`, copied by `new` and `sync` so the pure fold can check evidence links. */
  evidenceHosts?: string[]
}

export interface TrackerTc { id: string, name?: string, status: TcStatus, updatedAt?: string }
export interface TrackerTicket {
  title?: string
  dev?: string
  qa?: string
  priority?: string
  type?: string
  status?: string
  /** What `board.statuses` buckets by: a workflow slug (Jira) or the file's own string (`none`). */
  statusKey?: string
  bucket?: TicketBucket
  sprint?: string
  module?: string
  updatedAt?: string
  link?: string
  tcs: TrackerTc[]
  /** Bugs the tracker links to this ticket; they join the board's own `bug` links. */
  bugs?: string[]
}
/** A bug as `sync` reads it from the tracker. Every field but the title is optional. */
export interface TrackerBug {
  title?: string
  status?: string
  statusKey?: string
  bucket?: BugBucket
  priority?: string
  sprint?: string
  updatedAt?: string
  createdAt?: string
  /** The tracker's assignee: the developer who owns the fix. */
  dev?: string
  qa?: string
  module?: string
  platform?: string
  type?: string
  link?: string
}
export interface TrackerBugRow extends TrackerBug { id: string }
export interface TrackerSnapshot {
  v: number
  /** Which `cli/lib/sprint-source/` implementation wrote it. */
  source?: SourceKind
  syncedAt: string
  searched: { tickets: number, tcs: number, bugs: number }
  tickets: Record<string, TrackerTicket>
  bugs: Record<string, TrackerBug>
  /**
   * What the last `sync --discover` saw in the sprint beyond this board (absent until one ran).
   * `bugs`: the sprint's own bug rows (the same read, no extra call);
   * absent until a source returns the sprint's own bug rows.
   */
  discover?: {
    at: string
    sprintRows: number
    untracked: UntrackedTicket[]
    bugs?: TrackerBugRow[]
    /** Untracked sprint rows in a status no bucket lists. */
    unclassified?: { id: string, status: string }[]
    /** The sprint's own bug rows left out of `bugs` (a status no bucket lists, or not a bug type): named on the Bugs view, never counted. */
    unclassifiedBugs?: { id: string, status: string, reason?: string }[]
  }
  /** Bugs linked on the board that the tracker could not find at the last sync. */
  missing?: { bugs: string[] }
}
/** A sprint ticket in the tracker that is not on the board: QA blank or another QA. */
export interface UntrackedTicket { id: string, title?: string, status?: string, bucket?: TicketBucket, qa?: string }

export interface LiveLine { at?: string, marker?: string, text: string }
export interface LiveTicket {
  memoryPath?: string
  /** mtime of test-session-memory.md: the worker's only honest liveness signal. */
  lastActivity?: string
  lines: LiveLine[]
  evidence: string[]
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** A TC's automated result from `reports/test-outcomes.json` (ADR-0020): shown BESIDE its status, never counted. */
export interface AutomatedTc { status: TcStatus, records: number, at: string, env: string }
export interface TcView { id: string, name?: string, status: TcStatus, approval?: string, reason?: string, source: 'board' | 'tracker', at?: string, history: { status: TcStatus, at: string }[], automated?: AutomatedTc }
/** One option of a decision card: `a: <action> | cost: <time/risk/who acts>`. */
export interface NeedOption { key: string, action: string, cost?: string }
/**
 * An owner question. The decision-card fields (blocked, why, choices with cost, recommend,
 * decider) are optional: a need recorded without them renders as a plain question.
 */
/**
 * The need an `answer` / `resolve` targets, or a refusal naming the open ids.
 * answer: `id` must be an unanswered need on the ticket; without one the fold
 * answers the first open need (undefined is returned). resolve: `id` must be a
 * need still on the ticket; without one the ticket must have exactly one, so a
 * bare `resolve` never clears several at once. Synthetic needs are never targets.
 */
export function needTarget(needs: Need[], action: 'answer' | 'resolve', ticket: string, id?: string): string | undefined {
  const open = needs.filter(n => !n.synthetic && (action === 'resolve' || !n.answer));
  const ids = open.map(n => n.id).join(', ') || 'none';
  if (id) {
    if (!open.some(n => n.id === id)) { throw new Error(`${id} is not an open question on ${ticket} (${open.length} open: ${ids})`); }
    return id;
  }
  if (action === 'answer') { return undefined; }
  if (open.length === 1) { return open[0].id; }
  throw new Error(open.length
    ? `${ticket} has ${open.length} open questions (${ids}); pass --id to close one`
    : `${ticket} has no open question to close`);
}

export interface Need {
  id: string
  question: string
  blocker: Blocker
  options: string[]
  since: string
  answer?: string
  answeredAt?: string
  synthetic?: boolean
  /** What cannot run until this is decided. */
  blocked?: string
  /** The reason in plain language. */
  why?: string
  /** `options` parsed into key, action and cost. */
  choices?: NeedOption[]
  /** The option key QA recommends (always one of `choices`). */
  recommend?: string
  /** Who decides, resolved against the sprint's people. */
  decider?: string
}
/** `source`: recorded with `evidence` (board) or only found in the ticket's evidence/ folder (disk). */
export interface EvidenceView { path: string, caption?: string, tc?: string, outcome?: EvidenceOutcome, source: 'board' | 'disk' }
/** Reusable test data a worker found (`fixture`). `module` falls back to the ticket's module. */
export interface Fixture { id: string, ticket: string, module?: string, text: string, at: string, by?: string }
export interface Wait { id: string, person: string, what: string, since: string }
export interface Hold { reason: HoldReason, note: string, on?: string, since: string }
/** A claude.ai artifact a worker (or the conductor) published as a ticket's or a bug's evidence page (`evidence-artifact` skill). */
export interface EvidenceArtifact { url: string, title?: string, at: string, by?: string, /** Older pages for the same ticket or bug, newest first. */ history: { url: string, title?: string, at: string, by?: string }[] }
export interface BugView { id: string, title?: string, severity?: string, status?: string, bucket?: BugBucket, sprint?: string, module?: string, dev?: string, link?: string, linkedAt?: string, page?: EvidenceArtifact, /** Set to the parent Story's id when `page` is its evidence page, not this bug's own. */ pageFrom?: string }
/** A ticket a bug was filed against (`bug KEY-n KEY-bug`). Still blocked = in QA scope and not Passed. */
export interface BugBlock { id: string, title: string, lane: Lane, stillBlocked: boolean }
/**
 * One bug of the sprint, for the Bugs view. Two sources (the rule lives in `sprintBugs`):
 *   linked  recorded on this board with `bug KEY-n KEY-bug`, whatever its tracker sprint
 *   sprint  a Work Type = Bug row of the sprint's own Backlog rows, created inside the sprint
 */
export interface SprintBug {
  id: string
  title?: string
  /** The severity given on `bug --severity`, else the tracker Priority. */
  severity?: string
  priority?: string
  status?: string
  bucket?: BugBucket
  statusClass: BugStatusClass
  /** The tracker's Sprint field: the sprint the bug is filed under, which may be a later one. */
  sprint?: string
  dev?: string
  qa?: string
  module?: string
  platform?: string
  link?: string
  createdAt?: string
  /** The tracker's created time, else the first `bug` link. */
  foundAt: string
  ageDays: number
  blocks: BugBlock[]
  group: BugGroup
  sources: ('linked' | 'sprint')[]
  page?: EvidenceArtifact
  /** Set to the blocked ticket's id when `page` is that Story's evidence page, not this bug's own. */
  pageFrom?: string
  openedInSprint: boolean
  /** Resolved or closed, with its last tracker update inside the sprint (a proxy: no resolved date is read). */
  resolvedInSprint: boolean
}
/** What the Bugs view searched (fail loudly). null = never checked (no `sync --discover` with bug rows yet). */
/** `missing`: bugs linked on the board that the tracker could not find (named on the page, never counted as found). */
/** `unclassified`: the sprint's own bug rows the source left out (status in no bucket): named, never counted. */
export interface BugSearch { linked: number, sprintRows: number | null, bugRows: number | null, createdInSprint: number | null, discoveredAt?: string, missing?: string[], unclassified?: { id: string, status: string }[] }

export interface TicketView {
  id: string
  title: string
  type?: string
  dev?: string
  priority?: string
  module?: string
  /** The tracker's Sprint field ("Sprint 7"): the report counts only tickets of this board's own sprint. */
  sprint?: string
  inScope: boolean
  trackerStatus?: string
  /** The tracker status's bucket (`board.statuses.tickets`): every gate reads this, never the status text. */
  bucket?: TicketBucket
  link?: string
  attempt: number
  worker: { state: WorkerState, stage?: WorkerStage, name?: string, lastActivity?: string, quiet: boolean }
  verdict: Verdict
  verdictNote?: string
  tcs: TcView[]
  bugs: BugView[]
  needs: Need[]
  hold: Hold | null
  waits: Wait[]
  evidence: EvidenceView[]
  /** The newest evidence artifact recorded for this ticket (`evidence-artifact KEY-n <url>`). */
  evidenceArtifact?: EvidenceArtifact
  acceptedRisk?: { by: string, note?: string, at: string }
  next?: string
  lane: Lane
  laneSince: string
  atRisk: boolean
  /** The tracker's status disagrees with the lane (e.g. Passed here, still in test there). */
  drift?: string
  startedAt?: string
  finishedAt?: string
  progress: LiveLine[]
}

export interface Ask {
  id: string
  to: string
  lang: 'en' | 'es'
  kind: AskKind
  tickets: string[]
  text: string
  attach: string[]
  state: AskState
  createdAt: string
  sentAt?: string
  answeredAt?: string
  outdated: boolean
}

/** One message in the inbox. `ask`: Claude expects an answer to it. */
export interface InboxMsg { id: string, from: MsgFrom, text: string, at: string, ticket?: string, options: string[], ask: boolean, replyTo?: string }
/**
 * A thread: the first message plus every reply, oldest first.
 * needs-owner: Claude asked and the owner has not answered yet.
 * needs-claude: the owner wrote last, so Claude owes a reply.
 */
export interface InboxThread extends InboxMsg { replies: InboxMsg[], state: 'needs-owner' | 'needs-claude' | 'done', lastAt: string }

/** `bucket`: on a `tracker` status move, the bucket it moved into. */
export interface TimelineItem { at: string, kind: EventKind | 'progress', ticket?: string, text: string, by?: string, bucket?: TicketBucket }

export interface BoardState {
  v: number
  sprint: Sprint
  tickets: TicketView[]
  asks: Ask[]
  inbox: InboxThread[]
  people: Person[]
  /** Test data found during the sprint, newest first. */
  fixtures: Fixture[]
  /** Every bug of the sprint (`sprintBugs`); absent in a state folded before the Bugs view existed. */
  bugs?: SprintBug[]
  bugSearch?: BugSearch
  timeline: TimelineItem[]
  tracker?: { source?: SourceKind, syncedAt: string, searched: TrackerSnapshot['searched'] }
  /** The conductor's test-environment watch: newest `watch.pass` and how many ran. Absent when none ever ran. */
  watch?: { lastPassAt: string, passes: number }
  warnings: string[]
  generatedAt: string
  mode: 'live' | 'snapshot' | 'share' | 'report' | 'demo'
  /** The sprint QA report's numbers (`toReportState`); only a report snapshot carries it. */
  report?: SprintReport
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Past the QA gate: the `tested` bucket of `board.statuses.tickets`, so the gate cannot drift from the tracker. */
export const isTestedBucket = (b?: string) => b === 'tested';

/** Every evidence-page verdict is a board verdict: a new one there is a compile error here. */
export const EVIDENCE_VERDICTS_ON_BOARD: readonly Verdict[] = EVIDENCE_VERDICTS;

/** What the page calls the tracker in labels. */
export const trackerName = (source?: SourceKind): string => (source === 'none' ? 'tickets.yaml' : source ? 'Jira' : 'Tracker');
const QUIET_MS = 20 * 60_000;

export function oneOf<T extends readonly string[]>(set: T, value: string, field: string): T[number] {
  const hit = set.find(v => v.toLowerCase() === String(value).toLowerCase());
  if (!hit) { throw new Error(`${field} must be one of: ${set.join(', ')} (got "${value}")`); }
  return hit;
}

export function tcCounts(tcs: { status: TcStatus }[]): Record<TcStatus, number> & { total: number } {
  const c = { 'PASSED': 0, 'FAILED': 0, 'NOT RUN': 0, 'BLOCKED': 0, 'DEFERRED': 0, 'total': 0 };
  for (const t of tcs) { c[t.status]++; c.total++; }
  return c;
}

/** Fail loudly: a name must resolve to exactly one person, or the command stops. */
export function resolvePerson(people: Person[], input: string): Person {
  const q = input.trim().toLowerCase();
  const exact = people.filter(p => p.name.toLowerCase() === q || p.aliases?.some(a => a.toLowerCase() === q));
  if (exact.length === 1) { return exact[0]; }
  const first = people.filter(p => p.name.toLowerCase().split(/\s+/)[0] === q);
  if (first.length === 1) { return first[0]; }
  const names = people.map(p => p.name).join(', ') || '(none yet: run sync, or add with sprint --person)';
  throw new Error(`"${input}" matches ${exact.length + first.length ? 'more than one' : 'no'} person. Known: ${names}`);
}

/** The tracker's Assignee can hold several people ("Dana Dev,Lee Dev"). */
export const devsOf = (dev?: string): string[] => (dev ? dev.split(/\s*,\s*/).filter(Boolean) : []);

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

// ---------------------------------------------------------------------------
// Evidence pages and bug status
// ---------------------------------------------------------------------------

const CLAUDE_ARTIFACT_PATH = /^\/(?:artifact\/[\w-]+|code\/artifact\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** `board.evidence.allowed_hosts` when a sprint predates it (the config's own default). */
export const DEFAULT_EVIDENCE_HOSTS: readonly string[] = ['claude.ai'];

/**
 * An evidence page is an https link on one of `board.evidence.allowed_hosts`; on claude.ai only
 * `https://claude.ai/artifact/<id>` or `https://claude.ai/code/artifact/<uuid>`. One trailing slash
 * is dropped; a query, a fragment, a user name, another host or plain http stops the command
 * (fail loudly). The same rules as `evidenceUrlError` in `cli/lib/evidence-page/hosts.ts`, kept here
 * because this file is bundled into the page. Returns the normalized URL.
 */
export function evidenceArtifactUrl(raw: string, hosts: readonly string[] = DEFAULT_EVIDENCE_HOSTS): string {
  const url = String(raw ?? '').trim().replace(/\/$/, '');
  let u: URL | undefined;
  try { u = new URL(url); }
  catch { u = undefined; }
  const ok = u && u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname) && !u.search && !u.hash
    && (u.hostname !== 'claude.ai' || CLAUDE_ARTIFACT_PATH.test(u.pathname));
  if (ok) { return url; }
  throw new Error(`"${raw}" is not an evidence page URL. Expected an https link on ${hosts.join(', ') || '(no allowed host: board.evidence.allowed_hosts is empty)'} (on claude.ai: https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<uuid>), with no query or fragment`);
}

/** Lenient twin for the fold and the page: a malformed URL from a hand-edited log is dropped, never rendered as a link. */
const safeArtifactUrl = (raw: unknown, hosts?: readonly string[]): string | undefined => {
  try { return typeof raw === 'string' ? evidenceArtifactUrl(raw, hosts) : undefined; }
  catch { return undefined; }
};

/**
 * A bug's tracker bucket (`board.statuses.bugs`) in three classes. closed: `discarded` (not a defect
 * after all). resolved: `resolved` (retested and closed). Everything else is open, including `fixed`:
 * the fix is deployed but QA has not retested it. Unknown (not synced yet) is open.
 */
export function bugStatusClass(bucket?: BugBucket | string): BugStatusClass {
  if (bucket === 'discarded') { return 'closed'; }
  if (bucket === 'resolved') { return 'resolved'; }
  return 'open';
}
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

// ---------------------------------------------------------------------------
// Decision cards (`needs-you --option "a: <action> | cost: <...>" --recommend a`)
// ---------------------------------------------------------------------------

const COST = /\|\s*cost\s*:/i;
const KEYED = /^([a-z0-9]{1,3})\s*:([\s\S]*)$/i;

/**
 * `a: retest after the deploy | cost: half a day, Tom redeploys` -> key a, action, cost.
 * An option without a `key:` prefix takes its position letter (a, b, c...). Throws on an
 * empty action or an empty cost after `| cost:`.
 */
export function parseOption(raw: string, index: number): NeedOption {
  const m = COST.exec(raw);
  const head = (m ? raw.slice(0, m.index) : raw).trim();
  const cost = m ? raw.slice(m.index + m[0].length).trim() : undefined;
  if (m && !cost) { throw new Error(`option "${raw}" has "| cost:" with nothing after it`); }
  const k = KEYED.exec(head);
  const key = (k ? k[1] : String.fromCharCode(97 + index)).toLowerCase();
  const action = (k ? k[2] : head).trim();
  if (!action) { throw new Error(`option "${raw}" has no action`); }
  return { key, action, cost };
}

/** Strict check for the CLI: unique keys, and `--recommend` must name one of them. */
export function decisionOptions(options: string[], recommend?: string): { choices: NeedOption[], recommend?: string } {
  const choices = options.map(parseOption);
  const seen = new Set<string>();
  for (const c of choices) {
    if (seen.has(c.key)) { throw new Error(`two options use the key "${c.key}"; give each a distinct "<key>: " prefix`); }
    seen.add(c.key);
  }
  if (recommend === undefined) { return { choices }; }
  const r = recommend.trim().toLowerCase();
  if (!choices.length) { throw new Error('--recommend needs at least one --option to point at'); }
  if (!seen.has(r)) { throw new Error(`--recommend "${recommend}" matches no option key. Keys: ${[...seen].join(', ')}`); }
  return { choices, recommend: r };
}

/** Lenient twin for the fold: a malformed option from an old log renders as its raw text. */
function choicesOf(options: string[]): NeedOption[] {
  return options.map((o, i) => {
    try { return parseOption(o, i); }
    catch { return { key: String.fromCharCode(97 + i), action: o.trim() }; }
  });
}

/** True when a need carries any decision-card field; otherwise it renders as a plain question. */
export const isDecisionCard = (n: Need): boolean =>
  Boolean(n.blocked || n.why || n.recommend || n.decider || n.choices?.some(c => c.cost));

/** `fixtures [--module m]`: newest first, optionally one module. */
export function listFixtures(all: Fixture[], module?: string): Fixture[] {
  const m = module?.trim().toLowerCase();
  return all
    .filter(f => !m || f.module?.toLowerCase() === m)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

// ---------------------------------------------------------------------------
// Lane rules: the one place a column is decided
// ---------------------------------------------------------------------------

export function laneOf(t: Omit<TicketView, 'lane' | 'laneSince' | 'atRisk' | 'drift'>): Lane {
  const c = tcCounts(t.tcs);
  if (t.needs.some(n => !n.answer)) { return 'Needs you'; }
  if (t.worker.state === 'running') { return 'Running'; }
  if (t.verdict === 'FAILED' || c.FAILED > 0) { return 'Failed'; }
  // A PASSED verdict with a case still NOT RUN or BLOCKED is not Passed: it is Held.
  if (t.verdict === 'PASSED') { return c.total === 0 || c.PASSED + c.DEFERRED === c.total ? 'Passed' : 'Held'; }
  if (t.hold || t.verdict === 'BLOCKED' || c.BLOCKED > 0) { return 'Held'; }
  // A closed sprint imported without verdict events: the tracker past the gate and every case settled.
  if (isTestedBucket(t.bucket) && (c.total === 0 ? t.type === 'Bug' : c.PASSED + c.DEFERRED === c.total)) { return 'Passed'; }
  return 'Up next';
}

/** Past the QA gate in the tracker with a case still FAILED, NOT RUN or BLOCKED. */
export function atRiskOf(t: Pick<TicketView, 'bucket' | 'tcs' | 'acceptedRisk'>): boolean {
  if (!isTestedBucket(t.bucket) || t.acceptedRisk) { return false; }
  const c = tcCounts(t.tcs);
  return c.FAILED + c['NOT RUN'] + c.BLOCKED > 0;
}

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

interface Draft {
  id: string
  inScope: boolean
  title?: string
  type?: string
  dev?: string
  priority?: string
  module?: string
  next?: string
  attempt: number
  worker: TicketView['worker']
  verdict: Verdict
  verdictNote?: string
  tcs: Map<string, TcView>
  bugs: Map<string, BugView>
  needs: Map<string, Need>
  hold: Hold | null
  waits: Map<string, Wait>
  evidence: Map<string, Omit<EvidenceView, 'path' | 'source'>>
  acceptedRisk?: TicketView['acceptedRisk']
  startedAt?: string
  /** When the current attempt began (first start, or the latest retest). */
  attemptAt?: string
  finishedAt?: string
  lastAt: string
}

export function fold(input: {
  sprint: Sprint
  events: BoardEvent[]
  tracker?: TrackerSnapshot | null
  live?: Record<string, LiveTicket>
  now: string
  mode?: BoardState['mode']
}): BoardState {
  const { sprint, tracker, now } = input;
  const live = input.live ?? {};
  const warnings: string[] = [];
  const events = [...input.events].sort((a, b) => a.at.localeCompare(b.at));
  const drafts = new Map<string, Draft>();
  const asks = new Map<string, Ask>();
  const threads = new Map<string, InboxThread>();
  const rootOf = new Map<string, string>();
  const fixtures: Fixture[] = [];
  // Evidence pages: the newest per ticket (no --bug) and per bug (--bug) wins; older ones stay in history.
  const ticketPages = new Map<string, EvidenceArtifact>();
  const bugPages = new Map<string, EvidenceArtifact>();
  const pushPage = (m: Map<string, EvidenceArtifact>, key: string, p: Omit<EvidenceArtifact, 'history'>) => {
    const prev = m.get(key);
    const history = prev ? [{ url: prev.url, title: prev.title, at: prev.at, by: prev.by }, ...prev.history] : [];
    m.set(key, { ...p, history });
  };

  const get = (id: string): Draft => {
    let d = drafts.get(id);
    if (!d) {
      d = {
        id,
        inScope: true,
        attempt: 1,
        worker: { state: 'queued', quiet: false },
        verdict: 'PENDING',
        tcs: new Map(),
        bugs: new Map(),
        needs: new Map(),
        hold: null,
        waits: new Map(),
        evidence: new Map(),
        lastAt: sprint.startedAt,
      };
      drafts.set(id, d);
    }
    return d;
  };

  for (const e of events) {
    const x = e.data ?? {};
    if (e.kind === 'ask.create') {
      const id = str(x.id) ?? e.id;
      asks.set(id, {
        id,
        to: str(x.to) ?? '?',
        lang: x.lang === 'es' ? 'es' : 'en',
        kind: (str(x.kind) as AskKind) ?? 'fyi',
        tickets: strs(x.tickets),
        text: str(x.text) ?? '',
        attach: strs(x.attach),
        state: 'draft',
        createdAt: e.at,
        outdated: false,
      });
      continue;
    }
    if (e.kind === 'msg') {
      const options = strs(x.options);
      const m: InboxMsg = {
        id: str(x.id) ?? e.id,
        from: x.from === 'claude' ? 'claude' : 'owner',
        text: str(x.text) ?? e.text,
        at: e.at,
        ticket: e.ticket,
        options,
        ask: x.ask === true || options.length > 0,
        replyTo: str(x.replyTo),
      };
      const root = m.replyTo ? rootOf.get(m.replyTo) : undefined;
      const t = root ? threads.get(root) : undefined;
      if (t) { t.replies.push(m); rootOf.set(m.id, t.id); }
      else { threads.set(m.id, { ...m, replyTo: undefined, replies: [], state: 'done', lastAt: m.at }); rootOf.set(m.id, m.id); }
      continue;
    }
    if (e.kind === 'ask.state') {
      const a = asks.get(str(x.id) ?? '');
      if (a) {
        a.state = (str(x.state) as AskState) ?? a.state;
        if (a.state === 'sent') { a.sentAt = e.at; }
        if (a.state === 'answered') { a.answeredAt = e.at; }
        if (a.state === 'draft') { a.sentAt = undefined; a.answeredAt = undefined; }
      }
      continue;
    }
    if (!e.ticket) { continue; }
    const d = get(e.ticket);
    if (e.kind !== 'note' && e.kind !== 'evidence' && e.kind !== 'evidence.artifact' && e.kind !== 'evidence.page' && e.kind !== 'fixture') { d.lastAt = e.at; }
    switch (e.kind) {
      case 'scope.add': d.inScope = x.inScope !== false; if (str(x.title)) { d.title = str(x.title); } break;
      case 'scope.remove': d.inScope = false; break;
      case 'meta':
        for (const k of ['title', 'type', 'dev', 'priority', 'module', 'next'] as const) { if (str(x[k])) { d[k] = str(x[k]); } }
        break;
      case 'attempt':
        d.attempt++;
        d.attemptAt = e.at;
        d.verdict = 'PENDING';
        d.verdictNote = undefined;
        d.finishedAt = undefined;
        d.worker = { ...d.worker, state: 'running', stage: 'plan' };
        break;
      case 'worker': {
        const st = str(x.state) as WorkerState | undefined;
        if (st) { d.worker.state = st; }
        if (str(x.stage)) { d.worker.stage = str(x.stage) as WorkerStage; }
        if (str(x.name)) { d.worker.name = str(x.name); }
        if (st === 'running' && !d.startedAt) { d.startedAt = e.at; }
        if (st === 'running' && !d.attemptAt) { d.attemptAt = e.at; }
        break;
      }
      case 'tc': {
        const id = str(x.tc)!;
        const status = str(x.status) as TcStatus;
        const tc = d.tcs.get(id) ?? { id, status, source: 'board' as const, history: [] };
        if (tc.status !== status || !tc.history.length) { tc.history.push({ status, at: e.at }); }
        tc.status = status;
        tc.at = e.at;
        tc.source = 'board';
        if (str(x.name)) { tc.name = str(x.name); }
        if (str(x.approval)) { tc.approval = str(x.approval); }
        if (str(x.reason)) { tc.reason = str(x.reason); }
        d.tcs.set(id, tc);
        break;
      }
      case 'verdict':
        d.verdict = (str(x.verdict) as Verdict) ?? d.verdict;
        d.verdictNote = str(x.note) ?? d.verdictNote;
        if (d.verdict !== 'PENDING') { d.finishedAt = e.at; d.worker.state = 'done'; }
        break;
      case 'need.open': {
        const id = str(x.id) ?? e.id;
        const options = strs(x.options);
        d.needs.set(id, {
          id,
          question: str(x.question) ?? e.text,
          blocker: (str(x.blocker) as Blocker) ?? 'decision',
          options,
          since: e.at,
          blocked: str(x.blocked),
          why: str(x.why),
          choices: options.length ? choicesOf(options) : undefined,
          recommend: str(x.recommend),
          decider: str(x.decider),
        });
        break;
      }
      case 'need.answer': {
        // An explicit id answers that need or nothing; only an id-less answer takes the first open one.
        const want = str(x.id);
        const n = want ? d.needs.get(want) : [...d.needs.values()].find(m => !m.answer);
        if (n) { n.answer = str(x.text); n.answeredAt = e.at; }
        break;
      }
      case 'need.close': {
        const id = str(x.id);
        if (id) { d.needs.delete(id); }
        else { d.needs.clear(); }
        break;
      }
      case 'hold.set':
        d.hold = { reason: (str(x.reason) as HoldReason) ?? 'other', note: str(x.note) ?? e.text, on: str(x.on), since: e.at };
        if (d.worker.state === 'running') { d.worker.state = 'stopped'; }
        break;
      case 'hold.clear': d.hold = null; break;
      case 'wait.open': {
        const id = str(x.id) ?? e.id;
        d.waits.set(id, { id, person: str(x.person) ?? '?', what: str(x.what) ?? e.text, since: e.at });
        break;
      }
      case 'wait.close': {
        const id = str(x.id);
        if (id) { d.waits.delete(id); }
        else { for (const [k, w] of d.waits) { if (w.person === str(x.person)) { d.waits.delete(k); } } }
        break;
      }
      case 'bug.link': {
        const id = str(x.bug)!;
        const prev = d.bugs.get(id);
        d.bugs.set(id, { id, title: str(x.title) ?? prev?.title, severity: str(x.severity) ?? prev?.severity, status: prev?.status, linkedAt: prev?.linkedAt ?? e.at });
        break;
      }
      case 'evidence.artifact':
      case 'evidence.page': {
        const url = safeArtifactUrl(x.url, sprint.evidenceHosts);
        if (!url) { break; }
        const page = { url, title: str(x.title), at: e.at, by: e.by };
        const bug = str(x.bug);
        if (bug) { pushPage(bugPages, bug, page); }
        else { pushPage(ticketPages, d.id, page); }
        break;
      }
      case 'evidence': {
        // A second `evidence` on the same image refines it: a field left out keeps its old value.
        const prev = d.evidence.get(str(x.path)!);
        const outcome = EVIDENCE_OUTCOMES.find(o => o === str(x.outcome));
        d.evidence.set(str(x.path)!, { caption: str(x.caption) ?? prev?.caption, tc: str(x.tc) ?? prev?.tc, outcome: outcome ?? prev?.outcome });
        break;
      }
      case 'fixture':
        fixtures.push({ id: str(x.id) ?? e.id, ticket: d.id, module: str(x.module), text: str(x.text) ?? e.text, at: e.at, by: e.by });
        break;
      case 'accept-risk': d.acceptedRisk = { by: str(x.by) ?? e.by ?? '?', note: str(x.note), at: e.at }; break;
      default: break;
    }
  }

  // Tickets the tracker knows about that the log never mentioned still belong on the board.
  for (const id of Object.keys(tracker?.tickets ?? {})) { get(id); }

  const people = new Map<string, Person>();
  for (const p of sprint.people ?? []) { people.set(p.name, p); }

  const tickets: TicketView[] = [];
  for (const d of drafts.values()) {
    const c = tracker?.tickets[d.id];
    const l = live[d.id];

    // TCs: newest wins between a board event and the tracker's row.
    const tcs = new Map([...d.tcs].map(([k, v]) => [k, { ...v, history: [...v.history] }]));
    for (const ct of c?.tcs ?? []) {
      const mine = tcs.get(ct.id);
      if (!mine) {
        tcs.set(ct.id, { id: ct.id, name: ct.name, status: ct.status, source: 'tracker', at: ct.updatedAt, history: [{ status: ct.status, at: ct.updatedAt ?? tracker!.syncedAt }] });
      }
      else {
        mine.name ??= ct.name;
        if ((ct.updatedAt ?? '') > (mine.at ?? '') && ct.status !== mine.status) {
          mine.history.push({ status: ct.status, at: ct.updatedAt! });
          mine.status = ct.status;
          mine.source = 'tracker';
          mine.at = ct.updatedAt;
        }
      }
    }

    // A bug the tracker links to the ticket is on the board too, even before anyone ran `bug`.
    for (const id of c?.bugs ?? []) { if (!d.bugs.has(id)) { d.bugs.set(id, { id }); } }
    const bugs = [...d.bugs.values()].map((b) => {
      const cb = tracker?.bugs[b.id];
      // A conductor-filed bug often has no evidence pack of its own: fall back to the parent
      // Story's already-published evidence page rather than showing no evidence at all.
      const ownPage = bugPages.get(b.id);
      const page = ownPage ?? ticketPages.get(d.id);
      const pageFrom = !ownPage && page ? d.id : undefined;
      return { ...b, title: b.title ?? cb?.title, status: cb?.status ?? b.status, bucket: cb?.bucket ?? b.bucket, sprint: cb?.sprint ?? b.sprint, module: cb?.module, dev: cb?.dev, link: cb?.link, page, pageFrom };
    });

    // A retest starts a new attempt: what the worker's file said before it is the previous run, not
    // activity of this one (a retest, measured: "active 9.3h ago, quiet" 16 s after launch).
    const since = d.attemptAt ?? '';
    const lines = (l?.lines ?? []).filter(x => !x.at || !since || x.at >= since);
    const fileActivity = l?.lastActivity && (!since || l.lastActivity >= since) ? l.lastActivity : undefined;
    const lastActivity = [fileActivity, d.worker.state === 'running' ? d.attemptAt : undefined].filter(Boolean).sort().at(-1);
    const worker = { ...d.worker, lastActivity };
    // A worker whose own file says RUNNING recently is running, even if it never told the board.
    const lastMarker = lines.at(-1)?.marker;
    if (worker.state === 'queued' && lastActivity && lastMarker === 'RUNNING' && Date.parse(now) - Date.parse(lastActivity) < 2 * 3_600_000) { worker.state = 'running'; }
    worker.quiet = worker.state === 'running' && Boolean(lastActivity) && Date.parse(now) - Date.parse(lastActivity!) > QUIET_MS;

    const needs = [...d.needs.values()];
    for (const tc of tcs.values()) {
      if (tc.status === 'DEFERRED' && !tc.approval && !tc.reason && tc.source === 'board') {
        needs.push({
          id: `deferred-${tc.id}`,
          question: `${tc.id} is DEFERRED with no recorded reason`,
          why: 'A DEFERRED case counts as covered only with its reason on record: why it could not be recreated in the test environment (a QA decision), or who accepted it. Without one the ticket cannot pass the QA gate: record the reason, or run the case.',
          blocker: 'decision',
          options: [],
          since: tc.at ?? now,
          synthetic: true,
        });
      }
    }
    if ((worker.state === 'done' || worker.state === 'stopped') && d.verdict === 'PENDING' && !d.hold) {
      needs.push({
        id: `noverdict-${d.id}`,
        question: 'The worker stopped without a verdict',
        why: 'The worker session ended without recording PASSED, FAILED or BLOCKED, so nobody can tell from the board whether the ticket was tested. Read its Live Progress, then record the verdict or start it again.',
        blocker: 'decision',
        options: [],
        since: d.lastAt,
        synthetic: true,
      });
    }

    // An image tied to a TC with no --outcome takes the outcome the TC itself shows.
    const outcomeOfTc = (id?: string): EvidenceOutcome | undefined => {
      const st = id ? tcs.get(id)?.status : undefined;
      return st === 'PASSED' ? 'passed' : st === 'FAILED' ? 'failed' : st === 'BLOCKED' ? 'blocked' : undefined;
    };
    const evidence: EvidenceView[] = [...d.evidence].map(([path, e]) => ({ path, ...e, outcome: e.outcome ?? outcomeOfTc(e.tc), source: 'board' as const }));
    for (const p of l?.evidence ?? []) { if (!d.evidence.has(p)) { evidence.push({ path: p, source: 'disk' }); } }

    const base = {
      id: d.id,
      title: c?.title ?? d.title ?? d.id,
      type: c?.type ?? d.type,
      dev: c?.dev ?? d.dev,
      priority: c?.priority ?? d.priority,
      module: c?.module ?? d.module,
      sprint: c?.sprint,
      inScope: d.inScope,
      trackerStatus: c?.status,
      bucket: c?.bucket,
      link: c?.link,
      attempt: d.attempt,
      worker,
      verdict: d.verdict,
      verdictNote: d.verdictNote,
      tcs: [...tcs.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
      bugs,
      needs,
      hold: d.hold,
      waits: [...d.waits.values()],
      evidence,
      evidenceArtifact: ticketPages.get(d.id),
      acceptedRisk: d.acceptedRisk,
      next: d.next,
      startedAt: d.startedAt,
      finishedAt: d.finishedAt,
      progress: lines,
    };
    const lane = laneOf(base);
    const atRisk = atRiskOf(base);
    let drift: string | undefined;
    if (lane === 'Passed' && c?.status && !isTestedBucket(c.bucket)) { drift = `${trackerName(tracker?.source)} still says ${c.status}`; }
    if (lane === 'Failed' && isTestedBucket(c?.bucket)) { drift = `${trackerName(tracker?.source)} moved it to ${c.status}`; }
    for (const dev of devsOf(base.dev)) { if (!people.has(dev)) { people.set(dev, { name: dev, lang: 'en', inferred: true }); } }
    tickets.push({ ...base, lane, laneSince: d.lastAt, atRisk, drift });
  }

  const bugView = sprintBugs({ sprint, tickets, tracker, pages: bugPages, now });

  // A fixture recorded without --module belongs to its ticket's module.
  const moduleOf = new Map(tickets.map(t => [t.id, t.module]));
  for (const f of fixtures) { f.module ??= moduleOf.get(f.ticket); }

  // A draft is outdated when its ticket changed after it was written.
  const byId = new Map(tickets.map(t => [t.id, t]));
  for (const a of asks.values()) {
    a.outdated = a.state === 'draft' && a.tickets.some(id => (byId.get(id)?.laneSince ?? '') > a.createdAt);
    if (!people.has(a.to)) { people.set(a.to, { name: a.to, lang: a.lang, inferred: true }); }
  }

  for (const t of threads.values()) {
    const last = t.replies.at(-1) ?? t;
    t.lastAt = last.at;
    t.state = last.from === 'owner' ? 'needs-claude' : last.ask ? 'needs-owner' : 'done';
  }

  // A watch pass every few minutes would bury the timeline; it lives in the topbar instead.
  const passes = events.filter(e => e.kind === 'watch.pass');
  const timeline: TimelineItem[] = events
    .filter(e => e.kind !== 'ask.create' && e.kind !== 'ask.state' && e.kind !== 'watch.pass')
    .map(e => ({ at: e.at, kind: e.kind, ticket: e.ticket, text: e.text, by: e.by, bucket: e.kind === 'tracker' ? str(e.data?.bucket) as TicketBucket | undefined : undefined }));
  for (const [id, l] of Object.entries(live)) {
    for (const line of l.lines) { if (line.at) { timeline.push({ at: line.at, kind: 'progress', ticket: id, text: line.text }); } }
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  if (tracker && Date.parse(now) - Date.parse(tracker.syncedAt) > 6 * 3_600_000 && !sprint.closedAt) {
    warnings.push(`${trackerName(tracker.source)} data is from ${tracker.syncedAt.slice(0, 16).replace('T', ' ')}Z. Run sync.`);
  }

  return {
    v: SCHEMA,
    sprint,
    tickets: tickets.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    asks: [...asks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    inbox: [...threads.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)),
    people: [...people.values()],
    fixtures: listFixtures(fixtures),
    bugs: bugView.bugs,
    bugSearch: bugView.search,
    timeline,
    tracker: tracker ? { source: tracker.source, syncedAt: tracker.syncedAt, searched: tracker.searched } : undefined,
    watch: passes.length ? { lastPassAt: passes.at(-1)!.at, passes: passes.length } : undefined,
    warnings,
    generatedAt: now,
    mode: input.mode ?? 'live',
  };
}

// ---------------------------------------------------------------------------
// Bugs of the sprint
// ---------------------------------------------------------------------------

const SEVERITY_RANK = (s?: string) => { const i = SEVERITIES.indexOf((s ?? '') as Severity); return i < 0 ? SEVERITIES.length : i; };
const DAY_MS = 86_400_000;

/**
 * The Bugs view's list. A bug belongs to the sprint when EITHER:
 *   1. it was linked on this board (`bug <ticket> <bug>`), or linked to a tracked ticket in the
 *      tracker, whatever sprint the tracker files it under; or
 *   2. it is one of the sprint's own bug rows (`discover.bugs`, read by `sync --discover`) whose
 *      created time falls inside the sprint (start to close, or now). Before a discover read, or
 *      on a jira source with no bug query (`board.bug_jql` neither set nor derivable),
 *      `search.bugRows` stays null and the view says "not checked".
 * A bug filed into another sprint (or none) and never linked here is not found: the view says so
 * with the denominators in `search`. Blocking = still open and filed against a ticket that is in QA
 * scope and not Passed. Sorted blocking first, then not blocking, then resolved; by severity inside.
 */
export function sprintBugs(input: { sprint: Sprint, tickets: TicketView[], tracker?: TrackerSnapshot | null, pages?: Map<string, EvidenceArtifact>, now: string }): { bugs: SprintBug[], search: BugSearch } {
  const { sprint, tickets, tracker, pages } = input;
  const start = sprint.startedAt;
  const end = sprint.closedAt ?? input.now;
  const inWindow = (at?: string) => Boolean(at && at >= start && at <= end);
  const out = new Map<string, SprintBug>();

  const make = (id: string, cb: TrackerBug | undefined): SprintBug => {
    const statusClass = bugStatusClass(cb?.bucket);
    const lost = tracker?.missing?.bugs.includes(id);
    return {
      id,
      title: cb?.title,
      severity: cb?.priority,
      priority: cb?.priority,
      status: cb?.status ?? (lost ? `not found in ${trackerName(tracker?.source)}` : undefined),
      bucket: cb?.bucket,
      statusClass,
      sprint: cb?.sprint,
      dev: cb?.dev,
      qa: cb?.qa,
      module: cb?.module,
      platform: cb?.platform,
      link: cb?.link,
      createdAt: cb?.createdAt,
      foundAt: cb?.createdAt ?? end,
      ageDays: 0,
      blocks: [],
      group: 'not-blocking',
      sources: [],
      page: pages?.get(id),
      openedInSprint: false,
      resolvedInSprint: statusClass !== 'open' && inWindow(cb?.updatedAt),
    };
  };

  // 1. linked on the board
  const linked = new Set<string>();
  for (const t of tickets) {
    for (const b of t.bugs) {
      linked.add(b.id);
      const cb = tracker?.bugs?.[b.id];
      const bug = out.get(b.id) ?? make(b.id, cb);
      if (!bug.sources.includes('linked')) { bug.sources.push('linked'); }
      bug.title ??= b.title;
      bug.sprint ??= b.sprint;
      // The worker's --severity is the QA call; the tracker's Priority is the fallback.
      if (b.severity) { bug.severity = b.severity; }
      bug.module ??= b.module ?? t.module;
      bug.dev ??= b.dev;
      bug.link ??= b.link;
      if (!cb?.createdAt && b.linkedAt && b.linkedAt < bug.foundAt) { bug.foundAt = b.linkedAt; }
      bug.blocks.push({ id: t.id, title: t.title, lane: t.lane, stillBlocked: t.inScope && t.lane !== 'Passed' });
      // A conductor-filed bug often has no evidence pack of its own: fall back to the first
      // blocked Story's already-published evidence page rather than showing no evidence at all.
      if (!bug.page && t.evidenceArtifact) { bug.page = t.evidenceArtifact; bug.pageFrom = t.id; }
      out.set(b.id, bug);
    }
  }

  // 2. Bug rows created inside the sprint, from the discover read
  const rows = tracker?.discover?.bugs;
  let createdInSprint: number | null = null;
  if (rows) {
    createdInSprint = 0;
    for (const r of rows) {
      if (!inWindow(r.createdAt)) { continue; }
      createdInSprint++;
      const bug = out.get(r.id) ?? make(r.id, { ...r, ...tracker?.bugs?.[r.id] });
      if (!bug.sources.includes('sprint')) { bug.sources.push('sprint'); }
      bug.title ??= r.title;
      bug.module ??= r.module;
      bug.dev ??= r.dev;
      bug.qa ??= r.qa;
      bug.platform ??= r.platform;
      bug.link ??= r.link;
      out.set(r.id, bug);
    }
  }

  const ref = Date.parse(end);
  for (const b of out.values()) {
    b.openedInSprint = inWindow(b.foundAt);
    const stop = b.statusClass === 'open' ? ref : Math.min(ref, Date.parse(tracker?.bugs?.[b.id]?.updatedAt ?? rows?.find(r => r.id === b.id)?.updatedAt ?? end));
    b.ageDays = Math.max(0, Math.floor((stop - Date.parse(b.foundAt)) / DAY_MS));
    b.group = b.statusClass !== 'open' ? 'resolved' : b.blocks.some(x => x.stillBlocked) ? 'blocking' : 'not-blocking';
    b.blocks.sort((x, y) => x.id.localeCompare(y.id, undefined, { numeric: true }));
  }

  const bugs = [...out.values()].sort((a, b) => BUG_GROUPS.indexOf(a.group) - BUG_GROUPS.indexOf(b.group)
    || SEVERITY_RANK(a.severity) - SEVERITY_RANK(b.severity)
    || a.id.localeCompare(b.id, undefined, { numeric: true }));
  return {
    bugs,
    search: {
      linked: linked.size,
      sprintRows: tracker?.discover && rows ? tracker.discover.sprintRows : null,
      bugRows: rows ? rows.length : null,
      createdInSprint,
      discoveredAt: rows ? tracker?.discover?.at : undefined,
      missing: tracker?.missing?.bugs.length ? [...tracker.missing.bugs] : undefined,
      unclassified: tracker?.discover?.unclassifiedBugs?.length ? tracker.discover.unclassifiedBugs.map(u => ({ id: u.id, status: u.status })) : undefined,
    },
  };
}

export interface BugCounts {
  total: number
  bySeverity: Record<string, number>
  byModule: Record<string, number>
  byStatus: Record<BugStatusClass, number>
  byGroup: Record<BugGroup, number>
  openedInSprint: number
  resolvedInSprint: number
}

/** The small numbers at the top of the Bugs view. */
export function bugCounts(bugs: SprintBug[]): BugCounts {
  const c: BugCounts = { total: bugs.length, bySeverity: {}, byModule: {}, byStatus: { open: 0, resolved: 0, closed: 0 }, byGroup: { 'blocking': 0, 'not-blocking': 0, 'resolved': 0 }, openedInSprint: 0, resolvedInSprint: 0 };
  for (const b of bugs) {
    const sev = b.severity ?? 'Unrated';
    c.bySeverity[sev] = (c.bySeverity[sev] ?? 0) + 1;
    const mod = b.module ?? 'No module';
    c.byModule[mod] = (c.byModule[mod] ?? 0) + 1;
    c.byStatus[b.statusClass]++;
    c.byGroup[b.group]++;
    if (b.openedInSprint) { c.openedInSprint++; }
    if (b.resolvedInSprint) { c.resolvedInSprint++; }
  }
  return c;
}

// ---------------------------------------------------------------------------
// Evidence view: tickets, then test cases
// ---------------------------------------------------------------------------

export interface EvidenceFilter { ticket?: string, outcome?: EvidenceOutcome | 'none', defectOnly?: boolean }
export type OutcomeCounts = Record<EvidenceOutcome | 'none', number>;
export interface EvidenceTcGroup { tc: string, name?: string, status?: TcStatus, items: EvidenceView[], counts: OutcomeCounts }
export interface EvidenceTicketGroup {
  id: string
  title: string
  lane: Lane
  page?: EvidenceArtifact
  hasDefect: boolean
  total: number
  counts: OutcomeCounts
  tcs: EvidenceTcGroup[]
  /** Images not tied to a test case, shown last. */
  untied: EvidenceView[]
}

export const outcomeCounts = (items: EvidenceView[]): OutcomeCounts => {
  const c: OutcomeCounts = { passed: 0, failed: 0, blocked: 0, none: 0 };
  for (const e of items) { c[e.outcome ?? 'none']++; }
  return c;
};

/**
 * Evidence grouped for the accordions: one group per ticket with images, each split by TC (in TC
 * order) with untied images last. `shown` drops images the page cannot display (the demo). A ticket
 * has a defect when it carries a bug, a failed image or sits in Failed. Tickets left with no image
 * after the filter are dropped.
 */
export function groupEvidence(tickets: TicketView[], filter: EvidenceFilter = {}, shown: (path: string) => boolean = () => true): EvidenceTicketGroup[] {
  const out: EvidenceTicketGroup[] = [];
  for (const t of tickets) {
    if (filter.ticket && t.id !== filter.ticket) { continue; }
    const hasDefect = t.bugs.length > 0 || t.lane === 'Failed' || t.evidence.some(e => e.outcome === 'failed');
    if (filter.defectOnly && !hasDefect) { continue; }
    const items = t.evidence.filter(e => shown(e.path) && (!filter.outcome || (e.outcome ?? 'none') === filter.outcome));
    if (!items.length) { continue; }
    const ids = [...new Set(items.map(e => e.tc).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const tcs = ids.map((tc) => {
      const its = items.filter(e => e.tc === tc);
      const view = t.tcs.find(x => x.id === tc);
      return { tc, name: view?.name, status: view?.status, items: its, counts: outcomeCounts(its) };
    });
    out.push({ id: t.id, title: t.title, lane: t.lane, page: t.evidenceArtifact, hasDefect, total: items.length, counts: outcomeCounts(items), tcs, untied: items.filter(e => !e.tc) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Metrics: eight that change a QA owner's next hour
// ---------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;
const hours = (a?: string, b?: string) => {
  if (!a || !b) { return null; }
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) && ms >= 0 ? ms / 3_600_000 : null;
};
const median = (xs: number[]) => {
  if (!xs.length) { return null; }
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface Metrics {
  scope: number
  verdicts: { done: number, of: number }
  byLane: Record<Lane, number>
  tc: Record<TcStatus, number> & { total: number, executed: number }
  passRate: number | null
  burnup: { day: string, done: number, scope: number }[]
  bugs: { total: number, open: number, bySeverity: Record<string, { open: number, closed: number }>, byDev: Record<string, number>, byModule: Record<string, number>, byStatus: Record<BugStatusClass, number> }
  firstPass: { clean: number, of: number }
  owner: { medianHours: number | null, answered: number, open: { ticket: string, hours: number }[] }
  waits: { person: string, open: number, oldestHours: number, items: { ticket: string, what: string, hours: number }[] }[]
  atRisk: string[]
  deferred: { tc: string, ticket: string, approval?: string, reason?: string }[]
}

export function metrics(s: BoardState): Metrics {
  const now = s.sprint.closedAt && s.mode !== 'demo' ? s.sprint.closedAt : s.generatedAt;
  const scope = s.tickets.filter(t => t.inScope);
  const byLane = Object.fromEntries([...LANES, ...TRAYS].map(l => [l, 0])) as Record<Lane, number>;
  const tc = { 'PASSED': 0, 'FAILED': 0, 'NOT RUN': 0, 'BLOCKED': 0, 'DEFERRED': 0, 'total': 0, 'executed': 0 };
  const bySeverity: Metrics['bugs']['bySeverity'] = {};
  const byDev: Record<string, number> = {};
  const byModule: Record<string, number> = {};
  const byStatus: Record<BugStatusClass, number> = { open: 0, resolved: 0, closed: 0 };
  const seen = new Set<string>();
  let open = 0;
  const deferred: Metrics['deferred'] = [];

  for (const t of scope) {
    byLane[t.lane]++;
    const c = tcCounts(t.tcs);
    for (const k of TC_STATUSES) { tc[k] += c[k]; }
    tc.total += c.total;
    for (const x of t.tcs) { if (x.status === 'DEFERRED') { deferred.push({ tc: x.id, ticket: t.id, approval: x.approval, reason: x.reason }); } }
    for (const b of t.bugs) {
      if (seen.has(b.id)) { continue; } // one bug can block two tickets; it is one bug
      seen.add(b.id);
      const sev = b.severity ?? 'Unrated';
      const row = (bySeverity[sev] ??= { open: 0, closed: 0 });
      const cls = bugStatusClass(b.bucket);
      byStatus[cls]++;
      if (cls !== 'open') { row.closed++; }
      else { row.open++; open++; }
      const mod = b.module ?? t.module ?? 'No module';
      byModule[mod] = (byModule[mod] ?? 0) + 1;
      const dev = devsOf(t.dev)[0] ?? 'Unassigned';
      byDev[dev] = (byDev[dev] ?? 0) + 1;
    }
  }
  tc.executed = tc.PASSED + tc.FAILED;

  const done = scope.filter(t => t.lane === 'Passed' || t.lane === 'Failed' || t.verdict !== 'PENDING');
  const doneDay = (t: TicketView) => (t.finishedAt ?? t.laneSince).slice(0, 10);
  const burnup: Metrics['burnup'] = [];
  const end = now.slice(0, 10);
  for (let d = new Date(`${s.sprint.startedAt.slice(0, 10)}T00:00:00Z`); burnup.length < 45; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (day > end) { break; }
    burnup.push({ day, done: done.filter(t => doneDay(t) <= day).length, scope: scope.length });
  }

  const answered: number[] = [];
  const openQ: { ticket: string, hours: number }[] = [];
  for (const t of scope) {
    for (const n of t.needs) {
      if (n.answer) { answered.push(hours(n.since, n.answeredAt) ?? 0); }
      else { openQ.push({ ticket: t.id, hours: round1(hours(n.since, now) ?? 0) }); }
    }
  }
  // Questions already closed survive only in the timeline.
  const openedAt = new Map<string, string>();
  for (const e of [...s.timeline].reverse()) {
    if (!e.ticket) { continue; }
    if (e.kind === 'need.open') { openedAt.set(e.ticket, e.at); }
    if (e.kind === 'need.close' && openedAt.has(e.ticket)) {
      answered.push(hours(openedAt.get(e.ticket), e.at) ?? 0);
      openedAt.delete(e.ticket);
    }
  }

  const waits = new Map<string, Metrics['waits'][number]>();
  for (const t of scope) {
    for (const w of t.waits) {
      const h = round1(hours(w.since, now) ?? 0);
      const cur = waits.get(w.person) ?? { person: w.person, open: 0, oldestHours: 0, items: [] };
      cur.open++;
      cur.oldestHours = Math.max(cur.oldestHours, h);
      cur.items.push({ ticket: t.id, what: w.what, hours: h });
      waits.set(w.person, cur);
    }
  }

  const withVerdict = scope.filter(t => t.lane === 'Passed' || t.lane === 'Failed');
  const clean = withVerdict.filter(t => t.lane === 'Passed' && t.bugs.length === 0 && t.attempt === 1
    && (t.tcs.some(x => x.status === 'PASSED') || t.type === 'Bug')).length;

  return {
    scope: scope.length,
    verdicts: { done: done.length, of: scope.length },
    byLane,
    tc,
    passRate: tc.executed ? tc.PASSED / tc.executed : null,
    burnup,
    bugs: { total: seen.size, open, bySeverity, byDev, byModule, byStatus },
    firstPass: { clean, of: withVerdict.length },
    owner: { medianHours: answered.length ? round1(median(answered)!) : null, answered: answered.length, open: openQ.sort((a, b) => b.hours - a.hours) },
    waits: [...waits.values()].sort((a, b) => b.oldestHours - a.oldestHours),
    atRisk: scope.filter(t => t.atRisk).map(t => t.id),
    deferred,
  };
}

// ---------------------------------------------------------------------------
// The share snapshot: built by ALLOWLIST, never by deleting fields
// ---------------------------------------------------------------------------

const SHARE_KINDS = new Set<TimelineItem['kind']>(['verdict', 'bug.link', 'release', 'tracker']);

// ---------------------------------------------------------------------------
// Automated outcomes (ADR-0020; ADR-0023 amendment)
// ---------------------------------------------------------------------------

/** The only outcomes schema the board reads; any other is refused with a warning. */
export const AUTOMATED_SCHEMA = 'test-outcomes/1.0';
const AUTOMATED_FILE = 'reports/test-outcomes.json';

/**
 * Put each TC's automated status beside its own: the worst of the records whose
 * `atcIds` name it (a FAILED one wins, then a not-run reason, then PASSED), only
 * for a run in the board's own environment. Nothing else changes: the TC's status,
 * the lanes, the counts and the metrics stay what the tracker and the board say,
 * and the share and report snapshots copy TCs field by field, so the chip never
 * reaches a share or report snapshot (a full snapshot freezes the owner's state
 * and carries it). `doc` is what `readAutomatedFile` returned.
 */
export function applyAutomated(state: BoardState, doc: unknown): BoardState {
  if (doc == null) { return state; }
  const refuse = (why: string): BoardState => ({ ...state, warnings: [...state.warnings, `${AUTOMATED_FILE} ignored: ${why}`] });
  const d = doc as { unreadable?: boolean, schema?: unknown, generatedAt?: unknown, run?: { environment?: unknown }, records?: unknown };
  if (d.unreadable) { return refuse('not valid JSON'); }
  if (d.schema !== AUTOMATED_SCHEMA) { return refuse(`schema ${String(d.schema)}, the board reads ${AUTOMATED_SCHEMA}`); }
  if (!Array.isArray(d.records) || typeof d.run?.environment !== 'string') { return refuse('no records or no run environment'); }
  const records = d.records as { testStatus?: unknown, atcIds?: unknown }[];
  const valid = (r: { testStatus?: unknown, atcIds?: unknown }) => (TC_STATUSES as readonly unknown[]).includes(r.testStatus)
    && Array.isArray(r.atcIds) && r.atcIds.every(x => typeof x === 'string');
  if (!records.every(valid)) { return refuse('a record with an unknown testStatus or atcIds'); }
  const env = d.run.environment;
  if (!state.sprint.env || env !== state.sprint.env) { return state; }
  const at = typeof d.generatedAt === 'string' ? d.generatedAt : state.generatedAt;
  const rank = (st: TcStatus) => (countedOutcome(st) === 'FAILED' ? 2 : countedOutcome(st) === 'NOT RUN' ? 1 : 0);
  const byTc = new Map<string, AutomatedTc>();
  for (const r of records) {
    const st = r.testStatus as TcStatus;
    for (const id of new Set(r.atcIds as string[])) {
      const prev = byTc.get(id);
      byTc.set(id, { status: prev && rank(prev.status) >= rank(st) ? prev.status : st, records: (prev?.records ?? 0) + 1, at, env });
    }
  }
  if (!byTc.size) { return state; }
  return {
    ...state,
    tickets: state.tickets.map(t => (t.tcs.some(x => byTc.has(x.id))
      ? { ...t, tcs: t.tcs.map(x => (byTc.has(x.id) ? { ...x, automated: byTc.get(x.id) } : x)) }
      : t)),
  };
}

export function toShareState(s: BoardState): BoardState {
  return {
    v: s.v,
    sprint: {
      v: s.sprint.v,
      slug: s.sprint.slug,
      number: s.sprint.number,
      name: s.sprint.name,
      env: s.sprint.env,
      goal: s.sprint.goal,
      startedAt: s.sprint.startedAt,
      closedAt: s.sprint.closedAt,
      releases: s.sprint.releases?.map(r => ({ label: r.label, at: r.at })),
    },
    tickets: s.tickets.filter(t => t.inScope).map(t => ({
      id: t.id,
      title: t.title,
      type: t.type,
      dev: t.dev,
      priority: t.priority,
      inScope: true,
      trackerStatus: t.trackerStatus,
      bucket: t.bucket,
      attempt: t.attempt,
      worker: { state: t.worker.state, quiet: false },
      verdict: t.verdict,
      tcs: t.tcs.map(x => ({ id: x.id, name: x.name, status: x.status, source: x.source, history: [] })),
      bugs: t.bugs.map(b => ({ id: b.id, title: b.title, severity: b.severity, status: b.status, bucket: b.bucket })),
      // "Needs you" means the QA owner; to the team it reads as a hold on a QA decision.
      needs: [],
      hold: t.lane === 'Needs you' ? { reason: 'other', note: 'waiting on a QA decision', since: t.laneSince } : null,
      waits: [],
      evidence: [],
      lane: t.lane === 'Needs you' ? 'Held' : t.lane,
      laneSince: t.laneSince,
      atRisk: t.atRisk,
      progress: [],
    })),
    asks: [],
    inbox: [],
    people: [],
    fixtures: [],
    timeline: s.timeline.filter(e => SHARE_KINDS.has(e.kind)).map(e => ({ at: e.at, kind: e.kind, ticket: e.ticket, text: e.text, bucket: e.bucket })),
    warnings: [],
    generatedAt: s.generatedAt,
    mode: 'share',
  };
}

// ---------------------------------------------------------------------------
// The sprint QA report: built by ALLOWLIST, counted the way the sprint's tracker record counts
// ---------------------------------------------------------------------------

/** One ticket the report lists as not tested, with the plain line that says why. */
export interface NotTestedRow { id: string, title: string, status?: string, note: string }
/** One priority's row of "Coverage by priority". */
export interface PriorityCoverage { priority: string, tickets: number, tested: number, tcs: number, passed: number, deferred: number, failed: number }
/**
 * The numbers of the sprint QA report (`snapshot --mode report`). Counting rules:
 *   report ticket  on the board, in QA scope, and the tracker's Sprint is this board's sprint (a ticket
 *                  with no tracker Sprint counts while in scope); a ticket filed under another sprint is listed
 *                  in `excluded`, never counted
 *   tested         a report ticket with at least one TC or a PASSED/FAILED verdict; signed off = tested and in the tracker's `tested` bucket
 *   not tested     0 TCs and no verdict: `neverReached` (never got to the test environment) or `notCounted` (reached it, nothing on record)
 *   tc             totals over tested tickets; passRate = PASSED / (PASSED + FAILED), coverage = PASSED / all
 *   bugs           `sprintBugs`, minus a Bug row that is itself a report ticket and was never linked with
 *                  `bug` (sprint work under test, not a bug QA found: `notFound`); priority = the tracker
 *                  first, the worker's `--severity` only when it has none; fixed = bug bucket `resolved`
 */
export interface SprintReport {
  /** The tracker Sprint value report tickets carry (the board's sprint name). */
  sprintLabel: string
  stpUrl?: string
  tickets: { total: number, tested: number, signedOff: number, notSignedOff: string[] }
  notTested: { neverReached: NotTestedRow[], notCounted: NotTestedRow[] }
  excluded: { id: string, sprint?: string }[]
  tc: Record<TcStatus, number> & { total: number }
  passRate: number | null
  coverage: number | null
  bugs: { total: number, fixed: number, open: number, byPriority: Record<string, { fixed: number, open: number }>, fixedIds: string[], openIds: string[], notFound: string[] }
  byPriority: PriorityCoverage[]
  burnup: { day: string, done: number, scope: number }[]
  deferred: { tc: string, name?: string, ticket: string }[]
}

export const REPORT_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const;
const priorityRank = (p?: string) => { const i = (REPORT_PRIORITIES as readonly string[]).indexOf(p ?? ''); return i < 0 ? REPORT_PRIORITIES.length : i; };
const byPriorityThenId = (a: { priority?: string, id: string }, b: { priority?: string, id: string }) =>
  priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id, undefined, { numeric: true });
/** Reached the test environment: in it, past it or blocked there. A ticket that never got this far was not QA's to test. */
const REACHED = new Set<string>(['in_test', 'tested', 'blocked'] satisfies TicketBucket[]);
const sameSprint = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
/** A bug's report priority: the tracker's Priority first, the worker's `--severity` only when it has none. */
export const reportPriority = (b: { priority?: string, severity?: string }): string | undefined => b.priority || b.severity || undefined;

/** The STP link the report footer carries: https on one of `hosts` (the tracker's host or an evidence host), or the command stops (fail loudly). */
export function stpUrl(raw: string, hosts: readonly string[]): string {
  let u: URL;
  try { u = new URL(String(raw ?? '').trim()); }
  catch { throw new Error(`--stp-url "${raw}" is not a URL. Expected the sprint test plan's link, https://${hosts[0] ?? '<tracker host>'}/...`); }
  if (u.protocol !== 'https:' || !hosts.includes(u.hostname)) { throw new Error(`--stp-url "${raw}" must be an https link on ${hosts.join(' or ') || 'the tracker host (issue_tracker.atlassian_url)'}`); }
  return u.href;
}
const safeStp = (raw: string | undefined, hosts: readonly string[]) => {
  try { return raw ? stpUrl(raw, hosts) : undefined; }
  catch { return undefined; }
};

const pageOf = (p?: EvidenceArtifact): EvidenceArtifact | undefined => (p ? { url: p.url, title: p.title, at: p.at, history: [] } : undefined);

/** When the ticket passed the QA gate: its newest tracker move into the tested bucket, else its verdict, else its last change. */
function signedOffAt(t: TicketView, timeline: TimelineItem[]): string {
  // The timeline is newest first: the OLDEST move into the tested bucket is when QA passed it (a later move to a done status is not).
  const hit = timeline.filter(e => e.ticket === t.id && e.kind === 'tracker' && isTestedBucket(e.bucket)).at(-1);
  return hit?.at ?? t.finishedAt ?? t.laneSince;
}

/**
 * The report snapshot's state. Like `toShareState` it is built by ALLOWLIST: drafts, the inbox,
 * answers, waits, holds, worker names, fixtures, local paths, screenshots and needs never reach it.
 * What it adds is `report` (the counted numbers) and tracker links plus validated evidence page URLs.
 */
export function toReportState(s: BoardState, opts: { stpUrl?: string, stpHosts?: readonly string[] } = {}): BoardState {
  const label = s.sprint.name;
  const scope = s.tickets.filter(t => t.inScope);
  const mine = scope.filter(t => !t.sprint || sameSprint(t.sprint, label));
  const ids = new Set(mine.map(t => t.id));
  // A worker verdict counts as tested even with 0 TCs (an ATR-only bug retest), so the report never contradicts the board's Passed lane.
  const tested = mine.filter(t => t.tcs.length > 0 || t.verdict === 'PASSED' || t.verdict === 'FAILED');
  const signed = tested.filter(t => isTestedBucket(t.bucket));

  const tc = { 'PASSED': 0, 'FAILED': 0, 'NOT RUN': 0, 'BLOCKED': 0, 'DEFERRED': 0, 'total': 0 };
  const deferred: SprintReport['deferred'] = [];
  for (const t of tested) {
    for (const x of t.tcs) {
      tc[x.status]++;
      tc.total++;
      if (x.status === 'DEFERRED') { deferred.push({ tc: x.id, name: x.name, ticket: t.id }); }
    }
  }

  const neverReached: NotTestedRow[] = [];
  const notCounted: NotTestedRow[] = [];
  for (const t of mine.filter(x => !tested.includes(x)).sort(byPriorityThenId)) {
    const st = t.trackerStatus;
    if (!t.bucket || !REACHED.has(t.bucket)) { neverReached.push({ id: t.id, title: t.title, status: st, note: `still ${st ?? 'not synced'} in ${trackerName(s.tracker?.source)} at close` }); continue; }
    const env = s.sprint.env ?? 'the test environment';
    const note = t.bucket === 'in_test' ? `in ${env}, not tested before close` : t.bucket === 'blocked' ? `blocked in ${env}, not tested before close` : 'past the QA gate with no test case on record';
    notCounted.push({ id: t.id, title: t.title, status: st, note });
  }

  // Bugs: the sprint's list, minus Bug rows that are themselves report tickets and were never linked.
  const all = s.bugs ?? [];
  const notFound = all.filter(b => !b.sources.includes('linked') && ids.has(b.id)).map(b => b.id);
  const bugs = all
    .filter(b => !notFound.includes(b.id) && (!b.sources.includes('linked') || b.sources.includes('sprint') || b.blocks.some(x => ids.has(x.id))))
    .map((b): SprintBug => ({
      id: b.id,
      title: b.title,
      severity: reportPriority(b),
      priority: b.priority,
      status: b.status,
      bucket: b.bucket,
      statusClass: b.statusClass,
      sprint: b.sprint,
      dev: b.dev,
      qa: b.qa,
      module: b.module,
      platform: b.platform,
      link: b.link,
      createdAt: b.createdAt,
      foundAt: b.foundAt,
      ageDays: b.ageDays,
      blocks: b.blocks.filter(x => ids.has(x.id)).map(x => ({ id: x.id, title: x.title, lane: x.lane, stillBlocked: x.stillBlocked })),
      group: b.group,
      sources: [...b.sources],
      page: pageOf(b.page),
      openedInSprint: b.openedInSprint,
      resolvedInSprint: b.resolvedInSprint,
    }))
    .sort((a, b) => priorityRank(a.severity) - priorityRank(b.severity) || a.id.localeCompare(b.id, undefined, { numeric: true }));
  const fixedIds = bugs.filter(b => b.bucket === 'resolved').map(b => b.id);
  const openIds = bugs.filter(b => b.bucket !== 'resolved').map(b => b.id);
  const bugByPriority: SprintReport['bugs']['byPriority'] = {};
  for (const b of bugs) {
    const row = (bugByPriority[b.severity ?? 'Unrated'] ??= { fixed: 0, open: 0 });
    if (fixedIds.includes(b.id)) { row.fixed++; }
    else { row.open++; }
  }

  const byPriority: PriorityCoverage[] = [];
  for (const p of [...REPORT_PRIORITIES, 'Not set']) {
    const list = mine.filter(t => (REPORT_PRIORITIES as readonly string[]).includes(t.priority ?? '') ? t.priority === p : p === 'Not set');
    if (!list.length) { continue; }
    const c = tcCounts(list.flatMap(t => t.tcs));
    byPriority.push({ priority: p, tickets: list.length, tested: list.filter(t => tested.includes(t)).length, tcs: c.total, passed: c.PASSED, deferred: c.DEFERRED, failed: c.FAILED });
  }

  const end = (s.sprint.closedAt ?? s.generatedAt).slice(0, 10);
  const doneDays = signed.map(t => signedOffAt(t, s.timeline).slice(0, 10));
  const burnup: SprintReport['burnup'] = [];
  for (let d = new Date(`${s.sprint.startedAt.slice(0, 10)}T00:00:00Z`); burnup.length < 45; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (day > end) { break; }
    burnup.push({ day, done: doneDays.filter(x => x <= day).length, scope: mine.length });
  }

  const report: SprintReport = {
    sprintLabel: label,
    stpUrl: safeStp(opts.stpUrl, opts.stpHosts ?? []),
    tickets: { total: mine.length, tested: tested.length, signedOff: signed.length, notSignedOff: tested.filter(t => !isTestedBucket(t.bucket)).map(t => t.id) },
    notTested: { neverReached, notCounted },
    excluded: scope.filter(t => !ids.has(t.id)).map(t => ({ id: t.id, sprint: t.sprint })),
    tc,
    passRate: tc.PASSED + tc.FAILED ? tc.PASSED / (tc.PASSED + tc.FAILED) : null,
    coverage: tc.total ? tc.PASSED / tc.total : null,
    bugs: { total: bugs.length, fixed: fixedIds.length, open: openIds.length, byPriority: bugByPriority, fixedIds, openIds, notFound },
    byPriority,
    burnup,
    deferred,
  };

  const byId = new Map(bugs.map(b => [b.id, b]));
  return {
    v: s.v,
    sprint: {
      v: s.sprint.v,
      slug: s.sprint.slug,
      number: s.sprint.number,
      name: s.sprint.name,
      env: s.sprint.env,
      goal: s.sprint.goal,
      startedAt: s.sprint.startedAt,
      closedAt: s.sprint.closedAt,
      releases: s.sprint.releases?.map(r => ({ label: r.label, at: r.at })),
    },
    tickets: [...mine].sort(byPriorityThenId).map(t => ({
      id: t.id,
      title: t.title,
      type: t.type,
      dev: t.dev,
      priority: t.priority,
      module: t.module,
      sprint: t.sprint,
      inScope: true,
      trackerStatus: t.trackerStatus,
      bucket: t.bucket,
      link: t.link,
      attempt: t.attempt,
      worker: { state: t.worker.state, quiet: false },
      verdict: t.verdict,
      tcs: t.tcs.map(x => ({ id: x.id, name: x.name, status: x.status, source: x.source, history: [] })),
      bugs: t.bugs.map(b => ({ id: b.id, title: b.title, severity: byId.get(b.id)?.severity ?? reportPriority(b), status: b.status, bucket: b.bucket, sprint: b.sprint, link: b.link, page: pageOf(b.page) })),
      needs: [],
      hold: null,
      waits: [],
      evidence: [],
      evidenceArtifact: pageOf(t.evidenceArtifact),
      lane: t.lane === 'Needs you' ? 'Held' : t.lane,
      laneSince: t.laneSince,
      atRisk: t.atRisk,
      progress: [],
    })),
    asks: [],
    inbox: [],
    people: [],
    fixtures: [],
    bugs,
    bugSearch: s.bugSearch ? { ...s.bugSearch } : undefined,
    timeline: s.timeline.filter(e => SHARE_KINDS.has(e.kind) && (!e.ticket || ids.has(e.ticket))).map(e => ({ at: e.at, kind: e.kind, ticket: e.ticket, text: e.text, bucket: e.bucket })),
    tracker: s.tracker ? { source: s.tracker.source, syncedAt: s.tracker.syncedAt, searched: { ...s.tracker.searched } } : undefined,
    warnings: [],
    generatedAt: s.generatedAt,
    mode: 'report',
    report,
  };
}

// ---------------------------------------------------------------------------
// Slack table, canonical schema (slack-clip/references/sprint-progress-table.md)
// ---------------------------------------------------------------------------

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

export function slackStatus(t: TicketView): string {
  const c = tcCounts(t.tcs);
  const tracker = t.trackerStatus ?? 'not synced';
  const bug = t.bugs[0]?.id;
  if (t.lane === 'Passed') { return c.PASSED === c.total || c.total === 0 ? `✅ Passed, ${tracker}` : `⚠️ Passed ${c.PASSED} of ${c.total}, ${tracker}`; }
  if (t.lane === 'Failed') { return `⚠️ Passed ${c.PASSED} of ${c.total}${bug ? `, Bug ${bug} filed` : ''}`; }
  if (t.lane === 'Running') { return `🔵 Running, ${t.worker.stage ?? 'started'}`; }
  if (t.lane === 'Needs you') { return '🟡 Standby, waiting on a decision'; }
  if (t.lane === 'Held') { return `🟡 Standby, ${t.hold?.note ?? 'blocked'}`; }
  return `🟡 Assigned to me, ${tracker}`;
}

/** slack-clip's hard rules: no double quotes, no en or em dash; then HTML-escaped. */
const slackClean = (v: string) => v.replace(/["“”]/g, '').replace(/[–—]/g, ',').replace(/[<>&]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[m]!);
const slackPlainClean = (v: string) => v.replace(/["“”]/g, '').replace(/[–—]/g, ',');

const slackRows = (s: BoardState) => s.tickets.filter(t => t.inScope).sort((a, b) => {
  const pa = PRIORITY_ORDER.indexOf(a.priority ?? '');
  const pb = PRIORITY_ORDER.indexOf(b.priority ?? '');
  return (pa < 0 ? 9 : pa) - (pb < 0 ? 9 : pb) || a.id.localeCompare(b.id, undefined, { numeric: true });
});

/**
 * Flat table, bold header row, no quotes, no dashes: what slack-clip pastes cleanly. A ticket with
 * an evidence page ends its Status cell with an "evidence page" link (same five columns).
 */
export function slackTableHtml(s: BoardState): string {
  const cell = (v: string, b = false) => `<td>${b ? `<b>${slackClean(v)}</b>` : slackClean(v)}</td>`;
  const status = (t: TicketView) => `<td>${slackClean(slackStatus(t))}${t.evidenceArtifact ? `, <a href="${slackClean(t.evidenceArtifact.url)}">evidence page</a>` : ''}</td>`;
  return `<table><tr>${['Ticket', 'Priority', 'Developer', 'Title', 'Status'].map(h => cell(h, true)).join('')}</tr>${slackRows(s)
    .map(t => `<tr>${cell(t.id)}${cell(t.priority ?? 'Not set')}${cell(t.dev ?? 'Unassigned')}${cell(t.title)}${status(t)}</tr>`)
    .join('')}</table>`;
}

/** The plain-text twin of `slackTableHtml` (tab separated), for a paste target that drops HTML. */
export function slackTablePlain(s: BoardState): string {
  const rows = slackRows(s).map(t => [t.id, t.priority ?? 'Not set', t.dev ?? 'Unassigned', t.title, `${slackStatus(t)}${t.evidenceArtifact ? `, evidence page ${t.evidenceArtifact.url}` : ''}`].map(slackPlainClean).join('\t'));
  return ['Ticket\tPriority\tDeveloper\tTitle\tStatus', ...rows].join('\n');
}

/** A bug title short enough for one Slack line: no "[Bug]" prefix, cut at a word near 80 characters. */
export function shortBugTitle(title?: string, max = 80): string {
  const t = (title ?? '').replace(/^\s*\[bug\]\s*/i, '').trim();
  if (t.length <= max) { return t; }
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,.;:]+$/, '')}...`;
}

const SLACK_BUG_GROUPS: { group: BugGroup, label: string }[] = [
  { group: 'resolved', label: 'Resolved' },
  { group: 'blocking', label: 'Still blocking' },
  { group: 'not-blocking', label: 'Open, not blocking' },
];

/**
 * The team summary of the sprint's bugs, for "Copy for Slack" on the Bugs view: grouped resolved /
 * still blocking / open not blocking, one line per bug with the tracker-linked id, a short title,
 * severity, developer and module (plus the ticket it blocks, and the evidence page when there is one).
 */
export function slackBugSummary(s: BoardState): { html: string, plain: string } {
  const bugs = s.bugs ?? [];
  const c = bugCounts(bugs);
  const head = bugs.length
    ? `${s.sprint.name} bugs: ${c.total} found, ${c.byGroup.blocking} still blocking a ticket, ${c.byGroup['not-blocking']} open not blocking, ${c.byGroup.resolved} resolved`
    : `${s.sprint.name} bugs: none found`;
  const html: string[] = [`<p><b>${slackClean(head)}</b></p>`];
  const plain: string[] = [slackPlainClean(head)];
  for (const g of SLACK_BUG_GROUPS) {
    const list = bugs.filter(b => b.group === g.group);
    if (!list.length) { continue; }
    html.push(`<p><b>${g.label} (${list.length})</b></p><ul>`);
    plain.push('', `${g.label} (${list.length})`);
    for (const b of list) {
      const parts = [shortBugTitle(b.title) || 'No title', b.severity ?? 'No severity', b.dev ?? 'Unassigned', b.module ?? 'No module'];
      const blocks = g.group === 'blocking' ? b.blocks.filter(x => x.stillBlocked).map(x => x.id) : [];
      if (blocks.length) { parts.push(`blocks ${blocks.join(' and ')}`); }
      const id = b.link ? `<a href="${slackClean(b.link)}">${slackClean(b.id)}</a>` : slackClean(b.id);
      html.push(`<li>${id} ${parts.map(slackClean).join(', ')}${b.page ? `, <a href="${slackClean(b.page.url)}">evidence page</a>` : ''}</li>`);
      plain.push(`• ${b.id} ${parts.map(slackPlainClean).join(', ')}${b.link ? ` ${b.link}` : ''}${b.page ? `, evidence page ${b.page.url}` : ''}`);
    }
    html.push('</ul>');
  }
  return { html: html.join(''), plain: plain.join('\n') };
}

/** A ticket in the test environment that the conductor has not dealt with yet. */
export interface Arrival { id: string, title?: string, dev?: string, priority?: string, module?: string, state: 'new' | 'recheck', note?: string }

/**
 * Test-environment watch: which tickets reached the `in_test` bucket and still need a conductor
 * decision. Handled = a worker started, a verdict landed, or an `arrival` launched/skipped it.
 * A later move back into `in_test` (a fix for a retest) makes it new again. A hold or an
 * `arrival held` brings it back as `recheck` on every pass until it is launched.
 */
export function arrivals(events: BoardEvent[], tracker: TrackerSnapshot | null | undefined): { list: Arrival[], searched: number, inTest: number } {
  const latest = (m: Map<string, string>, id: string, at: string) => { if ((m.get(id) ?? '') < at) { m.set(id, at); } };
  const handled = new Map<string, string>(); const held = new Map<string, string>(); const arrived = new Map<string, string>();
  const notes = new Map<string, string>(); const out = new Set<string>();
  for (const e of events) {
    if (!e.ticket) { continue; }
    const x = e.data ?? {};
    if (e.kind === 'scope.remove') { out.add(e.ticket); }
    if (e.kind === 'scope.add') { out.delete(e.ticket); }
    if (e.kind === 'worker' || e.kind === 'verdict') { latest(handled, e.ticket, e.at); }
    if (e.kind === 'hold.set') { latest(held, e.ticket, e.at); }
    // An arrival is a move INTO the test bucket from another one (as in the board this was ported from): a move
    // between two statuses of the bucket (Ready for QA -> In Test, made after the launch) is not one.
    // An event written before `fromBucket` existed counts as an entry.
    if (e.kind === 'tracker' && x.bucket === 'in_test' && x.fromBucket !== 'in_test') { latest(arrived, e.ticket, e.at); }
    if (e.kind === 'arrival') {
      if (x.action === 'held') { latest(held, e.ticket, e.at); }
      else { latest(handled, e.ticket, e.at); }
      if (typeof x.note === 'string') { notes.set(e.ticket, x.note); }
    }
  }
  const tickets = Object.entries(tracker?.tickets ?? {});
  const list: Arrival[] = [];
  let inTest = 0;
  for (const [id, t] of tickets) {
    if (t.bucket !== 'in_test') { continue; }
    inTest++;
    if (out.has(id)) { continue; }
    const h = handled.get(id); const a = arrived.get(id);
    if (h && (!a || a <= h)) { continue; }
    const hd = held.get(id);
    list.push({ id, title: t.title, dev: t.dev, priority: t.priority, module: t.module, state: hd && hd >= (a ?? '') ? 'recheck' : 'new', note: notes.get(id) });
  }
  return { list, searched: tickets.length, inTest };
}

/**
 * Every ticket id the board knows (any event that names one, plus every ticket in source.json),
 * upper-cased so a hand-typed `proj-1` matches the tracker's `PROJ-1`.
 */
export function boardTicketIds(events: BoardEvent[], tracker: TrackerSnapshot | null | undefined, extra: Iterable<string> = []): Set<string> {
  const ids = [...extra, ...events.map(e => e.ticket).filter((x): x is string => Boolean(x)), ...Object.keys(tracker?.tickets ?? {})];
  return new Set(ids.map(x => x.toUpperCase()));
}

/**
 * The sprint's rows in the `in_test` bucket that are not on the board, from the rows `sync --discover`
 * already lists (no extra tracker call). Why it exists: `sprint-testing/references/sprint-board.md`.
 * `onBoard` must hold upper-case ids (`boardTicketIds`).
 */
export function untrackedInTest(rows: UntrackedTicket[], onBoard: Set<string>): UntrackedTicket[] {
  return rows
    .filter(r => r.bucket === 'in_test' && !onBoard.has(r.id.toUpperCase()))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

// ---------------------------------------------------------------------------
// Watch liveness: did the conductor's scheduled test-environment pass actually run?
// ---------------------------------------------------------------------------

/** Working hours in the viewer's LOCAL time: Mon-Fri, 09:00 to 18:00. */
export const WORK_DAY = { startHour: 9, endHour: 18 } as const;
/** A pass older than this, inside working hours, means the watch stopped. */
export const WATCH_STALE_MIN = 25;

export const isWorkingHours = (d: Date): boolean =>
  d.getDay() >= 1 && d.getDay() <= 5 && d.getHours() >= WORK_DAY.startHour && d.getHours() < WORK_DAY.endHour;

export interface WatchLiveness {
  /** never: no pass on this board; ok: fresh; stale: overdue in working hours; off-hours: outside them. */
  state: 'never' | 'ok' | 'stale' | 'off-hours'
  lastPassAt?: string
  /** Minutes since the newest pass (null when none ran). */
  ageMin: number | null
}

/**
 * Red only when it matters: inside working hours, with the clock started at the later of
 * the newest pass and today's 09:00, so last night's pass does not turn the board red at
 * 09:01 while the morning's first pass is still on its way. A board where no watch ever
 * ran stays `never` (neutral): not every sprint runs a watch.
 */
export function watchLiveness(lastPassAt: string | undefined, now: Date): WatchLiveness {
  if (!lastPassAt || !Number.isFinite(Date.parse(lastPassAt))) { return { state: 'never', ageMin: null }; }
  const last = Date.parse(lastPassAt);
  const ageMin = Math.max(0, Math.floor((now.getTime() - last) / 60_000));
  if (!isWorkingHours(now)) { return { state: 'off-hours', lastPassAt, ageMin }; }
  const dayStart = new Date(now);
  dayStart.setHours(WORK_DAY.startHour, 0, 0, 0);
  const since = Math.max(last, dayStart.getTime());
  return { state: now.getTime() - since > WATCH_STALE_MIN * 60_000 ? 'stale' : 'ok', lastPassAt, ageMin };
}

/** Local HH:MM, the owner's clock (working hours are local too). */
export const localHhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// listen --since: replay owner actions a stopped listener missed
// ---------------------------------------------------------------------------

/**
 * `--since` takes an ISO time (local unless it carries Z or an offset) or an id: a message id
 * (`msg-...`), a need, a draft or an event id. An id resolves to that event's time on any of
 * the given boards. Returns the ISO cutoff, or null when the input matches nothing (the caller
 * stops and says so, fail loudly).
 */
export function sinceCutoff(since: string, boards: BoardEvent[][]): string | null {
  const v = since.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  for (const events of boards) {
    const hit = events.find(e => e.id === v || e.data?.id === v);
    if (hit) { return hit.at; }
  }
  return null;
}

/** Owner actions strictly after the cutoff, oldest first. */
export const ownerActionsSince = (events: BoardEvent[], cutoff: string): BoardEvent[] =>
  events.filter(e => e.by === 'owner' && e.at > cutoff).sort((a, b) => a.at.localeCompare(b.at));

/** One stdout line per owner action: the format `listen` prints and a Monitor reads. */
export function listenLine(slug: string, e: BoardEvent): string {
  const x = e.data ?? {};
  const reply = typeof x.replyTo === 'string' ? ` reply-to ${x.replyTo}` : '';
  const id = typeof x.id === 'string' ? ` ${x.id}` : '';
  return `[${slug}] ${e.kind}${id}${e.ticket ? ` ${e.ticket}` : ''}${reply}: ${e.text}`;
}

// ---------------------------------------------------------------------------
// bug: evidence on disk but none embedded
// ---------------------------------------------------------------------------

/**
 * One-line reminder when a bug is linked while the ticket's evidence folder holds images and
 * nothing said the bug's Description already carries one (the bug report template of
 * `sprint-testing/references/reporting-templates.md`). A reminder, never an error: `--evidence-embedded` silences it.
 */
export function bugEvidenceReminder(o: { ticket: string, bug: string, images: string[], embedded: boolean }): string | null {
  if (o.embedded || !o.images.length) { return null; }
  return `reminder: ${o.images.length} evidence image(s) on disk for ${o.ticket}; embed the bug's thumbnail (bun run evidence build --thumb, then bun run evidence attach) in ${o.bug}'s Description `
    + '(evidence-artifact workflow.md §4), then pass --evidence-embedded once its read-back passes.';
}
