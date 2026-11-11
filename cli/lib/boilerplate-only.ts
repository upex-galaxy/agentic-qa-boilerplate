/**
 * @fileoverview The boilerplate's own files that never reach a project: its
 * unit tests, their snapshots and test fixtures, and its maintainer-only
 * scripts. They verify THIS repo in its CI; in a project the test runner picks
 * them up and they fail against the project's own files.
 *
 * Read by the updater (never delivered: repoOnlyPatterns / repoOnlyPaths, the
 * self-update included; upstream's unedited copies a project still holds are
 * removed, `cleanupBoilerplateCopies`) and by `docs:check` (a project's page
 * citing one is not a dead reference there). Mirrored in TEMPLATE_EXCLUDES and
 * TEMPLATE_EXCLUDE_PATTERNS (packages/create-agentic-qa/src/prepare.ts); a test
 * holds the lists equal.
 *
 * Kept: `scripts/api-login.test.ts` (it guards the project's own
 * `scripts/api-login.project.ts`) and the runtime data in `fixtures/` folders
 * (the router eval, the board and evidence demos), which a gate reads.
 */

export const BOILERPLATE_TEST_PATTERNS: RegExp[] = [
  /^(?!scripts\/api-login\.test\.ts$)(?:cli|scripts)\/.*\.test\.[cm]?[jt]s$/,
  /^(?:cli|scripts)\/(?:.*\/)?__snapshots__\//,
  /^\.agents\/skills\/[^/]+\/.*\.test\.[cm]?[jt]s$/,
];

export const BOILERPLATE_TEST_PATHS: string[] = [
  'cli/lib/behaviour-coverage/fixtures',
  'cli/lib/evidence-page/fixtures/recorded',
  'cli/lib/fixtures/ui-up-dry-run.journal.json',
  'cli/lib/fixtures/ui-up-dry-run.transcript.json',
  'cli/lib/sprint-source/fixtures/demo/snapshot.json',
  'cli/lib/sprint-source/fixtures/recorded',
  'cli/sprint-board/fixtures',
  'cli/sprint-board/test-fixtures.ts',
  'scripts/lib/ui-up-transcript.ts',
  'scripts/ui-record-up.ts',
  'scripts/ui-replay.ts',
  'scripts/ui-setup-fixture.ts',
  'scripts/ui-up-fixture.ts',
];

/** Whether a repo-relative path is one of them (exact path, a folder prefix, or a pattern). */
export function isBoilerplateOnlyPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  return BOILERPLATE_TEST_PATHS.some(prefix => p === prefix || p.startsWith(`${prefix}/`))
    || BOILERPLATE_TEST_PATTERNS.some(re => re.test(p));
}
