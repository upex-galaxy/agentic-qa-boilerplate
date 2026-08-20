#!/usr/bin/env bun

/**
 * ============================================================================
 * TESTS MAP - Visualize the synced test corpus as a single HTML page
 * ============================================================================
 *
 * Reads the `.context/PBI/` tree that `scripts/sync-jira-issues.ts` produces
 * (Jira stays the source of truth; the tree is a read-only cache) and writes
 * one self-contained HTML file so a QA lead can see coverage AND gaps at a
 * glance: Epic -> Story -> Test, plus the orphan pile and a component rollup.
 *
 * Disk-only by design: no Jira calls, runnable offline, instant. Re-run
 * `bun run context:hydrate` first if the cache is stale.
 *
 * USAGE:
 *   bun scripts/tests-map.ts [options]
 *
 * OPTIONS:
 *   --out <path>   Output file (default: .context/reports/test-map.html)
 *   --json         Also print the gap summary as JSON to stdout
 *   help           Show usage
 *
 * ============================================================================
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// ============================================================================
// TYPES
// ============================================================================

interface TestCaseEntry {
  key: string
  summary: string
  status: string
  components: string[]
  url: string | null
  /** Repo-relative path of the synced `.md`, so the HTML can point back at the cache. */
  relPath: string
}

interface StoryEntry {
  key: string
  title: string
  status: string
  url: string | null
  tests: TestCaseEntry[]
}

interface EpicEntry {
  key: string
  title: string
  status: string
  url: string | null
  stories: StoryEntry[]
}

/** Tests hanging off non-Story coverables (bugs/, improvements/, tech-stories/, tech-debts/). */
interface CoverableEntry {
  kind: string
  key: string
  title: string
  url: string | null
  tests: TestCaseEntry[]
}

interface PbiModel {
  epics: EpicEntry[]
  orphanTests: TestCaseEntry[]
  otherCoverables: CoverableEntry[]
}

interface GapReport {
  /** Epics that have stories, none of which has a single test. */
  epicsWithoutTests: EpicEntry[]
  /** Epics with no stories at all (empty shells in the backlog). */
  epicsWithoutStories: EpicEntry[]
  storiesWithoutTests: { epic: EpicEntry, story: StoryEntry }[]
  orphanTests: TestCaseEntry[]
  testsWithoutComponent: TestCaseEntry[]
}

// ============================================================================
// LOGGING (same pattern as sync-jira-issues.ts, trimmed to what this needs)
// ============================================================================

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  cyan: '\x1B[36m',
  red: '\x1B[31m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✔${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.error(`${colors.red}✖${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
};

// ============================================================================
// PURE PARSERS
// ============================================================================

/**
 * Extracts a `**Label:** value` header field from a synced markdown body.
 * The sync writes these as plain bold-label lines, one per line.
 */
function parseHeaderField(content: string, label: string): string | null {
  const match = content.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

/**
 * The Jira Key header is a markdown link — `**Jira Key:** [KEY](url)` — so it
 * carries both the key and the browse URL. Returns whichever parts exist.
 */
function parseJiraKeyField(content: string): { key: string | null, url: string | null } {
  const raw = parseHeaderField(content, 'Jira Key');
  if (!raw) { return { key: null, url: null }; }
  const link = raw.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (link) { return { key: link[1], url: link[2] }; }
  return { key: raw, url: null };
}

/**
 * Splits a synced folder/file name like `EPIC-BK-1-tenancy-identity` or
 * `TEST-BK-250-some-slug` into its prefix + Jira key. Returns null for names
 * that do not follow the convention (`_orphans`, `templates`, loose files).
 * The Jira key itself contains a dash, which is why the regex anchors on
 * `<PROJECT>-<number>` rather than splitting on the first dash.
 */
function parseSyncedName(name: string): { prefix: string, key: string, slug: string } | null {
  const match = name.match(/^([A-Z]+)-([A-Z][A-Z0-9]*-\d+)(?:-(.*))?$/);
  if (!match) { return null; }
  return { prefix: match[1], key: match[2], slug: match[3] ?? '' };
}

/** First `# ` heading with the generator's `EPIC: ` / `TEST: ` style prefix stripped. */
function parseIssueTitle(content: string): string | null {
  // `\S` anchor keeps `\s+` and the capture from overlapping (linear regex).
  const match = content.match(/^#\s+(\S.*)$/m);
  if (!match) { return null; }
  return match[1].replace(/^[A-Z][A-Z /-]*:\s+/, '').trim();
}

/**
 * Parses one Test `.md` as written by `generateTestMarkdown` in
 * sync-jira-issues.ts. Tolerant of missing fields: hand-synced or older files
 * fall back to the filename for the key and `Unknown` for the status, so one
 * malformed file never sinks the whole map.
 */
function parseTestMarkdown(content: string, filename: string): Omit<TestCaseEntry, 'relPath'> {
  const { key, url } = parseJiraKeyField(content);
  const fromName = parseSyncedName(filename.replace(/\.md$/, ''));
  const componentsRaw = parseHeaderField(content, 'Components');
  const components = componentsRaw && componentsRaw !== 'None'
    ? componentsRaw.split(',').map(c => c.trim()).filter(Boolean)
    : [];
  return {
    key: key ?? fromName?.key ?? filename.replace(/\.md$/, ''),
    summary: parseIssueTitle(content) ?? filename.replace(/\.md$/, ''),
    status: parseHeaderField(content, 'Status') ?? 'Unknown',
    components,
    url,
  };
}

// ============================================================================
// TREE LOADING
// ============================================================================

function listDirs(path: string): string[] {
  if (!existsSync(path)) { return []; }
  return readdirSync(path, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort();
}

function listTestFiles(path: string): string[] {
  if (!existsSync(path)) { return []; }
  return readdirSync(path)
    .filter(f => f.startsWith('TEST-') && f.endsWith('.md'))
    .sort();
}

function readTestFolder(dir: string, root: string): TestCaseEntry[] {
  return listTestFiles(dir).map((file) => {
    const full = join(dir, file);
    return {
      ...parseTestMarkdown(readFileSync(full, 'utf-8'), file),
      relPath: relative(root, full),
    };
  });
}

/**
 * Loads the whole PBI cache into memory. Returns null when the tree is absent
 * or has never been hydrated — the caller decides how loudly to say so.
 */
function loadPbiTree(pbiRoot: string): PbiModel | null {
  const epicsDir = join(pbiRoot, 'epics');
  const epicFolders = listDirs(epicsDir).filter(name => parseSyncedName(name)?.prefix === 'EPIC');

  const epics: EpicEntry[] = epicFolders.map((folder) => {
    const epicDir = join(epicsDir, folder);
    const parsed = parseSyncedName(folder);
    const epicMd = join(epicDir, 'epic.md');
    const content = existsSync(epicMd) ? readFileSync(epicMd, 'utf-8') : '';
    const { key, url } = parseJiraKeyField(content);

    const stories: StoryEntry[] = listDirs(join(epicDir, 'stories'))
      .filter(name => parseSyncedName(name)?.prefix === 'STORY')
      .map((storyFolder) => {
        const storyDir = join(epicDir, 'stories', storyFolder);
        const storyMd = join(storyDir, 'story.md');
        const storyContent = existsSync(storyMd) ? readFileSync(storyMd, 'utf-8') : '';
        const storyKey = parseJiraKeyField(storyContent);
        return {
          key: storyKey.key ?? parseSyncedName(storyFolder)?.key ?? storyFolder,
          title: parseIssueTitle(storyContent) ?? storyFolder,
          status: parseHeaderField(storyContent, 'Status') ?? 'Unknown',
          url: storyKey.url,
          tests: readTestFolder(join(storyDir, 'test-cases'), pbiRoot),
        };
      });

    return {
      key: key ?? parsed?.key ?? folder,
      title: parseIssueTitle(content) ?? folder,
      status: parseHeaderField(content, 'Status') ?? 'Unknown',
      url,
      stories,
    };
  });

  // Orphans: Tests no coverable issue covers — a coverage smell surfaced by the
  // sync itself (they land under epics/_orphans/tests/ instead of a parent).
  const orphanTests = readTestFolder(join(epicsDir, '_orphans', 'tests'), pbiRoot);

  // Non-Story coverables can also own test-cases/ per the canonical tree.
  // Scanned generically so projects that link Tests to Bugs still map fully.
  const coverableKinds: Record<string, string> = {
    'bugs': 'bug.md',
    'improvements': 'improvement.md',
    'tech-stories': 'tech-story.md',
    'tech-debts': 'tech-debt.md',
  };
  const otherCoverables: CoverableEntry[] = [];
  for (const [kind, bodyName] of Object.entries(coverableKinds)) {
    for (const folder of listDirs(join(pbiRoot, kind))) {
      const parsed = parseSyncedName(folder);
      if (!parsed) { continue; }
      const tests = readTestFolder(join(pbiRoot, kind, folder, 'test-cases'), pbiRoot);
      if (tests.length === 0) { continue; } // only coverables that actually own tests
      const bodyFile = join(pbiRoot, kind, folder, bodyName);
      const content = existsSync(bodyFile) ? readFileSync(bodyFile, 'utf-8') : '';
      otherCoverables.push({
        kind,
        key: parsed.key,
        title: parseIssueTitle(content) ?? folder,
        url: parseJiraKeyField(content).url,
        tests,
      });
    }
  }

  if (epics.length === 0 && orphanTests.length === 0 && otherCoverables.length === 0) { return null; }
  return { epics, orphanTests, otherCoverables };
}

// ============================================================================
// GAP COMPUTATION
// ============================================================================

function computeGaps(model: PbiModel): GapReport {
  const epicsWithoutStories = model.epics.filter(e => e.stories.length === 0);
  const epicsWithoutTests = model.epics.filter(
    e => e.stories.length > 0 && e.stories.every(s => s.tests.length === 0),
  );
  const storiesWithoutTests = model.epics.flatMap(epic =>
    epic.stories.filter(s => s.tests.length === 0).map(story => ({ epic, story })),
  );
  const testsWithoutComponent = collectAllTests(model).filter(t => t.components.length === 0);
  return {
    epicsWithoutTests,
    epicsWithoutStories,
    storiesWithoutTests,
    orphanTests: model.orphanTests,
    testsWithoutComponent,
  };
}

function collectAllTests(model: PbiModel): TestCaseEntry[] {
  return [
    ...model.epics.flatMap(e => e.stories.flatMap(s => s.tests)),
    ...model.otherCoverables.flatMap(c => c.tests),
    ...model.orphanTests,
  ];
}

/** Component rollup derived from the SAME parsed tests — no second source of truth. */
function groupByComponent(tests: TestCaseEntry[]): Map<string, TestCaseEntry[]> {
  const groups = new Map<string, TestCaseEntry[]>();
  for (const test of tests) {
    const buckets = test.components.length > 0 ? test.components : ['(no component)'];
    for (const component of buckets) {
      const list = groups.get(component) ?? [];
      list.push(test);
      groups.set(component, list);
    }
  }
  return new Map([...groups.entries()].sort(([a], [b]) => {
    // The unassigned bucket is the gap — pin it first so it cannot hide.
    if (a === '(no component)') { return -1; }
    if (b === '(no component)') { return 1; }
    return a.localeCompare(b);
  }));
}

function statusCounts(tests: TestCaseEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of tests) { counts.set(t.status, (counts.get(t.status) ?? 0) + 1); }
  return new Map([...counts.entries()].sort(([, a], [, b]) => b - a));
}

// ============================================================================
// HTML RENDERING
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Maps free-form Jira statuses onto a small visual palette without hardcoding a workflow. */
function statusTone(status: string): 'good' | 'bad' | 'warn' | 'neutral' {
  const s = status.toUpperCase();
  if (['AUTOMATED', 'READY', 'PASSED', 'DONE'].includes(s)) { return 'good'; }
  if (['DEPRECATED', 'FAILED', 'REJECTED'].includes(s)) { return 'bad'; }
  if (['DRAFT', 'IN DESIGN', 'UNKNOWN'].includes(s)) { return 'warn'; }
  return 'neutral';
}

function keyLink(key: string, url: string | null): string {
  const safe = escapeHtml(key);
  return url ? `<a class="key" href="${escapeHtml(url)}">${safe}</a>` : `<span class="key">${safe}</span>`;
}

function statusChip(status: string): string {
  return `<span class="chip chip-${statusTone(status)}">${escapeHtml(status)}</span>`;
}

function testRows(tests: TestCaseEntry[]): string {
  return tests.map(t => `
    <tr>
      <td>${keyLink(t.key, t.url)}</td>
      <td class="summary">${escapeHtml(t.summary)}</td>
      <td>${statusChip(t.status)}</td>
      <td>${t.components.length > 0 ? escapeHtml(t.components.join(', ')) : '<span class="gap-inline">none</span>'}</td>
    </tr>`).join('');
}

function testTable(tests: TestCaseEntry[]): string {
  if (tests.length === 0) { return '<p class="empty">No tests.</p>'; }
  return `
    <div class="scroll-x">
      <table>
        <thead><tr><th>Test</th><th>Summary</th><th>Status</th><th>Components</th></tr></thead>
        <tbody>${testRows(tests)}</tbody>
      </table>
    </div>`;
}

function gapCard(count: number, label: string, tone: 'bad' | 'warn', body: string): string {
  // A zero gap renders green: "no gap here" is itself signal for a QA lead.
  const cls = count === 0 ? 'good' : tone;
  return `
    <details class="gap-card gap-${cls}" ${count > 0 ? 'open' : ''}>
      <summary><span class="gap-count">${count}</span> ${escapeHtml(label)}</summary>
      ${count > 0 ? body : '<p class="empty">Nothing here — good.</p>'}
    </details>`;
}

function renderGapSection(gaps: GapReport): string {
  const storiesList = `<ul>${gaps.storiesWithoutTests.map(({ epic, story }) =>
    `<li>${keyLink(story.key, story.url)} ${escapeHtml(story.title)} <span class="dim">(${escapeHtml(story.status)} · epic ${escapeHtml(epic.key)})</span></li>`,
  ).join('')}</ul>`;

  const epicsList = `<ul>${gaps.epicsWithoutTests.map(e =>
    `<li>${keyLink(e.key, e.url)} ${escapeHtml(e.title)} <span class="dim">(${e.stories.length} stories, 0 tests)</span></li>`,
  ).join('')}</ul>`;

  const emptyEpicsList = `<ul>${gaps.epicsWithoutStories.map(e =>
    `<li>${keyLink(e.key, e.url)} ${escapeHtml(e.title)}</li>`,
  ).join('')}</ul>`;

  return `
    <section id="gaps">
      <h2>Gaps</h2>
      <div class="gap-grid">
        ${gapCard(gaps.epicsWithoutTests.length, 'epics with stories but zero tests', 'bad', epicsList)}
        ${gapCard(gaps.storiesWithoutTests.length, 'stories with no test cases', 'bad', storiesList)}
        ${gapCard(gaps.orphanTests.length, 'orphan tests (cover nothing)', 'warn', testTable(gaps.orphanTests))}
        ${gapCard(gaps.testsWithoutComponent.length, 'tests with no component', 'warn', testTable(gaps.testsWithoutComponent))}
        ${gapCard(gaps.epicsWithoutStories.length, 'epics with no stories', 'warn', emptyEpicsList)}
      </div>
    </section>`;
}

function renderEpicTree(model: PbiModel): string {
  const epicBlocks = model.epics.map((epic) => {
    const testCount = epic.stories.reduce((n, s) => n + s.tests.length, 0);
    const gapBadge = epic.stories.length > 0 && testCount === 0
      ? '<span class="chip chip-bad">NO TESTS</span>'
      : '';
    const storyBlocks = epic.stories.map((story) => {
      const storyGap = story.tests.length === 0 ? '<span class="chip chip-bad">NO TESTS</span>' : `<span class="chip chip-neutral">${story.tests.length} tests</span>`;
      return `
        <details class="story" ${story.tests.length === 0 ? '' : 'open'}>
          <summary>${keyLink(story.key, story.url)} ${escapeHtml(story.title)} ${statusChip(story.status)} ${storyGap}</summary>
          ${testTable(story.tests)}
        </details>`;
    }).join('');
    return `
      <details class="epic" open>
        <summary>${keyLink(epic.key, epic.url)} <strong>${escapeHtml(epic.title)}</strong> ${statusChip(epic.status)}
          <span class="dim">${epic.stories.length} stories · ${testCount} tests</span> ${gapBadge}</summary>
        ${epic.stories.length > 0 ? storyBlocks : '<p class="empty">No stories synced under this epic.</p>'}
      </details>`;
  }).join('');

  const coverables = model.otherCoverables.length > 0
    ? `
      <h3>Tests covering non-Story issues</h3>
      ${model.otherCoverables.map(c => `
        <details class="story" open>
          <summary>${keyLink(c.key, c.url)} ${escapeHtml(c.title)} <span class="chip chip-neutral">${escapeHtml(c.kind)}</span></summary>
          ${testTable(c.tests)}
        </details>`).join('')}`
    : '';

  return `
    <section id="tree">
      <h2>Coverage tree — Epic → Story → Test</h2>
      ${epicBlocks}
      ${coverables}
    </section>`;
}

function renderComponentView(model: PbiModel): string {
  const groups = groupByComponent(collectAllTests(model));
  const rows = [...groups.entries()].map(([component, tests]) => {
    const automated = tests.filter(t => statusTone(t.status) === 'good').length;
    const isGap = component === '(no component)';
    return `
      <tr class="${isGap ? 'row-gap' : ''}">
        <td>${escapeHtml(component)}</td>
        <td>${tests.length}</td>
        <td>${automated}</td>
        <td class="summary">${tests.map(t => keyLink(t.key, t.url)).join(' ')}</td>
      </tr>`;
  }).join('');
  return `
    <section id="components">
      <h2>By component</h2>
      <p class="dim">Same parsed corpus, second axis — components come from each Test's own header.</p>
      <div class="scroll-x">
        <table>
          <thead><tr><th>Component</th><th>Tests</th><th>Automated / Ready</th><th>Keys</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderStatusView(model: PbiModel): string {
  const counts = statusCounts(collectAllTests(model));
  const rows = [...counts.entries()].map(([status, count]) =>
    `<tr><td>${statusChip(status)}</td><td>${count}</td></tr>`,
  ).join('');
  return `
    <section id="statuses">
      <h2>Status distribution</h2>
      <div class="scroll-x">
        <table class="narrow">
          <thead><tr><th>Status</th><th>Tests</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderHtml(model: PbiModel, gaps: GapReport): string {
  const allTests = collectAllTests(model);
  const storyCount = model.epics.reduce((n, e) => n + e.stories.length, 0);
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 16);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test Map</title>
<style>
  :root {
    --bg: #0f1217; --panel: #171c24; --panel-2: #1d242f; --border: #2a3342;
    --text: #d7dde6; --dim: #8a94a6; --accent: #5aa9e6;
    --good: #3fb96f; --warn: #e0a83e; --bad: #e05d5d;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 1.5rem; background: var(--bg); color: var(--text);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .75rem; border-bottom: 1px solid var(--border); padding-bottom: .4rem; }
  h3 { font-size: 1rem; margin: 1.5rem 0 .5rem; }
  .dim { color: var(--dim); font-weight: normal; }
  .totals { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 1rem 0; }
  .totals div { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: .6rem 1rem; }
  .totals strong { font-size: 1.3rem; display: block; }
  .gap-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .gap-card { background: var(--panel); border-radius: 8px; padding: .75rem 1rem; border-left: 4px solid var(--border); }
  .gap-card summary { cursor: pointer; font-weight: 600; }
  .gap-count { font-size: 1.5rem; margin-right: .35rem; }
  .gap-bad { border-left-color: var(--bad); } .gap-bad .gap-count { color: var(--bad); }
  .gap-warn { border-left-color: var(--warn); } .gap-warn .gap-count { color: var(--warn); }
  .gap-good { border-left-color: var(--good); } .gap-good .gap-count { color: var(--good); }
  .gap-card ul { margin: .5rem 0 0; padding-left: 1.2rem; max-height: 22rem; overflow-y: auto; }
  .gap-card .scroll-x { max-height: 24rem; overflow-y: auto; }
  .gap-inline { color: var(--bad); font-weight: 600; }
  details.epic { background: var(--panel); border: 1px solid var(--border); border-radius: 8px;
    padding: .6rem .9rem; margin: .75rem 0; }
  details.epic > summary { cursor: pointer; font-size: 1rem; }
  details.story { background: var(--panel-2); border: 1px solid var(--border); border-radius: 6px;
    padding: .4rem .7rem; margin: .5rem 0 .5rem 1rem; }
  details.story > summary { cursor: pointer; }
  .scroll-x { overflow-x: auto; margin: .5rem 0; }
  table { border-collapse: collapse; width: 100%; min-width: 640px; }
  table.narrow { min-width: 280px; width: auto; }
  th, td { text-align: left; padding: .35rem .6rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { color: var(--dim); font-weight: 600; white-space: nowrap; }
  td.summary { max-width: 40rem; }
  .key { font-family: ui-monospace, monospace; white-space: nowrap; }
  .chip { display: inline-block; border-radius: 10px; padding: 0 .5rem; font-size: .75rem;
    font-weight: 600; white-space: nowrap; }
  .chip-good { background: rgba(63,185,111,.15); color: var(--good); }
  .chip-bad { background: rgba(224,93,93,.15); color: var(--bad); }
  .chip-warn { background: rgba(224,168,62,.15); color: var(--warn); }
  .chip-neutral { background: rgba(90,169,230,.15); color: var(--accent); }
  .row-gap td { background: rgba(224,168,62,.08); }
  .empty { color: var(--dim); font-style: italic; margin: .4rem 0; }
</style>
</head>
<body>
<h1>Test Map</h1>
<p class="dim">Generated ${generated} from <code>.context/PBI/</code> (read-only cache of Jira — refresh with <code>bun run context:hydrate</code>).</p>
<div class="totals">
  <div><strong>${model.epics.length}</strong> epics</div>
  <div><strong>${storyCount}</strong> stories</div>
  <div><strong>${allTests.length}</strong> tests</div>
  <div><strong>${model.orphanTests.length}</strong> orphan tests</div>
</div>
${renderGapSection(gaps)}
${renderEpicTree(model)}
${renderComponentView(model)}
${renderStatusView(model)}
</body>
</html>
`;
}

// ============================================================================
// MAIN
// ============================================================================

const USAGE = `
Usage: bun scripts/tests-map.ts [options]

Reads .context/PBI/ (already synced from Jira) and writes a self-contained
HTML test map. No network calls.

Options:
  --out <path>   Output file (default: .context/reports/test-map.html)
  --json         Also print the gap summary as JSON to stdout
  help           Show this message
`;

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('help') || args.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const outFlag = args.indexOf('--out');
  const outPath = outFlag !== -1 && args[outFlag + 1]
    ? args[outFlag + 1]
    : join('.context', 'reports', 'test-map.html');
  const asJson = args.includes('--json');

  const pbiRoot = join(process.cwd(), '.context', 'PBI');
  const model = loadPbiTree(pbiRoot);
  if (!model) {
    // Cold clone or never-hydrated cache: not an error, just nothing to map.
    log.warn('.context/PBI/ is empty or absent — nothing to map.');
    log.info('Run `bun run context:hydrate` first, then re-run this command.');
    return;
  }

  const gaps = computeGaps(model);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderHtml(model, gaps));

  log.title('Test Map');
  log.success(`Wrote ${outPath}`);
  log.info(`${model.epics.length} epics · ${model.epics.reduce((n, e) => n + e.stories.length, 0)} stories · ${collectAllTests(model).length} tests`);
  const gapTotal = gaps.epicsWithoutTests.length + gaps.storiesWithoutTests.length
    + gaps.orphanTests.length + gaps.testsWithoutComponent.length + gaps.epicsWithoutStories.length;
  if (gapTotal > 0) {
    log.warn(`${gaps.storiesWithoutTests.length} stories without tests · ${gaps.epicsWithoutTests.length} epics without tests · ${gaps.orphanTests.length} orphan tests · ${gaps.testsWithoutComponent.length} tests without component`);
  }
  else {
    log.success('No coverage gaps detected.');
  }
  if (asJson) {
    console.log(JSON.stringify({
      epics: model.epics.length,
      stories: model.epics.reduce((n, e) => n + e.stories.length, 0),
      tests: collectAllTests(model).length,
      gaps: {
        epicsWithoutTests: gaps.epicsWithoutTests.map(e => e.key),
        epicsWithoutStories: gaps.epicsWithoutStories.map(e => e.key),
        storiesWithoutTests: gaps.storiesWithoutTests.map(g => g.story.key),
        orphanTests: gaps.orphanTests.map(t => t.key),
        testsWithoutComponent: gaps.testsWithoutComponent.map(t => t.key),
      },
    }, null, 2));
  }
  log.info(`Open it: open ${outPath}`);
}

export {
  collectAllTests,
  computeGaps,
  groupByComponent,
  loadPbiTree,
  parseHeaderField,
  parseIssueTitle,
  parseJiraKeyField,
  parseSyncedName,
  parseTestMarkdown,
  renderHtml,
  statusTone,
};

export type { EpicEntry, GapReport, PbiModel, StoryEntry, TestCaseEntry };

// Guarded so the pure helpers above can be imported by tests without running
// the generator. Same convention as scripts/sync-jira-issues.ts.
if (import.meta.main) {
  main();
}
