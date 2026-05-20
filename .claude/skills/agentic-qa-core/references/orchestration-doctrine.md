# Orchestration Doctrine

> **Mirror**: this file mirrors `CLAUDE.md` §3 "Orchestration Mode — Permanently Active".
> If you change the doctrine, update both files. The root CLAUDE.md is the canonical source.
> Rationale: subagents need to load this without pulling the full CLAUDE.md into their context.

## Orchestration Mode — Permanently Active

> **Main conversation = command center. Subagents = executors.** Active EVERY session. Not optional.

**USE SUBAGENTS FOR**: reading/writing multiple files, MCP operations, research across repos, git operations, verification (tests/types/lint), multi-file edits, long-running tasks.

**DO NOT USE SUBAGENTS FOR**: quick lookups, memory reads/writes, task tracking, asking user, planning.

**6-COMPONENT BRIEFING (MANDATORY every dispatch)**:

1. **Goal** — one sentence
2. **Context docs** — files to read first
3. **Skills to load** — explicit (e.g. `/playwright-cli`)
4. **Exact instructions** — step-by-step, not vague goals
5. **Report format** — what to return (files changed, tests passed, blockers)
6. **Rules** — relevant Critical Rules to follow

**EXECUTION PATTERNS**:

| Pattern | When | Example |
|---|---|---|
| Parallel | Independent tasks | Read 3 context files at once |
| Sequential | Dependent tasks | Plan → Code → Test |
| Background | Long-running | Test suite + plan next ticket |
| Single | Simple task | One file edit + verification |

**ERROR PROTOCOL**: On subagent error → STOP, report full context, DO NOT fix without approval, offer retry/skip/abort.

**WORKFLOW SKILL COMPLIANCE**: `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development` MUST have a `## Subagent Dispatch Strategy` section using the 7-component briefing. Reference / utility / generator skills are EXEMPT (no dispatch table needed): `agentic-qa-core`, `agentic-qa-onboard`, `acli`, `xray-cli`, `playwright-cli`, `playwright-best-practices`, `project-discovery`, `adapt-framework`, `git-flow-master`, `business-data-map`, `business-feature-map`, `business-api-map`, `master-test-plan`, `break-down-tests`, `fix-traceability`, `sync-ai-memory`.

**DEEP DETAIL** (further references):

- `.claude/skills/agentic-qa-core/references/briefing-template.md` — 6-component briefing examples per pattern
- `.claude/skills/agentic-qa-core/references/dispatch-patterns.md` — when to Single / Parallel / Sequential / Background
