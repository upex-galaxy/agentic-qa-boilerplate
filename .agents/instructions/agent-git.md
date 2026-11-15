---
id: git
title: 'Git workflow and strategy'
load_when: 'any git, branch, commit, push, PR, merge, rebase, conflict or branching-strategy intent'
triggers: ['\bgit\b', '\bcommit', '\bpush', '\bPR\b', '\bpull request', '\bbranch', '\bmerge', '\brebase', '\bconflict']
paths: ['.husky/', '.github/']
---

# Git

## 11. GIT WORKFLOW: POINTERS

Git and PR work loads `/git-flow-master` by meaning; its details are in `.agents/skills/git-flow-master/`. No legacy git-flow doc applies. The live policy is the `git_strategy:` block in `.agents/project.yaml`, enforced by `bun run git:policy verify` (ADR-0006 records the removed doc and its `staging` assumption). That block is the source of truth for the active strategy and branch policy; see `## Git Strategy` below.

**Protected branches.** `/git-flow-master` reads `git_strategy.protected` in `.agents/project.yaml` and falls back to whichever branches exist on the remote.

| Branch | Status | Role |
|---|---|---|
| `main` | Always | Production and default branch, and the only branch in `git_strategy.protected`. In a `solo-main` flow work lands by direct push when `git_strategy.policy.direct_push_to_protected` is `allowed` (Critical Rule #5); a PR from a semantic branch stays optional, for when a review gate is wanted. |
| `staging` | Optional | Only if the team adopts a main-integration flow: the integration branch for AI commits and pre-release validation. It does not exist on `origin` by default, so do not assume it. |

**Commit rules.**

- Semantic prefixes: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
- One commit is one responsibility, with a clear message.
- No AI attribution in commits (Rule #3).
- Every commit, under every strategy, ends with the two forensic trailers `Worktree: <name|primary>` then `Session: <label>`, taken from the `AGENT IDENTITY:` context line the hook injects (§4.5), or `unknown` when nothing resolves. They record provenance, not attribution (Rule #3), so never use `Claude-Session:` or any harness-branded key. The label rule and per-harness resolution are in `/git-flow-master`.
- `Docs-Checked: <label> <reason>` (ADR-0016) goes above the two trailers, only when a change touched a `LINT.IfChange(<label>)` region and the pages it names still hold. It is the escape the pre-push and CI documentation-contract gate accepts and the drift sweep counts every use, so add it only with a real reason. binding: `/git-flow-master`
- The push policy is Critical Rule #5: resolve `git_strategy.policy.direct_push_to_protected`.
- Test-automation PRs use `.agents/skills/git-flow-master/references/pr-test-automation.md`, which `/git-flow-master` loads on `test/*` branches. Title format: `{type}({ISSUE-KEY}): {description}`.

---

## Git Strategy

The `git_strategy:` block in `.agents/project.yaml` is the source of truth. `git-flow-master` reads it before any git or gh operation and adapts every branch, commit, push, PR and conflict fix to it. Branch policy is edited there and never defined in `AGENTS.md` or an instruction section. (binding: `/git-flow-master`)

`git_strategy.strategy` ships as `solo-main`, not null. That is a default, not a decision, and `meta.strategy_source: inherited` records the difference. `git-flow-master` offers "Strategy Setup" when a project has filled in its `project_name` while `strategy_source` is still `inherited`, which is a real project running a strategy nobody chose. `bun sync` freezes `.agents/project.yaml` (updater `bootstrapOnlyPaths`), so every project keeps its own. Downstream test-automation projects typically choose `sdet` (chained suites; `.agents/skills/git-flow-master/references/sdet-integration-trunk.md`).

A repository's own reading of its strategy, including why it chose it and any divergence it accepted in `git_strategy.policy.accepted_divergences`, is project prose. It lives in the project-owned `.agents/instructions/agent-project.md` under `## Git Strategy (this repository)`, never in this synced section.

### Accepted divergences (mechanism)

An intended disagreement between the yaml and the host is declared in `git_strategy.policy.accepted_divergences` (`.agents/project.yaml`), one entry per `verify` finding field, with a reason. That entry, not prose, is what `bun run git:policy verify` reads.

- `verify` reports an accepted entry under `ACCEPTED` and exits 0, and warns if the entry goes stale (no matching drift). It runs in the pre-push hook and in `bun run repo:check`, and only unaccepted drift blocks. An unreachable host warns and exits 0, since absence of data is not drift.
- `verify --stamp` records `meta.policy_source: accepted`, distinct from `verified`, which still means the host matches the yaml exactly.
- `bun run git:policy apply` keeps the host's side of accepted fields (an accepted `pull_request` rule is carried forward verbatim, not derived away). Read the dry run before `--yes`.

Mechanism doc: `.agents/skills/git-flow-master/references/ruleset-parity.md` §2b.
