# Coordinator Playbook — The Conductor's Full Cycle

> Loaded by: `orca-orchestration` in CONDUCTOR mode.
> Grammar source: LOAD the stubs in `orchestration.orchestrator_skills` (`.agents/project.yaml`)
> alongside this skill, then ask the binary only for a DEEP topic a stub points at. This file
> carries the ORDER, the repo-specific decisions and the traps — not the vendor reference.
> Every command below was checked against the live schema (`orca agent-context --json`,
> app version 1.4.190, 2026-09-17). Re-check with `orca agent-context --json` before trusting a
> flag on a newer version.

---

## 0 · Before anything

1. Run the gate (`SKILL.md` §The gate). State A or B → fall back, do not continue this playbook.
2. Ask the binary for the grammar, now and not earlier.
3. Create the orchestration scope on disk: `.session/orchestration/<slug>/`, where `<slug>` names the
   wave of work (`sprint-42-qa`, `kata-fixtures-refactor`, `regression-2026-09-17`). Everything the
   fleet needs to survive a crash lives there, in the PRIMARY checkout, cited by absolute path.
4. Seed `run.md`, `roster.md`, `COMMON.md` and `launch.txt` from `templates/`.

**Everything written inside a worktree dies with the worktree.** Fleet state belongs in the primary
checkout, and a worker reaches it by absolute path in its prompt — never by a relative path, never by
a path inside its own worktree.

---

## 1 · The cycle, in order — the NATIVE path (supervised, the default)

**Supervision comes from the launch, and only from the launch.** The runtime decides "is this an
agent" from the argv IT started, never from the running process, so a terminal created with our own
command line can never be adopted: `worker-start --terminal <handle>` answers `agent_unconfigured`
on a terminal whose agent is demonstrably alive on screen (measured three ways, gotcha G44). There is
exactly one supervised launch, and it is the native one.

```bash
# 1 · once per wave: create the Run (a namespace + a home inbox; it schedules nothing)
orca orchestration run-create --objective "<what is being coordinated>" --json </dev/null
#     save run_id + the coordinator handle into .session/orchestration/<slug>/run.md

# 2 · write the BRIEFS first, then one Task per worker, BEFORE launching anything.
#     The spec is not a label. On the native path the runtime injects it as the worker's FIRST
#     PROMPT, so the worker is already executing it before step 6's prompt exists (G58). It must
#     therefore be self-sufficient: the scope, the brief's ABSOLUTE path, the continuation
#     sentence, and anything that has to be right from the first action — the session-title
#     token and the no-stopping clause included. Which is why the briefs are written first:
#     the spec cites them by path.
orca orchestration task-create --spec '/<workflow-skill> <KEY> fleet worker. Read <ABS>/.session/orchestration/<slug>/COMMON.md then <ABS>/.session/orchestration/<slug>/W-<label>.md and execute your brief. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.' --json </dev/null
#     --task-title is accepted and DISCARDED (every task comes back with title null, G49):
#     put the human-readable label in --spec and in roster.md
#     --deps <json_array> exists but the element shape is undocumented: do not use it yet (G8)
#     Measured cost of a thin spec: a worker ran seven of its nine steps on a one-line framing
#     before the brief reached it, and three of its commits carried the harness-derived session
#     label instead of the fleet one — unfixable once pushed (Critical Rule #6).

# 3 · placement
#   same checkout  → nothing to create
#   worktree       → create it JUST before launching; one created half an hour earlier is born stale
orca worktree create --repo id:<repoId> --name <KEY> --no-parent --setup run --json </dev/null
git -C <wt> fetch origin
git -C <wt> merge --ff-only origin/<base>
git -C <wt> rev-parse --short HEAD          # MUST equal origin/<base>; never mask this with `|| true`
bun run worktree:provision <wt>             # references/provisioning.md

# 4 · LAUNCH natively → supervised, with the preamble injected by the runtime
orca orchestration worker-start --task <task_id> --worktree <current|id:<repoId>::<path>> \
  --agent <claude|codex|opencode> --model <full-model-id> --effort <level> --json </dev/null
#     → the dispatch id and the worker's terminal handle: record BOTH in roster.md.
#       (Lost them? worker-show --dispatch <id>, or terminal list --worktree <sel>.)
#     --effort requires --model; neither combines with --terminal. --name names a NEW WORKTREE,
#       not the session: there is no session-name flag on this path (see §1b).
#     Prerequisites, both invisible from here: the agent's per-machine default arguments must carry
#       an auto permission mode, and direnv must load the env file in the interactive shell (G45).
#       references/orca-machine-setup.md §3.

# 5 · verify readiness AND credentials on the worker's screen, before sending it any work
orca terminal read --terminal <handle> --screen --json </dev/null
#     want: the agent's status footer (model, effort) AND evidence the env file loaded
#     (a direnv export line, or the worker's own first probe). No credentials → fix the machine,
#     do not dispatch work to it.

# 6 · send the prompt — the ONE verb that reaches a running session (G46).
#     On the NATIVE path the spec already delivered this text, so step 6 is a reinforcement
#     and a no-op when the spec carried everything. On the fallback path it is the whole
#     payload. Keep the two byte-identical: the path nobody exercises is the one that breaks.
#     Anything longer than a couple of sentences goes in a FILE with a one-line pointer here:
#     a long --text is truncated and still reports accepted:true with a byte count (G60).
orca terminal send --terminal <handle> --enter \
  --text '/sprint-testing <KEY> fleet worker. Read <ABS>/.session/orchestration/<slug>/COMMON.md then <ABS>/.session/orchestration/<slug>/W-<label>.md and execute your brief. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: orca orchestration. No heartbeats.' \
  --json </dev/null
#     The prompt MUST OPEN with `/<workflow-skill> <KEY> fleet worker`: that token is what the
#     identity hook turns into the session title (there is no name flag here), and what the workflow
#     skill reads to know it is a fleet worker. Everything after it is the brief pointer plus the
#     continuation sentence.
#     On `agent_prompt_stalled`: the text is usually ALREADY queued. Read the screen or
#     `worktree ps` before resending, or the worker gets the message twice (G52).

# 7 · board card — ONE fleet-level card per worktree (§3)
orca worktree set --worktree <sel> --display-name "<slug> · round <N>" \
  --workspace-status in-progress \
  --comment "<slug> · round <N> · <n> workers · run <run_id> · roster: <ABS>/.session/orchestration/<slug>/roster.md" \
  --json </dev/null

# 8 · wait INSIDE the turn, one waiter, rolling, ack in the same command that re-arms (§4)
orca orchestration check --run <run_id> --wait --types worker_done,escalation,question \
  --timeout-ms 540000 --json </dev/null
#     process the WHOLE batch → reply to every question → decide each terminal's fate → only then:
orca orchestration check --run <run_id> --ack <delivery_id> --wait --types … --timeout-ms 540000 --json </dev/null

# 9 · close immediately (verify integration first: git cherry / PR / tracker state)
orca terminal read --terminal <handle> --screen --json </dev/null   # READ THE COST FOOTER FIRST (G54)
orca orchestration worker-release --dispatch <dispatch_id> --json </dev/null
#     worktree removal ONLY after the orphan audit (§6)
orca worktree rm --worktree id:<repoId>::<path> --force --json </dev/null && git worktree prune
```

**`</dev/null` on every scripted call.** The binary reads stdin when stdin is attached, and inside a
loop or a background shell that read never returns: the command hangs with no output, which is
indistinguishable from slow work. Measured 2026-09-04: a loop creating 18 tasks blocked on the FIRST
call for over three minutes; with `</dev/null` all 18 finished in seconds.

**Steps 3-4-5-6 are ONE indivisible operation.** Splitting them is how a worker ends up sitting
idle: it happened twice on 2026-09-02, once for five hours.

---

## 1b · What the native path costs, and the custom-argv fallback

The native launch is the only supervised one, and it is not free. What it gives up, and what to do
about each:

| Given up | Consequence | Compensation |
|---|---|---|
| the session-name flag | the roster, the board card and the `Session:` commit trailer all key off the label | the prompt opens with `/<workflow-skill> <KEY> fleet worker`, and the identity hook titles the session from it (`references/session-identity.md` §2) |
| environment variables in the launch line | a worker cannot be marked as a fleet worker by an exported variable | the brief and the prompt token carry it. `sprint-testing` detects worker mode from them, not from the environment |
| the prompt in the launch itself | the worker starts idle at its prompt | step 6: `terminal send` immediately after readiness. Until it lands, the worker has nothing to do |
| a launch line that also loads the env file | credentials depend on the MACHINE having direnv, and nothing reports their absence | step 5: verify credentials on screen BEFORE dispatching work (G45) |

**The custom-argv path** (`terminal create --command '<the line from launch.txt>'` plus
`terminal wait --for tui-idle`) keeps exactly one role: it is the shape of the line a HUMAN pastes
when there is no runtime, and the shape the conductor uses when it deliberately wants an unsupervised
terminal it will drive by hand. On that path, and permanently:

- there is no supervision and no adoption. Do not attempt `worker-start --terminal` (G44).
- a dispatch id is still available: the plain `dispatch` form creates a real dispatch row without
  injecting anything (G48), and `dispatch-show --task <id> --preamble` prints the preamble — **in
  text mode only, `--json` returns the object without it** (G47). Write that text to a file in the
  conductor's scope and send the worker a one-line pointer to it with `terminal send`.
- `escalation` from such a terminal is REJECTED and the refusal comes back as a `status` message
  (G53). The brief tells those workers to send blockers as `status` with the subject prefixed
  `BLOCKED:`.
- cleanup is by handle: count the terminals in the worktree, then close that one terminal and its
  tab. The release verb does not apply (§6).

```bash
# unsupervised, by choice or because no native path is available on this machine
orca terminal create --worktree <sel> --title "<KEY>-<slug>" --command '<launch.txt line, verbatim>' --json </dev/null
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 180000 --json </dev/null
orca orchestration dispatch --task <task_id> --to <handle> --json </dev/null             # → dispatch id, no injection
orca orchestration dispatch-show --task <task_id> --preamble </dev/null > <ABS>/.session/orchestration/<slug>/preamble-<label>.md
#     NOTE the missing --json: this one call prints the preamble in TEXT mode only (G47)
orca terminal send --terminal <handle> --enter --text '<one-line pointer to the preamble file and the brief>' --json </dev/null
```

---

## 2 · The files a Run is made of

All under `.session/orchestration/<slug>/` (gitignored, tier LOCAL — nothing downstream may depend
on one existing on another machine):

| File | Owner | What it holds |
|---|---|---|
| `run.md` | conductor | run id, objective, coordinator handle, created-at, base branch, topology |
| `roster.md` | conductor | one row per worker (see below) |
| `COMMON.md` | conductor | the common brief every worker reads first |
| `W-<label>.md` | conductor | the per-worker brief |
| `launch.txt` | conductor | one self-contained launch line per worker, ALWAYS written |
| `claims.md` | conductor | the claims ledger (`references/claims-protocol.md`) |
| `learnings.md` | conductor | cross-session findings worth carrying to the next wave |
| `skill-improvements.md` | conductor | gaps in the SKILLS themselves that this wave exposed |
| `kickoff.md` | conductor | the handoff pointer for the next conductor |
| `reports/<label>.md` | that worker | the long report; `worker_done` points at it |

**One owner per file.** Two writers on one file in a same-checkout fleet is the collision this rule
exists to prevent. A worker writes exactly one file: its own report.

The roster is what makes the phrasebook possible. One row per worker:

```
| label | KEY | task_id | dispatch_id | terminal | worktree | agent | model | session label | resume | status |
```

Without `dispatch_id` you cannot address a supervised worker; without `terminal` you cannot steer or
nudge one at all; without the session label and the `resume` command you cannot bring it back after a
crash — and in a same-checkout fleet the roster is the ONLY place that per-worker recovery exists,
because the board card is fleet-level there (§3). Update the row the moment any of those values is
issued, not at the end of the round. Add the worker's cost to its row when you read the footer at
close (gotcha G54): it is unreadable a second later.

---

## 3 · The board card as shared state

```bash
orca worktree set --worktree <sel> --display-name "<KEY> <short title>" --json </dev/null
orca worktree set --worktree <sel> --workspace-status <todo|in-progress|in-review|completed> --json </dev/null
orca worktree set --worktree <sel> --comment "<recovery block>" --json </dev/null
```

Workspace status ids match the board columns (defaults `todo`, `in-progress`, `in-review`,
`completed`; a project with custom columns uses its own ids). Map them to the workflow's own stages,
and say which mapping you used in `run.md` so a second conductor reads the board the same way.

The comment is not "what I am doing". It is **how a dead session is recovered**. Which means the card
has two shapes, decided by the topology, because the card is per-WORKTREE and a same-checkout fleet
has one worktree for N workers (gotcha G50).

**One worker per worktree** — the card carries that worker's whole recovery block:

```
<KEY> · Stage 2 execution
session <session label>
branch <branch>
brief .session/orchestration/<slug>/W-<label>.md
```

**N workers in one checkout** — one FLEET-level card, and per-worker recovery lives in the roster,
which the card points at by absolute path:

```
<slug> · round <N> · <n> workers · run <run_id> · roster: <ABS>/.session/orchestration/<slug>/roster.md
```

The roster row is what makes that indirection safe, so it must carry, per worker, the session label
and the exact resume command for its harness. A fleet card that points at a roster with no resume
column is a card that recovers nothing.

Whoever opens the card can resume that exact session, directly or one hop away. Set the card at
launch and at every round boundary, not only at the end.

---

## 4 · Waiting, and the three ways it goes wrong

- **A wait is ROLLING, not one long block.** The harness caps a foreground command at 600 s while a
  round runs tens of minutes, so a single `--timeout-ms 1800000` is killed mid-wait and a timeout
  becomes indistinguishable from a dead mailbox (gotcha G51). Wait at **`--timeout-ms 540000`** and
  re-arm, with the verified ack in the SAME command, as many times as the round needs. A longer
  single wait is acceptable only as a background job the harness itself tracks and notifies on; it is
  never a shell `&`. The runtime's own mailbox notice remains the primary wake-up signal — the rolling
  wait is what keeps the conductor's turn open, not what discovers the mail.
- **One actionable waiter per Run.** A waiter started as a shell background job holds the slot with
  nobody listening, and `check` then answers with a "waiter exists" failure instead of a batch. A
  silent mailbox and a blocked one look identical from the conductor's side. Recover by finding and
  killing the stale `orchestration check` process, then re-arm.
- **An unacknowledged batch replays forever and hides everything behind it.** Delivery is FIFO: while
  a batch is unacknowledged, `check` keeps returning that same batch and newer messages queue behind
  it, invisible. Worse: because the mailbox already counted as having unread mail, **the runtime does
  not emit a new notice** (it notifies on empty → non-empty). Measured 2026-09-14: an ack inside a
  compound command exited non-zero, nobody checked, and four messages piled up for hours.
- **Never build a monitor.** The runtime injects a notice into the conductor's session when mail
  arrives. A homemade monitor competes with that notice, can null it, arrives late by construction,
  and triggers on echoes — the conductor's own messages are visible on the worker's screen, so a
  grep for a completion token reads them back as a report.
- `check --wait` emits JSON keepalive lines to stderr every 15 s; filter with
  `jq 'select(._keepalive|not)'` when merging streams. A keepalive is not a heartbeat message.

Verify every ack, alone:

```bash
D=$(orca orchestration check --run <run_id> --json </dev/null | jq -r '.result.deliveryId')
orca orchestration check --run <run_id> --ack "$D" --json </dev/null   # acknowledged == $D, count drops
```

Answering a blocking question uses the message id from the pending batch
(`orca orchestration reply --id <msg_id> --body "<text>" --json </dev/null`). A reply body has been
observed arriving empty on the worker side; when a reply carries substance, duplicate it with
`orca terminal send --terminal <handle> --text '<same text>' --enter --json </dev/null` and say in
the body that you did — **only while the text still fits in a sentence or two.** Past that, the
duplicate is prose through the lossy verb (hard rule 4): write the answer to a file in the Run scope
and send the one-line pointer instead, then have the worker state the decision back in its own words
before it acts on it.

**Mail is not a nudge — and a nudge is not the message.** `orchestration send --to <terminal handle>`
queues mail that a working agent never reads, because nothing tells it to run `check`, and it returns
`ok: true` exactly like the call that works (gotcha G46). The only verb that reaches a RUNNING session
is `terminal send`. That does NOT make it the channel: the message itself goes to a mailbox address
(`run:<id>`, `dispatch:<id>`), or into a file with a one-line pointer when it runs long, and
`terminal send` carries at most one sentence telling the busy worker to go read it
("check your mailbox: `<subject>`"). It truncates silently and keeps only the tail (hard rule 4,
G60, G64), so a nudge that grows into the instruction is how the instruction gets lost. Full
assignment: `references/channel-discipline.md`.

---

## 5 · Liveness sweep (Orca-native signals FIRST)

Run the sweep on a cadence YOU choose (at each round boundary, or when the owner asks), never as a
background monitor. Order matters: native signals are cheap and truthful; the token sweep is the
fallback that also works with no runtime.

1. `orca orchestration worker-list --run <run_id> --json </dev/null` — terminal-state accounting per
   worker (`active`, `reclaimable`, `retained`, `release_pending`, `release_unknown`, `released`).
   Terminal state is process accounting, reported SEPARATELY from task status: a completed task can
   still own a live terminal.
2. `orca orchestration worker-show --dispatch <id> --json </dev/null` — read `observation.agentWait`.
   It names a worker parked on a prompt only a human can answer, with the evidence that proved it.
   `null` means the runtime looked and found no wait. An **absent** field means it never looked, and
   never means the worker is not waiting. **A waiting worker is healthy, not failed.**
3. `orca worktree ps --json </dev/null` — the compact cross-worktree summary; the fastest read of
   "how many are alive and where".
4. `orca terminal read --terminal <handle> --screen --json </dev/null` — for a worker that answers
   nothing. This is the only way to see a **hung interactive selector** (an "Enter to select" prompt),
   which produces no message because the worker does not know it is stuck.
5. Only then, the non-runtime fallback: grep the workflow's own blocked tokens in the session memory
   the workflow skill already writes, plus staleness (no progress line in more than ~20 minutes).

### Stalled is not idle, and the prompt line cannot tell them apart

The prompt box is ALWAYS drawn, so a screen read that greps for the prompt character reports "idle"
for every worker, always — including one that is working (gotcha G55). The signal is the **spinner
line** above the prompt box (`✽ …ing… (Nm Ns · ↓ N tokens)`):

| Spinner on screen | `worker_done` sent | Verdict |
|---|---|---|
| yes | no | **working**. Leave it alone |
| no | no | **STALLED**. It is parked at a prompt, and a stage boundary is the usual place |
| no | yes | **idle**, finished. Read its cost footer, then close it |

A stalled worker is nudged with `terminal send`, not with mail (§4), and the nudge repeats the
continuation sentence rather than re-explaining the stage. Corroborate the verdict with the worker's
own progress timestamp before acting: a worker mid-`ask` is waiting, not stalled, and waiting is
healthy.

Screen-read traps, all paid for: the lines arrive in `result.terminal.tail` (not `result.lines`); a
parser that looks for `lines` returns empty forever, silently. The TUI status bar uses non-breaking
spaces, so a grep including a space after a label never matches. `result.terminal.status == exited`
is usually the conductor having closed that terminal itself. And if the runtime restarts, **handles
change** while the sessions survive as separate processes: re-discover with
`orca terminal list --worktree <sel> --json </dev/null`.

`terminal read` without `--screen` returns accumulated output with escapes stripped, so a repainting
TUI comes back as stacked fragments. `--screen` and `--cursor` are mutually exclusive.

---

## 6 · Closing, in the same turn

**Verify integration BEFORE closing anything**: commits landed (`git cherry`), PR opened where the
strategy asks for one, tracker artifacts in their declared status. A released worker whose work never
integrated is the one failure that cannot be recovered from the board.

**Read the cost footer BEFORE closing.** A worker's token and context usage exists only on its own
screen and no command reports it, so closing the terminal destroys the number (gotcha G54). One
`terminal read --screen`, the numbers into `roster.md`, then close.

| Case | Close with |
|---|---|
| supervised (native launch, §1) | `orca orchestration worker-release --dispatch <id> --json </dev/null` — closes that worker's terminal and no other; idempotent; an inspectable archive is preserved first, so `worker-read` still answers afterwards |
| needs to stay open for debugging | `orca orchestration worker-retain --dispatch <id>` — a durable exception a later explicit release clears |
| uncertain / unreachable | `orca orchestration worker-abandon --dispatch <id>` — fences it WITHOUT claiming it stopped, and touches no resource |
| unsupervised (custom-argv launch, §1b) | COUNT the terminals in that worktree first, then `orca terminal close --terminal <handle> --tab --json </dev/null`. **Never** `orca terminal stop --worktree <sel>`: its radius is the whole worktree |

### Orphan audit before removing a worktree

Removing a worktree deletes everything gitignored inside it. In THIS repo that means the env file,
captured evidence, any local session scope, the tracker cache and installed dependencies. Before
`worktree rm`:

1. `git -C <wt> status --porcelain` — uncommitted work? Commit it or copy it out.
2. `git -C <wt> cherry -v origin/<base>` — commits not in the base? Push or integrate first.
3. `git -C <wt> status --porcelain --ignored` (or `git -C <wt> ls-files --others --ignored --exclude-standard`)
   — list the gitignored files and decide, one by one: evidence and reports that matter get COPIED
   into the primary checkout's `.session/orchestration/<slug>/reports/`; durable documents are moved
   to where the repo keeps them; the rest is disposable by design.
4. Only then remove, and `git worktree prune`.

Mechanics and the untracked-files gotcha: `git-flow-master/references/worktrees.md`.

---

## 7 · Conductor-only operations (never delegated)

A fleet has exactly one writer for anything shared. These stay with the conductor:

- **Credential and token minting.** The conductor authenticates and mints tokens BEFORE launching;
  workers only read the resulting file. Per-worker isolation uses the login script's profile option
  so one worker's refresh cannot invalidate another's token. Canon:
  `agentic-qa-core/references/api-testing-doctrine.md`.
- **Schema sync** (`bun run api:sync`) — one writer into `api/schemas/`, before the round.
- **Tracker pull and push at fleet altitude** — the sprint-level plan, the shared test plan, the
  cache hydration. A worker reads its own issue; it does not re-hydrate the whole cache.
- **Generated registries** that every worker would otherwise rewrite (the skill registry, the KATA
  manifest). The conductor regenerates them when it integrates.
- **Arbitrating claims** (`references/claims-protocol.md`).

---

## 8 · Conductor → conductor handoff

A Run outlives the session that created it. To take over:

```bash
orca orchestration run-use --id <run_id> --json </dev/null      # run_id comes from run.md
orca orchestration task-list --run <run_id> --brief --json </dev/null
orca orchestration worker-list --run <run_id> --json </dev/null
```

Never guess the Run from `run-list`: several Runs from OTHER repos coexist on one machine.
`orca orchestration run-current --json </dev/null` tells you what this terminal is bound to, and
returns a null Run in an unbound terminal.

`kickoff.md` is the handoff pointer, written by the outgoing conductor and loadable as-is by the
incoming one: the Run id, the topology, which rounds closed, what is in flight with its dispatch
ids, the open claims, the next decision waiting for the owner, and the absolute paths of the scope
files. One file, no archaeology.

---

## 9 · Cross-session memory

Three files in the scope, one owner each, appended never rewritten:

| File | What goes in | What does NOT |
|---|---|---|
| `learnings.md` | facts about the SYSTEM under test or the repo that the next wave needs | per-worker narrative |
| `skill-improvements.md` | gaps in the skills themselves: a missing step, a wrong order, a stage that has no verifier | bug reports about the product |
| `kickoff.md` | the handoff pointer above | a diary |

Harvest them at the close of the wave: `skill-improvements.md` is the input for a
`/framework-development` pass, and `learnings.md` for the next wave's `COMMON.md`. Neither is a
deliverable; anything the team needs lives in the tracker.
