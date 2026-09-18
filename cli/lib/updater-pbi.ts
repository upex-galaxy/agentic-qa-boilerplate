/**
 * @fileoverview PBI cache migration advisory (afterApply hook).
 *
 * `.context/PBI/` is a GITIGNORED CACHE of Jira (AGENTS.md §9): Jira is the
 * source of truth, the tree regenerates via `bun run context:hydrate`, and only
 * a small committed allowlist is versioned (`README.md`, `templates/**`,
 * `epics/<epic>/test-specs/**`). A project scaffolded BEFORE that rule existed may
 * still TRACK generated `[SYNC]` files in git — which produces meaningless
 * 3-way merges over full-file rewrites and duplicates the Jira database into
 * the repo.
 *
 * This hook detects that legacy state after every sync: it lists what git
 * tracks under `.context/PBI/`, subtracts the committed allowlist and, when
 * anything remains, persists a migration recipe for the consumer's AI agent
 * and reports ONE fact (count + `test-specs/` count + recipe path) that the parity report renders
 * as a single row on Componentes. The terminal never gets the path list: on a
 * live run 370 paths dumped inline dwarfed the eight parity rows they were
 * competing with. It NEVER touches the git index itself: untracking is
 * destructive-adjacent work the agent performs with a recovery tag in place.
 */

import type { ReportSink, RunSummary } from './updater-types';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// ALLOWLIST
// ============================================================================

/**
 * The `[COMMIT]` tier of `.context/PBI/` — the ONLY paths that belong in git
 * (mirrors the gitignore ladder documented in AGENTS.md §9):
 *   - `.context/PBI/README.md`            (tier rules + gitignore ladder)
 *   - `.context/PBI/templates/**`         (skeletons)
 *   - `.context/PBI/epics/<epic>/test-specs/**` (automation plans, versioned with code)
 */
export const PBI_COMMIT_ALLOWLIST_DESCRIPTION
  = '.context/PBI/README.md, .context/PBI/templates/**, .context/PBI/epics/*/test-specs/**';

const TEST_SPECS_RE = /^\.context\/PBI\/epics\/[^/]+\/test-specs\//;

/**
 * A `test-specs/` directory at ANY depth. The allowlist above only covers
 * `epics/<epic>/test-specs/`, so a legacy tree (measured: `.context/PBI/auth/
 * test-specs/**` with a ROADMAP, a PROGRESS, a spec, an implementation plan and
 * two ATC files) is swept into the untrack list although `test-specs/` is
 * `[COMMIT]` tier everywhere else in the doctrine. The recipe names those paths
 * before touching the index instead of dropping them silently.
 */
const TEST_SPECS_ANYWHERE_RE = /(?:^|\/)test-specs\//;

/** Out-of-allowlist paths that still live under some `test-specs/` directory. */
export function pbiTestSpecPaths(outOfAllowlist: readonly string[]): string[] {
  return outOfAllowlist.filter(p => TEST_SPECS_ANYWHERE_RE.test(p.replace(/\\/g, '/')));
}

/** True when a tracked path is part of the committed allowlist. */
export function isPbiAllowlisted(trackedPath: string): boolean {
  const p = trackedPath.replace(/\\/g, '/');
  if (p === '.context/PBI/README.md') { return true; }
  if (p.startsWith('.context/PBI/templates/')) { return true; }
  if (TEST_SPECS_RE.test(p)) { return true; }
  return false;
}

/**
 * Filter `git ls-files .context/PBI` output down to the paths that should NOT
 * be tracked (everything outside the committed allowlist). Pure — exported for
 * tests.
 */
export function filterPbiTrackedPaths(trackedPaths: string[]): string[] {
  return trackedPaths
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .filter(p => !isPbiAllowlisted(p));
}

// ============================================================================
// PROMPT
// ============================================================================

/**
 * Build the migration prompt handed to the consumer's AI agent. Written FOR an
 * agent: exact commands, exact allowlist, and the why (AGENTS.md §9 tiers).
 */
export function buildPbiMigrationPrompt(outOfAllowlist: string[]): string {
  const quoted = outOfAllowlist.map(p => `"${p}"`).join(' ');
  const pathList = outOfAllowlist.map(p => `   - ${p}`).join('\n');
  const testSpecs = pbiTestSpecPaths(outOfAllowlist);
  const testSpecWarning = testSpecs.length === 0
    ? []
    : [
        `WARNING — ${testSpecs.length} of those path(s) live under a \`test-specs/\` directory, which is`,
        '[COMMIT] tier everywhere else in the doctrine (automation plans are versioned with the test',
        'code). They are outside the allowlist only because the allowlist matches',
        '`.context/PBI/epics/<epic>/test-specs/**` and these sit at another depth:',
        testSpecs.map(p => `   - ${p}`).join('\n'),
        '',
        'DECIDE PER PATH BEFORE STEP 2, and say which you chose:',
        '   (a) it is a real automation plan -> `git mv` it under',
        '       `.context/PBI/epics/<EPIC-KEY>-<slug>/test-specs/` so it stays versioned, and drop it',
        '       from the untrack list below;',
        '   (b) it is a stale scaffold example -> untrack it with the rest, knowingly.',
        'Never untrack a `test-specs/` path without that decision: unlike the [SYNC] files around it,',
        'its content does not exist in Jira and `bun run context:hydrate` cannot bring it back.',
        '',
      ];
  return [
    'Migrate this repository\'s `.context/PBI/` tree from git-tracked to gitignored-cache.',
    '',
    'WHY: `.context/PBI/` is a GITIGNORED CACHE of Jira (see AGENTS.md §9). Every path in',
    'it is exactly one of three tiers: [SYNC] (source of truth is Jira; rebuilt by',
    '`bun run context:hydrate`), [COMMIT] (versioned in this repo — ONLY the allowlist',
    'below), or [LOCAL] (disposable, machine-only). Tracking [SYNC] files in git makes two',
    'sessions that re-sync at different times produce conflicting commits of the same',
    'generated text, and duplicates the Jira database into the repo.',
    '',
    'ALLOWLIST (stays tracked — never untrack these):',
    '   - .context/PBI/README.md',
    '   - .context/PBI/templates/**',
    '   - .context/PBI/epics/*/test-specs/**',
    '',
    'Git currently tracks these paths OUTSIDE that allowlist:',
    pathList,
    '',
    ...testSpecWarning,
    'Run these steps IN ORDER (do not skip or reorder — step 1 is the recovery point',
    'every later step relies on):',
    '',
    '1. Tag the current state as a FULL recovery point, before untracking anything, and PUSH the',
    '   tag: step 5 asks the TEAM to confirm nothing was lost, and a tag that lives on one laptop',
    '   protects nobody. The annotation is not optional either — a bare `git tag` fails outright',
    '   (`fatal: no tag message?`) on a machine configured to require one:',
    '   git tag -a pbi-pre-cache-migration -m "State before untracking the .context/PBI Jira cache"',
    '   git push origin pbi-pre-cache-migration',
    '',
    '2. Untrack EXACTLY the out-of-allowlist paths listed above (files stay on disk):',
    `   git rm -r --cached -- ${quoted}`,
    '',
    '3. AUDIT THE INDEX before committing. This commit must only REMOVE paths: the same gitignore',
    '   ladder that makes the migration necessary also makes a `git add`-from-status re-stage cache',
    '   files (`stories/` shows up as one untracked directory). Both commands must print nothing:',
    '   git diff --cached --diff-filter=ACM --name-only | grep \'^\\.context/\'',
    '   git status --porcelain --untracked-files=no -- .context/PBI | grep -v \'^D \'',
    '   Anything printed means something other than the untracking is staged: unstage it',
    '   (`git restore --staged -- <path>`) and re-run the audit. Then commit:',
    '   git commit -m "chore: untrack .context/PBI cache (Jira is the source of truth)"',
    '',
    '4. Rebuild the cache from Jira (needs ATLASSIAN_* credentials in .env):',
    '   bun run context:hydrate',
    '',
    '5. BEFORE calling this migration done: diff the tag against the rebuilt cache',
    '   (git diff pbi-pre-cache-migration -- .context/PBI) and PUSH TO JIRA any',
    '   local-only content worth keeping. `context:hydrate` OVERWRITES [SYNC] file names',
    '   with Jira truth, so content that existed only in git and never reached Jira is',
    '   now visible ONLY through the tag. Write anything worth keeping into the',
    '   corresponding Jira field (or its documented comment fallback), then re-run',
    '   `bun run context:hydrate` so the cache mirrors what Jira now holds.',
    '',
    'Only after step 5 is complete may the migration be reported as done. Keep the',
    '`pbi-pre-cache-migration` tag until the team confirms nothing was lost.',
  ].join('\n');
}

/** Markdown wrapper for the persisted recipe file (mirror of the parity prompt file). */
export function buildPbiPromptFileContent(outOfAllowlist: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    '# PBI cache migration recipe (AI agent prompt)',
    '',
    `> **AUTO-GENERATED, SINGLE-USE.** Written by \`bun run up\` on ${today}.`,
    '> Paste the prompt below into your AI session, then delete this file.',
    '> It is regenerated (overwritten) while `.context/PBI/` still tracks files',
    '> outside the committed allowlist.',
    '',
    '```text',
    buildPbiMigrationPrompt(outOfAllowlist),
    '```',
    '',
  ].join('\n');
}

// ============================================================================
// HOOK FACTORY
// ============================================================================

/** List what git tracks under `.context/PBI` ([] when not a repo / nothing tracked). */
function listTrackedPbiPaths(cwd: string): string[] {
  try {
    const out = execSync('git ls-files .context/PBI', {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    return out.split('\n').map(l => l.trim()).filter(Boolean);
  }
  catch {
    return []; // not a git repo, or git unavailable — nothing to advise on.
  }
}

/** What the hook learned, for the parity report: one row, the recipe in its file. */
export interface PbiCacheFact {
  /** Tracked paths outside the committed allowlist. */
  tracked: number
  /** Repo-relative path of the saved recipe (forward slashes). */
  recipePath: string
  /** Of those, how many sit under a `test-specs/` directory at a legacy depth. */
  testSpecs: number
}

/** The recipe file's name before 8.3: removed when the new one is written, so a stale dump never lingers. */
const LEGACY_RECIPE_BASENAME = 'pbi-cache-migration-prompt.md';

/**
 * Build the `afterApply` hook. Detects a legacy git-tracked PBI cache, saves
 * the agent migration recipe (a real run only) and hands the count plus the
 * recipe path to `report`, which the wrapper turns into one parity row. Never
 * mutates the git index or any file under `.context/PBI/`.
 */
export function makePbiCacheMigrationHook(
  cfg: { promptOutPath: string, dryRun?: boolean },
  sink: ReportSink,
  report: (fact: PbiCacheFact) => void,
): (summary: RunSummary) => Promise<void> {
  return async (_summary: RunSummary): Promise<void> => {
    const cwd = process.cwd();
    const outOfAllowlist = filterPbiTrackedPaths(listTrackedPbiPaths(cwd));
    if (outOfAllowlist.length === 0) { return; }
    const recipePath = path.relative(cwd, cfg.promptOutPath).replace(/\\/g, '/');
    report({ tracked: outOfAllowlist.length, recipePath, testSpecs: pbiTestSpecPaths(outOfAllowlist).length });
    if (cfg.dryRun) { return; }
    try {
      fs.mkdirSync(path.dirname(cfg.promptOutPath), { recursive: true });
      fs.writeFileSync(cfg.promptOutPath, buildPbiPromptFileContent(outOfAllowlist));
      fs.rmSync(path.join(path.dirname(cfg.promptOutPath), LEGACY_RECIPE_BASENAME), { force: true });
    }
    catch (err) {
      sink.warn(`No se pudo guardar ${recipePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}
