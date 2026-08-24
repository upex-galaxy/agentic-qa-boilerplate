# Ruleset Parity — the declared strategy and the enforced host, kept in one shape

`git_strategy` in `.agents/project.yaml` says what the team decided. The host says what is actually enforced. This file owns the mapping between them and the tool that reconciles it: `bun run git:policy`.

> **Why a tool and not a procedure.** SKILL.md Step 1b has always specified this reconciliation in prose, for an agent to carry out by hand. It kept not happening. The boilerplate itself shipped `require_pr_reviews: 0` against a host demanding one approval plus a code-owner review, and nobody noticed until a merge was refused with `the base branch policy prohibits the merge`. A script performs every query on every run, which is the one property prose cannot guarantee.

---

## 1. Commands

| Command | Reads host | Writes host | Writes yaml | Exit |
| --- | --- | --- | --- | --- |
| `bun run git:policy plan` | no | no | no | 0 |
| `bun run git:policy verify` | yes | no | no | **1 on unaccepted drift**; 0 in parity, when every drift is ACCEPTED (§2b), or when the host is unreachable (warned, not verified) |
| `bun run git:policy verify --stamp` | yes | no | `meta.policy_verified` + `policy_source` (`verified`, or `accepted` when accepted divergences exist) when clean | same |
| `bun run git:policy apply` | yes | no (dry run) | no | 0 / 1 (unreachable host is fatal — an empty reading would derive a payload that drops every host rule) |
| `bun run git:policy apply --yes` | yes | **yes** | no | 0 / 1 |

`apply` is a dry run by default. `--yes` is what writes. `--allow-loosening` is additionally required for any change that removes a guard or lowers the bar (see §4).

`verify` is **hook-safe by design** — it runs in the pre-push hook and inside `bun run repo:check`. An unreachable host (offline, no `gh`, no auth) warns and exits 0: absence of data is not drift, and a stale shell must not block pushing an unrelated change.

---

## 2. The mapping — `git_strategy` to ruleset

### Which branches the ruleset covers

Derived from the strategy shape, then **unioned** with whatever `protected:` already lists. An operator may protect more than the strategy implies; narrowing that silently would itself be a loosening.

| Strategy | Branches covered |
| --- | --- |
| `solo-main`, `github-flow`, `trunk-based` | `branches.production` |
| `main-integration`, `enterprise` | `branches.production` + `branches.integration` |
| `gitflow` | `branches.production` + `branches.integration` (default `develop`) |
| `gitlab-flow` | `branches.production` + `branches.integration` + `pre-production` |
| `sdet` | `branches.production` only — the per-suite trunk is EPHEMERAL (`branches.ephemeral_pattern`) and `integration` is `null`. Protecting it would put ruleset friction on exactly the intermediate merges the strategy exists to keep frictionless. |

### Which rules get written

| Rule | Source | Notes |
| --- | --- | --- |
| `deletion` | always | every strategy protects against branch deletion |
| `non_fast_forward` | always | blocks force-push |
| `creation` | always | |
| `pull_request` | **omitted** when `policy.direct_push_to_protected: allowed` | the `pull_request` rule IS what blocks a direct push. Declaring `allowed` while shipping the rule is the exact contradiction this tool exists to catch — unless that exact divergence is listed in `policy.accepted_divergences` (§2b), in which case the host's rule is **carried forward as-is**. |
| `pull_request.required_approving_review_count` | `policy.require_pr_reviews` (`null` → `0`) | |
| `pull_request.require_code_owner_review` | **derived** from whether a `CODEOWNERS` file exists | never declared — see §3 |
| `pull_request.allowed_merge_methods` | `decisions.feature_merge` | `merge-commit`→`[merge]`, `squash`→`[squash]`, `rebase-merge`→`[rebase]`. On `n/a` the host's current value is **preserved**, because a non-decision must not widen what the repo permits. |
| `required_signatures`, `required_status_checks`, anything else | **preserved from the existing ruleset** | not derivable from `git_strategy`; dropping a guard the tool has no opinion about is a silent loosening |

### 2b. Accepted divergences — intended disagreement, formally declared

Sometimes BOTH sides are right on purpose: this boilerplate declares `direct_push_to_protected: allowed` (how work actually lands — the admin credential is on the bypass list) while the host keeps a `pull_request` rule (protecting every non-bypass contributor). That is not drift to fix; it is a decision to record.

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

- **`verify`** reports the matching finding under `ACCEPTED (n)` with its reason, exits 0, and `--stamp` records `policy_source: accepted` (a distinct value — `verified` still means "host matches the yaml exactly").
- **`verify` flags stale entries** — an accepted divergence that no longer matches any drift is reported as a NOTE so the list cannot accumulate dead exceptions.
- **`apply`** preserves the host's side of the accepted field instead of deriving its own (for `direct_push_to_protected`: the host's `pull_request` rule is carried forward verbatim), so applying never bulldozes an accepted divergence.

Acceptance is per-field and needs a reason. It is the yaml-native replacement for burying the sign-off in prose only this repo's `AGENTS.md` could hold.

---

## 3. What this deliberately does not manage

**`bypass_actors`.** Real bypass entries need GitHub actor IDs — an org-admin role, specific user IDs. That is organisation identity, not project configuration, and it must not live in a versioned per-project file that gets copied between repos. `verify` reports the bypass list; `apply` omits the field on update so the host keeps whatever is configured, and seeds an org-admin entry only when creating a ruleset from scratch on a project that declared `admin_bypass: true`.

**`CODEOWNERS`.** The tool derives `require_code_owner_review` from whether the file exists rather than reading it from yaml. Turning that flag on without the file produces a requirement **nobody outside the bypass list can ever satisfy** — the merge is refused, and the only way through is a bypass, which is strictly worse than no rule. `verify` reports that combination as drift with a named remedy.

**Organisation-level rulesets.** `GET /orgs/{org}/rulesets` returns `403 Upgrade to GitHub Team` on a Free plan, so the unit of configuration here is the repository. A team that later gets org rulesets should treat this tool as the per-repo layer beneath them.

**Classic branch protection.** `verify` READS it, because a `404` on `branches/{b}/protection` means "not configured through that mechanism", never "unprotected". `apply` never writes it: mixing both mechanisms on one branch produces a union nobody can reason about.

---

## 4. The loosening guard

`apply` refuses, unless `--allow-loosening` is passed, any change that:

- removes a `deletion`, `non_fast_forward`, or `required_signatures` rule;
- removes the `pull_request` rule entirely (direct pushes become possible);
- lowers `required_approving_review_count`;
- turns off `require_code_owner_review`;
- permits a merge method the host currently forbids.

A tool that can silently open `main` is a worse problem than the drift it fixes. The flag exists because some of these are legitimate and intended — turning off an unsatisfiable code-owner requirement, for instance — but each one has to be asked for.

---

## 5. When to run which

**`verify` on the first push / PR / merge intent of a session.** This is Step 1b, now executable. It is read-only and cheap. `--stamp` records the reconciliation so later operations know how far the yaml can be trusted.

**`apply` right after Strategy Setup**, and after any deliberate change to `git_strategy.policy`. Always read the dry run before passing `--yes`.

**`verify` also runs automatically**: the pre-push hook and `bun run repo:check` both invoke it, so unaccepted drift blocks a push instead of escaping out the back door. Unreachable host = warn + exit 0 there (see §1).

**Never `apply` to fix a `verify` failure you have not read.** Drift has three legitimate resolutions and only one of them is "change the host": the yaml may be the wrong side, or the divergence may be intended — in which case record it in `git_strategy.policy.accepted_divergences` (§2b) with a reason, and summarize the WHY in the project's `AGENTS.md` → `## Git Strategy` if it needs prose context.

---

## 6. Worked example — the drift this tool was built from

The boilerplate declared, and the host enforced:

```
require_pr_reviews:         declared 0        enforced 1
direct_push_to_protected:   declared allowed  enforced blocked (pull_request rule)
require_code_owner_review:  n/a               enforced true, with no CODEOWNERS anywhere
```

The first was fixed in the yaml (the host was right). The second is INTENDED on both sides and was later formalized as an accepted divergence (§2b) — `allowed` describes how work lands via the bypass list, the host rule protects everyone else. The third was fixed on the host: with no `CODEOWNERS` file the requirement was unsatisfiable, so every merge had to bypass the ruleset. `apply` refused the change until `--allow-loosening` was passed, printed the payload first, preserved `required_signatures` and the `[merge]`-only method list, and left the bypass list untouched.
