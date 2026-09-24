/**
 * @fileoverview MCP servers that run at HARNESS level, not in the project.
 *
 * Principle (ADR-0005, D3): a remote MCP server whose only project-side content
 * was an API key is the harness's business. It is connected once per machine
 * (a claude.ai connector, a user-scope server, the OpenCode / Codex user
 * config), and the skills resolve it by CAPABILITY, whatever prefix the host
 * gives its tools (`agentic-qa-core/references/mcp-capabilities.md`). Only
 * local-only servers with project-scope values stay in the three project MCP
 * files.
 *
 * This module is the ONE list of the servers that moved, so the doctor, the
 * installer's closing guidance and the updater's parity row name the same
 * things. It also reads the user-level harness configs, read-only, to tell a
 * developer whether such a server is "provided elsewhere" on this machine. A
 * cloud connector (claude.ai) leaves no file behind and is reported as not
 * detectable, never as absent.
 *
 * Import-closed: node builtins and `Bun.TOML` only (AGENTS.md §4.5).
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type HarnessId = 'claude' | 'opencode' | 'codex';

export interface HarnessLevelMcp {
  /** The server id the boilerplate used to commit. */
  id: string
  /** Capability name from `mcp-capabilities.md`, or null when no skill instructs its use yet. */
  capability: string | null
  /** The `.env` key the committed server used to need. Kept for the migration message only. */
  formerEnvVar: string
  /** Remote endpoint, so a user-level server named differently still matches. */
  urlHost: string
  /** One line for a human: what the capability is for. */
  purpose: string
}

export const HARNESS_LEVEL_MCPS: readonly HarnessLevelMcp[] = [
  {
    id: 'tavily',
    capability: 'web-search',
    formerEnvVar: 'TAVILY_API_KEY',
    urlHost: 'mcp.tavily.com',
    purpose: 'web search: community fixes, error lookups, non-doc research ([WEB_SEARCH_TOOL])',
  },
  {
    id: 'postman',
    capability: null,
    formerEnvVar: 'POSTMAN_API_KEY',
    urlHost: 'mcp.postman.com',
    purpose: 'Postman collections (the [API_TOOL] fallback)',
  },
];

export const HARNESS_LEVEL_MCP_IDS: readonly string[] = HARNESS_LEVEL_MCPS.map(m => m.id);
export const HARNESS_LEVEL_ENV_VARS: readonly string[] = HARNESS_LEVEL_MCPS.map(m => m.formerEnvVar);

/**
 * How to connect one at harness level, per host. Verified against each host's
 * own docs on 2026-09-24 (Claude Code `claude mcp add --scope user`, OpenCode
 * global config precedence, `codex mcp add` writing the global config). Windows
 * paths follow the same `~` layout; documented, not measured.
 */
export const HARNESS_LEVEL_HOWTO: Record<HarnessId, { where: string, how: string }> = {
  claude: {
    where: '~/.claude.json (user scope) or a claude.ai connector',
    how: 'claude mcp add --scope user --transport http <name> <url>   (or connect it from claude.ai settings; `/mcp` inside a session lists it)',
  },
  opencode: {
    where: '~/.config/opencode/opencode.json (global config, key "mcp")',
    how: 'add the server under "mcp" in the global config; a project opencode.jsonc must not re-declare it',
  },
  codex: {
    where: '~/.codex/config.toml ([mcp_servers.<name>])',
    how: 'codex mcp add <name> --url <url> [--bearer-token-env-var <VAR>]',
  },
};

/** CLIs that keep their own session: nothing for `.env`. Commands from each CLI's own docs. */
export const CLI_LOGINS: ReadonlyArray<{ cli: string, login: string, note: string }> = [
  { cli: 'acli', login: 'echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$(bun run --silent jira:url --slug)" --email "$ATLASSIAN_EMAIL" --token', note: 'persistent session under ~/.config/acli/; the ATLASSIAN_* pair stays in .env for the REST scripts' },
  { cli: 'resend', login: 'resend login', note: 'keychain-backed; nothing in this repo reads RESEND_API_KEY' },
];

export interface UserLevelMcpServers {
  /** Server ids (lowercased) plus the host part of every `url` found, per harness. */
  claude: string[]
  opencode: string[]
  codex: string[]
  /** Files that were read, for the report. Never their contents. */
  sources: string[]
}

/** Where each harness keeps its user-level config. `home` is injectable for tests. */
export function userLevelConfigPaths(home = homedir(), env: NodeJS.ProcessEnv = process.env): Record<HarnessId, string[]> {
  const xdg = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.trim() !== '' ? env.XDG_CONFIG_HOME : join(home, '.config');
  return {
    claude: [join(home, '.claude.json')],
    opencode: [join(xdg, 'opencode', 'opencode.json'), join(xdg, 'opencode', 'opencode.jsonc')],
    codex: [join(home, '.codex', 'config.toml')],
  };
}

function urlHost(value: unknown): string | null {
  if (typeof value !== 'string') { return null; }
  try { return new URL(value).host.toLowerCase(); }
  catch { return null; }
}

/** Ids and url hosts of one `mcpServers`-shaped registry object. */
function collectRegistry(registry: unknown, out: Set<string>): void {
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) { return; }
  for (const [id, server] of Object.entries(registry as Record<string, unknown>)) {
    out.add(id.toLowerCase());
    if (typeof server === 'object' && server !== null && !Array.isArray(server)) {
      const host = urlHost((server as Record<string, unknown>).url);
      if (host !== null) { out.add(host); }
    }
  }
}

/** Same JSONC stripper the compatibility contracts use; local copy keeps this module import-closed to builtins. */
function stripJsonComments(source: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index++) {
    const current = source[index];
    const next = source[index + 1];
    if (lineComment) { if (current === '\n') { lineComment = false; result += current; } continue; }
    if (blockComment) { if (current === '*' && next === '/') { blockComment = false; index++; } continue; }
    if (inString) {
      result += current;
      if (escaped) { escaped = false; }
      else if (current === '\\') { escaped = true; }
      else if (current === '"') { inString = false; }
      continue;
    }
    if (current === '"') { inString = true; result += current; continue; }
    if (current === '/' && next === '/') { lineComment = true; index++; continue; }
    if (current === '/' && next === '*') { blockComment = true; index++; continue; }
    if (current === ',' && /^\s*[}\]]/.test(source.slice(index + 1))) { continue; }
    result += current;
  }
  return result;
}

/**
 * Read the user-level MCP registries of the three harnesses. Read-only, never
 * throws: an unreadable or unparseable file contributes nothing. Values (a
 * bearer token in a header) are never returned: ids and url hosts only.
 *
 *   - Claude Code: `~/.claude.json` -> `mcpServers` (user scope) and
 *     `projects.<path>.mcpServers` (local scope, any project).
 *   - OpenCode: the global config -> `mcp`.
 *   - Codex: `~/.codex/config.toml` -> `mcp_servers`.
 */
export function readUserLevelMcpServers(home = homedir(), env: NodeJS.ProcessEnv = process.env): UserLevelMcpServers {
  const paths = userLevelConfigPaths(home, env);
  const found: Record<HarnessId, Set<string>> = { claude: new Set(), opencode: new Set(), codex: new Set() };
  const sources: string[] = [];

  for (const file of paths.claude) {
    if (!existsSync(file)) { continue; }
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      sources.push(file);
      collectRegistry(parsed.mcpServers, found.claude);
      const projects = parsed.projects;
      if (typeof projects === 'object' && projects !== null) {
        for (const project of Object.values(projects as Record<string, unknown>)) {
          if (typeof project === 'object' && project !== null) { collectRegistry((project as Record<string, unknown>).mcpServers, found.claude); }
        }
      }
    }
    catch { /* unreadable or not JSON: contributes nothing */ }
  }
  for (const file of paths.opencode) {
    if (!existsSync(file)) { continue; }
    try {
      const parsed = JSON.parse(stripJsonComments(readFileSync(file, 'utf8'))) as Record<string, unknown>;
      sources.push(file);
      collectRegistry(parsed.mcp, found.opencode);
    }
    catch { /* contributes nothing */ }
  }
  for (const file of paths.codex) {
    if (!existsSync(file)) { continue; }
    try {
      const parsed = Bun.TOML.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      sources.push(file);
      collectRegistry(parsed.mcp_servers, found.codex);
    }
    catch { /* contributes nothing */ }
  }
  return {
    claude: [...found.claude].sort(),
    opencode: [...found.opencode].sort(),
    codex: [...found.codex].sort(),
    sources,
  };
}

export type HarnessLevelState = 'provided elsewhere' | 'not detectable';

export interface HarnessLevelVerdict {
  id: string
  capability: string | null
  state: HarnessLevelState
  /** Harnesses whose user-level config declares the server (by id or by url host). */
  hosts: HarnessId[]
  /** One line for the report. */
  detail: string
}

/**
 * Pure classifier: is `entry` declared in any user-level config? A hit by id
 * OR by url host counts (a user may have named the server differently). No hit
 * is "not detectable", never "missing": a claude.ai connector, the most common
 * route on Claude Code, writes no file this can read.
 */
export function classifyHarnessLevelMcp(entry: HarnessLevelMcp, servers: Pick<UserLevelMcpServers, HarnessId>): HarnessLevelVerdict {
  const hosts = (['claude', 'opencode', 'codex'] as const).filter(h =>
    servers[h].includes(entry.id.toLowerCase()) || servers[h].includes(entry.urlHost.toLowerCase()));
  if (hosts.length > 0) {
    return { id: entry.id, capability: entry.capability, state: 'provided elsewhere', hosts, detail: `declared in the user-level config of: ${hosts.join(', ')}` };
  }
  return {
    id: entry.id,
    capability: entry.capability,
    state: 'not detectable',
    hosts: [],
    detail: 'not in any user-level config this machine exposes; a claude.ai connector leaves no file behind, so absence here proves nothing. '
      + `Connect it per host: ${(['claude', 'opencode', 'codex'] as const).map(h => `${h}: ${HARNESS_LEVEL_HOWTO[h].where}`).join('; ')}`,
  };
}

/** Every moved server, classified against this machine's user-level configs. */
export function harnessLevelMcpReport(home = homedir(), env: NodeJS.ProcessEnv = process.env): { verdicts: HarnessLevelVerdict[], sources: string[] } {
  const servers = readUserLevelMcpServers(home, env);
  return { verdicts: HARNESS_LEVEL_MCPS.map(m => classifyHarnessLevelMcp(m, servers)), sources: servers.sources };
}
