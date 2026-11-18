---
name: session-handoff
description: "Hand a whole session to a fresh successor through a handoff file, so work continues as if the context window had been extended. Use when the context window is filling up; when work must outlive this session; when the owner asks to hand the session over or continue it in a fresh session. Not for handing a task to another agent (orca-cli) or delegating to a supervised worker (agent-orchestration)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [meta-skill, orchestration]
metadata:
  kind: workflow
---

# Session Handoff

A handoff transplants context; it does not summarize it. The successor is not a reader being briefed on someone else's work. It is this session with a new window, so everything it needs to act has to be on disk, addressable and true when it reads.

The whole contract lives in `.agents/skills/session-handoff/references/capture-contract.md`.

## What this is not

| Looks similar | Actually is | Use |
|---|---|---|
| hand a scoped task to another session and supervise it | orchestration: Task, Dispatch, mailbox, the work comes back | `/agent-orchestration` |
| hand work away and stop caring | ownership transfer of a task, one direction, no return | the binary's own `orca-cli` guide |
| remember a decision for next month | durable cross-session fact, project-scoped | Engram (`mem_save`) |
| shrink the window and keep going | harness compaction: lossy, not addressable, not yours to shape | nothing to do |
| hand the whole session to its own successor | this skill | here |

Compaction keeps what a summarizer judged salient. A handoff keeps what the next actor needs, and only the session writing it knows that set.

## When to write one

Manual is the primary trigger, by design. The owner notices the window filling and says so, and the skill runs. Whether any harness could trigger it automatically is answered, with citations, in `.agents/skills/session-handoff/references/auto-trigger.md`; read that before promising the owner an automatic mode.

Write one when any of these holds:

- The context window is past the owner's threshold (about 500k tokens unless the owner names another). It is a per-owner judgement about where this model starts degrading, not project configuration, so it stays in the conversation and not in a yaml key. <!-- volatile-ok: owner-stated judgement threshold, explicitly not config -->
- The session is about to end with work still in flight.
- The next step will consume a large slice of the window and what remains would not cover the work after it.
- The owner asks.

Skip it when the remaining work fits comfortably in the window. A handoff costs a real slice of context to produce, and a successor launched too early pays the startup cost for nothing.

## The three steps

1. **Capture.** Walk `.agents/skills/session-handoff/references/capture-contract.md` section by section. Every section is mandatory. A section with nothing in it gets an explicit `none` line, because an omitted section looks the same as a forgotten one and the successor cannot ask which it was.
2. **Write.** Fill `.agents/skills/session-handoff/templates/handoff.md` into `<<PRIMARY_ROOT>>/.session/handoffs/<session-name>-handoff-NN.md`, following the naming contract below. Finish the file before the next step: a successor that starts first reads a file that does not exist yet.
3. **Launch the successor.** Follow `.agents/skills/session-handoff/references/successor-launch.md`. With a reachable runtime, this session launches it. Without one, this session prints the launch line and the owner pastes it.

Done means the file exists at its final path with all ten sections, and the successor is either confirmed running with the file or the pasteable line has been printed.

## Naming and location contract

```
<<PRIMARY_ROOT>>/.session/handoffs/<predecessor-session-name>-handoff-NN.md
```

- `.session/` is gitignored, and a handoff is disposable: it describes one session's state and is not a project record. Committing it would put a decaying snapshot under version control.
- The file lives in the primary checkout, `<<PRIMARY_ROOT>>` (`.agents/README.md` §"Checkout roots"), even when the session runs in a linked worktree. A handoff written inside a worktree dies with the worktree, and two worktrees of one lineage would each count `NN` from their own empty directory. The successor still launches in the same worktree as the predecessor. A handoff written into a worktree's own `.session/` by mistake is rescued by `bun run worktree:audit --rescue` before the worktree goes.
- `NN` is zero-padded to two digits, starts at `01` and increments across the whole lineage. List `<<PRIMARY_ROOT>>/.session/handoffs/` before choosing, and never count from a worktree's own `.session/`.
- The successor's session name is the handoff file's basename without the extension. That makes the lineage readable from the file list alone: `<base>`, then `<base>-handoff-01`, then `<base>-handoff-01-handoff-02`.
- `<predecessor-session-name>` is the `session=` value of the `AGENT IDENTITY:` line the prompt hook injects (the label the commit trailers carry), with spaces and parentheses replaced by `-`. When it reads `unknown`, ask the owner for a name. With nobody to ask (a worker or routine), take the name from the launching brief; if the brief has none, write the handoff under `unnamed-session` and say in the report that the name was a stand-in.
- A durable fact that outlives the session belongs in Engram, the repo or the tracker. The handoff cites it.

## Hard rules

1. Label every claim `measured`, `read` or `predicted`. Measured means this session ran it and read the output. Read means it came from a document and was believed. A predecessor's guess about what the successor will find goes stale first, and a predicted branch stated as fact sends the successor down a path that no longer exists.
2. Mark perishable state `PERISHABLE`, with the wall-clock time it was measured. Running workers, open mailboxes, in-flight PRs and live runs decay between writing and reading, so the successor re-verifies, then acts.
3. Perishable beats priority. When a perishable item needs attention before the priority list, say so in that item's own line (details in §7 of the capture contract).
4. Copy ids verbatim, in backticks, in a form that can be pasted: run id, dispatch id, terminal handle, session id, PR number, tracker key, commit SHA. "The worker from earlier" is not an id.
5. Write every path as absolute, because the successor may start in a different directory.
6. Name what is not done and why. A handoff that reads as an unbroken success has hidden something, and the hidden thing is what bites.
7. Run the successor on the same harness as the predecessor. A handoff shaped for one agent's conventions and handed to another is a translation problem nobody asked for.
8. No AI attribution anywhere (Critical Rule #3). A handoff is a repo artifact in English, even when the conversation is not.
9. Keep the predecessor's handoff. The lineage is the audit trail, so writing `-handoff-02` never removes `-handoff-01`.
10. Keep secrets out of the file (Critical Rule #1; `AGENTS.md` §3 SESSION MATERIAL IN A DISPATCH). A handoff names the variable a credential lives under (`$STAGING_USER_PASSWORD`), never its value, and leaves out session cookies, tokens and the path of any `.auth/**` state file.

## With nobody at the keyboard

The launch is the only outward step. Three cases:

- A person is present: announce the launch and the terminal that carries it, then fire it.
- A supervised worker: the conductor holds the gate. Write the file, report its path to the conductor, and launch only when the conductor's brief says to.
- A routine: the delegating brief is the approval source when it names handoff and launch. Without that, write the file, print the launch line, stop and report. Launching is the step that puts a second session on someone's board.

Section 8 of every handoff splits items the owner decided from items awaiting an owner decision; a successor with nobody to ask does the decided ones, records the open ones in its report and stops short of them (`agentic-qa-core/references/decision-protocol.md`).

## References

| File | What it holds |
|---|---|
| `.agents/skills/session-handoff/references/capture-contract.md` | the ten mandatory sections, what each is for, and the failure mode that justifies it |
| `.agents/skills/session-handoff/references/successor-launch.md` | launching the successor with and without a runtime, per harness; why this is not orchestration |
| `.agents/skills/session-handoff/references/auto-trigger.md` | whether any harness exposes context size to a hook, with citations and a verdict |
| `.agents/skills/session-handoff/templates/handoff.md` | the skeleton to fill |

Related doctrine: `.agents/skills/agentic-qa-core/references/session-footer-contract.md` (what a session reports at close) and `.agents/skills/agentic-qa-core/references/briefing-template.md` (the 7 components, which a handoff deliberately is not: a briefing scopes a task, a handoff transplants a session).
