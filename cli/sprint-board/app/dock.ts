import type { BoardState } from '../model.ts';
import type { DockEntry, SweepResult } from '../sweep.ts';
import { localHhmm } from '../model.ts';
import { dockQueue, dockShown, isDockStale, optionForKey, sendOutcome, serverLacksDock, shownOptions, SWEEP_MAX_ANSWERS, SWEEP_TEXT_MAX } from '../sweep.ts';
import { getLang, tr } from './i18n.ts';
import { $, $$, ago, esc, save, store, toast } from './util.ts';

export interface DockDeps {
  slug: () => string | undefined
  img: (path: string) => string | null
  demo: () => boolean
  // False on a frozen copy, which has no server to take an answer.
  served: boolean
  refresh: () => Promise<void>
}

type Mode = 'hidden' | 'collapsed' | 'expanded';
type Step = number | 'review' | 'sent';
// `q` and `l` ride along so a draft whose item is gone can still be read.
interface Draft { c: string[], t: string, q?: string, l?: string[] }
interface Kept { id: string, q: string, l: string[], t: string }
interface Stored { drafts: Record<string, Draft>, note: { text: string, ticket: string }, kept: Kept[] }
interface Sent { batch: string, n: number, left: number, at: string }

const ICON = {
  inbox: '<path d="M2.5 9.5 4 3.5h8l1.5 6M2.5 9.5v3a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3h-3.5l-1 1.5h-3l-1-1.5Z"/>',
  up: '<path d="m3.5 10 4.5-4.5L12.5 10"/>',
  down: '<path d="m3.5 6 4.5 4.5L12.5 6"/>',
  min: '<path d="M3 8h10"/>',
  check: '<path d="M3 8.6 6.3 12 13 4.5"/>',
  copy: '<rect x="5" y="5" width="8.5" height="8.5" rx="1.2"/><path d="M11 5V3.2a.7.7 0 0 0-.7-.7H3.2a.7.7 0 0 0-.7.7v7.1c0 .4.3.7.7.7H5"/>',
  ext: '<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7"/>',
  send: '<path d="M2 7.6 14 2.5 10 13.8 7.6 9 2 7.6ZM7.6 9 14 2.5"/>',
  left: '<path d="m10 3.5-4.5 4.5 4.5 4.5"/>',
  right: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
  zoom: '<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/>',
};
const ic = (name: keyof typeof ICON) => `<svg class="dk-i" viewBox="0 0 16 16" aria-hidden="true">${ICON[name]}</svg>`;
const MODE_KEY = 'sprint-board-dock-mode';
const NOTE_MAX = 1500;
const SHEET_MAX = 700;
const ROOM_MIN = 420;

let deps: DockDeps;
let state: BoardState | null = null;
let queue: DockEntry[] = [];
let mode: Mode = store<unknown>(MODE_KEY, 'collapsed') === 'hidden' ? 'hidden' : 'collapsed';
let tab: 'questions' | 'notes' = 'questions';
let step: Step = 0;
let drafts: Record<string, Draft> = {};
let note = { text: '', ticket: '' };
let kept: Kept[] = [];
let sent: Sent | null = null;
const slide: Record<string, number> = {};
// Empty while the body is behind the state: only the parts around a field being typed in were redrawn.
let lastSig = '';
let lastIds: Set<string> | null = null;
const seen = new Set<string>();
let pressed = false;
let toastLine = '';
let toastTimer = 0;
let busy = false;
let outdated = false;
let refusal = '';

const OUTDATED = () => tr('The board server is older than this page, so it cannot take dock answers. Stop it and start it again (bun run board:up). Your drafts stay in this browser.', 'El servidor del board es más viejo que esta página y no puede recibir respuestas. Detenlo y arráncalo otra vez (bun run board:up). Tus borradores quedan en este navegador.');
const UNAVAILABLE = () => tr('Image not available here', 'Imagen no disponible aquí');

const root = () => $('#dock');
const storeKey = () => `sprint-board-dock-${deps.slug() ?? 'none'}`;
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
function load(): void {
  const v = store<Partial<Stored> | null>(storeKey(), null);
  if (!v) { return; }
  drafts = Object.fromEntries(Object.entries(v.drafts ?? {}).map(([id, d]) => [id, { c: texts(d?.c), t: String(d?.t ?? ''), q: String(d?.q ?? ''), l: texts(d?.l) }]));
  note = { text: String(v.note?.text ?? ''), ticket: String(v.note?.ticket ?? '') };
  kept = (Array.isArray(v.kept) ? v.kept : []).map(k => ({ id: String(k?.id), q: String(k?.q ?? ''), l: texts(k?.l), t: String(k?.t ?? '') }));
}
// Another tab writes the same key: each change is applied to what is stored now, never to this tab's older copy.
function commit(change: () => void): void {
  load();
  change();
  save(storeKey(), { drafts, note, kept });
}
function restore(): void {
  drafts = {};
  note = { text: '', ticket: '' };
  kept = [];
  load();
}
const addToNote = (line: string) => { note.text = note.text.trim() ? `${note.text}\n${line}` : line; };
const typingField = () => document.activeElement?.closest<HTMLElement>('#dock input, #dock textarea, #dock select') ?? null;

const draft = (id: string): Draft => (drafts[id] ??= { c: [], t: '' });
const hasContent = (d: Draft | undefined): boolean => Boolean(d && (d.c.length || d.t.trim()));
const isReady = (id: string): boolean => hasContent(drafts[id]);
const readyCount = () => queue.filter(e => isReady(e.id)).length;
const isStale = (e: DockEntry) => isDockStale(e.at, Date.now(), state?.sprint.dockStaleDays);
const labelsOf = (e: DockEntry, keys: string[]) => keys.map(k => e.options.find(o => o.key === k)?.label ?? k);

function segments(): string {
  return `<span class="dk-segs" aria-hidden="true">${queue.map(e => `<i class="${isReady(e.id) ? 'on' : ''}"></i>`).join('')}</span>`;
}

function pill(): string {
  const n = queue.length;
  const ready = readyCount();
  const label = n
    ? tr(`Open Decisions, ${n} waiting, ${ready} ready`, `Abrir Decisiones, ${n} esperando, ${ready} listas`)
    : tr('Open Decisions, nothing waiting', 'Abrir Decisiones, nada esperando');
  const body = n
    ? `<span class="dk-badge" id="dk-badge">${n}</span>${segments()}<span class="dk-sub">${tr(`${ready} of ${n} ready`, `${ready} de ${n} listas`)}</span>`
    : `<span class="dk-sub">${tr('All clear', 'Todo al día')}</span>`;
  return `<button type="button" class="dk-pill" data-dk="expand" aria-expanded="false" aria-label="${esc(label)}">${ic('inbox')}<span>${tr('Decisions', 'Decisiones')}</span>${body}${ic('up')}</button>`;
}

function mini(): string {
  const n = queue.length;
  return `<button type="button" class="dk-mini" data-dk="expand" title="${tr('Decisions (D)', 'Decisiones (D)')}" aria-label="${esc(tr(`Show Decisions, ${n} waiting`, `Mostrar Decisiones, ${n} esperando`))}">${ic('inbox')}${n ? `<span class="dk-badge" id="dk-badge">${n}</span>` : ''}</button>`;
}

function stepper(): string {
  const items = queue.map((e, i) => `<button type="button" data-dk="goto" data-i="${i}" class="${step === i ? 'cur' : isReady(e.id) ? 'done' : ''}" aria-label="${esc(tr(`Item ${i + 1}${isReady(e.id) ? ', answered' : ''}`, `Ítem ${i + 1}${isReady(e.id) ? ', respondido' : ''}`))}">${i + 1}</button>`).join('');
  const ready = readyCount();
  return `<div class="dk-steps" role="group" aria-label="${tr('Items', 'Ítems')}">${items}<button type="button" class="rev${step === 'review' ? ' cur' : ''}" data-dk="review">${tr('Review', 'Revisar')}${ready ? ` · ${ready}` : ''}</button></div>`;
}

function frame(e: DockEntry): string {
  const images = e.media.map(m => ({ ...m, src: deps.img(m.path) }));
  const at = Math.min(slide[e.id] ?? 0, Math.max(0, images.length - 1));
  const current = images[at];
  if (!current) { return ''; }
  let html = `<div class="dk-frame">${current.src ? `<img src="${esc(current.src)}" alt="${esc(current.caption ?? '')}" loading="lazy" /><button type="button" class="zoom" data-zoom="${esc(current.src)}" aria-label="${tr('Enlarge image', 'Ampliar imagen')}">${ic('zoom')}</button>` : `<span class="dk-noimg">${UNAVAILABLE()}</span>`}`;
  if (images.length > 1) {
    html += `<button type="button" class="nav p" data-dk="slide" data-d="-1" data-id="${esc(e.id)}" aria-label="${tr('Previous image', 'Imagen anterior')}">${ic('left')}</button><button type="button" class="nav n" data-dk="slide" data-d="1" data-id="${esc(e.id)}" aria-label="${tr('Next image', 'Imagen siguiente')}">${ic('right')}</button><span class="ctr">${at + 1} / ${images.length}</span>`;
  }
  html += '</div>';
  if (images.length > 1) {
    html += `<div class="dk-thumbs">${images.map((x, j) => `<button type="button" data-dk="slideto" data-j="${j}" data-id="${esc(e.id)}" aria-label="${tr(`Image ${j + 1}`, `Imagen ${j + 1}`)}"${j === at ? ' aria-current="true"' : ''}>${x.src ? `<img src="${esc(x.src)}" alt="" loading="lazy" />` : ''}</button>`).join('')}</div>`;
  }
  return current.caption ? `${html}<p class="dk-cap">${esc(current.caption)}</p>` : html;
}

const hostOf = (url: string): string => {
  try { return new URL(url).host; }
  catch { return ''; }
};

function media(e: DockEntry): string {
  if (!e.media.length && !e.paths.length && !e.links.length) { return ''; }
  const paths = e.paths.map(p => `<div class="dk-ref" title="${esc(p)}"><code>${esc(p.length > 46 ? `…${p.slice(-45)}` : p)}</code><button type="button" class="dk-ib" data-dk="copy" data-p="${esc(p)}" aria-label="${tr('Copy path', 'Copiar ruta')}">${ic('copy')}</button></div>`).join('');
  const links = e.links.map(l => `<div class="dk-ref"><a class="ln" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${ic('ext')}<span>${esc(l.title)}</span><small>${esc(hostOf(l.url))}</small></a></div>`).join('');
  return `<div class="dk-media">${frame(e)}${paths}${links}</div>`;
}

function options(e: DockEntry): string {
  const d = draft(e.id);
  const role = e.multi ? 'checkbox' : 'radio';
  const picks = shownOptions(e).map(o => `<button type="button" class="dk-opt" role="${role}" aria-checked="${d.c.includes(o.key)}" data-dk="pick" data-k="${esc(o.key)}" data-id="${esc(e.id)}"><span class="k">${esc(o.key)}</span><span class="mk">${ic('check')}</span><span><b>${esc(o.label)}${e.recommend.includes(o.key) ? `<span class="dk-rec">${tr('Recommended', 'Recomendada')}</span>` : ''}</b>${o.desc ? `<span class="d">${esc(o.desc)}</span>` : ''}</span></button>`).join('');
  const hint = e.options.length ? (e.multi ? tr('Anything else', 'Algo más') : tr('Other, in your words', 'Otra, con tus palabras')) : tr('Your answer', 'Tu respuesta');
  const other = e.freeText ? `<label class="dk-other${d.t.trim() ? ' has' : ''}"><span class="k">…</span><input data-dk="free" data-id="${esc(e.id)}" value="${esc(d.t)}" maxlength="${SWEEP_TEXT_MAX}" placeholder="${esc(hint)}" aria-label="${tr('Free text answer', 'Respuesta de texto libre')}" /></label>` : '';
  return `<div class="dk-opts" role="${e.multi ? 'group' : 'radiogroup'}" aria-label="${tr('Answer', 'Respuesta')}">${picks}${other}</div>`;
}

function itemView(e: DockEntry): string {
  const side = media(e);
  const rows = [[tr('Cannot run', 'No puede correr'), e.card?.blocked], [tr('Why', 'Por qué'), e.card?.why], [tr('Decides', 'Decide'), e.card?.decider]]
    .flatMap(([label, value]) => (value ? [`<dt>${label}</dt><dd>${esc(value)}</dd>`] : []))
    .join('');
  const earlier = e.earlier
    ? `<p class="dk-earlier"><b>${esc(e.earlier.by)}</b> ${tr('recorded an answer', 'registró una respuesta')}: “${esc(e.earlier.text)}”. ${tr('The question is still yours; your answer replaces it.', 'La pregunta sigue siendo tuya; tu respuesta la reemplaza.')}</p>`
    : '';
  const stale = isStale(e) ? `<span class="dk-stale" title="${esc(tr('Waiting past the stale threshold: events may have overtaken the question.', 'Espera más que el umbral: la pregunta pudo quedar atrás por los hechos.'))}">${tr('Stale', 'Vieja')}</span>` : '';
  const ticket = e.ticket ? `<button type="button" class="dk-tk" data-open="${esc(e.ticket)}" title="${tr('Open the ticket', 'Abrir el ticket')}">${esc(e.ticket)}</button>` : '';
  return `<div class="dk-meta">${ticket}<span class="dk-hdr${e.kind === 'need' ? ' need' : ''}">${esc(e.header)}</span><span class="dk-origin">${e.by ? `${esc(e.by)} · ` : ''}${ago(e.at)} ${tr('ago', 'atrás')}</span>${stale}</div>
    <h2 class="dk-q">${esc(e.question)}</h2>${e.context ? `<p class="dk-qsub">${esc(e.context)}</p>` : '<div class="dk-gap"></div>'}${rows ? `<dl class="dk-card">${rows}</dl>` : ''}${earlier}
    <div class="dk-grid${side ? '' : ' nomedia'}">${side}${options(e)}</div>
    ${e.kind === 'need' ? `<p class="dk-cap dk-route">${tr('Your answer is recorded on the ticket’s needs-you card, as if you had answered it there.', 'Tu respuesta queda en la tarjeta needs-you del ticket, como si la respondieras allí.')}</p>` : ''}`;
}

function reviewRow(e: DockEntry, i: number): string {
  const jump = (label: string) => `<button type="button" class="lk" data-dk="goto" data-i="${i}">${label}</button>`;
  if (!isReady(e.id)) {
    return `<div class="dk-rv open"><span class="no">${i + 1}</span><div><div class="qq">${esc(e.question)}</div><div class="route">${tr('No answer yet. It stays in the dock.', 'Sin respuesta. Se queda en el dock.')}</div></div>${jump(tr('Answer', 'Responder'))}</div>`;
  }
  const d = draft(e.id);
  const answers = `${labelsOf(e, d.c).map(l => `<span>${esc(l)}</span>`).join('')}${d.t.trim() ? `<span class="fx">“${esc(d.t.trim())}”</span>` : ''}`;
  const route = e.kind === 'need' ? `<div class="route">${tr('Answers the card on', 'Responde la tarjeta de')} ${esc(e.ticket ?? '')}${e.earlier ? `, ${tr('replacing what was recorded by', 'reemplaza lo registrado por')} ${esc(e.earlier.by)}` : ''}</div>` : '';
  return `<div class="dk-rv"><span class="no">${i + 1}</span><div><div class="qq">${esc(e.question)}</div><div class="aa">${answers}</div>${route}</div>${jump(tr('Edit', 'Editar'))}</div>`;
}

function reviewView(): string {
  const n = readyCount();
  const open = queue.length - n;
  const over = n - SWEEP_MAX_ANSWERS;
  const title = n ? tr(`${n} answer${n === 1 ? '' : 's'} ready to send`, `${n} respuesta${n === 1 ? '' : 's'} lista${n === 1 ? '' : 's'} para enviar`) : tr('Nothing to send yet', 'Todavía no hay nada para enviar');
  return `<div class="dk-review"><h2>${title}</h2><p class="dk-qsub">${tr('One batch. Nothing leaves this browser until you press Send.', 'Un solo lote. Nada sale de este navegador hasta que presiones Enviar.')}</p>${queue.map(reviewRow).join('')}${open ? `<p class="dk-cap">${tr(`${open} item${open === 1 ? '' : 's'} without an answer stay${open === 1 ? 's' : ''} open here.`, `${open} ítem${open === 1 ? '' : 's'} sin respuesta se queda${open === 1 ? '' : 'n'} abierto${open === 1 ? '' : 's'} aquí.`)}</p>` : ''}${over > 0 ? `<p class="dk-cap">${tr(`One send takes ${SWEEP_MAX_ANSWERS} answers: the last ${over} stay as drafts for the next one.`, `Un envío admite ${SWEEP_MAX_ANSWERS} respuestas: las últimas ${over} quedan como borrador para el siguiente.`)}</p>` : ''}</div>`;
}

function noteView(): string {
  const tickets = (state?.tickets ?? []).filter(t => t.inScope).map(t => t.id);
  const notes = (state?.sweep?.notes ?? []).slice(0, 4);
  const sentList = notes.map(n => `<div class="dk-nitem"><div><p>${esc(n.text)}</p><small>${localHhmm(n.at)}${n.ticket ? ` · ${esc(n.ticket)}` : ''}</small></div><span class="dk-st ${n.consumed ? 'read' : 'del'}">${n.consumed ? `${tr('Read', 'Leída')} ${n.consumedAt ? localHhmm(n.consumedAt) : ''}` : tr('Delivered', 'Entregada')}</span></div>`).join('');
  const keptList = kept.map(k => `<div class="dk-nitem dk-kept"><div><small>${esc(k.q)}</small><p>${esc([...k.l, k.t].filter(Boolean).join(' · '))}</p></div><span><button type="button" class="lk" data-dk="reuse" data-id="${esc(k.id)}">${tr('Add to note', 'Pasar a la nota')}</button><button type="button" class="lk" data-dk="discard" data-id="${esc(k.id)}">${tr('Discard', 'Descartar')}</button></span></div>`).join('');
  return `<div class="dk-note"><h2>${tr('Write a note', 'Escribir una nota')}</h2><p class="dk-qsub">${tr('A free note, no question needed. It is sent at once and joins the same thread as the Claude and you panel.', 'Una nota libre, sin pregunta. Se envía al instante y entra en el mismo hilo del panel Claude y tú.')}</p>
    <textarea id="dk-note-t" aria-label="${tr('Note', 'Nota')}" maxlength="${NOTE_MAX}" placeholder="${esc(tr('For example: keep the checkout tickets on hold until I confirm the deploy.', 'Por ejemplo: deja en espera los tickets de checkout hasta que confirme el deploy.'))}">${esc(note.text)}</textarea>
    <div class="dk-nrow"><label class="dk-sr" for="dk-note-tk">${tr('About', 'Sobre')}</label><select id="dk-note-tk"><option value="">${tr('About: no ticket', 'Sobre: ningún ticket')}</option>${tickets.map(id => `<option value="${esc(id)}"${id === note.ticket ? ' selected' : ''}>${tr('About', 'Sobre')}: ${esc(id)}</option>`).join('')}</select><span class="dk-hint"><kbd>⌘</kbd> <kbd>Enter</kbd> ${tr('sends', 'envía')}</span></div>
    ${keptList ? `<div class="dk-nlist"><h3>${tr('Unsent drafts from items that closed', 'Borradores sin enviar de ítems que se cerraron')}</h3>${keptList}</div>` : ''}${sentList ? `<div class="dk-nlist">${sentList}</div>` : ''}</div>`;
}

function sentView(s: Sent): string {
  const batch = state?.sweep?.batches.find(b => b.id === s.batch);
  const skipped = s.left;
  return `<div class="dk-sent"><div class="ok">${ic('check')}</div><h2>${tr(`${s.n} answer${s.n === 1 ? '' : 's'} sent`, `${s.n} respuesta${s.n === 1 ? '' : 's'} enviada${s.n === 1 ? '' : 's'}`)}</h2><p>${tr(`Batch ${esc(s.batch)} at ${s.at}, recorded on the board. A running sentinel picks it up within seconds.`, `Lote ${esc(s.batch)} a las ${s.at}, registrado en el board. Un sentinel activo lo recoge en segundos.`)}</p>
    <div class="dk-tl"><div><b>${tr('Sent', 'Enviado')}</b>${s.at}</div><div class="${batch?.consumed ? '' : 'wait'}"><b>${tr('Read', 'Leído')}</b>${batch?.consumedAt ? localHhmm(batch.consumedAt) : tr('waiting', 'esperando')}</div></div>
    ${skipped ? `<p class="dk-cap">${tr(`${skipped} item${skipped === 1 ? ' was' : 's were'} already answered or closed elsewhere and not written.`, `${skipped} ítem${skipped === 1 ? ' ya estaba respondido o cerrado en otro lado y no se escribió' : 's ya estaban respondidos o cerrados en otro lado y no se escribieron'}.`)}</p>` : ''}
    <div class="acts"><button type="button" class="dk-btn pri" data-dk="done">${tr('Done', 'Listo')}</button></div>
    <p class="dk-cap">${tr(`A send is final. ${queue.length} item${queue.length === 1 ? '' : 's'} still open.`, `Un envío es definitivo. ${queue.length} ítem${queue.length === 1 ? '' : 's'} sigue${queue.length === 1 ? '' : 'n'} abierto${queue.length === 1 ? '' : 's'}.`)}</p></div>`;
}

function emptyView(): string {
  return `<div class="dk-sent"><div class="ok">${ic('check')}</div><h2>${tr('Nothing is waiting for you', 'No hay nada esperándote')}</h2><p>${tr('Questions posted to the dock and needs-you cards show up in this list.', 'Las preguntas publicadas en el dock y las tarjetas needs-you aparecen en esta lista.')}</p></div>`;
}

function footer(): string {
  const n = readyCount();
  if (tab === 'notes') {
    return `<div class="dk-saved">${tr('The note draft stays in this browser until you send it', 'El borrador de la nota queda en este navegador hasta que lo envíes')}</div><span class="dk-sp"></span><button type="button" class="dk-btn pri" data-dk="sendnote"${busy || outdated ? ' disabled' : ''}>${ic('send')}${tr('Send note', 'Enviar nota')}</button>`;
  }
  if (step === 'sent' || !queue.length) { return ''; }
  if (step === 'review') {
    const count = Math.min(n, SWEEP_MAX_ANSWERS);
    return `<button type="button" class="dk-btn ghost" data-dk="goto" data-i="0">${ic('left')}${tr('Back to items', 'Volver a los ítems')}</button><span class="dk-sp"></span><span class="dk-hint"><kbd>⌘</kbd> <kbd>Enter</kbd></span><button type="button" class="dk-btn pri" data-dk="send"${n && !busy && !outdated ? '' : ' disabled'}>${ic('send')}${tr(`Send ${count} answer${count === 1 ? '' : 's'}`, `Enviar ${count} respuesta${count === 1 ? '' : 's'}`)}</button>`;
  }
  const keys = shownOptions(queue[step] ?? { options: [], recommend: [] }).filter(o => o.key.length === 1).map(o => o.key).sort().map(k => `<kbd>${esc(k)}</kbd>`).join(' ');
  return `<div class="dk-saved"><i></i>${tr(`Draft saved · ${n} of ${queue.length} ready`, `Borrador guardado · ${n} de ${queue.length} listas`)}</div><span class="dk-hint"><kbd>←</kbd> <kbd>→</kbd> ${tr('item', 'ítem')}${keys ? ` · ${keys} ${tr('pick', 'elegir')}` : ''}</span><span class="dk-sp"></span>
    <button type="button" class="dk-ib" data-dk="prev" aria-label="${tr('Previous item', 'Ítem anterior')}"${step === 0 ? ' disabled' : ''}>${ic('left')}</button><button type="button" class="dk-ib" data-dk="next" aria-label="${tr('Next item', 'Ítem siguiente')}"${step === queue.length - 1 ? ' disabled' : ''}>${ic('right')}</button>
    <button type="button" class="dk-btn pri" data-dk="review">${tr('Review and send', 'Revisar y enviar')}${n ? ` · ${n}` : ''}</button>`;
}

function body(): string {
  if (tab === 'notes') { return noteView(); }
  if (step === 'sent' && sent) { return sentView(sent); }
  if (!queue.length) { return emptyView(); }
  if (step === 'review') { return reviewView(); }
  return itemView(queue[typeof step === 'number' ? Math.min(step, queue.length - 1) : 0]);
}

function sheet(): string {
  const tabButton = (id: typeof tab, label: string) => `<button type="button" role="tab" aria-selected="${tab === id}" data-dk="tab" data-t="${id}">${label}</button>`;
  const warning = outdated ? OUTDATED() : refusal;
  const steps = tab === 'questions' && step !== 'sent' && queue.length > 0 ? stepper() : '';
  return `<section class="dk-sheet" role="dialog" aria-label="${tr('Decisions', 'Decisiones')}" tabindex="-1">
    <div class="dk-head"><div class="dk-tabs" role="tablist">${tabButton('questions', `${tr('Questions', 'Preguntas')} <span class="n">${queue.length}</span>`)}${tabButton('notes', `${tr('Notes', 'Notas')}${kept.length ? ` <span class="n">${kept.length}</span>` : ''}`)}</div>
      <span class="dk-sp"></span><button type="button" class="dk-ib" data-dk="collapse" aria-label="${tr('Collapse to a pill', 'Colapsar a una píldora')}" title="${tr('Collapse (Esc)', 'Colapsar (Esc)')}">${ic('down')}</button><button type="button" class="dk-ib" data-dk="hide" aria-label="${tr('Hide to a small button', 'Ocultar a un botón pequeño')}" title="${tr('Hide', 'Ocultar')}">${ic('min')}</button></div>
    ${warning ? `<div class="dk-warn" role="alert">${esc(warning)}</div>` : ''}${steps}<div class="dk-body" id="dk-body">${body()}</div><div class="dk-foot" id="dk-foot">${footer()}</div>${toastLine ? `<div class="dk-toast" role="status">${esc(toastLine)}</div>` : ''}</section>`;
}

function render(keepFocus = false): void {
  const el = root();
  if (!el) { return; }
  // The dock's keys act only while the focus is inside it, so a redraw has to give the focus back.
  const had = el.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const key = had ? { id: had.id, dk: had.dataset.dk, k: had.dataset.k, i: had.dataset.i, item: had.dataset.id, at: had instanceof HTMLInputElement || had instanceof HTMLTextAreaElement ? had.selectionStart : null } : null;
  const scroll = $('#dk-body', el)?.scrollTop ?? 0;
  el.dataset.mode = mode;
  el.innerHTML = mode === 'expanded' ? sheet() : mode === 'hidden' ? mini() : pill();
  place();
  const scrolled = $('#dk-body', el);
  if (scrolled && keepFocus) { scrolled.scrollTop = scroll; }
  if (!had) { return; }
  let next: HTMLElement | null = null;
  if (keepFocus && key?.id) { next = $(`#${CSS.escape(key.id)}`, el); }
  else if (keepFocus && key?.dk) {
    const attr = (name: string, value: string | undefined) => (value ? `[${name}="${CSS.escape(value)}"]` : '');
    next = $(`[data-dk="${key.dk}"]${attr('data-k', key.k)}${attr('data-i', key.i)}${attr('data-id', key.item)}`, el);
  }
  next ??= $(mode === 'expanded' ? '.dk-sheet' : '.dk-pill, .dk-mini', el);
  next?.focus({ preventScroll: true });
  if (key?.at !== null && key?.at !== undefined && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement)) { next.setSelectionRange(key.at, key.at); }
}

// While the owner types, only the parts around the field change; a part left identical is not replaced, or a click on it is lost.
function patch(): void {
  const el = root();
  if (!el) { return; }
  if (mode !== 'expanded') { render(); return; }
  const steps = $('.dk-steps', el);
  if (steps) {
    const next = stepper();
    if (steps.outerHTML !== next) { steps.outerHTML = next; }
  }
  const foot = $('#dk-foot', el);
  if (foot) {
    const next = footer();
    if (foot.innerHTML !== next) { foot.innerHTML = next; }
  }
}

function place(): void {
  const el = root();
  if (!el) { return; }
  const drawer = $('#drawer');
  el.style.removeProperty('--dk-cx');
  el.style.removeProperty('--dk-room');
  if (!drawer || drawer.hidden || !drawer.offsetWidth || innerWidth <= 760) { return; }
  const nav = $('#side-nav')?.getBoundingClientRect().right ?? 0;
  const free = innerWidth - drawer.offsetWidth - nav - 24;
  // Narrower than this the sheet reads worse than it covers, so it keeps its width and overlaps the panel.
  const room = free >= ROOM_MIN ? free : innerWidth - 24;
  const width = mode === 'expanded' ? Math.min(SHEET_MAX, room) : mode === 'hidden' ? 40 : 330;
  el.style.setProperty('--dk-room', `${room}px`);
  el.style.setProperty('--dk-cx', `${Math.max((innerWidth - drawer.offsetWidth) / 2, nav + 12 + width / 2)}px`);
}

function say(line: string): void {
  toastLine = line;
  render(true);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastLine = ''; $('.dk-toast')?.remove(); }, 1600);
}

function setMode(next: Mode): void {
  mode = next;
  if (next !== 'expanded') {
    if (step === 'sent') { step = 0; }
    save(MODE_KEY, next);
  }
  render();
  if (next === 'expanded') { $('.dk-sheet')?.focus({ preventScroll: true }); }
}

function goTo(next: Step): void {
  tab = 'questions';
  step = typeof next === 'number' ? Math.max(0, Math.min(next, queue.length - 1)) : next;
  render();
}

function pick(id: string, key: string): void {
  const e = queue.find(x => x.id === id);
  if (!e) { return; }
  commit(() => {
    const d = draft(id);
    const had = d.c.includes(key);
    if (e.multi) { d.c = had ? d.c.filter(k => k !== key) : [...d.c, key]; }
    else { d.c = had ? [] : [key]; }
    d.q = e.question;
    d.l = labelsOf(e, d.c);
  });
  render(true);
}

async function http(path: string, payload: Record<string, unknown>): Promise<{ status: number, json: Record<string, unknown> } | null> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sprint-board': '1' }, body: JSON.stringify({ sprint: deps.slug(), ...payload }) });
    return { status: r.status, json: await r.json().catch(() => ({})) as Record<string, unknown> };
  }
  catch { return null; }
}

// The open sheet says it in its own banner; a collapsed dock has nowhere else to say it.
function failed(message: string): void {
  refusal = message;
  if (mode !== 'expanded') { toast(message); }
  render(true);
}

const NO_SERVER = () => tr('The local server is not answering. Nothing was sent; your drafts stay in this browser.', 'El servidor local no responde. No se envió nada; tus borradores quedan en este navegador.');

async function send(): Promise<void> {
  const ready = queue.filter(e => isReady(e.id)).slice(0, SWEEP_MAX_ANSWERS);
  if (!ready.length || busy) { return; }
  if (deps.demo()) { toast(tr('Demo: on your real board this records the batch.', 'Demo: en tu tablero real esto registra el lote.')); return; }
  if (outdated) { render(true); return; }
  busy = true;
  refusal = '';
  render(true);
  const sending = new Set(ready.map(e => e.id));
  const answers = ready.map((e) => { const d = draft(e.id); return { item: e.id, kind: e.kind, choice: [...d.c], text: d.t.trim() || undefined }; });
  const asSent = new Map(ready.map(e => [e.id, JSON.stringify([draft(e.id).c, draft(e.id).t])]));
  const r = await http('/api/sweep/send', { answers, skipped: queue.filter(e => !sending.has(e.id)).map(e => e.id) });
  if (!r) { busy = false; failed(NO_SERVER()); return; }
  const out = sendOutcome(r.status, r.json);
  if (out.kind !== 'sent' && out.kind !== 'none') {
    busy = false;
    if (out.kind === 'outdated') { outdated = true; }
    failed(out.kind === 'outdated' ? OUTDATED() : `${tr('Not sent', 'No se envió')}: ${out.message}`);
    return;
  }
  const results = Object.entries(out.results) as [string, SweepResult][];
  // A draft edited during the send, or one that was not written, stays: it is kept once its item leaves the list.
  commit(() => {
    for (const [id, result] of results) {
      if (result === 'written' && JSON.stringify([drafts[id]?.c, drafts[id]?.t]) === asSent.get(id)) { delete drafts[id]; }
    }
  });
  if (out.kind === 'sent') {
    const written = results.filter(([, v]) => v === 'written').length;
    if (tab === 'questions' && step === 'review') {
      sent = { batch: out.batch, n: written, left: results.length - written, at: localHhmm(new Date().toISOString()) };
      step = 'sent';
    }
    else { toast(tr(`${written} answer${written === 1 ? '' : 's'} sent`, `${written} respuesta${written === 1 ? '' : 's'} enviada${written === 1 ? '' : 's'}`)); }
  }
  else { toast(tr('Nothing was written: those items were already answered or closed elsewhere.', 'No se escribió nada: esos ítems ya estaban respondidos o cerrados en otro lado.')); }
  await deps.refresh();
  busy = false;
  if (reconcile(false)) { return; }
  if (typingField()) { patch(); lastSig = ''; }
  else { render(step !== 'sent'); }
}

async function sendNote(): Promise<void> {
  const text = note.text.trim();
  if (!text) { $('#dk-note-t')?.focus(); return; }
  if (busy) { return; }
  if (deps.demo()) { toast(tr('Demo: on your real board this records the note.', 'Demo: en tu tablero real esto registra la nota.')); return; }
  if (outdated) { render(true); return; }
  if (text.length > NOTE_MAX) { failed(tr(`The note is ${text.length} characters, the limit is ${NOTE_MAX}; shorten it.`, `La nota tiene ${text.length} caracteres, el límite es ${NOTE_MAX}; acórtala.`)); return; }
  busy = true;
  refusal = '';
  const r = await http('/api/msg', { text, via: 'dock', ticket: note.ticket || undefined });
  if (!r || r.status !== 200 || r.json.ok !== true) {
    busy = false;
    failed(r ? `${tr('Not sent', 'No se envió')}: ${String(r.json.error ?? r.status)}` : NO_SERVER());
    return;
  }
  commit(() => { if (note.text.trim() === text) { note.text = ''; } });
  await deps.refresh();
  busy = false;
  if (reconcile(false)) { return; }
  say(tr('Note sent. A running sentinel picks it up within seconds.', 'Nota enviada. Un sentinel activo la recoge en segundos.'));
  if (tab === 'notes') { $('#dk-note-t')?.focus(); }
}

function onClick(e: MouseEvent): void {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-dk]');
  if (!t || !root()?.contains(t)) { return; }
  const { dk, id = '' } = t.dataset;
  const at = typeof step === 'number' ? step : 0;
  switch (dk) {
    case 'expand': setMode('expanded'); break;
    case 'collapse':
    case 'done': setMode('collapsed'); break;
    case 'hide': setMode('hidden'); break;
    case 'tab': tab = t.dataset.t === 'notes' ? 'notes' : 'questions'; refusal = ''; render(); break;
    case 'goto': goTo(Number(t.dataset.i)); break;
    case 'prev': goTo(at - 1); break;
    case 'next': goTo(at + 1); break;
    case 'review': goTo('review'); break;
    case 'pick': pick(id, t.dataset.k ?? ''); break;
    case 'slide': {
      const count = queue.find(x => x.id === id)?.media.length;
      if (count) { slide[id] = ((slide[id] ?? 0) + Number(t.dataset.d) + count) % count; render(true); }
      break;
    }
    case 'slideto': slide[id] = Number(t.dataset.j); render(true); break;
    case 'copy': {
      const refused = () => say(tr('This browser refused the copy', 'El navegador rechazó la copia'));
      if (!navigator.clipboard) { refused(); break; }
      void navigator.clipboard.writeText(t.dataset.p ?? '').then(() => say(tr('Path copied', 'Ruta copiada')), refused);
      break;
    }
    case 'send': void send(); break;
    case 'sendnote': void sendNote(); break;
    case 'reuse':
    case 'discard':
      commit(() => {
        const draftKept = kept.find(k => k.id === id);
        if (draftKept && dk === 'reuse') { addToNote(`${draftKept.q}: ${[...draftKept.l, draftKept.t].filter(Boolean).join(' · ')}`); }
        kept = kept.filter(k => k.id !== id);
      });
      render(true);
      break;
  }
}

function onInput(e: Event): void {
  const t = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (t.dataset.dk === 'free') {
    const id = t.dataset.id ?? '';
    commit(() => {
      const d = draft(id);
      d.t = t.value;
      d.q = queue.find(e => e.id === id)?.question ?? d.q;
    });
    t.closest('.dk-other')?.classList.toggle('has', Boolean(t.value.trim()));
    patch();
  }
  else if (t.id === 'dk-note-t') { commit(() => { note.text = t.value; }); }
  else if (t.id === 'dk-note-tk') { commit(() => { note.ticket = t.value; }); }
}

function trapTab(el: HTMLElement, e: KeyboardEvent): void {
  const stops = $$('button:not([disabled]), a[href], input, textarea, select', el).filter(x => x.offsetParent !== null);
  if (!stops.length) { return; }
  const at = stops.indexOf(document.activeElement as HTMLElement);
  if (e.shiftKey && at <= 0) { e.preventDefault(); stops.at(-1)!.focus(); }
  else if (!e.shiftKey && at === stops.length - 1) { e.preventDefault(); stops[0].focus(); }
}

// Capture phase: the keys the dock takes must not also reach the board's own handler.
function onKey(e: KeyboardEvent): void {
  const el = root();
  if (!el || el.hidden) { return; }
  const target = e.target as HTMLElement;
  const typing = Boolean(target.closest('input, textarea, select'));
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey;
  if (e.key === 'Escape') {
    if (mode === 'expanded' && $('#lightbox')?.hidden !== false) {
      e.preventDefault();
      e.stopPropagation();
      setMode('collapsed');
    }
    return;
  }
  if (mode !== 'expanded') {
    if (!typing && plain && e.key.toLowerCase() === 'd') { e.preventDefault(); setMode('expanded'); }
    return;
  }
  if (!el.contains(target)) { return; }
  if (e.key === 'Tab') { trapTab(el, e); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    // A held chord would walk from the review straight into the send, which is final.
    if (e.repeat) { return; }
    if (tab === 'notes') { void sendNote(); }
    else if (step === 'review') { void send(); }
    else if (queue.length && step !== 'sent') { goTo('review'); }
    return;
  }
  if (typing || !plain) { return; }
  const digit = /^\d$/.test(e.key);
  if (digit) { e.stopPropagation(); }
  if (tab !== 'questions' || typeof step !== 'number' || !queue.length) { return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(step - 1); }
  else if (e.key.length === 1) {
    const item = queue[step];
    const option = optionForKey(item, e.key);
    if (option) { e.preventDefault(); e.stopPropagation(); pick(item.id, option.key); }
  }
}

function pruneDrafts(fresh: boolean): void {
  const open = new Map(queue.map(e => [e.id, e]));
  // An id this tab never listed may be another tab's draft on an item this one has not fetched yet.
  const gone = (id: string) => !open.has(id) && (fresh || seen.has(id));
  const stray = ([id, d]: [string, Draft]) => gone(id) || d.c.some(k => open.has(id) && !optionForKey(open.get(id)!, k));
  load();
  if (!Object.entries(drafts).some(stray)) { return; }
  let moved = 0;
  commit(() => {
    for (const [id, d] of Object.entries(drafts)) {
      const entry = open.get(id);
      if (entry) { d.c = d.c.filter(k => optionForKey(entry, k)); continue; }
      if (!gone(id)) { continue; }
      if (hasContent(d)) {
        kept = [...kept.filter(k => k.id !== id), { id, q: d.q ?? '', l: d.l ?? [], t: d.t.trim() }];
        moved++;
      }
      delete drafts[id];
    }
  });
  if (!moved) { return; }
  toast(tr(`${moved} unsent draft${moved === 1 ? '' : 's'} moved to the Notes tab: answered or closed elsewhere.`, `${moved} borrador${moved === 1 ? '' : 'es'} sin enviar pasaron a la pestaña Notas: respondidos o cerrados en otro lado.`));
}

// The item being typed into is gone: its text moves to the note, and the typing carries on there.
function moveTyping(id: string, text: string): void {
  commit(() => {
    if (text.trim()) { addToNote(text); }
    delete drafts[id];
  });
  tab = 'notes';
  refusal = tr('That question was answered or closed while you were typing. Your text moved to this note.', 'Esa pregunta se respondió o se cerró mientras escribías. Tu texto pasó a esta nota.');
  render();
  const area = $<HTMLTextAreaElement>('#dk-note-t');
  area?.focus();
  area?.setSelectionRange(area.value.length, area.value.length);
}

// True when it redrew the sheet itself.
function reconcile(fresh: boolean): boolean {
  // An older server lists no dock items, and a send in flight owns its drafts: neither is a reason to drop one.
  if (outdated || busy) { return false; }
  const field = typingField();
  const typed = field instanceof HTMLInputElement && field.dataset.dk === 'free' ? field : null;
  const orphan = typed && !queue.some(e => e.id === typed.dataset.id) ? typed : null;
  if (orphan) { moveTyping(orphan.dataset.id ?? '', orphan.value); }
  pruneDrafts(fresh);
  for (const e of queue) { seen.add(e.id); }
  return Boolean(orphan);
}

const signature = (s: BoardState): string => JSON.stringify([s.sprint.slug, getLang(), outdated, queue, queue.map(isStale), s.sweep?.notes, s.sweep?.batches.map(b => [b.id, b.consumed]), s.tickets.filter(t => t.inScope).map(t => t.id)]);

function redraw(): void {
  if (typingField()) { patch(); lastSig = ''; return; }
  if (state) { lastSig = signature(state); }
  render(true);
}

// Deferred past the click in progress: replacing a button between press and release swallows it.
function catchUp(): void {
  setTimeout(() => {
    if (!lastSig && !pressed && state && !root()?.hidden && !typingField()) { redraw(); }
  }, 0);
}

function announce(arrived: DockEntry[]): void {
  if (!arrived.length || mode === 'expanded') { return; }
  $('#dk-badge')?.classList.add('bump');
  // A new needs-you card already raises the board's own notification.
  const items = arrived.filter(a => a.kind === 'sweep');
  if (!items.length || state?.mode !== 'live') { return; }
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      void new Notification(`Sprint Board: ${items.length === 1 ? 'a decision is waiting' : `${items.length} decisions are waiting`}`, { body: items.map(a => a.question).join('\n').slice(0, 200) });
    }
  }
  catch { /* notifications unavailable */ }
}

function update(next: BoardState | null): void {
  const el = root();
  if (!el) { return; }
  el.hidden = !dockShown(next, deps.served);
  if (el.hidden || !next) { return; }
  const newBoard = state?.sprint.slug !== next.sprint.slug;
  const viewing = !newBoard && typeof step === 'number' ? queue[step]?.id : undefined;
  state = next;
  outdated = serverLacksDock(next);
  if (newBoard) {
    restore();
    seen.clear();
    lastIds = null;
    sent = null;
    step = 0;
    refusal = '';
  }
  queue = dockQueue(next);
  if (typeof step === 'number') {
    const same = queue.findIndex(e => e.id === viewing);
    step = same >= 0 ? same : Math.max(0, Math.min(step, queue.length - 1));
  }
  const redrawn = reconcile(lastIds === null);
  const arrived = lastIds ? queue.filter(e => !lastIds!.has(e.id)) : [];
  lastIds = new Set(queue.map(e => e.id));
  if (!redrawn && (signature(next) !== lastSig || !el.innerHTML)) { redraw(); }
  announce(arrived);
}

export function initDock(d: DockDeps): { update: (s: BoardState | null) => void } {
  deps = d;
  const el = root();
  if (!el) { return { update() {} }; }
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  // An image that moved or sits outside the served roots says so instead of showing a broken icon.
  el.addEventListener('error', (e) => {
    const img = e.target as HTMLElement;
    if (img.tagName !== 'IMG') { return; }
    const span = document.createElement('span');
    span.className = 'dk-noimg';
    span.textContent = UNAVAILABLE();
    img.replaceWith(span);
  }, true);
  el.addEventListener('focusout', catchUp);
  document.addEventListener('pointerdown', () => { pressed = true; }, true);
  for (const end of ['pointerup', 'pointercancel']) { document.addEventListener(end, () => { pressed = false; catchUp(); }, true); }
  window.addEventListener('storage', (e: StorageEvent) => {
    if (!state || e.key !== storeKey()) { return; }
    load();
    redraw();
  });
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', (e) => {
    if (mode === 'expanded' && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest('#lightbox, #toast')) { setMode('collapsed'); }
  });
  const drawer = $('#drawer');
  if (drawer && 'ResizeObserver' in window) { new ResizeObserver(place).observe(drawer); }
  addEventListener('resize', place);
  return { update };
}
