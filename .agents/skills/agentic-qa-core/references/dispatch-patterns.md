# Dispatch Patterns: Decision Guide

> Cited by: workflow skills' "Subagent Dispatch Strategy" tables.
> Pairs with: `agentic-qa-core/references/briefing-template.md` (the 7-component briefing format every dispatch follows).

## When to use each pattern

| Pattern    | Use when                                       | Typical subagent count | Anti-pattern                              |
|------------|------------------------------------------------|------------------------|-------------------------------------------|
| Single     | One contained task, isolates main context      | 1                      | Don't use for trivial 1-file edits        |
| Sequential | Stage B needs Stage A's output                 | 1 per stage            | Don't use when stages are independent     |
| Parallel   | N independent tasks, no dependencies           | 2-10                   | Don't fan out to >10 (rate limits)        |
| Background | Long-running task (>5 min) blocks main thread  | 1                      | Don't background tasks <5 min             |

## Heuristic

Walk these gates in order. The first one that matches wins, and when two seem to fit, take the earlier one because it is more specific.

1. Is the work CPU-bound and short (<2 min) and does it read or write 2 files or fewer? Stay **inline**: call `Read` / `Edit` directly, no dispatch.
2. Is it long, blocking and monitorable from outside (for example `gh run watch`, a CI suite, a long build)? **Background**.
3. Are there N independent jobs of the same shape, with N > 1? **Parallel**, fanned out in one tool-call block.
4. Is it a pipeline where each stage consumes the previous stage's output? **Sequential**: one dispatch per stage, with Stage N's report fed into Stage N+1.
5. Is it a single non-trivial task (3+ files, a heavy skill load, or a multi-step verification) that benefits from isolating the orchestrator's context? **Single**.

---

## Real examples in this repo

| Pattern    | Example skill / file                                                                                                  | What gets dispatched                                                                                          |
|------------|-----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| Parallel   | `.agents/skills/regression-testing/SKILL.md` Phase 2 (Analyze), artifact downloads after a CI run                     | 3 agents in parallel: `allure-results`, `playwright-report`, `evidence/`. Each scoped to one `gh run download`. |
| Background | `.agents/skills/regression-testing/SKILL.md` Phase 1 (Execute), wait for the CI run to terminate                      | 1 agent blocking on `gh run watch <RUN_ID> --exit-status` for 20-60 minutes.                                  |
| Sequential | `.agents/skills/test-automation/SKILL.md` (Stage 5), Plan, Code, Review                                               | 3 agents one at a time: Plan writes spec.md+automation-plan.md, Code consumes them, Review verifies.       |
| Single     | `.agents/skills/sprint-testing/SKILL.md` Stage 1, fetch and analyse one Jira ticket                                   | 1 agent that loads `/acli`, fetches the ticket, analyses ACs against `tests/` references, writes ATP draft.    |

When extending an existing skill, copy the pattern of its closest sibling rather than inventing a new one. Consistency keeps the orchestration legible.

---

## What not to do

- **Dispatch 1-file reads.** `Read` inline is faster and costs no sub-conversation slot. A subagent pays off only when it does meaningful work (3+ files, a skill load, multi-step verification).
- **Fan out more than 10 agents against the same external API** (Jira, Xray, GitHub). The service rate-limits you, the orchestrator gets back a flood of 429s, and recovery is messy. Cap fan-out at 10; above that, chunk the work and run the chunks Sequentially.
- **Background a task under 5 minutes.** Background carries a sleep cost: after a `delaySeconds > 300` wait the prompt cache is gone and the next turn re-reads the whole conversation. Wait inline, or Single-dispatch if you want context isolation.
- **Run Sequential when Parallel works.** If A and B are independent, Parallel costs the slowest one instead of the sum. The classic mistake is sequencing two reads that do not depend on each other.
- **Delegate planning.** The orchestrator owns the plan and its scope; subagents execute it. Inside the plan a subagent decides technical calls and reports them as DECIDED (`decision-protocol.md`), and escalates to the orchestrator only the four §5 kinds (product behaviour, a new security posture, an irreversible or outward action, what the owner reserved). A subagent allowed to decide what to do next beyond the plan silently expands its scope, and the orchestrator's view of progress stops making sense.
- **Fan out without a merge step.** Parallel agents return reports, and the orchestrator must know what to do with N reports before dispatching them. If you cannot say what the merge is, you have a Sequential job pretending to be Parallel.
- **Reuse a subagent across phases.** Each dispatch is a fresh agent and the contract is one-shot: briefing in, report out. State carried across dispatches belongs in files the orchestrator owns, not in agent memory.
- **Apply the one-shot contract to a supervised worker.** A persistent worker launched through `/agent-orchestration` is the declared exception to the previous bullet: it keeps context, is spoken to mid-task, and reports through the run mailbox. Every other rule here still binds it, and a fleet with no merge step is still a broken fan-out.
