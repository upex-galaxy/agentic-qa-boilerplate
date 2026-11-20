import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { defaultChecks, matchesAny, parseChecks, readChecks, refusedSkipPaths, unmatchedGlobs } from './check-scope.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

function project(yaml: string | null): string {
  const root = mkdtempSync(join(tmpdir(), 'check-scope-'));
  roots.push(root);
  if (yaml !== null) {
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents', 'project.yaml'), yaml);
  }
  return root;
}

const NO_ERRORS = { mcpParity: [], varsCheck: [], docsCheck: [] };

describe('readChecks', () => {
  test('a missing file, a missing block and an unparseable yaml all read as the defaults with no error', () => {
    for (const yaml of [null, 'project:\n  project_name: x\n', 'project: [unclosed\n']) {
      expect(readChecks(project(yaml))).toEqual({ config: defaultChecks(), errors: NO_ERRORS });
    }
  });

  test('the shipped default block reads as the defaults', () => {
    const yaml = 'checks:\n  mcp_parity:\n    mode: strict\n    relay: {}\n    unrelayed: {}\n  vars_check:\n    skip_paths: []\n  docs_check:\n    include: []\n    exclude: []\n';
    expect(readChecks(project(yaml))).toEqual({ config: defaultChecks(), errors: NO_ERRORS });
  });

  test('reads every key', () => {
    const yaml = 'checks:\n  mcp_parity:\n    mode: local-only\n    relay:\n      pi: [bun, scripts/mcp-launch.ts]\n    unrelayed:\n      pi: [zeta-mcp, instance-n8n-mcp]\n  vars_check:\n    skip_paths: [.agents/skills/cinetic/**]\n  docs_check:\n    include: [docs/adr/**]\n    exclude: [docs/todo/**]\n';
    expect(readChecks(project(yaml))).toEqual({
      config: {
        mcpParity: { mode: 'local-only', relay: { pi: ['bun', 'scripts/mcp-launch.ts'] }, unrelayed: { pi: ['instance-n8n-mcp', 'zeta-mcp'] } },
        varsSkipPaths: ['.agents/skills/cinetic/**'],
        docsInclude: ['docs/adr/**'],
        docsExclude: ['docs/todo/**'],
      },
      errors: NO_ERRORS,
    });
  });
});

describe('parseChecks errors name the key and stay with the gate that owns it', () => {
  test('mcp_parity', () => {
    const read = parseChecks({ mcp_parity: { mode: 'loose', relay: { pi: ['bun'] } } });
    expect(read.errors.mcpParity).toEqual([
      'checks.mcp_parity.mode: must be one of strict, local-only (got "loose")',
      'checks.mcp_parity.relay.pi: must be the relay\'s argv prefix, at least [command, launcher] (e.g. [bun, scripts/mcp-launch.ts])',
    ]);
    expect(read.errors.varsCheck).toEqual([]);
    expect(read.config.mcpParity).toEqual({ mode: 'strict', relay: {}, unrelayed: {} });
  });

  test('mcp_parity.unrelayed', () => {
    expect(parseChecks({ mcp_parity: { unrelayed: ['instance-n8n-mcp'] } }).errors.mcpParity).toEqual([
      'checks.mcp_parity.unrelayed: must be a mapping of relay host to a list of server ids',
    ]);
    const read = parseChecks({ mcp_parity: { unrelayed: { pi: 'instance-n8n-mcp', codex: ['a', ''], opencode: ['b', 'c', 'b'] } } });
    expect(read.errors.mcpParity).toEqual([
      'checks.mcp_parity.unrelayed.pi: must be a list of server ids (e.g. [instance-n8n-mcp])',
      'checks.mcp_parity.unrelayed.codex: must be a list of server ids (e.g. [instance-n8n-mcp])',
      'checks.mcp_parity.unrelayed.opencode: lists b more than once',
    ]);
    expect(read.config.mcpParity.unrelayed).toEqual({});
    expect(parseChecks({ mcp_parity: { unrelayed: { pi: [] } } })).toEqual({ config: parseChecks({}).config, errors: parseChecks({}).errors });
  });

  test('glob lists', () => {
    const read = parseChecks({ vars_check: { skip_paths: 'docs/**' }, docs_check: { include: [3], exclude: ['/abs/**', 'docs/../x'] } });
    expect(read.errors.varsCheck).toEqual(['checks.vars_check.skip_paths: must be a list of repo-relative globs']);
    expect(read.errors.docsCheck).toEqual([
      'checks.docs_check.include: 3 is not a glob (a non-empty string)',
      'checks.docs_check.exclude: /abs/** must be repo-relative (no leading /, no ..)',
      'checks.docs_check.exclude: docs/../x must be repo-relative (no leading /, no ..)',
    ]);
    expect(read.errors.mcpParity).toEqual([]);
  });

  test('a block that is not a mapping fails every gate', () => {
    expect(parseChecks('strict').errors).toEqual({ mcpParity: ['checks: must be a mapping'], varsCheck: ['checks: must be a mapping'], docsCheck: ['checks: must be a mapping'] });
  });
});

describe('globs', () => {
  test('match dot folders and nested paths, POSIX or Windows separators', () => {
    expect(matchesAny(['.agents/skills/cinetic/**'], '.agents/skills/cinetic/references/a.md')).toBe(true);
    expect(matchesAny(['.agents/skills/cinetic/**'], '.agents\\skills\\cinetic\\SKILL.md')).toBe(true);
    expect(matchesAny(['docs/todo/**'], 'docs/todos/a.md')).toBe(false);
  });

  test('a glob that matches nothing is reported, a bare folder name included', () => {
    expect(unmatchedGlobs(['docs/todo', 'docs/todo/**', 'docs/typo/**'], ['docs/todo/a.md'])).toEqual(['docs/todo', 'docs/typo/**']);
  });

  test('skip paths may not cover the framework surface', () => {
    expect(refusedSkipPaths(['AGENTS.md', '.agents/instructions/**', '.agents/skills/**', '**', '.agents/skills/*/references/**', '.agents/skills/REGISTRY.md', '.agents/skills/cinetic/**', '.context/**'])).toEqual([
      'AGENTS.md',
      '.agents/instructions/**',
      '.agents/skills/**',
      '**',
      '.agents/skills/*/references/**',
      '.agents/skills/REGISTRY.md',
    ]);
  });
});
