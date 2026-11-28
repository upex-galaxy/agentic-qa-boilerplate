import type { HistoryPoint, OneshotLink, OneshotModel, OneshotParameter, OneshotStep, OneshotTest, TestStatus } from './model.ts';

import { NO_ERROR } from './model.ts';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strings redacted one at a time are tagged apart, or two of them can read as one key and value.
function apart(value: string): string {
  return `<span>${esc(value)}</span>`;
}

function humanMs(ms: number): string {
  if (ms < 1000) { return `${Math.round(ms)}ms`; }
  if (ms < 60_000) { return `${(ms / 1000).toFixed(1)}s`; }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

interface Slice { status: TestStatus, count: number }

function donut(slices: Slice[], total: number, setupFailed = 0): string {
  if (total === 0) {
    return `<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="No tests ran">
      <g class="donut-ring"><circle class="track" cx="60" cy="60" r="52" /></g>
      <text class="donut-pct" x="60" y="58">&mdash;</text>
      <text class="donut-sub" x="60" y="74">no tests ran</text>
    </svg>`;
  }

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const arcs = slices
    .filter(s => s.count > 0)
    .map((s) => {
      const fraction = s.count / total;
      const length = fraction * circumference;
      const arc = `<circle class="arc arc-${s.status}" cx="60" cy="60" r="${radius}"
        stroke-dasharray="${length.toFixed(3)} ${(circumference - length).toFixed(3)}"
        stroke-dashoffset="${(-offset).toFixed(3)}" />`;
      offset += length;
      return arc;
    })
    .join('\n');

  const executed = slices
    .filter(s => s.status !== 'skipped' && s.status !== 'unknown')
    .reduce((n, s) => n + s.count, 0);
  const passed = slices.find(s => s.status === 'passed')?.count ?? 0;
  const pct = executed === 0 ? 0 : Math.round((passed / executed) * 100);

  return `<svg viewBox="0 0 120 120" class="donut" role="img" aria-label="Result breakdown">
    <g class="donut-ring">
      <circle class="track" cx="60" cy="60" r="${radius}" />
      ${arcs}
    </g>
    <text class="donut-pct" x="60" y="58">${pct}%</text>
    <text class="donut-sub" x="60" y="74">${passed} of ${executed} run${setupFailed > 0 ? ', setup failed' : ''}</text>
  </svg>`;
}

function timeline(model: OneshotModel): string {
  const t0 = model.summary.startedAt;
  const span = model.summary.finishedAt - t0;
  if (span <= 0) { return ''; }

  const timed = model.tests
    .filter(t => t.start > 0 && t.stop > t.start)
    .sort((a, b) => a.start - b.start);
  if (timed.length === 0) { return ''; }

  const laneEnds: number[] = [];
  const placed: { test: OneshotTest, lane: number }[] = [];

  for (const test of timed) {
    let lane = laneEnds.findIndex(end => end <= test.start);
    if (lane === -1) { lane = laneEnds.length; }
    laneEnds[lane] = test.stop;
    placed.push({ test, lane });
  }

  const laneCount = laneEnds.length;
  const laneHeight = 11;
  const gap = 3;
  const height = laneCount * (laneHeight + gap);
  const width = 1000;

  const bars = placed.map(({ test, lane }) => {
    const x = ((test.start - t0) / span) * width;

    const w = Math.max(1.5, ((test.stop - test.start) / span) * width);
    const y = lane * (laneHeight + gap);
    return `<rect class="tl-bar tl-${test.status}" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${laneHeight}" rx="1.5"><title>${esc(test.name)}&#10;${humanMs(test.duration)}</title></rect>`;
  }).join('');

  const ticks = [0.25, 0.5, 0.75].map((f) => {
    const x = f * width;
    return `<line class="tl-tick" x1="${x}" y1="0" x2="${x}" y2="${height}" />`;
  }).join('');

  return `<section class="panel" id="timeline">
    <h2>Run shape <span class="count">${laneCount} parallel</span></h2>
    <p class="muted">Each bar is one test on the run's own clock. Lanes show how much ran at the same time.</p>
    <svg class="tl" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Test timeline">
      ${ticks}${bars}
    </svg>
    <div class="tl-axis">
      <span>0</span><span>${humanMs(span * 0.25)}</span><span>${humanMs(span * 0.5)}</span>
      <span>${humanMs(span * 0.75)}</span><span>${humanMs(span)}</span>
    </div>
  </section>`;
}

function trend(model: OneshotModel): string {
  const points = model.history;
  if (points.length < 2) { return ''; }

  const width = 1000;
  const height = 120;
  const pad = 6;

  const rate = (p: HistoryPoint): number => {
    const executed = p.passed + p.failed;
    return executed === 0 ? 0 : p.passed / executed;
  };

  const xs = (i: number): number => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * (width - pad * 2) + pad);
  const ys = (v: number): number => height - pad - v * (height - pad * 2);

  const line = points.map((p, i) => `${xs(i).toFixed(1)},${ys(rate(p)).toFixed(1)}`).join(' ');
  const area = `${xs(0).toFixed(1)},${height} ${line} ${xs(points.length - 1).toFixed(1)},${height}`;

  const dots = points.map((p, i) => {
    const isThisRun = model.runUrl !== '' && p.url === model.runUrl;
    const cls = p.failed > 0 ? 'tr-dot-bad' : 'tr-dot-good';
    return `<circle class="tr-dot ${cls}${isThisRun ? ' tr-dot-current' : ''}" cx="${xs(i).toFixed(1)}" cy="${ys(rate(p)).toFixed(1)}" r="${isThisRun ? 5 : 3.5}"><title>${esc(p.at.slice(0, 16).replace('T', ' '))} — ${(rate(p) * 100).toFixed(0)}% (${p.passed}/${p.passed + p.failed})</title></circle>`;
  }).join('');

  const first = points[0];
  const last = points[points.length - 1];
  const delta = (rate(last) - rate(first)) * 100;
  const arrow = delta > 0.5 ? '&uarr;' : delta < -0.5 ? '&darr;' : '&rarr;';
  const deltaCls = delta > 0.5 ? 'tr-up' : delta < -0.5 ? 'tr-down' : 'tr-flat';

  return `<section class="panel" id="trend">
    <h2>Trend <span class="count">${points.length} runs</span></h2>
    <p class="muted">Pass rate per run, oldest first, as the supplied history file counts it. It may not count the same tests as the headline above.</p>
    <div class="tr-head">
      <span class="tr-now">${(rate(last) * 100).toFixed(0)}%</span>
      <span class="tr-delta ${deltaCls}">${arrow} ${Math.abs(delta).toFixed(1)} pts</span>
      <span class="muted">since ${esc(first.at.slice(0, 10))}</span>
    </div>
    <div class="tr-plot"><svg class="tr" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Pass rate trend">
      <line class="tr-grid" x1="0" y1="${ys(1).toFixed(1)}" x2="${width}" y2="${ys(1).toFixed(1)}" />
      <line class="tr-grid" x1="0" y1="${ys(0.5).toFixed(1)}" x2="${width}" y2="${ys(0.5).toFixed(1)}" />
      <line class="tr-grid" x1="0" y1="${ys(0).toFixed(1)}" x2="${width}" y2="${ys(0).toFixed(1)}" />
      <polygon class="tr-area" points="${area}" />
      <polyline class="tr-line" points="${line}" />
      ${dots}
    </svg>
    <div class="tr-axis"><span>100%</span><span>50%</span><span>0%</span></div></div>
  </section>`;
}

function parameterChips(parameters: OneshotParameter[]): string {
  return parameters.map(p => `<span class="chip">${apart(p.name)}=${apart(p.value)}</span>`).join('');
}

function renderSteps(steps: OneshotStep[], depth = 0): string {
  if (steps.length === 0) { return ''; }

  return `<ul class="steps${depth === 0 ? ' steps-root' : ''}">${steps.map((step) => {
    const atc = step.atcId
      ? `<span class="chip chip-atc">${esc(step.atcId)}</span>`
      : '';
    const label = step.atcId
      ? esc(step.name.replace(/^ATC\s*\[[^\]]+\]:\s*/i, ''))
      : esc(step.name);

    return `<li class="step step-${step.status}">
      <div class="step-head">
        <span class="dot dot-${step.status}"></span>
        ${atc}
        <span class="step-name">${label}</span>
        ${parameterChips(step.parameters)}
        <span class="step-dur">${humanMs(step.duration)}</span>
      </div>
      ${renderSteps(step.steps, depth + 1)}
    </li>`;
  }).join('')}</ul>`;
}

function renderAttachments(test: OneshotTest): string {
  if (test.attachments.length === 0) { return ''; }

  const items = test.attachments.map((a) => {
    if (a.kind === 'image') {
      return `<figure class="att att-image">
        <figcaption>${esc(a.name)} <span class="muted">${(a.bytes / 1024).toFixed(0)} KB</span></figcaption>
        <img src="data:${esc(a.type)};base64,${a.body}" alt="${esc(a.name)}" loading="lazy" />
      </figure>`;
    }
    if (a.kind === 'video') {
      return `<figure class="att att-video">
        <figcaption>${esc(a.name)} <span class="muted">${(a.bytes / 1024 / 1024).toFixed(1)} MB</span></figcaption>
        <video controls preload="metadata" playsinline>
          <source src="data:${esc(a.type)};base64,${a.body}" type="${esc(a.type)}" />
        </video>
      </figure>`;
    }
    if (a.kind === 'text') {
      return `<details class="att att-text">
        <summary>${esc(a.name)} <span class="muted">${(a.bytes / 1024).toFixed(1)} KB</span></summary>
        <pre>${esc(a.body)}</pre>
      </details>`;
    }
    return `<div class="att att-omitted">
      <strong>${esc(a.name)}</strong> <span class="muted">${(a.bytes / 1024).toFixed(0)} KB</span>
      <p>${esc(a.body)}</p>
    </div>`;
  }).join('');

  return `<div class="attachments"><h4>Attachments</h4>${items}</div>`;
}

const ENVIRONMENT_SHAPES = [
  /TimeoutError/i,
  /Timeout \d+ms exceeded/i,
  /Test timeout of \d+ms exceeded/i,
  /ECONNREFUSED/,
  /ETIMEDOUT/,
  /net::ERR_/,
  /Navigation timeout/i,
  /browserType\.launch/,
  /socket hang up/i,

  /\bstatus(?: ?code)?[ :=]{0,3}50[234]\b/i,
  /\bHTTP\/\d(?:\.\d)? 50[234]\b/i,

  /\b50[234]\s+(?:Bad Gateway|Service (?:[A-Z]+ )?Unavailable|Gateway Time-?out|Server Error)\b/i,
  /context deadline exceeded/i,
];
const ASSERTION_SHAPES = [
  /\bexpect\(/,
  /\b(?:toBe|toEqual|toContain|toMatch|toHave)/,

  /^[ \t]*Expected:/m,
  /^[ \t]*Received:/m,
];

type FailureKind = 'assertion' | 'environment' | 'other';

type SkipKind = 'precondition' | 'outdated' | 'blocked' | 'other' | 'unexplained';

function classifySkip(message: string): SkipKind {
  if (message.trim() === '') { return 'unexplained'; }
  if (/\bstale\b|outdated|obsolete|deprecated/i.test(message)) { return 'outdated'; }
  if (/\bblocked\b|\bdisabled\b|\bgated\b/i.test(message)) { return 'blocked'; }
  if (/\bneeds?\b|\brequires?\b|\bmissing\b|\bcannot\b|does not exist|not found|not available|\bno\s[^\n]{0,200}?(?:data|record|seed|fixture|user|environment)|provision/i.test(message)) { return 'precondition'; }
  return 'other';
}

const SKIP_LABEL: Record<SkipKind, string> = {
  precondition: 'Missing precondition',
  blocked: 'Blocked',
  outdated: 'Outdated test or data',
  other: 'Other stated reason',
  unexplained: 'No reason recorded',
};

function gatewayThroughAssertion(message: string): boolean {
  const receivedGateway = /^[ \t]*Received:[ \t]*"?50[234]"?[ \t,]*$/m.test(message);
  if (!receivedGateway) { return false; }

  const expectedSuccess = /^[ \t]*Expected:[ \t]*"?[123]\d\d"?[ \t,]*$/m.test(message);
  return expectedSuccess || /\bstatus|\bhttp\b/i.test(message);
}

function classify(message: string): FailureKind {
  if (gatewayThroughAssertion(message)) { return 'environment'; }
  if (ENVIRONMENT_SHAPES.some(r => r.test(message))) { return 'environment'; }
  if (ASSERTION_SHAPES.some(r => r.test(message))) { return 'assertion'; }
  return 'other';
}

function bars(rows: { label: string, value: number, sub?: string, tone?: string }[]): string {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<ul class="bars">${rows.map(r => `<li class="bar-row">
    <span class="bar-label" title="${esc(r.label)}">${esc(r.label)}</span>
    <span class="bar-track"><span class="bar-fill${r.tone ? ` bar-${r.tone}` : ''}" style="width:${((r.value / max) * 100).toFixed(1)}%"></span></span>
    <span class="bar-value">${r.value}${r.sub ? ` <span class="muted">${esc(r.sub)}</span>` : ''}</span>
  </li>`).join('')}</ul>`;
}

const CSS = `
:root{
  --bg:#f7f8fb; --card:#fff; --line:#e5e5e7; --soft:#f0f1f4; --hover:#f4f6f9;
  --fg:#1c1c1e; --fg-2:#475569; --fg-3:#64748b;
  --pass:#22c55e; --pass-d:#15803d; --fail:#ef4444; --fail-d:#dc2626;
  --warn:#fbbf24; --warn-d:#d97706; --skip:#94a3b8; --broken:#8b5cf6;
  --accent:#3d7eff; --accent-soft:rgba(61,126,255,.10);
  --shadow:0 1px 2px rgba(16,24,40,.05);
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Inter,sans-serif;
  --nav:236px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#131417; --card:#1c1c1e; --line:#2b2d31; --soft:#232428; --hover:#25272c;
    --fg:#e8eaed; --fg-2:#b6bdc7; --fg-3:#8b93a1;
    --pass:#22c55e; --pass-d:#4ade80; --fail:#ef4444; --fail-d:#f87171;
    --accent:#8ab4ff; --accent-soft:rgba(138,180,255,.12);
    --shadow:0 1px 2px rgba(0,0,0,.4);
  }
}
:root[data-theme="dark"]{
  --bg:#131417; --card:#1c1c1e; --line:#2b2d31; --soft:#232428; --hover:#25272c;
  --fg:#e8eaed; --fg-2:#b6bdc7; --fg-3:#8b93a1;
  --pass-d:#4ade80; --fail-d:#f87171;
  --accent:#8ab4ff; --accent-soft:rgba(138,180,255,.12);
  --shadow:0 1px 2px rgba(0,0,0,.4);
}
*{box-sizing:border-box}

[hidden]{display:none !important}
html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--fg);font-family:var(--sans);font-size:13.5px;line-height:1.5;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{margin:0;font-weight:600;letter-spacing:-.01em}
a{color:var(--accent)}
code,pre,.mono{font-family:var(--mono)}
pre{margin:0;font-size:12px;white-space:pre-wrap;word-break:break-word}
.muted{color:var(--fg-3);font-weight:400}
.note{color:var(--fg-3);font-size:12px;margin:10px 0 0}

.app{display:flex;height:100vh;overflow:hidden}
.nav{width:var(--nav);flex:none;background:var(--card);border-right:1px solid var(--line);
  display:flex;flex-direction:column;padding:14px 12px;transition:width .14s ease}
body.collapsed .nav{width:60px}
body.collapsed .nav-label,body.collapsed .brand-sub,body.collapsed .nav-key,
body.collapsed .rate .tile-l,body.collapsed .brand-name{display:none}
body.collapsed .nav-item{justify-content:center}
body.collapsed .nav-foot{align-items:center}
body.collapsed .rate{text-align:center}
body.collapsed .rate-n{font-size:15px}
body.collapsed .nav-actions{flex-direction:column;gap:5px;width:100%;align-items:center}
body.collapsed .nav-top{justify-content:center;padding-left:0;padding-right:0}
body.collapsed .brand{display:none}
.nav-top{display:flex;align-items:center;gap:9px;padding:0 4px 16px}
.nav-toggle{border:0;background:none;cursor:pointer;padding:5px;border-radius:7px;flex:none}
.nav-toggle:hover{background:var(--soft)}
.hamburger,.hamburger::before,.hamburger::after{display:block;width:14px;height:1.5px;background:var(--fg-2);border-radius:2px}
.hamburger{position:relative}
.hamburger::before,.hamburger::after{content:"";position:absolute}
.hamburger::before{top:-4.5px}.hamburger::after{top:4.5px}
.brand{display:flex;flex-direction:column;min-width:0}
.brand-name{font-weight:700;letter-spacing:.15em;font-size:11.5px}
.brand-sub{color:var(--fg-3);font-size:10.5px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav-items{display:flex;flex-direction:column;gap:2px}
.nav-item{display:flex;align-items:center;gap:9px;border:0;background:none;color:var(--fg-2);
  font:inherit;font-size:13px;text-align:left;padding:7px 10px;border-radius:8px;cursor:pointer;width:100%}
.nav-item:hover{background:var(--soft);color:var(--fg)}
.nav-item.on{background:var(--accent-soft);color:var(--accent);font-weight:600}
.nav-ico{flex:none;opacity:.62}
.nav-item.on .nav-ico,.nav-item:hover .nav-ico{opacity:1}
.nav-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav-key{color:var(--fg-3);font-size:10.5px;font-family:var(--mono)}
.nav-foot{margin-top:auto;padding-top:12px;border-top:1px solid var(--soft);display:flex;flex-direction:column;gap:10px}
.rate-n{font-size:22px;font-weight:650;color:var(--pass-d);letter-spacing:-.02em}
.nav-actions{display:flex;gap:6px;flex-wrap:wrap}
.btn{border:1px solid var(--line);background:var(--card);color:var(--fg-2);border-radius:7px;
  padding:3px 9px;font:inherit;font-size:11.5px;cursor:pointer;text-decoration:none;display:inline-block}
.btn:hover{background:var(--soft);color:var(--fg)}

.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;
  padding:13px 20px;border-bottom:1px solid var(--line);background:var(--card)}
.page-title{font-size:16px}
.filters{display:flex;align-items:center;gap:10px;flex:1;justify-content:flex-end;max-width:640px}
.seg{display:inline-flex;background:var(--soft);border-radius:8px;padding:2px;flex:none}
.seg button{border:0;background:none;color:var(--fg-3);font:inherit;font-size:12px;padding:3px 11px;border-radius:6px;cursor:pointer}
.seg button.on{background:var(--card);color:var(--fg);box-shadow:var(--shadow);font-weight:600}
.search{flex:1;min-width:140px;background:var(--bg);border:1px solid var(--line);border-radius:8px;
  padding:6px 11px;font:inherit;font-size:12.5px;color:var(--fg)}
.search:focus{outline:none;border-color:var(--accent)}
.scroll{flex:1;overflow:auto;padding:18px 20px 40px}

.card{background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);margin-bottom:14px}
.card-h{padding:10px 14px;border-bottom:1px solid var(--soft);font-weight:600;font-size:12.5px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.card-b{padding:14px}
.card-b.center{display:flex;justify-content:center}
.count{background:var(--soft);color:var(--fg-3);border-radius:20px;padding:1px 8px;font-size:11px;font-weight:600}
.card-clean{border-color:var(--pass)}
.card-alarm{border-color:var(--fail);background:rgba(239,68,68,.06)}
.card-alarm strong{color:var(--fail-d)}
.row-hero{display:grid;grid-template-columns:250px 1fr;gap:14px;align-items:start}
.hero-right{display:flex;flex-direction:column;gap:14px}
.card-donut{margin:0}
.tiles{display:grid;grid-template-columns:repeat(7,1fr);gap:9px}
.tiles-3{grid-template-columns:repeat(3,1fr);margin-bottom:14px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;box-shadow:var(--shadow);
  text-align:left;font:inherit;color:inherit;display:block;width:100%}
.tile-go{cursor:pointer;position:relative}
.tile-go:hover{border-color:var(--accent);background:var(--accent-soft)}
.tile-go::after{content:"\\2192";position:absolute;top:9px;right:11px;color:var(--fg-3);font-size:12px;opacity:0;transition:opacity .12s}
.tile-go:hover::after{opacity:1}
.tile-n{font-size:20px;font-weight:650;letter-spacing:-.02em}
.tile-l{font-size:10px;color:var(--fg-3);text-transform:uppercase;letter-spacing:.07em;margin-top:1px}
.n-pass{color:var(--pass-d)}.n-fail{color:var(--fail-d)}.n-skip{color:var(--skip)}.n-known{color:var(--warn-d)}

.donut{width:158px;height:158px}

.donut-ring{transform:rotate(-90deg);transform-origin:60px 60px}
.donut .track{fill:none;stroke:var(--soft);stroke-width:15}
.donut-pct{text-anchor:middle;font-size:23px;font-weight:650;fill:var(--fg);letter-spacing:-.02em}
.donut-sub{text-anchor:middle;font-size:8.5px;fill:var(--fg-3)}
.donut .arc{fill:none;stroke-width:15;stroke-linecap:butt}
.arc-passed{stroke:var(--pass)}.arc-failed{stroke:var(--fail)}.arc-broken{stroke:var(--broken)}
.arc-skipped{stroke:var(--skip)}.arc-unknown{stroke:var(--line)}.arc-known-defect{stroke:var(--warn)}
#timeline,#trend{background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow);padding:14px;margin-bottom:14px}
#timeline h2,#trend h2{font-size:12.5px;display:flex;align-items:center;gap:9px}
#timeline .muted,#trend>.muted{font-size:12px;margin:6px 0 10px;max-width:92ch}
.tl{width:100%;height:auto}
.tl-bar{opacity:.92}
.tl-passed{fill:var(--pass)}.tl-failed{fill:var(--fail)}.tl-broken{fill:var(--broken)}
.tl-skipped{fill:var(--skip)}.tl-unknown{fill:var(--line)}.tl-known-defect{fill:var(--warn)}
.tl-tick{stroke:var(--line);stroke-dasharray:2 4}
.tl-axis{display:flex;justify-content:space-between;color:var(--fg-3);font-size:10.5px;font-family:var(--mono);margin-top:6px}
.tr-head{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.tr-now{font-size:24px;font-weight:650;letter-spacing:-.02em}
.tr-delta{font-family:var(--mono);font-size:12px}
.tr-up{color:var(--pass-d)}.tr-down{color:var(--fail-d)}.tr-flat{color:var(--fg-3)}

.tr-plot{position:relative;padding-right:42px}
.tr{width:100%;height:150px;display:block;overflow:visible}
.tr-grid{stroke:var(--line);stroke-dasharray:2 5}
.tr-area{fill:var(--accent-soft);stroke:none}
.tr-line{fill:none;stroke:var(--accent);stroke-width:2;vector-effect:non-scaling-stroke}
.tr-dot{stroke:var(--card);stroke-width:1.5}
.tr-dot-good{fill:var(--pass)}.tr-dot-bad{fill:var(--fail)}
.tr-dot-current{stroke-width:2.5}
.tr-axis{position:absolute;top:0;right:0;height:150px;width:38px;display:flex;flex-direction:column;
  justify-content:space-between;align-items:flex-end;color:var(--fg-3);font-size:10.5px;font-family:var(--mono)}

.bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.bar-row{display:grid;grid-template-columns:minmax(120px,240px) 1fr 80px;gap:10px;align-items:center;font-size:12.5px}
.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--fg-2)}
.bar-track{background:var(--soft);border-radius:5px;height:9px;overflow:hidden}
.bar-fill{display:block;height:100%;background:var(--accent);border-radius:5px}
.bar-pass{background:var(--pass)}.bar-fail{background:var(--fail)}
.bar-warn{background:var(--warn)}.bar-skip{background:var(--skip)}
.bar-value{font-family:var(--mono);font-size:11.5px;color:var(--fg-2);text-align:right}

.sigs{list-style:none;margin:0;padding:0;counter-reset:s}
.sig{border-bottom:1px solid var(--soft);padding:9px 0}
.sig:last-child{border-bottom:0}
.sig-head{display:flex;align-items:baseline;gap:9px}
.sig-rank{color:var(--fg-3);font-size:11px;width:14px;flex:none}
.sig-count{color:var(--fail-d);font-weight:650;font-size:11.5px;min-width:24px;flex:none}
.sig-text{font-size:11.5px;color:var(--fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sig-body{margin:6px 0 0 47px}
.sig-body summary{cursor:pointer;color:var(--fg-3);font-size:11.5px}
.sig-tests{margin:6px 0;padding-left:18px;color:var(--fg-2);font-size:12px}
.sig-sample{background:var(--soft);border-radius:7px;padding:9px;margin-top:6px;color:var(--fg-2)}
.kind{border-radius:5px;padding:0 6px;font-size:10px;font-weight:650;text-transform:uppercase;letter-spacing:.04em;flex:none}
.kind-assertion{background:rgba(239,68,68,.14);color:var(--fail-d)}
.kind-environment{background:rgba(251,191,36,.18);color:var(--warn-d)}
.kind-other{background:var(--soft);color:var(--fg-3)}
.kind-skip{background:var(--soft);color:var(--fg-3)}
.count-warn{background:rgba(251,191,36,.20);color:var(--warn-d)}

.reasons{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:5px}
.reason{display:flex;gap:9px;align-items:flex-start;padding:7px 9px;border-radius:7px;cursor:pointer;background:var(--soft)}
.reason:hover{background:var(--hover);outline:1px solid var(--line)}
.reason-x{font-family:var(--mono);font-size:11px;color:var(--fail-d);font-weight:650;flex:none}
.more summary{cursor:pointer;color:var(--fg-3);font-size:12px;margin-top:8px}
.more .reasons{margin-top:6px}
.reason-text{flex:1;font-size:12px;color:var(--fg-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.defectnote{background:rgba(251,191,36,.12);border:1px solid var(--warn);border-radius:9px;padding:11px;margin:10px 0}
.defectnote p{margin:0;font-size:12.5px;color:var(--fg-2)}
.defectnote .failure-h{color:var(--warn-d)}
.skipnote{background:var(--soft);border:1px solid var(--line);border-radius:9px;padding:11px;margin:10px 0}
.skipnote p{margin:0;font-size:12.5px;color:var(--fg-2)}
.skipnote .failure-h{color:var(--fg-3)}

.card-tree .card-b{padding:8px}
.node summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:7px}
.node summary::-webkit-details-marker{display:none}
.node summary:hover{background:var(--hover)}
.n1>summary{font-weight:600}
.n2,.n3{margin-left:15px}
.n2>summary .n-name{font-size:12.5px;color:var(--fg-2)}
.n-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chev{width:0;height:0;border-left:4.5px solid var(--fg-3);border-top:3.5px solid transparent;border-bottom:3.5px solid transparent;transition:transform .12s;flex:none}
details[open]>summary .chev{transform:rotate(90deg)}
.pill{border-radius:20px;padding:0 7px;font-size:10.5px;font-weight:650;color:#fff;min-width:19px;text-align:center;flex:none}
.pill-pass{background:var(--pass)}.pill-fail{background:var(--fail)}.pill-skip{background:var(--skip)}.pill-known{background:var(--warn)}
.leaves{list-style:none;margin:0;padding:0 0 3px 30px}
.leaf{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:6px;font-size:12.5px;cursor:pointer}
.leaf:hover{background:var(--hover)}
.leaf.on{background:var(--accent-soft)}
.leaf-n{color:var(--fg-3);font-size:11px;min-width:14px}
.leaf-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.leaf-dur{color:var(--fg-3);font-size:11px;font-variant-numeric:tabular-nums}
.tree-note{padding:0 14px 12px}
.empty{margin:18px 8px;color:var(--fg-3);font-size:12.5px;text-align:center}
.chiptoggle{border:1px solid var(--line);background:var(--card);color:var(--fg-3);border-radius:8px;
  padding:4px 10px;font:inherit;font-size:11.5px;cursor:pointer;flex:none;white-space:nowrap}
.chiptoggle:hover{color:var(--fg);border-color:var(--fg-3)}
.chiptoggle.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);font-weight:600}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.dot-passed{background:var(--pass)}.dot-failed,.dot-broken{background:var(--fail)}
.dot-skipped{background:var(--skip)}.dot-unknown{background:var(--line)}.dot-known-defect{background:var(--warn)}

.flat{list-style:none;margin:0;padding:0}
.flat-row{display:flex;align-items:center;gap:9px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:12.5px}
.flat-row:hover{background:var(--hover)}
.flat-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.flat-dur{color:var(--fg-3);font-size:11px;font-variant-numeric:tabular-nums}
.chip{background:var(--soft);color:var(--fg-3);border-radius:5px;padding:0 6px;font-size:10.5px;font-family:var(--mono);flex:none}
.chip-atc{background:var(--accent-soft);color:var(--accent)}
.chip-tag{background:rgba(139,92,246,.14);color:var(--broken)}
.chip-warn{background:rgba(251,191,36,.18);color:var(--warn-d)}
.chips-row{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 0}
.dt-desc{margin:8px 0 0;white-space:pre-wrap;word-break:break-word;font-size:12.5px;color:var(--fg-2)}
.dt-links{margin:8px 0 0;padding-left:18px;font-size:12px;word-break:break-all}
.kv{display:grid;grid-template-columns:minmax(120px,190px) 1fr;gap:5px 14px;margin:0;font-size:12.5px}
.kv dt{color:var(--fg-3)}
.kv dd{margin:0;word-break:break-word}

.detail{width:44%;min-width:380px;max-width:760px;flex:none;background:var(--card);
  border-left:1px solid var(--line);display:flex;flex-direction:column}
.detail[hidden]{display:none}
.detail-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line)}
.detail-title{flex:1;font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.detail-body{flex:1;overflow:auto;padding:14px}
.dt-head{display:flex;align-items:center;gap:9px;margin-bottom:6px}
.dt-head h3{font-size:14px}
.dt-meta{display:flex;justify-content:space-between;gap:10px;color:var(--fg-3);font-size:11.5px;margin-bottom:8px}
.failure{background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);border-radius:9px;padding:11px;margin:10px 0}
.failure-h{font-weight:650;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fail-d);margin-bottom:7px;display:flex;align-items:center;gap:8px}
.failure details summary{cursor:pointer;color:var(--fg-3);font-size:11.5px;margin-top:7px}
.steps-wrap{margin-top:12px}
.steps-wrap h4,.atts h4{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-3);margin-bottom:6px}

.steps{list-style:none;margin:0;padding:0}
.steps-root{padding-left:0}
.steps .steps{padding-left:15px;border-left:1px solid var(--soft);margin-left:3px}
.step{display:block;font-size:12px}
.step-head{display:flex;align-items:center;gap:7px;padding:2.5px 0}
.step-name{flex:1;font-family:var(--mono);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.step-failed>.step-head .step-name{color:var(--fail-d)}
.step-dur{color:var(--fg-3);font-size:10.5px;font-variant-numeric:tabular-nums;flex:none}
.atts{margin-top:12px}
.att{margin:0 0 10px}
.att img,.att video{max-width:100%;border-radius:8px;border:1px solid var(--line);display:block}
.att figcaption,.att>summary{color:var(--fg-3);font-size:11px;margin-bottom:4px;cursor:pointer}
.att pre{background:var(--soft);border-radius:7px;padding:9px;max-height:280px;overflow:auto}
.att-omitted{color:var(--fg-3);font-size:11.5px;background:var(--soft);border-radius:7px;padding:8px 10px}

@media (max-width:1100px){
  .row-hero{grid-template-columns:1fr}
  .tiles{grid-template-columns:repeat(3,1fr)}
  .detail{position:fixed;inset:0;width:100%;max-width:none;z-index:20}
}
`;

const SCRIPT = `
(function(){
  "use strict";
  var $ = function(s,r){ return (r||document).querySelector(s); };
  var $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };

  var themeBtn = $('#theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function(){
      var attr = document.documentElement.getAttribute('data-theme');
      var dark = attr === 'dark'
        || (attr === null && window.matchMedia
          && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
    });
  }

  function toggleNav(){
    document.body.classList.toggle('collapsed');
  }
  var navToggle = $('#navToggle');
  if (navToggle) { navToggle.addEventListener('click', toggleNav); }

  var items = $$('.nav-item');
  var panels = $$('[data-panel]');
  var title = $('#pageTitle');
  function showTab(id){
    items.forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-tab') === id); });
    panels.forEach(function(p){ p.hidden = p.getAttribute('data-panel') !== id; });
    var active = items.filter(function(b){ return b.getAttribute('data-tab') === id; })[0];
    if (active && title) { title.textContent = active.textContent.replace(/\\s*\\d+\\s*$/, '').trim(); }
    var scroll = $('#scroll');
    if (scroll) { scroll.scrollTop = 0; }
  }
  items.forEach(function(b){
    b.addEventListener('click', function(){ showTab(b.getAttribute('data-tab')); });
  });

  var detail = $('#detail');
  var detailTitle = $('#detailTitle');
  var current = null;
  function openDetail(index, label){
    var node = document.getElementById('dt' + index);
    if (!node) { return; }
    if (current) { current.hidden = true; }
    node.hidden = false;
    current = node;
    if (detail) { detail.hidden = false; }
    if (detailTitle) { detailTitle.textContent = label || ''; }
    var body = $('#detailBody');
    if (body) { body.scrollTop = 0; }
  }
  function closeDetail(){
    if (current) { current.hidden = true; current = null; }
    if (detail) { detail.hidden = true; }
    $$('.leaf.on').forEach(function(l){ l.classList.remove('on'); });
  }
  var closeBtn = $('#detailClose');
  if (closeBtn) { closeBtn.addEventListener('click', closeDetail); }

  document.addEventListener('click', function(ev){
    var leaf = ev.target.closest ? ev.target.closest('.leaf') : null;
    if (leaf) {
      $$('.leaf.on').forEach(function(l){ l.classList.remove('on'); });
      leaf.classList.add('on');
      var name = leaf.querySelector('.leaf-name');
      openDetail(leaf.getAttribute('data-detail'), name ? name.textContent : '');
      return;
    }
    var tile = ev.target.closest ? ev.target.closest('[data-filter]') : null;
    if (tile) {
      var want = tile.getAttribute('data-filter');
      $$('#statusSeg button').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-status') === want); });
      status = want;
      applyFilter();
      showTab('tree');
      return;
    }

    var row = ev.target.closest ? ev.target.closest('[data-goto]') : null;
    if (row) {
      var idx = row.getAttribute('data-goto');
      var target = $$('.leaf').filter(function(l){ return l.getAttribute('data-detail') === idx; })[0];

      if (target && !visibleLeaf(target)) {
        status = 'all';
        if (target.getAttribute('data-scaffolding') === '1') {
          showSetup = true;
          if (setupBtn) { setupBtn.classList.add('on'); setupBtn.setAttribute('aria-pressed', 'true'); }
        }
        if (search) { search.value = ''; term = ''; }
        $$('#statusSeg button').forEach(function(x){ x.classList.toggle('on', x.getAttribute('data-status') === 'all'); });
        applyFilter();
      }

      showTab('tree');
      if (target) {
        $$('.leaf.on').forEach(function(l){ l.classList.remove('on'); });
        target.classList.add('on');

        var parent = target.parentElement;
        while (parent) {
          if (parent.tagName === 'DETAILS') { parent.open = true; }
          parent = parent.parentElement;
        }
        target.scrollIntoView({ block: 'center' });
      }
      var nm = row.querySelector('.flat-name') || (target && target.querySelector('.leaf-name'));
      openDetail(idx, nm ? nm.textContent : '');
    }
  });

  var status = 'all';
  var term = '';

  var showSetup = false;

  function visibleLeaf(leaf){
    var st = leaf.getAttribute('data-status');
    var hay = (leaf.getAttribute('data-search') || '').toLowerCase();
    var isSetup = leaf.getAttribute('data-scaffolding') === '1';
    var setupFailed = isSetup && (st === 'failed' || st === 'broken');

    if (!showSetup && isSetup && !(status === 'failed' && setupFailed)) { return false; }
    var okStatus = status === 'all'
      || (status === 'failed' ? (st === 'failed' || st === 'broken') : st === status);
    return okStatus && (term === '' || hay.indexOf(term) !== -1);
  }

  function applyFilter(){
    var filtering = status !== 'all' || term !== '' || showSetup;
    var shown = 0;

    $$('.leaf').forEach(function(leaf){
      var ok = visibleLeaf(leaf);
      leaf.hidden = !ok;
      if (ok) { shown++; }
    });

    $$('.node').forEach(function(node){
      var leaves = $$('.leaf', node);
      var live = leaves.filter(function(l){ return !l.hidden; });

      node.hidden = leaves.length > 0 && live.length === 0;

      if (node.dataset.wasOpen === undefined) { node.dataset.wasOpen = node.open ? '1' : '0'; }
      node.open = filtering ? live.length > 0 : node.dataset.wasOpen === '1';

      var counts = { fail: 0, pass: 0, skip: 0, known: 0 };
      live.forEach(function(l){
        var st = l.getAttribute('data-status');
        if (st === 'failed' || st === 'broken') { counts.fail++; }
        else if (st === 'passed') { counts.pass++; }
        else if (st === 'skipped') { counts.skip++; }
        else if (st === 'known-defect') { counts.known++; }
      });
      $$('[data-pill]', node).forEach(function(pill){
        if (pill.closest('.node') !== node) { return; }
        var n = counts[pill.getAttribute('data-pill')];
        pill.textContent = String(n);
        pill.hidden = n === 0;
      });
    });

    $$('.flat-row[data-goto]').forEach(function(row){
      var name = row.querySelector('.flat-name');
      var text = (name ? name.textContent : '').toLowerCase();
      row.hidden = term !== '' && text.indexOf(term) === -1;
    });

    var empty = $('#treeEmpty');
    if (empty) {
      empty.hidden = shown > 0;
      if (shown === 0) {
        empty.textContent = term !== ''
          ? 'No test matches "' + term + '"' + (status === 'all' ? '' : ' with status ' + status) + '.'
          : 'No test has status ' + status + '.';
      }
    }

    if (current) {
      var owner = $$('.leaf').filter(function(l){ return l.getAttribute('data-detail') === current.id.slice(2); })[0];
      if (owner && owner.hidden) { closeDetail(); }
    }
  }

  $$('#statusSeg button').forEach(function(b){
    b.addEventListener('click', function(){
      $$('#statusSeg button').forEach(function(x){ x.classList.remove('on'); });
      b.classList.add('on');
      status = b.getAttribute('data-status');
      applyFilter();
      showTab('tree');
    });
  });

  var setupBtn = $('#setupToggle');
  if (setupBtn) {
    setupBtn.addEventListener('click', function(){
      showSetup = !showSetup;
      setupBtn.classList.toggle('on', showSetup);
      setupBtn.setAttribute('aria-pressed', showSetup ? 'true' : 'false');
      applyFilter();
      showTab('tree');
    });
  }

  var search = $('#search');
  function clearSearch(){
    if (!search || search.value === '') { return false; }
    search.value = '';
    term = '';
    applyFilter();
    return true;
  }
  if (search) {
    search.addEventListener('input', function(){
      term = search.value.trim().toLowerCase();
      applyFilter();
      if (term !== '') { showTab('tree'); }
    });
  }

  applyFilter();

  document.addEventListener('keydown', function(ev){
    var mod = ev.metaKey || ev.ctrlKey;
    if (mod && (ev.key === 'b' || ev.key === 'B')) { ev.preventDefault(); toggleNav(); return; }
    if (mod && (ev.key === 'k' || ev.key === 'K')) {
      ev.preventDefault();
      if (search) { search.focus(); search.select(); }
      return;
    }
    if (ev.key === 'Escape') {
      if (clearSearch()) { return; }
      closeDetail(); return;
    }

    if (document.activeElement && document.activeElement.tagName === 'INPUT') { return; }
    var n = parseInt(ev.key, 10);
    if (!isNaN(n) && n >= 1 && n <= items.length) { showTab(items[n - 1].getAttribute('data-tab')); }
  });
})();
`;

const ICONS: Record<string, string> = {
  dashboard: '<rect x="2" y="2" width="5.5" height="5.5" rx="1"/><rect x="10.5" y="2" width="5.5" height="5.5" rx="1"/><rect x="2" y="10.5" width="5.5" height="5.5" rx="1"/><rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1"/>',
  failures: '<path d="M9 2.4 16.2 15H1.8L9 2.4Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 7v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="12.6" r=".9"/>',
  tree: '<path d="M2.5 4h4M2.5 9h4M2.5 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8.5 4h7M8.5 9h7M8.5 14h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>',
  metrics: '<rect x="2" y="9" width="3.4" height="7" rx="1"/><rect x="7.3" y="5" width="3.4" height="11" rx="1"/><rect x="12.6" y="2" width="3.4" height="14" rx="1"/>',
  environment: '<circle cx="9" cy="9" r="6.6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M9 5.6v.1M9 8.2v4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
};

function icon(id: string): string {
  return `<svg class="nav-ico" viewBox="0 0 18 18" width="16" height="16" aria-hidden="true" fill="currentColor">${ICONS[id] ?? ICONS.dashboard}</svg>`;
}

export function renderHtml(model: OneshotModel): string {
  const s = model.summary;
  const slices: Slice[] = [
    { status: 'passed', count: s.passed },
    { status: 'failed', count: s.failed },
    { status: 'broken', count: s.broken },
    { status: 'known-defect', count: s.knownDefects },
    { status: 'skipped', count: s.skipped },
    { status: 'unknown', count: s.unknown },
  ];

  const real = model.tests.filter(t => !t.scaffolding);

  const failures = model.tests.filter(t => t.status === 'failed' || t.status === 'broken');
  const testFailures = failures.filter(t => !t.scaffolding);
  const setupFailures = failures.filter(t => t.scaffolding);
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

  const brokeCount = setupFailures.length === 0
    ? plural(testFailures.length, 'failing test', 'failing tests')
    : `${plural(testFailures.length, 'failing test', 'failing tests')} and ${plural(setupFailures.length, 'failed setup step', 'failed setup steps')}`;

  const detailIndex = new Map<string, number>();
  model.tests.forEach((t, i) => detailIndex.set(t.uuid, i));
  const details = model.tests.map((t, i) => renderDetail(t, i)).join('');

  const tree = buildTree(model.tests, detailIndex);

  const kinds = { assertion: 0, environment: 0, other: 0 };
  for (const t of failures) { kinds[classify(t.message)]++; }

  const skipped = real.filter(t => t.status === 'skipped');
  const skipOrder: SkipKind[] = ['precondition', 'blocked', 'outdated', 'other', 'unexplained'];
  const skipBuckets = skipOrder
    .map(kind => ({ kind, tests: skipped.filter(t => classifySkip(t.message) === kind) }))
    .filter(b => b.tests.length > 0);

  const skipReasons = [...skipped
    .reduce((map, t) => {
      const key = t.message.trim();
      const entry = map.get(key) ?? { message: key, kind: classifySkip(t.message), tests: [] as OneshotTest[] };
      entry.tests.push(t);
      map.set(key, entry);
      return map;
    }, new Map<string, { message: string, kind: SkipKind, tests: OneshotTest[] }>())
    .values()]
    .sort((a, b) => b.tests.length - a.tests.length || a.message.localeCompare(b.message));
  const unexplained = skipped.filter(t => classifySkip(t.message) === 'unexplained').length;

  const knownTests = real
    .filter(t => t.status === 'known-defect')
    .sort((a, b) => (a.defect?.ticket ?? '').localeCompare(b.defect?.ticket ?? '') || a.name.localeCompare(b.name));
  const unexpectedPassTests = real.filter(t => t.defect?.outcome === 'unexpected-pass');
  const defectRow = (t: OneshotTest): string => `<li class="flat-row" data-goto="${detailIndex.get(t.uuid) ?? 0}">
      <span class="dot dot-${t.status}"></span>
      <span class="chip chip-warn">${t.defect?.ticket ? esc(t.defect.ticket) : 'no defect key recorded'}</span>
      <span class="flat-name">${esc(t.name)}</span>
      ${t.atcIds.map(id => `<span class="chip chip-atc">${esc(id)}</span>`).join('')}
      <span class="flat-dur">${humanMs(t.duration)}</span></li>`;
  const defectCard = knownTests.length === 0 && unexpectedPassTests.length === 0
    ? ''
    : `<section class="card"><div class="card-h">Known defects
        <span class="count count-warn">${plural(knownTests.length, 'expected failure', 'expected failures')}</span>
        ${unexpectedPassTests.length > 0 ? `<span class="count count-warn">${plural(unexpectedPassTests.length, 'unexpected pass', 'unexpected passes')}</span>` : ''}</div>
        <div class="card-b">
          ${unexpectedPassTests.length > 0
            ? `<div class="defectnote"><div class="failure-h">Action needed: unexpected pass</div>
                <p>These are declared <code>test.fail</code> and passed, so CI is red for them. If the defect is fixed, remove the <code>test.fail</code> or <code>knownDefect()</code> marker, then close the ticket.</p>
                <ul class="flat">${unexpectedPassTests.map(defectRow).join('')}</ul></div>`
            : ''}
          ${knownTests.length > 0
            ? `<p class="note" style="margin-top:0">Failed as expected, so a defect is still open. Allure files these as passed; here they are counted apart from real passes and from new failures. Open a row for the failure it observed.</p>
              <ul class="flat">${knownTests.map(defectRow).join('')}</ul>`
            : ''}
        </div></section>`;

  const slowest = [...real]
    .filter(t => t.status !== 'skipped')
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8);

  const TABS: { id: string, label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'failures', label: 'Failures' },
    { id: 'tree', label: 'Test tree' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'environment', label: 'Environment' },
  ];

  const setupBanner = s.scaffoldingFailed === 0
    ? ''
    : `<section class="card card-alarm">
        <div class="card-b">
          <strong>${s.scaffoldingFailed} setup or teardown ${s.scaffoldingFailed === 1 ? 'step' : 'steps'} failed.</strong>
          ${s.total === 0
            ? 'Not one real test ran — every entry in these results is setup or teardown. There is nothing below to read as a result; the run did not happen.'
            : `The counts below cover the ${s.total} real ${s.total === 1 ? 'test' : 'tests'} only, so treat them as a floor rather than a verdict — tests that never got to run cannot fail, and a suite whose setup died did not pass.`}
          Open <em>Failures</em> for the setup error itself.
        </div>
      </section>`;

  const dashboard = `
  ${setupBanner}
  <div class="row row-hero">
    <section class="card card-donut">
      <div class="card-h">Current status</div>
      <div class="card-b center">${donut(slices, s.total, s.scaffoldingFailed)}</div>
    </section>
    <div class="hero-right">
      <div class="tiles">
        <button class="tile tile-go" data-filter="all"><div class="tile-n">${s.total}</div><div class="tile-l">Tests</div></button>
        <button class="tile tile-go" data-filter="passed"><div class="tile-n n-pass">${s.passed}</div><div class="tile-l">Passed</div></button>
        <button class="tile tile-go" data-filter="known-defect"><div class="tile-n n-known">${s.knownDefects}</div><div class="tile-l">Known defects</div></button>
        <button class="tile tile-go" data-filter="failed"><div class="tile-n n-fail">${s.failed + s.broken}</div><div class="tile-l">Failed${s.scaffoldingFailed > 0 ? ` <span class="n-fail">+${s.scaffoldingFailed} setup</span>` : ''}${s.unexpectedPasses > 0 ? ` <span class="n-known">${s.unexpectedPasses} unexpected pass</span>` : ''}</div></button>
        <button class="tile tile-go" data-filter="skipped"><div class="tile-n n-skip">${s.skipped}</div><div class="tile-l">Skipped</div></button>
        <div class="tile"><div class="tile-n">${humanMs(s.wallMs)}</div><div class="tile-l">Elapsed</div></div>
        <div class="tile"><div class="tile-n">${humanMs(s.cpuMs)}</div><div class="tile-l">Test time</div></div>
      </div>
      ${model.signatures.length > 0
        ? `<section class="card">
            <div class="card-h">What actually broke <span class="count">${model.signatures.length}</span>
              <span class="muted">${brokeCount}, ${plural(model.signatures.length, 'distinct problem', 'distinct problems')}</span></div>
            <div class="card-b">${bars([
              { label: 'Product assertions', value: kinds.assertion, tone: 'fail' },
              { label: 'Environment / timeouts', value: kinds.environment, tone: 'warn' },
              ...(kinds.other > 0 ? [{ label: 'Unclassified', value: kinds.other, tone: 'skip' }] : []),
            ])}
            <p class="note">An assertion failing means the product returned the wrong answer. A timeout usually means the environment did not answer at all. They need different people.</p></div>
          </section>`
        : `<section class="card card-clean"><div class="card-b">${
          unexpectedPassTests.length > 0
            ? `<strong>No assertion failed.</strong> ${plural(unexpectedPassTests.length, 'test declared', 'tests declared')} <code>test.fail</code> passed instead, which fails the run. See Known defects.`
            : s.knownDefects > 0
              ? `<strong>No unexpected failures.</strong> ${plural(s.knownDefects, 'known defect', 'known defects')} failed as declared; every other executed test passed.`
              : '<strong>No failures.</strong> Every executed test passed.'
        }</div></section>`}
    </div>
  </div>

  ${defectCard}

  ${skipped.length > 0
    ? `<section class="card"><div class="card-h">Why ${skipped.length} ${skipped.length === 1 ? 'test was' : 'tests were'} skipped
        ${unexplained > 0 ? `<span class="count count-warn">${unexplained} unexplained</span>` : '<span class="count">all accounted for</span>'}</div>
        <div class="card-b">
          ${bars(skipBuckets.map(b => ({ label: SKIP_LABEL[b.kind], value: b.tests.length, tone: b.kind === 'unexplained' ? 'fail' : 'skip' })))}
          <p class="note"><strong>${skipReasons.length} distinct ${skipReasons.length === 1 ? 'reason' : 'reasons'}</strong> behind ${skipped.length} skips — one blocked fixture takes several tests with it.</p>
          ${(() => {
            const render = (r: typeof skipReasons[number]): string => `<li class="reason" data-goto="${detailIndex.get(r.tests[0].uuid) ?? 0}">
              <span class="kind kind-skip">${esc(SKIP_LABEL[r.kind])}</span>
              ${r.tests.length > 1 ? `<span class="reason-x">${r.tests.length}&times;</span>` : ''}
              <span class="reason-text">${esc(r.message === '' ? 'No reason was given when this test was skipped.' : r.message)}</span>
            </li>`;
            const head = skipReasons.slice(0, 5);
            const tail = skipReasons.slice(5);
            return `<ul class="reasons">${head.map(render).join('')}</ul>
              ${tail.length > 0 ? `<details class="more"><summary>${tail.length} more ${tail.length === 1 ? 'reason' : 'reasons'}</summary><ul class="reasons">${tail.map(render).join('')}</ul></details>` : ''}`;
          })()}
          <p class="note">Reasons come from <code>test.skip(condition, reason)</code> as the Allure results carry them.</p>
        </div></section>`
    : ''}

  ${trend(model)}

  ${timeline(model)}`;

  const failuresTab = failures.length === 0
    ? `<section class="card card-clean"><div class="card-b"><strong>Nothing failed.</strong> ${s.skipped} ${s.skipped === 1 ? 'test was' : 'tests were'} skipped${s.knownDefects > 0 ? `, and ${plural(s.knownDefects, 'known defect', 'known defects')} failed as declared (below)` : ''}.</div></section>`
    : `<section class="card">
        <div class="card-h">Distinct failures <span class="count">${model.signatures.length}</span></div>
        <div class="card-b"><p class="note">Grouped by the shape of the error, not by the test that hit it. ${brokeCount}, ${plural(model.signatures.length, 'actual problem', 'actual problems')}.</p>
        <ol class="sigs">${model.signatures.map((sig, i) => {
          const kind = classify(sig.sample);
          return `<li class="sig">
            <div class="sig-head">
              <span class="sig-rank">${i + 1}</span>
              <span class="sig-count">${sig.testNames.length}&times;</span>
              <span class="kind kind-${kind}">${kind === 'environment' ? 'environment' : kind === 'assertion' ? 'product' : 'unclassified'}</span>
              <code class="sig-text">${esc(sig.signature)}</code>
            </div>
            <details class="sig-body">
              <summary>${sig.testNames.length} affected ${sig.testNames.length === 1 ? 'test' : 'tests'}${sig.atcIds.length > 0 ? ` &middot; ${sig.atcIds.map(apart).join(', ')}` : ''}</summary>
              <ul class="sig-tests">${sig.testNames.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
              <pre class="sig-sample">${esc(sig.sample === '' ? NO_ERROR : sig.sample)}</pre>
            </details>
          </li>`;
        }).join('')}</ol></div></section>
      <section class="card"><div class="card-h">What failed <span class="count">${failures.length}</span>
          ${setupFailures.length > 0 ? `<span class="muted">${brokeCount}</span>` : ''}</div>
        <div class="card-b"><ul class="flat">${failures.map(t => `<li class="flat-row" data-goto="${detailIndex.get(t.uuid) ?? 0}">
          <span class="dot dot-${t.status}"></span>
          <span class="flat-name">${esc(t.name)}</span>
          ${t.scaffolding ? '<span class="chip chip-warn">setup</span>' : ''}
          ${t.defect?.outcome === 'unexpected-pass' ? '<span class="chip chip-warn">unexpected pass</span>' : ''}
          ${t.atcIds.map(id => `<span class="chip chip-atc">${esc(id)}</span>`).join('')}
          <span class="flat-dur">${humanMs(t.duration)}</span></li>`).join('')}</ul></div></section>`;

  const metrics = `
  <section class="card"><div class="card-h">Cost of feedback</div>
    <div class="card-b">
      <div class="tiles tiles-3">
        <div class="tile"><div class="tile-n">${humanMs(s.wallMs)}</div><div class="tile-l">Wall clock</div></div>
        <div class="tile"><div class="tile-n">${humanMs(s.cpuMs)}</div><div class="tile-l">Machine time</div></div>
        <div class="tile"><div class="tile-n">${s.wallMs > 0 ? (s.cpuMs / s.wallMs).toFixed(1) : '0'}&times;</div><div class="tile-l">Machine per wall second</div></div>
      </div>
      ${s.wallMs > 0 && s.cpuMs < s.wallMs
        ? '<p class="note"><strong>Below 1&times; means the machines were idle for part of the run.</strong> Tests ran one after another, or a job sat waiting.</p>'
        : ''}
      ${bars(slowest.map(t => ({ label: t.name, value: Math.round(t.duration / 1000), sub: 's', tone: t.status === 'passed' ? 'pass' : t.status === 'known-defect' ? 'warn' : 'fail' })))}
      <p class="note">The slowest tests set how long anyone waits to learn the build is broken.</p>
    </div></section>`;

  const environment = `
  <section class="card"><div class="card-h">Run</div><div class="card-b"><dl class="kv">
    <dt>Report</dt><dd>${esc(model.reportName)}</dd>
    <dt>Environment</dt><dd>${esc(model.environment || 'not stated')}</dd>
    <dt>Started</dt><dd>${s.startedAt > 0 ? new Date(s.startedAt).toISOString() : 'unknown'}</dd>
    <dt>Generated</dt><dd>${new Date(model.generatedAt).toISOString()}</dd>
    <dt>Suite took</dt><dd>${humanMs(s.wallMs)} wall, ${humanMs(s.cpuMs)} machine</dd>
    ${model.projects.length > 0 ? `<dt>Projects</dt><dd class="mono">${model.projects.map(apart).join(', ')}</dd>` : ''}
    ${model.runUrl ? `<dt>CI run</dt><dd><a href="${esc(model.runUrl)}">${esc(model.runUrl)}</a></dd>` : ''}
  </dl></div></section>
  ${model.envProps.length > 0
    ? `<section class="card"><div class="card-h">Reported by the suite</div><div class="card-b"><dl class="kv">
        ${model.envProps.map(p => `<dt>${esc(p.name)}</dt><dd>${esc(p.value)}</dd>`).join('')}</dl></div></section>`
    : ''}
  <section class="card"><div class="card-h">Shortcuts</div><div class="card-b"><dl class="kv">
    <dt>⌘B / Ctrl+B</dt><dd>collapse or expand the sidebar</dd>
    <dt>⌘K / Ctrl+K</dt><dd>jump to the filter</dd>
    <dt>1 … ${TABS.length}</dt><dd>switch tab</dd>
    <dt>Esc</dt><dd>close the open test, or clear the filter</dd>
  </dl></div></section>`;

  const panels: Record<string, string> = {
    dashboard,
    failures: failuresTab + defectCard,
    tree,
    metrics,
    environment,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(model.reportName)}&#10;— Oneshot</title>
<style>${CSS}</style>
</head>
<body>
<div class="app">
  <aside class="nav" id="nav">
    <div class="nav-top">
      <button class="nav-toggle" id="navToggle" title="Collapse sidebar (⌘B)" aria-label="Collapse sidebar">
        <span class="hamburger"></span>
      </button>
      <div class="brand">
        <span class="brand-name">ONESHOT</span>
        ${model.environment ? `<span class="brand-sub">${esc(model.environment)}</span>` : ''}
      </div>
    </div>
    <nav class="nav-items">
      ${TABS.map((t, i) => `<button class="nav-item${i === 0 ? ' on' : ''}" data-tab="${t.id}" title="${esc(t.label)} (${i + 1})">
        ${icon(t.id)}<span class="nav-label">${esc(t.label)}</span>
        <span class="nav-key">${i + 1}</span></button>`).join('')}
    </nav>
    <div class="nav-foot">
      <div class="rate">
        <div class="rate-n">${(s.passRate * 100).toFixed(0)}%</div>
        <div class="tile-l">pass rate</div>
      </div>
      <div class="nav-actions">
        ${model.runUrl ? `<a class="btn" href="${esc(model.runUrl)}" title="Open the CI run">CI ↗</a>` : ''}
        <button class="btn" id="theme" title="Light / dark">◐</button>
      </div>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <h1 class="page-title" id="pageTitle">Dashboard</h1>
      <div class="filters">
        <div class="seg" id="statusSeg">
          <button class="on" data-status="all">All</button>
          <button data-status="failed">Failed</button>
          <button data-status="known-defect">Known defects</button>
          <button data-status="passed">Passed</button>
          <button data-status="skipped">Skipped</button>
        </div>
        ${s.scaffolding > 0
          ? `<button class="chiptoggle" id="setupToggle" aria-pressed="false"
              title="Playwright's setup and teardown projects. They are not counted as tests, so they are hidden until you ask.">+${s.scaffolding} setup</button>`
          : ''}
        <input class="search" id="search" type="search" placeholder="Filter tests, suites or ATC ids…  ⌘K" />
      </div>
    </header>
    <div class="scroll" id="scroll">
      ${TABS.map((t, i) => `<section class="panel" data-panel="${t.id}"${i === 0 ? '' : ' hidden'}>${panels[t.id] ?? ''}</section>`).join('')}
    </div>
  </main>

  <aside class="detail" id="detail" hidden>
    <div class="detail-head">
      <span class="detail-title" id="detailTitle"></span>
      <button class="btn" id="detailClose" title="Close (Esc)">✕</button>
    </div>
    <div class="detail-body" id="detailBody">${details}</div>
  </aside>
</div>
<script>
${SCRIPT}
</script>
</body>
</html>`;
}

function renderLinks(links: OneshotLink[]): string {
  if (links.length === 0) { return ''; }
  const items = links.map(link => (/^https?:\/\//i.test(link.url)
    ? `<li><a href="${esc(link.url)}" rel="noreferrer noopener" target="_blank">${esc(link.name)}</a></li>`
    : `<li>${apart(link.name)}: ${apart(link.url)}</li>`)).join('');
  return `<ul class="dt-links">${items}</ul>`;
}

function renderDetail(test: OneshotTest, index: number): string {
  const chips = [
    ...test.atcIds.map(id => `<span class="chip chip-atc">${esc(id)}</span>`),
    ...test.tags.map(t => `<span class="chip chip-tag">${esc(t)}</span>`),
    ...(test.project ? [`<span class="chip">${esc(test.project)}</span>`] : []),
    ...(test.attempts > 1 ? [`<span class="chip chip-warn">${test.attempts} attempts</span>`] : []),
  ].join('');

  const skipped = test.status === 'skipped' && test.message
    ? `<div class="skipnote">
        <div class="failure-h">Skipped <span class="kind kind-skip">${esc(SKIP_LABEL[classifySkip(test.message)])}</span></div>
        <p>${esc(test.message)}</p>
      </div>`
    : '';

  const defect = test.defect
    ? `<div class="defectnote">
        <div class="failure-h">${test.defect.outcome === 'expected' ? 'Known defect' : 'Unexpected pass'}${test.defect.ticket ? ` <span class="chip chip-warn">${esc(test.defect.ticket)}</span>` : ''}</div>
        <p>${test.defect.outcome === 'expected'
          ? 'Declared <code>test.fail</code>: it is expected to fail while this defect is open, and it did.'
          : 'Declared <code>test.fail</code> but it passed. If the defect is fixed, remove the <code>test.fail</code> or <code>knownDefect()</code> marker, then close the ticket.'}${test.defect.ticket === '' ? ' The results record no defect key for this test.' : ''}</p>
      </div>`
    : '';

  const failure = test.status !== 'skipped' && test.message
    ? `<div class="failure">
        <div class="failure-h">${test.status === 'known-defect' ? 'Expected failure' : 'Failure'} <span class="kind kind-${classify(test.message)}">${classify(test.message) === 'environment' ? 'environment' : classify(test.message) === 'assertion' ? 'product' : 'unclassified'}</span></div>
        <pre>${esc(test.message)}</pre>
        ${test.trace ? `<details><summary>Stack trace</summary><pre>${esc(test.trace)}</pre></details>` : ''}
      </div>`
    : '';

  const noError = (test.status === 'failed' || test.status === 'broken') && test.message === '' && !test.defect
    ? `<div class="failure"><div class="failure-h">${NO_ERROR}</div>
        <p>An expected failure that passed looks like this when its marker did not reach the results, for example one set by <code>knownDefect()</code> while the test ran.</p></div>`
    : '';

  return `<article class="dt" id="dt${index}" hidden>
    <div class="dt-head">
      <span class="dot dot-${test.status}"></span>
      <h3>${esc(test.name)}</h3>
    </div>
    <div class="dt-meta"><code>${esc(test.fullName)}</code><span class="dt-dur">${humanMs(test.duration)}</span></div>
    <div class="chips-row">${chips}${parameterChips(test.parameters)}</div>
    ${test.description ? `<p class="dt-desc">${esc(test.description)}</p>` : ''}
    ${renderLinks(test.links)}
    ${skipped}
    ${defect}
    ${failure}
    ${noError}
    ${test.steps.length > 0 ? `<div class="steps-wrap"><h4>Steps</h4>${renderSteps(test.steps)}</div>` : ''}
    ${renderAttachments(test)}
  </article>`;
}

function buildTree(tests: OneshotTest[], detailIndex: Map<string, number>): string {
  const pills = (list: OneshotTest[]): string => {
    const f = list.filter(t => t.status === 'failed' || t.status === 'broken').length;
    const p = list.filter(t => t.status === 'passed').length;
    const k = list.filter(t => t.status === 'skipped').length;
    const d = list.filter(t => t.status === 'known-defect').length;
    return `<span class="pill pill-fail" data-pill="fail"${f === 0 ? ' hidden' : ''}>${f}</span>`
      + `<span class="pill pill-known" data-pill="known"${d === 0 ? ' hidden' : ''}>${d}</span>`
      + `<span class="pill pill-pass" data-pill="pass"${p === 0 ? ' hidden' : ''}>${p}</span>`
      + `<span class="pill pill-skip" data-pill="skip"${k === 0 ? ' hidden' : ''}>${k}</span>`;
  };
  const broken = (list: OneshotTest[]): boolean =>
    list.some(t => t.status === 'failed' || t.status === 'broken');

  const level1 = new Map<string, Map<string, Map<string, OneshotTest[]>>>();
  for (const t of tests) {
    const a = t.parentSuite || t.project || '(no project)';
    const b = t.suite || '(no file)';
    const c = t.subSuite || '(no group)';
    if (!level1.has(a)) { level1.set(a, new Map()); }
    const files = level1.get(a) as Map<string, Map<string, OneshotTest[]>>;
    if (!files.has(b)) { files.set(b, new Map()); }
    const tickets = files.get(b) as Map<string, OneshotTest[]>;
    if (!tickets.has(c)) { tickets.set(c, []); }
    (tickets.get(c) as OneshotTest[]).push(t);
  }

  const flat = (files: Map<string, Map<string, OneshotTest[]>>): OneshotTest[] =>
    [...files.values()].flatMap(t => [...t.values()].flat());

  let out = '';
  for (const [project, files] of level1) {
    const all = flat(files);
    out += `<details class="node n1"${broken(all) ? ' open' : ''}>
      <summary><span class="chev"></span><span class="n-name">${esc(project)}</span>${pills(all)}</summary>`;
    for (const [file, tickets] of files) {
      const fileTests = [...tickets.values()].flat();
      out += `<details class="node n2"${broken(fileTests) ? ' open' : ''}>
        <summary><span class="chev"></span><span class="n-name mono">${esc(file)}</span>${pills(fileTests)}</summary>`;
      for (const [ticket, list] of tickets) {
        out += `<details class="node n3"${broken(list) ? ' open' : ''}>
          <summary><span class="chev"></span><span class="n-name">${esc(ticket)}</span>${pills(list)}</summary>
          <ul class="leaves">${list.map((t, i) => `<li class="leaf" data-detail="${detailIndex.get(t.uuid) ?? 0}"
              data-status="${t.status}" data-scaffolding="${t.scaffolding ? '1' : '0'}"
              data-search="${esc([t.name, t.suite, t.subSuite, ...t.atcIds, ''].join('\n|\n'))}">
            <span class="dot dot-${t.status}"></span><span class="leaf-n">${i + 1}</span>
            <span class="leaf-name">${esc(t.name)}</span>
            ${t.atcIds.map(id => `<span class="chip chip-atc">${esc(id)}</span>`).join('')}
            <span class="leaf-dur">${humanMs(t.duration)}</span></li>`).join('')}</ul>
        </details>`;
      }
      out += '</details>';
    }
    out += '</details>';
  }

  return `<section class="card card-tree">
    <div class="card-b">${out}<p class="empty" id="treeEmpty" hidden></p></div>
    <p class="note tree-note">Click any test to open it on the right.</p></section>`;
}
