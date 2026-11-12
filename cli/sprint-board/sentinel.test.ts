/**
 * The sentinel's decisions, with an injected clock and fake process/port probes:
 * no network, no real server, no real tracker.
 */
import type { BoardEvent, TrackerSnapshot } from './model.ts';
import type { SentinelConfig, SentinelDeps, SentinelState, Signature } from './sentinel.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { SCHEMA } from './model.ts';
import {
  activeHolds,
  additions,
  cycle,
  fromBaselineFile,
  inHours,
  MAX_FAILURES,
  msToNextTick,
  openWorkerNeeds,
  parseClock,
  parseDays,
  parseHours,
  SENTINEL_DEFAULTS,
  shouldStop,
  signatureOf as signatureRaw,
  syncStale,
  toBaselineFile,
  wakeLines,
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
