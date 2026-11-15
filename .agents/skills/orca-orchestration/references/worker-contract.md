# Worker Contract: What a Launched Session Owes the Fleet

> Loaded by a worker session (WORKER mode) and by the conductor when it writes a brief.
> A worker loads this file, its domain skill, and the stubs in `orchestration.orchestrator_skills`
> (`.agents/project.yaml`), which hold the vendor's command grammar. On the supervised path the
> runtime injects a preamble at launch with the message grammar (`taskId`, `dispatchId`, the exact
> syntax of `worker_done` / `ask` / `escalation`, the correct `--from`). Launched unsupervised, the
> same text reaches you as a file your brief points at: read it once, and note that `escalation` is
> not available to you there (rule 8).
> This file adds only what no vendor preamble knows: the rules of this repo.

---

## The sixteen rules

1. You do the one task in the brief. Do not widen the scope and do not create other workers. If you
   find something that changes the scope, stop and report it: a scope correction is the conductor's
   decision, and it is recorded in the brief before you resume.

2. The channel is the orchestration mailbox. Do not use the harness's own agent-to-agent messaging
   tool: from an isolated worktree the conductor is not in your agent list, and a whole fleet once
   reported that way (G35), with reports going to an unrelated session or sitting typed and unsent.
   Do not use a user-question prompt, a structured-question tool or an `mkd` decision deck either:
   nobody is watching them (one such question waited for hours, G36), and inside Orca a deck opens a
   tab and blocks until someone presses Send. A pending that needs the human goes to the conductor
   (`ask`, or listed in your report), which relays it to the owner. You never sweep, never open a
   deck and never decide it (rule 16). Who may ask the human at all:
   `agentic-qa-core/references/decision-elicitation-doctrine.md` §0.

3. A question that blocks you goes out as a blocking `ask`. If it times out, the question stays
   pending: resume it by its original message id and do not ask again, because a duplicate produces
   two answers and one of them gets acted on twice. A question that does not block you goes out as a
   plain message, and you keep going on everything that does not depend on the answer. Asking is
   not stopping.

4. No periodic heartbeats. The injected preamble asks for them and this repo prohibits them (your
   brief repeats the prohibition for that reason), because every heartbeat wakes the conductor to
   read the word "alive". You send three things: `worker_done`, `ask`, `escalation`.

5. The workflow tokens stay. The blocked-state tokens and the question and done markers your domain
   skill already writes into its session memory and its report are the contract, and the mailbox
   reinforces them. Write both: the file path works with no runtime at all, the message does not.

6. Send `worker_done` exactly once, with an explicit `--outcome succeeded|failed` (a failure stated
   only in prose does not count), `--files-modified`, and `--report-path` pointing at your long
   report. A valid `worker_done` closes the Task and the Dispatch on its own, so do not run a task
   status update afterwards. After it, stop: no new work, no polling, and you never close your own
   terminal, because the conductor owns that.

7. Write the long report before `worker_done`, to the path the brief gives you
   (`<ABS>/.session/orchestration/<slug>/reports/<label>.md` in the PRIMARY checkout, or the scope
   the workflow skill declares), always by absolute path: a report written inside your worktree dies
   with it. Sections: `## Summary`, `## Files changed`, `## Commits` (sha + subject),
   `## Decisions taken` (and why), `## Verification` (commands + exit codes), `## Left open`. The
   message body is a summary and the file is the record.

8. Launched without a dispatch? Then your brief carries a `Run: <run_id>` line, and you report with a
   `status` message addressed to `run:<run_id>` at every stage boundary, plus the same `worker_done`
   at the end. Take the Run from the brief and never guess it from a run listing, because Runs from
   other repos coexist on the same machine. With an active Dispatch the recipient can be omitted (it
   defaults to the owning Run mailbox), so do not invent one.
   On that path `escalation` is not available to you. The runtime rejects an escalation from a
   terminal that owns no supervised dispatch and returns the refusal as a `status` message rather
   than as an error, so it reads like a reply and your blocker never arrives (gotcha G53). Send
   blockers as a `status` message whose subject starts with `BLOCKED: `, and say in the body what you
   will do while you wait.

9. Git. In the same checkout as other workers, stage explicit paths (`git add <path> …`, never `-A`
   or `.`), commit with an explicit pathspec, re-read every file right before editing it (another
   worker may have changed a shared neighbour), and on an `index.lock` collision wait about 5 s and
   retry. In your own worktree, commit, `fetch`, make an additive merge of the base, push your own
   branch, and open the PR the project's git strategy asks for. Never rebase or amend anything
   pushed (Critical Rule #6). Mechanics: `/git-flow-master`.

10. Critical Rule #15 counts double. Another session shares this tree, and a repo-wide discard
    destroys its uncommitted work unrecoverably. Discard only explicit paths you modified in this
    session. Unsure who modified a file? Do not restore it, and ask the conductor.

11. Run to completion. A stage boundary is not a checkpoint. Do not return to your prompt until
    `worker_done` is sent: finishing a stage, writing an artifact or reaching a natural pause is not
    permission to stop and wait. If the work is done, send `worker_done`; if it is blocked, `ask` or
    escalate (rule 8); otherwise keep going. On a real fleet (G58) workers stopped at a stage
    boundary with work remaining, on briefs that already said "no checkpoints", and every one of
    those stops cost a manual nudge.

12. Your own measurement outranks an instruction, and you stop and `ask`. When something you
    measured contradicts what the conductor told you, neither comply silently nor deviate silently.
    Send a blocking `ask` carrying both readings, the evidence for yours (the command, the data, the
    counts) and what you believe the consequence of each is. Then wait.
    A worker once did this by judgement and stopped a wrong blocker from shipping against a release:
    the conductor derives from reports and you hold the instrument. Silent compliance turns your
    measurement into nothing, and silent deviation turns it into a mystery nobody can audit.

13. Report through the mailbox, never through a `terminal send`, because you cannot verify that a
    `terminal send` reached the conductor. Everything you owe upward (status, `ask`, `worker_done`,
    a blocker) goes through the mailbox, and anything longer than a couple of sentences goes in your
    report file with a one-line pointer to its absolute path. `terminal send` truncates silently,
    keeps only the tail, and answers with a byte count for what it wrote, not for what the other side
    received (gotchas G60, G64), and the conductor's screen is not yours to read. The mailbox is
    byte-intact and leaves a row someone can re-read later. Channel table and the one exception:
    `references/channel-discipline.md`.

14. A fragment you receive is a truncation, not a short message. Text that arrives beginning
    mid-sentence, even mid-word, is what survived a truncated send. Because the head is what gets
    lost, it reads like a typo or a stray keystroke instead of a missing instruction. Do not answer
    it, do not guess the rest and do not act on the half you can see. Say what you received,
    verbatim, and ask for the pointer: the file by absolute path, or the same content through the
    mailbox. This was measured in both directions, between two sessions that had each just written
    the rule they were breaking (G64).

15. Resolve your `ROUTE:` lines before the brief. Your first prompt arrives with the hook's
    `ROUTE: read <file>` lines (`AGENTS.md` LOAD PROTOCOL): read each one first, then COMMON and your
    brief. They are few on purpose. The hook routes on the prompt's `ROUTE-SCOPE:` sentence or,
    without one, on the task block only, never on the injected preamble, and it caps the binding
    lines; anything else it matched sits on one `ROUTE-OPTIONAL:` line you read only if the work needs
    it. Before the cap, worker prompts fired most sections at once and workers read almost none of
    them, so the brief ran without the sections it depended on (measurements in ADR-0017).

16. Errors, blockers and decisions go to your launcher. Everything that needs a person goes to the
    conductor that launched you, never to the human: the four kinds of
    `agentic-qa-core/references/decision-protocol.md` §5 (product behaviour, a new security posture,
    an irreversible or outward action, what a person signs), and every error or blocker you cannot
    clear inside your brief. It travels as a blocking `ask`, an `escalation`, or, on the unsupervised
    path, a `status` message whose subject starts with `BLOCKED: ` (rule 8). Do not guess it, do not
    ask the human and do not work around it. Escalate informed: what you found, the options, your
    recommendation. A technical call inside your brief stays yours: decide it and report it as
    DECIDED, with the option it beat. The one exception is a request the human typed into your own
    session, or one your brief grants in writing: then you may ask them directly, and you tell the
    conductor what was asked and answered, so the decision lands in the run record. A conductor that
    another conductor launched (G77) is a worker under this rule and escalates to its own launcher
    the same way.

---

## Commit trailers

Every commit a worker produces ends with these two lines and nothing else:

```
Worktree: <worktree name | primary>
Session: <session label>
```

They are forensics, not attribution: they answer "which of the six sessions did this" months later,
when the roster is gone. No AI attribution, no `Co-Authored-By`, no harness-branded trailer
(Critical Rule #3). The values come from the `AGENT IDENTITY` line the hook injects into your
context; when a value cannot be resolved, write `unknown` rather than guess. `/git-flow-master` owns
the rule and `references/session-identity.md` describes where the values come from.

---

## Session naming

Your name is `<label>--<handle>`: the roster label your prompt token carries, two hyphens, then your
own Orca terminal handle (`references/session-identity.md` §2b). It is one string in four places:
your session name, your tab title, the roster's `Name` column and your `Session:` trailer.

The runtime titles every worker tab `worker-<task id>` (G71), and the tab is how the owner finds you.
So your first action, once your `ROUTE:` lines, COMMON and your brief are read (rule 15) and before
any work, is to rename your own tab:

```
orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "<label>--$ORCA_TERMINAL_HANDLE" --json </dev/null
```

Then check that the command's reply shows no error. Do not verify the label with `terminal list`,
`terminal show` or `terminal read`: none of them reads the tab label (G72, G82), so the conductor
confirms it on the tab itself and re-issues the same rename in every liveness sweep. Yours is the
first rename, not the only one. With no `ORCA_TERMINAL_HANDLE` in your environment (a line pasted
outside Orca) there is no tab to rename, so skip it.

Your session name is set for you, so there is nothing to do. On Claude Code the repo's identity hook
and on Pi the adapter compose `<label>--<handle>` from your first prompt's
`/<workflow-skill> <label> fleet worker` opening plus `ORCA_TERMINAL_HANDLE`. On Codex and OpenCode
v2.2 the conductor types the rename verb into your terminal once you are ready, and where a harness
cannot be renamed the roster maps your name to your handle (`references/session-identity.md` §2b).

You cannot rename your own session. `/rename` is user input, not a command you can run (G83), so do
not try, and do not treat a missing session name as a blocker; tell the conductor in your first
status message if your tab or session name looks wrong. Your `Session:` trailer carries the full
name: the `session=` value of the `AGENT IDENTITY` line in your context, or, where your harness could
not be renamed, the roster name your brief or the conductor gives you. Never invent one: the roster,
the board card and the commit trailer all key off it, and a different name breaks the resume path.

---

## Resource hygiene

- Close every browser-automation session when you finish, including the ones your subagents opened.
  Orphaned headless browsers once ran for hours before the owner noticed (G37).
- Run one dev server and one browser per worktree. Splitting ports is not enough when two processes
  share a build directory in the same checkout.
- Browser sessions are named and in memory. An owner's persistent profile is single-writer across
  every worktree and repo on the machine, so check `playwright-cli list --all` before opening one,
  and never run `kill-all`, which kills every session on the machine (G73). Canon:
  `agentic-qa-core/references/browser-sessions.md`.
- A worktree you created for sub-work is yours to remove before `worker_done`, after copying out any
  gitignored evidence. Your own worktree is the conductor's to remove: leave nothing gitignored that
  lives only there, and say in your summary where you copied logs and evidence.
- Check free disk before a long round. With a full disk, writing the output fails and the command
  does not: the worker goes mute because the message command is also a shell process, while file
  writes keep working.

---

## Claims

Before you touch shared fixture data, a shared account or a shared credential, check your brief.

- A claim listed in your brief is already granted. The conductor decided it at triage and
  pre-granted it at launch. Announce it once and start working; a worker that waited on a
  pre-agreed claim once stalled on nothing.
- A claim you discover mid-run is not granted. Declare it and wait, because the conductor has to
  check it against what your siblings hold.

Full protocol, the three intents (`read` / `write` / `enumerate`), message shapes and the non-runtime
fallback: `references/claims-protocol.md`. You never arbitrate; the conductor does.

---

## What the brief must tell you (checklist for the conductor)

If any of these is missing from your brief, ask for it before starting. A brief missing one of them
has a known failure mode.

- [ ] Goal, in one sentence.
- [ ] Absolute paths to the context files in the PRIMARY checkout (a relative path or a path inside
      your worktree may not exist).
- [ ] The domain skill to load, by trigger.
- [ ] File ownership: the exact paths you may edit, and the instruction to request any other edit
      instead of making it.
- [ ] The channel, and the prohibition of harness messaging, user prompts, structured-question
      tools, decks and heartbeats.
- [ ] Rule 16 in writing: errors, blockers and the four escalation kinds go to the conductor, never
      to the human; technical calls inside the brief are yours, reported as DECIDED.
- [ ] The continuation rule (rule 11), in writing, and not only in the prompt.
- [ ] `Run: <run_id>` if you were launched without a dispatch, and the `BLOCKED: ` status form that
      replaces `escalation` on that path.
- [ ] The sibling roster: who else is running and on what, so a fact you discover that changes
      someone else's decision gets broadcast instead of buried.
- [ ] The claims you must declare before starting.
- [ ] The report path and the report protocol.
- [ ] Your label, the tab-rename first action, and your `Session:` trailer source (the full
      `<label>--<handle>` name, or the roster name where your harness cannot be renamed).
- [ ] The trailer reminder.
