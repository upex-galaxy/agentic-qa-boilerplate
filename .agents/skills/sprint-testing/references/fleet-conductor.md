# Fleet Conductor — sprint-wide QA with N executors

Read this ONLY when sprint-wide mode runs with **more than one executor**. The scope × executors axis is defined in `SKILL.md` §"Executors — the second axis"; the queue, the waves, the STP parity and the per-issue 4-dispatch cadence are unchanged and live in `sprint-orchestration.md`. This file covers exactly what N>1 adds, and nothing else.

> **N=1 is untouched.** Every rule here is additive. A sprint-wide run with one executor behaves byte for byte as it did before this file existed: same queue, same waves, same dispatches, same STP writes. If a rule below would change N=1 behaviour, the rule is wrong.

> **Split of duties.** This skill owns **WHAT**: the queue, the rounds, the assignment, the per-issue isolation, the STP parity and the dashboard. The orchestration skill owns **HOW**: sessions, terminals, message mailbox, worker adoption, cleanup, claims. Every orchestration action below is written as `[ORCHESTRATION_TOOL] <verb>: …` pseudocode and resolves in `orca-orchestration/SKILL.md` — never inline an orchestration command here.

---

## 1. Vocabulary — and the one collision to avoid

| Term | Meaning here |
|---|---|
| **conductor** | the session that talks to the user, owns the sprint scope and dispatches work. One per sprint run. |
| **worker** | one launched session running `sprint-testing` in single-issue mode on exactly one issue. |
| **fleet** | every worker of this sprint run. |
| **round** | one concurrency group: up to `max_workers` issues in flight at the same time. |
| **wave** | a Jira-**status** bucket (Wave 1 = ready-to-test, Wave 2 = dev-complete, …), as defined in `sprint-orchestration.md` Part 1 Step 3/5. |
| **roster** | the file that maps a human label ("W2", "the billing one") to a worker's issue key, session label and handles. |
| **brief** | the per-issue payload the conductor seeds before launching a worker. |
| **launch file** | `launch.txt` — one self-contained shell line per issue, always written. |
| **claim** | a worker's declared intent to read or write a shared fixture / data entity. |

**Rounds are NOT waves.** A wave says *which issues are eligible*; a round says *how many run at once*. Rounds are numbered **inside** a wave: "Wave 1, round 2". Never reuse "wave" for concurrency and never renumber rounds across waves.

---

## 2. When fleet mode is allowed

Both must hold:

1. The mode is **sprint-wide**. Single-issue mode never has a fleet (one issue, one executor, by definition).
2. Either the user asked for it, or `.agents/project.yaml` → `orchestration.max_workers` is greater than 1. An explicit user instruction ALWAYS wins over the yaml default — the default only applies when the user said nothing.

The **orchestration gate** (binary present + runtime reachable, three-state, canon in `orca-orchestration/SKILL.md`) then decides only ONE thing: who opens the sessions. Gate passes → the orchestration layer launches and supervises them, and the conductor gets a mailbox, native liveness and one-command cleanup. Gate fails → the human opens them, and the conductor keeps every other duty in this file (rounds, briefs, claims, dashboard by file, sprint-altitude record). Run the gate there; never reimplement it here.

**Silence rule (hard).** When the gate does NOT pass, the conductor writes `launch.txt` anyway, tells the user "N ready-to-paste lines are in `<path>`, open N terminals and paste one per terminal", and **never names the orchestration binary, never recommends installing anything, never reports its absence** — not in the plan, not in the ATR, not in the preflight gate, not in the dashboard. The test for any line you are about to write: *would it still read correctly to a tester who never heard of any orchestration tool?* If not, the line belongs in `orca-orchestration`, not here.

**What the conductor stops doing at N>1.** It does not run the 4-dispatch cadence for any issue that is assigned to a worker. It plans, seeds, launches, waits, processes reports and keeps the sprint-altitude record. The single exception is §9 (ad-hoc retest).

**Conductor-only operations.** These are serialized through the conductor and NEVER done by a worker, because each one mutates shared state that has exactly one correct value:

| Operation | Why conductor-only |
|---|---|
| Token minting (`bun run api:login`) | one writer per token file — see §7 |
| `bun run api:sync` (OpenAPI → `api/schemas/`) | rewrites committed files; two writers corrupt them |
| Bulk tracker pull (`bun run jira:sync-issues jql …`, `pull …`) | rewrites the whole `.context/PBI/` cache; a worker's own `get <KEY>` is fine |
| Sprint `plan.md` + STP **description** | rewritten wholesale → one writer (`sprint-orchestration.md` §STP parity) |
| Sprint `progress.md` + STP **comment** | see §10 |
| `launch.txt`, `roster.md`, `claims.md` | the fleet's own bookkeeping |

---

## 3. Worker identity — the prompt and the brief, not the environment

**The prompt is the channel.** A worker's first prompt opens with the skill, the issue key and the literal token `fleet worker`, then points at its brief:

```
/sprint-testing UPEX-123 fleet worker env: staging. Brief: <abs path to brief.md>. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints.
```

Same text on both launch paths (§5 rule 2), so a worker cannot tell them apart.

Two signals, in this order, make a session a worker:

| Signal | Where | What it decides |
|---|---|---|
| the token `fleet worker` next to a skill invocation and an issue key | the launch prompt | this session is a worker; that key is the single issue it owns |
| `Label` · `Task` · `Dispatch` in the brief's `## Meta` | `sprint-<N>/<KEY>/brief.md` | which worker it is, and how it reports (§10) |

**Environment variables are NOT a channel.** Measured 2026-09-17 (three-worker fleet, one repo): an env prefix written into a launch line did not survive the launcher, and all three sessions ran with both variables empty while behaving as workers only because the prompt said so. `PARALLEL_TESTING` / `PARALLEL_TICKET` therefore survive as an OPTIONAL redundant hint on the human-paste path (a pasted shell line does carry its own prefix) and nothing in this skill may depend on them. A session that sees the env vars but no `fleet worker` prompt and no brief is not a worker — the prompt and the brief are the only detection channel.

A worker:

- runs **single-issue** mode on the key in its prompt — it does NOT ask the mode question, because the prompt already answered it;
- **runs to completion without returning to its prompt.** Stage boundaries are not checkpoints and are not places to stop and wait: the run ends when the done-report is sent (§10), and until then the worker keeps working. A worker that parks at its prompt after Stage 1 looks exactly like a crashed one to the conductor's liveness sweep;
- runs **without checkpoints**: no "explain the story and WAIT for OK", no per-stage "brief the user and wait". Nobody is watching its terminal. The gates it would have asked a human become report content instead: the story explanation and every stage summary go into its report, and anything that genuinely needs a decision goes out as an `ask` (§10), not as a `AskUserQuestion` nobody will ever see;
- **never skips the Readiness Preflight Gate**, and never skips the MCP probes inside it. This is the single most expensive shortcut a worker can take: a worker whose DB tool never answered produces a confident ATR with a missing trifuerza leg, and nothing downstream catches it. Measured on the source fleet (2026-09, sprint 19): 3 of 8 workers ran an entire issue with no DB connectivity;
- creates **no sprint-altitude state**: no `sprint-<N>/plan.md`, no `sprint-<N>/progress.md`, no STP find-or-create, no STP comment. Its scope is `sprint-<N>/<KEY>/` and only that;
- mints **no tokens** and runs **no bulk sync** (§2);
- reports **once** when done, plus `ask` / `escalation` as needed, and then stops. No heartbeats — periodic "still alive" messages wake the conductor for nothing and are prohibited by the worker contract (`orca-orchestration/references/worker-contract.md`), which overrides any generic preamble the launcher injects;
- takes its **test-case format from the brief** and never asks for it (`SKILL.md` §"Test-case format — ask once per batch"): the conductor asks the user once per batch, the worker applies the declared format to its whole batch, and a silent brief earns ONE `ask`, not a guess.

A session with no `fleet worker` prompt and no brief is not a worker, and nothing in this skill reads the environment to decide otherwise.

---

## 4. The brief — seeded by the conductor, before launch

One file per issue: `.session/sprint-testing/sprint-<N>/<KEY>/brief.md`. The conductor writes it **before** the worker exists; creating, launching and briefing is ONE indivisible operation (a launched worker with no brief burns a whole session doing nothing).

Never write a brief under `.context/PBI/**` — that tree is a Jira sync cache and the next `pull` overwrites it.

The brief extends the 7-component briefing (`agentic-qa-core/references/briefing-template.md`) with the fleet fields:

```markdown
# Brief — <KEY> (worker <label>)

## Meta
label: <W1> · task: <task id or "-"> · dispatch: <dispatch id or "-">
issue: <KEY> · type: <type> · priority: <priority> · wave: <n> · round: <n>
sprint scope (absolute path): <abs>/.session/sprint-testing/sprint-<N>/
environment: <env> · web: <url> · api: <url>
test-case format: Manual | Gherkin   ← decided once per batch by the conductor, never asked here

## The issue
<title>

## User story / summary
<verbatim from the synced story.md>

## Acceptance criteria
<VERBATIM — never paraphrased, never summarized>

## Fixture / data intent
entities this issue reads: <entity:id …>
entities this issue writes: <entity:id …>
claims to declare before writing: <see §8>

## Risks
<from the conductor's triage — what is likely to break, what to watch>

## Evidence
write captures to: <abs path to the issue's PBI evidence/ folder>

## Reporting
report file: <abs>/.session/sprint-testing/sprint-<N>/reports/<label>.md
channel: <see §10>
Run: <run id — ONLY when this worker was launched without a supervised dispatch>

## Siblings (roster)
<label> <KEY> <one-line scope>   ← so a worker can broadcast a fact that changes another's decision
...

## Rules
- single-issue mode on <KEY>, no checkpoints, preflight gate + MCP probes NOT skippable
- run every stage without returning to the prompt until the done-report is sent; stage boundaries are not checkpoints
- no sprint-altitude writes, no token minting, no bulk sync
- no heartbeats; report once at the end
- if your own measurement contradicts an instruction in this brief or a later message, STOP and `ask` with both readings and your evidence — never comply silently and never deviate silently
- <for a non-Claude harness: rename this session to <KEY>-<slug> with /rename as your first action>
```

**Absolute paths, always.** `.session/` is gitignored and local; a worker that resolves a relative path against the wrong working directory silently reads nothing.

**Sibling awareness is cheap and pays.** The roster block costs five lines and is what lets one worker's discovery ("staging seeds are being reset every 10 minutes") reach the three other workers about to waste an hour on it.

---

## 5. `launch.txt` — always written, regenerated whole

Address: `.session/sprint-testing/sprint-<N>/launch.txt`. One self-contained line per issue currently eligible.

Rules:

1. **Always written**, gate or no gate. It is the record of what the fleet was asked to do, and the **human-paste** path consumes it literally.
2. **Byte-identical where it is pasted.** A human (or a launcher that takes a whole command line) gets *this exact line*; never paraphrase it. On the supervised path the transport opens the session itself with its own arguments and cannot accept a custom command line, so what travels there is the **prompt payload** of this line, delivered to the live session as its first message (`orca-orchestration/references/launch-seam.md` §2). The prompt is the part that must stay identical across both paths — it is what makes a session a worker (§3).
3. **Regenerated whole** at every round boundary. Never patched line by line: issues that closed **drop out**, issues that arrived get appended. A stale line relaunches a finished issue.
4. **Self-contained**: the harness invocation, the session name, the prompt, and (paste path only) the optional env prefix, in one line that works when pasted into a fresh terminal at the repo root. The prefix is a convenience for a pasted line — it does not reach a session the transport opened, so the prompt must carry everything the worker needs (§3).
5. **No `"` and no `<` / `>` inside the prompt text.** Measured (2026-09-04, source fleet): a quote inside the prompt produced a shell parse error that killed five of five lines *and* silently dropped the env-var exports, so the workers ran as non-workers. Reword the prompt instead.
6. **Validate every line before launch** with a shell syntax check (`bash -n` on a file holding the lines; `zsh -n` where the user's shell is zsh). A line that does not parse is not launched.
7. The harness invocation itself (binary, model / effort / permission / session-name flags per harness) and which launch path supervises are owned by `orca-orchestration/references/launch-seam.md`. This skill owns only the payload: the `sprint-testing` worker prompt.

Shape (Claude Code; verified 2026-09-17 in this repo that `bun run claude -- <args>` forwards `<args>` verbatim through the `dotenv` wrapper):

```
PARALLEL_TESTING=true PARALLEL_TICKET=UPEX-123 bun run claude -- <harness flags per launch-seam.md> -n "UPEX-123-checkout-tax" "/sprint-testing UPEX-123 fleet worker env: staging. Brief: <abs path to brief.md>. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints."
```

The quoted prompt is the payload. On the supervised path it is what the conductor sends to the session the moment it is ready — same text, no shell around it.

---

## 6. Rounds — `max_workers` inside a wave

1. Take the current wave's `PENDING` rows in queue order (`sprint-orchestration.md` Part 1, `## Phase breakdown`).
2. Fill a round up to `orchestration.max_workers` (default 4; an explicit user number wins). Two issues that would write the same fixture entity do NOT go in the same round — see §8.
3. Assign each row an `Owner` = the worker label, and set its `Pattern` cell to `Fleet`.
4. Launch the round, wait, process every report, close every worker, then form the next round. Do not trickle a replacement worker into a half-finished round: a round is the unit that gets a summary and a user checkpoint.
5. The wave advances only when its rounds are exhausted. Wave ordering is unchanged.

**Cadence is advisory, the cap is not.** If the user wants 6, use 6. But the cap counts *every* live worker, including the ad-hoc retest of §9.

---

## 7. Auth — one writer, then read-only

`bun run api:login` upserts one variable per `<ROLE>_<ENV>` into a shared token file. N workers each running it race on that file and on the provider's session, and the loser gets a half-written file.

So: the **conductor mints every token before the round launches**, once per role the round needs. A worker only *sources* what already exists — it never logs in, never refreshes, never re-mints. A worker whose token is expired or missing does not fix it: it emits `BLOCKED_AUTH_STALE` (§10) and stops the affected leg.

When token sets must be isolated per worker or per credential, the conductor mints into a **per-worker profile** — a separate token file per worker, one invocation per worker and role:

```
bun run api:login <env> --profile <label>      # e.g. staging --profile W1
bun run api:login <env> --role admin --profile W2
```

**Name the environment first, positionally.** `api-login` is a project-adapted script: every repo owns its own copy, and flag order relative to the environment is not guaranteed identical across copies. Naming the environment positionally, before any flag, works on every copy regardless of how that copy parses `--role` / `--profile`. Read `--help` on the repo you are in when in doubt; never guess a flag.

Each brief then names the **absolute path** of the token file its worker sources (`.auth/profiles/<label>/tokens.env`). One writer either way: the worker sources, never mints.

---

## 8. Claims — declare before you write

Two workers writing the same fixture / data entity is the failure the whole fleet exists in spite of. Two mechanisms, same vocabulary, different times:

**At triage (planning aid).** While forming a round, compare the `Fixture / data intent` of each candidate issue. Same `entity:id` with `write` on both sides → the two issues go in **different rounds**. This is free and catches most collisions before a worker exists.

**At runtime (the protocol).** A worker declares a claim before its first write to a shared entity; the conductor keeps the ledger and arbitrates (first message wins; a genuine dispute is the conductor's call) and broadcasts the grant or denial to the affected workers. Message shapes, the ledger format and the non-orchestration fallback are canon in `orca-orchestration/references/claims-protocol.md` — read it there, do not restate it.

The ledger lives with the sprint scope: `.session/sprint-testing/sprint-<N>/claims.md`, one append-only line per event:

```
[HH:MM] <worker> <entity>:<id> <read|write> <granted|denied|released>
```

A claim releases when its worker reports done. Read-only claims never conflict with each other; `write` conflicts with everything on the same `entity:id`.

---

## 9. Ad-hoc retest — N=1, outside the rounds

A bug retest that arrives mid-sprint is not queue work: it is short, it is urgent, and it has no ATP to plan. Run it as a single worker (or inline, in the conductor's own session, if nothing is in flight), **outside** the round structure, with no wave assignment. It still counts against `max_workers` — the cap is about machine load and tracker rate limits, not about queue semantics.

---

## 10. Progress, liveness and the dashboard

### Heartbeat lines, not heartbeat messages

Each worker appends one line per stage boundary to a `## Live Progress` section of its own `test-session-memory.md` (contract + placement: `agentic-qa-core/references/session-management.md` §3 "`## Live Progress` — the heartbeat contract"):

```
## Live Progress
- 14:02 Session Start done · preflight GREEN (ui, api, db)
- 14:31 Stage 1 done · ATP UPEX-501 · ATS UPEX-502 · 7 TCs
- 15:10 Stage 2 running · smoke GO · 4/7 PASSED
```

This is a *file* the conductor reads on demand, not a *message* that wakes it. Periodic status messages remain prohibited (§3).

### The two blocked tokens

A worker that cannot proceed writes the token into its `## Live Progress` line AND sends an escalation:

| Token | Meaning |
|---|---|
| `BLOCKED_AUTH_STALE` | the token it was given is expired / missing — the conductor re-mints (§7), never the worker |
| `BLOCKED_TOOL_<NAME>` | a probed tool stopped answering (`BLOCKED_TOOL_DBHUB`, `BLOCKED_TOOL_PLAYWRIGHT`, …) |

The tokens are the contract; the mailbox is reinforcement. A worker writes **both**, because the token survives a dead mailbox and a crashed conductor.

### Liveness sweep — native signals first

In this order, stopping as soon as an answer is found:

1. `[ORCHESTRATION_TOOL] worker status: …` / `[ORCHESTRATION_TOOL] list workers: …` — the orchestration layer's own state for each worker and its workspace. This is the cheapest and most accurate signal and it is checked FIRST.
2. `[ORCHESTRATION_TOOL] read screen: <worker>` — for a worker the layer reports as running but which has produced nothing: the screen shows an interactive prompt waiting for a keystroke.
3. `grep` for `BLOCKED_` across the round's `test-session-memory.md` files — the non-orchestration fallback, and the only signal available when there is no orchestration layer at all.
4. **Staleness**: a worker whose last `## Live Progress` line is older than **20 minutes** is stale. Stale is not dead — look at it (step 2) before concluding anything.

### The dashboard

One table per round, presented to the user at every checkpoint and whenever asked:

| Worker | Issue | Stage | Last line | State | Blocked |
|---|---|---|---|---|---|
| W1 | UPEX-123 | Stage 2 | 15:10 | running | — |
| W2 | UPEX-124 | Stage 1 | 14:31 | stale 39m | — |
| W3 | UPEX-125 | Stage 3 | 15:08 | running | `BLOCKED_TOOL_DBHUB` |

### Messages — who may say what

The conductor talks to workers through the orchestration mailbox: `[ORCHESTRATION_TOOL] send: <worker> …` to instruct, `[ORCHESTRATION_TOOL] ask: <worker> …` to question, `[ORCHESTRATION_TOOL] reply: <message id> …` to answer. A worker sends exactly three kinds of thing: done-once (with outcome, files touched and its report path), `ask` (blocking, when a decision is genuinely required to continue), `escalation` (a blocker). Shapes and flags: `orca-orchestration/references/worker-contract.md`.

**A worker never writes to the user.** Everything reaches the user through the conductor, which is also the only party that decides whether something is worth interrupting for.

### Sprint-altitude record stays with the conductor

When a worker reports done, the conductor — exactly as in `sprint-orchestration.md` §STEP 4, unchanged — verifies the checklist, appends ONE entry to the sprint `progress.md`, mirrors it as ONE STP comment, moves the queue row off `PENDING` and archives the issue sub-scope.

Both of those surfaces are append-only, so a worker appending its own would be *safe*; it would not be *ordered*, and two processes appending to one local file can interleave mid-line. So the write stays with the conductor: one writer, log ordered by close time, and N=1 behaviour unchanged. The worker's own issue-altitude writes (ATP, ATS, ATR, QA comment, bug reports, its own `progress.md`) are its own and are not duplicated by the conductor.

---

## 11. Per-worker browser isolation

`.playwright/cli.config.json` is **shared**, and a workflow step that has each ticket repoint its `outputDir` before capturing is last-writer-wins: worker 3's screenshots land in worker 1's ticket folder.

**The shared config's `outputDir` stays neutral.** It ships pointing at a tool-owned directory, never at a ticket's evidence folder, and no session repoints it — not even the first one, because the value is committed and outlives the ticket. Measured 2026-09-17: a project whose committed config still pointed at one story's evidence folder cross-contaminated the first unqualified capture of all three workers in the round. A repo that finds a ticket path there fixes the config once (back to the tool-owned directory) rather than racing to overwrite it. Canon: `agentic-qa-core/references/evidence-conventions.md` §1 (Bucket A) + §5.

Two things must be per-worker, and neither one edits the shared file:

| What | Why | How |
|---|---|---|
| browser profile / user-data dir | the config ships `isolated: false` with a single `userDataDir`; two browsers on one profile dir collide on the profile lock | give each worker its own session / profile identifier |
| output dir | otherwise Bucket A noise and any non-explicit capture cross-contaminates tickets | per-worker config file, or an explicit full destination on every capture |

The mechanics (which flag or env var the installed automation CLI reads for an alternate config, and the session identifier form) belong to the `/playwright-cli` skill — load it and use what that version documents. Two measured constraints carry over regardless: an alternate config **replaces** the default, it does not merge, so a per-worker config file must be complete; and `outputDir` never applies to `.png`, so every screenshot passes its full destination path anyway (`agentic-qa-core/references/evidence-conventions.md` §5).

Each worker closes its browser sessions before reporting done. Ten orphaned browsers at 2.7 GB is a measured outcome, not a hypothetical.

---

## 12. Failure modes

| Symptom | Cause | Action |
|---|---|---|
| a worker ran the whole issue but the ATR has no DB/API leg | it skipped the preflight MCP probes | reject the report, re-run that issue, restate §3 in the brief |
| five launch lines died at once and the workers ran as non-workers | a `"` or `<>` inside the prompt broke the shell line before the env exports | §5 rules 5-6 |
| a finished issue was tested twice | `launch.txt` was patched instead of regenerated | §5 rule 3 |
| two workers wrote the same entity | no claim, or a collision missed at triage | §8; re-verify the two issues' results |
| a worker idle with a clean working tree 10 minutes after launch | the brief never reached it | re-send the brief; creating + launching + briefing is indivisible (§4) |
| the conductor learns nothing for an hour | it is polling instead of waiting on the mailbox, or a batch was acknowledged without being processed | `orca-orchestration/references/coordinator-playbook.md` |
| a worker asked the user something | it used a user-facing prompt instead of `ask` | §10; the brief must forbid it |
| a worker ran the queue mode question, or tested nothing at all | its prompt carried no `fleet worker` token and no brief path, so it never knew it was a worker | §3, §5 rule 2 |
| a worker sits at its prompt with Stage 1 done and nothing sent | it treated the stage boundary as a checkpoint | §3; restate the continuation rule in the brief |
| the whole round launched with no tokens | `api:login` was called with a flag before the positional environment | §7 |
| half the Tests came back Manual and half Gherkin | the format was not in the briefs and each worker decided for itself | §4 `## Meta`; `SKILL.md` §"Test-case format" |

---

## 13. Checklist — fleet mode

- [ ] Mode is sprint-wide AND (user asked OR `orchestration.max_workers` > 1) AND the gate was evaluated
- [ ] Gate failed → `launch.txt` written, user told to paste N lines, orchestration layer never named
- [ ] `roster.md` written: one row per worker (label · issue · session label · handles · state)
- [ ] One `brief.md` per issue in the round, with ACs **verbatim**, absolute paths, siblings, the declared test-case format, and the no-heartbeat / no-checkpoint / run-to-done / measurement-contradiction rules
- [ ] `launch.txt` regenerated whole for this round; closed issues dropped; every line syntax-checked; no `"` / `<>` in any prompt
- [ ] Every worker prompt opens with the skill, its issue key, the token `fleet worker` and its brief path — the only detection channel (§3)
- [ ] Round size ≤ cap; no two `write` claims on one entity inside the round; `Owner` + `Pattern: Fleet` set on every queue row
- [ ] Tokens minted by the conductor before launch, environment named positionally, one profile per worker; every brief names the absolute token path; no worker logs in (§7)
- [ ] Per-worker browser profile + output dir; shared `.playwright/cli.config.json` untouched and its `outputDir` neutral
- [ ] Dashboard presented at the round checkpoint: native liveness first, `BLOCKED_` grep second, staleness > 20 min flagged
- [ ] Every worker released / closed as it finishes — not at the end of the round
- [ ] Sprint `progress.md` entry + STP comment + queue row + issue archive written by the CONDUCTOR, one per closed issue, after Stage 3 verified
- [ ] `claims.md` shows a release for every granted write claim
