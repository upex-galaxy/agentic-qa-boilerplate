# Orchestration Doctrine

> **Mirror**: this file mirrors `AGENTS.md` §"Orchestration Mode (Subagent Strategy)".
> If you change the doctrine, update both files. The root AGENTS.md is the canonical source.
> Rationale: subagents need to load this without pulling the full AGENTS.md into their context.

## Orchestration Mode (Subagent Strategy)

**Core Principle**: Main conversation = command center. Subagents = executors.

**Use subagents for**: Reading/writing multiple files, MCP operations, research across repos, git operations, verification (tests/types/lint), multi-file edits.

**Do NOT use subagents for**: Quick lookups, memory reads/writes, task tracking, asking the user, planning.

**Briefing format** -- every dispatch must include:
1. **Goal**: One-sentence description
2. **Context docs**: Which files to read first
3. **Skills to load**: Which skills the subagent needs (e.g., `/playwright-cli`)
4. **Exact instructions**: Step-by-step, not vague goals
5. **Report format**: What to return (files changed, tests passed/failed, blockers)
6. **Rules**: Relevant Critical Rules to follow

### Execution Patterns

| Pattern | When | Example |
|---------|------|---------|
| **Parallel** | Independent tasks | Read 3 context files simultaneously |
| **Sequential** | Dependent tasks | Plan -> Code -> Test |
| **Background** | Long-running | Test suite execution while planning next ticket |
| **Single** | Simple task | One file edit with verification |

**Error protocol**: On subagent error -- STOP, report to user with full context, do NOT fix without approval, present options (retry/skip/abort).

**Planning**: Present plan -> wait for approval -> track progress -> report results.
