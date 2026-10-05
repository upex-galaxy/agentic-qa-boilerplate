/**
 * Tests for the documentation-contract gate (ADR-0016): the marker grammar,
 * the diff arithmetic, the trailer escape, and the gate end to end against a
 * real temp git repo in both a maintainer and a downstream fixture. The edit
 * hook's own copy of the parser is held to the same reading of every seeded
 * file in this repo.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { docsLines, editedPaths, filterOncePerSession, contractsEnforced as hookEnforced, parseContracts as hookParse, statePath } from '../../.agents/hooks/doc-contracts.mjs';
import { contractsEnforced, hunkTouchesRegion, markerFiles, parseAcks, parseContracts, parseHunks, parseTargets, scanContracts } from './doc-contracts.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const SCRIPT = resolve(import.meta.dir, '..', 'lint-doc-contracts.ts');
const IF = (label: string): string => `// LINT.IfChange(${label})`;
const THEN = (targets: string): string => `// LINT.ThenChange(${targets})`;

describe('parseContracts', () => {
  test('reads a region with its targets and anchors', () => {
    const text = ['const a = 1;', IF('alpha'), 'const b = 2;', THEN('README.md#setup, docs/x.html'), ''].join('\n');
    const { regions, findings } = parseContracts('src/a.ts', text);
    expect(findings).toEqual([]);
    expect(regions).toEqual([{ file: 'src/a.ts', label: 'alpha', start: 2, end: 4, targets: [{ path: 'README.md', anchor: 'setup' }, { path: 'docs/x.html', anchor: null }] }]);
  });

  test('accepts shell, HTML and JSDoc comment forms', () => {
    const text = ['# LINT.IfChange(sh-gate)', 'x', '# LINT.ThenChange(README.md)', '<!-- LINT.IfChange(page) -->', 'y', '<!-- LINT.ThenChange(//CONTEXT.md) -->', ' * LINT.IfChange(doc)', ' * z', ' * LINT.ThenChange(INSTALLER.md)'].join('\n');
    const { regions } = parseContracts('f.sh', text);
    expect(regions.map(r => [r.label, r.targets[0].path])).toEqual([['sh-gate', 'README.md'], ['page', 'CONTEXT.md'], ['doc', 'INSTALLER.md']]);
  });

  test('ignores prose, quoted strings and Markdown fences that only talk about the syntax', () => {
    const text = ['Wrap it in `LINT.IfChange(label)` and close it.', '\'// LINT.IfChange(quoted)\',', '```ts', IF('fenced'), THEN('README.md'), '```'].join('\n');
    expect(parseContracts('doc.md', text)).toEqual({ regions: [], findings: [] });
  });

  test('reports unbalanced markers and bad labels', () => {
    const text = [IF('Bad_Label'), IF('two'), 'x', THEN(''), THEN('README.md'), IF('open')].join('\n');
    const details = parseContracts('f.ts', text).findings.map(f => f.detail);
    expect(details.some(d => d.includes('kebab-case'))).toBe(true);
    expect(details.some(d => d.includes('no LINT.ThenChange before'))).toBe(true);
    expect(details.some(d => d.includes('names no target'))).toBe(true);
    expect(details.some(d => d.includes('without a LINT.IfChange'))).toBe(true);
    expect(details.some(d => d.includes('never closed'))).toBe(true);
  });

  test('parseTargets strips the root prefix and keeps the anchor', () => {
    expect(parseTargets('//a.md#x , b.html')).toEqual([{ path: 'a.md', anchor: 'x' }, { path: 'b.html', anchor: null }]);
  });
});

describe('diff arithmetic', () => {
  test('parseHunks reads the new side, deletions included', () => {
    const diff = ['diff --git a/f.ts b/f.ts', '--- a/f.ts', '+++ b/f.ts', '@@ -3 +3 @@', '-x', '+y', '@@ -10,2 +9,0 @@', '-a', '-b', '@@ -20,0 +21,3 @@'].join('\n');
    expect(parseHunks(diff).get('f.ts')).toEqual([{ start: 3, count: 1 }, { start: 9, count: 0 }, { start: 21, count: 3 }]);
  });

  test('a hunk touches only the lines strictly between the markers', () => {
    const region = { start: 10, end: 20 };
    expect(hunkTouchesRegion({ start: 10, count: 1 }, region)).toBe(false); // the IfChange line itself
    expect(hunkTouchesRegion({ start: 11, count: 1 }, region)).toBe(true);
    expect(hunkTouchesRegion({ start: 20, count: 2 }, region)).toBe(false); // the ThenChange line and below
    expect(hunkTouchesRegion({ start: 5, count: 10 }, region)).toBe(true); // straddles the opening marker
    expect(hunkTouchesRegion({ start: 15, count: 0 }, region)).toBe(true); // deletion inside
    expect(hunkTouchesRegion({ start: 20, count: 0 }, region)).toBe(false); // deletion after the closing marker
  });

  test('parseAcks needs a label AND a reason', () => {
    const { acks, unreasoned } = parseAcks('feat: x\n\nDocs-Checked: alpha refactor only, behaviour unchanged\nDocs-Checked: beta\nWorktree: w');
    expect([...acks.entries()]).toEqual([['alpha', 'refactor only, behaviour unchanged']]);
    expect(unreasoned).toEqual(['beta']);
  });
});

// ============================================================================
// END TO END — a real temp repo
// ============================================================================

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

function sh(cwd: string, ...cmd: string[]): string {
  const p = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) { throw new Error(`${cmd.join(' ')} failed:\n${p.stderr.toString()}`); }
  return p.stdout.toString();
}

function commit(cwd: string, message: string): void {
  sh(cwd, 'git', 'add', '-A');
  sh(cwd, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', message);
}

const CODE = (body: string): string => ['export const a = 1;', IF('alpha'), body, THEN('README.md, docs/page.html'), 'export const z = 9;', ''].join('\n');

/** A repo on `main` with one seeded region, then a `work` branch. */
function fixture(maintainer: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'doc-contracts-'));
  roots.push(root);
  sh(root, 'git', 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: maintainer ? 'agentic-qa-boilerplate' : 'acme-qa' }));
  sh(root, 'mkdir', '-p', '.agents', 'docs', 'src');
  writeFileSync(join(root, '.agents', 'project.yaml'), `${maintainer ? '# MAINTAINER COPY: test\n' : ''}project: {}\n`);
  writeFileSync(join(root, 'README.md'), 'readme\n');
  writeFileSync(join(root, 'docs', 'page.html'), '<p>page</p>\n');
  writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 2;'));
  commit(root, 'init');
  sh(root, 'git', 'checkout', '-q', '-b', 'work');
  return root;
}

function gate(root: string, ...args: string[]): { code: number, out: string } {
  const p = Bun.spawnSync(['bun', SCRIPT, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, DOC_CONTRACTS_BASE: 'main' } });
  return { code: p.exitCode ?? -1, out: p.stdout.toString() + p.stderr.toString() };
}

describe('the gate end to end', () => {
  test('a change inside a region without its pages blocks the push and names the trailer', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    commit(root, 'feat: change b');
    const r = gate(root, '--push');
    expect(r.code).toBe(1);
    expect(r.out).toContain('README.md');
    expect(r.out).toContain('docs/page.html');
    expect(r.out).toContain('Docs-Checked: alpha');
  });

  test('the CI range mode blocks the same change', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    commit(root, 'feat: change b');
    expect(gate(root, '--base', 'main', '--head', 'HEAD').code).toBe(1);
  });

  test('"any" is not enough: one page of two still blocks', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    writeFileSync(join(root, 'README.md'), 'readme, updated\n');
    commit(root, 'feat: change b');
    const r = gate(root, '--push');
    expect(r.code).toBe(1);
    expect(r.out).toContain('docs/page.html');
  });

  test('every page updated in a later commit of the same push passes', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    commit(root, 'feat: change b');
    writeFileSync(join(root, 'README.md'), 'readme, updated\n');
    writeFileSync(join(root, 'docs', 'page.html'), '<p>page, updated</p>\n');
    commit(root, 'docs: describe b');
    expect(gate(root, '--push').code).toBe(0);
  });

  test('a Docs-Checked trailer with a reason passes; without a reason it does not', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    commit(root, 'refactor: rename b\n\nDocs-Checked: alpha\nWorktree: w');
    expect(gate(root, '--push').code).toBe(1);
    sh(root, 'git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '--allow-empty', '-m', 'chore: ack\n\nDocs-Checked: alpha internal rename, the pages still hold');
    const r = gate(root, '--push');
    expect(r.code).toBe(0);
    expect(r.out).toContain('acknowledged');
  });

  test('a change outside every region, or a region created in the range, passes', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 2;').replace('z = 9', 'z = 10'));
    writeFileSync(join(root, 'src', 'new.ts'), [IF('beta'), 'x', THEN('README.md'), ''].join('\n'));
    commit(root, 'feat: outside');
    expect(gate(root, '--push').code).toBe(0);
  });

  test('pre-commit only warns', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    sh(root, 'git', 'add', '-A');
    const r = gate(root, '--staged');
    expect(r.code).toBe(0);
    expect(r.out).toContain('does not block here');
  });

  test('a downstream project is never blocked', () => {
    const root = fixture(false);
    writeFileSync(join(root, 'src', 'code.ts'), CODE('export const b = 3;'));
    commit(root, 'feat: change b');
    const r = gate(root, '--push');
    expect(r.code).toBe(0);
    expect(r.out).toContain('maintainer-only');
    expect(gate(root).code).toBe(0);
  });

  test('the structural lint fails a target that does not exist', () => {
    const root = fixture(true);
    writeFileSync(join(root, 'src', 'gone.ts'), [IF('gamma'), 'x', THEN('docs/missing.html'), ''].join('\n'));
    const r = gate(root);
    expect(r.code).toBe(1);
    expect(r.out).toContain('docs/missing.html');
  });
});

describe('this repo', () => {
  test('the seeded regions are well-formed', () => {
    const { regions, findings } = scanContracts(REPO_ROOT);
    expect(findings).toEqual([]);
    expect(regions.length).toBeGreaterThan(0);
  });

  test('the edit hook parses every marker file exactly as the gate does', () => {
    for (const file of markerFiles(REPO_ROOT)) {
      const text = readFileSync(join(REPO_ROOT, file), 'utf8');
      expect(hookParse(file, text)).toEqual(parseContracts(file, text).regions);
    }
  });
});

describe('the edit hook', () => {
  test('names the pages of a region an Edit lands in, and nothing for an edit outside it', () => {
    const root = fixture(true);
    const inside = docsLines(root, { file_path: join(root, 'src', 'code.ts'), old_string: 'x', new_string: 'export const b = 2;' });
    expect(inside.map(l => l.label)).toEqual(['alpha']);
    expect(inside[0].text).toContain('README.md, docs/page.html');
    expect(inside[0].text).toContain('Docs-Checked: alpha');
    expect(docsLines(root, { file_path: join(root, 'src', 'code.ts'), new_string: 'export const z = 9;' })).toEqual([]);
    expect(docsLines(root, { file_path: join(root, 'src', 'code.ts'), content: 'whole file' }).length).toBe(1);
  });

  test('reads Codex apply_patch headers', () => {
    expect(editedPaths({ command: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n*** Add File: b.md\n+x\n*** End Patch' })).toEqual(['src/a.ts', 'b.md']);
  });

  test('tells a session about a label once', () => {
    const root = fixture(true);
    const session = `test-${process.pid}-${Date.now()}`;
    const lines = [{ label: 'alpha', text: 'DOCS: a' }];
    try {
      expect(filterOncePerSession(lines, root, session)).toEqual(lines);
      expect(filterOncePerSession(lines, root, session)).toEqual([]);
    }
    finally { rmSync(statePath(root, session), { force: true }); }
  });

  test('is inert exactly where the gate is', () => {
    expect(hookEnforced(fixture(true))).toBe(true);
    expect(hookEnforced(fixture(false))).toBe(false);
    expect(hookEnforced(REPO_ROOT)).toBe(contractsEnforced(REPO_ROOT));
  });
});
