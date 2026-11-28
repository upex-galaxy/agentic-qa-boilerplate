# Push and merge flows

Two policy keys decide who lets a change land: `git_strategy.policy.direct_push_to_protected` for a push straight to a protected branch, and `git_strategy.policy.merge_mode` for a PR into one. Both are read from `.agents/project.yaml`. A value the team chose keeps its meaning. When the value or the `git_strategy` block is missing, a direct push reads as `evidence` (the gate, the hook and `git:policy verify` agree), and `merge_mode` reads as `auto` in `git:policy verify` and as `manual` in `git:policy apply`.

## Policy values

| `direct_push_to_protected` | A direct push to a protected branch |
|---|---|
| `forbidden` | never; the change goes through a PR |
| `confirm` | ask the user before every push |
| `allowed` | push without asking and without a gate (a standing authorization) |
| `evidence` | push without asking, and only when the pre-push gate passes. On fail: no push, no question; fix and retry |

| `merge_mode` | A PR into a protected branch |
|---|---|
| `auto` | the agent runs `bun run git:policy verify --merge <base>` at PR open. Where the host requires the checks (the `forbidden` push preset), it runs `gh pr merge --auto --<method>` and GitHub merges when they pass, `edd/evidence` among them. Under the shipped default (push `evidence`, no required check on the host) the agent merges the PR itself, with `--match-head-commit` pinned to the head `verify --merge` read, once every contract check is green there; nobody on the host enforces it. No approval required |
| `human-approves` | the same call; the ruleset requires approvals, so GitHub merges after a person approves. Where nothing on the host requires the approval, `verify --merge` lets the agent merge only after it reads a person's approval on the PR |
| `manual` | the agent stops after opening the PR and a person merges |

The method is a merge commit unless `git_strategy.decisions.feature_merge` declares another. A squash folds the evidence commit into a message body: the signature and the binding to the diff are lost.

## Flow 1: direct push

For a strategy with one long-lived branch and policy `evidence`.

```
code commits -> depth >= light? --yes--> agentic run (tester) -> bun run edd attest -> git push
                     | no                                                           |
                     +------------------------------------------------------------->+
                                                                                    v
            pre-push gate: bun run edd gate --fail--> push refused, record written, fix forward
                     | pass: record written
                     v
            remote branch updated -> CI on push (static + verify --ci) --red--> fix-forward commit
```

| Step | Actor | Gate | On failure |
|---|---|---|---|
| commit | author | the repo's commit hooks | a new commit after the fix, never an amend |
| agentic run | tester: a subagent or another session, never the author at depth `standard` or deeper | none | nothing to attest |
| attest | the script | binding and artifact checks | exits non-zero, creates nothing |
| push | author | the pre-push gate re-runs the `pre-push` static checks (it trusts no cached result) and verifies the evidence commit when depth asks for one | push refused |
| after the push | CI | the push workflow | fix forward; pushed history is never rewritten |

The host must allow the direct push: no PR rule on that branch, or a declared bypass.

## Flow 2: feature branch and PR

In a public repository GitHub runs `pull_request_target`, the trigger of the `edd/evidence` verifier, only where an Actions event policy allows it. A repository admin allows it for `.github/workflows/evidence.yml` (Settings > Actions > Policies, an active policy that restricts the events of that workflow to `pull_request_target`). `bun run git:policy verify` and the `setup` preflight report whether it may run.

```
branch -> commits -> agentic run -> attest -> push branch -> gh pr create
  -> bun run git:policy verify --merge <base>
       --host requires the checks--> gh pr merge --auto --<method>   (auto, human-approves)
       --nothing required, all green--> gh pr merge --<method> --match-head-commit <sha>, now
       --red or pending--> wait (watcher), fix, run it again
  -> arm the PR watcher (waiting.md)
  -> CI: static jobs + edd/evidence --red--> wake: fix, re-attest if the diff changed, push
  -> [human-approves] review --changes requested--> wake: address, push, re-attest
  -> GitHub merges -> wake: WATCH ENDED (MERGED) -> confirm the merge commit is on the base
```

| Step | Actor | Gate | On failure |
|---|---|---|---|
| push the branch | author | the `pre-push` static subset; no agentic requirement on a non-protected branch | push refused |
| open the PR | author | the body carries the rendered evidence (`bun run edd render --pr`); labels and assignee set before review; a reviewer requested only under `human-approves` | |
| merge | author | `bun run git:policy verify --merge <base>` exits 0: auto-merge where the host requires the checks, the agent's own merge where it does not | red or pending: wait and fix. Host unreadable: stop and tell the person (human gate 10) |
| CI | Actions | required: the static jobs and `edd/evidence` | the watcher wakes the author |
| review bot, when `evidence.review.bot` is set | author | fix and answer each finding, up to `evidence.review.max_rounds` rounds | after the cap the finding goes to a person |
| merge | GitHub | the ruleset | |
| close-out | author | `git fetch`, then `git merge-base --is-ancestor <merge-commit> origin/<base>` | report the discrepancy |

**The auto-merge trap.** `gh pr merge --auto` on a PR that GitHub already considers mergeable merges it at once. On a base that requires no check, "auto-merge" means "merge now, red or not". That is why `verify --merge` comes first. A base that requires no check (the shipped default, a stacked PR on another feature branch, an unprotected trunk) never gets `--auto`: the author waits through the watcher until `verify --merge` reads every contract check green on the head, then runs `gh pr merge --<method>`.

## Flow 3: chained or integration-trunk PRs

| Hop | Base | Evidence | Merge |
|---|---|---|---|
| each ticket PR | the integration trunk | its own static CI and its own attest | `--auto` only when the trunk carries a ruleset with the required checks; otherwise the author merges after green |
| final PR | the protected branch | static CI on the trunk tip plus a fresh attest at the tip, at the highest depth of the children; the children's evidence commits stay in the range | the protected branch's `merge_mode`, with a merge commit |
| stacked PRs straight to the protected branch | the protected branch, each | each its own attest | in order; open the next one only after the previous one merged |

## When a PR changes under you

| Event | Act |
|---|---|
| a required check fails | fix commit; re-attest if the patch-id changed; push |
| the branch falls behind or conflicts | merge the base in (never rebase a pushed branch); re-attest only if the patch-id changed |
| auto-merge was disabled | run `verify --merge` again and merge the way it says |
| someone else pushed | read what they pushed before acting; their commit needs its own evidence |
