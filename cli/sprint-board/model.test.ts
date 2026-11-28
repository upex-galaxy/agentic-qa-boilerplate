import type { BoardEvent, Need, Sprint, TrackerSnapshot, WatcherView } from './model.ts';
import { describe, expect, test } from 'bun:test';
import {
  arrivals as arrivalsRaw,
  ASK_STATES,
  askActionState,
  askPhase,
  askPhaseCounts,
  askStep,
  askTransition,
  boardTicketIds,
  bugCounts,
  bugEvidenceReminder,
  bugStatusClass,
  decisionOptions,
  deferralNote,
  deferralOkRecord,
  EVIDENCE_OUTCOMES,
  evidenceArtifactUrl,
  foldAsks,
  fold as foldRaw,
  groupEvidence,
  isAskActor,
  isDecisionCard,
  lapsedDeferrals,
  listenLine,
  listFixtures,
  metrics,
  needTarget,
  oneOf,
  ownerActionsSince,
  parseOption,
  resolvePerson,
  SCHEMA,
  shortBugTitle,
  sinceCutoff,
  slackBugSummary,
  slackStatus,
  slackTableHtml,
  slackTablePlain,
  stpUrl,
  toReportState,
  toShareState,
  untrackedInTest as untrackedRaw,
  WATCHER_GRACE_MIN,
  watchersDown,
  watchLiveness,
} from './model.ts';
import { bucketed, ticketBucketOf } from './test-fixtures.ts';

// The ported cases write display statuses; sync would have stored each bucket (test-fixtures.ts).
const fold = (i: Parameters<typeof foldRaw>[0]) => foldRaw({ ...i, tracker: bucketed(i.tracker) });
const arrivals = (events: BoardEvent[], c: TrackerSnapshot | null | undefined) => arrivalsRaw(events, bucketed(c));
const untrackedInTest = (rows: Parameters<typeof untrackedRaw>[0], onBoard: Set<string>) => untrackedRaw(rows.map(r => ({ ...r, bucket: r.bucket ?? ticketBucketOf(r.status) })), onBoard);

const sprint: Sprint = { v: SCHEMA, slug: 'sprint-1', number: 1, name: 'Sprint 1', startedAt: '2026-10-01T00:00:00Z' };
let n = 0;
const ev = (at: string, kind: BoardEvent['kind'], ticket: string | undefined, data?: Record<string, unknown>): BoardEvent =>
  ({ v: SCHEMA, id: `t${++n}`, at, kind, ticket, text: kind, data });
const tracker = (tickets: TrackerSnapshot['tickets'], syncedAt = '2026-10-05T00:00:00Z'): TrackerSnapshot =>
  ({ v: SCHEMA, syncedAt, searched: { tickets: 0, tcs: 0, bugs: 0 }, tickets, bugs: {} });
const NOW = '2026-10-05T12:00:00Z';
const one = (events: BoardEvent[], c?: TrackerSnapshot) => fold({ sprint, events, tracker: c, now: NOW }).tickets[0];

describe('laneOf through fold', () => {
  test('tracker past the gate with FAILED cases is Failed and shipped at risk', () => {
    const t = one([], tracker({ 'DEMO-7390': { status: 'QA Approved', tcs: [
      { id: 'TC-1', status: 'PASSED' },
      { id: 'TC-2', status: 'FAILED' },
      { id: 'TC-3', status: 'FAILED' },
      { id: 'TC-4', status: 'NOT RUN' },
    ] } }));
    expect(t.lane).toBe('Failed');
    expect(t.atRisk).toBe(true);
    expect(t.drift).toBe('Tracker moved it to QA Approved');
  });

  test('a PASSED verdict with a case still NOT RUN or BLOCKED is Held, not Passed', () => {
    const t = one([ev('2026-10-05T10:00:00Z', 'verdict', 'DEMO-7310', { verdict: 'PASSED' })], tracker({ 'DEMO-7310': { status: 'Ready for QA', tcs: [
      { id: 'TC-1', status: 'PASSED' },
      { id: 'TC-2', status: 'BLOCKED' },
    ] } }));
    expect(t.lane).toBe('Held');
  });

  test('every tracker status in the tested bucket counts as tested: Released and Done too', () => {
    for (const status of ['QA Approved', 'Released', 'Done']) {
      const t = one([], tracker({ 'DEMO-9': { status, tcs: [{ id: 'TC-1', status: 'PASSED' }] } }));
      expect(t.lane).toBe('Passed');
      expect(t.drift).toBeUndefined();
    }
  });

  test('accept-risk clears the at-risk flag but not the lane', () => {
    const t = one([ev('2026-10-05T10:00:00Z', 'accept-risk', 'DEMO-7390', { by: 'Kim, Slack' })], tracker({ 'DEMO-7390': { status: 'Done', tcs: [{ id: 'TC-2', status: 'FAILED' }] } }));
    expect(t.atRisk).toBe(false);
    expect(t.lane).toBe('Failed');
  });

  test('a retest runs again: Running outranks the old FAILED verdict, attempt increments', () => {
    const t = one([
      ev('2026-10-02T00:00:00Z', 'verdict', 'DEMO-5', { verdict: 'FAILED' }),
      ev('2026-10-04T00:00:00Z', 'attempt', 'DEMO-5'),
    ]);
    expect(t.attempt).toBe(2);
    expect(t.verdict).toBe('PENDING');
    expect(t.lane).toBe('Running');
  });

  test('FAILED then retest PASSED keeps the TC history', () => {
    const t = one([
      ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-6', { tc: 'TC-9', status: 'FAILED' }),
      ev('2026-10-04T00:00:00Z', 'tc', 'DEMO-6', { tc: 'TC-9', status: 'PASSED' }),
      ev('2026-10-04T01:00:00Z', 'verdict', 'DEMO-6', { verdict: 'PASSED' }),
    ]);
    expect(t.lane).toBe('Passed');
    expect(t.tcs[0].history.map(h => h.status)).toEqual(['FAILED', 'PASSED']);
  });

  test('a worker that stopped without a verdict lands in Needs you, not Up next', () => {
    const t = one([ev('2026-10-02T00:00:00Z', 'worker', 'DEMO-7', { state: 'running' }), ev('2026-10-02T03:00:00Z', 'worker', 'DEMO-7', { state: 'done' })]);
    expect(t.lane).toBe('Needs you');
    expect(t.needs[0].synthetic).toBe(true);
  });

  test('DEFERRED with neither a reason nor an approval asks the owner; with either it does not', () => {
    const a = one([ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-8', { tc: 'TC-1', status: 'DEFERRED' }), ev('2026-10-02T00:00:01Z', 'verdict', 'DEMO-8', { verdict: 'PASSED' })]);
    expect(a.lane).toBe('Needs you');
    const b = one([ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-8', { tc: 'TC-1', status: 'DEFERRED', approval: 'Kim' }), ev('2026-10-02T00:00:01Z', 'verdict', 'DEMO-8', { verdict: 'PASSED' })]);
    // A case approval is not the owner's OK for the ticket: it waits, without asking a question.
    expect([b.lane, b.needs]).toEqual(['Held', []]);
    const c = one([ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-8', { tc: 'TC-1', status: 'DEFERRED', reason: 'QA decision 2026-10-16: data only the payment provider produces' }), ev('2026-10-02T00:00:01Z', 'verdict', 'DEMO-8', { verdict: 'PASSED' })]);
    expect([c.lane, c.needs]).toEqual(['Held', []]);
    expect(c.tcs[0].reason).toBe('QA decision 2026-10-16: data only the payment provider produces');
  });

  test('a BLOCKED case is a hold, not the owner\'s decision', () => {
    const t = one([ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-9', { tc: 'TC-1', status: 'BLOCKED' })]);
    expect(t.lane).toBe('Held');
  });

  test('an answered question releases Needs you', () => {
    const t = one([
      ev('2026-10-02T00:00:00Z', 'need.open', 'DEMO-7010', { id: 'q1', question: 'a or b?' }),
      ev('2026-10-02T02:00:00Z', 'need.answer', 'DEMO-7010', { id: 'q1', text: 'a' }),
    ]);
    expect(t.lane).not.toBe('Needs you');
  });

  test('newest wins: a board FAILED is not overwritten by an older tracker NOT RUN', () => {
    const t = one([ev('2026-10-04T00:00:00Z', 'tc', 'DEMO-7011', { tc: 'TC-1', status: 'FAILED' })], tracker({ 'DEMO-7011': { status: 'Ready for QA', tcs: [{ id: 'TC-1', status: 'NOT RUN', updatedAt: '2026-10-03T00:00:00Z' }] } }));
    expect(t.tcs[0].status).toBe('FAILED');
  });

  test('closed sprint imported from tracker only: all PASSED at QA Approved is Passed', () => {
    const t = one([], tracker({ 'DEMO-7012': { status: 'Done', tcs: [{ id: 'TC-1', status: 'PASSED' }, { id: 'TC-2', status: 'PASSED' }] } }));
    expect(t.lane).toBe('Passed');
  });
});

describe('metrics', () => {
  test('pass rate uses executed cases and keeps NOT RUN visible; a shared bug counts once', () => {
    const s = fold({ sprint, now: NOW, events: [
      ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7099', severity: 'High' }),
      ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-2', { bug: 'DEMO-7099', severity: 'High' }),
    ], tracker: tracker({
      'DEMO-1': { status: 'Ready for QA', tcs: [{ id: 'TC-1', status: 'PASSED' }, { id: 'TC-2', status: 'FAILED' }] },
      'DEMO-2': { status: 'Ready for QA', tcs: [{ id: 'TC-3', status: 'NOT RUN' }, { id: 'TC-4', status: 'PASSED' }] },
    }) });
    const m = metrics(s);
    expect(m.passRate).toBeCloseTo(2 / 3);
    expect(m.tc['NOT RUN']).toBe(1);
    expect(m.bugs.total).toBe(1);
  });
});

describe('share snapshot', () => {
  test('drafts, waits, needs and evidence never reach the share state', () => {
    const s = fold({ sprint, now: NOW, events: [
      ev('2026-10-02T00:00:00Z', 'scope.add', 'DEMO-1'),
      ev('2026-10-02T00:00:00Z', 'ask.create', 'DEMO-1', { id: 'ask-x', to: 'Kim', text: 'private words for Kim only', tickets: ['DEMO-1'] }),
      ev('2026-10-02T00:00:00Z', 'wait.open', 'DEMO-1', { person: 'Kim', what: 'secret wait' }),
      ev('2026-10-02T00:00:00Z', 'need.open', 'DEMO-1', { question: 'secret question' }),
      ev('2026-10-02T00:00:00Z', 'evidence', 'DEMO-1', { path: '.session/x.png' }),
    ] });
    const json = JSON.stringify(toShareState(s));
    for (const secret of ['private words', 'secret wait', 'secret question', '.session/']) { expect(json).not.toContain(secret); }
  });
});

describe('ask lifecycle', () => {
  const allowed: Record<string, string> = {
    'draft': 'approved sent dropped',
    'approved': 'drafted draft-failed draft dropped',
    'drafted': 'sent draft dropped draft-failed',
    'draft-failed': 'approved drafted sent draft dropped',
    'sent': 'answered draft drafted dropped closed',
    'answered': 'answered sent dropped closed',
    'closed': 'answered sent',
    'dropped': 'draft drafted sent approved answered',
  };
  const make = (at: string, id: string, kind = 'bug', extra: Record<string, unknown> = {}) => ev(at, 'ask.create', 'DEMO-1', { id, to: 'Kim', kind, text: 'words', tickets: ['DEMO-1'], ...extra });
  const move = (at: string, id: string, state: string, extra: Record<string, unknown> = {}) => ev(at, 'ask.state', undefined, { id, state, ...extra });

  test('the full transition matrix', () => {
    expect(Object.keys(allowed).sort()).toEqual([...ASK_STATES].sort());
    for (const from of ASK_STATES) {
      for (const to of ASK_STATES) {
        expect([from, to, askTransition(from, to) === null]).toEqual([from, to, allowed[from].split(' ').includes(to)]);
      }
    }
    expect(askTransition('draft', 'draft')).toBe('it is already draft');
    expect(askTransition('draft', 'closed')).toBe('cannot go from draft to closed');
  });

  test('the current state is a no-op unless it brings a new reply', () => {
    for (const state of ASK_STATES) { expect(askStep({ state }, state)).toEqual({ kind: 'noop' }); }
    expect(askStep({ state: 'answered', reply: 'ok' }, 'answered', 'ok')).toEqual({ kind: 'noop' });
    expect(askStep({ state: 'answered', reply: 'ok' }, 'answered', 'done now')).toEqual({ kind: 'go' });
    expect(askStep({ state: 'sent' }, 'sent', 'a reply')).toEqual({ kind: 'noop' });
    expect(askStep({ state: 'draft' }, 'answered')).toEqual({ kind: 'refuse', why: 'cannot go from draft to answered' });
  });

  test('phases are derived from the state and whether a reply is expected', () => {
    expect(ASK_STATES.map(state => `${state}:${askPhase({ state, twoWay: true })}`)).toEqual([
      'draft:approve',
      'sent:waiting',
      'answered:read',
      'dropped:done',
      'approved:send',
      'drafted:send',
      'draft-failed:approve',
      'closed:done',
    ]);
    expect(askPhase({ state: 'sent', twoWay: false })).toBe('done');
    expect(askPhaseCounts([{ state: 'draft', twoWay: true }, { state: 'sent', twoWay: false }, { state: 'answered', twoWay: true }]))
      .toEqual({ approve: 1, send: 0, waiting: 0, read: 1, done: 1 });
  });

  test('the actors are a closed set with a plain worker', () => {
    expect(['owner', 'conductor', 'sentinel', 'worker'].every(isAskActor)).toBe(true);
    expect(['claude', 'worker:DEMO-1', 'Kim', ''].some(isAskActor)).toBe(false);
  });

  test('a log written with the first four states replays unchanged', () => {
    const asks = foldAsks([
      make('2026-10-02T00:00:00Z', 'ask-a', 'blocker'),
      move('2026-10-02T01:00:00Z', 'ask-a', 'sent'),
      move('2026-10-02T02:00:00Z', 'ask-a', 'sent'),
      move('2026-10-02T03:00:00Z', 'ask-a', 'answered'),
      make('2026-10-02T00:00:00Z', 'ask-b', 'fyi'),
      move('2026-10-02T01:00:00Z', 'ask-b', 'dropped'),
      make('2026-10-02T00:00:00Z', 'ask-c'),
      move('2026-10-02T01:00:00Z', 'ask-c', 'sent'),
      move('2026-10-02T02:00:00Z', 'ask-c', 'draft'),
      move('2026-10-02T03:00:00Z', 'ask-nobody', 'sent'),
      move('2026-10-02T04:00:00Z', 'ask-b', 'not-a-state'),
    ]);
    const of = (id: string) => asks.find(a => a.id === id)!;
    expect(asks).toHaveLength(3);
    expect(of('ask-a')).toMatchObject({ state: 'answered', sentAt: '2026-10-02T02:00:00Z', answeredAt: '2026-10-02T03:00:00Z', twoWay: true });
    expect(of('ask-b')).toMatchObject({ state: 'dropped', twoWay: false });
    expect(of('ask-c')).toMatchObject({ state: 'draft', sentAt: undefined, answeredAt: undefined });
    expect(of('ask-c').history.map(h => h.state)).toEqual(['draft', 'sent', 'draft']);
  });

  test('the fold keeps the draft link, the reference, the failure and the reply of the state that carries them', () => {
    const log = [
      make('2026-10-02T00:00:00Z', 'ask-a'),
      move('2026-10-02T01:00:00Z', 'ask-a', 'approved'),
      move('2026-10-02T02:00:00Z', 'ask-a', 'draft-failed', { error: 'refused' }),
    ];
    expect(foldAsks(log)[0]).toMatchObject({ state: 'draft-failed', error: 'refused' });
    log.push(move('2026-10-02T03:00:00Z', 'ask-a', 'drafted', { link: 'https://chat.example/d/1', ref: 'm-1' }));
    expect(foldAsks(log)[0]).toMatchObject({ link: 'https://chat.example/d/1', ref: 'm-1', error: undefined });
    log.push(move('2026-10-02T04:00:00Z', 'ask-a', 'sent'), move('2026-10-02T05:00:00Z', 'ask-a', 'answered', { reply: 'yes' }));
    expect(foldAsks(log)[0]).toMatchObject({ ref: 'm-1', reply: 'yes', replyAt: '2026-10-02T05:00:00Z' });
    log.push(move('2026-10-02T06:00:00Z', 'ask-a', 'closed'));
    expect(foldAsks(log)[0]).toMatchObject({ state: 'closed', closedAt: '2026-10-02T06:00:00Z', reply: 'yes' });
    log.push(move('2026-10-02T07:00:00Z', 'ask-a', 'sent'), move('2026-10-02T08:00:00Z', 'ask-a', 'draft'));
    expect(foldAsks(log)[0]).toMatchObject({ state: 'draft', link: undefined, ref: undefined, reply: undefined, closedAt: undefined });
    expect(foldAsks([make('2026-10-02T00:00:00Z', 'ask-b'), move('2026-10-02T01:00:00Z', 'ask-b', 'drafted', { link: 'javascript:alert(1)' })])[0].link).toBeUndefined();
  });

  test('reopen goes back to the state the ask was closed from', () => {
    const answered = [make('2026-10-02T00:00:00Z', 'ask-a'), move('2026-10-02T01:00:00Z', 'ask-a', 'sent'), move('2026-10-02T02:00:00Z', 'ask-a', 'answered'), move('2026-10-02T03:00:00Z', 'ask-a', 'closed')];
    expect(askActionState('reopen', foldAsks(answered)[0])).toBe('answered');
    const unanswered = [...answered.slice(0, 3), move('2026-10-02T02:30:00Z', 'ask-a', 'sent'), answered[3]];
    expect(askActionState('reopen', foldAsks(unanswered)[0])).toBe('sent');
  });

  test('going back into sent keeps when it was sent; a new send after a draft does not', () => {
    const sentAt = (...moves: [number, string][]) => foldAsks([make('2026-10-02T00:00:00Z', 'ask-a'), ...moves.map(([h, state]) => move(`2026-10-02T0${h}:00:00Z`, 'ask-a', state))])[0].sentAt;
    const first = '2026-10-02T01:00:00Z';
    expect(sentAt([1, 'sent'], [2, 'closed'], [3, 'sent'])).toBe(first);
    expect(sentAt([1, 'sent'], [2, 'answered'], [3, 'sent'])).toBe(first);
    expect(sentAt([1, 'sent'], [2, 'dropped'], [3, 'sent'])).toBe(first);
    expect(sentAt([1, 'sent'], [2, 'draft'], [3, 'sent'])).toBe('2026-10-02T03:00:00Z');
    expect(sentAt([1, 'dropped'], [3, 'sent'])).toBe('2026-10-02T03:00:00Z');
  });

  test('a blank value in the log leaves the recorded one', () => {
    const [a] = foldAsks([
      make('2026-10-02T00:00:00Z', 'ask-a'),
      move('2026-10-02T01:00:00Z', 'ask-a', 'drafted', { link: 'https://chat.example/d/1', ref: 'm-1' }),
      move('2026-10-02T02:00:00Z', 'ask-a', 'sent'),
      move('2026-10-02T03:00:00Z', 'ask-a', 'drafted', { link: '', ref: ' ' }),
      move('2026-10-02T04:00:00Z', 'ask-a', 'sent'),
      move('2026-10-02T05:00:00Z', 'ask-a', 'answered', { reply: 'yes' }),
      move('2026-10-02T06:00:00Z', 'ask-a', 'answered', { reply: '', replyAt: undefined }),
      move('2026-10-02T07:00:00Z', 'ask-a', 'answered', { reply: '  ' }),
    ]);
    expect(a).toMatchObject({ reply: 'yes', replyAt: '2026-10-02T05:00:00Z', link: 'https://chat.example/d/1', ref: 'm-1' });
  });

  test('moves are applied by instant, with or without milliseconds in the time', () => {
    const [a] = foldAsks([make('2026-10-02T00:00:00Z', 'ask-a'), move('2026-10-02T01:00:00Z', 'ask-a', 'sent'), move('2026-10-02T01:00:00.001Z', 'ask-a', 'answered')]);
    expect(a.state).toBe('answered');
  });

  test('every unsent state is outdated once its ticket changed, a sent one is not', () => {
    const outdated = (state: string) => fold({ sprint, now: NOW, events: [
      make('2026-10-02T00:00:00Z', 'ask-a'),
      move('2026-10-02T01:00:00Z', 'ask-a', state),
      ev('2026-10-03T00:00:00Z', 'verdict', 'DEMO-1', { verdict: 'PASSED' }),
    ] }).asks[0].outdated;
    expect(ASK_STATES.filter(outdated).sort()).toEqual(['approved', 'draft', 'draft-failed', 'drafted']);
  });

  test('share and report copies carry nothing of an ask', () => {
    const full = fold({ sprint, now: NOW, events: [
      make('2026-10-02T00:00:00Z', 'ask-private', 'bug', { to: 'Private Person', text: 'private words' }),
      move('2026-10-02T01:00:00Z', 'ask-private', 'drafted', { link: 'https://chat.example/private', ref: 'private-ref', by: 'conductor' }),
      move('2026-10-02T02:00:00Z', 'ask-private', 'draft-failed', { error: 'private failure' }),
      move('2026-10-02T03:00:00Z', 'ask-private', 'sent'),
      move('2026-10-02T04:00:00Z', 'ask-private', 'answered', { reply: 'private reply' }),
    ] });
    for (const copy of [toShareState(full), toReportState(full)]) {
      expect(copy.asks).toEqual([]);
      expect(copy.messenger).toBeUndefined();
      expect(JSON.stringify(copy)).not.toMatch(/private|chat\.example|marked/i);
    }
  });
});

describe('people + slack', () => {
  test('a person resolves to one entry or the command stops', () => {
    const people = [{ name: 'Robin Dev', lang: 'es' as const }, { name: 'Kim Carter', lang: 'en' as const, aliases: ['Kimberly'] }];
    expect(resolvePerson(people, 'robin').name).toBe('Robin Dev');
    expect(resolvePerson(people, 'Kimberly').name).toBe('Kim Carter');
    expect(() => resolvePerson(people, 'Tom')).toThrow();
  });

  test('slack table: canonical header, no double quotes, no em dash', () => {
    const s = fold({ sprint, now: NOW, events: [], tracker: tracker({ 'DEMO-1': { title: 'Say "hi" — now', priority: 'High', dev: 'Ana', status: 'Ready for QA', tcs: [] } }) });
    const html = slackTableHtml(s);
    expect(html).toContain('<td><b>Ticket</b></td><td><b>Priority</b></td><td><b>Developer</b></td><td><b>Title</b></td><td><b>Status</b></td>');
    expect(html).not.toContain('"');
    expect(html).not.toContain('—');
  });
});

describe('inbox', () => {
  const msg = (at: string, id: string, from: 'owner' | 'claude', text: string, extra: Record<string, unknown> = {}) =>
    ev(at, 'msg', undefined, { id, from, text, ...extra });

  test('a Claude question with options waits on the owner until the owner picks one', () => {
    const q = [msg('2026-10-05T10:00:00Z', 'm1', 'claude', 'Create board 23?', { options: ['Yes', 'No'] })];
    expect(fold({ sprint, now: NOW, events: q }).inbox[0].state).toBe('needs-owner');
    const s = fold({ sprint, now: NOW, events: [...q, msg('2026-10-05T10:05:00Z', 'm2', 'owner', 'Yes', { replyTo: 'm1' })] });
    expect(s.inbox).toHaveLength(1);
    expect(s.inbox[0].replies.map(r => r.text)).toEqual(['Yes']);
    expect(s.inbox[0].state).toBe('needs-claude');
  });

  test('an owner note waits on Claude; a plain Claude reply closes it; a reply to a reply stays in the thread', () => {
    const s = fold({ sprint, now: NOW, events: [
      msg('2026-10-05T09:00:00Z', 'o1', 'owner', 'check DEMO-7430'),
      msg('2026-10-05T09:10:00Z', 'c1', 'claude', 'Done, it is on staging', { replyTo: 'o1' }),
    ] });
    expect(s.inbox[0].state).toBe('done');
    const s2 = fold({ sprint, now: NOW, events: [
      msg('2026-10-05T09:00:00Z', 'o1', 'owner', 'check DEMO-7430'),
      msg('2026-10-05T09:10:00Z', 'c1', 'claude', 'Assign it to you?', { replyTo: 'o1', ask: true }),
      msg('2026-10-05T09:20:00Z', 'o2', 'owner', 'yes', { replyTo: 'c1' }),
    ] });
    expect(s2.inbox).toHaveLength(1);
    expect(s2.inbox[0].replies).toHaveLength(2);
    expect(s2.inbox[0].state).toBe('needs-claude');
  });

  test('inbox messages never reach the share state', () => {
    const s = fold({ sprint, now: NOW, events: [msg('2026-10-05T09:00:00Z', 'o1', 'owner', 'private inbox words')] });
    expect(JSON.stringify(toShareState(s))).not.toContain('private inbox words');
  });
});

describe('untrackedInTest (sprint rows off the board)', () => {
  test('matches the board case-insensitively', () => {
    const onBoard = boardTicketIds([ev('2026-10-16T09:00:00Z', 'scope.add', 'demo-7360')], null, ['demo-7440']);
    const rows = [{ id: 'DEMO-7360', status: 'Ready for QA' }, { id: 'DEMO-7440', status: 'Ready for QA' }, { id: 'DEMO-7460', status: 'Ready for QA' }];
    expect(untrackedInTest(rows, onBoard).map(r => r.id)).toEqual(['DEMO-7460']);
  });

  test('keeps only Ready for QA rows not on the board, in ticket order', () => {
    const rows = [
      { id: 'DEMO-7440', status: 'Ready for QA', title: 'c' },
      { id: 'DEMO-7360', status: 'Ready for QA', qa: 'Someone Else', title: 'a' },
      { id: 'DEMO-7370', status: 'In Progress' },
      { id: 'DEMO-7400', status: 'Ready for QA' },
    ];
    expect(untrackedInTest(rows, new Set(['DEMO-7400'])).map(r => `${r.id}:${r.qa ?? 'blank'}`)).toEqual(['DEMO-7360:Someone Else', 'DEMO-7440:blank']);
  });
});

describe('arrivals (Ready for QA watch)', () => {
  const at = (h: number) => `2026-10-05T${String(h).padStart(2, '0')}:00:00Z`;
  const ids = (events: BoardEvent[], c: TrackerSnapshot) => arrivals(events, c).list.map(x => `${x.id}:${x.state}`);

  test('a ticket at Ready for QA nobody touched is new; other statuses are ignored', () => {
    const r = arrivals([], tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] }, 'DEMO-2': { status: 'In Progress', tcs: [] } }));
    expect(r.list.map(x => x.id)).toEqual(['DEMO-1']);
    expect(r.list[0].state).toBe('new');
    expect(r.searched).toBe(2);
    expect(r.inTest).toBe(1);
  });

  test('a started worker or an arrival launched/skipped closes it', () => {
    const c = tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] }, 'DEMO-2': { status: 'Ready for QA', tcs: [] }, 'DEMO-3': { status: 'Ready for QA', tcs: [] } });
    expect(ids([
      ev(at(1), 'worker', 'DEMO-1', { state: 'running' }),
      ev(at(1), 'arrival', 'DEMO-2', { action: 'launched' }),
      ev(at(1), 'arrival', 'DEMO-3', { action: 'skipped' }),
    ], c)).toEqual([]);
  });

  test('held (by arrival or hold.set) comes back as recheck until launched', () => {
    const c = tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] }, 'DEMO-2': { status: 'Ready for QA', tcs: [] } });
    expect(ids([ev(at(1), 'arrival', 'DEMO-1', { action: 'held', note: 'PR not deployed' }), ev(at(1), 'hold.set', 'DEMO-2', { reason: 'deploy' })], c))
      .toEqual(['DEMO-1:recheck', 'DEMO-2:recheck']);
    expect(arrivals([ev(at(1), 'arrival', 'DEMO-1', { action: 'held', note: 'PR not deployed' })], c).list[0].note).toBe('PR not deployed');
  });

  test('moving back to Ready for QA after it was tested makes it new again (retest)', () => {
    const c = tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] } });
    const tested = [ev(at(1), 'verdict', 'DEMO-1', { verdict: 'FAILED' })];
    expect(ids(tested, c)).toEqual([]);
    const back = { ...ev(at(3), 'tracker', 'DEMO-1', { bucket: 'in_test' }), text: 'Tracker status In Progress -> Ready for QA' };
    expect(ids([...tested, back], c)).toEqual(['DEMO-1:new']);
  });

  test('a move between two statuses of the test bucket after the launch is not a new arrival', () => {
    // The verifier's sequence: the ticket enters the bucket, the conductor launches it, the tracker then
    // moves it Ready for QA -> In Test (both in_test). Only the entry counts, as in the board this was ported from.
    const entered = { ...ev(at(1), 'tracker', 'DEMO-1', { from: 'In Progress', to: 'Ready for QA', fromBucket: 'not_ready', bucket: 'in_test' }), text: 'Tracker status In Progress -> Ready for QA' };
    const launched = [entered, ev(at(2), 'arrival', 'DEMO-1', { action: 'launched' }), ev(at(2), 'worker', 'DEMO-1', { state: 'running' })];
    expect(ids(launched, tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] } }))).toEqual([]);
    const inside = { ...ev(at(3), 'tracker', 'DEMO-1', { from: 'Ready for QA', to: 'In Test', fromBucket: 'in_test', bucket: 'in_test' }), text: 'Tracker status Ready for QA -> In Test' };
    expect(ids([...launched, inside], tracker({ 'DEMO-1': { status: 'In Test', tcs: [] } }))).toEqual([]);
    // Leaving the bucket and entering it again (a retest) is a new arrival.
    const back = { ...ev(at(5), 'tracker', 'DEMO-1', { from: 'In Progress', to: 'Ready for QA', fromBucket: 'not_ready', bucket: 'in_test' }), text: 'Tracker status In Progress -> Ready for QA' };
    expect(ids([...launched, inside, back], tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] } }))).toEqual(['DEMO-1:new']);
  });

  test('a ticket marked out of scope is not proposed', () => {
    expect(ids([ev(at(1), 'scope.remove', 'DEMO-1')], tracker({ 'DEMO-1': { status: 'Ready for QA', tcs: [] } }))).toEqual([]);
  });
});

describe('watch liveness', () => {
  // Local time on purpose: working hours are the owner's clock. 2026-10-15 is a Thursday.
  const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);
  const iso = (d: Date) => d.toISOString();

  test('a fresh pass in working hours is ok; older than 25 min is stale', () => {
    expect(watchLiveness(iso(local(15, 10, 0)), local(15, 10, 20)).state).toBe('ok');
    const w = watchLiveness(iso(local(15, 10, 0)), local(15, 10, 26));
    expect(w.state).toBe('stale');
    expect(w.ageMin).toBe(26);
  });

  test('outside working hours it is neutral, however old (evening, weekend)', () => {
    expect(watchLiveness(iso(local(15, 12, 0)), local(15, 18, 30)).state).toBe('off-hours');
    expect(watchLiveness(iso(local(16, 17, 50)), local(17, 11, 0)).state).toBe('off-hours');
  });

  test('the morning clock starts at 09:00: last night\'s pass is not red until 09:25', () => {
    const lastNight = iso(local(14, 17, 55));
    expect(watchLiveness(lastNight, local(15, 9, 20)).state).toBe('ok');
    expect(watchLiveness(lastNight, local(15, 9, 26)).state).toBe('stale');
  });

  test('a morning with no watch pass for hours turns the board red', () => {
    expect(watchLiveness(iso(local(14, 9, 4)), local(14, 11, 28)).state).toBe('stale');
  });

  test('a board with no pass at all stays neutral', () => {
    expect(watchLiveness(undefined, local(15, 11, 0))).toEqual({ state: 'never', ageMin: null });
  });

  test('fold exposes the newest pass and keeps passes off the timeline', () => {
    const s = fold({ sprint, now: NOW, events: [
      ev('2026-10-05T09:10:00Z', 'watch.pass', undefined, { new: 0 }),
      ev('2026-10-05T09:00:00Z', 'watch.pass', undefined),
      ev('2026-10-05T09:05:00Z', 'note', 'DEMO-1'),
    ] });
    expect(s.watch).toEqual({ lastPassAt: '2026-10-05T09:10:00Z', passes: 2 });
    expect(s.timeline.map(x => x.kind)).toEqual(['note']);
    expect(fold({ sprint, now: NOW, events: [] }).watch).toBeUndefined();
    expect(toShareState(s).watch).toBeUndefined();
  });
});

describe('watchers down', () => {
  const exitedAt = '2026-10-17T23:00:00.000Z';
  const after = (ms: number) => new Date(Date.parse(exitedAt) + ms);
  const grace = WATCHER_GRACE_MIN * 60_000;
  const watcher = (over: Partial<WatcherView> = {}): WatcherView => ({ name: 'sentinel', pid: 4242, startedAt: '2026-10-17T22:00:00Z', alive: true, ...over });
  const names = (list: WatcherView[], now: Date) => watchersDown(list, now).map(w => w.name);

  test('a running watcher is never flagged', () => {
    expect(names([watcher(), watcher({ exitedAt })], after(grace * 10))).toEqual([]);
  });

  test('a death without an exit mark is flagged at once, a weekend night included', () => {
    expect(names([watcher({ alive: false }), watcher({ name: 'inbox', alive: false })], after(0))).toEqual(['sentinel', 'inbox']);
  });

  test('a clean exit is quiet for the grace period, then flagged', () => {
    const exited = [watcher({ alive: false, exitedAt })];
    expect(names(exited, after(grace))).toEqual([]);
    expect(names(exited, after(grace + 1))).toEqual(['sentinel']);
  });

  test('an unreadable or future exit time does not excuse a dead watcher', () => {
    expect(names([watcher({ alive: false, exitedAt: 'soon' })], after(0))).toEqual(['sentinel']);
    expect(names([watcher({ alive: false, exitedAt })], after(-1))).toEqual(['sentinel']);
    expect(names([watcher({ alive: false, exitedAt: '2999-01-01T00:00:00Z' })], after(0))).toEqual(['sentinel']);
  });

  test('nothing registered is quiet', () => {
    expect(watchersDown([], after(0))).toEqual([]);
    expect(watchersDown(undefined, after(0))).toEqual([]);
  });

  test('share state and report state carry no watchers', () => {
    const live = { ...fold({ sprint, now: NOW, events: [] }), watchers: [watcher({ alive: false })] };
    expect(fold({ sprint, now: NOW, events: [] }).watchers).toBeUndefined();
    expect(toShareState(live).watchers).toBeUndefined();
    expect(toReportState(live).watchers).toBeUndefined();
  });
});

describe('listen --since', () => {
  const owner = (at: string, kind: BoardEvent['kind'], data?: Record<string, unknown>) => ({ ...ev(at, kind, 'DEMO-7420', data), by: 'owner' });
  const board: BoardEvent[] = [
    { ...ev('2026-10-13T19:00:00Z', 'msg', undefined, { id: 'msg-ask1', from: 'claude' }), by: 'claude' },
    owner('2026-10-13T19:10:00Z', 'need.answer', { text: 'option a' }),
    { ...ev('2026-10-13T19:12:00Z', 'tc', 'DEMO-7420', { tc: 'TC-1', status: 'PASSED' }), by: 'w-420' },
    owner('2026-10-13T19:15:00Z', 'msg', { id: 'msg-o2', from: 'owner', replyTo: 'msg-ask1' }),
  ];

  test('an ISO time resolves as given; a message or event id resolves to that event\'s time', () => {
    expect(sinceCutoff('2026-10-13T19:05:00Z', [board])).toBe('2026-10-13T19:05:00.000Z');
    expect(sinceCutoff('msg-ask1', [[], board])).toBe('2026-10-13T19:00:00Z');
    expect(sinceCutoff(board[2].id, [board])).toBe('2026-10-13T19:12:00Z');
  });

  test('an unknown id or a broken date matches nothing, so the command can stop', () => {
    expect(sinceCutoff('msg-nope', [board])).toBeNull();
    expect(sinceCutoff('2026-13-45', [board])).toBeNull();
  });

  test('an answer given before listen re-armed is replayed; non-owner events are not', () => {
    const got = ownerActionsSince(board, sinceCutoff('msg-ask1', [board])!);
    expect(got.map(e => e.kind)).toEqual(['need.answer', 'msg']);
    expect(ownerActionsSince(board, '2026-10-13T19:10:00Z').map(e => e.kind)).toEqual(['msg']);
  });

  test('the replay prints the same line shape as the live stream', () => {
    expect(listenLine('sprint-23', board[3])).toBe('[sprint-23] msg msg-o2 DEMO-7420 reply-to msg-ask1 by owner: msg');
  });
});

describe('what an agent recorded is not the owner\'s answer', () => {
  const at = (h: number) => `2026-10-05T${String(h).padStart(2, '0')}:00:00Z`;
  const by = (who: string, e: BoardEvent): BoardEvent => ({ ...e, by: who });
  const open = (id: string) => by('worker', ev(at(0), 'need.open', 'DEMO-1', { id, question: id }));
  const answer = (who: string, h: number, id: string, text = who) => by(who, ev(at(h), 'need.answer', 'DEMO-1', { id, text }));
  const close = (h: number, id: string) => by('conductor', ev(at(h), 'need.close', 'DEMO-1', { id }));

  test('the ticket stays in Needs you and the page can still answer it', () => {
    const t = one([open('q1'), answer('conductor', 1, 'q1')]);
    expect(t.lane).toBe('Needs you');
    expect(needTarget(t.needs, 'page', 'DEMO-1', 'q1')).toBe('q1');
    expect(needTarget(t.needs, 'page', 'DEMO-1')).toBe('q1');
    expect(() => needTarget(t.needs, 'answer', 'DEMO-1', 'q1')).toThrow(/not an open question/);
    expect(one([open('q1'), answer('conductor', 1, 'q1'), close(2, 'q1')]).lane).not.toBe('Needs you');
  });

  test('an owner answer is never overwritten by an agent, however the agent dates it', () => {
    const t = one([open('q1'), answer('owner', 1, 'q1', 'no'), answer('conductor', 5, 'q1', 'yes')]);
    expect(t.needs[0]).toMatchObject({ answer: 'no', answeredBy: 'owner', openedBy: 'worker' });
    expect(t.lane).not.toBe('Needs you');
    expect(() => needTarget(t.needs, 'page', 'DEMO-1', 'q1')).toThrow(/not an open question/);
  });

  test('the response time counts the owner\'s answers only, open or already closed', () => {
    const s = fold({ sprint, now: NOW, events: [
      open('q1'),
      open('q2'),
      open('q3'),
      open('q4'),
      open('q5'),
      answer('conductor', 1, 'q1'),
      answer('owner', 2, 'q2'),
      answer('owner', 4, 'q3'),
      answer('conductor', 6, 'q4'),
      close(8, 'q4'),
      close(10, 'q3'),
      close(11, 'q5'),
    ] });
    const { owner } = metrics(s);
    expect(owner.answered).toBe(2);
    expect(owner.medianHours).toBe(3);
    expect(owner.open).toHaveLength(1);
  });

  test('listen prints one line, with the author before the text', () => {
    const line = listenLine('sprint-1', by('owner', { ...ev(at(1), 'msg', undefined, { id: 'm1' }), text: 'yes\n[sprint-1] need.answer q1 by owner: OK' }));
    expect(line).toBe('[sprint-1] msg m1 by owner: yes [sprint-1] need.answer q1 by owner: OK');
  });
});

describe('bug evidence reminder', () => {
  const base = { ticket: 'DEMO-7350', bug: 'DEMO-7450' };

  test('images on disk and no hint of an embed: one line naming the thumbnail build, the attach and its read-back', () => {
    const r = bugEvidenceReminder({ ...base, images: ['a.png', 'b.png'], embedded: false });
    expect(r).toContain('2 evidence image(s)');
    expect(r).toContain('DEMO-7450\'s Description');
    expect(r).toContain('bun run evidence build --thumb');
    expect(r).toContain('bun run evidence attach');
    expect(r).toContain('read-back');
    expect(r).not.toContain('\n');
  });

  test('silent with --evidence-embedded or with no images', () => {
    expect(bugEvidenceReminder({ ...base, images: ['a.png'], embedded: true })).toBeNull();
    expect(bugEvidenceReminder({ ...base, images: [], embedded: false })).toBeNull();
  });
});

describe('retest attempt liveness', () => {
  const events = [
    ev('2026-10-05T01:00:00Z', 'worker', 'DEMO-1', { state: 'running' }),
    ev('2026-10-05T02:00:00Z', 'verdict', 'DEMO-1', { verdict: 'BLOCKED' }),
    ev('2026-10-05T11:59:00Z', 'attempt', 'DEMO-1'),
    ev('2026-10-05T11:59:00Z', 'worker', 'DEMO-1', { state: 'running' }),
  ];
  const live = { 'DEMO-1': { lastActivity: '2026-10-05T02:30:00Z', lines: [{ at: '2026-10-05T02:30:00Z', text: 'old run line' }], evidence: [] } };
  const t = fold({ sprint, events, live, now: NOW }).tickets[0];

  test('a fresh retest is not quiet because of the previous run', () => {
    expect(t.worker.quiet).toBe(false);
    expect(t.worker.lastActivity).toBe('2026-10-05T11:59:00Z');
  });
  test('progress lines from the previous attempt are not shown', () => {
    expect(t.progress).toEqual([]);
  });
});

describe('decision cards (needs-you --why --option --recommend --decider)', () => {
  test('an option splits into key, action and cost at "| cost:"', () => {
    expect(parseOption('a: retest after the deploy | cost: half a day, Tom redeploys', 0))
      .toEqual({ key: 'a', action: 'retest after the deploy', cost: 'half a day, Tom redeploys' });
    expect(parseOption('B: defer TC-3 |cost:none', 1)).toEqual({ key: 'b', action: 'defer TC-3', cost: 'none' });
  });
  test('an option with no key takes its position letter, and no cost stays undefined', () => {
    expect(parseOption('Defer case b', 2)).toEqual({ key: 'c', action: 'Defer case b', cost: undefined });
  });
  test('an empty cost or an empty action stops the command', () => {
    expect(() => parseOption('a: wait | cost:', 0)).toThrow('nothing after it');
    expect(() => parseOption('a:  | cost: 1h', 0)).toThrow('no action');
  });
  test('--recommend must match an option key (case-insensitive)', () => {
    const opts = ['a: wait | cost: 1 day', 'b: defer | cost: needs Kim'];
    expect(decisionOptions(opts, 'B').recommend).toBe('b');
    expect(() => decisionOptions(opts, 'c')).toThrow('matches no option key. Keys: a, b');
    expect(() => decisionOptions([], 'a')).toThrow('needs at least one --option');
    expect(() => decisionOptions(['a: one', 'a: two'])).toThrow('two options use the key "a"');
  });
  test('the fold stores the card; an old need without the fields stays a plain question', () => {
    const t = one([
      ev('2026-10-05T10:00:00Z', 'need.open', 'DEMO-1', { id: 'n1', question: 'Old?', options: ['a: x', 'b: y'] }),
      ev('2026-10-05T10:01:00Z', 'need.open', 'DEMO-1', {
        id: 'n2',
        question: 'Defer TC-3?',
        options: ['a: wait for the deploy | cost: 1 day', 'b: recreate on staging | cost: 20 min, one DB write restored after'],
        blocked: 'TC-3 cannot run',
        why: 'the worker is not on staging',
        recommend: 'a',
        decider: 'Kim Carter',
      }),
    ]);
    const [old, card] = t.needs;
    expect(isDecisionCard(old)).toBe(false);
    expect(isDecisionCard(card)).toBe(true);
    expect(card.choices?.map(c => c.cost)).toEqual(['1 day', '20 min, one DB write restored after']);
    expect(card).toMatchObject({ blocked: 'TC-3 cannot run', why: 'the worker is not on staging', recommend: 'a', decider: 'Kim Carter' });
  });
  test('the needs the board raises itself carry a plain why', () => {
    const t = one([
      ev('2026-10-05T10:00:00Z', 'tc', 'DEMO-1', { tc: 'TC-1', status: 'DEFERRED' }),
      ev('2026-10-05T10:01:00Z', 'worker', 'DEMO-1', { state: 'done' }),
    ]);
    expect(t.needs.map(n => n.id)).toEqual(['deferred-TC-1', 'noverdict-DEMO-1']);
    expect(t.needs.every(n => n.synthetic && (n.why ?? '').length > 20)).toBe(true);
  });
});

describe('evidence with --tc and --outcome', () => {
  test('outcome is a closed set', () => {
    expect(oneOf(EVIDENCE_OUTCOMES, 'FAILED', '--outcome')).toBe('failed');
    expect(() => oneOf(EVIDENCE_OUTCOMES, 'skipped', '--outcome')).toThrow('--outcome must be one of: passed, failed, blocked');
  });
  test('board images keep tc and outcome, a TC-only image takes the TC status, disk-only images are ungrouped', () => {
    const events = [
      ev('2026-10-05T10:00:00Z', 'tc', 'DEMO-1', { tc: 'TC-2', status: 'FAILED' }),
      ev('2026-10-05T10:01:00Z', 'evidence', 'DEMO-1', { path: 'e/a.png', caption: 'ok', tc: 'TC-1', outcome: 'passed' }),
      ev('2026-10-05T10:02:00Z', 'evidence', 'DEMO-1', { path: 'e/b.png', tc: 'TC-2' }),
      ev('2026-10-05T10:03:00Z', 'evidence', 'DEMO-1', { path: 'e/a.png', caption: 'refined' }),
    ];
    const live = { 'DEMO-1': { lines: [], evidence: ['e/a.png', 'e/disk.png'] } };
    const t = fold({ sprint, events, live, now: NOW }).tickets[0];
    expect(t.evidence).toEqual([
      { path: 'e/a.png', caption: 'refined', tc: 'TC-1', outcome: 'passed', source: 'board' },
      { path: 'e/b.png', caption: undefined, tc: 'TC-2', outcome: 'failed', source: 'board' },
      { path: 'e/disk.png', source: 'disk' },
    ]);
  });
});

describe('fixtures (test data found)', () => {
  const events = [
    ev('2026-10-05T09:00:00Z', 'meta', 'DEMO-1', { module: 'returns' }),
    ev('2026-10-05T10:00:00Z', 'fixture', 'DEMO-1', { id: 'fx1', text: 'store 42 has no orders in the last 7 days' }),
    ev('2026-10-05T11:00:00Z', 'fixture', 'DEMO-2', { id: 'fx2', text: 'order 77 has a gift card line', module: 'payments' }),
    ev('2026-10-05T10:30:00Z', 'fixture', 'DEMO-1', { id: 'fx3', text: 'store 43 has 90 days of orders', module: 'returns' }),
  ];
  const s = fold({ sprint, events, now: NOW });

  test('listed newest first, with ticket, module, text and time', () => {
    expect(s.fixtures.map(f => f.id)).toEqual(['fx2', 'fx3', 'fx1']);
    expect(s.fixtures[0]).toMatchObject({ ticket: 'DEMO-2', module: 'payments', text: 'order 77 has a gift card line', at: '2026-10-05T11:00:00Z' });
  });
  test('a fixture without --module takes its ticket\'s module, and --module filters', () => {
    expect(s.fixtures.find(f => f.id === 'fx1')?.module).toBe('returns');
    expect(listFixtures(s.fixtures, 'Returns').map(f => f.id)).toEqual(['fx3', 'fx1']);
    expect(listFixtures(s.fixtures, 'nope')).toEqual([]);
  });
  test('a fixture does not move the ticket\'s lane clock, and never reaches the share copy', () => {
    expect(s.tickets.find(t => t.id === 'DEMO-1')?.laneSince).toBe('2026-10-05T09:00:00Z');
    expect(toShareState(s).fixtures).toEqual([]);
  });
});

describe('needTarget (answer / resolve --id)', () => {
  const need = (id: string, extra: Partial<Need> = {}): Need => ({ id, question: id, blocker: 'decision', options: [], since: NOW, ...extra });

  test('answer --id must name an unanswered need', () => {
    expect(needTarget([need('q1')], 'answer', 'DEMO-1', 'q1')).toBe('q1');
    expect(() => needTarget([need('q1')], 'answer', 'DEMO-1', 'q9')).toThrow(/q9 is not an open question on DEMO-1 \(1 open: q1\)/);
    expect(() => needTarget([need('q1', { answer: 'a' })], 'answer', 'DEMO-1', 'q1')).toThrow(/not an open question/);
  });

  test('answer without --id leaves the pick to the fold', () => {
    expect(needTarget([need('q1'), need('q2')], 'answer', 'DEMO-1')).toBeUndefined();
  });

  test('resolve --id must name a need still on the ticket, answered or not', () => {
    expect(needTarget([need('q1', { answer: 'a' })], 'resolve', 'DEMO-1', 'q1')).toBe('q1');
    expect(() => needTarget([need('q1')], 'resolve', 'DEMO-1', 'need-x')).toThrow(/need-x is not an open question/);
  });

  test('a bare resolve takes the only need, and refuses several or none', () => {
    expect(needTarget([need('q1')], 'resolve', 'DEMO-1')).toBe('q1');
    expect(() => needTarget([need('q1'), need('q2')], 'resolve', 'DEMO-1')).toThrow(/2 open questions \(q1, q2\); pass --id/);
    expect(() => needTarget([], 'resolve', 'DEMO-1')).toThrow(/no open question to close/);
  });

  test('synthetic needs are never targets', () => {
    expect(() => needTarget([need('deferred-TC-1', { synthetic: true })], 'resolve', 'DEMO-1')).toThrow(/no open question/);
  });

  test('fold: an answer with an unknown id answers nothing', () => {
    const t = one([
      ev('2026-10-02T00:00:00Z', 'need.open', 'DEMO-7020', { id: 'q1', question: 'a or b?' }),
      ev('2026-10-02T02:00:00Z', 'need.answer', 'DEMO-7020', { id: 'q-typo', text: 'a' }),
    ]);
    expect(t.needs.find(n => n.id === 'q1')?.answer).toBeUndefined();
    expect(t.lane).toBe('Needs you');
  });
});

describe('evidence artifacts (evidence-artifact DEMO-n <url> [--bug DEMO-m])', () => {
  test('only a claude.ai artifact URL is accepted; one trailing slash is dropped', () => {
    expect(evidenceArtifactUrl('https://claude.ai/artifact/abc123-XY_z')).toBe('https://claude.ai/artifact/abc123-XY_z');
    expect(evidenceArtifactUrl('https://claude.ai/code/artifact/0f8fad5b-d9cb-469f-a165-70867728950e/')).toBe('https://claude.ai/code/artifact/0f8fad5b-d9cb-469f-a165-70867728950e');
    for (const bad of [
      'http://claude.ai/artifact/abc',
      'https://claude.ai/artifact/abc?share=1',
      'https://claude.ai/artifact/abc#x',
      'https://claude.ai/chat/abc',
      'https://evil.example/claude.ai/artifact/abc',
      'https://claude.ai.evil.example/artifact/abc',
      'https://claude.ai/code/artifact/not-a-uuid',
      'javascript:alert(1)',
      '',
    ]) { expect(() => evidenceArtifactUrl(bad)).toThrow('is not an evidence page URL'); }
    // board.evidence.allowed_hosts decides the host; claude.ai keeps its two artifact paths.
    expect(evidenceArtifactUrl('https://evidence.example.com/p/1', ['evidence.example.com'])).toBe('https://evidence.example.com/p/1');
    expect(() => evidenceArtifactUrl('https://claude.ai/artifact/abc', ['evidence.example.com'])).toThrow('is not an evidence page URL');
  });

  test('the newest page per ticket and per bug wins; older ones stay in history; old evidence.page events still count; a bad URL in the log is ignored', () => {
    const s = fold({ sprint, now: NOW, events: [
      ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7090', severity: 'High' }),
      ev('2026-10-03T00:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://claude.ai/artifact/first' }),
      ev('2026-10-04T00:00:00Z', 'evidence.artifact', 'DEMO-1', { url: 'https://claude.ai/artifact/second', title: 'DEMO-1 evidence v2' }),
      ev('2026-10-04T01:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://claude.ai/artifact/bugpage', bug: 'DEMO-7090' }),
      ev('2026-10-04T02:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://example.com/x' }),
    ] });
    const t = s.tickets[0];
    expect(t.evidenceArtifact?.url).toBe('https://claude.ai/artifact/second');
    expect(t.evidenceArtifact?.title).toBe('DEMO-1 evidence v2');
    expect(t.evidenceArtifact?.history.map(h => h.url)).toEqual(['https://claude.ai/artifact/first']);
    expect(t.bugs[0].page?.url).toBe('https://claude.ai/artifact/bugpage');
    expect(s.bugs?.find(b => b.id === 'DEMO-7090')?.page?.url).toBe('https://claude.ai/artifact/bugpage');
  });

  test('a page does not move the ticket\'s lane clock and never reaches the share copy', () => {
    const s = fold({ sprint, now: NOW, events: [
      ev('2026-10-02T00:00:00Z', 'verdict', 'DEMO-1', { verdict: 'PASSED' }),
      ev('2026-10-04T00:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://claude.ai/artifact/p1' }),
    ] });
    expect(s.tickets[0].laneSince).toBe('2026-10-02T00:00:00Z');
    expect(JSON.stringify(toShareState(s))).not.toContain('claude.ai/artifact');
  });

  test('the Slack ticket table ends the Status cell with the page link; the plain twin carries the URL', () => {
    const s = fold({ sprint, now: NOW, events: [
      ev('2026-10-02T00:00:00Z', 'verdict', 'DEMO-1', { verdict: 'PASSED' }),
      ev('2026-10-03T00:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://claude.ai/artifact/p1' }),
    ] });
    expect(slackTableHtml(s)).toContain(', <a href="https://claude.ai/artifact/p1">evidence page</a></td>');
    expect(slackTablePlain(s).split('\n')[1]).toContain('evidence page https://claude.ai/artifact/p1');
  });
});

describe('sprint bugs (the Bugs view rule)', () => {
  const start = '2026-10-01T00:00:00Z';
  const bugTracker = (): TrackerSnapshot => ({
    v: SCHEMA,
    syncedAt: '2026-10-05T00:00:00Z',
    searched: { tickets: 2, tcs: 0, bugs: 3 },
    tickets: {
      'DEMO-1': { title: 'Feature one', status: 'Ready for QA', module: 'files', tcs: [{ id: 'TC-1', status: 'FAILED' }] },
      'DEMO-2': { title: 'Feature two', status: 'QA Approved', module: 'returns', tcs: [{ id: 'TC-2', status: 'PASSED' }] },
    },
    bugs: {
      'DEMO-7090': { title: '[Bug] Open and blocking', status: 'Prioritized', priority: 'High', dev: 'Dana Dev', module: 'files', createdAt: '2026-10-02T00:00:00Z', link: 'https://example.atlassian.net/browse/DEMO-7090' },
      'DEMO-7091': { title: 'Linked to a passed ticket', status: 'Backlog', priority: 'Low', dev: 'Tom Ops', createdAt: '2026-10-03T00:00:00Z' },
      'DEMO-7092': { title: 'Fixed and verified', status: 'QA Approved', priority: 'Medium', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z' },
    },
    discover: {
      at: '2026-10-05T00:00:00Z',
      sprintRows: 40,
      untracked: [],
      bugs: [
        { id: 'DEMO-7092', title: 'Fixed and verified', status: 'QA Approved', createdAt: '2026-10-02T00:00:00Z' },
        { id: 'DEMO-7093', title: 'Filed in the sprint, never linked', status: 'In Progress', priority: 'Critical', dev: 'Lee Dev', module: 'billing', platform: 'web', createdAt: '2026-10-03T12:00:00Z' },
        { id: 'DEMO-7094', title: 'Older bug carried into the sprint', status: 'Ready for QA', createdAt: '2026-09-20T00:00:00Z' },
        { id: 'DEMO-7095', title: 'Closed this sprint', status: 'Cancelled', createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z' },
      ],
    },
  });
  const events = () => [
    ev('2026-10-02T01:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7090', severity: 'Critical' }),
    ev('2026-10-03T01:00:00Z', 'bug.link', 'DEMO-2', { bug: 'DEMO-7091' }),
    ev('2026-10-03T02:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7092' }),
    ev('2026-10-03T03:00:00Z', 'verdict', 'DEMO-2', { verdict: 'PASSED' }),
  ];
  const state = () => fold({ sprint: { ...sprint, startedAt: start }, events: events(), tracker: bugTracker(), now: NOW });

  test('linked bugs plus Bug rows created inside the sprint; an older unlinked row stays out', () => {
    const s = state();
    expect(s.bugs?.map(b => b.id).sort()).toEqual(['DEMO-7090', 'DEMO-7091', 'DEMO-7092', 'DEMO-7093', 'DEMO-7095']);
    expect(s.bugSearch).toEqual({ linked: 3, sprintRows: 40, bugRows: 4, createdInSprint: 3, discoveredAt: '2026-10-05T00:00:00Z' });
    expect(s.bugs?.find(b => b.id === 'DEMO-7092')?.sources).toEqual(['linked', 'sprint']);
    expect(s.bugs?.find(b => b.id === 'DEMO-7093')?.sources).toEqual(['sprint']);
  });

  test('blocking = open and filed against a ticket still not Passed; resolved and closed group together', () => {
    const by = Object.fromEntries((state().bugs ?? []).map(b => [b.id, b]));
    expect(by['DEMO-7090'].group).toBe('blocking');
    expect(by['DEMO-7090'].blocks).toEqual([{ id: 'DEMO-1', title: 'Feature one', lane: 'Failed', stillBlocked: true }]);
    expect(by['DEMO-7091'].group).toBe('not-blocking');
    expect(by['DEMO-7091'].blocks[0].stillBlocked).toBe(false);
    expect(by['DEMO-7093'].group).toBe('not-blocking');
    expect(by['DEMO-7092'].statusClass).toBe('resolved');
    expect(by['DEMO-7092'].group).toBe('resolved');
    expect(by['DEMO-7095'].statusClass).toBe('closed');
    expect(by['DEMO-7095'].group).toBe('resolved');
  });

  test('severity: the worker\'s --severity wins over tracker Priority; fields come from tracker; sorted blocking first', () => {
    const s = state();
    const b90 = s.bugs!.find(b => b.id === 'DEMO-7090')!;
    expect(b90.severity).toBe('Critical');
    expect(b90.priority).toBe('High');
    expect(b90.dev).toBe('Dana Dev');
    expect(b90.link).toBe('https://example.atlassian.net/browse/DEMO-7090');
    expect(s.bugs?.find(b => b.id === 'DEMO-7093')?.platform).toBe('web');
    // a linked bug with no module in tracker takes its ticket's module
    expect(s.bugs?.find(b => b.id === 'DEMO-7091')?.module).toBe('returns');
    expect(s.bugs?.map(b => b.group)).toEqual(['blocking', 'not-blocking', 'not-blocking', 'resolved', 'resolved']);
  });

  test('age counts days open from tracker created time; a resolved bug stops at its last update', () => {
    const by = Object.fromEntries((state().bugs ?? []).map(b => [b.id, b]));
    expect(by['DEMO-7090'].ageDays).toBe(3);
    expect(by['DEMO-7092'].ageDays).toBe(2);
    expect(by['DEMO-7092'].resolvedInSprint).toBe(true);
  });

  test('no discover with bug rows: the sprint part is "not checked", never zero', () => {
    const c = bugTracker();
    delete c.discover!.bugs;
    const s = fold({ sprint: { ...sprint, startedAt: start }, events: events(), tracker: c, now: NOW });
    expect(s.bugSearch?.bugRows).toBeNull();
    expect(s.bugSearch?.createdInSprint).toBeNull();
    expect(s.bugs?.map(b => b.id).sort()).toEqual(['DEMO-7090', 'DEMO-7091', 'DEMO-7092']);
  });

  test('counts by severity, module, status, group, opened and resolved', () => {
    const k = bugCounts(state().bugs ?? []);
    expect(k.total).toBe(5);
    expect(k.byGroup).toEqual({ 'blocking': 1, 'not-blocking': 2, 'resolved': 2 });
    expect(k.byStatus).toEqual({ open: 3, resolved: 1, closed: 1 });
    expect(k.bySeverity.Critical).toBe(2);
    expect(k.byModule.billing).toBe(1);
    expect(k.resolvedInSprint).toBe(2);
  });

  test('bugStatusClass: a fixed bug is still open (QA has not retested); resolved is resolved, discarded is closed', () => {
    expect(bugStatusClass('fixed')).toBe('open');
    expect(bugStatusClass('open')).toBe('open');
    expect(bugStatusClass(undefined)).toBe('open');
    expect(bugStatusClass('resolved')).toBe('resolved');
    expect(bugStatusClass('discarded')).toBe('closed');
  });

  test('metric 4 splits linked bugs by status bucket and module', () => {
    const m = metrics(state());
    expect(m.bugs.total).toBe(3);
    expect(m.bugs.byStatus).toEqual({ open: 2, resolved: 1, closed: 0 });
    // DEMO-7092 has no module in tracker, so it takes the module of DEMO-1, the ticket it was filed against
    expect(m.bugs.byModule).toEqual({ files: 2, returns: 1 });
  });

  test('Slack summary: resolved, still blocking, open not blocking; tracker-linked id, short title, severity, dev, module', () => {
    const s = state();
    const { html, plain } = slackBugSummary(s);
    const lines = plain.split('\n');
    expect(lines[0]).toBe('Sprint 1 bugs: 5 found, 1 still blocking a ticket, 2 open not blocking, 2 resolved');
    expect(lines.indexOf('Resolved (2)')).toBeLessThan(lines.indexOf('Still blocking (1)'));
    expect(lines.indexOf('Still blocking (1)')).toBeLessThan(lines.indexOf('Open, not blocking (2)'));
    expect(plain).toContain('• DEMO-7090 Open and blocking, Critical, Dana Dev, files, blocks DEMO-1 https://example.atlassian.net/browse/DEMO-7090');
    expect(html).toContain('<li><a href="https://example.atlassian.net/browse/DEMO-7090">DEMO-7090</a> Open and blocking, Critical, Dana Dev, files, blocks DEMO-1</li>');
    expect(plain).not.toMatch(/[“”"—–]/);
  });

  test('Slack summary with no bugs says so', () => {
    const s = fold({ sprint, events: [], now: NOW });
    expect(slackBugSummary(s).plain).toBe('Sprint 1 bugs: none found');
  });

  test('shortBugTitle drops the [Bug] prefix and cuts at a word', () => {
    expect(shortBugTitle('[Bug] Short one')).toBe('Short one');
    const long = shortBugTitle(`[Bug] ${'word '.repeat(30)}end`);
    expect(long.length).toBeLessThanOrEqual(83);
    expect(long.endsWith('word...')).toBe(true);
  });
});

describe('groupEvidence (Evidence view accordions)', () => {
  const s = () => fold({ sprint, now: NOW, events: [
    ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-1', { tc: 'TC-2', status: 'PASSED', name: 'Case two' }),
    ev('2026-10-02T00:00:00Z', 'tc', 'DEMO-1', { tc: 'TC-7010', status: 'FAILED' }),
    ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-1', { path: 'a.png', tc: 'TC-7010' }),
    ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-1', { path: 'b.png', tc: 'TC-2' }),
    ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-1', { path: 'c.png' }),
    ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-2', { path: 'd.png', tc: 'TC-5', outcome: 'passed' }),
    ev('2026-10-02T02:00:00Z', 'verdict', 'DEMO-2', { verdict: 'PASSED' }),
    ev('2026-10-02T03:00:00Z', 'evidence.page', 'DEMO-2', { url: 'https://claude.ai/artifact/p2' }),
  ] }).tickets;

  test('one group per ticket, TCs in numeric order, untied images last, counts by outcome', () => {
    const g = groupEvidence(s());
    expect(g.map(x => x.id)).toEqual(['DEMO-1', 'DEMO-2']);
    expect(g[0].tcs.map(t => t.tc)).toEqual(['TC-2', 'TC-7010']);
    expect(g[0].tcs[0].name).toBe('Case two');
    expect(g[0].tcs[1].status).toBe('FAILED');
    expect(g[0].untied.map(e => e.path)).toEqual(['c.png']);
    expect(g[0].counts).toEqual({ passed: 1, failed: 1, blocked: 0, none: 1 });
    expect(g[0].hasDefect).toBe(true);
    expect(g[1].page?.url).toBe('https://claude.ai/artifact/p2');
  });

  test('filters: ticket, outcome, only with a defect, and images the page cannot show', () => {
    expect(groupEvidence(s(), { ticket: 'DEMO-2' }).map(x => x.id)).toEqual(['DEMO-2']);
    expect(groupEvidence(s(), { outcome: 'failed' }).map(x => [x.id, x.total])).toEqual([['DEMO-1', 1]]);
    expect(groupEvidence(s(), { outcome: 'none' })[0].untied.map(e => e.path)).toEqual(['c.png']);
    expect(groupEvidence(s(), { defectOnly: true }).map(x => x.id)).toEqual(['DEMO-1']);
    expect(groupEvidence(s(), {}, p => p !== 'd.png').map(x => x.id)).toEqual(['DEMO-1']);
  });
});

describe('report snapshot', () => {
  const S = 'Sprint 1';
  const tcs = (...st: TcStatusLike[]) => st.map((status, i) => ({ id: `TC-${i + 1}`, status }));
  type TcStatusLike = 'PASSED' | 'FAILED' | 'DEFERRED' | 'NOT RUN' | 'BLOCKED';
  const c: TrackerSnapshot = {
    v: SCHEMA,
    syncedAt: '2026-10-05T00:00:00Z',
    searched: { tickets: 6, tcs: 5, bugs: 2 },
    tickets: {
      'DEMO-1': { sprint: S, status: 'QA Approved', priority: 'Critical', title: 'Signed off', link: 'https://example.atlassian.net/browse/DEMO-1', tcs: tcs('PASSED', 'PASSED', 'DEFERRED') },
      'DEMO-2': { sprint: S, status: 'Ready for QA', priority: 'High', tcs: tcs('PASSED') },
      'DEMO-3': { sprint: S, status: 'In Progress', priority: 'Medium', tcs: [] },
      'DEMO-4': { sprint: S, status: 'Done', priority: 'High', tcs: [] },
      'DEMO-5': { sprint: 'Sprint 2', status: 'Ready for QA', type: 'Bug', tcs: [] },
      'DEMO-6': { sprint: S, status: 'QA Approved', type: 'Bug', priority: 'High', tcs: tcs('PASSED') },
    },
    bugs: {
      'DEMO-7090': { title: 'tracker says Medium', priority: 'Medium', status: 'Backlog', sprint: 'Sprint 2', link: 'https://example.atlassian.net/browse/DEMO-7090' },
      'DEMO-7091': { title: 'No tracker priority', status: 'QA Approved', sprint: S },
    },
    discover: { at: '2026-10-05T00:00:00Z', sprintRows: 6, untracked: [], bugs: [{ id: 'DEMO-6', status: 'QA Approved', priority: 'High', createdAt: '2026-10-02T00:00:00Z' }] },
  };
  const full = fold({ sprint: { ...sprint, closedAt: '2026-10-05T00:00:00Z' }, tracker: c, now: NOW, events: [
    ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7090', severity: 'Low' }),
    ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-2', { bug: 'DEMO-7091', severity: 'Critical' }),
    ev('2026-10-02T00:00:00Z', 'worker', 'DEMO-1', { state: 'running', name: 'w-secret-handle' }),
    ev('2026-10-02T00:00:00Z', 'ask.create', 'DEMO-1', { id: 'ask-x', to: 'Kim', text: 'private words for Kim only', tickets: ['DEMO-1'] }),
    ev('2026-10-02T00:00:00Z', 'wait.open', 'DEMO-1', { person: 'Kim', what: 'secret wait' }),
    ev('2026-10-02T00:00:00Z', 'need.open', 'DEMO-1', { question: 'secret question' }),
    ev('2026-10-02T00:00:00Z', 'hold.set', 'DEMO-2', { reason: 'other', note: 'secret hold' }),
    ev('2026-10-02T00:00:00Z', 'evidence', 'DEMO-1', { path: '.session/x.png', caption: 'secret caption' }),
    ev('2026-10-02T00:00:00Z', 'fixture', 'DEMO-1', { text: 'secret fixture' }),
    ev('2026-10-02T00:00:00Z', 'msg', undefined, { id: 'm1', from: 'owner', text: 'private inbox words' }),
    ev('2026-10-03T00:00:00Z', 'evidence.artifact', 'DEMO-1', { url: 'https://claude.ai/artifact/tk1' }),
    ev('2026-10-03T00:00:00Z', 'tracker', 'DEMO-1', {}),
    { ...ev('2026-10-03T00:00:00Z', 'deferral.ok', 'DEMO-1', { cases: ['TC-3'], pointer: 'owner OK given in session, 2026-10-03 00:00Z' }), by: 'worker' },
  ] });
  const HOSTS = ['example.atlassian.net'];
  const rs = toReportState(full, { stpUrl: 'https://example.atlassian.net/d/_dX#stp', stpHosts: HOSTS });
  const r = rs.report!;

  test('built by allowlist: no drafts, inbox, waits, needs, holds, worker names, fixtures, paths or captions', () => {
    const json = JSON.stringify(rs);
    for (const secret of ['private words', 'private inbox words', 'secret wait', 'secret question', 'secret hold', 'w-secret-handle', 'secret fixture', 'secret caption', '.session/']) { expect(json).not.toContain(secret); }
    expect(rs.mode).toBe('report');
    expect(rs.tickets.find(t => t.id === 'DEMO-1')?.link).toBe('https://example.atlassian.net/browse/DEMO-1');
    expect(rs.tickets.find(t => t.id === 'DEMO-1')?.evidenceArtifact?.url).toBe('https://claude.ai/artifact/tk1');
    expect(r.stpUrl).toBe('https://example.atlassian.net/d/_dX#stp');
  });

  test('tickets: only this sprint counts; tested needs a TC; signed off needs tracker past the gate', () => {
    expect(rs.tickets.map(t => t.id).sort()).toEqual(['DEMO-1', 'DEMO-2', 'DEMO-3', 'DEMO-4', 'DEMO-6']);
    expect(r.excluded).toEqual([{ id: 'DEMO-5', sprint: 'Sprint 2' }]);
    expect(r.tickets).toEqual({ total: 5, tested: 3, signedOff: 2, notFullyTested: 1, notSignedOff: ['DEMO-2'] });
    expect(r.notTested.neverReached.map(x => x.id)).toEqual(['DEMO-3']);
    // One `tested` bucket: the source's split between a done status and the QA gate status is not kept.
    expect(r.notTested.notCounted).toEqual([{ id: 'DEMO-4', title: 'DEMO-4', status: 'Done', note: 'past the QA gate with no test case on record' }]);
  });

  test('cases: totals over tested tickets, pass rate over executed, coverage over all', () => {
    expect(r.tc).toEqual({ 'PASSED': 4, 'FAILED': 0, 'NOT RUN': 0, 'BLOCKED': 0, 'DEFERRED': 1, 'total': 5 });
    expect(r.passRate).toBe(1);
    expect(r.coverage).toBeCloseTo(0.8);
    expect(r.deferred).toEqual([{ tc: 'TC-3', name: undefined, ticket: 'DEMO-1' }]);
  });

  test('bugs: tracker priority first, --severity only when tracker has none; a sprint Bug row under test is not a found bug', () => {
    expect(rs.bugs!.map(b => [b.id, b.severity])).toEqual([['DEMO-7091', 'Critical'], ['DEMO-7090', 'Medium']]);
    expect(r.bugs.fixedIds).toEqual(['DEMO-7091']);
    expect(r.bugs.openIds).toEqual(['DEMO-7090']);
    expect(r.bugs.notFound).toEqual(['DEMO-6']);
    expect(r.bugs.byPriority).toEqual({ Critical: { fixed: 1, open: 0 }, Medium: { fixed: 0, open: 1 } });
    expect(rs.bugs!.find(b => b.id === 'DEMO-7090')?.sprint).toBe('Sprint 2');
    expect(rs.tickets.find(t => t.id === 'DEMO-1')?.bugs[0].severity).toBe('Medium');
  });

  test('burn-up: tickets signed off per day against the report\'s scope', () => {
    expect(r.burnup.at(-1)).toEqual({ day: '2026-10-05', done: 2, scope: 5 });
  });

  test('--stp-url: https on the tracker host (issue_tracker.atlassian_url), anything else stops', () => {
    expect(stpUrl('https://example.atlassian.net/browse/DEMO-7#y', HOSTS)).toBe('https://example.atlassian.net/browse/DEMO-7#y');
    for (const bad of ['javascript:alert(1)', 'http://example.atlassian.net/browse/DEMO-7', 'https://evil.example/d/x', 'true']) { expect(() => stpUrl(bad, HOSTS)).toThrow(); }
    expect(() => stpUrl('https://example.atlassian.net/browse/DEMO-7', [])).toThrow();
    expect(toReportState(full, { stpUrl: 'javascript:alert(1)', stpHosts: HOSTS }).report!.stpUrl).toBeUndefined();
  });

  test('a ticket with a verdict and no TCs (an ATR-only retest) counts as tested, like the board\'s Passed lane', () => {
    const atrOnly = fold({ sprint: { ...sprint, closedAt: '2026-10-05T00:00:00Z' }, tracker: c, now: NOW, events: [
      ev('2026-10-03T00:00:00Z', 'verdict', 'DEMO-4', { verdict: 'PASSED', note: 'ATR-only retest' }),
    ] });
    const r = toReportState(atrOnly, {}).report!;
    expect(r.tickets.tested).toBe(rs.report!.tickets.tested + 1);
    expect(r.notTested.notCounted.map(x => x.id)).not.toContain('DEMO-4');
    // Coverage by priority counts tested tickets with the same rule as the headline.
    expect(r.byPriority.reduce((n, x) => n + x.tested, 0)).toBe(r.tickets.tested);
  });
});

describe('shift-right deferral: DEFERRED never reads plain Passed without a recorded owner OK', () => {
  const K = 'DEMO-1';
  const day = (d: number) => `2026-10-0${d}T10:00:00Z`;
  const tc = (d: number, id: string, status: string) => ev(day(d), 'tc', K, { tc: id, status, reason: 'QA decision: external' });
  const verdict = (d: number, v = 'PASSED') => ev(day(d), 'verdict', K, { verdict: v });
  const okFor = (d: number, cases: string[], by = 'worker') => ({ ...ev(day(d), 'deferral.ok', K, { cases, pointer: 'https://example.atlassian.net/browse/DEMO-1' }), by });
  const base = [tc(1, 'TC-1', 'PASSED'), tc(1, 'TC-2', 'DEFERRED'), tc(1, 'TC-3', 'DEFERRED')];
  const state = (events: BoardEvent[], extra: { type?: string, status?: string, label?: string, tcs?: { id: string, status: 'PASSED' | 'DEFERRED' }[] } = {}) => fold({
    sprint,
    now: NOW,
    events,
    deferralLabel: extra.label,
    tracker: extra.type || extra.status || extra.tcs ? tracker({ [K]: { type: extra.type, status: extra.status ?? 'Ready for QA', tcs: extra.tcs ?? [] } }) : undefined,
  });
  const seen = (...args: Parameters<typeof state>) => {
    const t = state(...args).tickets[0];
    return { lane: t.lane, waiting: t.deferral?.waiting, note: deferralNote(t) };
  };

  test('verdict path: uncovered and partly covered are Held, covered is Passed and keeps the mark', () => {
    for (const v of ['PASSED', 'PASSED WITH DEFERRALS']) {
      expect(seen([...base, verdict(2, v)])).toEqual({ lane: 'Held', waiting: ['TC-2', 'TC-3'], note: 'owner-ok' });
      expect(seen([...base, verdict(2, v), okFor(3, ['TC-2'])])).toEqual({ lane: 'Held', waiting: ['TC-3'], note: 'owner-ok' });
      expect(seen([...base, verdict(2, v), okFor(3, ['TC-2', 'TC-3'])])).toEqual({ lane: 'Passed', waiting: [], note: null });
    }
    const t = state([...base, verdict(2), okFor(3, ['TC-2']), okFor(4, ['TC-3'], 'conductor')]).tickets[0];
    expect(t.deferral!.oks!.map(o => [o.by, o.cases, o.at])).toEqual([['worker', ['TC-2'], day(3)], ['conductor', ['TC-3'], day(4)]]);
  });

  test('tracker path: the tested bucket does not pass an uncovered deferral', () => {
    const extra = { status: 'QA Approved', tcs: [{ id: 'TC-1', status: 'PASSED' as const }, { id: 'TC-2', status: 'DEFERRED' as const }] };
    expect(seen([], extra)).toEqual({ lane: 'Held', waiting: ['TC-2'], note: 'owner-ok' });
    expect(seen([okFor(3, ['TC-2'])], extra)).toEqual({ lane: 'Passed', waiting: [], note: null });
  });

  test('a case deferred after the OK, recorded again, or deferred again after leaving is not covered', () => {
    const ok = [...base, verdict(2), okFor(3, ['TC-2', 'TC-3'])];
    expect(seen([...ok, tc(4, 'TC-4', 'DEFERRED')]).waiting).toEqual(['TC-4']);
    expect(seen([...ok, tc(4, 'TC-2', 'DEFERRED')]).waiting).toEqual(['TC-2']);
    expect(seen([...ok, tc(4, 'TC-2', 'PASSED'), tc(5, 'TC-2', 'DEFERRED')]).waiting).toEqual(['TC-2']);
    expect(seen([...ok, ev(day(4), 'deferral.lapse', K, { cases: ['TC-3'] })])).toEqual({ lane: 'Held', waiting: ['TC-3'], note: 'owner-ok' });
  });

  test('an OK written by anyone but the conductor or a worker, or with no pointer, covers nothing', () => {
    for (const by of ['owner', 'sentinel', 'claude']) { expect(seen([...base, verdict(2), okFor(3, ['TC-2', 'TC-3'], by)]).lane).toBe('Held'); }
    const blank = { ...ev(day(3), 'deferral.ok', K, { cases: ['TC-2', 'TC-3'], pointer: ' ' }), by: 'worker' };
    expect(seen([...base, verdict(2), blank]).lane).toBe('Held');
  });

  test('a Bug with a DEFERRED case never reads Passed, OK or not', () => {
    const extra = { type: 'Bug', status: 'QA Approved' };
    for (const events of [[...base, verdict(2)], [...base, verdict(2), okFor(3, ['TC-2', 'TC-3'])], base, [...base, okFor(3, ['TC-2', 'TC-3'])]]) {
      expect([seen(events, extra).lane, seen(events, extra).note]).toEqual(['Held', 'bug']);
    }
  });

  test('Needs you, Running and Failed keep precedence; a case still open is not a wait for the OK', () => {
    expect(seen([...base, verdict(2), ev(day(3), 'need.open', K, { id: 'n1', question: 'defer?' })]).lane).toBe('Needs you');
    expect(seen([...base, ev(day(3), 'worker', K, { state: 'running' })]).lane).toBe('Running');
    expect(seen([...base, tc(2, 'TC-4', 'FAILED'), verdict(3)]).lane).toBe('Failed');
    expect(seen([...base, tc(2, 'TC-4', 'NOT RUN'), verdict(3)])).toMatchObject({ lane: 'Held', note: null });
  });

  test('the BLOCKED verdict of the waiting state reads as waiting; PASSED WITH DEFERRALS with no case does not pass', () => {
    expect(seen([...base, verdict(2, 'BLOCKED')])).toMatchObject({ lane: 'Held', note: 'owner-ok' });
    expect(seen([verdict(2, 'PASSED WITH DEFERRALS')]).lane).toBe('Held');
  });

  test('no count calls a waiting ticket passed; a covered one is counted and named as not fully tested', () => {
    const waiting = state([...base, verdict(2)], { status: 'QA Approved' });
    const m = metrics(waiting);
    expect([m.byLane.Passed, m.byLane.Held, m.verdicts.done, m.firstPass.of, m.notFullyTested, m.burnup.at(-1)!.done]).toEqual([0, 1, 0, 0, 0, 0]);
    const r = toReportState(waiting).report!;
    expect([r.tickets.signedOff, r.tickets.notFullyTested, r.tickets.notSignedOff, r.burnup.at(-1)!.done]).toEqual([0, 0, [K], 0]);

    const covered = state([...base, verdict(2), okFor(3, ['TC-2', 'TC-3'])], { status: 'QA Approved' });
    const c = metrics(covered);
    expect([c.byLane.Passed, c.verdicts.done, c.firstPass.clean, c.notFullyTested]).toEqual([1, 1, 1, 1]);
    expect(toReportState(covered).report!.tickets).toMatchObject({ signedOff: 1, notFullyTested: 1, notSignedOff: [] });
  });

  test('a bug filed against a waiting ticket still blocks it', () => {
    const s = state([...base, verdict(2), ev(day(2), 'bug.link', K, { bug: 'DEMO-7090' })]);
    expect(s.bugs![0].blocks[0].stillBlocked).toBe(true);
  });

  test('Copy for Slack carries the mark, the label when there is one, and never a plain Passed', () => {
    const status = (events: BoardEvent[], extra: Parameters<typeof state>[1] = {}) => slackStatus(state(events, extra).tickets[0]);
    expect(status([...base, verdict(2)])).toBe('🟡 Standby, waiting for owner OK, Not fully tested');
    expect(status([...base, verdict(2), okFor(3, ['TC-2', 'TC-3'])])).toBe('⚠️ Passed 1 of 3, not synced, Not fully tested');
    expect(status([...base, verdict(2)], { label: 'qa-partial' })).toBe('🟡 Standby, waiting for owner OK, qa-partial');
    expect(status([...base, verdict(2)], { type: 'Bug' })).toBe('🟡 Standby, a retest never passes on a deferral, Not fully tested');
    expect(slackTablePlain(state([...base, verdict(2)], { label: 'qa-partial' }))).toContain('qa-partial');
  });

  test('share and report copies carry the mark and the waiting cases, never an OK record', () => {
    const full = state([...base, verdict(2), okFor(3, ['TC-2'])], { label: 'qa-partial' });
    for (const copy of [toShareState(full), toReportState(full)]) {
      expect(copy.tickets[0].deferral).toEqual({ cases: ['TC-2', 'TC-3'], waiting: ['TC-3'], bug: false, label: 'qa-partial' });
      expect(JSON.stringify(copy)).not.toContain('browse/DEMO-1');
    }
  });

  test('deferralOkRecord returns the ids as the ticket spells them', () => {
    const t = state(base).tickets[0];
    expect(deferralOkRecord(t, { cases: ['tc-2', 'TC-2'], pointer: ' http://tracker.example/c/1 ', at: NOW })).toEqual({ cases: ['TC-2'], pointer: 'http://tracker.example/c/1' });
    expect(() => deferralOkRecord(t, { cases: ['TC-1'], pointer: 'https://x.example', at: NOW })).toThrow('shift-right-deferral.md §3');
  });

  test('lapsedDeferrals: a covered case that left DEFERRED in the tracker, or moved after the OK', () => {
    const events = [okFor(3, ['TC-2'])];
    const row = (status: 'PASSED' | 'DEFERRED' | 'NOT RUN', updatedAt: string, id = 'TC-2') => [{ id, status, updatedAt }];
    expect(lapsedDeferrals(events, K, row('DEFERRED', day(2)), row('NOT RUN', day(2)))).toEqual(['TC-2']);
    expect(lapsedDeferrals(events, K, row('NOT RUN', day(2)), row('PASSED', day(4)))).toEqual(['TC-2']);
    expect(lapsedDeferrals(events, K, row('NOT RUN', day(1)), row('DEFERRED', day(2)))).toEqual([]);
    expect(lapsedDeferrals(events, K, row('NOT RUN', day(1)), row('PASSED', day(2)))).toEqual([]);
    expect(lapsedDeferrals(events, K, row('DEFERRED', day(2)), row('DEFERRED', day(4)))).toEqual([]);
    expect(lapsedDeferrals(events, K, row('DEFERRED', day(2), 'TC-9'), row('PASSED', day(4), 'TC-9'))).toEqual([]);
  });
});
