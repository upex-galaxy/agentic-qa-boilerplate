# Dispatch Patterns — Decision Guide

> Cited by: workflow skills' "Subagent Dispatch Strategy" tables.
> Pairs with: `framework-core/references/briefing-template.md` (the 6-component briefing format that every dispatch must follow).

## When to use each pattern

| Pattern    | Use when                                       | Typical subagent count | Anti-pattern                              |
|------------|------------------------------------------------|------------------------|-------------------------------------------|
| Single     | One contained task, isolates main context      | 1                      | Don't use for trivial 1-file edits        |
| Sequential | Stage B needs Stage A's output                 | 1 per stage            | Don't use when stages are independent     |
| Parallel   | N independent tasks, no dependencies           | 2-10                   | Don't fan out to >10 (rate limits)        |
| Background | Long-running task (>5 min) blocks main thread  | 1                      | Don't background tasks <5 min             |

## Heuristic

Pick the pattern by walking these gates in order. The first one that matches wins.

1. Is the work CPU-bound and short (<2 min) and reads/writes ≤2 files? → **inline** (no dispatch). Just call `Read`/`Edit` directly.
2. Long, blocking, monitorable from outside (e.g. `gh run watch`, a CI suite, a long build)? → **Background**.
3. N independent jobs of the same shape, where N > 1? → **Parallel** (fan out in one tool-call block).
4. Pipeline of stages where each stage consumes the previous stage's output? → **Sequential** (one dispatch per stage; feed Stage N's report into Stage N+1).
5. Single non-trivial task (touches 3+ files OR loads a heavy skill OR runs a multi-step verification) that benefits from isolating the orchestrator's context? → **Single**.

If two gates seem to fit, prefer the earlier one — it's more specific.

---

## Real examples in this repo

| Pattern    | Example skill / file                                                                                                  | What gets dispatched                                                                                          |
|------------|-----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Parallel   | `.claude/skills/regression-testing/SKILL.md` Phase 2 (Analyze) — artifact downloads after a CI run                    | 3 agents in parallel: `allure-results`, `playwright-report`, `evidence/`. Each scoped to one `gh run download`. |
| Background | `.claude/skills/regression-testing/SKILL.md` Phase 1 (Execute) — wait for the CI run to terminate                     | 1 agent blocking on `gh run watch <RUN_ID> --exit-status` for 20-60 minutes.                                  |
| Sequential | `.claude/skills/test-automation/SKILL.md` (Stage 5) — Plan → Code → Review                                            | 3 agents one at a time: Plan writes spec.md+implementation-plan.md, Code consumes them, Review verifies.       |
| Single     | `.claude/skills/sprint-testing/SKILL.md` Stage 1 — fetch+analyse one Jira ticket                                       | 1 agent that loads `/acli`, fetches the ticket, analyses ACs against `tests/` references, writes ATP draft.    |

When extending an existing skill, mirror the pattern of the closest sibling rather than inventing a new one. Consistency makes the orchestration legible.

---

## What NOT to do

- **Don't dispatch 1-file reads.** `Read` inline is faster and doesn't cost a sub-conversation slot. Subagent overhead only pays off when the agent does meaningful work (3+ files, a skill load, multi-step verification).
- **Don't Parallel-dispatch >10 agents to the same external API** (Jira, Xray, GitHub). The remote service rate-limits you, your orchestrator gets back a flood of 429s, and recovery is messy. Cap fan-out at 10. Above that, batch by chunking and Sequential the chunks.
- **Don't Background a task that's already <5 min.** Background carries a sleep cost: when you wake up after `delaySeconds > 300`, the prompt cache is gone and the next turn re-reads the full conversation. For tasks under 5 minutes, just wait inline (or Single-dispatch if you want context isolation).
- **Don't Sequential when Parallel works.** If A and B are truly independent, Parallel is strictly better — same wall-clock cost as the slowest one, vs sum-of-both for Sequential. The classic mistake is artificially Sequencing two reads that don't depend on each other.
- **Don't delegate planning.** The orchestrator owns decisions; subagents execute. A subagent that's allowed to "decide what to do next" will silently expand its scope and make the orchestrator's view of progress incoherent.
- **Don't fan out without a clear merge step.** Parallel agents return reports — the orchestrator must know what to do with N reports BEFORE dispatching them. If you can't articulate the merge, you don't have a Parallel job; you have a Sequential job pretending to be one.
- **Don't reuse a subagent across phases.** Each dispatch is a fresh agent. Treat the contract as one-shot: briefing in, report out. Carrying state across multiple dispatches is a code smell — the state should live in files the orchestrator owns, not in agent memory.
