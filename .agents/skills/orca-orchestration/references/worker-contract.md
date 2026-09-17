# Worker Contract — What a Launched Session Owes the Fleet

> Loaded by: a worker session (WORKER mode), and by the conductor when it writes a brief.
> A worker loads THIS file and its domain skill. It loads NEITHER vendor guide: the preamble
> injected at adoption already carries the message grammar (`taskId`, `dispatchId`, the exact
> syntax of `worker_done` / `ask` / `escalation`, and the correct `--from`).
> This file adds only what no vendor preamble knows: the rules of THIS repo.

---

## The ten rules

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

9. **Git.** Same checkout: stage EXPLICIT paths (`git add <path> …`, never `-A` / `.`), commit with
   an explicit pathspec, re-read every file right before editing it (another worker may have changed
   a shared neighbour), and on an `index.lock` collision wait ~5 s and retry. Own worktree: commit,
   `fetch`, ADDITIVE merge of the base, push YOUR branch, PR per the project's git strategy. Never
   rebase or amend anything pushed (Critical Rule #6). Mechanics: `/git-flow-master`.

10. **Critical Rule #15 counts double.** No repo-wide discards: another session shares this tree, and
    a global discard destroys its uncommitted work unrecoverably. Discard only explicit paths YOU
    modified in THIS session. Unsure who modified a file → do not restore it, ask the conductor.

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

## Session naming (non-Claude harnesses)

A worker launched with a Claude Code argv is already named by its launch line, and that name shows up
in the prompt box, the resume picker and the terminal title. On a harness where the launcher cannot
set a name, the brief instructs the worker to rename itself in its FIRST turn, with that harness's
own rename command (`/rename` is the documented form on Claude Code, OpenCode and Codex). Use exactly
the label the brief gives you — the conductor's roster, the board card and the commit trailer all key
off it, and a self-invented name breaks the resume path.

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

Before you touch shared fixture data, a shared account or a shared credential, DECLARE it and wait
for the grant. Full protocol, message shapes and the non-runtime fallback:
`references/claims-protocol.md`. You never arbitrate; the conductor does.

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
- [ ] `Run: <run_id>` if you were launched without a dispatch.
- [ ] The sibling roster: who else is running and on what, so a fact you discover that changes
      someone else's decision gets broadcast instead of buried.
- [ ] The claims you must declare before starting.
- [ ] The report path and the report protocol.
- [ ] Your session label, and the rename instruction if your harness needs one.
- [ ] The trailer reminder.
