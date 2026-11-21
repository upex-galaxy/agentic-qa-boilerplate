---
name: git-flow-master
description: "Git operator that adapts to the repo's branching strategy. Use when creating a branch, committing, pushing, opening a pull request, fixing a merge conflict or rejected push, splitting a large change into stacked PRs, isolating work in a worktree, or choosing or setting up the git strategy."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
phase: implementation
complementary_categories: []
metadata:
  kind: workflow
---

# Git Flow Master: Branches, Commits, Pushes, PRs and Conflicts

This skill is the single entry point for everything on the version-control layer: creating branches, writing commits, pushing safely, opening pull requests, resolving conflicts, and planning chained or stacked PRs when a change outgrows the review budget.

It does not assume one branching model. The project may run on `main` only, on `main + staging`, on a multi-branch enterprise layout, or on a well-known flow (trunk-based, GitFlow, GitHub Flow, GitLab Flow). The skill detects which one is active and adapts every command to it. Detection is sticky: once resolved, the strategy is recorded in the `git_strategy:` block of `.agents/project.yaml`, so later invocations skip the question.

---

## Compact Rules

- Read the repo state (status, branches, diff, log, fetch, upstream, remotes) at the start of every invocation and report it before acting. A wrong guess about state is the most common git mistake.
- Resolve the branching strategy from the `git_strategy:` block in `.agents/project.yaml` first, then layout heuristics, then by asking; never pick one silently. Persist the resolution back into that block, not into a separate file and not as policy prose in `AGENTS.md`. The yaml snippets in `references/` (per-strategy field rules, policy examples) are illustrations: a claim about THIS repo's strategy, branches or policy cites `.agents/project.yaml` (or `git:policy verify` output) read in the same turn.
- When `git_strategy.meta.strategy_source` is `chosen`, the strategy is confirmed, whatever `project.project_name` holds, and there is no offer. Otherwise, when `git_strategy.strategy` is set but `project.project_name` is null, or `meta.strategy_source` is `inherited` (or absent) on a named project, the strategy came from the template and nobody chose it. Treat it as unconfirmed and offer Strategy Setup once per session. Never auto-run it, and on a "no" proceed under the inherited strategy.
- Consult `git_strategy.policy.direct_push_to_protected` before any direct push to a protected branch. `allowed` is standing authorization (asking anyway collapses it into `confirm`), `confirm` asks every time, `forbidden` refuses and routes through a PR. A missing or null block behaves as `confirm`.
- Never amend, rebase or otherwise rewrite a pushed commit (Critical Rule #6, an invariant: no authorization relaxes it). Fix forward with a new commit.
- Never force-push, `--force-with-lease` or `--no-verify` unless the user explicitly authorizes it AND the branch is unshared.
- Never run a repo-wide discard (`git restore .`, `git checkout -- .`, `git reset --hard`, untargeted `git stash`, `git clean -f`): concurrent sessions may share this working tree. Discard only explicit paths this session modified, and when ownership is unclear, stop and ask.
- Never `git add -A` or `git add .`. List explicit paths, so a secret or another session's work cannot ride along.
- One commit has one responsibility, in conventional format (`{type}({ISSUE-KEY}): {description}`). Commit messages, branch names and PR bodies are English and carry no AI attribution.
- Close every commit message, in every strategy, with the two forensic trailers `Worktree: <name|primary>` then `Session: <label>`, copied from the `AGENT IDENTITY:` line in session context (`unknown` when a value cannot be resolved). They record which tree and session produced the commit; they are forensics, not attribution, and a harness-branded trailer (`Claude-Session:`, an AI `Co-Authored-By:`) stays forbidden.
- When the pre-push or CI documentation-contract gate names a region (ADR-0016), update every page it lists in the same push. Add `Docs-Checked: <label> <reason>` above the forensic trailers only if those pages still hold, and always with the reason.
- When a pre-commit hook rejects a commit, stop, fix the underlying issue, and create a NEW commit. `--amend` would rewrite the previous, unrelated commit.
- Propose every branch name, commit set and PR body, and wait for an explicit OK before executing.
- Stop at PR creation: merging is the user's next step, not an automatic one. If the `gh` transport is missing or unauthenticated, surface the blocker instead of implying a PR was opened.
- To reconcile declared policy against the host, run the policy-verify tool once at the first push / PR / merge intent and never hand-query protection endpoints. A `404` on the classic protection endpoint does not mean unprotected, and a push that succeeded may have been a documented bypass, not permission. Report drift; never auto-correct it.
- When a planned change exceeds ~400 changed lines, run the chained-PR decision (single-pr / stacked-to-main / feature-branch-chain / size-exception) before coding, and re-run it if the real diff outgrows the estimate rather than silently up-budgeting. Return it with its trace, not a bare label: `Chain strategy: <leaf>`, each tree question answered with the reason drawn from THIS change (`Q1=No (…) · Q2=… · Q3=…`, `n/a` past the leaf), `Decided by: /git-flow-master`. Answers that do not lead to the stated leaf, or a trace that only restates the conclusion, count as no decision; a re-run replaces the trace.
- When a promotion PR into the production branch merges, hand off the post-promotion `merged` pass as `/test-documentation post-promotion` ("Promotion landed on `<production>`: run `/test-documentation post-promotion`"). When the project ships a `sanity.yml` workflow, also suggest dispatching it for the newly merged spec (`gh workflow run sanity.yml --ref <production> -f environment=staging -f test_type=e2e -f test_file=<spec path>`) so that pass's CI check does not wait on the next scheduled run; it is an option, never a step this skill runs. The TMS is not touched from this skill. Canon: `agentic-qa-core/references/discovery-driven-doctrine.md` §6.
- When a conflict fires, diagnose and classify it first, present options ranked by safety, and prefer a safe abort over a guess. A destructive option is never picked silently.

**Read full SKILL.md when**: running Strategy Setup, resolving a specific conflict type, picking a base branch or branch prefix for an unfamiliar strategy, or setting up an isolated worktree.

---

## When to use

Any git-shaped request, with or without the literal skill name:

- "start work on UPEX-123": branch creation
- "commit and push", "push to main": commit and push flow
- "open a PR against staging": PR creation
- "I have conflicts on pull", "the push was rejected": conflict diagnosis and recovery
- "this PR is going to be huge": chained-PR planning
- "which git strategy do we use here": strategy detection and persistence

Testing a ticket, authoring test cases, writing automated tests or running regression suites belong to `/sprint-testing`, `/test-documentation`, `/test-automation` and `/regression-testing`. Hand those back.

---

## The six operations

Every invocation maps to one operation or a sequence of them. The request picks the operation; the resolved strategy shapes how it runs.

| Op           | Trigger phrases (examples)                              | Skill behaviour                                                                                                    |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Branch**   | "create branch", "new feature branch", "start UPEX-123" | Resolve strategy, propose name with prefix + issue key, wait for OK, checkout                                      |
| **Commit**   | "commit this", "commit and push", "make atomic commits" | Group by responsibility, propose conventional commits, wait for OK, execute one by one                             |
| **Push**     | "push", "push to main", "push my changes"               | Diagnose upstream, confirm if pushing to a protected branch per policy, no `--force` without explicit user opt-in  |
| **PR**       | "create PR", "open a PR", "gh pr create"                | Pick base branch from strategy, render body inline, ask labels/reviewers, call `gh pr create`                      |
| **Conflict** | "fix conflict", "rebase failed", "push rejected"        | Diagnose first (see `references/conflict-resolution.md`), present options, guide resolution, verify clean state    |
| **Strategy Setup** | "set up our git strategy", "bootstrap branching", "materialize the flow" | Resolve strategy, run the decision questionnaire (Q1-Q4), conditionally create or ff-sync long-lived branches (never force), write the `git_strategy:` block in `.agents/project.yaml`. Questions already answered by non-`n/a` `git_strategy.decisions.*` fields are skipped. See `references/strategy-setup.md`. |

When the operation is ambiguous (the user only says "git-flow-master" or "let's do the git stuff"), report the repo state (Step 1) and ask what they need.

---

## Step 1: Always read the repo state

Run these silently on every invocation and do not act until the picture is clear:

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
- Dirty or clean working tree (staged, unstaged, untracked counts).
- Unpushed and unpulled commits (ahead and behind upstream).
- Upstream status (none, up to date, diverged).
- Remote name(s). Most repos have `origin`; some have a fork plus upstream.

This summary is cheap, prevents most mistakes, and feeds every later decision.

---

## Step 1b: Reconcile the declared policy against the host (once per session)

`git_strategy.policy.*` in `.agents/project.yaml` records what the team decided. The hosting platform records what is enforced. The two drift, and the drift surfaces at the worst moment: a merge stalls on an approval nobody expected, or a "protected" branch was never protected.

Run the check once per session, at the first push / PR / merge intent (not on read-only operations), and cache the result.

```bash
bun run git:policy verify          # read-only; exit 1 on drift of a chosen strategy (inherited: warnings)
bun run git:policy verify --stamp  # same, and records the reconciliation when clean
```

The tool queries both GitHub protection mechanisms for every branch in `git_strategy.branches` / `protected`, compares the union against the declared policy, and prints each divergence as `declared` vs `enforced`. It runs every query every time, which a checklist does not. The strategy-to-ruleset mapping and what the tool does not manage are in `references/ruleset-parity.md`.

Facts to keep in mind when reading its output:

- A `404` from `branches/{b}/protection` does not mean the branch is unprotected. A repo governed by rulesets returns `404` there while enforcing PR requirements, approvals, signed commits and non-fast-forward bans through `rules/branches/{b}`. Stopping at the classic endpoint gives a confident "unprotected" reading on a branch that requires a reviewed pull request.
- A push that succeeds is not evidence of an absent rule. Org owners and anyone on the ruleset bypass list push through while the rule still binds everyone else. When a push prints `Changes must be made through a pull request`, that was a bypass: report it as one, never as permission. With `git_strategy.policy.admin_bypass: true` (or the divergence listed in `git_strategy.policy.accepted_divergences`), the `Bypassed rule violations` remote line is the documented norm. Mention it in the report as expected, do not treat it as an anomaly, do not stall asking for confirmation, and do not open a PR to "satisfy" the rule.
- `require_code_owner_review: true` with no `CODEOWNERS` file is unsatisfiable rather than strict. Nobody outside the bypass list can clear it, so every merge becomes a bypass.

On drift, report and do not correct. There are three legitimate resolutions, and each needs the user's choice: update `.agents/project.yaml` to match the host, change the host (`bun run git:policy apply`, a dry run until `--yes`), or accept the divergence in `git_strategy.policy.accepted_divergences` and record why in this project's own `.agents/instructions/agent-project.md` (`## Git Strategy (this repository)`).

`git:policy apply` refuses to remove a guard, lower the approval bar, turn off code-owner review, or widen the merge methods unless `--allow-loosening` is passed for that specific give-up.

---

## Step 2: Resolve the branching strategy

The skill supports eight strategies. `references/branching-strategies.md` has the full catalogue, detection signals and trade-offs.

| Strategy           | One-line description                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `solo-main`        | Single long-lived branch (`main`). All work lands directly. Best for solo projects, scratch repos, prototypes.                                   |
| `main-integration` | `main` (production) + a single integration branch (`staging` / `dev` / `develop`). Features merge to integration, release-promote to `main`.     |
| `enterprise`       | `main` + integration + many short-lived `feature/*`, `fix/*`, `release/*`, `hotfix/*` branches. Adds environment branches when needed.           |
| `trunk-based`      | Trunk (`main`) is the only long-lived branch. Short-lived feature branches (<1 day) merge fast, behind feature flags. CI gate is non-negotiable. |
| `gitflow`          | Vincent Driessen's classic. `main` (releases) + `develop` (integration) + `feature/*` + `release/*` + `hotfix/*`. Heavyweight; mostly legacy.    |
| `github-flow`      | `main` always deployable. `feature/*` branches, PR, merge, deploy. No staging/develop branch.                                                    |
| `gitlab-flow`      | GitHub Flow + environment branches (`pre-production`, `production`) to model deployment promotion.                                               |
| `sdet`             | SDET Gitflow. `main` (confirmed tests) + ephemeral per-suite integration trunk `test/<module>-suite`. Test tickets chain through the trunk (`--no-ff`); one final PR to `main`. For chained test-automation suites. Opt-in; see `references/sdet-integration-trunk.md`. |

### Detection algorithm

Apply in order and stop at the first definitive answer:

1. **The `git_strategy:` block in `.agents/project.yaml`.** If `git_strategy.strategy` is non-null (one of the eight slugs), it plus `git_strategy.branches` (production / integration / ephemeral_pattern) plus `git_strategy.decisions` (`promote_method` / `feature_merge` / `hotfix_policy`) are the persisted decision. A `git_strategy.decisions.*` field whose value is not `n/a` or empty means Strategy Setup skips that question on re-run (idempotency is keyed off those fields, not markers). Inherited-template guard: the boilerplate ships the block filled (`strategy: solo-main`) and a scaffolded project inherits it verbatim (the scaffolder only patches `project.project_name` / `project.project_key`), so a non-null strategy is authoritative only when the project is onboarded. Read `git_strategy.meta.strategy_source` first: `chosen` means Strategy Setup ran for THIS repo and the block is confirmed. `inherited` or absent means the block came from the template whatever `project.project_name` holds: treat it as unconfirmed and route to the Bootstrap trigger's inherited case.
2. **Single-branch heuristic.** `git branch -a` shows only `main` (or `master`) and no integration branch on the remote: `solo-main`.
3. **Two-branch heuristic.** Exactly `main` (or `master`) plus one of `{staging, dev, develop, integration}` upstream: `main-integration` (record the integration branch name).
4. **Multi-branch heuristic.** `main` + integration + active `feature/*` or `release/*` branches in `git branch -a`: `enterprise`.
5. **Project hints.** `.gitlab-ci.yml` suggests `gitlab-flow`; long-lived `release/*` and `hotfix/*` branches suggest `gitflow`.
6. **Fallback: ask the user.** Show the options with one-line descriptions and mirror their language. On a test-automation repo (KATA / Playwright / `/test-automation`), surface `sdet` as the recommended option. `sdet` is opt-in and never inferred silently from layout; a live `test/<module>-suite` trunk with `test/{KEY}-*` PRs targeting it confirms an already-active `sdet` suite.

### Persist the decision

Once resolved (by detection or by asking), write or update the `git_strategy:` block in place inside `.agents/project.yaml`. Preserve the rest of the file (project identity, env config) and create the block if it is missing. Write values only: each key is documented in `.agents/project.schema.yaml`, never in the yaml (ADR-0025). The block is the single source of truth, so no separate file. The first five operations need `git_strategy.strategy` and `git_strategy.branches` at minimum; Strategy Setup (3.6) fills the rest (`git_strategy.decisions`, `git_strategy.protected`, `git_strategy.policy`, `git_strategy.branch_prefixes`, `git_strategy.meta`).

```yaml
# .agents/project.yaml: git_strategy block (only the fields that apply shown)
git_strategy:
  strategy: main-integration
  branches:
    production: main
    integration: staging
    ephemeral_pattern: null
```

Its `git_strategy.description` field is the one-paragraph human summary. The user can edit the block; the next invocation re-reads it. If the integration branch has a non-default name (anything other than `staging`), record it under `git_strategy.branches.integration` so commits do not re-detect it.

The `## Git Strategy` section of `.agents/instructions/agent-git.md` is only a pointer to that block. Strategy policy and branch decisions never go into `AGENTS.md` or an instruction section. A repository's own reading of its strategy goes in its project-owned `.agents/instructions/agent-project.md` (`## Git Strategy (this repository)`). Any other change to an instruction file is `/framework-development` mode `instructions`.

### Bootstrap trigger: offer setup on a fresh repo (never auto-run)

At the top of any git intent, after Step 1 and Step 2 detection, evaluate the gate. It fires on either of two conditions:

> **(a) Unset.** `git_strategy.strategy` in `.agents/project.yaml` is null (or the `git_strategy:` block is absent) AND the repo looks fresh: only `main`/`master` exists locally and on the remote, or fewer than ~3 commits, or a boilerplate sentinel file is present (e.g. `.agents/project.yaml`).
>
> **(b) Inherited.** `git_strategy.strategy` is non-null and `git_strategy.meta.strategy_source` is NOT `chosen` (it is `inherited` or absent), whatever `project.project_name` (same file) holds. The block was inherited from the boilerplate template and not chosen for THIS project, so it is unconfirmed.

If either condition holds, offer (do not auto-execute, do not silently pick a strategy) with the matching prompt:

> _(unset case (a))_ "No git strategy is set up yet. Want me to run Strategy Setup: pick the flow, create the branches it needs, and write the `git_strategy:` block in `.agents/project.yaml`? (Y/N)"

> _(inherited case (b))_ "This project's `git_strategy` looks inherited from the boilerplate (`meta.strategy_source` is not `chosen`). Want to run Strategy Setup to define this project's own flow? (Y/N)"

Rules:

- Offer once per session and cache the answer. Do not re-prompt on every git intent.
- Never auto-run. A "no" proceeds with the requested operation under the detected (case a) or inherited (case b) strategy without writing the block. A "yes" enters Strategy Setup (3.6) before the original git intent continues.
- The updater freezes the inherited file via `bootstrapOnlyPaths`, so the offer fires on first real use by design (template-trap guard). `git_strategy.meta.strategy_source: chosen` confirms the strategy before `project.project_name` is read, so neither case fires on it.

---

## Step 3: Operation runbooks

### 3.1 Branch creation

Pick the prefix from the dominant change, using this fixed vocabulary (mixed-changes precedence: `feat > fix > refactor > test > docs > chore`):

| Prefix      | When the dominant change is…                         |
| ----------- | ---------------------------------------------------- |
| `feat/`     | new feature or capability                            |
| `fix/`      | bug fix                                              |
| `test/`     | adding or updating automated tests (no product code) |
| `docs/`     | docs only                                            |
| `refactor/` | code change without behaviour change                 |
| `chore/`    | tooling, deps, housekeeping                          |

For `enterprise` and `gitflow`, also consider `release/X.Y.Z` and `hotfix/X.Y.Z` when they fit.

In a QA repo most work lands as `test/`, `fix/` or `chore/` branches. A `feat/` here usually means a change to the test framework itself (new fixture, new Page component layer, new reporter).

Issue key extraction, in order:

1. Current branch name regex: `(?:feat|feature|fix|test|docs|refactor|chore)/([A-Z]+-\d+)-`.
2. `$ARGUMENTS` for `[A-Z]+-\d+`.
3. Ask the user once ("Is there an issue key for this work?") and accept "no".

Branch name format: read `git_strategy.branch_prefixes` in `.agents/project.yaml` (`naming_with_key` / `naming_without_key` / `precedence`). The patterns below are the shipped defaults, used as written when the block is absent.

- With key: `{prefix}/{ISSUE-KEY}-{kebab-slug}` (e.g. `test/UPEX-123-bulk-assign-coverage`).
- Without key: `{prefix}/{kebab-slug}` (e.g. `refactor/split-kata-fixtures`).
- Slugs are lowercase, hyphen-separated, at most 50 characters.

Source branch by strategy:

- `solo-main`, `github-flow`, `trunk-based`: branch off `main`.
- `main-integration`, `gitlab-flow`: branch off the integration branch (`staging` / `dev` / equivalent).
- `enterprise`: the integration branch, except `hotfix/*`, which branches off `main`.
- `gitflow`: `feature/*` off `develop`; `hotfix/*` off `main`; `release/*` off `develop`.
- `sdet`: `test/{KEY}-*` ticket branches and Plus Branches (`docs/*` / `chore/*` / `fix/*`) branch off the ephemeral integration trunk `test/<module>-suite`; the trunk itself is cut from `main` on demand when a suite begins. A ticket never stacks on the previous ticket branch. See `references/sdet-integration-trunk.md`.

Propose the name and wait for OK before `git checkout -b`.

### 3.2 Commits

Group changes by responsibility, not by file type:

| Group       | Typical paths                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| Test code   | `tests/`, `tests/components/`, `tests/e2e/`, `tests/integration/`             |
| API schemas | `api/schemas/`, codegen output, OpenAPI types                                 |
| Test data   | `tests/data/`                                                                 |
| Skills/Docs | `.agents/skills/`, `.agents/`, `AGENTS.md`, `docs/`, `README.md`              |
| Config      | `package.json`, `tsconfig.json`, `playwright.config.ts`, lint/format configs  |

Test data and fixtures stay in the commit of the tests they support, not in a separate `chore:` commit.

Conventional commit format:

- With issue key: `{type}({ISSUE-KEY}): {description}` (e.g. `test(UPEX-123): cover bulk-assign empty states`).
- Without key: `{type}: {description}`.
- Breaking changes: append `!` after type/scope and add a `BREAKING CHANGE:` footer.

Vocabulary: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert` (full list in `references/conventional-commits.md`).

Commit rules, on every commit:

- One commit, one responsibility: bundled changes cannot be reverted or blamed surgically.
- Explicit paths only (see Compact Rules), so `.env` files, credentials and unrelated work cannot ride along. A secret committed once stays in history for good.
- PBI ladder guard (repos running the `.context/PBI/` cache, `.agents/instructions/agent-local-context-pbi.md`). After staging, run `git diff --cached --name-only | grep '^\.context/'`. Anything staged there must be one of the three `[COMMIT]`-tier paths (`.context/PBI/README.md`, `.context/PBI/templates/**`, `.context/PBI/epics/*/test-specs/**`). Every other match is `[SYNC]` cache that leaked past the ignore ladder: a directory like `stories/` reads as untracked in `git status`, and an explicit-path `git add` descends straight past the exclusion. Unstage it (`git restore --staged <path>`) before the commit proceeds. A commit that touches no `.context/` path skips the check.
- No AI attribution: no `Generated with Claude Code`, no `Co-Authored-By: Claude`, no equivalent line (Critical Rule #3 in `AGENTS.md`).
- If a pre-commit hook fails, create a NEW commit after the fix (see Compact Rules).

Forensic trailers (every commit, every strategy). The last two lines of every commit message are:

```
Worktree: <name|primary>
Session: <label>
```

- Both values come from the `AGENT IDENTITY:` line the prompt hook injects into this session's context (`worktree=…`, `session=…`). Copy them; do not re-derive them per commit. The session label may contain spaces and parentheses (`my-session (c0ffee12)`), so take everything after `session=` up to the literal ` harness=` token and never split the line on whitespace.
- `primary` is the right worktree value when the session is not in a linked worktree. When a value cannot be resolved at all, write `unknown`: never guess a name and never drop the key.
- Nothing goes below them and nothing is added beside them.
- `Docs-Checked: <label> <reason>` is the one trailer that may sit above them (ADR-0016). Add it only when the change touched a `LINT.IfChange(<label>)` region, the pages its `LINT.ThenChange(...)` names were not updated, and they still describe the behaviour correctly; the reason says why. A bare label does not count. The pre-push and CI documentation-contract gate block the push without it or the page edits. On an already-pushed range the ack is an empty commit carrying the line, never an amend.
- They are forensics, not attribution: a bisect or incident review uses them to find the right transcript, and no tool, vendor or model is named. Critical Rule #3 is untouched: no `Claude-Session:`, no AI `Co-Authored-By:`, no "Generated with …" line, no other harness-branded key.

Present all proposed commits as one block and wait for OK, modify or reject before executing.

### 3.3 Push

The push command depends on Step 1:

- No upstream: `git push -u origin {branch}`.
- Upstream behind: `git push`.
- Upstream diverged: stop, do not force, and hand to conflict resolution (3.5).

Protected branches per strategy (the branches the policy gate below guards, unioned with `git_strategy.protected`):

- `solo-main`: `main`.
- `main-integration`: `main` and the integration branch.
- `gitflow`: `main` and `develop`.
- `github-flow` / `trunk-based`: `main`.
- `gitlab-flow`: `main` (the integration branch) and the environment branches `pre-production` and `production`.
- `enterprise`: `main`, integration, and any `release/*`.
- `sdet`: `main` (only the final suite PR lands, reviewed with green CI). The integration trunk is protected by convention, but its ticket and Plus PRs are self-merged by the maintainer with no ruleset friction.

Policy gate (consult `git_strategy.policy.direct_push_to_protected` before any direct push to a protected branch):

| `git_strategy.policy.direct_push_to_protected` | Behaviour |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `allowed`                                      | Standing authorization: push without a per-push confirm. The recorded value is the authorization (stamped by Strategy Setup with the user); asking anyway collapses `allowed` into `confirm` and empties the third state. |
| `confirm` (default)                            | Always ask. Wait for explicit yes.                                                                         |
| `forbidden`                                    | Refuse the direct push and redirect to the PR flow (3.4): propose a work branch and `gh pr create`.       |

For `confirm`, ask: _"You are about to push directly to the protected branch `{branch}` in a `{strategy}` flow. Confirm?"_ and wait for an explicit yes. A missing or null `git_strategy` block (fresh scaffold, project never onboarded) behaves as `confirm`: the safe default is to ask, never to assume standing authorization.

Admin bypass (only when contemplating skipping PR or protection for an urgent change): the skill may offer a bypass only when `git_strategy.policy.admin_bypass: true`, and it re-confirms at runtime both that the operator actually holds admin rights on the repo (ask: the skill cannot know the GitHub role, and `admin_bypass` is a team policy intent, not a capability check) and the irreversible action itself. With `git_strategy.policy.admin_bypass: false`, never offer a bypass regardless of the operator's role.

Never pass `--force`, `--force-with-lease`, `--no-verify` or any history-rewriting flag unless the user explicitly requests it AND the branch is unshared; record the request in the conversation. Force-pushing a shared branch destroys teammates' history, and `--no-verify` skips hooks that catch the bug you did not notice (Critical Reminder #6 in `AGENTS.md`).

### 3.4 Pull request

The base branch picks itself from the strategy:

| Strategy                                  | Default PR base                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `solo-main`, `github-flow`, `trunk-based` | `main`                                                                                           |
| `main-integration`, `gitlab-flow`         | integration branch (e.g. `staging`)                                                              |
| `enterprise`                              | integration branch; `hotfix/*` → `main`                                                          |
| `gitflow`                                 | `feature/*` → `develop`; `hotfix/*` → `main`; `release/*` → `main` (and back-merge to `develop`) |
| `sdet`                                    | `test/{KEY}-*` ticket branches + Plus Branches → the integration trunk `test/<module>-suite`; the single final suite PR → `main` (after the sync gate). See `references/sdet-integration-trunk.md`. |

The user can override with `--base X` in arguments. If they do, surface it in the confirmation: _"PR will target `{base}` instead of the strategy default `{default}`."_

Title format: `{type}({ISSUE-KEY}): {description}`, under 70 characters. Without a key: `{type}: {description}`.

Body: render it inline (there is no template file to read) with the structure in `references/pr-templating.md`. Substitute the placeholders the skill can fill (`<<ISSUE_KEY>>`, `<<SUMMARY>>`, `<<CHANGES>>`, `<<TEST_PLAN>>`, `<<RISK>>`). Leave any unfilled placeholder visible so the author can edit it before posting, and do not silently drop sections. `test/*` branches in this repo use the project-local template tuned for KATA test-automation PRs, `references/pr-test-automation.md`; every other branch uses the generic structure in `references/pr-templating.md`.

Fill `<<RISK>>` with the merge danger. Say whether the merge is a one-way door (destructive or hard to reverse: migrations, deleted data, published contracts) or a two-way door (cheap to roll back), then the blast radius in a word or two (consumers, other modules, layout, rollback cost). Back the "works" claim in `<<EVIDENCE>>` with the heaviest proof available: a before and after screenshot for visual changes, the exact test that failed and now passes for logic, console output last.

Write the rendered body to a tempfile (e.g. `$(mktemp)`) and pass it with `gh pr create --body-file` to avoid escaping problems.

Reviewers, labels and draft: see `references/pr-templating.md`. Verify labels with `gh label list` when unsure; never hardcode labels the repo may not have.

Final command shape:

```bash
gh pr create \
  --title "{title}" \
  --body-file {tmpfile} \
  --base {base} \
  [--reviewer {users}] \
  [--label {labels}] \
  [--draft]
```

Stop at PR creation. Merging is the user's explicit next step, and nothing auto-merges. Surface: _"Review the PR. Once approved, merge via the GitHub UI or run `gh pr merge {number} {merge-flag}`."_ with the flag chosen by the rule below. One carve-out: when a supervised worker's dispatch or brief names the merge as a step, that instruction is the explicit next step and the worker merges. The rule exists so an agent never merges on its own judgement; a dispatch that says "open the PR and merge it" is the owner's judgement, delivered through the channel the fleet uses for every other instruction. Say in the report that the merge was pre-authorized and by which line of the brief.

Which merge flag (one rule, `sdet` first). `sdet` (the integration trunk) is the Dojo standard for test-automation suites, so its rule comes first and is never relaxed:

| PR | Flag | Squash |
| --- | --- | --- |
| Ticket or Plus Branch → the trunk `test/<module>-suite` | `--merge` (a merge commit, the `--no-ff` equivalent) | Never. It flattens the per-ticket history the suite exists to keep (`references/sdet-integration-trunk.md`). |
| Final `trunk → main` | `--merge` | Only when the host allows no other method; the chain then survives on the pushed trunk and the PR body says so. Do not add `--delete-branch` here: the trunk is deleted after CI is green on `main`. |
| Any other strategy | the flag that matches `git_strategy.decisions.feature_merge`: `merge-commit` → `--merge`, `squash` → `--squash`, `rebase-merge` → `--rebase` | Fine for a short-lived branch whose intermediate commits carry no meaning (the default when `feature_merge` is `n/a` or the block is missing). Use `--merge` when per-commit history matters. |

Optional pre-PR adversarial gate: when the diff exceeds the 400-line review budget or touches shared scaffolding (KATA base classes, fixtures, OpenAPI schemas), offer `/judgment-day`: _"Diff is large / touches shared scaffolding. Want to run `/judgment-day` before opening the PR?"_. Two blind judges review the diff in parallel and it approves only when both agree. See `.agents/skills/judgment-day/SKILL.md`. It is never invoked automatically; the user opts in.

When stacking PRs, name the dependency chain in each PR body so reviewers know which to read first.

### 3.5 Conflict resolution

Diagnose before resolving. The user is rarely in a hurry, and a wrong fix here costs hours.

Run `git status` and `git diff --check`, inspect `.git/MERGE_HEAD` / `REBASE_HEAD` to classify the situation, then follow the matching playbook in `references/conflict-resolution.md`:

- Merge conflict (content)
- Merge conflict (rename / delete)
- Rebase conflict
- Push rejected (diverged)
- Detached HEAD
- Stash apply conflict
- Unrelated histories
- Pre-commit hook rejected the commit

Every playbook has the same shape:

1. Explain what happened (root cause, in the user's language).
2. Present options ranked by safety. A destructive option (force push, hard reset, `--abort` of an unfinished merge with uncommitted work) is never picked silently.
3. Guide the resolution step by step.
4. Verify (`git status`, `git log --oneline -3`).
5. Teach prevention in one short note.

When in doubt, abort safely (`git merge --abort`, `git rebase --abort`, `git cherry-pick --abort`) rather than push forward. Aborting beats guessing.

### 3.6 Strategy Setup

The first five operations adapt to a strategy that already exists. Strategy Setup establishes one: it resolves (or asks) the strategy, captures the merge, hotfix and protection-policy decisions the other operations depend on, materializes the long-lived branches the strategy needs, and writes the `git_strategy:` block in `.agents/project.yaml`. It is the only operation that creates branches and writes the strategy definition.

When it runs:

- Explicit: the user asks ("set up our git strategy", "bootstrap branching", "materialize the flow").
- Bootstrap offer (see "Bootstrap trigger"): a git intent arrives and either `git_strategy.strategy` is null (or the block is absent) with a fresh-looking repo, or it is non-null and `meta.strategy_source` is not `chosen`. The skill offers; it never auto-runs.

The six-step flow (mechanics live in `references/strategy-setup.md`, not here):

1. Read repo state: Step 1, which already always runs.
2. Resolve strategy: reuse Step 2 detection. If still undetermined, ask the strategy question (the slugs in the Step 2 table; on a test-automation repo, `sdet` first as the recommended option).
3. Decision questionnaire: run Q1 to Q4 below, capturing merge methods, hotfix policy and protection policy. Skip any question that does not apply to the resolved strategy, and any whose decision field is already populated (idempotent re-run, see Step 2). Q4 applies to all strategies.
4. Materialize, conditional on the resolved strategy: create an integration branch only if the strategy needs one and it is missing; ff-sync the integration/production pair if one is a pure ancestor of the other (never `--force`); set up local tracking. The full materialization table and sync mechanics are in `references/strategy-setup.md`.
5. Persist: write the `git_strategy:` block in `.agents/project.yaml` (the structured source of truth) with the fields that apply, preserving the rest of the file, and no separate file. Do not render a prose runbook anywhere: the operational how lives in this skill's references (`branching-strategies.md` catalogue and `sdet-integration-trunk.md`), read on demand. Per-strategy field values are in `references/branching-strategies.md` under "git_strategy field rules (per strategy)".
6. Report: branches created or synced, decisions captured, block location.

Decision questionnaire (defaults first; each gated on the resolved strategy):

| Q  | Question                                                   | Applies to                                                                                  | Options (default first)                                                                                                                  | Drives                                                |
| -- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Q1 | Promotion method, integration → production                 | strategies with an integration branch (`main-integration`, `gitlab-flow`, `enterprise`; `gitflow` = `develop → main`) | **Fast-forward only** / Merge commit (`--no-ff`) / Squash                                                                                | release runbook + whether branches stay byte-identical |
| Q2 | Merge method, work-branch → integration (or → trunk)       | all multi-branch strategies                                                                 | **Merge commit (`--no-ff`)** / Squash / Rebase + merge                                                                                   | how integration history accrues                       |
| Q3 | Hotfix policy                                              | strategies with a production branch distinct from where work lands                          | **Branch off production → PR to production → back-merge to integration same day** / Always via integration / No policy                  | hotfix runbook + invariant maintenance                |
| Q4 | Protected-branch bypass policy                             | **ALL strategies**                                                                          | `direct_push_to_protected`: forbidden / confirm / allowed (default per strategy: solo-main=`allowed`, multi-branch=`forbidden`, sdet=`confirm`) · `admin_bypass`: may a repo admin bypass PR/protection for urgent changes? (default `false`) · `require_pr_reviews`: min approvals (default `null` / strategy-appropriate) | how strictly protected branches are guarded (Push op 3.3), sets `git_strategy.policy.*` |

Q1 to Q3 defaults are what the `main-integration` worked example chose. They are defaults, not hardcoded, and the user can override any of them. Single-branch strategies (`solo-main`, `github-flow`, `trunk-based`) answer none of Q1 to Q3, because they have no integration branch and no distinct production branch. Q4 applies to every strategy (a solo `main` is still protected) and writes `git_strategy.policy.*`; per-strategy Q4 defaults are in `references/branching-strategies.md` under "git_strategy field rules (per strategy)".

The block fields (write only the ones that apply; leave `decisions.*` at `n/a` for any decision the strategy does not use):

```yaml
git_strategy:
  strategy: VALUE                 # one of the eight slugs
  branches:
    integration: NAME             # or null
  decisions:
    promote_method: ff-only|merge-commit|squash|n/a
    feature_merge: merge-commit|squash|rebase-merge|n/a
    hotfix_policy: branch-off-prod-backmerge|via-integration|none|n/a
  policy:                                          # Q4: applies to ALL strategies
    direct_push_to_protected: forbidden|confirm|allowed
    admin_bypass: true|false                       # team POLICY intent, not enforcement
    require_pr_reviews: null|0|N
```

Setup limits:

- Never `--force` (nor `--force-with-lease`) during a setup sync. Sync only on a true fast-forward; if the integration/production pair has diverged both ways, stop and hand to conflict resolution (3.5).
- Confirm before any push to a protected branch. A setup ff-sync push is still one.
- Propose branch creation and wait for OK before `git checkout -b` / `git branch`: show which branch, off what, and why.
- No AI attribution in any commit the setup makes (Critical Rule #3).

Pointers: `references/strategy-setup.md` has the questionnaire detail (Q1 to Q4), the per-strategy materialization table, sync mechanics, persist sequence and report format. `references/branching-strategies.md` ("git_strategy field rules (per strategy)") has the values written into the block.

---

## Step 4: Chained and stacked PRs (when a change outgrows the budget)

When a planned change estimates above 400 changed lines (additions plus deletions), split the work. The 400-line cognitive review budget comes from industry research (SmartBear, Cisco code-review studies); above it, defect detection drops sharply.

Three options:

1. `stacked-to-main`: 2 to 4 small PRs, each branched off the strategy's default base. PRs depend on earlier merges and the base always works between merges. Best for linearly decomposable work.
2. `feature-branch-chain`: one long-lived integration branch; child PRs merge into it; one final PR merges it to the strategy's default base. Best for changes with shared scaffolding (new types, new schemas) that would break partial merges.
3. `size-exception`: for mechanical diffs (mass renames, formatter sweeps, generated code, vendor updates). It needs an explicit user override and a `Why size-exception:` line in the PR body.

Walk the chained-PR decision tree inline (`references/branching-strategies.md` § Chained-PR decision tree). It picks one of `single-pr`, `stacked-to-main`, `feature-branch-chain`, `size-exception`, and this skill then executes the resulting branch plan. That plan is the contract for execution: if the real diff outgrows the estimate, re-invoke the decision rather than silently up-budgeting.

---

## Variables consumed

- `{{PROJECT_KEY}}`: issue prefix for branch naming (e.g. `UPEX-123`). Resolves from `.agents/project.yaml`.
- `{{ATLASSIAN_URL}}`: base URL for the Traceability section in PR bodies. Resolves from `.agents/project.yaml:atlassian_url`.
- A project missing `.agents/project.yaml` lacks both. Fall back to a generic `{prefix}/{slug}` and surface a one-line warning: clone the full boilerplate (the foundation files ship with the repo).

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
| A promotion PR (integration → production) merged       | `/test-documentation post-promotion`: the `merged` pass for every TC at `pull_request` whose spec is on `origin/<production>` (`agentic-qa-core/references/discovery-driven-doctrine.md` §6) |
| Atlassian (Jira) operations triggered by a commit / PR | `/acli`                                              |
| First-time orientation                                 | `/agentic-qa-onboard`                                |

---

## Autonomous runs

Gates in this skill: the OK before a branch, commit set or PR body; the confirm on a push to a protected branch under `confirm`; the Strategy Setup offer; the strategy question when detection fails; the conflict options; the admin-bypass re-confirm; the `/judgment-day` offer; a `size-exception` override. `agentic-qa-core/references/decision-protocol.md` says which of them reach a person.

| Case | Who holds the gate |
| --- | --- |
| A person is present | Unchanged: ask and wait. |
| A supervised worker | The conductor or launcher. A dispatch that names a branch, commit set, push or merge is the OK for exactly what it names (3.4 has the merge carve-out). |
| A routine with nobody | The delegating brief, when it covers the decision. Without one, do the local reversible work (read state, branch, commits) and stop before any outward or irreversible action: push, PR creation, merge, a force flag, a bypass. Report what is ready. |

An absent person never turns `confirm` into `allowed`, and never authorizes a bypass or a force flag.

---

## Critical rules: apply every invocation

Compact Rules above carry the detail. These are the numbered rules other files cite.

1. Diagnose before acting. Step 1 always runs, and repo state is never assumed.
1b. `policy:` records intent, not enforcement. Reconcile it by running `bun run git:policy verify` (Step 1b) at the first push / PR / merge intent, then `--stamp` when clean. Never run the protection queries by hand, and never state what the remote requires from a `declared` reading.
1c. `strategy: solo-main` is the shipped default, not evidence of a decision. `meta.strategy_source` tells them apart: `inherited` means nobody chose. On a repo whose `project.project_name` is set and whose `strategy_source` is still `inherited`, offer Strategy Setup and say what the default costs (no integration branch, no promotion path, no review gate). Strategy Setup stamps `chosen`; nothing else may.
2. One commit, one responsibility (3.2).
3. No AI attribution in commits or PR bodies (Critical Reminder #3 in `AGENTS.md`). The two forensic trailers of 3.2 (`Worktree:` / `Session:`) always close a commit message: they name a working tree and a session, never a tool, so they are not attribution and not optional.
4. Confirm before pushing to any protected branch. Strategy-driven; see 3.3 (Critical Reminder #5 in `AGENTS.md`).
5. Never rewrite pushed history (Critical Rule #6, an invariant). Never force-push or `--no-verify` unless the user explicitly authorises it AND the branch is unshared.
6. Explicit paths only: no `git add -A` or `git add .`.
7. Show proposed commits, branches and PR body and wait for OK. The user can accept, modify or reject any item.
8. `gh` is the PR transport. If it is missing or unauthenticated (`gh auth status` fails), stop and surface the blocker; do not pretend a PR was opened.
9. PRs stop at creation, with the one carve-out in 3.4: a supervised worker whose dispatch or brief names the merge is executing the owner's instruction, not its own judgement.
10. Strategy is sticky: persist it in the `git_strategy:` block of `.agents/project.yaml` and re-read it instead of asking again.
11. Language: artifacts (commits, branches, PR bodies, AGENTS.md sections) are English. Mirror the user's language only in conversation.
12. No global discards (Critical Rule #15 in `AGENTS.md`): a global discard destroys another session's uncommitted work with no recovery when sessions share a tree. Discard only explicit paths this session modified; if ownership is unclear, stop and ask. True isolation is in `references/worktrees.md`.

---

## Isolated worktrees (parallel / risky work)

When work must stay isolated from in-progress changes on the current branch (a second AI session running in parallel, a hotfix while a feature is open, unrelated WIP you do not want to mix), use a git worktree: a second working directory on its own branch, sharing one `.git`. Three paths:

- Manual git (portable, any tool): `git worktree add ../dir -b feat/x main`, work, then `git worktree remove` / `prune`.
- Claude Code harness (this agent only): `EnterWorktree` moves the session into a fresh worktree under `.claude/worktrees/`; `ExitWorktree` (`keep`/`remove`) leaves it. Other coding agents lack this and use the manual path.
- Orchestrated (a coordinated fleet of worker sessions): the orchestration layer creates, provisions and removes one worktree per worker, outside the repo and visible to the owner. Git mechanics are identical; the lifecycle is owned by `/agent-orchestration`.

Gotchas: a fresh worktree contains only the tracked files of its base, so untracked WIP does not teleport (`mv` it in, or commit first) and every gitignored file is missing too (`bun run worktree:provision`). Keep the primary tree's `git status` clean, and run the orphan audit before removing a worktree, because gitignored evidence dies with it. Full lifecycle, multi-session safety rules and the decision guide: `references/worktrees.md`.

---

## Pre-flight checklist (run before exiting any operation)

- [ ] Step 1 ran and the repo state was reported.
- [ ] Strategy resolved (from the `git_strategy:` block, inferred from layout, or asked) and persisted to that block if newly chosen.
- [ ] The operation followed the runbook for that strategy.
- [ ] Each commit is atomic, conventional, free of AI attribution, and ends with the two forensic trailers (values from the `AGENT IDENTITY:` line, or `unknown`).
- [ ] No `git add -A`, `--force`, `--no-verify` or global discard ran unless explicitly authorised; any discard targeted explicit session-owned paths.
- [ ] PR (if created): title under 70 characters, body with Summary / Changes / Test Plan / Traceability / Evidence / Merge danger, base branch matches the strategy, URL returned, no merge attempted.
- [ ] Conflicts (if any) are resolved and verified (`git status` clean, `git log` sensible).
- [ ] If Strategy Setup ran: branches were proposed and not auto-created, ff-syncs were true fast-forwards only (a diverged pair went to conflict resolution), and the `git_strategy:` block in `.agents/project.yaml` was written in place with the fields that apply (strategy / branches / decisions / policy / protected / branch_prefixes / description / meta), preserving the rest of the file.

---

## Reference files

| File                                 | When to read                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `references/branching-strategies.md` | Full catalogue of the 8 strategies, detection signals, trade-offs, chained-PR decision tree, and per-strategy `git_strategy` field rules (the block in `.agents/project.yaml`). Read when resolving strategy or planning a chain.      |
| `references/strategy-setup.md`       | Strategy Setup (3.6) mechanics: decision questionnaire detail, per-strategy materialization table, ff-sync mechanics (never force), persist sequence, report format. Read when running or re-running Strategy Setup. |
| `references/sdet-integration-trunk.md` | `sdet` strategy runbook: per-ticket loop, ephemeral integration trunk, local double-env gate, Sanity CI + CI-fallback clause, Plus Branches, sync gate, final PR, TC lifecycle. Read when running an `sdet` test-automation suite. |
| `references/conventional-commits.md` | Full type vocabulary, scope rules, breaking-change syntax, mixed-changes precedence. Read when proposing commits.                                      |
| `references/pr-templating.md`        | PR body template, placeholder rules, label / reviewer / draft conventions, multi-strategy base-branch table. Read when opening a PR.                   |
| `references/conflict-resolution.md`  | Per-conflict-type playbooks (merge / rebase / push-rejected / detached-HEAD / stash / unrelated histories / hook rejection). Read when Step 3.5 fires. |
| `references/worktrees.md`            | Git worktrees for isolated or parallel work: manual git, Claude Code `EnterWorktree`/`ExitWorktree`, orchestrated worktrees, the untracked-files gotcha, gitignored-file provisioning, multi-session safety, the orphan audit before removal, cleanup, decision guide. Read when isolating work or running parallel sessions. |
| `references/observer.md`             | Merge Line, the read-only PR view of the Sprint Board: the observer rule (never acts on GitHub), lanes, order, approval and tracker parity, the collector (`cli/sprint-board/merge-collect.ts`), its state and gotchas. Read when reading, operating or changing Merge Line. |

Read references on demand rather than all upfront. Each file is self-contained.
