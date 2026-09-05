import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { validateComponentRegistry } from './lib/updater-core.ts';
import { COMPONENTS, GATE_SCRIPTS, gatesSummaryLine, parseArgs, resolveProtectedWatchlist, runGate, summarizeGates } from './update-boilerplate.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater wrapper '));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

describe('component registry', () => {
  test('no two components claim the same path', () => {
    expect(() => validateComponentRegistry(COMPONENTS)).not.toThrow();
  });

  test('.claude/settings.json ships once (bootstrap-only) and stays out of every directory component', () => {
    const rootConfig = COMPONENTS.find(c => c.name === 'agent-root-config');
    expect(rootConfig).toMatchObject({ type: 'file-list', paths: ['.claude'], files: ['settings.json'], bootstrapOnly: true });
    // `.claude` itself is never a directory component: `commands` owns
    // `.claude/commands`, the alias `.claude/skills` is generated.
    expect(COMPONENTS.filter(c => c.type !== 'file-list').flatMap(c => c.paths)).not.toContain('.claude');
    // The MCP registries and the CLAUDE.md shim left the sync in 8.2.
    const rootFiles = COMPONENTS.filter(c => c.type === 'file-list').flatMap(c => c.files ?? []);
    expect(rootFiles).not.toContain('.mcp.json');
    expect(rootFiles).not.toContain('opencode.jsonc');
    expect(rootFiles).not.toContain('CLAUDE.md');
    expect(COMPONENTS.find(c => c.name === 'claude-config')).toBeUndefined();
  });

  test('the Codex adapter ships once, its hook file keeps flowing; skills stay their own component', () => {
    expect(COMPONENTS.find(c => c.name === 'codex-config')).toMatchObject({ type: 'directory', paths: ['.codex'], bootstrapOnly: true, frameworkFiles: ['hooks.json'] });
    expect(COMPONENTS.find(c => c.name === 'skills')).toMatchObject({ type: 'directory', paths: ['.agents/skills'] });
    const paths = COMPONENTS.flatMap(c => c.paths);
    for (const p of ['.agents/skills', '.agents/compatibility', '.agents/hooks', '.claude/commands', '.opencode/commands', '.opencode/plugins', '.codex', '.husky']) {
      expect(paths).toContain(p);
    }
  });
});

describe('protected watchlist', () => {
  test('the QA bases, the MCP registries, the husky hooks and the identity files are watched; a project without the block adds nothing', () => {
    const root = temporaryRoot();
    const warnings: string[] = [];
    const watchlist = resolveProtectedWatchlist(root, m => warnings.push(m));
    expect(warnings).toEqual([]);
    const byPath = Object.fromEntries(watchlist.map(e => [e.path, e]));
    expect(byPath['AGENTS.md']).toMatchObject({ markerPath: '.template/claude-md.upstream.sha', source: 'upstream' });
    for (const p of ['allurerc.mjs', 'playwright.config.ts', 'config/variables.ts', 'tests/components/TestContext.ts', 'tests/components/api/ApiBase.ts', 'scripts/api-login.ts', '.github/workflows/regression.yml', 'tsconfig.json', 'eslint.config.js']) {
      expect(byPath[p]).toBeDefined();
    }
    for (const p of ['.mcp.json', 'opencode.jsonc', '.codex/config.toml', '.claude/settings.json']) {
      expect(byPath[p]).toMatchObject({ source: 'upstream' });
    }
    expect(byPath['.husky/pre-commit']).toMatchObject({ reason: 'project gates live here', source: 'upstream' });
    expect(byPath['.husky/pre-push']).toMatchObject({ reason: 'project gates live here', source: 'upstream' });
    expect(byPath['.agents/project.yaml']?.structural).toBe(true);
    expect(byPath['.agents/jira-required.yaml']?.structural).toBe(true);
    expect(byPath['.claude/settings.json']?.structural).toBeUndefined();
    expect(watchlist.every(e => e.source === 'upstream')).toBe(true);
    // The husky component still owns the directory: the hooks are protected by path, not unsynced.
    expect(COMPONENTS.find(c => c.name === 'husky')).toMatchObject({ type: 'directory', paths: ['.husky'] });
  });

  test('updater.protected_paths joins the watchlist; invalid entries are reported in Spanish and ignored', () => {
    const root = temporaryRoot();
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents', 'project.yaml'), 'updater:\n  protected_paths:\n    - scripts/lint-vars.ts\n    - .husky/pre-push\n    - ../outside.ts\n    - .git/config\n');
    const warnings: string[] = [];
    const watchlist = resolveProtectedWatchlist(root, m => warnings.push(m));
    expect(watchlist.filter(e => e.source === 'project').map(e => e.path)).toEqual(['scripts/lint-vars.ts']);
    expect(watchlist.filter(e => e.path === '.husky/pre-push')).toHaveLength(1);
    expect(warnings).toEqual([
      'updater.protected_paths (.agents/project.yaml): entrada ignorada "../outside.ts": outside the repo (`..` segment).',
      'updater.protected_paths (.agents/project.yaml): entrada ignorada ".git/config": under .git.',
    ]);
  });
});

describe('flags', () => {
  test('--auto, --force, --strict, --no-gates and --interactive parse next to the QA sub-commands', () => {
    expect(parseArgs(['--auto', '--no-gates'])).toMatchObject({ auto: true, noGates: true, interactive: false, force: false });
    expect(parseArgs(['--interactive', '--dry-run'])).toMatchObject({ interactive: true, dryRun: true, auto: false, noGates: false });
    expect(parseArgs(['-i', '--force', '--strict'])).toMatchObject({ interactive: true, force: true, strict: true });
    expect(parseArgs([])).toMatchObject({ auto: false, force: false, noGates: false, interactive: false, strict: false, skills: null, listSkills: false });
    expect(parseArgs(['skills', '--skill', 'acli, xray-cli'])).toMatchObject({ commands: ['skills'], skills: ['acli', 'xray-cli'] });
    expect(parseArgs(['--list'])).toMatchObject({ listSkills: true });
  });

  test('the pre-8.2 component name still resolves', () => {
    expect(parseArgs(['claude-config', 'docs'])).toMatchObject({ commands: ['agent-root-config', 'docs'] });
  });
});

describe('post-apply gates', () => {
  /** A project whose package.json defines the gate scripts as shell one-liners. */
  function project(scripts: Record<string, string>): string {
    const root = temporaryRoot();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'gate-fixture', private: true, scripts }, null, 2));
    return root;
  }

  test('the KATA manifest check is a gate next to types and lint', () => {
    expect([...GATE_SCRIPTS]).toEqual(['types:check', 'lint:check', 'kata:manifest:check']);
  });

  test('a failing gate reports exit code, error count, the first lines and which applied files they name', () => {
    const root = project({ 'types:check': 'printf "cli/lib/updater-core.test.ts(84,19): error TS2352: bad cast\\nsrc/app.ts(1,1): error TS1000: nope\\n" >&2; exit 2' });
    const gate = runGate('types:check', root, ['cli/lib/updater-core.test.ts', 'cli/update-boilerplate.ts']);
    expect(gate).toMatchObject({ script: 'types:check', status: 'fail', exitCode: 2, errorCount: 2, failingApplied: ['cli/lib/updater-core.test.ts'] });
    expect(gate.firstErrors).toEqual(['cli/lib/updater-core.test.ts(84,19): error TS2352: bad cast', 'src/app.ts(1,1): error TS1000: nope']);
    expect(gate.output).toContain('TS2352');
  });

  test('a passing gate carries no errors; one that does not finish in time is a timeout, not a failure', () => {
    const root = project({ 'lint:check': 'exit 0', 'types:check': 'sleep 5' });
    expect(runGate('lint:check', root, [])).toMatchObject({ status: 'pass', exitCode: 0, errorCount: 0, firstErrors: [] });
    const slow = runGate('types:check', root, [], 300);
    expect(slow.status).toBe('timeout');
    expect(slow.exitCode).toBeNull();
  }, 15_000);

  test('the closing-box line names every gate and its verdict', () => {
    expect(summarizeGates([])).toBeNull();
    expect(summarizeGates([
      { script: 'types:check', status: 'fail', exitCode: 2, seconds: 8, errorCount: 5, firstErrors: [], failingApplied: [], output: '' },
      { script: 'lint:check', status: 'pass', exitCode: 0, seconds: 3, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
      { script: 'kata:manifest:check', status: 'timeout', exitCode: null, seconds: 120, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
    ])).toBe('types:check FAIL (5 errores); lint:check OK; kata:manifest:check omitido (>120 s)');
  });

  // Live finding: a no-op run (nothing applied) or one launched with
  // `--no-gates` used to drop the `Gates:` line entirely — reading as
  // "nothing to say" when it actually means "nothing ran".
  test('a skipped run names WHY, never just drops the line; a real result always wins over the reason', () => {
    expect(gatesSummaryLine([], null)).toBeNull();
    expect(gatesSummaryLine([], 'no-gates')).toBe('omitidas (--no-gates)');
    expect(gatesSummaryLine([], 'no-changes')).toBe('omitidas (sin cambios)');
    expect(gatesSummaryLine([
      { script: 'types:check', status: 'pass', exitCode: 0, seconds: 3, errorCount: 0, firstErrors: [], failingApplied: [], output: '' },
    ], 'no-changes')).toBe('types:check OK');
  });
});
