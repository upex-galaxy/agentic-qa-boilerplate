import type { BoardEvent, BoardState, LiveTicket, Sprint, TrackerSnapshot } from '../model.ts';
/**
 * An invented sprint for the tour. Ids start at DEMO-7901 (outside any real
 * range) and every person is tagged "(demo)", so a screenshot of the tour can
 * never be mistaken for real data. It runs through the same fold() as live.
 */
import { fold, SCHEMA } from '../model.ts';

const H = 3_600_000;
let seq = 0;

function ev(at: number, kind: BoardEvent['kind'], ticket: string | undefined, text: string, data?: Record<string, unknown>): BoardEvent {
  return { v: SCHEMA, id: `demo${++seq}`, at: new Date(at).toISOString(), kind, ticket, text, data };
}

export interface Demo {
  state: () => BoardState
  /** Scripted live moves, played through the same fold as real events. */
  moves: Record<'fail' | 'answer' | 'start', () => void>
}

export function makeDemo(now = Date.now()): Demo {
  const start = now - 3 * 24 * H;
  const sprint: Sprint = {
    v: SCHEMA,
    slug: 'sprint-99',
    number: 99,
    name: 'Sprint 99 (demo)',
    env: 'staging',
    qa: 'You',
    startedAt: new Date(start).toISOString(),
    people: [
      { name: 'Ana Ruiz (demo)', role: 'Backend', lang: 'es' },
      { name: 'Marco Diaz (demo)', role: 'Frontend', lang: 'es' },
      { name: 'Lena Park (demo)', role: 'Product', lang: 'en' },
      { name: 'Tom Reyes (demo)', role: 'Tech lead', lang: 'en' },
    ],
  };
  const tc = (id: string, name: string, status: 'PASSED' | 'FAILED' | 'NOT RUN' | 'BLOCKED' | 'DEFERRED', hoursAgo = 30) =>
    ({ id, name, status, updatedAt: new Date(now - hoursAgo * H).toISOString() });
  const tracker: TrackerSnapshot = {
    v: SCHEMA,
    source: 'jira-xray',
    syncedAt: new Date(now - 0.2 * H).toISOString(),
    searched: { tickets: 10, tcs: 36, bugs: 2 },
    tickets: {
      'DEMO-7901': { title: 'Export orders to CSV with the discount line', dev: 'Ana Ruiz (demo)', priority: 'High', type: 'Feature', status: 'QA Approved', bucket: 'tested', tcs: [tc('TC-7001', 'CSV has one row per order', 'PASSED'), tc('TC-7002', 'Discount line is negative', 'PASSED'), tc('TC-7003', 'Totals match the order page', 'PASSED')] },
      'DEMO-7902': { title: 'Newsletter preview shows the featured products first', dev: 'Marco Diaz (demo)', priority: 'Medium', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7010', 'Featured products on top', 'PASSED', 2), tc('TC-7011', 'Order kept after refresh', 'NOT RUN'), tc('TC-7012', 'Empty state', 'NOT RUN')] },
      'DEMO-7903': { title: 'Payout month locks after finalize', dev: 'Ana Ruiz (demo)', priority: 'High', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7020', 'Lock icon appears', 'PASSED', 1), tc('TC-7021', 'Bulk update hidden', 'PASSED', 1), tc('TC-7022', 'API refuses a direct update', 'NOT RUN'), tc('TC-7023', 'Unlock by admin', 'NOT RUN')] },
      'DEMO-7904': { title: 'Returning-customer window per store', dev: 'Tom Reyes (demo)', priority: 'Critical', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7030', 'Default window 365 days', 'PASSED'), tc('TC-7031', 'Window 0 disables returning customers', 'PASSED'), tc('TC-7032', 'Loyalty bonus still paid on return', 'NOT RUN')] },
      'DEMO-7905': { title: 'Weekly sales report sends before results finalize', dev: 'Lena Park (demo)', priority: 'Medium', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7040', 'Send button enabled', 'PASSED'), tc('TC-7041', 'Recipients from store contacts', 'PASSED'), tc('TC-7042', 'Draft label on email', 'DEFERRED')] },
      'DEMO-7906': { title: 'Sales trend chart, 90-day window', dev: 'Marco Diaz (demo)', priority: 'Low', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7050', 'Window selector', 'NOT RUN'), tc('TC-7051', 'Trend matches snapshot', 'NOT RUN')] },
      'DEMO-7907': { title: 'Product search keeps typed text on reload', dev: 'Marco Diaz (demo)', priority: 'High', type: 'Bug', status: 'Ready for QA', bucket: 'in_test', tcs: [] },
      'DEMO-7908': { title: 'Price list import skips blank rows', dev: 'Ana Ruiz (demo)', priority: 'Medium', type: 'Feature', status: 'QA Approved', bucket: 'tested', tcs: [tc('TC-7060', 'Blank rows skipped', 'PASSED'), tc('TC-7061', 'Count shown in toast', 'FAILED'), tc('TC-7062', 'Duplicates flagged', 'NOT RUN')] },
      'DEMO-7909': { title: 'Discount cap on multi-store orders', dev: 'Tom Reyes (demo)', priority: 'High', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7070', 'Cap applied per group', 'PASSED'), tc('TC-7071', 'Cap line label', 'DEFERRED')] },
      'DEMO-7910': { title: 'Gift card balance shows at checkout', dev: 'Lena Park (demo)', priority: 'Medium', type: 'Feature', status: 'Ready for QA', bucket: 'in_test', tcs: [tc('TC-7080', 'Balance is listed', 'PASSED'), tc('TC-7081', 'Expired card is refused', 'DEFERRED')] },
    },
    bugs: { 'DEMO-7990': { title: 'Toast count off by one on import', status: 'Open', bucket: 'open' }, 'DEMO-7991': { title: 'Direct API update ignores the lock', status: 'Open', bucket: 'open' } },
  };

  const events: BoardEvent[] = [ev(start, 'sprint', undefined, 'Sprint 99 (demo) board opened')];
  for (const id of Object.keys(tracker.tickets)) { events.push(ev(start + 0.1 * H, 'scope.add', id, `${id} joined the sprint board`)); }
  events.push(
    ev(start + 4 * H, 'worker', 'DEMO-7901', 'DEMO-7901 worker started', { state: 'running', stage: 'plan' }),
    ev(start + 9 * H, 'verdict', 'DEMO-7901', 'DEMO-7901 PASSED. 3/3 on staging', { verdict: 'PASSED', note: '3/3 on staging' }),
    ev(start + 5 * H, 'worker', 'DEMO-7908', 'DEMO-7908 worker started', { state: 'running', stage: 'plan' }),
    ev(start + 20 * H, 'bug.link', 'DEMO-7908', 'DEMO-7990 filed against DEMO-7908: Toast count off by one on import', { bug: 'DEMO-7990', title: 'Toast count off by one on import', severity: 'Low' }),
    ev(start + 21 * H, 'verdict', 'DEMO-7908', 'DEMO-7908 FAILED. 1 of 3 failed, bug DEMO-7990', { verdict: 'FAILED', note: '1 of 3 failed, bug DEMO-7990' }),
    ev(start + 26 * H, 'worker', 'DEMO-7909', 'DEMO-7909 worker started', { state: 'running', stage: 'plan' }),
    ev(start + 28 * H, 'tc', 'DEMO-7909', 'TC-7071 DEFERRED', { tc: 'TC-7071', status: 'DEFERRED', reason: 'QA decision (demo): only a second store produces this line' }),
    { ...ev(start + 29 * H, 'deferral.ok', 'DEMO-7909', 'DEMO-7909: worker observed an owner OK for TC-7071', { cases: ['TC-7071'], pointer: 'https://example.atlassian.net/browse/DEMO-7909?focusedCommentId=10001' }), by: 'worker' },
    ev(start + 30 * H, 'verdict', 'DEMO-7909', 'DEMO-7909 PASSED WITH DEFERRALS', { verdict: 'PASSED WITH DEFERRALS' }),
    ev(now - 12 * H, 'tc', 'DEMO-7910', 'TC-7081 DEFERRED', { tc: 'TC-7081', status: 'DEFERRED', reason: 'QA decision (demo): only the payment provider issues an expired card' }),
    ev(now - 11 * H, 'verdict', 'DEMO-7910', 'DEMO-7910 BLOCKED. Waiting for owner OK', { verdict: 'BLOCKED', note: 'waiting for owner OK on TC-7081' }),
    ev(now - 11 * H, 'hold.set', 'DEMO-7910', 'DEMO-7910 held: owner OK on TC-7081', { reason: 'other', note: 'owner OK on TC-7081', on: 'You' }),
    ev(now - 40 * H, 'worker', 'DEMO-7904', 'DEMO-7904 worker started', { state: 'running', stage: 'execute' }),
    ev(now - 7 * H, 'need.open', 'DEMO-7904', 'DEMO-7904 needs you: Loyalty bonus on returning customers: pay it or not?', {
      id: 'need-demo1',
      question: 'Loyalty bonus on returning customers: should it still be paid when the store turns returns off?',
      blocker: 'decision',
      options: ['a: pay the bonus (current code) | cost: none now; Lena signs off on the payout', 'b: zero it like the discount | cost: one day of dev, Tom reopens the ticket'],
      blocked: 'TC-7032 (loyalty bonus still paid on return) cannot get a verdict',
      why: 'The acceptance criteria only talk about the discount. The code still pays the bonus, and nobody wrote down which one is right.',
      recommend: 'a',
      decider: 'Lena Park (demo)',
    }),
    ev(now - 6.5 * H, 'fixture', 'DEMO-7904', 'Test data on DEMO-7904: store 9001 has members who bought twice in October', { id: 'fx-demo1', text: 'store 9001 has 4 members with two orders each in October 2024, bonus enabled', module: 'loyalty' }),
    ev(now - 30 * H, 'worker', 'DEMO-7905', 'DEMO-7905 worker started', { state: 'running', stage: 'execute' }),
    ev(now - 26 * H, 'tc', 'DEMO-7905', 'TC-7042 DEFERRED', { tc: 'TC-7042', status: 'DEFERRED' }),
    ev(now - 26 * H, 'worker', 'DEMO-7905', 'DEMO-7905 worker done', { state: 'done' }),
    ev(now - 2 * H, 'worker', 'DEMO-7902', 'DEMO-7902 worker started', { state: 'running', stage: 'execute', name: 'w-9102' }),
    ev(now - 1.5 * H, 'worker', 'DEMO-7903', 'DEMO-7903 worker started', { state: 'running', stage: 'execute', name: 'w-9103' }),
    ev(now - 20 * H, 'hold.set', 'DEMO-7906', 'DEMO-7906 held: waiting for the sync worker deploy on staging', { reason: 'deploy', note: 'sync worker not deployed on staging', on: 'Tom Reyes (demo)' }),
    ev(now - 20 * H, 'wait.open', 'DEMO-7906', 'Waiting on Tom Reyes (demo): redeploy the sync worker', { id: 'wait-demo1', person: 'Tom Reyes (demo)', what: 'redeploy the sync worker on staging' }),
    ev(now - 9 * H, 'wait.open', 'DEMO-7904', 'Waiting on Lena Park (demo): bonus decision', { id: 'wait-demo2', person: 'Lena Park (demo)', what: 'product call on the bonus for returning customers' }),
    ev(now - 6 * H, 'ask.create', 'DEMO-7908', 'Draft for Ana Ruiz (demo) ready', {
      id: 'ask-demo1',
      to: 'Ana Ruiz (demo)',
      lang: 'es',
      kind: 'bug',
      tickets: ['DEMO-7908'],
      text: 'Hola Ana! te cuento cómo va DEMO-7908 (import de listas de precios)\n- casi todo bien, las filas vacías ya se saltan\n- encontré un detalle: el toast dice 11 filas cuando subí 10, lo dejé en DEMO-7990\n- te dejo la captura abajo\nCuando lo tengas avísame y lo vuelvo a probar 🙌',
    }),
    ev(now - 3 * H, 'ask.create', 'DEMO-7901', 'Draft for Ana Ruiz (demo) ready', {
      id: 'ask-demo2',
      to: 'Ana Ruiz (demo)',
      lang: 'es',
      kind: 'good-news',
      tickets: ['DEMO-7901'],
      text: 'Ana, buenas noticias: DEMO-7901 (export CSV) pasó completo en staging\n- 3 de 3 casos bien, la línea del descuento sale negativa como debe\nGracias!',
    }),
    ev(now - 8 * H, 'ask.create', 'DEMO-7904', 'Draft for Lena Park (demo) ready', {
      id: 'ask-demo3',
      to: 'Lena Park (demo)',
      lang: 'en',
      kind: 'decision',
      tickets: ['DEMO-7904'],
      text: 'Hi Lena, quick one on DEMO-7904 (returning-customer window)\n- when a store turns returns off, the code still pays the *loyalty bonus*\n- the AC only talks about the discount\nShould the bonus be zeroed too, or is paying it right?',
    }),
    ev(now - 7.5 * H, 'ask.state', undefined, 'Draft ask-demo3 marked sent', { id: 'ask-demo3', state: 'sent' }),
    { ...ev(now - 0.4 * H, 'sweep.add', 'DEMO-7906', 'Dock: hold DEMO-7906 or defer its cases?', {
      id: 'sw-demo1',
      question: 'The trend chart needs the sync worker, which is not on staging yet. Hold DEMO-7906 or defer its two cases?',
      header: 'Scope',
      context: 'Both cases are NOT RUN. Tom can redeploy the worker tomorrow.',
      options: [
        { key: 'a', label: 'Hold the ticket until the deploy', desc: 'It stays in Held and every watch pass rechecks it.' },
        { key: 'b', label: 'Defer both cases with a reason', desc: 'The ticket stays Held until your OK is recorded, then reads Passed, not fully tested.' },
      ],
      recommend: ['a'],
      multi: false,
      freeText: true,
    }), by: 'conductor' },
    { ...ev(now - 0.2 * H, 'sweep.add', undefined, 'Dock: which checks belong in the retest?', {
      id: 'sw-demo2',
      question: 'Which extra checks belong in the DEMO-7903 retest?',
      header: 'Retest',
      options: [
        { key: 'a', label: 'Direct API update on a locked month', desc: 'The failing case, again.' },
        { key: 'b', label: 'Unlock by admin', desc: 'Not run yet.' },
        { key: 'c', label: 'Lock icon after a page reload', desc: 'Cheap to add.' },
      ],
      recommend: ['a'],
      multi: true,
      freeText: true,
    }), by: 'conductor' },
  );

  const live: Record<string, LiveTicket> = {
    'DEMO-7902': { lastActivity: new Date(now - 34 * 60_000).toISOString(), evidence: [], lines: [
      { at: new Date(now - 2 * H).toISOString(), marker: 'RUNNING', text: 'Stage 2: smoke on staging, Go' },
      { at: new Date(now - 34 * 60_000).toISOString(), marker: 'RUNNING', text: 'TC-7010 PASSED, starting TC-7011 (refresh keeps order)' },
    ] },
    'DEMO-7903': { lastActivity: new Date(now - 3 * 60_000).toISOString(), evidence: [], lines: [
      { at: new Date(now - 80 * 60_000).toISOString(), marker: 'RUNNING', text: 'Stage 2: UI cases on a finalized month' },
      { at: new Date(now - 3 * 60_000).toISOString(), marker: 'RUNNING', text: 'TC-7021 PASSED, trying the API directly (TC-7022)' },
    ] },
  };

  const moves: Demo['moves'] = {
    fail() {
      const t = Date.now();
      events.push(
        ev(t - 2000, 'tc', 'DEMO-7903', 'TC-7022 FAILED: API accepted an update on a locked month', { tc: 'TC-7022', status: 'FAILED' }),
        ev(t - 1000, 'bug.link', 'DEMO-7903', 'DEMO-7991 filed against DEMO-7903: Direct API update ignores the lock', { bug: 'DEMO-7991', title: 'Direct API update ignores the lock', severity: 'High' }),
        ev(t, 'verdict', 'DEMO-7903', 'DEMO-7903 FAILED. API ignores the lock, bug DEMO-7991', { verdict: 'FAILED', note: 'API ignores the lock, bug DEMO-7991' }),
      );
    },
    answer() {
      const t = Date.now();
      events.push(
        ev(t - 1000, 'need.answer', 'DEMO-7904', 'Owner answered on DEMO-7904: b, zero it', { id: 'need-demo1', text: 'b: zero it like the discount (Lena agreed)' }),
        ev(t, 'verdict', 'DEMO-7904', 'DEMO-7904 PASSED after the answer', { verdict: 'PASSED' }),
      );
    },
    start() {
      events.push(ev(Date.now(), 'worker', 'DEMO-7907', 'DEMO-7907 worker started', { state: 'running', stage: 'plan', name: 'w-9107' }));
      live['DEMO-7907'] = { lastActivity: new Date().toISOString(), evidence: [], lines: [{ at: new Date().toISOString(), marker: 'RUNNING', text: 'Stage 1: reading the bug and the fix PR' }] };
    },
  };

  return {
    state: () => fold({ sprint, events, tracker, live, now: new Date().toISOString(), mode: 'demo' }),
    moves,
  };
}
