---
id: git
title: 'Git workflow and strategy'
load_when: 'any git, branch, commit, push, PR, merge, rebase, conflict or branching-strategy intent'
triggers: ['\bgit\b', '\bcommit', '\bpush', '\bPR\b', '\bpull request', '\bbranch', '\brama\b', '\bmerge', '\brebase', '\bconflict', '\bconflicto']
paths: ['.husky/', '.github/']
---

# Git

## 11. GIT WORKFLOW: POINTERS

Git / PR work → `/git-flow-master` auto-loads. Details in `.agents/skills/git-flow-master/`. **No legacy git-flow doc applies**: the live policy is the `git_strategy:` block in `.agents/project.yaml`, enforced by `bun run git:policy verify` (the removed doc and its `staging` assumption: ADR-0006).

**Active strategy + branch policy = the `git_strategy:` block in `.agents/project.yaml`** (source of truth; see `## Git Strategy` below).

**Protected branches** (`/git-flow-master` reads `git_strategy.protected` in `.agents/project.yaml`; falls back to detecting whatever branches exist on the remote):

| Branch | Status | Role |
|---|---|---|
| `main` | Always | Production + default branch. The only branch in `git_strategy.protected`. In a `solo-main` flow work lands by DIRECT push when `git_strategy.policy.direct_push_to_protected` is `allowed` (Critical Rule #5); a PR from a semantic branch is optional, for when a review gate is wanted. |
| `staging` | Optional | Only if team adopts a main-integration flow. Integration branch for AI commits + pre-release validation. Does NOT exist on `origin` by default: do not assume it. |

**Critical commit rules**:

- Semantic prefixes: `feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`
- One commit = one responsibility. Clear messages.
- **NO AI attribution** in commits.
- **Forensic trailers, every commit, every strategy**: last two lines are `Worktree: <name|primary>` then `Session: <label>`, taken from the `AGENT IDENTITY:` context line the hook injects (§4.5); `unknown` when nothing resolves. Provenance, not attribution (Rule #3) — and never `Claude-Session:` or any harness-branded key. Label rule + per-harness resolution: `/git-flow-master`.
- **`Docs-Checked: <label> <reason>`** (ADR-0016) goes ABOVE the two forensic trailers, only when a change touched a `LINT.IfChange(<label>)` region and the pages it names still hold. NEVER by reflex and never without the reason: it is the escape the pre-push and CI documentation-contract gate accepts, and the drift sweep counts every one. binding: `/git-flow-master`
- **Push policy = Critical Rule #5**: resolve `git_strategy.policy.direct_push_to_protected`.
- Test-automation PRs use `.agents/skills/git-flow-master/references/pr-test-automation.md` (auto-loaded by `/git-flow-master` on `test/*` branches). Title format: `{type}({ISSUE-KEY}): {description}`.

---

## Git Strategy

> **Source of truth: the `git_strategy:` block in `.agents/project.yaml`.** `git-flow-master` reads it before any git/gh operation and adapts every branch / commit / push / PR / conflict-fix to the strategy declared there. NEVER define branch policy in `AGENTS.md` or in an instruction section: edit the `git_strategy:` block. (binding: `/git-flow-master`)
>
> `git_strategy.strategy` ships **`solo-main`**, not null. That is a DEFAULT, not a decision, and `meta.strategy_source: inherited` is what records the difference. `git-flow-master` OFFERS "Strategy Setup" when a project has filled in its `project_name` and `strategy_source` is still `inherited` — a real project running a strategy nobody chose. `.agents/project.yaml` is frozen by `bun run up` (updater `bootstrapOnlyPaths`), so every project keeps its own. Downstream test-automation projects typically choose `sdet` (chained suites; see `.agents/skills/git-flow-master/references/sdet-integration-trunk.md`).

A repository's own reading of its strategy (why it chose it, and any divergence it accepted in `git_strategy.policy.accepted_divergences`) is project prose: it lives in the project-owned `.agents/instructions/agent-project.md` under `## Git Strategy (this repository)`, never in this synced section.

### Accepted divergences (mechanism)

An intended disagreement between the yaml and the host is declared in `git_strategy.policy.accepted_divergences` (`.agents/project.yaml`), one entry per `verify` finding field, with a reason; that entry, not prose, is what `bun run git:policy verify` reads.

- **`verify` reports it under `ACCEPTED`, exits 0**, and warns if the entry ever goes stale (no matching drift). It runs automatically in the pre-push hook and in `bun run repo:check`; only UNACCEPTED drift blocks. Unreachable host = warn + exit 0 (absence of data is not drift).
- **`verify --stamp` records `meta.policy_source: accepted`**, distinct from `verified`, which still means "host matches the yaml exactly".
- **`bun run git:policy apply` preserves the host's side of accepted fields** (an accepted `pull_request` rule is carried forward verbatim instead of being derived away). Still: always read the dry run before `--yes`.

Mechanism doc: `.agents/skills/git-flow-master/references/ruleset-parity.md` §2b.
