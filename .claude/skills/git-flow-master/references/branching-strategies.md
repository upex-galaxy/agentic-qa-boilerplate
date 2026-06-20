# Branching Strategies — Catalogue, Detection, Trade-offs

Eight strategies are supported. Each one tells the skill where new branches start, where PRs target, what counts as "protected", and how releases promote.

---

## Table of contents

1. [`solo-main`](#solo-main)
2. [`main-integration`](#main-integration)
3. [`enterprise`](#enterprise)
4. [`trunk-based`](#trunk-based)
5. [`gitflow`](#gitflow)
6. [`github-flow`](#github-flow)
7. [`gitlab-flow`](#gitlab-flow)
8. [`sdet`](#sdet)
9. [Detection algorithm — combined view](#detection-algorithm)
10. [Chained-PR decision tree](#chained-pr-decision-tree)
11. [Strategy comparison matrix](#strategy-comparison-matrix)

---

## `solo-main`

**Shape**: one long-lived branch (`main`). All work lands directly. Optional ephemeral branches when the user wants a PR for documentation or CI gating.

**Best for**: solo projects, prototypes, scratch repos, personal websites, throwaway demos.

**Detection signals**:

- `git branch -a` returns only `main` (or `master`) and no other long-lived remote branches.
- Single contributor in `git log --format='%ae' | sort -u`.
- No `staging` / `dev` / `develop` branch upstream.

**Source branch for new work**: `main`.

**PR base**: `main` (when PRs are used at all — solo-main often skips PRs entirely).

**Protected branches**: `main`. Confirm before any push.

**Release model**: continuous; every push is a release.

**Trade-offs**:

- Pros: zero branching overhead, fast feedback loop.
- Cons: no review gate; `main` may break between commits; no isolation for risky work.

---

## `main-integration`

**Shape**: `main` (production) + one integration branch (`staging` / `dev` / `develop`). Features merge to integration; integration promotes to `main` only on release.

**Best for**: small teams (2-10 people), one-product repos, CD pipelines that promote `staging → main` on a cadence.

**Detection signals**:

- `git branch -a` shows `main` (or `master`) AND exactly one of `{staging, dev, develop, integration}` upstream.
- Branch protection rules on both branches (if visible via `gh api`).
- `CLAUDE.md` mentions both branches in a "Git Workflow" section.

**Source branch for new work**: integration branch (e.g. `staging`).

**PR base**: integration branch by default. Promotion PRs (`staging → main`) target `main`.

**Protected branches**: `main` AND integration branch. Confirm before any direct push to either.

**Release model**: integration branch is always deployable to a staging environment; `main` deploys to production on a release event.

**Trade-offs**:

- Pros: single review gate; staging environment matches production; rollbacks are straightforward (revert the promotion PR).
- Cons: integration branch can drift if releases are rare; double-merge cost when promoting (cherry-pick / merge / rebase / re-PR).

**Persisted in the `git_strategy:` block of `.agents/project.yaml`**:

```yaml
git_strategy:
  strategy: main-integration
  branches:
    production: main
    integration: staging
```

---

## `enterprise`

**Shape**: `main` + integration + many short-lived `feature/*`, `fix/*`, plus `release/*` and `hotfix/*` for production fixes. May add environment branches (`pre-production`, regional branches) when the deployment topology demands it.

**Best for**: 10+ contributors, multiple parallel features, regulated environments (compliance / audit), products with explicit release cycles.

**Detection signals**:

- `main` + integration + active `feature/*` or `release/*` branches in `git branch -a`.
- `.github/CODEOWNERS` exists and is non-trivial.
- `gh api repos/.../branches/main/protection` returns rules with required reviewers + status checks.
- `release/*` or `hotfix/*` long-lived branches.

**Source branch for new work**:

- `feature/*`, `fix/*` → integration branch.
- `hotfix/*` → `main` (cherry-pick back to integration after merge).
- `release/X.Y.Z` → integration branch (cut for stabilisation).

**PR base**: integration; `hotfix/*` → `main`; `release/*` → `main` (with back-merge to integration).

**Protected branches**: `main`, integration, `release/*`. Confirm before any direct push.

**Release model**: explicit release branches stabilise; release PR merges to `main` and triggers production deploy.

**Trade-offs**:

- Pros: parallel work isolated; release-branch stabilisation prevents "feature freeze" on integration; hotfix path independent of feature work.
- Cons: branching overhead; back-merges easy to forget; release-branch coordination required.

---

## `trunk-based`

**Shape**: trunk (`main`) is the only long-lived branch. Short-lived branches (<1 day, often <1 hour) merge fast. Incomplete features hide behind feature flags. CI gate on every commit is non-negotiable.

**Best for**: high-velocity teams with strong CI/CD, feature-flag infrastructure, mature test pyramid (DORA "elite performer" pattern).

**Detection signals**:

- `git branch -a` shows `main` plus only ephemeral feature branches (most ≤1 day old).
- High commit frequency to `main` (`git log --since='7 days ago' --pretty=oneline | wc -l` > 20 in a small team).
- Feature flag system in `package.json` / config (LaunchDarkly, Unleash, custom).
- `.github/workflows/` enforces CI on every PR.

**Source branch for new work**: `main`.

**PR base**: `main`. Direct commits to `main` for tiny changes are also acceptable in pure trunk-based.

**Protected branches**: `main`. CI gate is the protection — required status checks before merge.

**Release model**: continuous deployment from `main`. Feature flags decouple deploy from release.

**Trade-offs**:

- Pros: minimal branching overhead; conflicts rare (short-lived branches); enables CD.
- Cons: requires feature flags + strong CI; no obvious place for long-running spike work.

---

## `gitflow`

**Shape**: Vincent Driessen's classic (2010). `main` (releases only) + `develop` (integration) + `feature/*` (off `develop`) + `release/*` (off `develop`, merge to `main`) + `hotfix/*` (off `main`).

**Best for**: products with explicit, infrequent versioned releases (desktop apps, libraries with semver, embedded software). Mostly **legacy** today; Driessen himself notes most teams should prefer trunk-based or GitHub Flow.

**Detection signals**:

- `develop` branch exists upstream (this is the unique signal).
- `release/*` and / or `hotfix/*` long-lived branches.
- `.gitflow` config file (rare).
- Commit history shows merge commits with `Merge branch 'release/X.Y.Z'`.

**Source branch for new work**:

- `feature/*` → `develop`.
- `release/*` → `develop`.
- `hotfix/*` → `main`.

**PR base**:

- `feature/*` → `develop`.
- `release/*` → `main` (then back-merge to `develop`).
- `hotfix/*` → `main` (then back-merge to `develop`).

**Protected branches**: `main`, `develop`, all `release/*`.

**Release model**: cut `release/X.Y.Z` from `develop`; stabilise; merge to `main` AND `develop`; tag.

**Trade-offs**:

- Pros: explicit release stabilisation; hotfix path independent; well-documented.
- Cons: heavy; merge complexity; back-merge errors common; ill-suited to CD.

---

## `github-flow`

**Shape**: `main` always deployable. `feature/*` branches → PR → review → merge → deploy. No staging / develop branch.

**Best for**: web apps with continuous deployment, GitHub-native teams, projects with one production environment.

**Detection signals**:

- `git branch -a` shows `main` + `feature/*` (or unprefixed feature branches) only.
- No `staging` / `dev` / `develop` upstream.
- `.github/workflows/` deploys on push to `main`.
- `CONTRIBUTING.md` mentions "branch off main, open PR".

**Source branch for new work**: `main`.

**PR base**: `main`.

**Protected branches**: `main`. Required status checks + at least one review.

**Release model**: every merge to `main` deploys. Tags are optional, used for marketing versions.

**Trade-offs**:

- Pros: simple; matches CD; clear single source of truth.
- Cons: no staging environment without extra effort; rollback = revert PR.

---

## `gitlab-flow`

**Shape**: GitHub Flow + environment branches (`pre-production`, `production`, regional `production-eu`). Code flows in one direction: `main → pre-production → production`.

**Best for**: teams that need a deployment pipeline with promotion gates but want to avoid GitFlow's release-branch complexity. Common in GitLab-hosted projects.

**Detection signals**:

- `.gitlab-ci.yml` exists and references multiple environments.
- `git branch -a` shows `main` + `pre-production` (or `staging`) + `production`.
- Linear merge history (no back-merges).
- GitLab repo (vs GitHub) — but the pattern is portable.

**Source branch for new work**: `main`.

**PR (MR) base**: `main` for feature work. Promotion MRs: `main → pre-production`, `pre-production → production`.

**Protected branches**: all environment branches (`main`, `pre-production`, `production`).

**Release model**: cherry-pick or fast-forward from `main` through environment branches.

**Trade-offs**:

- Pros: explicit promotion path; matches deployment pipeline; no back-merge complexity.
- Cons: extra branches to maintain; promotion MRs add ceremony.

---

## `sdet`

**SDET Gitflow — integration-trunk for chained test-automation suites.** Full runbook: `references/sdet-integration-trunk.md`.

**Shape**: `main` (permanent — holds confirmed, regression-ready tests) + an **ephemeral per-suite integration trunk** named `test/<module>-suite`. The trunk is the local surrogate-`main` for one test suite: it is created off `main` when the suite starts and deleted after the suite's final PR merges. Each ticket is a `test/{KEY}-{slug}` branch cut from the trunk, PR'd **into the trunk** (not `main`), and merged `--no-ff`. Adjacent non-test work rides **Plus Branches** (`docs/*`, `chore/*`, `fix/*`) that also PR into the trunk. One final reviewed PR promotes `trunk → main`.

**Best for**: test-automation repos where a single maintainer (or AI agent) automates multi-ticket suites (a whole module, or a chained ticket-driven scope from `/test-automation`). The defining problem it solves: avoid one giant unreviewable PR, avoid one tiny PR per ticket paying `main`'s ruleset tax, and keep the final diff clean.

**Detection signals**:

- `git_strategy.strategy: sdet` in `.agents/project.yaml` (primary — this strategy is opt-in, never silently auto-detected).
- A long-lived-for-the-suite `test/<module>-suite` trunk + multiple `test/{KEY}-*` ticket PRs targeting it (not `main`).
- A QA/test-automation boilerplate repo (KATA, Playwright, `/test-automation` skill present).

**Source branch for new work**:

- `test/{KEY}-{slug}` ticket branches → cut from the **integration trunk** (never from the previous ticket branch).
- The trunk `test/<module>-suite` itself → cut from `main` on demand when a suite begins (NOT at Strategy Setup time).
- Plus Branches (`docs/*`, `chore/*`, `fix/*`) → cut from the trunk, carry adjacent non-test work.

**PR base**:

- Ticket branches + Plus Branches → the **integration trunk**.
- Final suite PR → `main` (the only PR that faces `main`'s rulesets).

**Protected branches**: `main` (final PR requires review + green CI — no CI-fallback here). The trunk is protected-by-convention while alive but intermediate ticket/Plus PRs are self-merged by the maintainer with no ruleset friction.

**Merge methods** (fixed, not a questionnaire choice): ticket/Plus → trunk is **always `--no-ff`** (preserve per-ticket history; never squash). `trunk → main` follows the repo's allowed merge method — prefer **merge-commit** to preserve the multi-branch look; squash collapses the suite to one commit on `main` (the chain still lives on the pushed trunk for traceability).

**Release model**: per suite. Tickets accumulate on the trunk behind Sanity-CI + review; a **sync gate** (`git merge origin/main`) runs before the final PR so the `trunk → main` diff shows only this suite's test work. "Automated" = running in CI on `main` (after the final merge), never at trunk-merge time.

**CI-fallback clause**: when a Sanity-CI red is purely infra / known-flake (proven by a local pass on both `local` and `staging` AND the red being present independent of the change), the local double-pass authorizes merging **into the trunk** only — never the final `trunk → main` PR. This is NOT a skip of the tests→types→lint rule (local gate still fully passes); it only governs whether a remote infra-red blocks a trunk-internal merge. ENVIRONMENT-class classification is owned by `/regression-testing`.

**Persisted in the `git_strategy:` block of `.agents/project.yaml`**:

```yaml
git_strategy:
  strategy: sdet
  branches:
    production: main
    integration: null
    ephemeral_pattern: "test/<module>-suite"
  decisions:
    feature_merge: merge-commit
```

`git_strategy.decisions.feature_merge` is fixed at `merge-commit` (`--no-ff`) — it is a defining property, not a questionnaire answer. `git_strategy.branches.integration` stays `null` (the trunk is ephemeral per-suite, captured in `git_strategy.branches.ephemeral_pattern`). `git_strategy.decisions.promote_method` / `.hotfix_policy` stay `n/a` (no production deploy; `main` is the confirmed-tests branch).

**Trade-offs**:

- Pros: per-ticket scoped diffs (review is actually useful); per-ticket Sanity CI; zero ruleset friction on intermediate merges; one clean consolidated PR to `main`; `--no-ff` preserves the suite's commit topology.
- Cons: extra branch layer; sync-gate ceremony before the final PR; the CI-fallback clause requires human judgment; assumes a single maintainer per suite (intermediate PRs are self-merged).

---

## Detection algorithm

The combined detection runs in this order. Stop at the first definitive answer.

```
1. Read the `git_strategy:` block of `.agents/project.yaml`. If `git_strategy.strategy`
   is non-null, use it + `git_strategy.branches` + `git_strategy.decisions` (and
   `git_strategy.policy`) fields. (Sticky decision wins.)

2. Inspect `git branch -a`:
   - Only `main` (or `master`) → solo-main.
   - `main` + exactly one of {staging, dev, develop, integration} → main-integration.
     Record the integration branch name in the second marker.
   - `main` + `develop` (Driessen-style) → check for `release/*` or `hotfix/*`.
     If present → gitflow. If only `develop` and `feature/*` → main-integration with develop.
   - `main` + `pre-production` and/or `production` → gitlab-flow.

3. Inspect `git log` and `git branch -a` together:
   - Many short-lived ephemeral branches (most <1 day) + high `main` commit frequency
     + feature-flag config detected → trunk-based.
   - Many `feature/*` + `release/*` long-lived → enterprise.

4. Inspect repo metadata:
   - `.gitlab-ci.yml` with environment stages → gitlab-flow.
   - `.github/CODEOWNERS` non-trivial + protection rules visible → enterprise.
   - `.github/workflows/deploy.yml` triggered on push to main, no other long-lived
     branches → github-flow.

5. Fallback: ask the user. Show the eight options as a numbered list
   with one-line descriptions. Mirror their language. Do not pick silently.

Note on `sdet`: it is **opt-in only** — never inferred silently from layout. It is
resolved from the `git_strategy:` block in `.agents/project.yaml` (step 1) or chosen explicitly in the fallback (step 5). On a
test-automation repo (KATA / Playwright / `/test-automation`), surface it as the
recommended option in the fallback list. A live `test/<module>-suite` trunk with
`test/{KEY}-*` PRs targeting it confirms an already-active `sdet` suite.
```

After resolution, persist to the `git_strategy:` block in `.agents/project.yaml` (in place, preserving the rest of the file):

```yaml
git_strategy:
  strategy: VALUE
  branches:
    production: main
    integration: NAME            # null when the strategy has none
    ephemeral_pattern: null
  description: >
    This project uses the `VALUE` flow: <one-paragraph description for humans>.
```

---

## Chained-PR decision tree

> **`sdet` short-circuit**: when the active strategy is `sdet`, the integration-trunk model IS the standing chained mode for every test suite — do not walk this tree for test-automation work. `sdet` is `feature-branch-chain` promoted from a large-change exception to the permanent operational mode, with extra gates (`--no-ff` ticket merges, local double-env validation, Sanity CI, sync gate, single final PR). See `references/sdet-integration-trunk.md`. This tree still applies to non-test changes on an `sdet` repo (a one-off large refactor of the framework itself).

When a planned change estimates `> 400 changed lines` (additions + deletions), apply this decision tree before opening PRs.

```
Q1: Is the change mostly mechanical (rename, formatter, generated code, vendor update)?
├─ Yes → size-exception (requires explicit user override + Why size-exception: rationale)
└─ No  → continue to Q2

Q2: Is the change linearly decomposable into 2–4 independent slices, each <400 lines,
    where the strategy's default base safely contains slice N without slices N+1..M?
├─ Yes → stacked-to-main
└─ No  → continue to Q3

Q3: Does the change have shared scaffolding (new types, new base classes, new schemas)
    that multiple later slices depend on, where partial merges to base would break things?
├─ Yes → feature-branch-chain
└─ No  → re-decompose. Send the planner back to story breakdown.
         A monolithic non-mechanical change without shared scaffolding is a planning smell.
```

**Strategy outputs**:

- `stacked-to-main` — 2 to 4 PRs, each branched off the strategy's default base. Each PR is self-contained; base always works after each merge.
- `feature-branch-chain` — one long-lived integration branch cut from the strategy's default base; child PRs merge into it; final PR merges integration into base.
- `size-exception` — single PR with explicit `Why size-exception:` line. Reviewer told upfront not to read line-by-line.

The chosen plan is a **contract** for execution. If the actual diff exceeds the estimate, re-invoke the decision — do not silently up-budget.

---

## Strategy comparison matrix

| Aspect                       | solo-main  | main-integration | enterprise  | trunk-based  | gitflow     | github-flow | gitlab-flow | sdet               |
| ---------------------------- | ---------- | ---------------- | ----------- | ------------ | ----------- | ----------- | ----------- | ------------------ |
| Long-lived branches          | 1          | 2                | 3+          | 1            | 3+          | 1           | 2-4         | 1 (+ephemeral trunk) |
| PR review required           | Optional   | Yes              | Yes         | Yes          | Yes         | Yes         | Yes         | Final PR only      |
| CI gate                      | Optional   | Yes              | Yes         | **Required** | Yes         | Yes         | Yes         | Yes (Sanity)       |
| Feature flags                | No         | Optional         | Optional    | **Required** | Optional    | Optional    | Optional    | No                 |
| Release-branch stabilisation | No         | No               | Yes         | No           | Yes         | No          | No          | No (per-suite trunk) |
| Hotfix path                  | Direct     | Promotion        | Dedicated   | Direct       | Dedicated   | Direct      | Promotion   | n/a                |
| Best team size               | 1          | 2-10             | 10+         | 5+           | 5-50        | 1-20        | 5-30        | 1 maintainer/suite |
| Deployment frequency         | Continuous | Per-release      | Per-release | Continuous   | Per-release | Continuous  | Continuous  | Per-suite          |
| Complexity                   | Low        | Low-medium       | High        | Medium       | High        | Low         | Medium      | Medium             |

---

## git_strategy field rules (per strategy)

Strategy Setup (SKILL.md 3.6) no longer renders a prose runbook into `CLAUDE.md` — it **populates the `git_strategy:` block in `.agents/project.yaml`** (in place, preserving the rest of the file), the single source of truth. This section is the authoritative reference for WHAT field VALUES each strategy writes into that block. The detailed operational HOW (release commands, hotfix commands, invariant prose) is NOT persisted anywhere — it lives in this catalogue (the per-strategy sections above) and in `references/sdet-integration-trunk.md`, read on demand. (The yaml snippets below show only the `git_strategy` block; everything nests under that key inside `.agents/project.yaml`.)

The conceptual blocks that the old runbook rendered now map to `git_strategy` fields:

- **(a) Markers → fields** — `git_strategy.strategy` + `git_strategy.branches.integration` (or `ephemeral_pattern`) + the applicable `git_strategy.decisions.*`. Decisions a strategy doesn't use stay `n/a`.
- **(b) Invariant** — NOT persisted. It is implied by `git_strategy.decisions.promote_method: ff-only` (the "production is an ancestor of integration" invariant holds only for `ff-only`). The prose explaining it lives in this catalogue's per-strategy section, read on demand.
- **(c) Branch-role table → `branches` + `protected`** — `git_strategy.branches.production` / `.integration` / `.ephemeral_pattern` capture the long-lived/ephemeral branches; `git_strategy.protected` lists the branches needing confirm-before-push. Work-branch prefixes live in `git_strategy.branch_prefixes`.
- **(d) Merge methods + promotion + hotfix → `decisions`** — `feature_merge` (work-branch → integration/trunk), `promote_method` (integration → production), `hotfix_policy`. The actual command shapes are read from this catalogue, not stored in the block.
- **(e) Protection policy → `policy`** (Q4, applies to ALL strategies) — `direct_push_to_protected` (`forbidden` | `confirm` | `allowed`), `admin_bypass` (team POLICY intent, not enforcement), `require_pr_reviews`. Consumed by the Push operation (SKILL.md 3.3). Per-strategy defaults are listed in each field-rule block below.

> `git_strategy.decisions.promote_method: ff-only` is the marker for the fast-forward release model + the ancestor invariant. `merge-commit`/`squash` means the invariant does NOT hold — the per-strategy catalogue section explains the alternative command shape.

### `solo-main` — field rule (MINIMAL)

Single long-lived branch. No integration, no promotion, no hotfix — all `decisions.*` stay `n/a`.

```yaml
git_strategy:
  strategy: solo-main
  description: >
    This project uses the `solo-main` flow. One long-lived branch; every push to `main` is a release.
  branches:
    production: main
    integration: null
    ephemeral_pattern: null
  protected:
    - main
  decisions:
    promote_method: n/a
    feature_merge: n/a
    hotfix_policy: n/a
  policy:
    direct_push_to_protected: allowed   # Q4 — solo dev pushes straight to main
    admin_bypass: false                 # n/a in practice (single operator); kept false
    require_pr_reviews: 0
```

Work lands on `main` directly, or via an optional PR → `main` when a review/CI gate is wanted. No promotion or hotfix ceremony — there is one branch. Q4 policy: direct push to `main` is `allowed` (still confirmed once per the Push op), no admin bypass, zero required reviews.

### `github-flow` — field rule (MINIMAL)

`main` always deployable; feature branches → PR → merge → deploy. No integration, no promotion, no hotfix.

```yaml
git_strategy:
  strategy: github-flow
  description: >
    This project uses the `github-flow` flow. `main` is always deployable; every change is a
    short-lived branch merged via PR. Merge = deploy; rollback = revert the PR.
  branches:
    production: main
    integration: null
    ephemeral_pattern: null
  protected:
    - main
  decisions:
    promote_method: n/a
    feature_merge: n/a
    hotfix_policy: n/a
  policy:
    direct_push_to_protected: forbidden   # Q4 — everything lands via PR
    admin_bypass: false
    require_pr_reviews: 1
```

Every change is a short-lived `feature/*` / `fix/*` branch off `main` → PR → `main`. Q4 policy: direct push to `main` is `forbidden` (PR-only), no admin bypass, 1 required review.

### `trunk-based` — field rule (MINIMAL)

Trunk (`main`) is the only long-lived branch; short-lived branches merge fast behind flags. CI gate non-negotiable.

```yaml
git_strategy:
  strategy: trunk-based
  description: >
    This project uses the `trunk-based` flow. `main` is the only long-lived branch; short-lived
    branches merge fast, incomplete work hides behind feature flags. The CI gate is non-negotiable.
  branches:
    production: main
    integration: null
    ephemeral_pattern: null
  protected:
    - main
  decisions:
    promote_method: n/a
    feature_merge: merge-commit   # or n/a if Q2 was not asked
    hotfix_policy: n/a
  policy:
    direct_push_to_protected: forbidden   # Q4 — CI-gated PRs only
    admin_bypass: false
    require_pr_reviews: 1
```

Short-lived branch (off `main`, <1 day) → fast, CI-gated merge to trunk. `feature_merge` is recorded only if Q2 was asked; otherwise leave `n/a`. Q4 policy: direct push to `main` is `forbidden` (the CI gate runs on PRs), no admin bypass, 1 required review.

### `main-integration` — field rule

`main` (production) + one integration branch. Populates `branches.integration` + all three `decisions.*`. This is the GOLD shape.

```yaml
git_strategy:
  strategy: main-integration
  description: >
    This project uses the `main-integration` flow. One environment per branch:
    localhost (dev) → staging (integration) → main (production).
    Core invariant (ff-only promotion): `main` MUST always be an ancestor of `staging`.
  branches:
    production: main
    integration: staging
    ephemeral_pattern: null
  protected:
    - main
    - staging
  decisions:
    promote_method: ff-only                 # Q1
    feature_merge: merge-commit             # Q2
    hotfix_policy: branch-off-prod-backmerge # Q3
  policy:
    direct_push_to_protected: forbidden     # Q4 — main + staging are PR-only
    admin_bypass: false
    require_pr_reviews: 1
```

- `decisions.promote_method: ff-only` → the "main is an ancestor of staging" invariant holds; release is `git merge --ff-only staging`. For `merge-commit`/`squash` the invariant does NOT hold and the release command is `git merge --no-ff staging` (or `--squash`).
- `decisions.feature_merge` → how `feature/fix → staging` accrues history.
- `decisions.hotfix_policy: branch-off-prod-backmerge` → hotfix branches off `main`, PRs to `main`, back-merges to `staging` same day. Command shapes live in the `main-integration` catalogue section above.

### `gitflow` — field rule

`main` + `develop`; `release/*` cut off `develop`, merged to `main` AND back-merged to `develop`; `hotfix/*` off `main`.

```yaml
git_strategy:
  strategy: gitflow
  description: >
    This project uses the `gitflow` flow. `develop` is integration; `main` holds releases only.
    Invariant: `develop` and `main` diverge between releases by design; every release/hotfix that
    lands on `main` is back-merged into `develop` the same day (back-merge discipline).
  branches:
    production: main
    integration: develop
    ephemeral_pattern: null
  protected:
    - main
    - develop
  decisions:
    promote_method: merge-commit             # release/* → main is inherently a merge commit, never ff
    feature_merge: merge-commit              # Q2: feature/* → develop
    hotfix_policy: branch-off-prod-backmerge # Q3: hotfix off main, back-merge to develop
  policy:
    direct_push_to_protected: forbidden      # Q4 — main + develop are PR-only
    admin_bypass: false
    require_pr_reviews: 1
```

> Field note: gitflow's `promote_method` is `merge-commit` BY NATURE — a `release/* → main` merge is inherently a merge commit, never a fast-forward. Do NOT normalize it to the Q1 `ff-only` default. gitflow's invariant is the same-day back-merge to `develop`, not an ancestor relation. `release/*` / `hotfix/*` are on-demand branches (not stored in `branches:`); their roles + command shapes live in the `gitflow` catalogue section above.

### `gitlab-flow` — field rule

`main` + environment branches; code flows one direction `main → pre-production → production`. `production` is the production branch.

```yaml
git_strategy:
  strategy: gitlab-flow
  description: >
    This project uses the `gitlab-flow` flow. Work merges to `main`; code is promoted one
    direction through environment branches: main → pre-production → production.
    Invariant (ff-only promotion): each env branch is a pure ancestor of the one upstream.
  branches:
    production: production
    integration: main          # feature base + first env
    ephemeral_pattern: null
  protected:
    - main
    - pre-production
    - production
  decisions:
    promote_method: ff-only                 # Q1: promotion through env branches
    feature_merge: merge-commit             # Q2: feature/fix → main
    hotfix_policy: branch-off-prod-backmerge # Q3: branch off production, forward-port up the chain
  policy:
    direct_push_to_protected: forbidden     # Q4 — env branches are promotion-only (ff), work via PR to main
    admin_bypass: false
    require_pr_reviews: 1
```

- `branches.production` is `production` (NOT `main` — work integrates at `main`, production is the last env). The env branches `pre-production` / `production` carry the promotion chain; their roles + ff-promotion commands live in the `gitlab-flow` catalogue section above.
- `decisions.hotfix_policy` for one-direction flows means branch off `production`, then forward-port / cherry-pick up the chain (no literal back-merge).

### `enterprise` — field rule

`main` + integration + on-demand `feature/*`, `fix/*`, `release/*`, `hotfix/*`. Promotion is integration → `main` AND `release/*` → `main`.

```yaml
git_strategy:
  strategy: enterprise
  description: >
    This project uses the `enterprise` flow. `main` (production) + integration, with on-demand
    release/* stabilisation branches and hotfix/* off main.
    Invariant (ff-only promotion): `main` is a pure ancestor of the integration branch.
  branches:
    production: main
    integration: staging
    ephemeral_pattern: null
  protected:
    - main
    - staging
    # release/* are protected-when-alive (on-demand, not stored here)
  decisions:
    promote_method: ff-only                 # Q1
    feature_merge: merge-commit             # Q2: feature/fix → integration
    hotfix_policy: branch-off-prod-backmerge # Q3
  policy:
    direct_push_to_protected: forbidden     # Q4 — main + integration (+ release/*) are PR-only
    admin_bypass: false
    require_pr_reviews: 1
```

`release/*` / `hotfix/*` / `feature/*` are on-demand branches (created by the Branch operation, not at setup); their roles, the `release/* → main` promotion, and back-merge command shapes live in the `enterprise` catalogue section above.

### `sdet` — field rule

`main` (permanent) + an ephemeral per-suite integration trunk. No production deploy → no invariant, no promotion, no hotfix. The trunk is NOT a fixed branch name — it is a per-suite pattern captured in `branches.ephemeral_pattern`.

```yaml
git_strategy:
  strategy: sdet
  description: >
    This project uses the `sdet` (SDET Gitflow) flow. `main` holds confirmed, regression-ready
    tests. Each test suite runs on an ephemeral integration trunk `test/<module>-suite` (created
    off `main`, deleted after the suite merges). Tickets chain through the trunk; one final
    reviewed PR promotes the suite to `main`. Full runbook:
    .claude/skills/git-flow-master/references/sdet-integration-trunk.md
  branches:
    production: main
    integration: null                       # the trunk is ephemeral, not a fixed long-lived branch
    ephemeral_pattern: "test/<module>-suite"
  protected:
    - main
  decisions:
    promote_method: n/a                     # no production deploy
    feature_merge: merge-commit             # FIXED — ticket/Plus → trunk is always --no-ff, never squash
    hotfix_policy: n/a
  policy:
    direct_push_to_protected: confirm       # Q4 — maintainer self-merges the trunk; main confirms
    admin_bypass: false
    require_pr_reviews: 0                    # 0 on the trunk (self-merge); 1 on the final trunk → main PR
```

- `git_strategy.branches.ephemeral_pattern` holds the per-suite trunk pattern (`test/<module>-suite`); `git_strategy.branches.integration` stays `null` because no fixed integration branch persists.
- `git_strategy.decisions.feature_merge: merge-commit` is FIXED (a defining property, never a questionnaire choice). `promote_method` / `hotfix_policy` stay `n/a`.
- `git_strategy.policy`: `direct_push_to_protected: confirm` (the maintainer self-merges the trunk; pushes to `main` are confirmed), `admin_bypass: false`, `require_pr_reviews: 0` on the trunk / `1` on the final `trunk → main` PR.
- The per-ticket loop, `--no-ff` ticket merges, Plus Branches, the sync gate, the single final `trunk → main` PR, and the CI-fallback clause are NOT in the yaml — they live in `references/sdet-integration-trunk.md` and the `sdet` catalogue section above.
