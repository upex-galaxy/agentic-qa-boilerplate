/**
 * Smoke tests for the page views: render to a string, check what the owner must see.
 * The views are pure (state in, HTML out), so no browser is needed.
 */
import type { BoardEvent, Sprint, TrackerSnapshot } from './model.ts';
import { describe, expect, test } from 'bun:test';
import { askUndo, card, ctxOf, drawer, nextSteps, routeView, viewBugs, viewEvidence, viewMetrics, viewPeople, viewReport, viewTickets, viewTimeline } from './app/views.ts';
import { fold as foldRaw, SCHEMA, toReportState } from './model.ts';
import { bucketed } from './test-fixtures.ts';

const fold = (i: Parameters<typeof foldRaw>[0]) => foldRaw({ ...i, tracker: bucketed(i.tracker) });

const sprint: Sprint = { v: SCHEMA, slug: 'sprint-1', number: 1, name: 'Sprint 1', startedAt: '2026-10-01T00:00:00Z' };
let n = 0;
const ev = (at: string, kind: BoardEvent['kind'], ticket: string, data?: Record<string, unknown>): BoardEvent => ({ v: SCHEMA, id: `v${++n}`, at, kind, ticket, text: kind, data });
const tracker: TrackerSnapshot = {
  v: SCHEMA,
  syncedAt: '2026-10-05T00:00:00Z',
  searched: { tickets: 1, tcs: 2, bugs: 1 },
  tickets: { 'DEMO-1': { title: 'Upload lock', status: 'Ready for QA', module: 'files', tcs: [{ id: 'TC-1', status: 'FAILED', name: 'Lock holds' }, { id: 'TC-2', status: 'PASSED' }] } },
  bugs: { 'DEMO-7090': { title: '[Bug] Reset undoes the lock', status: 'Prioritized', dev: 'Dana Dev', link: 'https://example.atlassian.net/browse/DEMO-7090' } },
  discover: { at: '2026-10-05T00:00:00Z', sprintRows: 12, untracked: [], bugs: [] },
};
const state = fold({ sprint, tracker, now: '2026-10-05T12:00:00Z', events: [
  ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7090', severity: 'Critical' }),
  ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-1', { path: 'e/fail.png', tc: 'TC-1', caption: 'lock gone' }),
  ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-1', { path: 'e/pass.png', tc: 'TC-2' }),
  ev('2026-10-02T02:00:00Z', 'verdict', 'DEMO-1', { verdict: 'FAILED', note: '1 of 2, bug DEMO-7090' }),
  ev('2026-10-02T03:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://claude.ai/artifact/tk1' }),
  ev('2026-10-02T04:00:00Z', 'evidence.page', 'DEMO-1', { url: 'https://claude.ai/artifact/bug90', bug: 'DEMO-7090' }),
] });
const ctx = (extra: Partial<Parameters<typeof ctxOf>[1]> = {}) => ctxOf(state, { filter: '', canWrite: true, img: p => `/files/${p}`, sprints: [], archives: [], ...extra });

describe('views render', () => {
  test('Bugs view: tiles, the bug row with tracker link, blocked ticket, evidence link and the denominator', () => {
    const html = viewBugs(ctx());
    expect(html).toContain('data-copy-bugs');
    expect(html).toContain('href="https://example.atlassian.net/browse/DEMO-7090"');
    expect(html).toContain('still blocked');
    expect(html).toContain('href="https://claude.ai/artifact/bug90"');
    expect(html).toContain('1 linked on this board');
    expect(html).toContain('0 created this sprint, of 0 Bug rows among the 12 sprint rows');
    expect(viewBugs(ctx({ bugGroup: 'resolved' }))).toContain('None.');
  });

  test('Bugs view: sprint bug rows the source left out (status in no bucket) are named on the search line, never counted', () => {
    const withLost = fold({ sprint, tracker: { ...tracker, discover: { ...tracker.discover!, unclassifiedBugs: [{ id: 'DEMO-7095', status: 'Triage', reason: 'status not in a bucket' }] } }, now: '2026-10-05T12:00:00Z', events: [] });
    expect(withLost.bugSearch?.unclassified).toEqual([{ id: 'DEMO-7095', status: 'Triage' }]);
    expect(withLost.bugs?.some(b => b.id === 'DEMO-7095')).toBe(false);
    const html = viewBugs(ctxOf(withLost, { filter: '', canWrite: true, img: p => `/files/${p}`, sprints: [], archives: [] }));
    expect(html).toContain('1 Bug rows not counted (status in no bucket of board.statuses)');
    expect(html).toContain('DEMO-7095 (Triage)');
  });

  test('Evidence view: closed accordions render no thumbnails; an open case renders its images', () => {
    const closed = viewEvidence(ctx());
    expect(closed).toContain('data-acc="DEMO-1"');
    expect(closed).toContain('href="https://claude.ai/artifact/tk1"');
    expect(closed).not.toContain('<img');
    const open = viewEvidence(ctx({ evidenceOpen: new Set(['DEMO-1', 'DEMO-1/TC-1']) }));
    expect(open).toContain('src="/files/e/fail.png"');
    expect(open).not.toContain('src="/files/e/pass.png"');
    expect(viewEvidence(ctx({ evidenceFilter: { outcome: 'blocked' } }))).toContain('Nothing matches this filter.');
  });

  test('drawer: the evidence page link sits in the verdict row; the bug row links its own page', () => {
    const html = drawer(state.tickets[0], ctx());
    expect(html).toMatch(/class="verdict-row"[\s\S]*href="https:\/\/claude\.ai\/artifact\/tk1"/);
    expect(html).toContain('href="https://claude.ai/artifact/bug90"');
    expect(html).not.toContain('No evidence page');
  });

  test('drawer: a tested ticket with no evidence page says so instead of showing nothing', () => {
    const noPage = fold({ sprint, tracker, now: '2026-10-05T12:00:00Z', events: [
      ev('2026-10-02T01:00:00Z', 'evidence', 'DEMO-1', { path: 'e/fail.png', tc: 'TC-1' }),
    ] });
    const html = drawer(noPage.tickets[0], ctxOf(noPage, { filter: '', canWrite: true, img: p => `/files/${p}`, sprints: [], archives: [] }));
    expect(html).toMatch(/class="verdict-row"[\s\S]*class="ev-none"[^>]*>No evidence page</);
  });

  test('Metrics: bug 4 shows the status buckets and the modules', () => {
    const html = viewMetrics(ctx());
    expect(html).toContain('By status');
    expect(html).toContain('files <b>1</b>');
  });
});

describe('the Bugs view never lets tracker text into markup', () => {
  test('a Priority that is not a known severity renders as unrated, escaped', () => {
    const payload = 'x"><img src=x onerror=alert(1)>';
    const hostile = fold({
      sprint,
      tracker: { ...tracker, bugs: { 'DEMO-7091': { title: 'Hostile', status: 'Prioritized', priority: payload } } },
      now: '2026-10-05T12:00:00Z',
      events: [ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7091' })],
    });
    const html = viewBugs(ctxOf(hostile, { filter: '', canWrite: true, img: p => `/files/${p}`, sprints: [], archives: [] }));
    expect(html).toContain('sev sev-unrated');
    expect(html).not.toContain('<img src=x');
  });
});

describe('the sprint report', () => {
  const S = 'Sprint 1';
  const hostile = 'x"><img src=x onerror=alert(1)>';
  const rc: TrackerSnapshot = {
    ...tracker,
    tickets: {
      'DEMO-1': { title: 'Upload lock', sprint: S, status: 'QA Approved', priority: 'Critical', link: 'https://example.atlassian.net/browse/DEMO-1', tcs: [{ id: 'TC-1', status: 'PASSED', name: 'Lock holds' }, { id: 'TC-2', status: 'DEFERRED' }] },
      'DEMO-2': { title: hostile, sprint: S, status: 'In Progress', priority: hostile, link: 'javascript:alert(1)', tcs: [] },
    },
    bugs: { 'DEMO-7090': { title: '[Bug] Reset undoes the lock', status: 'QA Approved', priority: 'Medium', sprint: S, dev: 'Dana Dev', link: 'https://example.atlassian.net/browse/DEMO-7090' } },
  };
  const full = fold({ sprint: { ...sprint, closedAt: '2026-10-05T00:00:00Z' }, tracker: rc, now: '2026-10-05T12:00:00Z', events: [
    ev('2026-10-02T00:00:00Z', 'bug.link', 'DEMO-1', { bug: 'DEMO-7090', severity: 'Low' }),
    ev('2026-10-02T03:00:00Z', 'evidence.artifact', 'DEMO-1', { url: 'https://claude.ai/artifact/tk1' }),
  ] });
  const rs = toReportState(full, { stpUrl: 'https://example.atlassian.net/d/_dX#stp', stpHosts: ['example.atlassian.net'] });
  const rctx = ctxOf(rs, { filter: '', canWrite: false, img: () => null, sprints: [], archives: [] });

  test('Report view: header verdict, four KPI tiles, panels, tables and the STP footer link', () => {
    const html = viewReport(rctx);
    expect(html).toContain('Sprint 1 QA report');
    // The board's start is when QA tracking began, not the tracker sprint start, so a closed report shows only the close date.
    expect(html).toContain('Closed Oct 5, 2026');
    expect(html).not.toContain('Oct 1 to');
    expect(html).toContain('1 of 1 tested tickets signed off · 1 of 2 test cases passed · 0 failed');
    expect(html.match(/class="rkpi s-/g)).toHaveLength(4);
    expect(html).toContain('Bugs by priority');
    expect(html).toContain('Coverage by priority');
    expect(html).toContain('Fixed and retested in the sprint');
    expect(html).toContain('Deferred cases');
    expect(html).toContain('Never reached the test environment');
    expect(html).toContain('href="https://claude.ai/artifact/tk1"');
    expect(html).toContain('href="https://example.atlassian.net/browse/DEMO-1"');
    expect(html).toContain('href="https://example.atlassian.net/d/_dX#stp"');
  });

  test('tracker text never becomes markup: titles escaped, priority class clamped, a non-https link is no anchor', () => {
    const html = viewReport(rctx);
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('javascript:');
    expect(html).not.toMatch(/class="sev sev-x/);
  });

  test('report mode reaches only Report, Tickets, Bugs, Timeline; the board never reaches Report', () => {
    for (const h of ['', 'now', 'metrics', 'people', 'evidence', 'history', 'nope']) { expect(routeView(h, 'report')).toBe('report'); }
    for (const h of ['tickets', 'bugs', 'timeline'] as const) { expect(routeView(h, 'report')).toBe(h); }
    expect(routeView('report', 'live')).toBe('now');
    expect(routeView('report', 'share')).toBe('now');
    expect(routeView('bugs', 'share')).toBe('now');
    expect(routeView('metrics', 'live')).toBe('metrics');
  });

  test('Tickets, Bugs and Timeline render from report state, without the Copy for Slack buttons', () => {
    const t = viewTickets(rctx);
    expect(t).toContain('DEMO-1');
    expect(t).not.toContain('data-copy-slack');
    const b = viewBugs(rctx);
    expect(b).toContain('DEMO-7090');
    expect(b).not.toContain('data-copy-bugs');
    expect(() => viewTimeline(rctx)).not.toThrow();
    expect(viewReport({ ...rctx, state: { ...rs, report: undefined } })).toContain('snapshot --mode report');
  });
});

describe('ask cards', () => {
  const ask = (...moves: [string, Record<string, unknown>?][]) => [
    ev('2026-10-02T00:00:00Z', 'ask.create', 'DEMO-1', { id: 'ask-a', to: 'Kim', kind: 'bug', text: 'a message', tickets: ['DEMO-1'] }),
    ...moves.map(([state, extra], i) => ev(`2026-10-03T0${i}:00:00Z`, 'ask.state', 'DEMO-1', { id: 'ask-a', state, ...extra })),
  ];
  const page = (events: BoardEvent[], opts: { messenger?: string, canWrite?: boolean } = {}) => {
    const s = { ...fold({ sprint, now: '2026-10-05T12:00:00Z', events }), messenger: opts.messenger };
    return ctxOf(s, { filter: '', canWrite: opts.canWrite ?? true, img: () => null, sprints: [], archives: [] });
  };
  const primaries = (html: string) => [...html.matchAll(/<button class="btn primary"[^>]*>([^<]*)</g)].map(m => m[1]);

  test('a draft with no messenger offers Mark sent and Copy, never an approval', () => {
    const html = viewPeople(page(ask()));
    expect(primaries(html)).toEqual(['Mark sent']);
    expect(html).toContain('data-ask-action="sent"');
    expect(html).toContain('data-copy-ask="ask-a"');
    expect(html).not.toContain('data-ask-action="approve"');
    expect(html).toContain('To send · draft');
    expect(html).not.toContain('draft-history');
  });

  test('a draft with a messenger offers the approval', () => {
    const html = viewPeople(page(ask(), { messenger: 'fake' }));
    expect(primaries(html)).toEqual(['Create draft']);
    expect(html).toContain('To approve · draft');
  });

  test('each state offers one primary action, and the history says who moved it', () => {
    const sent = viewPeople(page(ask(['sent'])));
    expect(primaries(sent)).toEqual(['They answered']);
    expect(sent).toContain('data-ask-action="close"');
    expect(sent).toContain('Waiting reply · sent');
    expect(sent).toContain('<ol class="draft-history"><li><b>draft</b>');
    const answered = viewPeople(page(ask(['sent'], ['answered', { reply: 'fixed <today>' }])));
    expect(primaries(answered)).toEqual(['Close']);
    expect(answered).toContain('fixed &lt;today&gt;');
    expect(primaries(viewPeople(page(ask(['sent'], ['closed']))))).toEqual(['Reopen']);
    expect(primaries(viewPeople(page(ask(['dropped']))))).toEqual(['Back to draft']);
    expect(primaries(viewPeople(page(ask(['approved']))))).toEqual(['Back to draft']);
    expect(primaries(viewPeople(page(ask(['approved']), { messenger: 'fake' })))).toEqual(['Copy message']);
  });

  test('a read-only page keeps Copy and offers no action', () => {
    const html = viewPeople(page(ask(['sent']), { canWrite: false }));
    expect(primaries(html)).toEqual(['Copy message']);
    expect(html).not.toContain('data-ask-id');
  });

  test('your next steps name what each ask waits on', () => {
    const steps = (c: ReturnType<typeof page>) => nextSteps(c).map(s => s.html).join('');
    expect(steps(page(ask()))).toContain('Send to Kim');
    expect(steps(page(ask(), { messenger: 'fake' }))).toContain('Approve the message to Kim');
    expect(steps(page(ask(['sent'], ['answered'])))).toContain('Read the reply from Kim');
    expect(steps(page(ask(['sent'])))).not.toContain('Kim</a>');
  });

  test('Undo is offered only when the page can write the previous state back', () => {
    expect(askUndo({ from: 'draft', state: 'sent' }, false)).toBe('draft');
    expect(askUndo({ from: 'answered', state: 'closed' }, false)).toBe('answered');
    expect(askUndo({ from: 'draft-failed', state: 'sent' }, true)).toBeNull();
    expect(askUndo({ from: 'approved', state: 'dropped' }, false)).toBeNull();
    expect(askUndo({ from: 'dropped', state: 'draft' }, false)).toBe('dropped');
    expect(askUndo({ from: 'closed', state: 'sent' }, false)).toBe('closed');
  });
});

describe('a question an agent answered', () => {
  const rendered = (by: string) => {
    const s = fold({ sprint, now: '2026-10-05T12:00:00Z', events: [
      ev('2026-10-02T00:00:00Z', 'need.open', 'DEMO-1', { id: 'need-a', question: 'defer?' }),
      { ...ev('2026-10-02T01:00:00Z', 'need.answer', 'DEMO-1', { id: 'need-a', text: 'yes' }), by },
    ] });
    const c = ctxOf(s, { filter: '', canWrite: true, img: p => p, sprints: [], archives: [] });
    return { drawer: drawer(s.tickets[0], c), card: card(s.tickets[0], c), steps: nextSteps(c).map(x => x.html).join('') };
  };

  test('is still offered on the card and the drawer, naming who recorded the answer', () => {
    const v = rendered('conductor');
    expect(v.drawer).toContain('data-answer="DEMO-1" data-need="need-a"');
    for (const html of [v.drawer, v.card, v.steps]) { expect(html).toContain('answer recorded by conductor'); }
    expect(v.drawer).not.toContain('Your answers');
  });

  test('the owner\'s own answer closes it', () => {
    const v = rendered('owner');
    expect(v.drawer).not.toContain('data-answer=');
    expect(v.drawer).toContain('Your answers');
    expect(v.steps).not.toContain('defer?');
  });
});
