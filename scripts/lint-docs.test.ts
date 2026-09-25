import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { lintDocs } from './lint-docs.ts';

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

  test('fenced code, <pre>, <code class="block"> and a volatile-ok line are not volatile findings', () => {
    write('README.md', ['```', 'x.ts:12 today', '```', 'Teaching the word today <!-- volatile-ok: teaching example -->'].join('\n'));
    const head = '<head><title>Setup</title><meta name="description" content="Guides." /></head>';
    write('docs/core/setup/index.html', `${head}<pre>at spec.ts:12 today</pre><code class="block">hoy</code>`);
    expect(lintDocs(root).findings).toEqual([]);
  });
});
