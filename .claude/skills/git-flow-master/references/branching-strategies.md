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

## `sdet`

**SDET Gitflow — integration-trunk for chained test-automation suites.** Full runbook: `references/sdet-integration-trunk.md`.

**Shape**: `main` (permanent — holds confirmed, regression-ready tests) + an **ephemeral per-suite integration trunk** named `test/<module>-suite`. The trunk is the local surrogate-`main` for one test suite: it is created off `main` when the suite starts and deleted after the suite's final PR merges. Each ticket is a `test/{KEY}-{slug}` branch cut from the trunk, PR'd **into the trunk** (not `main`), and merged `--no-ff`. Adjacent non-test work rides **Plus Branches** (`docs/*`, `chore/*`, `fix/*`) that also PR into the trunk. One final reviewed PR promotes `trunk → main`.

**Best for**: test-automation repos where a single maintainer (or AI agent) automates multi-ticket suites (a whole module, or a chained ticket-driven scope from `/test-automation`). The defining problem it solves: avoid one giant unreviewable PR, avoid one tiny PR per ticket paying `main`'s ruleset tax, and keep the final diff clean.

**Detection signals**:

- `<!-- git-flow-master:strategy:sdet -->` marker in `CLAUDE.md` (primary — this strategy is opt-in, never silently auto-detected).
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

**Persisted markers**:

```markdown
<!-- git-flow-master:strategy:sdet -->
<!-- git-flow-master:feature-merge:merge-commit -->
```

`feature-merge` is fixed at `merge-commit` (`--no-ff`) — it is a defining property, not a questionnaire answer. `integration-branch` is NOT persisted (the trunk is ephemeral per-suite, named `test/<module>-suite` at suite start). `promote-method` / `hotfix-policy` do not apply (no production deploy; `main` is the confirmed-tests branch).

**Trade-offs**:

- Pros: per-ticket scoped diffs (review is actually useful); per-ticket Sanity CI; zero ruleset friction on intermediate merges; one clean consolidated PR to `main`; `--no-ff` preserves the suite's commit topology.
- Cons: extra branch layer; sync-gate ceremony before the final PR; the CI-fallback clause requires human judgment; assumes a single maintainer per suite (intermediate PRs are self-merged).

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

5. Fallback: ask the user. Show the eight options as a numbered list
   with one-line descriptions. Mirror their language. Do not pick silently.

Note on `sdet`: it is **opt-in only** — never inferred silently from layout. It is
resolved from the marker (step 1) or chosen explicitly in the fallback (step 5). On a
test-automation repo (KATA / Playwright / `/test-automation`), surface it as the
recommended option in the fallback list. A live `test/<module>-suite` trunk with
`test/{KEY}-*` PRs targeting it confirms an already-active `sdet` suite.
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

## Runbook render rules

Strategy Setup (SKILL.md 3.6) renders a `## Git Strategy` section into `CLAUDE.md`. This is the single source of truth for WHAT that section contains per strategy. Each rule produces up to FOUR blocks, filled from the resolved strategy + the Q1/Q2/Q3 answers:

- **(a) Markers** — strategy + integration-branch (if any) + the applicable decision markers. Omit any decision marker the strategy doesn't use.
- **(b) Invariant** — render ONLY when promotion is `ff-only`. For `merge-commit`/`squash` promotion, OMIT the invariant (it does not hold). Single-branch strategies have no invariant at all.
- **(c) Branch-role table** — rows = the long-lived branches for that strategy (materialization table) + the work-branch prefixes.
- **(d) Merge methods + promotion + hotfix** — rendered from Q1/Q2/Q3. If promotion is `merge-commit`/`squash`, render that command shape and DROP the byte-identical/ancestor claims. Single-branch strategies render commit rules only — no promotion, no hotfix.

> When promotion = `ff-only`, render the fast-forward release block AND the invariant. When promotion = `merge-commit` or `squash`, render the merge/squash release command instead and OMIT the invariant + byte-identical claims.

### `solo-main` — render rule (MINIMAL)

Single long-lived branch. No invariant, no promotion, no hotfix.

- **(a) Markers**: `strategy:solo-main` only.
- **(c) Branch table**: `main` (production; all work lands here) + work prefixes (`feat/*`, `fix/*`, …) when PRs are used at all.
- **(d) Commit rules**: work lands on `main` directly or via an optional PR → `main`; atomic conventional commits; no AI attribution. No promotion block, no hotfix block.

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:solo-main -->

This project uses the `solo-main` flow. One long-lived branch; every push to `main` is a release.

| Branch | Role                                                      |
| ------ | --------------------------------------------------------- |
| main   | The only long-lived branch. All work lands here directly. |

Work lands on `main` directly, or via an optional PR → `main` when a review/CI gate is wanted.
Commits: atomic, conventional, no AI attribution. No promotion or hotfix ceremony — there is one branch.
```

### `github-flow` — render rule (MINIMAL)

`main` always deployable; feature branches → PR → merge → deploy. No invariant, no promotion, no hotfix.

- **(a) Markers**: `strategy:github-flow` only.
- **(c) Branch table**: `main` (production, always deployable) + `feature/*`/`fix/*` (off `main`, PR → `main`).
- **(d) Commit rules**: every change is a short-lived branch → PR → `main`; merge = deploy. No promotion block, no hotfix block.

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:github-flow -->

This project uses the `github-flow` flow. `main` is always deployable; every change is a short-lived branch merged via PR.

| Branch    | Role                                                 |
| --------- | ---------------------------------------------------- |
| main      | Production. Always deployable. Merge to main deploys.|
| feature/* | Branched off main. PR → main.                        |
| fix/*     | Branched off main. PR → main.                        |

Work lands on `main` via PR. Merge = deploy; rollback = revert the PR.
Commits: atomic, conventional, no AI attribution. No integration branch, no promotion, no hotfix path.
```

### `trunk-based` — render rule (MINIMAL)

Trunk (`main`) is the only long-lived branch; short-lived branches merge fast behind flags. No invariant, no promotion, no hotfix.

- **(a) Markers**: `strategy:trunk-based` (+ `feature-merge` if Q2 was asked).
- **(c) Branch table**: `main` (trunk) + short-lived branches (off `main`, <1 day).
- **(d) Commit rules**: short-lived branch → fast merge to trunk; CI gate is non-negotiable; incomplete work behind feature flags. No promotion block, no hotfix block.

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:trunk-based -->

This project uses the `trunk-based` flow. `main` is the only long-lived branch; short-lived branches merge fast, incomplete work hides behind feature flags. The CI gate is non-negotiable.

| Branch    | Role                                                   |
| --------- | ------------------------------------------------------ |
| main      | Trunk. The only long-lived branch. CI-gated.           |
| <short>/* | Short-lived (<1 day). Fast merge to main behind flags. |

Work lands on `main` via a fast, CI-gated merge. No integration branch, no promotion, no hotfix path.
Commits: atomic, conventional, no AI attribution.
```

### `main-integration` — render rule

`main` (production) + one integration branch. Renders all four blocks. This is the GOLD shape (reproduced verbatim in this repo and in S7 of the spec).

- **(a) Markers**: `strategy:main-integration` + `integration-branch:NAME` + the three decision markers.
- **(b) Invariant**: ONLY when Q1 = `ff-only` — "`main` MUST always be an ancestor of `<integration>`". OMIT for merge-commit/squash promotion.
- **(c) Branch table**: `main`, `<integration>`, `feature/*`, `fix/*`.
- **(d)**: merge-methods table (Q2 for feature→integration, Q1 for integration→main), release block (ff or merge/squash per Q1), hotfix block per Q3.

GOLD render (Q1=ff-only, Q2=merge-commit, Q3=branch-off-prod-backmerge, integration=`staging`):

```markdown
### Git Strategy

<!-- git-flow-master:strategy:main-integration -->
<!-- git-flow-master:integration-branch:staging -->
<!-- git-flow-master:promote-method:ff-only -->
<!-- git-flow-master:feature-merge:merge-commit -->
<!-- git-flow-master:hotfix-policy:branch-off-prod-backmerge -->

This project uses the `main-integration` flow. One environment per branch:
localhost (dev) → staging (integration, own Vercel env) → main (production, own Vercel env).

Core invariant: `main` MUST always be an ancestor of `staging`. This is what allows
release promotion to be a clean fast-forward. Anything that lands on `main` without
going through `staging` (a hotfix) breaks the invariant and MUST be back-merged into
`staging` immediately to restore it.

Flow:
  localhost → feature/fix (off staging) --merge commit--> staging --ff-only--> main

| Branch      | Role                                                              |
| ----------- | ----------------------------------------------------------------- |
| main        | Production. Updated ONLY via fast-forward release from staging.   |
| staging     | Integration. Default base for all work branches + all dev PRs.    |
| feature/*   | Branched off staging. feature/TICKET-ID-desc.                     |
| fix/*       | Branched off staging. fix/TICKET-ID-desc.                         |

Merge methods (decided, do not improvise):
| Transition                  | Method                  |
| feature/fix → staging       | Merge commit (--no-ff)  |
| staging → main (release)    | Fast-forward only       |

Release promotion (local, NOT via GitHub squash/merge UI which rewrites SHAs):
  git checkout main && git pull
  git merge --ff-only staging   # fails loudly if main is not an ancestor of staging
  git push origin main

Hotfix flow:
  git checkout -b fix/TICKET-desc main        # off main, NOT staging
  # fix, PR → main, merge
  git checkout staging && git merge main && git push origin staging   # back-merge same day
```

> If Q1 = merge-commit/squash: drop the "Core invariant" block, change the release line to `git checkout main && git merge --no-ff staging` (or `git merge --squash staging && git commit`), and remove the "ff-only" / ancestor wording from the merge-methods table.

### `gitflow` — render rule

`main` + `develop`; `release/*` cut off `develop`, merged to `main` AND back-merged to `develop`; `hotfix/*` off `main`. Renders all four blocks; the invariant is about `develop`/`main` divergence at releases.

- **(a) Markers**: `strategy:gitflow` + `integration-branch:develop` + decision markers (Q1 = `develop → main` promotion via `release/*`; Q3 hotfix off `main`).
- **(b) Invariant**: `develop` and `main` diverge between releases by design; at each release `main` is brought to the release point and `develop` is back-merged so it never falls behind `main`. (This is NOT the "production is ancestor of integration" invariant — gitflow's is the back-merge discipline.)
- **(c) Branch table**: `main`, `develop`, `feature/*` (off `develop`), `release/*` (off `develop` → `main`), `hotfix/*` (off `main`).
- **(d)**: feature → `develop` per Q2; release `release/*` → `main` + back-merge to `develop`; hotfix off `main` → `main` + back-merge to `develop`.

> Render note: gitflow's `promote-method` marker is `merge-commit` by nature — a `release/* → main` merge is inherently a merge commit, never a fast-forward. Do NOT normalize the example marker to the Q1 `ff-only` default; gitflow's discipline is the same-day back-merge to `develop`, not an ancestor invariant.

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:gitflow -->
<!-- git-flow-master:integration-branch:develop -->
<!-- git-flow-master:promote-method:merge-commit -->
<!-- git-flow-master:feature-merge:merge-commit -->
<!-- git-flow-master:hotfix-policy:branch-off-prod-backmerge -->

This project uses the `gitflow` flow. `develop` is integration; `main` holds releases only.

Invariant: `develop` and `main` diverge between releases by design. Every release (and every
hotfix) that lands on `main` MUST be back-merged into `develop` the same day, so `develop`
never falls behind `main`.

| Branch     | Role                                                        |
| ---------- | ----------------------------------------------------------- |
| main       | Releases only. Receives release/* and hotfix/* merges.      |
| develop    | Integration. Default base for feature work.                 |
| feature/*  | Branched off develop. PR → develop.                         |
| release/*  | Branched off develop. PR → main, then back-merge to develop.|
| hotfix/*   | Branched off main. PR → main, then back-merge to develop.   |

Merge methods (decided, do not improvise):
| Transition                  | Method                  |
| feature/* → develop         | Merge commit (--no-ff)  |
| release/* → main            | Merge commit (--no-ff)  |

Release flow:
  git checkout -b release/X.Y.Z develop     # cut release off develop
  # stabilise, then PR release/X.Y.Z → main, merge, tag
  git checkout develop && git merge main && git push origin develop   # back-merge to develop

Hotfix flow:
  git checkout -b hotfix/X.Y.Z main         # off main
  # fix, PR → main, merge, tag
  git checkout develop && git merge main && git push origin develop   # back-merge same day
```

### `gitlab-flow` — render rule

`main` + environment branches; code flows one direction `main → pre-production → production`. `production` is the production branch. Renders all four blocks.

- **(a) Markers**: `strategy:gitlab-flow` + `integration-branch:main` (feature base) + decision markers (Q1 promotion through env branches).
- **(b) Invariant**: ONLY when Q1 = `ff-only` — each downstream env branch is a pure ancestor of the one upstream (`production` is an ancestor of `pre-production` is an ancestor of `main`). OMIT for merge-commit/squash.
- **(c) Branch table**: `main` (work base + first env), `pre-production`, `production` (the production branch), `feature/*`/`fix/*` off `main`.
- **(d)**: feature → `main` per Q2; promotion `main → pre-production → production` per Q1; hotfix per Q3 (typically branch off `production` → back-promote / cherry-pick up the chain).

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:gitlab-flow -->
<!-- git-flow-master:integration-branch:main -->
<!-- git-flow-master:promote-method:ff-only -->
<!-- git-flow-master:feature-merge:merge-commit -->
<!-- git-flow-master:hotfix-policy:branch-off-prod-backmerge -->

This project uses the `gitlab-flow` flow. Work merges to `main`; code is promoted one
direction through environment branches: main → pre-production → production.
`production` is the production branch.

Invariant (ff-only promotion): each environment branch is a pure ancestor of the one
upstream — `production` is an ancestor of `pre-production`, which is an ancestor of `main`.
Promotion is a clean fast-forward in one direction; no back-merges.

| Branch          | Role                                                       |
| --------------- | ---------------------------------------------------------- |
| main            | Integration + first env. Default base for all work.        |
| pre-production  | Staging env. Receives fast-forward promotion from main.    |
| production      | Production env. Receives fast-forward promotion from pre-production. |
| feature/*       | Branched off main. PR → main.                              |
| fix/*           | Branched off main. PR → main.                              |

Merge methods (decided, do not improvise):
| Transition                       | Method                 |
| feature/fix → main               | Merge commit (--no-ff) |
| main → pre-production            | Fast-forward only      |
| pre-production → production      | Fast-forward only      |

Promotion flow (one direction, no back-merge):
  git checkout pre-production && git merge --ff-only main && git push origin pre-production
  git checkout production && git merge --ff-only pre-production && git push origin production

Hotfix flow:
  git checkout -b fix/TICKET-desc production    # off production
  # fix, PR → production, merge
  # cherry-pick / forward-port the fix up the chain to pre-production and main same day
```

### `enterprise` — render rule

`main` + integration + on-demand `feature/*`, `fix/*`, `release/*`, `hotfix/*`. Renders all four blocks; promotion is integration → `main` AND `release/*` → `main`.

- **(a) Markers**: `strategy:enterprise` + `integration-branch:NAME` + decision markers.
- **(b) Invariant**: ONLY when Q1 = `ff-only` — `main` is an ancestor of integration (same shape as main-integration). OMIT for merge-commit/squash.
- **(c) Branch table**: `main`, `<integration>`, `feature/*`/`fix/*` (off integration), `release/*` (off integration → `main`), `hotfix/*` (off `main`).
- **(d)**: feature → integration per Q2; promotion integration → `main` per Q1 AND `release/*` → `main` (back-merge to integration); hotfix off `main` per Q3.

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:enterprise -->
<!-- git-flow-master:integration-branch:staging -->
<!-- git-flow-master:promote-method:ff-only -->
<!-- git-flow-master:feature-merge:merge-commit -->
<!-- git-flow-master:hotfix-policy:branch-off-prod-backmerge -->

This project uses the `enterprise` flow. `main` (production) + integration, with on-demand
release/* stabilisation branches and hotfix/* off main.

Invariant (ff-only promotion): `main` is a pure ancestor of `staging`. Anything that lands on
`main` outside the integration path (a hotfix, a release merge) MUST be back-merged into
`staging` the same day to restore the invariant.

| Branch     | Role                                                          |
| ---------- | ------------------------------------------------------------- |
| main       | Production. Updated via ff release from staging or release/*. |
| staging    | Integration. Default base for feature/fix work.               |
| feature/*  | Branched off staging. PR → staging.                           |
| fix/*      | Branched off staging. PR → staging.                           |
| release/*  | Cut off staging on demand. PR → main, back-merge to staging.  |
| hotfix/*   | Branched off main. PR → main, back-merge to staging.          |

Merge methods (decided, do not improvise):
| Transition                  | Method                  |
| feature/fix → staging       | Merge commit (--no-ff)  |
| staging → main (release)    | Fast-forward only       |
| release/* → main            | Fast-forward only       |

Release flow:
  git checkout main && git pull
  git merge --ff-only staging          # or merge the release/* branch
  git push origin main
  git checkout staging && git merge main && git push origin staging   # back-merge

Hotfix flow:
  git checkout -b hotfix/X.Y.Z main    # off main
  # fix, PR → main, merge
  git checkout staging && git merge main && git push origin staging   # back-merge same day
```

### `sdet` — render rule

`main` (permanent) + an ephemeral per-suite integration trunk. No production invariant (no deploy), no hotfix block. The trunk is NOT a persisted long-lived branch — it is named per suite and deleted after the final PR — so the branch table documents the *pattern*, not a fixed branch name.

- **(a) Markers**: `strategy:sdet` + `feature-merge:merge-commit` (fixed). NO `integration-branch` marker (trunk is ephemeral per-suite). NO `promote-method` / `hotfix-policy` (no production deploy).
- **(b) Invariant**: none. `main` holds confirmed tests, not a deployed app; there is no ancestor invariant.
- **(c) Branch table**: `main` + the trunk pattern `test/<module>-suite` + `test/{KEY}-*` ticket branches + Plus Branches (`docs/*`/`chore/*`/`fix/*`).
- **(d)**: ticket/Plus → trunk is `--no-ff` (fixed); the sync gate + single final `trunk → main` PR replace any promotion/hotfix block. Point to `references/sdet-integration-trunk.md` for the per-ticket loop, CI-fallback clause, and sync gate.

Example shape:

```markdown
### Git Strategy

<!-- git-flow-master:strategy:sdet -->
<!-- git-flow-master:feature-merge:merge-commit -->

This project uses the `sdet` (SDET Gitflow) flow. `main` holds confirmed, regression-ready
tests. Each test suite runs on an ephemeral integration trunk `test/<module>-suite` (created
off `main`, deleted after the suite merges). Tickets chain through the trunk; one final
reviewed PR promotes the suite to `main`. Full runbook: `.claude/skills/git-flow-master/references/sdet-integration-trunk.md`.

| Branch              | Role                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| main                | Confirmed tests. Only the final suite PR (reviewed, green CI) lands.   |
| test/<module>-suite   | Ephemeral per-suite integration trunk. Surrogate-main for the suite.  |
| test/{KEY}-{slug}   | Ticket branch. Cut from the trunk; PR → trunk; merged --no-ff.        |
| docs/* chore/* fix/*| Plus Branches. Adjacent non-test work; PR → trunk like tickets.       |

Merge methods (decided, do not improvise):
| Transition                  | Method                                          |
| ticket/Plus → trunk         | Merge commit (--no-ff) — never squash           |
| trunk → main (final PR)     | Repo merge setting (prefer merge-commit)        |

Per-suite flow:
  git checkout -b test/<module>-suite main && git push -u origin test/<module>-suite   # start suite
  # per ticket: cut from trunk → local PASS on local AND staging → push → Sanity CI
  #             → PR into trunk → review → merge --no-ff → next ticket from updated trunk
  git checkout test/<module>-suite && git merge origin/main          # sync gate before final PR
  # final PR trunk → main (only PR facing rulesets; genuinely green, no CI-fallback)
  git push origin --delete test/<module>-suite                       # after merge

CI-fallback clause (trunk merges only, never the final PR): a Sanity-CI red that is purely
infra/known-flake — proven by a local pass on BOTH local and staging AND the red existing
independent of the change — lets the local double-pass authorize a trunk-internal merge.
This is not a skip of tests→types→lint (the local gate fully passes). ENVIRONMENT-class
classification is owned by /regression-testing.
```
