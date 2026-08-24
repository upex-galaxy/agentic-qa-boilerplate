import type { ReportSink } from './lib/updater-types.ts';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  claudeSkillsAliasPlan,
  repairClaudeSkillsAlias,
} from '../scripts/agent-compatibility.ts';
import { diagnoseAgentCompatibility } from './doctor.ts';
import {
  buildCommunitySkillArgs,
  detectAgents,
  discoverRequiredEnvVars,
  launchCommandsForAgents,
  migrateAgentIds,
  parseAgentsEnv,
  PROJECT_SKILL_DESTINATION,
  repairRepositoryCompatibility,
} from './install.ts';
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

function compatibilityFixture(): string {
  const root = temporaryRoot();
  for (const path of [
    'AGENTS.md',
    'CLAUDE.md',
    '.agents/compatibility/command-aliases.json',
    '.agents/hooks/personality-reinject.mjs',
    '.claude/settings.json',
    '.opencode/plugins/personality-reinject.js',
    '.codex/hooks.json',
    '.codex/config.toml',
    '.mcp.json',
    'opencode.jsonc',
  ]) { copyPath(root, path); }

  const manifest = JSON.parse(readFileSync(join(root, '.agents/compatibility/command-aliases.json'), 'utf8')) as {
    aliases: Array<{ skill: string }>
  };
  for (const skill of new Set(manifest.aliases.map(alias => alias.skill))) {
    copyPath(root, `.agents/skills/${skill}/SKILL.md`);
  }
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

  test('discovers Codex MCP environment contracts and exposes launch guidance', async () => {
    expect(await discoverRequiredEnvVars(['codex'], REPO_ROOT)).toEqual([
      'API_BASE_URL',
      'OPENAPI_SPEC_PATH',
      'POSTMAN_API_KEY',
      'TAVILY_API_KEY',
    ]);
    expect(launchCommandsForAgents(['claude-code', 'opencode', 'codex']))
      .toEqual(['bun claude', 'bun opencode', 'bun codex']);
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

  test('refuses to replace a real Claude skills directory', () => {
    const root = compatibilityFixture();
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    writeFileSync(join(root, '.claude/skills/owned.txt'), 'preserve me\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/owned.txt'), 'utf8')).toBe('preserve me\n');
  });

  test('reclaims the skills CLI per-skill symlink shim without losing a skill body', () => {
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

  test('still refuses a shim directory that also holds real content', () => {
    const root = compatibilityFixture();
    mkdirSync(join(root, '.agents/skills/playwright-cli'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    writeFileSync(join(root, '.claude/skills/hand-written.md'), 'mine\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/hand-written.md'), 'utf8')).toBe('mine\n');
  });

  test('refuses a symlink shim pointing outside the canonical skills store', () => {
    const root = compatibilityFixture();
    mkdirSync(join(root, 'elsewhere/rogue'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../elsewhere/rogue', join(root, '.claude/skills/rogue'), 'dir');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
  });

  test('installer and updater repairs are idempotent', async () => {
    const root = compatibilityFixture();
    const first = repairRepositoryCompatibility(root, 'linux');
    const second = repairRepositoryCompatibility(root, 'linux');
    expect(first.wrappersWritten).toBe(20);
    expect(second).toMatchObject({ wrappersWritten: 0, alias: { status: 'valid' } });

    const steps: string[] = [];
    const hook = makeAgentCompatibilityHook(recordingSink(steps), root);
    await hook({ applied: [] } as never);
    await hook({ applied: [] } as never);
    expect(steps.at(-1)).toContain('0 wrapper(s) actualizado(s)');
  });
});

describe('doctor and updater parity', () => {
  test('reports file correctness separately from Codex trust and CLI availability', () => {
    const root = compatibilityFixture();
    repairRepositoryCompatibility(root, 'linux');
    const diagnostic = diagnoseAgentCompatibility(root, { platform: 'linux', codexCliDetected: false });

    expect(diagnostic.file_correct).toBe(true);
    expect(diagnostic.command_wrappers).toEqual({ expected: 10, claude: 10, opencode: 10, ok: true });
    expect(diagnostic.mcp).toMatchObject({ expected_servers: 6, parity: true });
    expect(diagnostic.codex).toMatchObject({
      cli_detected: false,
      repository_configured: true,
      desktop_uses_repository_config: true,
      trust_required: true,
      trust_status: 'required-not-verifiable',
    });
  });

  test('updater owns every canonical source and generated adapter family', () => {
    const paths = COMPONENTS.flatMap(component => component.paths);
    expect(paths).toContain('.agents/skills');
    expect(paths).toContain('.agents/compatibility');
    expect(paths).toContain('.agents/hooks');
    expect(paths).toContain('.claude/commands');
    expect(paths).toContain('.opencode/commands');
    expect(paths).toContain('.opencode/plugins');
    expect(paths).toContain('.codex');
    const rootFiles = COMPONENTS.find(component => component.name === 'agent-root-config');
    expect(rootFiles?.files).toEqual(['CLAUDE.md', '.mcp.json', 'opencode.jsonc']);
  });
});
