---
name: edd
description: "Evidence-Driven Delivery doctrine: the agent commits, pushes and merges on its own once the project's required evidence passes. Use when delivering a change by direct push or pull request; waiting on a PR until it merges; deciding what still needs a person."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: core
---

# EDD: Evidence-Driven Delivery

The agent delivers a change by itself, from commit to merge, once the checks the project requires have passed. A person reads the evidence those checks produced, not the diff. Nobody approves a push or a merge by hand unless the project declared that it wants to.

This file is the doctrine and fits any repository, application code or test code: the project's contract decides which checks exist. The operations (branch, commit, push, open a PR) belong to the repo's git skill, which loads this one. The gate is the `bun run edd` command; this skill describes what it decides, never how it is coded.

## Vocabulary

| Term | Meaning |
|---|---|
| check | one verification a tool runs, with an outcome a machine reads (exit code, conclusion) |
| static level | checks on the code alone: format, lint, types, unit and integration tests, scans. Re-runnable anywhere, authoritative in CI |
| agentic level | an agent exercises the behaviour end to end against a real environment with real tools, like a tester would. Runs locally and produces artifacts |
| depth | how much agentic checking a change needs, computed from the paths it touches: `none`, `light`, `standard`, `deep` |
| evidence | what the checks leave for a person: outcomes plus artifacts (logs, traces, screenshots, transcripts) |
| contract | the `evidence:` block of `.agents/project.yaml`: which checks, at which depth, where they run |
| record | one JSON file per push, written by the gate, never by the agent |
| evidence commit | an empty signed commit that `bun run edd attest` puts on top of the code; its message carries the agentic results and binds them to the exact diff |
| author session | the session that wrote the change, named by the `Session:` trailer of its commits |
| reviewer session | any other session that reads the evidence and gives a verdict. Never the author |

## Compact Rules

- Deliver on evidence: under `git_strategy.policy.direct_push_to_protected: evidence`, push without asking when the pre-push gate passes; under `merge_mode` `auto` or `human-approves`, enable auto-merge at PR open. The gate's verdict is the decision. A failed gate means no push and no question: fix forward and retry.
- Only the gate writes the record (`bun run edd gate` before a push, `bun run edd verify --ci` in CI), and only `bun run edd attest` creates the evidence commit. Never write either by hand, never edit one after the fact.
- Depth may be raised (`--depth`), never lowered, and no required check is skipped. A check that cannot run (environment down, tool missing) is reported and the delivery waits; lowering depth means editing the contract, which is a change like any other.
- At depth `standard` or deeper, the agentic verdict comes from a session other than the author: a subagent with fresh context or another session, under a label that differs from the author's `Session:` trailer. The label is self-declared, so this guards against honest mistakes, not against a dishonest agent. The author reading its own evidence is not a review.
- Before `gh pr merge --auto`, run `bun run git:policy verify --merge <base>`, because on a base that requires no check auto-merge merges at once, red or not. A protected base that fails it: stop and tell the person. A base with no ruleset at all (a stacked PR, an unprotected trunk): skip `--auto`, wait for `edd/evidence` to pass, then merge.
- Merge with a merge commit unless the repo declares another method in `git_strategy.decisions.feature_merge`. A squash folds the evidence commit into a message body and loses its signature.
- Watch your own PR from the moment it opens until it merges, with the bundled watcher (`references/waiting.md`). It ends itself on MERGED or CLOSED after one last event; then confirm the merge commit is an ancestor of the base.
- A change to the gate itself (workflows, hooks, the evidence script, the contract, the policy) is delivered like any other change. It takes depth `standard` or deeper, the record flags it as `touches_gate` for the reader, and a repo on `human-approves` lists those paths in CODEOWNERS so a person reviews them there. Nothing else stops it.
- People hear from you two ways: the PR announcement posts on its own from the announcement template, wherever `notify.provider` in `.agents/project.yaml` points (`none` posts nothing); every other message to a person is a Slack draft the owner reviews and sends.
- Ask a person only for the closed list in `references/human-gates.md`. Everything outside it is the agent's call.
- No policy relaxes the git invariants: no force push, no `--no-verify`, no rewrite of pushed history, no remote branch deletion without confirmation.

## How a delivery runs

The branching strategy in `git_strategy` picks one of three flows. `references/flows.md` has each one as a sequence, with who acts, what gates it and what happens on failure.

| Strategy shape | Flow | What a person does |
|---|---|---|
| one long-lived branch, direct push | code commits, agentic run when depth asks for one, attest, push; the pre-push gate decides; CI re-checks after the push | reads the record when they want to |
| feature branch, PR into a protected branch | push the branch, open the PR, enable auto-merge, watch; GitHub merges when the required checks pass | approves, only under `human-approves` |
| chained or integration-trunk PRs | each hop has its own evidence; the final PR attests the trunk tip | the same as the PR flow |

## What the evidence proves

The gate catches mistakes and drift: a red check, evidence for another diff, a contract weakened by the change it judges, an author testing its own work. It does not stop an agent that deliberately forges a check. A PR can add its own workflow that posts a green `edd/evidence`, and GitHub cannot tell it from the real verifier because both come from the same Actions app. Nor can the signature prove the agentic test happened the way the agent says. The upgrade that closes the forged-check gap is a dedicated GitHub App as the only source of `edd/evidence`. `references/record-and-signature.md` states both halves. `references/record-and-signature.md` states both halves and what covers the gap.

## References

| Read | When |
|---|---|
| `references/contract.md` | declaring or reading checks, depth rules, skill fragments, the `evidence:` keys |
| `references/record-and-signature.md` | reading a record, attesting, judging what a delivery proves |
| `references/flows.md` | running a direct push, a PR or a chain; the policy values; the auto-merge trap |
| `references/waiting.md` | arming the PR watcher, the tab label, reviewer sessions, waiting on a person in Slack, drafting messages |
| `references/human-gates.md` | before asking a person anything about a delivery |
| `references/gotchas.md` | the watcher or the gate behaves unexpectedly |

## With nobody at the keyboard

A worker, a routine or a cloud session delivers exactly as an attended session does, because the gate is the decision and no step waits for a person. An item on the human-gates list goes to whoever launched the session, as a question with options, and the delivery of that change waits. Other work continues.
