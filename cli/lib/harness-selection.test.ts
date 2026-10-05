import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  canonicalMcpHarness,
  declaredHarnesses,
  detectHarnesses,
  HARNESS_FILES,
  HARNESSES,
  harnessOfPath,
  skippedHarnessNotes,
  withHarnesses,
} from './harness-selection.ts';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

function fixture(files: readonly string[], yaml?: string, packageName = 'my-qa-project'): string {
  const root = mkdtempSync(join(tmpdir(), 'harness selection '));
  roots.push(root);
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  write('package.json', JSON.stringify({ name: packageName }));
  for (const file of files) { write(file, '{}\n'); }
  if (yaml !== undefined) { write('.agents/project.yaml', yaml); }
  return root;
}

const ALL_FILES = HARNESSES.flatMap(h => [...HARNESS_FILES[h]]);

describe('declaredHarnesses', () => {
  test('the boilerplate checks all three, whatever its yaml and its files say', () => {
    const root = fixture(HARNESS_FILES.claude, 'harnesses: [claude]\n', 'agentic-qa-boilerplate');
    expect(declaredHarnesses(root)).toMatchObject({ harnesses: ['claude', 'opencode', 'codex'], skipped: [], source: 'boilerplate' });
  });

  test('an explicit list wins over the files present, in its own order', () => {
    const root = fixture(ALL_FILES, 'harnesses: [codex, opencode]\n');
    expect(declaredHarnesses(root)).toMatchObject({ harnesses: ['codex', 'opencode'], skipped: ['claude'], source: 'declared', warnings: [] });
  });

  test('absent or null detects: a harness is in use while ANY of its files exists', () => {
    const claudeOnly = fixture([...HARNESS_FILES.claude, '.codex/hooks.json']);
    expect(declaredHarnesses(claudeOnly)).toMatchObject({ harnesses: ['claude', 'codex'], skipped: ['opencode'], source: 'detected' });
    const nullKey = fixture(HARNESS_FILES.opencode, 'project:\n  project_name: X\nharnesses: null\n');
    expect(declaredHarnesses(nullKey)).toMatchObject({ harnesses: ['opencode'], source: 'detected' });
  });

  test('nothing found checks all three', () => {
    expect(declaredHarnesses(fixture([]))).toMatchObject({ harnesses: [...HARNESSES], source: 'fallback' });
  });

  test('unknown names are ignored with a warning; a list of nothing usable detects', () => {
    const typo = fixture(ALL_FILES, 'harnesses: [claude, cursor, claude]\n');
    const selected = declaredHarnesses(typo);
    expect(selected.harnesses).toEqual(['claude']);
    expect(selected.warnings).toEqual(['harnesses: ignored "cursor" (one of claude, opencode, codex)']);

    const scalar = declaredHarnesses(fixture(HARNESS_FILES.codex, 'harnesses: codex\n'));
    expect(scalar).toMatchObject({ harnesses: ['codex'], source: 'detected' });
    expect(scalar.warnings[0]).toContain('must be a list');
  });
});

describe('helpers', () => {
  test('detection reads the versioned files only', () => {
    expect(detectHarnesses(fixture(['.opencode/plugins/personality-reinject.js']))).toEqual(['opencode']);
  });

  test('Claude stays the canonical MCP host while in use; otherwise the first declared harness', () => {
    expect(canonicalMcpHarness(['codex', 'claude'])).toBe('claude');
    expect(canonicalMcpHarness(['codex', 'opencode'])).toBe('codex');
  });

  test('every harness file maps back to its harness', () => {
    for (const harness of HARNESSES) {
      for (const file of HARNESS_FILES[harness]) { expect(harnessOfPath(file)).toBe(harness); }
    }
    expect(harnessOfPath('.opencode/commands/x.md')).toBe('opencode');
    expect(harnessOfPath('AGENTS.md')).toBeNull();
  });

  test('one note per skipped harness, worded by where the answer came from', () => {
    const declared = declaredHarnesses(fixture(ALL_FILES, 'harnesses: [claude]\n'));
    expect(skippedHarnessNotes(declared)).toEqual([
      'opencode: not declared in .agents/project.yaml harnesses, skipped',
      'codex: not declared in .agents/project.yaml harnesses, skipped',
    ]);
  });
});

describe('withHarnesses', () => {
  test('replaces the value on the key\'s own line and keeps its comment and neighbours', () => {
    const yaml = 'project:\n  project_name: X # name\n# which harnesses\nharnesses: null # e.g. [claude]\nqa:\n  formal_blocked_gate: true\n';
    expect(withHarnesses(yaml, ['claude', 'codex'])).toBe('project:\n  project_name: X # name\n# which harnesses\nharnesses: [claude, codex] # e.g. [claude]\nqa:\n  formal_blocked_gate: true\n');
  });

  test('folds a block list back onto one line', () => {
    expect(withHarnesses('harnesses:\n  - claude\nqa: 1\n', ['opencode'])).toBe('harnesses: [opencode]\nqa: 1\n');
  });

  test('appends a commented block when the key is absent', () => {
    const out = withHarnesses('project:\n  project_name: X\n', ['claude']);
    expect(out.startsWith('project:\n  project_name: X\n\n# Host harnesses')).toBe(true);
    expect(out.endsWith('harnesses: [claude]\n')).toBe(true);
  });
});
