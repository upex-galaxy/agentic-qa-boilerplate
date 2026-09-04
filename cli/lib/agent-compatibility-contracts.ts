/**
 * @fileoverview Hook and MCP contracts shared by the three harnesses.
 *
 * The personality hook has ONE emitter (`.agents/hooks/personality-reinject.mjs`)
 * and three adapters (`.claude/settings.json`, `.codex/hooks.json`,
 * `.opencode/plugins/personality-reinject.js`). The MCP inventory has ONE
 * meaning and three spellings (`.mcp.json`, `opencode.jsonc`,
 * `.codex/config.toml`). This module pins both contracts so a drift in any of
 * the six files fails `bun run agents:compat:check` instead of surfacing as a
 * harness that silently lost a server or a hook.
 *
 * The MCP server SET is project-declared: whatever `.mcp.json` lists is what
 * the other two hosts must list (see PARITY RULE). Only the per-host SHAPE of
 * the six servers this boilerplate ships is pinned here (`KNOWN_MCP_IDS`), so
 * a downstream project that drops `postman` or adds `supabase` still passes.
 *
 * Import-closed: only Node builtins and `cli/lib` siblings (see the header of
 * `agent-compatibility.ts` for why `cli/` must never import a sibling
 * top-level directory).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Servers whose per-host shape this boilerplate pins (`EXPECTED_MCP`). The
 * strict shape check applies to one of these ONLY when the project's
 * `.mcp.json` declares it; the project may declare any other server, which
 * then gets the generic cross-host check alone.
 */
export const KNOWN_MCP_IDS = [
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

export type KnownMcpId = (typeof KNOWN_MCP_IDS)[number];
export type McpHost = 'claude' | 'opencode' | 'codex';
type Transport = 'stdio' | 'http';

/**
 * One MCP server, host-agnostic.
 *
 * `dependsOn` is the set of `.env` variable NAMES the server needs at launch,
 * regardless of how the host spells the reference: `${VAR}` in `.mcp.json`
 * (args, env values or HTTP headers), `{env:VAR}` in `opencode.jsonc`,
 * `env_vars = [...]` / `bearer_token_env_var` / `env_http_headers` in
 * `.codex/config.toml`. A renamed key does not count as a new dependency:
 * `SPEC = "${OPENAPI_SPEC_PATH}"` depends on `OPENAPI_SPEC_PATH`, the same
 * variable Codex forwards by name.
 *
 * `literalEnv` holds the env entries whose value is a plain string (no
 * placeholder), i.e. settings such as `LOG_LEVEL = "error"`. Those must match
 * across hosts too, otherwise one harness runs the server in a different mode.
 */
export interface NormalizedMcpServer {
  transport: Transport
  command?: string
  args?: string[]
  url?: string
  dependsOn: string[]
  literalEnv: Record<string, string>
  enabled: boolean
}

type NormalizedMcpConfig = Record<string, NormalizedMcpServer>;

interface JsonObject {
  [key: string]: unknown
}

/**
 * PARITY RULE. The canonical server set is whatever the project's `.mcp.json`
 * declares. `opencode.jsonc` and `.codex/config.toml` must declare exactly that
 * set (a server missing from one host, or present in one host only, is an
 * error naming the server and the host), and for every declared server the
 * three hosts must agree on `dependsOn` and `literalEnv` (what the server needs
 * from `.env`, what it is told to do). That generic check applies to every
 * server, known to this boilerplate or not.
 *
 * `transport`, `command` and `args` are NOT compared generically, because Codex
 * cannot expand `${VAR}` inside `args` and a host may legitimately reach the
 * same server another way. For the six servers this boilerplate ships they
 * are pinned per host in `EXPECTED_MCP` instead, and that strict shape check
 * runs only when the project declares the server. Today the six share one
 * shape on every host (the two HTTP servers carry the key as a bearer token
 * on every host, so Codex needs no adaptation), but the table is keyed per
 * host so a Codex-specific shape can diverge later without touching the
 * generic check.
 *
 * Whatever the spelling, the `.env` names each server depends on are identical
 * across the three hosts. That is what the cross-host check enforces.
 */
function ref(name: string): string {
  return `\${${name}}`;
}

/**
 * Canonical field order + sorted collections, so two servers compare equal
 * through `JSON.stringify` whenever they mean the same thing.
 */
function canonical(shape: Pick<NormalizedMcpServer, 'transport'> & Partial<NormalizedMcpServer>): NormalizedMcpServer {
  const literalEnv: Record<string, string> = {};
  for (const key of Object.keys(shape.literalEnv ?? {}).sort()) {
    literalEnv[key] = (shape.literalEnv ?? {})[key];
  }
  return {
    transport: shape.transport,
    command: shape.command,
    args: shape.args,
    url: shape.url,
    dependsOn: [...new Set(shape.dependsOn ?? [])].sort(),
    literalEnv,
    enabled: shape.enabled ?? true,
  };
}

const server = canonical;

const EVERY_HOST: Record<KnownMcpId, NormalizedMcpServer> = {
  context7: server({ transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp@4.0.3'] }),
  tavily: server({
    transport: 'http',
    url: 'https://mcp.tavily.com/mcp/',
    dependsOn: ['TAVILY_API_KEY'],
  }),
  playwright: server({
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
  }),
  dbhub: server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@bytebase/dbhub@1.2.1', '--config', 'dbhub.toml'],
  }),
  openapi: server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
    dependsOn: ['API_BASE_URL', 'OPENAPI_SPEC_PATH'],
  }),
  postman: server({
    transport: 'http',
    url: 'https://mcp.postman.com/mcp',
    dependsOn: ['POSTMAN_API_KEY'],
  }),
};

export const EXPECTED_MCP: Record<McpHost, Record<KnownMcpId, NormalizedMcpServer>> = {
  claude: EVERY_HOST,
  opencode: EVERY_HOST,
  codex: EVERY_HOST,
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

/**
 * Strips a trailing comma before `}` / `]` (outside strings) so the JSONC that
 * Prettier writes for `opencode.jsonc` parses with `JSON.parse`.
 */
function stripTrailingCommas(source: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const current = source[index];
    if (inString) {
      result += current;
      if (escaped) { escaped = false; }
      else if (current === '\\') { escaped = true; }
      else if (current === '"') { inString = false; }
      continue;
    }
    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }
    if (current === ',') {
      const rest = source.slice(index + 1);
      const closer = /^\s*[}\]]/.test(rest);
      if (closer) { continue; }
    }
    result += current;
  }
  return result;
}

const PLACEHOLDER = /\$\{([A-Z][A-Z0-9_]*)\}|\{env:([A-Z][A-Z0-9_]*)\}/g;

/** OpenCode spells a placeholder `{env:VAR}`; compare it as `${VAR}`. */
function canonicalPlaceholders(text: string): string {
  return text.replace(/\{env:([A-Z][A-Z0-9_]*)\}/g, (_match, name: string) => ref(name));
}

/** Every `${VAR}` / `{env:VAR}` referenced anywhere inside `value`. */
function placeholderNames(value: unknown): string[] {
  const names = new Set<string>();
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      for (const match of entry.matchAll(PLACEHOLDER)) {
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
  return [...names];
}

/** Env entries whose value carries no placeholder, sorted by key. */
function literalEntries(env: JsonObject | undefined, label: string): Record<string, string> {
  if (!env) { return {}; }
  const literal: Record<string, string> = {};
  for (const key of Object.keys(env).sort()) {
    const value = stringValue(env[key], `${label}.${key}`);
    if (placeholderNames(value).length === 0) {
      literal[key] = value;
    }
  }
  return literal;
}

function sorted(names: Iterable<string>): string[] {
  return [...new Set(names)].sort();
}

function normalizeClaude(root: JsonObject): NormalizedMcpConfig {
  const servers = object(root.mcpServers, '.mcp.json mcpServers');
  return Object.fromEntries(Object.entries(servers).map(([id, raw]) => {
    const label = `.mcp.json ${id}`;
    const server = object(raw, label);
    const transport: Transport = server.type === 'http' || typeof server.url === 'string' ? 'http' : 'stdio';
    const env = server.env === undefined ? undefined : object(server.env, `${label}.env`);
    return [id, {
      transport,
      command: transport === 'stdio' ? stringValue(server.command, `${label}.command`) : undefined,
      args: transport === 'stdio' ? stringArray(server.args ?? [], `${label}.args`) : undefined,
      url: transport === 'http' ? stringValue(server.url, `${label}.url`) : undefined,
      // `${VAR}` anywhere in the server (args, env, HTTP headers) is a dependency.
      dependsOn: sorted(placeholderNames(server)),
      literalEnv: literalEntries(env, `${label}.env`),
      enabled: server.enabled !== false,
    }];
  }));
}

function normalizeOpenCode(root: JsonObject): NormalizedMcpConfig {
  const servers = object(root.mcp, 'opencode.jsonc mcp');
  return Object.fromEntries(Object.entries(servers).map(([id, raw]) => {
    const label = `opencode.jsonc ${id}`;
    const server = object(raw, label);
    const transport: Transport = server.type === 'remote' ? 'http' : 'stdio';
    const command = transport === 'stdio'
      ? stringArray(server.command, `${label}.command`)
      : [];
    const environment = server.environment === undefined
      ? undefined
      : object(server.environment, `${label}.environment`);
    return [id, {
      transport,
      command: command[0],
      args: transport === 'stdio' ? command.slice(1).map(canonicalPlaceholders) : undefined,
      url: transport === 'http' ? canonicalPlaceholders(stringValue(server.url, `${label}.url`)) : undefined,
      // OpenCode spells the placeholder `{env:VAR}` and, like Claude, expands it
      // in `command`, `environment` and `headers`.
      dependsOn: sorted(placeholderNames(server)),
      literalEnv: literalEntries(environment, `${label}.environment`),
      enabled: server.enabled !== false,
    }];
  }));
}

function normalizeCodex(root: JsonObject): NormalizedMcpConfig {
  const servers = object(root.mcp_servers, '.codex/config.toml mcp_servers');
  return Object.fromEntries(Object.entries(servers).map(([id, raw]) => {
    const label = `.codex/config.toml ${id}`;
    const server = object(raw, label);
    const transport: Transport = typeof server.url === 'string' ? 'http' : 'stdio';

    // Codex never expands placeholders: `env` is a table of LITERAL values,
    // `env_vars` forwards host variables BY NAME (plain strings or
    // `{ name, source }` objects), `bearer_token_env_var` names the variable
    // holding the token, `env_http_headers` maps header -> variable name.
    const dependsOn: string[] = [];
    if (Array.isArray(server.env_vars)) {
      for (const entry of server.env_vars) {
        dependsOn.push(typeof entry === 'string'
          ? entry
          : stringValue(object(entry, `${label}.env_vars entry`).name, `${label}.env_vars name`));
      }
    }
    if (typeof server.bearer_token_env_var === 'string') {
      dependsOn.push(server.bearer_token_env_var);
    }
    if (server.env_http_headers !== undefined) {
      const headers = object(server.env_http_headers, `${label}.env_http_headers`);
      for (const header of Object.keys(headers)) {
        dependsOn.push(stringValue(headers[header], `${label}.env_http_headers.${header}`));
      }
    }
    const env = server.env === undefined ? undefined : object(server.env, `${label}.env`);
    const leaked = placeholderNames(env);
    if (leaked.length > 0) {
      throw new Error(`${label}.env cannot reference ${leaked.join(', ')}: Codex does not expand placeholders. Forward the variable through env_vars instead.`);
    }

    return [id, {
      transport,
      command: transport === 'stdio' ? stringValue(server.command, `${label}.command`) : undefined,
      args: transport === 'stdio' ? stringArray(server.args ?? [], `${label}.args`) : undefined,
      url: transport === 'http' ? stringValue(server.url, `${label}.url`) : undefined,
      dependsOn: sorted(dependsOn),
      literalEnv: literalEntries(env, `${label}.env`),
      enabled: server.enabled !== false,
    }];
  }));
}

function parseJson(path: string): JsonObject {
  return object(JSON.parse(readFileSync(path, 'utf8')), path);
}

function parseJsonc(path: string): JsonObject {
  return object(JSON.parse(stripTrailingCommas(stripJsonComments(readFileSync(path, 'utf8')))), path);
}

function parseToml(path: string): JsonObject {
  return object(Bun.TOML.parse(readFileSync(path, 'utf8')), path);
}

function sameServer(actual: NormalizedMcpServer, expected: NormalizedMcpServer): boolean {
  return JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected));
}

function describeServer(server: NormalizedMcpServer): string {
  return JSON.stringify(canonical(server));
}

function describeContract(server: NormalizedMcpServer): string {
  return JSON.stringify({ dependsOn: server.dependsOn, literalEnv: server.literalEnv });
}

const MCP_CONFIG_FILE: Record<McpHost, string> = {
  claude: '.mcp.json',
  opencode: 'opencode.jsonc',
  codex: '.codex/config.toml',
};

function isKnownMcpId(id: string): id is KnownMcpId {
  return (KNOWN_MCP_IDS as readonly string[]).includes(id);
}

/**
 * The project's canonical MCP server set: the `mcpServers` keys of `.mcp.json`,
 * sorted. Throws when the file is missing or malformed; `validateMcpParity`
 * reports that same failure as an error string.
 */
export function declaredMcpIds(root = process.cwd()): string[] {
  const servers = object(parseJson(join(resolve(root), '.mcp.json')).mcpServers, '.mcp.json mcpServers');
  return Object.keys(servers).sort();
}

export function validateMcpParity(root = process.cwd()): string[] {
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  let configs: Record<McpHost, NormalizedMcpConfig>;
  try {
    configs = {
      claude: normalizeClaude(parseJson(join(resolvedRoot, MCP_CONFIG_FILE.claude))),
      opencode: normalizeOpenCode(parseJsonc(join(resolvedRoot, MCP_CONFIG_FILE.opencode))),
      codex: normalizeCodex(parseToml(join(resolvedRoot, MCP_CONFIG_FILE.codex))),
    };
  }
  catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  // The declaring host defines the set; the other two must match it exactly.
  const declared = Object.keys(configs.claude).sort();
  const adapters: McpHost[] = ['opencode', 'codex'];
  for (const host of adapters) {
    const actual = new Set(Object.keys(configs[host]));
    for (const id of declared) {
      if (!actual.has(id)) {
        errors.push(`MCP ${id} missing from ${host}: declared in ${MCP_CONFIG_FILE.claude}, absent from ${MCP_CONFIG_FILE[host]}`);
      }
    }
    for (const id of [...actual].sort()) {
      if (!declared.includes(id)) {
        errors.push(`MCP ${id} present in ${host} only: declare it in ${MCP_CONFIG_FILE.claude} or remove it from ${MCP_CONFIG_FILE[host]}`);
      }
    }
  }

  // Strict per-host shape, only for the servers this boilerplate knows AND the
  // project declares (see PARITY RULE).
  for (const [host, config] of Object.entries(configs) as Array<[McpHost, NormalizedMcpConfig]>) {
    for (const id of declared) {
      const actual = config[id];
      if (!actual || !isKnownMcpId(id)) { continue; }
      const expected = EXPECTED_MCP[host][id];
      if (!sameServer(actual, expected)) {
        errors.push(`${host} MCP ${id} mismatch: expected ${describeServer(expected)}, found ${describeServer(actual)}`);
      }
    }
  }

  // Cross-host contract for EVERY declared server: same `.env` dependencies and
  // same literal settings, whatever the transport or command each host uses.
  for (const id of declared) {
    const baseline = describeContract(configs.claude[id]);
    for (const host of adapters) {
      const server = configs[host][id];
      if (!server) { continue; }
      const contract = describeContract(server);
      if (contract !== baseline) {
        errors.push(`MCP ${id} env contract differs between claude and ${host}: ${baseline} vs ${contract}`);
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
