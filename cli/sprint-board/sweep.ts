import type { BoardEvent, BoardState } from './model.ts';
import { awaitsOwner } from './model.ts';

export const SWEEP_MAX_OPTIONS = 4;
export const SWEEP_TEXT_MAX = 1200;
// One answer is one log line under the atomic append limit, and the log counts bytes, not characters.
export const SWEEP_TEXT_BYTES = 2400;
const PICKED_BYTES = 600;
const LINE_TEXT_BYTES = 400;
export const SWEEP_MAX_ANSWERS = 30;
export const SWEEP_MEDIA_EXT = /\.(?:png|jpe?g|gif|webp)$/i;
export const DOCK_VIA = 'dock';
export const DOCK_STALE_DAYS = 3;

const ITEM_ID = /^[\w.-]{1,40}$/;
const DAY_MS = 86_400_000;

export interface SweepOption { key: string, label: string, desc?: string }
export interface SweepMedia { path: string, caption?: string }
export interface SweepLink { title: string, url: string }
export type SweepState = 'open' | 'answered' | 'consumed' | 'closed';

export interface SweepItem {
  id: string
  question: string
  header?: string
  context?: string
  options: SweepOption[]
  recommend: string[]
  multi: boolean
  freeText: boolean
  ticket?: string
  media: SweepMedia[]
  paths: string[]
  links: SweepLink[]
  by?: string
  createdAt: string
  state: SweepState
  closedWhy?: string
}

export interface SweepAnswer { item: string, kind: 'sweep' | 'need', ticket?: string, choice: string[], text?: string }
export type SweepResult = 'written' | 'answered-elsewhere' | 'closed' | 'unknown';
const RESULTS: readonly string[] = ['written', 'answered-elsewhere', 'closed', 'unknown'] satisfies SweepResult[];

export interface SweepBatch {
  id: string
  at: string
  // Only a batch whose marker was written is handed to a reader: a half-written one is not.
  complete: boolean
  answers: SweepAnswer[]
  skipped: string[]
  results: Record<string, SweepResult>
  consumed: boolean
  consumedAt?: string
}

export interface DockNote { id: string, text: string, at: string, ticket?: string, consumed: boolean, consumedAt?: string }

export interface SweepView { items: SweepItem[], batches: SweepBatch[], notes: DockNote[] }

export interface DockEntry {
  id: string
  kind: 'sweep' | 'need'
  ticket?: string
  header: string
  question: string
  context?: string
  options: SweepOption[]
  recommend: string[]
  multi: boolean
  freeText: boolean
  media: SweepMedia[]
  paths: string[]
  links: SweepLink[]
  by?: string
  at: string
  card?: { blocked?: string, why?: string, decider?: string }
  earlier?: { by: string, text: string }
}

type Board = Pick<BoardState, 'tickets' | 'sweep'>;

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const records = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : []);

const encoder = new TextEncoder();
const lineBytes = (v: string) => encoder.encode(JSON.stringify(v)).length - 2;
function clip(value: string, max: number): string {
  let out = '';
  let size = 0;
  for (const char of value) {
    size += lineBytes(char);
    if (size > max) { break; }
    out += char;
  }
  return out;
}

export function dockAgeDays(at: string | undefined, nowMs: number): number {
  const t = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((nowMs - t) / DAY_MS)) : 0;
}

export function isDockStale(at: string | undefined, nowMs: number, staleDays: number = DOCK_STALE_DAYS): boolean {
  const days = Number.isFinite(staleDays) && staleDays > 0 ? staleDays : DOCK_STALE_DAYS;
  return dockAgeDays(at, nowMs) >= days;
}

export const isDockMedia = (path: string): boolean =>
  /^(?:\.session|\.context\/PBI)\//.test(path) && !path.split('/').includes('..') && SWEEP_MEDIA_EXT.test(path);

type LinkRule = (url: string) => string | undefined;

function itemOf(e: BoardEvent, safeLink: LinkRule): SweepItem | null {
  const x = e.data ?? {};
  const id = str(x.id);
  const question = str(x.question);
  if (!id || !question) { return null; }
  return {
    id,
    question,
    header: str(x.header),
    context: str(x.context),
    options: records(x.options).flatMap((o) => {
      const key = str(o.key);
      const label = str(o.label);
      return key && label ? [{ key, label, desc: str(o.desc) }] : [];
    }),
    recommend: strs(x.recommend),
    multi: x.multi === true,
    freeText: x.freeText !== false,
    ticket: e.ticket,
    media: records(x.media).flatMap((m) => {
      const path = str(m.path);
      return path && isDockMedia(path) ? [{ path, caption: str(m.caption) }] : [];
    }),
    paths: strs(x.paths),
    links: records(x.links).flatMap((l) => {
      const url = safeLink(str(l.url) ?? '');
      return url ? [{ title: str(l.title) ?? url, url }] : [];
    }),
    by: e.by,
    createdAt: e.at,
    state: 'open',
  };
}

// With no link rule every link is dropped, so a caller that renders links has to pass one.
export function foldSweep(events: BoardEvent[], safeLink: LinkRule = () => undefined): SweepView {
  const items = new Map<string, SweepItem>();
  const batches = new Map<string, SweepBatch>();
  const consumedAt = new Map<string, string>();
  const noteEvents: BoardEvent[] = [];
  const batchOf = (id: string, at: string): SweepBatch => {
    const known = batches.get(id);
    if (known) { return known; }
    const made: SweepBatch = { id, at, complete: false, answers: [], skipped: [], results: {}, consumed: false };
    batches.set(id, made);
    return made;
  };
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const x = e.data ?? {};
    if (e.kind === 'sweep.add') {
      const item = itemOf(e, safeLink);
      if (item && !items.has(item.id)) { items.set(item.id, item); }
    }
    else if (e.kind === 'sweep.answer' && e.by === 'owner') {
      const id = str(x.item);
      const batch = str(x.batch);
      if (!id || !batch) { continue; }
      const kind = x.kind === 'need' ? 'need' : 'sweep';
      batchOf(batch, e.at).answers.push({ item: id, kind, ticket: e.ticket, choice: strs(x.choice), text: str(x.text) });
      const item = kind === 'sweep' ? items.get(id) : undefined;
      if (item?.state === 'open') { item.state = 'answered'; }
    }
    else if (e.kind === 'sweep.batch' && e.by === 'owner') {
      const id = str(x.batch);
      if (!id) { continue; }
      const batch = batchOf(id, e.at);
      batch.complete = true;
      batch.at = e.at;
      batch.skipped = strs(x.skipped);
      for (const [item, result] of Object.entries(isRecord(x.results) ? x.results : {})) {
        if (typeof result === 'string' && RESULTS.includes(result)) { batch.results[item] = result as SweepResult; }
      }
    }
    else if (e.kind === 'sweep.consume') {
      const id = str(x.id);
      if (id) { consumedAt.set(id, e.at); }
    }
    else if (e.kind === 'sweep.close') {
      const item = items.get(str(x.id) ?? '');
      if (item?.state === 'open') {
        item.state = 'closed';
        item.closedWhy = str(x.why);
      }
    }
    else if (e.kind === 'msg' && e.by === 'owner' && x.via === DOCK_VIA) { noteEvents.push(e); }
  }
  for (const batch of batches.values()) {
    const at = consumedAt.get(batch.id);
    if (!at) { continue; }
    batch.consumed = true;
    batch.consumedAt = at;
    for (const answer of batch.answers) {
      const item = answer.kind === 'sweep' ? items.get(answer.item) : undefined;
      if (item?.state === 'answered') { item.state = 'consumed'; }
    }
  }
  // Only `sweep consume` marks a note read: any session can post a reply in its thread.
  const notes = noteEvents.map((e): DockNote => {
    const id = str(e.data?.id) ?? e.id;
    const at = consumedAt.get(id);
    return { id, text: str(e.data?.text) ?? e.text, at: e.at, ticket: e.ticket, consumed: Boolean(at), consumedAt: at };
  });
  return {
    items: [...items.values()],
    batches: [...batches.values()].sort((a, b) => a.at.localeCompare(b.at)),
    notes: notes.sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export const openSweepItems = (state: Pick<BoardState, 'sweep'>): SweepItem[] => (state.sweep?.items ?? []).filter(i => i.state === 'open');

export const unreadNotes = (state: Pick<BoardState, 'sweep'>): DockNote[] =>
  (state.sweep?.notes ?? []).filter(n => !n.consumed).sort((a, b) => a.at.localeCompare(b.at));

export function dockQueue(state: Board): DockEntry[] {
  const out: DockEntry[] = openSweepItems(state).map(it => ({
    id: it.id,
    kind: 'sweep',
    ticket: it.ticket,
    header: it.header ?? 'Decision',
    question: it.question,
    context: it.context,
    options: it.options,
    recommend: it.recommend,
    multi: it.multi,
    freeText: it.freeText,
    media: it.media,
    paths: it.paths,
    links: it.links,
    by: it.by,
    at: it.createdAt,
  }));
  for (const t of state.tickets) {
    if (!t.inScope) { continue; }
    for (const n of t.needs) {
      // A need the board raised itself takes no need.answer, so it stays on its ticket.
      if (n.synthetic || !awaitsOwner(n) || !ITEM_ID.test(n.id)) { continue; }
      out.push({
        id: n.id,
        kind: 'need',
        ticket: t.id,
        header: 'Needs you',
        question: n.question,
        options: (n.choices ?? []).map(c => ({ key: c.key, label: c.action, desc: c.cost ? `Cost: ${c.cost}` : undefined })),
        recommend: n.recommend ? [n.recommend] : [],
        multi: false,
        freeText: true,
        media: [],
        paths: [],
        links: [],
        by: n.openedBy === 'worker' && t.worker.name ? `worker ${t.worker.name}` : n.openedBy,
        at: n.since,
        card: { blocked: n.blocked, why: n.why, decider: n.decider },
        earlier: n.answer ? { by: n.answeredBy ?? '?', text: n.answer } : undefined,
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export const shownOptions = (entry: Pick<DockEntry, 'options' | 'recommend'>): SweepOption[] =>
  [...entry.options].sort((a, b) => Number(entry.recommend.includes(b.key)) - Number(entry.recommend.includes(a.key)));

export const optionForKey = (entry: Pick<DockEntry, 'options'>, key: string): SweepOption | undefined =>
  entry.options.find(o => o.key.toLowerCase() === key.toLowerCase());

const PROBE_CHARS = 40;
const PROBE_MIN = 12;

// Text the same board publishes without its dock is no leak: a question or a note may well repeat a ticket title.
export function dockLeak(view: SweepView | undefined, published: string, bare: string, encode: (v: unknown) => string): string | null {
  const texts = [
    ...(view?.items ?? []).map(i => ({ what: `dock item ${i.id}`, text: i.question })),
    ...(view?.batches ?? []).flatMap(b => b.answers.map(a => ({ what: `dock answer to ${a.item}`, text: a.text ?? '' }))),
    ...(view?.notes ?? []).map(n => ({ what: `dock note ${n.id}`, text: n.text })),
  ];
  const leaked = texts.find((d) => {
    const probe = encode(d.text.slice(0, PROBE_CHARS)).slice(1, -1);
    return probe.length > PROBE_MIN && published.includes(probe) && !bare.includes(probe);
  });
  return leaked?.what ?? null;
}

export interface SendInput { answers?: unknown, skipped?: unknown }
export interface PlannedEvent { kind: 'need.answer' | 'sweep.answer' | 'sweep.batch', ticket?: string, text: string, data: Record<string, unknown> }
export interface SendPlan { batch: string, events: PlannedEvent[], results: Record<string, SweepResult>, written: number }

const newBatchId = () => `swb-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function cardAnswerText(entry: Pick<DockEntry, 'options'>, choice: string[], text: string | undefined): string {
  const picked = clip(choice.map(k => `${k}: ${entry.options.find(o => o.key === k)?.label ?? k}`).join('; '), PICKED_BYTES);
  return [picked, text].filter(Boolean).join('. ');
}

function answerRefusal(entry: DockEntry, choice: string[], text: string): string | null {
  if (!choice.length && !text) { return 'an answer needs a choice or some text'; }
  if (text.length > SWEEP_TEXT_MAX) { return `free text is ${text.length} characters, the limit is ${SWEEP_TEXT_MAX}; send the rest as a note`; }
  if (lineBytes(text) > SWEEP_TEXT_BYTES) { return `free text is too long to record in one line (${lineBytes(text)} bytes, the limit is ${SWEEP_TEXT_BYTES}); shorten it`; }
  if (text && !entry.freeText) { return 'this item does not take free text'; }
  if (!entry.options.length && choice.length) { return 'this item has no options'; }
  const unknown = choice.find(k => !entry.options.some(o => o.key === k));
  if (unknown !== undefined) { return `"${unknown}" is not one of its options (${entry.options.map(o => o.key).join(', ')})`; }
  if (new Set(choice).size !== choice.length) { return 'the same option twice'; }
  return !entry.multi && choice.length > 1 ? `single choice, got ${choice.length} options` : null;
}

// A malformed answer is the caller's bug and plans nothing; an item that stopped being answerable gets its own result, so one stale card never sinks the batch.
export function planSend(state: Board, input: SendInput): SendPlan {
  const answers = Array.isArray(input.answers) ? input.answers as unknown[] : [];
  if (!answers.length) { throw new Error('answers: send at least one answer'); }
  if (answers.length > SWEEP_MAX_ANSWERS) { throw new Error(`answers: at most ${SWEEP_MAX_ANSWERS} per send (got ${answers.length})`); }
  const queue = new Map(dockQueue(state).map(e => [`${e.kind}:${e.id}`, e]));
  const items = new Map((state.sweep?.items ?? []).map(i => [i.id, i]));
  const needs = new Set(state.tickets.flatMap(t => t.needs.map(n => n.id)));
  const batch = newBatchId();
  const events: PlannedEvent[] = [];
  const results: Record<string, SweepResult> = {};
  const seen = new Set<string>();
  for (const answer of answers) {
    if (!isRecord(answer)) { throw new Error('answers: each answer is an object'); }
    const id = String(answer.item ?? '');
    if (!ITEM_ID.test(id)) { throw new Error(`answers: "${id}" is not an item id`); }
    if (seen.has(id)) { throw new Error(`answers: ${id} appears twice`); }
    seen.add(id);
    const kind = answer.kind === 'need' ? 'need' : 'sweep';
    const choice = Array.isArray(answer.choice) ? answer.choice.map(String) : [];
    const text = typeof answer.text === 'string' ? answer.text.trim() : '';
    const entry = queue.get(`${kind}:${id}`);
    if (!entry) {
      const item = items.get(id);
      if (kind === 'need') { results[id] = needs.has(id) ? 'answered-elsewhere' : 'unknown'; }
      else if (item) { results[id] = item.state === 'closed' ? 'closed' : 'answered-elsewhere'; }
      else { results[id] = 'unknown'; }
      continue;
    }
    const refused = answerRefusal(entry, choice, text);
    if (refused) { throw new Error(`${id}: ${refused}`); }
    if (kind === 'need') {
      const said = cardAnswerText(entry, choice, text || undefined);
      events.push({ kind: 'need.answer', ticket: entry.ticket, text: clip(`Owner answered on ${entry.ticket}: ${said}`, LINE_TEXT_BYTES), data: { id, text: said, via: DOCK_VIA, batch } });
    }
    events.push({ kind: 'sweep.answer', ticket: entry.ticket, text: `Owner answered ${id}`, data: { batch, item: id, kind, choice, text: text || undefined } });
    results[id] = 'written';
  }
  const written = Object.values(results).filter(r => r === 'written').length;
  const skipped = strs(input.skipped).filter(s => ITEM_ID.test(s) && !seen.has(s)).slice(0, SWEEP_MAX_ANSWERS);
  if (written) { events.push({ kind: 'sweep.batch', text: `Owner sent ${written} dock answer${written === 1 ? '' : 's'}`, data: { batch, skipped, results } }); }
  return { batch, events, results, written };
}

export interface BatchReadAnswer {
  item: string
  kind: 'sweep' | 'need'
  ticket?: string
  question: string
  askedBy?: string
  choice: string[]
  labels: string[]
  text: string | null
  tookRecommended: boolean
}
export interface BatchRead { batch: string, sentAt: string, consumed: boolean, answers: BatchReadAnswer[], skipped: string[], results: Record<string, SweepResult> }

export function readBatches(state: Board, opts: { unconsumed?: boolean } = {}): BatchRead[] {
  const items = new Map((state.sweep?.items ?? []).map(i => [i.id, i]));
  const needs = new Map(state.tickets.flatMap(t => t.needs.map(n => [n.id, n] as const)));
  return (state.sweep?.batches ?? [])
    .filter(b => b.complete && (!opts.unconsumed || !b.consumed))
    .map((b) => {
      const answers = b.answers.map((a): BatchReadAnswer => {
        const item = a.kind === 'sweep' ? items.get(a.item) : undefined;
        const need = a.kind === 'need' ? needs.get(a.item) : undefined;
        const options: SweepOption[] = item?.options ?? (need?.choices ?? []).map(c => ({ key: c.key, label: c.action }));
        const recommended = item?.recommend ?? (need?.recommend ? [need.recommend] : []);
        return {
          item: a.item,
          kind: a.kind,
          ticket: a.ticket,
          question: item?.question ?? need?.question ?? '(item no longer on the board)',
          askedBy: item?.by ?? need?.openedBy,
          choice: a.choice,
          labels: a.choice.map(k => options.find(o => o.key === k)?.label ?? k),
          text: a.text ?? null,
          tookRecommended: a.choice.length > 0 && a.choice.length === recommended.length && a.choice.every(k => recommended.includes(k)),
        };
      });
      return { batch: b.id, sentAt: b.at, consumed: b.consumed, answers, skipped: b.skipped, results: b.results };
    });
}

export type SendOutcome
  = | { kind: 'sent', batch: string, results: Record<string, SweepResult> }
    | { kind: 'none', results: Record<string, SweepResult> }
    | { kind: 'invalid' | 'outdated' | 'error', message: string };

// Only a 200 that says ok and names a batch is a send: an older server answers 404, which must never read as "0 answers sent".
export function sendOutcome(status: number, json: Record<string, unknown>): SendOutcome {
  const results = (isRecord(json.results) ? json.results : {}) as Record<string, SweepResult>;
  if (status === 200 && json.ok === true && typeof json.batch === 'string' && json.batch) { return { kind: 'sent', batch: json.batch, results }; }
  if (status === 409 && isRecord(json.results)) { return { kind: 'none', results }; }
  if (status === 400) { return { kind: 'invalid', message: String(json.error ?? 'the board refused the answers') }; }
  if (status === 404 || status === 405) { return { kind: 'outdated', message: 'the board server has no POST /api/sweep/send' }; }
  return { kind: 'error', message: String(json.error ?? `the board server answered ${status}`) };
}

// The page is rebuilt from disk while the server keeps the code it started with: a live state with no sweep part is an older server.
export const serverLacksDock = (state: { mode: string, sweep?: unknown }): boolean => state.mode === 'live' && state.sweep === undefined;

// `served`: a frozen copy opened without a server never draws the dock, its tour included.
export const dockShown = (state: Pick<BoardState, 'mode' | 'sprint'> | null, served: boolean): boolean =>
  served && state !== null && (state.mode === 'live' || state.mode === 'demo') && !state.sprint.closedAt;
