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
  alias: Omit<AliasStatus, 'status'> & { status: 'missing' | 'invalid' | 'valid' }
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

export function validateCommandAliases(root: string): string[] {
  const errors: string[] = [];
  let manifest: CommandAliasManifest;
  try {
    manifest = readCommandAliasManifest(root);
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

  return errors;
}

export function commandWrapperCounts(root = process.cwd()): {
  expected: number
  claude: number
  opencode: number
} {
  const resolvedRoot = resolve(root);
  const manifest = readCommandAliasManifest(resolvedRoot);
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
  const manifest = readCommandAliasManifest(resolvedRoot);
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
    errors.push('Claude skills alias missing: .claude/skills');
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

export function repairClaudeSkillsAlias(
  root = process.cwd(),
  platform: NodeJS.Platform = process.platform,
): AliasStatus {
  const paths = compatibilityPaths(root);
  assertCanonicalSources(paths);
  mkdirSync(join(paths.root, '.claude'), { recursive: true });

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
