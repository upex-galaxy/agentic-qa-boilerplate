---
id: orchestration-detail
title: 'Orchestration detail'
load_when: 'choosing an executor, dispatch patterns, a supervised worker or fleet, value provenance, fail-closed gates, session material in a dispatch, workflow-skill compliance'
triggers: ['\bsubagent', '\bdispatch', '\bworkers?\b', '\bfleet\b', '\borchestrat', '\bgate\b', '\bevidence\b', '\bHAR\b', '\btrace\b', '\bstage_owner\b']
paths: []
---

# Orchestration detail

> The orchestration core (command center, when to use subagents, the 7-component briefing, rule reachability, error protocol) is `AGENTS.md` §3. This file holds the rest.

## 3. ORCHESTRATION MODE: DETAIL

### TWO EXECUTORS

The default executor is the one-shot subagent, and nothing below changes that. The second, optional executor is the supervised worker: a persistent agent session coordinated through `/agent-orchestration` (a user-level skill) over a conductor and worker mailbox. It needs the orchestration binary and a reachable runtime. When either is missing the repo says nothing about it and the work runs on subagents plus the `launch.txt` lines a human pastes, so a workflow skill never names the worker to the user when the gate fails. The one exception is `/sprint-conductor`, which exists to run on workers and stops with one line when the gate fails.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask, reply and send at any moment, both ways |
| Git | the orchestrator's index | own worktree, or the shared checkout under declared file ownership |
| Best for | reading, mapping, verifying; one-shot tasks | writing and integrating alone, a whole story, work the owner wants to step into |

The conductor keeps its own reads and verifications on subagents, which keeps the coordinating context clean. A worker earns its cost when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Doctrine: `agentic-qa-core/references/orchestration-doctrine.md`; transport: `/agent-orchestration`; this repo's fleet parts: `agentic-qa-core/references/fleet-launch-seam.md`, `fleet-provisioning.md`, `fleet-project-profile.md`.

### EXECUTION PATTERNS

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan, Code, Test |
| Background | Long-running | Test suite while planning the next ticket |
| Single | Simple task | One file edit plus verification |

### VALUE PROVENANCE

Rule #11 (scripts come from `package.json`) covers every project value. A claim about this project's configuration (an env URL, a Jira field id or transition slug, a git policy, a `playwright.config.ts` setting, a TMS modality) names the file it was read from, in the same turn. A value seen in a skill reference, a template, a worked example or another project's file is illustrative, so it is not reported, briefed or tested against as this project's state. It composes with Rule #16 (verify at the destination) and Rule #17 (prose names the source).

### FAIL-CLOSED GATES

A gate that opens on a value the gated agent wrote itself (a label it added, a failure class it picked) is open by construction. A QA gate opens only on evidence cited next to the value: the work product itself, or something the agent cannot mint in the same run (a synced Jira body, a log line, CI run ids, an issue key that predates the run). A marker claiming the work happened is not evidence. The actor must also be allowed to decide it; a decision owned by another stage or a person (`stage-gates.md`, "person signs") gets only the closed value from the agent. Missing, empty or self-made evidence means the closed value: the full flow runs and the failure counts as REGRESSION. Canon and the QA gates written this way: `agentic-qa-core/references/orchestration-doctrine.md`.

### SESSION MATERIAL IN A DISPATCH

QA logs in on purpose, so its sanctioned store is `.auth/` (gitignored, `chmod 600`, one writer per fleet: `agentic-qa-core/references/browser-sessions.md` §3, §7), and session scratch or the evidence folder is not that store. A dispatch that logs in, loads a state file, captures traffic (HAR, trace, network log) or dumps a database returns `secrets_materialized` and `cleaned` in its report (`agentic-qa-core/references/briefing-template.md` component 6). Material left outside `.auth/` is a blocker the orchestrator surfaces. It is never echoed into a report, plan, commit, PR or tracker comment, and a trace or HAR is attached as evidence only after scrubbing (`agentic-qa-core/references/evidence-conventions.md` §1). binding: `/sprint-testing`

### Workflow skill compliance

Every skill marked `metadata.stage_owner: true` in its frontmatter has a `## Subagent Dispatch Strategy` section built on the 7-component briefing, and closes its final stage per `agentic-qa-core/references/session-footer-contract.md`. Every other skill (reference, utility, generator) is exempt. `.agents/skills/REGISTRY.md` lists which skills carry the flag. (enforced: `bun run skills:check`, check `STAGE-OWNER-DISPATCH`)

Deep detail that a subagent can cache lives in `.agents/skills/agentic-qa-core/references/` (`briefing-template`, `dispatch-patterns`, `orchestration-doctrine`).
