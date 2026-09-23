---
name: orca-orchestration
description: "Multi-session agent orchestration for this repo: one conductor session coordinating a fleet of persistent worker sessions (one per story, per module, per failure cluster) through the Orca runtime, plus the non-Orca fallback where the same launch lines are pasted by hand. Owns the HOW of fleet work — terminals, Runs, Tasks, dispatch, briefs, claims, board cards, liveness, cleanup — while each workflow skill keeps owning the WHAT. Use when the user wants to: orchestrate or parallelize work across sessions (`orchestrate`, `fleet`, `launch workers`, `one session per story`, `parallelize the sprint`, `run these in parallel`, `orquestar`, `lanza workers`, `una sesión por historia`, `paraleliza el sprint`), talk to or steer a running worker (`talk to the worker on BK-123`, `ask W2 if`, `pause X`, `close X`, `comunícate con el worker`, `pregúntale a W2`, `cierra las sesiones`), check or resume a fleet (`how is the fleet doing`, `fleet status`, `resume the run`, `pick up last night's wave`, `estado de la flota`, `retoma el run`), set up an Orca worktree for a worker, or schedule an unattended routine (`automation routine`, `nightly triage`, `automatización nocturna`). ALSO trigger in WORKER mode when a brief names this skill. Do NOT use for: one-shot subagent dispatch inside the current turn (that is AGENTS.md §3 and stays the default), a pure ownership handoff of work to another agent with no supervision (that is the vendor `orca-cli` guide, not orchestration), per-ticket manual QA (use /sprint-testing), writing test code (use /test-automation), branch / commit / PR mechanics (use /git-flow-master), or plain `git worktree` work with no fleet (use /git-flow-master `git-flow-master/references/worktrees.md`)."
license: MIT
compatibility: [claude-code, codex, opencode]
complementary_categories: [orchestration]
metadata:
  kind: workflow
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the doctrine below and in references/.
compact_rules: |
  - DO gate on the BINARY plus a reachable RUNTIME, never on "is a vendor skill installed". Three states: A no binary, B binary with unreachable runtime, C ready. In a workflow skill, states A and B are TOTAL SILENCE: never name the orchestrator, never list it as a prerequisite, never mention it in an ATR or a blocked-token sweep. The one-line install recommendation belongs to THIS skill and fires only because the user asked for orchestration.
  - DO write the launch file ALWAYS, with or without a runtime, and keep the PROMPT identical on both paths, byte for byte, opening with `/<workflow-skill> <KEY> fleet worker` and carrying the no-stopping sentence. The launch line itself is for a human to paste or for a deliberately unsupervised terminal; the prompt is the payload both paths share, and a paraphrased prompt is the exact failure this rule exists to prevent.
  - DO NOT copy the vendor command grammar into this repo. LOAD the stubs listed in `orchestration.orchestrator_skills` (`.agents/project.yaml`) alongside this skill — conductor AND worker, they are about 2k tokens for the pair — and ask the binary only for the DEEP topics a stub points at. A copied grammar goes stale in silence on the next release; a grammar nobody loaded produces invented flags.
  - DO treat one-shot subagents as the DEFAULT executor (AGENTS.md §3, unchanged) and a supervised worker as the declared exception: persistent, addressable, owns a scope end to end. The conductor still uses subagents for its OWN reads.
  - DO NOT allow periodic heartbeats, even though the injected preamble asks for them. Every heartbeat wakes the conductor to read the word "alive". A worker sends exactly three things: `worker_done` (once, with an explicit outcome), `ask` (blocking), `escalation`. The brief must prohibit heartbeats in writing.
  - DO NOT use the harness's own agent-to-agent messaging or user-question tools from a worker: from an isolated worktree the conductor is not addressable and nobody is watching a user prompt. The channel is the orchestration mailbox, and a question that does not block goes out as a message while the worker keeps going on everything that does not depend on the answer.
  - DO treat the channel as an ASSIGNMENT, not a preference: `orchestration send` carries every message between sessions and is byte-intact; anything longer than a couple of sentences goes in a FILE with a one-line pointer; `terminal send` drives a terminal (commands, CLI calls, harness slash-commands, keystrokes) and nothing else, because it truncates silently, keeps only the TAIL and still reports success. The one exception is the launch handoff prompt of a supervised worker, which has no argv to travel in: keep it short and point it at a file. And read every send result as a statement about the CALL, never about the outcome.
  - DO acknowledge every mailbox batch, verified, in the SAME command that re-arms the wait, and never inside a compound command whose exit code can be swallowed. An unacknowledged batch replays forever and hides everything queued behind it, and the runtime does not re-notify. Roll the wait in windows of at most 540 s, because the harness kills a foreground command at 600 s. One waiter per Run, never a shell background job, never a self-built monitor: the runtime notifies the conductor on its own.
  - DO launch a supervised worker NATIVELY (the runtime starts the agent: task, worktree, agent, model, effort) and then send its prompt as the immediate next step. A terminal created with our own command line can NEVER be supervised — the runtime recognizes only agents it started, and adoption is refused on a terminal whose agent is demonstrably alive. Custom argv is the human-paste shape and the deliberately-unsupervised shape, nothing more.
  - DO verify credentials on the worker's own screen before dispatching work to it. The native launch has no argv, so the environment file reaches it only through a per-machine direnv hook in the runtime's interactive shell: without it the worker starts clean, unsupervisedly broken, and fails much later at its first authenticated call.
  - DO tell every worker, in the prompt AND in the brief, to run every stage without returning to the prompt until `worker_done` is sent: a stage boundary is not a checkpoint. And DO name the one `ask` that is mandatory: when a worker's own measurement contradicts a conductor instruction, it stops and asks with both readings and the evidence — never silent compliance, never silent deviation.
  - DO treat create + launch + brief as ONE indivisible operation, and verify a few minutes later that the brief actually landed (a created terminal reports success when the text was DELIVERED, not when it ran). Readiness is not completion.
  - DO close a finished worker in the same turn, and read its cost footer off its screen BEFORE closing: a worker's token and context usage exists nowhere else and dies with the terminal. Release the supervised worker by its dispatch; without a dispatch, COUNT the terminals in that worktree before closing anything, because the stop verb's radius is the whole worktree. Remove a worktree only after the orphan audit, because everything gitignored inside it (env file, evidence, session scope) dies with it.
  - DO pick the topology by what the work writes: manual QA and backlog grooming run as a fleet in the SAME checkout (state lives in the tracker); anything that writes code gets one Orca worktree per worker, because two sessions in one checkout collide on the git index even when they never touch the same file. Never two workers owning the same module.
  - DO declare a claim before touching shared fixture data or a shared credential, with one of three intents (`read` / `write` / `enumerate` — a listing that exposes siblings' entities is never an assertion target). A claim already listed in the brief is PRE-GRANTED: the worker announces it and works. Only a claim discovered mid-run waits, and the conductor arbitrates it: first message wins, it keeps the ledger and broadcasts the grant. Conductor-only operations (login / token minting, schema sync, tracker pull-push) are never delegated.
  - DO provision a fresh worktree BEFORE launching. A missing provisioning step disguises itself as something else: an absent env file reads as "the tool does not exist", absent dependencies as "a broken import", an absent tracker cache as a worker that simply cannot see the story.
  - DO keep `.agents/project.yaml` → `orchestration` as DEFAULTS only (worker cap, agent, model, effort). An explicit user instruction in the conductor session always overrides them for that run; the defaults apply only when the user said nothing.
  - WHEN a commit is produced by any session: the forensic trailers (`Worktree:` then `Session:`) are mandatory and are NOT AI attribution. Canon: `/git-flow-master`.
---

<!-- Model preferences (advisory; dispatchers may use to route) -->
<!--
model_preferences:
  conductor: opus        # planning, arbitration, report synthesis
  worker: sonnet         # scoped execution; opus for a whole-story or architectural scope
  automation: opus       # unattended dispatcher (it never produces)
-->

# Orca Orchestration — One Conductor, a Fleet of Sessions

This skill is the transport layer for work that does not fit in one session. A **conductor** talks to the owner and coordinates **workers**; each worker is a persistent agent session that owns a scope from start to finish, reports through a mailbox, and can be interrupted, questioned and resumed. The **fleet** is all workers of one **Run**.

It is **optional by construction**. Everything here has a path that works with no runtime at all: the same launch lines, pasted into terminals by a human, and the same tokens and artifacts the workflow skills already write. What the runtime buys is the step a human would otherwise do with their hands, plus a mailbox instead of screen-scraping.

**Read full SKILL.md when**: starting a fleet cold, arbitrating a claim, choosing a topology, recovering a Run from a previous session, or writing an unattended automation.

---

## When to use

- The user asks to parallelize, orchestrate, or run "one session per story / module / failure cluster".
- The user wants to talk to, steer, interrupt, question or close a session that is already running.
- The user wants the state of a fleet, or to pick up a wave from a previous session.
- A brief names this skill (WORKER mode).
- An unattended routine has to dispatch work with nobody at the wheel.

## When NOT to use

| Situation | Use instead |
|---|---|
| a read, a verification, a map — anything that fits in this turn | one-shot subagents (AGENTS.md §3). This is most work |
| "hand this TASK to another agent and forget it" | that is a HANDOFF, not orchestration: no Task, no Dispatch, no mailbox. Ask the binary for its `orca-cli` guide |
| "hand this whole SESSION to a fresh one, my context is full" | ownership transfer of the session itself, same worktree, same harness | `/session-handoff` |
| per-ticket manual QA | `/sprint-testing` |
| writing test code | `/test-automation` |
| branch / commit / push / PR mechanics, or a plain `git worktree` with no fleet | `/git-flow-master` |
| one long task, one session, no siblings | just do the task |

---

## Quick start (conductor)

1. Run the gate. State A or B → say the one line below and continue on the fallback.
2. **Load every skill in `orchestration.orchestrator_skills` now, alongside this one.** They are the vendor's command grammar and they are small; this skill is the WHEN and the WHAT. Skipping them is what produces invented flags. Then ask the binary for a DEEP topic only when a stub points at one (`{{ORCHESTRATOR_CLI}} skills get <topic>`). Nothing installed → skip straight to asking the binary; the gate never depended on the stubs.
3. Pick the topology from what the work WRITES (`references/topologies.md`), and run the triage-time collision check in claim vocabulary (`references/claims-protocol.md` §5).
4. Create the scope `.session/orchestration/<slug>/`, seed `run.md`, `roster.md`, `COMMON.md`, `launch.txt` from `templates/`.
5. Run the cycle in `references/coordinator-playbook.md` §1, in that order: Run → Tasks → placement → NATIVE launch → verify readiness and credentials on screen → send the prompt. Those last three are not separable.
6. Wait inside the turn, one waiter, rolling windows of at most 540 s, ack verified in the same command that re-arms.
7. Close each finished worker in the same turn; orphan audit before removing any worktree.
8. Harvest `learnings.md` and `skill-improvements.md`, write `kickoff.md`, then report to the owner.

---

## Three layers, and ours points instead of copying

```
LAYER 3 · REPO DOCTRINE      .agents/skills/orca-orchestration/   (T1, versioned, this skill)
   when to split work · topology per activity · provisioning · brief · measured gotchas · phrasebook
        ^ points at v
LAYER 2 · GRAMMAR + MACHINE  orca skills get orchestration      (mailbox, Run, Task, worker lifecycle)
                             orca skills get orca-cli           (terminals, worktrees, board, browser)
   served BY THE BINARY, versioned with it. The user-level stubs teach nothing: they say "ask the binary".
        ^ operates on v
LAYER 1 · APP                the app running · runtime reachable · board · phone
```

**Composition rule**: if the binary's own guide says it, this skill carries a pointer, not a copy. A copy desynchronizes in silence on the next release. What lives HERE is what no vendor guide has: this repo's provisioning gaps, the topology per activity, the brief, the measured gotchas, the git integration, the owner phrasebook.

**Consequence for the gate**: it is evaluated on `binary + runtime`, NEVER on "is the vendor skill installed". A machine with the binary and no stubs is fully capable, because this reference knows how to ask the binary for the grammar.

**Consequence for cost — CORRECTED 2026-09-22, this paragraph used to say the opposite.** It claimed loading the vendor guides was "tens of thousands of tokens that enable nothing" and told every role to fetch on demand, worker included. **Measured: the two stubs are 4150 and 3862 bytes, about 2k tokens for the pair.** The old claim conflated the user-level SKILL.md STUB with the full topic payload the binary serves on demand (`{{ORCHESTRATOR_CLI}} skills get <topic>`) — those are different artifacts and only the second is large.

So the rule is now: **`orchestration.orchestrator_skills` load ALONGSIDE this skill, never instead of it.** This skill owns WHEN and WHAT; the vendor stubs own the command grammar. Two thousand tokens up front is cheaper than one iteration spent correcting an invented flag, which is what the fetch-on-demand posture actually cost on a live sprint-testing fleet. The on-demand fetch stays for the DEEP topics a stub only points at.

The list is `orchestration.orchestrator_skills` in `.agents/project.yaml`, not a hardcoded name here. Empty list = nothing installed, and this skill falls back to asking the binary for its grammar — which is still fully capable, per the gate rule above.

---

## The gate: three states

```bash
command -v orca >/dev/null 2>&1 \
  && [ "$(orca status --json </dev/null 2>/dev/null | jq -r '.result.runtime.reachable' 2>/dev/null)" = "true" ]
```

The reachability flag is NESTED (`.result.runtime.reachable`). A gate that looks for a flat field fails closed and silently on a perfectly capable machine. Verify any edit to a gate by running BOTH branches.

**Platform rule (Linux)**: inside an Orca-managed terminal `orca` always resolves to the Orca CLI (Orca exports `ORCA_APP_VERSION` / `ORCA_TERMINAL_HANDLE` there). Outside one, on Linux, the CLI registers as `orca-ide` because bare `/usr/bin/orca` is the GNOME Orca screen reader: probe `orca-ide` there, never `orca`. The hook's `orcaAvailable()` applies exactly this rule (env signal first, then `orca-ide` on Linux, `orca` elsewhere); use the same executable for every later command in the session.

| State | In a workflow skill (`sprint-testing`, `test-automation`, …) | In this skill |
|---|---|---|
| **A · no binary** | **total silence**. Not named, not recommended, not a prerequisite, not in the ATR, not in the blocked-token sweep. The flow writes its launch file and the human pastes the lines | **one line**, and only because the user ASKED for orchestration (see the exact text below), then continue on the fallback |
| **B · binary, runtime unreachable** | silence (same fallback) | `orca open --json` once, re-check once; still unreachable → treat as state A |
| **C · ready** | the reinforcement activates without announcing itself: the runtime launches the workers and delivers the identical prompt, and they report to the mailbox IN ADDITION to the file tokens | full mode: conductor / worker / automation |

**The exact recommendation (state A or B, this skill only)**, adapted to the user's language:

> Level-1 orchestration is already available in this session: one-shot subagents (AGENTS.md §3). That is mini-orchestration and it covers reads, verification and mapping. Professional orchestration — persistent sessions you can talk to, a mailbox, a board, your phone — needs Orca installed on this machine. Without it I will still write `launch.txt` with one ready-to-paste line per worker, and you open the terminals.

**The test that settles any future edit**: would this line still make sense, unchanged, to a tester who has never heard of Orca? If not, the edit belongs in this skill, not in the workflow skill. The real prohibition was never "workflow skills must not know about the orchestrator"; it was **"the absence of the orchestrator must cost nothing and must never be reported"**. A silent gate satisfies that, which is why a workflow skill may carry a few gated lines.

---

## Orchestration executors (complements AGENTS.md §3)

AGENTS.md §3 is permanently active and unchanged: the main conversation is the command center, and **one-shot subagents remain the default executor**. This skill adds a SECOND executor and declares the exception in writing, because a supervised worker breaks three assumptions the one-shot contract makes (a fresh agent per dispatch, no channel until it finishes, the orchestrator as the only one who can ask the user).

| | One-shot subagent (default) | Supervised worker (this skill) |
|---|---|---|
| Lives | inside the turn | until you close it |
| Context | lost when it reports | persists; you keep talking to it |
| Channel | none until it finishes; cannot be paused | messages, blocking questions and replies at any time |
| Owner sees it | no | yes: board, terminal, phone |
| Git | the orchestrator's | its own (worktree) or shared under explicit file ownership |
| Best for | reading, verifying, mapping; the 7-component briefing | writing and integrating on its own; a whole story; long work; when the owner wants to step in |

Practical rule: **the subagent explores and returns a map; the worker executes a complete scope**. The conductor keeps using subagents for ITS OWN reads, which is what keeps the main context lean. The fan-out cap of the dispatch doctrine still applies to fleets, for a different reason: tracker and TMS rate limits, not context.

---

## Modes

| Mode | Who | Loads | Does NOT load |
|---|---|---|---|
| **CONDUCTOR** | the session talking to the owner | this SKILL.md + `references/coordinator-playbook.md` + every stub in `orchestration.orchestrator_skills`, loaded up front; a DEEP topic from the binary only when a stub points at one | nothing else; its reads go through subagents |
| **WORKER** | each launched session | `orchestration.orchestrator_skills` + `references/worker-contract.md` (short) + `references/channel-discipline.md` (shorter) + its domain skill (`/sprint-testing`, `/test-automation`, …) | nothing else: the injected preamble carries the rest of its contract |
| **AUTOMATION** | an unattended scheduled routine | `references/automations.md` + this SKILL.md in conductor mode | anything that produces output: **the dispatcher never produces** |
| **OWNER** | the user, by chat or phone | the phrasebook below | |

---

## Decision tree: is this even orchestration?

1. **Does the work fit in this turn, and is it a read / verification / map?** → one-shot subagent. Stop here. This is most work.
2. **Do you want to hand the work away and stop caring?** → that is a **handoff**, ownership transfer, not orchestration: no Task, no Dispatch, no mailbox. A single TASK handed to another agent is the binary's `orca-cli` guide; ask for that guide and follow it. A whole SESSION handed to its own successor because the context window is filling up is `/session-handoff`.
3. **Do you need to supervise, wait for results, answer questions, or coordinate a dependency graph?** → orchestration. Continue.
4. **Does the work write code?** → one Orca worktree per worker. **Does it not?** → fleet in the same checkout. See `references/topologies.md`.
5. **Do you want the workers SUPERVISED** (addressable by dispatch, closable one by one, preamble injected)? → the NATIVE launch, and nothing else: the runtime recognizes only agents it started itself. Two per-machine prerequisites decide whether that path exists here at all — the agent's default arguments and direnv (`references/orca-machine-setup.md` §3). Either one missing → the fleet still runs, every worker unsupervised, and you say so to the owner before launching rather than discovering it at cleanup.
6. **Is there no human at the wheel?** → `references/automations.md`.

---

## The owner phrasebook

The owner speaks natural language to the conductor; the conductor translates. The **roster** is what resolves "the one on BK-123" into a task, a dispatch, a terminal handle and a worktree.

| The owner says | The conductor does | Notes |
|---|---|---|
| "how are they doing?" / "fleet status" | task list (brief) + worker list + the cross-worktree summary | answer as one table: KEY · stage · state · last message |
| "talk to the worker on BK-123, tell it …" | **the MESSAGE goes to the mailbox** (`orchestration send`, or a file plus a pointer if it runs long); `terminal send` may carry only a one-line nudge — "check your mailbox: `<subject>`" — and only when G46 says the worker is busy and would not read mail between turns | hard rule 4. Mail does NOT reach a busy worker and reports success anyway (G46), which is why the nudge exists; the nudge is not the message. The roster resolves the label |
| "ask W2 whether …" | a question message to that dispatch, then one mailbox wait | |
| "what is X doing?" | read the worker's output by dispatch, then the rendered screen as backup | the screen is backup, never the channel |
| "tell it yes" | reply to that message id | the id comes from the pending batch |
| "launch another worker for …" | task-create → placement → native launch → verify on screen → send the prompt | one indivisible operation (see the playbook) |
| "pause / interrupt X" | send an interrupt into its terminal, then verify on the rendered screen | there is no native pause/resume |
| "close X" / "it is done" | release the supervised worker by dispatch · without a dispatch: count terminals, then close that one terminal and its tab | never the worktree-wide stop without counting |
| "pick up last night's wave" | bind this session to the existing Run id from `run.md`, then list tasks | a Run outlives the session that made it |
| "send me the summary on my phone" | board card comment + an HTML log as a shareable artifact | |

---

## Hard rules

1. **A finished worker is closed in the same turn.** Ten live worktrees took the runtime down twice in one session.
2. **Provision the worktree BEFORE launching** (`references/provisioning.md`). Provisioning gaps disguise themselves as other failures.
3. **Create + launch + deliver the brief = one indivisible operation.** Verify with a working-tree status check a few minutes later: two separate incidents left a worker idle for hours because the brief never arrived.
4. **One message, one task — and the channel is an ASSIGNMENT, not a preference.** `orchestration send` (the mailbox) carries **every message between sessions**: it is byte-intact, measured at 126, 896 and 30 bytes read back exactly. **Anything longer than a couple of sentences goes in a FILE** cited by absolute path into the primary checkout (never in a system temp directory: it triggers a permission prompt), and the message is the one-line pointer. `terminal send` is for **driving a terminal** — commands, CLI calls, harness slash-commands, keystrokes — and it is lossy: it truncates silently, keeps only the TAIL, and reports success anyway (G60, G64). **The test**: if a human would READ it, it does not go through `terminal send`; if a shell or a TUI would EXECUTE it, that is what the verb is for. **Exactly one structural exception**: the launch handoff prompt of a supervised worker, because the native launch takes an agent, a model and an effort level and has no argv at all (step 6 of the launch flow, G58) — kept short and pointing at a file. So the rule is never "no prompt through `terminal send`"; it is **no conversation through `terminal send`**. Full discipline, plus what the verb is genuinely excellent at: `references/channel-discipline.md`.
5. **Launch in an auto permission mode, never an edits-only mode.** An edits-only mode covers file edits but not commands, so every script call waits on a human who is not watching; one worker left every tracker mutation computed and unexecuted.
6. **Never acknowledge a batch you did not process.** Verified ack (the acknowledged id equals the one requested, the pending count drops), never inside a compound command. An unacknowledged batch hides everything behind it AND the runtime will not notify again.
7. **Do not build a monitor**, and roll the wait instead. The runtime notifies the conductor when mail arrives; a homemade monitor competes with that notice, arrives late by construction, and triggers on echoes of the conductor's own messages. The harness kills a foreground command at 600 s, so a realistic round is covered by successive waits of at most 540 s, each re-armed with the verified ack in the same command — not by one long block, and never by a shell background job.
8. **The stop verb has worktree radius: count first.** To close one terminal, close that terminal (and its tab).
9. **A base-ref flag resolves LOCAL refs**: verify the new worktree's SHA against the remote base, with no `|| true` to hide the failure. This was paid for twice.
10. **Never name the orchestrator to the user from a workflow skill when the gate fails**, and never put it in prerequisites, in a non-bypassable probe, in the ATR environment block, or in a blocked-token sweep.
11. **Text typed into a terminal and not sent is not an instruction.**
12. **One dev server and one browser per worktree**; close every browser-automation session before reporting (ten orphaned headless browsers, ~2.7 GB, measured).
13. **Critical Rule #15 counts double** in a same-checkout fleet: no global discards, another session shares the tree.
14. **Worker commits carry zero AI attribution** (Critical Rule #3) and the two forensic trailers (`Worktree:` / `Session:`), which are forensics, not attribution. Canon: `/git-flow-master`.
15. **A stage boundary is not a checkpoint.** The launch prompt and the brief both say: run every stage without returning to the prompt until `worker_done` is sent. The pressure has to be in the PROMPT, because as a file pointer it reads as reference material — measured: two of three workers stopped mid-work on briefs that already forbade checkpoints.
16. **"My measurement contradicts the conductor" is a mandatory `ask`.** The worker stops, sends both readings with its evidence, and waits. Never silent compliance, never silent deviation. This is the behaviour that makes a fleet worth more than a faster single session: a worker refused a wrong instruction from its conductor and was right, and nothing else in the run came close in value.
17. **A success code describes the CALL, never the OUTCOME — verify at the destination.** Four surfaces in one day returned success while nothing arrived: a launch line that died in the shell (`terminal create --command`, G11), a `terminal send` that delivered a tail fragment (G60, G64), an `orchestration send` whose receipt carried `"delivered_at": null, "read": 0` in the same payload that proved acceptance (G67), and a dispatch still reading `dispatched` while pointing at a terminal that no longer existed (G68). **A green receipt is the most dangerous kind of green**, because it suppresses the check that would have caught the failure. Read the screen, read the mailbox, read the row — at the destination, never at the caller.
18. **`ok: false` on a `terminal send` means a HUMAN is typing in that terminal. Never retry.** It is the runtime protecting that person's input box, not a transport failure: a retry interleaves your keystrokes with theirs, and a fallback to a longer message makes it worse. Wait, then read the screen (G65). Do not conclude the session is unreachable.
19. **A message that begins mid-sentence is a TRUNCATION until proven otherwise.** The head is what gets lost, so the damage reads like a typo or a stray keystroke rather than like a missing message, and nobody goes looking for the rest (G64). Ask for the pointer; **never answer the fragment**, and never reconstruct what you think it said.
20. **A name is not an address: sign with the terminal handle plus the Run id.** Three addressing failures, and the two quiet ones cost more than the loud one: a name that resolves to NOTHING (loud — three sessions were routed at a dead conductor name and each improvised differently); a name that resolves ONLY TO ITSELF, read by a session out of its own roster and unresolvable by every peer, which looks verified from the inside (G70); and a name that PREFIX-MATCHES the wrong session in a different repository and returns success (G69). A brief, a report or a seed names its author by the terminal handle (`ORCA_TERMINAL_HANDLE`, which is in the environment and is not a self-report) plus the Run id — never by a name the session read about itself.

21. **The channel carries no identity, so a RECIPIENT verifies the sender.** Rule 20 is the sending half; this is the other one, and it is the half that actually got burned. A message arrives with no trustworthy author — the transport can prefix-match the wrong session in another repository and still return success (G69) — so a recipient that cannot identify the sender from the payload ASKS instead of inferring from context. The corollary bites hardest on a REPLY: answering a message whose author you assumed is how a scope agreement about one repository landed in a session working in another.

22. **A conductor decides scope; a worker decides execution.** The split is not seniority, it is blast radius: a worker changes what its brief already named, and anything that widens the brief — a new file owner, another ticket, a different branch, a schema or fixture other workers share — stops and escalates. A worker that quietly widens its own scope is the failure the claims protocol cannot see, because no claim was ever filed. Conductors own the inverse error: a brief so narrow the worker must widen it to finish is a conductor defect, not a worker one.

23. **A report is a COUNT, not a narrative.** "Mostly done", "almost there" and "a few failures" are not states a conductor can act on: they force a follow-up question that the report existed to prevent. Every stage report and every standby report leads with numbers — how many passed, how many remain, how many are blocked and on whom — and the prose comes after, if at all. Full shape: `references/standby-report-contract.md`.

---

## Defaults: the `orchestration` block

`.agents/project.yaml` carries an `orchestration` block owned by this skill: the worker cap per round (`{{MAX_WORKERS}}`), the default agent (`{{DEFAULT_AGENT}}`), the default model id (`{{DEFAULT_MODEL}}`, empty = the harness default) and the default effort level (`{{DEFAULT_EFFORT}}`). Variable syntax: `.agents/README.md`.

**They are defaults, not policy.** An explicit user instruction in the conductor session ALWAYS overrides them for that run ("run six", "use the small model for these", "codex for this one"). The defaults apply only when the user said nothing. Never ask the user to confirm a default they never mentioned, and never override an instruction they did give because the yaml disagrees.

Two vocabulary rules that keep reports readable:

- **round** = one concurrency group, up to the worker cap in flight at once.
- **wave** = a tracker-status bucket, and it exists only in `sprint-testing`. Rounds are numbered INSIDE a wave: "Wave 1, round 2". Never reuse "wave" for concurrency.

---

## The fallback, in full

With no binary and no runtime, nothing about the work changes — only who does the launching and how
state is read:

| Step | Fallback |
|---|---|
| plan | identical: same topology decision, same triage-time collision check, same rounds |
| brief | identical: `COMMON.md` + `W-<label>.md` in the scope, cited by absolute path |
| launch | the conductor prints `launch.txt` and the human opens N terminals and pastes N lines. This is the ONLY path where the launch line itself is the payload, which is why the file is still written unconditionally |
| identity | the human sets the session name from the line's own name flag, or the worker renames itself |
| state | the workflow's own blocked-state tokens plus the tracker, exactly as a single session already does |
| questions | the worker writes the question in its report with options and a recommendation, and keeps going on what does not depend on the answer |
| close | the human closes the terminals |
| claims | the degraded append-only ledger (`references/claims-protocol.md` §6), with smaller rounds |

This path is the CONTRACT and the runtime path is the shortcut. Which is why the PROMPT is identical
on both, down to its opening token and its no-stopping sentence: the path nobody exercises today is
the one that silently breaks in three weeks. The launch LINE could not stay shared — a supervised
worker has no argv at all — so the shared thing is the prompt, and it is the prompt that carries the
behaviour.

---

## Distinctions this skill nails down

| Frequent confusion | What is actually true |
|---|---|
| "installing the vendor skill" enables orchestration | No. The binary already carries the commands. The stub only teaches when. The gate is on the binary |
| a harness worktree equals an Orca worktree | No. The harness one lives inside the repo, invisible to the board and the phone, with no managed terminal. The Orca one has a card, terminals, a browser, and is reachable from the phone. To orchestrate: always the Orca one |
| a context-only injection leaves a supervised worker | No: deliberately unsupervised, and the release verb does not close it. Supervised = the native launch |
| a custom-argv terminal can be supervised | **No.** The runtime decides "is this an agent" from the argv IT launched, never from the running process, so adoption is refused on a terminal whose agent is alive on screen. Measured three ways (`references/gotchas.md` G44). Supervision is the native launch or nothing |
| the terminal went idle, so the worker finished | No: idle means ready for input. Finished means `worker_done`. And the prompt line is ALWAYS drawn, so it cannot tell you either: the spinner line is the signal, and no spinner without `worker_done` means STALLED, not idle (G55) |
| a heartbeat is useful progress | No: it means "alive", and it wakes the conductor. Prohibited in the brief |
| the stop verb closes one terminal | No: its radius is the whole worktree |
| subagents and workers compete | No: the subagent reads and maps inside the turn; the worker executes a scope and persists |
| `terminal send` is how you talk to a worker | No: it is how you DRIVE a worker's terminal. The message goes to the mailbox and anything long goes in a file; the terminal gets a one-line nudge at most, plus the launch handoff prompt, which is the one exception (hard rule 4) |
| the harness's agent-messaging tool reaches the conductor | Not from an isolated worktree; and a user-question prompt is seen by nobody. It can also PREFIX-MATCH a session in another repository and return success (G69) |
| a handoff is orchestration | No: it is ownership transfer. Orchestration is supervising, waiting and coordinating |

---

## References

| File | What it holds |
|---|---|
| `references/coordinator-playbook.md` | the full conductor cycle, roster and run files, board card, waiting and acking, liveness sweep, closing, conductor-only operations, conductor→conductor handoff, cross-session memory |
| `references/channel-discipline.md` | which verb carries what (mailbox · file plus pointer · `terminal send`), the one structural exception, what `terminal send` is genuinely excellent at, and how to read a send result |
| `references/worker-contract.md` | what a worker must and must not do, what the brief has to say, the report protocol |
| `references/claims-protocol.md` | claims over shared fixtures, data and credentials: entities, intents, message shapes, ledger, disputes, non-runtime fallback |
| `references/topologies.md` | topology per repo activity, "when a worktree", git rules per topology |
| `references/provisioning.md` | what a fresh worktree of THIS repo lacks, how to repair it, the provisioning script, the setup hook |
| `references/brief-template.md` | the fleet extension of the 7-component briefing, plus the two templates |
| `references/standby-report-contract.md` | what a session emits when it STOPS: the six parts, the closed blocker vocabulary, the three envelopes, and why it is not a progress table or a heartbeat. Read when a session goes to standby or reaches a final status |
| `references/gotchas.md` | every measured gotcha with symptom, fix, date and the version it was verified against, plus the vendor guide's known lies |
| `references/automations.md` | unattended routines: recipes, the frozen-prompt trap, cost per wake-up, "the dispatcher never produces" |
| `references/launch-seam.md` | how a workflow skill writes its launch file and its three gated lines, and what it must never do |
| `references/html-surfaces.md` | opening a generated page (coverage map, report, deck) in a worktree-bound browser tab instead of the system browser: the gate, the two routes, the clipboard dead end, the split-state rule |
| `references/orca-machine-setup.md` | the one-time per-machine checklist (not versionable) |
| `references/session-identity.md` | session identity per harness, the label rule, where it is injected, the commit trailers |
| `templates/run.md` · `templates/roster.md` · `templates/launch.txt` · `templates/COMMON.md` · `templates/W-brief.md` | the files a Run is made of |

Related repo doctrine: `agentic-qa-core/references/orchestration-doctrine.md` (AGENTS.md §3 mirror), `agentic-qa-core/references/briefing-template.md` (the 7 components), `agentic-qa-core/references/dispatch-patterns.md` (when a subagent is the right executor), `git-flow-master/references/worktrees.md` (worktree mechanics and cleanup).
