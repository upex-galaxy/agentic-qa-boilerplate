---
name: git-flow-master
description: "End-to-end Git operator for any branching strategy. Auto-detects the project's strategy (solo-main, main+integration, enterprise multi-branch, trunk-based, GitFlow, GitHub Flow, GitLab Flow, SDET integration-trunk for chained test-automation suites) from .git config, branches, and an CLAUDE.md marker, then adapts every commit, branch, push, PR, conflict-fix, and chained-PR action to that strategy. Use this skill whenever the user wants to: create a branch (`crear branch`, `new feature branch`, `start work on UPEX-123`), commit changes (`commit this`, `commitear esto`, `make a commit`, `commit and push`), push code (`push`, `push to main`, `push to staging`, `subir cambios`), open a pull request (`create PR`, `open PR`, `abrir PR`, `crear pull request`, `gh pr create`), fix merge conflicts (`fix conflict`, `resolver conflicto`, `merge conflict`, `rebase conflict`, `push rejected`), plan stacked or chained PRs (`stack of PRs`, `chained PRs`, `split this PR`, `PR demasiado grande`), set up an isolated git worktree (`worktree`, `work in a worktree`, `isolate this work`, `parallel session`, `aislar el trabajo`, `trabajar aislado`), set up or bootstrap a branching strategy on a fresh repo (`set up our git strategy`, `bootstrap branching`, `configura el flujo de git`, `git strategy setup`, `materialize the git flow`, `create the staging branch and write the runbook`), or pick / change / set up a branching strategy (`git flow`, `git strategy`, `branching strategy`, `which git flow do we use`, `set up our git strategy`, `bootstrap branching`, `configura el flujo de git`). Trigger even when the user does not say `git-flow-master` literally — if the work is git-or-PR-shaped, this is the right tool. Do NOT use for: testing tickets (use /sprint-testing), authoring test cases in TMS (use /test-documentation), writing automated tests (use /test-automation), running regression suites (use /regression-testing), or general code editing — git-flow-master operates strictly on the version-control layer."
license: MIT
compatibility: [claude-code, opencode]
phase: implementation
complementary_categories: []
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  foundation: opus       # high-leverage architectural work
  planning: sonnet       # structured writing
  implementation: sonnet # default for code work
  review: opus           # critical analysis
  archive: haiku         # mechanical close-out
-->

# Git Flow Master — One Skill for Branches, Commits, Pushes, PRs, and Conflicts

This skill is the project's single entry point for everything that happens on the version-control layer: creating branches, writing commits, pushing safely, opening pull requests, resolving conflicts, and planning chained / stacked PRs when a change outgrows the review budget.

It does not assume one branching model. The project may run on `main` only, on `main + staging`, on a multi-branch enterprise layout, or on any of the well-known flows (trunk-based, GitFlow, GitHub Flow, GitLab Flow). The skill **detects** which one is active and adapts every command accordingly. The detection is sticky: once resolved, the strategy is recorded in `CLAUDE.md` so future invocations skip the prompt.

---

## When to use

Trigger on any of these intents — even without literal keywords:

- "I want to start work on UPEX-123" → branch creation
- "commit and push", "subir cambios", "push to main" → commit + push flow
- "abrí un PR contra staging" → PR creation
- "tengo conflictos al hacer pull" → conflict resolution
- "este PR va a quedar enorme" → chained-PR planning hand-off
- "qué estrategia de git usamos en este repo" → strategy detection / persistence
- "el push fue rechazado" → diagnostic + recovery flow

If the user is asking about testing a ticket, authoring test cases, writing automated tests, or running regression suites — that is **not** this skill. Hand back to `/sprint-testing`, `/test-documentation`, `/test-automation`, or `/regression-testing`.

---

## The six operations

Every git-flow-master invocation maps to one (or a sequence) of these six operations. Operation choice is driven by the user's request; strategy resolution shapes how each operation runs.

| Op           | Trigger phrases (examples)                              | Skill behaviour                                                                                                    |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Branch**   | "create branch", "new feature branch", "start UPEX-123" | Resolve strategy → propose name with prefix + issue key → wait for OK → checkout                                   |
| **Commit**   | "commit this", "commit and push", "make atomic commits" | Group by responsibility → propose conventional commits → wait for OK → execute one-by-one                          |
| **Push**     | "push", "push to main", "subir cambios"                 | Diagnose upstream → confirm if pushing to a protected branch → never `--force` without explicit user opt-in        |
| **PR**       | "create PR", "abrir PR", "gh pr create"                 | Pick base branch from strategy → render body inline → ask labels/reviewers → call `gh pr create`                   |
| **Conflict** | "fix conflict", "rebase failed", "push rejected"        | Diagnose first (see `references/conflict-resolution.md`) → present options → guide resolution → verify clean state |
| **Strategy Setup** | "set up our git strategy", "bootstrap branching", "configura el flujo de git", "materialize the flow" | Resolve strategy → run decision questionnaire → conditionally create/ff-sync long-lived branches (never force) → write full runbook into `CLAUDE.md`. Skips questions already answered by markers. See `references/strategy-setup.md`. |

When the operation is ambiguous (user just says "git-flow-master" or "let's do the git stuff"), report the current repo state (Step 1 below) and ask what they need.

---

## Step 1 — Always: read the repo state

Run these silently every invocation. Do not act until the picture is clear:

```bash
git status
git branch --show-current
git branch -a
git diff --stat
git log --oneline -5
git fetch origin
git status -sb
git remote -v
```

Summarise to the user:

- Current branch.
- Dirty / clean working tree (staged / unstaged / untracked counts).
- Unpushed / unpulled commits (ahead / behind upstream).
- Upstream status (no upstream, up-to-date, diverged).
- Remote name(s) — most repos have one (`origin`); some have a fork + upstream.

This summary is cheap, prevents 90% of mistakes, and is the input to every subsequent decision.

---

## Step 2 — Resolve the branching strategy

The skill supports eight strategies (see `references/branching-strategies.md` for the full catalogue, detection signals, and trade-offs):

| Strategy           | One-line description                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `solo-main`        | Single long-lived branch (`main`). All work lands directly. Best for solo projects, scratch repos, prototypes.                                   |
| `main-integration` | `main` (production) + a single integration branch (`staging` / `dev` / `develop`). Features merge to integration, release-promote to `main`.     |
| `enterprise`       | `main` + integration + many short-lived `feature/*`, `fix/*`, `release/*`, `hotfix/*` branches. Adds environment branches when needed.           |
| `trunk-based`      | Trunk (`main`) is the only long-lived branch. Short-lived feature branches (<1 day) merge fast, behind feature flags. CI gate is non-negotiable. |
| `gitflow`          | Vincent Driessen's classic. `main` (releases) + `develop` (integration) + `feature/*` + `release/*` + `hotfix/*`. Heavyweight; mostly legacy.    |
| `github-flow`      | `main` always deployable. `feature/*` branches → PR → merge → deploy. No staging/develop branch.                                                 |
| `gitlab-flow`      | GitHub Flow + environment branches (`pre-production`, `production`) to model deployment promotion.                                               |
| `sdet`             | SDET Gitflow. `main` (confirmed tests) + ephemeral per-suite integration trunk `test/<module>-suite`. Test tickets chain through the trunk (`--no-ff`); one final PR → `main`. For chained test-automation suites. Opt-in; see `references/sdet-integration-trunk.md`. |

### Detection algorithm

Apply in order; stop at the first definitive answer:

1. **Marker in `CLAUDE.md`** — search for `<!-- git-flow-master:strategy:VALUE -->` where `VALUE` is one of the eight slugs. If found, use it. This is the persisted decision. Also read the decision markers if present — `<!-- git-flow-master:integration-branch:NAME -->`, `<!-- git-flow-master:promote-method:... -->`, `<!-- git-flow-master:feature-merge:... -->`, `<!-- git-flow-master:hotfix-policy:... -->`. Each marker that resolves a questionnaire answer means Strategy Setup SKIPS that question on re-run (idempotent).
2. **Single-branch heuristic** — `git branch -a` shows only `main` (or `master`) and no integration branch in the remote → `solo-main`.
3. **Two-branch heuristic** — exactly `main` (or `master`) + one of `{staging, dev, develop, integration}` exists upstream → `main-integration` (record the integration branch name).
4. **Multi-branch heuristic** — `main` + integration + active `feature/*` or `release/*` branches in `git branch -a` → `enterprise`.
5. **Project hints** — look for `.gitlab-ci.yml` (suggests `gitlab-flow`), `release/*` and `hotfix/*` long-lived branches (suggests `gitflow`).
6. **Fallback** — ask the user. Show the options with one-line descriptions; mirror their language. Do NOT pick silently. On a test-automation repo (KATA / Playwright / `/test-automation`), surface `sdet` as the recommended option. `sdet` is opt-in only — never inferred silently from layout; a live `test/<module>-suite` trunk with `test/{KEY}-*` PRs targeting it confirms an already-active `sdet` suite.

### Persist the decision

Once resolved (whether by detection or by asking), write the marker to `CLAUDE.md`:

- If a `## Git Strategy` section exists, update the marker line in place.
- If not, append a new section near the existing `## Git Workflow` section:

```markdown
## Git Strategy

<!-- git-flow-master:strategy:main-integration -->
<!-- git-flow-master:integration-branch:staging -->

This project uses the `main-integration` flow: feature branches merge to `staging`; `staging` merges to `main` only on release.
```

The marker is the source of truth. The prose is for humans. The user can edit either; the next invocation re-reads the marker.

If the strategy uses an integration branch with a non-default name (anything other than `staging`), record it as a second marker `<!-- git-flow-master:integration-branch:NAME -->` so commits don't have to re-detect.

**Decision markers and idempotent setup.** The strategy marker is the minimum the first five operations need. Strategy Setup (3.6) writes up to four additional markers — the structural `integration-branch` marker plus the three decision markers (`promote-method`, `feature-merge`, `hotfix-policy`); only the three decision markers gate questionnaire skips. On any later invocation, detection reads whichever of these exist and treats the matching questionnaire question as already answered — Strategy Setup re-run only asks the questions whose markers are missing, and never recreates a branch that already exists.

### Bootstrap trigger — offer setup on a fresh repo (never auto-run)

At the top of any git intent, after Step 1 (repo state) and Step 2 detection have run, evaluate ONE gate:

> **No `git-flow-master:strategy:*` marker in `CLAUDE.md`** AND the repo **looks fresh** — any of: only `main`/`master` exists locally and on the remote; fewer than ~3 commits; or a boilerplate sentinel file is present (e.g. `.agents/project.yaml`, the shipped `## Git Strategy` placeholder).

If the gate is true, **OFFER** (do not auto-execute, do not silently pick a strategy):

> "No git strategy is set up yet. Want me to run Strategy Setup — pick the flow, create the branches it needs, and write the runbook into `CLAUDE.md`? (Y/N)"

Rules:

- **Offer once per session**, then cache the answer. Do not re-prompt every git intent in the same session.
- **Never auto-run.** A `No` proceeds with the requested operation under the detected (or asked) strategy without writing the full runbook.
- A `Yes` enters Strategy Setup (3.6) before continuing with the original git intent.
- The boilerplate ships WITHOUT a `git-flow-master:strategy:*` marker, so this offer fires on first real use — by design (template-trap guard).

---

## Step 3 — Operation-specific runbooks

### 3.1 Branch creation

Decide the **prefix** from the dominant change. Use this fixed vocabulary (mixed-changes precedence: `feat > fix > refactor > test > docs > chore`):

| Prefix      | When the dominant change is…                         |
| ----------- | ---------------------------------------------------- |
| `feat/`     | new feature or capability                            |
| `fix/`      | bug fix                                              |
| `test/`     | adding or updating automated tests (no product code) |
| `docs/`     | docs only                                            |
| `refactor/` | code change without behaviour change                 |
| `chore/`    | tooling, deps, housekeeping                          |

For `enterprise` and `gitflow` strategies, also consider `release/X.Y.Z` and `hotfix/X.Y.Z` when appropriate.

In a QA repo most work lands as `test/`, `fix/`, or `chore/` branches. Feature branches (`feat/`) are rare here — a `feat/` in this repo usually means a change to the test framework itself (new fixture, new Page component layer, new reporter).

**Issue key extraction** (in order):

1. Current branch name regex: `(?:feat|feature|fix|test|docs|refactor|chore)/([A-Z]+-\d+)-`.
2. `$ARGUMENTS` for `[A-Z]+-\d+`.
3. Ask the user once: "Is there an issue key for this work?" — accept "no" gracefully.

**Branch name format**:

- With key: `{prefix}/{ISSUE-KEY}-{kebab-slug}` (e.g. `test/UPEX-123-bulk-assign-coverage`).
- Without key: `{prefix}/{kebab-slug}` (e.g. `refactor/split-kata-fixtures`).
- Keep slugs lowercase, hyphen-separated, ≤50 chars.

**Strategy-specific source branch**:

- `solo-main`, `github-flow`, `trunk-based` → branch off `main`.
- `main-integration`, `gitlab-flow` → branch off the integration branch (`staging` / `dev` / equivalent).
- `enterprise` → branch off the integration branch unless it is a `hotfix/*`, which branches off `main`.
- `gitflow` → `feature/*` branches off `develop`; `hotfix/*` off `main`; `release/*` off `develop`.
- `sdet` → `test/{KEY}-*` ticket branches + Plus Branches (`docs/*`/`chore/*`/`fix/*`) branch off the **ephemeral integration trunk** `test/<module>-suite`; the trunk itself is cut from `main` on demand when a suite begins. Never stack a ticket on the previous ticket branch. See `references/sdet-integration-trunk.md`.

Always **propose** the name and ask for OK before `git checkout -b`. Never create silently.

### 3.2 Commits

Group changes by responsibility, not by file type:

| Group       | Typical paths                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| Test code   | `tests/`, `tests/components/`, `tests/e2e/`, `tests/integration/`             |
| API schemas | `api/schemas/`, codegen output, OpenAPI types                                 |
| Test data   | `tests/data/`                                                                 |
| Skills/Docs | `.claude/skills/`, `.agents/`, `CLAUDE.md`, `docs/`, `README.md`              |
| Config      | `package.json`, `tsconfig.json`, `playwright.config.ts`, lint/format configs  |

**Test data and fixtures stay with the tests they support.** If a test commit ships its own fixture, they belong in the same commit, not in a separate `chore:` commit.

**Conventional commit format**:

- With issue key: `{type}({ISSUE-KEY}): {description}` (e.g. `test(UPEX-123): cover bulk-assign empty states`).
- Without key: `{type}: {description}`.
- Breaking changes: append `!` after type/scope and add `BREAKING CHANGE:` footer.

**Vocabulary**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert` (full list in `references/conventional-commits.md`).

**Hard rules** (apply on every commit):

- One commit = one responsibility. Never bundle unrelated changes.
- Never `git add -A` or `git add .` — list explicit paths to avoid leaking secrets (`.env`, credentials) or unrelated work.
- **No AI attribution.** No `Generated with Claude Code`, no `Co-Authored-By: Claude`, no equivalent line. Commits look human-authored. (Critical Reminder #3 in `CLAUDE.md`.)
- If a pre-commit hook fails, **stop, fix the underlying issue, create a NEW commit**. Never `--amend` a commit the hook rejected — `--amend` operates on the previous commit, which destroys context.

Present all proposed commits as one block. Wait for OK / modify / reject before executing.

### 3.3 Push

Push command depends on Step 1 output:

- No upstream → `git push -u origin {branch}`.
- Upstream behind → `git push`.
- Upstream diverged → **stop**. Do not force. Hand to conflict resolution (3.5).

**Protected-branch confirmation** — before pushing to any branch the strategy treats as protected, ask explicitly:

- `solo-main` → `main` is protected.
- `main-integration` → both `main` and the integration branch are protected.
- `gitflow` → `main` and `develop` are protected.
- `github-flow` / `trunk-based` → `main` is protected.
- `enterprise` → `main`, integration, and any `release/*` are protected.
- `sdet` → `main` is protected (only the final suite PR lands, reviewed + green CI). The integration trunk is protected-by-convention but its ticket/Plus PRs are self-merged by the maintainer with no ruleset friction.

Ask: _"You are about to push directly to the protected branch `{branch}` in a `{strategy}` flow. Confirm?"_ Wait for explicit yes.

**Never** pass `--force`, `--force-with-lease`, `--no-verify`, or any history-rewriting flag unless the user explicitly requests it AND the branch is unshared. Document the request in the conversation. (Critical Reminder #6 in `CLAUDE.md`: never rewrite pushed history.)

### 3.4 Pull request

**Base branch** picks itself from the strategy:

| Strategy                                  | Default PR base                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `solo-main`, `github-flow`, `trunk-based` | `main`                                                                                           |
| `main-integration`, `gitlab-flow`         | integration branch (e.g. `staging`)                                                              |
| `enterprise`                              | integration branch; `hotfix/*` → `main`                                                          |
| `gitflow`                                 | `feature/*` → `develop`; `hotfix/*` → `main`; `release/*` → `main` (and back-merge to `develop`) |
| `sdet`                                    | `test/{KEY}-*` ticket branches + Plus Branches → the integration trunk `test/<module>-suite`; the single final suite PR → `main` (after the sync gate). See `references/sdet-integration-trunk.md`. |

The user can override with `--base X` in arguments. If overridden, surface it in the confirmation: _"PR will target `{base}` instead of the strategy default `{default}`."_

**Title format**: `{type}({ISSUE-KEY}): {description}` — under 70 chars. Without a key: `{type}: {description}`.

**Body** — render inline (no template file to read) using the structure in `references/pr-templating.md`. Substitute placeholders the skill can fill (`<<ISSUE_KEY>>`, `<<SUMMARY>>`, `<<CHANGES>>`, `<<TEST_PLAN>>`, `<<RISK>>`). Leave any unfilled placeholder visible so the author can edit it before posting — do not silently drop sections.

For `test/*` branches in this repo, the PR body should use the structure in `references/pr-test-automation.md` (project-local template tuned for KATA test-automation PRs). For non-`test/*` branches use the generic structure in `references/pr-templating.md`.

Write the rendered body to a tempfile (e.g. `$(mktemp)`) and pass it via `gh pr create --body-file` to avoid escaping issues.

**Reviewers, labels, draft** — see `references/pr-templating.md`. Never hardcode labels the repo may not have configured; verify with `gh label list` if uncertain.

**Final command shape**:

```bash
gh pr create \
  --title "{title}" \
  --body-file {tmpfile} \
  --base {base} \
  [--reviewer {users}] \
  [--label {labels}] \
  [--draft]
```

**Stop at PR creation.** Merging is the user's explicit next step. Never auto-merge. Surface: _"Review the PR. Once approved, merge via the GitHub UI or run `gh pr merge {number} --squash --delete-branch`."_

**Optional pre-PR adversarial gate** — when the diff exceeds the 400-line cognitive review budget OR touches shared scaffolding (KATA base classes, fixtures, OpenAPI schemas), surface `/judgment-day` as an optional pre-PR review: _"Diff is large / touches shared scaffolding. Want to run `/judgment-day` before opening the PR?"_. Two blind judges review the diff in parallel; only approves when both agree. See `.claude/skills/judgment-day/SKILL.md`. Never invoked automatically — user opts in.

### 3.5 Conflict resolution

Conflicts are diagnosed before they are resolved. The user is rarely in a hurry; a wrong fix here costs hours.

Run `git status`, `git diff --check`, and inspect `.git/MERGE_HEAD` / `REBASE_HEAD` to classify the situation, then follow the matching playbook in `references/conflict-resolution.md`:

- Merge conflict (content)
- Merge conflict (rename / delete)
- Rebase conflict
- Push rejected (diverged)
- Detached HEAD
- Stash apply conflict
- Unrelated histories
- Pre-commit hook rejected the commit

For every type, the playbook follows the same shape:

1. Explain what happened (root cause, in the user's language).
2. Present options ranked by safety. **Never** pick destructive options (force push, hard reset, `--abort` of an unfinished merge with uncommitted work) silently.
3. Guide the resolution step by step.
4. Verify (`git status`, `git log --oneline -3`).
5. Teach prevention (one short note on how to avoid this next time).

When in doubt, **abort safely** (`git merge --abort`, `git rebase --abort`, `git cherry-pick --abort`) rather than push forward. Aborting always wins over guessing.

### 3.6 Strategy Setup

The first five operations *adapt to* a strategy that already exists. Strategy Setup is the operation that **establishes** one: it resolves (or asks) the strategy, captures the merge + hotfix decisions the other operations depend on, materializes the long-lived branches the strategy needs, and writes a full runbook into `CLAUDE.md`. It is the only operation that creates branches and edits the strategy section beyond a one-line marker.

**When it runs**

- **Explicit**: the user asks — "set up our git strategy", "bootstrap branching", "configura el flujo de git", "materialize the flow".
- **Bootstrap offer** (see "Bootstrap trigger" below): a git intent arrives, no strategy marker exists in `CLAUDE.md`, and the repo looks fresh. The skill OFFERS to run setup. It never auto-runs.

**Six-step flow** (mechanics live in `references/strategy-setup.md` — do not inline them here):

1. **Read repo state** — Step 1 (already always runs).
2. **Resolve strategy** — reuse Step 2 detection. If still undetermined, ask the 7-option question (one slug out).
3. **Decision questionnaire** — run Q1/Q2/Q3 below, capturing merge methods + hotfix policy. SKIP any question that does not apply to the resolved strategy, and SKIP any question whose decision marker already exists (idempotent re-run — see Step 2 extension).
4. **Materialize** — conditional on the resolved strategy: create an integration branch ONLY if the strategy needs one and it is missing; ff-sync the integration/production pair if one is a pure ancestor of the other (NEVER `--force`); set up local tracking. Full materialization table + sync mechanics in `references/strategy-setup.md`.
5. **Persist** — write the marker(s) AND render the full `## Git Strategy` runbook into `CLAUDE.md` (replaces the thin one-line persist). Render rules per strategy in `references/branching-strategies.md` → "Runbook render rules".
6. **Report** — branches created/synced, decisions captured, runbook location.

**Decision questionnaire (defaults first; each gated on the resolved strategy)**

| Q  | Question                                                   | Applies to                                                                                  | Options (default first)                                                                                                                  | Drives                                                |
| -- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Q1 | Promotion method, integration → production                 | strategies with an integration branch (`main-integration`, `gitlab-flow`, `enterprise`; `gitflow` = `develop → main`) | **Fast-forward only** / Merge commit (`--no-ff`) / Squash                                                                                | release runbook + whether branches stay byte-identical |
| Q2 | Merge method, work-branch → integration (or → trunk)       | all multi-branch strategies                                                                 | **Merge commit (`--no-ff`)** / Squash / Rebase + merge                                                                                   | how integration history accrues                       |
| Q3 | Hotfix policy                                              | strategies with a production branch distinct from where work lands                          | **Branch off production → PR to production → back-merge to integration same day** / Always via integration / No policy                  | hotfix runbook + invariant maintenance                |

Defaults are what the `main-integration` worked example chose; they are DEFAULTS, not hardcoded. The user can override any of them. Single-branch strategies (`solo-main`, `github-flow`, `trunk-based`) answer NONE of Q1/Q2/Q3 — they have no integration branch and no distinct production branch.

**The five markers** (write only the ones that apply; omit decision markers the strategy doesn't use):

```
<!-- git-flow-master:strategy:VALUE -->
<!-- git-flow-master:integration-branch:NAME -->
<!-- git-flow-master:promote-method:ff-only|merge-commit|squash -->
<!-- git-flow-master:feature-merge:merge-commit|squash|rebase-merge -->
<!-- git-flow-master:hotfix-policy:branch-off-prod-backmerge|via-integration|none -->
```

**Non-negotiables**

- **Never `--force`** (not `--force-with-lease` either) during a setup sync. Sync only on a true fast-forward; if the integration/production pair has diverged both ways → STOP and hand to conflict resolution (3.5).
- **Confirm before any push to a protected branch.** A setup ff-sync push is still a push to a protected branch — ask first.
- **Propose, don't auto-execute** branch creation. Show the plan (which branch, off what, why) and wait for OK before `git checkout -b` / `git branch`.
- **No AI attribution** in any commit the setup makes (see this skill's "Critical rules" section and the project `CLAUDE.md`).

**Pointers (do not inline mechanics here)**

- `references/strategy-setup.md` — full questionnaire detail, the per-strategy materialization table, sync mechanics, persist sequence, report format.
- `references/branching-strategies.md` → "Runbook render rules" — the 4-block render rule per strategy (markers / invariant / branch-role table / merge+promotion+hotfix).

---

## Step 4 — Chained / stacked PRs (when a change outgrows the budget)

When a planned change estimates `> 400 changed lines` (additions + deletions), the work should be split. The 400-line cognitive review budget is borrowed from industry research (SmartBear, Cisco code-review studies); above it, defect detection drops sharply.

There are three options:

1. **`stacked-to-main`** — 2 to 4 small PRs, each branched off the strategy's default base. PRs depend on previous merges. The base always works between merges. Best for linearly decomposable work.
2. **`feature-branch-chain`** — one long-lived integration branch; child PRs merge into it; one final PR merges it to the strategy's default base. Best for changes with shared scaffolding (new types, new schemas) that would break partial merges.
3. **`size-exception`** — for mechanical diffs (mass renames, formatter sweeps, generated code, vendor updates). Requires explicit user override and a `Why size-exception:` line in the PR body.

Walk the chained-PR decision tree inline (see `references/branching-strategies.md` § Chained-PR decision tree). The decision picks one of: `single-pr`, `stacked-to-main`, `feature-branch-chain`, `size-exception`. Once decided, execute the resulting branch plan from this skill.

The branch plan that comes out of the decision is the **contract** for execution. If the implementation diverges (the actual diff is larger than the estimate), re-invoke the decision — do not silently up-budget the existing strategy.

---

## Variables consumed

- `{{PROJECT_KEY}}` — issue prefix for branch naming (e.g. `UPEX-123`). Resolves from `.agents/project.yaml`.
- `{{ATLASSIAN_URL}}` — base URL for the Traceability section in PR bodies. Resolves from `.agents/project.yaml:atlassian_url`.
- Any project missing `.agents/project.yaml` will lack these. Fall back to a generic `{prefix}/{slug}` and surface a one-line warning: clone the full boilerplate (the foundation files ship with the repo).

---

## Hand-offs to other skills

| Situation                                              | Hand off to                                          |
| ------------------------------------------------------ | ---------------------------------------------------- |
| Strategic split of a large change                      | Step 4 (inline decision tree in this skill)          |
| Pre-sprint AC refinement on backlog Stories            | `/shift-left-testing`                                |
| In-sprint manual QA per ticket                         | `/sprint-testing`                                    |
| Test case authoring + ROI in TMS                       | `/test-documentation`                                |
| KATA-compliant automated test authoring                | `/test-automation`                                   |
| Regression suite execution + GO/NO-GO                  | `/regression-testing`                                |
| Atlassian (Jira) operations triggered by a commit / PR | `/acli`                                              |
| First-time orientation                                 | `/agentic-qa-onboard`                                |

---

## Critical rules — apply every invocation

1. **Diagnose before acting.** Step 1 always runs. Never assume repo state.
2. **One commit = one responsibility.** Never bundle unrelated changes.
3. **No AI attribution** in commits or PR bodies. Commits look human-authored. (Critical Reminder #3 in `CLAUDE.md`.)
4. **Confirm before pushing to any protected branch.** Strategy-driven; see Step 3.3. (Critical Reminder #5 in `CLAUDE.md`.)
5. **Never force-push, never rewrite pushed history, never `--no-verify`** unless the user explicitly authorises it AND the branch is unshared. (Critical Reminder #6 in `CLAUDE.md`.)
6. **No `git add -A` / `git add .`** — always list explicit paths.
7. **Show proposed commits / branches / PR body and wait for OK** before executing. The user can accept, modify, or reject any item.
8. **`gh` CLI is the PR transport.** If `gh` is missing or unauthenticated (`gh auth status` fails), stop and surface the blocker. Do not pretend a PR was opened.
9. **PRs stop at creation.** Merging is the user's explicit next step.
10. **Strategy is sticky.** Once resolved, persist in `CLAUDE.md`. The next invocation re-reads the marker rather than asking again.
11. **Language**: artifacts (commits, branches, PR bodies, CLAUDE.md sections) in English. Mirror the user's language only in conversation.
12. **No global discards.** Never `git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, or `git clean -f` — concurrent agent sessions may share this working tree without worktrees. Discard only explicit paths this session modified; if file ownership is unclear, stop and ask the user. (Critical Rule #15 in `CLAUDE.md`; see also `references/worktrees.md` for true isolation.)

---

## Anti-patterns — NEVER do these

- **G1.** NEVER force-push to `main` or any shared branch — destroys teammates' history and is unrecoverable once others have pulled.
- **G2.** NEVER amend or rebase a pushed commit — creates orphan commits in others' clones and rewrites history that was already replicated.
- **G3.** NEVER commit secrets, credentials, `.env` contents, or auth tokens — git history is forever; a single commit leaks the secret permanently.
- **G4.** NEVER include "Generated with Claude Code", "Co-Authored-By: Claude", or any AI-attribution line in commit messages or PR bodies (Critical Rule #3). Commits look human-authored.
- **G5.** NEVER push to `main` without explicit user confirmation (Critical Rule #5). Strategy-driven protection applies to every protected branch, not just `main`.
- **G6.** NEVER bypass pre-commit / pre-push hooks with `--no-verify` to "ship faster" — hooks exist to catch the bug you didn't notice. Fix the hook failure and create a new commit.
- **G7.** NEVER mix concerns in a single commit (feat + refactor + lint fix bundled together) — atomic commits enable surgical revert and clean blame.
- **G8.** NEVER stack PRs without naming the dependency chain in the PR body — reviewers can't tell which PR to read first or what each one depends on.
- **G9.** NEVER discard working-tree changes globally (`git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`) — when multiple agent sessions share one working tree without worktrees, a global discard destroys another session's uncommitted work with no recovery. Target only the explicit paths this session modified; unclear ownership → stop and ask the user (Critical Rule #15).

---

## Isolated worktrees (parallel / risky work)

When work needs to be isolated from in-progress changes on the current branch — a second
AI session running in parallel, a hotfix while a feature is open, or unrelated WIP you do
not want to mix — use a **git worktree** (a second working directory on its own branch,
sharing one `.git`). Two paths:

- **Manual git** (portable, any tool): `git worktree add ../dir -b feat/x main` → work →
  `git worktree remove` / `prune`.
- **Claude Code harness** (this agent only): `EnterWorktree` moves the session into a fresh
  worktree under `.claude/worktrees/`; `ExitWorktree` (`keep`/`remove`) leaves it. Other
  coding agents lack this — they use the manual path.

Key gotcha: a fresh worktree contains only the **tracked** files of its base — **untracked
WIP does not teleport**, so `mv` it in (or commit first). Keep the primary tree's
`git status` clean. Full lifecycle, multi-session safety rules, and the decision guide:
`references/worktrees.md`.

---

## Pre-flight checklist (run before exiting any operation)

- [ ] Step 1 ran and the repo state was reported.
- [ ] Strategy resolved (detected from marker, inferred from layout, or asked) and persisted to `CLAUDE.md` if newly chosen.
- [ ] Branch / commit / push / PR / conflict operation followed the runbook for that strategy.
- [ ] Each commit is atomic, conventional, and free of AI attribution.
- [ ] No `git add -A` / `--force` / `--no-verify` used unless explicitly authorised.
- [ ] No global discard ran (`git restore .` / `git checkout -- .` / `git reset --hard` / untargeted `git stash` / `git clean`); any discard targeted explicit session-owned paths only.
- [ ] PR (if created) has Title <70 chars, body with Summary / Changes / Test Plan / Traceability / Risk, base branch matches strategy.
- [ ] PR URL returned to the user; no merge attempted.
- [ ] Conflicts (if any) are fully resolved AND verified (`git status` clean, `git log` sensible).
- [ ] If Strategy Setup ran: branches were proposed (not auto-created), ff-syncs used a true fast-forward only (no `--force`), and a diverged pair was handed to conflict resolution rather than forced.
- [ ] If Strategy Setup ran: the `## Git Strategy` runbook was rendered per `references/branching-strategies.md` render rules, with only the markers that apply to the resolved strategy.

---

## Reference files

| File                                 | When to read                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/branching-strategies.md` | Full catalogue of the 8 strategies + detection signals + trade-offs + chained-PR decision tree + per-strategy runbook render rules. Read when resolving strategy or planning a chain.      |
| `references/strategy-setup.md`       | Strategy Setup (3.6) mechanics: decision questionnaire detail, per-strategy materialization table, ff-sync mechanics (never force), persist sequence, report format. Read when running or re-running Strategy Setup. |
| `references/sdet-integration-trunk.md` | `sdet` strategy runbook: per-ticket loop, ephemeral integration trunk, local double-env gate, Sanity CI + CI-fallback clause, Plus Branches, sync gate, final PR, TC lifecycle. Read when running an `sdet` test-automation suite. |
| `references/conventional-commits.md` | Full type vocabulary, scope rules, breaking-change syntax, mixed-changes precedence. Read when proposing commits.                                      |
| `references/pr-templating.md`        | PR body template, placeholder rules, label / reviewer / draft conventions, multi-strategy base-branch table. Read when opening a PR.                   |
| `references/conflict-resolution.md`  | Per-conflict-type playbooks (merge / rebase / push-rejected / detached-HEAD / stash / unrelated histories / hook rejection). Read when Step 3.5 fires. |
| `references/worktrees.md`            | Git worktrees for isolated/parallel work — manual git + Claude Code `EnterWorktree`/`ExitWorktree`, the untracked-files gotcha, multi-session safety, cleanup, decision guide. Read when isolating work or running parallel sessions. |

Read references on demand — do not load them all upfront. Each file is self-contained.
