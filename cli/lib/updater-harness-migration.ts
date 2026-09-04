/**
 * @fileoverview One-time preflight that migrates a Claude-only consumer repo to the
 * cross-harness layout, BEFORE `runUpdate` syncs a single component.
 *
 * WHY THIS EXISTS
 * ---------------
 * The boilerplate used to keep its instructions in `CLAUDE.md`, its skills in
 * `.claude/skills/` and its personality hook in `.claude/hooks/`. It now keeps
 * instructions in `AGENTS.md` (which OpenCode and Codex read natively), skills in
 * `.agents/skills/` and the hook emitter in `.agents/hooks/`, with `.claude/skills`
 * reduced to a generated, gitignored alias and `CLAUDE.md` to a one-line `@AGENTS.md`
 * shim. Without this preflight, `bun run up` on a repo scaffolded before that change
 * is DESTRUCTIVE, in three compounding ways:
 *
 *   1. `CLAUDE.md` holds the project's own AI memory (identity, env URLs, custom
 *      rules). Nothing else knows that content exists: the sync never delivers an
 *      `AGENTS.md` (it is on the protected watchlist, never synced), so the repo
 *      ends up with a shim pointing at a file that does not exist and NO
 *      instructions at all.
 *   2. `.claude/skills/` is not in `deprecatedFiles`, so the project keeps its old
 *      tree while also receiving `.agents/skills/`. Two diverging copies of every
 *      skill, and `repairClaudeSkillsAlias` then refuses to touch a real directory,
 *      which fails the compatibility hook on every subsequent run.
 *   3. Git refuses every index entry behind a symlink (`is beyond a symbolic link`),
 *      so a repo that committed `.claude/skills/*` cannot `git add` or stash once
 *      the alias exists, which breaks lint-staged and the whole pre-commit hook.
 *
 * WHAT IT GUARANTEES
 * ------------------
 * Nothing is deleted. Content either MOVES to its canonical home or is preserved
 * under `.template/pre-agents-migration/`. The pass is idempotent: an already
 * migrated repo plans zero actions. If any single item cannot be resolved without
 * guessing, the whole migration refuses rather than half-applying.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { CLAUDE_INSTRUCTIONS_SHIM, isInside, OS_METADATA_FILES } from './agent-compatibility.ts';

/**
 * Repo-relative, POSIX-separated on purpose. It is written into `.gitignore` (whose
 * patterns are always `/`), printed to the user, and asserted on in tests. Building it
 * with `join()` yields `.template\\pre-agents-migration` on Windows, which would make the
 * ignore rule match nothing and leave the project's own pre-migration CLAUDE.md
 * committable. `join(root, MIGRATION_BACKUP_DIR)` still resolves correctly on every
 * platform, so filesystem use is unaffected.
 */
export const MIGRATION_BACKUP_DIR = '.template/pre-agents-migration';

/**
 * The Claude-only personality hook. Its emitter now lives in
 * `.agents/hooks/personality-reinject.mjs` and `.claude/settings.json` (delivered
 * once, then project-owned) must point there; the contract check rejects a repo
 * that still carries this copy.
 */
export const LEGACY_CLAUDE_HOOK = '.claude/hooks/personality-reinject.js';

/** Where the emitter lives now; `.claude/settings.json` must point here. */
export const CANONICAL_HOOK_EMITTER = '.agents/hooks/personality-reinject.mjs';
export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';

/** What the instruction files need. */
export type InstructionsAction
  /** `AGENTS.md` already exists and `CLAUDE.md` is the shim (or absent): nothing to do. */
  = | 'none'
  /** `CLAUDE.md` holds the real memory: copy it to `AGENTS.md`, then write the shim. */
    | 'promote-claude-md'
  /** `CLAUDE.md` says `@AGENTS.md` with stray whitespace: rewrite the exact bytes. */
    | 'normalize-shim'
  /** `CLAUDE.md` is already the shim but `AGENTS.md` is missing: broken, cannot fix here. */
    | 'orphaned-shim'
  /** Both files carry prose. Which one is canonical is a judgment call, so refuse. */
    | 'conflicting-instructions';

export interface HarnessMigrationPlan {
  instructions: InstructionsAction
  /** Real skill directories under `.claude/skills/` that must move to `.agents/skills/`. */
  skillsToMove: string[]
  /**
   * Real skill directories that already exist under `.agents/skills/`. Upstream owns
   * that name, so the legacy copy is archived instead of moved: never silently
   * dropped, never allowed to overwrite the canonical one.
   */
  skillsToArchive: string[]
  /** Per-skill symlinks written by the `skills` CLI: pointers only, safe to drop. */
  skillsShimLinks: string[]
  /** True when `.claude/skills` is a real directory that must be replaced by the alias. */
  replacesClaudeSkillsDirectory: boolean
  /** True when the Claude-only hook copy still exists and must be archived. */
  archivesLegacyHook: boolean
  /**
   * True when `.claude/settings.json` still names the legacy hook path. That file
   * is project-owned (protected watchlist, never synced), so nothing downstream
   * would repoint it: archiving the emitter without this leaves Claude Code
   * running a hook command whose file no longer exists, on every prompt.
   */
  repointsSettingsHook: boolean
  needed: boolean
  /** Non-empty when the migration must refuse instead of guessing. */
  blockers: string[]
}

export interface HarnessMigrationResult {
  plan: HarnessMigrationPlan
  applied: boolean
  movedSkills: string[]
  archivedSkills: string[]
  promotedInstructions: boolean
  archivedLegacyHook: boolean
  backupDir: string | null
  /** Index entries dropped from `.claude/skills` so git can work behind the alias. */
  unindexedFiles: number
  /** `.gitignore` entries appended so the generated artifacts stay out of the repo. */
  ignoredEntriesAdded: string[]
  /** True when the hook command in `.claude/settings.json` was repointed to the canonical emitter. */
  repointedSettingsHook: boolean
}

/**
 * Env var through which the wrapper hands an applied migration result to the
 * self-update re-exec child (JSON of `HarnessMigrationResult`). The child plans
 * nothing (the repo is migrated by then), yet it owns the end-of-run report:
 * without this it would neither list what THIS run archived nor know that the
 * `.claude/skills` alias must wait for the migration commit.
 */
export const HARNESS_MIGRATION_RESULT_ENV = 'UPEX_UPDATER_MIGRATION_RESULT';

/** Parse the result a parent process serialized, or null when absent or malformed. */
export function readHarnessMigrationResultFromEnv(env: NodeJS.ProcessEnv = process.env): HarnessMigrationResult | null {
  const raw = env[HARNESS_MIGRATION_RESULT_ENV];
  if (!raw) { return null; }
  try {
    const parsed = JSON.parse(raw) as Partial<HarnessMigrationResult>;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.applied !== 'boolean' || !Array.isArray(parsed.archivedSkills)) {
      return null;
    }
    return parsed as HarnessMigrationResult;
  }
  catch {
    return null;
  }
}

/**
 * Repo-relative paths an applied migration wrote, moved or unindexed. The
 * updater's dirty-tree guard exempts exactly these: a tree that was clean before
 * `bun run up` must not be refused because the preflight did its job.
 */
export function harnessMigrationTouchedPaths(result: HarnessMigrationResult): string[] {
  if (!result.applied) { return []; }
  const paths = new Set<string>();
  if (result.promotedInstructions) { paths.add('AGENTS.md'); paths.add('CLAUDE.md'); }
  if (result.plan.instructions === 'normalize-shim') { paths.add('CLAUDE.md'); }
  if (result.plan.replacesClaudeSkillsDirectory) { paths.add('.claude/skills'); }
  for (const skill of result.movedSkills) { paths.add(`.agents/skills/${skill}`); }
  if (result.archivedLegacyHook) { paths.add(LEGACY_CLAUDE_HOOK); }
  if (result.repointedSettingsHook) { paths.add(CLAUDE_SETTINGS_FILE); }
  if (result.ignoredEntriesAdded.length > 0) { paths.add('.gitignore'); }
  paths.add(MIGRATION_BACKUP_DIR);
  return [...paths];
}

/**
 * Drops `.claude/skills` from the git INDEX, leaving the working tree alone.
 *
 * Once that path becomes a symlink, git refuses to touch any index entry beneath
 * it (`error: '.claude/skills/REGISTRY.md' is beyond a symbolic link`). In a repo
 * that committed its skills under the old location, that breaks `git add`,
 * `git stash`, and therefore lint-staged and the whole pre-commit hook, on the
 * very first commit after the update. Observed, not theoretical.
 *
 * `git rm --cached` only unstages: every file has already been moved to
 * `.agents/skills/` or archived by this point, so nothing on disk is at risk. The
 * result is a staged rename the developer reviews and commits normally.
 *
 * Silent no-op outside a git repo, with git missing, or when nothing is tracked.
 */
function unindexLegacySkillTree(root: string): number {
  const tracked = spawnSync('git', ['-C', root, 'ls-files', '--', '.claude/skills'], { encoding: 'utf8' });
  if (tracked.status !== 0 || tracked.stdout.trim() === '') { return 0; }

  const removed = spawnSync(
    'git',
    ['-C', root, 'rm', '-r', '--cached', '--quiet', '--ignore-unmatch', '--', '.claude/skills'],
    { encoding: 'utf8' },
  );
  return removed.status === 0 ? tracked.stdout.trim().split('\n').length : 0;
}

/**
 * Guarantees `.gitignore` excludes the two paths this migration creates, appending
 * only the lines that are missing.
 *
 * The alias and the backup are both per-developer artifacts, and both appear in the
 * working tree BEFORE the sync ships an updated `.gitignore` (the preflight runs
 * first by design). A project that commits in that window publishes a symlink and a
 * copy of its own pre-migration instructions. Verified: without this, the migrated
 * consumer's next `git add -A` stages `.claude/skills` and
 * `.template/pre-agents-migration/CLAUDE.md`.
 *
 * Idempotent: an entry already present, in any block, is left alone.
 */
function ensureGeneratedArtifactsIgnored(root: string): string[] {
  const gitignore = join(root, '.gitignore');
  const existing = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const lines = new Set(existing.split('\n').map(line => line.trim()));

  const wanted: Array<[string, string]> = [
    ['.claude/skills', 'Generated alias onto .agents/skills. Never edit or commit it.'],
    [`${MIGRATION_BACKUP_DIR}/`, 'Local recovery copy written by the cross-harness migration.'],
  ];
  const missing = wanted.filter(([entry]) => !lines.has(entry) && !lines.has(`${entry}/`) && !lines.has(entry.replace(/\/$/, '')));
  if (missing.length === 0) { return []; }

  const block = ['', '# ===== Cross-harness generated artifacts ====='];
  for (const [entry, why] of missing) { block.push(`# ${why}`, entry); }
  writeFileSync(gitignore, `${existing.replace(/\n*$/, '')}\n${block.join('\n')}\n`);
  return missing.map(([entry]) => entry);
}

function isRealDirectory(path: string): boolean {
  if (!existsSync(path)) { return false; }
  const stats = lstatSync(path);
  return stats.isDirectory() && !stats.isSymbolicLink();
}

function isRealFile(path: string): boolean {
  if (!existsSync(path)) { return false; }
  const stats = lstatSync(path);
  return stats.isFile() && !stats.isSymbolicLink();
}

function planInstructions(root: string, blockers: string[]): InstructionsAction {
  const agentsMd = join(root, 'AGENTS.md');
  const claudeMd = join(root, 'CLAUDE.md');

  // Neither file exists: not a boilerplate consumer yet, the sync will seed it.
  if (!existsSync(claudeMd)) { return 'none'; }

  const claudeContent = readFileSync(claudeMd, 'utf8');
  const isExactShim = claudeContent === CLAUDE_INSTRUCTIONS_SHIM;
  const isLooseShim = !isExactShim && claudeContent.trim() === CLAUDE_INSTRUCTIONS_SHIM.trim();

  if (existsSync(agentsMd)) {
    if (isExactShim) { return 'none'; }
    if (isLooseShim) { return 'normalize-shim'; }
    blockers.push(
      'AGENTS.md and CLAUDE.md both carry instructions, and only one may be canonical. Merge whatever '
      + 'CLAUDE.md still holds into AGENTS.md, replace CLAUDE.md with the single line `@AGENTS.md`, '
      + 'then re-run `bun run up`.',
    );
    return 'conflicting-instructions';
  }

  if (isExactShim || isLooseShim) {
    blockers.push(
      'CLAUDE.md is already the `@AGENTS.md` shim but AGENTS.md does not exist, so this repo '
      + 'currently has NO instructions. Restore AGENTS.md from git history (`git log --diff-filter=D '
      + `-- AGENTS.md\`) or from \`${MIGRATION_BACKUP_DIR}/\`, then re-run \`bun run up\`.`,
    );
    return 'orphaned-shim';
  }
  return 'promote-claude-md';
}

/**
 * Read-only. Safe to call on any repo, in any state, including a fully migrated one.
 */
export function planHarnessMigration(root = process.cwd()): HarnessMigrationPlan {
  const resolvedRoot = resolve(root);
  const canonicalSkills = join(resolvedRoot, '.agents', 'skills');
  const claudeSkills = join(resolvedRoot, '.claude', 'skills');
  const blockers: string[] = [];

  const instructions = planInstructions(resolvedRoot, blockers);

  const skillsToMove: string[] = [];
  const skillsToArchive: string[] = [];
  const skillsShimLinks: string[] = [];
  const replacesClaudeSkillsDirectory = isRealDirectory(claudeSkills);

  if (replacesClaudeSkillsDirectory) {
    for (const entry of readdirSync(claudeSkills)) {
      const child = join(claudeSkills, entry);
      const stats = lstatSync(child);
      if (stats.isSymbolicLink()) {
        const target = resolve(claudeSkills, readlinkSync(child));
        if (isInside(target, canonicalSkills)) {
          skillsShimLinks.push(entry);
        }
        else {
          blockers.push(`.claude/skills/${entry} is a symlink pointing outside .agents/skills (${target}). Resolve it by hand.`);
        }
        continue;
      }
      if (!stats.isDirectory()) {
        // Finder and Explorer drop these into any directory they display. Blocking the
        // whole migration on one would stop every macOS consumer for a file nobody
        // authored and nobody wants kept.
        if (OS_METADATA_FILES.has(entry)) { continue; }
        // REGISTRY.md is generated from the skill set; `bun run skills:registry`
        // rebuilds it under `.agents/skills/` after the sync. Anything else is
        // somebody's work and must not be guessed at.
        if (entry === 'REGISTRY.md') { continue; }
        blockers.push(`.claude/skills/${entry} is a loose file, not a skill directory. Move or delete it by hand.`);
        continue;
      }
      if (existsSync(join(canonicalSkills, entry))) { skillsToArchive.push(entry); }
      else { skillsToMove.push(entry); }
    }
  }

  const archivesLegacyHook = isRealFile(join(resolvedRoot, LEGACY_CLAUDE_HOOK));
  const repointsSettingsHook = settingsNameLegacyHook(resolvedRoot);

  const needed = instructions === 'promote-claude-md'
    || instructions === 'normalize-shim'
    || skillsToMove.length > 0
    || skillsToArchive.length > 0
    || replacesClaudeSkillsDirectory
    || archivesLegacyHook
    || repointsSettingsHook;

  return {
    instructions,
    skillsToMove,
    skillsToArchive,
    skillsShimLinks,
    replacesClaudeSkillsDirectory,
    archivesLegacyHook,
    repointsSettingsHook,
    needed,
    blockers,
  };
}

function settingsNameLegacyHook(root: string): boolean {
  const settings = join(root, CLAUDE_SETTINGS_FILE);
  return isRealFile(settings) && readFileSync(settings, 'utf8').includes(LEGACY_CLAUDE_HOOK);
}

/** One human-readable line per action the plan will take. */
export function describeHarnessMigration(plan: HarnessMigrationPlan): string[] {
  const lines: string[] = [];
  if (plan.instructions === 'promote-claude-md') {
    lines.push('CLAUDE.md -> AGENTS.md (project memory becomes the canonical instruction body; CLAUDE.md becomes the `@AGENTS.md` shim)');
  }
  if (plan.instructions === 'normalize-shim') {
    lines.push('CLAUDE.md rewritten to exactly `@AGENTS.md` plus one newline (whitespace only)');
  }
  for (const skill of plan.skillsToMove) {
    lines.push(`.claude/skills/${skill}/ -> .agents/skills/${skill}/ (moved; this is the only copy)`);
  }
  for (const skill of plan.skillsToArchive) {
    lines.push(`.claude/skills/${skill}/ -> ${MIGRATION_BACKUP_DIR}/skills/${skill}/ (archived; .agents/skills already owns this name)`);
  }
  if (plan.skillsShimLinks.length > 0) {
    lines.push(`${plan.skillsShimLinks.length} per-skill symlink(s) dropped (pointers into .agents/skills, no content)`);
  }
  if (plan.replacesClaudeSkillsDirectory) {
    lines.push('.claude/skills/ replaced by the generated alias (symlink on POSIX, junction on Windows)');
  }
  if (plan.archivesLegacyHook) {
    lines.push(`${LEGACY_CLAUDE_HOOK} -> ${MIGRATION_BACKUP_DIR}/hooks/ (archived; the emitter now lives in .agents/hooks/)`);
  }
  if (plan.repointsSettingsHook) {
    lines.push(`${CLAUDE_SETTINGS_FILE}: hook command repointed to ${CANONICAL_HOOK_EMITTER} (path substring only; permissions and every other key untouched)`);
  }
  return lines;
}

/**
 * Applies the plan. Throws on blockers rather than half-migrating.
 *
 * Copy-then-remove, never `rename`: the backup directory and the repo can sit on
 * different devices, and a cross-device rename fails with EXDEV.
 */
export function applyHarnessMigration(
  root = process.cwd(),
  plan = planHarnessMigration(root),
): HarnessMigrationResult {
  const resolvedRoot = resolve(root);
  const empty: HarnessMigrationResult = {
    plan,
    applied: false,
    movedSkills: [],
    archivedSkills: [],
    promotedInstructions: false,
    archivedLegacyHook: false,
    backupDir: null,
    unindexedFiles: 0,
    ignoredEntriesAdded: [],
    repointedSettingsHook: false,
  };

  if (plan.blockers.length > 0) {
    throw new Error(`Cross-harness migration refused:\n  - ${plan.blockers.join('\n  - ')}`);
  }
  if (!plan.needed) { return empty; }

  const backupDir = join(resolvedRoot, MIGRATION_BACKUP_DIR);
  const canonicalSkills = join(resolvedRoot, '.agents', 'skills');
  const claudeSkills = join(resolvedRoot, '.claude', 'skills');
  const claudeMd = join(resolvedRoot, 'CLAUDE.md');
  mkdirSync(backupDir, { recursive: true });

  let promotedInstructions = false;
  if (plan.instructions === 'promote-claude-md') {
    // Back up the original BEFORE either write, so a crash between them is recoverable.
    cpSync(claudeMd, join(backupDir, 'CLAUDE.md'));
    cpSync(claudeMd, join(resolvedRoot, 'AGENTS.md'));
    writeFileSync(claudeMd, CLAUDE_INSTRUCTIONS_SHIM);
    promotedInstructions = true;
  }
  else if (plan.instructions === 'normalize-shim') {
    writeFileSync(claudeMd, CLAUDE_INSTRUCTIONS_SHIM);
  }

  const movedSkills: string[] = [];
  const archivedSkills: string[] = [];
  if (plan.replacesClaudeSkillsDirectory) {
    mkdirSync(canonicalSkills, { recursive: true });
    for (const skill of plan.skillsToMove) {
      cpSync(join(claudeSkills, skill), join(canonicalSkills, skill), { recursive: true });
      movedSkills.push(skill);
    }
    for (const skill of plan.skillsToArchive) {
      cpSync(join(claudeSkills, skill), join(backupDir, 'skills', skill), { recursive: true });
      archivedSkills.push(skill);
    }
    // Everything real is now either canonical or archived; what remains is pointers
    // and generated files.
    rmSync(claudeSkills, { recursive: true, force: true });
  }

  let archivedLegacyHook = false;
  if (plan.archivesLegacyHook) {
    const legacyHook = join(resolvedRoot, LEGACY_CLAUDE_HOOK);
    const archived = join(backupDir, 'hooks', 'personality-reinject.js');
    mkdirSync(dirname(archived), { recursive: true });
    cpSync(legacyHook, archived);
    rmSync(legacyHook, { force: true });
    // Only the file is ours to move. Drop the directory solely when nothing else
    // lives there, and never fail the migration over it.
    try { rmdirSync(dirname(legacyHook)); }
    catch { /* not empty, or already gone */ }
    archivedLegacyHook = true;
  }

  // Surgical string replacement, not a rewrite: the file holds the project's
  // permissions and is never synced, so only the stale path may change.
  let repointedSettingsHook = false;
  if (plan.repointsSettingsHook) {
    const settings = join(resolvedRoot, CLAUDE_SETTINGS_FILE);
    writeFileSync(settings, readFileSync(settings, 'utf8').split(LEGACY_CLAUDE_HOOK).join(CANONICAL_HOOK_EMITTER));
    repointedSettingsHook = true;
  }

  // Must happen while `.claude/skills` is gone and BEFORE the compatibility hook
  // puts a symlink there: git cannot rewrite an index entry behind one.
  const unindexedFiles = unindexLegacySkillTree(resolvedRoot);
  // Same window: the alias and the backup exist before the sync ships a .gitignore
  // that knows about them.
  const ignoredEntriesAdded = ensureGeneratedArtifactsIgnored(resolvedRoot);

  return {
    plan,
    applied: true,
    movedSkills,
    archivedSkills,
    promotedInstructions,
    archivedLegacyHook,
    backupDir,
    unindexedFiles,
    ignoredEntriesAdded,
    repointedSettingsHook,
  };
}
