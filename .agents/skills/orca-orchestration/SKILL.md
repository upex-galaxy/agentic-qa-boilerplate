---
name: orca-orchestration
description: "Run a conductor plus a fleet of persistent worker sessions through the Orca runtime. Use when asked to orchestrate or parallelize across sessions; to talk to, steer, check, resume or close a worker; to set up a worker worktree or an unattended routine; or when a brief names this skill. Not for a plain handoff (orca-cli)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [orchestration]
metadata:
  kind: workflow
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the doctrine below and in references/.
compact_rules: |
  - Gate on the binary plus a reachable runtime, never on whether a vendor skill is installed. Three states: A no binary, B binary with unreachable runtime, C ready. In a workflow skill, states A and B are total silence: do not name the orchestrator, do not list it as a prerequisite, do not mention it in an ATR or a blocked-token sweep. The one-line install recommendation belongs to THIS skill and fires only because the user asked for orchestration. One workflow skill is the declared exception: `/sprint-conductor` exists to run on Orca, so when the gate fails it stops with one line naming it (owner decision); every other workflow skill keeps the silence.
  - Write the launch file always, with or without a runtime, and keep the PROMPT identical on both paths, byte for byte, opening with `/<workflow-skill> <label> fleet worker` and carrying the no-stopping sentence. A worker's name is `<label>--<handle>` everywhere (harness session, tab, roster, `Session:` trailer), where `<label>` is `[<TICKET-KEY>-]<slug>` with a slug of 3 or 4 words. The hook composes the session name on Claude Code and the adapter on Pi, the conductor types the rename verb on the other harnesses, and the conductor renames the tab right after the worker starts and again every sweep. Orca's default tab name (`worker-<task id>`) and a harness-generated title are not acceptable names. The launch line is for a human to paste; the prompt is the payload both paths share, and a paraphrased prompt is the failure this rule prevents.
  - Do not copy the vendor command grammar into this repo. Load the stubs listed in `orchestration.orchestrator_skills` (`.agents/project.yaml`) alongside this skill, for conductor and worker alike (they are small), and ask the binary only for the deep topics a stub points at.
  - One-shot subagents are the default executor (AGENTS.md §3, unchanged). A supervised worker is the declared exception: persistent, addressable, owns a scope end to end.
  - No periodic heartbeats, even though the injected preamble asks for them: each one wakes the conductor to read the word "alive". A worker sends exactly three things: `worker_done` (once, with an explicit outcome), `ask` (blocking), `escalation`. The brief prohibits heartbeats in writing.
  - A worker does not use the harness's own agent-to-agent messaging or user-question tools: from an isolated worktree the conductor is not addressable and nobody watches a user prompt. The channel is the orchestration mailbox, and a question that does not block goes out as a message while the worker keeps going on everything that does not depend on the answer.
  - Every error, blocker and decision a worker cannot take inside its brief goes to the session that launched it, never to the human: the four kinds of `agentic-qa-core/references/decision-protocol.md` §5 and every error or blocker it cannot clear go out as a blocking `ask`, an `escalation` or a `BLOCKED: ` status, never guessed. A worker uses no structured-question tool, no `mkd` deck, no sweep. A technical call inside the brief is the worker's, reported as DECIDED. Exception: the human typed into the worker's own session or the brief grants it in writing, and the worker tells its conductor. The conductor decides a technical call inside the plan, relays the rest to the human (sweep small, deck heavy), replies by message id and records it in the run's decision file. Canon: `references/worker-contract.md` rule 16.
  - The channel is an assignment, not a preference. `orchestration send` carries every message between sessions and is byte-intact; anything longer than a couple of sentences goes in a file with a one-line pointer. `terminal send` drives a terminal (commands, CLI calls, harness slash-commands, keystrokes) and nothing else, because it truncates silently, keeps only the tail and still reports success. The one exception is the launch handoff prompt of a supervised worker, which has no argv to travel in: keep it short and point it at a file.
  - Acknowledge every mailbox batch, verified, in the same command that re-arms the wait, and never inside a compound command whose exit code can be swallowed. An unacknowledged batch replays forever and hides what is queued behind it. Roll the wait in windows of at most 540 s, because the harness kills a foreground command at 600 s. One waiter per Run, never a shell background job, never a self-built monitor: the runtime notifies the conductor on its own.
  - Launch a supervised worker natively (the runtime starts the agent: task, worktree, agent, model, effort) and send its prompt as the immediate next step. A terminal created with our own command line can never be supervised (the runtime recognizes only agents it started); custom argv is the human-paste and deliberately-unsupervised shape.
  - Verify credentials on the worker's own screen before dispatching work to it. The native launch has no argv: every MCP server reads the worktree's own `.env` through the `.env` loader in the MCP configs, and every other process loads its own config (Bun autoload, `acli` stored auth, `varlock run` for a raw `curl`); no secret is exported into the worker's shell. Evidence is its MCP servers connected (`/mcp` on Claude Code) and its worktree holding `.env`; without them the worker fails much later at its first authenticated call.
  - Tell every worker, in the prompt and in the brief, to run every stage without returning to the prompt until `worker_done` is sent: a stage boundary is not a checkpoint. Name the one `ask` that is mandatory: when a worker's own measurement contradicts a conductor instruction, it stops and asks with both readings and the evidence, never silent compliance, never silent deviation.
  - Create, launch, name and brief are one indivisible operation. Verify a few minutes later that the brief actually landed (a created terminal reports success when the text was delivered, not when it ran). Readiness is not completion.
  - Close a finished worker in the same turn, and read its cost footer off its screen first: its token and context usage dies with the terminal. Release the supervised worker by its dispatch; without a dispatch, count the terminals in that worktree before closing anything, because the stop verb's radius is the whole worktree. `worker-release` closes the agent terminal only: the worktree, its `Setup` terminal and its local branch survive it and pile up on disk. So after the orphan audit (everything gitignored inside the worktree dies with it) the conductor removes the worktree in the same turn (`orca worktree rm --run-hooks`) and confirms with `git worktree list`. A worktree stays only with a written reason and an owner in `roster.md`.
  - Pick the topology by what the work writes: manual QA and backlog grooming run as a fleet in the SAME checkout (state lives in the tracker); anything that writes code gets one Orca worktree per worker, because two sessions in one checkout collide on the git index even when they never touch the same file. Never two workers owning the same module.
  - Declare a claim before touching shared fixture data or a shared credential, with one of three intents (`read`, `write`, `enumerate`; a listing that exposes siblings' entities is never an assertion target). A claim already listed in the brief is pre-granted: the worker announces it and works. Only a claim discovered mid-run waits, and the conductor arbitrates it: first message wins, it keeps the ledger and broadcasts the grant. Conductor-only operations (login and token minting, schema sync, tracker pull and push) are never delegated.
  - Provision a fresh worktree before launching. A missing step disguises itself as something else: an absent env file reads as "the tool does not exist", absent dependencies as "a broken import".
  - `.agents/project.yaml` `orchestration` holds defaults only (worker cap, agent, model and effort per tier, permission mode per tier, model overrides by topic). An explicit user instruction in the conductor session overrides them for that run; the defaults apply only when the user said nothing.
  - Brakes for automations and workers: a run's output passes automated checks, a cold review by a reader that did not write it, and a person's review after the run ends, which never blocks the run. Add one automatic trigger at a time, throttled; cap any loop at a few tries, then report `BLOCKED: `. A fix run never chains: a failure inside a fix run's own work triggers no further run. Canon: the body section "Brakes".
  - An unattended or long worker keeps a decision log with one row per decision, evidence as a pointer (`/show-me-your-work`, or its six columns by hand when it is not installed). Canon: the body section "Decision log".
  - When running as an unattended routine (AUTOMATION mode), take the routine's lock first (`<<PRIMARY_ROOT>>/.session/orchestration/automations/<routine>/lock.json`, created no-clobber, then read back), because a manual fire bypasses the precheck and can overlap a scheduled one. A live lock means exit with a one-line report, never wait or queue; a lock older than the prompt's `stale_after_minutes` is reclaimed and the reclamation reported; a prompt with no window fails closed. Delete the lock as the run's last step. Canon: `references/automations.md` §2.
  - When running as an unattended routine, open at most `orchestration.max_workers` workers in total, in one round (lower if the prompt says so), and list the rest as deferred. Nothing eligible is a correct outcome: do not pick a marginal item to fill the report. Write the run report at every step boundary, never only at the end, and select a Story for testing only after the deploy check says its merge is on the target environment. The deployed environment is truth, the tracker is a hint.
  - A commit produced by any session carries the forensic trailers (`Worktree:` then `Session:`), which are mandatory and are NOT AI attribution. Canon: `/git-flow-master`.
---

# Orca Orchestration: One Conductor, a Fleet of Sessions

This skill covers work that does not fit in one session. A conductor talks to the owner and coordinates workers. Each worker is a persistent agent session that owns a scope from start to finish, reports through a mailbox, and can be interrupted, questioned and resumed. The fleet is all workers of one Run.

Everything here has a path that works with no runtime at all: the same launch lines, pasted into terminals by a human, and the same tokens and artifacts the workflow skills already write. What the runtime adds is the step a human would otherwise do by hand, plus a mailbox instead of screen-scraping.

**Read full SKILL.md when**: starting a fleet cold, arbitrating a claim, choosing a topology, recovering a Run from a previous session, or writing an unattended automation.

---

## When to use

- The user asks to parallelize, orchestrate, or run one session per story, module or failure cluster.
- The user wants to talk to, steer, interrupt, question or close a session that is already running.
- The user wants the state of a fleet, or to pick up a wave from a previous session.
- A brief names this skill (WORKER mode).
- An unattended routine has to dispatch work with nobody at the wheel.

## When not to use

| Situation | Use instead |
|---|---|
| a read, a verification, a map: anything that fits in this turn | one-shot subagents (AGENTS.md §3). This is most work |
| "hand this task to another agent and forget it" | a handoff, not orchestration: no Task, no Dispatch, no mailbox. Ask the binary for its `orca-cli` guide |
| "hand this whole session to a fresh one, my context is full" | `/session-handoff` (ownership transfer, same worktree, same harness) |
| per-ticket manual QA | `/sprint-testing` |
| writing test code | `/test-automation` |
| branch, commit, push, PR mechanics, or a plain `git worktree` with no fleet | `/git-flow-master` |
| one long task, one session, no siblings | just do the task |

---

## Quick start (conductor)

1. Run the gate. State A or B: say the one line below and continue on the fallback.
2. Load every skill in `orchestration.orchestrator_skills` now, alongside this one. They hold the vendor's command grammar; this skill holds the when and the what, and skipping the stubs produces invented flags. Ask the binary for a deep topic only when a stub points at one (`{{ORCHESTRATOR_CLI}} skills get <topic>`), or directly when nothing is installed.
3. Pick the topology from what the work writes (`references/topologies.md`), and run the triage-time collision check in claim vocabulary (`references/claims-protocol.md` §5).
4. Create the scope `.session/orchestration/<slug>/` and seed `run.md`, `roster.md`, `COMMON.md`, `launch.txt` from `templates/`.
5. Run the cycle in `references/coordinator-playbook.md` §1, in order: Run, Tasks, placement, native launch, verify readiness and credentials on screen, send the prompt. The last three are one step. Naming is part of launching, for every worker anyone launches, a workflow-launched session included:
   - the worker-start spec opens with the token `/<skill> <label> fleet worker`, with `<label>` as `[<TICKET-KEY>-]<slug>` and a 3 or 4 word slug, and nothing between the label and `fleet worker`;
   - right after the start, rename the tab to `<label>--<handle>` (the handle is `agentTerminalHandle` from `worker-list`);
   - verifying readiness includes reading that tab name back off the screen, and the session name on the status bar. The harness session name is `<label>--<handle>` too. A tab still reading `worker-<task id>`, or a generated session title, means the step failed: fix it before sending any work.

   Who sets the session name per harness is in `references/session-identity.md` §2b.
6. Wait inside the turn: one waiter, rolling windows of at most 540 s, ack verified in the same command that re-arms.
7. Close each finished worker and its worktree in the same turn: orphan audit first, then remove (`references/coordinator-playbook.md` §6).
8. Harvest `learnings.md` and `skill-improvements.md`, write `kickoff.md`, then report to the owner.

---

## Three layers, and ours points instead of copying

```
LAYER 3 · REPO DOCTRINE      .agents/skills/orca-orchestration/   (T1, versioned, this skill)
   when to split work · topology per activity · provisioning · brief · measured gotchas · phrasebook
        ^ points at v
LAYER 2 · GRAMMAR + MACHINE  orca skills get orchestration      (mailbox, Run, Task, worker lifecycle)
                             orca skills get orca-cli           (terminals, worktrees, board, browser)
   served BY THE BINARY, versioned with it. The user-level stubs carry the command grammar and load alongside this skill; the binary serves the DEEP topics a stub points at.
        ^ operates on v
LAYER 1 · APP                the app running · runtime reachable · board · phone
```

If the binary's own guide says it, this skill carries a pointer, not a copy, because a copy desynchronizes in silence on the next release. What lives here is what no vendor guide has: this repo's provisioning gaps, the topology per activity, the brief, the measured gotchas, the git integration and the owner phrasebook.

The gate therefore looks at binary plus runtime, never at whether the vendor skill is installed. A machine with the binary and no stubs is fully capable.

On cost: the user-level stubs are small (measure with `wc -c` on the installed stubs; the figure is in `.context/ADR/ADR-0006-forensic-measurements-ledger.md`). Only the topic payload the binary serves on demand (`{{ORCHESTRATOR_CLI}} skills get <topic>`) is large. So `orchestration.orchestrator_skills` load alongside this skill, never instead of it: a small load up front is cheaper than one iteration spent correcting an invented flag.

The list is `orchestration.orchestrator_skills` in `.agents/project.yaml`, not a name written here. An empty list means nothing is installed, and the skill asks the binary for its grammar.

---

## The gate: three states

```bash
command -v orca >/dev/null 2>&1 \
  && [ "$(orca status --json </dev/null 2>/dev/null | jq -r '.result.runtime.reachable' 2>/dev/null)" = "true" ]
```

The reachability flag is nested (`.result.runtime.reachable`). A gate that looks for a flat field fails closed and silently on a perfectly capable machine. Verify any edit to a gate by running both branches.

On Linux, inside an Orca-managed terminal `orca` resolves to the Orca CLI (Orca exports `ORCA_APP_VERSION` and `ORCA_TERMINAL_HANDLE` there). Outside one, probe `orca-ide`, because bare `/usr/bin/orca` is the GNOME screen reader. The hook's `orcaAvailable()` applies this rule; use the same executable for every later command in the session.

| State | In a workflow skill (`sprint-testing`, `test-automation`, ...) | In this skill |
|---|---|---|
| A, no binary | total silence: not named, not recommended, not a prerequisite, not in the ATR, not in the blocked-token sweep. The flow writes its launch file and the human pastes the lines. The one exception is `/sprint-conductor`, which runs only on Orca: one line, then it stops | one line, only because the user asked for orchestration (exact text below), then continue on the fallback |
| B, binary, runtime unreachable | silence (same fallback). `/sprint-conductor` opens the app once and re-checks once, as this skill does; still unreachable, it gives its state-A line | `orca open --json` once, re-check once; still unreachable, treat as state A |
| C, ready | the reinforcement activates without announcing itself: the runtime launches the workers and delivers the identical prompt, and they report to the mailbox in addition to the file tokens | full mode: conductor, worker, automation |

The exact recommendation (state A or B, this skill only), adapted to the user's language:

> Level-1 orchestration is already available in this session: one-shot subagents (AGENTS.md §3). That is mini-orchestration and it covers reads, verification and mapping. Professional orchestration (persistent sessions you can talk to, a mailbox, a board, your phone) needs Orca installed on this machine. Without it I will still write `launch.txt` with one ready-to-paste line per worker, and you open the terminals.

The test for any future edit: would the line still make sense, unchanged, to a tester who has never heard of Orca? If not, it belongs in this skill. What a workflow skill must guarantee is that the absence of the orchestrator costs nothing and is never reported, so it may carry a few gated lines.

---

## Orchestration executors (complements AGENTS.md §3)

AGENTS.md §3 stays active: one-shot subagents remain the default executor. A supervised worker is the declared exception, because it breaks three assumptions the one-shot contract makes (a fresh agent per dispatch, no channel until it finishes, the orchestrator as the only one who can ask the user).

| | One-shot subagent (default) | Supervised worker (this skill) |
|---|---|---|
| Lives | inside the turn | until you close it |
| Context | lost when it reports | persists; you keep talking to it |
| Channel | none until it finishes; cannot be paused | messages, blocking questions and replies at any time |
| Owner sees it | no | yes: board, terminal, phone |
| Git | the orchestrator's | its own (worktree) or shared under explicit file ownership |
| Best for | reading, verifying, mapping; the 7-component briefing | writing and integrating on its own; a whole story; long work; when the owner wants to step in |

In practice the subagent explores and returns a map; the worker executes a complete scope. The fan-out cap of the dispatch doctrine still applies to fleets, for a different reason: tracker and TMS rate limits, not context.

---

## Modes

| Mode | Who | Loads | Does not load |
|---|---|---|---|
| CONDUCTOR | the session talking to the owner | this SKILL.md + `references/coordinator-playbook.md` + every stub in `orchestration.orchestrator_skills`, loaded up front; a deep topic from the binary only when a stub points at one | nothing else; its reads go through subagents |
| WORKER | each launched session | `orchestration.orchestrator_skills` + `references/worker-contract.md` (short) + `references/channel-discipline.md` (shorter) + its domain skill (`/sprint-testing`, `/test-automation`, ...) | nothing else: the injected preamble carries the rest of its contract |
| AUTOMATION | an unattended scheduled routine | `references/automations.md` + this SKILL.md in conductor mode | anything that produces output: the dispatcher never produces |
| OWNER | the user, by chat or phone | the phrasebook below | |

---

## Decision tree: is this even orchestration?

1. Does the work fit in this turn, and is it a read, a verification or a map? Use a one-shot subagent and stop. This is most work.
2. Do you want to hand the work away and stop caring? That is a handoff, an ownership transfer, not orchestration: no Task, no Dispatch, no mailbox. A single task handed to another agent is the binary's `orca-cli` guide; a whole session handed to its own successor because the context window is filling up is `/session-handoff`.
3. Do you need to supervise, wait for results, answer questions, or coordinate a dependency graph? That is orchestration. Continue.
4. Does the work write code? One Orca worktree per worker. Does it not? A fleet in the same checkout. See `references/topologies.md`.
5. Do you want the workers supervised (addressable by dispatch, closable one by one, preamble injected)? Use the native launch and nothing else: the runtime recognizes only agents it started itself. The agent's per-machine default arguments decide only the worker's permission mode: the conductor verifies it at readiness against `orchestration.permission_modes.worker` and fixes a mismatch before dispatching work (hard rule 5). Credentials reach the worker through a provisioned `.env`, which every MCP server reads through the `.env` loader (`references/orca-machine-setup.md` §3).
6. Is there no human at the wheel? `references/automations.md`.

---

## The owner phrasebook

The owner speaks natural language to the conductor and the conductor translates. The roster resolves "the one on BK-123" into a task, a dispatch, a terminal handle and a worktree. The phrases below are examples; the conductor matches by meaning, in the owner's language.

| The owner says | The conductor does | Notes |
|---|---|---|
| "how are they doing?" / "fleet status" | task list (brief) + worker list + the cross-worktree summary | answer as one table: KEY, stage, state, last message |
| "talk to the worker on BK-123, tell it ..." | the message goes to the mailbox (`orchestration send`, or a file plus a pointer if it runs long); `terminal send` may carry only a one-line nudge ("check your mailbox: `<subject>`"), and only when G46 says the worker is busy and would not read mail between turns | hard rule 4. Mail does not reach a busy worker and reports success anyway (G46), which is why the nudge exists; the nudge is not the message. The roster resolves the label |
| "ask W2 whether ..." | a question message to that dispatch, then one mailbox wait | |
| "what is X doing?" | read the worker's output by dispatch, then the rendered screen as backup | the screen is backup, never the channel |
| "tell it yes" | reply to that message id | the id comes from the pending batch |
| "launch another worker for ..." | task-create, placement, native launch, name the tab, verify on screen, send the prompt | one indivisible operation (see the playbook) |
| "pause / interrupt X" | send an interrupt into its terminal, then verify on the rendered screen | there is no native pause or resume |
| "close X" / "it is done" | release the supervised worker by dispatch; without a dispatch, count terminals, then close that one terminal and its tab | never the worktree-wide stop without counting |
| "pick up last night's wave" | bind this session to the existing Run id from `run.md`, then list tasks | a Run outlives the session that made it |
| "send me the summary on my phone" | board card comment + an HTML log as a shareable artifact | |

---

## Hard rules

Many of these also appear in short form in the frontmatter `compact_rules`. The numbers stay stable because other files cite them.

1. A finished worker is closed in the same turn. Live worktrees left open have taken the runtime down (G31).
2. Provision the worktree before launching (`references/provisioning.md`). Provisioning gaps disguise themselves as other failures.
3. Create, launch, name and deliver the brief are one indivisible operation. Verify with a working-tree status check a few minutes later: a worker has sat idle for hours because the brief never arrived (G32). Naming is inside the operation (Quick start step 5).
4. The channel is an assignment: `orchestration send` carries every message between sessions, long text goes in a file with a one-line pointer, and `terminal send` only drives a terminal (G60, G64, G66). The test: if a human would read it, it does not go through `terminal send`; if a shell or a TUI would execute it, that is what the verb is for. The one exception is the launch handoff prompt (G58). So the line is not "no prompt through `terminal send`", it is no conversation through it. Full discipline: `references/channel-discipline.md`.
5. Launch each tier in the permission mode `orchestration.permission_modes` declares, never an edits-only mode. The defaults (ADR-0024: `.context/ADR/ADR-0024-agentic-work-profile-and-permission-posture.md`) are conductor `auto`, worker `bypass`, subagent `inherit`, translated per harness in `references/orca-machine-setup.md` §3.1. `auto` is not non-interactive: Claude Code's classifier pauses and prompts after 3 consecutive or 20 total blocks, so a worker nobody watches defaults to `bypass`. An edits-only mode makes every Bash call wait on an absent human; one worker left every tracker mutation computed and unexecuted (G27). A supervised worker's mode comes from the app's per-agent default arguments, not from the launch, so the conductor verifies it at readiness (status bar or process argv) and fixes a mismatch before dispatching work. Orca's own default Claude launch already carries the bypass flag (G79).
6. Acknowledge only a batch you processed, verified (the acknowledged id equals the one requested and the pending count drops), never inside a compound command.
7. Do not build a monitor; roll the wait in windows of at most 540 s, each re-armed with the verified ack in the same command. The runtime notifies the conductor when mail arrives, and a homemade monitor competes with that notice and triggers on echoes of the conductor's own messages.
8. The stop verb has worktree radius: count first. To close one terminal, close that terminal (and its tab).
9. A base-ref flag resolves local refs: verify the new worktree's SHA against the remote base, with no `|| true` to hide the failure.
10. A workflow skill never names the orchestrator to the user when the gate fails, and never puts it in prerequisites, in a non-bypassable probe, in the ATR environment block, or in a blocked-token sweep. The single exception is `/sprint-conductor`, which the owner invokes to run on Orca: its gate failure is one line and a stop, never a prerequisite list or a recommendation.
11. Text typed into a terminal and not sent is not an instruction.
12. One dev server and one browser per worktree; close every browser-automation session before reporting (orphaned headless browsers, measured: G37).
13. Critical Rule #15 counts double in a same-checkout fleet: no global discards, because another session shares the tree.
14. Worker commits carry zero AI attribution (Critical Rule #3) and the two forensic trailers (`Worktree:` / `Session:`), which are forensics, not attribution. Canon: `/git-flow-master`.
15. A stage boundary is not a checkpoint. The prompt and the brief both say: run every stage until `worker_done` is sent. The pressure has to be in the prompt, because as a file pointer it reads as reference material (G58: workers stopped mid-work on briefs that already forbade checkpoints).
16. "My measurement contradicts the conductor" is a mandatory `ask`: the worker stops and sends both readings with its evidence. A worker once refused a wrong instruction from its conductor and was right, and nothing else in the run came close in value.
17. A success code describes the call, never the outcome: verify at the destination. Four surfaces returned success while nothing arrived: a launch line that died in the shell (`terminal create --command`, G11), a `terminal send` that delivered a tail fragment (G60, G64), an `orchestration send` receipt carrying `"delivered_at": null, "read": 0` next to proof of acceptance (G67), and a dispatch reading `dispatched` for a terminal that no longer existed (G68). A green receipt suppresses the check that would have caught the failure. Read the screen, the mailbox, the row.
18. `ok: false` on a `terminal send` means a human is typing in that terminal. Do not retry: it is the runtime protecting that person's input box, and a retry interleaves your keystrokes with theirs. Wait, then read the screen (G65). Do not conclude the session is unreachable.
19. A message that begins mid-sentence is a truncation until proven otherwise: the head is what gets lost, so the damage looks like a typo (G64). Ask for the pointer. Do not answer the fragment or reconstruct what it said.
20. A name is not an address: sign with the terminal handle plus the Run id. Names failed three measured ways (G69, G70): resolving to nothing, resolving only to the session itself (unresolvable by every peer, and it looks verified from inside), and prefix-matching the wrong session in another repository with a success return. A brief, report or seed names its author by `ORCA_TERMINAL_HANDLE` (in the environment, not a self-report) plus the Run id.
21. The channel carries no identity, so a recipient verifies the sender. A recipient that cannot identify the sender from the payload asks instead of inferring (G69). It bites hardest on a reply: a scope agreement about one repository once landed in a session working in another.
22. A conductor decides scope; a worker decides execution. The split is blast radius: anything that widens the brief (a new file owner, another ticket, a different branch, a schema or fixture other workers share) stops and escalates, because a quiet widening is invisible to the claims protocol. A brief so narrow the worker must widen it to finish is a conductor defect.
23. A report is a count, not a narrative. "Mostly done" is not a state a conductor can act on. Every stage and standby report leads with numbers (passed, remaining, blocked and on whom), prose after, if at all. Full shape: `references/standby-report-contract.md`.
24. A session launched by another session never asks the human: its errors, blockers and the four escalation kinds of `agentic-qa-core/references/decision-protocol.md` §5 go to its launcher, and a technical call inside its brief is its own, reported as DECIDED. Canon: `references/worker-contract.md` rule 16, `references/coordinator-playbook.md` §4, `agentic-qa-core/references/decision-elicitation-doctrine.md` §0.

---

## Brakes for automations and workers

Every automatic trigger speeds the fleet up, and a fleet without brakes produces fast, unreviewed output. Three brakes apply to what a routine or a worker produces:

- automated checks: the repo's own gates, read from `package.json` (Critical Rule 11);
- a cold review by a reader that did not write the work (a one-shot subagent, or a worker with no part in it), against the ticket and the standards;
- a person reading the result before it merges or ships. This brake never makes a run wait: the run reports and ends, and the person's later change to the tracker or the branch starts the next run.

Start slow. Add one automatic trigger at a time and throttle it at first (a daily cadence, a small batch), then widen it as the brakes earn trust. Cap any loop of runs at a few tries (three) and then report `BLOCKED: ` to the launcher. A fix run never chains: a failure inside a fix run's own work triggers no further run, because a fix changes the system itself and always gets a person's review.

Source: the software-factory skill (Matt Pocock's skills repository), adapted. It adds no wait, so every mode keeps its own path: the conductor holds the gate for a supervised worker, and the delegating brief is the approval source for a routine.

## Decision log

A routine, and any worker that runs long or past a person's attention, keeps a decision log in the run scope: `decisions.tsv` for a routine, `decisions-<label>.tsv` for a worker. One row per decision, evidence as a pointer (a commit, a path, a screenshot), never a paragraph. It complements the `DECIDED:` lines in reports and the run's decision file; it does not replace them.

Call the Skill tool with "show-me-your-work" for the format. When that skill is not installed, keep the same six columns by hand (`ts`, `phase`, `decision`, `why`, `evidence`, `result`) and say so in the report. The log never blocks a run: a failed append is reported and the run continues.

---

## Defaults: the `orchestration` block

`.agents/project.yaml` carries an `orchestration` block owned by this skill: the worker cap per round (`{{MAX_WORKERS}}`), the default agent (`{{DEFAULT_AGENT}}`), and the agentic-work profile per tier. Variable syntax: `.agents/README.md`. How the conductor applies each key:

| Key | Applied |
|---|---|
| `{{DEFAULT_MODEL}}` / `{{DEFAULT_EFFORT}}` | the worker tier: passed to `worker-start --model / --effort` (supervised) or written into the `launch.txt` line (pasted path). A full model id, never an alias (G29); empty is allowed only when the conductor reads the model off the worker's screen and records it in the roster |
| `{{CONDUCTOR_MODEL}}` / `{{CONDUCTOR_EFFORT}}` | the conductor tier: the model and effort a conductor session runs at, including a middle conductor another conductor launches (`agent launch`, G77) |
| `{{SUBAGENT_MODEL}}` | one-shot subagents dispatched inside a turn, written in the harness's own subagent vocabulary (Claude Code's Agent tool: `sonnet`, `opus`, `haiku`, `fable`), never a full id |
| `orchestration.permission_modes` | a map read by path: the mode per tier (`conductor`, `worker`, `subagent`) in the repo vocabulary `bypass` / `auto` / `ask` / `inherit`, translated per harness in `references/orca-machine-setup.md` §3.1; the conductor verifies the worker's mode at readiness (hard rule 5) |
| `orchestration.model_overrides` | a list read by path: each entry (`topics`, `tier`, `model`, `effort`) is matched against the brief's topics when the conductor picks a tier's model and effort; a match replaces the tier default for that brief only |

These are defaults, not policy. An explicit user instruction in the conductor session overrides them for that run ("run six", "codex for this one"); do not ask the user to confirm a default they never mentioned, and do not override an instruction they gave because the yaml disagrees.

Two vocabulary rules keep reports readable. A round is one concurrency group, up to the worker cap in flight at once. A wave is a tracker-status bucket and exists only in `sprint-testing`; rounds are numbered inside a wave ("Wave 1, round 2"), and "wave" is never reused for concurrency.

---

## The fallback, in full

With no binary and no runtime, nothing about the work changes. Only who does the launching, and how state is read, differs:

| Step | Fallback |
|---|---|
| plan | identical: same topology decision, same triage-time collision check, same rounds |
| brief | identical: `COMMON.md` + `W-<label>.md` in the scope, cited by absolute path |
| launch | the conductor prints `launch.txt` and the human opens N terminals and pastes N lines. This is the only path where the launch line itself is the payload, which is why the file is still written unconditionally |
| identity | Claude Code and Pi: the identity hook or the adapter names the session from the prompt token (the line carries no name flag); Codex and an OpenCode whose `/rename` takes an argument: the human types `/rename <label>--<handle>` once it is up (`<label>` alone outside Orca); a worker never renames its own session |
| state | the workflow's own blocked-state tokens plus the tracker, exactly as a single session already does |
| questions | the worker writes the question in its report with options and a recommendation, and keeps going on what does not depend on the answer |
| close | the human closes the terminals |
| claims | the degraded append-only ledger (`references/claims-protocol.md` §6), with smaller rounds |

This path is the contract and the runtime path is the shortcut, so the prompt is identical on both, down to its opening token and its no-stopping sentence: the path nobody exercises is the one that silently breaks in three weeks. A supervised worker has no argv, so the shared thing is the prompt, and it carries the behaviour.

---

## Distinctions this skill nails down

| Frequent confusion | What is actually true |
|---|---|
| installing the vendor skill enables orchestration | No. The binary already carries the commands, so a machine without the stubs is still capable. The stubs are the loaded grammar, not a precondition. The gate is on the binary |
| a harness worktree equals an Orca worktree | No. The harness one lives inside the repo, invisible to the board and the phone, with no managed terminal. The Orca one has a card, terminals, a browser, and is reachable from the phone. To orchestrate, use the Orca one |
| a context-only injection leaves a supervised worker | No: it is deliberately unsupervised, and the release verb does not close it. Supervised means the native launch |
| a custom-argv terminal can be supervised | No. The runtime decides "is this an agent" from the argv it launched, never from the running process, so adoption is refused on a terminal whose agent is alive on screen (`references/gotchas.md` G44). Supervision is the native launch or nothing |
| the terminal went idle, so the worker finished | No: idle means ready for input; finished means `worker_done`. The prompt line is always drawn, so it cannot tell you either: the spinner line is the signal, and no spinner without `worker_done` means stalled, not idle (G55) |

---

## References

| File | What it holds |
|---|---|
| `references/coordinator-playbook.md` | the full conductor cycle: roster and run files, board card, waiting and acking, liveness sweep, closing, conductor-only operations, conductor handoff |
| `references/channel-discipline.md` | which verb carries what, the one exception, how to read a send result |
| `references/worker-contract.md` | what a worker does, what the brief says, the report protocol |
| `references/claims-protocol.md` | claims over shared fixtures, data and credentials, with the non-runtime fallback |
| `references/topologies.md` | topology per repo activity, "when a worktree", git rules per topology |
| `references/provisioning.md` | what a fresh worktree lacks and how to repair it |
| `references/brief-template.md` | the fleet extension of the 7-component briefing, plus the two templates |
| `references/standby-report-contract.md` | what a session emits when it stops: read when a session goes to standby or reaches a final status |
| `references/gotchas.md` | every measured gotcha with symptom, fix, date and verified version, plus the vendor guide's known lies |
| `references/automations.md` | unattended routines: run discipline, recipes, the frozen-prompt trap, cost per wake-up |
| `references/launch-seam.md` | how a workflow skill writes its launch file and its gated lines |
| `references/html-surfaces.md` | opening a generated page in a worktree-bound browser tab |
| `references/orca-machine-setup.md` | the one-time per-machine checklist (not versionable) |
| `references/session-identity.md` | session identity per harness, the label rule, the commit trailers |
| `templates/run.md` · `templates/roster.md` · `templates/launch.txt` · `templates/COMMON.md` · `templates/W-brief.md` | the files a Run is made of |

Related repo doctrine: `agentic-qa-core/references/orchestration-doctrine.md` (AGENTS.md §3 mirror), `agentic-qa-core/references/briefing-template.md` (the 7 components), `agentic-qa-core/references/dispatch-patterns.md` (when a subagent is the right executor), `git-flow-master/references/worktrees.md` (worktree mechanics and cleanup).
