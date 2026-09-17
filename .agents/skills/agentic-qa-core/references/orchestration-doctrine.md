# Orchestration Doctrine

> **Mirror**: this file mirrors `AGENTS.md` §3 "Orchestration Mode — Permanently Active".
> If you change the doctrine, update both files. The root AGENTS.md is the canonical source.
> Rationale: subagents need to load this without pulling the full AGENTS.md into their context.

## Orchestration Mode — Permanently Active

> **Main conversation = command center. Subagents = executors.** Active EVERY session. Not optional.

**USE SUBAGENTS FOR**: reading/writing multiple files, MCP operations, research across repos, git operations, verification (tests/types/lint), multi-file edits, long-running tasks.

**DO NOT USE SUBAGENTS FOR**: quick lookups, memory reads/writes, task tracking, asking user, planning.

**TWO EXECUTORS**: one-shot subagents are the DEFAULT and nothing below changes for them. A second, OPTIONAL executor exists: the **supervised worker** — a persistent agent session coordinated through `/orca-orchestration` (conductor ↔ worker mailbox), gated on the orchestration binary AND a reachable runtime. When the gate fails the repo says NOTHING about it and the work runs on subagents plus the launch lines a human pastes.

| | One-shot subagent (default) | Supervised worker (optional) |
|---|---|---|
| Lifetime | inside the turn | until it is explicitly closed |
| Context | lost when it reports | persists; you keep talking to it |
| Communication | none until it finishes | ask / reply / send at any moment, both ways |
| Git | the orchestrator's index | own worktree, or the shared checkout under declared file ownership |
| Best for | reading, mapping, verifying; one-shot tasks | writing + integrating alone, a whole story, work the owner wants to step into |

The conductor keeps using SUBAGENTS for its own reads and verifications — that is what keeps the coordinating context clean. A supervised worker is warranted when the unit of work is a whole scope (one story, one module) that writes and integrates by itself. Every action on a worker is written as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode; the HOW lives in `orca-orchestration/references/coordinator-playbook.md` and `orca-orchestration/references/worker-contract.md`.

**7-COMPONENT BRIEFING (MANDATORY every dispatch)**:

1. **Goal** — one sentence
2. **Context docs** — files to read first
3. **Project Standards (auto-resolved)** — compact rules pulled from `.agents/skills/REGISTRY.md` (built by `bun run skills:registry`). Subagents trust these as authoritative for listed conventions and DO NOT re-read full SKILL.md unless explicitly told to. Protocol: `agentic-qa-core/references/skill-resolver.md`
4. **Skills to load** — explicit (e.g. `/playwright-cli`)
5. **Exact instructions** — step-by-step, not vague goals
6. **Report format** — what to return (files changed, tests passed, blockers)
7. **Rules** — relevant Critical Rules to follow

**EXECUTION PATTERNS**:

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan → Code → Test |
| Background | Long-running | Test suite + plan next ticket |
| Single | Simple task | One file edit + verification |

**ERROR PROTOCOL**: On subagent error → STOP, report full context, DO NOT fix without approval, offer retry/skip/abort.

**WORKFLOW SKILL COMPLIANCE**: `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development` MUST have a `## Subagent Dispatch Strategy` section using the 7-component briefing. Reference / utility / generator skills are EXEMPT (no dispatch table needed): `agentic-qa-core`, `agentic-qa-onboard`, `acli`, `xray-cli`, `playwright-cli`, `playwright-best-practices`, `project-discovery`, `project-context`, `sync-ai-context`, `adapt-framework`, `jira-administration`, `git-flow-master`.

**DEEP DETAIL** (further references):

- `.agents/skills/agentic-qa-core/references/briefing-template.md` — 7-component briefing examples per pattern
- `.agents/skills/agentic-qa-core/references/dispatch-patterns.md` — when to Single / Parallel / Sequential / Background
