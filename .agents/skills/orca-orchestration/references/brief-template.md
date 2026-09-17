# Brief Template — The Fleet Extension of the 7-Component Briefing

> Loaded by: the conductor, when it seeds a worker.
> Base: `agentic-qa-core/references/briefing-template.md`. Those 7 components are NOT replaced.
> A worker brief is that briefing plus the eight fleet fields below, because a persistent worker
> has something a one-shot subagent does not: siblings, a channel, a lifecycle and a git identity.

---

## 1 · The two files

A brief is split in two, deliberately:

| File | Written | Read by | Holds |
|---|---|---|---|
| `.session/orchestration/<slug>/COMMON.md` | once per wave | every worker, FIRST | the repo rules, the lint traps, the commit rules, the channel, the prohibitions |
| `.session/orchestration/<slug>/W-<label>.md` | once per worker | that worker only | goal, context docs, file ownership, claims, instructions, report path |

Why split: the common part is identical for six workers, so writing it once makes it impossible for
five of them to get a slightly different version. The per-worker part is the only place a worker's
scope is defined, so there is exactly one file to read when a scope is disputed.

Templates to copy: `templates/COMMON.md` and `templates/W-brief.md`.

**One message, one task.** The brief goes in a FILE and the launch prompt cites it by ABSOLUTE path
into the primary checkout. Never paste a long brief into a message (it truncates) and never put it in
a system temp directory (it triggers a permission prompt on some harnesses).

---

## 2 · The 7 components, as a worker sees them

| # | Component | What changes for a worker |
|---|---|---|
| 1 | **Goal** | unchanged: one sentence |
| 2 | **Context docs** | ABSOLUTE paths into the PRIMARY checkout. A relative path resolves against a cwd the worker may not share, and a path inside the worker's own worktree may not exist there at all |
| 3 | **Project Standards (auto-resolved)** | unchanged: compact rules pasted from the generated skill registry. A worker trusts them and does not re-read the full SKILL.md unless told to |
| 4 | **Skills to load** | the domain skill by trigger, plus `orca-orchestration` in WORKER mode. NOT the vendor guides: the injected preamble carries the message grammar |
| 5 | **Exact instructions** | numbered, each naming its tool or skill action, and each verifiable |
| 6 | **Report format** | two destinations now: the long report FILE, and the `worker_done` message that points at it |
| 7 | **Rules** | the relevant Critical Rules, plus the fleet prohibitions below |

---

## 3 · The eight fleet fields

1. **Identity and ids** — the worker label, `Task: <task_id>`, `Dispatch: <dispatch_id>` when
   adopted, and `Run: <run_id>` **only** when the worker was launched WITHOUT a dispatch (with an
   active dispatch the recipient defaults to the owning Run, so a stray `Run:` line invites the
   worker to address it manually and get it wrong).

2. **Sibling roster** — one line per other live worker: label, scope, state. This is not courtesy: it
   is what lets a worker who discovers a fact that changes someone ELSE's decision broadcast it
   instead of burying it in its own report. Say explicitly that a cross-cutting discovery goes to the
   conductor immediately, not at the end.

3. **Channel and prohibitions** — the orchestration mailbox is the channel. Name the three message
   types and prohibit, in writing:
   - the harness's agent-to-agent messaging tool (from an isolated worktree the conductor is not
     addressable);
   - the harness's user-question prompt (nobody is watching it);
   - **periodic heartbeats** — and say WHY the prohibition is there, because the injected preamble
     asks for them and a worker obeying its preamble is behaving correctly from its own side.

4. **File ownership** — the exact paths this worker may edit, and the instruction for everything
   else: do NOT touch it, put the edit you wanted in your report. In a same-checkout fleet also
   repeat: stage explicit paths, commit with a pathspec, re-read before every edit, retry on
   `index.lock`, no global discards (Critical Rule #15).

5. **Claims to declare** — the per-worker claim list produced at triage
   (`references/claims-protocol.md` §5), so declaring is a confirmation rather than a discovery.
   Include the alternative to use if a claim is denied.

6. **Reporting protocol** — the report path, the six report sections, and the exact `worker_done`
   shape: once, with an explicit outcome, with the modified files, with the report path. Plus:
   after `worker_done`, stop; do not close your own terminal.

7. **Session label and rename** — the label the roster, the board card and the commit trailer all
   key off. On a harness whose launcher cannot set a name, instruct the worker to rename itself in
   its first turn to EXACTLY that label.

8. **Trailer reminder** — the two forensic trailers as the last lines of every commit, and the
   reminder that they are forensics, not attribution, and that no AI attribution of any kind is
   allowed (Critical Rule #3).

---

## 4 · Skeleton

```
# W-<label> — <one-line scope>

Read <ABS>/.session/orchestration/<slug>/COMMON.md first, then this file.

Label: <label>   Task: <task_id>   Dispatch: <dispatch_id>
[Run: <run_id>]                       # ONLY when launched without a dispatch
Session label: <KEY>-<slug>           # rename yourself to this if your harness needs it
Model / effort: <model> / <effort>
Worktree: <primary | name>            # first trailer value

## Goal
<one sentence>

## Context docs (absolute, primary checkout)
- <ABS>/...
- <ABS>/...

## Project Standards (auto-resolved)
<blocks pasted from the generated skill registry>

## Skills to load
/<domain-skill>, /orca-orchestration (WORKER mode)

## File ownership
You may edit ONLY:
- <path>
- <path>
Anything else: do not touch it. Put the exact edit you wanted in your report.

## Claims to declare before starting
- <entity>:<id> <read|write>    # if denied: <alternative>

## Siblings
- <label> — <scope> — <state>

## Exact instructions
1. ...
2. ...

## Report
Write <ABS>/.session/orchestration/<slug>/reports/<label>.md with:
## Summary · ## Files changed · ## Commits · ## Decisions taken · ## Verification · ## Left open
Then send worker_done exactly once, outcome succeeded|failed, with --files-modified and
--report-path. Then stop.

## Rules
- Channel = the orchestration mailbox. No harness agent-messaging, no user prompts, NO heartbeats.
- A blocking question goes out as a blocking ask; a non-blocking one goes out as a message and you
  keep working on everything that does not depend on the answer.
- Commit trailers, last two lines, nothing after them:
  Worktree: <value>
  Session: <label>
- Critical Rules #3 (no AI attribution), #7 (verify tests -> types -> lint), #8 (read before edit),
  #15 (no global discards).
```

---

## 5 · Anti-patterns in a worker brief

| Anti-pattern | What happens |
|---|---|
| four tasks in one brief | the worker does one. Measured |
| the brief pasted into a message instead of a file | it truncates mid-instruction and the worker acts on the half it got |
| relative context paths | they resolve against a cwd the worker does not share |
| a context path inside the worker's own worktree | the file is not there; the worker proceeds without it, silently |
| no file-ownership list in a same-checkout fleet | two workers edit one file and one of them loses the work |
| no explicit heartbeat prohibition | the worker obeys its injected preamble and wakes the conductor every few minutes |
| a launch prompt containing `"` or `<` / `>` | the shell mangles the line; the terminal reports success and nothing ran |
| "report when you are done" with no path and no shape | a prose report the conductor cannot diff, aggregate or hand to the next wave |
