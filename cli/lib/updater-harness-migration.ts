/**
 * @fileoverview One-time preflight that migrates a Claude-only consumer repo to the
 * cross-harness layout, BEFORE `runUpdate` syncs a single component.
 *
 * WHY THIS EXISTS
 * ---------------
 * The boilerplate used to keep its instructions in `CLAUDE.md` and its skills in
 * `.claude/skills/`. It now keeps instructions in `AGENTS.md` (which OpenCode and
 * Codex read natively) and skills in `.agents/skills/`, with `.claude/skills` reduced
 * to a generated, gitignored alias. Without this preflight, `bun run up` on a repo
 * scaffolded before that change is DESTRUCTIVE, in three compounding ways:
 *
 *   1. `CLAUDE.md` is a synced file (`agent-root-config`), and upstream's copy is now
 *      the one-line `@AGENTS.md` shim. The sync therefore OVERWRITES the project's
 *      own AI memory — identity, env URLs, custom rules — with eleven bytes.
 *   2. `AGENTS.md` is on the protected watchlist, which by design is never synced. So
 *      the shim written in step 1 points at a file that does not exist, and the repo
 *      is left with NO instructions at all.
 *   3. `.claude/skills/` is not in `deprecatedFiles`, so the project keeps its old
 *      tree while also receiving `.agents/skills/`. Two diverging copies of every
 *      skill — and `repairClaudeSkillsAlias` then refuses to touch a real directory,
 *      which throws inside the FIRST afterApply hook and silently skips every hook
 *      behind it (skills registry, kata manifest, env drift, git strategy, the yaml
 *      backfills, the PBI migration and the protected-drift advisory).
 *
 * WHAT IT GUARANTEES
 * ------------------
 * Nothing is deleted. Content either MOVES to its canonical home or is preserved
 * under `.template/pre-agents-migration/`. The pass is idempotent: an already
 * migrated repo plans zero actions. If any single item cannot be resolved without
 * guessing, the whole migration refuses rather than half-applying.
 */

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { CLAUDE_INSTRUCTIONS_SHIM, isInside } from './agent-compatibility.ts';

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
 * OS-generated files that turn up inside any browsed directory. They carry no
 * content, so both the migration and the alias repair skip them instead of
 * treating them as work somebody would miss.
 */
export const OS_METADATA_FILES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);

/** What the instruction files need. */
export type InstructionsAction
  /** `AGENTS.md` already exists — nothing to do. */
  = | 'none'
  /** `CLAUDE.md` holds the real memory: copy it to `AGENTS.md`, then write the shim. */
    | 'promote-claude-md'
  /** `CLAUDE.md` is already the shim but `AGENTS.md` is missing — broken, cannot fix here. */
    | 'orphaned-shim';

export interface HarnessMigrationPlan {
  instructions: InstructionsAction
  /** Real skill directories under `.claude/skills/` that must move to `.agents/skills/`. */
  skillsToMove: string[]
  /**
   * Real skill directories that already exist under `.agents/skills/`. Upstream owns
   * that name, so the legacy copy is archived instead of moved — never silently
   * dropped, never allowed to overwrite the canonical one.
   */
  skillsToArchive: string[]
  /** Per-skill symlinks written by the `skills` CLI: pointers only, safe to drop. */
  skillsShimLinks: string[]
  /** True when `.claude/skills` is a real directory that must be replaced by the alias. */
  replacesClaudeSkillsDirectory: boolean
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
  backupDir: string | null
  /** Index entries dropped from `.claude/skills` so git can work behind the alias. */
  unindexedFiles: number
  /** `.gitignore` entries appended so the generated artifacts stay out of the repo. */
  ignoredEntriesAdded: string[]
}

/**
 * Drops `.claude/skills` from the git INDEX, leaving the working tree alone.
 *
 * Once that path becomes a symlink, git refuses to touch any index entry beneath
 * it — `error: '.claude/skills/REGISTRY.md' is beyond a symbolic link`. In a repo
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
 * working tree BEFORE the sync ships an updated `.gitignore` — the preflight runs
 * first by design. A project that commits in that window publishes a symlink and a
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

/**
 * Read-only. Safe to call on any repo, in any state, including a fully migrated one.
 */
export function planHarnessMigration(root = process.cwd()): HarnessMigrationPlan {
  const resolvedRoot = resolve(root);
  const agentsMd = join(resolvedRoot, 'AGENTS.md');
  const claudeMd = join(resolvedRoot, 'CLAUDE.md');
  const canonicalSkills = join(resolvedRoot, '.agents', 'skills');
  const claudeSkills = join(resolvedRoot, '.claude', 'skills');
  const blockers: string[] = [];

  let instructions: InstructionsAction = 'none';
  if (!existsSync(agentsMd)) {
    if (!existsSync(claudeMd)) {
      // Neither file exists. Not a boilerplate consumer yet; the sync will seed it.
      instructions = 'none';
    }
    else if (readFileSync(claudeMd, 'utf8') === CLAUDE_INSTRUCTIONS_SHIM) {
      instructions = 'orphaned-shim';
      blockers.push(
        'CLAUDE.md is already the `@AGENTS.md` shim but AGENTS.md does not exist, so this repo '
        + 'currently has NO instructions. Restore AGENTS.md from git history (`git log --diff-filter=D '
        + '-- AGENTS.md`) or from `.template/pre-agents-migration/`, then re-run `bun run up`.',
      );
    }
    else {
      instructions = 'promote-claude-md';
    }
  }

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
        blockers.push(`.claude/skills/${entry} is a loose file, not a skill directory. Move or delete it by hand.`);
        continue;
      }
      if (existsSync(join(canonicalSkills, entry))) { skillsToArchive.push(entry); }
      else { skillsToMove.push(entry); }
    }
  }

  const needed = instructions === 'promote-claude-md'
    || skillsToMove.length > 0
    || skillsToArchive.length > 0
    || replacesClaudeSkillsDirectory;

  return {
    instructions,
    skillsToMove,
    skillsToArchive,
    skillsShimLinks,
    replacesClaudeSkillsDirectory,
    needed,
    blockers,
  };
}

/** One human-readable line per action the plan will take. */
export function describeHarnessMigration(plan: HarnessMigrationPlan): string[] {
  const lines: string[] = [];
  if (plan.instructions === 'promote-claude-md') {
    lines.push('CLAUDE.md -> AGENTS.md (project memory becomes the canonical instruction body; CLAUDE.md becomes the `@AGENTS.md` shim)');
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
    backupDir: null,
    unindexedFiles: 0,
    ignoredEntriesAdded: [],
  };

  if (plan.blockers.length > 0) {
    throw new Error(`Cross-harness migration refused:\n  - ${plan.blockers.join('\n  - ')}`);
  }
  if (!plan.needed) { return empty; }

  const backupDir = join(resolvedRoot, MIGRATION_BACKUP_DIR);
  const canonicalSkills = join(resolvedRoot, '.agents', 'skills');
  const claudeSkills = join(resolvedRoot, '.claude', 'skills');
  mkdirSync(backupDir, { recursive: true });

  let promotedInstructions = false;
  if (plan.instructions === 'promote-claude-md') {
    const claudeMd = join(resolvedRoot, 'CLAUDE.md');
    // Back up the original BEFORE either write, so a crash between them is recoverable.
    cpSync(claudeMd, join(backupDir, 'CLAUDE.md'));
    cpSync(claudeMd, join(resolvedRoot, 'AGENTS.md'));
    writeFileSync(claudeMd, CLAUDE_INSTRUCTIONS_SHIM);
    promotedInstructions = true;
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
    // Everything real is now either canonical or archived; what remains is pointers.
    rmSync(claudeSkills, { recursive: true, force: true });
  }

  // Must happen while `.claude/skills` is gone and BEFORE the compatibility hook
  // puts a symlink there — git cannot rewrite an index entry behind one.
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
    backupDir,
    unindexedFiles,
    ignoredEntriesAdded,
  };
}
