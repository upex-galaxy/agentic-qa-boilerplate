# PR Templating — Body, Labels, Reviewers, Base Branch

This file is the contract for opening pull requests. The body is **rendered inline** — there is no template file in the repo to read. Placeholders the skill can fill from session context are filled; placeholders the skill cannot fill are left **visible** so the author can complete them before posting (do not silently drop sections).

---

## Title

Format: `{type}({ISSUE-KEY}): {description}` — under 70 characters.

Without an issue key: `{type}: {description}`.

Examples:

- `feat(UPEX-123): add bulk-assign action`
- `fix({{PROJECT_KEY}}-45): handle empty response in reservation list`
- `docs: clarify branch prefix vocabulary`
- `chore(deps): bump zod to v4`

The title is the first thing reviewers see in the PR list — keep it scannable.

---

## Body — inline template

Render this verbatim, substituting the placeholders:

```markdown
## Summary

<<SUMMARY>>

## Changes

<<CHANGES>>

## Test Plan

<<TEST_PLAN>>

## Traceability

- Issue: [<<ISSUE_KEY>>](<<ISSUE_URL>>)
- Branch: `{branch}`
- Base: `{base}`
- Strategy: `{strategy}`

## Evidence

<<EVIDENCE>>

## Risk

<<RISK>>
```

### Placeholder rules

| Placeholder     | What goes here                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<<SUMMARY>>`   | One-paragraph summary derived from the commits: what changed and why.                                                                                                                                                      |
| `<<CHANGES>>`   | Bulleted list — one bullet per commit, format `- {type}({ISSUE-KEY}): {description}`.                                                                                                                                      |
| `<<TEST_PLAN>>` | Bulleted steps to verify: test commands run, manual checks done, environments hit. Mark each as `[x]` if already verified locally.                                                                                         |
| `<<ISSUE_KEY>>` | Key extracted in the branch step. If absent, **drop the entire `- Issue:` line** rather than leave a dangling link.                                                                                                        |
| `<<ISSUE_URL>>` | `{{ATLASSIAN_URL}}/browse/<<ISSUE_KEY>>` when both available. Otherwise drop.                                                                                                                                              |
| `{branch}`      | Current branch name (computed by the skill).                                                                                                                                                                               |
| `{base}`        | PR base branch (resolved from the strategy — see table below).                                                                                                                                                             |
| `{strategy}`    | Active strategy slug (`solo-main`, `main-integration`, etc.). Helps reviewers understand the merge target.                                                                                                                 |
| `<<EVIDENCE>>`  | Pointer to `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/evidence/` when applicable (screenshots, traces, logs). For backend/CLI PRs without visual evidence, leave the placeholder so the author can fill it in or delete it. |
| `<<RISK>>`      | Short risk assessment: blast radius, affected modules, rollback plan. One paragraph.                                                                                                                                       |

Do not pad sections. Empty sections invite skim-reads.

---

## Base branch — resolved from strategy

| Strategy           | Default PR base                                                  | Notes                                                           |
| ------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `solo-main`        | `main`                                                           | PRs are optional in this flow; if used, target `main`.          |
| `main-integration` | integration branch (e.g. `staging`)                              | Promotion PRs (`staging → main`) are explicit, separate events. |
| `enterprise`       | integration branch                                               | Exception: `hotfix/*` → `main` (and back-merge to integration). |
| `trunk-based`      | `main`                                                           | PRs are short-lived; merges are fast.                           |
| `gitflow`          | `develop` for `feature/*`; `main` for `release/*` and `hotfix/*` | Release PRs back-merge to `develop` after merging to `main`.    |
| `github-flow`      | `main`                                                           | Always.                                                         |
| `gitlab-flow`      | `main`                                                           | Promotion MRs target `pre-production`, then `production`.       |
| `sdet`             | integration trunk `test/<module>-suite` for `test/{KEY}-*` + Plus Branches | The single final suite PR targets `main` (after the sync gate). Use the `pr-test-automation.md` body for the final PR. See `sdet-integration-trunk.md`. |

The user can override with `--base X` in arguments. When overridden, surface it in the confirmation:

> _"PR will target `{base}` instead of the strategy default `{default}`. Confirm?"_

---

## Labels

Suggest labels based on the dominant commit type:

| Type                                                           | Label                                        |
| -------------------------------------------------------------- | -------------------------------------------- |
| `feat:`                                                        | `feature`                                    |
| `fix:`                                                         | `bugfix`                                     |
| `docs:`                                                        | `docs`                                       |
| `perf:`                                                        | `feature` (or `perf` if the repo defines it) |
| `chore:` / `refactor:` / `style:` / `test:` / `build:` / `ci:` | `chore`                                      |
| Breaking change (`!`)                                          | `breaking-change`                            |

Always combine the type label with `ready-for-review`, OR propose `--draft` if the user wants a draft PR.

**Verify before applying.** Repos differ. Run `gh label list` if uncertain — never hardcode labels the repo may not have configured. If a label is missing, ask the user whether to create it or skip.

---

## Reviewers

- If `.github/CODEOWNERS` exists and matches the modified paths, suggest the matched owners.
- Otherwise ask the user. **Never hardcode usernames** — repos and teams change.

For solo-main / personal projects, reviewers are usually skipped.

---

## Draft vs ready-for-review

Open as `--draft` when:

- The implementation is intentionally incomplete (early feedback wanted).
- CI is expected to fail until follow-up commits land.
- The user explicitly says "draft".

Otherwise open as ready-for-review with the appropriate label.

---

## Rendering and submission

Write the rendered body to a tempfile to avoid shell-escaping issues:

```bash
TMP=$(mktemp)
cat > "$TMP" <<'EOF'
## Summary
…rendered body…
EOF

gh pr create \
  --title "{title}" \
  --body-file "$TMP" \
  --base "{base}" \
  [--reviewer {users}] \
  [--label {labels}] \
  [--draft]

rm "$TMP"
```

Always show the rendered body and base branch to the user **before** running `gh pr create`. The user can edit, accept, or reject.

---

## After creation

- Return the PR URL.
- Surface the next step: _"Review the PR. Once approved, merge via the GitHub UI or run `gh pr merge {number} --squash --delete-branch`."_
- **Do not auto-merge.** Merging is an explicit, separate action by the user.

---

## Worked example

Branch: `feat/UPEX-123-bulk-assign`
Strategy: `main-integration` (integration = `staging`)
Issue key: `UPEX-123`
Two commits:

1. `feat(UPEX-123): add bulk-assign domain model and tests`
2. `feat(UPEX-123): wire bulk-assign into users table UI`

Rendered body:

```markdown
## Summary

Adds bulk-assign action to the users table so admins can transfer
ownership of multiple records in one operation. Backed by a new domain
model with unit tests; UI uses the existing table-action slot.

## Changes

- feat(UPEX-123): add bulk-assign domain model and tests
- feat(UPEX-123): wire bulk-assign into users table UI

## Test Plan

- [x] Unit tests pass (`bun run test domain/bulk-assign`)
- [x] Lint green (`bun run lint:check`)
- [x] Types green (`tsc --noEmit`)
- [ ] Manual smoke test on staging after merge

## Traceability

- Issue: [UPEX-123](https://upex.atlassian.net/browse/UPEX-123)
- Branch: `feat/UPEX-123-bulk-assign`
- Base: `staging`
- Strategy: `main-integration`

## Evidence

See `.context/PBI/epics/EPIC-UPEX-100-<epic-slug>/stories/STORY-UPEX-123-bulk-assign/evidence/` for the design
walkthrough screenshots.

## Risk

Low blast radius — new code path behind a feature flag (`bulkAssign`).
Rollback: disable the flag and revert this PR.
```

Title: `feat(UPEX-123): add bulk-assign action`
Labels: `feature, ready-for-review`
Base: `staging`
