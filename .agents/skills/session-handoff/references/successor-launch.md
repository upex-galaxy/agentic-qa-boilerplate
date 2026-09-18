# Launching the successor

The handoff file is written first, in full, and only then does the successor start. That order is not reversible.

## This is not orchestration

A handoff transfers ownership of a whole session. There is no Task, no Dispatch, no mailbox, no supervision and nothing comes back, because the successor IS the predecessor. The orchestration verbs are the wrong family entirely, and reaching for them creates a supervised worker that the owner then has to release and close for no reason.

The correct family is the plain terminal-and-worktree one. Ask the binary for its own CLI guide when the grammar is needed; never copy command grammar into this repo, because a copy desynchronizes on the next release.

| | Handoff (this skill) | Orchestration (`/orca-orchestration`) |
|---|---|---|
| what moves | the whole session | one scoped task |
| the predecessor | ends | keeps working and supervises |
| channel afterwards | none, by design | mailbox, questions, replies |
| runtime objects | a terminal | Run, Task, Dispatch, worker |

## With a reachable runtime

Preconditions, all three, verified before launching:

1. the binary is present and the runtime is reachable (the gate in `/orca-orchestration`)
2. the handoff file exists at its final path and is complete
3. the successor's target is the **same worktree** the predecessor is in, and the **same harness**

Then create one terminal in the active worktree whose command is the harness's own launch line, carrying two things: the session name (the handoff basename without the extension) and a first prompt that names the handoff file by absolute path and says to read it top to bottom and continue.

The launch line is the harness's, not the runtime's. A Claude predecessor launches a Claude successor; OpenCode launches OpenCode; Codex launches Codex.

**Announce the launch to the owner before firing it**, and say which terminal will carry it. The owner is about to have a second session appear on their board.

## Without a runtime

Identical in every respect except who opens the terminal. Print the line, say where the handoff file is, and let the owner paste it. The prompt is byte-identical to the runtime path's: the path nobody exercises is the one that silently breaks, and here the prompt is the whole payload.

## The first prompt, both paths

One sentence, no cleverness:

> Read `<absolute path to the handoff>` top to bottom and continue that session exactly where it stopped.

If §0 of the handoff names an ordering the successor must respect, say so in the prompt too. A file pointer reads as reference material; an instruction in the prompt reads as an instruction. That difference has been measured on workers and it applies here.

## After the successor is up

The predecessor's last acts, in order:

1. confirm on screen that the successor started and has the file
2. persist anything durable to memory (`mem_session_summary`), because the handoff is disposable and gitignored while memory is not
3. stop

Do not close the predecessor's own terminal as part of this skill. Ending the predecessor is the owner's call, and a session that closes itself mid-verification cannot report that the handoff failed.
