import type { ReportSink } from './lib/updater-types.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { parse as parseYaml } from 'yaml';
import { isMaintainerCopy, isSchemaOwner, stripYamlComments } from './lib/agents-schema.ts';
import { unusedHarnessPaths } from './lib/harness-selection.ts';
import { loadBoardConfig } from './lib/sprint-source/index.ts';
import { cleanupDeprecated, componentOwnedPaths, isRepoOnlyForRun, isRepoOnlyPath, validateComponentRegistry } from './lib/updater-core.ts';
import { RETIRED_SECTION_FILES } from './lib/updater-instructions.ts';
import { backfillProjectYamlFromSchema, BOILERPLATE_TEST_PATHS, BOILERPLATE_TEST_PATTERNS, COMPONENTS, DEPRECATED_FILES, extractIndentedYamlBlock, GATE_SCRIPTS, gatesSummaryLine, parseArgs, resolveProtectedWatchlist, RETIRED_COMMAND_WRAPPERS, RETIRED_SKILL_FILES, runGate, summarizeGates, sweepStaleCloneDirs, TEMP_DIR, worktreeRefusal } from './update-boilerplate.ts';

/**
 * The boilerplate's own checkout: the package name AND the maintainer sentinel
 * (the same test `contractsEnforced` makes). Cases that read a bootstrap-only
 * file as upstream's copy skip downstream, where that file is the project's.
 */
const yamlPath = join(import.meta.dir, '..', '.agents', 'project.yaml');
const MAINTAINER_CHECKOUT = isSchemaOwner(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8'))
  && existsSync(yamlPath) && isMaintainerCopy(readFileSync(yamlPath, 'utf8'));

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
    // `.claude` itself is never a directory component: `.claude/commands` is
    // the project's own, the alias `.claude/skills` is generated.
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
    for (const p of ['.agents/skills', '.agents/hooks', '.opencode/plugins', '.codex', '.husky']) {
      expect(paths).toContain(p);
    }
  });

  test('.worktreeinclude ships once (bootstrap-only), so the lines a project adds survive every sync', () => {
    expect(COMPONENTS.find(c => c.name === 'worktree-include')).toMatchObject({ type: 'file-list', paths: ['.'], files: ['.worktreeinclude'], bootstrapOnly: true });
  });

  test('.playwright/cli.config.json ships once (bootstrap-only): a project keeps its tuning, the legacy profile is a parity row', () => {
    expect(COMPONENTS.find(c => c.name === 'playwright-cli-config')).toMatchObject({ type: 'file-list', paths: ['.playwright'], files: ['cli.config.json'], bootstrapOnly: true });
  });

  // Downstream, the file on disk is the project's own tuning, not upstream's copy.
  test.skipIf(!MAINTAINER_CHECKOUT)('upstream\'s own .playwright/cli.config.json is the shape the parity row asks for', () => {
    const shipped = JSON.parse(readFileSync(join(import.meta.dir, '..', '.playwright', 'cli.config.json'), 'utf8')) as { browser: Record<string, unknown> };
    expect(shipped.browser.isolated).not.toBe(false);
    expect(shipped.browser).not.toHaveProperty('userDataDir');
  });

  test('the retired command aliases leave the sync and are removed downstream, the project\'s own commands stay', () => {
    const paths = COMPONENTS.flatMap(c => c.paths);
    for (const p of ['.agents/compatibility', '.claude/commands', '.opencode/commands']) {
      expect(paths).not.toContain(p);
    }
    expect(COMPONENTS.find(c => c.name === 'commands')).toBeUndefined();

    const retired = RETIRED_COMMAND_WRAPPERS.map(d => d.path);
    expect(retired).toContain('.agents/compatibility/command-aliases.json');
    expect(retired).toContain('.claude/commands/business-data-map.md');
    expect(retired).toContain('.opencode/commands/business-data-map.md');
    // Same alias set on both hosts: one wrapper per host per alias.
    const byHost = (dir: string): string[] => retired.filter(p => p.startsWith(`${dir}/`)).map(p => p.slice(dir.length + 1)).sort();
    expect(byHost('.claude/commands')).toEqual(byHost('.opencode/commands'));
    expect(retired).not.toContain('.agents/compatibility/command-aliases.project.json');
    for (const d of RETIRED_COMMAND_WRAPPERS) {
      expect(d.reason).toContain('invoke the skill by name plus its mode');
      expect(d.deprecatedSince).not.toBe('');
    }

    const root = temporaryRoot();
    for (const d of RETIRED_COMMAND_WRAPPERS) {
      mkdirSync(join(root, d.path, '..'), { recursive: true });
      writeFileSync(join(root, d.path), 'wrapper\n');
    }
    mkdirSync(join(root, '.claude/commands'), { recursive: true });
    writeFileSync(join(root, '.claude/commands/acme-deploy.md'), 'the project\'s own\n');
    const cfg = { deprecatedFiles: RETIRED_COMMAND_WRAPPERS } as Parameters<typeof cleanupDeprecated>[0];
    expect(cleanupDeprecated(cfg, root, true)).toBe(RETIRED_COMMAND_WRAPPERS.length);
    expect(cleanupDeprecated(cfg, root, false)).toBe(RETIRED_COMMAND_WRAPPERS.length);
    expect(cleanupDeprecated(cfg, root, false)).toBe(0);
    expect(existsSync(join(root, '.claude/commands/acme-deploy.md'))).toBe(true);
  });

  test('a renamed skill leaves downstream with its folder, and a folder the project still uses stays', () => {
    const retired = RETIRED_SKILL_FILES.map(d => d.path);
    expect(retired).toContain('.agents/skills/adapt-framework/SKILL.md');
    expect(retired).toContain('.agents/skills/adapt-framework/references/adaptation-workflow.md');
    expect(DEPRECATED_FILES.map(d => d.path)).toEqual([...RETIRED_COMMAND_WRAPPERS, ...RETIRED_SKILL_FILES, ...RETIRED_SECTION_FILES].map(d => d.path));
    expect(retired).toContain('.agents/skills/sync-ai-context/SKILL.md');
    expect(retired).toContain('.agents/skills/sync-ai-context/references/sync.md');
    for (const d of RETIRED_SKILL_FILES) {
      expect(d.reason).toContain(d.path.includes('/adapt-framework/') ? 'test-framework-adaptation' : 'docs:check');
    }

    const root = temporaryRoot();
    for (const d of RETIRED_SKILL_FILES) {
      mkdirSync(join(root, d.path, '..'), { recursive: true });
      writeFileSync(join(root, d.path), 'old skill\n');
    }
    mkdirSync(join(root, '.agents/skills/test-framework-adaptation'), { recursive: true });
    writeFileSync(join(root, '.agents/skills/test-framework-adaptation/SKILL.md'), 'new skill\n');
    const cfg = { deprecatedFiles: RETIRED_SKILL_FILES } as Parameters<typeof cleanupDeprecated>[0];
    expect(cleanupDeprecated(cfg, root, false)).toBe(RETIRED_SKILL_FILES.length);
    // An emptied skill folder would fail skills:check ("directory has no SKILL.md").
    expect(existsSync(join(root, '.agents/skills/adapt-framework'))).toBe(false);
    expect(existsSync(join(root, '.agents/skills/test-framework-adaptation/SKILL.md'))).toBe(true);

    const kept = temporaryRoot();
    for (const d of RETIRED_SKILL_FILES) {
      mkdirSync(join(kept, d.path, '..'), { recursive: true });
      writeFileSync(join(kept, d.path), 'old skill\n');
    }
    writeFileSync(join(kept, '.agents/skills/adapt-framework/references/our-notes.md'), 'the project\'s own\n');
    cleanupDeprecated(cfg, kept, false);
    expect(existsSync(join(kept, '.agents/skills/adapt-framework/references/our-notes.md'))).toBe(true);
    expect(existsSync(join(kept, '.agents/skills/adapt-framework/SKILL.md'))).toBe(false);
  });

  test('the framework helpers under tests/utils sync as a file-list; the project\'s own helpers and the watched ones are never walked', () => {
    const testsUtils = COMPONENTS.find(c => c.name === 'tests-utils');
    expect(testsUtils).toMatchObject({ type: 'file-list', paths: ['tests/utils'] });
    expect(testsUtils?.bootstrapOnly).toBeUndefined();
    const owned = COMPONENTS.flatMap(c => componentOwnedPaths(c));
    for (const helper of ['testOutcomes.ts', 'knownDefect.ts', 'xrayResults.ts', 'testOutcomes.test.ts', 'xrayResults.test.ts']) {
      expect(testsUtils?.files).toContain(helper);
      // Every listed file exists upstream: a stale name would deliver nothing, silently.
      expect(existsSync(join(import.meta.dir, '..', 'tests/utils', helper))).toBe(true);
    }
    for (const kept of ['tests/utils/decorators.ts', 'tests/utils/jiraSync.ts', 'tests/utils/allure.ts', 'tests/KataReporter.ts', 'tests/e2e/login.test.ts']) {
      expect(isRepoOnlyPath(kept, owned)).toBe(false);
    }
  });

  test('no component delivers the boilerplate\'s own ADRs: the scaffold prunes them and no sync brings them back', () => {
    const owned = COMPONENTS.flatMap(c => componentOwnedPaths(c));
    for (const adr of ['.context/ADR/ADR-0001-example.md', '.context/ADR/README.md', '.context/ADR/ADR-NNNN-template.md']) {
      expect(isRepoOnlyPath(adr, owned)).toBe(false);
    }
  });

  test('docs syncs only its shipped half; every other path under docs/ is project-owned', () => {
    const docs = COMPONENTS.find(c => c.name === 'docs');
    expect(docs?.paths).not.toContain('docs');
    for (const p of ['docs/core', 'docs/assets', 'docs/index.html', 'docs/README.md', 'docs/.gitignore']) {
      expect(docs?.paths).toContain(p);
    }
    const owned = COMPONENTS.flatMap(c => componentOwnedPaths(c));
    for (const projectPage of ['docs/team/runbook.html', 'docs/manifest.json', 'docs/coreutils/x.html']) {
      expect(isRepoOnlyPath(projectPage, owned)).toBe(false);
    }
    expect(isRepoOnlyPath('docs/core/setup/dbhub.html', owned)).toBe(true);
    // Retired pages stay listed so their upstream deletion reaches older projects.
    expect(isRepoOnlyPath('docs/setup/mcp-dbhub.md', owned)).toBe(true);
  });
});

describe('boilerplate-only files under cli/ and scripts/', () => {
  const REPO = join(import.meta.dir, '..');
  const repoOnly = (rel: string): boolean => isRepoOnlyForRun({ repoOnlyPaths: BOILERPLATE_TEST_PATHS, repoOnlyPatterns: BOILERPLATE_TEST_PATTERNS }, rel);
  const tracked = (): string[] => {
    const r = spawnSync('git', ['-C', REPO, 'ls-files', '--', 'cli', 'scripts', '.agents/skills'], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.split('\n').filter(Boolean) : [];
  };

  test('the runtime data a gate reads and the project-guarding test keep travelling', () => {
    for (const keep of [
      'scripts/api-login.test.ts',
      'cli/lib/fixtures/instruction-router-eval.json',
      'cli/lib/sprint-source/fixtures/demo/project.yaml',
      'cli/lib/sprint-source/fixtures/demo/tickets.yaml',
      'cli/lib/evidence-page/fixtures/demo/checkout-error.png',
      'cli/update-boilerplate.ts',
      'scripts/board-check.ts',
    ]) {
      expect(repoOnly(keep)).toBe(false);
    }
    for (const drop of ['cli/lib/ui/page.test.ts', 'scripts/lib/router-eval.test.ts', 'cli/lib/ui/__snapshots__/installer-run.test.ts.snap', 'cli/sprint-board/fixtures/merge-reading/reading.json', 'scripts/ui-up-fixture.ts']) {
      expect(repoOnly(drop)).toBe(true);
    }
  });

  // A file that still travels and imports one that does not would break at
  // module load in every project, the failure CLI_IMPORT_CLOSURE guards against.
  test.skipIf(!MAINTAINER_CHECKOUT)('every listed path exists, and no file that travels imports one that does not', () => {
    const files = tracked();
    for (const p of BOILERPLATE_TEST_PATHS) {
      expect(files.some(f => f === p || f.startsWith(`${p}/`))).toBe(true);
    }
    const offenders: string[] = [];
    for (const file of files.filter(f => /\.[cm]?[jt]s$/.test(f) && !repoOnly(f))) {
      const text = readFileSync(join(REPO, file), 'utf8');
      for (const m of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g)) {
        const target = join(dirname(file), m[1]).replace(/\\/g, '/');
        if (repoOnly(target)) { offenders.push(`${file} -> ${target}`); }
      }
    }
    expect(offenders).toEqual([]);
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
    for (const p of ['allurerc.mjs', 'playwright.config.ts', 'config/variables.ts', 'tests/components/TestContext.ts', 'tests/components/api/ApiBase.ts', 'scripts/api-login.ts', '.github/workflows/regression.yml', 'tsconfig.json', 'eslint.config.js', 'tests/KataReporter.ts', 'tests/utils/decorators.ts', 'tests/utils/jiraSync.ts']) {
      expect(byPath[p]).toBeDefined();
    }
    for (const p of ['.mcp.json', 'opencode.jsonc', '.codex/config.toml', '.claude/settings.json']) {
      expect(byPath[p]).toMatchObject({ source: 'upstream' });
    }
    // Every hook stays watched for what is genuinely its own (ordering + its own
    // gates); the reason has to name the synced file the framework gates come
    // from, since that sentence is what the drift row shows the operator.
    for (const hook of ['.husky/pre-commit', '.husky/pre-push', '.husky/commit-msg']) {
      expect(byPath[hook]).toMatchObject({ source: 'upstream' });
      expect(byPath[hook]?.reason).toContain('.husky/framework-gates.sh');
    }
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

describe('one-harness projects (ADR-0012)', () => {
  test('a Claude-only project gets no OpenCode or Codex file delivered, watched or reported', () => {
    const root = temporaryRoot();
    for (const file of ['CLAUDE.md', '.mcp.json', '.claude/settings.json']) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '{}\n');
    }
    const unused = unusedHarnessPaths(root);
    expect(unused).toEqual(['opencode.jsonc', '.opencode/plugins', '.codex', '.pi/mcp.json', '.pi/extensions/agentic-qa.js']);

    const watched = resolveProtectedWatchlist(root).map(e => e.path);
    expect(watched).toContain('.mcp.json');
    expect(watched).not.toContain('opencode.jsonc');
    expect(watched).not.toContain('.codex/config.toml');

    // `repoOnlyPaths` is the filter every detection path (bootstrap, content
    // reconcile, git-log delta) goes through: nothing below these is delivered.
    const shipped = ['.opencode/plugins/personality-reinject.js', '.codex/hooks.json', '.codex/config.toml', '.codex/environments/environment.toml', 'opencode.jsonc'];
    for (const file of shipped) { expect(isRepoOnlyPath(file, unused)).toBe(true); }
    expect(isRepoOnlyPath('.agents/hooks/personality-reinject.mjs', unused)).toBe(false);
    expect(isRepoOnlyPath('.opencode/commands/mine.md', unused)).toBe(false);
    expect(isRepoOnlyPath('.pi/mcp.json', unused)).toBe(true);
    expect(isRepoOnlyPath('.pi/extensions/mine.js', unused)).toBe(false);
    expect(isRepoOnlyPath('.pi/extensions/agentic-qa.js', unused)).toBe(true);
  });

  test('a project that declares Pi later receives the adapter and, once, its registry', () => {
    const root = temporaryRoot();
    mkdirSync(join(root, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents', 'project.yaml'), 'harnesses: [claude, pi]\n');
    const unused = unusedHarnessPaths(root);
    expect(isRepoOnlyPath('.pi/mcp.json', unused)).toBe(false);
    expect(isRepoOnlyPath('.pi/extensions/agentic-qa.js', unused)).toBe(false);

    const adapter = COMPONENTS.find(c => c.name === 'pi-adapter');
    const registry = COMPONENTS.find(c => c.name === 'pi-config');
    expect(adapter).toMatchObject({ paths: ['.pi/extensions'], files: ['agentic-qa.js'] });
    expect(adapter?.bootstrapOnly).toBeUndefined();
    expect(registry).toMatchObject({ paths: ['.pi'], files: ['mcp.json'], bootstrapOnly: true });
    expect(resolveProtectedWatchlist(root).map(e => e.path)).toContain('.pi/mcp.json');
  });

  test('a project with all three (or none detected) keeps the full delivery', () => {
    expect(unusedHarnessPaths(temporaryRoot())).toEqual([]);
  });
});

describe('worktree refusal', () => {
  test('runs in the primary checkout, refuses in a linked worktree and names the primary', () => {
    const base = temporaryRoot();
    const primary = join(base, 'primary');
    mkdirSync(primary);
    const git = (cwd: string, ...args: string[]) => Bun.spawnSync(['git', '-C', cwd, ...args], { stdout: 'ignore', stderr: 'ignore' });
    git(primary, 'init', '-q');
    git(primary, '-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
    const wt = join(base, 'wt');
    git(primary, 'worktree', 'add', '-q', '-b', 'probe', wt);

    expect(worktreeRefusal(primary)).toBeNull();
    const refusal = worktreeRefusal(wt);
    expect(refusal).toContain('bun sync');
    expect(refusal).toContain('primary');
    // Not a git checkout at all: not this guard's business.
    expect(worktreeRefusal(temporaryRoot())).toBeNull();
  });
});

describe('upstream clone directory', () => {
  // Two `bun sync` runs on one machine (two worktrees, two test processes) used
  // to share one fixed directory, and each clone wiped the other's: CLONE_FAILED.
  test('two concurrent processes clone into two different directories under the temp dir', async () => {
    const code = `import { TEMP_DIR } from ${JSON.stringify(join(import.meta.dir, 'update-boilerplate.ts'))}; console.log(TEMP_DIR);`;
    const probe = async (): Promise<string> => (await new Response(Bun.spawn([process.execPath, '-e', code], { stdout: 'pipe', stderr: 'ignore' }).stdout).text()).trim();
    const [first, second] = await Promise.all([probe(), probe()]);
    expect(first).not.toBe('');
    expect(first).not.toBe(second);
    for (const dir of [first, second]) { expect(dirname(dir)).toBe(tmpdir()); }
  });

  test('this process owns a directory named after its pid', () => {
    expect(TEMP_DIR).toBe(join(tmpdir(), `kata-boilerplate-update-${process.pid}`));
  });

  test('the startup sweep removes the clone dir of a dead run and keeps the live ones', () => {
    const tmp = temporaryRoot();
    // A pid that existed and is gone: a run killed with SIGKILL leaves exactly this.
    const dead = spawnSync('true').pid;
    const names = [`kata-boilerplate-update-${dead}`, `kata-boilerplate-update-${process.ppid}`, `kata-boilerplate-update-${process.pid}`, 'kata-boilerplate-update', 'kata-boilerplate-update-x1'];
    for (const name of names) { mkdirSync(join(tmp, name, '.git'), { recursive: true }); }

    expect(sweepStaleCloneDirs(tmp)).toEqual([`kata-boilerplate-update-${dead}`]);
    expect(existsSync(join(tmp, `kata-boilerplate-update-${dead}`))).toBe(false);
    // A live run (the parent here), this run, and anything not shaped `<prefix><digits>` stay.
    for (const name of names.slice(1)) { expect(existsSync(join(tmp, name))).toBe(true); }
  });

  test('the sweep never throws on a temp dir it cannot read', () => {
    expect(sweepStaleCloneDirs(join(temporaryRoot(), 'missing'))).toEqual([]);
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

  test('the KATA manifest and skill-lint checks are gates next to types and lint', () => {
    // `skills:check` is the only gate that sees a half-delivered release: a new
    // skill applied here, the category vocabulary it needs kept in a protected
    // file (see PATH_PREREQUISITES).
    expect([...GATE_SCRIPTS]).toEqual(['types:check', 'lint:check', 'kata:manifest:check', 'skills:check']);
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

describe('project.yaml back-fill under --auto', () => {
  const SCHEMA = readFileSync(join(import.meta.dir, '..', '.agents', 'project.schema.yaml'), 'utf8');

  function autoSink(lines: string[]): ReportSink {
    return {
      step: (m: string) => lines.push(m),
      warn: (m: string) => lines.push(m),
      error: (m: string) => lines.push(m),
      confirm: async () => { throw new Error('--auto never prompts'); },
    } as unknown as ReportSink;
  }

  function fixture(projectYaml: string): { root: string, upstream: string } {
    const root = temporaryRoot();
    const upstream = temporaryRoot();
    mkdirSync(join(root, '.agents'), { recursive: true });
    mkdirSync(join(upstream, '.agents'), { recursive: true });
    writeFileSync(join(root, '.agents/project.yaml'), projectYaml);
    writeFileSync(join(upstream, '.agents/project.schema.yaml'), SCHEMA);
    writeFileSync(join(upstream, 'package.json'), JSON.stringify({ version: '9.9.9' }));
    return { root, upstream };
  }

  test('a whole missing block is inserted from the schema with blank values and no comments; a block the project has is never edited', async () => {
    // A project's yaml is values only (ADR-0025): the schema with its comments stripped.
    const lean = stripYamlComments(SCHEMA);
    const boardBlock = extractIndentedYamlBlock(lean, 'board', '');
    expect(boardBlock).not.toBeNull();
    // The project lacks the whole `board:` block AND one leaf of `testing:`.
    const projectYaml = lean.replace(`${boardBlock}\n`, '').replace(/^ {2}default_env:.*\n/m, '');
    expect(projectYaml).not.toContain('\nboard:');
    expect(projectYaml).not.toContain('default_env:');
    const { root, upstream } = fixture(projectYaml);
    const lines: string[] = [];
    await backfillProjectYamlFromSchema(upstream, autoSink(lines), true, root);

    const after = readFileSync(join(root, '.agents/project.yaml'), 'utf8');
    const parsed = parseYaml(after) as { board?: { source?: string }, testing?: Record<string, unknown> };
    expect(parsed.board?.source).toBe('auto');
    // The schema documents the block; not one of its comments reaches the project.
    expect(after.split('\n').filter(l => l.includes('#'))).toEqual([]);
    // The existing block keeps its shape: the missing leaf is only reported.
    expect(parsed.testing).not.toHaveProperty('default_env');
    expect(lines.join('\n')).toContain('testing.default_env');
    // Insert-only: every line the project had is still there, in order, and the
    // only new lines are the block's own.
    const nonBlank = (text: string): string[] => text.split('\n').filter(l => l.trim() !== '');
    const kept = nonBlank(after);
    const blockLines = new Set(nonBlank(boardBlock!));
    expect(kept.filter(l => !blockLines.has(l))).toEqual(nonBlank(projectYaml).filter(l => !blockLines.has(l)));
    expect(kept.length).toBe(nonBlank(projectYaml).length + nonBlank(boardBlock!).length);
    // The inserted template block is how the board ships unconfigured: one INFO line, exit 0.
    expect(loadBoardConfig(root).state).toBe('unconfigured');
  });

  // Owner decision (2026-11-02): a changed methodology default is listed, never written.
  test('a methodology value the project changed is warned about and left as it is', async () => {
    const lean = stripYamlComments(SCHEMA);
    const upstreamMax = (parseYaml(lean) as { orchestration: { max_workers: number } }).orchestration.max_workers;
    const projectYaml = lean.replace(/^ {2}max_workers: .*$/m, `  max_workers: ${upstreamMax + 2}`);
    expect(projectYaml).not.toBe(lean);
    const { root, upstream } = fixture(projectYaml);
    const lines: string[] = [];
    await backfillProjectYamlFromSchema(upstream, autoSink(lines), true, root);
    expect(readFileSync(join(root, '.agents/project.yaml'), 'utf8')).toBe(projectYaml);
    expect(lines.join('\n')).toContain(`orchestration.max_workers: yours ${upstreamMax + 2}, upstream default ${upstreamMax}`);
  });

  test('a block silenced through updater.schema_exempt is not inserted, and nothing missing means nothing written', async () => {
    const boardBlock = extractIndentedYamlBlock(SCHEMA, 'board', '')!;
    const silenced = fixture(SCHEMA.replace(`${boardBlock}\n`, '').replace(/^updater:\n/m, 'updater:\n  schema_exempt: [board]\n'));
    const before = readFileSync(join(silenced.root, '.agents/project.yaml'), 'utf8');
    await backfillProjectYamlFromSchema(silenced.upstream, autoSink([]), true, silenced.root);
    expect(readFileSync(join(silenced.root, '.agents/project.yaml'), 'utf8')).toBe(before);

    const complete = fixture(SCHEMA);
    await backfillProjectYamlFromSchema(complete.upstream, autoSink([]), true, complete.root);
    expect(readFileSync(join(complete.root, '.agents/project.yaml'), 'utf8')).toBe(SCHEMA);
  });
});
