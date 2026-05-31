# Strategy Setup — Mechanics (questionnaire, materialization, sync, persist, report)

This file is the heavy reference behind operation **3.6 Strategy Setup** in `SKILL.md`. The SKILL.md section holds WHEN and the six-step flow; this file holds HOW. Per-strategy runbook RENDER rules live in `references/branching-strategies.md` → "Runbook render rules" — this file does not duplicate them.

Strategy Setup is **detection + questionnaire → conditional materialization → render**. Nothing is baked in. A single-branch strategy creates no branches and writes a minimal runbook; a strategy with an integration branch creates/syncs exactly the branches its row in the materialization table requires.

---

## 1. Decision questionnaire — full detail

Run after the strategy slug is resolved (Step 2). Ask the questions in order. For each question: if its decision marker already exists in `CLAUDE.md`, SKIP it (idempotent). If the question does not apply to the resolved strategy (gating column below), SKIP it. Present the default first and let the user override.

### Q1 — Promotion method, integration → production

- **Applies to**: strategies that have an integration branch separate from production — `main-integration`, `gitlab-flow`, `enterprise`, and `gitflow` (where the `develop → main` release is the promotion).
- **Skipped for**: `solo-main`, `github-flow`, `trunk-based` (no integration branch).
- **Options (default first)**:
  1. **Fast-forward only** — production is always a pure ancestor of integration; promotion is `git merge --ff-only`. Keeps the two branches byte-identical at release. This is the default.
  2. **Merge commit (`--no-ff`)** — promotion creates a merge commit on production. Branches are NOT byte-identical; the ancestor invariant does not hold.
  3. **Squash** — promotion squashes integration into one commit on production. Rewrites SHAs; invariant does not hold.
- **Marker**: `<!-- git-flow-master:promote-method:ff-only|merge-commit|squash -->`
- **Drives**: the release runbook block, and whether the "production is an ancestor of integration" invariant is rendered (only for `ff-only`).

### Q2 — Merge method, work-branch → integration (or → trunk)

- **Applies to**: all multi-branch strategies (any strategy where work branches off something and merges back). For `trunk-based` this is work-branch → trunk.
- **Skipped for**: `solo-main` (work lands directly; PRs optional).
- **Options (default first)**:
  1. **Merge commit (`--no-ff`)** — preserves the branch topology in history. Default.
  2. **Squash** — one commit per work-branch on integration; linear history, loses intermediate commits.
  3. **Rebase + merge** — replays work-branch commits onto integration; linear history, preserves individual commits.
- **Marker**: `<!-- git-flow-master:feature-merge:merge-commit|squash|rebase-merge -->`
- **Drives**: how integration history accrues; referenced by the merge-methods table in the runbook.

### Q3 — Hotfix policy

- **Applies to**: strategies with a production branch distinct from where day-to-day work lands — `main-integration`, `gitlab-flow`, `enterprise`, `gitflow`.
- **Skipped for**: `solo-main`, `github-flow`, `trunk-based` (production IS where work lands; a hotfix is just another change).
- **Options (default first)**:
  1. **Branch off production → PR to production → back-merge to integration same day** — keeps the ff-only invariant intact. Default.
  2. **Always via integration** — hotfix flows through integration like any change; slower but no back-merge to forget.
  3. **No policy** — decide per incident (records intent to NOT standardize).
- **Marker**: `<!-- git-flow-master:hotfix-policy:branch-off-prod-backmerge|via-integration|none -->`
- **Drives**: the hotfix runbook block + the invariant-maintenance note.
- **Note (one-direction flows)**: for `gitlab-flow` the "back-merge to integration" is realized as a forward-port / cherry-pick up the environment chain (`production` → `pre-production` → `main`), not a literal merge back — gitlab-flow has no back-merges.

> The defaults (ff-only / merge-commit / branch-off-prod-backmerge) are the `main-integration` worked-example choices. They are DEFAULTS. Always present them as overridable, never auto-select without showing the alternatives.

### `sdet` — questionnaire is mostly pre-answered

`sdet` does not run the open questionnaire. Its answers are fixed by the strategy's definition:

- **Q1 (promotion)** — n/a. There is no production deploy; `main` holds confirmed tests. The final `trunk → main` PR follows the **repo's allowed merge method** (prefer merge-commit to preserve the multi-branch look; squash collapses the suite). Do NOT write a `promote-method` marker.
- **Q2 (work-branch merge)** — **fixed at `merge-commit` (`--no-ff`)**, write `feature-merge:merge-commit`. Never offer squash/rebase: preserving per-ticket history is a defining property of `sdet`.
- **Q3 (hotfix)** — n/a. Write no `hotfix-policy` marker.

So Strategy Setup for `sdet` writes exactly two markers (`strategy:sdet` + `feature-merge:merge-commit`), materializes nothing extra at setup (the trunk is per-suite, created on demand by the Branch operation), and renders the `sdet` runbook block. The full per-suite operational detail lives in `references/sdet-integration-trunk.md`, not in the rendered `CLAUDE.md` block.

---

## 2. Materialization table — what to ensure per strategy

For the resolved strategy, ensure the long-lived branches in this table exist. **If a branch already exists, never recreate it — only ff-sync it if it is behind its pair (Section 3).** Work-branch and on-demand branches (`feature/*`, `release/*`, `hotfix/*`) are NOT created at setup; they are created later by the Branch operation when work starts.

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

- Single-branch strategies (`solo-main`, `github-flow`, `trunk-based`) ensure `main` only — there is nothing to create on a normal repo. No integration branch, ever.
- `main-integration`: if the integration branch is missing, ASK its name (default `staging`), then propose creating it off `main` and ff-syncing (Section 3).
- `gitflow`: ensure `develop` (create off `main` if missing); do not create `release/*` / `hotfix/*` at setup.
- `gitlab-flow`: ensure `pre-production` and `production` (create off `main` in pipeline order if missing).
- `enterprise`: ensure integration off `main`; `release/*` / `feature/*` are on-demand only.
- `sdet`: ensure `main` only at setup — create NO integration branch. The per-suite trunk `test/<module>-suite` is created off `main` by the Branch operation when a suite starts and deleted after the final PR; it is never materialized at Strategy Setup time and is never ff-synced (it carries `--no-ff` merge commits by design).

Always **propose** each branch creation (which branch, off what, why) and wait for OK. Never `git checkout -b` / `git branch` silently.

---

## 3. Sync mechanics — fast-forward ONLY, never `--force`

A sync runs only when a long-lived pair exists (integration + production, or two env branches) and one is behind the other as a **pure ancestor**. The goal is to bring the behind branch up to the ahead branch without rewriting history.

### 3.1 Ancestry check (decide direction)

```bash
git fetch origin
git log --oneline <base>..<ahead>     # commits in <ahead> not in <base>; must be EMPTY for a ff in this direction
```

- `git log <production>..<integration>` empty → `integration` has nothing `production` lacks; `integration` is a pure ancestor of `production` and is behind, while `production` is ahead (the common `main-integration` case where integration is behind a freshly-promoted `main` — e.g. `git log main..staging` empty when `staging` is behind `main`). The behind branch (`integration`) gets fast-forwarded up to `production`.
- `git log <integration>..<production>` empty → production is a pure ancestor of integration; integration is ahead (integration has accumulated unreleased work ahead of production). The behind branch (`production`) gets fast-forwarded up to `integration`.
- **Both non-empty** → the branches have **diverged both ways** → STOP. Do NOT sync. Hand to conflict resolution (SKILL.md 3.5). Never force.

### 3.2 Fast-forward push (the only sync we perform)

When exactly one direction is empty, the behind branch can be fast-forwarded to the ahead ref:

```bash
# bring <behind-branch> up to <ahead-ref> by a fast-forward push — NO --force
git push origin <ahead-ref>:refs/heads/<behind-branch>
```

(For the local checkout of the behind branch, `git merge --ff-only <ahead-ref>` is equivalent and fails loudly if it is not a true fast-forward — use it rather than a plain `git merge` so a non-ff is rejected instead of silently creating a merge commit.)

### 3.3 Hard rules

- **NEVER `--force`, never `--force-with-lease`** in a setup sync. A sync is a fast-forward or it is not a sync.
- A push to a protected branch (integration or production) requires explicit confirmation first — a setup ff-sync push is still a push.
- Diverged-both-ways → STOP → conflict resolution. Setup does not resolve conflicts itself.

---

## 4. Persist sequence

Once branches are materialized and decisions captured, persist in this order:

1. **Locate or create the `## Git Strategy` section** in `CLAUDE.md`. If a neutral placeholder section exists (shipped by the boilerplate), replace its body. If the section is absent, append it near the existing `## Git Workflow` section.
2. **Write the markers** that apply to the resolved strategy (strategy + integration-branch if any + the applicable decision markers). Omit markers that do not apply.
3. **Render the full runbook body** below the markers, following the per-strategy render rule in `references/branching-strategies.md` → "Runbook render rules". Single-branch strategies render the minimal section (marker + branch table + "work lands on main via PR" + commit rules) — no invariant, no promotion, no hotfix blocks.
4. **Set up local tracking** for any newly-ensured branch (`git branch --set-upstream-to=origin/<branch> <branch>` or `git checkout -b <branch> origin/<branch>`), so later operations don't re-detect.

The markers are the source of truth; the prose is for humans. A later Strategy Setup re-run re-reads the markers and only fills gaps.

---

## 5. Report format

Close Strategy Setup with a compact report:

```
Strategy Setup complete — <strategy-slug>

Branches:
  - <branch>: created off <base> | already existed | ff-synced to <ahead-ref> (no force) | skipped (n/a for this strategy)

Decisions captured:
  - promote-method: <value | n/a>
  - feature-merge:  <value | n/a>
  - hotfix-policy:  <value | n/a>

Runbook: CLAUDE.md → ## Git Strategy (<N> markers, <render-shape> render)

Next: branch off <work-branch-base> to start work; the Branch operation will use this strategy automatically.
```

If a diverged pair stopped the sync, the report instead states the divergence and points to conflict resolution (3.5) — it does NOT claim a successful sync.
