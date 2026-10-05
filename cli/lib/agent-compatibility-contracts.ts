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
 * Every contract binds only the harnesses the project uses
 * (`declaredHarnesses`, ADR-0012): a project on one harness deletes the other
 * two's files, and the boilerplate itself always checks all three.
 *
 * Import-closed: only Node builtins and `cli/lib` siblings (see the header of
 * `agent-compatibility.ts` for why `cli/` must never import a sibling
 * top-level directory).
 */

import type { Harness } from './harness-selection.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { isSchemaOwner } from './agents-schema.ts';
import { canonicalMcpHarness, declaredHarnesses } from './harness-selection.ts';

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
 * The emitter carries three payloads per prompt (forensic identity line, conditional Orca line, at most one setup warning), so the
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
 * The `.env` loader every MCP stdio server that needs `.env` values launches
 * through, on all three hosts:
 *
 *   bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter A,B -- <server>
 *
 * WHY A LOADER. A harness spawns its MCP servers from a config file, before any
 * hook runs, with whatever environment the harness process has, and no
 * launch carries the `.env` values: a terminal opens the harness bare (the
 * loader that exported them into the AI's process is retired, ADR-0014), and a
 * GUI launch (Claude Desktop, Codex Desktop, OpenCode desktop) or a natively
 * launched supervised worker has no command line to wrap. The loader reads the varlock schema plus
 * `.env` / `.env.local` (or the secret manager the schema names) from the
 * launch directory, which every host sets to the project root (the same one
 * `--config dbhub.toml` resolves against), so the values arrive however the
 * harness was opened, and no plaintext copy of a credential is written for a
 * harness to read (the retired `harness:env` surfaces, ADR-0011).
 *
 * WHAT EACH FLAG DOES (measured on varlock 1.20.0, ADR-0011):
 *   --filter A,B          injects only these schema items; an INHERITED schema
 *                         key outside the list is stripped from the child, so a
 *                         server never sees another server's credential, and
 *                         validation is scoped to the list (a missing variable
 *                         another server needs does not stop this one).
 *   --inject vars         individual variables only, no `__VARLOCK_ENV` blob.
 *   --no-redact-stdout    the server speaks JSON-RPC on stdio, and varlock
 *                         redacts piped output by default, which rewrites any
 *                         message that carries a sensitive value.
 *   -p varlock@<pin>      names the package and tracks the exact `varlock`
 *                         devDependency, so the cache already holds it after
 *                         `bun install` and no standalone binary is needed.
 *
 * The filter lists exact variable NAMES (no globs, negations or selectors), so
 * it is also the server's declared `.env` dependency set: parity compares it
 * across hosts like any `${VAR}`. A server that launches through the loader
 * must NOT also reference those names through the host (`${VAR}`, `{env:VAR}`,
 * `{file:...}`, `env_vars`): an unset `${VAR}` fails the host's config parse on
 * a desktop launch, and an EMPTY inherited value shadows `.env` and fails
 * validation (measured). A value that fails the schema stops the server that
 * needs it: `bunx varlock load --agent` shows which, redacted.
 */
// LINT.IfChange(mcp-env-loader)
export const MCP_ENV_LOADER_COMMAND = 'bunx';
export const MCP_ENV_LOADER_HEAD = ['-p', 'varlock@1.20.0', 'varlock', 'run', '--no-redact-stdout', '--inject', 'vars', '--filter'] as const;

/** The full loader prefix for a server that needs `names`: head, the comma-joined filter, `--`. */
export function mcpEnvLoaderArgs(names: readonly string[]): string[] {
  return [...MCP_ENV_LOADER_HEAD, names.join(','), '--'];
}
// LINT.ThenChange(.agents/instructions/agent-critical-rules.md, .agents/instructions/agent-harnesses.md, .agents/skills/agentic-qa-core/references/mcp-atlassian-optin.md, docs/core/variables-de-entorno.html)

/**
 * The loader Codex used before the filter existed: every `.env` value, no
 * `--filter`, names forwarded through `env_vars`. Recognized so a downstream
 * `.codex/config.toml` (bootstrap-only, never overwritten by a sync) still
 * parses; parity reports it as out of date.
 */
export const LEGACY_CODEX_ENV_LOADER_ARGS = ['-p', 'varlock@1.20.0', 'varlock', 'run', '--no-redact-stdout', '--'] as const;

const VARIABLE_NAME = /^[A-Z][A-Z0-9_]*$/;

export interface UnwrappedLaunch {
  command: string
  args: string[]
  envLoader: boolean
  /** The `--filter` names, or null when the server is not behind the filtered loader. */
  filter: string[] | null
}

/**
 * Splits `command` + `args` into the server it actually starts. A server
 * launched through the loader reads as the inner command with `envLoader: true`
 * and its filter; the legacy unfiltered Codex loader reads as `envLoader: true`,
 * `filter: null`; anything else is returned as-is. Throws on a filter entry that
 * is not a plain variable name, because a glob cannot be compared across hosts.
 */
export function unwrapEnvLoader(command: string, args: readonly string[]): UnwrappedLaunch {
  if (command !== MCP_ENV_LOADER_COMMAND) { return { command, args: [...args], envLoader: false, filter: null }; }
  const head = MCP_ENV_LOADER_HEAD;
  const filtered = args.length > head.length + 2
    && head.every((entry, index) => args[index] === entry)
    && args[head.length + 1] === '--';
  if (filtered) {
    const filter = args[head.length].split(',').map(name => name.trim()).filter(name => name.length > 0);
    const invalid = filter.filter(name => !VARIABLE_NAME.test(name));
    if (invalid.length > 0) {
      throw new Error(`MCP env loader --filter must list exact variable names (no globs, negations or selectors): ${invalid.join(', ')}`);
    }
    return { command: args[head.length + 2], args: args.slice(head.length + 3), envLoader: true, filter };
  }
  const legacy = LEGACY_CODEX_ENV_LOADER_ARGS;
  const wrapped = args.length > legacy.length && legacy.every((entry, index) => args[index] === entry);
  if (!wrapped) { return { command, args: [...args], envLoader: false, filter: null }; }
  return { command: args[legacy.length], args: args.slice(legacy.length + 1), envLoader: true, filter: null };
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
  /** The server starts through the `.env` loader (`MCP_ENV_LOADER_*`). */
  envLoader?: boolean
  /**
   * Names the HOST delivers (`${VAR}`, `{env:VAR}`, `{file:.../VAR}`,
   * `env_vars`, `bearer_token_env_var`, `env_http_headers`), as opposed to the
   * loader's `--filter`. `dependsOn` is the union of both.
   */
  hostRefs?: string[]
  /** Codex only: `startup_timeout_sec`; absent means Codex's default. */
  startupTimeoutSec?: number
}

export type NormalizedMcpConfig = Record<string, NormalizedMcpServer>;

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
    hostRefs: [...new Set(shape.hostRefs ?? [])].sort(),
    startupTimeoutSec: shape.startupTimeoutSec,
  };
}

const server = canonical;

const EVERY_HOST: Record<KnownMcpId, NormalizedMcpServer> = {
  // No `.env` dependency, so no loader: wrapping it would only add a hop.
  'context7': server({ transport: 'stdio', command: 'bunx', args: ['-y', '@upstash/context7-mcp@4.0.3'] }),
  'slack-aurora': server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio'],
    // The server reads these two names itself and `.env` is the only place
    // they live: the reaction allowlist is a list of workspace channel ids,
    // never a committed value.
    envLoader: true,
    dependsOn: ['SLACK_MCP_XOXP_TOKEN', 'SLACK_MCP_REACTION_TOOL'],
    literalEnv: { SLACK_MCP_ADD_MESSAGE_TOOL: 'true' },
  }),
  'dbhub': server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@bytebase/dbhub@1.2.1', '--config', 'dbhub.toml'],
    // `dbhub.toml` interpolates these from the environment the server is
    // LAUNCHED with, and dbhub substitutes the literal `${DBHUB_HOST}` when a
    // variable is absent instead of failing at startup: the loader's filter is
    // what puts all six there on every host.
    envLoader: true,
    dependsOn: ['DBHUB_DATABASE', 'DBHUB_HOST', 'DBHUB_PASSWORD', 'DBHUB_PORT', 'DBHUB_TYPE', 'DBHUB_USER'],
  }),
  'openapi': server({
    transport: 'stdio',
    command: 'bunx',
    args: ['-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
    envLoader: true,
    dependsOn: ['API_BASE_URL', 'OPENAPI_SPEC_PATH'],
  }),
};

/**
 * Codex starts the same servers with a 30-second startup budget. Codex's
 * default is 10 seconds, and every shipped server is fetched by `bunx` on first
 * use: a cold cache plus the loader hop can pass 10 seconds where a warm dbhub
 * already took most of it (ADR-0006).
 */
export const CODEX_STARTUP_TIMEOUT_SEC = 30;
const CODEX_SHAPE = Object.fromEntries(
  Object.entries(EVERY_HOST).map(([id, shape]) => [id, canonical({ ...shape, startupTimeoutSec: CODEX_STARTUP_TIMEOUT_SEC })]),
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
export function stripTrailingCommas(source: string): string {
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
 * exactly as `{env:DBHUB_HOST}` does; only the delivery route differs (the
 * retired `harness:env` emitter wrote those files from `.env`; a downstream
 * config may still carry the form until it moves to the loader). This checker exists
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
    const launch = transport === 'stdio'
      ? unwrapEnvLoader(stringValue(server.command, `${label}.command`), stringArray(server.args ?? [], `${label}.args`))
      : undefined;
    // `${VAR}` anywhere in the server (args, env, HTTP headers) is a dependency
    // the HOST delivers; the loader's filter is one the loader delivers.
    const hostRefs = placeholderNames(server);
    return [id, {
      transport,
      command: launch?.command,
      args: launch?.args,
      url: transport === 'http' ? stringValue(server.url, `${label}.url`) : undefined,
      dependsOn: sorted([...hostRefs, ...(launch?.filter ?? [])]),
      literalEnv: literalEntries(env, `${label}.env`),
      enabled: server.enabled !== false,
      envLoader: launch?.envLoader ?? false,
      hostRefs: sorted(hostRefs),
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
    const launch = transport === 'stdio' && command.length > 0
      ? unwrapEnvLoader(command[0], command.slice(1))
      : undefined;
    // OpenCode spells the placeholder `{env:VAR}` (or the legacy
    // `{file:.auth/opencode/VAR}`) and, like Claude, expands it in `command`,
    // `environment` and `headers`.
    const hostRefs = placeholderNames(server);
    return [id, {
      transport,
      command: launch?.command,
      args: launch === undefined ? undefined : launch.args.map(canonicalPlaceholders),
      url: transport === 'http' ? canonicalPlaceholders(stringValue(server.url, `${label}.url`)) : undefined,
      dependsOn: sorted([...hostRefs, ...(launch?.filter ?? [])]),
      literalEnv: literalEntries(environment, `${label}.environment`),
      enabled: server.enabled !== false,
      envLoader: launch?.envLoader ?? false,
      hostRefs: sorted(hostRefs),
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
    // starts, and record that it is there. `env_vars` here are host refs.
    const launch = transport === 'stdio'
      ? unwrapEnvLoader(stringValue(server.command, `${label}.command`), stringArray(server.args ?? [], `${label}.args`))
      : undefined;
    return [id, {
      transport,
      command: launch?.command,
      args: launch?.args,
      url: transport === 'http' ? stringValue(server.url, `${label}.url`) : undefined,
      dependsOn: sorted([...dependsOn, ...(launch?.filter ?? [])]),
      literalEnv: literalEntries(env, `${label}.env`),
      enabled: server.enabled !== false,
      envLoader: launch?.envLoader ?? false,
      hostRefs: sorted(dependsOn),
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
 * The project's canonical MCP server set, sorted: the servers of the canonical
 * host's config (`.mcp.json` while Claude is in use, otherwise the first
 * declared harness's file, see `canonicalMcpHarness`). Throws when that file
 * is missing or malformed; `validateMcpParity` reports the same failure as an
 * error string.
 */
export function declaredMcpIds(root = process.cwd(), harnesses: readonly Harness[] = declaredHarnesses(root).harnesses): string[] {
  const host = canonicalMcpHarness(harnesses);
  const config = readHostMcpConfig(root, host);
  if (config === null) {
    throw new Error(`MCP config missing for ${host}: ${MCP_CONFIG_FILE[host]}`);
  }
  return Object.keys(config).sort();
}

/** What `validateMcpParityFindings` returns: errors fail the check, warnings are printed and never fail it. */
export interface McpParityFindings {
  errors: string[]
  warnings: string[]
}

export interface McpParityOptions {
  /**
   * True in the boilerplate itself (`isSchemaOwner`). There a launch gap (a
   * server that needs `.env` values but skips the loader, a host-side
   * reference beside the loader, a missing Codex startup budget) is an ERROR:
   * the boilerplate ships the fix, so its own copy must carry it. Downstream it
   * is a WARNING that names the file and what to change: the three MCP configs
   * are bootstrap-only or protected, so a project scaffolded before the loader
   * existed cannot receive it from a sync, and a red gate it cannot clear by
   * syncing is how a team learns `--no-verify`. Defaults to reading
   * `<root>/package.json`.
   */
  schemaOwner?: boolean
  /** The harnesses whose configs are compared. Defaults to `declaredHarnesses(root)`. */
  harnesses?: readonly Harness[]
}

function readSchemaOwner(root: string): boolean {
  const packageJson = join(root, 'package.json');
  return existsSync(packageJson) && isSchemaOwner(readFileSync(packageJson, 'utf8'));
}

const LOADER_REASON = 'a desktop or natively launched harness has no process environment, and the loader reads .env (or the secret manager) itself, so no plaintext copy is needed';

function loaderFix(names: readonly string[]): string {
  return `launch it as \`${MCP_ENV_LOADER_COMMAND} ${mcpEnvLoaderArgs(names).join(' ')} <the server's own command and args>\``;
}

function hostRefFix(names: readonly string[]): string {
  return `drop the host-side reference to ${names.join(', ')} (\${VAR}, {env:}, {file:}, env_vars): the loader's --filter delivers them, an unset \${VAR} breaks a desktop launch and an empty one shadows .env`;
}

/**
 * What a known server's entry lacks when the ONLY difference from the pinned
 * shape is a launch detail (the loader, a host-side reference, the Codex
 * startup budget), or null when anything else differs too. These details
 * change how a host starts the server, never which server it starts.
 */
function launchGaps(actual: NormalizedMcpServer, expected: NormalizedMcpServer): string[] | null {
  if (!sameServer({ ...actual, envLoader: expected.envLoader, hostRefs: expected.hostRefs, startupTimeoutSec: expected.startupTimeoutSec }, expected)) { return null; }
  const gaps: string[] = [];
  const hostRefs = (expected.hostRefs ?? []).length === 0 ? actual.hostRefs ?? [] : [];
  if (expected.envLoader === true && (actual.envLoader !== true || hostRefs.length > 0)) {
    // A missing loader, or the unfiltered legacy one that still takes its
    // names from the host: one fix covers both.
    gaps.push(`${loaderFix(expected.dependsOn)}${hostRefs.length > 0 ? ` and ${hostRefFix(hostRefs)}` : ''} (${LOADER_REASON})`);
  }
  else if (expected.envLoader !== true && actual.envLoader === true) {
    gaps.push('drop the .env loader: the server needs no .env value, and an unfiltered loader hands it every one');
  }
  else if (hostRefs.length > 0) {
    gaps.push(hostRefFix(hostRefs));
  }
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

const NORMALIZE: Record<McpHost, (root: JsonObject) => NormalizedMcpConfig> = {
  claude: normalizeClaude,
  opencode: normalizeOpenCode,
  codex: normalizeCodex,
};
const PARSE: Record<McpHost, (path: string) => JsonObject> = {
  claude: parseJson,
  opencode: parseJsonc,
  codex: parseToml,
};

/** One host's MCP config, normalized; null when its file is absent. Throws when it is malformed. */
export function readHostMcpConfig(root: string, host: McpHost): NormalizedMcpConfig | null {
  const path = join(resolve(root), MCP_CONFIG_FILE[host]);
  if (!existsSync(path)) { return null; }
  return NORMALIZE[host](PARSE[host](path));
}

// LINT.IfChange(mcp-parity)
export function validateMcpParityFindings(root = process.cwd(), options: McpParityOptions = {}): McpParityFindings {
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  const warnings: string[] = [];
  const schemaOwner = options.schemaOwner ?? readSchemaOwner(resolvedRoot);
  const hosts = options.harnesses ?? declaredHarnesses(resolvedRoot, { schemaOwner: options.schemaOwner }).harnesses;
  // Only the harnesses in use are read: a project on one harness has deleted
  // the other two's files on purpose. A declared host whose file is missing or
  // malformed fails here, under the MCP group.
  const configs: Partial<Record<McpHost, NormalizedMcpConfig>> = {};
  for (const host of hosts) {
    try {
      const config = readHostMcpConfig(resolvedRoot, host);
      if (config === null) {
        const why = schemaOwner ? 'the boilerplate checks all three harnesses' : 'a harness in use; declare `harnesses:` in .agents/project.yaml to drop it';
        errors.push(`MCP config missing for ${host}: ${MCP_CONFIG_FILE[host]} (${why})`);
        continue;
      }
      configs[host] = config;
    }
    catch (error) {
      // The normalizers' own messages already name the file; a raw parser
      // error does not, and without the file it would not group under MCP.
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message.includes(MCP_CONFIG_FILE[host]) ? message : `MCP config unreadable for ${host}: ${MCP_CONFIG_FILE[host]}: ${message}`);
    }
  }
  if (errors.length > 0) { return { errors, warnings }; }

  // The canonical host defines the set; every other host in use must match it exactly.
  const canonicalHost = canonicalMcpHarness(hosts);
  const canonicalConfig = configs[canonicalHost]!;
  const declared = Object.keys(canonicalConfig).sort();
  const adapters = hosts.filter(host => host !== canonicalHost);
  for (const host of adapters) {
    const actual = new Set(Object.keys(configs[host]!));
    for (const id of declared) {
      if (!actual.has(id)) {
        errors.push(`MCP ${id} missing from ${host}: declared in ${MCP_CONFIG_FILE[canonicalHost]}, absent from ${MCP_CONFIG_FILE[host]}`);
      }
    }
    for (const id of [...actual].sort()) {
      if (!declared.includes(id)) {
        errors.push(`MCP ${id} present in ${host} only: declare it in ${MCP_CONFIG_FILE[canonicalHost]} or remove it from ${MCP_CONFIG_FILE[host]}`);
      }
    }
  }

  // Strict per-host shape, only for the servers this boilerplate knows AND the
  // project declares (see PARITY RULE). Downstream, an entry that differs ONLY
  // in a launch detail is a warning (see `McpParityOptions`).
  const launchWarned = new Set<string>();
  for (const [host, config] of Object.entries(configs) as Array<[McpHost, NormalizedMcpConfig]>) {
    for (const id of declared) {
      const actual = config[id];
      if (!actual || !isKnownMcpId(id)) { continue; }
      const expected = EXPECTED_MCP[host][id];
      if (sameServer(actual, expected)) { continue; }
      const gaps = schemaOwner ? null : launchGaps(actual, expected);
      if (gaps !== null) {
        warnings.push(`${host} MCP ${id} launch is out of date in ${MCP_CONFIG_FILE[host]}: ${gaps.join('; ')}. Upstream never overwrites this file, so change it by hand.`);
        launchWarned.add(`${host}:${id}`);
        continue;
      }
      errors.push(`${host} MCP ${id} mismatch: expected ${describeServer(expected)}, found ${describeServer(actual)}`);
    }
  }

  // Every host, every declared stdio server, known to this boilerplate or not:
  // one that needs `.env` values starts through the loader, and a loader-launched
  // one takes nothing from the host. Both are what lets a desktop launch get its
  // credentials with no plaintext copy on disk.
  for (const [host, config] of Object.entries(configs) as Array<[McpHost, NormalizedMcpConfig]>) {
    for (const id of declared) {
      const server = config[id];
      if (!server || server.transport !== 'stdio' || server.dependsOn.length === 0 || launchWarned.has(`${host}:${id}`)) { continue; }
      const hostRefs = server.hostRefs ?? [];
      const problem = server.envLoader !== true
        ? `${host} MCP ${id} must launch through the .env loader in ${MCP_CONFIG_FILE[host]}: ${loaderFix(server.dependsOn)} (${LOADER_REASON}).`
        : hostRefs.length > 0
          ? `${host} MCP ${id} launches through the .env loader but also takes ${hostRefs.join(', ')} from the host in ${MCP_CONFIG_FILE[host]}: list them in the loader's --filter and ${hostRefFix(hostRefs)}.`
          : null;
      if (problem === null) { continue; }
      if (schemaOwner) { errors.push(problem); }
      else { warnings.push(problem); }
    }
  }

  // Cross-host contract for EVERY declared server: same `.env` dependencies and
  // same literal settings, whatever the transport or command each host uses.
  for (const id of declared) {
    const baseline = describeContract(canonicalConfig[id]);
    for (const host of adapters) {
      const server = configs[host]![id];
      if (!server) { continue; }
      const contract = describeContract(server);
      if (contract !== baseline) {
        errors.push(`MCP ${id} env contract differs between ${canonicalHost} and ${host}: ${baseline} vs ${contract}`);
      }
    }
  }

  return { errors, warnings };
}
// LINT.ThenChange(README.md, CONTEXT.md, .agents/instructions/agent-harnesses.md, packages/pages-home/harnesses.es.html)

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

/** Each harness's hook adapter, repo-relative. */
export const HOOK_ADAPTER_FILE: Record<Harness, string> = {
  claude: '.claude/settings.json',
  opencode: '.opencode/plugins/personality-reinject.js',
  codex: '.codex/hooks.json',
};

/**
 * The emitter plus the adapter of every harness in use (`harnesses`, default
 * `declaredHarnesses(root)`). An adapter of a harness the project does not use
 * is not read: its absence is the project's choice, not drift.
 */
export function validateHookCompatibility(root = process.cwd(), harnesses: readonly Harness[] = declaredHarnesses(root).harnesses): string[] {
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  const uses = (harness: Harness): boolean => harnesses.includes(harness);
  const required = [
    '.agents/hooks/personality-reinject.mjs',
    ...(['claude', 'opencode', 'codex'] as const).filter(uses).map(harness => HOOK_ADAPTER_FILE[harness]),
  ];
  for (const path of required) {
    if (!existsSync(join(resolvedRoot, path))) {
      errors.push(`Hook compatibility file missing: ${path}`);
    }
  }
  if (errors.length > 0) { return errors; }

  try {
    const commands: Array<[string, string]> = [];
    if (uses('claude')) {
      const claude = readHookCommand(parseJson(join(resolvedRoot, '.claude', 'settings.json')), 'claude');
      const claudeCommand = stringValue(claude.command, 'Claude hook command');
      if (claudeCommand !== CLAUDE_HOOK_COMMAND) {
        errors.push(`Claude hook command must be repository-relative through $CLAUDE_PROJECT_DIR: ${CLAUDE_HOOK_COMMAND}`);
      }
      commands.push(['claude', claudeCommand]);
    }
    if (uses('codex')) {
      const codex = readHookCommand(parseJson(join(resolvedRoot, '.codex', 'hooks.json')), 'codex');
      const codexCommand = stringValue(codex.command, 'Codex hook command');
      const codexWindows = stringValue(codex.commandWindows, 'Codex Windows hook command');
      if (codexCommand !== CODEX_HOOK_COMMAND) {
        errors.push(`Codex hook command must resolve the Git root: ${CODEX_HOOK_COMMAND}`);
      }
      if (codexWindows !== CODEX_HOOK_COMMAND_WINDOWS) {
        errors.push(`Codex Windows hook command must resolve the Git root with Join-Path: ${CODEX_HOOK_COMMAND_WINDOWS}`);
      }
      commands.push(['codex', codexCommand], ['codex-windows', codexWindows]);
    }
    for (const [host, command] of commands) {
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
    const sources: Array<[string, string]> = [['emitter', shared]];
    if (uses('opencode')) {
      const plugin = readFileSync(join(resolvedRoot, '.opencode', 'plugins', 'personality-reinject.js'), 'utf8');
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
      sources.push(['OpenCode adapter', plugin]);
    }
    for (const [label, source] of sources) {
      if (personalAbsolutePath(source)) {
        errors.push(`Shared hook ${label} contains an absolute personal path.`);
      }
    }
    for (const duplicate of ['.claude/hooks/personality-reinject.js', '.codex/hooks/personality-reinject.js']) {
      if (existsSync(join(resolvedRoot, duplicate))) {
        errors.push(`Duplicated personality hook must be removed: ${duplicate}`);
      }
    }
    errors.push(...validateInstructionRouterHooks(resolvedRoot, harnesses));
    errors.push(...validateDocContractHooks(resolvedRoot, harnesses));
  }
  catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  return errors;
}

/**
 * The documentation-contract edit hook (ADR-0016): `PostToolUse` on file
 * edits, Claude Code and Codex only (OpenCode relies on the pre-push and CI
 * gate). Bound in the boilerplate itself (`isSchemaOwner`) and nowhere else:
 * v1 is maintainer-only, and `.claude/settings.json` / `.codex/hooks.json` are
 * bootstrap-only, so a sync could never deliver the registration downstream.
 */
export const DOC_CONTRACTS_HOOK = '.agents/hooks/doc-contracts.mjs';
export const CLAUDE_DOC_CONTRACTS_MATCHER = 'Edit|Write|MultiEdit';
export const CODEX_DOC_CONTRACTS_MATCHER = 'Edit|Write';
export const CLAUDE_DOC_CONTRACTS_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.agents/hooks/doc-contracts.mjs"';
export const CODEX_DOC_CONTRACTS_COMMAND = 'root="$(git rev-parse --show-toplevel)" && node "$root/.agents/hooks/doc-contracts.mjs" --root "$root"';
export const CODEX_DOC_CONTRACTS_COMMAND_WINDOWS = 'powershell.exe -NoProfile -Command "$root = git rev-parse --show-toplevel; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node (Join-Path $root \'.agents/hooks/doc-contracts.mjs\') --root $root"';

function hasPostToolUse(settings: JsonObject, matcher: string, command: string, windows?: string): boolean {
  const groups = settings.hooks && typeof settings.hooks === 'object' ? (settings.hooks as JsonObject).PostToolUse : undefined;
  if (!Array.isArray(groups)) { return false; }
  return groups.some((group) => {
    if (!group || typeof group !== 'object' || (group as JsonObject).matcher !== matcher) { return false; }
    const hooks = (group as JsonObject).hooks;
    return Array.isArray(hooks) && hooks.some(hook => hook && typeof hook === 'object'
      && (hook as JsonObject).command === command
      && (windows === undefined || (hook as JsonObject).commandWindows === windows));
  });
}

export function validateDocContractHooks(root = process.cwd(), harnesses: readonly Harness[] = declaredHarnesses(root).harnesses, schemaOwner = readSchemaOwner(resolve(root))): string[] {
  if (!schemaOwner) { return []; }
  const resolvedRoot = resolve(root);
  const errors: string[] = [];
  if (!existsSync(join(resolvedRoot, DOC_CONTRACTS_HOOK))) {
    return [`Documentation-contract hook missing: ${DOC_CONTRACTS_HOOK}`];
  }
  if (harnesses.includes('claude') && !hasPostToolUse(parseJson(join(resolvedRoot, '.claude', 'settings.json')), CLAUDE_DOC_CONTRACTS_MATCHER, CLAUDE_DOC_CONTRACTS_COMMAND)) {
    errors.push(`claude must register the documentation-contract hook: a PostToolUse group with matcher "${CLAUDE_DOC_CONTRACTS_MATCHER}" running ${CLAUDE_DOC_CONTRACTS_COMMAND}`);
  }
  if (harnesses.includes('codex') && !hasPostToolUse(parseJson(join(resolvedRoot, '.codex', 'hooks.json')), CODEX_DOC_CONTRACTS_MATCHER, CODEX_DOC_CONTRACTS_COMMAND, CODEX_DOC_CONTRACTS_COMMAND_WINDOWS)) {
    errors.push(`codex must register the documentation-contract hook: a PostToolUse group with matcher "${CODEX_DOC_CONTRACTS_MATCHER}" running the Codex command (and its Windows variant)`);
  }
  return errors;
}

/**
 * Instruction router (progressive disclosure): the emitter classifies each
 * prompt with the router table of `AGENTS.md` and prints one `ROUTE:` line per
 * newly matched instruction file. These are the exports and markers its
 * adapters and the eval rely on.
 */
export const HOOK_ROUTER_EXPORTS = ['routeLines', 'rearmRoutes', 'loadInstructionRouter', 'classifyPrompt', 'pendingRouteReminder'] as const;
export const HOOK_ROUTE_MARKER = 'ROUTE: read';
export const ROUTER_START_MARKER = '<!-- router:start -->';
/** Codex `project_doc_max_bytes` default: the always-on file past it is cut at the byte, silently. */
export const CODEX_PROJECT_DOC_MAX_BYTES = 32 * 1024;
/** The OpenCode 2 degradation, declared in the adapter in so many words. */
export const OPENCODE_ROUTER_ONLY_MARKER = 'ROUTER-ONLY';

/**
 * The `SessionStart` sources after which the routed sections are gone from the
 * context and must be routed again: a compaction drops them with the
 * summarized messages, `/clear` drops everything. Claude Code and Codex both
 * emit these two sources, so both register one group per source.
 */
export const REARM_SESSION_START_SOURCES = { compact: 'compaction', clear: '/clear' } as const;

/**
 * Claude Code re-surfaces an unread route once, on the first tool call that
 * reads none of the routed sections (`ROUTE-PENDING:`, ADR-0017). Codex and
 * OpenCode carry no such hook: their agents get the `ROUTE:` cue only.
 */
export const ROUTE_RESURFACE_EVENT = 'PostToolUse';

/**
 * The fix a downstream project reads next to a missing hook group. Its
 * `.claude/settings.json` is frozen by the sync, but `bun run up` appends the
 * upstream hook groups it lacks (`mergeHookGroups`, `cli/lib/updater-settings.ts`)
 * and its `.codex/hooks.json` is rewritten by the sync, so re-running the
 * update IS the fix. Not said in the boilerplate itself, which has no upstream.
 */
export const HOOK_GROUP_FIX = 'run `bun run up`, which adds the upstream hook groups this file lacks';

/** One group of `event` with no matcher (every tool) whose hooks run `command`. */
function hasUnmatchedGroup(settings: JsonObject, event: string, command: string): boolean {
  const groups = settings.hooks && typeof settings.hooks === 'object' ? (settings.hooks as JsonObject)[event] : undefined;
  if (!Array.isArray(groups)) { return false; }
  return groups.some((group) => {
    if (!group || typeof group !== 'object' || ((group as JsonObject).matcher ?? '*') !== '*') { return false; }
    const hooks = (group as JsonObject).hooks;
    return Array.isArray(hooks) && hooks.some(hook => hook && typeof hook === 'object' && (hook as JsonObject).command === command);
  });
}

function hasSessionStart(settings: JsonObject, matcher: string, command: string, windows?: string): boolean {
  const groups = settings.hooks && typeof settings.hooks === 'object' ? (settings.hooks as JsonObject).SessionStart : undefined;
  if (!Array.isArray(groups)) { return false; }
  return groups.some((group) => {
    if (!group || typeof group !== 'object' || (group as JsonObject).matcher !== matcher) { return false; }
    const hooks = (group as JsonObject).hooks;
    return Array.isArray(hooks) && hooks.some(hook => hook && typeof hook === 'object'
      && (hook as JsonObject).command === command
      && (windows === undefined || (hook as JsonObject).commandWindows === windows));
  });
}

/**
 * Binds once `AGENTS.md` carries the router markers (a repo still on the
 * single-file layout has nothing to route). Each command host must re-arm the
 * routes after a compaction and after `/clear`, the OpenCode adapter must classify in `chat.message`
 * (OpenCode 1) and declare its OpenCode 2 degradation, and the always-on file
 * must fit the Codex project-doc budget whole. Each part binds only while its
 * harness is in use (`harnesses`, default `declaredHarnesses(root)`).
 */
export function validateInstructionRouterHooks(root = process.cwd(), harnesses: readonly Harness[] = declaredHarnesses(root).harnesses): string[] {
  const resolvedRoot = resolve(root);
  const l0Path = join(resolvedRoot, 'AGENTS.md');
  if (!existsSync(l0Path)) { return []; }
  const l0 = readFileSync(l0Path, 'utf8');
  if (!l0.includes(ROUTER_START_MARKER)) { return []; }

  const errors: string[] = [];
  const fix = readSchemaOwner(resolvedRoot) ? '' : `. Fix: ${HOOK_GROUP_FIX}`;
  const shared = readFileSync(join(resolvedRoot, '.agents', 'hooks', 'personality-reinject.mjs'), 'utf8');
  for (const name of HOOK_ROUTER_EXPORTS) {
    if (!shared.includes(`export function ${name}`)) {
      errors.push(`Shared hook emitter must export ${name}(): the ROUTE: lines have one classifier.`);
    }
  }
  for (const marker of [HOOK_ROUTE_MARKER, ROUTER_START_MARKER]) {
    if (!shared.includes(marker)) {
      errors.push(`Shared hook emitter must read the AGENTS.md router and emit "${marker}" lines.`);
    }
  }

  for (const [source, after] of Object.entries(REARM_SESSION_START_SOURCES)) {
    if (harnesses.includes('claude') && !hasSessionStart(parseJson(join(resolvedRoot, '.claude', 'settings.json')), source, CLAUDE_HOOK_COMMAND)) {
      errors.push(`claude must re-arm the routes after ${after}: a SessionStart group with matcher "${source}" running ${CLAUDE_HOOK_COMMAND}${fix}`);
    }
    if (harnesses.includes('codex') && !hasSessionStart(parseJson(join(resolvedRoot, '.codex', 'hooks.json')), source, CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS)) {
      errors.push(`codex must re-arm the routes after ${after}: a SessionStart group with matcher "${source}" running the Codex hook command (and its Windows variant)${fix}.`);
    }
  }

  if (harnesses.includes('claude') && !hasUnmatchedGroup(parseJson(join(resolvedRoot, '.claude', 'settings.json')), ROUTE_RESURFACE_EVENT, CLAUDE_HOOK_COMMAND)) {
    errors.push(`claude must re-surface unread routes: a ${ROUTE_RESURFACE_EVENT} group with no matcher running ${CLAUDE_HOOK_COMMAND}${fix}`);
  }

  if (harnesses.includes('opencode')) {
    const plugin = readFileSync(join(resolvedRoot, '.opencode', 'plugins', 'personality-reinject.js'), 'utf8');
    if (!plugin.includes('\'chat.message\'') || !plugin.includes('routeLines')) {
      errors.push('OpenCode personality adapter must classify the prompt in chat.message with the shared routeLines (OpenCode 1).');
    }
    if (!plugin.includes('experimental.session.compacting') || !plugin.includes('rearmRoutes')) {
      errors.push('OpenCode personality adapter must re-arm the routes in experimental.session.compacting (OpenCode 1).');
    }
    if (!plugin.includes(OPENCODE_ROUTER_ONLY_MARKER)) {
      errors.push(`OpenCode personality adapter must declare the OpenCode 2 degradation (${OPENCODE_ROUTER_ONLY_MARKER}: no hook carries the prompt).`);
    }
  }

  // Codex reads AGENTS.md natively and cuts it at the byte; the other two
  // harnesses carry no such budget.
  const bytes = Buffer.byteLength(l0);
  if (harnesses.includes('codex') && bytes > CODEX_PROJECT_DOC_MAX_BYTES) {
    errors.push(`AGENTS.md is ${bytes} bytes: Codex cuts the always-on file at ${CODEX_PROJECT_DOC_MAX_BYTES} bytes, router included.`);
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
