import type { MergeRaw } from '../merge.ts';
import type { AskState, BoardState, BugGroup, EvidenceFilter } from '../model.ts';
import type { Demo } from './demo.ts';
import type { Ctx, View } from './views.ts';
/**
 * Boot + wiring. Three data sources, one renderer:
 *   live      fetched from the local server, refreshed on every SSE "changed"
 *   snapshot  embedded in the page (archive, share copy or sprint report), no server needed
 *   demo      the tour's invented sprint, folded in the browser
 */
import { askPhaseCounts, isUnsent, localHhmm, slackBugSummary, slackTableHtml, slackTablePlain, trackerName, WATCH_STALE_MIN, watchersDown, watchLiveness } from '../model.ts';
import { makeDemo } from './demo.ts';
import { getLang, setLang, tr } from './i18n.ts';
import { mergeNeeds, prDrawer, viewMerge } from './merge-view.ts';
import { startTour } from './tour.ts';
import { $, $$, ago, copyImage, copyRich, esc, hhmm, save, slackHtml, slackPlain, store, toast } from './util.ts';
import { askPhaseLabel, askUndo, BOARD_VIEWS, ctxOf, drawer, fixturesNow, REPORT_VIEWS, routeView, SHARE_HIDDEN, viewBugs, viewEvidence, viewHistory, viewMetrics, viewNow, viewPeople, viewReport, viewTickets, viewTimeline } from './views.ts';
/** Phone width: the nav becomes an overlay (styles.css uses the same 760px). */
const phoneQuery = matchMedia('(max-width: 760px)');
const phone = () => phoneQuery.matches;

const embedded = (() => {
  const raw = $('#board-data')?.textContent?.trim();
  if (!raw) { return null; }
  try { return JSON.parse(raw) as BoardState & { images?: Record<string, string> }; }
  catch { return null; }
})();

const params = new URLSearchParams(location.search);
const viewingSlug = params.get('sprint') ?? undefined;

let real: BoardState | null = embedded;
let demo: Demo | null = null;
let demoState: BoardState | null = null;
let filter = '';
let openId: string | null = null;
/** Merge Line: the collector's last reading (repo-wide, not per sprint) and the PR open in the drawer. */
let mergeRaw: MergeRaw | null = null;
let openPr: number | null = null;
let lastEventAt = 0;
let connected = false;
let pendingReal = 0;
let lastNeeds = -1;
let sprints: Ctx['sprints'] = [];
let archives: string[] = [];
let replyTo: string | null = null;
let bugGroup: 'all' | BugGroup = 'all';
let evidenceFilter: EvidenceFilter = {};
/** Open evidence accordions by key (`<ticket>`, `<ticket>/<tc>`, `<ticket>/_`): closed by default, kept across live re-renders. */
const evidenceOpen = new Set<string>();

// Theme: auto follows the OS; light/dark pin it (the owner reads this in sunlight).
// index.html applies the saved choice before first paint; this keeps it in sync.
type Theme = 'auto' | 'light' | 'dark';
const asTheme = (v: unknown): Theme => (v === 'light' || v === 'dark' ? v : 'auto');
let theme: Theme = asTheme(store<unknown>('sprint-board-theme', 'auto'));
function applyTheme(): void {
  if (theme === 'auto') { document.documentElement.removeAttribute('data-theme'); }
  else { document.documentElement.dataset.theme = theme; }
  const label = { auto: tr('Auto', 'Auto'), light: tr('Light', 'Claro'), dark: tr('Dark', 'Oscuro') };
  const hint = { auto: tr('Follow the system setting', 'Seguir al sistema'), light: tr('Always light (bright rooms, sunlight)', 'Siempre claro (sala con luz, sol)'), dark: tr('Always dark', 'Siempre oscuro') };
  for (const b of $$('[data-set-theme]')) {
    const t = asTheme(b.dataset.setTheme);
    b.setAttribute('aria-pressed', String(t === theme));
    b.title = hint[t];
    b.querySelector('span')!.textContent = label[t];
  }
  $('.theme-seg')?.setAttribute('aria-label', tr('Theme', 'Tema'));
}

const live = () => !embedded;
const current = (): BoardState | null => demoState ?? real;
const pageMode = () => (demoState ? 'demo' : real?.mode);
/** The views the digit keys walk, in order. */
const navViews = () => (pageMode() === 'report' ? REPORT_VIEWS : BOARD_VIEWS);
const view = (): View => routeView(location.hash.slice(1), pageMode());

function img(path: string): string | null {
  if (demoState) { return null; }
  if (embedded) { return embedded.images?.[path] ?? null; }
  return `/files/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function ctx(state: BoardState): Ctx {
  const focusModule = openId ? state.tickets.find(t => t.id === openId)?.module : undefined;
  return ctxOf(state, { filter, canWrite: Boolean(demoState) || (live() && !state.sprint.closedAt), img, sprints, archives, viewingSlug: viewingSlug ?? state.sprint.slug, replyTo, focusModule, bugGroup, evidenceFilter, evidenceOpen });
}

/** The Now rail's test data follows the ticket open in the drawer, without a full re-render. */
function refreshFixtures(): void {
  const state = current();
  const el = $('#now-fixtures');
  if (state && el) { el.outerHTML = fixturesNow(ctx(state)); }
}

// ---------------------------------------------------------------------------
// Render (with FLIP: cards that changed lane glide there instead of jumping)
// ---------------------------------------------------------------------------

function renderMergeBadge(): void {
  const n = live() && !demoState ? mergeNeeds(mergeRaw) : 0;
  const el = $('#merge-count');
  if (!el) { return; }
  el.hidden = !n;
  el.textContent = String(n);
  el.title = tr(`${n} pull requests need you`, `${n} PR te necesitan`);
}

function render(): void {
  const state = current();
  const v = view();
  for (const a of $$('nav.side a')) { a.classList.toggle('on', a.dataset.view === v); }
  for (const b of $$('[data-set-lang]')) { b.setAttribute('aria-pressed', String(b.dataset.setLang === getLang())); }
  applyTheme();
  renderMergeBadge();
  // Merge Line is repo-wide: it renders with or without a sprint board.
  if (v === 'merge') {
    // The header names the page, not a sprint: this view is repo-wide.
    $('#sprint-name')!.textContent = 'Merge Line';
    $('#sprint-day')!.textContent = mergeRaw?.state?.mainSha ? `main ${mergeRaw.state.mainSha}` : 'main';
    $('#env-chip')!.textContent = mergeRaw?.state?.repo?.split('/').at(-1) ?? tr('repository', 'repositorio');
    document.title = `${mergeNeeds(mergeRaw) ? `(${mergeNeeds(mergeRaw)}) ` : ''}Merge Line`;
    $('#view')!.innerHTML = viewMerge(demoState ? null : mergeRaw, { live: live() && !demoState });
    if (openPr != null) {
      const body = mergeRaw && prDrawer(mergeRaw, openPr);
      if (body) { $('#drawer-body')!.innerHTML = body; }
      else { closeDrawer(); }
    }
    return;
  }
  if (!state) {
    $('#view')!.innerHTML = `<section class="panel"><h2>${tr('No sprint board yet', 'Todavía no hay tablero')}</h2><p class="hint">${tr('Start one with', 'Crea uno con')} <code>bun cli/sprint-board/index.ts new --sprint 23</code> ${tr('then', 'y luego')} <code>sync --discover</code>. ${tr('Or press Tour to see a demo sprint.', 'O presiona Tour para ver un sprint de demo.')}</p></section>`;
    return;
  }
  const c = ctx(state);
  const before = new Map($$('[data-card]').map(el => [el.dataset.card!, el.getBoundingClientRect()]));

  $('#sprint-name')!.textContent = state.sprint.name;
  if (state.mode === 'report') { $('.brand b')!.textContent = tr('Sprint Report', 'Reporte del sprint'); }
  const dayN = Math.floor((Date.parse(state.sprint.closedAt ?? (state.mode === 'live' ? new Date().toISOString() : state.generatedAt)) - Date.parse(state.sprint.startedAt)) / 86_400_000) + 1;
  $('#sprint-day')!.textContent = state.sprint.closedAt ? `${tr('Closed', 'Cerrado')} ${state.sprint.closedAt.slice(0, 10)}` : `${tr('Day', 'Día')} ${dayN}`;
  $('#env-chip')!.textContent = state.sprint.env ?? tr('test environment', 'entorno de pruebas');
  // A live update re-renders the page: keep what the owner is typing, and where.
  const kept = $$<HTMLTextAreaElement>('textarea[data-keep]').map(ta => ({ id: ta.id, value: ta.value, focus: document.activeElement === ta, at: ta.selectionStart }));
  const html = { now: viewNow, metrics: viewMetrics, people: viewPeople, tickets: viewTickets, bugs: viewBugs, timeline: viewTimeline, evidence: viewEvidence, history: viewHistory, report: viewReport }[v](c);
  $('#view')!.innerHTML = `<div style="display:grid;gap:12px">${state.warnings.map(w => `<div class="stale">${esc(w)}</div>`).join('')}${html}</div>`;
  for (const k of kept) {
    const ta = document.getElementById(k.id) as HTMLTextAreaElement | null;
    if (!ta) { continue; }
    ta.value = k.value;
    if (k.focus) { ta.focus(); ta.setSelectionRange(k.at, k.at); }
  }

  const phases = askPhaseCounts(state.asks);
  const owed = (['approve', 'send', 'read'] as const).filter(p => phases[p]);
  const pc = $('#people-count')!;
  pc.hidden = !owed.length;
  pc.textContent = String(owed.reduce((n, p) => n + phases[p], 0));
  pc.title = owed.map(p => `${phases[p]} ${askPhaseLabel(p, Boolean(state.messenger)).toLowerCase()}`).join(', ');
  // The Bugs entry carries how many still block a ticket: the count that needs a developer now.
  const blocking = (state.bugs ?? []).filter(b => b.group === 'blocking').length;
  const bc = $('#bugs-count')!;
  bc.hidden = !blocking;
  bc.textContent = String(blocking);
  bc.title = tr(`${blocking} still blocking a ticket`, `${blocking} siguen bloqueando un ticket`);

  const needs = c.m.byLane['Needs you'];
  document.title = state.mode === 'report' ? `${state.sprint.name} QA Report` : `${needs ? `(${needs}) ` : ''}${state.mode === 'demo' ? 'Demo · ' : ''}Sprint Board`;
  if (live() && !demoState && lastNeeds >= 0 && needs > lastNeeds) { notify(state, needs - lastNeeds); }
  if (!demoState) { lastNeeds = needs; }

  $('#foot-source')!.textContent = state.mode === 'demo'
    ? tr('Demo data', 'Datos de demo')
    : state.mode === 'report'
      ? '' // the report's own footer says when it was generated
      : state.mode === 'live'
        ? `${tr('Local data', 'Datos locales')}: .session/sprint-board/sprints/${state.sprint.slug}`
        : `${tr('Frozen copy from', 'Copia congelada del')} ${state.generatedAt.slice(0, 16).replace('T', ' ')}Z`;
  const trk = trackerName(state.tracker?.source);
  $('#foot-tracker')!.textContent = state.tracker ? `${trk} ${tr('synced', 'sincronizado')} ${hhmm(state.tracker.syncedAt)} · ${state.tracker.searched.tickets} ${tr('tickets', 'tickets')}, ${state.tracker.searched.tcs} TCs` : tr(`${trk} not synced yet`, `${trk} aún sin sincronizar`);

  if (openId) {
    const t = state.tickets.find(x => x.id === openId);
    if (t) { $('#drawer-body')!.innerHTML = drawer(t, c); }
    else { closeDrawer(); }
  }

  // FLIP
  for (const el of $$('[data-card]')) {
    const b = before.get(el.dataset.card!);
    if (!b) { continue; }
    const a = el.getBoundingClientRect();
    const dx = b.left - a.left; const dy = b.top - a.top;
    if (Math.abs(dx) + Math.abs(dy) < 4) { continue; }
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.2,.8,.2,1)' });
    el.classList.add('flash');
  }
}

function notify(state: BoardState, n: number): void {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const t = state.tickets.find(x => x.lane === 'Needs you');
      void new Notification(`Sprint Board: ${n} new ${n === 1 ? 'item needs' : 'items need'} you`, { body: t ? `${t.id} ${t.needs[0]?.question ?? ''}` : '' });
    }
  }
  catch { /* notifications unavailable */ }
}

// ---------------------------------------------------------------------------
// Live data
// ---------------------------------------------------------------------------

async function fetchState(): Promise<void> {
  try {
    const r = await fetch(`/api/state${viewingSlug ? `?sprint=${encodeURIComponent(viewingSlug)}` : ''}`, { cache: 'no-store' });
    if (r.ok) { real = await r.json(); }
    else if (r.status === 404) { real = null; }
  }
  catch { /* server down: keep the last state, the stale bar says so */ }
  if (demoState) { pendingReal++; return; }
  render();
}

async function fetchSprints(): Promise<void> {
  try {
    const r = await (await fetch('/api/sprints', { cache: 'no-store' })).json();
    sprints = r.sprints ?? [];
    archives = r.archives ?? [];
  }
  catch { /* offline */ }
}

async function fetchMerge(): Promise<void> {
  try {
    const r = await fetch('/api/merge', { cache: 'no-store' });
    if (r.ok) { mergeRaw = await r.json() as MergeRaw; }
  }
  catch { /* offline: keep the last reading */ }
  if (view() === 'merge') { render(); }
  else { renderMergeBadge(); }
}

function connect(): void {
  const es = new EventSource('/events');
  es.addEventListener('hello', () => { connected = true; lastEventAt = Date.now(); });
  es.addEventListener('changed', () => { lastEventAt = Date.now(); void fetchState(); void fetchSprints(); void fetchMerge(); });
  es.onmessage = () => { lastEventAt = Date.now(); };
  es.onerror = () => { connected = false; };
  // SSE comments (": ping") do not fire events; the 5 s ping still keeps the socket alive.
  setInterval(() => { if (es.readyState === EventSource.OPEN) { lastEventAt = Math.max(lastEventAt, Date.now() - 1000); connected = true; } }, 4000);
}

/** "Last watch pass HH:MM": red when the test-environment watch went quiet in working hours. Live board only. */
function tickWatch(): void {
  const chip = $('#watch-chip')!;
  const w = live() && !demoState && real && !real.sprint.closedAt ? watchLiveness(real.watch?.lastPassAt, new Date()) : null;
  chip.hidden = !w?.lastPassAt;
  if (!w?.lastPassAt) { return; }
  chip.classList.toggle('stale', w.state === 'stale');
  chip.textContent = `${tr('Last watch pass', 'Última pasada del watch')} ${localHhmm(w.lastPassAt)}`;
  chip.title = w.state === 'stale'
    ? tr(`No ${real!.sprint.env ?? 'test environment'} watch pass in the last ${WATCH_STALE_MIN} min of working hours. Check the conductor's sentinel (or its fallback cron).`, `Sin pasada del watch de ${real!.sprint.env ?? 'entorno de pruebas'} en los últimos ${WATCH_STALE_MIN} min de horario laboral. Revisa el sentinel del conductor (o su cron de respaldo).`)
    : w.state === 'off-hours'
      ? tr('Outside working hours (Mon-Fri 09:00-18:00)', 'Fuera de horario laboral (lun-vie 09:00-18:00)')
      : `${w.ageMin} min ${tr('ago', 'atrás')}`;
}

function tickWatchers(): void {
  const chip = $('#watchers-chip')!;
  const state = live() && !demoState && real && !real.sprint.closedAt ? real : null;
  const down = state ? watchersDown(state.watchers, new Date()) : [];
  chip.hidden = !down.length;
  const label = (name: string) => (name === 'sentinel' ? tr('Sentinel not running', 'Sentinel detenido') : tr(`${name} not running`, `${name} detenido`));
  const text = down.map(w => label(w.name)).join(' · ');
  // A live region: rewriting the same text every second would announce it again.
  if (chip.textContent !== text) { chip.textContent = text; }
  chip.title = down.map((w) => {
    const how = w.exitedAt ? `${tr('exited', 'terminó')} ${localHhmm(w.exitedAt)}` : tr('stopped without a clean exit', 'se detuvo sin cierre limpio');
    return `${w.name} (pid ${w.pid}): ${how}. ${tr('Start it again, or forget a retired one with', 'Vuelve a arrancarlo, o si lo retiraste olvídalo con')} bun run board watcher clear ${w.name} --sprint-slug ${state!.sprint.slug}`;
  }).join('\n');
}

function tickLive(): void {
  tickWatch();
  tickWatchers();
  const dot = $('#live-dot')!; const text = $('#live-text')!; const stale = $('#stale')!;
  if (demoState) { dot.className = 'live-dot'; text.textContent = 'Demo'; stale.hidden = true; return; }
  if (!live()) {
    dot.className = 'live-dot off';
    text.textContent = real?.mode === 'report' ? tr('Sprint report', 'Reporte del sprint') : real?.mode === 'share' ? tr('Shared copy', 'Copia compartida') : tr('Frozen copy', 'Copia congelada');
    stale.hidden = true;
    return;
  }
  const fresh = connected && Date.now() - lastEventAt < 12_000;
  dot.className = `live-dot${fresh ? '' : ' off'}`;
  text.textContent = fresh ? `Live · ${tr('checked', 'revisado')} ${ago(new Date(lastEventAt).toISOString())} ${tr('ago', 'atrás')}` : tr('Offline', 'Sin conexión');
  stale.hidden = fresh || !lastEventAt;
  if (!fresh && lastEventAt) { stale.textContent = `${tr('Stale since', 'Desactualizado desde')} ${new Date(lastEventAt).toISOString().slice(11, 16)}Z. ${tr('The local server stopped; restart it with', 'El servidor local se detuvo; reinícialo con')} bun cli/sprint-board/index.ts serve --open`; }
}

async function post(path: string, body: unknown): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sprint-board': '1' }, body: JSON.stringify({ sprint: current()?.sprint.slug, ...(body as object) }) });
    if (!r.ok) { toast((await r.json().catch(() => ({ error: r.statusText }))).error ?? 'failed'); return null; }
    return await r.json().catch(() => ({})) as Record<string, unknown>;
  }
  catch {
    toast(tr('The local server is not answering', 'El servidor local no responde'));
    return null;
  }
}

// ---------------------------------------------------------------------------
// Drawer, lightbox, demo
// ---------------------------------------------------------------------------

function openTicket(id: string): void {
  const state = current();
  const t = state?.tickets.find(x => x.id === id);
  if (!state || !t) { return; }
  openId = id;
  openPr = null;
  const d = $('#drawer')!;
  const body = $('#drawer-body')!;
  body.innerHTML = drawer(t, ctx(state));
  applyDrawerWidth();
  d.hidden = false;
  $('#scrim')!.hidden = false;
  body.scrollTop = 0;
  refreshFixtures();
}
function openPullRequest(n: number): void {
  const body = mergeRaw && prDrawer(mergeRaw, n);
  if (!body) { return; }
  openId = null;
  openPr = n;
  $('#drawer-body')!.innerHTML = body;
  applyDrawerWidth();
  $('#drawer')!.hidden = false;
  $('#scrim')!.hidden = false;
  $('#drawer-body')!.scrollTop = 0;
}
function closeDrawer(): void {
  const was = openId;
  openId = null;
  openPr = null;
  $('#drawer')!.hidden = true;
  $('#scrim')!.hidden = true;
  if (was) { refreshFixtures(); }
}

function go(v: string): void {
  if (location.hash !== `#${v}`) { history.replaceState(null, '', `${location.pathname}${location.search}#${v}`); }
  render();
}

const tourHost = {
  enterDemo() {
    demo = makeDemo();
    demoState = demo.state();
    pendingReal = 0;
    document.body.classList.add('demo');
    $('#demo-bar')!.hidden = false;
    $('#tour-fab')!.hidden = true;
    render();
  },
  exitDemo() {
    demo = null;
    demoState = null;
    document.body.classList.remove('demo');
    $('#demo-bar')!.hidden = true;
    $('#tour-fab')!.hidden = false;
    go('now');
    if (pendingReal) { toast(`${pendingReal} ${tr('real updates arrived during the tour', 'actualizaciones reales llegaron durante el tour')}`); }
    pendingReal = 0;
  },
  go,
  move(name: 'fail' | 'answer' | 'start') {
    if (!demo) { return; }
    demo.moves[name]();
    demoState = demo.state();
    render();
    const t = { fail: 'DEMO-7903 → Failed', answer: 'DEMO-7904 → Passed', start: 'DEMO-7907 → Running' }[name];
    toast(`${tr('Live update', 'Actualización en vivo')}: ${t}`);
  },
  openTicket,
  closeDrawer,
};

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => { void onClick(e); });

async function onClick(e: MouseEvent): Promise<void> {
  const el = e.target as HTMLElement;
  const hit = <T extends HTMLElement = HTMLElement>(sel: string) => el.closest<T>(sel);
  const state = current();

  const zoom = hit('[data-zoom]');
  if (zoom) { const lb = $('#lightbox')!; lb.querySelector('img')!.src = zoom.dataset.zoom!; lb.hidden = false; return; }
  if (hit('#lightbox')) { $('#lightbox')!.hidden = true; return; }
  if (hit('[data-close]') || hit('#scrim')) { closeDrawer(); return; }

  const pr = hit('[data-open-pr]');
  if (pr) { e.preventDefault(); openPullRequest(Number(pr.dataset.openPr)); return; }
  const open = hit('[data-open]');
  if (open && !hit('[data-copy-ask]') && !hit('[data-ask-id]')) { e.preventDefault(); openTicket(open.dataset.open!); return; }

  const th = hit('[data-set-theme]');
  if (th) { theme = asTheme(th.dataset.setTheme); save('sprint-board-theme', theme); applyTheme(); return; }

  const lang = hit('[data-set-lang]');
  if (lang) { setLang(lang.dataset.setLang === 'es' ? 'es' : 'en'); render(); return; }

  if (hit('#tour-fab')) { closeDrawer(); startTour(tourHost); return; }

  if (hit('#copy-slack') || hit('[data-copy-slack]')) {
    if (!state) { return; }
    const ok = await copyRich(slackTablePlain(state), slackTableHtml(state));
    toast(ok ? tr('Slack table copied. Paste with Cmd+V.', 'Tabla de Slack copiada. Pega con Cmd+V.') : tr('Copy failed', 'No se pudo copiar'));
    return;
  }
  if (hit('[data-copy-bugs]')) {
    if (!state) { return; }
    const { html, plain } = slackBugSummary(state);
    const ok = await copyRich(plain, html);
    toast(ok ? tr('Bug summary copied. Paste it in the team channel.', 'Resumen de bugs copiado. Pégalo en el canal del equipo.') : tr('Copy failed', 'No se pudo copiar'));
    return;
  }

  const grp = hit('[data-bug-group]');
  if (grp) { const g = grp.dataset.bugGroup as 'all' | BugGroup; bugGroup = bugGroup === g ? 'all' : g; render(); $<HTMLElement>(`[data-bug-group="${bugGroup}"]`)?.focus(); return; }

  const evAll = hit('[data-ev-all]');
  if (evAll) {
    evidenceOpen.clear();
    if (evAll.dataset.evAll === 'open') { for (const k of (evAll.dataset.keys ?? '').split(' ').filter(Boolean)) { evidenceOpen.add(k); } }
    render();
    $<HTMLElement>(`[data-ev-all="${evAll.dataset.evAll}"]`)?.focus();
    return;
  }

  if (hit('#nav-collapse') || hit('#nav-open')) { toggleNav(); return; }
  if (hit('#nav-scrim')) { setNavOpen(false); return; }
  if (hit('nav.side a[data-view]') && phone()) { setNavOpen(false); }

  const copyAsk = hit('[data-copy-ask]');
  if (copyAsk && state) {
    const a = state.asks.find(x => x.id === copyAsk.dataset.copyAsk);
    if (!a) { return; }
    const ok = await copyRich(slackPlain(a.text), slackHtml(a.text));
    if (!ok) { toast(tr('Copy failed', 'No se pudo copiar')); return; }
    if (live() && !demoState && (a.state === 'draft' || a.state === 'draft-failed' || a.state === 'drafted')) {
      toast(tr(`Copied. Paste it in ${a.to}'s DM.`, `Copiado. Pégalo en el DM de ${a.to}.`), { label: tr('Mark sent', 'Marcar enviado'), run: () => void post('/api/ask', { id: a.id, action: 'sent', expect: a.state }) });
    }
    else { toast(tr('Copied', 'Copiado')); }
    return;
  }

  const askButton = hit('[data-ask-id]');
  if (askButton && demoState) { toast(tr('Demo: on your real board this moves the message along.', 'Demo: en tu tablero real esto avanza el mensaje.')); return; }
  if (askButton) {
    const { askId: id, askAction: action, askState: target } = askButton.dataset;
    // `expect` is the state this page shows: if the ask moved meanwhile the server answers 409 and writes nothing.
    const expect = state?.asks.find(x => x.id === id)?.state;
    const done = await post('/api/ask', { id, action, state: target, expect }) as { noop: boolean, from: AskState, state: AskState, by?: string } | null;
    if (!done) { void fetchState(); return; }
    if (done.noop) { toast(tr(`Already ${done.state} (by ${done.by ?? '?'}). Nothing changed.`, `Ya estaba ${done.state} (por ${done.by ?? '?'}). No cambió nada.`)); return; }
    const said: Record<AskState, string> = {
      'draft': tr('Back to draft', 'Volvió a borrador'),
      'approved': tr('Approved. The draft is being created.', 'Aprobado. Se está creando el borrador.'),
      'drafted': tr('Marked drafted', 'Marcado como borrador creado'),
      'draft-failed': tr('Marked failed', 'Marcado como fallido'),
      'sent': isUnsent(done.from) ? tr('Marked sent. The wait clock started.', 'Marcado enviado. Arrancó el reloj de espera.') : tr('Back to sent', 'Volvió a enviado'),
      'answered': tr('Marked answered', 'Marcado respondido'),
      'closed': tr('Closed', 'Cerrado'),
      'dropped': tr('Dropped. Kept on record.', 'Descartado. Queda en el registro.'),
    };
    const undo = askUndo(done, Boolean(state?.messenger));
    toast(said[done.state], undo ? { label: tr('Undo', 'Deshacer'), run: () => void post('/api/ask', { id, state: undo, expect: done.state }) } : undefined);
    return;
  }

  const gotoInbox = hit('[data-goto-inbox]');
  if (gotoInbox) {
    e.preventDefault();
    const t = state?.inbox?.find(x => x.id === gotoInbox.dataset.gotoInbox);
    replyTo = t ? (t.replies.at(-1) ?? t).id : null;
    go('now');
    $('#inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $<HTMLTextAreaElement>('#inbox-text')?.focus();
    return;
  }
  const replyBtn = hit('[data-reply-to]');
  if (replyBtn) { replyTo = replyBtn.dataset.replyTo!; render(); $<HTMLTextAreaElement>('#inbox-text')?.focus(); return; }
  if (hit('[data-reply-cancel]')) { replyTo = null; render(); return; }
  const msgPick = hit('[data-msg-pick]');
  if (msgPick) { await sendMsg(msgPick.dataset.msgPick!, msgPick.dataset.reply); return; }
  if (hit('[data-msg-send]')) {
    const ta = $<HTMLTextAreaElement>('#inbox-text');
    const text = ta?.value.trim();
    if (!text) { ta?.focus(); return; }
    if (await sendMsg(text, replyTo ?? undefined) && ta) { ta.value = ''; }
    return;
  }

  const ci = hit('[data-copy-img]');
  if (ci) { toast((await copyImage(ci.dataset.copyImg!)) ? tr('Image copied', 'Imagen copiada') : tr('This browser refused the image copy', 'El navegador rechazó copiar la imagen')); return; }

  const pick = hit('[data-pick]');
  if (pick) { const ta = pick.closest('.need-box')?.querySelector('textarea'); if (ta) { ta.value = pick.dataset.pick!; ta.focus(); } return; }

  const ans = hit('[data-answer]');
  if (ans) {
    const ta = ans.closest('.need-box')?.querySelector('textarea');
    const text = ta?.value.trim();
    if (!text) { ta?.focus(); return; }
    if (demoState) { closeDrawer(); tourHost.move('answer'); return; }
    if (await post('/api/answer', { ticket: ans.dataset.answer, needId: ans.dataset.need, text })) { toast(tr('Answer saved. The worker can read it now.', 'Respuesta guardada. El worker ya la puede leer.')); }
  }
}

async function sendMsg(text: string, reply?: string): Promise<boolean> {
  if (demoState) { toast(tr('Demo: on your real board this reaches Claude.', 'Demo: en tu tablero real esto le llega a Claude.')); return false; }
  if (!(await post('/api/msg', { text, replyTo: reply }))) { return false; }
  replyTo = null;
  toast(tr('Sent to Claude. It shows up in the session that is listening.', 'Enviado a Claude. Le llega a la sesión que está escuchando.'));
  return true;
}

// ---------------------------------------------------------------------------
// Evidence view: filters and accordions
// ---------------------------------------------------------------------------

document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const k = el.dataset?.evFilter;
  if (!k) { return; }
  if (k === 'ticket') { evidenceFilter = { ...evidenceFilter, ticket: el.value || undefined }; }
  if (k === 'outcome') { evidenceFilter = { ...evidenceFilter, outcome: (el.value || undefined) as EvidenceFilter['outcome'] }; }
  if (k === 'defect') { evidenceFilter = { ...evidenceFilter, defectOnly: (el as HTMLInputElement).checked }; }
  // A single ticket picked is opened, so its cases show without a second click.
  if (k === 'ticket' && el.value) { evidenceOpen.add(el.value); }
  render();
  document.getElementById(el.id)?.focus();
});

// `toggle` does not bubble: listen in the capture phase. Thumbnails render only for open cases, so
// opening one re-renders the view; parsing `open` back in fires toggle again with no change (no loop).
document.addEventListener('toggle', (e) => {
  const d = e.target as HTMLDetailsElement;
  const key = d.dataset?.acc;
  if (!key || d.open === evidenceOpen.has(key)) { return; }
  if (d.open) { evidenceOpen.add(key); }
  else { for (const k of [...evidenceOpen]) { if (k === key || k.startsWith(`${key}/`)) { evidenceOpen.delete(k); } } }
  render();
  document.querySelector<HTMLElement>(`details[data-acc="${CSS.escape(key)}"] > summary`)?.focus();
}, true);

// ---------------------------------------------------------------------------
// Resizable ticket panel: drag the left edge, arrow keys on the handle, double-click resets
// ---------------------------------------------------------------------------

const DRAWER_DEFAULT = 560;
const DRAWER_MIN = 420;
const drawerMax = () => Math.max(DRAWER_MIN, Math.floor(innerWidth * 0.95));
const clampW = (w: number) => Math.round(Math.min(drawerMax(), Math.max(DRAWER_MIN, w)));
let drawerW = clampW(Number(store<unknown>('sprint-board-drawer-w', DRAWER_DEFAULT)) || DRAWER_DEFAULT);

function applyDrawerWidth(): void {
  const d = $('#drawer')!;
  const w = clampW(drawerW);
  d.style.setProperty('--drawer-w', `${w}px`);
  const h = $('#drawer-handle')!;
  h.setAttribute('aria-valuenow', String(w));
  h.setAttribute('aria-valuemin', String(DRAWER_MIN));
  h.setAttribute('aria-valuemax', String(drawerMax()));
  h.setAttribute('aria-valuetext', `${w} px`);
}
function setDrawerWidth(w: number, persist = true): void {
  drawerW = clampW(w);
  applyDrawerWidth();
  if (persist) { save('sprint-board-drawer-w', drawerW); }
}

const handle = $('#drawer-handle')!;
handle.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) { return; }
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  const move = (ev: PointerEvent) => setDrawerWidth(innerWidth - ev.clientX, false);
  const up = () => {
    handle.removeEventListener('pointermove', move);
    document.body.classList.remove('resizing');
    save('sprint-board-drawer-w', drawerW);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up, { once: true });
  handle.addEventListener('pointercancel', up, { once: true });
});
handle.addEventListener('dblclick', () => setDrawerWidth(DRAWER_DEFAULT));
handle.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 96 : 24;
  const by = { ArrowLeft: step, ArrowRight: -step, Home: Infinity, End: -Infinity } as Record<string, number>;
  if (e.key === 'Enter') { e.preventDefault(); setDrawerWidth(DRAWER_DEFAULT); return; }
  if (!(e.key in by)) { return; }
  e.preventDefault();
  setDrawerWidth(Number.isFinite(by[e.key]) ? drawerW + by[e.key] : by[e.key] > 0 ? drawerMax() : DRAWER_MIN);
});
addEventListener('resize', () => applyDrawerWidth());

// ---------------------------------------------------------------------------
// Left nav: an icon rail on desktop (remembered), an overlay on a phone
// ---------------------------------------------------------------------------

let rail = store<unknown>('sprint-board-nav', 'full') === 'rail';

function syncNav(): void {
  const root = document.documentElement;
  if (rail) { root.dataset.nav = 'rail'; }
  else { delete root.dataset.nav; }
  const open = document.body.classList.contains('nav-open');
  const c = $('#nav-collapse')!;
  c.setAttribute('aria-expanded', String(!rail));
  const label = rail ? tr('Expand the menu', 'Expandir el menú') : tr('Collapse the menu', 'Colapsar el menú');
  c.title = `${label} (Ctrl+B)`;
  c.querySelector('.sr')!.textContent = label;
  const o = $('#nav-open')!;
  o.setAttribute('aria-expanded', String(open));
  o.querySelector('.sr')!.textContent = open ? tr('Close the menu', 'Cerrar el menú') : tr('Open the menu', 'Abrir el menú');
  $('#nav-scrim')!.hidden = !(open && phone());
}
function setNavOpen(open: boolean): void {
  document.body.classList.toggle('nav-open', open);
  syncNav();
  if (open) { ($<HTMLElement>('nav.side a.on') ?? $<HTMLElement>('nav.side a'))?.focus(); }
}
function toggleNav(): void {
  if (phone()) { setNavOpen(!document.body.classList.contains('nav-open')); return; }
  rail = !rail;
  save('sprint-board-nav', rail ? 'rail' : 'full');
  syncNav();
}
phoneQuery.addEventListener('change', () => { document.body.classList.remove('nav-open'); syncNav(); });

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    toggleNav();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && (e.target as HTMLElement).id === 'inbox-text') {
    e.preventDefault();
    $<HTMLButtonElement>('[data-msg-send]')?.click();
    return;
  }
  const typing = (e.target as HTMLElement).closest('input, textarea');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $<HTMLInputElement>('#search')!.focus(); return; }
  if (e.key === 'Escape') {
    if (!$('#lightbox')!.hidden) { $('#lightbox')!.hidden = true; }
    else if (document.body.classList.contains('nav-open')) { setNavOpen(false); $<HTMLElement>('#nav-open')?.focus(); }
    else { closeDrawer(); }
    return;
  }
  if (typing) { return; }
  const n = Number(e.key);
  const keys = navViews();
  if (n >= 1 && n <= keys.length) { go(keys[n - 1]); }
});

$<HTMLInputElement>('#search')!.addEventListener('input', (e) => { filter = (e.target as HTMLInputElement).value.trim(); render(); });
addEventListener('hashchange', () => { closeDrawer(); render(); });

const alertsBtn = $('#alerts-btn')!;
if (live() && 'Notification' in window && Notification.permission === 'default') {
  alertsBtn.hidden = false;
  alertsBtn.addEventListener('click', () => { void Notification.requestPermission().then(() => { alertsBtn.hidden = true; }); });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

setLang(getLang());
applyTheme();
syncNav();
applyDrawerWidth();
if (live()) {
  void fetchSprints().then(fetchState);
  void fetchMerge();
  connect();
}
else {
  if (real?.mode === 'share') {
    // The team copy: no private views, no owner tour.
    for (const sel of ['#copy-slack', '#tour-fab', ...SHARE_HIDDEN.map(v => `a[data-view="${v}"]`)]) { const b = $(sel); if (b) { b.hidden = true; } }
  }
  if (real?.mode === 'report') {
    // The sprint report: four read-only views, Report first; no Slack copy, no tour, no owner controls.
    for (const sel of ['#copy-slack', '#tour-fab', '#alerts-btn', '.nav-hint']) { const b = $(sel); if (b) { b.hidden = true; } }
    const nav = $('#side-nav')!;
    for (const a of $$('nav.side a[data-view]')) { a.hidden = !REPORT_VIEWS.includes(a.dataset.view as View); }
    // Nav order and digit keys follow REPORT_VIEWS.
    for (const [i, v] of REPORT_VIEWS.entries()) {
      const a = $(`a[data-view="${v}"]`);
      if (!a) { continue; }
      a.querySelector('kbd')!.textContent = String(i + 1);
      nav.insertBefore(a, $('.side-foot', nav));
    }
  }
  render();
}
setInterval(tickLive, 1000);
tickLive();
