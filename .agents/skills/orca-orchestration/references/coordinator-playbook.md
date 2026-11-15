# Coordinator Playbook: The Conductor's Full Cycle

> Loaded by `orca-orchestration` in CONDUCTOR mode.
> Load the stubs in `orchestration.orchestrator_skills` (`.agents/project.yaml`) alongside this
> skill, and ask the binary only for a deep topic a stub points at. This file carries the order,
> the repo-specific decisions and the traps, not the vendor reference. Every command below was
> checked against the live schema (`orca agent-context --json`); re-check it after any upgrade
> before trusting a flag.

---

## 0 · Before anything

1. Run the gate (`SKILL.md` §The gate). In state A or B, fall back and stop reading this playbook.
2. Ask the binary for the grammar now, not earlier.
3. Create the orchestration scope on disk: `.session/orchestration/<slug>/`, where `<slug>` names the
   wave of work (`sprint-42-qa`, `kata-fixtures-refactor`, `regression-2026-09-17`). Everything the
   fleet needs to survive a crash lives there, in the PRIMARY checkout, cited by absolute path.
4. Seed `run.md`, `roster.md`, `COMMON.md` and `launch.txt` from `templates/`. When the wave belongs to
   one workflow skill, `launch.txt` lives in that skill's scope instead and this scope does not get
   a copy (`references/launch-seam.md` §2.1).

Everything written inside a worktree dies with it. Fleet state belongs in the primary checkout, and
a worker reaches it by an absolute path in its prompt, never a relative one.

---

## 1 · The cycle, in order: the native path (supervised, the default)

Supervision comes from the launch and nowhere else. The runtime decides "is this an agent" from the
argv it started, never from the running process, so a terminal created with our own command line
cannot be adopted: `worker-start --terminal <handle>` answers `agent_unconfigured` on a terminal
whose agent is alive on screen (measured three ways, gotcha G44). The one supervised launch is the
native one.

Naming the worker is part of the launch. The task spec opens with the token
`/<workflow-skill> <label> fleet worker` (step 2), the conductor renames the tab as soon as the
handle exists (step 4b), and readiness is not confirmed until the screen shows `<label>--<handle>`
(step 5). A tab still titled `worker task ...`, or a harness-generated session title, means a step
was skipped.

```bash
# 1 · once per wave: create the Run (a namespace + a home inbox; it schedules nothing)
orca orchestration run-create --objective "<what is being coordinated>" --json </dev/null
#     save run_id + the coordinator handle into .session/orchestration/<slug>/run.md
orca terminal rename --terminal "$ORCA_TERMINAL_HANDLE" --title "conductor · <slug>" --json </dev/null
#     the conductor's own tab, so the owner finds it among the `<label>--<handle>` worker tabs

# 2 · write the BRIEFS first, then one Task per worker, BEFORE launching anything.
#     The spec is not a label. On the native path the runtime injects it as the worker's FIRST
#     PROMPT, so the worker is already executing it before step 6's prompt exists (G58). It must
#     be self-sufficient: the scope, the brief's ABSOLUTE path, the continuation sentence, and
#     anything that has to be right from the first action, the session-title token and the
#     no-stopping clause included. That is why the briefs come first: the spec cites them by path.
orca orchestration task-create --display-name '<label>' --spec '/<workflow-skill> <label> fleet worker. Read <ABS>/.session/orchestration/<slug>/COMMON.md then <ABS>/.session/orchestration/<slug>/W-<label>.md and execute your brief. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: {{MESSAGE_VERB}}. No heartbeats. ROUTE-SCOPE: <section ids>' --json </dev/null
#     <label> is the worker's ROSTER LABEL, [<KEY>-]<slug>, kebab-case, single hyphens inside
#       (`TK-123-add-google-auth`; a kebab slug such as `volatile-impl` with no ticket; the bare issue
#       key for a /sprint-testing worker). The worker's NAME is <label>--<handle>, composed once the
#       terminal exists (session-identity.md §2b); the display name here is the label because the
#       handle does not exist yet. One token, no extra words between it and `fleet worker`, or the
#       identity hook does not recognise it.
#     --display-name is the worker row's label in the app; without it the row shows the spec's first
#       line. Read it back as `.display_name` (snake_case; `.title` does not exist, G49).
#     --deps <json_array> exists but the element shape is undocumented: do not use it yet (G8)
#     Cost of a thin spec (G58): a worker ran on a one-line framing before the brief reached it, and
#       its commits carried the harness-derived session label. Unfixable once pushed (Critical Rule #6).

# 3 · placement
#   same checkout  -> nothing to create
#   worktree       -> create it JUST before launching; one created half an hour earlier is born stale
orca worktree create --repo id:<repoId> --name <label> --no-parent --setup run --json </dev/null
git -C <wt> fetch origin
git -C <wt> merge --ff-only origin/<base>
git -C <wt> rev-parse --short HEAD          # must equal origin/<base>; do not mask this with `|| true`
bun run worktree:provision <wt>             # references/provisioning.md

# 4 · LAUNCH natively: supervised, with the preamble injected by the runtime
orca orchestration worker-start --task <task_id> --worktree <current|id:<repoId>::<path>> \
  --agent <claude|codex|opencode|pi> --model <full-model-id> --effort <level> --json </dev/null
#     Model and effort: the worker tier's {{DEFAULT_MODEL}} / {{DEFAULT_EFFORT}}, unless an
#       `orchestration.model_overrides` entry for tier worker matches the brief's topics, or the user
#       said otherwise (the user always wins). A full model id, never an alias (G29).
#     The receipt is the dispatch id and does NOT carry the terminal handle (G78). Read the handle
#       from `orca orchestration worker-list --run <run_id> --json </dev/null` as
#       `agentTerminalHandle` and record both in roster.md, with the worker's Name `<label>--<handle>`.
#       (Lost them? worker-show --dispatch <id>, or terminal list --worktree <sel>.)

# 4b · name the TAB with the worker's full name now. The runtime titles every worker tab
#     `worker-<task id>` and has no flag to change that (G71). The worker renames its own tab as its
#     first action (worker-contract.md §Session naming); the conductor issues the same rename too,
#     because a worker that has not reached that action yet leaves the tab unnamed. This verb types
#     nothing into the agent.
orca terminal rename --terminal <handle> --title "<label>--<handle>" --json </dev/null
#     The label lands only once the app window has opened the tab, and `terminal list` /
#       `terminal show` report a different field, so they cannot confirm it (G72). Repeat the rename
#       in every liveness sweep (§5) and confirm on the screen (step 5).
#     --effort requires --model; neither combines with --terminal. --name names a NEW WORKTREE,
#       not the session: there is no session-name flag on this path (see §1b).
#     Prerequisites, both invisible from here: the agent's per-machine default arguments must carry
#       the flag of `orchestration.permission_modes.worker` (bypass by default; the per-harness flag
#       is in references/orca-machine-setup.md §3.1, never an edits-only mode, and `auto` is not
#       non-interactive), and credentials must reach the worker: every MCP server reads the
#       worktree's own `.env` through the `.env` loader in the MCP configs, and every other process
#       loads its own config; nothing is exported into the shell. references/orca-machine-setup.md §3.

# 5 · verify readiness on the worker's screen before sending it any work: name, credentials, mode
orca terminal read --terminal <handle> --screen --json </dev/null
#     want, all read off the screen and none assumed from a receipt:
#     (a) NAME. The tab and the session name in the status bar both read `<label>--<handle>`.
#         Claude Code and Pi: the identity hook or adapter composed it from the prompt token plus
#         the handle. Codex and OpenCode v2.2 have no hook that can: once the screen shows the TUI
#         ready, `terminal send --enter --text '/rename <label>--<handle>'`, then read the bar back.
#         A name that still reads `worker task ...`, a generated title or a bare label is a failed
#         step: rename again and re-read before dispatching. OpenCode v1 (`/rename` opens a dialog,
#         no argument) or any harness that cannot be renamed: the roster `Name` column is the only
#         record, so mark it `(roster only)`, give the worker that name for its `Session:` trailer
#         and say so once in the run report. A worker cannot run `/rename` on itself, so the brief
#         cannot carry this step.
#     (b) READINESS. The agent's status footer (model, effort).
#     (c) CREDENTIALS. Its MCP servers listed as connected (`/mcp` on Claude Code, or the worker's
#         own first probe). No credentials: provision the worktree's `.env`, restart the session,
#         and send no work until it shows them.
#     (d) PERMISSION MODE, against `orchestration.permission_modes.worker`: the status bar (Claude
#         Code shows its bypass indicator) or the process argv (`ps -o args= -p <pid>`, the pid from
#         `orca worktree ps`). A mismatch means the app's per-agent default arguments are wrong: fix
#         them (orca-machine-setup.md §3.1) and relaunch before dispatching, and record the verified
#         mode in the roster's `Mode` column. A worker in `auto` stalls on a prompt nobody sees after
#         3 consecutive or 20 total classifier blocks; an edits-only mode stalls on its first Bash.
#     A Pi worker also starts on the model in its OWN config: `--model` and `--effort` (so
#       `default_model` and `model_overrides`) never reach it, and `worker-read` reports `model: null`.
#       Read the model on its status bar and, when it differs, `terminal send --enter --text '/model <provider/id>'`.

# 6 · send the prompt: the ONE verb that reaches a running session (G46).
#     On the NATIVE path the spec already delivered this text, so step 6 is a reinforcement
#     and a no-op when the spec carried everything. On the fallback path it is the whole
#     payload. Keep the two byte-identical: the path nobody exercises is the one that breaks.
#     Anything longer than a couple of sentences goes in a FILE with a one-line pointer here:
#     a long --text is truncated and still reports accepted:true with a byte count (G60).
orca terminal send --terminal <handle> --enter \
  --text '/<workflow-skill> <label> fleet worker. Read <ABS>/.session/orchestration/<slug>/COMMON.md then <ABS>/.session/orchestration/<slug>/W-<label>.md and execute your brief. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints. Channel: {{MESSAGE_VERB}}. No heartbeats. ROUTE-SCOPE: <section ids>' \
  --json </dev/null
#     The prompt MUST OPEN with `/<workflow-skill> <label> fleet worker`: that token is what the
#     identity hook turns into the session name `<label>--<handle>` on Claude Code (there is no name
#     flag here), and what the workflow skill reads to know it is a fleet worker. Everything after it
#     is the brief pointer, the continuation sentence and, LAST, the `ROUTE-SCOPE:` sentence that
#     tells the prompt hook which instruction sections to route (launch-seam.md §2.1b).
#     On `agent_prompt_stalled` the text is usually ALREADY queued. Read the screen or
#     `worktree ps` before resending, or the worker gets the message twice (G52).

# 7 · board card: ONE fleet-level card per worktree (§3)
orca worktree set --worktree <sel> --display-name "<slug> · round <N>" \
  --workspace-status in-progress \
  --comment "<slug> · round <N> · <n> workers · run <run_id> · roster: <ABS>/.session/orchestration/<slug>/roster.md" \
  --json </dev/null

# 8 · wait INSIDE the turn, one waiter, rolling, ack in the same command that re-arms (§4)
orca orchestration check --run <run_id> --wait --types worker_done,escalation,question \
  --timeout-ms 540000 --json </dev/null
#     process the WHOLE batch, reply to every question, decide each terminal's fate, only then:
orca orchestration check --run <run_id> --ack <delivery_id> --wait --types ... --timeout-ms 540000 --json </dev/null

# 9 · close immediately (verify integration first: git cherry / PR / tracker state)
orca terminal read --terminal <handle> --screen --json </dev/null   # READ THE COST FOOTER FIRST (G54)
orca orchestration worker-release --dispatch <dispatch_id> --json </dev/null
#     worktree removal ONLY after the orphan audit (§6)
orca worktree rm --worktree id:<repoId>::<path> --force --json </dev/null && git worktree prune
```

Put `</dev/null` on every scripted call. The binary reads stdin when it is attached, and inside a
loop or a background shell that read never returns: the command hangs with no output, which looks
like slow work (G4: a task-creating loop blocked minutes on its first call).

Steps 3 to 6 (including 4b) are one indivisible operation. Splitting them is how a worker ends up
idle (once for hours, G32) or unnamed.

---

## 1b · What the native path costs, and the custom-argv fallback

The native launch is the only supervised one, and it gives up some things:

| Given up | Consequence | Compensation |
|---|---|---|
| the session-name flag, and any say over the tab title | the roster, the board card and the `Session:` commit trailer all key off the name, and the runtime titles the tab `worker-<task id>` (G71) | the prompt token and the identity hook (the adapter on Pi) name the session; the conductor renames the tab (step 4b, §5) and types the rename verb on Codex and OpenCode v2.2 (step 5). `references/session-identity.md` §2b |
| environment variables in the launch line | a worker cannot be marked as a fleet worker by an exported variable | the brief and the prompt token carry it. `sprint-testing` detects worker mode from them, not from the environment |
| the prompt in the launch itself | the worker starts idle at its prompt | step 6: `terminal send` immediately after readiness. Until it lands, the worker has nothing to do |
| a launch line that also loads the env file | every MCP server reads the worktree's own `.env` through the `.env` loader on any harness, and every other process loads its own config; a worktree without `.env` hands every server empty values | step 5: verify credentials on screen BEFORE dispatching work (`references/orca-machine-setup.md` §3.2) |

The custom-argv path (`terminal create --command '<the line from launch.txt>'` plus
`terminal wait --for tui-idle`) has one role: it is the shape of the line a HUMAN pastes when there
is no runtime, and the shape the conductor uses when it deliberately wants an unsupervised terminal
it will drive by hand. On that path:

- there is no supervision and no adoption, so do not attempt `worker-start --terminal` (G44).
- a dispatch id is still available: the plain `dispatch` form creates a dispatch row without
  injecting anything (G48), and `dispatch-show --task <id> --preamble` prints the preamble in text
  mode only (`--json` omits it, G47). Write that text to a file in the conductor's scope and send
  the worker a one-line pointer to it with `terminal send`.
- `escalation` from such a terminal is REJECTED and the refusal comes back as a `status` message
  (G53). The brief tells those workers to send blockers as `status` with the subject prefixed
  `BLOCKED:`.
- cleanup is by handle: count the terminals in the worktree, then close that one terminal and its
  tab. The release verb does not apply (§6).

```bash
# unsupervised, by choice or because no native path is available on this machine
orca terminal create --worktree <sel> --title "<label>" --command '<launch.txt line, verbatim>' --json </dev/null
#     the handle comes back only now: rename the tab to `<label>--<handle>` (step 4b) once it does,
#     and read the name back off the screen (step 5)
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 180000 --json </dev/null
orca orchestration dispatch --task <task_id> --to <handle> --json </dev/null             # dispatch id, no injection
orca orchestration dispatch-show --task <task_id> --preamble </dev/null > <ABS>/.session/orchestration/<slug>/preamble-<label>.md
#     NOTE the missing --json: this one call prints the preamble in TEXT mode only (G47)
orca terminal send --terminal <handle> --enter --text '<one-line pointer to the preamble file and the brief>' --json </dev/null
```

---

## 2 · The files a Run is made of

All under `.session/orchestration/<slug>/` (gitignored, tier LOCAL: nothing downstream may depend
on one existing on another machine):

| File | Owner | What it holds |
|---|---|---|
| `run.md` | conductor | run id, objective, coordinator handle, created-at, base branch, topology |
| `roster.md` | conductor | one row per worker (see below) |
| `COMMON.md` | conductor | the common brief every worker reads first |
| `W-<label>.md` | conductor | the per-worker brief |
| `launch.txt` | conductor | one self-contained launch line per worker, ALWAYS written; here only when no workflow skill owns the wave (`references/launch-seam.md` §2.1) |
| `claims.md` | conductor | the claims ledger (`references/claims-protocol.md`) |
| `learnings.md` | conductor | cross-session findings worth carrying to the next wave |
| `skill-improvements.md` | conductor | gaps in the SKILLS themselves that this wave exposed |
| `kickoff.md` | conductor | the handoff pointer for the next conductor |
| `reports/<label>.md` | that worker | the long report; `worker_done` points at it |

Each file has one owner, because two writers on one file in a same-checkout fleet collide. A worker
writes exactly one file: its own report.

The roster is what makes the phrasebook possible. One row per worker:

```
| label | KEY | name | task_id | dispatch_id | terminal | worktree | agent | model | mode | resume | status |
```

Without `dispatch_id` you cannot address a supervised worker, without `terminal` you cannot steer or
nudge one, and without the `name` and the `resume` command you cannot bring it back after a crash.
`name` is `<label>--<handle>`, the session name, tab title and `Session:` trailer at once; `mode` is
the permission mode verified at readiness (§1 step 5). In a same-checkout fleet the roster is the
only place per-worker recovery exists, because the board card is fleet-level there (§3). Update the
row the moment any of those values is issued, and add the worker's cost when you read the footer at
close (G54).

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

The comment is how a dead session is recovered, not a description of what you are doing. The card is
per-WORKTREE and a same-checkout fleet has one worktree for N workers (G50), so it has two shapes.

One worker per worktree: the card carries that worker's whole recovery block.

```
<KEY> · Stage 2 execution
session <label>--<handle>
branch <branch>
brief <ABS>/.session/orchestration/<slug>/W-<label>.md
```

N workers in one checkout: one FLEET-level card, with per-worker recovery in the roster, which the
card points at by absolute path.

```
<slug> · round <N> · <n> workers · run <run_id> · roster: <ABS>/.session/orchestration/<slug>/roster.md
```

The roster row makes that indirection safe, so it carries each worker's name and the exact resume
command for its harness; a card that points at a roster with no resume column recovers nothing. Set
the card at launch and at every round boundary, not only at the end.

---

## 4 · Waiting, and the three ways it goes wrong

- **A wait is rolling, not one long block.** The harness caps a foreground command at 600 s while a
  round runs tens of minutes, so a single `--timeout-ms 1800000` is killed mid-wait and a timeout
  becomes indistinguishable from a dead mailbox (gotcha G51). Wait at `--timeout-ms 540000` and
  re-arm, with the verified ack in the SAME command, as many times as the round needs. A longer
  single wait is acceptable only as a background job the harness itself tracks, never a shell `&`.
  The runtime's mailbox notice stays the primary wake-up signal; the rolling wait only keeps the
  conductor's turn open.
- **One actionable waiter per Run.** A waiter started as a shell background job holds the slot with
  nobody listening, and `check` then answers with a "waiter exists" failure instead of a batch. A
  silent mailbox and a blocked one look identical. Recover by finding and killing the stale
  `orchestration check` process, then re-arm.
- **An unacknowledged batch replays forever and hides everything behind it.** Delivery is FIFO: while
  a batch is unacknowledged, `check` keeps returning it and newer messages queue behind it, and the
  runtime emits no new notice because it notifies only on empty to non-empty. Measured (G2): an ack
  inside a compound command exited non-zero, nobody checked, and messages piled up for hours.
- **Do not build a monitor.** The runtime injects a notice into the conductor's session when mail
  arrives. A homemade monitor competes with it, arrives late, and triggers on echoes: the
  conductor's own messages are visible on the worker's screen, so a grep for a completion token
  reads them back as a report.
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
the body that you did, but only while the text still fits in a sentence or two. Past that, the
duplicate is prose through the lossy verb (hard rule 4): write the answer to a file in the Run scope,
send the one-line pointer instead, and have the worker state the decision back in its own words
before it acts on it.

**An escalation is relayed, never sat on.** A worker sends you everything that needs a person: the
four kinds of `agentic-qa-core/references/decision-protocol.md` §5 and every error or blocker it
could not clear inside its brief (`references/worker-contract.md` rule 16). For each one:

1. A technical call inside the approved plan is yours: decide it, reply, and report it as DECIDED
   with the option it beat. It is not the human's to answer.
2. Anything else goes to the human, informed (what the record says, the options with value and cost,
   one recommendation): the end-of-turn sweep for a small item, the `mkd` deck for a heavy one, at
   once when it blocks the worker
   (`agentic-qa-core/references/decision-elicitation-doctrine.md` §0, §1, §7).
3. Reply by the message id from the pending batch (`reply --id`, above), so the worker's blocking
   `ask` resolves, and record the question and the answer in the run's decision file: an owner
   answer goes to `.session/decisions/<slug>-<date>.json`, the record
   `agentic-qa-core/references/decision-protocol.md` §6 names and §2 searches first.

A worker that reports it asked the human directly (the human typed into its session, or its brief
granted it) gets the same record entry. A middle conductor (one another conductor launched, G77) is
a worker of this rule: it relays upward to its own launcher the same way, and only the session the
human types into asks the human.

**Mail is not a nudge, and a nudge is not the message.** `orchestration send --to <terminal handle>`
queues mail that a working agent never reads, because nothing tells it to run `check`, and it returns
`ok: true` exactly like the call that works (gotcha G46). The only verb that reaches a RUNNING
session is `terminal send`, which is not the channel: the message goes to a mailbox address
(`run:<id>`, `dispatch:<id>`), or into a file with a one-line pointer when it runs long, and
`terminal send` carries at most one sentence telling the busy worker to go read it
("check your mailbox: `<subject>`"). It truncates silently (hard rule 4, G60, G64), so a nudge that
grows into the instruction loses it. Full assignment: `references/channel-discipline.md`.

---

## 5 · Liveness sweep (Orca-native signals first)

Run the sweep on a cadence you choose (at each round boundary, or when the owner asks), never as a
background monitor. Native signals come first because they are cheap and truthful; the token sweep is the
fallback that works with no runtime.

1. `orca orchestration worker-list --run <run_id> --json </dev/null`: terminal-state accounting per
   worker (`active`, `reclaimable`, `retained`, `release_pending`, `release_unknown`, `released`).
   Terminal state is process accounting, reported separately from task status: a completed task can
   still own a live terminal.
2. `orca orchestration worker-show --dispatch <id> --json </dev/null`: read `observation.agentWait`.
   It names a worker parked on a prompt only a human can answer, with the evidence that proved it.
   `null` means the runtime looked and found no wait. An absent field means it never looked, and
   never means the worker is not waiting. A waiting worker is healthy, not failed.
3. `orca worktree ps --json </dev/null`: the compact cross-worktree summary, the fastest read of
   "how many are alive and where".
4. `orca terminal read --terminal <handle> --screen --json </dev/null`: for a worker that answers
   nothing. It is the only way to see a hung interactive selector (an "Enter to select" prompt),
   which produces no message because the worker does not know it is stuck.
5. Only then, the non-runtime fallback: grep the workflow's own blocked tokens in the session memory
   the workflow skill already writes, plus staleness (no progress line in more than ~20 minutes).
6. Re-issue each live worker's tab rename from step 4b, title `<label>--<handle>` with the handle
   read from `worker-list` (`agentTerminalHandle`, G78). It is idempotent, and a tab the app window
   had not opened at launch only takes the label once it has (G72). After a runtime restart the
   handles in the titles are stale (G22): match each tab on its label (the part before the last
   `--term_`), update the roster's `terminal` column, and rename with the new handle.
   The tab is half of it. A resumed worker's harness SESSION name still carries the old handle, and
   on Claude Code the identity hook will not re-title it, because it names a session only from a
   prompt carrying the fleet token and a resumed session receives none. Once the worker's screen
   shows it ready, send the rename verb of step 5 on every harness, Claude Code included
   (`terminal send --enter --text '/rename <label>--<new handle>'`; Pi `/name`), and read the bar
   back. On Claude Code that makes the name human-set, so the hook leaves it alone from then on,
   which is what a resume wants. OpenCode v1, or a harness that cannot be renamed: mark the row
   `(roster only)` as at launch. Update the roster's `name` column (keep the old name in the row's
   notes) BEFORE the first message to the resumed worker, and give it the new name in that message
   on a harness with no identity hook. Every `Session:` trailer after the resume carries the new
   name; commits made before keep the old one. Do this once per restart, not every sweep.

### Stalled is not idle, and the prompt line cannot tell them apart

The prompt box is always drawn, so a screen read that greps for the prompt character reports "idle"
for every worker, including one that is working (gotcha G55). The signal is the spinner line above
the prompt box (`✽ …ing… (Nm Ns · ↓ N tokens)`):

| Spinner on screen | `worker_done` sent | Verdict |
|---|---|---|
| yes | no | **working**. Leave it alone |
| no | no | **STALLED**. It is parked at a prompt, and a stage boundary is the usual place |
| no | yes | **idle**, finished. Read its cost footer, then close it |

A stalled worker is nudged with `terminal send`, not with mail (§4), and the nudge repeats the
continuation sentence instead of re-explaining the stage. Corroborate the verdict with the worker's
own progress timestamp before acting: a worker mid-`ask` is waiting, not stalled, and waiting is
healthy.

Screen-read traps, all paid for: the lines arrive in `result.terminal.tail` (not `result.lines`), and
a parser that looks for `lines` returns empty forever, silently. The TUI status bar uses non-breaking
spaces, so a grep with a space after a label never matches. `result.terminal.status == exited` is
usually the conductor having closed that terminal itself. If the runtime restarts, handles change
while the sessions survive as separate processes: re-discover with
`orca terminal list --worktree <sel> --json </dev/null`, then rename each tab AND each session with
the new handle (item 6 above).

`terminal read` without `--screen` returns accumulated output with escapes stripped, so a repainting
TUI comes back as stacked fragments. `--screen` and `--cursor` are mutually exclusive.

---

## 6 · Closing, in the same turn

Verify integration BEFORE closing anything: commits landed (`git cherry`), PR opened where the
strategy asks for one, tracker artifacts in their declared status. A released worker whose work
never integrated is the one failure that cannot be recovered from the board.

Read the cost footer BEFORE closing. A worker's token and context usage exists only on its own
screen and no command reports it, so closing the terminal destroys the number (gotcha G54). One
`terminal read --screen`, the numbers into `roster.md`, then close.

| Case | Close with |
|---|---|
| supervised (native launch, §1) | `orca orchestration worker-release --dispatch <id> --json </dev/null`: closes that worker's terminal and no other; idempotent; an inspectable archive is preserved first, so `worker-read` still answers afterwards |
| needs to stay open for debugging | `orca orchestration worker-retain --dispatch <id>`: a durable exception a later explicit release clears |
| uncertain / unreachable | `orca orchestration worker-abandon --dispatch <id>`: fences it WITHOUT claiming it stopped, and touches no resource |
| unsupervised (custom-argv launch, §1b) | COUNT the terminals in that worktree first, then `orca terminal close --terminal <handle> --tab --json </dev/null`. Never `orca terminal stop --worktree <sel>`: its radius is the whole worktree |

### Orphan audit before removing a worktree

Removing a worktree deletes everything gitignored inside it, silently and with exit 0. In this repo
that means the env file, captured evidence, any local session scope, the tracker cache and installed
dependencies. Before `worktree rm`:

1. `git -C <wt> status --porcelain`: uncommitted work? Commit it or copy it out.
2. `git -C <wt> cherry -v origin/<base>`: commits not in the base? Push or integrate first.
3. `bun run worktree:audit <wt>` classifies every gitignored file as STATE, CACHE, DISPOSABLE or
   UNKNOWN (`references/provisioning.md` §5) and exits 1 while STATE or UNKNOWN is only in the
   worktree. `--rescue` copies STATE to the same path under `<<PRIMARY_ROOT>>`, never overwriting;
   a CONFLICT line (the primary holds different bytes) and every UNKNOWN entry are decided by hand.
   Exit 0 is the gate. Test-run outputs are DISPOSABLE by the owner's decision and never rescued.
4. Will anyone RESUME this worker's session? A harness finds its sessions by working directory
   (Claude Code keeps transcripts under a folder named after the path), so once the directory is gone
   the roster's resume command (`claude --resume <label>`, `codex resume <label>`) has nowhere to
   run. Keep the worktree while the session may still be resumed; when you do remove it, mark the
   roster row `resume: gone (worktree removed)`.
5. Only then remove, and `git worktree prune`. From the CLI that is `orca worktree rm --run-hooks`:
   without the flag Orca skips the committed `orca.yaml` archive hook (which runs the same rescue).

Removing is part of closing, not a later chore: `worker-release` closes the agent terminal only, so
without this step the worktree, its `Setup` terminal and its local branch pile up on disk. A worktree
is removable when its HEAD is an ancestor of the integration branch, `git status --porcelain` shows
nothing that is not disposable, `bun run worktree:audit` exits 0, nobody will resume the session
(else write why in `roster.md`), and no terminal other than `Setup` is left in it. A worktree some
other session created, one not in your roster, is not yours to remove: report it to the owner with
the audit. Before the final report, `git worktree list` shows only the primary checkout plus the
worktrees `roster.md` explains; anything else is a leak, so close it or name it.

Mechanics and the untracked-files gotcha: `git-flow-master/references/worktrees.md`.

---

## 7 · Conductor-only operations (never delegated)

A fleet has exactly one writer for anything shared. These stay with the conductor:

- **Credential and token minting.** The conductor authenticates and mints tokens BEFORE launching;
  workers only read the resulting file. Per-worker isolation uses the login script's profile option
  so one worker's refresh cannot invalidate another's token. Canon:
  `agentic-qa-core/references/api-testing-doctrine.md`.
- **Schema sync** (`bun run api:sync`): one writer into `api/schemas/`, before the round.
- **Tracker pull and push at fleet altitude**: the sprint-level plan, the shared test plan, the
  cache hydration. A worker reads its own issue and does not re-hydrate the whole cache.
- **Generated registries** that every worker would otherwise rewrite (the skill registry, the KATA
  manifest). The conductor regenerates them when it integrates.
- **Arbitrating claims** (`references/claims-protocol.md`).

---

## 8 · Conductor to conductor handoff

A Run outlives the session that created it. To take over:

```bash
orca orchestration run-use --id <run_id> --json </dev/null      # run_id comes from run.md
orca orchestration task-list --run <run_id> --brief --json </dev/null
orca orchestration worker-list --run <run_id> --json </dev/null
```

Take the Run from `run.md`, not from `run-list`: Runs from OTHER repos coexist on one machine.
`orca orchestration run-current --json </dev/null` tells you what this terminal is bound to (a null
Run in an unbound terminal).

`kickoff.md` is the handoff pointer, written by the outgoing conductor and loadable as-is by the
incoming one: the Run id, the topology, which rounds closed, what is in flight with its dispatch
ids, the open claims, the next decision waiting for the owner, and the absolute paths of the scope
files. One file, no archaeology.

---

## 9 · Cross-session memory

Three files in the scope, one owner each, appended and never rewritten:

| File | What goes in | What does NOT |
|---|---|---|
| `learnings.md` | facts about the SYSTEM under test or the repo that the next wave needs | per-worker narrative |
| `skill-improvements.md` | gaps in the skills themselves: a missing step, a wrong order, a stage that has no verifier | bug reports about the product |
| `kickoff.md` | the handoff pointer above | a diary |

Harvest at the close of the wave by calling the Skill tool with "retro". Give it the run's scope
and have it write its ranked candidates into `learnings.md` and `skill-improvements.md`, applying
none of them: a conductor with nobody at the keyboard files them for the launcher, and a person
present reads them in order. When `retro` is not installed, do the harvest inline from the same
two files and say so in the run report; it never blocks the close. `skill-improvements.md` is the
input for a `/framework-development` pass, and `learnings.md` for the next wave's `COMMON.md`.
Neither is a deliverable; anything the team needs lives in the tracker.
