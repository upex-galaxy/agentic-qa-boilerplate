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
 * the servers this boilerplate ships is pinned here (`KNOWN_MCP_IDS`), so a
 * downstream project that keeps a server upstream dropped, or adds `supabase`,
 * still passes. Remote servers whose only project-side content was an API key
 * (web search, Postman) left the shipped set with ADR-0005: they run at
 * harness level and skills resolve them by capability. A project that still
 * declares one gets the generic cross-host check, nothing stricter.
 *
 * Import-closed: only Node builtins and `cli/lib` siblings (see the header of
 * `agent-compatibility.ts` for why `cli/` must never import a sibling
 * top-level directory).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { isSchemaOwner } from './agents-schema.ts';

/**
 * Servers whose per-host shape this boilerplate pins (`EXPECTED_MCP`). The
 * strict shape check applies to one of these ONLY when the project's
 * `.mcp.json` declares it; the project may declare any other server, which
 * then gets the generic cross-host check alone.
 */
export const KNOWN_MCP_IDS = [
  'context7',
  'slack-aurora',
  'dbhub',
  'openapi',
] as const;

/**
 * The emitter carries four payloads per prompt (output contract, forensic
 * identity line, conditional Orca line, at most one setup warning), so the
 * contract pins the exports the three adapters rely on plus the markers a
 * consumer greps for. A drift here is a harness that silently lost its
 * identity line: `git-flow-master` would then write `Session: unknown` into
 * every commit trailer instead of failing.
 */
export const HOOK_IDENTITY_EXPORTS = [
  'resolveAgentIdentity',
  'agentContextLines',
  'orcaAvailable',
] as const;

export const HOOK_IDENTITY_MARKER = 'AGENT IDENTITY:';
export const HOOK_ORCA_MARKER = 'ORCA: available.';

export const CLAUDE_HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject.mjs"';
export const CODEX_HOOK_COMMAND = 'root="$(git rev-parse --show-toplevel)" && node "$root/.agents/hooks/personality-reinject.mjs"';
export const CODEX_HOOK_COMMAND_WINDOWS = 'powershell.exe -NoProfile -Command "$root = git rev-parse --show-toplevel; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node (Join-Path $root \'.agents/hooks/personality-reinject.mjs\')"';

/**
 * The `.env` loader every Codex stdio server launches through.
 *
 * Codex forwards `env_vars` BY NAME from its own process environment. A
 * terminal launch through `bun run codex` has them; Codex Desktop, opened from
 * Finder or the Dock, has none, so every server started with empty variables
 * and the OpenAPI server exited before the MCP handshake. The loader reads
 * `.env` from the launch directory (the project root, the same one
 * `--config dbhub.toml` already resolves against) and then starts the real
 * server, so the values arrive however Codex was opened.
 *
 * `-p dotenv-cli@<pin>` names the package explicitly: a bare `bunx dotenv`
 * resolves to the `dotenv` LIBRARY when `node_modules` is absent and prints its
 * usage instead of running anything. The pin tracks the `dotenv-cli`
 * devDependency, so the cache already holds it after `bun install`. `-o` makes
 * `.env` win over an inherited value, exactly as the `bun run codex` wrapper
 * does. Measured: ADR-0006.
 */
export const CODEX_ENV_LOADER_COMMAND = 'bunx';
export const CODEX_ENV_LOADER_ARGS = ['-p', 'dotenv-cli@8.0.0', 'dotenv', '-o', '-e', '.env', '--'] as const;

/**
 * Splits a Codex `command` + `args` into the server it actually starts. A
 * server launched through `CODEX_ENV_LOADER_*` reads as the inner command with
 * `envLoader: true`; anything else is returned as-is.
 */
export function unwrapCodexEnvLoader(command: string, args: readonly string[]): { command: string, args: string[], envLoader: boolean } {
  const prefix = CODEX_ENV_LOADER_ARGS;
  const wrapped = command === CODEX_ENV_LOADER_COMMAND
    && args.length > prefix.length
    && prefix.every((entry, index) => args[index] === entry);
  if (!wrapped) { return { command, args: [...args], envLoader: false }; }
  return { command: args[prefix.length], args: args.slice(prefix.length + 1), envLoader: true };
}

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
  /** Codex only: the server starts through `CODEX_ENV_LOADER_*`. */
  envLoader?: boolean
  /** Codex only: `startup_timeout_sec`; absent means Codex's default. */
  startupTimeoutSec?: number
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
 * same server another way. For the servers this boilerplate ships
 * (`KNOWN_MCP_IDS`) they are pinned per host in `EXPECTED_MCP` instead, and
 * that strict shape check runs only when the project declares the server.
 * Today they share one shape on every host, but the table is keyed per host
 * so a Codex-specific shape can diverge later without touching the generic
 * check.
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
    envLoader: shape.envLoader ?? false,
    startupTimeoutSec: shape.startupTimeoutSec,
  };
}

const server = canonical;

const EVERY_HOST: Record<KnownMcpId, NormalizedMcpServer> = {
  'context7': server({ transport: 'stdio', command: 'bunx', args: ['-y', '@upstash/context7-mcp@4.0.3'] }),
  'slack-aurora': server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio'],
    // The server reads these two names itself, so every host forwards them by
    // name and `.env` is the only place they live: the reaction allowlist is a
    // list of workspace channel ids, never a committed value.
    dependsOn: ['SLACK_MCP_XOXP_TOKEN', 'SLACK_MCP_REACTION_TOOL'],
    literalEnv: { SLACK_MCP_ADD_MESSAGE_TOOL: 'true' },
  }),
  'dbhub': server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@bytebase/dbhub@1.2.1', '--config', 'dbhub.toml'],
    // `dbhub.toml` interpolates these from the environment the server is
    // LAUNCHED with, which is why they are declared at the MCP layer on all
    // three hosts rather than left to process inheritance: Codex forwards only
    // what it is told to, and dbhub substitutes the literal `${DBHUB_HOST}`
    // when a variable is absent instead of failing at startup.
    dependsOn: ['DBHUB_DATABASE', 'DBHUB_HOST', 'DBHUB_PASSWORD', 'DBHUB_PORT', 'DBHUB_TYPE', 'DBHUB_USER'],
  }),
  'openapi': server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
    dependsOn: ['API_BASE_URL', 'OPENAPI_SPEC_PATH'],
  }),
};

/**
 * Codex starts the same servers, each through the `.env` loader and with a
 * 30-second startup budget. Codex's default is 10 seconds, and every shipped
 * server is fetched by `bunx` on first use: a cold cache plus the loader hop
 * can pass 10 seconds where a warm dbhub already took most of it (ADR-0006).
 */
export const CODEX_STARTUP_TIMEOUT_SEC = 30;
const CODEX_SHAPE = Object.fromEntries(
  Object.entries(EVERY_HOST).map(([id, shape]) => [id, canonical({ ...shape, envLoader: true, startupTimeoutSec: CODEX_STARTUP_TIMEOUT_SEC })]),
) as Record<KnownMcpId, NormalizedMcpServer>;

export const EXPECTED_MCP: Record<McpHost, Record<KnownMcpId, NormalizedMcpServer>> = {
  claude: EVERY_HOST,
  opencode: EVERY_HOST,
  codex: CODEX_SHAPE,
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

/**
 * OpenCode's `{file:<path>/<VAR>}` form, which substitutes a FILE'S CONTENTS.
 *
 * It belongs here because it is a DEPENDENCY, not a literal.
 * `{file:.auth/opencode/DBHUB_HOST}` says the server needs DBHUB_HOST
 * exactly as `{env:DBHUB_HOST}` does; only the delivery route differs, and
 * `scripts/harness-env.ts` generates those files from `.env`. This checker exists
 * to assert SEMANTIC parity across the three hosts, so reading the file form as
 * an opaque literal reported the hosts as disagreeing when they agree. Teaching
 * the normalizer this form is not loosening the contract, it is correcting a
 * blind spot the contract always had, which only surfaced once something finally
 * used the other route.
 *
 * WHAT KEEPS IT SAFE, and do not widen it: only an ALL-CAPS final path segment
 * matches. A generic `{file:some/config.json}` or `{file:certs/ca.pem}` still
 * reads as a literal, which is correct — those are files, not credentials named
 * after a variable. Widening this pattern would start swallowing real literals.
 */
const FILE_REF = /\{file:(?:[^}]*\/)?([A-Z][A-Z0-9_]*)\}/g;

const PLACEHOLDER = /\$\{([A-Z][A-Z0-9_]*)\}|\{env:([A-Z][A-Z0-9_]*)\}|\{file:(?:[^}]*\/)?([A-Z][A-Z0-9_]*)\}/g;

/** OpenCode spells a placeholder `{env:VAR}` or `{file:dir/VAR}`; compare both as `${VAR}`. */
function canonicalPlaceholders(text: string): string {
  return text
    .replace(/\{env:([A-Z][A-Z0-9_]*)\}/g, (_match, name: string) => ref(name))
    .replace(FILE_REF, (_match, name: string) => ref(name));
}

/** Every `${VAR}` / `{env:VAR}` / `{file:dir/VAR}` referenced anywhere inside `value`. */
function placeholderNames(value: unknown): string[] {
  const names = new Set<string>();
  const visit = (entry: unknown): void => {
    if (typeof entry === 'string') {
      for (const match of entry.matchAll(PLACEHOLDER)) {
        const name = match[1] ?? match[2] ?? match[3];
        if (name !== undefined) { names.add(name); }
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

    // The loader is a launch detail, not a different server: compare what it
    // starts, and record that it is there.
    const launch = transport === 'stdio'
      ? unwrapCodexEnvLoader(stringValue(server.command, `${label}.command`), stringArray(server.args ?? [], `${label}.args`))
      : undefined;
    return [id, {
      transport,
      command: launch?.command,
      args: launch?.args,
      url: transport === 'http' ? stringValue(server.url, `${label}.url`) : undefined,
      dependsOn: sorted(dependsOn),
      literalEnv: literalEntries(env, `${label}.env`),
      enabled: server.enabled !== false,
      envLoader: launch?.envLoader ?? false,
      startupTimeoutSec: typeof server.startup_timeout_sec === 'number' ? server.startup_timeout_sec : undefined,
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

/** What `validateMcpParityFindings` returns: errors fail the check, warnings are printed and never fail it. */
export interface McpParityFindings {
  errors: string[]
  warnings: string[]
}

export interface McpParityOptions {
  /**
   * True in the boilerplate itself (`isSchemaOwner`). There a Codex launch
   * gap (no `.env` loader, no startup budget) is an ERROR: the boilerplate
   * ships the fix, so its own copy must carry it. Downstream it is a WARNING
   * that names the file and what to add: `.codex/config.toml` is
   * bootstrap-only, so a project scaffolded before the loader existed cannot
   * receive it from a sync, and a red gate it cannot clear by syncing is how a
   * team learns `--no-verify`. Defaults to reading `<root>/package.json`.
   */
  schemaOwner?: boolean
}

function readSchemaOwner(root: string): boolean {
  const packageJson = join(root, 'package.json');
  return existsSync(packageJson) && isSchemaOwner(readFileSync(packageJson, 'utf8'));
}

const LOADER_REASON = 'a Codex Desktop launch has no process environment, so env_vars alone forwards nothing';

function loaderFix(): string {
  return `set command = "${CODEX_ENV_LOADER_COMMAND}" and put ${JSON.stringify(CODEX_ENV_LOADER_ARGS)} before the current command and args`;
}

/**
 * What a known server's Codex entry lacks when the ONLY difference from the
 * pinned shape is a launch detail (the loader, the startup budget), or null
 * when anything else differs too. Both details change how Codex starts the
 * server, never which server it starts.
 */
function codexLaunchGaps(actual: NormalizedMcpServer, expected: NormalizedMcpServer): string[] | null {
  if (!sameServer({ ...actual, envLoader: expected.envLoader, startupTimeoutSec: expected.startupTimeoutSec }, expected)) { return null; }
  const gaps: string[] = [];
  if ((actual.envLoader ?? false) !== (expected.envLoader ?? false)) { gaps.push(`${loaderFix()} (${LOADER_REASON})`); }
  if (actual.startupTimeoutSec !== expected.startupTimeoutSec) {
    gaps.push(expected.startupTimeoutSec === undefined
      ? 'remove startup_timeout_sec'
      : `set startup_timeout_sec = ${expected.startupTimeoutSec} (Codex's 10-second default is too short for a bunx-fetched server on a cold cache)`);
  }
  return gaps;
}

export function validateMcpParity(root = process.cwd(), options: McpParityOptions = {}): string[] {
  return validateMcpParityFindings(root, options).errors;
}

export function validateMcpParityFindings(root = process.cwd(), options: McpParityOptions = {}): McpParityFindings {
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  const warnings: string[] = [];
  const schemaOwner = options.schemaOwner ?? readSchemaOwner(resolvedRoot);
  let configs: Record<McpHost, NormalizedMcpConfig>;
  try {
    configs = {
      claude: normalizeClaude(parseJson(join(resolvedRoot, MCP_CONFIG_FILE.claude))),
      opencode: normalizeOpenCode(parseJsonc(join(resolvedRoot, MCP_CONFIG_FILE.opencode))),
      codex: normalizeCodex(parseToml(join(resolvedRoot, MCP_CONFIG_FILE.codex))),
    };
  }
  catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], warnings };
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
  // project declares (see PARITY RULE). Downstream, a Codex entry that differs
  // ONLY in a launch detail is a warning (see `McpParityOptions`).
  const launchWarned = new Set<string>();
  for (const [host, config] of Object.entries(configs) as Array<[McpHost, NormalizedMcpConfig]>) {
    for (const id of declared) {
      const actual = config[id];
      if (!actual || !isKnownMcpId(id)) { continue; }
      const expected = EXPECTED_MCP[host][id];
      if (sameServer(actual, expected)) { continue; }
      const gaps = host === 'codex' && !schemaOwner ? codexLaunchGaps(actual, expected) : null;
      if (gaps !== null) {
        warnings.push(`codex MCP ${id} launch is out of date in ${MCP_CONFIG_FILE.codex}: ${gaps.join('; ')}. Upstream never overwrites this file, so add it by hand.`);
        launchWarned.add(id);
        continue;
      }
      errors.push(`${host} MCP ${id} mismatch: expected ${describeServer(expected)}, found ${describeServer(actual)}`);
    }
  }

  // Codex: a stdio server that needs `.env` values must start through the
  // loader, known to this boilerplate or not. `env_vars` alone forwards
  // nothing when Codex Desktop was opened from the Dock.
  for (const id of declared) {
    const server = configs.codex[id];
    if (!server || server.transport !== 'stdio' || server.dependsOn.length === 0 || server.envLoader === true) { continue; }
    if (schemaOwner) {
      errors.push(`codex MCP ${id} must launch through the .env loader (command = "${CODEX_ENV_LOADER_COMMAND}", args starting ${JSON.stringify(CODEX_ENV_LOADER_ARGS)}): ${LOADER_REASON}.`);
    }
    else if (!launchWarned.has(id)) {
      warnings.push(`codex MCP ${id} starts without the .env loader in ${MCP_CONFIG_FILE.codex}: ${loaderFix()} (${LOADER_REASON}).`);
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

  return { errors, warnings };
}

function personalAbsolutePath(command: string): boolean {
  return /(?:^|[\s"'])(?:\/Users\/|\/home\/|[A-Za-z]:[\\/]Users[\\/])/.test(command);
}

/**
 * The repository-relative script a hook command executes, or null when the
 * command names none.
 *
 * Every adapter reaches the emitter through a root placeholder — `$CLAUDE_PROJECT_DIR`
 * for Claude, `$root` for both Codex forms — so whatever follows that placeholder IS
 * the repository-relative path, wherever the emitter happens to live. Deriving it
 * rather than hardcoding `.agents/hooks/` is the point: a rename of the emitter is
 * exactly what this is here to catch.
 */
export function hookScriptPath(command: string): string | null {
  const match = /(?:\$CLAUDE_PROJECT_DIR\/|\$root\/|\$root\s+')([^"')]+\.m?js)/.exec(command);
  return match === null ? null : match[1];
}

/**
 * The OpenCode adapter must load on BOTH plugin generations, because the repo
 * cannot pin which OpenCode a teammate runs.
 *
 * OpenCode 2 reads ONE default export `{ id, setup(ctx) }` and refuses
 * anything else ("Plugin must export a default definition with an id and an
 * effect or setup function"); the context lines then go through
 * `ctx.session.hook('context', ...)`. OpenCode 1 (1.18.29 and newer) calls
 * `server()` on that same object and expects the
 * `experimental.chat.system.transform` hook back. The V1-only shape this file
 * used to have passed every check above while OpenCode 2 refused to load it,
 * so the check now names each entrypoint. Text-level on purpose, like the
 * rest of this contract: importing the adapter would execute it.
 */
export function validateOpenCodePluginEntrypoints(plugin: string): string[] {
  const errors: string[] = [];
  if (!/^export default\b/m.test(plugin)) {
    errors.push('OpenCode personality adapter must default-export one plugin definition: OpenCode 2 loads nothing else.');
  }
  if (!/^\s*id:\s*['"][^'"]+['"]/m.test(plugin)) {
    errors.push('OpenCode personality adapter must declare a stable id: OpenCode 2 refuses a definition without one.');
  }
  if (!/\bsetup\s*\(/.test(plugin) || !/ctx\.session\.hook\(\s*['"]context['"]/.test(plugin)) {
    errors.push('OpenCode personality adapter must register the OpenCode 2 entrypoint: setup(ctx) with ctx.session.hook(\'context\', ...).');
  }
  if (!/\bserver\s*\(/.test(plugin) || !plugin.includes('experimental.chat.system.transform')) {
    errors.push('OpenCode personality adapter must keep the OpenCode 1 entrypoint: server() returning experimental.chat.system.transform.');
  }
  return errors;
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
      // `.claude/settings.json` and `.codex/hooks.json` are bootstrap-only: the
      // updater ships them once and never overwrites them, so an upstream rename
      // of the emitter leaves a downstream project pointing at a file that no
      // longer exists. The hook is what injects the `AGENT IDENTITY:` line that
      // git-flow-master copies into the mandatory commit trailers, so that
      // failure is silent trailer loss rather than an error. Resolve the path
      // the adapter actually carries, not the one the constant above pins.
      const script = hookScriptPath(command);
      if (script === null) {
        errors.push(`${host} hook command does not name a repository-relative hook script.`);
      }
      else if (!existsSync(join(resolvedRoot, script))) {
        errors.push(`${host} hook command points at a file that does not exist: ${script}`);
      }
    }

    const shared = readFileSync(join(resolvedRoot, '.agents', 'hooks', 'personality-reinject.mjs'), 'utf8');
    const plugin = readFileSync(join(resolvedRoot, '.opencode', 'plugins', 'personality-reinject.js'), 'utf8');
    if (!shared.includes('AGENTS.md') || shared.includes('CLAUDE.md')) {
      errors.push('Shared personality hook must reference AGENTS.md and must not treat CLAUDE.md as canonical.');
    }
    for (const name of HOOK_IDENTITY_EXPORTS) {
      if (!shared.includes(`export function ${name}`)) {
        errors.push(`Shared hook emitter must export ${name}(): the identity line has one source.`);
      }
    }
    for (const marker of [HOOK_IDENTITY_MARKER, HOOK_ORCA_MARKER]) {
      if (!shared.includes(marker)) {
        errors.push(`Shared hook emitter must emit the "${marker}" line.`);
      }
    }
    if (!plugin.includes('../../.agents/hooks/personality-reinject.mjs')) {
      errors.push('OpenCode personality adapter must import the shared hook contract.');
    }
    if (!plugin.includes('agentContextLines')) {
      errors.push('OpenCode personality adapter must push the shared context lines (agentContextLines), identity line included.');
    }
    if (plugin.includes('output.system =')) {
      errors.push('OpenCode personality adapter must mutate output.system in place.');
    }
    if (/\bevent\.system\s*=[^=]/.test(plugin)) {
      errors.push('OpenCode personality adapter must mutate event.system in place.');
    }
    errors.push(...validateOpenCodePluginEntrypoints(plugin));
    for (const [label, source] of [['emitter', shared], ['OpenCode adapter', plugin]] as const) {
      if (personalAbsolutePath(source)) {
        errors.push(`Shared hook ${label} contains an absolute personal path.`);
      }
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

/**
 * Every scoped config block `eslint.config.base.js` exports must be wired into
 * `eslint.config.js`.
 *
 * THE HOLE THIS CLOSES. The base is SYNCED, so a new block reaches every
 * project on the next `bun run up`. `eslint.config.js` is on the protected
 * watchlist and is NEVER overwritten, and the wiring — importing the block and
 * passing it to `antfu(...)` — lives only there. So upstream can ship a rule
 * that lands on disk, exports cleanly, and enforces NOTHING, while
 * `lint:check` stays green and the parity report shows at most a
 * non-blocking drift row. Measured on this repo: `CLI_IMPORT_CLOSURE` has
 * carried that hole since it was introduced, and `KATA_IMPORT_ALIASES`
 * inherited it the day it was added.
 *
 * This is a NAME check on purpose. Verifying the blocks actually take effect
 * would mean executing the consumer's flat config, which depends on its
 * plugins resolving — a check that cannot run is worse than a coarse one that
 * does. A project is free to narrow a block's `files` afterwards; it is not
 * free to drop it silently.
 */
export function validateEslintBlockWiring(root = process.cwd()): string[] {
  const basePath = join(root, 'eslint.config.base.js');
  const consumerPath = join(root, 'eslint.config.js');
  if (!existsSync(basePath) || !existsSync(consumerPath)) { return []; }

  let base: string;
  let consumer: string;
  try {
    base = readFileSync(basePath, 'utf8');
    consumer = readFileSync(consumerPath, 'utf8');
  }
  catch { return []; }

  // Scoped blocks are SCREAMING_SNAKE exports; `BASE_ESLINT_OPTIONS` is the
  // options object spread into the first argument, not a block, so it is
  // excluded by name.
  const blocks = [...base.matchAll(/^export const ([A-Z][A-Z0-9_]*)\s*=/gm)]
    .map(m => m[1])
    .filter(name => name !== 'BASE_ESLINT_OPTIONS');

  // Comments are stripped before the search, and the search is word-bounded.
  // Both matter, and the first one was a live hole the moment this check was
  // written: `eslint.config.js`'s own JSDoc says "Extra project-only config
  // blocks go after `CLI_IMPORT_CLOSURE`", so a raw `includes` found that name
  // in prose and passed a consumer that had stopped wiring the block at all.
  // The word boundary closes the second: without it, wiring
  // `CLI_IMPORT_CLOSURE_EXTRA` silently satisfies `CLI_IMPORT_CLOSURE`.
  const code = consumer
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const errors: string[] = [];
  for (const name of blocks) {
    if (!new RegExp(`\\b${name}\\b`).test(code)) {
      errors.push(`eslint.config.js does not wire ${name} from eslint.config.base.js: the rule ships but enforces nothing. Add it to the import and to the antfu(...) call.`);
    }
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
