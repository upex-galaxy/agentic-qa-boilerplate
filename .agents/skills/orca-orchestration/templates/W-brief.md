# W-<label>: <one-line scope>

> Copy to `.session/orchestration/<slug>/W-<label>.md`, one per worker. Owner: the conductor.
> This is the 7-component briefing (`agentic-qa-core/references/briefing-template.md`) plus the
> fleet fields (`references/brief-template.md` §3). Replace every `<…>`: a worker interprets any
> placeholder left in.

Read `<ABS>/.session/orchestration/<slug>/COMMON.md` first, then this file.

| Field | Value |
|---|---|
| Label | <W1> |
| Key / scope | <KEY or module or cluster> |
| Task | `task_…` |
| Dispatch | `dispatch_…` (omit if launched without one) |
| Run | `run_…`, only when launched without a dispatch; with an active dispatch the recipient defaults to the owning Run, so this line invites an error |
| Name | `<label>--<handle>`, where `<label>` is `[<KEY>-]<slug>`, the token your prompt opens with, and `<handle>` is your own `ORCA_TERMINAL_HANDLE`. **First action: rename your own tab, then read the new title back off the screen** with `orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null`. Your SESSION name is set for you (Claude Code: the identity hook; Pi: the adapter; Codex, OpenCode v2.2: the conductor types the rename verb); never rename your own session. Your `Session:` trailer carries this full name (the `session=` value of your `AGENT IDENTITY` line)<; on a harness that cannot be renamed, mark this row `roster only`: your trailer carries this roster name> |
| Worktree | <primary \| name>, the first commit-trailer value |
| Agent / model / effort | <agent> / <full model id> / <effort>, from `orchestration.default_agent` / `default_model` / `default_effort`, unless an `orchestration.model_overrides` entry matches this brief's topics or the user said otherwise |
| Report path | `<ABS>/.session/orchestration/<slug>/reports/<label>.md` |

## Goal

<One sentence. The outcome, not the activity.>

## Context docs (ABSOLUTE paths, primary checkout)

- `<ABS>/<path>`
- `<ABS>/<path>`

> Paths are absolute and in the primary checkout, always. A relative path resolves against a working
> directory you may not share, and a path inside your own worktree may not exist there at all.

## Project Standards (auto-resolved)

<Paste one block per relevant skill from `.agents/skills/REGISTRY.md`. Treat them as authoritative;
do not re-read the full SKILL.md unless an instruction below says so.>

## Skills to load

`/<domain-skill>`, `/orca-orchestration` in WORKER mode (it loads
`references/worker-contract.md`), and the stubs in `orchestration.orchestrator_skills`, which hold the
vendor command grammar and are cheap to load. Your injected preamble additionally carries the
message grammar.

## File ownership

You may edit only:

- `<path>`
- `<path>`

Leave anything else alone. Put the exact edit you wanted, and why, in your report under
`## Left open`. If it blocks you, ask.

## Claims: pre-granted, listed here by the conductor

| Entity | Intent | Consequence / if denied |
|---|---|---|
| `<entity>:<id>` | <read \| write \| enumerate> | <for enumerate: assert only on your own entity id, never on the collection's size, contents or ordering> |

Every claim in this table was decided at triage and granted at launch: announce it once and start
working. No grant is coming, and waiting on a pre-agreed claim has stalled a worker for nothing.

A claim you discover mid-run is different: declare it and wait, because your siblings may hold it.
The conductor arbitrates, never you. Protocol: `references/claims-protocol.md`.

## Siblings

| Label | Scope | State |
|---|---|---|
| <W2> | <scope> | <in-flight> |

If you discover a fact that changes ANOTHER worker's decision, tell the conductor immediately, not
in your final report. That is the whole reason this table is in your brief.

## Exact instructions

1. <step, naming the tool or skill action, and what proves it done>
2. <step>
3. <step>

## Report

Write your report to the path above, with: `## Summary`, `## Files changed`, `## Commits`,
`## Decisions taken`, `## Verification` (commands + exit codes), `## Left open`.
Then send `worker_done` exactly once, with an explicit outcome, the modified files and the report
path. Then stop.

## Rules

- Channel: the orchestration mailbox. Use no harness agent-messaging, no user prompts, no
  structured-question tool, no `mkd` deck, and send no heartbeats (your preamble asks for them; this
  wave forbids them).
- Errors, blockers and decisions go to the conductor, never to the human (worker contract rule 16):
  the four escalation kinds of `agentic-qa-core/references/decision-protocol.md` §5 and every error
  or blocker you cannot clear inside this brief, as a blocking `ask`, an `escalation` or a
  `BLOCKED: ` status. Do not guess. A technical call inside this brief is yours: decide it and report
  it as DECIDED.
- Run every stage without returning to the prompt until `worker_done` is sent. A stage boundary, a
  written artifact and a natural pause are not checkpoints. When done, send `worker_done`; when
  blocked, `ask`; otherwise keep going.
- If your own measurement contradicts something the conductor told you, stop and `ask` with both
  readings and your evidence. Never comply silently and never deviate silently.
- A blocking question is a blocking `ask`; a non-blocking one is a message, and you keep going on
  what does not depend on the answer. <If you were launched WITHOUT a dispatch: `escalation` is rejected on that
  path, send blockers as a `status` message with the subject prefixed `BLOCKED: `.>
- Commit trailers, the last two lines of every commit, nothing after them:
  `Worktree: <value>` then `Session: <label>--<handle>`. These are forensics, not attribution; add
  no AI attribution.
- Critical Rules #3, #7, #8, #15 (see COMMON.md).
- <any scope-specific guardrail: the environment to test against, the credentials profile to read,
  the branch to base on>
