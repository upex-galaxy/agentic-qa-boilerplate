# Ruleset parity: the declared strategy and the enforced host, in one shape

`git_strategy` in `.agents/project.yaml` says what the team decided. The host says what is actually enforced. This file owns the mapping between them and the tool that reconciles it: `bun run git:policy`.

> Why a tool and not a procedure: a script performs every query on every run, which prose cannot guarantee.


## 1. Commands

| Command | Reads host | Writes host | Writes yaml | Exit |
| --- | --- | --- | --- | --- |
| `bun run git:policy plan` | no | no | no | 0 |
| `bun run git:policy verify` | yes | no | no | 1 on unaccepted drift; 0 in parity, when every drift is ACCEPTED (§2b), when the host is unreachable or there is no GitHub origin (warned, not verified), or while `meta.strategy_source` is `inherited` (drift printed as warnings) |
| `bun run git:policy verify --stamp` | yes | no | `meta.policy_verified` + `policy_source` (`verified`, or `accepted` when accepted divergences exist) when clean | same |
| `bun run git:policy apply` | yes | no (dry run) | no | 0 / 1 (an unreachable host is fatal: an empty reading would derive a payload that drops every host rule) |
| `bun run git:policy apply --yes` | yes | yes | no | 0 / 1 |

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
| `pull_request` | omitted when `policy.direct_push_to_protected: allowed` | the `pull_request` rule is what blocks a direct push. Declaring `allowed` while shipping the rule is the contradiction this tool exists to catch, unless that exact divergence is listed in `policy.accepted_divergences` (§2b): then the host's rule is carried forward as-is. |
| `pull_request.required_approving_review_count` | `policy.require_pr_reviews` (`null` → `0`) | |
| `pull_request.require_code_owner_review` | derived from whether a `CODEOWNERS` file exists | never declared, see §3 |
| `pull_request.allowed_merge_methods` | `decisions.feature_merge` | `merge-commit`→`[merge]`, `squash`→`[squash]`, `rebase-merge`→`[rebase]`. On `n/a` the host's current value is preserved, because a non-decision must not widen what the repo permits. |
| `required_signatures`, `required_status_checks`, anything else | preserved from the existing ruleset | not derivable from `git_strategy`; dropping a guard the tool has no opinion about is a silent loosening |

### 2b. Accepted divergences: intended disagreement, formally declared

Sometimes both sides are right on purpose: this boilerplate declares `direct_push_to_protected: allowed` (how work actually lands: the admin credential is on the bypass list) while the host keeps a `pull_request` rule (protecting every non-bypass contributor). The pair is a decision to record, and there is no drift to fix.

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
- `apply` preserves the host's side of the accepted field instead of deriving its own (for `direct_push_to_protected`: the host's `pull_request` rule is carried forward verbatim), so applying never bulldozes an accepted divergence.

Acceptance is per field and needs a reason. It keeps the sign-off in the yaml, where `verify` reads it.


## 3. What this does not manage, on purpose

`bypass_actors`: real bypass entries need GitHub actor IDs (an org-admin role, specific user IDs). That is organisation identity, not project configuration, so it does not belong in a versioned per-project file that gets copied between repos. `verify` reports the bypass list; `apply` omits the field on update so the host keeps whatever is configured, and seeds an org-admin entry only when creating a ruleset from scratch on a project that declared `admin_bypass: true`.

`CODEOWNERS`: the tool derives `require_code_owner_review` from whether the file exists rather than reading it from yaml. Turning that flag on without the file produces a requirement nobody outside the bypass list can satisfy. The merge is refused and the only way through is a bypass, which is worse than no rule. `verify` reports that combination as drift with a named remedy.

Organisation-level rulesets: org-level rulesets may be unavailable on the repo's plan (`GET /orgs/{org}/rulesets` answers `403` there), so the unit of configuration here is the repository. A team that later gets org rulesets should treat this tool as the per-repo layer beneath them.

Classic branch protection: `verify` reads it, because a `404` on `branches/{b}/protection` means "not configured through that mechanism", never "unprotected". `apply` does not write it, because mixing both mechanisms on one branch produces a union nobody can reason about.


## 4. The loosening guard

`apply` refuses, unless `--allow-loosening` is passed, any change that:

- removes a `deletion`, `non_fast_forward`, or `required_signatures` rule;
- removes the `pull_request` rule entirely (direct pushes become possible);
- lowers `required_approving_review_count`;
- turns off `require_code_owner_review`;
- permits a merge method the host forbids.

A tool that can silently open `main` is a worse problem than the drift it fixes. Some of these changes are legitimate (turning off an unsatisfiable code-owner requirement, for instance), so the flag exists, and each one has to be asked for.


## 5. When to run which

`verify` on the first push, PR or merge intent of a session. This is Step 1b, executable. It is read-only and cheap. `--stamp` records the reconciliation so later operations know how far the yaml can be trusted.

`apply` right after Strategy Setup, and after any deliberate change to `git_strategy.policy`. Always read the dry run before passing `--yes`.

`verify` also runs automatically: the pre-push hook and `bun run repo:check` both invoke it, so unaccepted drift blocks a push. An unreachable host warns and exits 0 there (§1).

Read a `verify` failure before running `apply`. Drift has three resolutions and only one of them changes the host: the yaml may be the wrong side, or the divergence may be intended, in which case record it in `git_strategy.policy.accepted_divergences` (§2b) with a reason, and summarize the WHY in the project's own `.agents/instructions/agent-project.md` → `## Git Strategy (this repository)` if it needs prose context.

`apply --yes` writes to the host, an outward action. With a person present, show the dry run and get a yes. A supervised worker leaves the yes to its conductor. A routine runs `verify` and the dry run, then stops and reports unless the delegating brief names the `apply`; `--allow-loosening` always needs a person or a brief that names it (`agentic-qa-core/references/decision-protocol.md`).


## 6. Worked example: the drift this tool was built from

The boilerplate declared, and the host enforced:

```
require_pr_reviews:         declared 0        enforced 1
direct_push_to_protected:   declared allowed  enforced blocked (pull_request rule)
require_code_owner_review:  n/a               enforced true, with no CODEOWNERS anywhere
```

The first was fixed in the yaml (the host was right). The second is INTENDED on both sides and was later formalized as an accepted divergence (§2b): `allowed` describes how work lands via the bypass list, the host rule protects everyone else. The third was fixed on the host: with no `CODEOWNERS` file the requirement was unsatisfiable, so every merge had to bypass the ruleset. With no flag, `apply` refused the change until `--allow-loosening` was passed, printed the payload first, preserved `required_signatures` and the `[merge]`-only method list, and left the bypass list untouched.
