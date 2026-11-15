# Branching strategies: catalogue, detection, trade-offs

Each strategy answers four questions for the skill: where new branches start, where PRs target, which branches are protected, and how releases promote. Read this file to resolve the strategy, to plan chained PRs, or to find the field values a strategy writes into `git_strategy:`.

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
9. [Detection algorithm](#detection-algorithm)
10. [Chained-PR decision tree](#chained-pr-decision-tree)
11. [Strategy comparison matrix](#strategy-comparison-matrix)

---

## `solo-main`

Shape: one long-lived branch (`main`). All work lands directly. Ephemeral branches appear only when the user wants a PR for documentation or CI gating.

Best for: solo projects, prototypes, scratch repos, personal websites, throwaway demos.

Detection signals:

- `git branch -a` returns only `main` (or `master`) and no other long-lived remote branches.
- A single contributor in `git log --format='%ae' | sort -u`.
- No `staging`, `dev` or `develop` branch upstream.

Source branch for new work: `main`.

PR base: `main`, when PRs are used at all (solo-main often skips them).

Protected branches: `main`. A direct push follows `git_strategy.policy.direct_push_to_protected` (`allowed` = push without asking, `confirm` = ask every push, `forbidden` = PR).

Release model: continuous; every push is a release.

Trade-offs:

- Pros: zero branching overhead, fast feedback loop.
- Cons: no review gate; `main` may break between commits; no isolation for risky work.

---

## `main-integration`

Shape: `main` (production) plus one integration branch (`staging`, `dev` or `develop`). Features merge to integration; integration promotes to `main` only on release.

Best for: small teams (2-10 people), one-product repos, CD pipelines that promote `staging` to `main` on a cadence.

Detection signals:

- `git branch -a` shows `main` (or `master`) and exactly one of `{staging, dev, develop, integration}` upstream.
- Branch protection rules on both branches (visible through `gh api`).
- `AGENTS.md` mentions both branches in a "Git Workflow" section.

Source branch for new work: the integration branch (for example `staging`).

PR base: the integration branch by default. Promotion PRs (`staging` to `main`) target `main`.

Protected branches: `main` and the integration branch. Confirm before any direct push to either.

Release model: the integration branch is always deployable to a staging environment; `main` deploys to production on a release event.

Trade-offs:

- Pros: a single review gate; staging matches production; rollback is a revert of the promotion PR.
- Cons: the integration branch drifts when releases are rare; promotion costs a second merge (cherry-pick, merge, rebase or re-PR).

Persisted in the `git_strategy:` block of `.agents/project.yaml`:

```yaml
git_strategy:
  strategy: main-integration
  branches:
    production: main
    integration: staging
```

---

## `enterprise`

Shape: `main` plus integration plus many short-lived `feature/*` and `fix/*` branches, with `release/*` and `hotfix/*` for production fixes. Environment branches (`pre-production`, regional branches) appear when the deployment topology demands them.

Best for: 10+ contributors, several parallel features, regulated environments (compliance, audit), products with explicit release cycles.

Detection signals:

- `main`, integration, and active `feature/*` or `release/*` branches in `git branch -a`.
- A non-trivial `.github/CODEOWNERS`.
- `gh api repos/.../branches/main/protection` returns rules with required reviewers and status checks.
- Long-lived `release/*` or `hotfix/*` branches.

Source branch for new work:

- `feature/*`, `fix/*`: the integration branch.
- `hotfix/*`: `main` (cherry-pick back to integration after the merge).
- `release/X.Y.Z`: the integration branch (cut for stabilisation).

PR base: integration; `hotfix/*` goes to `main`; `release/*` goes to `main` (with a back-merge to integration).

Protected branches: `main`, integration, `release/*`. Confirm before any direct push.

Release model: release branches stabilise; the release PR merges to `main` and triggers the production deploy.

Trade-offs:

- Pros: parallel work stays isolated; release-branch stabilisation avoids a feature freeze on integration; the hotfix path is independent of feature work.
- Cons: branching overhead; back-merges are easy to forget; release branches need coordination.

---

## `trunk-based`

Shape: the trunk (`main`) is the only long-lived branch. Short-lived branches (under a day, often under an hour) merge fast. Incomplete features hide behind feature flags. A CI gate on every commit is a precondition.

Best for: high-velocity teams with strong CI/CD, feature-flag infrastructure and a mature test pyramid (the DORA "elite performer" pattern).

Detection signals:

- `git branch -a` shows `main` plus only ephemeral feature branches (most a day old or less).
- High commit frequency to `main` (`git log --since='7 days ago' --pretty=oneline | wc -l` above 20 in a small team).
- A feature flag system in `package.json` or config (LaunchDarkly, Unleash, custom).
- `.github/workflows/` enforces CI on every PR.

Source branch for new work: `main`.

PR base: `main`. Direct commits to `main` for tiny changes are acceptable in pure trunk-based.

Protected branches: `main`. The CI gate is the protection: required status checks before merge.

Release model: continuous deployment from `main`. Feature flags decouple deploy from release.

Trade-offs:

- Pros: minimal branching overhead; conflicts are rare; enables CD.
- Cons: needs feature flags and strong CI; no obvious place for long-running spike work.

---

## `gitflow`

Shape: Vincent Driessen's classic model. `main` (releases only), `develop` (integration), `feature/*` (off `develop`), `release/*` (off `develop`, merged to `main`) and `hotfix/*` (off `main`).

Best for: products with explicit, infrequent versioned releases (desktop apps, libraries with semver, embedded software). Mostly legacy: Driessen himself notes most teams should prefer trunk-based or GitHub Flow.

Detection signals:

- A `develop` branch upstream (the unique signal).
- Long-lived `release/*` or `hotfix/*` branches.
- A `.gitflow` config file (rare).
- Merge commits named `Merge branch 'release/X.Y.Z'` in the history.

Source branch for new work:

- `feature/*`: `develop`.
- `release/*`: `develop`.
- `hotfix/*`: `main`.

PR base:

- `feature/*`: `develop`.
- `release/*`: `main` (then back-merge to `develop`).
- `hotfix/*`: `main` (then back-merge to `develop`).

Protected branches: `main`, `develop`, all `release/*`.

Release model: cut `release/X.Y.Z` from `develop`, stabilise, merge to `main` and `develop`, tag.

Trade-offs:

- Pros: explicit release stabilisation; an independent hotfix path; well documented.
- Cons: heavy; merge complexity; back-merge errors are common; ill-suited to CD.

---

## `github-flow`

Shape: `main` is always deployable. `feature/*` branches go through PR, review, merge, deploy. No staging or develop branch.

Best for: web apps with continuous deployment, GitHub-native teams, projects with one production environment.

Detection signals:

- `git branch -a` shows `main` and `feature/*` (or unprefixed feature branches) only.
- No `staging`, `dev` or `develop` upstream.
- `.github/workflows/` deploys on push to `main`.
- `CONTRIBUTING.md` says "branch off main, open PR".

Source branch for new work: `main`.

PR base: `main`.

Protected branches: `main`, with required status checks and at least one review.

Release model: every merge to `main` deploys. Tags are optional, used for marketing versions.

Trade-offs:

- Pros: simple; matches CD; one clear source of truth.
- Cons: no staging environment without extra effort; rollback is a revert PR.

---

## `gitlab-flow`

Shape: GitHub Flow plus environment branches (`pre-production`, `production`, regional `production-eu`). Code flows one way: `main` to `pre-production` to `production`.

Best for: teams that need a deployment pipeline with promotion gates but want to avoid GitFlow's release-branch complexity. Common in GitLab-hosted projects.

Detection signals:

- A `.gitlab-ci.yml` that references several environments.
- `git branch -a` shows `main`, `pre-production` (or `staging`) and `production`.
- Linear merge history (no back-merges).
- A GitLab repo, though the pattern is portable.

Source branch for new work: `main`.

PR (MR) base: `main` for feature work. Promotion MRs go `main` to `pre-production`, then `pre-production` to `production`.

Protected branches: every environment branch (`main`, `pre-production`, `production`).

Release model: cherry-pick or fast-forward from `main` through the environment branches.

Trade-offs:

- Pros: an explicit promotion path that matches the deployment pipeline; no back-merge complexity.
- Cons: extra branches to maintain; promotion MRs add ceremony.

---

## `sdet`

SDET Gitflow: an integration trunk for chained test-automation suites. The full runbook is `references/sdet-integration-trunk.md`; this entry holds what resolving the strategy needs.

Shape: `main` (permanent, holds confirmed regression-ready tests) plus an ephemeral per-suite integration trunk named `test/<module>-suite`. The trunk is the local stand-in for `main` for one suite: cut off `main` when the suite starts, deleted after the suite's final PR merges. Each ticket is a `test/{KEY}-{slug}` branch cut from the trunk, PR'd into the trunk (not `main`) and merged `--no-ff`. Adjacent non-test work rides Plus Branches (`docs/*`, `chore/*`, `fix/*`) that also PR into the trunk. One final reviewed PR promotes the trunk to `main`.

Best for: test-automation repos where one maintainer (or AI agent) automates multi-ticket suites (a whole module, or a chained ticket-driven scope from `/test-automation`). It avoids one giant unreviewable PR, avoids a tiny PR per ticket paying `main`'s ruleset tax, and keeps the final diff clean.

Detection signals:

- `git_strategy.strategy: sdet` in `.agents/project.yaml` (the primary signal; the strategy is opt-in and is not inferred from layout).
- A live `test/<module>-suite` trunk with several `test/{KEY}-*` PRs targeting it instead of `main`.
- A QA or test-automation boilerplate repo (KATA, Playwright, the `/test-automation` skill present).

Source branch for new work:

- `test/{KEY}-{slug}` ticket branches: cut from the integration trunk, never from the previous ticket branch.
- The trunk `test/<module>-suite`: cut from `main` on demand when a suite begins, not at Strategy Setup time.
- Plus Branches (`docs/*`, `chore/*`, `fix/*`): cut from the trunk, carrying adjacent non-test work.

PR base:

- Ticket branches and Plus Branches: the integration trunk.
- The final suite PR: `main`, the only PR that faces `main`'s rulesets.

Protected branches: `main` (the final PR needs review and green CI, with no CI-fallback). The trunk is protected by convention while alive; the maintainer self-merges intermediate ticket and Plus PRs with no ruleset friction.

Merge methods (fixed, not a questionnaire choice): ticket and Plus PRs into the trunk are always `--no-ff`, never squash, to preserve per-ticket history. The trunk to `main` follows the repo's allowed merge method; prefer a merge commit to keep the multi-branch look. Squash collapses the suite to one commit on `main` (the chain still lives on the pushed trunk).

Release model: per suite. Tickets accumulate on the trunk behind Sanity CI and review. A sync gate (`git merge origin/main`) runs before the final PR so the diff against `main` shows only this suite's test work. "Automated" means running in CI on `main` after the final merge, never at trunk-merge time.

CI-fallback clause: when a Sanity-CI red is purely infra or a known flake (proven by a local pass on both `local` and `staging`, and by the red being present independent of the change), the local double-pass authorizes merging into the trunk only, never the final `trunk` to `main` PR. It leaves the tests, types, lint order of Critical Rule 7 intact (the local gate still passes in full) and only governs whether a remote infra-red blocks a trunk-internal merge. `/regression-testing` owns the ENVIRONMENT-class classification.

Persisted in the `git_strategy:` block of `.agents/project.yaml`:

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

`git_strategy.decisions.feature_merge` is fixed at `merge-commit` (`--no-ff`); it is a defining property, not a questionnaire answer. `git_strategy.branches.integration` stays `null` because the trunk is ephemeral per suite and lives in `git_strategy.branches.ephemeral_pattern`. `git_strategy.decisions.promote_method` and `.hotfix_policy` stay `n/a` (no production deploy; `main` is the confirmed-tests branch).

Trade-offs:

- Pros: per-ticket scoped diffs (review is useful); per-ticket Sanity CI; no ruleset friction on intermediate merges; one clean consolidated PR to `main`; `--no-ff` keeps the suite's commit topology.
- Cons: an extra branch layer; sync-gate ceremony before the final PR; the CI-fallback clause needs human judgment; assumes one maintainer per suite (intermediate PRs are self-merged).

---

## Detection algorithm

Run the steps in order and stop at the first definitive answer.

```
1. Read the `git_strategy:` block of `.agents/project.yaml`. If `git_strategy.strategy`
   is non-null, use it + `git_strategy.branches` + `git_strategy.decisions` (and
   `git_strategy.policy`) fields. (Sticky decision wins.)

2. Inspect `git branch -a`:
   - Only `main` (or `master`) → solo-main.
   - `main` + exactly one of {staging, dev, develop, integration} → main-integration.
     Record the integration branch name in `git_strategy.branches.integration`.
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

5. Fallback: ask the user. Show the options as a numbered list
   with one-line descriptions. Mirror their language. Do not pick silently.

Note on `sdet`: it is opt-in only and never inferred from layout. It is
resolved from the `git_strategy:` block in `.agents/project.yaml` (step 1) or chosen explicitly in the fallback (step 5). On a
test-automation repo (KATA / Playwright / `/test-automation`), surface it as the
recommended option in the fallback list. A live `test/<module>-suite` trunk with
`test/{KEY}-*` PRs targeting it confirms an already-active `sdet` suite.
```

Step 5 asks the user, and the ask is a small decision, so follow `agentic-qa-core/references/decision-protocol.md`. With nobody present (a worker or a routine), take no silent pick: record the question in the run's notes, use the strategy `git_strategy` already holds if it is non-null, and otherwise report "strategy unresolved" and stop before any branch, push or PR.

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

> `sdet` short-circuit: when the active strategy is `sdet`, the integration-trunk model is the standing chained mode for every test suite, so do not walk this tree for test-automation work. `sdet` is `feature-branch-chain` promoted from a large-change exception to the permanent mode, with extra gates (`--no-ff` ticket merges, local double-env validation, Sanity CI, sync gate, one final PR). See `references/sdet-integration-trunk.md`. The tree still applies to non-test changes on an `sdet` repo (a one-off large refactor of the framework itself).

When a planned change estimates over 400 changed lines (additions plus deletions), walk this tree before opening PRs.

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

The answer is the deliverable, not the label. Callers gate on this decision and reject a bare strategy name (`SKILL.md` Compact Rules, the chained-PR rule). Record each answer with the concrete reason drawn from this change, stop at the leaf, and return this three-line block:

```
Chain strategy: feature-branch-chain
Decision trace: Q1=No (new fixture API and Page components, not a rename or formatter run) ·
                Q2=No (the specs in slice 2 cannot compile without the fixture added in slice 1) ·
                Q3=Yes (shared fixture + api/schemas types consumed by slices 2-4) → feature-branch-chain
Decided by: /git-flow-master §Chained-PR decision tree (branching-strategies.md)
```

A `Yes` at Q1 ends the walk: write `Q2=n/a · Q3=n/a`. A `Yes` at Q2 writes `Q3=n/a`. Answers that do not lead to the stated leaf, or a "trace" that only repeats the conclusion, are malformed and count as no decision. A re-run (the real diff outgrew the estimate) replaces the whole block; it does not append a second leaf to the old trace.

The tree is a decision the agent makes from the diff, with no human sign-off needed in any mode.

Strategy outputs:

- `stacked-to-main`: 2 to 4 PRs, each branched off the strategy's default base. Each PR is self-contained and the base works after each merge.
- `feature-branch-chain`: one long-lived integration branch cut from the strategy's default base; child PRs merge into it; the final PR merges integration into base.
- `size-exception`: a single PR with an explicit `Why size-exception:` line. The reviewer is told upfront not to read line by line.

The chosen plan is a contract for execution. If the actual diff exceeds the estimate, re-run the decision and replace the block; do not up-budget silently.

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

Strategy Setup (SKILL.md 3.6) does not render a prose runbook into `AGENTS.md`. It populates the `git_strategy:` block in `.agents/project.yaml` in place, preserving the rest of the file; that block is the single source of truth. This section lists which field values each strategy writes. The operational detail (release commands, hotfix commands, invariant prose) is not persisted anywhere: it lives in the per-strategy sections above and in `references/sdet-integration-trunk.md`, read on demand. The yaml snippets below show only the `git_strategy` block; everything nests under that key.

The pieces of the old runbook map to fields like this:

- Markers: `git_strategy.strategy`, `git_strategy.branches.integration` (or `ephemeral_pattern`) and the `git_strategy.decisions.*` that apply. Decisions a strategy does not use stay `n/a`.
- Invariant: not persisted. `git_strategy.decisions.promote_method: ff-only` implies it ("production is an ancestor of integration" holds only for `ff-only`). The prose lives in the per-strategy section.
- Branch roles: `git_strategy.branches.production`, `.integration` and `.ephemeral_pattern` capture the long-lived and ephemeral branches; `git_strategy.protected` lists the branches that need confirmation before a push. Work-branch prefixes live in `git_strategy.branch_prefixes`.
- Merge methods, promotion, hotfix: `feature_merge` (work branch into integration or trunk), `promote_method` (integration into production), `hotfix_policy`. Command shapes are read from the catalogue above, not stored in the block.
- Protection policy (Q4, applies to every strategy): `git_strategy.policy` holds `direct_push_to_protected` (`forbidden`, `confirm` or `allowed`), `admin_bypass` (the team's policy intent, not enforcement) and `require_pr_reviews`. The Push operation (SKILL.md 3.3) consumes it. Per-strategy defaults are in each block below.

> `git_strategy.decisions.promote_method: ff-only` marks the fast-forward release model and the ancestor invariant. `merge-commit` or `squash` means the invariant does not hold, and the per-strategy section gives the alternative command shape.

### `solo-main` field rule (minimal)

Single long-lived branch. No integration, no promotion, no hotfix, so every `decisions.*` stays `n/a`.

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

Work lands on `main` directly, or through an optional PR to `main` when a review or CI gate is wanted. Q4 policy: direct push to `main` is `allowed` (standing authorization, no per-push confirm), no admin bypass, zero required reviews.

### `github-flow` field rule (minimal)

`main` is always deployable; feature branches go PR, merge, deploy. No integration, no promotion, no hotfix.

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

Every change is a short-lived `feature/*` or `fix/*` branch off `main`, then a PR to `main`. Q4 policy: direct push to `main` is `forbidden` (PR only), no admin bypass, 1 required review.

### `trunk-based` field rule (minimal)

The trunk (`main`) is the only long-lived branch; short-lived branches merge fast behind flags. The CI gate is a precondition.

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

A short-lived branch (off `main`, under a day) gets a fast, CI-gated merge to the trunk. Record `feature_merge` only if Q2 was asked; otherwise leave `n/a`. Q4 policy: direct push to `main` is `forbidden` (the CI gate runs on PRs), no admin bypass, 1 required review.

### `main-integration` field rule

`main` (production) plus one integration branch. This block populates `branches.integration` and all three `decisions.*`, and is the reference shape for the others.

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

- `decisions.promote_method: ff-only` means `main` stays an ancestor of `staging`, and the release is `git merge --ff-only staging`. For `merge-commit` or `squash` the invariant does not hold and the release command is `git merge --no-ff staging` (or `--squash`).
- `decisions.feature_merge` sets how `feature/fix` into `staging` accrues history.
- `decisions.hotfix_policy: branch-off-prod-backmerge` branches the hotfix off `main`, PRs it to `main` and back-merges to `staging` the same day. The command shapes are in the `main-integration` section above.

### `gitflow` field rule

`main` plus `develop`; `release/*` is cut off `develop`, merged to `main` and back-merged to `develop`; `hotfix/*` branches off `main`.

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

> Field note: gitflow's `promote_method` is `merge-commit` by nature, because a `release/*` to `main` merge is a merge commit and never a fast-forward. Keep it as is and do not normalize it to the Q1 `ff-only` default. The gitflow invariant is the same-day back-merge to `develop`, not an ancestor relation. `release/*` and `hotfix/*` are on-demand branches (not stored in `branches:`); their roles and command shapes are in the `gitflow` section above.

### `gitlab-flow` field rule

`main` plus environment branches; code flows one way, `main` to `pre-production` to `production`. `production` is the production branch.

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

- `branches.production` is `production`, not `main`: work integrates at `main` and production is the last environment. The `pre-production` and `production` branches carry the promotion chain; their roles and fast-forward promotion commands are in the `gitlab-flow` section above.
- For one-direction flows, `decisions.hotfix_policy` means branch off `production`, then forward-port (cherry-pick) up the chain, with no literal back-merge.

### `enterprise` field rule

`main` plus integration plus on-demand `feature/*`, `fix/*`, `release/*` and `hotfix/*`. Promotion runs integration to `main` and `release/*` to `main`.

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

`release/*`, `hotfix/*` and `feature/*` are on-demand branches, created by the Branch operation and not at setup. Their roles, the `release/*` to `main` promotion and the back-merge command shapes are in the `enterprise` section above.

### `sdet` field rule

`main` (permanent) plus an ephemeral per-suite integration trunk. There is no production deploy, so no invariant, no promotion and no hotfix. The trunk has no fixed name: it is a per-suite pattern held in `branches.ephemeral_pattern`.

```yaml
git_strategy:
  strategy: sdet
  description: >
    This project uses the `sdet` (SDET Gitflow) flow. `main` holds confirmed, regression-ready
    tests. Each test suite runs on an ephemeral integration trunk `test/<module>-suite` (created
    off `main`, deleted after the suite merges). Tickets chain through the trunk; one final
    reviewed PR promotes the suite to `main`. Full runbook:
    .agents/skills/git-flow-master/references/sdet-integration-trunk.md
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
- `git_strategy.decisions.feature_merge: merge-commit` is fixed (a defining property, never a questionnaire choice). `promote_method` and `hotfix_policy` stay `n/a`.
- `git_strategy.policy`: `direct_push_to_protected: confirm` (the maintainer self-merges the trunk; pushes to `main` are confirmed), `admin_bypass: false`, `require_pr_reviews: 0` on the trunk and `1` on the final `trunk → main` PR.
- The per-ticket loop, `--no-ff` ticket merges, Plus Branches, the sync gate, the single final `trunk → main` PR and the CI-fallback clause are not in the yaml. They live in `references/sdet-integration-trunk.md` and the `sdet` section above.
