# Launching the successor

Write the handoff file first, in full, and start the successor only after that. The order does not reverse.

## This is not orchestration

A handoff transfers ownership of a whole session. There is no Task, no Dispatch, no mailbox, no supervision, and nothing comes back, because the successor is the predecessor. The orchestration verbs belong to another family, and reaching for them creates a supervised worker that the owner then has to release and close for no reason.

The right family is the plain terminal-and-worktree one. When the command grammar is needed, ask the binary for its own CLI guide. A copy of the grammar in this repo desynchronizes on the next release.

| | Handoff (this skill) | Orchestration (`/agent-orchestration`) |
|---|---|---|
| what moves | the whole session | one scoped task |
| the predecessor | ends | keeps working and supervises |
| channel afterwards | none, by design | mailbox, questions, replies |
| runtime objects | a terminal | Run, Task, Dispatch, worker |

## With a reachable runtime

Check three preconditions before launching:

1. The binary is present and the runtime is reachable (the gate in `/agent-orchestration`).
2. The handoff file exists at its final path and is complete.
3. The successor's target is the same worktree the predecessor is in, on the same harness.

Then create one terminal in the active worktree. Its command is the harness's own launch line, carrying two things: the session name (the handoff basename without the extension) and a first prompt that names the handoff file by absolute path and says to read it top to bottom and continue.

The launch line belongs to the harness, not the runtime. A Claude predecessor launches a Claude successor, OpenCode launches OpenCode, Codex launches Codex, and Pi launches Pi (`pi -n <name> "<first prompt>"`).

Announce the launch to the owner before firing it and say which terminal carries it, since a second session is about to appear on their board. With nobody present, the launcher's rules apply (see "With nobody at the keyboard" in `SKILL.md`): a conductor or a brief that names the launch holds the gate, and without either you stop at the printed line.

## Without a runtime

Everything is the same except who opens the terminal. Print the line, say where the handoff file is, and let the owner paste it. The prompt is byte-identical to the runtime path's. The path nobody exercises is the one that silently breaks, and here the prompt is the whole payload.

## The first prompt, both paths

One sentence, no cleverness:

> Read `<absolute path to the handoff>` top to bottom and continue that session exactly where it stopped.

If §0 of the handoff names an ordering the successor must respect, say so in the prompt too. A file pointer reads as reference material and an instruction in the prompt reads as an instruction; that difference has been measured on workers and applies here.

## After the successor is up

The predecessor's last acts, in order:

1. Confirm on screen that the successor started and has the file.
2. Persist anything durable to memory (`mem_session_summary`), because the handoff is disposable and gitignored while memory is not.
3. Stop.

Leave the predecessor's own terminal open. Ending the predecessor is the owner's call, and a session that closes itself mid-verification cannot report that the handoff failed.
