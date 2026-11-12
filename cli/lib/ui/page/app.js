/* The page engine. The approved mockup player (installer-ui-spike/mockup/src/engine.js) rewritten to
   render REAL journal entries (cli/lib/ui/events.ts) instead of scripted scenarios.

   Sources:
     live   EventSource on ./events (replays from Last-Event-ID on reconnect), answers via POST ./answer
     saved  the journal embedded in the page (saved summary): rendered at once, nothing to answer

   Every string that comes from the run is text, or limited markup through safe(): <b>, <code>, `code`
   and double-bracket glossary terms. Nothing from an event is ever inserted as raw HTML. */
(() => {
  const CFG = JSON.parse(document.getElementById('ui-config').textContent);
  const S = CFG.S;
  const G = CFG.G;
  window.UI = { S, CFG };

  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) { continue; }
      if (k === 'class') { el.className = v; }
      else if (k === 'html') { el.innerHTML = v; }
      else if (k.startsWith('on')) { el.addEventListener(k.slice(2), v); }
      else { el.setAttribute(k, v === true ? '' : v); }
    }
    for (const kid of kids.flat()) {
      if (kid != null && kid !== false) { el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
    }
    return el;
  };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  /** Limited markup: escape everything, then re-enable <b>, <code>, `code` and double-bracket glossary buttons. */
  const safe = s => esc(s ?? '')
    .replace(/&lt;(\/?)(b|code)&gt;/g, '<$1$2>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, '<button type="button" class="term-btn" data-g="$1">$2</button>');
  const plain = s => String(s ?? '').replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, '$1').replace(/<\/?(?:b|code)>/g, '').replace(/`/g, '');
  const fill = (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

  const ICON = {
    ok: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.2" stroke="currentColor" stroke-width="1.4"/><path d="M4.8 8.2l2.1 2.1 4.3-4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bad: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.2" stroke="currentColor" stroke-width="1.4"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    warn: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.6l6.8 12H1.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.6" r="0.9" fill="currentColor"/></svg>',
    skip: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.2" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.4 2"/><path d="M5.5 8h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7.2" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="4.9" r="0.9" fill="currentColor"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7.5" rx="1.6" stroke="currentColor" stroke-width="1.4"/><path d="M5.3 7V5.2a2.7 2.7 0 015.4 0V7" stroke="currentColor" stroke-width="1.4"/></svg>',
  };
  const icon = (k, cls) => h('span', { class: `ic ${cls || `${k}-ic`}`, html: ICON[k] });
  const statusIcon = s => (s === 'ok' ? icon('ok') : s === 'warn' ? icon('warn') : s === 'skipped' ? icon('skip') : icon('bad'));

  /* ---------------- glossary popovers (from the mockup) ---------------- */
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; };
  function openPop(btn, key) {
    closePop();
    const g = G[key];
    if (!g) { return; }
    pop = h('div', { 'class': 'pop', 'role': 'dialog', 'aria-label': g.t }, h('b', {}, g.t), h('p', { html: safe(g.d) }));
    pop.dataset.k = key;
    document.body.append(pop);
    const r = btn.getBoundingClientRect();
    const w = Math.min(340, innerWidth - 24);
    pop.style.maxWidth = `${w}px`;
    pop.style.left = `${Math.max(12, Math.min(r.left, innerWidth - w - 12))}px`;
    const below = r.bottom + 8 + pop.offsetHeight < innerHeight;
    pop.style.top = `${below ? r.bottom + 8 : Math.max(12, r.top - pop.offsetHeight - 8)}px`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-g]');
    if (b) { e.stopPropagation(); pop && pop.dataset.k === b.dataset.g ? closePop() : openPop(b, b.dataset.g); return; }
    if (pop && !e.target.closest('.pop')) { closePop(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePop(); } });
  addEventListener('scroll', closePop, true);
  const qmark = key => h('button', { 'type': 'button', 'class': 'qmark', 'data-g': key, 'aria-label': S.whatIsThis }, '?');

  function copyLine(cmd) {
    const span = h('span', {}, cmd);
    const btn = h('button', { type: 'button' }, S.copy);
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(cmd); btn.textContent = S.copied; }
      catch {
        const r = document.createRange();
        r.selectNodeContents(span);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        btn.textContent = S.copyManual;
      }
      setTimeout(() => { btn.textContent = S.copy; }, 1600);
    });
    return h('div', { class: 'copyline' }, span, btn);
  }

  /* ---------------- state ---------------- */
  const live = CFG.mode === 'live';
  const R = {
    phases: [],
    current: null,
    steps: new Map(),
    asks: new Map(),
    lastSeq: 0,
    readonly: false,
    ended: null,
    offline: false,
    restartBanner: null,
    sawRestart: false,
    clock: { ts: 0, at: 0, running: false },
  };
  const stream = $('#stream');
  const lanes = $('#lanes');
  const log = $('#log');

  function add(el) {
    if (live) { el.classList.add('enter'); }
    stream.append(el);
    if (live) { el.scrollIntoView({ block: 'nearest' }); }
    return el;
  }

  let termLines = 0;
  function term(text, cls = '') {
    log.append(h('div', { class: cls }, text));
    termLines += 1;
    if (termLines > 3000) { log.firstChild.remove(); termLines -= 1; }
    log.scrollTop = log.scrollHeight;
  }

  /* ---------------- chrome: state chip, clock, theme ---------------- */
  function refreshState() {
    const el = $('#state');
    let kind = 'run';
    let label = S.stateRun;
    const open = [...R.asks.values()].filter(a => !a.answered);
    if (R.ended) {
      const map = { 'done': ['done', S.stateDone], 'done-with-pending': ['pending', S.statePending], 'failed': ['fail', S.stateFailed], 'aborted': ['fail', S.stateAborted] };
      [kind, label] = map[R.ended] || map.done;
    }
    else if (R.offline) { [kind, label] = ['off', S.stateOffline]; }
    else if (open.some(a => a.fail)) { [kind, label] = ['fail', S.stateFail]; }
    else if (open.length) { [kind, label] = ['ask', S.stateAsk]; }
    else if (R.readonly) { [kind, label] = ['ro', S.stateReadonly]; }
    el.className = `state ${kind}`;
    el.textContent = label;
  }
  function tick() {
    const c = R.clock;
    const ms = c.running ? c.ts + (performance.now() - c.at) : c.ts;
    const s = Math.max(0, Math.floor(ms / 1000));
    $('#clock').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  setInterval(tick, 500);

  function setupTheme() {
    const seg = $('#theme');
    const opts = [['system', S.themeSystem], ['light', S.themeLight], ['dark', S.themeDark]];
    let cur = 'system';
    try { cur = localStorage.getItem('ui-theme') || 'system'; }
    catch {}
    const apply = (v) => {
      if (v === 'system') { document.documentElement.removeAttribute('data-theme'); }
      else { document.documentElement.setAttribute('data-theme', v); }
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.th === v)));
    };
    for (const [v, label] of opts) {
      seg.append(h('button', { 'type': 'button', 'data-th': v, 'aria-pressed': 'false', 'onclick': () => {
        apply(v);
        try { localStorage.setItem('ui-theme', v); }
        catch {}
      } }, label));
    }
    apply(cur);
  }

  /* ---------------- rail ---------------- */
  function buildRail(phases) {
    R.phases = phases.map((p, i) => ({ ...p, n: i + 1 }));
    const rail = $('#rail');
    rail.setAttribute('aria-label', S.phasesHeading);
    rail.replaceChildren(h('h2', {}, S.phasesHeading));
    for (const p of R.phases) {
      p.el = h('div', { class: 'ph', id: `ph-${p.id}` }, h('span', { class: 'dot' }, String(p.n)), h('span', { class: 'nm' }, p.title, h('span', { class: 'sub' }, p.hint || '')));
      rail.append(p.el);
    }
    rail.append(h('div', { class: 'meter' }, h('span', { id: 'meter-l' }, fill(S.phasesMeter, { done: 0, total: R.phases.length })), h('div', { class: 'bar' }, h('i', { id: 'meter-bar' }))));
  }
  function railMark(id, cls, sub) {
    const p = R.phases.find(x => x.id === id);
    if (!p) { return; }
    p.el.classList.remove('active', 'done', 'fail', 'warn', 'skip');
    if (cls) { p.el.classList.add(cls); }
    const dot = p.el.querySelector('.dot');
    dot.textContent = cls === 'done' ? '✓' : cls === 'fail' || cls === 'warn' ? '!' : cls === 'skip' ? '–' : String(p.n);
    if (sub) { p.el.querySelector('.sub').textContent = sub; }
    const done = R.phases.filter(x => ['done', 'warn', 'skip'].some(c => x.el.classList.contains(c))).length;
    $('#meter-l').textContent = fill(S.phasesMeter, { done, total: R.phases.length });
    $('#meter-bar').style.width = `${(done / Math.max(1, R.phases.length)) * 100}%`;
  }
  const phaseTitle = id => R.phases.find(p => p.id === id)?.title || id;
  const phaseNumber = id => R.phases.find(p => p.id === id)?.n;

  /* ---------------- background lanes (owner answer Q2) ---------------- */
  function refreshLanes() {
    const bg = [...R.steps.values()].filter(s => s.running && (s.lane || s.phase !== R.current));
    lanes.hidden = bg.length === 0;
    if (!bg.length) { lanes.replaceChildren(); return; }
    lanes.replaceChildren(h('div', { class: 'lh' }, S.background, ' ', qmark('lane')), ...bg.map(s => h('button', { type: 'button', class: 'lane-row', onclick: () => s.row.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, h('span', { class: 'ic' }, h('span', { class: 'spin' })), h('span', { class: 'ln' }, plain(s.title), h('span', { class: 'll' }, s.last || phaseTitle(s.phase))), s.lane ? h('span', { class: 'lane-chip' }, s.lane) : h('span', {}))));
  }

  /* ---------------- answers ---------------- */
  async function send(id, value, card) {
    if (!live || R.ended) { return; }
    const err = card.querySelector('.send-err') || card.appendChild(h('div', { class: 'send-err', role: 'status' }));
    card.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
    err.textContent = S.sending;
    try {
      const res = await fetch('answer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-run-token': CFG.token }, body: JSON.stringify({ id, value }) });
      if (res.ok) { err.textContent = ''; return; }
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) { err.textContent = S.answeredElsewhere; return; }
      err.textContent = body.message || S.answerFailed;
    }
    catch { err.textContent = S.answerFailed; }
    if (!R.asks.get(id)?.answered) { card.querySelectorAll('button, input').forEach((b) => { b.disabled = false; }); }
  }

  function askCard(e) {
    const card = h('div', { 'class': 'card ask', 'role': 'group', 'aria-label': e.title, 'data-ask': e.id });
    card.append(h('div', { class: 'kicker' }, e.kicker || S.question));
    card.append(h('h4', {}, e.title, e.g ? [' ', qmark(e.g)] : null));
    if (e.why) { card.append(h('p', { class: 'why', html: safe(e.why) })); }
    const widget = window.ASK_KINDS[e.kind];
    const finish = value => send(e.id, value, card);
    const body = widget ? widget(e, finish, { h, safe, fill, ICON }) : { el: h('p', {}, e.kind) };
    card.append(body.el);
    const controls = h('div', { class: 'controls' });
    if (body.submit) { controls.append(h('button', { type: 'button', class: 'btn primary', onclick: body.submit }, e.spec.cta || S.continue)); }
    for (const b of e.spec.secondary || []) { controls.append(h('button', { type: 'button', class: 'btn', onclick: () => finish(b.value) }, b.label)); }
    if (body.submit) { controls.append(h('span', { class: 'aside' }, h('kbd', {}, 'Enter'), ' ', S.enterToContinue)); }
    if (controls.childNodes.length) { card.append(controls); }
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && body.submit && !ev.target.closest('button')) { ev.preventDefault(); body.submit(); }
    });
    if (!live) { card.querySelectorAll('button:not(.qmark):not(.term-btn), input').forEach((b) => { b.disabled = true; }); }
    add(card);
    if (live) { setTimeout(() => card.querySelector('input:not([type=checkbox]), .opt, .btn.primary')?.focus({ preventScroll: true }), 50); }
    R.asks.set(e.id, { card, answered: false, fail: false });
  }

  function failCard(e) {
    const card = h('div', { 'class': 'card fail', 'data-ask': e.id });
    card.append(h('div', { class: 'kicker' }, icon('bad', 'bad-ic'), S.failKicker));
    card.append(h('h4', {}, e.title));
    card.append(h('div', { class: 'fail-grid' }, h('div', {}, h('h5', {}, S.failWhat), h('div', { html: safe(e.what) })), h('div', {}, h('h5', {}, S.failHow), h('ol', {}, (e.how || []).map(x => h('li', { html: safe(x) }))))));
    if (e.cmd) { card.append(copyLine(e.cmd)); }
    card.append(h('div', { class: 'controls' }, e.actions.map((a, i) => h('button', { type: 'button', class: `btn${i === 0 ? ' primary' : ''}`, onclick: () => send(e.id, a.value, card) }, a.label))));
    if (!live) { card.querySelectorAll('.controls button').forEach((b) => { b.disabled = true; }); }
    add(card);
    R.asks.set(e.id, { card, answered: false, fail: true });
  }

  /* ---------------- rendering one entry ---------------- */
  const handlers = {
    'run.start': (e) => {
      const cmd = `bun ${e.cmd === 'up' ? 'sync' : e.cmd}${e.args.length ? ` ${e.args.join(' ')}` : ''}`;
      $('#cmd').replaceChildren(h('span', { class: 'p' }, '$'), ` ${cmd} `, h('span', { class: 'repo' }, `· ${e.repo}`));
      document.title = `${cmd} · ${CFG.brand.name}`;
      buildRail(e.phases);
      R.readonly = e.mode === 'readonly';
      R.clock.running = true;
      term(`$ ${cmd}`, 'a');
      if (R.readonly) {
        add(h('div', { class: 'card info' }, h('div', { class: 'kicker' }, S.readonlyKicker), h('h4', {}, S.readonlyTitle), h('p', { class: 'why', html: safe(S.readonlyBody) })));
      }
    },

    'preflight': (e) => {
      const card = h('div', { class: 'card pf' }, h('div', { class: 'kicker', style: 'color:var(--fg-3)' }, S.preflightKicker, ' ', qmark('preflight')));
      const groups = new Map();
      for (const c of e.checks) {
        const g = c.group || '';
        if (!groups.has(g)) { groups.set(g, []); }
        groups.get(g).push(c);
      }
      const grid = h('div', { class: groups.size > 1 ? 'pf-groups' : '' });
      for (const [g, items] of groups) {
        const box = h('div', { class: groups.size > 1 ? 'pf-g' : '' }, g ? h('h5', {}, g) : null);
        for (const c of items) {
          const ic = c.state === 'ok' ? icon('ok') : c.state === 'warn' ? icon('warn', 'warn-ic') : c.state === 'block' ? icon('bad', 'bad-ic') : icon('skip');
          const right = c.state === 'warn' ? h('span', { class: 'pill warn' }, S.warnPill) : c.state === 'block' ? h('span', { class: 'pill block' }, S.blockPill) : h('span', { class: 'v' }, c.value || '');
          box.append(h('div', { class: 'chk-row' }, ic, h('span', {}, c.label, c.msg ? h('span', { class: 'msg', html: safe(c.msg) }) : null), right));
          term(`  ${c.state === 'ok' ? '✔' : c.state === 'warn' ? '▲' : c.state === 'block' ? '✖' : '–'} ${c.label}  ${c.value || ''}`, c.state === 'ok' ? 'g' : c.state === 'warn' ? 'a' : c.state === 'block' ? 'r' : 'd');
        }
        grid.append(box);
      }
      card.append(grid);
      const v = e.verdict;
      card.append(h('div', { class: `verdict${v === 'clear' ? '' : ' warn'}` }, v === 'clear' ? icon('ok') : v === 'warn' ? icon('warn', 'warn-ic') : icon('bad', 'bad-ic'), h('span', { html: safe(e.text || (v === 'clear' ? S.verdictClear : v === 'warn' ? S.verdictWarn : S.verdictBlock)) })));
      add(card);
    },

    'phase.start': (e) => {
      if (R.current && R.current !== e.id) {
        const prev = R.phases.find(p => p.id === R.current);
        if (prev && prev.el.classList.contains('active')) { railMark(R.current, 'done'); }
      }
      R.current = e.id;
      railMark(e.id, 'active');
      const n = phaseNumber(e.id);
      const eyebrow = n ? fill(S.eyebrowPhase, { n }) : '';
      const title = e.title || phaseTitle(e.id);
      add(h('div', { class: 'phase-head', id: `head-${e.id}` }, h('span', { class: 'eyebrow' }, eyebrow), h('h3', {}, title), e.why ? h('p', { html: safe(e.why) }) : null));
      term('');
      term(`◆ ${eyebrow} · ${title}`, 'a');
      refreshLanes();
    },

    'phase.end': (e) => {
      railMark(e.id, e.status === 'done' ? 'done' : e.status === 'warn' ? 'warn' : e.status === 'skipped' ? 'skip' : 'fail', e.note);
      if (R.current === e.id) { R.current = null; }
      refreshLanes();
    },

    'step.start': (e) => {
      const live2 = h('div', { class: 'live' });
      const t = h('div', { class: 't' }, h('span', { html: safe(e.title) }), e.lane ? h('span', { class: 'lane-chip' }, e.lane) : null, e.why ? [' ', qmark(e.why)] : null, e.detail ? h('small', { html: safe(e.detail) }) : null, live2);
      const row = add(h('div', { 'class': 'step running', 'data-step': e.id }, h('span', { class: 'ic' }, h('span', { class: 'spin' })), t, h('span', { class: 'dur' }, '')));
      R.steps.set(e.id, { row, t, liveEl: live2, title: e.title, phase: e.phase, lane: e.lane, running: true, last: '' });
      term(`  ⠋ ${plain(e.title)}`, 'd');
      refreshLanes();
    },

    'step.log': (e) => {
      const s = R.steps.get(e.id);
      if (s && s.running) { s.liveEl.textContent = e.line; s.last = e.line; }
      term(`    ${e.line}`, e.stream === 'err' ? 'r' : 'd');
      if (s?.lane || (s && s.phase !== R.current)) { refreshLanes(); }
    },

    'step.end': (e) => {
      const s = R.steps.get(e.id);
      if (!s) { return; }
      s.running = false;
      s.row.classList.remove('running');
      s.liveEl.remove();
      s.row.firstChild.replaceWith(statusIcon(e.status));
      if (e.status === 'warn') { s.row.classList.add('warned'); }
      if (e.status === 'failed') { s.row.classList.add('failed'); }
      s.row.querySelector('.dur').textContent = e.status === 'skipped' ? S.skipped : `${(e.ms / 1000).toFixed(1)} s`;
      if (e.note) { (s.t.querySelector('small') || s.t.appendChild(h('small'))).innerHTML = safe(e.note); }
      const glyph = e.status === 'ok' ? '✔' : e.status === 'warn' ? '▲' : e.status === 'skipped' ? '–' : '✖';
      term(`  ${glyph} ${plain(s.title)}${e.note ? `  ${plain(e.note)}` : ''}`, e.status === 'ok' ? 'g' : e.status === 'warn' ? 'a' : e.status === 'skipped' ? 'd' : 'r');
      refreshLanes();
    },

    'notice': (e) => {
      const ic = e.level === 'warn' ? icon('warn', 'warn-ic') : e.level === 'error' ? icon('bad', 'bad-ic') : icon('info', 'skip-ic');
      add(h('div', { class: `notice ${e.level}` }, ic, h('span', { html: safe(e.text) })));
      term(`  ${e.level === 'warn' ? '▲' : e.level === 'error' ? '■' : '●'} ${plain(e.text)}`, e.level === 'warn' ? 'a' : e.level === 'error' ? 'r' : '');
    },

    'ask': (e) => {
      askCard(e);
      term(`  ? ${e.title}  ${S.termAsk}`, 'a');
    },

    'fail': (e) => {
      failCard(e);
      term(`  ✖ ${e.title}`, 'r');
    },

    'answered': (e) => {
      const a = R.asks.get(e.id);
      if (a && !a.answered) {
        a.answered = true;
        a.card.classList.add('answered');
        a.card.querySelector('.send-err')?.remove();
        a.card.querySelectorAll('button:not(.qmark):not(.term-btn):not(.link), input').forEach((b) => { b.disabled = true; });
        a.card.append(h('div', { class: 'answer-line' }, h('span', {}, a.fail ? S.decisionLabel : S.answerLabel), h('b', {}, e.label)));
      }
      term(`    → ${e.label}`, 'b');
    },

    'restart': (e) => {
      R.sawRestart = true;
      R.restartBanner = add(h('div', { class: 'banner' }, h('span', { class: 'spin' }), h('span', { html: safe(S.restarting) })));
      term(`  ${S.restartTerm} (${e.from} → ${e.to})`, 'b');
    },

    'report': (e) => {
      const card = h('div', { class: 'card' });
      const tone = e.tone || 'good';
      card.append(h('div', { class: 'kicker', style: `color:var(--${tone === 'good' ? 'good' : tone === 'warn' ? 'warn' : 'bad'})` }, tone === 'good' ? icon('ok') : tone === 'warn' ? icon('warn', 'warn-ic') : icon('bad', 'bad-ic'), S.eyebrowEnd));
      if (e.title) { card.append(h('h4', {}, e.title)); }
      if (e.surfaces?.length) {
        card.append(h('div', { class: 'tbl-wrap' }, h('table', { class: 'rep' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, S.surfacesArea), h('th', {}, S.surfacesState))), h('tbody', {}, e.surfaces.map(s => h('tr', {}, h('td', {}, s.state === 'ok' ? icon('ok') : s.state === 'warn' ? icon('warn', 'warn-ic') : icon('bad', 'bad-ic')), h('td', {}, s.label), h('td', { html: safe(s.detail) })))))));
      }
      if (e.tiles?.length) {
        card.append(h('div', { class: 'tiles' }, e.tiles.map(t => h('div', { class: `tile ${t.tone || ''}` }, h('div', { class: 'n' }, t.n), h('div', { class: 'l' }, t.label)))));
      }
      if (e.findings?.length) {
        card.append(h('b', { style: 'font-size:13px;color:var(--fg-3);text-transform:uppercase;letter-spacing:.07em' }, S.findingsHeading, ' ', qmark('parity')));
        card.append(h('div', { class: 'tbl-wrap' }, h('table', { class: 'rep' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, S.surfacesArea), h('th', {}, S.findingsFile), h('th', {}, S.findingsNow), h('th', {}, S.findingsEvidence), h('th', {}, S.findingsSuggested))), h('tbody', {}, e.findings.map(f => h('tr', {}, h('td', { class: 'num' }, String(f.n)), h('td', {}, f.surface), h('td', {}, h('code', {}, f.file)), h('td', {}, f.now), h('td', { class: 'ev', html: safe(f.evidence) }), h('td', {}, f.suggested, f.blocking ? h('span', { class: 'blk' }, ` (${S.blocking})`) : null)))))));
      }
      if (e.next?.length) {
        card.append(h('div', { class: 'next' }, h('b', { style: 'font-size:13px;color:var(--fg-3);text-transform:uppercase;letter-spacing:.07em' }, S.next), e.next.map(n => h('div', { class: 'item' }, h('b', {}, n.title), n.text ? h('p', { html: safe(n.text) }) : null, n.cmd ? copyLine(n.cmd) : null))));
      }
      if (e.prompt) { card.append(h('details', { class: 'prompt' }, h('summary', {}, S.promptToggle), h('pre', {}, e.prompt))); }
      add(card);
      term(`  ◇ ${e.title || S.eyebrowEnd}`, 'g');
    },

    'run.end': (e) => {
      if (R.current) {
        const p = R.phases.find(x => x.id === R.current);
        if (p?.el.classList.contains('active')) { railMark(R.current, e.status === 'failed' ? 'fail' : 'done'); }
      }
      R.ended = e.status;
      R.clock.running = false;
      if (e.summaryPath) { add(h('div', { class: 'saved' }, icon('ok'), h('span', { html: safe(fill(S.savedAt, { path: `\`${e.summaryPath}\`` })) }))); }
      term('');
      term(S.endLine, e.status === 'failed' || e.status === 'aborted' ? 'r' : 'g');
      log.append(h('span', { class: 'cursor' }));
    },
  };

  function render(entry) {
    if (entry.seq <= R.lastSeq) { return; }
    R.lastSeq = entry.seq;
    R.clock.ts = entry.ts;
    R.clock.at = performance.now();
    if (R.restartBanner && entry.t !== 'restart') {
      R.restartBanner.className = 'banner good';
      R.restartBanner.replaceChildren(icon('ok'), h('span', { html: safe(S.reconnected) }));
      R.restartBanner = null;
    }
    const fn = handlers[entry.t];
    if (fn) {
      try { fn(entry); }
      catch (err) { console.error('render', entry.t, err); }
    }
    refreshState();
    tick();
  }

  /* ---------------- boot ---------------- */
  document.documentElement.lang = CFG.lang;
  $('#term-label').textContent = S.termBar;
  $('#log').setAttribute('aria-label', S.termBar);
  const toggle = $('#term-toggle');
  toggle.textContent = S.termHide;
  toggle.addEventListener('click', () => {
    const t = $('#term');
    t.classList.toggle('collapsed');
    toggle.textContent = t.classList.contains('collapsed') ? S.termShow : S.termHide;
  });
  $('#foot-note').textContent = CFG.note === 'saved' ? S.footSaved : CFG.note === 'replay' ? S.footReplay : S.footLive;
  setupTheme();
  refreshState();
  window.UI.render = render;
  window.UI.state = R;

  if (!live) {
    for (const entry of CFG.journal || []) { render(entry); }
    return;
  }

  let hadError = false;
  const es = new EventSource('events');
  es.onmessage = (m) => {
    try { render(JSON.parse(m.data)); }
    catch (err) { console.error('event', err); }
  };
  es.onerror = () => {
    if (R.ended) { es.close(); return; }
    hadError = true;
    R.offline = true;
    refreshState();
  };
  es.onopen = () => {
    // After a self-update restart, the NEW process serves the page: reload once so the page code is the
    // new version (it may know event kinds the old one did not). The journal replays; nothing is lost.
    if (hadError && R.sawRestart) { location.reload(); return; }
    R.offline = false;
    refreshState();
  };
})();
