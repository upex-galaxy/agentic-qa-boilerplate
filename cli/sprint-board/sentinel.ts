import type { BoardEvent, TrackerSnapshot } from './model.ts';
/**
 * `board sentinel`: the conductor's zero-token test-environment watch trigger.
 *
 * A long-running process the conductor starts as a background Bash task. While nothing
 * changes it prints nothing (no LLM turn); it exits, and so wakes the conductor, only when
 * something needs a decision. Its stdout is then the wake reason:
 *
 *   SENTINEL WAKE <reason>[ (<parts>)]
 *   {"reason":"...", ...details as JSON}
 *
 * It reads only what the CLI already has (source.json, which the board server syncs every
 * 10 min, and events.ndjson); it never calls the tracker, never launches a worker, never reads the
 * Orca mailbox (Orca pushes those to the conductor by itself). It also owns the board
 * server's working-hours lifecycle, so no cron is needed for it.
 *
 * Everything here is a pure function or takes its clock and process probes as `deps`,
 * so the tests run without a network, a server or a real clock. Why it exists and how the
 * conductor uses it: `.agents/skills/sprint-testing/references/sprint-board.md` §Sentinel.
 */
import { arrivals, boardTicketIds, untrackedInTest } from './model.ts';

// ---------------------------------------------------------------------------
// Signature: what the conductor must react to
// ---------------------------------------------------------------------------

export interface SigArrival { id: string, kind: 'NEW' | 'RECHECK', title?: string }
export interface SigUntracked { id: string, qa?: string, title?: string }
export interface SigOwner { event: string, ticket?: string, text: string }
export interface SigNeed { id: string, ticket: string, question: string }

/**
 * Compared by key only (ids and kinds); the other fields are there so a wake can say what
 * it found without another read.
 */
export interface Signature {
  arrivals: SigArrival[]
  untracked: SigUntracked[]
  /** The newest owner answer on the board: a `need.answer` or an inbox `msg` by the owner. */
  ownerAnswer: SigOwner | null
  /** Needs-you a worker raised that nobody (owner or conductor) has answered or closed. */
  workerNeeds: SigNeed[]
}

const isOwnerAnswer = (e: BoardEvent) => e.by === 'owner' && (e.kind === 'need.answer' || e.kind === 'msg');
const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id, undefined, { numeric: true });
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
/** Whoever records a need for the owner and is not the owner, the conductor or Claude's inbox. */
const NOT_A_WORKER = new Set(['owner', 'conductor', 'claude']);

/**
 * Open needs raised by a worker, folded the way `fold` does it: an explicit `need.answer` id
 * answers that need, an id-less one answers the ticket's first open need, a `need.close`
 * without an id clears every need on the ticket.
 */
export function openWorkerNeeds(events: BoardEvent[]): SigNeed[] {
  const byTicket = new Map<string, Map<string, SigNeed & { answered: boolean, worker: boolean }>>();
  for (const e of events) {
    if (!e.ticket) { continue; }
    const x = e.data ?? {};
    const needs = byTicket.get(e.ticket) ?? new Map();
    byTicket.set(e.ticket, needs);
    if (e.kind === 'need.open') {
      const id = str(x.id) ?? e.id;
      needs.set(id, { id, ticket: e.ticket, question: str(x.question) ?? e.text, answered: false, worker: !NOT_A_WORKER.has(e.by ?? '') });
    }
    else if (e.kind === 'need.answer') {
      const want = str(x.id);
      const n = want ? needs.get(want) : [...needs.values()].find(m => !m.answered);
      if (n) { n.answered = true; }
    }
    else if (e.kind === 'need.close') {
      const id = str(x.id);
      if (id) { needs.delete(id); }
      else { needs.clear(); }
    }
  }
  const open = [...byTicket.values()].flatMap(m => [...m.values()]).filter(n => n.worker && !n.answered);
  return open.map(({ id, ticket, question }) => ({ id, ticket, question: question.slice(0, 200) })).sort(byId);
}

/** Tickets with a hold that was never cleared, minus the ones taken out of scope. */
export function activeHolds(events: BoardEvent[]): string[] {
  const held = new Set<string>();
  for (const e of events) {
    if (!e.ticket) { continue; }
    if (e.kind === 'hold.set') { held.add(e.ticket); }
    if (e.kind === 'hold.clear' || e.kind === 'scope.remove') { held.delete(e.ticket); }
  }
  return [...held].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function signatureOf(events: BoardEvent[], tracker: TrackerSnapshot | null | undefined): Signature {
  const r = arrivals(events, tracker);
  const untracked = untrackedInTest(tracker?.discover?.untracked ?? [], boardTicketIds(events, tracker));
  const owner = events.filter(isOwnerAnswer).at(-1);
  return {
    arrivals: r.list.map(a => ({ id: a.id, kind: a.state === 'new' ? 'NEW' as const : 'RECHECK' as const, title: a.title })).sort(byId),
    untracked: untracked.map(u => ({ id: u.id, qa: u.qa, title: u.title })).sort(byId),
    ownerAnswer: owner ? { event: owner.id, ticket: owner.ticket, text: str(owner.data?.text) ?? owner.text } : null,
    workerNeeds: openWorkerNeeds(events),
  };
}

export interface Additions {
  parts: ('arrivals' | 'untracked' | 'owner-answer' | 'worker-need')[]
  arrivals: SigArrival[]
  untracked: SigUntracked[]
  ownerAnswer?: SigOwner
  workerNeeds: SigNeed[]
}

/**
 * What is in `now` and not in `base`, or null. Only additions wake: an item that left the
 * list was dealt with (launched, skipped, answered), and a NEW that became RECHECK is the
 * conductor's own hold. A ticket that turns NEW again (moved back into test) does wake.
 */
export function additions(base: Signature, now: Signature): Additions | null {
  const baseKind = new Map(base.arrivals.map(a => [a.id, a.kind]));
  const arr = now.arrivals.filter(a => !baseKind.has(a.id) || (a.kind === 'NEW' && baseKind.get(a.id) !== 'NEW'));
  const baseUntracked = new Set(base.untracked.map(u => u.id));
  const unt = now.untracked.filter(u => !baseUntracked.has(u.id));
  const owner = now.ownerAnswer && now.ownerAnswer.event !== base.ownerAnswer?.event ? now.ownerAnswer : undefined;
  const baseNeeds = new Set(base.workerNeeds.map(n => n.id));
  const needs = now.workerNeeds.filter(n => !baseNeeds.has(n.id));
  const parts: Additions['parts'] = [];
  if (arr.length) { parts.push('arrivals'); }
  if (unt.length) { parts.push('untracked'); }
  if (owner) { parts.push('owner-answer'); }
  if (needs.length) { parts.push('worker-need'); }
  return parts.length ? { parts, arrivals: arr, untracked: unt, ownerAnswer: owner, workerNeeds: needs } : null;
}

export const IMMEDIATE_PARTS: readonly Additions['parts'][number][] = ['owner-answer'];

function hasPendingOwnerAnswer(events: BoardEvent[]): boolean {
  const rootOf = new Map<string, string>();
  const msgId = (e: BoardEvent) => str(e.data?.id) ?? e.id;
  for (const e of events.filter(x => x.kind === 'msg')) {
    rootOf.set(msgId(e), rootOf.get(str(e.data?.replyTo) ?? '') ?? msgId(e));
  }
  return events.some((answer, at) => {
    if (!isOwnerAnswer(answer)) { return false; }
    const later = events.slice(at + 1);
    if (answer.kind === 'need.answer') {
      const need = str(answer.data?.id);
      return !later.some(e => e.kind === 'need.close' && e.ticket === answer.ticket && (!need || !str(e.data?.id) || e.data?.id === need));
    }
    return !later.some(e => e.kind === 'msg' && e.data?.from === 'claude' && rootOf.get(msgId(e)) === rootOf.get(msgId(answer)));
  });
}

// With no saved baseline, an owner answer nobody has acted on is work, not history: leaving the newest one out makes it wake.
export function freshBaseline(events: BoardEvent[], sig: Signature): Signature {
  return hasPendingOwnerAnswer(events) ? { ...sig, ownerAnswer: null } : sig;
}

// ---------------------------------------------------------------------------
// Time: working hours, stop-at, the tick grid
// ---------------------------------------------------------------------------

export interface SentinelConfig {
  /** Minutes between evaluations, on a wall-clock grid (10 -> :00, :10, :20 ...). */
  everyMin: number
  /** Working hours in local minutes of the day, start inclusive, end exclusive. */
  hours: { start: number, end: number }
  /** Working days, 0 = Sunday ... 6 = Saturday. */
  days: number[]
  /** Local minute of the day when the board server is stopped on a working day. */
  stopAt: number
  /** Re-wake every this many minutes while a RECHECK or held ticket exists. */
  recheckEveryMin: number
  /** source.json older than this inside working hours means the server's sync stalled. */
  staleAfterMin: number
  port: number
  dryRun: boolean
}

export const SENTINEL_DEFAULTS: SentinelConfig = {
  everyMin: 10,
  hours: { start: 9 * 60, end: 18 * 60 },
  days: [1, 2, 3, 4, 5],
  stopAt: 18 * 60 + 7,
  recheckEveryMin: 120,
  staleAfterMin: 30,
  port: 4477,
  dryRun: false,
};

const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "9:30" or "18" -> minutes of the day; anything else stops the command (fail loudly). */
export function parseClock(raw: string, field: string): number {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw.trim());
  const h = m ? Number(m[1]) : Number.NaN;
  const min = m?.[2] ? Number(m[2]) : 0;
  if (!m || h > 24 || min > 59 || h * 60 + min > 24 * 60) { throw new Error(`${field} "${raw}" is not a time like 9, 9:30 or 18:07`); }
  return h * 60 + min;
}

/** "9-18" or "9:30-17:45". */
export function parseHours(raw: string): { start: number, end: number } {
  const [a, b, extra] = raw.split('-');
  if (!a || !b || extra !== undefined) { throw new Error(`--hours "${raw}" is not a range like 9-18`); }
  const start = parseClock(a, '--hours'); const end = parseClock(b, '--hours');
  if (start >= end) { throw new Error(`--hours "${raw}": the start must be before the end`); }
  return { start, end };
}

/** "1-5" or "1,2,3,4,5" (0 = Sunday). */
export function parseDays(raw: string): number[] {
  const out = new Set<number>();
  for (const part of raw.split(',').map(x => x.trim()).filter(Boolean)) {
    const [a, b] = part.split('-').map(Number);
    const to = b ?? a;
    if (!Number.isInteger(a) || !Number.isInteger(to) || a < 0 || to > 6 || a > to) { throw new Error(`--days "${raw}" is not a set like 1-5 or 1,3,5 (0 = Sunday, 6 = Saturday)`); }
    for (let d = a; d <= to; d++) { out.add(d); }
  }
  if (!out.size) { throw new Error(`--days "${raw}" names no day`); }
  return [...out].sort();
}

export const isWorkDay = (d: Date, cfg: SentinelConfig) => cfg.days.includes(d.getDay());

export function inHours(d: Date, cfg: SentinelConfig): boolean {
  const m = minuteOfDay(d);
  return isWorkDay(d, cfg) && m >= cfg.hours.start && m < cfg.hours.end;
}

/**
 * Stop the server once per working day, on the first tick inside [stopAt, stopAt + every).
 * The window, not "any time after", so a sentinel armed at 20:00 never kills a board the
 * owner started by hand after hours. The one catch-up past the window: a re-arm whose saved
 * baseline shows today's watch was running before the stop time.
 */
export function shouldStop(d: Date, cfg: SentinelConfig, stoppedOn: string | undefined, resumedOn?: string): boolean {
  const m = minuteOfDay(d);
  const today = dayKey(d);
  return isWorkDay(d, cfg) && m >= cfg.stopAt && (m < cfg.stopAt + cfg.everyMin || resumedOn === today) && stoppedOn !== today;
}

/** Milliseconds to the next grid tick, or to today's stop-at when that comes first. */
export function msToNextTick(d: Date, cfg: SentinelConfig): number {
  const msOfDay = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
  const period = cfg.everyMin * 60_000;
  let next = (Math.floor(msOfDay / period) + 1) * period;
  const stop = cfg.stopAt * 60_000;
  if (msOfDay < stop && stop < next) { next = stop; }
  return next - msOfDay;
}

/**
 * source.json stalled: older than `staleAfterMin`, counted from the latest of its own sync,
 * today's start of hours and the moment this sentinel started the server (the first sync of
 * the morning takes about two minutes, and last night's sync is not a stall at 09:01).
 */
export function syncStale(syncedAt: string | undefined, now: Date, cfg: SentinelConfig, serverStartedAt?: number): { stale: boolean, ageMin: number | null } {
  const t = syncedAt ? Date.parse(syncedAt) : Number.NaN;
  const ageMin = Number.isFinite(t) ? Math.floor((now.getTime() - t) / 60_000) : null;
  const dayStart = new Date(now);
  dayStart.setHours(0, cfg.hours.start, 0, 0);
  const from = Math.max(Number.isFinite(t) ? t : 0, dayStart.getTime(), serverStartedAt ?? 0);
  return { stale: now.getTime() - from > cfg.staleAfterMin * 60_000, ageMin };
}

// ---------------------------------------------------------------------------
// One cycle
// ---------------------------------------------------------------------------

export type WakeReason = 'change' | 'recheck-sweep' | 'board-down' | 'sync-stale' | 'sentinel-error';
export interface Wake { reason: WakeReason, details: Record<string, unknown> }

export interface SentinelState {
  /** null until the first successful read establishes one. */
  baseline: Signature | null
  /** ms epoch of the last wake (or the start): the recheck-sweep clock. */
  sweptAt: number
  /** The source.json `syncedAt` a sync-stale wake already reported, so a re-armed sentinel does not repeat it. */
  staleReported?: string
  failures: number
  startFailures: number
  stoppedOn?: string
  serverStartedAt?: number
  // The last working day a cycle ran before the stop time.
  watchedOn?: string
  // `watchedOn` as the saved baseline had it: only a re-arm may stop the board past the window.
  resumedOn?: string
}

export interface SentinelDeps {
  now: () => Date
  /** events.ndjson + source.json of the watched board; throws when they cannot be read. */
  read: () => { events: BoardEvent[], tracker: TrackerSnapshot | null }
  /** pids listening on the board port (empty when none). */
  listening: () => Promise<number[]>
  /** Start the server detached; resolves true once the port listens. */
  startServer: () => Promise<boolean>
  stopServer: (pids: number[]) => void
  /** A quiet in-hours cycle records itself (the board's "Last watch pass" chip). */
  heartbeat: (note: string, counts: Record<string, number>) => void
  /** stderr: lifecycle actions and errors. Never stdout, which is the wake channel. */
  log: (line: string) => void
}

/** Three failed cycles in a row wake the conductor; one or two are retried silently. */
export const MAX_FAILURES = 3;
/** Two failed server starts in a row wake the conductor with board-down. */
export const MAX_START_FAILURES = 2;

const wake = (reason: WakeReason, details: Record<string, unknown>): Wake => ({ reason, details });
const NEVER_SYNCED = 'source.json is missing: this board has never synced, so there is nothing to compare';

export async function cycle(cfg: SentinelConfig, deps: SentinelDeps, st: SentinelState): Promise<Wake | null> {
  const now = deps.now();
  if (isWorkDay(now, cfg) && minuteOfDay(now) < cfg.stopAt) { st.watchedOn = dayKey(now); }
  try {
    if (shouldStop(now, cfg, st.stoppedOn, st.resumedOn)) {
      const pids = await deps.listening();
      st.stoppedOn = dayKey(now);
      st.serverStartedAt = undefined;
      if (pids.length) { deps.stopServer(pids); }
    }
    if (!inHours(now, cfg)) { st.failures = 0; return null; }

    const pids = await deps.listening();
    if (!pids.length) {
      if (await deps.startServer()) { st.startFailures = 0; st.serverStartedAt = now.getTime(); }
      else if (++st.startFailures >= MAX_START_FAILURES) {
        return wake('board-down', { port: cfg.port, attempts: st.startFailures, log: '.session/sprint-board/board-server.log' });
      }
    }
    else { st.startFailures = 0; }

    const { events, tracker } = deps.read();
    if (!tracker) { throw new Error(NEVER_SYNCED); }

    const sig = signatureOf(events, tracker);
    if (!st.baseline) { st.baseline = freshBaseline(events, sig); st.failures = 0; return null; }

    const stale = syncStale(tracker.syncedAt, now, cfg, st.serverStartedAt);
    if (stale.stale && st.staleReported !== tracker.syncedAt) {
      st.staleReported = tracker.syncedAt;
      return wake('sync-stale', { syncedAt: tracker.syncedAt, ageMin: stale.ageMin, staleAfterMin: cfg.staleAfterMin, boardPids: pids });
    }

    const added = additions(st.baseline, sig);
    st.baseline = sig;
    st.failures = 0;
    if (added) { st.sweptAt = now.getTime(); return wake('change', { ...added }); }

    const recheck = sig.arrivals.filter(a => a.kind === 'RECHECK').map(a => a.id);
    const held = activeHolds(events);
    const sinceMin = Math.floor((now.getTime() - st.sweptAt) / 60_000);
    if ((recheck.length || held.length) && sinceMin >= cfg.recheckEveryMin) {
      st.sweptAt = now.getTime();
      return wake('recheck-sweep', { recheck, held, minutesSinceLastWake: sinceMin });
    }

    const fresh = sig.arrivals.length - recheck.length;
    deps.heartbeat(`sentinel quiet: ${fresh} new (seen), ${recheck.length} recheck, ${held.length} held, ${sig.untracked.length} untracked`, { new: fresh, recheck: recheck.length, held: held.length, untracked: sig.untracked.length });
    return null;
  }
  catch (err) {
    st.failures++;
    const message = (err as Error).message ?? String(err);
    deps.log(`sentinel ${now.toISOString()} cycle failed (${st.failures}/${MAX_FAILURES}): ${message}`);
    return st.failures >= MAX_FAILURES ? wake('sentinel-error', { failures: st.failures, message }) : null;
  }
}

// No hours gate. Without an immediate part the baseline stays, so the next tick still reports the additions.
export function quickCheck(st: SentinelState, { events, tracker }: ReturnType<SentinelDeps['read']>, now: Date): Wake | null {
  // Thrown, not null: the wait must not count a board it could not compare as checked.
  if (!tracker) { throw new Error(NEVER_SYNCED); }
  const sig = signatureOf(events, tracker);
  st.baseline ??= freshBaseline(events, sig);
  const added = additions(st.baseline, sig);
  if (!added?.parts.some(p => IMMEDIATE_PARTS.includes(p))) { return null; }
  st.baseline = sig;
  st.sweptAt = now.getTime();
  return wake('change', { ...added });
}

export const POLL_MS = 2_000;
// One action can append several events; the check waits for the burst to land.
export const SETTLE_MS = 1_500;

export interface WaitDeps {
  statKey: () => string
  sleep: (ms: number) => Promise<void>
  now: () => number
  check: () => Wake | null
  log: (line: string) => void
}

export async function waitForTick(deps: WaitDeps, until: number, seen: string): Promise<{ wake: Wake | null, seen: string }> {
  let checked = seen;
  let failure = '';
  while (deps.now() < until) {
    await deps.sleep(Math.max(0, Math.min(POLL_MS, until - deps.now())));
    if (deps.statKey() === checked) { continue; }
    await deps.sleep(SETTLE_MS);
    // Sampled before the read: a write that lands during the check changes the key again.
    const key = deps.statKey();
    try {
      const found = deps.check();
      checked = key;
      failure = '';
      if (found) { return { wake: found, seen: checked }; }
    }
    catch (err) {
      const message = (err as Error).message ?? String(err);
      if (message !== failure) { deps.log(`quick check failed, retrying: ${message}`); }
      failure = message;
    }
  }
  return { wake: null, seen: checked };
}

export async function watchUntilWake(cfg: SentinelConfig, deps: WaitDeps & { tick: () => Promise<Wake | null> }): Promise<Wake> {
  // '' is no file's key, so the first wait checks at once. Later keys carry over, never resampled after a cycle: off hours a cycle reads nothing.
  let seen = '';
  for (;;) {
    const ticked = await deps.tick();
    if (ticked) { return ticked; }
    const until = deps.now() + msToNextTick(new Date(deps.now()), cfg);
    if (cfg.dryRun) {
      await deps.sleep(until - deps.now());
      continue;
    }
    const waited = await waitForTick(deps, until, seen);
    if (waited.wake) { return waited.wake; }
    seen = waited.seen;
  }
}

/** The two lines a wake prints: the reason line the harness notification shows, then JSON. */
export function wakeLines(w: Wake, ctx: { at: Date, slug: string, rearm: string }): [string, string] {
  const parts = Array.isArray(w.details.parts) ? ` (${(w.details.parts as string[]).join(', ')})` : '';
  return [`SENTINEL WAKE ${w.reason}${parts}`, JSON.stringify({ reason: w.reason, at: ctx.at.toISOString(), slug: ctx.slug, ...w.details, rearm: ctx.rearm })];
}

// ---------------------------------------------------------------------------
// Baseline persistence
// ---------------------------------------------------------------------------

/** `stoppedOn`, `watchedOn` and `serverStartedAt` ride along so a re-armed sentinel neither stops the board twice in one day, misses a stop it owes, nor loses the morning grace. */
export interface BaselineFile { v: 1, savedAt: string, slug: string, signature: Signature, sweptAt: string, staleReported?: string, stoppedOn?: string, watchedOn?: string, serverStartedAt?: string }

export function toBaselineFile(st: SentinelState, slug: string, at: Date): BaselineFile | null {
  if (!st.baseline) { return null; }
  return {
    v: 1,
    savedAt: at.toISOString(),
    slug,
    signature: st.baseline,
    sweptAt: new Date(st.sweptAt).toISOString(),
    staleReported: st.staleReported,
    stoppedOn: st.stoppedOn,
    watchedOn: st.watchedOn,
    serverStartedAt: st.serverStartedAt === undefined ? undefined : new Date(st.serverStartedAt).toISOString(),
  };
}

/** A baseline written for another board is refused, never silently reused (fail loudly). */
export function fromBaselineFile(raw: string, slug: string, path: string): Pick<SentinelState, 'baseline' | 'sweptAt' | 'staleReported' | 'stoppedOn' | 'watchedOn' | 'resumedOn' | 'serverStartedAt'> {
  const f = JSON.parse(raw) as Partial<BaselineFile>;
  if (f.v !== 1 || !f.signature || !Array.isArray(f.signature.arrivals)) { throw new Error(`${path} is not a sentinel baseline (v1)`); }
  if (f.slug !== slug) { throw new Error(`${path} is the baseline of ${f.slug}, not ${slug}; pass a baseline under this board's folder`); }
  const swept = Date.parse(f.sweptAt ?? '');
  const started = Date.parse(f.serverStartedAt ?? '');
  return {
    baseline: f.signature,
    sweptAt: Number.isFinite(swept) ? swept : Date.now(),
    staleReported: f.staleReported,
    stoppedOn: f.stoppedOn,
    watchedOn: f.watchedOn,
    resumedOn: f.watchedOn,
    serverStartedAt: Number.isFinite(started) ? started : undefined,
  };
}
