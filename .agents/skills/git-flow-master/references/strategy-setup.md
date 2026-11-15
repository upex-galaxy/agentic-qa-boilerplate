# Strategy Setup: mechanics (questionnaire, materialization, sync, persist, report)

This file is the how behind operation **3.6 Strategy Setup** in `SKILL.md`, which holds the when and the six-step flow. Per-strategy `git_strategy` field values live in `references/branching-strategies.md`, under "git_strategy field rules (per strategy)"; they are not repeated here.

Strategy Setup detects the strategy, asks the decision questionnaire, creates only the branches the strategy needs, and writes the `git_strategy:` block in `.agents/project.yaml`, in place, keeping the rest of the file (never a separate file). Nothing is baked in. A single-branch strategy creates no branches and writes a minimal block (integration null, all decisions `n/a`). A strategy with an integration branch creates or syncs exactly the branches its row in the materialization table requires and records them in the block.

---

## 1. Decision questionnaire, full detail

Run it after the strategy slug is resolved (Step 2), in order. Skip a question when its `git_strategy.decisions.*` field (for Q4, its `git_strategy.policy.*` field) in `.agents/project.yaml` is already set, meaning not `n/a`, empty or null-by-default; that keeps a re-run idempotent. Skip it too when the resolved strategy does not need it (the "Applies to" line). Show the default first and let the user override it. Q1 to Q3 depend on the strategy; **Q4 applies to every strategy**.

### Q1: promotion method, integration to production

- **Applies to**: strategies with an integration branch separate from production: `main-integration`, `gitlab-flow`, `enterprise`, and `gitflow` (where the `develop` to `main` release is the promotion).
- **Skipped for**: `solo-main`, `github-flow`, `trunk-based`, which have no integration branch.
- **Options (default first)**:
  1. **Fast-forward only.** Production is always a pure ancestor of integration, and promotion is `git merge --ff-only`. The two branches stay byte-identical at release. This is the default.
  2. **Merge commit (`--no-ff`).** Promotion creates a merge commit on production. The branches are not byte-identical, so the ancestor invariant no longer holds.
  3. **Squash.** Promotion squashes integration into one commit on production. SHAs are rewritten and the invariant no longer holds.
- **Persisted as**: `git_strategy.decisions.promote_method: ff-only|merge-commit|squash`
- **Drives**: the promotion command shape in `references/branching-strategies.md`, and whether "production is an ancestor of integration" holds (only for `ff-only`).

### Q2: merge method, work-branch to integration (or to trunk)

- **Applies to**: every multi-branch strategy, meaning any strategy where work branches off something and merges back. For `trunk-based` this is work-branch to trunk.
- **Skipped for**: `solo-main`, where work lands directly and PRs are optional.
- **Options (default first)**:
  1. **Merge commit (`--no-ff`).** Keeps the branch topology in history. Default.
  2. **Squash.** One commit per work-branch on integration: linear history, intermediate commits lost.
  3. **Rebase + merge.** Replays the work-branch commits onto integration: linear history, individual commits kept.
- **Persisted as**: `git_strategy.decisions.feature_merge: merge-commit|squash|rebase-merge`
- **Drives**: how integration history accrues. The merge command shape lives in `references/branching-strategies.md`.

### Q3: hotfix policy

- **Applies to**: strategies whose production branch differs from where daily work lands: `main-integration`, `gitlab-flow`, `enterprise`, `gitflow`.
- **Skipped for**: `solo-main`, `github-flow`, `trunk-based`, where production is where work lands and a hotfix is just another change.
- **Options (default first)**:
  1. **Branch off production, PR to production, back-merge to integration the same day.** Keeps the ff-only invariant intact. Default.
  2. **Always via integration.** The hotfix flows through integration like any change. Slower, but there is no back-merge to forget.
  3. **No policy.** Decide per incident, which records the intent not to standardize.
- **Persisted as**: `git_strategy.decisions.hotfix_policy: branch-off-prod-backmerge|via-integration|none`
- **Drives**: the hotfix command shape in `references/branching-strategies.md` and the invariant-maintenance note.
- **One-direction flows**: in `gitlab-flow` the "back-merge to integration" is a forward-port or cherry-pick up the environment chain (`production`, `pre-production`, `main`), because that flow has no back-merges.

The defaults (ff-only, merge-commit, branch-off-prod-backmerge) are the `main-integration` worked-example choices. Present them as overridable and show the alternatives before selecting any.

### Q4: protected-branch bypass policy

- **Applies to**: all strategies. A solo `main` is still a protected branch, so Q4 is never skipped for strategy reasons.
- **Drives**: the Push operation (SKILL.md 3.3), meaning how strictly a direct push to a protected branch is guarded and whether an admin bypass may be offered at all.
- **Sub-questions** (defaults are per strategy, see "git_strategy field rules (per strategy)" in `references/branching-strategies.md`):
  1. **`direct_push_to_protected`**: `forbidden` | `confirm` | `allowed`. `allowed` is standing authorization, so the recorded value is the authorization and no per-push confirm happens. `confirm` always asks. `forbidden` refuses the direct push and redirects to the PR flow. Default per strategy: `solo-main` is `allowed`; the multi-branch strategies (`main-integration` / `enterprise` / `gitflow` / `github-flow` / `trunk-based` / `gitlab-flow`) are `forbidden`; `sdet` is `confirm` (trunk self-merge).
  2. **`admin_bypass`**: `true` | `false`, default `false`. May a repo admin bypass PR protection for an urgent change? This records team policy, not an enforcement check; the real capability depends on the GitHub user's role. With `true`, the Push op may offer a bypass but re-confirms at runtime that the operator actually holds admin rights (ask, because the skill cannot know the role) and that the action is irreversible. With `false`, no bypass is offered whatever the role.
  3. **`require_pr_reviews`**: `null` | `0` | `N`, the minimum approvals before merge to a protected branch. It records the team's intent; Section 4.5 can materialize it onto the host in the same run, and `bun run git:policy verify` confirms the host enforces it. Default `null` for solo-main (`0`), and a strategy-appropriate value otherwise (typically `1` for multi-branch flows; `0` on the sdet trunk and `1` on the final sdet PR).
- **Persisted as**: `git_strategy.policy.direct_push_to_protected`, `git_strategy.policy.admin_bypass` and `git_strategy.policy.require_pr_reviews`.

Q4 has no single global default. Each sub-field's default comes from the resolved strategy, so show each one first and let the user override.

### `sdet`: the questionnaire is mostly pre-answered

`sdet` skips the open Q1 to Q3 questions because the strategy's definition fixes the answers. Q4 still runs.

- **Q1 (promotion)** does not apply. There is no production deploy, and `main` holds confirmed tests. The final `trunk` to `main` PR follows the repo's allowed merge method (prefer merge-commit to keep the multi-branch look; squash collapses the suite). Leave `git_strategy.decisions.promote_method: n/a`.
- **Q2 (work-branch merge)** is fixed at `merge-commit` (`--no-ff`): set `git_strategy.decisions.feature_merge: merge-commit`. Do not offer squash or rebase, because keeping per-ticket history is what defines `sdet`.
- **Q3 (hotfix)** does not apply. Leave `git_strategy.decisions.hotfix_policy: n/a`.
- **Q4 (protection policy)** is asked as for every strategy. The `sdet` defaults are `git_strategy.policy.direct_push_to_protected: confirm` (the maintainer self-merges the trunk), `git_strategy.policy.admin_bypass: false`, and `git_strategy.policy.require_pr_reviews: 0` on the trunk and `1` on the final `trunk` to `main` PR.

So Strategy Setup for `sdet` sets `git_strategy.strategy: sdet`, `git_strategy.decisions.feature_merge: merge-commit` and the `sdet` Q4 `policy` defaults. The other `decisions.*` stay `n/a`, `branches.integration` stays null, and `branches.ephemeral_pattern` is `"test/<module>-suite"`. Setup materializes nothing else, because the trunk is per suite and the Branch operation creates it on demand. The per-suite detail is in `references/sdet-integration-trunk.md`.

---

## 2. Materialization table: what to ensure per strategy

For the resolved strategy, make sure the long-lived branches in this table exist. A branch that already exists is not recreated; it is only ff-synced when it is behind its pair (Section 3). Work-branches and on-demand branches (`feature/*`, `release/*`, `hotfix/*`) are not created at setup. The Branch operation creates them when work starts.

| Strategy           | Long-lived branches to ensure                                                   | Work-branch base                              | Promotion path                                  | Production branch |
| ------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- | ----------------- |
| `solo-main`        | `main` only                                                                     | `main`                                        | n/a (direct)                                    | `main`            |
| `main-integration` | `main` + integration (`staging` / `dev` / `develop` — ask name, default `staging`) | integration                                   | integration → `main`                            | `main`            |
| `enterprise`       | `main` + integration (`feature/*`, `release/*` created on demand, NOT at setup) | integration (hotfix off `main`)               | integration → `main`; `release/*` → `main`      | `main`            |
| `trunk-based`      | `main` (trunk) only                                                             | `main` (short-lived)                          | n/a (fast merge to trunk)                       | `main`            |
| `gitflow`          | `main` + `develop`                                                              | `develop` (hotfix off `main`, release off `develop`) | `release/*` → `main` (+ back-merge to `develop`) | `main`            |
| `github-flow`      | `main` only                                                                     | `main`                                        | n/a (PR → `main`)                               | `main`            |
| `gitlab-flow`      | `main` + env branches (`pre-production`, `production`)                           | `main`                                        | `main` → `pre-production` → `production`        | `production`      |
| `sdet`             | `main` only (the integration trunk `test/<module>-suite` is ephemeral per-suite — created on demand by the Branch operation, NOT at setup) | integration trunk (per suite)                 | trunk → `main` (single final PR, per suite)     | `main`            |

**Branch-creation rules**:

- `solo-main`, `github-flow` and `trunk-based` ensure `main` only. On a normal repo there is nothing to create, and they never get an integration branch.
- `main-integration`: if the integration branch is missing, ask its name (default `staging`), then propose creating it off `main` and ff-syncing it (Section 3).
- `gitflow`: ensure `develop`, created off `main` if missing. `release/*` and `hotfix/*` wait for the Branch operation.
- `gitlab-flow`: ensure `pre-production` and `production`, created off `main` in pipeline order if missing.
- `enterprise`: ensure integration off `main`. `release/*` and `feature/*` are on demand only.
- `sdet`: ensure `main` only and create no integration branch. The per-suite trunk `test/<module>-suite` is created off `main` by the Branch operation when a suite starts and deleted after the final PR. It is never ff-synced, because it carries `--no-ff` merge commits by design.

Propose each branch creation (which branch, off what, why) and wait for the OK. A silent `git checkout -b` or `git branch` takes a decision that belongs to the operator.

---

## 3. Sync mechanics: fast-forward only, no `--force`

A sync runs only when a long-lived pair exists (integration and production, or two env branches) and one is a pure ancestor of the other. The goal is to bring the behind branch up to the ahead branch without rewriting history.

### 3.1 Ancestry check (decide direction)

```bash
git fetch origin
git log --oneline <base>..<ahead>     # commits in <ahead> not in <base>; must be EMPTY for a ff in this direction
```

- `git log <production>..<integration>` empty: `integration` has nothing `production` lacks, so it is a pure ancestor of `production` and is the behind branch (the common `main-integration` case where integration trails a freshly promoted `main`, for example `git log main..staging` empty when `staging` is behind `main`). Fast-forward `integration` up to `production`.
- `git log <integration>..<production>` empty: production is a pure ancestor of integration, and integration is ahead with unreleased work. Fast-forward `production` up to `integration`.
- Both non-empty: the branches have diverged both ways. Stop, sync nothing, and hand over to conflict resolution (SKILL.md 3.5). Forcing would drop commits.

### 3.2 Fast-forward push (the only sync performed)

When exactly one direction is empty, fast-forward the behind branch to the ahead ref:

```bash
# bring <behind-branch> up to <ahead-ref> by a fast-forward push — NO --force
git push origin <ahead-ref>:refs/heads/<behind-branch>
```

For the local checkout of the behind branch, `git merge --ff-only <ahead-ref>` is equivalent, and it fails loudly when the move is not a true fast-forward. Prefer it to a plain `git merge`, which would silently create a merge commit.

### 3.3 Hard rules

- No `--force` and no `--force-with-lease` in a setup sync. A sync is a fast-forward or it is not a sync.
- A push to a protected branch (integration or production) needs explicit confirmation first, and a setup ff-sync push is still a push.
- A pair diverged both ways goes to conflict resolution. Setup does not resolve conflicts itself.

---

## 4. Persist sequence

Once branches are materialized and decisions captured, persist in this order:

1. **Write the `git_strategy:` block in `.agents/project.yaml`.** Create the block if absent, overwrite the relevant fields if it exists, and keep the rest of the file, which holds project identity and environment config. Write values only, no comments: the file is loaded into every session and `.agents/project.schema.yaml` documents each key (ADR-0025). Fill the fields that apply to the resolved strategy, all nested under `git_strategy`:
   - `strategy`: the resolved slug.
   - `branches`: `production` (release/default branch), `integration` (long-lived integration branch name or `null`), `ephemeral_pattern` (strategy-specific on-demand trunk pattern or `null`).
   - `protected`: branches whose direct pushes are gated by `policy.direct_push_to_protected` (not always a confirm, since `allowed` is standing authorization).
   - `decisions`: `promote_method` / `feature_merge` / `hotfix_policy`, each captured from Q1 to Q3 or left `n/a` when the question does not apply.
   - `policy`: `direct_push_to_protected` / `admin_bypass` / `require_pr_reviews`, captured from Q4 (every strategy, per-strategy defaults).
   - `branch_prefixes`: `precedence` plus naming patterns, with the defaults unless the user overrides.
   - `description`: the one-paragraph human summary of the flow for this repo.
   - `meta.created`: the date of the run. Bump `meta.setup_version` on a re-run that changes the schema. Leave `meta.policy_verified: null` and `meta.policy_source: declared`; only a clean `bun run git:policy verify --stamp` changes them (Section 4.5).
   - `meta.strategy_source: chosen`: stamp it whenever the questionnaire actually ran. It ships as `inherited`, and it is the only field that separates "this project picked `solo-main`" from "this project never chose and kept the default", because `strategy` itself is never null. Without the stamp, the bootstrap offer keeps proposing a setup the user already completed.

   Per-strategy field values: `references/branching-strategies.md`, "git_strategy field rules (per strategy)".
2. **Set up local tracking** for every newly ensured branch (`git branch --set-upstream-to=origin/<branch> <branch>` or `git checkout -b <branch> origin/<branch>`), so later operations do not re-detect.

The `## Git Strategy` section of `.agents/instructions/agent-git.md` is a shipped pointer to the `git_strategy:` block in `.agents/project.yaml`, so strategy policy is never written there. The block is the source of truth and its `git_strategy.description` field is the human summary. A later Strategy Setup re-run re-reads the block and fills only the `git_strategy.decisions.*` and `git_strategy.policy.*` fields still unset.

---

## 4.5 Materialize the policy onto the host (offer, never automatic)

The questionnaire has just captured the branch policy, and the same answers describe a GitHub ruleset. Setup can close the gap between intent and enforcement in the same run, so a `declared` block does not drift until the first refused merge.

Start read-only, because an existing repo usually already has protection:

```bash
bun run git:policy verify   # what the host enforces today vs what was just captured
```

- No drift, or only divergences already listed in `git_strategy.policy.accepted_divergences`: say so, run `bun run git:policy verify --stamp`, and stop. Nothing to write.
- Drift: show it, then offer the write. A ruleset governs who can merge, so the operator chooses; the skill does not apply it unasked.

```bash
bun run git:policy apply         # dry run: prints the exact payload
bun run git:policy apply --yes   # writes it
```

Three rules for this step:

1. Show the dry run before proposing the write. The payload is the proposal, and a described change is not a reviewed one.
2. A refusal to loosen is a result. `apply` blocks any change that removes a guard, lowers the approval bar, turns off code-owner review, or widens the allowed merge methods. If `--allow-loosening` is needed, name exactly which guard is being given up and get an explicit yes for that specific thing.
3. Drift has three resolutions, and the host is only one of them. The yaml may be the wrong side, so the fix is to edit the answer just captured. Or the divergence is intended, and then it is recorded as an entry in `git_strategy.policy.accepted_divergences` (the `field` exactly as `verify` printed it, plus `enforced`, `accepted` and `reason`), not as prose. `verify` then reports it as ACCEPTED, and `apply` carries the host's side of that field forward instead of deriving it away.

The mapping table, the derived fields, accepted divergences and what the tool deliberately leaves unmanaged (`bypass_actors`, `CODEOWNERS`, org-level rulesets) are in `references/ruleset-parity.md`.

---

## 5. Report format

Close Strategy Setup with a compact report:

```
Strategy Setup complete — <strategy-slug>

Branches:
  - <branch>: created off <base> | already existed | ff-synced to <ahead-ref> (no force) | skipped (n/a for this strategy)

Decisions captured:
  - promote_method: <value | n/a>
  - feature_merge:  <value | n/a>
  - hotfix_policy:  <value | n/a>

Policy captured (Q4, intent until verified against the host):
  - direct_push_to_protected: <forbidden | confirm | allowed>
  - admin_bypass:             <true | false>
  - require_pr_reviews:       <null | 0 | N>

Host ruleset (Section 4.5):
  - verify: <in parity | in parity modulo N accepted divergence(s) | N drift(s) reported> | not run
  - apply:  <written (ruleset <name>) | dry run shown, not written | declined | n/a>
  - policy_source: <verified | accepted | declared>

Definition: .agents/project.yaml (git_strategy block, <N> fields populated, strategy_source: chosen)

Next: branch off <work-branch-base> to start work; the Branch operation will use this strategy automatically.
```

If a diverged pair stopped the sync, the report states the divergence and points to conflict resolution (3.5) instead, and it does not claim a successful sync.

---

## With nobody at the keyboard

This flow asks a person for the questionnaire answers, each branch-creation OK, each push confirmation and the ruleset write. The decision protocol (`agentic-qa-core/references/decision-protocol.md`) decides which of those reach a person.

| Who runs it | The gate |
| --- | --- |
| A person is present | Ask as written above. |
| A supervised worker | The conductor or launcher answers the questions and gives the OK; the worker reports what it needs and waits. |
| A routine with nobody | The delegating brief is the approval source when it names the strategy and answers. Without one, write nothing: the questionnaire defaults, the branch proposals and the `verify` drift are reported, and no branch is created, nothing is pushed and `apply --yes` is not run. |
