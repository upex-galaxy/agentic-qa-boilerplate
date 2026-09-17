# Coordinator Playbook — The Conductor's Full Cycle

> Loaded by: `orca-orchestration` in CONDUCTOR mode.
> Grammar source: ask the binary (`orca skills get orchestration`, and `orca skills get orca-cli`
> when you create terminals or worktrees). This file carries the ORDER, the repo-specific
> decisions and the traps — not the vendor reference.
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

## 1 · The cycle, in order

```bash
# 1 · once per wave: create the Run (a namespace + a home inbox; it schedules nothing)
orca orchestration run-create --objective "<what is being coordinated>" --json </dev/null
#     save run_id + the coordinator handle into .session/orchestration/<slug>/run.md

# 2 · one Task per worker, BEFORE launching anything
orca orchestration task-create --spec "<one line>" --task-title "<KEY> <short>" --json </dev/null
#     --deps <json_array> exists but the element shape is undocumented: do not use it yet (gotcha G8)

# 3 · placement
#   same checkout  → nothing to create
#   worktree       → create it JUST before launching; one created half an hour earlier is born stale
orca worktree create --repo id:<repoId> --name <KEY> --no-parent --setup run --json </dev/null
git -C <wt> fetch origin
git -C <wt> merge --ff-only origin/<base>
git -C <wt> rev-parse --short HEAD          # MUST equal origin/<base>; never mask this with `|| true`
bun run worktree:provision <wt>             # references/provisioning.md

# 4 · launch with OUR argv — the byte-identical line from launch.txt
orca terminal create --worktree <active|id:<repoId>::<path>> --title "<KEY>-<slug>" \
  --command '<the launch line, verbatim>' --json </dev/null
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 180000 --json </dev/null

# 5 · ADOPT the terminal into the Task → supervised + injected preamble
orca orchestration worker-start --task <task_id> --terminal <handle> --json </dev/null   # → dispatch_…
#     native alternative when the argv does not matter (see references/orca-machine-setup.md):
#     orca orchestration worker-start --task <id> --worktree current --agent claude \
#       --model <full-model-id> --effort high --json </dev/null
#     (--model/--effort cannot combine with --terminal; --effort requires --model)

# 6 · verify it actually started (a created terminal reports success on DELIVERY, not on run)
orca terminal read --terminal <handle> --screen --json </dev/null   # look for the agent's status footer

# 7 · board card
orca worktree set --worktree <sel> --display-name "<KEY> <short>" \
  --workspace-status in-progress \
  --comment "<KEY> · Stage 1 · session <session label>" --json </dev/null

# 8 · wait INSIDE the turn, one waiter, ack in the same command that re-arms
orca orchestration check --run <run_id> --wait --types worker_done,escalation,question \
  --timeout-ms 900000 --json </dev/null
#     process the WHOLE batch → reply to every question → decide each terminal's fate → only then:
orca orchestration check --run <run_id> --ack <delivery_id> --wait --types … --timeout-ms … --json </dev/null

# 9 · close immediately (verify integration first: git cherry / PR / tracker state)
orca orchestration worker-release --dispatch <dispatch_id> --json </dev/null
#     worktree removal ONLY after the orphan audit (§6)
orca worktree rm --worktree id:<repoId>::<path> --force --json </dev/null && git worktree prune
```

**`</dev/null` on every scripted call.** The binary reads stdin when stdin is attached, and inside a
loop or a background shell that read never returns: the command hangs with no output, which is
indistinguishable from slow work. Measured 2026-09-04: a loop creating 18 tasks blocked on the FIRST
call for over three minutes; with `</dev/null` all 18 finished in seconds.

**Steps 3-4-5 plus the brief are ONE indivisible operation.** Splitting them is how a worker ends up
sitting idle: it happened twice on 2026-09-02, once for five hours.

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
| label | KEY | task_id | dispatch_id | terminal | worktree | agent | model | session label | status |
```

Without `dispatch_id` you cannot address a supervised worker; without `terminal` you cannot steer an
unsupervised one; without the session label you cannot resume it after a crash. Update the row the
moment any of those values is issued, not at the end of the round.

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

The comment is not "what I am doing". It is **how a dead session is recovered**, so it carries the
session label and whatever the harness needs to resume:

```
<KEY> · Stage 2 execution
session <session label>
branch <branch>
brief .session/orchestration/<slug>/W-<label>.md
```

Whoever opens the card can resume that exact session. Set the card at launch and at every stage
boundary, not only at the end.

---

## 4 · Waiting, and the two ways it goes wrong

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
the body that you did.

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

| Case | Close with |
|---|---|
| supervised (adopted into a Task) | `orca orchestration worker-release --dispatch <id> --json </dev/null` — closes that worker's terminal and no other; idempotent; an inspectable archive is preserved first, so `worker-read` still answers afterwards |
| needs to stay open for debugging | `orca orchestration worker-retain --dispatch <id>` — a durable exception a later explicit release clears |
| uncertain / unreachable | `orca orchestration worker-abandon --dispatch <id>` — fences it WITHOUT claiming it stopped, and touches no resource |
| unsupervised (launched without adoption) | COUNT the terminals in that worktree first, then `orca terminal close --terminal <handle> --tab --json </dev/null`. **Never** `orca terminal stop --worktree <sel>`: its radius is the whole worktree |

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
