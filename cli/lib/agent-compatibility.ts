/**
 * @fileoverview Cross-harness compatibility engine — Claude skills alias,
 * generated command wrappers, hook adapters and MCP parity.
 *
 * WHY THIS LIVES IN `cli/lib/` AND NOT IN `scripts/`:
 * `cli/` is the updater's self-update component (`selfUpdateComponent: 'cli'`).
 * The updater refreshes `cli/` in place and re-execs itself BEFORE `scripts/`
 * is synced, so anything `cli/` imports must travel with `cli/`. When this
 * module lived in `scripts/`, a repo several releases behind downloaded the new
 * `cli/`, re-exec'd, and died on `Cannot find module '../scripts/…'` — with
 * `bun run up`, `--rollback`, `setup` and `setup:doctor` all dead at once,
 * because the failure is at module load.
 *
 * The invariant is enforced by the `no-restricted-imports` block scoped to
 * `cli/**` in `eslint.config.js`: NOTHING under `cli/` may import from a
 * sibling top-level directory.
 *
 * `scripts/agent-compatibility.ts` remains the `bun run agents:compat`
 * entrypoint and re-exports this module.
 */

import type { Stats } from 'node:fs';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

import { validateHookCompatibility, validateMcpParity } from './agent-compatibility-contracts.ts';

export const CLAUDE_INSTRUCTIONS_SHIM = '@AGENTS.md\n';

/** OS-generated files that never count as skill content. */
export const OS_METADATA_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
export const POSIX_CLAUDE_SKILLS_TARGET = '../.agents/skills';
export const COMMAND_ALIAS_MANIFEST = '.agents/compatibility/command-aliases.json';
/**
 * Optional project overlay, same schema as the upstream manifest. Never synced
 * by `bun run up` (bootstrap-only): a downstream project declares its own slash
 * commands here, so they survive every update and never collide with upstream
 * edits to `command-aliases.json`. Merge rule: upstream aliases first, then the
 * overlay overrides by `alias` name and may add new ones. `wrapperHosts` always
 * come from the upstream manifest.
 */
export const COMMAND_ALIAS_PROJECT_MANIFEST = '.agents/compatibility/command-aliases.project.json';
/** The check's message when `.claude/skills` does not exist and nothing says it should not yet. */
export const SKILLS_ALIAS_MISSING_ERROR = 'Claude skills alias missing: .claude/skills';
/**
 * Written by `repairAgentSurfaces({ deferSkillsAlias: true })` on the run that
 * applies the cross-harness migration, under the gitignored marker directory
 * the updater already owns. While it exists the check reports the alias as
 * `deferred` instead of missing, so the migration commit passes the pre-commit
 * gate; the next `repairClaudeSkillsAlias` (`bun run agents:compat`) creates
 * the alias and removes it.
 */
export const SKILLS_ALIAS_DEFERRED_MARKER = '.template/upstream-sha/claude-skills-alias.deferred';

const WRAPPER_HOSTS = [
  { id: 'claude', directory: '.claude/commands' },
  { id: 'opencode', directory: '.opencode/commands' },
] as const;

interface CommandAlias {
  alias: string
  skill: string
  mode: string
  description: string
  argumentHint: string
  forwardArguments: true
  mutability: 'read-only' | 'local-write' | 'local-write-after-approval' | 'external-write-after-approval' | 'external-and-local-write-after-approval'
}

interface CommandAliasManifest {
  version: 1
  wrapperHosts: Array<(typeof WRAPPER_HOSTS)[number]['id']>
  aliases: CommandAlias[]
}

/** The overlay may omit `wrapperHosts`; when present it is ignored (upstream owns it). */
interface CommandAliasOverlay {
  version: 1
  wrapperHosts?: CommandAliasManifest['wrapperHosts']
  aliases: CommandAlias[]
}

export interface MergedCommandAlias extends CommandAlias {
  /** Which manifest the winning definition came from. */
  source: 'upstream' | 'project'
}

export interface MergedCommandAliases {
  wrapperHosts: CommandAliasManifest['wrapperHosts']
  aliases: MergedCommandAlias[]
  /** True when `.agents/compatibility/command-aliases.project.json` exists. */
  overlayPresent: boolean
}

export interface CompatibilityPaths {
  root: string
  instructions: string
  claudeShim: string
  canonicalSkills: string
  claudeSkills: string
}

export interface AliasStatus {
  path: string
  target: string
  type: 'symlink' | 'junction'
  status: 'created' | 'repaired' | 'valid'
}

export interface CompatibilityCheck {
  ok: boolean
  errors: string[]
  /** `deferred`: absent on purpose until the migration commit (see SKILLS_ALIAS_DEFERRED_MARKER). */
  alias: Omit<AliasStatus, 'status'> & { status: 'missing' | 'invalid' | 'valid' | 'deferred' }
}

/** The surface a compatibility error belongs to, so a report can group them. */
export type CompatibilityErrorGroup = 'alias' | 'wrappers' | 'hooks' | 'mcp' | 'instructions';

export const COMPATIBILITY_GROUP_ORDER: CompatibilityErrorGroup[] = ['instructions', 'alias', 'wrappers', 'hooks', 'mcp'];

export const COMPATIBILITY_GROUP_LABEL: Record<CompatibilityErrorGroup, string> = {
  instructions: 'Instructions (AGENTS.md + CLAUDE.md shim, canonical skills)',
  alias: 'Claude skills alias (.claude/skills)',
  wrappers: 'Command wrappers (.claude/commands, .opencode/commands)',
  hooks: 'Hook adapters',
  mcp: 'MCP parity (.mcp.json, opencode.jsonc, .codex/config.toml)',
};

/** Classify one error message by its wording (the messages are ours). */
export function compatibilityErrorGroup(message: string): CompatibilityErrorGroup {
  if (/\bMCP\b/.test(message)) { return 'mcp'; }
  if (/command wrapper|command alias/i.test(message)) { return 'wrappers'; }
  if (/skills alias|\.claude\/skills/i.test(message)) { return 'alias'; }
  if (/hook/i.test(message)) { return 'hooks'; }
  return 'instructions';
}

/** Errors bucketed per surface, in `COMPATIBILITY_GROUP_ORDER`; empty groups omitted. */
export function groupCompatibilityErrors(errors: readonly string[]): Array<{ group: CompatibilityErrorGroup, label: string, errors: string[] }> {
  const buckets = new Map<CompatibilityErrorGroup, string[]>();
  for (const error of errors) {
    const group = compatibilityErrorGroup(error);
    buckets.set(group, [...(buckets.get(group) ?? []), error]);
  }
  return COMPATIBILITY_GROUP_ORDER
    .filter(group => buckets.has(group))
    .map(group => ({ group, label: COMPATIBILITY_GROUP_LABEL[group], errors: buckets.get(group)! }));
}

/**
 * One line about the alias, printed whatever the overall verdict: "alias
 * pending the migration commit" and "MCP drift" must never collapse into one
 * flat failure.
 */
export function describeAliasStatus(alias: CompatibilityCheck['alias'] | AliasStatus): string {
  const where = `${alias.path} -> ${alias.target} (${alias.type})`;
  switch (alias.status) {
    case 'created': return `Claude skills alias created: ${where}`;
    case 'repaired': return `Claude skills alias repaired: ${where}`;
    case 'valid': return `Claude skills alias OK: ${where}`;
    case 'deferred': return 'Claude skills alias deferred until the migration commit (`bun run agents:compat` creates it afterwards).';
    case 'missing': return `Claude skills alias missing: ${alias.path} (run \`bun run agents:compat\`).`;
    case 'invalid': return `Claude skills alias invalid: ${alias.path} is not the generated ${alias.type} to ${alias.target}.`;
  }
}

export function compatibilityPaths(root = process.cwd()): CompatibilityPaths {
  const resolvedRoot = resolve(root);
  return {
    root: resolvedRoot,
    instructions: join(resolvedRoot, 'AGENTS.md'),
    claudeShim: join(resolvedRoot, 'CLAUDE.md'),
    canonicalSkills: join(resolvedRoot, '.agents', 'skills'),
    claudeSkills: join(resolvedRoot, '.claude', 'skills'),
  };
}

function aliasType(platform: NodeJS.Platform): AliasStatus['type'] {
  return platform === 'win32' ? 'junction' : 'symlink';
}

function desiredAliasTarget(paths: CompatibilityPaths, platform: NodeJS.Platform): string {
  return platform === 'win32' ? paths.canonicalSkills : POSIX_CLAUDE_SKILLS_TARGET;
}

function resolvesToCanonical(
  linkPath: string,
  actualTarget: string,
  canonicalTarget: string,
): boolean {
  const resolvedTarget = isAbsolute(actualTarget)
    ? resolve(actualTarget)
    : resolve(join(linkPath, '..'), actualTarget);
  return normalize(resolvedTarget) === normalize(resolve(canonicalTarget));
}

function lstatIfPresent(path: string): Stats | null {
  try {
    return lstatSync(path);
  }
  catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') { return null; }
    throw error;
  }
}

/**
 * True when `.claude/skills` is a real directory holding NOTHING but symlinks that
 * resolve inside `.agents/skills` — i.e. the shim the `skills` CLI writes.
 *
 * `bunx skills add` (project level) installs the skill body into `.agents/skills/<slug>/`
 * and then, for Claude Code compatibility, creates `.claude/skills/` as a REAL directory
 * containing one symlink per skill. That collides head-on with our single directory-level
 * alias: `bun run setup` installs community skills BEFORE repairing compatibility, so a
 * clean clone hit "Refusing to replace" and the install aborted.
 *
 * Reclaiming that specific shape is lossless — every entry is a pointer, the bodies live
 * in the canonical store and are untouched. Anything else (a real subdirectory, a file, a
 * symlink aiming outside `.agents/skills`) means somebody put real work there, and the
 * caller must still refuse rather than delete it.
 */
function isSkillsCliShim(claudeSkills: string, canonicalSkills: string): boolean {
  let entries: string[];
  try { entries = readdirSync(claudeSkills); }
  catch { return false; }

  const canonical = resolve(canonicalSkills);
  return entries.every((entry) => {
    // Finder/Explorer leftovers carry no content: they must not make an otherwise
    // reclaimable shim look like a directory holding somebody's work.
    if (OS_METADATA_FILES.has(entry)) { return true; }
    const child = join(claudeSkills, entry);
    const stats = lstatIfPresent(child);
    if (stats === null || !stats.isSymbolicLink()) { return false; }
    const resolved = resolve(claudeSkills, readlinkSync(child));
    return isInside(resolved, canonical);
  });
}

/**
 * True when `target` is `parent` itself or sits under it.
 *
 * Uses `relative()` rather than a string prefix on purpose. `resolve()` returns
 * `C:\repo\.agents\skills` on Windows, so comparing against `` `${parent}/` `` never
 * matches there — every legitimate per-skill symlink would read as "content", the
 * alias repair would refuse, and a clean Windows install would abort. Same class of
 * separator bug a downstream user hit on Windows-with-bash, where `process.platform`
 * is still `win32` even though the shell is not.
 */
export function isInside(target: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function validateCanonicalSources(root = process.cwd()): string[] {
  const paths = compatibilityPaths(root);
  try {
    assertCanonicalSources(paths);
    return [];
  }
  catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

function assertCanonicalSources(paths: CompatibilityPaths): void {
  if (!existsSync(paths.instructions) || !lstatSync(paths.instructions).isFile()) {
    throw new Error(`Canonical instructions missing: ${relative(paths.root, paths.instructions)}`);
  }
  if (!existsSync(paths.canonicalSkills) || !lstatSync(paths.canonicalSkills).isDirectory()) {
    throw new Error(`Canonical skills directory missing: ${relative(paths.root, paths.canonicalSkills)}`);
  }
  if (!existsSync(paths.claudeShim) || !lstatSync(paths.claudeShim).isFile()) {
    throw new Error(`Claude instruction shim missing: ${relative(paths.root, paths.claudeShim)}`);
  }
  const shim = readFileSync(paths.claudeShim, 'utf8');
  if (shim !== CLAUDE_INSTRUCTIONS_SHIM) {
    throw new Error('CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.');
  }
}

function commandWrapper(alias: CommandAlias): string {
  return `---\ndescription: ${alias.description}\nargument-hint: ${alias.argumentHint}\n---\n\nInvoke skill \`${alias.skill}\` in mode \`${alias.mode}\`.\nForward \`$ARGUMENTS\` unchanged.\n`;
}

function readCommandAliasManifest(root: string): CommandAliasManifest {
  const manifestPath = join(root, COMMAND_ALIAS_MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new Error(`Command alias manifest missing: ${COMMAND_ALIAS_MANIFEST}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as CommandAliasManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.aliases)) {
    throw new Error('Command alias manifest must have version 1 and an aliases array.');
  }
  return manifest;
}

function readCommandAliasOverlay(root: string): CommandAliasOverlay | null {
  const overlayPath = join(root, COMMAND_ALIAS_PROJECT_MANIFEST);
  if (!existsSync(overlayPath)) { return null; }

  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as CommandAliasOverlay;
  if (overlay.version !== 1 || !Array.isArray(overlay.aliases)) {
    throw new Error(`Project command alias overlay must have version 1 and an aliases array: ${COMMAND_ALIAS_PROJECT_MANIFEST}`);
  }
  return overlay;
}

/**
 * Upstream manifest merged with the optional project overlay. Order is
 * upstream first, so an overlay entry with the same `alias` replaces the
 * upstream definition in place and a new alias lands at the end.
 */
export function mergedCommandAliases(root = process.cwd()): MergedCommandAliases {
  const resolvedRoot = resolve(root);
  const upstream = readCommandAliasManifest(resolvedRoot);
  const overlay = readCommandAliasOverlay(resolvedRoot);

  const merged = new Map<string, MergedCommandAlias>();
  for (const alias of upstream.aliases) {
    merged.set(alias.alias, { ...alias, source: 'upstream' });
  }
  for (const alias of overlay?.aliases ?? []) {
    merged.set(alias.alias, { ...alias, source: 'project' });
  }
  return {
    wrapperHosts: upstream.wrapperHosts,
    aliases: [...merged.values()],
    overlayPresent: overlay !== null,
  };
}

/**
 * Wrapper files under the host command directories that no manifest produced,
 * as repo-relative paths. Never deleted by the repair: a project either declares
 * the alias in the overlay or removes the file itself.
 */
export function undeclaredCommandWrappers(root = process.cwd()): string[] {
  const resolvedRoot = resolve(root);
  const declared = new Set(mergedCommandAliases(resolvedRoot).aliases.map(alias => `${alias.alias}.md`));
  const extra: string[] = [];
  for (const host of WRAPPER_HOSTS) {
    const directory = join(resolvedRoot, host.directory);
    let entries: string[];
    try { entries = readdirSync(directory); }
    catch { continue; }
    for (const entry of entries.sort()) {
      if (OS_METADATA_FILES.has(entry) || !entry.endsWith('.md') || declared.has(entry)) { continue; }
      const stats = lstatIfPresent(join(directory, entry));
      if (stats === null || !stats.isFile()) { continue; }
      extra.push(`${host.directory}/${entry}`);
    }
  }
  return extra;
}

export function validateCommandAliases(root: string): string[] {
  const errors: string[] = [];
  let manifest: MergedCommandAliases;
  try {
    manifest = mergedCommandAliases(root);
  }
  catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const expectedHosts = WRAPPER_HOSTS.map(host => host.id);
  if (JSON.stringify(manifest.wrapperHosts) !== JSON.stringify(expectedHosts)) {
    errors.push(`Command alias wrapperHosts must be exactly: ${expectedHosts.join(', ')}`);
  }

  const aliases = new Set<string>();
  for (const alias of manifest.aliases) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alias.alias)) {
      errors.push(`Invalid command alias: ${alias.alias}`);
      continue;
    }
    if (aliases.has(alias.alias)) {
      errors.push(`Duplicate command alias: ${alias.alias}`);
      continue;
    }
    aliases.add(alias.alias);

    if (alias.forwardArguments !== true) {
      errors.push(`Command alias must forward arguments: ${alias.alias}`);
    }

    const skillPath = join(root, '.agents', 'skills', alias.skill, 'SKILL.md');
    if (!existsSync(skillPath)) {
      errors.push(`Command alias target skill missing: ${alias.alias} -> ${alias.skill}`);
      continue;
    }
    const skill = readFileSync(skillPath, 'utf8');
    if (!skill.includes(`name: ${alias.skill}`)) {
      errors.push(`Command alias target has mismatched skill name: ${alias.skill}`);
    }
    if (!skill.includes(`\`${alias.mode}\``)) {
      errors.push(`Command alias target mode missing: ${alias.alias} -> ${alias.skill}:${alias.mode}`);
    }

    const expected = commandWrapper(alias);
    for (const host of WRAPPER_HOSTS) {
      const wrapperPath = join(root, host.directory, `${alias.alias}.md`);
      if (!existsSync(wrapperPath)) {
        errors.push(`${host.id} command wrapper missing: ${relative(root, wrapperPath)}`);
        continue;
      }
      const actual = readFileSync(wrapperPath, 'utf8');
      if (actual !== expected) {
        const copiedWorkflow = actual.split('\n').length > expected.split('\n').length + 2;
        errors.push(`${host.id} command wrapper ${copiedWorkflow ? 'contains workflow prose' : 'is stale'}: ${relative(root, wrapperPath)}`);
      }
    }
  }

  for (const wrapper of undeclaredCommandWrappers(root)) {
    errors.push(`Command wrapper not declared in any manifest: ${wrapper}; add it to ${COMMAND_ALIAS_PROJECT_MANIFEST} or delete it`);
  }

  return errors;
}

export function commandWrapperCounts(root = process.cwd()): {
  expected: number
  claude: number
  opencode: number
} {
  const resolvedRoot = resolve(root);
  const manifest = mergedCommandAliases(resolvedRoot);
  const aliases = new Set(manifest.aliases.map(alias => `${alias.alias}.md`));
  const count = (directory: string): number => [...aliases]
    .filter(name => existsSync(join(resolvedRoot, directory, name)))
    .length;
  return {
    expected: aliases.size,
    claude: count('.claude/commands'),
    opencode: count('.opencode/commands'),
  };
}

export function claudeSkillsAliasPlan(
  root = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): Omit<AliasStatus, 'status'> {
  const paths = compatibilityPaths(root);
  return {
    path: paths.claudeSkills,
    target: desiredAliasTarget(paths, platform),
    type: aliasType(platform),
  };
}

export function repairCommandWrappers(root = process.cwd()): number {
  const resolvedRoot = resolve(root);
  const manifest = mergedCommandAliases(resolvedRoot);
  let written = 0;
  for (const host of WRAPPER_HOSTS) {
    const directory = join(resolvedRoot, host.directory);
    mkdirSync(directory, { recursive: true });
    for (const alias of manifest.aliases) {
      const path = join(directory, `${alias.alias}.md`);
      const expected = commandWrapper(alias);
      if (!existsSync(path) || readFileSync(path, 'utf8') !== expected) {
        writeFileSync(path, expected);
        written++;
      }
    }
  }
  return written;
}

export function checkAgentCompatibility(
  root = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): CompatibilityCheck {
  const paths = compatibilityPaths(root);
  const type = aliasType(platform);
  const target = desiredAliasTarget(paths, platform);
  const errors: string[] = [];

  try {
    assertCanonicalSources(paths);
    errors.push(...validateCommandAliases(paths.root));
    errors.push(...validateHookCompatibility(paths.root));
    errors.push(...validateMcpParity(paths.root));
  }
  catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const entry = lstatIfPresent(paths.claudeSkills);
  if (entry === null) {
    if (existsSync(join(paths.root, SKILLS_ALIAS_DEFERRED_MARKER))) {
      return { ok: errors.length === 0, errors, alias: { path: paths.claudeSkills, target, type, status: 'deferred' } };
    }
    errors.push(SKILLS_ALIAS_MISSING_ERROR);
    return { ok: false, errors, alias: { path: paths.claudeSkills, target, type, status: 'missing' } };
  }

  if (!entry.isSymbolicLink()) {
    errors.push('Refusing compatibility state: .claude/skills exists but is not a generated symlink or junction.');
    return { ok: false, errors, alias: { path: paths.claudeSkills, target, type, status: 'invalid' } };
  }

  const actualTarget = readlinkSync(paths.claudeSkills);
  const exactTarget = platform === 'win32'
    ? resolvesToCanonical(paths.claudeSkills, actualTarget, paths.canonicalSkills)
    : actualTarget === POSIX_CLAUDE_SKILLS_TARGET;
  if (!exactTarget) {
    errors.push(`Claude skills alias has unexpected target: ${actualTarget}`);
    return { ok: false, errors, alias: { path: paths.claudeSkills, target, type, status: 'invalid' } };
  }

  return {
    ok: errors.length === 0,
    errors,
    alias: { path: paths.claudeSkills, target, type, status: 'valid' },
  };
}

export interface AgentSurfaceRepair {
  /** Null when the alias was deferred (see `deferSkillsAlias`). */
  alias: AliasStatus | null
  /** Null when the manifest is absent (the wrappers cannot be rendered yet). */
  wrappersWritten: number | null
  check: CompatibilityCheck
  aliasDeferred: boolean
}

/**
 * What `bun run up` does after every apply, and `bun run agents:compat` on
 * demand: render the wrappers, repair the alias, run the check.
 *
 * `deferSkillsAlias` is for the run in which the cross-harness migration just
 * unindexed a committed `.claude/skills/` tree: those deletions are staged, and
 * git refuses to touch an index entry behind a symlink (`is beyond a symbolic
 * link`), so creating the alias now would break lint-staged on the very commit
 * that records the migration. The alias waits for `bun run agents:compat`
 * after that commit; the marker makes the check (and the pre-commit gate that
 * runs it) treat its absence as expected rather than as a broken contract, and
 * every other contract is still enforced.
 */
export function repairAgentSurfaces(
  root = process.cwd(),
  options: { deferSkillsAlias?: boolean } = {},
  platform: NodeJS.Platform = process.platform,
): AgentSurfaceRepair {
  const resolvedRoot = resolve(root);
  let alias: AliasStatus | null = null;
  if (options.deferSkillsAlias) {
    const marker = join(resolvedRoot, SKILLS_ALIAS_DEFERRED_MARKER);
    mkdirSync(join(marker, '..'), { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`);
  }
  else {
    alias = repairClaudeSkillsAlias(resolvedRoot, platform);
  }
  const wrappersWritten = existsSync(join(resolvedRoot, COMMAND_ALIAS_MANIFEST)) ? repairCommandWrappers(resolvedRoot) : null;
  const check = checkAgentCompatibility(resolvedRoot, platform);
  return { alias, wrappersWritten, check, aliasDeferred: options.deferSkillsAlias === true };
}

export function repairClaudeSkillsAlias(
  root = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): AliasStatus {
  const paths = compatibilityPaths(root);
  assertCanonicalSources(paths);
  mkdirSync(join(paths.root, '.claude'), { recursive: true });
  // The alias exists (or is about to) from here on: the deferral is over.
  rmSync(join(paths.root, SKILLS_ALIAS_DEFERRED_MARKER), { force: true });

  const target = desiredAliasTarget(paths, platform);
  const type = aliasType(platform);
  let status: AliasStatus['status'] = 'created';

  const entry = lstatIfPresent(paths.claudeSkills);
  if (entry !== null) {
    if (!entry.isSymbolicLink()) {
      // Reclaim the `skills` CLI's per-skill symlink shim (see isSkillsCliShim);
      // refuse anything holding real content.
      if (entry.isDirectory() && isSkillsCliShim(paths.claudeSkills, paths.canonicalSkills)) {
        rmSync(paths.claudeSkills, { recursive: true, force: true });
        symlinkSync(target, paths.claudeSkills, platform === 'win32' ? 'junction' : 'dir');
        return { path: paths.claudeSkills, target, type, status: 'repaired' };
      }
      throw new Error('Refusing to replace .claude/skills because it is a real directory or file, not a generated alias.');
    }

    const actualTarget = readlinkSync(paths.claudeSkills);
    const isExpected = platform === 'win32'
      ? resolvesToCanonical(paths.claudeSkills, actualTarget, paths.canonicalSkills)
      : actualTarget === POSIX_CLAUDE_SKILLS_TARGET;
    if (isExpected) {
      return { path: paths.claudeSkills, target, type, status: 'valid' };
    }

    unlinkSync(paths.claudeSkills);
    status = 'repaired';
  }

  symlinkSync(target, paths.claudeSkills, platform === 'win32' ? 'junction' : 'dir');
  return { path: paths.claudeSkills, target, type, status };
}
