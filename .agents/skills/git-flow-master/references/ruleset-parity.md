# Ruleset parity: the declared strategy and the enforced host, in one shape

`git_strategy` in `.agents/project.yaml` says what the team decided. The host says what is actually enforced. This file owns the mapping between them and the tool that reconciles it: `bun run git:policy`.

> Why a tool and not a procedure: a script performs every query on every run, which prose cannot guarantee.


## 1. Commands

| Command | Reads host | Writes host | Writes yaml | Exit |
| --- | --- | --- | --- | --- |
| `bun run git:policy plan` | no | no | no | 0 |
| `bun run git:policy verify` | yes | no | no | 1 on unaccepted drift; 0 in parity, when every drift is ACCEPTED (§2b), when the host is unreachable or there is no GitHub origin (warned, not verified), or while `meta.strategy_source` is `inherited` (drift printed as warnings) |
| `bun run git:policy verify --merge <base>` | yes | no | no | 1 unless `<base>` requires `edd/evidence` with an `integration_id` (§2c); fail-closed, an unreachable host is not a pass |
| `bun run git:policy verify --stamp` | yes | no | `meta.policy_verified` + `policy_source` (`verified`, or `accepted` when accepted divergences exist) when clean | same |
| `bun run git:policy apply` | yes | no (dry run) | no | 0, or 1 on a refusal: an unreachable host (an empty reading would derive a payload that drops every host rule), no GitHub Actions check run to read the `integration_id` from, a required context with no check run (§2c), or a loosening without `--allow-loosening` (§4) |
| `bun run git:policy apply --yes` | yes | yes | no | 0, or 1 on the same refusals or a failed write |
| `bun run git:policy migrate` | no | no | no (dry run) | 1 on the `setup` verdict or when the splice fails; 0 otherwise, `blocked` included (§2d) |
| `bun run git:policy migrate --yes` | no | no | `git_strategy.policy` only (§2d) | 1 on `setup`, `blocked`, a failed splice or a failed read-back; 0 otherwise |
| `bun run git:policy setup` | yes (GET only, for the plan and the admin preflight) | only through `apply --yes`, after an admin's explicit yes at a terminal; never with `--plan-only`, never non-interactive | `git_strategy` strategy, branches, `protected`, push and merge policy, `meta.strategy_source: chosen`, after a confirm (or `--write-policy`) | 0 when it finished, including the non-admin hand-off; 1 on a bad flag, a failed write or read-back, or a failed apply |

`apply` is a dry run by default. `--yes` is what writes. `--allow-loosening` is additionally required for any change that removes a guard or lowers the bar (see §4).

`verify` is hook-safe by design: it runs in the pre-push hook and inside `bun run repo:check`. An unreachable host (offline, no `gh`, no auth) warns and exits 0: absence of data is not drift, and a stale shell must not block pushing an unrelated change.


## 2. The mapping from `git_strategy` to ruleset

### Which branches the ruleset covers

Derived from the strategy shape, then unioned with whatever `protected:` already lists. An operator may protect more than the strategy implies; narrowing that silently would itself be a loosening.

| Strategy | Branches covered |
| --- | --- |
| `solo-main`, `github-flow`, `trunk-based` | `branches.production` |
| `main-integration`, `enterprise` | `branches.production` + `branches.integration` |
| `gitflow` | `branches.production` + `branches.integration` (default `develop`) |
| `gitlab-flow` | `branches.production` + `branches.integration` + `pre-production` |
| `sdet` | `branches.production` only: the per-suite trunk is ephemeral (`branches.ephemeral_pattern`) and `integration` is `null`. Protecting it would put ruleset friction on exactly the intermediate merges the strategy exists to keep frictionless. |

### Which rules get written

| Rule | Source | Notes |
| --- | --- | --- |
| `deletion` | always | every strategy protects against branch deletion |
| `non_fast_forward` | always | blocks force-push |
| `creation` | always | |
| `pull_request` | omitted when `policy.direct_push_to_protected` is `allowed` or `evidence` | the `pull_request` rule is what blocks a direct push. `evidence` maps to the host exactly like `allowed`: the gate that lets the push through is the pre-push evidence gate, not the host. A missing or null value reads as `evidence`, and `verify` reports the `<branch>.direct_push_to_protected` finding as a warning until the key is declared. Declaring either value while shipping the rule is the contradiction this tool exists to catch, unless that exact divergence is listed in `policy.accepted_divergences` (§2b): then the host's rule is carried forward as-is. |
| `pull_request.required_approving_review_count` | `policy.merge_mode`: `auto` → `0`; `human-approves` → `policy.require_pr_reviews` (at least `1`); `manual` → `policy.require_pr_reviews` (`null` → `0`) | see §2c |
| `pull_request.require_last_push_approval` | `human-approves` → `true`; `auto` and `manual` → `false` | in `human-approves` the agent cannot push after the approval |
| `pull_request.require_code_owner_review` | derived from whether a `CODEOWNERS` file exists | never declared, see §3 |
| `pull_request.allowed_merge_methods` | `decisions.feature_merge` | `merge-commit`→`[merge]`, `squash`→`[squash]`, `rebase-merge`→`[rebase]`. On `n/a` the host's current value is preserved, because a non-decision must not widen what the repo permits. |
| `required_status_checks` | managed, see §2c | contexts the contract names are written; host contexts the contract does not name are preserved |
| `required_signatures`, anything else | preserved from the existing ruleset | not derivable from `git_strategy`; dropping a guard the tool has no opinion about is a silent loosening |

### 2b. Accepted divergences: intended disagreement, formally declared

Sometimes both sides are right on purpose: a repo can declare `direct_push_to_protected: allowed` (how work actually lands: the admin credential is on the bypass list) while the host keeps a `pull_request` rule (protecting every non-bypass contributor). The pair is a decision to record, and there is no drift to fix.

Declare it in `.agents/project.yaml`:

```yaml
git_strategy:
  policy:
    accepted_divergences:
      - field: main.direct_push_to_protected   # the verify finding's field, verbatim
        enforced: blocked (pull_request rule)  # what the host does (informational)
        accepted: 2026-08-21                   # when it was signed off
        reason: >
          Why both sides are intentionally different.
```

Effects:

- `verify` reports the matching finding under `ACCEPTED (n)` with its reason and exits 0. `--stamp` records `policy_source: accepted`, a distinct value (`verified` still means "host matches the yaml exactly").
- `verify` flags stale entries: an accepted divergence that no longer matches any drift is reported as a NOTE, so the list cannot accumulate dead exceptions.
- `apply` keeps the host's side only for an accepted `direct_push_to_protected`. It carries the host's `pull_request` rule forward verbatim instead of deriving its own, and `verify` then skips the approval comparison in `<branch>.merge_mode`. An accepted `merge_mode` or `required_checks` entry changes only what `verify` reports: `apply` still derives those settings from the yaml.

Acceptance is per field and needs a reason. It keeps the sign-off in the yaml, where `verify` reads it.


### 2c. Merge mode and required checks

`policy.merge_mode` decides who merges a PR into a protected branch and what the host must require for that to be safe. In `verify`, a missing or null value reads as `auto`, and the findings below are warnings until the key is declared. `apply` and `plan` derive an undeclared mode as `manual`: no `allow_auto_merge`, no managed required checks, and approvals from `policy.require_pr_reviews`. `apply` prints one line saying so; declaring `git_strategy.policy.merge_mode` opts in.

While the mode is undeclared, `verify` also keeps comparing `policy.require_pr_reviews` with the host's approvals (`<branch>.require_pr_reviews`). Once `auto` or `human-approves` is declared, the approval count belongs to `<branch>.merge_mode` and that comparison stops.

| Setting | `auto` | `human-approves` | `manual` |
| --- | --- | --- | --- |
| repo `allow_auto_merge` | `true` | `true` | unchanged |
| `pull_request.required_approving_review_count` | `0` | `policy.require_pr_reviews` (at least `1`) | `policy.require_pr_reviews` (`null` → `0`) |
| `pull_request.require_last_push_approval` | `false` | `true` | `false` |
| `required_status_checks` | managed | managed | preserved |

`required_status_checks` is derived only for `auto` and `human-approves`, and only when the branch is PR-gated or `policy.admin_bypass` is `true`. The contexts are `edd/evidence` plus every contract static check whose `where` includes `ci` (`evidence.static[].id`). Contexts already on the host that the contract does not name are kept. `strict_required_status_checks_policy` stays as the host has it and defaults to `false`.

The repo-settings patch writes `allow_auto_merge` only in the same call that sets `required_status_checks`. Auto-merge on a base that requires no check is the failure mode: `gh pr merge --auto` finds the PR immediately mergeable and merges it at once, red or not.

Each required check carries an `integration_id`. `apply` reads it from the check runs on `branches.production`: the app id of the latest `edd/evidence` run posted by GitHub Actions (app slug `github-actions`), or of any GitHub Actions run when there is no such `edd/evidence` run. An `edd/evidence` run posted by another app is never used. With no GitHub Actions run at all, `apply` refuses and says why.

From the same check runs, `apply` also confirms that every required context has reported at least once. A required check that never reports blocks every merge, so when a context has no check run with its name, `apply` refuses before any write and lists the missing names.

`verify` adds three findings, all warnings while `merge_mode` is undeclared:

| Finding | Compares |
| --- | --- |
| `<branch>.merge_mode` | `allow_auto_merge`, approval count and last-push approval against the mode |
| `<branch>.required_checks` | required contexts and their `integration_id` against the contract |
| `repo.allowed_merge_methods` | the repo's `allow_*_merge` flags against `decisions.feature_merge` |

`verify --merge <base>` is the guard the PR flow calls before every `gh pr merge --auto`. It exits 1 unless `<base>` requires `edd/evidence` with an `integration_id`, and an unreachable host fails it too, because a missing answer must not enable a merge.

### 2d. Migrating an existing repo

`migrate` rewrites only `git_strategy.policy`, in place. It does not touch the host and it is a dry run until `--yes`. The updater does not edit `.agents/project.yaml`, so this is the one path that moves an existing repo.

| Current declaration | Becomes | Why |
| --- | --- | --- |
| no `git_strategy` block, or no `strategy` | nothing: the `setup` verdict, exit 1 | there is no policy line to rewrite; run Strategy Setup first |
| `direct_push_to_protected` missing or null | nothing: the `none` verdict | it already reads as `evidence` |
| `meta.strategy_source: inherited` | `evidence` + `merge_mode: auto` | nobody chose |
| `allowed` | `evidence` + `merge_mode: auto` | same no-ask push, plus the gate |
| `confirm` (chosen) | unchanged; a one-line offer to move to `evidence` | never change the meaning of a value a team chose |
| `forbidden` | unchanged; `merge_mode: auto` is offered | auto-merge changes who merges, so ask |

A rewrite to `evidence` needs the evidence gate, `bun run edd`: its script file under `scripts/` and the `edd` key in `package.json`. While either is missing, the rows that would rewrite get the `blocked` verdict instead, and its note names what is missing. The dry run prints that verdict and exits 0. `--yes` writes nothing and exits 1. The `confirm` offer also says the gate is missing.


## 3. What this does not manage, on purpose

`bypass_actors`: real bypass entries need GitHub actor IDs (an org-admin role, specific user IDs). That is organisation identity, not project configuration, so it does not belong in a versioned per-project file that gets copied between repos. `verify` reports the bypass list; `apply` omits the field on update so the host keeps whatever is configured, and seeds an org-admin entry only when creating a ruleset from scratch on a project that declared `admin_bypass: true`.

`CODEOWNERS`: the tool derives `require_code_owner_review` from whether the file exists rather than reading it from yaml. Turning that flag on without the file produces a requirement nobody outside the bypass list can satisfy. The merge is refused and the only way through is a bypass, which is worse than no rule. `verify` reports that combination as drift with a named remedy.

Organisation-level rulesets: org-level rulesets may be unavailable on the repo's plan (`GET /orgs/{org}/rulesets` answers `403` there), so the unit of configuration here is the repository. A team that later gets org rulesets should treat this tool as the per-repo layer beneath them.

Classic branch protection: `verify` reads it, because a `404` on `branches/{b}/protection` means "not configured through that mechanism", never "unprotected". `apply` does not write it, because mixing both mechanisms on one branch produces a union nobody can reason about.


## 4. The loosening guard

`apply` refuses, unless `--allow-loosening` is passed, any change that:

- removes a `deletion`, `non_fast_forward`, or `required_signatures` rule;
- removes the `pull_request` rule entirely (direct pushes become possible);
- lowers `required_approving_review_count`, including the move from `human-approves` to `auto`;
- removes a required status check, or a context from `required_status_checks`;
- turns off `require_last_push_approval`;
- turns off `require_code_owner_review`;
- permits a merge method the ruleset forbids;
- turns on a repo merge setting (`allow_merge_commit`, `allow_squash_merge`, `allow_rebase_merge`) that is off on the repo now.

A tool that can silently open `main` is a worse problem than the drift it fixes. Some of these changes are legitimate (turning off an unsatisfiable code-owner requirement, for instance), so the flag exists, and each one has to be asked for.


## 5. When to run which

`verify` on the first push, PR or merge intent of a session. This is Step 1b, executable. It is read-only and cheap. `--stamp` records the reconciliation so later operations know how far the yaml can be trusted.

`apply` right after Strategy Setup, and after any deliberate change to `git_strategy.policy`. Always read the dry run before passing `--yes`.

`verify` also runs automatically: the pre-push hook and `bun run repo:check` both invoke it, so unaccepted drift blocks a push. An unreachable host warns and exits 0 there (§1).

Read a `verify` failure before running `apply`. Drift has three resolutions and only one of them changes the host: the yaml may be the wrong side, or the divergence may be intended, in which case record it in `git_strategy.policy.accepted_divergences` (§2b) with a reason, and summarize the WHY in the project's own `.agents/instructions/agent-project.md` → `## Git Strategy (this repository)` if it needs prose context.

`apply --yes` writes to the host, an outward action. Writing host protection is a human gate (`.agents/skills/edd/references/human-gates.md`): with a person present, show the dry run and get a yes. A supervised worker sends the question, with the dry run, to its launcher. A routine runs `verify` and the dry run, then stops and reports unless the delegating brief names the `apply`; `--allow-loosening` always needs a person or a brief that names it (`agentic-qa-core/references/decision-protocol.md`).


## 6. Worked example: the drift this tool was built from

The boilerplate declared, and the host enforced:

```
require_pr_reviews:         declared 0        enforced 1
direct_push_to_protected:   declared allowed  enforced blocked (pull_request rule)
require_code_owner_review:  n/a               enforced true, with no CODEOWNERS anywhere
```

The first was fixed in the yaml (the host was right). The second is INTENDED on both sides and was later formalized as an accepted divergence (§2b): `allowed` describes how work lands via the bypass list, the host rule protects everyone else. The third was fixed on the host: with no `CODEOWNERS` file the requirement was unsatisfiable, so every merge had to bypass the ruleset. With no flag, `apply` refused the change until `--allow-loosening` was passed, printed the payload first, preserved `required_signatures` and the `[merge]`-only method list, and left the bypass list untouched.
