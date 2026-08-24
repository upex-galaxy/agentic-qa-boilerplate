import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const CANONICAL_MCP_IDS = [
  'context7',
  'tavily',
  'playwright',
  'dbhub',
  'openapi',
  'postman',
] as const;

export const CLAUDE_HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject.mjs"';
export const CODEX_HOOK_COMMAND = 'root="$(git rev-parse --show-toplevel)" && node "$root/.agents/hooks/personality-reinject.mjs"';
export const CODEX_HOOK_COMMAND_WINDOWS = 'powershell.exe -NoProfile -Command "$root = git rev-parse --show-toplevel; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node (Join-Path $root \'.agents/hooks/personality-reinject.mjs\')"';

type McpId = (typeof CANONICAL_MCP_IDS)[number];
type Transport = 'stdio' | 'http';
type Host = 'claude' | 'opencode' | 'codex';

interface NormalizedMcpServer {
  transport: Transport
  command?: string
  args?: string[]
  url?: string
  env: string[]
  enabled: boolean
}

type NormalizedMcpConfig = Record<string, NormalizedMcpServer>;

interface JsonObject {
  [key: string]: unknown
}

const EXPECTED_MCP: Record<McpId, NormalizedMcpServer> = {
  context7: {
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp@4.0.3'],
    env: [],
    enabled: true,
  },
  tavily: {
    transport: 'http',
    url: 'https://mcp.tavily.com/mcp/',
    env: ['TAVILY_API_KEY'],
    enabled: true,
  },
  playwright: {
    transport: 'stdio',
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
    env: [],
    enabled: true,
  },
  dbhub: {
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@bytebase/dbhub@1.2.1', '--config', 'dbhub.toml'],
    env: [],
    enabled: true,
  },
  openapi: {
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
    env: ['API_BASE_URL', 'OPENAPI_SPEC_PATH'],
    enabled: true,
  },
  postman: {
    transport: 'http',
    url: 'https://mcp.postman.com/mcp',
    env: ['POSTMAN_API_KEY'],
    enabled: true,
  },
};

function object(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }
  return value;
}

export function stripJsonComments(source: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index++) {
    const current = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (current === '\n') {
        lineComment = false;
        result += current;
      }
      continue;
    }
    if (blockComment) {
      if (current === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      else if (current === '\n') {
        result += current;
      }
      continue;
    }
    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      }
      else if (current === '\\') {
        escaped = true;
      }
      else if (current === '"') {
        inString = false;
      }
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
    }
    else if (current === '/' && next === '/') {
      lineComment = true;
      index++;
    }
    else if (current === '/' && next === '*') {
      blockComment = true;
      index++;
    }
    else {
      result += current;
    }
  }

  return result;
}

function envNames(value: unknown): string[] {
  const names = new Set<string>();
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      for (const match of entry.matchAll(/\$\{([A-Z][A-Z0-9_]*)\}|\{env:([A-Z][A-Z0-9_]*)\}/g)) {
        names.add(match[1] ?? match[2]);
      }
    }
    else if (Array.isArray(entry)) {
      entry.forEach(visit);
    }
    else if (typeof entry === 'object' && entry !== null) {
      Object.values(entry).forEach(visit);
    }
  };
  visit(value);
  return [...names].sort();
}

function normalizeClaude(root: JsonObject): NormalizedMcpConfig {
  const servers = object(root.mcpServers, '.mcp.json mcpServers');
  return Object.fromEntries(Object.entries(servers).map(([id, raw]) => {
    const server = object(raw, `.mcp.json ${id}`);
    const transport: Transport = server.type === 'http' || typeof server.url === 'string' ? 'http' : 'stdio';
    const explicitEnv = server.env ? Object.keys(object(server.env, `.mcp.json ${id}.env`)) : [];
    return [id, {
      transport,
      command: transport === 'stdio' ? stringValue(server.command, `.mcp.json ${id}.command`) : undefined,
      args: transport === 'stdio' ? stringArray(server.args ?? [], `.mcp.json ${id}.args`) : undefined,
      url: transport === 'http' ? stringValue(server.url, `.mcp.json ${id}.url`) : undefined,
      env: [...new Set([...explicitEnv, ...envNames(server)])].sort(),
      enabled: server.enabled !== false,
    }];
  }));
}

function normalizeOpenCode(root: JsonObject): NormalizedMcpConfig {
  const servers = object(root.mcp, 'opencode.jsonc mcp');
  return Object.fromEntries(Object.entries(servers).map(([id, raw]) => {
    const server = object(raw, `opencode.jsonc ${id}`);
    const transport: Transport = server.type === 'remote' ? 'http' : 'stdio';
    const command = transport === 'stdio'
      ? stringArray(server.command, `opencode.jsonc ${id}.command`)
      : [];
    const explicitEnv = server.environment
      ? Object.keys(object(server.environment, `opencode.jsonc ${id}.environment`))
      : [];
    return [id, {
      transport,
      command: command[0],
      args: transport === 'stdio' ? command.slice(1) : undefined,
      url: transport === 'http' ? stringValue(server.url, `opencode.jsonc ${id}.url`) : undefined,
      env: [...new Set([...explicitEnv, ...envNames(server)])].sort(),
      enabled: server.enabled !== false,
    }];
  }));
}

function normalizeCodex(root: JsonObject): NormalizedMcpConfig {
  const servers = object(root.mcp_servers, '.codex/config.toml mcp_servers');
  return Object.fromEntries(Object.entries(servers).map(([id, raw]) => {
    const server = object(raw, `.codex/config.toml ${id}`);
    const transport: Transport = typeof server.url === 'string' ? 'http' : 'stdio';
    const explicitEnv = Array.isArray(server.env_vars)
      ? server.env_vars.map((entry) => {
          if (typeof entry === 'string') { return entry; }
          return stringValue(object(entry, `${id}.env_vars entry`).name, `${id}.env_vars name`);
        })
      : [];
    if (typeof server.bearer_token_env_var === 'string') {
      explicitEnv.push(server.bearer_token_env_var);
    }
    return [id, {
      transport,
      command: transport === 'stdio' ? stringValue(server.command, `.codex/config.toml ${id}.command`) : undefined,
      args: transport === 'stdio' ? stringArray(server.args ?? [], `.codex/config.toml ${id}.args`) : undefined,
      url: transport === 'http' ? stringValue(server.url, `.codex/config.toml ${id}.url`) : undefined,
      env: [...new Set([...explicitEnv, ...envNames(server.env), ...envNames(server.env_http_headers)])].sort(),
      enabled: server.enabled !== false,
    }];
  }));
}

function parseJson(path: string): JsonObject {
  return object(JSON.parse(readFileSync(path, 'utf8')), path);
}

function parseJsonc(path: string): JsonObject {
  return object(JSON.parse(stripJsonComments(readFileSync(path, 'utf8'))), path);
}

function parseToml(path: string): JsonObject {
  return object(Bun.TOML.parse(readFileSync(path, 'utf8')), path);
}

function sameServer(actual: NormalizedMcpServer, expected: NormalizedMcpServer): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function describeServer(server: NormalizedMcpServer): string {
  return JSON.stringify(server);
}

export function validateMcpParity(root = process.cwd()): string[] {
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  let configs: Record<Host, NormalizedMcpConfig>;
  try {
    configs = {
      claude: normalizeClaude(parseJson(join(resolvedRoot, '.mcp.json'))),
      opencode: normalizeOpenCode(parseJsonc(join(resolvedRoot, 'opencode.jsonc'))),
      codex: normalizeCodex(parseToml(join(resolvedRoot, '.codex', 'config.toml'))),
    };
  }
  catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  for (const [host, config] of Object.entries(configs) as Array<[Host, NormalizedMcpConfig]>) {
    const actualIds = Object.keys(config).sort();
    const expectedIds = [...CANONICAL_MCP_IDS].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      errors.push(`${host} MCP IDs must be exactly: ${CANONICAL_MCP_IDS.join(', ')}; found: ${actualIds.join(', ')}`);
      continue;
    }
    for (const id of CANONICAL_MCP_IDS) {
      const actual = config[id];
      const expected = EXPECTED_MCP[id];
      if (!sameServer(actual, expected)) {
        errors.push(`${host} MCP ${id} mismatch: expected ${describeServer(expected)}, found ${describeServer(actual)}`);
      }
    }
  }

  return errors;
}

function personalAbsolutePath(command: string): boolean {
  return /(?:^|[\s"'])(?:\/Users\/|\/home\/|[A-Za-z]:[\\/]Users[\\/])/.test(command);
}

function readHookCommand(settings: JsonObject, host: 'claude' | 'codex'): JsonObject {
  const hooks = object(settings.hooks, `${host} hooks`);
  const event = hooks.UserPromptSubmit;
  if (!Array.isArray(event) || event.length !== 1) {
    throw new Error(`${host} must define exactly one UserPromptSubmit group.`);
  }
  const group = object(event[0], `${host} UserPromptSubmit group`);
  if (!Array.isArray(group.hooks) || group.hooks.length !== 1) {
    throw new Error(`${host} must define exactly one UserPromptSubmit command.`);
  }
  return object(group.hooks[0], `${host} UserPromptSubmit command`);
}

export function validateHookCompatibility(root = process.cwd()): string[] {
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  const required = [
    '.agents/hooks/personality-reinject.mjs',
    '.opencode/plugins/personality-reinject.js',
    '.claude/settings.json',
    '.codex/hooks.json',
  ];
  for (const path of required) {
    if (!existsSync(join(resolvedRoot, path))) {
      errors.push(`Hook compatibility file missing: ${path}`);
    }
  }
  if (errors.length > 0) { return errors; }

  try {
    const claude = readHookCommand(parseJson(join(resolvedRoot, '.claude', 'settings.json')), 'claude');
    const codex = readHookCommand(parseJson(join(resolvedRoot, '.codex', 'hooks.json')), 'codex');
    const claudeCommand = stringValue(claude.command, 'Claude hook command');
    const codexCommand = stringValue(codex.command, 'Codex hook command');
    const codexWindows = stringValue(codex.commandWindows, 'Codex Windows hook command');

    if (claudeCommand !== CLAUDE_HOOK_COMMAND) {
      errors.push(`Claude hook command must be repository-relative through $CLAUDE_PROJECT_DIR: ${CLAUDE_HOOK_COMMAND}`);
    }
    if (codexCommand !== CODEX_HOOK_COMMAND) {
      errors.push(`Codex hook command must resolve the Git root: ${CODEX_HOOK_COMMAND}`);
    }
    if (codexWindows !== CODEX_HOOK_COMMAND_WINDOWS) {
      errors.push(`Codex Windows hook command must resolve the Git root with Join-Path: ${CODEX_HOOK_COMMAND_WINDOWS}`);
    }
    for (const [host, command] of [['claude', claudeCommand], ['codex', codexCommand], ['codex-windows', codexWindows]] as const) {
      if (personalAbsolutePath(command)) {
        errors.push(`${host} hook command contains an absolute personal path.`);
      }
    }

    const shared = readFileSync(join(resolvedRoot, '.agents', 'hooks', 'personality-reinject.mjs'), 'utf8');
    const plugin = readFileSync(join(resolvedRoot, '.opencode', 'plugins', 'personality-reinject.js'), 'utf8');
    if (!shared.includes('AGENTS.md') || shared.includes('CLAUDE.md')) {
      errors.push('Shared personality hook must reference AGENTS.md and must not treat CLAUDE.md as canonical.');
    }
    if (!plugin.includes('../../.agents/hooks/personality-reinject.mjs')) {
      errors.push('OpenCode personality adapter must import the shared hook contract.');
    }
    if (plugin.includes('output.system =')) {
      errors.push('OpenCode personality adapter must mutate output.system in place.');
    }
    for (const duplicate of ['.claude/hooks/personality-reinject.js', '.codex/hooks/personality-reinject.js']) {
      if (existsSync(join(resolvedRoot, duplicate))) {
        errors.push(`Duplicated personality hook must be removed: ${duplicate}`);
      }
    }
  }
  catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
}

export function compatibilityContractPaths(root = process.cwd()): string[] {
  const resolvedRoot = resolve(root);
  return [
    '.agents/hooks/personality-reinject.mjs',
    '.opencode/plugins/personality-reinject.js',
    '.claude/settings.json',
    '.codex/hooks.json',
    '.mcp.json',
    'opencode.jsonc',
    '.codex/config.toml',
  ].map(path => relative(resolvedRoot, join(resolvedRoot, path)));
}
