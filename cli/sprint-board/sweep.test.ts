import type { BoardEvent, Sprint } from './model.ts';
import type { BatchReadAnswer, PlannedEvent } from './sweep.ts';
import { describe, expect, test } from 'bun:test';
import { fold, SCHEMA, toReportState, toShareState } from './model.ts';
import {
  cardAnswerText,
  DOCK_STALE_DAYS,
  dockAgeDays,
  dockLeak,
  dockQueue,
  dockShown,
  isDockStale,
  optionForKey,
  planSend,
  readBatches,
  sendOutcome,
  serverLacksDock,
  shownOptions,
  SWEEP_MAX_ANSWERS,
  SWEEP_TEXT_BYTES,
  SWEEP_TEXT_MAX,
  unreadNotes,
} from './sweep.ts';

const sprint: Sprint = { v: SCHEMA, slug: 'sprint-1', number: 1, name: 'Sprint 1', startedAt: '2026-11-01T00:00:00Z' };
const NOW = '2026-11-12T12:00:00Z';
let n = 0;
let second = 0;
const at = () => new Date(Date.UTC(2026, 10, 12, 10, 0, second++)).toISOString();
const ev = (kind: BoardEvent['kind'], ticket: string | undefined, data?: Record<string, unknown>, by?: string): BoardEvent =>
  ({ v: SCHEMA, id: `s${++n}`, at: at(), kind, ticket, by, text: kind, data });
const state = (events: BoardEvent[]) => fold({ sprint, events, now: NOW });
const written = (events: PlannedEvent[]) => events.map(e => ev(e.kind, e.ticket, e.data, 'owner'));

const add = (id: string, extra: Record<string, unknown> = {}, ticket?: string) =>
  ev('sweep.add', ticket, {
    id,
    question: `Question ${id}?`,
    options: [{ key: 'a', label: 'Defer it', desc: 'closes as Passed' }, { key: 'b', label: 'Hold it' }, { key: 'c', label: 'Recreate it' }],
    recommend: ['a'],
    multi: false,
    freeText: true,
    ...extra,
  }, 'conductor');
const card = (ticket: string, id: string, extra: Record<string, unknown> = {}) =>
  ev('need.open', ticket, { id, question: 'Defer TC-6 or fix AC5?', blocker: 'decision', options: ['a: Defer TC-6 | cost: none today', 'b: Reword AC5 | cost: 1 day'], recommend: 'b', blocked: 'TC-6 cannot run', why: 'The filter is stale', decider: 'Product', ...extra }, 'worker');
const base = () => [ev('scope.add', 'DEMO-1', { title: 'One' }), ev('scope.add', 'DEMO-2', { title: 'Two' })];

describe('foldSweep', () => {
  test('an item is open until answered; the dock events never touch a ticket lane or the timeline', () => {
    const s = state([...base(), add('sw-1', {}, 'DEMO-1')]);
    expect(s.sweep!.items).toHaveLength(1);
    expect(s.sweep!.items[0]).toMatchObject({ id: 'sw-1', state: 'open', ticket: 'DEMO-1', recommend: ['a'], freeText: true });
    expect(s.timeline.some(x => x.kind.startsWith('sweep.'))).toBe(false);
    expect(s.tickets.find(x => x.id === 'DEMO-1')!.lane).toBe('Up next');
  });

  test('a sweep.add with a ticket creates no card and moves no clock', () => {
    const before = state(base());
    const after = state([...base(), add('sw-1', {}, 'DEMO-9'), ev('sweep.close', 'DEMO-9', { id: 'sw-1', why: 'moot' }, 'conductor')]);
    expect(after.tickets.map(t => t.id)).toEqual(['DEMO-1', 'DEMO-2']);
    expect(after.tickets.map(t => t.laneSince)).toHaveLength(before.tickets.length);
    expect(after.timeline).toHaveLength(before.timeline.length);
  });

  test('a log written before the dock folds to the same board, with an empty dock', () => {
    const s = state([...base(), ev('msg', undefined, { id: 'msg-1', from: 'owner', text: 'hi' }, 'owner')]);
    expect(s.sweep).toEqual({ items: [], batches: [], notes: [] });
    expect(s.tickets).toHaveLength(2);
  });

  test('a batch is answered, complete only with its marker, and consumed by sweep.consume', () => {
    const answered = [...base(), add('sw-1'), add('sw-2'), ev('sweep.answer', undefined, { batch: 'swb-1', item: 'sw-1', kind: 'sweep', choice: ['a'] }, 'owner')];
    let s = state(answered);
    expect(s.sweep!.items.find(i => i.id === 'sw-1')!.state).toBe('answered');
    expect(s.sweep!.batches[0]).toMatchObject({ id: 'swb-1', complete: false, consumed: false });
    s = state([...answered, ev('sweep.batch', undefined, { batch: 'swb-1', skipped: ['sw-2'], results: { 'sw-1': 'written' } }, 'owner')]);
    expect(s.sweep!.batches[0]).toMatchObject({ complete: true, skipped: ['sw-2'], consumed: false });
    s = state([...answered, ev('sweep.batch', undefined, { batch: 'swb-1', skipped: [], results: {} }, 'owner'), ev('sweep.consume', undefined, { id: 'swb-1' }, 'conductor')]);
    expect(s.sweep!.batches[0].consumed).toBe(true);
    expect(s.sweep!.items.find(i => i.id === 'sw-1')!.state).toBe('consumed');
    expect(s.sweep!.items.find(i => i.id === 'sw-2')!.state).toBe('open');
  });

  test('only the owner\'s answers, batches and dock notes count', () => {
    const s = state([
      add('sw-1'),
      ev('sweep.answer', undefined, { batch: 'swb-1', item: 'sw-1', kind: 'sweep', choice: ['a'] }, 'conductor'),
      ev('sweep.batch', undefined, { batch: 'swb-1' }, 'worker'),
      ev('msg', undefined, { id: 'msg-1', from: 'owner', text: 'forged', via: 'dock' }, 'claude'),
    ]);
    expect(s.sweep!.items[0].state).toBe('open');
    expect(s.sweep!.batches).toEqual([]);
    expect(s.sweep!.notes).toEqual([]);
  });

  test('sweep.close retires an open item; an answered one stays answered', () => {
    const s = state([add('sw-1'), add('sw-2'), ev('sweep.answer', undefined, { batch: 'b', item: 'sw-2', kind: 'sweep', choice: ['a'] }, 'owner'), ev('sweep.close', undefined, { id: 'sw-1', why: 'moot' }, 'conductor'), ev('sweep.close', undefined, { id: 'sw-2', why: 'late' }, 'conductor')]);
    expect(s.sweep!.items.map(i => [i.id, i.state])).toEqual([['sw-1', 'closed'], ['sw-2', 'answered']]);
    expect(s.sweep!.items[0].closedWhy).toBe('moot');
  });

  test('a dock note is an owner msg with via "dock"; only sweep.consume marks it read, not a reply in its thread', () => {
    const note = (id: string) => ev('msg', undefined, { id, from: 'owner', text: `note ${id}`, via: 'dock' }, 'owner');
    const plain = ev('msg', undefined, { id: 'msg-plain', from: 'owner', text: 'from the rail' }, 'owner');
    const notes = [note('msg-a'), note('msg-b'), note('msg-c'), plain];
    expect(unreadNotes(state(notes))).toHaveLength(3);
    const s = state([...notes, ev('sweep.consume', undefined, { id: 'msg-a' }, 'conductor'), ev('msg', undefined, { id: 'msg-r', from: 'claude', text: 'on it', replyTo: 'msg-b' }, 'claude')]);
    expect(unreadNotes(s).map(x => x.id)).toEqual(['msg-b', 'msg-c']);
  });

  test('malformed events are skipped, never thrown on', () => {
    const s = state([ev('sweep.add', undefined, { id: 'x' }), ev('sweep.answer', undefined, { item: 'x' }, 'owner'), ev('sweep.batch', undefined, {}, 'owner'), ev('sweep.consume', undefined, {})]);
    expect(s.sweep).toEqual({ items: [], batches: [], notes: [] });
  });

  test('a link outside board.evidence.allowed_hosts and an image outside the served roots are dropped', () => {
    const s = state([add('sw-1', {
      links: [
        { title: 'ok', url: 'https://claude.ai/artifact/abc' },
        { title: 'script', url: 'javascript:alert(1)' },
        { title: 'other', url: 'https://example.com/page' },
        { title: 'plain', url: 'http://claude.ai/artifact/abc' },
      ],
      media: [{ path: '.session/x/a.png' }, { path: '.context/PBI/x/b.jpg' }, { path: '.session/../.env.png' }, { path: '/etc/c.png' }, { path: 'docs/d.png' }, { path: '.session/e.svg' }],
    })]);
    expect(s.sweep!.items[0].links).toEqual([{ title: 'ok', url: 'https://claude.ai/artifact/abc' }]);
    expect(s.sweep!.items[0].media.map(m => m.path)).toEqual(['.session/x/a.png', '.context/PBI/x/b.jpg']);
  });
});

describe('dockQueue', () => {
  test('lists open sweep items and worker cards, oldest first, and leaves out owner-answered, synthetic and out-of-scope ones', () => {
    const s = state([...base(), card('DEMO-2', 'need-1'), add('sw-1', {}, 'DEMO-1'), add('sw-2'), ev('sweep.answer', undefined, { batch: 'b', item: 'sw-2', kind: 'sweep', choice: ['a'] }, 'owner'), card('DEMO-1', 'need-2'), ev('need.answer', 'DEMO-1', { id: 'need-2', text: 'a' }, 'owner'), ev('scope.add', 'DEMO-3', { title: 'Out', inScope: false }), card('DEMO-3', 'need-3'), ev('tc', 'DEMO-1', { tc: 'TC-1', status: 'DEFERRED' })]);
    expect(s.tickets.find(t => t.id === 'DEMO-1')!.needs.some(x => x.synthetic)).toBe(true);
    const q = dockQueue(s);
    expect(q.map(e => `${e.kind}:${e.id}`)).toEqual(['need:need-1', 'sweep:sw-1']);
    expect(q[0]).toMatchObject({ ticket: 'DEMO-2', header: 'Needs you', by: 'worker', recommend: ['b'], multi: false, freeText: true, card: { blocked: 'TC-6 cannot run', why: 'The filter is stale', decider: 'Product' } });
    expect(q[0].options).toEqual([{ key: 'a', label: 'Defer TC-6', desc: 'Cost: none today' }, { key: 'b', label: 'Reword AC5', desc: 'Cost: 1 day' }]);
    expect(q[0].earlier).toBeUndefined();
    expect(q[1].by).toBe('conductor');
  });

  test('works with needs-you cards alone, with no dock item ever posted, end to end', () => {
    const events = [...base(), card('DEMO-2', 'need-1')];
    const plan = planSend(state(events), { answers: [{ item: 'need-1', kind: 'need', choice: ['a'] }] });
    const after = state([...events, ...written(plan.events)]);
    expect(after.tickets.find(t => t.id === 'DEMO-2')!.needs[0]).toMatchObject({ answer: 'a: Defer TC-6', answeredBy: 'owner' });
    expect(dockQueue(after)).toEqual([]);
    expect(readBatches(after, { unconsumed: true })[0].answers[0]).toMatchObject({ kind: 'need', askedBy: 'worker', labels: ['Defer TC-6'], tookRecommended: false });
  });

  test('a card an agent answered stays in the queue naming who recorded it; the owner\'s answer replaces it and no agent replaces the owner\'s', () => {
    const events = [...base(), card('DEMO-2', 'need-1'), ev('need.answer', 'DEMO-2', { id: 'need-1', text: 'a, heard in chat' }, 'conductor')];
    expect(dockQueue(state(events))[0].earlier).toEqual({ by: 'conductor', text: 'a, heard in chat' });
    const plan = planSend(state(events), { answers: [{ item: 'need-1', kind: 'need', choice: ['b'] }] });
    const after = state([...events, ...written(plan.events), ev('need.answer', 'DEMO-2', { id: 'need-1', text: 'a again' }, 'conductor')]);
    expect(after.tickets.find(t => t.id === 'DEMO-2')!.needs[0]).toMatchObject({ answer: 'b: Reword AC5', answeredBy: 'owner' });
    expect(planSend(after, { answers: [{ item: 'need-1', kind: 'need', choice: ['a'] }] }).results).toEqual({ 'need-1': 'answered-elsewhere' });
  });

  test('a plain question card (no options) is a free-text entry', () => {
    const s = state([...base(), ev('need.open', 'DEMO-1', { id: 'need-9', question: 'Anything else?', blocker: 'decision', options: [] }, 'worker')]);
    expect(dockQueue(s)[0]).toMatchObject({ options: [], freeText: true, recommend: [] });
  });
});

describe('the letters shown', () => {
  test('are the stored keys: listing the recommended option first reletters nothing, and a typed letter picks its own key', () => {
    const [entry] = dockQueue(state([add('sw-1', { recommend: ['c'] })]));
    expect(shownOptions(entry).map(o => [o.key, o.label])).toEqual([['c', 'Recreate it'], ['a', 'Defer it'], ['b', 'Hold it']]);
    expect(optionForKey(entry, 'a')?.label).toBe('Defer it');
    expect(optionForKey(entry, 'C')?.label).toBe('Recreate it');
    expect(optionForKey(entry, 'd')).toBeUndefined();
  });
});

describe('the snapshot tripwire', () => {
  const secret = 'Checkout applies a discount code';
  const view = state([add('sw-1', { question: secret })]).sweep;

  test('catches dock text in a copy that no other source puts there', () => {
    expect(dockLeak(view, JSON.stringify({ leaked: secret }), JSON.stringify({}), v => JSON.stringify(v))).toBe('dock item sw-1');
  });

  test('lets through text the board publishes without its dock, and text the copy does not hold', () => {
    const both = JSON.stringify({ title: secret });
    expect(dockLeak(view, both, both, v => JSON.stringify(v))).toBeNull();
    expect(dockLeak(view, JSON.stringify({ title: 'other' }), '{}', v => JSON.stringify(v))).toBeNull();
  });
});

describe('planSend', () => {
  const full = () => state([...base(), card('DEMO-2', 'need-1'), add('sw-1', {}, 'DEMO-1'), add('sw-multi', { multi: true, recommend: ['a', 'b'] }), add('sw-nofree', { freeText: false })]);

  test('writes one need.answer per card, one sweep.answer per item, and the batch marker last', () => {
    const p = planSend(full(), { answers: [
      { item: 'sw-1', kind: 'sweep', choice: ['a'] },
      { item: 'need-1', kind: 'need', choice: ['b'], text: 'also tell Product' },
      { item: 'sw-multi', kind: 'sweep', choice: ['a', 'b'], text: 'and the second locale' },
    ], skipped: ['sw-nofree', 'sw-1', '../x'] });
    expect(p.results).toEqual({ 'sw-1': 'written', 'need-1': 'written', 'sw-multi': 'written' });
    expect(p.written).toBe(3);
    expect(p.events.map(e => e.kind)).toEqual(['sweep.answer', 'need.answer', 'sweep.answer', 'sweep.answer', 'sweep.batch']);
    const need = p.events.find(e => e.kind === 'need.answer')!;
    expect(need).toMatchObject({ ticket: 'DEMO-2', data: { id: 'need-1', text: 'b: Reword AC5. also tell Product', via: 'dock', batch: p.batch } });
    expect(need.text).toBe('Owner answered on DEMO-2: b: Reword AC5. also tell Product');
    expect(p.events.at(-1)!.data).toMatchObject({ batch: p.batch, skipped: ['sw-nofree'], results: p.results });
  });

  test('the widest answers a send accepts still fit one log line each', () => {
    const wide = '€'.repeat(SWEEP_TEXT_BYTES / 3);
    const long = '€'.repeat(900);
    const events = [...base(), card('DEMO-2', 'need-wide', { options: [`a: ${long}`], recommend: 'a' })];
    const many = Array.from({ length: SWEEP_MAX_ANSWERS - 1 }, (_, i) => add(`sw-${String(i).padStart(37, '0')}`));
    const s = state([...events, ...many]);
    const plan = planSend(s, {
      answers: [{ item: 'need-wide', kind: 'need', choice: ['a'], text: wide }, ...many.map(e => ({ item: String(e.data!.id), kind: 'sweep', choice: ['a'] }))],
    });
    for (const e of plan.events) {
      const line = JSON.stringify({ v: 1, id: 'e0000000000000', at: NOW, by: 'owner', ...e });
      expect(Buffer.byteLength(line)).toBeLessThan(3800);
    }
    expect(() => planSend(s, { answers: [{ item: 'need-wide', kind: 'need', text: `${wide}€` }] })).toThrow('too long to record');
  });

  test('a stale item gets its own result and the rest is written; nothing written means no marker', () => {
    const s = state([...base(), add('sw-1'), add('sw-2'), add('sw-3'), card('DEMO-1', 'need-1'), ev('sweep.answer', undefined, { batch: 'old', item: 'sw-1', kind: 'sweep', choice: ['a'] }, 'owner'), ev('sweep.close', undefined, { id: 'sw-2', why: 'moot' }, 'conductor'), ev('need.answer', 'DEMO-1', { id: 'need-1', text: 'a' }, 'owner')]);
    const p = planSend(s, { answers: [
      { item: 'sw-1', kind: 'sweep', choice: ['a'] },
      { item: 'sw-2', kind: 'sweep', choice: ['a'] },
      { item: 'sw-3', kind: 'sweep', choice: ['b'] },
      { item: 'need-1', kind: 'need', choice: ['a'] },
      { item: 'sw-gone', kind: 'sweep', choice: ['a'] },
    ] });
    expect(p.results).toEqual({ 'sw-1': 'answered-elsewhere', 'sw-2': 'closed', 'sw-3': 'written', 'need-1': 'answered-elsewhere', 'sw-gone': 'unknown' });
    expect(p.events.map(e => e.kind)).toEqual(['sweep.answer', 'sweep.batch']);
    const none = planSend(s, { answers: [{ item: 'sw-2', kind: 'sweep', choice: ['a'] }] });
    expect(none.written).toBe(0);
    expect(none.events).toEqual([]);
  });

  test('a malformed answer throws and plans nothing', () => {
    const bad = (a: unknown) => () => planSend(full(), { answers: [a] });
    expect(bad({ item: 'sw-1', kind: 'sweep', choice: ['z'] })).toThrow('"z" is not one of its options');
    expect(bad({ item: 'sw-1', kind: 'sweep', choice: ['a', 'b'] })).toThrow('single choice');
    expect(bad({ item: 'sw-1', kind: 'sweep' })).toThrow('needs a choice or some text');
    expect(bad({ item: 'sw-1', kind: 'sweep', choice: ['a'], text: 'x'.repeat(SWEEP_TEXT_MAX + 1) })).toThrow('free text is');
    expect(bad({ item: 'sw-nofree', kind: 'sweep', choice: ['a'], text: 'hello' })).toThrow('does not take free text');
    expect(bad({ item: 'sw-multi', kind: 'sweep', choice: ['a', 'a'] })).toThrow('the same option twice');
    expect(bad({ item: '../etc', kind: 'sweep', choice: ['a'] })).toThrow('is not an item id');
    expect(bad(null)).toThrow('is an object');
    expect(() => planSend(full(), { answers: [] })).toThrow('at least one answer');
    expect(() => planSend(full(), {})).toThrow('at least one answer');
    expect(() => planSend(full(), { answers: Array.from({ length: SWEEP_MAX_ANSWERS + 1 }, (_, i) => ({ item: `sw-${i}`, choice: ['a'] })) })).toThrow('at most');
    expect(() => planSend(full(), { answers: [{ item: 'sw-1', choice: ['a'] }, { item: 'sw-1', choice: ['b'] }] })).toThrow('appears twice');
  });

  test('free text alone answers a free-text item', () => {
    const s = state([ev('sweep.add', undefined, { id: 'sw-t', question: 'Name it?', options: [], recommend: [], multi: false, freeText: true }, 'conductor')]);
    expect(planSend(s, { answers: [{ item: 'sw-t', kind: 'sweep', text: ' Falcon ' }] }).events[0].data).toMatchObject({ item: 'sw-t', text: 'Falcon', choice: [] });
  });

  test('cardAnswerText is key: action, joined by semicolons, then the text', () => {
    const entry = dockQueue(full()).find(e => e.id === 'need-1')!;
    expect(cardAnswerText(entry, ['a'], undefined)).toBe('a: Defer TC-6');
    expect(cardAnswerText(entry, [], 'just words')).toBe('just words');
    expect(cardAnswerText(entry, ['a', 'b'], 'x')).toBe('a: Defer TC-6; b: Reword AC5. x');
  });
});

describe('readBatches', () => {
  test('copies question and labels in, and says whether the recommendation was taken; unconsumed filters', () => {
    const posted = [...base(), card('DEMO-2', 'need-1'), add('sw-1', {}, 'DEMO-1'), add('sw-2', { multi: true, recommend: ['a', 'b'] })];
    const planned = planSend(state(posted), { answers: [
      { item: 'sw-1', kind: 'sweep', choice: ['b'] },
      { item: 'need-1', kind: 'need', choice: ['b'] },
      { item: 'sw-2', kind: 'sweep', choice: ['b', 'a'], text: 'plus this' },
    ], skipped: ['sw-9'] });
    const events = [...posted, ...written(planned.events)];
    const s = state(events);
    const [b] = readBatches(s);
    expect(b).toMatchObject({ batch: planned.batch, consumed: false, skipped: ['sw-9'] });
    expect(b.answers).toEqual([
      { item: 'sw-1', kind: 'sweep', ticket: 'DEMO-1', question: 'Question sw-1?', askedBy: 'conductor', choice: ['b'], labels: ['Hold it'], text: null, tookRecommended: false },
      { item: 'need-1', kind: 'need', ticket: 'DEMO-2', question: 'Defer TC-6 or fix AC5?', askedBy: 'worker', choice: ['b'], labels: ['Reword AC5'], text: null, tookRecommended: true },
      { item: 'sw-2', kind: 'sweep', ticket: undefined, question: 'Question sw-2?', askedBy: 'conductor', choice: ['b', 'a'], labels: ['Hold it', 'Defer it'], text: 'plus this', tookRecommended: true },
    ] satisfies BatchReadAnswer[]);
    expect(readBatches(s, { unconsumed: true })).toHaveLength(1);
    const consumed = state([...events, ev('sweep.consume', undefined, { id: planned.batch }, 'conductor')]);
    expect(readBatches(consumed, { unconsumed: true })).toEqual([]);
    expect(readBatches(consumed)).toHaveLength(1);
  });

  test('a batch with no marker is not handed over', () => {
    const s = state([add('sw-1'), ev('sweep.answer', undefined, { batch: 'swb-x', item: 'sw-1', kind: 'sweep', choice: ['a'] }, 'owner')]);
    expect(readBatches(s)).toEqual([]);
  });
});

describe('where the dock shows', () => {
  const live = () => fold({ sprint, events: [], now: NOW });

  test('on a served live or demo page of an open sprint only', () => {
    expect(dockShown(live(), true)).toBe(true);
    expect(dockShown({ ...live(), mode: 'demo' }, true)).toBe(true);
    for (const mode of ['snapshot', 'share', 'report'] as const) { expect(dockShown({ ...live(), mode }, true)).toBe(false); }
    expect(dockShown({ ...live(), mode: 'demo' }, false)).toBe(false);
    expect(dockShown({ ...live(), sprint: { ...sprint, closedAt: NOW } }, true)).toBe(false);
    expect(dockShown(null, true)).toBe(false);
  });

  test('neither the share nor the report state carries a dock item, an answer or a note', () => {
    const s = state([...base(), add('sw-1', { question: 'Secret decision about the renewal?' }, 'DEMO-1'), ev('msg', 'DEMO-1', { id: 'msg-n', from: 'owner', text: 'private note from the dock', via: 'dock' }, 'owner'), ev('sweep.answer', 'DEMO-1', { batch: 'b', item: 'sw-1', kind: 'sweep', choice: ['a'], text: 'private answer text' }, 'owner'), ev('sweep.batch', undefined, { batch: 'b' }, 'owner'), ev('sweep.consume', undefined, { id: 'b' }, 'conductor')]);
    for (const out of [toShareState(s), toReportState(s)]) {
      const json = JSON.stringify(out);
      expect(out.sweep).toBeUndefined();
      expect(json).not.toContain('sweep.');
      expect(json).not.toContain('Secret decision');
      expect(json).not.toContain('private note');
      expect(json).not.toContain('private answer');
    }
  });
});

describe('what the page makes of the server\'s answer to a send', () => {
  test('only a 200 that says ok and names a batch is a send', () => {
    expect(sendOutcome(200, { ok: true, batch: 'swb-1', results: { a: 'written' } })).toEqual({ kind: 'sent', batch: 'swb-1', results: { a: 'written' } });
    expect(sendOutcome(409, { ok: false, results: { a: 'answered-elsewhere' } })).toEqual({ kind: 'none', results: { a: 'answered-elsewhere' } });
    expect(sendOutcome(400, { error: 'x: "z" is not one of its options' })).toEqual({ kind: 'invalid', message: 'x: "z" is not one of its options' });
  });

  test('a 404 from a server older than the dock is a failure, never "0 answers sent"', () => {
    expect(sendOutcome(404, {}).kind).toBe('outdated');
    expect(sendOutcome(405, {}).kind).toBe('outdated');
  });

  test('a 200 with no batch, a 500 and a 409 with no results are failures too', () => {
    expect(sendOutcome(200, {}).kind).toBe('error');
    expect(sendOutcome(200, { ok: true, results: {} }).kind).toBe('error');
    expect(sendOutcome(200, { ok: false, batch: 'swb-1' }).kind).toBe('error');
    expect(sendOutcome(500, { error: 'boom' })).toEqual({ kind: 'error', message: 'boom' });
    expect(sendOutcome(502, {})).toEqual({ kind: 'error', message: 'the board server answered 502' });
    expect(sendOutcome(409, {}).kind).toBe('error');
  });

  test('a live state with no sweep part comes from a server older than the dock; folded, frozen and demo states are fine', () => {
    const live = fold({ sprint, events: [], now: NOW });
    expect(serverLacksDock(live)).toBe(false);
    const { sweep: _gone, ...old } = live;
    expect(serverLacksDock(old)).toBe(true);
    expect(serverLacksDock({ ...old, mode: 'snapshot' })).toBe(false);
    expect(serverLacksDock({ ...old, mode: 'demo' })).toBe(false);
  });
});

describe('dock item age and staleness', () => {
  const now = Date.parse(NOW);
  test('age counts whole days; an unreadable time is 0, never NaN', () => {
    expect(dockAgeDays('2026-11-12T10:00:00Z', now)).toBe(0);
    expect(dockAgeDays('2026-11-09T12:00:00Z', now)).toBe(3);
    expect(dockAgeDays('2026-11-14T12:00:00Z', now)).toBe(0);
    expect(dockAgeDays(undefined, now)).toBe(0);
    expect(dockAgeDays('not a date', now)).toBe(0);
  });

  test('stale from the default threshold, configurable, and a bad threshold falls back to the default', () => {
    const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
    expect(isDockStale(daysAgo(DOCK_STALE_DAYS - 0.5), now)).toBe(false);
    expect(isDockStale(daysAgo(DOCK_STALE_DAYS), now)).toBe(true);
    expect(isDockStale(daysAgo(1), now, 1)).toBe(true);
    expect(isDockStale(daysAgo(DOCK_STALE_DAYS), now, DOCK_STALE_DAYS + 4)).toBe(false);
    expect(isDockStale(daysAgo(DOCK_STALE_DAYS), now, 0)).toBe(true);
    expect(isDockStale(daysAgo(1), now, Number.NaN)).toBe(false);
  });
});
