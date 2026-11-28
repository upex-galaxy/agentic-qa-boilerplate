# Gotchas

| # | Gotcha | Symptom | Fix | Measured | Verified against |
|---|---|---|---|---|---|
| 1 | GitHub reports `mergeStateStatus: UNKNOWN` while it recomputes, and keeps it on merged PRs | a `MERGE STATE UNKNOWN` event on every recompute | the preset remembers the last known value and prints it in place of `UNKNOWN` | 2026-11-28 | `gh pr view --json mergeStateStatus` on public merged PRs |
| 2 | One check name can appear once per workflow run in `statusCheckRollup` | two `check:` lines for one name | lines carry `<workflow>/<name>`; identical lines collapse | 2026-11-28 | `gh pr view --json statusCheckRollup` on public PRs |
| 3 | Plain PR comments from `gh pr view --json comments` carry no edit time | an edited comment never wakes anyone | the preset reads plain and inline comments from the REST API, whose `updated_at` changes on edit | 2026-11-28 | `gh api repos/<o>/<r>/issues/<n>/comments` |
| 4 | A preset variable named like an engine variable overwrites it | the upstream `pr-review` preset never ignored its own login, because the engine's `SELF` held the script path | the engine's path variable is `WATCH_SCRIPT`, and the preset's optional skip is `IGNORE`, empty by default because the agent often shares the owner's account | 2026-11-28 | the watcher's fixture test (own comment ignored) |
| 5 | `gh pr merge --auto` merges at once a PR GitHub already considers mergeable | an "auto-merge" that merged red | `git:policy verify --merge <base>` before `--auto` (`flows.md`) | 2026-11-27 | gh source `pkg/cmd/pr/merge/merge.go` |
| 6 | `bun test` with no path skips dot directories | the watcher test passes locally only when named | run it by path: `bun test` followed by the test file's path with a leading `./` | 2026-11-28 | `bun test` discovery on this checkout |

## No longer true

(empty)
