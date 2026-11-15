# Updater parity contract (`bun sync`)

> Read when `bun sync` has run, or when you are handed the parity prompt it saves (`.agents/prompts/parity-plan.md`). `.agents/instructions/agent-harnesses.md` carries only the agent-facing summary.

## What a sync leaves behind

`bun sync` closes with one "Estado por superficie" table (one row per surface; the list is `SURFACE_ORDER` in `cli/lib/updater-parity.ts`) and one parity prompt, saved to `.agents/prompts/parity-plan.md` (gitignored, single-use). `--dry-run` prints the prompt and does not save it.

The prompt is a set of numbered rows with evidence (headings, hunk counts, server ids, command paths), one row per path. A watched file that also fails a compat contract is one blocking row with both evidences.

Every row carries a `Now` column saying which copy is on disk, so nobody has to reconstruct it from the hunks:

- `kept`: the project's copy.
- `overwritten`: upstream's copy, with the backup named.
- `-`: not a two-copy contest.

## Handling the prompt

When you are handed the prompt:

1. Present the table.
2. Wait for a per-row decision: `keep project`, `take upstream` or `merge`.
3. Apply only the chosen rows.
4. Run tests, then types, then lint.

`take upstream` is suggested only where the project lacks the content entirely. A row that names project-only servers, keys, headings or edits says `merge`, and applying `take upstream` there anyway deletes project content, so do it only when asked.

A `merge` on a watched file always says what to port and what to keep (`port upstream additions only: <keys>; keep project-only: <keys>`). It says `keep project` when only the project has extra keys, and `take upstream` only when upstream added keys and nothing else differs.

A synced file the project had edited and the run overwrote is a `merge` row naming its `.backups/` copy. The row ends with that fix, and the saved prompt repeats it as YAML.

## Blocking and informational rows

Blocking rows:

- A script appended to `package.json` whose target file the project lacks (`scriptFileTargets`: the files `bun`, `node` or `tsx` execute). The row names the script and the file, and is checked after every component has written. On a dry-run, a target upstream ships is not reported.
- A path declared in `PATH_PREREQUISITES` (`cli/lib/updater-parity.ts`) turns its kept row into a blocking one that names what the hunk gates and the gate that proves it, because half a release is worse than either half. That gate (the arbiter) runs on every sync while the file differs from upstream. The row repeats, marker or not, and is never seeded silently, until the gate passes. `skills:check` joined the post-sync gates for the same reason.
- A top-level config block upstream added that the project does not have, and that a shipped skill reads (declared in `CONFIG_BLOCK_READERS`, `cli/lib/updater-parity.ts`). It blocks instead of showing as an informational `structural` row, because without the block the skill fails at runtime, mid-session, instead of at sync time. Take upstream's block and adapt its values, which stay yours. An interactive run offers each missing block. `--auto` inserts every whole missing block from the schema with its blank values (so that row does not survive the run) and lists only the leaves missing from a block the project has.

Informational rows, never blocking:

- `package.json`: a key kept at the project value, with both values in the saved file.
- `Verificación`: a post-sync `types:check`, `lint:check`, `kata:manifest:check` or `skills:check` failure, with the exit code, the first errors and which applied files they name. `--no-gates` skips these gates.
- `.agents/project.yaml` and `.agents/jira-required.yaml` are compared by structure only: an `informational` row for keys upstream added, and no row for value differences (project identity).
- The test-sibling row (see the watchlist below).
- The `.claude/settings.json` and hook merge summary (see "Config merges").

## Exit codes and aborts

- `--strict` exits 1 on a blocking parity finding. The default warns and exits 0. Drift on protected files never blocks, with one exception: a kept file whose upstream hunk is a prerequisite for another file of the same release.
- An aborted run prints `Abortado.` and exits 1. Aborts come from a dirty tree, a corrupt lock, a failed clone, a declined migration or self-update, or a linked worktree (the updater keeps its backups, markers and prompts inside the checkout, so it runs in the primary only).
- A no-op run leaves the tree byte-identical (lock not rewritten).
- A re-run over the previous sync's uncommitted output is not an abort. `.template/last-apply.json` (gitignored) records what the run wrote, with hashes, and the guard recognises it. An unrelated or hand-edited synced path still aborts, naming `Commit sugerido` and the prompt path.
- The dirty-tree guard blocks only on uncommitted work inside what the sync writes (synced component files, ignore files, `package.json`). Dirt elsewhere (`tests/` outside the `tests-utils` helpers, KATA code, protected files) is listed as `fuera de lo que este updater escribe; no bloquean`.
- With a pending self-update, `--dry-run` runs the fetched updater from the upstream clone (nothing written), so the preview is the new code's.
- Without a TTY on stdin and no `--auto` or `--interactive`, the run assumes `--auto`.
- `UPEX_TEMPLATE_REPO` (`OWNER/REPO` or a local clone path) points the updater at another source.

## Protected watchlist

The watchlist is never overwritten, and drift surfaces in the prompt. The list is `PROTECTED_WATCHLIST` in `cli/update-boilerplate.ts`:

- the memory file;
- the MCP registries (`.mcp.json`, `opencode.jsonc`, `.codex/config.toml`, `.pi/mcp.json`);
- `.claude/settings.json`;
- the husky hooks (project gates);
- the report and Playwright configs;
- the KATA bases under `tests/components/`;
- the reporter and the project-wired helpers under `tests/` (the pure helpers sync through `tests-utils`);
- the CI workflows.

`.claude/settings.json`, `.codex/` and the husky hooks ship once when missing (bootstrap-only).

A project protects any other synced file it merged by hand through `updater.protected_paths` in `.agents/project.yaml`, with the same semantics. Invalid paths are reported and ignored. A path just declared there gets its marker seeded with no row (the row fires on the next upstream change), and a path upstream added after the lock cursor never gets an overwritten-edit row.

The `.test.*` sibling of any watched or protected file is held back with it (not delivered, not overwritten) while the project's copy differs from upstream's, because upstream's test asserts upstream's copy. One informational row names both files (`testSiblingsToHoldBack`, `cli/lib/updater-drift.ts`).

`tsconfig.base.json`, `eslint.config.base.js` and `config/variables.core.ts` are synced halves delivered by the `tooling` and `config-core` components. Their project-owned counterparts stay watched.

## Config merges

`.claude/settings.json` gets an additive merge of `permissions.allow` and `permissions.deny` (`cli/lib/updater-settings.ts`). Entries upstream declares and the project lacks are appended after the project's own, after a backup. Nothing is removed or reordered, and `ask`, `env` and every other key stay project-owned and untouched. A deliberately removed entry comes back, deliberately: an allow entry is refused in `deny`, which wins, and a deny entry is declined by exact text in `updater.declined_denies` (`.agents/project.yaml`; malformed means ignored, so it fails toward more denies).

`hooks` gets the same additive merge (`mergeHookGroups`). It runs before the compatibility check, because `agents:compat:check` requires some hook groups (the route re-surface `PostToolUse` group and the `SessionStart` re-arm groups), and a frozen file would leave the project failing pre-commit, pre-push and CI after the sync. The merge works like this:

- An upstream command the project lacks under the same event and matcher (an absent, empty or `*` matcher are one key) is appended as a new group at the end of that event's list.
- The project's own groups are never edited, reordered or removed.
- A command is declined by exact text in `updater.declined_hooks` (every event that runs it).
- A command whose script the project lacks is skipped rather than wired to a missing file.
- A downstream compat error for a missing hook group ends with the fix (``run `bun sync` ``).

Both merges read the file with `parseJsonKeepingDuplicates`. A key a git auto-merge repeated (two `PostToolUse` lists) is folded into one list instead of losing the first to `JSON.parse`, and the fold is reported. One backup per run covers both writes, and one informational row names what was added, declined, skipped or folded.

`.codex/hooks.json`, the OpenCode plugin and the Pi adapter (`.pi/extensions/agentic-qa.js`) need no merge: they are framework files the sync rewrites.

`opencode.jsonc` is never written. The upstream deny rules its `permission` block lacks become one `merge` row (MCP surface, folded onto the file's drift row) whose note is the JSONC block to paste. The note carries any upstream exception that follows a missing deny, so the last-match order holds. A pattern the project lists with any action is its decision and is never reported.

## How rows are worded

- An array-valued key reports `added: [...]` / `removed: [...]`, never "values differ" (an appended permission is not a changed value). A truncated additions list always names the new top-level objects (a CI job, an MCP server) before the "+N more" scalars.
- MCP registry rows name the server and the fields that differ (`<server>: args differ`).
- On `--dry-run`, the rows the apply step resolves by itself (the generated surfaces `bun run agents:compat` rebuilds) are marked `(resolved by apply)`. A dry-run legitimately lists more work than the run that applies, so plan from the real run.
- A git-tracked `.context/PBI/` cache is one Componentes row pointing at the recipe in `.agents/prompts/pbi-cache-migration.md` (gitignored, single-use), never a terminal dump. The row says that an ignore rule does not untrack what is already in the index (the ladder is usually already correct), and it counts any `test-specs/` path at a legacy depth, which the recipe names and makes you decide on before `git rm -r --cached`. The recipe's recovery tag is annotated and pushed (`git tag -a -m` + `git push origin`), and its untracking step is paired with an index audit (`git diff --cached --diff-filter=ACM --name-only | grep '^\.context/'` must print nothing) before the commit.
- `AGENTS.md` carries an unresolved-doctrine ledger. A section upstream has that this file does not is tracked by content, not by the one-nudge-per-upstream-change sha marker, so answering `keep project` does not retire it. It re-surfaces as one aggregated, never-blocking row until the section is actually written, and it clears itself on the run that finds it present.

## Cursors, markers and hooks

- The `cli` cursor advances after a self-update, including one from a parent that emits no env signal (the content fallback catches it).
- A component with no delta at the new head advances too, so `templateCommit` reaches the head once nothing is pending.
- A heading changed only by punctuation counts as unchanged.
- A watched file with no marker yet, whose upstream copy has not changed since the lock cursor, seeds silently instead of firing a row. It never seeds silently when its prerequisite gate fails.
- `bun run skills:registry` reruns as the very last afterApply hook. An overwritten `.agents/skills/**` row ends with `after restoring, run bun run skills:registry`.
- The closing box prints `Gates: omitidas (sin cambios)` or `omitidas (--no-gates)` instead of dropping the line.
- `bun run skills:registry` indexes only skill folders git does not ignore, so a T3 community skill installed on one machine never reaches the committed `REGISTRY.md`. A project that listed `scripts/build-skill-registry.ts` in `updater.protected_paths` to keep a local copy of that skip can remove the entry and take upstream's file.

## Migration and typing notes

- On the run that migrates a Claude-era repo, the `.claude/skills` alias is not created (staged `.claude/skills/*` deletions behind a symlink break lint-staged), and every re-run before that commit keeps deferring it. Commit the migration, then `bun run agents:compat` creates it.
- `cli/**` must type-check under a host whose `ProcessEnv` requires `NODE_ENV`. Do not cast a plain object straight to `NodeJS.ProcessEnv` in `cli/` code (the boilerplate's own unit tests guard it).
- The release in which each of these behaviours landed is recorded in ADR-0006, never here.
