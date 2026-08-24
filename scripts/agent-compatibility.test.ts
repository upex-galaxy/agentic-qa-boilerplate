import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { PERSONALITY_CONTRACT } from '../.agents/hooks/personality-reinject.mjs';
import { PersonalityReinject } from '../.opencode/plugins/personality-reinject.js';
import {
  CODEX_HOOK_COMMAND,
  CODEX_HOOK_COMMAND_WINDOWS,
  validateHookCompatibility,
  validateMcpParity,
} from './agent-compatibility-contracts.ts';

const REPO_ROOT = resolve(import.meta.dir, '..');
const FIXTURE_PATHS = [
  '.agents/hooks/personality-reinject.mjs',
  '.opencode/plugins/personality-reinject.js',
  '.claude/settings.json',
  '.codex/hooks.json',
  '.codex/config.toml',
  '.mcp.json',
  'opencode.jsonc',
];
const temporaryRoots: string[] = [];

function createFixture(prefix = 'agent compatibility '): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  for (const relativePath of FIXTURE_PATHS) {
    const source = join(REPO_ROOT, relativePath);
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
  }
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

describe('shared personality hook', () => {
  test('emits the canonical payload and exits successfully', () => {
    const result = Bun.spawnSync({
      cmd: ['node', join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs')],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(PERSONALITY_CONTRACT);
    expect(result.stderr.toString()).toBe('');
  });

  test('OpenCode mutates the system array in place with the same payload', async () => {
    const plugin = await PersonalityReinject();
    const transform = plugin['experimental.chat.system.transform'];
    const output = { system: ['base system'] };
    const originalArray = output.system;

    await transform({ sessionID: 'test', model: {} }, output);

    expect(output.system).toBe(originalArray);
    expect(output.system).toEqual(['base system', PERSONALITY_CONTRACT]);
  });
});

describe('Codex hook portability', () => {
  test('fails when the current directory has no Git root', () => {
    const root = createFixture('agent compatibility no git ');
    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).not.toBe(0);
  });

  test('resolves a Git root whose path contains spaces', () => {
    const root = createFixture('agent compatibility spaced root ');
    const nested = join(root, 'nested directory');
    mkdirSync(nested);
    const init = Bun.spawnSync({ cmd: ['git', 'init', '-q'], cwd: root, stderr: 'pipe' });
    expect(init.exitCode).toBe(0);

    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: nested,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(PERSONALITY_CONTRACT);
  });

  test('renders a Windows command with Git-root and Join-Path resolution', () => {
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('git rev-parse --show-toplevel');
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('Join-Path $root \'.agents/hooks/personality-reinject.mjs\'');
    expect(CODEX_HOOK_COMMAND_WINDOWS).not.toContain('/Users/');
  });

  test('rejects an absolute personal hook path', () => {
    const root = createFixture();
    const hooksPath = join(root, '.codex/hooks.json');
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
    hooks.hooks.UserPromptSubmit[0].hooks[0].command = 'node \'/Users/example/repo/.agents/hooks/personality-reinject.mjs\'';
    writeFileSync(hooksPath, `${JSON.stringify(hooks, null, 2)}\n`);

    expect(validateHookCompatibility(root)).toContain('codex hook command contains an absolute personal path.');
  });
});

describe('MCP semantic parity', () => {
  test('accepts the six canonical servers across all harnesses', () => {
    expect(validateMcpParity(REPO_ROOT)).toEqual([]);
  });

  test('reports a missing Tavily server', () => {
    const root = createFixture();
    const configPath = join(root, '.codex/config.toml');
    const config = readFileSync(configPath, 'utf8').replace(
      /\n\[mcp_servers\.tavily\][\s\S]*?(?=\n\[mcp_servers\.)/,
      '\n',
    );
    writeFileSync(configPath, config);

    expect(validateMcpParity(root).some(error => error.includes('codex MCP IDs') && error.includes('tavily'))).toBe(true);
  });

  test('reports an MCP ID mismatch', () => {
    const root = createFixture();
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.context8 = config.mcpServers.context7;
    delete config.mcpServers.context7;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    expect(validateMcpParity(root).some(error => error.includes('claude MCP IDs') && error.includes('context8'))).toBe(true);
  });

  test('reports an environment-variable mismatch', () => {
    const root = createFixture();
    const configPath = join(root, 'opencode.jsonc');
    const config = readFileSync(configPath, 'utf8').replace('POSTMAN_API_KEY', 'POSTMAN_TOKEN');
    writeFileSync(configPath, config);

    expect(validateMcpParity(root).some(error => error.includes('opencode MCP postman mismatch') && error.includes('POSTMAN_TOKEN'))).toBe(true);
  });
});
