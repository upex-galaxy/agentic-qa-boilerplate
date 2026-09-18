---
name: session-handoff
description: "Compact an entire agent session into a handoff document so a NEW session resumes exactly where this one stopped, as if the context window had been extended rather than reset. Use when the context window is getting high (default threshold ~500k tokens, beyond which the model degrades and starts inventing), when work must continue past the end of this session, or on any variant of: hagamos el handoff, pasa el contexto a otra sesion, continua esto en otra sesion, hand this session over, continue this in a fresh session, write a handoff, session handoff. Produces .session/handoffs/<session-name>-handoff-NN.md and, when an orchestration runtime is reachable, launches the successor itself in the SAME worktree and the SAME harness. Do NOT use for: delegating a scoped task to a worker while you keep working (that is orca-orchestration), one-shot subagent dispatch, or persisting durable project facts across projects (that is Engram memory)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [meta-skill, orchestration]
---

# Session Handoff

A handoff is **context transplanted, not context summarized**. The successor is not a reader being briefed on someone else's work; it IS this session, with a new window. Everything it needs to act must be on disk, addressable, and true at the moment it reads.

The skill is small on purpose. The heavy artifact is the markdown it produces, and the whole contract lives in `.agents/skills/session-handoff/references/capture-contract.md`.

## What this is not

| Looks similar | Actually is | Use |
|---|---|---|
| hand a scoped task to another session and supervise it | orchestration: Task, Dispatch, mailbox, the work comes back | `/orca-orchestration` |
| hand work away and stop caring | ownership transfer of a TASK, one direction, no return | the binary's own `orca-cli` guide |
| remember a decision for next month | durable cross-session fact, project-scoped | Engram (`mem_save`) |
| shrink the window and keep going | harness compaction, lossy, not addressable, not yours to shape | nothing to do |
| **hand the whole SESSION to its own successor** | **this skill** | here |

The distinction that matters: compaction keeps what a summarizer judged salient. A handoff keeps what the NEXT actor needs, which is a different set, and it is written by the only party that knows the difference.

## When to write one

**Manual is the primary trigger and that is by design.** The human notices the window filling, says so, and the skill runs. No polling, no nagging, no token spent guessing.

Whether any harness can trigger this automatically is answered, with citations, in `.agents/skills/session-handoff/references/auto-trigger.md`. Read it before promising the owner an automatic mode.

Write one when any of these is true:

- the context window is past the owner's threshold (~500k tokens unless the owner names a different one; it is a per-owner judgement about where this model starts degrading, not project configuration, so it stays in the conversation and not in a yaml key)
- the session is about to end with work still in flight
- the session is about to do something that will itself consume a large slice of the window (a big harvest, a long file read) and the remaining budget will not cover the work after it
- the owner asks

Do NOT write one when the remaining work fits comfortably in the window. A handoff costs a real slice of context to produce, and a successor launched too early pays the startup tax for nothing.

## The three steps

1. **Capture.** Walk `.agents/skills/session-handoff/references/capture-contract.md` section by section. Every section is mandatory; a section with nothing in it is written as an explicit `none` line, never omitted. Omission is indistinguishable from forgetting, and the successor cannot tell which happened.
2. **Write.** Fill `.agents/skills/session-handoff/templates/handoff.md` to `.session/handoffs/<session-name>-handoff-NN.md`. Naming contract below.
3. **Launch the successor.** Follow `.agents/skills/session-handoff/references/successor-launch.md`. With a runtime, this session launches it. Without one, this session prints the line and the human pastes it.

## Naming and location contract

```
.session/handoffs/<predecessor-session-name>-handoff-NN.md
```

- `.session/` is gitignored. A handoff is worktree-local and disposable by design: it describes one session's state, it is not a project record, and committing it would put a decaying snapshot under version control.
- `NN` is zero-padded, two digits, starting at `01`, incrementing across the whole lineage. List the directory before choosing; never assume.
- **The successor's session name is the handoff file's basename without the extension.** That is the entire naming rule, and it makes the lineage readable from the file list alone: `<base>`, then `<base>-handoff-01`, then `<base>-handoff-01-handoff-02`. Long names are the point; a lineage you cannot read is a lineage you cannot audit.
- A durable fact that outlives the session does not belong in the handoff. It belongs in Engram, in the repo, or in the tracker. The handoff cites it.

## Hard rules

1. **Label every claim `measured` or `predicted`.** The predecessor's guesses about what the successor will find are useful and are also the first thing to go stale. A predicted branch stated as fact sends the successor down a path that no longer exists. Measured means: this session ran it and read the output.
2. **Mark perishable state `PERISHABLE`, with the wall-clock time it was measured.** Running workers, open mailboxes, in-flight PRs and live runs decay between writing and reading. The successor's instruction for anything marked perishable is: re-verify before acting, not act then discover.
3. **Perishable beats priority.** If a perishable item needs attention before the priority list, say so in the same line. A successor that follows a stale priority order while a live worker waits has done exactly what the handoff was supposed to prevent.
4. **Ids are copied, never described.** A run id, a dispatch id, a terminal handle, a session id, a PR number, a tracker key, a commit SHA: verbatim, in backticks, in a form that can be pasted. "the worker from earlier" is not an id.
5. **Every path is absolute.** The successor may start in a different directory.
6. **Name what is NOT done and why.** A handoff that reads as an unbroken success is a handoff that hid something, and the hidden thing is always what bites.
7. **Write the file before launching the successor.** They are not separable, and the order is not reversible: a successor that starts first reads a file that does not exist yet.
8. **Harness parity.** The successor runs on the same harness as the predecessor. A handoff shaped for one agent's conventions handed to another is a translation problem nobody asked for.
9. **No AI attribution anywhere, ever** (Critical Rule #3). A handoff is a repo artifact in English, even when the conversation is not.
10. **Do not delete the predecessor's handoff.** The lineage is the audit trail. Writing `-handoff-02` never removes `-handoff-01`.

## References

| File | What it holds |
|---|---|
| `.agents/skills/session-handoff/references/capture-contract.md` | the ten mandatory sections, what each one is for, and the failure mode that justifies it |
| `.agents/skills/session-handoff/references/successor-launch.md` | launching the successor with and without a runtime, per harness; why this is not orchestration |
| `.agents/skills/session-handoff/references/auto-trigger.md` | whether any harness exposes context size to a hook, with citations and a verdict |
| `.agents/skills/session-handoff/templates/handoff.md` | the skeleton to fill |

Related doctrine: `.agents/skills/agentic-qa-core/references/session-footer-contract.md` (what a session reports at close), `.agents/skills/agentic-qa-core/references/briefing-template.md` (the 7 components, which a handoff deliberately is NOT: a briefing scopes a task, a handoff transplants a session).
