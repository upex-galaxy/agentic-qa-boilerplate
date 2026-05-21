# Branching Strategies — Catalogue, Detection, Trade-offs

Seven strategies are supported. Each one tells the skill where new branches start, where PRs target, what counts as "protected", and how releases promote.

---

## Table of contents

1. [`solo-main`](#solo-main)
2. [`main-integration`](#main-integration)
3. [`enterprise`](#enterprise)
4. [`trunk-based`](#trunk-based)
5. [`gitflow`](#gitflow)
6. [`github-flow`](#github-flow)
7. [`gitlab-flow`](#gitlab-flow)
8. [Detection algorithm — combined view](#detection-algorithm)
9. [Chained-PR decision tree](#chained-pr-decision-tree)
10. [Strategy comparison matrix](#strategy-comparison-matrix)

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

**Persisted markers**:

```markdown
<!-- git-flow-master:strategy:main-integration -->
<!-- git-flow-master:integration-branch:staging -->
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

## Detection algorithm

The combined detection runs in this order. Stop at the first definitive answer.

```
1. Read CLAUDE.md for `<!-- git-flow-master:strategy:VALUE -->`.
   If found, use VALUE. (Sticky decision wins.)

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

5. Fallback: ask the user. Show the seven options as a numbered list
   with one-line descriptions. Mirror their language. Do not pick silently.
```

After resolution, persist:

```markdown
## Git Strategy

<!-- git-flow-master:strategy:VALUE -->
<!-- git-flow-master:integration-branch:NAME -->  <!-- only if VALUE uses one with non-default name -->

This project uses the `VALUE` flow: <one-paragraph description for humans>.
```

---

## Chained-PR decision tree

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

| Aspect                       | solo-main  | main-integration | enterprise  | trunk-based  | gitflow     | github-flow | gitlab-flow |
| ---------------------------- | ---------- | ---------------- | ----------- | ------------ | ----------- | ----------- | ----------- |
| Long-lived branches          | 1          | 2                | 3+          | 1            | 3+          | 1           | 2-4         |
| PR review required           | Optional   | Yes              | Yes         | Yes          | Yes         | Yes         | Yes         |
| CI gate                      | Optional   | Yes              | Yes         | **Required** | Yes         | Yes         | Yes         |
| Feature flags                | No         | Optional         | Optional    | **Required** | Optional    | Optional    | Optional    |
| Release-branch stabilisation | No         | No               | Yes         | No           | Yes         | No          | No          |
| Hotfix path                  | Direct     | Promotion        | Dedicated   | Direct       | Dedicated   | Direct      | Promotion   |
| Best team size               | 1          | 2-10             | 10+         | 5+           | 5-50        | 1-20        | 5-30        |
| Deployment frequency         | Continuous | Per-release      | Per-release | Continuous   | Per-release | Continuous  | Continuous  |
| Complexity                   | Low        | Low-medium       | High        | Medium       | High        | Low         | Medium      |
