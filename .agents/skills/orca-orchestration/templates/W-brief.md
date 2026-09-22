# W-<label> — <one-line scope>

> Copy to `.session/orchestration/<slug>/W-<label>.md`, one per worker. Owner: the conductor.
> This is the 7-component briefing (`agentic-qa-core/references/briefing-template.md`) plus the
> fleet fields (`references/brief-template.md` §3). Every `<…>` must be replaced — a brief with an
> unreplaced placeholder is a brief the worker will interpret.

Read `<ABS>/.session/orchestration/<slug>/COMMON.md` first, then this file.

| Field | Value |
|---|---|
| Label | <W1> |
| Key / scope | <KEY or module or cluster> |
| Task | `task_…` |
| Dispatch | `dispatch_…` (omit if launched without one) |
| Run | `run_…` — **ONLY** when launched WITHOUT a dispatch; with an active dispatch the recipient defaults to the owning Run, so this line invites an error |
| Session label | <KEY>-<slug> — on Claude Code the identity hook sets it from your first prompt, so do NOT rename yourself (a rename freezes the name as human-set). On any other harness, or if your first prompt carried no `/<workflow-skill> <KEY> fleet worker` token, rename yourself to EXACTLY this in your first turn |
| Worktree | <primary \| name> — the first commit-trailer value |
| Agent / model / effort | <agent> / <full model id> / <effort> |
| Report path | `<ABS>/.session/orchestration/<slug>/reports/<label>.md` |

## Goal

<One sentence. The outcome, not the activity.>

## Context docs (ABSOLUTE paths, primary checkout)

- `<ABS>/<path>`
- `<ABS>/<path>`

> Absolute and in the PRIMARY checkout, always. A relative path resolves against a working
> directory you may not share, and a path inside your own worktree may not exist there at all.

## Project Standards (auto-resolved)

<Paste one block per relevant skill from `.agents/skills/REGISTRY.md`. Treat them as authoritative;
do not re-read the full SKILL.md unless an instruction below says so.>

## Skills to load

`/<domain-skill>`, `/orca-orchestration` in WORKER mode (it loads
`references/worker-contract.md`), and the stubs in `orchestration.orchestrator_skills` — the vendor
command grammar, cheap and worth it. Your injected preamble additionally carries the
message grammar.

## File ownership

You may edit ONLY:

- `<path>`
- `<path>`

Anything else: do not edit it. Put the exact edit you wanted, and why, in your report under
`## Left open`. If it blocks you, ask.

## Claims — PRE-GRANTED, listed here by the conductor

| Entity | Intent | Consequence / if denied |
|---|---|---|
| `<entity>:<id>` | <read \| write \| enumerate> | <for enumerate: assert only on your own entity id, never on the collection's size, contents or ordering> |

Every claim in this table was decided at triage and **granted at launch**: announce it once and start
working. Do NOT wait for a grant — there is none coming, and waiting on a pre-agreed claim has
stalled a worker for nothing.

A claim you DISCOVER mid-run is different: declare it and wait, because your siblings may hold it.
You never arbitrate; the conductor does. Protocol: `references/claims-protocol.md`.

## Siblings

| Label | Scope | State |
|---|---|---|
| <W2> | <scope> | <in-flight> |

If you discover a fact that changes ANOTHER worker's decision, tell the conductor immediately — not
in your final report. That is the whole reason this table is in your brief.

## Exact instructions

1. <step, naming the tool or skill action, and what proves it done>
2. <step>
3. <step>

## Report

Write your report to the path above, with: `## Summary`, `## Files changed`, `## Commits`,
`## Decisions taken`, `## Verification` (commands + exit codes), `## Left open`.
Then send `worker_done` exactly once — explicit outcome, modified files, report path. Then stop.

## Rules

- Channel: the orchestration mailbox. No harness agent-messaging, no user prompts, **no heartbeats**
  (your preamble asks for them; this wave forbids them).
- **Run every stage without returning to the prompt until `worker_done` is sent.** A stage boundary,
  a written artifact and a natural pause are not checkpoints. Done → `worker_done`; blocked → `ask`;
  otherwise keep going.
- **If your own measurement contradicts something the conductor told you, STOP and `ask`** with both
  readings and your evidence. Never comply silently, never deviate silently.
- Blocking question → blocking `ask`; non-blocking → a message, and keep going on what does not
  depend on the answer. <If you were launched WITHOUT a dispatch: `escalation` is rejected on that
  path — send blockers as a `status` message with the subject prefixed `BLOCKED: `.>
- Commit trailers, the last two lines of every commit, nothing after them:
  `Worktree: <value>` then `Session: <label>`. Forensics, not attribution. No AI attribution.
- Critical Rules #3, #7, #8, #15 (see COMMON.md).
- <any scope-specific guardrail: the environment to test against, the credentials profile to read,
  the branch to base on>
