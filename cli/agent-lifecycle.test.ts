import type { ReportSink } from './lib/updater-types.ts';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { communitySkillStatus, diagnoseAgentCompatibility } from './doctor.ts';
import {
  buildCommunitySkillArgs,
  detectAgents,
  discoverRequiredEnvVars,
  ENGRAM_PLUGIN_COMMANDS,
  engramSetupArgs,
  mergedHarnesses,
  migrateAgentIds,
  offerEngramClaudePlugin,
  parseAgentsEnv,
  PROJECT_LEVEL_SKILLS,
  PROJECT_SKILL_DESTINATION,
  remoteHeadRef,
  repairRepositoryCompatibility,
} from './install.ts';
import { declaredMcpIds } from './lib/agent-compatibility-contracts.ts';
import {
  claudeSkillsAliasPlan,
  repairClaudeSkillsAlias,
} from './lib/agent-compatibility.ts';
import { COMPONENTS, makeAgentCompatibilityHook } from './update-boilerplate.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'agent lifecycle '));
  temporaryRoots.push(root);
  return root;
}

/**
 * Full `ReportSink` whose only live member is `step`, which records into
 * `steps`. Every other member throws instead of no-opping: the compatibility
 * hook is only allowed to report progress, so a call to `warn`, `confirm`, or
 * any picker is a behavioral regression the test must fail on, not swallow.
 */
function recordingSink(steps: string[]): ReportSink {
  const forbidden = (member: string) => (): never => {
    throw new Error(`makeAgentCompatibilityHook must not call sink.${member}()`);
  };
  return {
    phase: forbidden('phase'),
    subphase: forbidden('subphase'),
    step: message => steps.push(message),
    warn: forbidden('warn'),
    error: forbidden('error'),
    spinner: forbidden('spinner'),
    confirm: forbidden('confirm'),
    pickScopes: forbidden('pickScopes'),
    pickFiles: forbidden('pickFiles'),
    pickIgnoreLines: forbidden('pickIgnoreLines'),
    resolveDiverged: forbidden('resolveDiverged'),
    confirmDelete: forbidden('confirmDelete'),
  };
}

function copyPath(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(join(REPO_ROOT, relativePath), destination, { recursive: true });
}

/**
 * A project on one harness deletes the other harnesses' files (ADR-0012), so
 * the fixture copies what this checkout has, and a test that reads a dropped
 * harness skips.
 */
const HAS_CODEX = existsSync(join(REPO_ROOT, '.codex/hooks.json')) && existsSync(join(REPO_ROOT, '.codex/config.toml'));
const HAS_CLAUDE = existsSync(join(REPO_ROOT, 'CLAUDE.md'));
const HAS_ALL_HARNESSES = HAS_CODEX && existsSync(join(REPO_ROOT, 'opencode.jsonc')) && existsSync(join(REPO_ROOT, '.mcp.json'));

function compatibilityFixture(): string {
  const root = temporaryRoot();
  for (const path of [
    'AGENTS.md',
    'CLAUDE.md',
    '.agents/skills/project-context/SKILL.md',
    '.agents/hooks/personality-reinject.mjs',
    '.claude/settings.json',
    '.opencode/plugins/personality-reinject.js',
    '.codex/hooks.json',
    '.codex/config.toml',
    '.mcp.json',
    'opencode.jsonc',
  ].filter(path => existsSync(join(REPO_ROOT, path)))) { copyPath(root, path); }
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

describe('installer Codex lifecycle', () => {
  test('parses Codex, deduplicates agents, and migrates legacy state values', () => {
    expect(parseAgentsEnv('codex,claude-code,codex,unknown,opencode')).toEqual([
      'codex',
      'claude-code',
      'opencode',
    ]);
    expect(migrateAgentIds(['claude-code', 'opencode'])).toEqual(['claude-code', 'opencode']);
    expect(migrateAgentIds(['codex', 'unknown'])).toEqual(['codex']);
  });

  test('distinguishes Codex CLI detection from Desktop repository configuration', async () => {
    const root = temporaryRoot();
    mkdirSync(join(root, '.codex'), { recursive: true });
    writeFileSync(join(root, '.codex/config.toml'), '[shell_environment_policy]\ninherit = "core"\n');
    const detected = await detectAgents({
      home: join(root, 'home'),
      root,
      binaryExists: binary => binary === 'codex',
    });

    expect(detected).toEqual({
      claudeCode: false,
      opencode: false,
      codexCli: true,
      codexConfigured: true,
    });
  });

  test('keeps project skills canonical and maps global skills to every harness', () => {
    const item = { package: 'owner/repo', skill: 'example' };
    expect(PROJECT_SKILL_DESTINATION).toBe('.agents/skills');
    expect(buildCommunitySkillArgs(item, 'project', ['claude-code', 'opencode', 'codex']))
      .toEqual(['skills', 'add', 'owner/repo', '--skill', 'example', '--yes']);
    expect(buildCommunitySkillArgs(item, 'global', ['claude-code', 'opencode', 'codex']))
      .toEqual([
        'skills',
        'add',
        'owner/repo',
        '--skill',
        'example',
        '--global',
        '--agent',
        'claude-code',
        '--agent',
        'opencode',
        '--agent',
        'codex',
        '--yes',
      ]);
  });

  test('wires Engram per agent with engram setup, slim protocol on Claude Code only', () => {
    expect(engramSetupArgs('claude-code')).toEqual(['setup', 'claude-code', '--protocol=slim']);
    expect(engramSetupArgs('opencode')).toEqual(['setup', 'opencode']);
    expect(engramSetupArgs('codex')).toEqual(['setup', 'codex']);
  });

  describe('offerEngramClaudePlugin', () => {
    function fakeClaude(results: Record<string, boolean> = {}) {
      const calls: string[][] = [];
      const run = (args: string[]) => {
        calls.push(args);
        return { ok: results[args.join(' ')] ?? true, stderr: 'boom' };
      };
      return { calls, run };
    }
    const yes = async () => true;

    test('installs the marketplace then the plugin after a yes', async () => {
      const claude = fakeClaude();
      const outcome = await offerEngramClaudePlugin({ nonInteractive: false, hasClaude: () => true, confirm: yes, run: claude.run });
      expect(outcome).toBe('installed');
      expect(claude.calls).toEqual(ENGRAM_PLUGIN_COMMANDS);
    });

    test('never runs the binary in non-interactive mode, nor asks', async () => {
      const claude = fakeClaude();
      let asked = false;
      const outcome = await offerEngramClaudePlugin({ nonInteractive: true, hasClaude: () => true, confirm: async () => { asked = true; return true; }, run: claude.run });
      expect(outcome).toBe('skipped-non-interactive');
      expect(asked).toBe(false);
      expect(claude.calls).toEqual([]);
    });

    test('runs nothing when declined or when the claude CLI is missing', async () => {
      const claude = fakeClaude();
      expect(await offerEngramClaudePlugin({ nonInteractive: false, hasClaude: () => true, confirm: async () => false, run: claude.run })).toBe('declined');
      expect(await offerEngramClaudePlugin({ nonInteractive: false, hasClaude: () => false, confirm: yes, run: claude.run })).toBe('no-claude-cli');
      expect(claude.calls).toEqual([]);
    });

    test('an already-registered marketplace does not block the install; a failed install is reported, never thrown', async () => {
      const marketplaceFails = fakeClaude({ 'plugin marketplace add Gentleman-Programming/engram': false });
      expect(await offerEngramClaudePlugin({ nonInteractive: false, hasClaude: () => true, confirm: yes, run: marketplaceFails.run })).toBe('installed');
      const installFails = fakeClaude({ 'plugin install engram@engram': false });
      expect(await offerEngramClaudePlugin({ nonInteractive: false, hasClaude: () => true, confirm: yes, run: installFails.run })).toBe('failed');
    });
  });

  test.skipIf(!HAS_ALL_HARNESSES)('discovers the MCP environment contracts from the loader filter on every host, and exposes launch guidance', async () => {
    // Each server names what it reads in its `.env` loader's `--filter`, the
    // same list on all three hosts: the six DBHUB_* dbhub.toml interpolates,
    // the two SLACK_MCP_*, the OpenAPI pair. None is core scope (project or
    // tooling), so the installer defers them to `bun run setup:doctor` instead
    // of prompting. No remote server's key appears: those run at harness level.
    const expected = [
      'API_BASE_URL',
      'DBHUB_DATABASE',
      'DBHUB_HOST',
      'DBHUB_PASSWORD',
      'DBHUB_PORT',
      'DBHUB_TYPE',
      'DBHUB_USER',
      'OPENAPI_SPEC_PATH',
      'SLACK_MCP_REACTION_TOOL',
      'SLACK_MCP_XOXP_TOKEN',
    ];
    expect(await discoverRequiredEnvVars(['codex'], REPO_ROOT)).toEqual(expected);
    expect(await discoverRequiredEnvVars(['claude-code'], REPO_ROOT)).toEqual(expected);
    expect(await discoverRequiredEnvVars(['opencode'], REPO_ROOT)).toEqual(expected);
  });
});

describe('installer harness selection (ADR-0012)', () => {
  test('the selection is added to the declared list, never shrinks it', () => {
    expect(mergedHarnesses([], ['claude-code'])).toEqual(['claude']);
    expect(mergedHarnesses(['codex', 'claude'], ['claude-code', 'opencode'])).toEqual(['codex', 'claude', 'opencode']);
    expect(mergedHarnesses(['opencode'], [])).toEqual(['opencode']);
  });
});

describe('compatibility repair lifecycle', () => {
  test('constructs portable POSIX and Windows alias plans', () => {
    const root = temporaryRoot();
    expect(claudeSkillsAliasPlan(root, 'linux')).toMatchObject({
      target: '../.agents/skills',
      type: 'symlink',
    });
    expect(claudeSkillsAliasPlan(root, 'win32')).toMatchObject({
      target: join(root, '.agents', 'skills'),
      type: 'junction',
    });
  });

  test.skipIf(!HAS_CLAUDE)('refuses to replace a real Claude skills directory', () => {
    const root = compatibilityFixture();
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    writeFileSync(join(root, '.claude/skills/owned.txt'), 'preserve me\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/owned.txt'), 'utf8')).toBe('preserve me\n');
  });

  test.skipIf(!HAS_CLAUDE)('reclaims the skills CLI per-skill symlink shim without losing a skill body', () => {
    // `bunx skills add` (project level) writes the body to .agents/skills/<slug>/ and then
    // creates .claude/skills/ as a REAL directory of per-skill symlinks. `bun run setup`
    // installs community skills BEFORE repairing compatibility, so this is what a clean
    // clone actually looks like at repair time. Refusing here aborted the install.
    const root = compatibilityFixture();
    mkdirSync(join(root, '.agents/skills/playwright-cli'), { recursive: true });
    writeFileSync(join(root, '.agents/skills/playwright-cli/SKILL.md'), 'body\n');
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');

    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({
      target: '../.agents/skills',
      status: 'repaired',
    });
    // The body survives and is still reachable through the directory-level alias.
    expect(readFileSync(join(root, '.agents/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(readFileSync(join(root, '.claude/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test.skipIf(!HAS_CLAUDE)('still refuses a shim directory that also holds real content', () => {
    const root = compatibilityFixture();
    mkdirSync(join(root, '.agents/skills/playwright-cli'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    writeFileSync(join(root, '.claude/skills/hand-written.md'), 'mine\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/hand-written.md'), 'utf8')).toBe('mine\n');
  });

  test.skipIf(!HAS_CLAUDE)('refuses a symlink shim pointing outside the canonical skills store', () => {
    const root = compatibilityFixture();
    mkdirSync(join(root, 'elsewhere/rogue'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../elsewhere/rogue', join(root, '.claude/skills/rogue'), 'dir');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
  });

  test.skipIf(!HAS_CLAUDE)('installer and updater repairs are idempotent', async () => {
    const root = compatibilityFixture();
    const first = repairRepositoryCompatibility(root, 'linux');
    const second = repairRepositoryCompatibility(root, 'linux');
    expect(first.alias?.status).toBe('created');
    expect(second).toMatchObject({ shadowingCommandsMoved: [], alias: { status: 'valid' } });

    const steps: string[] = [];
    const hook = makeAgentCompatibilityHook(recordingSink(steps), root);
    await hook({ applied: [] } as never);
    await hook({ applied: [] } as never);
    expect(steps.at(-1)).toBe('Compatibilidad lista: alias valid.');
  });
});

describe('doctor and updater parity', () => {
  test.skipIf(!HAS_CODEX)('reports file correctness separately from Codex trust and CLI availability', () => {
    const root = compatibilityFixture();
    repairRepositoryCompatibility(root, 'linux');
    const diagnostic = diagnoseAgentCompatibility(root, { platform: 'linux', codexCliDetected: false });

    expect(diagnostic.file_correct).toBe(true);
    expect(diagnostic.errors).toEqual([]);
    expect(diagnostic.errors_by_surface).toEqual([]);
    expect(diagnostic.alias.status).toBe('valid');
    // Derived from `.mcp.json`, never a literal count: a downstream project
    // with more servers passes unchanged.
    expect(diagnostic.mcp).toMatchObject({ expected_servers: declaredMcpIds(root).length, parity: true });
    expect(diagnostic.codex).toMatchObject({
      cli_detected: false,
      repository_configured: true,
      desktop_uses_repository_config: true,
      trust_required: true,
      trust_status: 'required-not-verifiable',
    });
  });

  test.skipIf(!HAS_CODEX)('reports a missing alias and grouped errors without throwing', () => {
    const root = compatibilityFixture();
    repairRepositoryCompatibility(root, 'linux');
    rmSync(join(root, '.claude/skills'));
    rmSync(join(root, '.codex/hooks.json'));

    const diagnostic = diagnoseAgentCompatibility(root, { platform: 'linux', codexCliDetected: false });
    expect(diagnostic.file_correct).toBe(false);
    expect(diagnostic.alias.status).toBe('missing');
    expect(diagnostic.instructions.claude_alias).toBe(false);
    expect(diagnostic.hooks.codex).toBe(false);
    expect(diagnostic.errors_by_surface.map(bucket => bucket.group)).toEqual(['alias', 'hooks']);
    expect(diagnostic.errors_by_surface[1].errors).toEqual(['Hook compatibility file missing: .codex/hooks.json']);
  });

  test('updater owns every canonical source and generated adapter family', () => {
    const paths = COMPONENTS.flatMap(component => component.paths);
    expect(paths).toContain('.agents/skills');
    expect(paths).toContain('.agents/hooks');
    // The alias wrappers are retired: harness command dirs are the project's own.
    expect(paths).not.toContain('.claude/commands');
    expect(paths).not.toContain('.opencode/commands');
    expect(paths).toContain('.opencode/plugins');
    expect(paths).toContain('.codex');
    // Since 8.2 `agent-root-config` delivers `.claude/settings.json` once and
    // then leaves it to the project (watchlist). `CLAUDE.md` is generated by the
    // compatibility repair and `.mcp.json` / `opencode.jsonc` are watchlisted
    // project registries, so no component may sync any of the three.
    const rootFiles = COMPONENTS.find(component => component.name === 'agent-root-config');
    expect(rootFiles).toMatchObject({ type: 'file-list', paths: ['.claude'], bootstrapOnly: true });
    expect(rootFiles?.files).toEqual(['settings.json']);
    const syncedFiles = COMPONENTS.flatMap(component => component.files ?? []);
    for (const never of ['CLAUDE.md', '.mcp.json', 'opencode.jsonc']) {
      expect(syncedFiles).not.toContain(never);
    }
  });
});

// ---------------------------------------------------------------------------
// T3 community skills. Installed once at scaffold time, gitignored, and
// outside the updater's surface — so without this reporting a project runs its
// scaffold-day copy forever with no signal. Reporting only: no reinstall path,
// because an overwrite of a gitignored skill has no backup to restore from.
// ---------------------------------------------------------------------------

describe('community skill version reporting', () => {
  const SHA = 'a'.repeat(40);
  const OTHER = 'b'.repeat(40);

  test('reads the remote HEAD from one ls-remote, no clone', () => {
    const calls: string[][] = [];
    const run = (binary: string, args: string[]): { ok: boolean, stdout: string } => {
      calls.push([binary, ...args]);
      return { ok: true, stdout: `${SHA}\tHEAD\n` };
    };

    expect(remoteHeadRef('https://github.com/microsoft/playwright-cli', run)).toBe(SHA);
    expect(calls).toEqual([['git', 'ls-remote', 'https://github.com/microsoft/playwright-cli', 'HEAD']]);
  });

  test('an unreachable or nonsense remote yields null, never a stale sha', () => {
    expect(remoteHeadRef('x', () => ({ ok: false, stdout: '' }))).toBeNull();
    expect(remoteHeadRef('x', () => ({ ok: true, stdout: '' }))).toBeNull();
    expect(remoteHeadRef('x', () => ({ ok: true, stdout: 'not-a-sha\tHEAD\n' }))).toBeNull();
  });

  test('ignorance never reads as current', () => {
    expect(communitySkillStatus(false, SHA, SHA)).toBe('not-installed');
    expect(communitySkillStatus(true, null, SHA)).toBe('untracked');
    expect(communitySkillStatus(true, SHA, null)).toBe('unknown');
  });

  test('compares the recorded baseline against the remote head', () => {
    expect(communitySkillStatus(true, SHA, SHA)).toBe('current');
    expect(communitySkillStatus(true, SHA, OTHER)).toBe('outdated');
  });

  test('every declared T3 skill carries the package the baseline is recorded against', () => {
    expect(PROJECT_LEVEL_SKILLS.length).toBeGreaterThan(0);
    for (const item of PROJECT_LEVEL_SKILLS) {
      expect(item.package).toMatch(/^https?:\/\//);
      expect(item.skill).toBeTruthy();
    }
  });
});
