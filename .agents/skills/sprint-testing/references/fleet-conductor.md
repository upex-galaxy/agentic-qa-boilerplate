# Fleet Conductor: sprint-wide QA with N executors

Read this when sprint-wide mode runs with more than one executor. The scope by executors axis is defined in `SKILL.md` §"Executors: the second axis". The queue, the waves, the STP parity and the per-issue 4-dispatch cadence are unchanged and live in `sprint-orchestration.md`. This file covers what N>1 adds and nothing else.

> N=1 is untouched. Every rule here is additive: a sprint-wide run with one executor behaves as it did before this file existed. A rule below that would change N=1 behaviour is wrong.

> The maneuver (booting a fleet with the Sprint Board, watching the test environment, closing rounds, resuming after a reboot) is `/sprint-conductor` (`sprint-conductor/SKILL.md`), which loads this file and `sprint-board.md`. This file is the canon for what is written below.

> Split of duties. This skill owns the what: queue, rounds, assignment, per-issue isolation, STP parity and the dashboard. `/agent-orchestration` owns the how: sessions, terminals, mailbox, worker adoption, cleanup, claims. Every orchestration action below is `[ORCHESTRATION_TOOL] <verb>: …` pseudocode that resolves there, so do not inline an orchestration command here.

---

## 1. Vocabulary and the one collision to avoid

| Term | Meaning here |
|---|---|
| conductor | the session that talks to the user, owns the sprint scope and dispatches work. One per sprint run. |
| worker | one launched session running `sprint-testing` in single-issue mode on exactly one issue. |
| fleet | every worker of this sprint run. |
| round | one concurrency group: up to `max_workers` issues in flight at the same time. |
| wave | a Jira-status bucket (Wave 1 = ready-to-test, Wave 2 = dev-complete, …), as defined in `sprint-orchestration.md` Part 1 Step 3/5. |
| roster | the file that maps a human label ("W2", "the billing one") to a worker's issue key, session label and handles. |
| brief | the per-issue payload the conductor seeds before launching a worker. |
| launch file | `launch.txt`: one self-contained shell line per issue, always written. |
| claim | a worker's declared intent to read or write a shared fixture or data entity. |

Rounds are not waves. A wave says which issues are eligible, a round says how many run at once, and rounds are numbered inside a wave ("Wave 1, round 2"). Do not renumber rounds across waves.

---

## 2. When fleet mode is allowed

Both conditions hold:

1. The mode is sprint-wide. Single-issue mode has no fleet (one issue, one executor, by definition).
2. The user asked for it: they answered the executors question with N > 1 or named a fleet explicitly. `.agents/project.yaml` → `orchestration.max_workers` does not turn fleet mode on, whatever its value. It only caps how many workers run per round (§6) once the user has turned it on, and an explicit user number for that cap wins over the yaml value.

The orchestration gate (binary present and runtime reachable, three-state, canon in `/agent-orchestration`) decides one thing: who opens the sessions. Gate passes: the orchestration layer launches and supervises them, and the conductor gets a mailbox, native liveness and one-command cleanup. Gate fails: the human opens them, and the conductor keeps every other duty here. Run the gate where it is defined, not here.

Silence rule (hard). When the gate does not pass, the conductor still writes `launch.txt`, tells the user "N ready-to-paste lines are in `<path>`, open N terminals and paste one per terminal", and never names the orchestration binary, never recommends installing anything and never reports its absence, in the plan, the ATR, the preflight gate or the dashboard. Test every line you are about to write: would it still read correctly to a tester who never heard of any orchestration tool? If not, the line belongs in `agent-orchestration`.

What the conductor stops doing at N>1: it does not run the 4-dispatch cadence for any issue assigned to a worker. It plans, seeds, launches, waits, processes reports and keeps the sprint-altitude record. The single exception is §9 (ad-hoc retest).

Conductor-only operations. Each of these mutates shared state that has exactly one correct value, so the conductor serializes them and a worker never does them:

| Operation | Why conductor-only |
|---|---|
| Token minting (`bun run api:login`) | one writer per token file, see §7 |
| `bun run api:sync` (OpenAPI → `api/schemas/`) | rewrites committed files; two writers corrupt them |
| Bulk tracker pull (`bun run jira:sync-issues jql …`, `pull …`) | rewrites the whole `.context/PBI/` cache; a worker's own `get <KEY>` is fine |
| Sprint `plan.md` + STP **description** | rewritten wholesale, so one writer (`sprint-orchestration.md` §STP parity) |
| Sprint `progress.md` + STP **comment** | see §10 |
| `launch.txt`, `roster.md`, `claims.md` | the fleet's own bookkeeping |
| Fixture setup: seeding data, verifying with ONE query that a fixture named in a brief exists and belongs to whom the brief says, creating an owner-approved fixture user | shared state with one correct value; anything the conductor did not check goes into the brief marked `UNVERIFIED` |
| Publishing an Epic's `## Module Context (QA)` section | N workers replacing one section race, and the last writer erases the others without an error (§10 "Module learnings") |

The conductor does not investigate an issue. The line is fixture versus finding: making a case executable is shared-state setup and belongs here, while what the case should assert, the code behind it and any identifier the test needs belong to the worker, who has the context and writes the ATR. Measured on the source fleet: asked which blocked cases an authorization would unblock, a conductor read the controller source, traced the sync code and queried the database, duplicated work that then contradicted the worker. Hand the worker the fixture and the constraint, and say the rest is theirs.

---

## 3. Worker identity: the prompt and the brief, not the environment

The prompt is the channel. A worker's first prompt opens with the skill, the issue key and the literal token `fleet worker`, then points at its brief:

```
/sprint-testing UPEX-123 fleet worker env: staging. Brief: /abs/path/to/sprint-N/UPEX-123/brief.md. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints.
```

Both launch paths carry this same text (§5 rule 2).

Two signals, in this order, make a session a worker:

| Signal | Where | What it decides |
|---|---|---|
| the token `fleet worker` next to a skill invocation and an issue key | the launch prompt | this session is a worker; that key is the single issue it owns |
| `Label` · `Task` · `Dispatch` in the brief's `## Meta` | `sprint-<N>/<KEY>/brief.md` | which worker it is, and how it reports (§10) |

Environment variables are not a channel. Measured on a real fleet (ADR-0006): an env prefix written into a launch line did not survive the launcher, and every session ran with both variables empty while behaving as workers only because the prompt said so. So `PARALLEL_TESTING` / `PARALLEL_TICKET` are no longer written into a launch line (§5) and nothing in this skill depends on them. A session that sees the env vars but has no `fleet worker` prompt and no brief is not a worker.

A worker:

- runs single-issue mode on the key in its prompt and does not ask the mode question, because the prompt already answered it;
- runs to completion without returning to its prompt: the run ends when the done-report is sent (§10), and a worker parked at its prompt after Stage 1 looks like a crashed one to the liveness sweep;
- runs without checkpoints: no "explain the story and wait for OK", no per-stage "brief the user and wait", because nobody watches its terminal. The story explanation and every stage summary go into its report, and a decision goes out as an `ask` (§10), not as an `AskUserQuestion` nobody will see;
- never skips the Readiness Preflight Gate, nor the MCP probes inside it. This is the most expensive shortcut a worker can take: a worker whose DB tool never answered produces a confident ATR with a missing trifuerza leg, and nothing downstream catches it. Measured on the source fleet (ADR-0006): several workers ran an entire issue with no DB connectivity;
- creates no sprint-altitude state: no `sprint-<N>/plan.md`, no `sprint-<N>/progress.md`, no STP find-or-create, no STP comment. Its scope is `sprint-<N>/<KEY>/` and only that;
- writes no `## Module Context (QA)` section of its Epic, neither a first draft nor an update. It stages what it learned about the module under a `## Module Learnings (candidate)` heading in its own `test-session-memory.md`, and the conductor publishes it (§10 "Module learnings");
- mints no tokens and runs no bulk sync (§2);
- reports once when done, plus `ask` / `escalation` as needed, and then stops. Periodic "still alive" messages wake the conductor for nothing and the worker contract prohibits them (`/agent-orchestration` worker contract), overriding any generic launcher preamble;
- takes its test-case format from the brief and never asks for it (`SKILL.md` §"Test-case format: ask once per batch"). The conductor asks the user once per batch, the worker applies the declared format to its whole batch, and a silent brief earns one `ask`, not a guess.

---

## 4. The brief, seeded by the conductor before launch

One file per issue: `.session/sprint-testing/sprint-<N>/<KEY>/brief.md`. The conductor writes it before the worker exists. Creating, launching and briefing is one indivisible operation, because a launched worker with no brief burns a whole session doing nothing.

Do not write a brief under `.context/PBI/**`, a Jira sync cache the next `pull` overwrites.

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
- no write to the Epic's `## Module Context (QA)` section: stage what you learned about the module under `## Module Learnings (candidate)` in your test-session-memory.md; the conductor publishes it
- no heartbeats; report once at the end
- if your own measurement contradicts an instruction in this brief or a later message, STOP and `ask` with both readings and your evidence — never comply silently and never deviate silently
- your name is <KEY>--<your terminal handle>: first action, rename your own tab to it ([ORCHESTRATION_TOOL] terminal rename, exact command in `/agent-orchestration` worker contract §Session naming); your session name is set for you (the identity hook on Claude, the adapter on Pi, a conductor-typed rename verb on Codex and OpenCode), never rename your own session; your `Session:` trailer carries that full name
- errors, blockers and anything for the human go to the conductor (ask / escalation / BLOCKED: status), never to the human, never guessed; no question prompt, no deck (`/agent-orchestration` worker contract rule 16)
```

Use absolute paths everywhere: `.session/` is gitignored and local, and a relative path resolved against the wrong directory reads nothing without an error. The roster block costs five lines and lets one worker's discovery ("staging seeds are being reset every 10 minutes") reach the others before they waste an hour on it.

---

## 5. `launch.txt`: always written, regenerated whole

Address: `.session/sprint-testing/sprint-<N>/launch.txt`. One self-contained line per eligible issue.

Rules:

1. Always written, gate or no gate. It is the record of what the fleet was asked to do, and the human-paste path consumes it literally.
2. Byte-identical where it is pasted. A human (or a launcher that takes a whole command line) gets this exact line, never a paraphrase. On the supervised path the transport opens the session itself with its own arguments and cannot accept a custom command line, so what travels there is the prompt payload of this line, delivered to the live session as its first message (`agentic-qa-core/references/fleet-launch-seam.md` §2). The prompt is the part that stays identical across both paths, because it is what makes a session a worker (§3).
3. Regenerated whole at every round boundary, never patched line by line: issues that closed drop out, issues that arrived get appended. A stale line relaunches a finished issue.
4. Self-contained: the harness invocation and the prompt in one line that works pasted into a fresh terminal at the repo root. No env prefix and no second session name: the worker's name is `<KEY>--<handle>`, composed from the prompt token (`/agent-orchestration` session identity §1), and a prefix never reaches a session the transport opened.
5. No `"` and no `<` / `>` inside the prompt text. Measured on the source fleet (ADR-0006): a quote inside the prompt produced a shell parse error that killed every launch line and silently dropped the env-var exports, so the workers ran as non-workers. Reword the prompt instead.
6. Validate every line before launch with a shell syntax check (`bash -n` on a file holding the lines; `zsh -n` where the user's shell is zsh). A line that does not parse is not launched.
7. The harness invocation itself (binary, model, effort, permission and session-name flags per harness) and which launch path supervises are owned by `agentic-qa-core/references/fleet-launch-seam.md`. This skill owns only the payload: the `sprint-testing` worker prompt.

Shape (Claude Code; the line starts the harness binary bare with its own flags, and the worker gets credentials from the MCP configs' `.env` loader and each script's own loading, never from the launch line):

```
claude <harness flags per launch-seam.md> '/sprint-testing UPEX-123 fleet worker env: staging. Brief: /abs/path/to/sprint-N/UPEX-123/brief.md. Run every stage without returning to the prompt until worker_done is sent; stage boundaries are not checkpoints.'
```

The single-quoted prompt is the payload, and `UPEX-123` is the one label everywhere: the prompt token, the worker's name `UPEX-123--<handle>` (session, tab, roster, `Session:` trailer) and its brief folder. The Claude line carries no name flag, because a name flag freezes the name before the hook can append the handle. On the supervised path the conductor sends the same prompt, with no shell around it, once the session is ready.

---

## 6. Rounds: `max_workers` inside a wave

1. Take the current wave's `PENDING` rows in queue order (`sprint-orchestration.md` Part 1, `## Phase breakdown`).
2. Fill a round up to `orchestration.max_workers` (an explicit user number wins). Two issues that would write the same fixture entity do not go in the same round (§8).
3. Assign each row an `Owner` = the worker label, and set its `Pattern` cell to `Fleet`.
4. Launch the round, wait, process every report, close every worker, then form the next round. Do not trickle a replacement worker into a half-finished round: a round is the unit that gets a summary and a user checkpoint.
5. The wave advances when its rounds are exhausted. Wave ordering is unchanged.

The cap counts every live worker, including the ad-hoc retest of §9. If the user wants 6, use 6.

---

## 7. Auth: one writer, then read-only

`bun run api:login` upserts one variable per `<ROLE>_<ENV>` into a shared token file. N workers each running it race on that file and on the provider's session, and the loser gets a half-written file.

So the conductor mints every token before the round launches, once per role the round needs. A worker only sources what already exists: it never logs in, refreshes or re-mints. A worker whose token is expired or missing does not fix it. It emits `BLOCKED_AUTH_STALE` (§10) and stops the affected leg.

When token sets must be isolated per worker or per credential, the conductor mints into a per-worker profile, a separate token file per worker, one invocation per worker and role:

```
bun run api:login <env> --profile <label>      # e.g. staging --profile W1
bun run api:login <env> --role admin --profile W2
```

Name the environment first, positionally. `api-login` is a project-adapted script and every repo owns its copy, so flag order relative to the environment is not guaranteed; a positional environment before any flag works on every copy whatever it does with `--role` / `--profile`. Read `--help` on the repo you are in when unsure, and do not guess a flag.

Each brief names the absolute path of the token file its worker sources (`.auth/profiles/<label>/tokens.env`).

Check freshness before every launch, a mid-sprint launch included, not only at the start of the round. Regenerate a token or a browser state that is older than the app's session lifetime before the launch, only the stale roles; after any `BLOCKED_AUTH_STALE`, every role. Measured on the source fleet: states left from two days earlier expired mid-round and three of four workers each logged in again and saved the same state files concurrently. Prove a credential with the API login before driving a browser login with it: it fails in seconds where the browser costs a launch. After three failed attempts stop and ask, because varying the identifier or the password to test a theory is credential guessing (Critical Rule #1).

The browser side follows the same rule. The conductor produces one state file per environment and role the round needs (`.auth/<env>-<role>.json`, recipe in `agentic-qa-core/references/browser-sessions.md` §4) before launch. Each brief names its absolute path, and the worker only `state-load`s it into its own named session. An expired state is `BLOCKED_AUTH_STALE`, like an expired token.

---

## 8. Claims: declare before you write

Two workers writing the same fixture or data entity is the failure a fleet has to avoid. Two mechanisms share one vocabulary.

At triage (planning aid). While forming a round, compare the `Fixture / data intent` of each candidate issue. Same `entity:id` with `write` on both sides: the two issues go in different rounds. This is free and catches most collisions before a worker exists.

At runtime (the protocol). A worker declares a claim before its first write to a shared entity. The conductor keeps the ledger and arbitrates (first message wins; a genuine dispute is the conductor's call) and broadcasts the grant or denial to the affected workers. Message shapes, the ledger format and the non-orchestration fallback are canon in `/agent-orchestration` claims protocol; read them there.

The ledger lives with the sprint scope, `.session/sprint-testing/sprint-<N>/claims.md`, one append-only line per event:

```
[HH:MM] <worker> <entity>:<id> <read|write> <granted|denied|released>
```

A claim releases when its worker reports done. Read-only claims never conflict with each other; `write` conflicts with everything on the same `entity:id`.

---

## 9. Ad-hoc retest: N=1, outside the rounds

A bug retest that arrives mid-sprint is short, urgent and has no ATP to plan, so it is not queue work. Run it as a single worker (or inline in the conductor's session if nothing is in flight), outside the rounds and with no wave. It still counts against `max_workers`, because the cap is about machine load and tracker rate limits.

What is easy to get wrong:

- Collisions are checked against the live fleet, not the round plan. The retest arrived after the triage-time pass of §8, so compare its fixture `entity:id` with every claim in `claims.md` that has no release yet.
- Auth may have gone stale since the round launched, so the freshness check of §7 runs before this launch too.
- Its outcome reaches the sprint record at that close, written as for a round issue (§10), not at sprint end.
- Cleanup is per issue: release that worker's claims and close that worker, and never run a fleet-wide cleanup while round workers are live. Do not renumber the round in `launch.txt`; the next regeneration drops the closed line.

---

## 10. Progress, liveness and the dashboard

### Heartbeat lines, not heartbeat messages

Each worker appends one line per stage boundary to a `## Live Progress` section of its own `test-session-memory.md` (contract and placement: `agentic-qa-core/references/session-management.md` §3 "`## Live Progress` — the heartbeat contract"):

```
## Live Progress
- 14:02 Session Start done · preflight GREEN (ui, api, db)
- 14:31 Stage 1 done · ATP UPEX-501 · ATS UPEX-502 · 7 TCs
- 15:10 Stage 2 running · smoke GO · 4/7 PASSED
```

This is a file the conductor reads on demand, not a message that wakes it. Periodic status messages stay prohibited (§3).

### The two blocked tokens

A worker that cannot proceed writes the token into its `## Live Progress` line and sends an escalation:

| Token | Meaning |
|---|---|
| `BLOCKED_AUTH_STALE` | the token it was given is expired or missing; the conductor re-mints (§7), the worker never does |
| `BLOCKED_TOOL_<NAME>` | a probed tool stopped answering (`BLOCKED_TOOL_DBHUB`, `BLOCKED_TOOL_PLAYWRIGHT`, …) |

The tokens are the contract and the mailbox is reinforcement. A worker writes both, because the token survives a dead mailbox or a crashed conductor.

### Liveness sweep: native signals first

In this order, stopping as soon as an answer is found:

1. `[ORCHESTRATION_TOOL] worker status: …` / `[ORCHESTRATION_TOOL] list workers: …`: the orchestration layer's own state for each worker and its workspace. It is the cheapest and most accurate signal, so it is checked first.
2. `[ORCHESTRATION_TOOL] read screen: <worker>`: for a worker the layer reports as running but which has produced nothing. The screen shows an interactive prompt waiting for a keystroke.
3. `grep` for `BLOCKED_` across the round's `test-session-memory.md` files: the non-orchestration fallback, and the only signal when there is no orchestration layer at all.
4. Staleness: a worker whose last `## Live Progress` line is older than 20 minutes is stale. Stale is not dead, so look at it (step 2) before concluding anything.

### The dashboard

One table per round, presented to the user at every checkpoint and whenever asked. When the run uses the Sprint Board (`bun run board:up`), the board is the owner's live dashboard and this table stays the chat summary: `sprint-board.md`.

| Worker | Issue | Stage | Last line | State | Blocked |
|---|---|---|---|---|---|
| W1 | UPEX-123 | Stage 2 | 15:10 | running | — |
| W2 | UPEX-124 | Stage 1 | 14:31 | stale 39m | — |
| W3 | UPEX-125 | Stage 3 | 15:08 | running | `BLOCKED_TOOL_DBHUB` |

### Messages: who may say what

The conductor talks to workers through the orchestration mailbox: `[ORCHESTRATION_TOOL] send: <worker> …` to instruct, `[ORCHESTRATION_TOOL] ask: <worker> …` to question, `[ORCHESTRATION_TOOL] reply: <message id> …` to answer. A worker sends exactly three kinds of message: done-once (with outcome, files touched and its report path), `ask` (blocking, when a decision is genuinely required to continue) and `escalation` (a blocker). Shapes and flags: `/agent-orchestration` worker contract.

A worker never writes to the user: everything reaches the user through the conductor, which decides what is worth an interruption.

### Sprint-altitude record stays with the conductor

When a worker reports done, the conductor does what `sprint-orchestration.md` §STEP 4 says, unchanged: it verifies the checklist, appends one entry to the sprint `progress.md`, mirrors it as one STP comment, moves the queue row off `PENDING` and archives the issue sub-scope.

The report is a claim, and the conductor checks what it can observe. Before that entry, it reads the issue's final status back from the tracker itself, with a bounded poll for the value the worker reported, and checks the artifacts that leave a trace (each Test's status, the ATR, the links, the evidence on disk). A worker's or a subagent's "verified" is not the proof. Measured on the source fleet: a subagent reported the tested status "straight from the tracker row" and the tracker still showed the earlier status ten minutes later.

Module learnings. At each issue close, for the module the worker touched: read the Epic's `## Module Context (QA)` section live (the synced copy may be older), merge the worker's `## Module Learnings (candidate)` lines into it, deduplicated, keeping every line that exists only in the Epic. Publish it through the module-context step of `session-entry-points.md`, that section only and never the product owner's text, then re-sync and read it back. One writer per module, so no two closes publish the same Epic at once.

Both surfaces are append-only, but two processes appending to one local file can interleave mid-line and the log would not be ordered by close time, so the write stays with the conductor. The worker's own issue-altitude writes (ATP, ATS, ATR, QA comment, bug reports, its own `progress.md`) stay its own and the conductor does not duplicate them.

---

## 11. Per-worker browser isolation

`.playwright/cli.config.json` is shared, so a step that has each ticket repoint its `outputDir` is last-writer-wins: worker 3's screenshots land in worker 1's ticket folder.

The shared config's `outputDir` stays neutral. It ships pointing at a tool-owned directory, never at a ticket's evidence folder, and no session repoints it, not even the first one, because the value is committed and outlives the ticket. Measured on a real fleet (ADR-0006): a project whose committed config still pointed at one story's evidence folder cross-contaminated the first unqualified capture of every worker in the round. A repo that finds a ticket path there fixes the config once, back to the tool-owned directory, rather than racing to overwrite it. Canon: `agentic-qa-core/references/evidence-conventions.md` §1 (Bucket A) and §5.

Two things must be per-worker, and neither one edits the shared file:

| What | Why | How |
|---|---|---|
| browser session | two browsers on one profile dir write the same cookies, last writer wins, silently | a named in-memory session per worker (`-s=<label>`): the shipped config keeps every session in memory, so the name is the isolation; never `--persistent` |
| output dir | otherwise Bucket A noise and any non-explicit capture cross-contaminates tickets | per-worker config file, or an explicit full destination on every capture |

Which session and whose login: `agentic-qa-core/references/browser-sessions.md` §7 (fleets). The verbs belong to `/playwright-cli`. Two measured constraints carry over regardless: an alternate config replaces the default and does not merge, so a per-worker config file must be complete; and `outputDir` never applies to `.png`, so every screenshot passes its full destination path anyway (`agentic-qa-core/references/evidence-conventions.md` §5).

Each worker closes its browser sessions before reporting done. Orphaned browsers eating gigabytes is a measured outcome, not a hypothetical (ADR-0006).

### Sibling repositories in a localhost fleet

A worker reads the product's code from the repositories named in `.agents/project.yaml` (`backend.backend_repo`, `frontend.frontend_repo`). Against a deployed environment nothing is checked out, so every worker shares them read-only and the conductor measures their drift once for the whole round (`sprint-conductor/references/boot-and-resume.md` §2.2).

Against localhost, each worker reasons about its own issue's branch, and a working tree holds exactly one branch: the second worker's checkout silently retargets the first worker's running servers, and nothing reports it. So a localhost fleet gets one worktree per worker per touched sibling repository (`git-flow-master/references/worktrees.md`) and a distinct port pair per worker, assigned by the conductor and written into each brief and into `launch.txt`. The worktrees are removed after the sessions close, orphan audit first. Do not check out a branch in a shared sibling repository while any worker is live.

---

## 12. Failure modes

| Symptom | Cause | Action |
|---|---|---|
| ATR has no DB/API leg | the worker skipped the preflight MCP probes | reject the report, re-run the issue, restate §3 in the brief |
| five launch lines died at once, workers ran as non-workers | a `"` or `<>` in the prompt broke the shell line | §5 rules 5-6 |
| a finished issue was tested twice | `launch.txt` was patched, not regenerated | §5 rule 3 |
| two workers wrote the same entity | no claim, or a collision missed at triage | §8; re-verify both issues |
| a worker idle with a clean tree 10 minutes after launch | the brief never reached it | re-send it; creating, launching and briefing is indivisible (§4) |
| the conductor learns nothing for an hour | it polls instead of ending its turn and waiting on the mailbox, or handled only part of a `check` batch | `/agent-orchestration` (conductor cycle) |
| a worker asked the user something | it used a user-facing prompt instead of `ask` | §10; the brief forbids it |
| a worker ran the mode question or tested nothing | no `fleet worker` token and no brief path in its prompt | §3, §5 rule 2 |
| a worker sits at its prompt after Stage 1 | it treated the stage boundary as a checkpoint | §3; restate the continuation rule in the brief |
| the round launched with no tokens | `api:login` got a flag before the positional environment | §7 |
| half the Tests are Manual, half Gherkin | the format was not in the briefs | §4 `## Meta`; `SKILL.md` §"Test-case format" |
| a worker reported tested and the tracker disagrees | its transition did not land and the report was taken as proof | §10: read the status back (Critical Rule #16) |
| one worker's module notes vanished from the Epic | two workers replaced the same `## Module Context (QA)` section | §3, §10 "Module learnings" |

---

## 13. Checklist: fleet mode

- [ ] Sprint-wide, user asked for N > 1, gate evaluated; gate failed means `launch.txt` written, N lines handed over, orchestration layer unnamed
- [ ] `roster.md` written (label · issue · session label · handles · state)
- [ ] One `brief.md` per issue: ACs verbatim, absolute paths, siblings, test-case format, the §4 rules
- [ ] `launch.txt` regenerated whole, closed issues dropped, every line syntax-checked, no `"` / `<>` in any prompt, every prompt carrying the `fleet worker` token and its brief path
- [ ] Round within the cap, no two `write` claims on one entity, `Owner` and `Pattern: Fleet` set
- [ ] Tokens minted by the conductor (environment positional, one profile per worker), browser state files provisioned, each brief naming the absolute paths; no worker logs in
- [ ] Per-worker named browser session and explicit capture paths; shared `.playwright/cli.config.json` untouched, `outputDir` neutral
- [ ] Dashboard shown at the checkpoint: native liveness, then `BLOCKED_` grep, staleness over 20 min flagged
- [ ] Each worker released and closed as it finishes
- [ ] Per closed issue, written by the conductor after Stage 3 is verified: `progress.md` entry, STP comment, queue row, archive, tracker status read back, module learnings merged once per module
- [ ] `claims.md` shows a release for every granted write claim

---

## 14. Who holds each wait

The conductor waits for a person at four points: the executors answer (§2), the test-case format (§4), the round checkpoint (§6) and the third failed login (§7). Whether a question reaches a person at all is decided by `agentic-qa-core/references/decision-protocol.md`.

| Wait | Person present | Supervised worker | Routine with nobody |
|---|---|---|---|
| N > 1 executors, test-case format | ask the user | the launching conductor decided it and put it in the brief | the delegating brief is the approval; without one, do the reversible prep (briefs, `launch.txt`), launch nothing and report |
| round checkpoint | show the dashboard and wait | the launcher reads the dashboard and decides | write the dashboard to the sprint record, form the next round only if the brief covers it, otherwise stop and report |
| third failed login | stop and ask | `escalation` to the conductor | stop the affected leg, mark `BLOCKED_AUTH_STALE`, report; no Jira write or message |

A fleet worker never waits for a person: its `ask` goes to the conductor (§3, §10).
