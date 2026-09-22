# Worker Contract — What a Launched Session Owes the Fleet

> Loaded by: a worker session (WORKER mode), and by the conductor when it writes a brief.
> A worker loads THIS file, its domain skill, and the stubs in `orchestration.orchestrator_skills`
> (`.agents/project.yaml`) — the vendor's command grammar, about 2k tokens for the pair. On the supervised
> path the runtime injects a preamble at launch that already carries the message grammar (`taskId`,
> `dispatchId`, the exact syntax of `worker_done` / `ask` / `escalation`, and the correct `--from`).
> Launched unsupervised, that same text reaches you as a FILE your brief points at — read it once,
> and note that `escalation` is not available to you there (rule 8).
> This file adds only what no vendor preamble knows: the rules of THIS repo.

---

## The fourteen rules

1. **One task: the one in the brief.** Do not widen the scope. Do not create other workers. If you
   find something that changes the scope, STOP and report it — a scope correction is the conductor's
   decision, and it gets recorded in the brief before you resume.

2. **The channel is the orchestration mailbox.** Do NOT use the harness's own agent-to-agent
   messaging tool: from an isolated worktree the conductor is not in your agent list, and on
   2026-09-13 five workers reported this way — two sent their report to an unrelated session, three
   left it typed and unsent, and the conductor found out by reading screens up to 35 minutes late.
   Do NOT use a user-question prompt either: nobody is watching it (one such question waited 7.5
   hours).

3. **A question that blocks you goes out as a blocking `ask`.** If it times out, the question stays
   pending: resume it by its original message id, never ask again (a duplicate question produces two
   answers and one of them gets acted on twice). **A question that does NOT block you goes out as a
   plain message, and you keep going on everything that does not depend on the answer.** Asking is
   not stopping.

4. **No periodic heartbeats.** The injected preamble asks for them; this repo prohibits them, and
   that prohibition is repeated in your brief for exactly this reason. Every heartbeat wakes the
   conductor to read the word "alive". You send three things and nothing else: `worker_done`, `ask`,
   `escalation`.

5. **The workflow tokens stay.** The blocked-state tokens and the question / done markers your
   domain skill already writes into its session memory and its report ARE the contract; the mailbox
   is the reinforcement. Write both. The file path works with no runtime at all; the message does
   not.

6. **`worker_done` exactly once**, with an explicit `--outcome succeeded|failed` (never a failure
   stated only in prose), `--files-modified`, and `--report-path` pointing at your long report. A
   valid `worker_done` closes the Task and the Dispatch on its own: do NOT run a task status update
   afterwards. After `worker_done`: **stop**. No new work, no polling, and never close your own
   terminal — the conductor owns that.

7. **Write the long report BEFORE `worker_done`**, to the path the brief gives you
   (`.session/orchestration/<slug>/reports/<label>.md`, or the scope the workflow skill declares).
   Sections: `## Summary`, `## Files changed`, `## Commits` (sha + subject), `## Decisions taken`
   (and why), `## Verification` (commands + exit codes), `## Left open`. The message body is a
   summary; the file is the record.

8. **Launched without a dispatch?** Then your brief carries a `Run: <run_id>` line, and you report
   with a `status` message addressed to `run:<run_id>` at every stage boundary, plus the same
   `worker_done` at the end. **Never guess the Run** from a run listing: Runs from other repos
   coexist on the same machine. With an active Dispatch the recipient can be omitted — it defaults to
   the owning Run mailbox — so do not invent one.
   **On that path `escalation` is not available to you**: the runtime rejects an escalation from a
   terminal that owns no supervised dispatch, and it returns the refusal as a `status` message rather
   than as an error — so it reads like a reply and your blocker never arrives (gotcha G53). Send
   blockers as a `status` message whose subject starts with `BLOCKED: `, and say in the body what you
   will do while you wait.

9. **Git.** Same checkout: stage EXPLICIT paths (`git add <path> …`, never `-A` / `.`), commit with
   an explicit pathspec, re-read every file right before editing it (another worker may have changed
   a shared neighbour), and on an `index.lock` collision wait ~5 s and retry. Own worktree: commit,
   `fetch`, ADDITIVE merge of the base, push YOUR branch, PR per the project's git strategy. Never
   rebase or amend anything pushed (Critical Rule #6). Mechanics: `/git-flow-master`.

10. **Critical Rule #15 counts double.** No repo-wide discards: another session shares this tree, and
    a global discard destroys its uncommitted work unrecoverably. Discard only explicit paths YOU
    modified in THIS session. Unsure who modified a file → do not restore it, ask the conductor.

11. **Run to completion. A stage boundary is not a checkpoint.** Do not return to your prompt until
    `worker_done` is sent: finishing a stage, writing an artifact, or reaching a natural pause is not
    permission to stop and wait. If the work is done, send `worker_done`; if it is blocked, `ask` or
    escalate (rule 8); otherwise keep going. Measured: two of three workers in one fleet stopped at a
    stage boundary with work remaining, on briefs that already said "no checkpoints" — which is why
    the instruction is in your PROMPT as well as here. Every one of those stops cost a manual nudge.

12. **Your own measurement outranks an instruction — and you STOP and `ask`.** When something you
    measured contradicts what the conductor told you, do not comply silently and do not deviate
    silently. Send a blocking `ask` carrying BOTH readings, the evidence for yours (the command, the
    data, the counts), and what you believe the consequence of each is. Then wait.
    This is the highest-value behaviour ever recorded in a fleet: on 2026-09-17 a worker did it by
    judgement and stopped a wrong blocker from shipping against a release. A conductor derives from
    reports; you are the one holding the instrument. Silent compliance turns your measurement into
    nothing, and silent deviation turns it into a mystery nobody can audit.

13. **You cannot verify that a `terminal send` reached the conductor, so you do not report with
    one.** Everything you owe upward — status, `ask`, `worker_done`, a blocker — goes through the
    **mailbox**, and anything longer than a couple of sentences goes in your report file with a
    one-line pointer to its absolute path. The reason is not preference: `terminal send` truncates
    silently, keeps only the TAIL, and answers with a byte count for what it WROTE, not for what the
    other side received (gotchas G60, G64) — and you have no way to check the destination, because
    the conductor's screen is not yours to read. The mailbox is byte-intact and leaves a row someone
    can re-read later. Channel table and the one exception: `references/channel-discipline.md`.

14. **The same error with the opposite sign: a fragment you RECEIVE is a truncation, not a short
    message.** Text that arrives beginning mid-sentence — mid-word, even — is what survived a
    truncated send, and because the head is what gets lost it reads like a typo or a stray keystroke
    instead of like a missing instruction. Do not answer it, do not guess the rest, and do not act on
    the half you can see. Say what you received, verbatim, and ask for the pointer: the file, by
    absolute path, or the same content through the mailbox. Measured 2026-09-21, in both directions,
    between two sessions that had each just written the rule they were breaking (G64).

---

## Commit trailers

Every commit a worker produces ends with exactly these two lines and nothing else:

```
Worktree: <worktree name | primary>
Session: <session label>
```

They are **forensics, not attribution**: they answer "which of the six sessions did this" months
later, when the roster is gone. No AI attribution, no `Co-Authored-By`, no harness-branded trailer
(Critical Rule #3). The values come from the `AGENT IDENTITY` line the hook injects into your
context; when a value cannot be resolved, write `unknown` rather than guessing. The rule itself is
owned by `/git-flow-master`; the identity resolution is described in `references/session-identity.md`.

---

## Session naming

**There is no name flag on the supervised path**: the runtime starts the agent itself and takes an
agent, a model and an effort level, not a command line. Your name therefore comes from one of two
places:

- **Claude Code** — from your first prompt. It opens with `/<workflow-skill> <KEY> fleet worker`, and
  the repo's identity hook turns that into the session title. Nothing for you to do; do NOT rename
  yourself, because a rename marks the name as human-set and freezes it.
- **Any other harness, or a Claude Code worker whose first prompt did not carry the token** — the
  brief instructs you to rename yourself in your FIRST turn with that harness's own rename command
  (`/rename` is the documented form on Claude Code, OpenCode and Codex).

A worker launched from a pasted line on the no-runtime path may already be named by that line's own
name flag. Either way: use EXACTLY the label the brief gives you. The conductor's roster, the board
card and the commit trailer all key off it, and a self-invented name breaks the resume path.

---

## Resource hygiene

- Close every browser-automation session when you finish, including the ones your subagents opened.
  Ten orphaned headless browsers (~2.7 GB) once ran for hours before the owner noticed.
- One dev server and one browser per worktree. Splitting ports is NOT enough when two processes share
  a build directory in the same checkout.
- Check free disk before a long round. With a full disk, **writing the output fails, not the
  command**: the worker goes mute because the message command is also a shell process, while file
  writes keep working.

---

## Claims

Before you touch shared fixture data, a shared account or a shared credential, check your brief:

- **A claim listed in your brief is already granted.** The conductor decided it at triage and
  pre-granted it at launch. Announce it once and start working — do NOT wait for a grant that is
  never coming. A worker that waited on a pre-agreed claim once stalled on nothing.
- **A claim you discover mid-run is NOT granted.** Declare it and wait, because the conductor has to
  check it against what your siblings hold.

Full protocol, the three intents (`read` / `write` / `enumerate`), message shapes and the non-runtime
fallback: `references/claims-protocol.md`. You never arbitrate; the conductor does.

---

## What the brief must tell you (checklist for the conductor)

If any of these is missing from your brief, ask for it before starting — a brief missing one of them
has a known failure mode:

- [ ] Goal, in one sentence.
- [ ] Absolute paths to the context files in the PRIMARY checkout (a relative path or a path inside
      your worktree may not exist).
- [ ] The domain skill to load, by trigger.
- [ ] **File ownership**: the exact paths you may edit, and the instruction to request any other edit
      instead of making it.
- [ ] The channel, and the prohibition of harness messaging / user prompts / heartbeats.
- [ ] The continuation rule (rule 11), in writing, and not only in the prompt.
- [ ] `Run: <run_id>` if you were launched without a dispatch, and the `BLOCKED: ` status form that
      replaces `escalation` on that path.
- [ ] The sibling roster: who else is running and on what, so a fact you discover that changes
      someone else's decision gets broadcast instead of buried.
- [ ] The claims you must declare before starting.
- [ ] The report path and the report protocol.
- [ ] Your session label, and the rename instruction if your harness needs one.
- [ ] The trailer reminder.
