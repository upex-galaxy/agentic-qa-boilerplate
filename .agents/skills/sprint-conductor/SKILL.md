---
name: sprint-conductor
description: "Conduct a sprint QA fleet on Orca from the Sprint Board, one sprint-testing worker per ticket. Use when booting the sprint conductor; watching the test environment for arrivals; closing a round; resuming after a reboot. Not for one ticket (sprint-testing) or other fleets (agent-orchestration)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [orchestration, issue-tracker, tms]
metadata:
  kind: workflow
  stage_owner: true
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the doctrine below and in references/.
compact_rules: |
  - Orca is required (owner decision, the one exception to the orchestrator-silence rule): run the gate of `agent-orchestration` (binary and reachable runtime) before anything else. When it fails, say ONE line and stop, writing nothing: "/sprint-conductor runs on Orca and no reachable Orca runtime is on this machine; run the sprint with /sprint-testing sprint-wide and N executors, which writes paste-ready launch lines." Every other workflow skill keeps its silence unchanged.
  - Split of duties: this skill owns the maneuver (boot, watch pass, round close, resume); `sprint-testing/references/fleet-conductor.md` owns the fleet, `sprint-testing/references/sprint-board.md` the board, `agent-orchestration` the transport. Cite them, do not restate them.
  - Ask the owner only what the board, the tracker and the files cannot decide: the sprint when the CURRENT board and the tracker disagree or no board exists, and the worker cap when the ticket count exceeds it and the owner named none (held for this session, never persisted as a new default). Everything else is decided and reported.
  - The conductor does not test and does not investigate a ticket. The line is fixture versus finding: seeding data, verifying with ONE query that a fixture exists and belongs to whom the brief says, and creating an owner-approved fixture user are conductor work; what a case asserts, the code behind it and any id the test needs are the worker's.
  - Conductor-owned pre-flight, before EVERY launch (a watch-pass launch included): the conductor alone mints tokens and browser states and refreshes them when stale; a credential is proven with the cheap API login before any browser login, stopping after 3 failed attempts; the sibling-repo fetch is a gate (a non-zero exit stops and escalates, it never falls through to the counts) and its two drift counts go into every brief; the schema sync runs from a current checkout or is skipped with the skip written into every brief. Full: `references/boot-and-resume.md` §2.
  - The sentinel is armed at boot and re-armed after EVERY wake, as a background task, one per board, with the same `--baseline` file. No homemade monitor, no scheduled pass when background tasks exist, no mailbox polling.
  - Every watch pass records each decision with `bun run board arrival <KEY> launched|held|skipped "<why>"`, so a missed pass costs nothing. The deploy check always runs: a tracker status is a hint, the deployed build is the truth. Fixture gaps are asked at triage. The cap counts every live worker, an ad-hoc retest included, and collisions are checked against the LIVE workers, not the round plan.
  - The CONDUCTOR reads back a finished worker's final ticket status itself, with a bounded poll for the expected value; a worker's or a subagent's "verified" is not proof (Critical Rule #16). The round close is ONE subagent per finished worker that verifies the artifacts, not the report; closes whose workers touched the same Epic run one after another, so only one of them publishes that Epic's `## Module Context (QA)` section at a time.
  - A redeploy while workers are live: fetch only (do not fast-forward a sibling repo while a worker is live), then tell EVERY live worker once, with the repo, the old and new build and whether its own change's files moved.
  - Message a developer only on the owner's explicit order for that message, never commit, never print a credential. Reports to the owner are counts and tables that name who must answer, not a narrative.
  - Resume after a reboot or a session resume: find the workers by the label in their tab title, the part before the last `--term_` (the handle after it is stale), and re-issue each tab rename and each session rename (the harness rename verb, Claude Code included) with the new handle, restart the board, re-arm the sentinel with the same baseline, replay the owner's actions with `listen --since`, read the mailbox, send ONE resume message per live worker, and launch nothing until every live worker confirmed. Full: `references/boot-and-resume.md` §4.
  - On any subagent failure: STOP, report which pass or ticket failed with full context, offer retry, skip or abort, and do not auto-fix. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.
---

## Forbidden invocations

Do not invoke `/sdd-*` skills from this workflow. SDD is an optional user-installed ceremony; this skill
ships self-contained and does not chain it. To refactor KATA, fixtures, `cli/`, `scripts/` or the
`api/schemas/` pipeline, exit this skill and invoke `/framework-development`.

`scripts/lint-skills.ts` rejects any `/sdd-` mention outside this section. See
`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4 (it governs users who
install SDD themselves).

# Sprint Conductor: one session, a fleet of testers, one screen for the owner

The conductor turns a sprint into a fleet: one `sprint-testing` worker per ticket, launched the moment a
ticket really reaches the test environment, watched from the Sprint Board instead of from N terminals. It
does not test. It boots the run, keeps the shared state that has exactly one correct value (tokens,
browser states, the sibling repos, the sprint record), decides who runs when, answers the workers and
relays what only the owner can decide.

The skill is thin on purpose: almost everything it does has a canonical home, and it points there.

| Concern | Canon |
|---|---|
| Fleet mode: worker identity, briefs, `launch.txt`, rounds, auth one-writer, claims, ad-hoc retest, Live Progress, the dashboard, the sprint record | `sprint-testing/references/fleet-conductor.md` |
| The board: commands per stage, the block a worker's brief carries, the four channels, drafts, decision cards, evidence, fixtures, the sentinel wake table, staged artifacts | `sprint-testing/references/sprint-board.md`, command reference `cli/sprint-board/README.md` |
| The transport: Run, Tasks, native launch, the mailbox, liveness, closing, the conductor handoff | `agent-orchestration` (its `SKILL.md`, conductor cycle, Orca provider and gotchas) |
| The deploy check (the deployed environment is truth, the tracker is a hint) | `sprint-testing/references/session-entry-points.md` Step 1c |
| This skill: the boot, one watch pass, the round close, the resume | `references/boot-and-resume.md`, `references/watch-pass.md`, `references/round-close.md` |

```
owner ── board (Needs you, inbox, drafts) + chat ──┐
                                                    │
sentinel ─ wake ─> CONDUCTOR (this skill) ── Run mailbox ── workers (sprint-testing, fleet worker)
                      │  boot · watch pass · round close · resume          │
                      └── tracker (read + sprint record) ── board CLI <────┘ (--by worker)
```

---

## Compact Rules

The binding rules are the `compact_rules` block above, which `.agents/skills/REGISTRY.md` carries into
every briefing.

**Read full SKILL.md when**: booting a conductor cold, resuming one after a reboot, or deciding whether a
request belongs here, in `sprint-testing` or in `agent-orchestration`.

---

## Preflight: Orca is required

Run the gate as `agent-orchestration` §"Two gates" defines it: binary present and runtime
reachable (on Linux outside an Orca terminal the binary is `orca-ide`). This is the one workflow skill
that names the orchestrator, because the owner invoked it to run on Orca.

| Gate | This skill |
|---|---|
| state C, ready | continue with Phase 0 |
| state B, binary with an unreachable runtime | open the app once and re-check once, as `agent-orchestration` says; still unreachable means state A |
| state A, no binary | ONE line, then stop, nothing written: "/sprint-conductor runs on Orca and no reachable Orca runtime is on this machine; run the sprint with /sprint-testing sprint-wide and N executors, which writes paste-ready launch lines." |

The conductor runs as a top-level session. Started as a supervised worker of another conductor, it has no
fleet wherever the app's nested-worker depth is 1 (`/agent-orchestration` gotchas G77): a
session above it launches it with `agent launch` and reads its reports from that session's own Run inbox.

The one line is the whole report, with no install walkthrough. `sprint-testing`, `fleet-conductor.md`
and `sprint-board.md` keep their silence about the orchestrator; the fan-out without Orca stays theirs.

---

## Phase 0 — Session resume check + Session Init

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

0.0 **Arguments** (`$ARGUMENTS`, all optional): `<n>` the sprint number (default: the CURRENT board,
checked against the tracker's sprint); `--cap <n>` the worker cap for this session (default
`orchestration.max_workers` in `.agents/project.yaml`); `--no-watch` boot without arming the sentinel;
`--resume` the machine rebooted or this session was resumed while workers were live.

0.1 **Resume check** (`agentic-qa-core/references/session-management.md` §4). The scope is `sprint-<N>`.
Look for `<<PRIMARY_ROOT>>/.session/sprint-conductor/sprint-<N>/kickoff.md` (from a worktree, say so in
one line and look in the primary). When it exists, read it and the tail of `passes.md`, surface the Run,
the sentinel, the live workers and the last pass, and offer **resume / restart / abort**. `--resume`, or
live workers in the Run, means the resume path of `references/boot-and-resume.md` §4 replaces boot
Steps 2-6.

0.2 **Session Init.** Create the scope directory and write `plan.md`. The scope holds only what no other
canon owns:

| File | Holds | Writer |
|---|---|---|
| `plan.md` | the session plan (`agentic-qa-core/references/session-management.md` §6 schema): the sprint, the cap, the board slug, the Run, the watch on or off | the conductor, at Session Init |
| `kickoff.md` | board slug, Run id, the sentinel's task id, cap, pre-flight result and every logged deviation, the deployed build per repo (the baseline every pass compares) | the conductor, rewritten at boot and resume |
| `passes.md` | one line per watch pass (the line the watch pass reports), append-only | the conductor |
| `refinements.md` | lessons PROPOSED for this skill (`agentic-qa-core/references/skill-refinement-protocol.md`) | the conductor |

The fleet files (`launch.txt`, `roster.md`, `claims.md`, each `<KEY>/brief.md`, the reports) stay in
`.session/sprint-testing/sprint-<N>/` (`fleet-conductor.md` §4-§5, §8), the Run files in
`.session/orchestration/<slug>/` (`agent-orchestration` §Quick start), the board's data in
`.session/sprint-board/`.

---

## Boot: seven steps, one pass

| Step | Does | Owner of the detail |
|---|---|---|
| 1 | Load the skills: this one, then `sprint-testing` with `references/fleet-conductor.md` and `references/sprint-board.md`, then `agent-orchestration` (it loads the vendor guides by name) and `agentic-qa-core/references/fleet-project-profile.md` | `agent-orchestration` §Quick start step 2 |
| 2 | Resolve the sprint and the board (`board sprints`, `use` or `new`, people), `sync --discover`, `add` late tickets, start the server when the page does not answer | `sprint-board.md` §1 row "0 boot" |
| 3 | The conductor-owned pre-flight: tokens, browser states, the credential check, the sibling-repo fetch gate and drift counts, the schema sync or its logged skip, the deployed build per repo | `references/boot-and-resume.md` §2 |
| 4 | Bind the sprint's Run (its id from `kickoff.md`, the roster or the board timeline) or create it; probe the reply direction ONCE before any worker depends on it | `references/boot-and-resume.md` §3, `/agent-orchestration` (conductor cycle §8) |
| 5 | Arm the sentinel (skip with `--no-watch`) | `sprint-board.md` §7 |
| 6 | Read what waits: the Run mailbox, the board inbox plus the bounded `listen --since` replay, answers the owner gave in chat (relay, then mirror to the board), then the first watch pass | `sprint-board.md` §3, `references/watch-pass.md` |
| 7 | One status screen for the owner | §"Status screen" below |

Then stay in conductor mode: answer workers, keep the board current, run a watch pass on each sentinel
wake and re-arm it, close workers and rounds as they finish.

### What it asks

Only the two things in compact rule 3. Credentials are read by name only (Critical Rule #1), and nothing
goes to a developer without the owner's order (`sprint-board.md` §3-§4).

### Status screen

In the owner's language, counts and tables, no narrative (`agent-orchestration` hard rule 23):

- In the test environment: each ticket launched, held (and on whom), skipped or new, one reason each.
- Who waits on whom: workers waiting on the owner, the owner waiting on developers (open waits and
  drafts), tickets waiting on a deploy.
- What the owner must decide: each open question with its options, numbered so one line answers it, and
  for each blocker the person to ask (developer, product owner, or a named owner of the access).
- Boot facts: board URL, the sentinel armed (its task id) or not, the Run id, the pre-flight result and
  every deviation.

---

## The watch pass

One pass per sentinel wake (or per scheduled pass on a harness without background tasks), then re-arm.
Guard, detect, triage each NEW and RECHECK ticket, prepare and launch (the N=1 generate path), the
every-pass reads, one report line. A pass that fails a step logs it and moves on, so a pass never blocks.
Full procedure: `references/watch-pass.md`. The wake reasons and what each asks of the conductor:
`sprint-board.md` §7.

## Closing a worker and a round

When a worker reports done, read back its ticket's final status yourself, read its cost footer, close it
(`/agent-orchestration`, conductor cycle §6), then let the round-close subagent verify
the artifacts and write the sprint record. When every issue of the round is closed, say "round complete"
in the status and form the next round (`fleet-conductor.md` §6). Full procedure:
`references/round-close.md`.

---

## With nobody at the keyboard

A person who starts the conductor holds every gate below. When a supervising session or a routine runs
it, `agentic-qa-core/references/decision-protocol.md` decides what reaches a person.

| Waiting point | A supervised worker | A routine |
|---|---|---|
| resume, restart or abort offer (0.1) | the launching conductor answers | resume when live workers exist, since resuming loses nothing; otherwise start fresh and say so |
| the sprint or the cap (rule 3) | the launcher's brief names them | the brief names them; without one, take the CURRENT board and `orchestration.max_workers`, and report the assumption; if the board and the tracker disagree or no board exists, launch nothing and report |
| a failed sibling fetch, a failed credential, a fixture gap | the launcher is told in the report | hold the affected tickets as `held`, record the blocker on the board (`needs-you`), launch nothing that depends on it |
| a message to a developer | the launcher relays | draft it on the board, never send |
| a subagent failure (retry, skip or abort) | the launcher decides | skip that ticket, record why, report; never auto-fix |
| filing an upstream report | the launcher decides | draft and redact locally, do not file |

---

## Subagent Dispatch Strategy

This skill is **per-sprint scope**: `<scope>` = `sprint-<N>`. Session state lives at
`<<PRIMARY_ROOT>>/.session/sprint-conductor/sprint-<N>/` per `agentic-qa-core/references/session-management.md`
§3 + §9. Every dispatch follows the 7-component briefing (`agentic-qa-core/references/briefing-template.md`);
the pattern per step follows `agentic-qa-core/references/dispatch-patterns.md`. Workers are supervised
sessions launched through `agent-orchestration` (`fleet-conductor.md` §2), not subagents.

| Step | Pattern | Subagent role | Reference |
|---|---|---|---|
| Boot pre-flight | inline (main thread) | none: logins stay in this terminal (a credential never travels into a briefing) and the conductor that seeds the briefs must see the drift result | `references/boot-and-resume.md` §2 |
| Watch pass: detect + triage | inline (main thread) | none: each decision is the conductor's and is recorded on the board | `references/watch-pass.md` §1-§3 |
| Watch pass: brief seeding | Parallel | one subagent per arriving ticket: sync the ticket, read its story and ACs verbatim, its module's recorded fixtures, write `<KEY>/brief.md`; returns the brief path | `references/watch-pass.md` §4, `fleet-conductor.md` §4 |
| Status read for a large fleet | Single | one subagent reads every worker's `## Live Progress` and the `BLOCKED_` sweep and returns the dashboard table | `fleet-conductor.md` §10 |
| Round close | Single per finished worker; Sequential across workers of the same Epic | one subagent verifies the artifacts and writes the sprint record, returning a count table; a second close of one Epic waits for the first, since both publish its `## Module Context (QA)` section | `references/round-close.md` §2 |
| Resume | inline (main thread) | none: handles, the sentinel and the resume messages are the conductor's | `references/boot-and-resume.md` §4 |

> Triage and resume stay inline because they are decisions and transport, not reading: a handoff drops the
> one fact that mattered (a held ticket's blocker, a worker's new handle).

> **On any subagent failure**: compact rule 12 applies. A skill that itself broke is reported upstream per
> `../agentic-qa-core/references/upstream-feedback.md`: drafted and redacted locally, filed only on
> explicit OK, verified with `gh issue view`.

---

## Skills to load

| Skill | Load when |
|---|---|
| `sprint-testing` (+ `references/fleet-conductor.md`, `references/sprint-board.md`) | boot Step 1, always |
| `agent-orchestration` + `agentic-qa-core/references/fleet-project-profile.md` | boot Step 1, always (the gate passed) |
| `acli` / `xray-cli` | reading or writing the sprint record and reading back a ticket's status (`[ISSUE_TRACKER_TOOL]`, `[TMS_TOOL]`) |
| `evidence-artifact` | the round close finds a ticket or bug without its evidence page and the conductor builds it from the worker's pack (`sprint-board.md` §6) |
| `git-flow-master` | before reading a merge or Merge Line state for the deploy check (`git-flow-master/references/observer.md`) |

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|---|---|---|
| `[ORCHESTRATION_TOOL]` | the orchestration CLI: Run, launch, mailbox, terminal read and close | `/agent-orchestration` |
| `[ISSUE_TRACKER_TOOL]` | `acli`, or `{{ISSUE_TRACKER_CLI}}` | `AGENTS.md` Tool Resolution |
| `[TMS_TOOL]` | `xray-cli` (jira-xray) or `acli` (jira-native) | `AGENTS.md` Tool Resolution |

---

## Session close

The conductor's session closes when the owner ends the run or the sprint closes (the board's
`snapshot --mode report` and `archive`, `sprint-board.md` §1). Before the closing message:

1. Every live worker is closed or listed with its reason to stay open (`agent-orchestration`
   hard rule 1), and every granted write claim shows a release (`fleet-conductor.md` §13).
2. `kickoff.md` is current, so the next conductor resumes from it (`/agent-orchestration`, conductor cycle §8).
3. The session footer (`agentic-qa-core/references/session-footer-contract.md`): the screenshot list
   (usually none of the conductor's own) and the skills, MCPs and CLIs used. Under "Execution through
   workers", the testing levels the fleet's ATRs exercised, read from the round-close reports, with "none"
   stated per untouched level.
4. Lessons are PROPOSED to `refinements.md` per `agentic-qa-core/references/skill-refinement-protocol.md`
   and never applied to a live skill; the footer counts them.

---

## References

The three files under `references/` are loaded as the Concern table says: `boot-and-resume.md` at boot
Steps 3-4 and on resume, `watch-pass.md` on every sentinel wake, `round-close.md` when a worker reports
done or a round ends. The `sprint-testing` and `agent-orchestration` canon are read for the steps that
cite them.

---

## Pre-flight checklist

- [ ] Gate passed (or the one line said and nothing written)
- [ ] Sprint, board and cap resolved
- [ ] Pre-flight green, or each deviation logged in `kickoff.md` and in every brief it affects
- [ ] Run bound, reply direction probed, sentinel armed (or `--no-watch` stated)
- [ ] Mailbox, inbox and `listen --since` replay read; chat answers relayed and mirrored
- [ ] One status screen sent
