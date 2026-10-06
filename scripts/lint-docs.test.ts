import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { lintDocs, resolvePublishedLink, sitePathOf } from './lint-docs.ts';

let root: string;

function write(rel: string, content = ''): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lint-docs-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('lint-docs', () => {
  test('passes when every relative link and root path resolves', () => {
    write('docs/setup/guide.md', '# Guide');
    write('scripts/tool.ts', '');
    write('docs/README.md', '[guide](./setup/guide.md#install) and `scripts/tool.ts`');
    write('README.md', '<a href="docs/README.md">docs</a>');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('reports a dead markdown link, a dead href and a missing root path', () => {
    write('docs/README.md', 'See [gone](./methodology/gone.md).\n\n`docs/nope/file.md`');
    write('docs/index.html', '<a href="core/missing.html">x</a>');
    const findings = lintDocs(root).findings.filter(f => f.kind !== 'meta');
    expect(findings.map(f => `${f.file}:${f.line}:${f.kind}:${f.target}`)).toEqual([
      'docs/README.md:1:link:./methodology/gone.md',
      'docs/README.md:3:path:docs/nope/file.md',
      'docs/index.html:1:link:core/missing.html',
    ]);
  });

  test('ignores external URLs, anchors, mailto, placeholders and fenced code', () => {
    write('docs/README.md', [
      '[a](https://example.com) [b](#section) [c](mailto:qa@example.com) [d](./{slug}.md)',
      '`docs/<name>/SKILL.md` `docs/**/*.md`',
      '```',
      '[e](./inside-a-fence.md) `docs/inside/fence.md`',
      '```',
    ].join('\n'));
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('skips roots the checkout does not have (a consumer repo has no packages/)', () => {
    write('docs/README.md', '`packages/decks/README.md` and [deck](../packages/decks/x.html)');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('checks deck links but not illustrative inline paths inside decks', () => {
    write('packages/decks/demo/deck.html', '<code>tests/api/example.spec.ts</code> <a href="../missing.html">x</a>');
    write('tests/.keep', '');
    const findings = lintDocs(root).findings;
    expect(findings.map(f => `${f.kind}:${f.target}`)).toEqual(['link:../missing.html']);
  });

  test('does not report a documented optional file', () => {
    write('.agents/README.md', '');
    write('README.md', '`.agents/compatibility/command-aliases.project.json`');
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('requires a title and a description on shipped pages, warns on project pages', () => {
    const head = '<head><title>Setup</title><meta name="description" content="Guides." /></head>';
    write('docs/core/setup/index.html', head);
    write('docs/core/setup/bare.html', '<head><title> </title></head><p>x</p>');
    write('docs/team/notes.html', '<head><meta name="description" content="" /></head>');
    const findings = lintDocs(root).findings;
    expect(findings.map(f => `${f.severity}:${f.file}:${f.target}`)).toEqual([
      'error:docs/core/setup/bare.html:<title>',
      'error:docs/core/setup/bare.html:<meta name="description">',
      'warning:docs/team/notes.html:<title>',
      'warning:docs/team/notes.html:<meta name="description">',
    ]);
  });

  test('a path:line citation is a FILE-LINE error, not a missing path', () => {
    write('scripts/tool.ts', '');
    write('docs/README.md', 'See `scripts/tool.ts:12` for the shape.');
    const findings = lintDocs(root).findings;
    expect(findings.map(f => `${f.severity}:${f.file}:${f.line}:${f.kind}:${f.target}`)).toEqual([
      'error:docs/README.md:1:file-line:scripts/tool.ts:12',
    ]);
  });

  test('a claim about the present is a CURRENT-STATE error in markdown and HTML prose', () => {
    write('README.md', 'The store holds ten skills today.\nMeasured 2026-09-17 on a live project.');
    const head = '<head><title>Setup</title><meta name="description" content="Guides." /></head>';
    write('docs/core/setup/index.html', `${head}<p>El catálogo tiene hoy 24 entradas.</p>`);
    const findings = lintDocs(root).findings;
    expect(findings.map(f => `${f.severity}:${f.file}:${f.line}:${f.kind}:${f.target}`)).toEqual([
      'error:README.md:1:current-state:today',
      'error:README.md:2:current-state:Measured 2026-09-17',
      'error:docs/core/setup/index.html:1:current-state:hoy',
    ]);
  });

  test('scans the nested READMEs under .context/ and packages/, not the PBI cache below them', () => {
    write('.context/README.md', 'Ten skills today.');
    write('.context/reports/README.md', 'See [gone](./gone.md).');
    write('.context/PBI/epics/EPIC-1-x/README.md', 'A synced cache file, today.');
    write('packages/create-agentic-qa/README.md', '**Last Updated**: 2026-04-26');
    write('packages/decks/README.md', 'Deck index, today.');
    const findings = lintDocs(root).findings;
    expect(findings.map(f => `${f.file}:${f.line}:${f.kind}`)).toEqual([
      '.context/README.md:1:current-state',
      '.context/reports/README.md:1:link',
      'packages/create-agentic-qa/README.md:1:current-state',
      'packages/decks/README.md:1:current-state',
    ]);
  });

  test('fenced code, <pre>, <code class="block"> and a volatile-ok line are not volatile findings', () => {
    write('README.md', ['```', 'x.ts:12 today', '```', 'Teaching the word today <!-- volatile-ok: teaching example -->'].join('\n'));
    const head = '<head><title>Setup</title><meta name="description" content="Guides." /></head>';
    write('docs/core/setup/index.html', `${head}<pre>at spec.ts:12 today</pre><code class="block">hoy</code>`);
    expect(lintDocs(root).findings).toEqual([]);
  });
});

describe('lint-docs roster and scripts', () => {
  const router = (slugs: string[]): string => [
    '## 5. SKILLS',
    '',
    '### Skills (lazy-loaded by trigger phrase)',
    '',
    '| Skill | Trigger | Purpose |',
    '|---|---|---|',
    ...slugs.map(s => `| \`${s}\` | \`/${s}\` | x |`),
    '',
    '### Skill modes',
    '',
    'Mentions `ghost-flow` outside the router, which does not count.',
  ].join('\n');
  const skill = (slug: string): void => write(`.agents/skills/${slug}/SKILL.md`, `---\nname: ${slug}\n---\n`);
  const head = '<head><title>Start</title><meta name="description" content="Start." /></head>';

  test('a repo skill missing from the AGENTS.md router fails by name; a project-local context skill is exempt', () => {
    skill('alpha-flow');
    skill('ghost-flow');
    skill('acme-context');
    write('AGENTS.md', router(['alpha-flow']));
    const findings = lintDocs(root).findings.filter(f => f.kind === 'roster');
    expect(findings.map(f => `${f.file}:${f.target}`)).toEqual(['AGENTS.md:ghost-flow']);
  });

  test('once the instructions are split, the router is read from the skills section, not from AGENTS.md', () => {
    skill('alpha-flow');
    skill('ghost-flow');
    write('AGENTS.md', router(['alpha-flow', 'ghost-flow']));
    write('.agents/instructions/agent-skills-and-mcps.md', router(['alpha-flow']));
    write('.agents/instructions/30-tools.md', 'Run `bun run gone-script`.');
    write('package.json', '{"scripts":{}}');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'roster' || f.kind === 'script');
    expect(findings.map(f => `${f.file}:${f.target}`)).toEqual([
      '.agents/instructions/agent-skills-and-mcps.md:ghost-flow',
      '.agents/instructions/30-tools.md:gone-script',
    ]);
  });

  test('a skill the project added is routed from its own agent-project.md table, which bun run up never overwrites', () => {
    skill('alpha-flow');
    skill('beta-flow');
    skill('ghost-flow');
    write('.agents/instructions/agent-skills-and-mcps.md', router(['alpha-flow']));
    write('.agents/instructions/agent-project.md', [
      '# Project',
      '## Project context skills',
      '| Skill | Trigger | Purpose |',
      '|---|---|---|',
      '| `beta-flow` | "beta" | Project workflow. |',
      '## Other',
      '| `ghost-flow` | a table under another heading does not route |',
      '',
    ].join('\n'));
    const findings = lintDocs(root).findings.filter(f => f.kind === 'roster');
    expect(findings.map(f => `${f.file}:${f.target}`)).toEqual(['.agents/instructions/agent-skills-and-mcps.md:ghost-flow']);
  });

  test('the human pages are not a skill list: a README that names no skill passes (Critical Rule #17)', () => {
    write('packages/create-agentic-qa/package.json', '{}');
    skill('alpha-flow');
    write('AGENTS.md', router(['alpha-flow']));
    write('README.md', 'The catalog is the generated REGISTRY.md.');
    write('docs/core/empezar-aqui.html', `${head}<p>Catalog: REGISTRY.md</p>`);
    expect(lintDocs(root).findings.filter(f => f.kind === 'roster')).toEqual([]);
  });

  test('a quoted bun run script that package.json does not declare fails; placeholders and file runs pass', () => {
    write('package.json', JSON.stringify({ scripts: { 'test': 'x', 'docs:check': 'y' } }));
    write('README.md', [
      'Run `bun run test` and `bun run --silent docs:check`.',
      '',
      '```bash',
      'bun run nope:gone',
      '```',
      '',
      'Placeholders: `bun run <script>`, `bun run {name}`, `bun run scripts/tool.ts`.',
    ].join('\n'));
    write('docs/core/page.html', `${head}<code>bun run missing-one</code>`);
    write('AGENTS.md', 'Verify with `bun run docs:check`, never `bun run old-name`.');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'script');
    expect(findings.map(f => `${f.file}:${f.line}:${f.target}`)).toEqual([
      'AGENTS.md:1:old-name',
      'README.md:4:nope:gone',
      'docs/core/page.html:1:missing-one',
    ]);
  });

  test('a package README resolves its own scripts plus the root ones', () => {
    write('package.json', JSON.stringify({ scripts: { 'repo:check': 'x' } }));
    write('packages/cli-pkg/package.json', JSON.stringify({ scripts: { build: 'y' } }));
    write('packages/cli-pkg/README.md', '`bun run repo:check`, then `bun run build`, never `bun run gone`.');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'script');
    expect(findings.map(f => `${f.file}:${f.target}`)).toEqual(['packages/cli-pkg/README.md:gone']);
  });
});

describe('lint-docs published site (Pages portal and decks)', () => {
  test('maps a published file to its site path; markdown and unpublished files have none', () => {
    expect(sitePathOf('packages/pages-home/index.html')).toBe('index.html');
    expect(sitePathOf('packages/decks/a/how-it-works.es.html')).toBe('decks/a/how-it-works.es.html');
    expect(sitePathOf('docs/core/x.html')).toBe('docs/core/x.html');
    expect(sitePathOf('docs/README.md')).toBeNull();
    expect(sitePathOf('README.md')).toBeNull();
  });

  test('resolves a portal link the way the site serves it', () => {
    expect(resolvePublishedLink('index.html', './decks/a/x.html')).toBe('packages/decks/a/x.html');
    expect(resolvePublishedLink('index.html', './docs/')).toBe('docs');
    expect(resolvePublishedLink('index.html', './kata/')).toBe('packages/kata-academy');
    expect(resolvePublishedLink('index.html', './harnesses.es.html')).toBe('packages/pages-home/harnesses.es.html');
    expect(resolvePublishedLink('decks/a/x.html', '../../index.html')).toBe('packages/pages-home/index.html');
    expect(resolvePublishedLink('index.html', './staging/regression/')).toBe('skip');
    expect(resolvePublishedLink('docs/core/x.html', '../../../README.md')).toBe('outside');
  });

  test('a dead portal link fails; a live one, a report tree and a link back from a deck pass', () => {
    write('packages/pages-home/index.html', [
      '<a href="./decks/a/x.html">ok</a>',
      '<a href="./docs/">docs</a>',
      '<a href="./staging/regression/">report</a>',
      '<a href="./decks/">no index</a>',
      '<a href="./decks/gone/x.html">gone</a>',
    ].join('\n'));
    write('packages/decks/a/x.html', '<a href="../../index.html">hub</a> <a href="../a/x.html">self</a>');
    write('docs/index.html', '<head><title>Docs</title><meta name="description" content="d" /></head>');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'link');
    expect(findings.map(f => `${f.file}:${f.line}:${f.target}`)).toEqual([
      'packages/pages-home/index.html:5:./decks/gone/x.html',
    ]);
  });

  test('a docs page link that climbs out of the published site is dead even when the repo file exists', () => {
    write('README.md', '# Readme');
    write('docs/core/page.html', '<head><title>P</title><meta name="description" content="d" /></head><a href="../../../README.md">readme</a>');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'link');
    expect(findings.map(f => `${f.file}:${f.target}`)).toEqual(['docs/core/page.html:../../../README.md']);
  });

  test('bun run names inside decks and the portal are checked; escapes and prose about the command are not names', () => {
    write('package.json', JSON.stringify({ scripts: { 'docs': 'x', 'pw:install': 'y' } }));
    write('packages/decks/a/x.html', [
      '<code>bun run docs</code> <code>bun run gone:one</code>',
      '<script>const s = "bun run pw:install\\n\\nbun run docs\\n";</script>',
      '<p>bun install = npm install, bun run = npm run</p>',
    ].join('\n'));
    write('packages/pages-home/index.html', '<code>bun run missing-two</code>');
    const findings = lintDocs(root).findings.filter(f => f.kind === 'script');
    expect(findings.map(f => `${f.file}:${f.line}:${f.target}`)).toEqual([
      'packages/decks/a/x.html:1:gone:one',
      'packages/pages-home/index.html:1:missing-two',
    ]);
  });
});

describe('lint-docs agent markdown (links only)', () => {
  function gitAdd(): void {
    Bun.spawnSync(['git', 'init', '-q'], { cwd: root });
    Bun.spawnSync(['git', 'add', '-A'], { cwd: root });
  }

  test('reports a dead ](…) link in committed .agents, .context and .claude markdown', () => {
    write('.agents/skills/demo/references/ok.md', '# ok');
    write('.agents/skills/demo/SKILL.md', 'See [ok](references/ok.md#top) and [gone](references/gone.md).');
    write('.context/ADR/ADR-0001-x.md', 'Back to [index](../missing-index.md).');
    write('.claude/notes.md', '[x](./nowhere.md)');
    gitAdd();
    const findings = lintDocs(root).findings.filter(f => f.kind === 'link');
    expect(findings.map(f => `${f.file}:${f.line}:${f.target}`)).toEqual([
      '.agents/skills/demo/SKILL.md:1:references/gone.md',
      '.claude/notes.md:1:./nowhere.md',
      '.context/ADR/ADR-0001-x.md:1:../missing-index.md',
    ]);
  });

  test('skips URLs, anchors, placeholders, code spans, fences and every non-link check', () => {
    write('.agents/skills/demo/SKILL.md', [
      '[a](https://example.com) [b](#section) [c](<<PRIMARY_ROOT>>/x.md) [d]({{DOC_PATH}}) [e](./{slug}.md)',
      'Write `[label](./not-a-real-link.md)` in the brief. `docs/nope/file.md` and x.ts:12 today.',
      '```',
      '[f](./inside-a-fence.md)',
      '```',
    ].join('\n'));
    gitAdd();
    expect(lintDocs(root).findings).toEqual([]);
  });

  test('does not walk uncommitted markdown', () => {
    write('.context/PBI/cache.md', '[gone](./gone.md)');
    expect(lintDocs(root).findings).toEqual([]);
  });
});
