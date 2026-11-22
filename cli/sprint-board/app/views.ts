import type { Ask, BoardState, BugGroup, EvidenceArtifact, EvidenceFilter, EvidenceView, Fixture, InboxMsg, InboxThread, Lane, Metrics, Need, OutcomeCounts, SprintBug, TicketView } from '../model.ts';
/** Every view is a pure function of the folded state: state in, HTML out. */
import { bugCounts, devsOf, EVIDENCE_OUTCOMES, groupEvidence, isDecisionCard, isTestedBucket, LANES, listFixtures, metrics, outcomeCounts, REPORT_PRIORITIES, tcCounts, trackerName } from '../model.ts';
import { barChart, burnupChart, dotStrip, stackBar } from './charts.ts';
import { getLang, tr } from './i18n.ts';
import { ago, day, esc, firstName, hhmm, initials, pct, slackHtml } from './util.ts';

export interface Ctx {
  state: BoardState
  m: Metrics
  filter: string
  canWrite: boolean
  /** The inbox message the owner is replying to, if any. */
  replyTo?: string | null
  img: (path: string) => string | null
  sprints: { slug: string, name: string, startedAt: string, closedAt?: string }[]
  archives: string[]
  viewingSlug?: string
  /** Module of the ticket open in the drawer: the Now view's test data narrows to it. */
  focusModule?: string
  /** Bugs view: which group is shown (all by default). */
  bugGroup?: 'all' | BugGroup
  /** Evidence view: the filter and which accordions are open (keys: `<ticket>`, `<ticket>/<tc>`, `<ticket>/_`). */
  evidenceFilter?: EvidenceFilter
  evidenceOpen?: Set<string>
}

/** Shown where the evidence page link would be, so a missing page reads as missing, not as hidden. */
const noPage = () => `<span class="ev-none" title="${esc(tr('Published in Stage 3 with the evidence-artifact skill, or on the next retest', 'Se publica en Stage 3 con el skill evidence-artifact, o en el próximo retest'))}">${tr('No evidence page', 'Sin página de evidencia')}</span>`;

/**
 * The "Open evidence page" link: a claude.ai artifact, validated when it was recorded.
 * `fromParent`: the parent Story's id, when `p` is its evidence page rather than this
 * bug's own — shown as a small badge so reviewers aren't confused about what they're seeing.
 */
export function pageLink(p: EvidenceArtifact | undefined, cls = 'ev-page', label = tr('Open evidence page', 'Abrir página de evidencia'), fromParent?: string): string {
  if (!p) { return ''; }
  const when = `${day(p.at).slice(5)} ${hhmm(p.at)}${p.by ? ` · ${p.by}` : ''}${p.history.length ? ` · ${p.history.length} ${tr('earlier', 'anteriores')}` : ''}`;
  const parentNote = fromParent ? ` · ${tr(`from ${fromParent}`, `de ${fromParent}`)}` : '';
  const badge = fromParent ? ` <span class="pill source" title="${esc(tr(`Showing the Story's evidence page (${fromParent}); this bug has none of its own.`, `Muestra la página de evidencia de la Story (${fromParent}); este bug no tiene una propia.`))}">${esc(tr('from Story', 'de la Story'))}</span>` : '';
  return `<a class="${cls}" href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(`${p.title ? `${p.title} · ` : ''}${tr('recorded', 'registrada')} ${when}${parentNote}`)}">${esc(label)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 6.5 9.5M11 9.5V13H3V5h3.5"/></svg></a>${badge}`;
}

export const VIEWS = ['now', 'metrics', 'people', 'tickets', 'bugs', 'timeline', 'evidence', 'history', 'merge', 'report'] as const;
export type View = (typeof VIEWS)[number];
/** The board's own views, in nav order (digits 1-9); Report exists only on a report snapshot. */
export const BOARD_VIEWS: View[] = VIEWS.filter(v => v !== 'report');
/** A report snapshot shows these and nothing else, Report first (the landing view). */
export const REPORT_VIEWS: View[] = ['report', 'tickets', 'bugs', 'timeline'];
/** Views the team copy never shows: hidden in the nav, and a typed or linked hash falls back to Now. */
export const SHARE_HIDDEN: View[] = ['people', 'bugs', 'evidence', 'history', 'merge'];

/** Which view a hash opens. A report reaches only its four views, whatever is typed; the board never reaches Report. */
export function routeView(hash: string, mode?: BoardState['mode']): View {
  const h = hash as View;
  if (mode === 'report') { return REPORT_VIEWS.includes(h) ? h : 'report'; }
  if (h === 'report') { return 'now'; }
  if (mode === 'share' && SHARE_HIDDEN.includes(h)) { return 'now'; }
  return VIEWS.includes(h) ? h : 'now';
}

export const ctxOf = (state: BoardState, rest: Omit<Ctx, 'state' | 'm'>): Ctx => ({ state, m: metrics(state), ...rest });

const LANE_CLASS: Record<Lane, string> = { 'Needs you': 'l-needs', 'Running': 'l-run', 'Failed': 'l-fail', 'Passed': 'l-pass', 'Held': 'l-held', 'Up next': 'l-next' };
const LANE_GLYPH: Record<string, string> = { 'Needs you': '◆', 'Running': '▶', 'Failed': '✕', 'Passed': '✓' };
const pillClass = (s: string) => s.replace(/\s+/g, '-');
/** What the page calls the tracker the board reads (`Jira`, `tickets.yaml`). */
const TRK = (c: Ctx) => trackerName(c.state.tracker?.source);
const nowMs = (c: Ctx) => (c.state.mode === 'live' ? Date.now() : Date.parse(c.state.sprint.closedAt ?? c.state.generatedAt));

function matches(t: TicketView, q: string): boolean {
  if (!q) { return true; }
  const hay = `${t.id} ${t.title} ${t.dev ?? ''} ${t.priority ?? ''} ${t.lane} ${t.trackerStatus ?? ''} ${t.bugs.map(b => b.id).join(' ')}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).every(w => hay.includes(w));
}
const inScope = (c: Ctx) => c.state.tickets.filter(t => t.inScope && matches(t, c.filter));

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function caseBar(t: TicketView): string {
  const c = tcCounts(t.tcs);
  if (!c.total) { return `<span class="meta">${t.type === 'Bug' ? tr('bug retest', 'retest de bug') : tr('no cases yet', 'sin casos aún')}</span>`; }
  const seg = (n: number, cls: string) => (n ? `<i class="${cls}" style="width:${(n / c.total) * 100}%"></i>` : '');
  return `<span class="bar" title="${c.PASSED} PASSED · ${c.FAILED} FAILED · ${c.DEFERRED} DEFERRED · ${c.BLOCKED} BLOCKED · ${c['NOT RUN']} NOT RUN">${seg(c.PASSED, 's-pass')}${seg(c.FAILED, 's-fail')}${seg(c.BLOCKED, 's-blk')}${seg(c.DEFERRED, 's-def')}${seg(c['NOT RUN'], 's-nr')}</span><span class="mono">${c.PASSED}/${c.total}</span>`;
}

function laneLine(t: TicketView, c: Ctx): string {
  const need = t.needs.find(n => !n.answer);
  if (t.lane === 'Needs you' && need) { return `<div class="say">◆ ${esc(need.question)}</div>`; }
  if (t.lane === 'Running') {
    const last = t.progress.at(-1)?.text;
    return `<div class="running-stripe"></div><div class="meta">${esc(t.worker.stage ?? 'started')}${t.worker.lastActivity ? ` · ${tr('active', 'activo')} ${ago(t.worker.lastActivity, nowMs(c))} ${tr('ago', 'atrás')}` : ''}${t.worker.quiet ? ` · <b class="warn">${tr('quiet', 'callado')}</b>` : ''}</div>${last ? `<div class="say">${esc(last.slice(0, 110))}</div>` : ''}`;
  }
  if (t.lane === 'Failed') {
    const b = t.bugs.find(x => !/^(?:done|closed|cancel)/i.test(x.status ?? '')) ?? t.bugs[0];
    return b ? `<div class="say">✕ <span class="id">${esc(b.id)}</span> ${esc(b.title ?? '')}</div>` : '';
  }
  return '';
}

export function card(t: TicketView, c: Ctx, compact = false): string {
  const worst = ['Critical', 'High', 'Medium', 'Low'].find(s => t.bugs.some(b => b.severity === s));
  const prio = t.priority === 'Critical' || t.priority === 'High' ? `<span class="prio p-${t.priority.toLowerCase()}">${esc(t.priority)}</span>` : '';
  return `<button type="button" class="card ${LANE_CLASS[t.lane]}${t.worker.quiet ? ' quiet' : ''}${compact ? ' compact' : ''}" data-open="${esc(t.id)}" data-card="${esc(t.id)}">
    <div class="row"><span class="id">${esc(t.id)}</span>${prio}${t.attempt > 1 ? `<span class="flag retry">${tr('retest', 'retest')} ${t.attempt}</span>` : ''}${t.atRisk ? `<span class="flag" title="${esc(tr(`Past the QA gate in ${TRK(c)} with a case not PASSED or DEFERRED`, `Pasó el gate de QA en ${TRK(c)} con un caso que no está PASSED ni DEFERRED`))}">${tr('shipped at risk', 'salió con riesgo')}</span>` : ''}</div>
    <div class="title">${esc(t.title)}</div>
    ${compact
      ? ''
      : `<div class="row">${caseBar(t)}</div>
    <div class="meta"><span>${esc(firstName(devsOf(t.dev)[0]))}${devsOf(t.dev).length > 1 ? ` +${devsOf(t.dev).length - 1}` : ''}</span>${t.bugs.length ? `<span>${t.bugs.length} ${t.bugs.length === 1 ? 'bug' : 'bugs'}${worst ? ` · ${esc(worst)}` : ''}</span>` : ''}<span>${tr('in lane', 'en carril')} ${ago(t.laneSince, nowMs(c))}</span>${t.drift ? `<span class="flag drift">${esc(t.drift)}</span>` : ''}</div>
    ${laneLine(t, c)}`}
  </button>`;
}

// ---------------------------------------------------------------------------
// Now
// ---------------------------------------------------------------------------

function bottomLine(c: Ctx): string {
  const { m, state } = c;
  const needs = m.byLane['Needs you'];
  const highOpen = state.tickets.flatMap(t => t.bugs).filter((b, i, all) => all.findIndex(x => x.id === b.id) === i).filter(b => (b.severity === 'High' || b.severity === 'Critical') && !/^(?:done|closed|cancel)/i.test(b.status ?? '')).length;
  const quiet = state.tickets.filter(t => t.worker.quiet);
  const parts = [
    `<span><b class="n">${m.verdicts.done}/${m.verdicts.of}</b> ${tr('tickets have a verdict', 'tickets con veredicto')}</span>`,
    `<span><b class="n">${needs}</b> ${tr(needs === 1 ? 'needs you' : 'need you', needs === 1 ? 'te necesita' : 'te necesitan')}</span>`,
    `<span><b class="n">${m.bugs.open}</b> ${tr('open bugs', 'bugs abiertos')}${highOpen ? ` (${highOpen} High+)` : ''}</span>`,
  ];
  if (m.atRisk.length) { parts.push(`<span class="warn"><b class="n">${m.atRisk.length}</b> ${tr('shipped at risk', 'salieron con riesgo')}</span>`); }
  if (quiet.length) { parts.push(`<span class="warn">${quiet.map(t => esc(t.id)).join(', ')} ${tr('quiet', 'callado')} ${ago(quiet[0].worker.lastActivity, nowMs(c))}</span>`); }
  return `<div class="bottomline">${parts.join('<span class="sep">·</span>')}</div>`;
}

function kpis(c: Ctx): string {
  const { m } = c;
  return `<div class="kpis">
    <div class="kpi k-pass"><span class="lbl">Verdicts</span><b>${m.verdicts.done}<small style="font-size:14px;color:var(--muted)">/${m.verdicts.of}</small></b><small>${tr('tickets in QA scope', 'tickets en alcance de QA')}</small></div>
    <div class="kpi k-run"><span class="lbl">Pass rate</span><b>${pct(m.passRate)}</b><small>${tr('executed', 'ejecutados')} ${m.tc.executed} ${tr('of', 'de')} ${m.tc.total} · ${m.tc['NOT RUN']} NOT RUN</small></div>
    <div class="kpi k-fail"><span class="lbl">Open bugs</span><b>${m.bugs.open}</b><small>${m.bugs.total} ${tr('filed this sprint', 'reportados este sprint')}</small></div>
    <div class="kpi k-needs"><span class="lbl">Needs you</span><b>${m.byLane['Needs you']}</b><small>${m.owner.open.length ? `${tr('oldest', 'la más vieja')} ${m.owner.open[0].hours}h` : tr('nothing waiting on you', 'nada te espera')}</small></div>
  </div>`;
}

export function nextSteps(c: Ctx): { html: string, n: number }[] {
  const items: { html: string, n: number }[] = [];
  for (const t of (c.state.inbox ?? []).filter(x => x.state === 'needs-owner')) {
    const q = t.replies.at(-1) ?? t;
    items.push({ n: 1, html: `<a href="#inbox" data-goto-inbox="${esc(t.id)}">${tr('Answer Claude', 'Responder a Claude')}</a> ${esc(q.text.length > 90 ? `${q.text.slice(0, 90)}…` : q.text)}<small>${t.ticket ? `${esc(t.ticket)} · ` : ''}${ago(q.at, nowMs(c))}</small>` });
  }
  for (const t of inScope(c)) {
    for (const n of t.needs.filter(x => !x.answer)) {
      items.push({ n: 1, html: `<a href="#" data-open="${esc(t.id)}">${tr('Decide', 'Decidir')}: <span class="id">${esc(t.id)}</span></a> ${esc(n.question)}<small>${esc(t.title)} · ${ago(n.since, nowMs(c))}</small>` });
    }
  }
  for (const a of c.state.asks.filter(x => x.state === 'draft')) {
    items.push({ n: 2, html: `<a href="#people">${tr('Send to', 'Enviar a')} ${esc(a.to)}</a>${a.outdated ? ` <span class="flag drift">${tr('outdated', 'desactualizado')}</span>` : ''}<small>${esc(a.tickets.join(', '))} · ${esc(a.kind)}</small>` });
  }
  for (const t of inScope(c).filter(x => x.atRisk)) {
    items.push({ n: 3, html: `<a href="#" data-open="${esc(t.id)}">${tr('Shipped at risk', 'Salió con riesgo')}: <span class="id">${esc(t.id)}</span></a><small>${tr('get the decision written or accepted', 'consigue la decisión escrita o aceptada')}</small>` });
  }
  for (const t of inScope(c).filter(x => x.worker.quiet)) {
    items.push({ n: 4, html: `<a href="#" data-open="${esc(t.id)}">${tr('Check worker', 'Revisa el worker')} <span class="id">${esc(t.id)}</span></a><small>${tr('no file activity for', 'sin actividad hace')} ${ago(t.worker.lastActivity, nowMs(c))}</small>` });
  }
  for (const w of c.m.waits) {
    items.push({ n: 5, html: `<a href="#people">${tr('Nudge', 'Recordarle a')} ${esc(w.person)}</a><small>${w.open} ${tr('open', 'abiertos')} · ${tr('oldest', 'el más viejo')} ${w.oldestHours}h</small>` });
  }
  for (const t of inScope(c).filter(x => x.drift)) {
    items.push({ n: 6, html: `<a href="#" data-open="${esc(t.id)}">${esc(TRK(c))} drift <span class="id">${esc(t.id)}</span></a><small>${esc(t.drift!)}</small>` });
  }
  return items.sort((a, b) => a.n - b.n);
}

function tray(c: Ctx): string {
  const held = inScope(c).filter(t => t.lane === 'Held');
  const next = inScope(c).filter(t => t.lane === 'Up next');
  if (!held.length && !next.length) { return ''; }
  const chip = (t: TicketView, cls: string, note = '') => `<span class="chip ${cls}" data-open="${esc(t.id)}" data-card="${esc(t.id)}"><span class="id">${esc(t.id)}</span>${note ? ` ${esc(note)}` : ''}</span>`;
  return `<div class="tray" data-tour="tray">
    ${held.length ? `<span class="lbl">Held ${held.length}</span>${held.map(t => chip(t, 'held', `· ${t.hold?.reason ?? 'blocked'}`)).join('')}` : ''}
    ${next.length ? `<span class="lbl">Up next ${next.length}</span>${next.map(t => chip(t, '')).join('')}` : ''}
  </div>`;
}

export function board(c: Ctx): string {
  const tickets = inScope(c);
  return `<div class="board" data-tour="board">${LANES.map((lane) => {
    const list = tickets.filter(t => t.lane === lane);
    const compactPassed = lane === 'Passed' && list.length > 4;
    return `<section class="lane ${LANE_CLASS[lane]}" data-lane="${esc(lane)}" data-tour="lane-${LANE_CLASS[lane]}">
      <div class="lane-head"><span class="glyph" aria-hidden="true">${LANE_GLYPH[lane]}</span><span class="lbl" style="color:var(--ink)">${esc(lane)}</span><span class="n">${list.length}</span></div>
      ${list.length ? list.map(t => card(t, c, compactPassed)).join('') : `<div class="none">${lane === 'Needs you' ? tr('Nothing waiting on you.', 'Nada te espera.') : tr('Empty', 'Vacío')}</div>`}
    </section>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Inbox: the owner and Claude talk here instead of in the terminal
// ---------------------------------------------------------------------------

const STATE_LABEL = (s: InboxThread['state']) => ({
  'needs-owner': tr('Claude asks you', 'Claude te pregunta'),
  'needs-claude': tr('Waiting on Claude', 'Esperando a Claude'),
  'done': tr('Done', 'Listo'),
})[s];

function bubble(m: InboxMsg, t: InboxThread, c: Ctx, last: boolean): string {
  const who = m.from === 'claude' ? 'Claude' : tr('You', 'Tú');
  const pick = last && t.state === 'needs-owner' && c.canWrite && m.options.length
    ? `<div class="opts">${m.options.map(o => `<button class="btn" type="button" data-msg-pick="${esc(o)}" data-reply="${esc(m.id)}">${esc(o)}</button>`).join('')}</div>`
    : '';
  return `<div class="msg ${m.from}"><span class="who">${who} · ${hhmm(m.at)} ${esc(day(m.at).slice(5))}</span><div>${esc(m.text)}</div>${pick}</div>`;
}

export function inboxPanel(c: Ctx): string {
  const all = c.state.inbox ?? [];
  const open = all.filter(t => t.state !== 'done');
  const done = all.filter(t => t.state === 'done').slice(0, 4);
  const target = c.replyTo ? all.find(t => t.id === c.replyTo || t.replies.some(r => r.id === c.replyTo)) : undefined;
  const thread = (t: InboxThread) => {
    const msgs = [t as InboxMsg, ...t.replies];
    const lastId = msgs.at(-1)!.id;
    return `<div class="thread ${t.state}" data-thread="${esc(t.id)}">
      <div class="thread-head"><span class="pill ${t.state === 'needs-owner' ? 'BLOCKED' : t.state === 'needs-claude' ? 'Running' : 'PASSED'}">${STATE_LABEL(t.state)}</span>${t.ticket ? `<a href="#" class="id" data-open="${esc(t.ticket)}">${esc(t.ticket)}</a>` : ''}<span class="spacer"></span>${c.canWrite ? `<button class="btn ghost" type="button" data-reply-to="${esc(lastId)}">${tr('Reply', 'Responder')}</button>` : ''}</div>
      ${msgs.map(m => bubble(m, t, c, m.id === lastId)).join('')}
    </div>`;
  };
  return `<section class="inbox" id="inbox" data-tour="inbox">
    <span class="lbl">Claude ↔ ${tr('you', 'tú')}</span>
    ${c.canWrite
      ? `<div class="compose">
      ${target ? `<div class="replying">${tr('Replying to', 'Respondiendo a')}: <i>${esc((target.replies.at(-1) ?? target).text.slice(0, 70))}</i> <button class="btn ghost" type="button" data-reply-cancel>✕</button></div>` : ''}
      <textarea id="inbox-text" data-keep placeholder="${esc(tr('Write to Claude: "check PROJ-7024", "I already wrote to Dana"...', 'Escríbele a Claude: "revisa PROJ-7024", "ya le escribí a Dana"...'))}"></textarea>
      <div class="compose-foot"><span class="hint">${tr('Cmd+Enter sends', 'Cmd+Enter envía')}</span><button class="btn primary" type="button" data-msg-send>${tr('Send to Claude', 'Enviar a Claude')}</button></div>
    </div>`
      : ''}
    ${open.length ? open.map(thread).join('') : `<p class="empty">${tr('Nothing open between you and Claude.', 'Nada abierto entre tú y Claude.')}</p>`}
    ${done.length ? `<details><summary class="hint">${tr('Recent, already closed', 'Recientes, ya cerrados')} (${done.length})</summary>${done.map(thread).join('')}</details>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Test data found (`fixture`)
// ---------------------------------------------------------------------------

const fixtureLine = (f: Fixture, c: Ctx, showTicket = true) =>
  `<div class="progress-line fixture">${showTicket ? `<a href="#" class="id" data-open="${esc(f.ticket)}">${esc(f.ticket)}</a> ` : ''}${f.module ? `<span class="pill source">${esc(f.module)}</span> ` : ''}${esc(f.text)}<br><span class="hint">${esc(day(f.at).slice(5))} ${hhmm(f.at)} · ${ago(f.at, nowMs(c))} ${tr('ago', 'atrás')}</span></div>`;

/** The Now rail's list. Narrows to the open ticket's module when it has one. */
export function fixturesNow(c: Ctx): string {
  const all = c.state.fixtures ?? [];
  const mod = c.focusModule;
  const list = listFixtures(all, mod);
  if (!all.length) { return '<section id="now-fixtures" hidden></section>'; }
  const shown = list.slice(0, 8);
  return `<section id="now-fixtures" class="fixtures" data-tour="fixtures"><span class="lbl">${tr('Test data found', 'Datos de prueba encontrados')}${mod ? ` · ${esc(mod)}` : ''}</span>
    ${shown.length ? shown.map(f => fixtureLine(f, c)).join('') : `<p class="empty">${tr(`None for ${esc(mod)} yet (${all.length} recorded in other modules).`, `Nada para ${esc(mod)} todavía (${all.length} en otros módulos).`)}</p>`}
    ${list.length > shown.length ? `<p class="hint">+${list.length - shown.length} ${tr('more: fixtures --module', 'más: fixtures --module')}${mod ? ` ${esc(mod)}` : ''}</p>` : ''}
  </section>`;
}

export function viewNow(c: Ctx): string {
  if (c.state.mode === 'share') { return `${bottomLine(c)}<div style="display:grid;gap:12px;min-width:0">${kpis(c)}${tray(c)}${board(c)}</div>`; }
  const steps = nextSteps(c);
  return `${bottomLine(c)}
  <div class="now-grid">
    <div style="display:grid;gap:12px;min-width:0">${kpis(c)}${tray(c)}${board(c)}</div>
    <aside class="rail" data-tour="rail">${inboxPanel(c)}<span class="lbl">${tr('Your next steps', 'Tus próximos pasos')}</span>
      ${steps.length ? `<ol>${steps.slice(0, 12).map(s => `<li>${s.html}</li>`).join('')}</ol>` : `<p class="empty">${tr('Nothing owed. The workers are on it.', 'Nada pendiente. Los workers siguen.')}</p>`}
      ${fixturesNow(c)}
    </aside>
  </div>`;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Count chips, largest first: `label n`. */
function countChips(rec: Record<string, number>, cls = 'source'): string {
  const rows = Object.entries(rec).filter(([, n]) => n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return rows.map(([k, n]) => `<span class="pill ${cls}">${esc(k)} <b>${n}</b></span>`).join(' ');
}

/** Metric 4's categories: by tracker status bucket and by module. */
function bugBreakdown(m: Metrics): string {
  if (!m.bugs.total) { return ''; }
  const st = m.bugs.byStatus ?? { open: 0, resolved: 0, closed: 0 };
  return `<dl class="breakdown">
    <dt>${tr('By status', 'Por estado')}</dt><dd><span class="pill FAILED">open <b>${st.open}</b></span> <span class="pill PASSED">resolved <b>${st.resolved}</b></span> <span class="pill DEFERRED">closed <b>${st.closed}</b></span></dd>
    <dt>${tr('By module', 'Por módulo')}</dt><dd>${countChips(m.bugs.byModule ?? {})}</dd>
  </dl>`;
}

export function viewMetrics(c: Ctx): string {
  const { m } = c;
  const laneSegs = [...LANES, 'Held', 'Up next'].map(l => ({ label: l, value: m.byLane[l as Lane], cls: LANE_CLASS[l as Lane] }));
  const tcSegs = [
    { label: 'PASSED', value: m.tc.PASSED, cls: 'l-pass' },
    { label: 'FAILED', value: m.tc.FAILED, cls: 'l-fail' },
    { label: 'BLOCKED', value: m.tc.BLOCKED, cls: 'l-needs' },
    { label: 'DEFERRED', value: m.tc.DEFERRED, cls: 'l-held' },
    { label: 'NOT RUN', value: m.tc['NOT RUN'], cls: 'l-next' },
  ];
  const sev = ['Critical', 'High', 'Medium', 'Low', 'Unrated'].filter(s => m.bugs.bySeverity[s]).map(s => ({ label: s, a: m.bugs.bySeverity[s].open, b: m.bugs.bySeverity[s].closed }));
  return `<div class="metrics" data-tour="metrics">
    <section class="panel metric"><span class="lbl">1 · Verdict progress</span><div class="big">${m.verdicts.done}<small> / ${m.verdicts.of} ${tr('tickets', 'tickets')}</small></div>${stackBar(laneSegs)}<p class="hint">${tr('Only tickets in QA scope count. Someone else\'s ticket is shown, never counted.', 'Solo cuentan los tickets en alcance de QA. Los de otra persona se ven pero no suman.')}</p></section>
    <section class="panel metric" data-tour="m-cases"><span class="lbl">2 · Case execution</span><div class="big">${pct(m.passRate)}<small> ${tr('pass rate', 'pass rate')} · ${m.tc.executed} ${tr('of', 'de')} ${m.tc.total} ${tr('executed', 'ejecutados')}</small></div>${stackBar(tcSegs)}<p class="hint">${tr('Pass rate = PASSED / (PASSED + FAILED). NOT RUN stays visible: a case that never ran did not pass.', 'Pass rate = PASSED / (PASSED + FAILED). NOT RUN siempre se ve: un caso que no corrió no pasó.')}</p></section>
    <section class="panel metric"><span class="lbl">3 · Burn-up</span>${burnupChart(m.burnup)}<p class="hint">${tr('Tickets with a verdict per sprint day, against scope.', 'Tickets con veredicto por día del sprint, contra el alcance.')}</p></section>
    <section class="panel metric"><span class="lbl">4 · Bugs filed</span><div class="big">${m.bugs.total}<small> · ${m.bugs.open} ${tr('open', 'abiertos')}</small></div>${barChart(sev, ['open', 'closed'])}${bugBreakdown(m)}<p class="hint">${tr('Each bug counted once, even when it blocks two tickets.', 'Cada bug cuenta una vez, aunque bloquee dos tickets.')}${c.state.mode === 'share' ? '' : ` <a href="#bugs">${tr('Every bug of the sprint', 'Todos los bugs del sprint')}</a>`}</p></section>
    <section class="panel metric"><span class="lbl">5 · First-pass yield</span><div class="big">${m.firstPass.of ? pct(m.firstPass.clean / m.firstPass.of) : '—'}<small> · ${m.firstPass.clean} ${tr('of', 'de')} ${m.firstPass.of}</small></div><p class="hint">${tr('Passed on the first attempt with no bug filed.', 'Pasaron al primer intento sin bug reportado.')}</p></section>
    <section class="panel metric"><span class="lbl">6 · Your response time</span><div class="big">${m.owner.medianHours ?? '—'}<small>h ${tr('median', 'mediana')} · ${m.owner.answered} ${tr('answered', 'respondidas')}</small></div>${dotStrip(m.owner.open.map(o => ({ label: o.ticket, value: o.hours })))}<p class="hint">${tr('From a question reaching Needs you to your answer. Open ones are the dots.', 'Desde que una pregunta llega a Needs you hasta tu respuesta. Los puntos son las abiertas.')}</p></section>
    <section class="panel metric"><span class="lbl">7 · Waiting on people</span>${m.waits.length ? barChart(m.waits.map(w => ({ label: w.person.split(/\s+/)[0], a: w.oldestHours, b: 0 })), ['hours'], 24) : `<p class="hint">${tr('Nobody owes the sprint an answer.', 'Nadie le debe una respuesta al sprint.')}</p>`}<p class="hint">${tr('Oldest open wait per person, amber past 24h.', 'Espera abierta más vieja por persona, ámbar pasadas 24h.')}</p></section>
    <section class="panel metric" data-tour="m-risk"><span class="lbl">8 · Shipped at risk</span><div class="big" style="color:${m.atRisk.length ? 'var(--fail)' : 'var(--pass)'}">${m.atRisk.length}</div><p class="hint">${m.atRisk.length ? m.atRisk.map(id => `<a href="#" data-open="${esc(id)}" class="id">${esc(id)}</a>`).join(', ') : tr('Nothing passed the QA gate with an open case.', 'Nada pasó el gate de QA con un caso abierto.')}</p><p class="hint">${tr(`Past the QA gate in ${TRK(c)} while a case is still FAILED, NOT RUN or BLOCKED, and it was not DEFERRED with a reason.`, `Pasó el gate de QA en ${TRK(c)} con un caso aún FAILED, NOT RUN o BLOCKED, y no se difirió con un motivo.`)}</p></section>
  </div>
  ${m.deferred.length ? `<section class="panel"><h2>DEFERRED</h2><div class="scroll"><table class="grid"><tr><th>TC</th><th>Ticket</th><th>${tr('Reason', 'Motivo')}</th></tr>${m.deferred.map(d => `<tr><td class="id">${esc(d.tc)}</td><td class="id">${esc(d.ticket)}</td><td>${esc(d.reason ?? d.approval ?? tr(`reason on the test case in ${TRK(c)}`, `motivo en el caso de prueba en ${TRK(c)}`))}</td></tr>`).join('')}</table></div></section>` : ''}`;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

function draftCard(a: Ask, c: Ctx): string {
  const imgs = a.attach.map(p => c.img(p)).filter((x): x is string => Boolean(x));
  return `<div class="draft ${a.state}" data-ask="${esc(a.id)}">
    <div class="draft-head"><span class="pill source">${esc(a.lang.toUpperCase())}</span><span class="pill ${a.kind === 'good-news' ? 'PASSED' : a.kind === 'bug' ? 'FAILED' : 'BLOCKED'}">${esc(a.kind)}</span><span class="id">${esc(a.tickets.join(', '))}</span><span class="spacer"></span><span class="lbl">${esc(a.state)}${a.sentAt ? ` · ${hhmm(a.sentAt)}` : ''}</span>${a.outdated ? `<span class="flag drift">${tr('ticket changed since', 'el ticket cambió desde entonces')}</span>` : ''}</div>
    <div class="slack">${slackHtml(a.text)}</div>
    ${imgs.length ? `<div class="thumbs" style="padding:0 12px 10px">${imgs.map((src, i) => `<span style="display:grid;gap:4px"><img class="thumb" src="${esc(src)}" data-zoom="${esc(src)}" alt="evidence ${i + 1}"><button class="btn" type="button" data-copy-img="${esc(src)}">${tr('Copy image', 'Copiar imagen')}</button></span>`).join('')}</div>` : ''}
    <div class="draft-foot"><button class="btn primary" type="button" data-copy-ask="${esc(a.id)}">${tr('Copy message', 'Copiar mensaje')}</button>
      ${c.canWrite ? (a.state === 'draft' ? `<button class="btn" type="button" data-ask-state="${esc(a.id)}" data-state="sent">${tr('Mark sent', 'Marcar enviado')}</button>` : a.state === 'sent' ? `<button class="btn" type="button" data-ask-state="${esc(a.id)}" data-state="answered">${tr('They answered', 'Ya respondió')}</button>` : '') : ''}
    </div>
  </div>`;
}

export function viewPeople(c: Ctx): string {
  const { state, m } = c;
  const names = new Set<string>([...state.asks.map(a => a.to), ...m.waits.map(w => w.person), ...state.tickets.filter(t => t.inScope).flatMap(t => devsOf(t.dev))]);
  const people = [...names].map((name) => {
    const p = state.people.find(x => x.name === name) ?? { name, lang: 'en' as const, inferred: true };
    const asks = state.asks.filter(a => a.to === name);
    const wait = m.waits.find(w => w.person === name);
    const tickets = state.tickets.filter(t => t.inScope && devsOf(t.dev).includes(name));
    const unsent = asks.filter(a => a.state === 'draft').length;
    return { p, asks, wait, tickets, unsent, score: unsent * 10 + (wait?.oldestHours ?? 0) };
  }).sort((a, b) => b.score - a.score);
  if (!people.length) { return `<section class="panel"><p class="hint">${tr(`No developers on this board yet. Sync from ${TRK(c)} to fill it.`, `Todavía no hay desarrolladores en el tablero. Sincroniza con ${TRK(c)} para llenarlo.`)}</p></section>`; }
  return `<p class="hint" style="margin:0">${tr('You send every message yourself. Copy, paste into their DM, then mark it sent: the wait clock starts then.', 'Cada mensaje lo mandas tú. Copia, pega en su DM y márcalo enviado: ahí arranca el reloj de espera.')}</p>
  <div class="people" data-tour="people">${people.map(({ p, asks, wait, tickets, unsent }) => {
    const failing = tickets.filter(t => t.lane === 'Failed').length;
    const openBugs = tickets.flatMap(t => t.bugs).filter(b => !/^(?:done|closed|cancel)/i.test(b.status ?? '')).length;
    return `<section class="panel">
      <div class="person-head"><span class="avatar">${esc(initials(p.name))}</span><div><h2>${esc(p.name)}</h2><span class="hint">${esc(p.role ?? '')}${p.role ? ' · ' : ''}${'inferred' in p && p.inferred ? tr('language not set (sprint --person)', 'idioma sin definir (sprint --person)') : `${tr('writes in', 'escribirle en')} ${p.lang === 'es' ? 'ES' : 'EN'}`}</span></div></div>
      <div class="chips">${unsent ? `<span class="pill BLOCKED">${unsent} ${tr('unsent', 'sin enviar')}</span>` : ''}${failing ? `<span class="pill FAILED">${failing} failing</span>` : ''}${openBugs ? `<span class="pill FAILED">${openBugs} open bugs</span>` : ''}${wait ? `<span class="pill Held">${tr('oldest wait', 'espera más vieja')} ${wait.oldestHours}h</span>` : ''}</div>
      ${wait ? `<div><span class="lbl">${tr('Waiting on them', 'Esperando de su parte')}</span>${wait.items.map(w => `<div class="progress-line"><span class="id">${esc(w.ticket)}</span> ${esc(w.what)} · ${w.hours}h</div>`).join('')}</div>` : ''}
      ${asks.map(a => draftCard(a, c)).join('')}
      ${tickets.length ? `<div><span class="lbl">${tr('Their tickets', 'Sus tickets')}</span><table class="grid">${tickets.map(t => `<tr class="clickable" data-open="${esc(t.id)}"><td class="id">${esc(t.id)}</td><td>${esc(t.title)}</td><td><span class="pill ${pillClass(t.lane)}">${esc(t.lane)}</span></td></tr>`).join('')}</table></div>` : ''}
    </section>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export function qaResult(t: TicketView): string {
  const c = tcCounts(t.tcs);
  if (t.lane === 'Passed') { return c.DEFERRED ? `Passed ${c.PASSED}/${c.total}, ${c.DEFERRED} DEFERRED` : `Passed ${c.PASSED}/${c.total}`; }
  if (t.lane === 'Failed') { return `Failed ${c.FAILED} of ${c.total}${t.bugs[0] ? `, ${t.bugs[0].id}` : ''}`; }
  if (t.lane === 'Running') { return `Running, ${t.worker.stage ?? 'started'}`; }
  if (t.lane === 'Needs you') { return 'Waiting on a decision'; }
  if (t.lane === 'Held') { return `Held, ${t.hold?.reason ?? 'blocked'}`; }
  return 'Not started';
}

function whatIsLeft(t: TicketView): string {
  if (t.atRisk) { return tr('Shipped with open cases: get the decision in writing', 'Salió con casos abiertos: conseguir la decisión por escrito'); }
  const n = t.needs.find(x => !x.answer);
  if (n) { return n.question; }
  if (t.waits[0]) { return `${tr('Waiting on', 'Esperando a')} ${t.waits[0].person}: ${t.waits[0].what}`; }
  if (t.hold) { return t.hold.note; }
  if (t.drift) { return t.drift; }
  return t.next ?? (t.lane === 'Passed' ? tr('Nothing', 'Nada') : '');
}

export function viewTickets(c: Ctx): string {
  const rows = inScope(c);
  const others = c.state.tickets.filter(t => !t.inScope);
  return `<section class="panel" data-tour="tickets"><div class="row" style="display:flex;gap:8px;align-items:center"><h2>${rows.length} ${tr('tickets in QA scope', 'tickets en alcance de QA')}</h2><span class="spacer" style="flex:1"></span>${c.state.mode === 'report' ? '' : '<button class="btn" type="button" data-copy-slack>Copy for Slack</button>'}</div>
    <div class="scroll"><table class="grid"><tr><th>Ticket</th><th>Title</th><th>Developer</th><th>QA result</th><th>${esc(TRK(c))} status</th><th>What is left</th></tr>
    ${rows.map(t => `<tr class="clickable" data-open="${esc(t.id)}"><td class="id">${esc(t.id)}</td><td>${esc(t.title)}</td><td>${esc(t.dev ?? '')}</td><td><span class="pill ${pillClass(t.lane)}">${esc(qaResult(t))}</span></td><td><span class="pill source">${esc(t.trackerStatus ?? '?')}</span></td><td>${esc(whatIsLeft(t))}</td></tr>`).join('')}
    </table></div>
    ${others.length ? `<p class="hint">${tr('Out of QA scope (shown, not counted):', 'Fuera del alcance de QA (se muestran, no cuentan):')} ${others.map(t => `<span class="id">${esc(t.id)}</span>`).join(', ')}</p>` : ''}
  </section>`;
}

// ---------------------------------------------------------------------------
// Bugs: every bug of the sprint, linked on the board or in the tracker
// ---------------------------------------------------------------------------

const GROUP_LABEL = (g: BugGroup) => ({
  'blocking': tr('Blocking a ticket', 'Bloqueando un ticket'),
  'not-blocking': tr('Open, not blocking', 'Abiertos, sin bloquear'),
  'resolved': tr('Resolved or closed', 'Resueltos o cerrados'),
})[g];
// Clamped to a closed set: Priority is free text from the tracker and lands inside a class attribute.
const SEV_KEYS = new Set(['critical', 'high', 'medium', 'low']);
const SEV_CLASS = (s?: string) => { const k = (s ?? '').toLowerCase(); return `sev sev-${SEV_KEYS.has(k) ? k : 'unrated'}`; };
const STATUS_PILL: Record<SprintBug['statusClass'], string> = { open: 'FAILED', resolved: 'PASSED', closed: 'DEFERRED' };

/** Fail loudly: what was searched, in one line, so "3 bugs" never hides an empty search. */
function bugSearchLine(c: Ctx): string {
  const s = c.state.bugSearch;
  if (!s) { return tr('This board was folded before the Bugs view existed; restart the board server.', 'Este tablero se armó antes de la vista de bugs; reinicia el servidor del tablero.'); }
  const linked = `${s.linked} ${tr('linked on this board with', 'vinculados en este tablero con')} <code>bug</code>`;
  const sprint = s.bugRows === null
    ? tr('the sprint\'s own Bug rows not checked yet (needs a <code>sync --discover</code>)', 'las filas Bug del sprint aún sin revisar (falta un <code>sync --discover</code>)')
    : `${s.createdInSprint} ${tr('created this sprint, of', 'creados en este sprint, de')} ${s.bugRows} ${tr('Bug rows among the', 'filas Bug entre las')} ${s.sprintRows} ${tr('sprint rows', 'filas del sprint')}${s.discoveredAt ? ` (${tr('read', 'leído')} ${esc(day(s.discoveredAt).slice(5))} ${hhmm(s.discoveredAt)})` : ''}`;
  const lost = s.missing?.length ? ` <b>${s.missing.length} ${tr(`linked here but not found in ${TRK(c)}`, `vinculados aquí pero no encontrados en ${TRK(c)}`)}: ${s.missing.map(esc).join(', ')}.</b>` : '';
  const left = s.unclassified?.length ? ` <b>${s.unclassified.length} ${tr('Bug rows not counted (status in no bucket of board.statuses)', 'filas Bug sin contar (estado fuera de los buckets de board.statuses)')}: ${s.unclassified.map(u => `${esc(u.id)} (${esc(u.status || '?')})`).join(', ')}.</b>` : '';
  return `${tr('Searched', 'Buscado')}: ${linked}; ${sprint}. ${tr('A bug filed into another sprint and never linked here is not found.', 'Un bug cargado en otro sprint y nunca vinculado aquí no aparece.')}${lost}${left}`;
}

function bugRow(b: SprintBug, c: Ctx): string {
  const blocks = b.blocks.length
    ? b.blocks.map(x => `<a href="#" class="chip blk${x.stillBlocked ? ' still' : ''}" data-open="${esc(x.id)}" title="${esc(`${x.title} · ${x.lane}`)}"><span class="id">${esc(x.id)}</span> ${x.stillBlocked ? tr('still blocked', 'sigue bloqueado') : esc(x.lane)}</a>`).join(' ')
    : `<span class="hint">${tr('not linked', 'sin vincular')}</span>`;
  const src = b.sources.includes('linked') ? '' : ` <span class="pill source" title="${esc(tr('Found in the sprint\'s tracker rows, not linked on the board', 'Encontrado en las filas del tracker del sprint, no vinculado en el tablero'))}">${esc(TRK(c))}</span>`;
  return `<tr>
    <td class="id">${b.link ? `<a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(b.id)}</a>` : esc(b.id)}${src}</td>
    <td class="b-title">${esc(b.title ?? '')}</td>
    <td>${b.severity ? `<span class="${SEV_CLASS(b.severity)}">${esc(b.severity)}</span>` : '<span class="hint">—</span>'}</td>
    <td><span class="pill ${STATUS_PILL[b.statusClass]}">${esc(b.statusClass)}</span><br><span class="hint">${esc(b.status ?? tr('not synced', 'sin sincronizar'))}</span></td>
    <td>${esc(b.dev ?? 'Unassigned')}</td>
    <td>${esc(b.qa ?? '')}</td>
    <td>${esc(b.module ?? '')}${b.platform ? `<br><span class="hint">${esc(b.platform)}</span>` : ''}</td>
    <td>${blocks}</td>
    <td class="mono">${b.ageDays}d</td>
    <td>${pageLink(b.page, 'ev-page small', tr('Evidence', 'Evidencia'), b.pageFrom) || '<span class="hint">—</span>'}</td>
  </tr>`;
}

export function viewBugs(c: Ctx): string {
  const all = (c.state.bugs ?? []).filter(b => !c.filter || `${b.id} ${b.title ?? ''} ${b.dev ?? ''} ${b.module ?? ''} ${b.severity ?? ''} ${b.blocks.map(x => x.id).join(' ')}`.toLowerCase().includes(c.filter.toLowerCase()));
  const k = bugCounts(c.state.bugs ?? []);
  const sel = c.bugGroup ?? 'all';
  const tile = (g: 'all' | BugGroup, n: number, label: string, cls: string) =>
    `<button type="button" class="tile ${cls}" data-bug-group="${g}" aria-pressed="${sel === g}"><b>${n}</b><span>${label}</span></button>`;
  const groups = (['blocking', 'not-blocking', 'resolved'] as BugGroup[]).filter(g => sel === 'all' || sel === g);
  const head = `<tr><th>Bug</th><th>Title</th><th>Severity</th><th>Status</th><th>Developer</th><th>QA</th><th>Module</th><th>${tr('Blocks', 'Bloquea')}</th><th>${tr('Age', 'Edad')}</th><th>${tr('Evidence', 'Evidencia')}</th></tr>`;
  const sections = groups.map((g) => {
    const list = all.filter(b => b.group === g);
    if (!list.length && sel === 'all') { return ''; }
    return `<section class="bug-group g-${g}"><h3>${GROUP_LABEL(g)} <span class="n">${list.length}</span></h3>${list.length
      ? `<div class="scroll"><table class="grid bugs">${head}${list.map(b => bugRow(b, c)).join('')}</table></div>`
      : `<p class="hint">${tr('None.', 'Ninguno.')}</p>`}</section>`;
  }).join('');
  return `<section class="panel bugs-panel" data-tour="bugs">
    <div class="row-head"><h2>${k.total} ${tr(k.total === 1 ? 'bug this sprint' : 'bugs this sprint', k.total === 1 ? 'bug este sprint' : 'bugs este sprint')}</h2><span class="spacer"></span>${c.state.mode === 'report' ? '' : `<button class="btn" type="button" data-copy-bugs ${k.total ? '' : 'disabled'}>Copy for Slack</button>`}</div>
    <div class="tiles" role="group" aria-label="${esc(tr('Show', 'Mostrar'))}">
      ${tile('all', k.total, tr('All', 'Todos'), 't-all')}
      ${tile('blocking', k.byGroup.blocking, tr('Blocking a ticket', 'Bloquean un ticket'), 't-block')}
      ${tile('not-blocking', k.byGroup['not-blocking'], tr('Open, not blocking', 'Abiertos sin bloquear'), 't-open')}
      ${tile('resolved', k.byGroup.resolved, tr('Resolved or closed', 'Resueltos o cerrados'), 't-done')}
    </div>
    ${k.total
      ? `<dl class="breakdown">
      <dt>${tr('Severity', 'Severidad')}</dt><dd>${['Critical', 'High', 'Medium', 'Low', 'Unrated'].filter(x => k.bySeverity[x]).map(x => `<span class="${SEV_CLASS(x)}">${x} <b>${k.bySeverity[x]}</b></span>`).join(' ')}</dd>
      <dt>${tr(`${TRK(c)} status`, `Estado en ${TRK(c)}`)}</dt><dd><span class="pill FAILED">open <b>${k.byStatus.open}</b></span> <span class="pill PASSED">resolved <b>${k.byStatus.resolved}</b></span> <span class="pill DEFERRED">closed <b>${k.byStatus.closed}</b></span></dd>
      <dt>${tr('Module', 'Módulo')}</dt><dd>${countChips(k.byModule)}</dd>
      <dt>${tr('This sprint', 'Este sprint')}</dt><dd>${k.openedInSprint} ${tr('opened', 'abiertos')} · ${k.resolvedInSprint} ${tr('resolved or closed', 'resueltos o cerrados')}</dd>
    </dl>`
      : ''}
    <p class="hint">${bugSearchLine(c)}</p>
  </section>
  ${k.total ? sections : `<section class="panel"><p class="hint">${tr('No bugs yet. A worker records one with', 'Todavía no hay bugs. Un worker registra uno con')} <code>bug &lt;ticket&gt; &lt;bug&gt;</code>.</p></section>`}`;
}

// ---------------------------------------------------------------------------
// Report: the sprint QA report (`snapshot --mode report`), summary before detail
// ---------------------------------------------------------------------------

const MONTH_DAY: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
const fmtDay = (iso: string, year = false) => new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es-ES' : 'en-US', year ? { ...MONTH_DAY, year: 'numeric' } : MONTH_DAY);
/** "Oct 9 to Oct 20, 2026"; both years when the sprint crosses one. */
export function dateRange(start: string, end?: string): string {
  if (!end) { return `${tr('since', 'desde')} ${fmtDay(start, true)}`; }
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${fmtDay(start, !sameYear)} ${tr('to', 'al')} ${fmtDay(end, true)}`;
}
/** Only an https link becomes an anchor: a tracker field never lands in an href as anything else. */
const httpsHref = (u?: string) => (u && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : undefined);
const idLink = (id: string, link?: string) => { const h = httpsHref(link); return h ? `<a class="id" href="${esc(h)}" target="_blank" rel="noopener">${esc(id)}</a>` : `<span class="id">${esc(id)}</span>`; };
const prioPill = (p?: string) => (p ? `<span class="${SEV_CLASS(p)}">${esc(p)}</span>` : '<span class="hint">—</span>');
type KpiState = 'ok' | 'warn' | 'crit';
const KPI_STATE: Record<KpiState, () => string> = { ok: () => tr('On target', 'En meta'), warn: () => tr('Watch', 'Atención'), crit: () => tr('Action needed', 'Requiere acción') };

function reportKpi(state: KpiState, label: string, value: string, sub: string): string {
  return `<div class="rkpi s-${state}"><span class="lbl">${label}</span><b>${value}</b><small>${sub}</small><span class="rstate">${KPI_STATE[state]()}</span></div>`;
}

/** A thin stacked bar, `segs` in order, scaled to `of` (defaults to the segments' sum). */
function rbar(segs: { n: number, cls: string, label: string }[], of?: number): string {
  const total = of ?? segs.reduce((s, x) => s + x.n, 0);
  if (!total) { return '<span class="rbar"></span>'; }
  return `<span class="rbar" role="img" aria-label="${esc(segs.map(s => `${s.label} ${s.n}`).join(', '))}">${segs.filter(s => s.n).map(s => `<i class="${s.cls}" style="width:${((s.n / total) * 100).toFixed(2)}%" title="${esc(`${s.label}: ${s.n}`)}"></i>`).join('')}</span>`;
}

function ticketCases(t: TicketView): string {
  const c = tcCounts(t.tcs);
  const text = `${c.PASSED}/${c.total}${c.DEFERRED ? ` · ${c.DEFERRED} ${tr('deferred', 'diferido')}` : ''}${c.FAILED ? ` · ${c.FAILED} ${tr('failed', 'fallido')}` : ''}${c['NOT RUN'] + c.BLOCKED ? ` · ${c['NOT RUN'] + c.BLOCKED} ${tr('not run', 'sin correr')}` : ''}`;
  return `<span class="rcases">${rbar([{ n: c.PASSED, cls: 'r-pass', label: 'PASSED' }, { n: c.DEFERRED, cls: 'r-def', label: 'DEFERRED' }, { n: c.FAILED, cls: 'r-fail', label: 'FAILED' }, { n: c.BLOCKED + c['NOT RUN'], cls: 'r-nr', label: 'NOT RUN or BLOCKED' }])}<span class="mono">${text}</span></span>`;
}

function ticketResult(t: TicketView): string {
  const c = tcCounts(t.tcs);
  if (c.FAILED) { return `<span class="pill FAILED">${tr('Failed', 'Falló')}</span>`; }
  if (isTestedBucket(t.bucket)) { return `<span class="pill PASSED">${tr('Signed off', 'Aprobado')}</span>`; }
  return `<span class="pill BLOCKED">${tr('Not signed off', 'Sin aprobar')}</span><br><span class="hint">${esc(t.trackerStatus ?? tr('not synced', 'sin sincronizar'))}</span>`;
}

function bugTable(list: SprintBug[], c: Ctx): string {
  if (!list.length) { return `<p class="hint">${tr('None.', 'Ninguno.')}</p>`; }
  const linkOf = (id: string) => c.state.tickets.find(t => t.id === id)?.link;
  return `<div class="scroll"><table class="grid rtable"><tr><th>Bug</th><th>Title</th><th>Priority</th><th>Developer</th><th>${tr(`${TRK(c)} status`, `Estado en ${TRK(c)}`)}</th><th>${tr(`${TRK(c)} sprint`, `Sprint en ${TRK(c)}`)}</th><th>${tr('Found on', 'Encontrado en')}</th><th>${tr('Evidence', 'Evidencia')}</th></tr>
    ${list.map(b => `<tr><td>${idLink(b.id, b.link)}</td><td class="r-title">${esc(b.title ?? '')}</td><td>${prioPill(b.severity)}</td><td>${esc(devsOf(b.dev).join(', ') || 'Unassigned')}</td><td><span class="pill source">${esc(b.status ?? tr('not synced', 'sin sincronizar'))}</span></td><td>${esc(b.sprint ?? '—')}</td><td>${b.blocks.length ? b.blocks.map(x => idLink(x.id, linkOf(x.id))).join(' ') : '<span class="hint">—</span>'}</td><td>${pageLink(b.page, 'ev-page small', tr('Evidence', 'Evidencia'), b.pageFrom) || '<span class="hint">—</span>'}</td></tr>`).join('')}
  </table></div>`;
}

export function viewReport(c: Ctx): string {
  const r = c.state.report;
  const s = c.state.sprint;
  if (!r) { return `<section class="panel"><p class="hint">${tr('This page carries no report. Build one with', 'Esta página no trae reporte. Créalo con')} <code>snapshot --mode report</code>.</p></section>`; }
  const executed = r.tc.PASSED + r.tc.FAILED;
  const unrun = r.tc['NOT RUN'] + r.tc.BLOCKED;
  const bugsById = new Map((c.state.bugs ?? []).map(b => [b.id, b]));
  const fixed = r.bugs.fixedIds.map(id => bugsById.get(id)).filter((b): b is SprintBug => Boolean(b));
  const open = r.bugs.openIds.map(id => bugsById.get(id)).filter((b): b is SprintBug => Boolean(b));
  const openSevere = open.some(b => b.severity === 'Critical' || b.severity === 'High');
  const tested = c.state.tickets.filter(t => t.tcs.length > 0);
  const { neverReached, notCounted } = r.notTested;

  // 1. Header band
  const verdict = `${r.tickets.signedOff} ${tr('of', 'de')} ${r.tickets.tested} ${tr('tested tickets signed off', 'tickets probados aprobados')} · ${r.tc.PASSED} ${tr('of', 'de')} ${r.tc.total} ${tr('test cases passed', 'casos de prueba pasaron')} · ${r.tc.FAILED} ${tr('failed', 'fallaron')}`;
  const head = `<section class="r-head">
    <div class="r-title-row"><h2>${esc(s.name)} ${tr('QA report', 'reporte de QA')}</h2><span class="chip">${esc(s.closedAt ? `${tr('Closed', 'Cerrado')} ${fmtDay(s.closedAt, true)}` : dateRange(s.startedAt))}</span><span class="chip">${esc(s.env ?? tr('test environment', 'entorno de pruebas'))}</span></div>
    <p class="r-verdict">${verdict}</p>
    ${s.goal ? `<p class="hint">${tr('Sprint goal', 'Objetivo del sprint')}: ${esc(s.goal)}</p>` : ''}
  </section>`;

  // 2. KPI tiles
  const signedSub = [neverReached.length ? `+${neverReached.length} ${tr('never reached the test environment', 'nunca llegaron al entorno de pruebas')}` : '', notCounted.length ? `${notCounted.length} ${tr('not counted', 'sin contar')}` : ''].filter(Boolean).join(' · ') || tr('every sprint ticket was tested', 'se probaron todos los tickets del sprint');
  const signedState: KpiState = r.tickets.tested && r.tickets.signedOff === r.tickets.tested ? 'ok' : r.tickets.tested && r.tickets.signedOff / r.tickets.tested >= 0.8 ? 'warn' : 'crit';
  const passState: KpiState = r.passRate === null ? 'warn' : r.tc.FAILED === 0 ? 'ok' : r.passRate >= 0.9 ? 'warn' : 'crit';
  const covState: KpiState = r.coverage === null ? 'warn' : unrun + r.tc.FAILED === 0 && r.coverage >= 0.9 ? 'ok' : r.coverage >= 0.8 ? 'warn' : 'crit';
  const bugState: KpiState = openSevere ? 'crit' : r.bugs.open ? 'warn' : 'ok';
  const kpis = `<div class="r-kpis">
    ${reportKpi(signedState, tr('Tickets signed off', 'Tickets aprobados'), `${r.tickets.signedOff}<small>/${r.tickets.tested}</small>`, signedSub)}
    ${reportKpi(passState, tr('Pass rate', 'Pass rate'), pct(r.passRate), `${r.tc.PASSED} ${tr('of', 'de')} ${executed} ${tr('executed', 'ejecutados')}, ${r.tc.FAILED} ${tr('failed', 'fallidos')}`)}
    ${reportKpi(covState, tr('Execution coverage', 'Cobertura de ejecución'), pct(r.coverage), `${r.tc.DEFERRED} ${tr('deferred with a reason', 'diferidos con motivo')}${unrun ? ` · ${unrun} ${tr('not run', 'sin correr')}` : ''}`)}
    ${reportKpi(bugState, tr('Bugs filed', 'Bugs reportados'), String(r.bugs.total), `${r.bugs.fixed} ${tr('fixed in sprint', 'corregidos en el sprint')} · ${r.bugs.open} ${tr('open', 'abiertos')}`)}
  </div>`;

  // 3. Three panels
  const sevRows = [...REPORT_PRIORITIES, ...(r.bugs.byPriority.Unrated ? ['Unrated'] : [])].map(p => ({ p, ...(r.bugs.byPriority[p] ?? { fixed: 0, open: 0 }) }));
  const sevMax = Math.max(1, ...sevRows.map(x => x.fixed + x.open));
  const bugPanel = `<section class="panel r-panel"><span class="lbl">${tr('Bugs by priority', 'Bugs por prioridad')}</span>
    <div class="r-rows">${sevRows.map(x => `<div class="r-row"><span>${prioPill(x.p)}</span>${rbar([{ n: x.fixed, cls: 'r-pass', label: tr('fixed', 'corregidos') }, { n: x.open, cls: 'r-open', label: tr('open', 'abiertos') }], sevMax)}<span class="mono r-n">${x.fixed + x.open ? `${x.fixed} ${tr('fixed', 'corr.')} · ${x.open} ${tr('open', 'abiertos')}` : '0'}</span></div>`).join('')}</div>
    <p class="r-legend"><i class="r-pass"></i>${tr('Fixed in sprint', 'Corregido en el sprint')} <i class="r-open"></i>${tr('Open', 'Abierto')}</p>
    <p class="hint">${tr(`Priority as set in ${TRK(c)}.`, `Prioridad según ${TRK(c)}.`)}</p></section>`;
  const covPanel = `<section class="panel r-panel"><span class="lbl">${tr('Coverage by priority', 'Cobertura por prioridad')}</span>
    <div class="r-rows">${r.byPriority.map(x => `<div class="r-row"><span>${prioPill(x.priority === 'Not set' ? undefined : x.priority)}${x.priority === 'Not set' ? ' Not set' : ''}</span>${rbar([{ n: x.passed, cls: 'r-pass', label: 'PASSED' }, { n: x.deferred, cls: 'r-def', label: 'DEFERRED' }, { n: x.failed, cls: 'r-fail', label: 'FAILED' }, { n: x.tcs - x.passed - x.deferred - x.failed, cls: 'r-nr', label: 'NOT RUN or BLOCKED' }], x.tcs)}<span class="mono r-n">${pct(x.tcs ? x.passed / x.tcs : null)}</span><span class="hint r-sub">${x.tested}/${x.tickets} ${tr('tickets tested', 'tickets probados')} · ${x.tcs} TCs${x.deferred ? ` · ${x.deferred} ${tr('deferred', 'diferidos')}` : ''}</span></div>`).join('') || '<p class="hint">—</p>'}</div>
    <p class="r-legend"><i class="r-pass"></i>PASSED <i class="r-def"></i>DEFERRED <i class="r-fail"></i>FAILED</p></section>`;
  const burnPanel = `<section class="panel r-panel"><span class="lbl">${tr('Burn-up', 'Burn-up')}</span>${burnupChart(r.burnup)}<p class="hint">${tr(`Tickets signed off per sprint day (green) against the sprint's ${r.tickets.total} tickets (dashed).`, `Tickets aprobados por día del sprint (verde) contra los ${r.tickets.total} tickets del sprint (punteado).`)}</p></section>`;

  // 4. Tickets
  const ticketsTable = `<section class="panel"><div class="row-head"><h2>${tr('Tickets', 'Tickets')} <span class="r-count">${tested.length}</span></h2></div>
    <div class="scroll"><table class="grid rtable"><tr><th>Ticket</th><th>Title</th><th>Priority</th><th>Developer</th><th>${tr('Test cases', 'Casos de prueba')}</th><th>${tr('Result', 'Resultado')}</th><th>${tr('Evidence', 'Evidencia')}</th></tr>
    ${tested.map(t => `<tr><td>${idLink(t.id, t.link)}</td><td class="r-title">${esc(t.title)}${r.bugs.fixedIds.includes(t.id) ? ` <span class="r-tag" title="${esc(tr('Filed as a bug this sprint and fixed before close', 'Reportado como bug este sprint y corregido antes del cierre'))}">${tr('bug fixed', 'bug corregido')}</span>` : ''}</td><td>${prioPill(t.priority)}</td><td>${esc(devsOf(t.dev).join(', ') || 'Unassigned')}</td><td>${ticketCases(t)}</td><td>${ticketResult(t)}</td><td>${pageLink(t.evidenceArtifact, 'ev-page small', tr('Evidence', 'Evidencia')) || '<span class="hint">—</span>'}</td></tr>`).join('')}
    </table></div>
    ${r.excluded.length ? `<p class="hint">${tr('On the board but filed under another sprint, not counted', 'En el tablero pero cargados en otro sprint, no cuentan')}: ${r.excluded.map(x => `${esc(x.id)} (${esc(x.sprint ?? '?')})`).join(', ')}.</p>` : ''}
  </section>`;

  // 5. Bugs
  const bugs = `<section class="panel"><div class="row-head"><h2>${tr('Bugs', 'Bugs')} <span class="r-count">${r.bugs.total}</span></h2></div>
    <section class="bug-group g-resolved"><h3>${tr('Fixed and retested in the sprint', 'Corregidos y re-probados en el sprint')} <span class="n">${fixed.length}</span></h3>${bugTable(fixed, c)}</section>
    <section class="bug-group g-not-blocking"><h3>${tr('Open, carried to the backlog', 'Abiertos, pasan al backlog')} <span class="n">${open.length}</span></h3>${bugTable(open, c)}</section>
    ${r.bugs.notFound.length ? `<p class="hint">${r.bugs.notFound.map(esc).join(', ')} ${tr('is a Bug row of this sprint that was sprint work under test (listed in Tickets), not a bug QA found.', 'es una fila Bug de este sprint que fue trabajo del sprint bajo prueba (está en Tickets), no un bug que encontró QA.')}</p>` : ''}
  </section>`;

  // 6. Deferred cases
  const deferred = r.deferred.length
    ? `<section class="panel"><div class="row-head"><h2>${tr('Deferred cases', 'Casos diferidos')} <span class="r-count">${r.deferred.length}</span></h2></div>
    <div class="scroll"><table class="grid rtable"><tr><th>TC</th><th>Ticket</th><th>${tr('Test case', 'Caso de prueba')}</th><th>${tr('Note', 'Nota')}</th></tr>
    ${r.deferred.map(d => `<tr><td class="id">${esc(d.tc)}</td><td>${idLink(d.ticket, c.state.tickets.find(t => t.id === d.ticket)?.link)}</td><td class="r-title">${esc(d.name ?? '')}</td><td class="hint">${tr(`Reason recorded on the case in ${TRK(c)}`, `Motivo registrado en el caso en ${TRK(c)}`)}</td></tr>`).join('')}
    </table></div></section>`
    : '';

  // 7. Not tested
  const notRow = (x: { id: string, title: string, note: string }) => `<li>${idLink(x.id, c.state.tickets.find(t => t.id === x.id)?.link)} ${esc(x.title)}<br><span class="hint">${esc(x.note)}</span></li>`;
  const notTested = neverReached.length + notCounted.length
    ? `<section class="panel"><div class="row-head"><h2>${tr('Not tested this sprint', 'Sin probar este sprint')} <span class="r-count">${neverReached.length + notCounted.length}</span></h2></div>
    ${neverReached.length ? `<div><span class="lbl">${tr('Never reached the test environment', 'Nunca llegaron al entorno de pruebas')}</span><ul class="r-list">${neverReached.map(notRow).join('')}</ul></div>` : ''}
    ${notCounted.length ? `<div><span class="lbl">${tr('Not counted', 'Sin contar')}</span><p class="hint">${tr('No test case on record, so they are left out of every total above.', 'Sin casos de prueba registrados, así que quedan fuera de todos los totales.')}</p><ul class="r-list">${notCounted.map(notRow).join('')}</ul></div>` : ''}
  </section>`
    : '';

  // 8. Footer
  const stp = httpsHref(r.stpUrl);
  const gen = `${fmtDay(c.state.generatedAt, true)} ${hhmm(c.state.generatedAt).replace('Z', ' UTC')}`;
  const foot = `<footer class="r-foot"><span>${tr('Generated from the Sprint Board on', 'Generado desde el Sprint Board el')} ${esc(gen)}</span>${stp ? `<span>${tr('Full record', 'Registro completo')}: <a href="${esc(stp)}" target="_blank" rel="noopener">STP</a></span>` : ''}<span class="hint">${tr('Theme: Auto, Light or Dark, top right.', 'Tema: Auto, Claro u Oscuro, arriba a la derecha.')}</span></footer>`;

  return `<div class="report">${head}${kpis}<div class="r-panels">${burnPanel}${bugPanel}${covPanel}</div>${ticketsTable}${bugs}${deferred}${notTested}${foot}</div>`;
}

// ---------------------------------------------------------------------------
// Timeline, evidence, history
// ---------------------------------------------------------------------------

export function viewTimeline(c: Ctx): string {
  const items = c.state.timeline.filter(e => !c.filter || `${e.ticket ?? ''} ${e.text}`.toLowerCase().includes(c.filter.toLowerCase())).slice(0, 400);
  let lastDay = '';
  return `<section class="panel"><div class="tl">${items.map((e) => {
    const d = day(e.at);
    const head = d !== lastDay ? `<div class="tl-day lbl">${esc(d)}</div>` : '';
    lastDay = d;
    return `${head}<div class="tl-item k-${esc(e.kind.replace('.', '-'))}"><span class="mono">${hhmm(e.at)}</span><span class="k">${esc(e.kind)}</span><span>${e.ticket ? `<a href="#" data-open="${esc(e.ticket)}" class="id">${esc(e.ticket)}</a> ` : ''}${esc(e.text)}</span></div>`;
  }).join('') || `<p class="hint">${tr('Nothing has happened yet.', 'Todavía no pasó nada.')}</p>`}</div></section>`;
}

const baseName = (p: string) => p.split('/').at(-1) ?? p;

/** One screenshot with its file name, caption and (big) a Copy image button. */
const figureHtml = (e: EvidenceView, src: string, big: boolean) => `<figure><img src="${esc(src)}" data-zoom="${esc(src)}" alt="${esc(e.caption ?? baseName(e.path))}" loading="lazy"><figcaption><span class="mono fname">${esc(baseName(e.path))}</span>${e.outcome === 'blocked' ? ' <span class="pill BLOCKED">blocked</span>' : ''}${e.caption ? `<br>${esc(e.caption)}` : ''}${big ? `<br><button class="btn" type="button" data-copy-img="${esc(src)}">${tr('Copy image', 'Copiar imagen')}</button>` : ''}</figcaption></figure>`;

/**
 * Evidence split by what it shows (Passed, then Failed / blocked, then no outcome recorded),
 * each split grouped by TC with ungrouped images last. Every image carries its file name.
 */
function evidenceSections(list: EvidenceView[], c: Ctx, big: boolean): string {
  const imgs = list.map(e => ({ ...e, src: c.img(e.path) })).filter((e): e is typeof e & { src: string } => Boolean(e.src));
  const splits = [
    { label: tr('Passed', 'Pasó'), cls: 'ev-pass', items: imgs.filter(e => e.outcome === 'passed') },
    { label: tr('Failed / blocked', 'Falló / bloqueado'), cls: 'ev-fail', items: imgs.filter(e => e.outcome === 'failed' || e.outcome === 'blocked') },
    { label: tr('No outcome recorded', 'Sin resultado registrado'), cls: 'ev-none', items: imgs.filter(e => !e.outcome) },
  ].filter(s => s.items.length);
  const figure = (e: (typeof imgs)[number]) => figureHtml(e, e.src, big);
  return splits.map((s) => {
    const tcs = [...new Set(s.items.map(e => e.tc).filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const groups = [...tcs.map(tc => ({ tc, items: s.items.filter(e => e.tc === tc) })), { tc: '', items: s.items.filter(e => !e.tc) }].filter(g => g.items.length);
    return `<div class="ev-split ${s.cls}"><span class="lbl">${s.label} · ${s.items.length}</span>${groups.map(g => `<div class="ev-group"><span class="hint">${g.tc ? `<span class="id">${esc(g.tc)}</span>` : tr('Not tied to a TC', 'Sin TC')}</span><div class="gallery${big ? '' : ' small'}">${g.items.map(figure).join('')}</div></div>`).join('')}</div>`;
  }).join('');
}

const OUTCOME_PILL: Record<keyof OutcomeCounts, string> = { passed: 'PASSED', failed: 'FAILED', blocked: 'BLOCKED', none: 'NOT-RUN' };
const OUTCOME_LABEL = (o: keyof OutcomeCounts) => (o === 'none' ? tr('no outcome', 'sin resultado') : o);
const outcomePills = (n: OutcomeCounts) => (['passed', 'failed', 'blocked', 'none'] as const).filter(o => n[o]).map(o => `<span class="pill ${OUTCOME_PILL[o]}">${OUTCOME_LABEL(o)} ${n[o]}</span>`).join('');
const chevron = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';

/**
 * Evidence, navigable: an accordion per ticket, then one per test case, closed by default. The
 * header carries the counts and the evidence page link; thumbnails render only once a case is open.
 */
export function viewEvidence(c: Ctx): string {
  const f = c.evidenceFilter ?? {};
  const open = c.evidenceOpen ?? new Set<string>();
  const shown = (p: string) => Boolean(c.img(p));
  const base = inScope(c);
  const withImages = groupEvidence(base, {}, shown);
  if (!withImages.length) { return `<section class="panel"><p class="hint">${tr('No evidence images yet. Workers save them under each ticket\'s evidence/ folder.', 'Aún no hay imágenes de evidencia. Los workers las guardan en la carpeta evidence/ de cada ticket.')}</p></section>`; }
  const groups = groupEvidence(base, f, shown);
  const images = groups.reduce((n, g) => n + g.total, 0);
  const total = withImages.reduce((n, g) => n + g.total, 0);
  const keys = groups.flatMap(g => [g.id, ...g.tcs.map(t => `${g.id}/${t.tc}`), ...(g.untied.length ? [`${g.id}/_`] : [])]);
  const gallery = (items: EvidenceView[]) => `<div class="gallery">${items.map(e => figureHtml(e, c.img(e.path)!, true)).join('')}</div>`;
  const inner = (key: string, head: string, items: EvidenceView[], cls = '') =>
    `<details class="acc acc-tc${cls}" data-acc="${esc(key)}"${open.has(key) ? ' open' : ''}><summary>${chevron}${head}</summary>${open.has(key) ? gallery(items) : ''}</details>`;
  const toolbar = `<div class="ev-toolbar" role="group" aria-label="${esc(tr('Filter evidence', 'Filtrar evidencia'))}">
    <label>${tr('Ticket', 'Ticket')} <select id="ev-ticket" data-ev-filter="ticket"><option value="">${tr('All', 'Todos')} (${withImages.length})</option>${withImages.map(g => `<option value="${esc(g.id)}"${f.ticket === g.id ? ' selected' : ''}>${esc(g.id)} · ${g.total}</option>`).join('')}</select></label>
    <label>${tr('Shows', 'Muestra')} <select id="ev-outcome" data-ev-filter="outcome"><option value="">${tr('Any outcome', 'Cualquier resultado')}</option>${[...EVIDENCE_OUTCOMES, 'none' as const].map(o => `<option value="${o}"${f.outcome === o ? ' selected' : ''}>${OUTCOME_LABEL(o)}</option>`).join('')}</select></label>
    <label class="check"><input type="checkbox" id="ev-defect" data-ev-filter="defect"${f.defectOnly ? ' checked' : ''}> ${tr('Only tickets with a defect', 'Solo tickets con defecto')}</label>
    <span class="spacer"></span>
    <span class="hint">${images} ${tr('of', 'de')} ${total} ${tr('images', 'imágenes')} · ${groups.length} ${tr('tickets', 'tickets')}</span>
    <button class="btn" type="button" data-ev-all="open" data-keys="${esc(keys.join(' '))}">${tr('Expand all', 'Expandir todo')}</button>
    <button class="btn" type="button" data-ev-all="close">${tr('Collapse all', 'Colapsar todo')}</button>
  </div>`;
  const body = groups.map((g) => {
    const tcs = g.tcs.map(t => inner(`${g.id}/${t.tc}`, `<span class="id">${esc(t.tc)}</span><span class="acc-title">${esc(t.name ?? '')}</span>${t.status ? `<span class="pill ${pillClass(t.status)}">${esc(t.status)}</span>` : ''}<span class="acc-meta">${outcomePills(t.counts)}<span class="n">${t.items.length} ${t.items.length === 1 ? tr('image', 'imagen') : tr('images', 'imágenes')}</span></span>`, t.items)).join('');
    const untied = g.untied.length ? inner(`${g.id}/_`, `<span class="acc-title muted">${tr('Not tied to a TC', 'Sin TC')}</span><span class="acc-meta">${outcomePills(outcomeCounts(g.untied))}<span class="n">${g.untied.length} ${g.untied.length === 1 ? tr('image', 'imagen') : tr('images', 'imágenes')}</span></span>`, g.untied, ' untied') : '';
    return `<details class="acc acc-ticket l-${pillClass(g.lane)}${g.hasDefect ? ' defect' : ''}" data-acc="${esc(g.id)}"${open.has(g.id) ? ' open' : ''}>
      <summary>${chevron}<span class="id">${esc(g.id)}</span><span class="acc-title">${esc(g.title)}</span><span class="pill ${pillClass(g.lane)}">${esc(g.lane)}</span><span class="acc-meta">${outcomePills(g.counts)}<span class="n">${g.tcs.length} TC · ${g.total} ${g.total === 1 ? tr('image', 'imagen') : tr('images', 'imágenes')}</span>${pageLink(g.page, 'ev-page small', tr('Evidence page', 'Página de evidencia'))}</span></summary>
      <div class="acc-body">${tcs}${untied}</div>
    </details>`;
  }).join('');
  return `<section class="panel ev-panel">${toolbar}${groups.length ? `<div class="accs">${body}</div>` : `<p class="hint">${tr('Nothing matches this filter.', 'Nada coincide con este filtro.')}</p>`}</section>`;
}

export function viewHistory(c: Ctx): string {
  const live = c.sprints.map(s => `<tr><td><a href="?sprint=${esc(s.slug)}#now">${esc(s.name)}</a>${s.slug === c.viewingSlug ? ` <span class="pill Running">${tr('viewing', 'viendo')}</span>` : ''}</td><td class="mono">${esc(day(s.startedAt))}</td><td class="mono">${esc(day(s.closedAt) || tr('open', 'abierto'))}</td></tr>`).join('');
  const arch = c.archives.map(a => `<li><a href="/archive/${esc(a)}" target="_blank" rel="noopener">${esc(a)}</a></li>`).join('');
  return `<section class="panel"><h2>${tr('Sprints on this machine', 'Sprints en esta máquina')}</h2>
    ${c.sprints.length ? `<div class="scroll"><table class="grid"><tr><th>Sprint</th><th>Started</th><th>Closed</th></tr>${live}</table></div>` : `<p class="hint">${tr('History lives on the local server. This is a frozen copy.', 'El historial vive en el servidor local. Esta es una copia congelada.')}</p>`}
    ${arch ? `<span class="lbl">${tr('Frozen snapshots', 'Copias congeladas')}</span><ul>${arch}</ul>` : ''}
    <p class="hint">${tr('Nothing here is committed. Each sprint keeps its own folder under .session/sprint-board/, and archive writes a self-contained HTML next to it.', 'Nada de esto se commitea. Cada sprint guarda su carpeta en .session/sprint-board/, y archive escribe un HTML autocontenido al lado.')}</p>
  </section>`;
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

/** Labelled rows of a decision card; an old need without the fields renders as a plain question. */
function decisionCard(n: Need): string {
  if (!isDecisionCard(n)) { return ''; }
  const row = (label: string, body: string) => `<dt>${label}</dt><dd>${body}</dd>`;
  const rec = n.choices?.find(o => o.key === n.recommend);
  const options = n.choices?.length
    ? `<ul class="choices">${n.choices.map(o => `<li class="${o.key === n.recommend ? 'rec' : ''}"><b class="mono">${esc(o.key)}</b> ${esc(o.action)}${o.key === n.recommend ? ` <span class="pill PASSED">${tr('recommended', 'recomendada')}</span>` : ''}${o.cost ? `<br><span class="hint">${tr('cost', 'costo')}: ${esc(o.cost)}</span>` : ''}</li>`).join('')}</ul>`
    : '';
  return `<dl class="decision">
    ${n.blocked ? row(tr('What cannot run', 'Qué no puede correr'), esc(n.blocked)) : ''}
    ${n.why ? row(tr('Why', 'Por qué'), esc(n.why)) : ''}
    ${options ? row(tr('Options', 'Opciones'), options) : ''}
    ${rec ? row(tr('QA recommends', 'QA recomienda'), `<b class="mono">${esc(rec.key)}</b> ${esc(rec.action)}`) : ''}
    ${n.decider ? row(tr('Who decides', 'Quién decide'), esc(n.decider)) : ''}
  </dl>`;
}

/** Pick buttons: a structured option fills `key: action`, an old one its raw text. */
const pickValues = (n: Need): string[] => (isDecisionCard(n) && n.choices?.length ? n.choices.map(o => `${o.key}: ${o.action}`) : n.options);

export function drawer(t: TicketView, c: Ctx): string {
  const c2 = tcCounts(t.tcs);
  // The automated chip (ADR-0020): beside each TC's own pill, never counted.
  const autoRun = t.tcs.find(x => x.automated)?.automated;
  const needs = t.needs.filter(n => !n.answer);
  const answered = t.needs.filter(n => n.answer);
  const drafts = c.state.asks.filter(a => a.tickets.includes(t.id));
  const events = c.state.timeline.filter(e => e.ticket === t.id).slice(0, 30);
  // This ticket's own test data first, then what other tickets found in the same module.
  const all = c.state.fixtures ?? [];
  const fixtures = [...all.filter(f => f.ticket === t.id), ...(t.module ? all.filter(f => f.ticket !== t.id && f.module === t.module) : [])].slice(0, 12);
  return `<button class="btn ghost close" type="button" data-close>Esc ✕</button>
  <div><div class="row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="id">${esc(t.id)}</span><span class="pill ${pillClass(t.lane)}">${esc(t.lane)}</span><span class="pill source">${esc(TRK(c))}: ${esc(t.trackerStatus ?? '?')}</span>${t.attempt > 1 ? `<span class="flag retry">attempt ${t.attempt}</span>` : ''}${t.atRisk ? `<span class="flag">${tr('shipped at risk', 'salió con riesgo')}</span>` : ''}</div>
  <h2 style="margin-top:6px">${esc(t.title)}</h2>
  <p class="hint">${esc(t.dev ?? 'Unassigned')} · ${esc(t.priority ?? 'Not set')} · ${esc(t.type ?? '')}${t.link ? ` · <a href="${esc(t.link)}" target="_blank" rel="noopener">${tr(`open in ${TRK(c)}`, `abrir en ${TRK(c)}`)}</a>` : ''}</p></div>
  ${needs.map(n => `<div class="need-box"><b>◆ ${esc(n.question)}</b><span class="hint">${esc(n.blocker)} · ${tr('waiting', 'esperando')} ${ago(n.since, nowMs(c))}</span>
    ${decisionCard(n)}
    ${!n.synthetic && c.canWrite ? `${pickValues(n).length ? `<div class="opts">${pickValues(n).map(o => `<button class="btn" type="button" data-pick="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}<textarea id="answer-${esc(n.id)}" placeholder="${esc(tr('Your answer. The worker reads it back.', 'Tu respuesta. El worker la lee.'))}"></textarea><div><button class="btn primary" type="button" data-answer="${esc(t.id)}" data-need="${esc(n.id)}">${tr('Send answer', 'Enviar respuesta')}</button></div>` : ''}
    ${n.synthetic ? `<span class="hint">${tr('Raised by the board itself, not by a worker.', 'La levantó el propio tablero, no un worker.')}</span>` : ''}</div>`).join('')}
  ${t.verdictNote || t.evidenceArtifact || t.evidence.length
    ? `<section class="verdict-row"><div><span class="lbl">Verdict</span><div>${t.verdictNote ? `${esc(t.verdict)}: ${esc(t.verdictNote)}` : `<span class="pill ${pillClass(t.verdict)}">${esc(t.verdict)}</span>`}</div></div>${pageLink(t.evidenceArtifact, 'ev-page big') || noPage()}</section>`
    : ''}
  ${t.hold ? `<section><span class="lbl">Held</span><div>${esc(t.hold.reason)}: ${esc(t.hold.note)}${t.hold.on ? ` (${esc(t.hold.on)})` : ''}</div></section>` : ''}
  ${t.waits.length ? `<section><span class="lbl">${tr('Waiting on', 'Esperando a')}</span>${t.waits.map(w => `<div class="progress-line">${esc(w.person)}: ${esc(w.what)} · ${ago(w.since, nowMs(c))}</div>`).join('')}</section>` : ''}
  ${answered.length ? `<section><span class="lbl">${tr('Your answers', 'Tus respuestas')}</span>${answered.map(n => `<div class="progress-line m-COMPLETE">${esc(n.question)}<br><b>→ ${esc(n.answer)}</b></div>`).join('')}</section>` : ''}
  <section><span class="lbl">Test cases · ${c2.PASSED} PASSED · ${c2.FAILED} FAILED · ${c2.DEFERRED} DEFERRED · ${c2['NOT RUN']} NOT RUN</span>${autoRun ? `<br><span class="hint">${tr('Automated run', 'Corrida automatizada')} ${esc(day(autoRun.at))} ${hhmm(autoRun.at)} · ${esc(autoRun.env)}</span>` : ''}
    ${t.tcs.length ? `<table class="grid">${t.tcs.map(x => `<tr><td class="id">${esc(x.id)}</td><td>${esc(x.name ?? '')}${x.reason ? `<br><span class="hint">${esc(x.reason)}</span>` : ''}${x.approval ? `<br><span class="hint">${tr('approved by', 'aprobado por')} ${esc(x.approval)}</span>` : ''}${x.history.length > 1 ? `<br><span class="hint">${x.history.map(h => esc(h.status)).join(' → ')}</span>` : ''}</td><td><span class="pill ${pillClass(x.status)}">${esc(x.status)}</span>${x.automated ? ` <span class="pill source" title="${esc(tr(`Automated result, ${x.automated.records} test(s); the case's status stays the one on its left`, `Resultado automatizado, ${x.automated.records} test(s); el estado del caso sigue siendo el de su izquierda`))}">automated</span> <span class="pill ${pillClass(x.automated.status)}">${esc(x.automated.status)}</span>` : ''}</td></tr>`).join('')}</table>` : `<p class="hint">${tr('No test cases on record yet.', 'Todavía no hay casos registrados.')}</p>`}
  </section>
  ${t.bugs.length ? `<section><span class="lbl">Bugs</span><table class="grid">${t.bugs.map(b => `<tr><td class="id">${b.link ? `<a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(b.id)}</a>` : esc(b.id)}</td><td>${esc(b.title ?? '')}</td><td>${esc(b.severity ?? '')}</td><td><span class="pill source">${esc(b.status ?? '?')}</span></td><td>${pageLink(b.page, 'ev-page small', tr('Evidence', 'Evidencia'), b.pageFrom)}</td></tr>`).join('')}</table></section>` : ''}
  ${t.evidence.some(e => c.img(e.path)) ? `<section class="evidence"><span class="lbl">Evidence</span>${evidenceSections(t.evidence, c, false)}</section>` : ''}
  ${fixtures.length ? `<section><span class="lbl">${tr('Test data found', 'Datos de prueba encontrados')}${t.module ? ` · ${esc(t.module)}` : ''}</span>${fixtures.map(f => fixtureLine(f, c, f.ticket !== t.id)).join('')}</section>` : ''}
  ${drafts.length ? `<section><span class="lbl">${tr('Messages for this ticket', 'Mensajes de este ticket')}</span>${drafts.map(a => draftCard(a, c)).join('')}</section>` : ''}
  ${t.progress.length ? `<section><span class="lbl">Live Progress</span>${t.progress.slice(-8).map(l => `<div class="progress-line m-${esc(l.marker ?? '')}">${l.at ? `<span class="mono">${hhmm(l.at)}</span> ` : ''}${esc(l.text)}</div>`).join('')}</section>` : ''}
  ${events.length ? `<section><span class="lbl">Timeline</span>${events.map(e => `<div class="progress-line"><span class="mono">${day(e.at).slice(5)} ${hhmm(e.at)}</span> ${esc(e.text)}</div>`).join('')}</section>` : ''}`;
}

export const langLabel = () => (getLang() === 'es' ? 'ES' : 'EN');
