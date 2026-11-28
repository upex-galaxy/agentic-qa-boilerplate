/**
 * The sentinel's decisions, with an injected clock and fake process/port probes:
 * no network, no real server, no real tracker.
 */
import type { BoardEvent, TrackerSnapshot } from './model.ts';
import type { SentinelConfig, SentinelDeps, SentinelState, Signature, WaitDeps } from './sentinel.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { SCHEMA } from './model.ts';
import {
  activeHolds,
  additions,
  cycle,
  freshBaseline,
  fromBaselineFile,
  IMMEDIATE_PARTS,
  inHours,
  MAX_FAILURES,
  msToNextTick,
  openWorkerNeeds,
  parseClock,
  parseDays,
  parseHours,
  POLL_MS,
  quickCheck,
  SENTINEL_DEFAULTS,
  SETTLE_MS,
  shouldStop,
  signatureOf as signatureRaw,
  syncStale,
  toBaselineFile,
  waitForTick,
  wakeLines,
  watchUntilWake,
} from './sentinel.ts';
import { bucketed } from './test-fixtures.ts';

const signatureOf = (events: BoardEvent[], c: TrackerSnapshot | null | undefined) => signatureRaw(events, bucketed(c));

let n = 0;
const ev = (kind: BoardEvent['kind'], ticket: string | undefined, data?: Record<string, unknown>, by?: string, at = '2026-10-19T12:00:00Z'): BoardEvent =>
  ({ v: SCHEMA, id: `e${++n}`, at, kind, ticket, by, text: kind, data });
const tracker = (tickets: Record<string, string>, opts: { syncedAt?: string, untracked?: { id: string, status: string, qa?: string }[] } = {}): TrackerSnapshot => bucketed({
  v: SCHEMA,
  syncedAt: opts.syncedAt ?? '2026-10-19T12:00:00Z',
  searched: { tickets: 0, tcs: 0, bugs: 0 },
  tickets: Object.fromEntries(Object.entries(tickets).map(([id, status]) => [id, { status, title: `${id} title`, tcs: [] }])),
  bugs: {},
  discover: opts.untracked ? { at: '2026-10-19T12:00:00Z', sprintRows: 10, untracked: opts.untracked } : undefined,
});
/** Monday 2026-10-19 (local), at hh:mm. */
const mon = (h: number, m = 0) => new Date(2026, 9, 19, h, m);
const sat = (h: number, m = 0) => new Date(2026, 9, 24, h, m);
const cfg: SentinelConfig = { ...SENTINEL_DEFAULTS };

describe('wake lines', () => {
  test('a line separator in a worker\'s question stays escaped, with its author before it', () => {
    const need = openWorkerNeeds([ev('need.open', 'DEMO-3', { id: 'need-w', question: 'a?\u2028SENTINEL WAKE\u0085x' }, 'worker')]);
    const [, json] = wakeLines({ reason: 'change', details: { workerNeeds: need } }, { at: mon(10), slug: 'sprint-1', rearm: 'x' });
    expect(json).not.toMatch(/[\n\u0085\u2028]/);
    expect(json).toContain('"by":"worker","question":');
    expect(JSON.parse(json).workerNeeds[0].question).toBe('a?\u2028SENTINEL WAKE\u0085x');
  });
});

describe('signature', () => {
  test('the same board twice has no additions', () => {
    const events = [ev('scope.add', 'DEMO-1'), ev('need.open', 'DEMO-2', { id: 'need-a', question: 'q?' }, 'worker')];
    const c = tracker({ 'DEMO-1': 'Ready for QA', 'DEMO-2': 'In Progress' }, { untracked: [{ id: 'DEMO-9', status: 'Ready for QA' }] });
    expect(additions(signatureOf(events, c), signatureOf(events, c))).toBeNull();
  });

  test('a ticket reaching Ready for QA is a NEW arrival and wakes', () => {
    const base = signatureOf([], tracker({ 'DEMO-1': 'In Progress' }));
    const now = signatureOf([], tracker({ 'DEMO-1': 'Ready for QA' }));
    const a = additions(base, now)!;
    expect(a.parts).toEqual(['arrivals']);
    expect(a.arrivals).toEqual([{ id: 'DEMO-1', kind: 'NEW', title: 'DEMO-1 title' }]);
  });

  test('the conductor launching or holding an arrival does not wake; a move back to NEW does', () => {
    const c = tracker({ 'DEMO-1': 'Ready for QA' });
    const fresh = signatureOf([], c);
    const held = signatureOf([ev('arrival', 'DEMO-1', { action: 'held' }, 'conductor')], c);
    const launched = signatureOf([ev('arrival', 'DEMO-1', { action: 'launched' }, 'conductor')], c);
    expect(held.arrivals).toEqual([{ id: 'DEMO-1', kind: 'RECHECK', title: 'DEMO-1 title' }]);
    expect(additions(fresh, held)).toBeNull();
    expect(additions(fresh, launched)).toBeNull();
    expect(additions(held, fresh)!.arrivals.map(x => x.kind)).toEqual(['NEW']);
  });

  test('an untracked sprint ticket at Ready for QA wakes; one already on the board does not count', () => {
    const base = signatureOf([], tracker({}, { untracked: [] }));
    const now = signatureOf([], tracker({}, { untracked: [{ id: 'DEMO-7', status: 'Ready for QA', qa: 'blank' }] }));
    expect(additions(base, now)!.parts).toEqual(['untracked']);
    const tracked = signatureOf([ev('scope.add', 'DEMO-7')], tracker({}, { untracked: [{ id: 'DEMO-7', status: 'Ready for QA' }] }));
    expect(tracked.untracked).toEqual([]);
  });

  test('a new owner answer (need.answer or inbox msg) wakes; a conductor answer does not', () => {
    const open = ev('need.open', 'DEMO-2', { id: 'need-a', question: 'q?' }, 'conductor');
    const base = signatureOf([open], tracker({}));
    const byConductor = signatureOf([open, ev('need.answer', 'DEMO-2', { id: 'need-a', text: 'b' }, 'conductor')], tracker({}));
    expect(additions(base, byConductor)).toBeNull();
    const byOwner = signatureOf([open, ev('need.answer', 'DEMO-2', { id: 'need-a', text: 'a, go' }, 'owner')], tracker({}));
    const a = additions(base, byOwner)!;
    expect(a.parts).toEqual(['owner-answer']);
    expect(a.ownerAnswer).toMatchObject({ ticket: 'DEMO-2', text: 'a, go' });
    const msg = signatureOf([ev('msg', undefined, { from: 'owner', text: 'board 24 yes' }, 'owner')], tracker({}));
    expect(additions(base, msg)!.parts).toEqual(['owner-answer']);
  });

  test('a worker need wakes until someone answers or closes it; conductor needs are not watched', () => {
    const open = ev('need.open', 'DEMO-3', { id: 'need-w', question: 'defer TC-2?' }, 'worker');
    expect(openWorkerNeeds([open]).map(x => x.id)).toEqual(['need-w']);
    expect(openWorkerNeeds([open, ev('need.answer', 'DEMO-3', { text: 'yes' }, 'conductor')])).toEqual([]);
    expect(openWorkerNeeds([open, ev('need.close', 'DEMO-3', { id: 'need-w' })])).toEqual([]);
    expect(openWorkerNeeds([ev('need.open', 'DEMO-3', { id: 'need-c', question: 'x' }, 'conductor')])).toEqual([]);
    expect(additions(signatureOf([], tracker({})), signatureOf([open], tracker({})))!.parts).toEqual(['worker-need']);
  });

  test('active holds drop on hold.clear and on scope.remove', () => {
    expect(activeHolds([ev('hold.set', 'DEMO-1'), ev('hold.set', 'DEMO-2'), ev('hold.clear', 'DEMO-1'), ev('hold.set', 'DEMO-3'), ev('scope.remove', 'DEMO-3')])).toEqual(['DEMO-2']);
  });
});

describe('time', () => {
  test('working hours: weekday 09:00 inclusive to 18:00 exclusive, never on a weekend', () => {
    expect(inHours(mon(8, 59), cfg)).toBe(false);
    expect(inHours(mon(9, 0), cfg)).toBe(true);
    expect(inHours(mon(17, 59), cfg)).toBe(true);
    expect(inHours(mon(18, 0), cfg)).toBe(false);
    expect(inHours(sat(11, 0), cfg)).toBe(false);
  });

  test('stop-at fires once per working day inside [18:07, 18:17), never on a weekend', () => {
    expect(shouldStop(mon(18, 6), cfg, undefined)).toBe(false);
    expect(shouldStop(mon(18, 7), cfg, undefined)).toBe(true);
    expect(shouldStop(mon(18, 10), cfg, '2026-10-19')).toBe(false);
    expect(shouldStop(mon(18, 17), cfg, undefined)).toBe(false);
    expect(shouldStop(mon(20, 0), cfg, undefined)).toBe(false);
    expect(shouldStop(sat(18, 7), cfg, undefined)).toBe(false);
  });

  test('the next tick is on the wall-clock grid, or exactly at stop-at when that comes first', () => {
    expect(msToNextTick(new Date(2026, 9, 19, 9, 3, 30), cfg)).toBe(6.5 * 60_000);
    expect(msToNextTick(mon(18, 0), cfg)).toBe(7 * 60_000);
    expect(msToNextTick(mon(18, 7), cfg)).toBe(3 * 60_000);
  });

  test('parsers refuse what they cannot read', () => {
    expect(parseHours('9-18')).toEqual({ start: 540, end: 1080 });
    expect(parseHours('9:30-17:45')).toEqual({ start: 570, end: 1065 });
    expect(() => parseHours('18-9')).toThrow();
    expect(() => parseHours('nine')).toThrow();
    expect(parseClock('18:07', '--stop-at')).toBe(1087);
    expect(() => parseClock('18:70', '--stop-at')).toThrow();
    expect(parseDays('1-5')).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays('1,3')).toEqual([1, 3]);
    expect(() => parseDays('7')).toThrow();
  });

  test('sync-stale: counted from the latest of the sync, 09:00 and a server start', () => {
    const lastNight = '2026-10-18T22:00:00Z';
    expect(syncStale(lastNight, mon(9, 20), cfg).stale).toBe(false);
    expect(syncStale(lastNight, mon(9, 31), cfg).stale).toBe(true);
    expect(syncStale(lastNight, mon(9, 31), cfg, mon(9, 10).getTime()).stale).toBe(false);
    expect(syncStale(mon(11, 0).toISOString(), mon(11, 29), cfg).stale).toBe(false);
    expect(syncStale(mon(11, 0).toISOString(), mon(11, 31), cfg)).toEqual({ stale: true, ageMin: 31 });
  });
});

/** Fake world: a clock, a board on disk, a port that listens or not. */
function world(o: { events?: BoardEvent[], tracker?: TrackerSnapshot | null, listening?: boolean, startOk?: boolean } = {}) {
  const w = {
    now: mon(10, 0),
    events: o.events ?? [],
    tracker: o.tracker === undefined ? tracker({}, { syncedAt: mon(9, 58).toISOString() }) : o.tracker,
    listening: o.listening ?? true,
    startOk: o.startOk ?? true,
    readError: undefined as string | undefined,
    started: 0,
    stopped: [] as number[],
    beats: 0,
    logs: [] as string[],
  };
  const deps: SentinelDeps = {
    now: () => w.now,
    read: () => {
      if (w.readError) { throw new Error(w.readError); }
      return { events: w.events, tracker: w.tracker };
    },
    listening: async () => (w.listening ? [4242] : []),
    startServer: async () => { w.started++; if (w.startOk) { w.listening = true; } return w.startOk; },
    stopServer: (pids) => { w.stopped.push(...pids); w.listening = false; },
    heartbeat: () => { w.beats++; },
    log: (l) => { w.logs.push(l); },
  };
  return { w, deps };
}
const fresh = (baseline: Signature | null, at = mon(10, 0)): SentinelState => ({ baseline, sweptAt: at.getTime(), failures: 0, startFailures: 0 });

describe('cycle', () => {
  test('quiet: no wake, one heartbeat; the first readable cycle only sets the baseline', async () => {
    const { w, deps } = world();
    const st = fresh(null);
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect(st.baseline).not.toBeNull();
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect(w.beats).toBe(1);
  });

  test('a change wakes with its parts and moves the baseline', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker));
    w.tracker = tracker({ 'DEMO-5': 'Ready for QA' }, { syncedAt: mon(9, 58).toISOString() });
    const wake = await cycle(cfg, deps, st);
    expect(wake?.reason).toBe('change');
    expect(wake?.details.parts).toEqual(['arrivals']);
    expect(await cycle(cfg, deps, st)).toBeNull();
    const [line, json] = wakeLines(wake!, { at: mon(10, 0), slug: 'sprint-1', rearm: 'bun run board sentinel' });
    expect(line).toBe('SENTINEL WAKE change (arrivals)');
    expect(JSON.parse(json)).toMatchObject({ reason: 'change', slug: 'sprint-1', rearm: 'bun run board sentinel' });
  });

  test('a launched ticket moving Ready for QA -> In Test does not wake the conductor', async () => {
    const at = (m: number) => mon(9, m).toISOString();
    const events = [
      ev('scope.add', 'DEMO-1', undefined, 'conductor', at(0)),
      ev('tracker', 'DEMO-1', { from: 'In Progress', to: 'Ready for QA', fromBucket: 'not_ready', bucket: 'in_test' }, undefined, at(1)),
      ev('arrival', 'DEMO-1', { action: 'launched' }, 'conductor', at(2)),
      ev('worker', 'DEMO-1', { state: 'running' }, 'conductor', at(3)),
    ];
    const { w, deps } = world({ events, tracker: tracker({ 'DEMO-1': 'Ready for QA' }, { syncedAt: mon(9, 58).toISOString() }) });
    const st = fresh(signatureOf(w.events, w.tracker));
    expect(st.baseline?.arrivals).toEqual([]);
    w.events = [...events, ev('tracker', 'DEMO-1', { from: 'Ready for QA', to: 'In Test', fromBucket: 'in_test', bucket: 'in_test' }, undefined, at(30))];
    w.tracker = tracker({ 'DEMO-1': 'In Test' }, { syncedAt: mon(9, 58).toISOString() });
    expect(await cycle(cfg, deps, st)).toBeNull();
  });

  test('outside working hours nothing is read and nothing wakes', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf([], tracker({})));
    w.tracker = tracker({ 'DEMO-5': 'Ready for QA' });
    w.now = sat(11, 0);
    expect(await cycle(cfg, deps, st)).toBeNull();
    w.now = mon(8, 50);
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect(w.started).toBe(0);
  });

  test('recheck-sweep: every 120 min while a RECHECK or held ticket exists, and not before', async () => {
    const events = [ev('arrival', 'DEMO-1', { action: 'held' }, 'conductor')];
    const { w, deps } = world({ events, tracker: tracker({ 'DEMO-1': 'Ready for QA' }, { syncedAt: mon(9, 58).toISOString() }) });
    const st = fresh(signatureOf(w.events, w.tracker), mon(10, 0));
    w.now = mon(11, 50);
    w.tracker = tracker({ 'DEMO-1': 'Ready for QA' }, { syncedAt: mon(11, 45).toISOString() });
    expect(await cycle(cfg, deps, st)).toBeNull();
    w.now = mon(12, 0);
    w.tracker = tracker({ 'DEMO-1': 'Ready for QA' }, { syncedAt: mon(11, 55).toISOString() });
    const wake = await cycle(cfg, deps, st);
    expect(wake?.reason).toBe('recheck-sweep');
    expect(wake?.details).toMatchObject({ recheck: ['DEMO-1'], minutesSinceLastWake: 120 });
    w.now = mon(12, 10);
    expect(await cycle(cfg, deps, st)).toBeNull();
  });

  test('no recheck-sweep when nothing is held', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker), mon(6, 0));
    expect(await cycle(cfg, deps, st)).toBeNull();
  });

  test('sync-stale wakes once per stale syncedAt', async () => {
    const { w, deps } = world({ tracker: tracker({}, { syncedAt: mon(10, 0).toISOString() }) });
    const st = fresh(signatureOf([], w.tracker));
    w.now = mon(10, 31);
    const wake = await cycle(cfg, deps, st);
    expect(wake?.reason).toBe('sync-stale');
    expect(wake?.details).toMatchObject({ ageMin: 31 });
    w.now = mon(10, 41);
    expect(await cycle(cfg, deps, st)).toBeNull();
  });

  test('three failed cycles in a row wake sentinel-error; a good cycle resets the count', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker));
    w.readError = 'EACCES events.ndjson';
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect(await cycle(cfg, deps, st)).toBeNull();
    w.readError = undefined;
    expect(await cycle(cfg, deps, st)).toBeNull();
    w.readError = 'EACCES events.ndjson';
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect(await cycle(cfg, deps, st)).toBeNull();
    const wake = await cycle(cfg, deps, st);
    expect(wake).toEqual({ reason: 'sentinel-error', details: { failures: MAX_FAILURES, message: 'EACCES events.ndjson' } });
    expect(w.logs.length).toBe(5);
  });

  test('a missing source.json is a failure, never "nothing changed" (Rule #13)', async () => {
    const { deps } = world({ tracker: null });
    const st = fresh(null);
    for (let i = 1; i < MAX_FAILURES; i++) { expect(await cycle(cfg, deps, st)).toBeNull(); }
    expect((await cycle(cfg, deps, st))?.reason).toBe('sentinel-error');
  });

  test('board lifecycle: started when nothing listens, board-down after two failed starts, stopped at 18:07', async () => {
    const up = world({ listening: false });
    const st = fresh(signatureOf([], up.w.tracker), mon(9, 0));
    up.w.now = mon(9, 0);
    expect(await cycle(cfg, up.deps, st)).toBeNull();
    expect(up.w.started).toBe(1);

    up.w.now = mon(18, 7);
    expect(await cycle(cfg, up.deps, st)).toBeNull();
    expect(up.w.stopped).toEqual([4242]);
    up.w.now = mon(18, 10);
    expect(await cycle(cfg, up.deps, st)).toBeNull();
    expect(up.w.stopped).toEqual([4242]);
    expect(up.w.started).toBe(1);

    const down = world({ listening: false, startOk: false });
    const st2 = fresh(signatureOf([], down.w.tracker));
    expect(await cycle(cfg, down.deps, st2)).toBeNull();
    expect((await cycle(cfg, down.deps, st2))?.reason).toBe('board-down');
  });
});

function waiting(o: { start?: Date, events?: BoardEvent[] } = {}) {
  const { w, deps } = world({ events: o.events });
  w.now = o.start ?? sat(11, 0);
  const t0 = w.now.getTime();
  const st = fresh(signatureOf(w.events, w.tracker), w.now);
  const writes: { at: number, run: () => void }[] = [];
  const seen = { sleeps: [] as number[], keys: 0, checks: [] as number[], ticks: [] as number[] };
  const elapsed = () => w.now.getTime() - t0;
  const loop: WaitDeps & { tick: () => ReturnType<typeof cycle> } = {
    tick: async () => { seen.ticks.push(elapsed()); return cycle(cfg, deps, st); },
    statKey: () => { seen.keys++; return String(w.events.length); },
    sleep: async (ms) => {
      seen.sleeps.push(ms);
      const to = w.now.getTime() + ms;
      for (const x of writes.splice(0).sort((a, b) => a.at - b.at)) {
        if (t0 + x.at <= to) { x.run(); }
        else { writes.push(x); }
      }
      w.now = new Date(to);
    },
    now: () => w.now.getTime(),
    check: () => {
      seen.checks.push(elapsed());
      return quickCheck(st, deps.read(), w.now);
    },
    log: deps.log,
  };
  const append = (e: BoardEvent) => { w.events = [...w.events, e]; };
  const at = (ms: number, run: () => void) => { writes.push({ at: ms, run }); };
  return { w, deps, st, loop, seen, elapsed, append, at, until: (ms: number) => t0 + ms };
}
const ownerAnswer = (text = 'a, go') => ev('need.answer', 'DEMO-2', { id: 'need-a', text }, 'owner');
const workerNeed = () => ev('need.open', 'DEMO-3', { id: 'need-w', question: 'defer TC-2?' }, 'worker');

describe('fast wake', () => {
  test('an owner answer wakes before the tick, out of hours, without a cycle having read it', async () => {
    const x = waiting();
    x.at(30_000, () => x.append(ownerAnswer()));
    const wake = await watchUntilWake(cfg, x.loop);
    expect(wake.reason).toBe('change');
    expect(wake.details.parts).toEqual(['owner-answer']);
    expect(wake.details.ownerAnswer).toMatchObject({ ticket: 'DEMO-2', text: 'a, go' });
    expect(x.elapsed()).toBeLessThanOrEqual(30_000 + POLL_MS + SETTLE_MS);
    expect(x.seen.ticks).toEqual([0]);
    expect(x.w.started).toBe(0);
  });

  test('quickCheck wakes only on an immediate part, then carries every addition, takes the baseline and resets the sweep clock', () => {
    expect(IMMEDIATE_PARTS).toEqual(['owner-answer', 'ask-approved', 'ask-sent', 'ask-changed']);
    const st = fresh(signatureOf([], tracker({})), mon(8, 0));
    const events = [workerNeed(), ownerAnswer()];
    const c = tracker({ 'DEMO-5': 'Ready for QA' });
    const wake = quickCheck(st, { events, tracker: c }, mon(10, 4))!;
    expect(wake.details.parts).toEqual(['arrivals', 'owner-answer', 'worker-need']);
    expect(st.baseline).toEqual(signatureOf(events, c));
    expect(st.sweptAt).toBe(mon(10, 4).getTime());
    expect(wakeLines(wake, { at: mon(10, 4), slug: 'sprint-1', rearm: 'x' })[0]).toBe('SENTINEL WAKE change (arrivals, owner-answer, worker-need)');
  });

  test('a worker event does not wake and leaves the baseline, so the tick still reports it', async () => {
    const x = waiting({ start: mon(10, 0) });
    const before = x.st.baseline;
    x.at(30_000, () => x.append(workerNeed()));
    expect(await waitForTick(x.loop, x.until(60_000), '0')).toEqual({ wake: null, seen: '1' });
    expect(x.seen.checks).toHaveLength(1);
    expect(x.st.baseline).toBe(before);
    expect(x.st.sweptAt).toBe(mon(10, 0).getTime());
    expect((await cycle(cfg, x.deps, x.st))?.details.parts).toEqual(['worker-need']);
  });

  test('a null baseline adopts the cold one: nothing pending, no wake', () => {
    const st = fresh(null);
    const handled = [ownerAnswer(), ev('need.close', 'DEMO-2', { id: 'need-a' }, 'conductor')];
    expect(quickCheck(st, { events: handled, tracker: tracker({ 'DEMO-5': 'Ready for QA' }) }, mon(10))).toBeNull();
    expect(st.baseline?.arrivals.map(a => a.id)).toEqual(['DEMO-5']);
  });

  test('a null baseline off hours still wakes for a pending answer, without waiting for working hours', async () => {
    const x = waiting();
    x.st.baseline = null;
    x.append(ownerAnswer());
    const wake = await watchUntilWake(cfg, x.loop);
    expect(wake.details.parts).toEqual(['owner-answer']);
    expect(x.elapsed()).toBe(POLL_MS + SETTLE_MS);
  });

  test('a board with no tracker yet is not counted as checked: the answer wakes once the sync lands', async () => {
    const x = waiting();
    const synced = x.w.tracker;
    x.st.baseline = null;
    x.w.tracker = null;
    x.append(ownerAnswer());
    expect(await waitForTick(x.loop, x.until(10_000), '0')).toEqual({ wake: null, seen: '0' });
    x.at(15_000, () => { x.w.tracker = synced; });
    expect((await waitForTick(x.loop, x.until(60_000), '0')).wake?.details.parts).toEqual(['owner-answer']);
    expect(x.elapsed()).toBeLessThan(60_000);
  });

  test('the same answer wakes once, across a re-arm from the baseline file', async () => {
    const x = waiting();
    x.at(4_000, () => x.append(ownerAnswer()));
    expect((await waitForTick(x.loop, x.until(60_000), '0')).wake?.reason).toBe('change');
    expect(quickCheck(x.st, x.deps.read(), x.w.now)).toBeNull();
    const restored = fromBaselineFile(JSON.stringify(toBaselineFile(x.st, 'sprint-1', x.w.now)), 'sprint-1', 'b.json');
    expect(quickCheck({ ...fresh(null), ...restored }, x.deps.read(), x.w.now)).toBeNull();
    expect((await waitForTick(x.loop, x.until(120_000), '')).wake).toBeNull();
  });

  test('an answer written while no sentinel ran wakes at the first wait, not at the next tick', async () => {
    const x = waiting();
    x.append(ownerAnswer());
    await watchUntilWake(cfg, x.loop);
    expect(x.elapsed()).toBe(POLL_MS + SETTLE_MS);
  });

  test('a write that lands during a cycle, after its read, is caught before the next tick', async () => {
    const x = waiting({ start: mon(10, 0) });
    const heartbeat = x.deps.heartbeat;
    x.deps.heartbeat = (note, counts) => {
      heartbeat(note, counts);
      if (x.seen.ticks.length === 2) { x.append(ownerAnswer()); }
    };
    const wake = await watchUntilWake(cfg, x.loop);
    expect(wake.details.parts).toEqual(['owner-answer']);
    expect(x.seen.ticks).toEqual([0, 10 * 60_000]);
    expect(x.elapsed()).toBe(10 * 60_000 + POLL_MS + SETTLE_MS);
  });

  test('out of hours, a write that lands between the last poll and the next cycle is still caught', async () => {
    const x = waiting();
    const tick = x.loop.tick;
    x.loop.tick = async () => {
      if (x.seen.ticks.length === 1) { x.append(ownerAnswer()); }
      return tick();
    };
    await watchUntilWake(cfg, x.loop);
    expect(x.elapsed()).toBe(10 * 60_000 + POLL_MS + SETTLE_MS);
  });

  test('a burst of appends settles into one check; a write during that check is checked again', async () => {
    const x = waiting();
    x.at(1_000, () => x.append(workerNeed()));
    x.at(2_500, () => x.append(workerNeed()));
    x.at(3_000, () => x.append(workerNeed()));
    expect((await waitForTick(x.loop, x.until(20_000), '0')).seen).toBe('3');
    expect(x.seen.checks).toEqual([POLL_MS + SETTLE_MS]);
    const check = x.loop.check;
    x.loop.check = () => {
      const found = check();
      if (x.seen.checks.length === 2) { x.append(ownerAnswer()); }
      return found;
    };
    x.at(21_000, () => x.append(workerNeed()));
    expect((await waitForTick(x.loop, x.until(40_000), '3')).wake?.details.parts).toEqual(['owner-answer', 'worker-need']);
    expect(x.seen.checks).toHaveLength(3);
  });

  test('an unchanged log is never read, and the wait ends on the tick', async () => {
    const x = waiting();
    expect(await waitForTick(x.loop, x.until(5_000), '0')).toEqual({ wake: null, seen: '0' });
    expect(x.seen.checks).toEqual([]);
    expect(x.seen.sleeps).toEqual([POLL_MS, POLL_MS, 1_000]);
  });

  test('a read error is logged once and retried, and the loop survives it', async () => {
    const x = waiting();
    x.w.readError = 'EACCES events.ndjson';
    x.at(1_000, () => x.append(ownerAnswer()));
    x.at(15_000, () => { x.w.readError = undefined; });
    const wake = await watchUntilWake(cfg, x.loop);
    expect(wake.details.parts).toEqual(['owner-answer']);
    expect(x.seen.checks.length).toBeGreaterThan(2);
    expect(x.w.logs).toEqual(['quick check failed, retrying: EACCES events.ndjson']);
    expect(x.elapsed()).toBeLessThan(10 * 60_000);
  });

  test('a check that fails until the tick hands the unread key back to the next wait', async () => {
    const x = waiting();
    x.w.readError = 'EACCES events.ndjson';
    x.at(1_000, () => x.append(ownerAnswer()));
    expect(await waitForTick(x.loop, x.until(10_000), '0')).toEqual({ wake: null, seen: '0' });
  });

  test('--dry-run does not enter the wait loop: it sleeps to the tick and never looks at the log', async () => {
    const x = waiting({ events: [ownerAnswer()] });
    const tick = x.loop.tick;
    x.loop.tick = async () => (x.seen.ticks.length ? { reason: 'change', details: {} } : tick());
    await watchUntilWake({ ...cfg, dryRun: true }, x.loop);
    expect(x.seen.sleeps).toEqual([10 * 60_000]);
    expect(x.seen.keys).toBe(0);
    expect(x.seen.checks).toEqual([]);
  });
});

describe('cold baseline', () => {
  const need = () => ev('need.open', 'DEMO-2', { id: 'need-a', question: 'q?' }, 'worker');
  const cold = (events: BoardEvent[]) => freshBaseline(events, signatureOf(events, tracker({})));

  test('an owner answer on a still open need is left out, so it wakes; a resolved one is history', () => {
    const open = [need(), ownerAnswer()];
    expect(cold(open).ownerAnswer).toBeNull();
    expect(additions(cold(open), signatureOf(open, tracker({})))!.parts).toEqual(['owner-answer']);
    const closed = [...open, ev('need.close', 'DEMO-2', { id: 'need-a' }, 'conductor')];
    expect(cold(closed).ownerAnswer).not.toBeNull();
    expect(cold([...open, ev('need.close', 'DEMO-2', { id: 'need-other' }, 'conductor')]).ownerAnswer).toBeNull();
  });

  test('an inbox message is left out until Claude replies in its thread', () => {
    const msg = (id: string, from: string, replyTo?: string) => ev('msg', undefined, { id, from, text: id, replyTo }, from);
    const asked = [msg('m1', 'claude'), msg('m2', 'owner', 'm1')];
    expect(cold(asked).ownerAnswer).toBeNull();
    expect(cold([...asked, msg('m3', 'claude')]).ownerAnswer).toBeNull();
    expect(cold([...asked, msg('m3', 'claude', 'm2')]).ownerAnswer).not.toBeNull();
  });

  test('an older answer still pending wakes a cold start even when the newest was acted on, and only once', async () => {
    const older = ownerAnswer('older');
    const newest = ev('need.answer', 'DEMO-4', { id: 'need-b', text: 'newest' }, 'owner');
    const events = [older, newest, ev('need.close', 'DEMO-4', { id: 'need-b' }, 'conductor')];
    const st = fresh(null);
    const read = { events, tracker: tracker({}) };
    expect(quickCheck(st, read, mon(10))?.details.parts).toEqual(['owner-answer']);
    expect(quickCheck(st, read, mon(10, 1))).toBeNull();
    expect(cold([...events, ev('need.close', 'DEMO-2', { id: 'need-a' }, 'conductor')]).ownerAnswer).not.toBeNull();
  });

  test('the first readable cycle leaves a pending answer for the next one', async () => {
    const { deps } = world({ events: [need(), ownerAnswer()] });
    const st = fresh(null);
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect((await cycle(cfg, deps, st))?.details.parts).toEqual(['owner-answer']);
  });
});

describe('asks', () => {
  const fake = { id: 'fake', createDraft: async () => ({ ok: true as const }) };
  const at = (m: number) => `2026-10-19T12:${String(m).padStart(2, '0')}:00Z`;
  const create = (id: string, kind = 'bug', by?: string) => ev('ask.create', undefined, { id, to: 'Kim', kind, text: 'private words', tickets: [] }, by, at(0));
  const move = (id: string, state: string, by: string, m: number) => ev('ask.state', undefined, { id, state }, by, at(m));
  const sig = (events: BoardEvent[], messenger: typeof fake | null = null) => signatureRaw(events, tracker({}), messenger);
  const after = (before: BoardEvent[], next: BoardEvent[], messenger: typeof fake | null = null) => additions(sig(before, messenger), sig([...before, ...next], messenger));
  const read = (events: BoardEvent[]) => ({ events, tracker: tracker({}) });

  test('a two-way ask marked sent wakes at once; a one-way one wakes nobody', () => {
    const st = fresh(sig([create('ask-a'), create('ask-b', 'fyi')]), mon(10, 0));
    const events = [create('ask-a'), create('ask-b', 'fyi'), move('ask-b', 'sent', 'owner', 1)];
    expect(quickCheck(st, read(events), mon(10))).toBeNull();
    const wake = quickCheck(st, read([...events, move('ask-a', 'sent', 'owner', 2)]), mon(10))!;
    expect(wake.details.parts).toEqual(['ask-sent']);
    expect(wake.details.askSent).toEqual([expect.objectContaining({ id: 'ask-a', state: 'sent', by: 'owner' })]);
    expect(JSON.stringify(wake.details)).not.toContain('private words');
  });

  test('a change by a person wakes at once with where it came from; the same board does not wake twice', () => {
    const sent = [create('ask-a'), move('ask-a', 'sent', 'conductor', 1)];
    const st = fresh(sig(sent), mon(10, 0));
    const closed = [...sent, move('ask-a', 'closed', 'owner', 2)];
    const wake = quickCheck(st, read(closed), mon(10))!;
    expect(wake.details.parts).toEqual(['ask-changed']);
    expect(wake.details.askChanged).toEqual([{ id: 'ask-a', to: 'Kim', from: 'sent', state: 'closed', by: 'owner' }]);
    expect(quickCheck(st, read(closed), mon(10))).toBeNull();
    expect(after(closed, [move('ask-a', 'answered', 'worker', 3)])?.parts).toEqual(['ask-changed']);
  });

  test('the conductor\'s and the sentinel\'s own writes never wake, on the fast path or on the tick', async () => {
    const start = [create('ask-a'), create('ask-b')];
    const own = [
      ...start,
      move('ask-a', 'sent', 'conductor', 1),
      move('ask-a', 'answered', 'conductor', 2),
      move('ask-b', 'sent', 'sentinel', 3),
      move('ask-b', 'closed', 'sentinel', 4),
      create('ask-c', 'bug', 'conductor'),
      move('ask-c', 'approved', 'conductor', 5),
    ];
    expect(quickCheck(fresh(sig(start, fake), mon(10)), read(own), mon(10))).toBeNull();
    expect(additions(sig(start, fake), sig(own, fake))).toBeNull();
    const { deps } = world({ events: own });
    expect(await cycle(cfg, deps, fresh(sig(start, fake)))).toBeNull();
  });

  test('a person moving an ask the baseline never saw wakes, as a move from draft', () => {
    for (const state of ['dropped', 'closed', 'answered'] as const) {
      const woke = after([], [create('ask-a', 'bug', 'conductor'), move('ask-a', 'sent', 'conductor', 1), move('ask-a', state, 'owner', 2)]);
      expect(woke?.parts).toEqual(['ask-changed']);
      expect(woke?.askChanged).toEqual([{ id: 'ask-a', to: 'Kim', from: 'draft', state, by: 'owner' }]);
    }
  });

  test('an Undo or a reopen back into sent does not report the send again; a new send does', () => {
    const sent = [create('ask-a'), move('ask-a', 'sent', 'owner', 1)];
    for (const state of ['closed', 'answered', 'dropped']) {
      const moved = [...sent, move('ask-a', state, 'owner', 2)];
      const back = move('ask-a', 'sent', 'owner', 3);
      expect(after(moved, [back])).toBeNull();
      expect(after(sent, [moved[2], back])).toBeNull();
      const st = fresh(sig(moved), mon(10, 0));
      expect(quickCheck(st, read([...moved, back]), mon(10))).toBeNull();
    }
    const redrafted = [...sent, move('ask-a', 'draft', 'owner', 2)];
    expect(after(redrafted, [move('ask-a', 'sent', 'owner', 3)])?.parts).toEqual(['ask-sent']);
    expect(after(sent, [redrafted[2], move('ask-a', 'sent', 'owner', 3)])?.parts).toEqual(['ask-sent']);
  });

  test('a new proposal wakes nobody', () => {
    expect(after([], [create('ask-a', 'bug', 'owner')])).toBeNull();
  });

  test('an approval wakes only when a messenger can draft it', () => {
    const approved = [move('ask-a', 'approved', 'owner', 1)];
    expect(after([create('ask-a')], approved)).toBeNull();
    expect(after([create('ask-a')], approved, fake)?.parts).toEqual(['ask-approved']);
  });

  test('a cold start leaves a pending approval to wake once, and adopts everything else', () => {
    const events = [create('ask-a'), create('ask-b'), move('ask-a', 'approved', 'owner', 1), move('ask-b', 'sent', 'owner', 2)];
    expect(additions(freshBaseline(events, sig(events, fake)), sig(events, fake))?.parts).toEqual(['ask-approved']);
    expect(additions(freshBaseline(events, sig(events)), sig(events))).toBeNull();
  });

  test('a baseline saved before asks were watched adopts them without a wake, and the next change wakes', async () => {
    const events = [create('ask-a'), create('ask-b'), move('ask-a', 'sent', 'owner', 1)];
    const { asks: _asks, drafting: _drafting, ...old } = sig(events);
    expect(additions(old, sig(events))).toBeNull();
    const saved = JSON.stringify(toBaselineFile(fresh(old), 'sprint-1', mon(10, 0)));
    const restored = { ...fresh(null), ...fromBaselineFile(saved, 'sprint-1', 'b.json') };
    expect(quickCheck(restored, read(events), mon(10))).toBeNull();
    expect(quickCheck(restored, read([...events, move('ask-b', 'sent', 'owner', 2)]), mon(10))?.details.parts).toEqual(['ask-sent']);
    const { deps } = world({ events });
    const ticked = { ...fresh(null), ...fromBaselineFile(saved, 'sprint-1', 'b.json') };
    expect(await cycle(cfg, deps, ticked)).toBeNull();
    expect(ticked.baseline?.asks).toHaveLength(2);
  });
});

describe('the owed board stop', () => {
  const rearm = (st: SentinelState, at: Date): SentinelState => ({ ...fresh(null, at), ...fromBaselineFile(JSON.stringify(toBaselineFile(st, 'sprint-1', at)), 'sprint-1', 'b.json') });

  test('a fast wake before the stop time, re-armed after the window, stops the board once', async () => {
    const x = waiting({ start: mon(18, 0) });
    expect(await cycle(cfg, x.deps, x.st)).toBeNull();
    x.at(60_000, () => x.append(ownerAnswer()));
    expect((await waitForTick(x.loop, x.until(7 * 60_000), '0')).wake?.reason).toBe('change');
    const next = rearm(x.st, x.w.now);
    x.w.now = mon(18, 30);
    expect(await cycle(cfg, x.deps, next)).toBeNull();
    expect(x.w.stopped).toEqual([4242]);
    x.w.listening = true;
    x.w.now = mon(18, 40);
    expect(await cycle(cfg, x.deps, next)).toBeNull();
    x.w.now = mon(19, 0);
    expect(await cycle(cfg, x.deps, rearm(next, x.w.now))).toBeNull();
    expect(x.w.stopped).toEqual([4242]);
  });

  test('a fast wake that settles past the stop time still leaves the stop owed', async () => {
    const x = waiting({ start: mon(18, 0) });
    expect(await cycle(cfg, x.deps, x.st)).toBeNull();
    x.at(7 * 60_000 - 100, () => x.append(ownerAnswer()));
    expect((await waitForTick(x.loop, x.until(7 * 60_000), '0')).wake?.reason).toBe('change');
    expect(x.w.now.getTime()).toBeGreaterThan(mon(18, 7).getTime());
    const next = rearm(x.st, x.w.now);
    x.w.now = mon(18, 30);
    await cycle(cfg, x.deps, next);
    expect(x.w.stopped).toEqual([4242]);
  });

  test('a tick wake before the stop time, re-armed after the window, stops the board', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker));
    w.now = mon(17, 50);
    w.tracker = tracker({ 'DEMO-5': 'Ready for QA' }, { syncedAt: mon(17, 45).toISOString() });
    expect((await cycle(cfg, deps, st))?.reason).toBe('change');
    const next = rearm(st, w.now);
    w.now = mon(21, 0);
    await cycle(cfg, deps, next);
    expect(w.stopped).toEqual([4242]);
  });

  test('a stop that failed after the window is still owed to the next re-arm', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker));
    w.now = mon(17, 50);
    await cycle(cfg, deps, st);
    const failing = rearm(st, w.now);
    w.now = mon(18, 30);
    await cycle(cfg, { ...deps, listening: async () => { throw new Error('lsof failed'); } }, failing);
    expect(w.stopped).toEqual([]);
    w.now = mon(18, 40);
    await cycle(cfg, deps, rearm(failing, w.now));
    expect(w.stopped).toEqual([4242]);
  });

  test('no stop past the window without a baseline from before the stop time that same working day', async () => {
    const { w, deps } = world();
    const base = () => fresh(signatureOf(w.events, w.tracker));
    w.now = mon(20, 0);
    const cold = base();
    await cycle(cfg, deps, cold);
    await cycle(cfg, deps, rearm(cold, w.now));
    const yesterday = base();
    w.now = new Date(2026, 9, 18, 12, 0);
    await cycle({ ...cfg, days: [0, 1, 2, 3, 4, 5] }, deps, yesterday);
    w.now = mon(20, 0);
    await cycle(cfg, deps, rearm(yesterday, w.now));
    const running = base();
    w.now = mon(17, 0);
    await cycle(cfg, deps, running);
    w.now = mon(20, 0);
    await cycle(cfg, deps, running);
    const weekend = base();
    w.now = sat(12, 0);
    await cycle(cfg, deps, weekend);
    w.now = sat(20, 0);
    await cycle(cfg, deps, rearm(weekend, w.now));
    expect(w.stopped).toEqual([]);
  });
});

describe('baseline file', () => {
  test('round-trips, and a restart after a wake does not wake again for the same item', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker));
    w.tracker = tracker({ 'DEMO-5': 'Ready for QA' }, { syncedAt: mon(9, 58).toISOString() });
    expect((await cycle(cfg, deps, st))?.reason).toBe('change');
    const file = toBaselineFile(st, 'sprint-1', mon(10, 0))!;
    const restored = { ...fresh(null), ...fromBaselineFile(JSON.stringify(file), 'sprint-1', 'b.json') };
    expect(restored.sweptAt).toBe(st.sweptAt);
    w.now = mon(10, 10);
    expect(await cycle(cfg, deps, restored)).toBeNull();
    w.tracker = tracker({ 'DEMO-5': 'Ready for QA', 'DEMO-6': 'Ready for QA' }, { syncedAt: mon(10, 5).toISOString() });
    expect((await cycle(cfg, deps, restored))?.details.arrivals).toEqual([{ id: 'DEMO-6', kind: 'NEW', title: 'DEMO-6 title' }]);
  });

  test('a sentinel re-armed inside the stop window does not stop the board a second time', async () => {
    const { w, deps } = world();
    const st = fresh(signatureOf(w.events, w.tracker), mon(9, 0));
    st.serverStartedAt = mon(9, 0).getTime();
    w.now = mon(18, 7);
    expect(await cycle(cfg, deps, st)).toBeNull();
    expect(w.stopped).toEqual([4242]);

    const file = toBaselineFile(st, 'sprint-1', mon(18, 7))!;
    expect(file.stoppedOn).toBe(st.stoppedOn);
    const restored = { ...fresh(null), ...fromBaselineFile(JSON.stringify(file), 'sprint-1', 'b.json') };
    w.listening = true; // the owner started the board again by hand
    w.now = mon(18, 10);
    expect(await cycle(cfg, deps, restored)).toBeNull();
    expect(w.stopped).toEqual([4242]);

    st.serverStartedAt = mon(9, 0).getTime();
    const morning = fromBaselineFile(JSON.stringify(toBaselineFile(st, 'sprint-1', mon(9, 2))), 'sprint-1', 'b.json');
    expect(morning.serverStartedAt).toBe(mon(9, 0).getTime());
  });

  test('a baseline of another board, or not a baseline at all, is refused', () => {
    const file = toBaselineFile(fresh(signatureOf([], tracker({}))), 'sprint-1', mon(10, 0));
    expect(() => fromBaselineFile(JSON.stringify(file), 'sprint-2', 'b.json')).toThrow(/sprint-1, not sprint-2/);
    expect(() => fromBaselineFile('{"v":1}', 'sprint-1', 'b.json')).toThrow(/not a sentinel baseline/);
    expect(toBaselineFile(fresh(null), 'sprint-1', mon(10, 0))).toBeNull();
  });
});

describe('the CLI', () => {
  const CLI = `${import.meta.dir}/index.ts`;
  const DEMO_CONFIG = `${import.meta.dir}/demo/project.yaml`;
  const runCli = (dir: string, ...args: string[]) => {
    const r = Bun.spawnSync(['bun', CLI, ...args], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG } });
    return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test('a real fast wake saves the baseline before it exits, so a re-arm does not repeat it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sprint-board-sentinel-'));
    let proc: ReturnType<typeof Bun.spawn> | undefined;
    try {
      expect(runCli(dir, 'new', '--sprint', '1').code).toBe(0);
      writeFileSync(join(dir, 'sprints', 'sprint-1', 'source.json'), JSON.stringify(tracker({})));
      const baseline = join(dir, 'baseline.json');
      writeFileSync(baseline, JSON.stringify(toBaselineFile(fresh(signatureOf([], tracker({}))), 'sprint-1', mon(10, 0))));
      const answer = ev('msg', undefined, { id: 'msg-o', from: 'owner', text: 'yes' }, 'owner');
      const log = join(dir, 'sprints', 'sprint-1', 'events.ndjson');
      writeFileSync(log, `${readFileSync(log, 'utf8')}${JSON.stringify(answer)}\n`);
      // Not a working day, so the real sentinel never touches a board server.
      const offDay = String((new Date().getDay() + 3) % 7);
      const child = Bun.spawn([process.execPath, CLI, 'sentinel', '--baseline', baseline, '--days', offDay], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG }, stdout: 'pipe', stderr: 'pipe' });
      proc = child;
      expect(await child.exited).toBe(0);
      expect(await new Response(child.stdout).text()).toStartWith('SENTINEL WAKE change (owner-answer)');
      expect(JSON.parse(readFileSync(baseline, 'utf8')).signature.ownerAnswer.event).toBe(answer.id);
    }
    finally {
      proc?.kill();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);

  test('--once does not enter the wait loop: an answer past the baseline is reported, not waited on', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sprint-board-sentinel-'));
    try {
      expect(runCli(dir, 'new', '--sprint', '1').code).toBe(0);
      writeFileSync(join(dir, 'sprints', 'sprint-1', 'source.json'), JSON.stringify(tracker({})));
      const baseline = join(dir, 'baseline.json');
      writeFileSync(baseline, JSON.stringify(toBaselineFile(fresh(signatureOf([], tracker({}))), 'sprint-1', mon(10, 0))));
      expect(runCli(dir, 'say', 'Ship it?', '--ask').code).toBe(0);
      const log = join(dir, 'sprints', 'sprint-1', 'events.ndjson');
      writeFileSync(log, `${readFileSync(log, 'utf8')}${JSON.stringify(ev('msg', undefined, { id: 'msg-o', from: 'owner', text: 'yes' }, 'owner'))}\n`);
      const r = runCli(dir, 'sentinel', '--once', '--port', '59999', '--baseline', baseline);
      expect(r.code).toBe(0);
      expect(r.out).not.toContain('SENTINEL WAKE');
      expect(JSON.parse(r.out).wouldWake).toBe('change (owner-answer)');
    }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('--once prints the signature read-only, and bad flags stop the command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sprint-board-sentinel-'));
    try {
      expect(runCli(dir, 'new', '--sprint', '1').code).toBe(0);
      expect(runCli(dir, 'sentinel', '--once').err).toContain('source.json is missing');
      writeFileSync(join(dir, 'sprints', 'sprint-1', 'source.json'), JSON.stringify(tracker({ 'DEMO-5': 'Ready for QA' })));
      const before = readFileSync(join(dir, 'sprints', 'sprint-1', 'events.ndjson'), 'utf8');
      const r = runCli(dir, 'sentinel', '--once', '--port', '59999');
      expect(r.code).toBe(0);
      const out = JSON.parse(r.out);
      expect(out.signature.arrivals).toEqual([{ id: 'DEMO-5', kind: 'NEW', title: 'DEMO-5 title' }]);
      expect(out.board).toEqual({ port: 59999, pids: [] });
      expect(readFileSync(join(dir, 'sprints', 'sprint-1', 'events.ndjson'), 'utf8')).toBe(before);
      expect(runCli(dir, 'sentinel', '--once', '--hours', '18-9').err).toContain('--hours "18-9"');
      expect(runCli(dir, 'sentinel', '--once', '--stop-at', '17:00').err).toContain('--stop-at must not fall inside --hours');
    }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
