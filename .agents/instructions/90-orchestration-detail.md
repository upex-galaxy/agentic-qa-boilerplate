---
id: orchestration-detail
title: 'Orchestration detail'
load_when: 'choosing an executor, dispatch patterns, a supervised worker or fleet, value provenance, fail-closed gates, session material in a dispatch, workflow-skill compliance'
triggers: ['\bsubagent', '\bdispatch', '\bworkers?\b', '\bfleet\b', '\bflota\b', '\borquest', '\borchestrat', '\bgate\b', '\bevidence\b', '\bHAR\b', '\btrace\b', '\bstage_owner\b']
paths: []
---

# Orchestration detail

> The orchestration core (command center, when to use subagents, the 7-component briefing, rule reachability, error protocol) is `AGENTS.md` §3. This file holds the rest.

## 3. ORCHESTRATION MODE: DETAIL

**TWO EXECUTORS.** One-shot subagents are the DEFAULT executor and nothing below changes that. A second, OPTIONAL executor exists: the **supervised worker** — a persistent agent session coordinated through `/orca-orchestration` (conductor ↔ worker mailbox). It is gated on the orchestration binary AND a reachable runtime; when either is missing the repo is SILENT about it and the work runs on subagents plus the `launch.txt` lines a human pastes. Never name it to the user from a workflow skill when the gate fails.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask / reply / send at any moment, both ways |
| Git | the orchestrator's index | own worktree, or the shared checkout under declared file ownership |
| Best for | reading, mapping, verifying; one-shot tasks | writing + integrating alone, a whole story, work the owner wants to step into |

The conductor keeps using SUBAGENTS for its own reads and verifications: that is what keeps the coordinating context clean. A supervised worker is warranted when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Doctrine: `agentic-qa-core/references/orchestration-doctrine.md`; transport: `/orca-orchestration`.

**EXECUTION PATTERNS**:

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan → Code → Test |
| Background | Long-running | Test suite + plan next ticket |
| Single | Simple task | One file edit + verification |

**VALUE PROVENANCE**: Rule #11 (scripts come from `package.json`) holds for EVERY project value. A claim about this project's configuration (an env URL, a Jira field id or transition slug, a git policy, a `playwright.config.ts` setting, a TMS modality) names the file it was read from, in the same turn. A value seen in a skill reference, a template, a worked example or another project's file is illustrative: never report it, brief it or test against it as this project's state. Composes with Rule #16 (verify at the destination) and Rule #17 (prose names the source).

**FAIL-CLOSED GATES**: a gate that opens on a value the gated agent wrote itself (a label it added, a failure class it picked) is open by construction. A QA gate opens only on EVIDENCE cited next to the value: the work product itself or something the agent cannot mint in the same run (a synced Jira body, a log line, CI run ids, an issue key that predates the run), never a marker claiming the work happened, and only for an actor allowed to decide it; a decision owned by another stage or a person (`stage-gates.md` "person signs") gets only the closed value from the agent. Missing, empty or self-made evidence = the closed value: the full flow runs, the failure counts as REGRESSION. Canon + the QA gates written this way: `agentic-qa-core/references/orchestration-doctrine.md`.

**SESSION MATERIAL IN A DISPATCH**: QA logs in on purpose, so its sanctioned store is `.auth/` (gitignored, `chmod 600`, one writer per fleet: `agentic-qa-core/references/browser-sessions.md` §3, §7), never the session scratch or the evidence folder. A dispatch that logs in, loads a state file, captures traffic (HAR, trace, network log) or dumps a database returns `secrets_materialized` and `cleaned` in its report (`agentic-qa-core/references/briefing-template.md` component 6); material left outside `.auth/` is a blocker the orchestrator surfaces. Never echo it into a report, plan, commit, PR or tracker comment, and never attach a trace or HAR as evidence unscrubbed (`agentic-qa-core/references/evidence-conventions.md` §1).

**WORKFLOW SKILL COMPLIANCE**: every skill marked `metadata.stage_owner: true` in its frontmatter (the stage-owning workflow skills) MUST have `## Subagent Dispatch Strategy` using 7-component briefing, AND close their final stage per `agentic-qa-core/references/session-footer-contract.md`. Every other skill (reference / utility / generator) is EXEMPT. `bun run skills:check` (`STAGE-OWNER-DISPATCH`) enforces the section on every flagged skill; `.agents/skills/REGISTRY.md` lists which skills carry the flag. (enforced: `bun run skills:check`)

**DEEP DETAIL** (subagent-cacheable) → `.agents/skills/agentic-qa-core/references/` (briefing-template, dispatch-patterns, orchestration-doctrine).
