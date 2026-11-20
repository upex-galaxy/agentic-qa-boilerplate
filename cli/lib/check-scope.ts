/**
 * @fileoverview The `checks:` block of `.agents/project.yaml`: how a project
 * scopes three gates (`agents:compat:check` MCP parity, `vars:check`,
 * `docs:check`). Documented key by key in `.agents/project.schema.yaml`.
 *
 * An absent block, an absent file or a yaml that does not parse reads as the
 * defaults with no error, so every gate behaves as it did before the block
 * existed. A present but malformed value is an error naming its key path:
 * the gate that owns the key fails instead of falling back in silence.
 *
 * Shared byte for byte with the QA boilerplate (`bun run shared:check`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export const CHECKS_KEY = 'checks';

export const MCP_PARITY_MODES = ['strict', 'local-only'] as const;
export type McpParityMode = (typeof MCP_PARITY_MODES)[number];

export interface McpParityScope {
  mode: McpParityMode
  /** Host -> the exact argv prefix of a relay entry; the server id follows it. */
  relay: Record<string, string[]>
  /** Relay host -> the canonical server ids that host cannot carry (warned, never silent). */
  unrelayed: Record<string, string[]>
}

export interface ChecksConfig {
  mcpParity: McpParityScope
  varsSkipPaths: string[]
  docsInclude: string[]
  docsExclude: string[]
}

export interface ChecksRead {
  config: ChecksConfig
  errors: { mcpParity: string[], varsCheck: string[], docsCheck: string[] }
}

export function defaultChecks(): ChecksConfig {
  return { mcpParity: { mode: 'strict', relay: {}, unrelayed: {} }, varsSkipPaths: [], docsInclude: [], docsExclude: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function globList(value: unknown, path: string, errors: string[]): string[] {
  if (value === undefined || value === null) { return []; }
  if (!Array.isArray(value)) {
    errors.push(`${path}: must be a list of repo-relative globs`);
    return [];
  }
  const globs: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      errors.push(`${path}: ${JSON.stringify(entry)} is not a glob (a non-empty string)`);
    }
    else if (entry.startsWith('/') || entry.split('/').includes('..')) {
      errors.push(`${path}: ${entry} must be repo-relative (no leading /, no ..)`);
    }
    else {
      globs.push(entry);
    }
  }
  return globs;
}

function section(raw: Record<string, unknown>, key: string, errors: string[]): Record<string, unknown> {
  const value = raw[key];
  if (value === undefined || value === null) { return {}; }
  if (!isRecord(value)) {
    errors.push(`${CHECKS_KEY}.${key}: must be a mapping`);
    return {};
  }
  return value;
}

function parseMcpParity(raw: Record<string, unknown>, errors: string[]): McpParityScope {
  const path = `${CHECKS_KEY}.mcp_parity`;
  const block = section(raw, 'mcp_parity', errors);
  const scope: McpParityScope = { mode: 'strict', relay: {}, unrelayed: {} };
  const mode = block.mode;
  if (mode !== undefined && mode !== null) {
    if (typeof mode === 'string' && (MCP_PARITY_MODES as readonly string[]).includes(mode)) { scope.mode = mode as McpParityMode; }
    else { errors.push(`${path}.mode: must be one of ${MCP_PARITY_MODES.join(', ')} (got ${JSON.stringify(mode)})`); }
  }
  const relay = block.relay;
  if (relay !== undefined && relay !== null) {
    if (!isRecord(relay)) {
      errors.push(`${path}.relay: must be a mapping of host to [command, launcher]`);
    }
    else {
      for (const [host, prefix] of Object.entries(relay)) {
        const valid = Array.isArray(prefix) && prefix.length >= 2 && prefix.every(part => typeof part === 'string' && part.trim() !== '');
        if (valid) { scope.relay[host] = prefix as string[]; }
        else { errors.push(`${path}.relay.${host}: must be the relay's argv prefix, at least [command, launcher] (e.g. [bun, scripts/mcp-launch.ts])`); }
      }
    }
  }
  const unrelayed = block.unrelayed;
  if (unrelayed !== undefined && unrelayed !== null) {
    if (!isRecord(unrelayed)) {
      errors.push(`${path}.unrelayed: must be a mapping of relay host to a list of server ids`);
    }
    else {
      for (const [host, ids] of Object.entries(unrelayed)) {
        const valid = Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.trim() !== '');
        if (!valid) {
          errors.push(`${path}.unrelayed.${host}: must be a list of server ids (e.g. [instance-n8n-mcp])`);
          continue;
        }
        const repeated = [...new Set((ids as string[]).filter((id, index) => ids.indexOf(id) !== index))].sort();
        if (repeated.length > 0) { errors.push(`${path}.unrelayed.${host}: lists ${repeated.join(', ')} more than once`); }
        else if (ids.length > 0) { scope.unrelayed[host] = [...(ids as string[])].sort(); }
      }
    }
  }
  return scope;
}

export function parseChecks(raw: unknown): ChecksRead {
  const config = defaultChecks();
  const errors: ChecksRead['errors'] = { mcpParity: [], varsCheck: [], docsCheck: [] };
  if (raw === undefined || raw === null) { return { config, errors }; }
  if (!isRecord(raw)) {
    const message = `${CHECKS_KEY}: must be a mapping`;
    return { config, errors: { mcpParity: [message], varsCheck: [message], docsCheck: [message] } };
  }
  config.mcpParity = parseMcpParity(raw, errors.mcpParity);
  const vars = section(raw, 'vars_check', errors.varsCheck);
  config.varsSkipPaths = globList(vars.skip_paths, `${CHECKS_KEY}.vars_check.skip_paths`, errors.varsCheck);
  const docs = section(raw, 'docs_check', errors.docsCheck);
  config.docsInclude = globList(docs.include, `${CHECKS_KEY}.docs_check.include`, errors.docsCheck);
  config.docsExclude = globList(docs.exclude, `${CHECKS_KEY}.docs_check.exclude`, errors.docsCheck);
  return { config, errors };
}

export function readChecks(root: string): ChecksRead {
  const path = join(resolve(root), '.agents', 'project.yaml');
  if (!existsSync(path)) { return parseChecks(undefined); }
  let parsed: unknown;
  try { parsed = parseYaml(readFileSync(path, 'utf8')); }
  catch { return parseChecks(undefined); }
  return parseChecks(isRecord(parsed) ? parsed[CHECKS_KEY] : undefined);
}

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function matchesAny(globs: readonly string[], rel: string): boolean {
  const path = toPosixPath(rel);
  return globs.some(glob => new Bun.Glob(glob).match(path));
}

const FRAMEWORK_FLOOR = ['AGENTS.md', '.agents/instructions/any.md', '.agents/skills/REGISTRY.md', '.agents/skills/any-skill/SKILL.md', '.agents/skills/any-skill/references/any.md'];

/**
 * The `vars_check.skip_paths` globs that would cover the framework surface:
 * `AGENTS.md`, an instruction section, `REGISTRY.md`, or every skill at once
 * (a wildcard where the skill slug goes). A skip names one skill folder.
 */
export function refusedSkipPaths(globs: readonly string[]): string[] {
  return globs.filter(glob => FRAMEWORK_FLOOR.some(path => new Bun.Glob(glob).match(path)));
}

/** The globs that match none of `rels`: a typo or a stale entry. */
export function unmatchedGlobs(globs: readonly string[], rels: readonly string[]): string[] {
  const paths = rels.map(toPosixPath);
  return globs.filter(glob => !paths.some(path => new Bun.Glob(glob).match(path)));
}
