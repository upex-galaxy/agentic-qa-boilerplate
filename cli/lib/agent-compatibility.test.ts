/* eslint-disable no-template-curly-in-string -- the fixtures below mirror .mcp.json verbatim, `${VAR}` included */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { PERSONALITY_CONTRACT } from '../../.agents/hooks/personality-reinject.mjs';
import { PersonalityReinject } from '../../.opencode/plugins/personality-reinject.js';
import {
  CLAUDE_HOOK_COMMAND,
  CODEX_HOOK_COMMAND,
  CODEX_HOOK_COMMAND_WINDOWS,
  declaredMcpIds,
  EXPECTED_MCP,
  KNOWN_MCP_IDS,
  stripJsonComments,
  validateHookCompatibility,
  validateMcpParity,
} from './agent-compatibility-contracts.ts';
import {
  checkAgentCompatibility,
  CLAUDE_INSTRUCTIONS_SHIM,
  claudeSkillsAliasPlan,
  COMMAND_ALIAS_MANIFEST,
  COMMAND_ALIAS_PROJECT_MANIFEST,
  commandWrapperCounts,
  COMPATIBILITY_GROUP_LABEL,
  COMPATIBILITY_GROUP_ORDER,
  describeAliasStatus,
  groupCompatibilityErrors,
  isInside,
  mergedCommandAliases,
  POSIX_CLAUDE_SKILLS_TARGET,
  repairAgentSurfaces,
  repairClaudeSkillsAlias,
  repairCommandWrappers,
  SKILLS_ALIAS_DEFERRED_MARKER,
  SKILLS_ALIAS_MISSING_ERROR,
  undeclaredCommandWrappers,
  validateCanonicalSources,
  validateCommandAliases,
} from './agent-compatibility.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function temporaryRoot(prefix = 'agent compatibility '): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function copyFromRepo(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(REPO_ROOT, relativePath), destination);
}

// ---------------------------------------------------------------------------
// Inline fixtures: the six servers this repo ships plus `supabase` (a
// downstream server the contract does not know), spelled per host. Written
// here rather than copied so the tests describe the contract on their own,
// whatever the real repo looks like at the moment they run. Each host file is
// composed from the ids a test declares, so one fixture describes both this
// boilerplate and a downstream project with a different server set.
// ---------------------------------------------------------------------------

/** The set this boilerplate ships (and the strict per-host shapes cover). */
const BOILERPLATE_IDS = ['context7', 'tavily', 'playwright', 'dbhub', 'openapi', 'postman'];
/** A downstream set: no `dbhub`, no `postman`, plus a server the contract has no shape for. */
const PROJECT_IDS = ['context7', 'tavily', 'playwright', 'openapi', 'supabase'];

const MCP_SERVERS: Record<string, unknown> = {
  context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.0.3'] },
  tavily: {
    type: 'http',
    url: 'https://mcp.tavily.com/mcp/',
    headers: { Authorization: 'Bearer ${TAVILY_API_KEY}' },
  },
  playwright: {
    command: 'bunx',
    args: [
      '@playwright/mcp@0.0.79',
      '--caps',
      'vision,pdf,testing,tracing,tabs',
      '--timeout-action',
      '10000',
      '--timeout-navigation',
      '30000',
      '--viewport-size',
      '1920x1080',
    ],
  },
  dbhub: { command: 'bunx', args: ['-y', '@bytebase/dbhub@1.2.1', '--config', 'dbhub.toml'] },
  openapi: {
    command: 'bunx',
    args: ['-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
    env: { API_BASE_URL: '${API_BASE_URL}', OPENAPI_SPEC_PATH: '${OPENAPI_SPEC_PATH}' },
  },
  postman: {
    type: 'http',
    url: 'https://mcp.postman.com/mcp',
    headers: { Authorization: 'Bearer ${POSTMAN_API_KEY}' },
  },
  supabase: {
    command: 'bunx',
    args: ['-y', '@supabase/mcp-server-supabase@latest', '--read-only'],
    env: { SUPABASE_ACCESS_TOKEN: '${SUPABASE_ACCESS_TOKEN}', LOG_LEVEL: 'error' },
  },
};

// Comments and trailing commas on purpose: this is what Prettier writes.
const OPENCODE_SERVERS: Record<string, string> = {
  context7: `    "context7": {
      "type": "local",
      "command": ["npx", "-y", "@upstash/context7-mcp@4.0.3"],
      "enabled": true,
    },`,
  tavily: `    "tavily": {
      "type": "remote",
      "url": "https://mcp.tavily.com/mcp/",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:TAVILY_API_KEY}",
      },
    },`,
  playwright: `    "playwright": {
      "type": "local",
      "command": [
        "bunx",
        "@playwright/mcp@0.0.79",
        "--caps",
        "vision,pdf,testing,tracing,tabs",
        "--timeout-action",
        "10000",
        "--timeout-navigation",
        "30000",
        "--viewport-size",
        "1920x1080",
      ],
      "enabled": true,
    },`,
  dbhub: `    "dbhub": {
      "type": "local",
      "command": ["bunx", "-y", "@bytebase/dbhub@1.2.1", "--config", "dbhub.toml"],
      "enabled": true,
    },`,
  openapi: `    // schema-read-only: no token here
    "openapi": {
      "type": "local",
      "command": ["bunx", "-y", "@ivotoby/openapi-mcp-server@1.16.1", "--tools", "dynamic"],
      "enabled": true,
      "environment": {
        "API_BASE_URL": "{env:API_BASE_URL}",
        "OPENAPI_SPEC_PATH": "{env:OPENAPI_SPEC_PATH}",
      },
    },`,
  postman: `    "postman": {
      "type": "remote",
      "url": "https://mcp.postman.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:POSTMAN_API_KEY}",
      },
    },`,
  supabase: `    "supabase": {
      "type": "local",
      "command": ["bunx", "-y", "@supabase/mcp-server-supabase@latest", "--read-only"],
      "enabled": true,
      "environment": {
        "SUPABASE_ACCESS_TOKEN": "{env:SUPABASE_ACCESS_TOKEN}",
        "LOG_LEVEL": "error",
      },
    },`,
};

const CODEX_SERVERS: Record<string, string> = {
  context7: `[mcp_servers.context7]
command = "npx"
enabled = true
args = ["-y", "@upstash/context7-mcp@4.0.3"]
`,
  tavily: `[mcp_servers.tavily]
url = "https://mcp.tavily.com/mcp/"
bearer_token_env_var = "TAVILY_API_KEY"
enabled = true
`,
  playwright: `[mcp_servers.playwright]
command = "bunx"
enabled = true
args = ["@playwright/mcp@0.0.79", "--caps", "vision,pdf,testing,tracing,tabs", "--timeout-action", "10000", "--timeout-navigation", "30000", "--viewport-size", "1920x1080"]
`,
  dbhub: `[mcp_servers.dbhub]
command = "bunx"
enabled = true
args = ["-y", "@bytebase/dbhub@1.2.1", "--config", "dbhub.toml"]
`,
  openapi: `[mcp_servers.openapi]
command = "bunx"
enabled = true
args = ["-y", "@ivotoby/openapi-mcp-server@1.16.1", "--tools", "dynamic"]
env_vars = ["API_BASE_URL", "OPENAPI_SPEC_PATH"]
`,
  postman: `[mcp_servers.postman]
url = "https://mcp.postman.com/mcp"
bearer_token_env_var = "POSTMAN_API_KEY"
enabled = true
`,
  supabase: `[mcp_servers.supabase]
command = "bunx"
enabled = true
args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]
env_vars = ["SUPABASE_ACCESS_TOKEN"]

[mcp_servers.supabase.env]
LOG_LEVEL = "error"
`,
};

function mcpJson(ids: string[]): string {
  const mcpServers = Object.fromEntries(ids.map(id => [id, MCP_SERVERS[id]]));
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

function opencodeJsonc(ids: string[]): string {
  return `{
  // OpenCode shared team config
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@warp-dot-dev/opencode-warp"],
  "mcp": {
${ids.map(id => OPENCODE_SERVERS[id]).join('\n')}
  },
}
`;
}

function codexToml(ids: string[]): string {
  return `[shell_environment_policy]
inherit = "core"

${ids.map(id => CODEX_SERVERS[id]).join('\n')}`;
}

function hookSettings(command: string, windows?: string): string {
  const hook: Record<string, unknown> = { type: 'command', command, timeout: 5 };
  if (windows) { hook.commandWindows = windows; }
  return `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [hook] }] } }, null, 2)}\n`;
}

/** Hook adapters + MCP configs (the same `ids` on every host), nothing else. */
function contractFixture(prefix?: string, ids = BOILERPLATE_IDS): string {
  const root = temporaryRoot(prefix);
  copyFromRepo(root, '.agents/hooks/personality-reinject.mjs');
  copyFromRepo(root, '.opencode/plugins/personality-reinject.js');
  write(root, '.claude/settings.json', hookSettings(CLAUDE_HOOK_COMMAND));
  write(root, '.codex/hooks.json', hookSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS));
  write(root, '.mcp.json', mcpJson(ids));
  write(root, 'opencode.jsonc', opencodeJsonc(ids));
  write(root, '.codex/config.toml', codexToml(ids));
  return root;
}

const ALIASES = [
  { alias: 'master-test-plan', skill: 'project-context', mode: 'test-plan' },
  { alias: 'business-data-map', skill: 'project-context', mode: 'data' },
  { alias: 'sync-ai-memory', skill: 'sync-ai-context', mode: 'sync' },
];

function manifest(aliases = ALIASES): string {
  return `${JSON.stringify({
    version: 1,
    wrapperHosts: ['claude', 'opencode'],
    aliases: aliases.map(alias => ({
      ...alias,
      description: `Run ${alias.skill} in mode ${alias.mode}`,
      argumentHint: '[args]',
      forwardArguments: true,
      mutability: 'read-only',
    })),
  }, null, 2)}\n`;
}

/** Everything `checkAgentCompatibility` wants, except the alias itself. */
function repositoryFixture(): string {
  const root = contractFixture();
  write(root, 'AGENTS.md', '# AI memory\n');
  write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
  write(root, COMMAND_ALIAS_MANIFEST, manifest());
  for (const skill of new Set(ALIASES.map(alias => alias.skill))) {
    const modes = ALIASES.filter(alias => alias.skill === skill).map(alias => `\`${alias.mode}\``);
    write(root, `.agents/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n\nModes: ${modes.join(', ')}.\n`);
  }
  repairCommandWrappers(root);
  return root;
}

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

  test('names AGENTS.md as canonical, never CLAUDE.md', () => {
    expect(PERSONALITY_CONTRACT).toContain('AGENTS.md');
    expect(PERSONALITY_CONTRACT).not.toContain('CLAUDE.md');
  });

  test('OpenCode mutates the system array in place with the same payload', async () => {
    const plugin = await PersonalityReinject();
    const transform = plugin['experimental.chat.system.transform'];
    const output = { system: ['base system'] };
    const originalArray = output.system;

    await transform({ sessionID: 'test', model: {} }, output);
    await transform({ sessionID: 'test', model: {} }, output);

    expect(output.system).toBe(originalArray);
    expect(output.system).toEqual(['base system', PERSONALITY_CONTRACT]);
  });
});

describe('Codex hook portability', () => {
  test('fails when the current directory has no Git root', () => {
    const root = contractFixture('agent compatibility no git ');
    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).not.toBe(0);
  });

  test('resolves a Git root whose path contains spaces', () => {
    const root = contractFixture('agent compatibility spaced root ');
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
});

describe('hook adapters', () => {
  test('accepts the three adapters wired to the shared emitter', () => {
    expect(validateHookCompatibility(contractFixture())).toEqual([]);
  });

  test('the real repository wires its adapters to the shared emitter', () => {
    expect(validateHookCompatibility(REPO_ROOT)).toEqual([]);
  });

  test('rejects an absolute personal hook path', () => {
    const root = contractFixture();
    write(root, '.codex/hooks.json', hookSettings(
      'node \'/Users/example/repo/.agents/hooks/personality-reinject.mjs\'',
      CODEX_HOOK_COMMAND_WINDOWS,
    ));

    expect(validateHookCompatibility(root)).toContain('codex hook command contains an absolute personal path.');
  });

  test('rejects the legacy Claude-only hook file next to the shared emitter', () => {
    const root = contractFixture();
    write(root, '.claude/hooks/personality-reinject.js', 'process.stdout.write("dup");\n');

    expect(validateHookCompatibility(root)).toContain('Duplicated personality hook must be removed: .claude/hooks/personality-reinject.js');
  });

  test('rejects an OpenCode adapter that reassigns output.system', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'import { PERSONALITY_CONTRACT } from \'../../.agents/hooks/personality-reinject.mjs\';',
      'export const PersonalityReinject = async () => ({',
      '  \'experimental.chat.system.transform\': async (_input, output) => {',
      '    output.system = [...output.system, PERSONALITY_CONTRACT];',
      '  },',
      '});',
      '',
    ].join('\n'));

    expect(validateHookCompatibility(root)).toContain('OpenCode personality adapter must mutate output.system in place.');
  });
});

describe('MCP semantic parity', () => {
  test('the contract itself agrees on .env dependencies across hosts', () => {
    for (const id of KNOWN_MCP_IDS) {
      expect(EXPECTED_MCP.opencode[id].dependsOn).toEqual(EXPECTED_MCP.claude[id].dependsOn);
      expect(EXPECTED_MCP.codex[id].dependsOn).toEqual(EXPECTED_MCP.claude[id].dependsOn);
      expect(EXPECTED_MCP.codex[id].literalEnv).toEqual(EXPECTED_MCP.claude[id].literalEnv);
    }
  });

  test('accepts the six boilerplate servers across all harnesses', () => {
    expect(validateMcpParity(contractFixture())).toEqual([]);
  });

  test('the real repository declares the same servers on every host', () => {
    // Asserts the DECLARED set, never the literal boilerplate six: a downstream
    // project with eight servers (or three) must pass this test unchanged.
    const declared = declaredMcpIds(REPO_ROOT);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toEqual([...declared].sort());
    expect(validateMcpParity(REPO_ROOT)).toEqual([]);
  });

  test('strips comments without touching string contents', () => {
    expect(JSON.parse(stripJsonComments('{ // c\n "a": "http://x/*y*/" /* b */ }'))).toEqual({ a: 'http://x/*y*/' });
  });

  test('a bearer header on Claude and OpenCode is the same dependency Codex names by variable', () => {
    // `.mcp.json` / `opencode.jsonc` carry `Authorization: Bearer ${VAR}`;
    // Codex carries `bearer_token_env_var = "VAR"`. Same `.env` name, no error.
    const root = contractFixture();
    expect(validateMcpParity(root)).toEqual([]);

    const config = readFileSync(join(root, '.codex/config.toml'), 'utf8')
      .replace('bearer_token_env_var = "POSTMAN_API_KEY"', 'bearer_token_env_var = "POSTMAN_TOKEN"');
    writeFileSync(join(root, '.codex/config.toml'), config);

    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('codex MCP postman mismatch') && error.includes('POSTMAN_TOKEN'))).toBe(true);
    expect(errors.some(error => error.includes('MCP postman env contract differs between claude and codex'))).toBe(true);
  });

  test('reports a missing Tavily server', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    const config = readFileSync(configPath, 'utf8').replace(
      /\n\[mcp_servers\.tavily\][\s\S]*?(?=\n\[mcp_servers\.)/,
      '\n',
    );
    writeFileSync(configPath, config);

    expect(validateMcpParity(root)).toEqual([
      'MCP tavily missing from codex: declared in .mcp.json, absent from .codex/config.toml',
    ]);
  });

  test('reports an MCP ID mismatch on both sides', () => {
    const root = contractFixture();
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.context8 = config.mcpServers.context7;
    delete config.mcpServers.context7;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const errors = validateMcpParity(root);
    expect(errors).toContain('MCP context8 missing from opencode: declared in .mcp.json, absent from opencode.jsonc');
    expect(errors).toContain('MCP context8 missing from codex: declared in .mcp.json, absent from .codex/config.toml');
    expect(errors).toContain('MCP context7 present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc');
    expect(errors).toContain('MCP context7 present in codex only: declare it in .mcp.json or remove it from .codex/config.toml');
  });

  test('reports an environment-variable mismatch', () => {
    const root = contractFixture();
    const configPath = join(root, 'opencode.jsonc');
    const config = readFileSync(configPath, 'utf8').replace('{env:POSTMAN_API_KEY}', '{env:POSTMAN_TOKEN}');
    writeFileSync(configPath, config);

    expect(validateMcpParity(root).some(error => error.includes('opencode MCP postman mismatch') && error.includes('POSTMAN_TOKEN'))).toBe(true);
  });

  test('reports a forwarded variable that Codex renamed', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('"OPENAPI_SPEC_PATH"', '"OPENAPI_SPEC_URL"'));

    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('codex MCP openapi mismatch') && error.includes('OPENAPI_SPEC_URL'))).toBe(true);
    expect(errors.some(error => error.includes('MCP openapi env contract differs between claude and codex'))).toBe(true);
  });

  test('rejects a placeholder inside a Codex env table', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}\n[mcp_servers.openapi.env]\nAPI_BASE_URL = "\${API_BASE_URL}"\n`);

    expect(validateMcpParity(root)).toEqual([
      '.codex/config.toml openapi.env cannot reference API_BASE_URL: Codex does not expand placeholders. Forward the variable through env_vars instead.',
    ]);
  });
});

describe('project-declared MCP set', () => {
  // A downstream project (no `dbhub`, no `postman`, plus `supabase`) is the
  // canonical set for ITS three configs: `.mcp.json` declares, the other two
  // must match.

  test('accepts a project whose set differs from the boilerplate on every host', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    expect(declaredMcpIds(root)).toEqual([...PROJECT_IDS].sort());
    expect(validateMcpParity(root)).toEqual([]);
  });

  test('reports a declared server that Codex does not carry', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    write(root, '.codex/config.toml', codexToml(PROJECT_IDS.filter(id => id !== 'supabase')));

    expect(validateMcpParity(root)).toEqual([
      'MCP supabase missing from codex: declared in .mcp.json, absent from .codex/config.toml',
    ]);
  });

  test('reports a server that only OpenCode carries', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    write(root, 'opencode.jsonc', opencodeJsonc([...PROJECT_IDS, 'postman']));

    expect(validateMcpParity(root)).toEqual([
      'MCP postman present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
    ]);
  });

  test('still pins the per-host shape of a known server the project declares', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    // Same .env dependencies, different command shape: only the strict check sees it.
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('"--tools", "dynamic"]', '"--tools", "dynamic", "--read-only"]'));

    const errors = validateMcpParity(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith('codex MCP openapi mismatch: expected ');
    expect(errors[0]).toContain('--read-only');
  });

  test('compares the .env contract of an unknown server across hosts', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('env_vars = ["SUPABASE_ACCESS_TOKEN"]', 'env_vars = ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF"]'));

    expect(validateMcpParity(root)).toEqual([
      'MCP supabase env contract differs between claude and codex: {"dependsOn":["SUPABASE_ACCESS_TOKEN"],"literalEnv":{"LOG_LEVEL":"error"}} vs {"dependsOn":["SUPABASE_ACCESS_TOKEN","SUPABASE_PROJECT_REF"],"literalEnv":{"LOG_LEVEL":"error"}}',
    ]);
  });

  test('compares the literal settings of an unknown server across hosts', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('LOG_LEVEL = "error"', 'LOG_LEVEL = "debug"'));

    expect(validateMcpParity(root)).toEqual([
      'MCP supabase env contract differs between claude and codex: {"dependsOn":["SUPABASE_ACCESS_TOKEN"],"literalEnv":{"LOG_LEVEL":"error"}} vs {"dependsOn":["SUPABASE_ACCESS_TOKEN"],"literalEnv":{"LOG_LEVEL":"debug"}}',
    ]);
  });

  test('leaves an unknown server alone when its shape differs but its contract matches', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]', 'args = ["-y", "@supabase/mcp-server-supabase@latest"]'));

    expect(validateMcpParity(root)).toEqual([]);
  });
});

describe('canonical sources', () => {
  test('requires AGENTS.md, the skills store and a byte-exact CLAUDE.md shim', () => {
    const root = temporaryRoot();
    expect(validateCanonicalSources(root)).toEqual(['Canonical instructions missing: AGENTS.md']);

    write(root, 'AGENTS.md', '# memory\n');
    mkdirSync(join(root, '.agents/skills'), { recursive: true });
    expect(validateCanonicalSources(root)).toEqual(['Claude instruction shim missing: CLAUDE.md']);

    write(root, 'CLAUDE.md', '@AGENTS.md\n\nSome operational prose.\n');
    expect(validateCanonicalSources(root)).toEqual(['CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.']);

    write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
    expect(validateCanonicalSources(root)).toEqual([]);
  });
});

describe('Claude skills alias', () => {
  test('constructs portable POSIX and Windows alias plans', () => {
    const root = temporaryRoot();
    expect(claudeSkillsAliasPlan(root, 'linux')).toMatchObject({
      target: POSIX_CLAUDE_SKILLS_TARGET,
      type: 'symlink',
    });
    expect(claudeSkillsAliasPlan(root, 'win32')).toMatchObject({
      target: join(root, '.agents', 'skills'),
      type: 'junction',
    });
  });

  test('isInside survives a separator mismatch and rejects a sibling prefix', () => {
    const root = temporaryRoot();
    expect(isInside(join(root, '.agents/skills/acli'), join(root, '.agents/skills'))).toBe(true);
    expect(isInside(join(root, '.agents/skills'), join(root, '.agents/skills'))).toBe(true);
    expect(isInside(join(root, '.agents/skills-extra/acli'), join(root, '.agents/skills'))).toBe(false);
  });

  test('creates the relative symlink and reports it valid on the second pass', () => {
    const root = repositoryFixture();
    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({ status: 'created', target: POSIX_CLAUDE_SKILLS_TARGET });
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
    expect(readFileSync(join(root, '.claude/skills/project-context/SKILL.md'), 'utf8')).toContain('name: project-context');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test('re-points a symlink aimed somewhere else', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'elsewhere'), { recursive: true });
    symlinkSync('../elsewhere', join(root, '.claude/skills'), 'dir');

    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('repaired');
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
  });

  test('refuses to replace a real Claude skills directory', () => {
    const root = repositoryFixture();
    write(root, '.claude/skills/owned.txt', 'preserve me\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/owned.txt'), 'utf8')).toBe('preserve me\n');
  });

  test('reclaims the skills CLI per-skill symlink shim without losing a skill body', () => {
    // `bunx skills add` (project level) writes the body to .agents/skills/<slug>/ and then
    // creates .claude/skills/ as a REAL directory of per-skill symlinks. `bun run setup`
    // installs community skills BEFORE repairing compatibility, so this is what a clean
    // clone actually looks like at repair time. Refusing here aborted the install.
    const root = repositoryFixture();
    write(root, '.agents/skills/playwright-cli/SKILL.md', 'body\n');
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    write(root, '.claude/skills/.DS_Store', '');

    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({
      target: POSIX_CLAUDE_SKILLS_TARGET,
      status: 'repaired',
    });
    expect(readFileSync(join(root, '.agents/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(readFileSync(join(root, '.claude/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test('still refuses a shim directory that also holds real content', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, '.agents/skills/playwright-cli'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    write(root, '.claude/skills/hand-written.md', 'mine\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/hand-written.md'), 'utf8')).toBe('mine\n');
  });

  test('refuses a symlink shim pointing outside the canonical skills store', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'elsewhere/rogue'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../elsewhere/rogue', join(root, '.claude/skills/rogue'), 'dir');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
  });
});

describe('command alias wrappers', () => {
  test('reports the missing manifest', () => {
    const root = temporaryRoot();
    expect(validateCommandAliases(root)).toEqual([`Command alias manifest missing: ${COMMAND_ALIAS_MANIFEST}`]);
  });

  test('generates one wrapper per host per alias, idempotently', () => {
    const root = repositoryFixture();
    expect(commandWrapperCounts(root)).toEqual({ expected: 3, claude: 3, opencode: 3 });
    expect(repairCommandWrappers(root)).toBe(0);
    expect(validateCommandAliases(root)).toEqual([]);

    const wrapper = readFileSync(join(root, '.opencode/commands/master-test-plan.md'), 'utf8');
    expect(wrapper).toBe(readFileSync(join(root, '.claude/commands/master-test-plan.md'), 'utf8'));
    expect(wrapper).toContain('Invoke skill `project-context` in mode `test-plan`.');
    expect(wrapper).toContain('Forward `$ARGUMENTS` unchanged.');
  });

  test('distinguishes a stale wrapper from one that grew workflow prose', () => {
    const root = repositoryFixture();
    const stale = join(root, '.claude/commands/master-test-plan.md');
    writeFileSync(stale, readFileSync(stale, 'utf8').replace('test-plan`', 'plan`'));
    const prose = join(root, '.opencode/commands/sync-ai-memory.md');
    writeFileSync(prose, `${readFileSync(prose, 'utf8')}\n## Steps\n\n1. Read every doc.\n2. Patch drift.\n3. Report.\n`);

    const errors = validateCommandAliases(root);
    expect(errors).toContain('claude command wrapper is stale: .claude/commands/master-test-plan.md');
    expect(errors).toContain('opencode command wrapper contains workflow prose: .opencode/commands/sync-ai-memory.md');
  });

  test('rejects an alias whose skill or mode does not exist', () => {
    const root = repositoryFixture();
    write(root, COMMAND_ALIAS_MANIFEST, manifest([
      ...ALIASES,
      { alias: 'business-api-map', skill: 'project-context', mode: 'api' },
      { alias: 'ghost', skill: 'nowhere', mode: 'x' },
      { alias: 'Bad Alias', skill: 'project-context', mode: 'data' },
    ]));

    const errors = validateCommandAliases(root);
    expect(errors).toContain('Command alias target mode missing: business-api-map -> project-context:api');
    expect(errors).toContain('Command alias target skill missing: ghost -> nowhere');
    expect(errors).toContain('Invalid command alias: Bad Alias');
  });

  test('reports a wrapper file that no manifest produced, by name, without deleting it', () => {
    const root = repositoryFixture();
    write(root, '.claude/commands/hand-made.md', '---\ndescription: mine\n---\n\nDo things.\n');
    write(root, '.opencode/commands/.DS_Store', '');

    expect(undeclaredCommandWrappers(root)).toEqual(['.claude/commands/hand-made.md']);
    expect(validateCommandAliases(root)).toEqual([
      `Command wrapper not declared in any manifest: .claude/commands/hand-made.md; add it to ${COMMAND_ALIAS_PROJECT_MANIFEST} or delete it`,
    ]);
    expect(repairCommandWrappers(root)).toBe(0);
    expect(readFileSync(join(root, '.claude/commands/hand-made.md'), 'utf8')).toContain('Do things.');
  });
});

describe('project command alias overlay', () => {
  function overlay(aliases: Array<{ alias: string, skill: string, mode: string, description?: string }>): string {
    return `${JSON.stringify({
      version: 1,
      aliases: aliases.map(alias => ({
        alias: alias.alias,
        skill: alias.skill,
        mode: alias.mode,
        description: alias.description ?? `Project-owned ${alias.alias}`,
        argumentHint: '[args]',
        forwardArguments: true,
        mutability: 'read-only',
      })),
    }, null, 2)}\n`;
  }

  test('without an overlay the upstream manifest is the whole contract', () => {
    const root = repositoryFixture();
    const merged = mergedCommandAliases(root);
    expect(merged.overlayPresent).toBe(false);
    expect(merged.aliases.map(alias => alias.alias)).toEqual(ALIASES.map(alias => alias.alias));
    expect(merged.aliases.every(alias => alias.source === 'upstream')).toBe(true);
    expect(commandWrapperCounts(root)).toEqual({ expected: 3, claude: 3, opencode: 3 });
  });

  test('an overlay alias is added, rendered on both hosts and counted as expected', () => {
    const root = repositoryFixture();
    write(root, '.agents/skills/project-context/SKILL.md', '---\nname: project-context\n---\n\nModes: `test-plan`, `data`, `api`.\n');
    write(root, COMMAND_ALIAS_PROJECT_MANIFEST, overlay([{ alias: 'business-api-map', skill: 'project-context', mode: 'api' }]));

    // Before the repair the new wrapper is missing on both hosts.
    expect(commandWrapperCounts(root)).toEqual({ expected: 4, claude: 3, opencode: 3 });
    expect(validateCommandAliases(root)).toEqual([
      'claude command wrapper missing: .claude/commands/business-api-map.md',
      'opencode command wrapper missing: .opencode/commands/business-api-map.md',
    ]);

    expect(repairCommandWrappers(root)).toBe(2);
    expect(commandWrapperCounts(root)).toEqual({ expected: 4, claude: 4, opencode: 4 });
    expect(validateCommandAliases(root)).toEqual([]);
    expect(undeclaredCommandWrappers(root)).toEqual([]);

    const merged = mergedCommandAliases(root);
    expect(merged.overlayPresent).toBe(true);
    expect(merged.aliases.at(-1)).toMatchObject({ alias: 'business-api-map', source: 'project' });
    expect(readFileSync(join(root, '.opencode/commands/business-api-map.md'), 'utf8'))
      .toContain('Invoke skill `project-context` in mode `api`.');
  });

  test('an overlay entry overrides the upstream alias of the same name in place', () => {
    const root = repositoryFixture();
    write(root, COMMAND_ALIAS_PROJECT_MANIFEST, overlay([
      { alias: 'master-test-plan', skill: 'project-context', mode: 'test-plan', description: 'The plan the way THIS project runs it' },
    ]));

    const merged = mergedCommandAliases(root);
    expect(merged.aliases).toHaveLength(ALIASES.length);
    expect(merged.aliases[0]).toMatchObject({ alias: 'master-test-plan', source: 'project', description: 'The plan the way THIS project runs it' });
    expect(merged.wrapperHosts).toEqual(['claude', 'opencode']);

    // The previously generated upstream wrapper is now stale; repair rewrites it on both hosts.
    expect(validateCommandAliases(root)).toEqual([
      'claude command wrapper is stale: .claude/commands/master-test-plan.md',
      'opencode command wrapper is stale: .opencode/commands/master-test-plan.md',
    ]);
    expect(repairCommandWrappers(root)).toBe(2);
    expect(readFileSync(join(root, '.claude/commands/master-test-plan.md'), 'utf8')).toContain('description: The plan the way THIS project runs it');
    expect(validateCommandAliases(root)).toEqual([]);
  });

  test('the overlay never changes wrapperHosts and an overlay alias still needs a real skill and mode', () => {
    const root = repositoryFixture();
    write(root, COMMAND_ALIAS_PROJECT_MANIFEST, `${JSON.stringify({
      version: 1,
      wrapperHosts: ['claude'],
      aliases: [{ alias: 'ghost', skill: 'nowhere', mode: 'x', description: 'd', argumentHint: '[a]', forwardArguments: true, mutability: 'read-only' }],
    }, null, 2)}\n`);

    expect(mergedCommandAliases(root).wrapperHosts).toEqual(['claude', 'opencode']);
    expect(validateCommandAliases(root)).toEqual(['Command alias target skill missing: ghost -> nowhere']);
  });

  test('a malformed overlay is reported as one error and stops the wrapper check', () => {
    const root = repositoryFixture();
    write(root, COMMAND_ALIAS_PROJECT_MANIFEST, '{ "version": 2, "aliases": {} }\n');

    expect(validateCommandAliases(root)).toEqual([
      `Project command alias overlay must have version 1 and an aliases array: ${COMMAND_ALIAS_PROJECT_MANIFEST}`,
    ]);
    expect(() => commandWrapperCounts(root)).toThrow('Project command alias overlay');
  });
});

describe('checkAgentCompatibility', () => {
  test('passes on a repository with alias, wrappers, adapters and parity in place', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');

    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, errors: [], alias: { status: 'valid' } });
  });

  test('reports the missing alias together with every contract error', () => {
    const root = repositoryFixture();
    rmSync(join(root, '.codex/hooks.json'));

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.ok).toBe(false);
    expect(result.alias.status).toBe('missing');
    expect(result.errors).toContain('Hook compatibility file missing: .codex/hooks.json');
    expect(result.errors).toContain('Claude skills alias missing: .claude/skills');
  });

  test('flags a real directory sitting where the alias should be', () => {
    const root = repositoryFixture();
    write(root, '.claude/skills/owned.txt', 'mine\n');

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.alias.status).toBe('invalid');
    expect(result.errors).toContain('Refusing compatibility state: .claude/skills exists but is not a generated symlink or junction.');
  });
});

describe('repairAgentSurfaces', () => {
  test('creates the alias, renders the wrappers and passes the check', () => {
    const root = repositoryFixture();
    rmSync(join(root, '.claude/commands/master-test-plan.md'));

    const repair = repairAgentSurfaces(root, {}, 'linux');
    expect(repair.aliasDeferred).toBe(false);
    expect(repair.alias?.status).toBe('created');
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
    expect(repair.wrappersWritten).toBe(1);
    expect(repair.check).toMatchObject({ ok: true, errors: [] });
  });

  test('with the migration just applied, the alias waits for the commit and the check does not count it', () => {
    const root = repositoryFixture();

    const repair = repairAgentSurfaces(root, { deferSkillsAlias: true }, 'linux');
    expect(repair.aliasDeferred).toBe(true);
    expect(repair.alias).toBeNull();
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
    expect(existsSync(join(root, SKILLS_ALIAS_DEFERRED_MARKER))).toBe(true);
    expect(repair.check).toMatchObject({ ok: true, errors: [], alias: { status: 'deferred' } });
    // The pre-commit gate runs the same check and must pass on the migration commit.
    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, alias: { status: 'deferred' } });
    // Everything else is still enforced.
    rmSync(join(root, '.codex/hooks.json'));
    const broken = repairAgentSurfaces(root, { deferSkillsAlias: true }, 'linux');
    expect(broken.check.ok).toBe(false);
    expect(broken.check.errors).toEqual(['Hook compatibility file missing: .codex/hooks.json']);
    // And `bun run agents:compat` afterwards creates it as usual and ends the deferral.
    expect(repairAgentSurfaces(root, {}, 'linux').alias?.status).toBe('created');
    expect(existsSync(join(root, SKILLS_ALIAS_DEFERRED_MARKER))).toBe(false);
    // Without the marker, a missing alias is the error it always was.
    rmSync(join(root, '.claude/skills'));
    expect(checkAgentCompatibility(root, 'linux').errors).toContain(SKILLS_ALIAS_MISSING_ERROR);
  });

  test('without the manifest the wrappers are skipped, not invented', () => {
    const root = repositoryFixture();
    rmSync(join(root, COMMAND_ALIAS_MANIFEST));
    const repair = repairAgentSurfaces(root, {}, 'linux');
    expect(repair.wrappersWritten).toBeNull();
    expect(repair.check.errors).toContain(`Command alias manifest missing: ${COMMAND_ALIAS_MANIFEST}`);
  });
});

describe('compatibility report grouping', () => {
  // With pre-existing MCP drift, a flat error list hides the "alias deferred"
  // message, so "alias pending commit" and "real drift" become indistinguishable.
  test('errors bucket per surface in a fixed order, empty groups omitted', () => {
    const groups = groupCompatibilityErrors([
      'MCP postman missing from codex: declared in .mcp.json, absent from .codex/config.toml',
      'claude command wrapper is stale: .claude/commands/x.md',
      'Claude skills alias missing: .claude/skills',
      'codex hook command must be exactly: node x',
      'CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.',
      'MCP tavily present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
    ]);
    expect(groups.map(g => [g.group, g.errors.length])).toEqual([['instructions', 1], ['alias', 1], ['wrappers', 1], ['hooks', 1], ['mcp', 2]]);
    expect(groups.map(g => g.label)).toEqual(COMPATIBILITY_GROUP_ORDER.map(g => COMPATIBILITY_GROUP_LABEL[g]));
    expect(groupCompatibilityErrors([])).toEqual([]);
  });

  test('the alias line reads the same whatever the verdict, and says deferred when the marker is set', () => {
    const alias = { path: '/repo/.claude/skills', target: '../.agents/skills', type: 'symlink' as const };
    expect(describeAliasStatus({ ...alias, status: 'deferred' })).toContain('deferred until the migration commit');
    expect(describeAliasStatus({ ...alias, status: 'created' })).toBe('Claude skills alias created: /repo/.claude/skills -> ../.agents/skills (symlink)');
    expect(describeAliasStatus({ ...alias, status: 'valid' })).toContain('OK');
    expect(describeAliasStatus({ ...alias, status: 'missing' })).toContain('bun run agents:compat');
    expect(describeAliasStatus({ ...alias, status: 'invalid' })).toContain('not the generated symlink');
  });
});
