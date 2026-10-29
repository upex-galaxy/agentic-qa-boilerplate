---
name: sprint-conductor
description: "Boot, run and resume the sprint QA conductor: one session that conducts a fleet of sprint-testing workers (one per ticket) on Orca and watches the whole sprint from one fixed point, the Sprint Board. Boots in one pass (sprint and board, the conductor-owned pre-flight, the Run, the sentinel, what the owner and the workers left, one status screen), runs one watch pass per sentinel wake (tickets that reached the test environment, the deploy check, launch under the worker cap, owner answers, finished workers, the redeploy notice), closes each round with one verification subagent, and resumes the fleet after a reboot or a session resume. Requires Orca: without a reachable runtime it stops with one line. Triggers on: /sprint-conductor, sprint conductor, conduct the sprint, boot the conductor, run the sprint fleet with the board, watch the test environment for arrivals, conductor watch pass, close the round, resume the conductor after a reboot, conductor del sprint, arranca el conductor, conduce el sprint, vigila el entorno de pruebas, retoma el conductor despues del reinicio. Do NOT use for: testing one ticket or walking the sprint queue in one session (sprint-testing), a sprint fan-out on a machine without Orca (sprint-testing sprint-wide with N executors, which writes paste-ready launch lines), multi-session orchestration that is not sprint QA (orca-orchestration), a single board command (cli/sprint-board README), or regression suites (regression-testing)."
license: MIT
compatibility: [claude-code, codex, opencode]
complementary_categories: [orchestration, issue-tracker, tms]
metadata:
  kind: workflow
  stage_owner: true
# compact_rules is consumed VERBATIM by scripts/build-skill-registry.ts (frontmatter-first,
# no truncation). Keep in sync with the doctrine below and in references/.
compact_rules: |
  - Orca is REQUIRED (owner decision, the one exception to the orchestrator-silence rule): run the gate of `orca-orchestration` (binary + reachable runtime) before anything else. It fails → say ONE line and stop, writing nothing: "/sprint-conductor runs on Orca and no reachable Orca runtime is on this machine; run the sprint with /sprint-testing sprint-wide and N executors, which writes paste-ready launch lines." Every other workflow skill keeps its silence unchanged.
  - Split of duties: this skill owns the MANEUVER (boot, watch pass, round close, resume); `sprint-testing/references/fleet-conductor.md` owns the fleet WHAT (briefs, launch.txt, rounds, claims, the sprint record); `sprint-testing/references/sprint-board.md` owns the board (commands per stage, the worker block, the four channels, the sentinel wake table); `orca-orchestration` owns the transport HOW. Cite them, never restate them.
  - Ask the owner only what the board, the tracker and the files cannot decide: the sprint when the CURRENT board and the tracker disagree or no board exists, and the worker cap when the ticket count exceeds it and the owner named none (held for this session, never persisted as a new default). Everything else is decided and reported.
  - The conductor never tests and never investigates a ticket. The line is fixture versus finding: seeding data, verifying with ONE query that a fixture exists and belongs to whom the brief says, and creating an owner-approved fixture user are conductor work; what a case asserts, the code behind it and any id the test needs are the worker's.
  - Conductor-owned pre-flight, before EVERY launch (a watch-pass launch included): tokens and browser states minted by the conductor only, refreshed when stale; a credential proven with the cheap API login before any browser login, stopping after 3 failed attempts; the sibling-repo fetch is a GATE (non-zero exit stops and escalates, never falls through to the counts) and its two drift counts go into every brief; the schema sync runs from a current checkout or is skipped with the skip written into every brief. Full: `references/boot-and-resume.md` §2.
  - The sentinel is armed at boot and re-armed after EVERY wake, as a background task, one per board, with the same `--baseline` file. Never a homemade monitor, never a scheduled pass when background tasks exist, never mailbox polling.
  - Every watch pass records each decision with `bun run board arrival <KEY> launched|held|skipped "<why>"`, so a missed pass costs nothing. The deploy check is never skipped: a tracker status is a hint, the deployed build is the truth. Fixture gaps are asked at triage, before launch. The cap counts every live worker, an ad-hoc retest included, and a collision is checked against the LIVE workers, not the round plan.
  - A finished worker's final ticket status is read back by the CONDUCTOR itself, with a bounded poll for the expected value; a worker's or a subagent's "verified" is never the proof (Critical Rule #16). The round close is ONE subagent per finished worker that verifies the artifacts, never the report; closes whose workers touched the same Epic run one after another, never in parallel, so only one of them publishes that Epic's `## Module Context (QA)` section at a time.
  - A redeploy while workers are live: fetch only (never fast-forward a sibling repo while a worker is live), then tell EVERY live worker once, with the repo, the old and new build and whether its own change's files moved.
  - Never message a developer without the owner's explicit order for that message, never commit, never print a credential. Reports to the owner are counts and tables that name who must answer, never a narrative.
  - Resume after a reboot or a session resume: find the workers by the label in their tab title, the part before the last `--term_` (the handle after it is stale), and re-issue each tab rename and each session rename (the harness rename verb, Claude Code included) with the new handle, restart the board, re-arm the sentinel with the same baseline, replay the owner's actions with `listen --since`, read the mailbox, send ONE resume message per live worker, and launch nothing until every live worker confirmed. Full: `references/boot-and-resume.md` §4.
  - On any subagent failure: STOP, report which pass or ticket failed with full context, offer retry / skip / abort, never auto-fix. A skill that itself broke is reported upstream per `agentic-qa-core/references/upstream-feedback.md`.
---

## Forbidden invocations

**NEVER invoke `/sdd-*` skills from this workflow.** SDD is an optional
user-installed ceremony; this skill ships self-contained and does not chain
SDD under any condition. If you need to refactor KATA, fixtures, cli/,
scripts/, or api/schemas/ pipeline, exit this skill first and invoke
`/framework-development`.

This boundary is mechanical, not advisory: `scripts/lint-skills.ts` rejects
any `/sdd-` mention outside this section. See:
`.agents/skills/agentic-qa-core/references/skill-composition-strategy.md` §4
(governs users who manually install SDD).

# Sprint Conductor — one session, a fleet of testers, one screen for the owner

The sprint conductor turns a sprint into a fleet: one `sprint-testing` worker per ticket, launched the
moment a ticket really reaches the test environment, watched from the Sprint Board instead of from N
terminals. The conductor never tests. It boots the run, keeps the shared state that has exactly one
correct value (tokens, browser states, the sibling repos, the sprint record), decides who runs when,
answers the workers and relays what only the owner can decide.

This skill is thin on purpose. Almost everything it does already has a canonical home, and it points
there:

| Concern | Canon |
|---|---|
| Fleet mode: worker identity, briefs, `launch.txt`, rounds, auth one-writer, claims, ad-hoc retest, Live Progress, the dashboard, the sprint record | `sprint-testing/references/fleet-conductor.md` |
| The board: commands per stage, the block a worker's brief carries, the four channels, drafts, decision cards, evidence, fixtures, the sentinel wake table, staged artifacts | `sprint-testing/references/sprint-board.md`, command reference `cli/sprint-board/README.md` |
| The transport: Run, Tasks, native launch, the mailbox, liveness, closing, the conductor handoff | `orca-orchestration` (`SKILL.md`, `references/coordinator-playbook.md`, `references/gotchas.md`) |
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

The binding rules are the `compact_rules` block above; `.agents/skills/REGISTRY.md` carries them verbatim
into every briefing. Each one has its full text in the reference it names.

**Read full SKILL.md when**: booting a conductor cold, resuming one after a reboot, or deciding whether a
request belongs here, in `sprint-testing` or in `orca-orchestration`.

---

## Preflight: Orca is required

Run the gate exactly as `orca-orchestration` §"The gate: three states" defines it (binary present AND the
runtime reachable; on Linux outside an Orca terminal the binary is `orca-ide`). This skill is the one
workflow skill that names the orchestrator, because the owner invoked it to run on Orca:

| Gate | This skill |
|---|---|
| state C, ready | continue with Phase 0 |
| state B, binary with an unreachable runtime | open the app once and re-check once, as `orca-orchestration` says; still unreachable → state A |
| state A, no binary | ONE line, then stop, nothing written: "/sprint-conductor runs on Orca and no reachable Orca runtime is on this machine; run the sprint with /sprint-testing sprint-wide and N executors, which writes paste-ready launch lines." |

The conductor runs as a TOP-LEVEL session. Started as a supervised worker of another conductor, it has no
fleet wherever the app's nested-worker depth is 1 (`orca-orchestration/references/gotchas.md` G77): a session
above it launches it with `agent launch` and reads its reports from that session's own Run inbox.

The one line is the whole report: no install walkthrough, no second paragraph. `sprint-testing`,
`fleet-conductor.md` and `sprint-board.md` keep their silence about the orchestrator unchanged; the
fan-out without Orca stays theirs.

---

## Phase 0 — Session resume check + Session Init

> **Orchestration & Session contracts**: this skill follows `agentic-qa-core/references/orchestration-doctrine.md` (mandatory subagent dispatch — main thread is command center) AND `agentic-qa-core/references/session-management.md` (Phase 0 resume check, plan-first persistence at `.session/<skill-slug>/<scope>/`, archive on completion). Phase 0 (resume check) and Phase 1 (plan write) are NOT optional.

0.0 **Arguments** (`$ARGUMENTS`, all optional): `<n>` the sprint number (default: the CURRENT board,
checked against the tracker's sprint); `--cap <n>` the worker cap for this session (default
`orchestration.max_workers` in `.agents/project.yaml`); `--no-watch` boot without arming the sentinel;
`--resume` the machine rebooted or this session was resumed while workers were live.

0.1 **Resume check** (`agentic-qa-core/references/session-management.md` §4). The scope is `sprint-<N>`.
Check `<<PRIMARY_ROOT>>/.session/sprint-conductor/sprint-<N>/kickoff.md` (from a worktree, say so in one
line and look in the primary). It exists → read it and the tail of `passes.md`, surface the Run, the
sentinel, the live workers and the last pass, and offer **resume / restart / abort**. `--resume`, or live
workers in the Run, means the resume path of `references/boot-and-resume.md` §4 replaces boot Steps 2-6.

0.2 **Session Init.** Create the scope directory and write `plan.md`. The scope holds only what no other
canon owns:

| File | Holds | Writer |
|---|---|---|
| `plan.md` | the session plan (`agentic-qa-core/references/session-management.md` §6 schema): the sprint, the cap, the board slug, the Run, the watch on or off | the conductor, at Session Init |
| `kickoff.md` | board slug, Run id, the sentinel's task id, cap, pre-flight result and every logged deviation, the deployed build per repo (the baseline every pass compares) | the conductor, rewritten at boot and resume |
| `passes.md` | one line per watch pass (the line §"The watch pass" reports), append-only | the conductor |
| `refinements.md` | lessons PROPOSED for this skill (`agentic-qa-core/references/skill-refinement-protocol.md`) | the conductor |

The fleet files (`launch.txt`, `roster.md`, `claims.md`, each `<KEY>/brief.md`, the reports) stay in
`.session/sprint-testing/sprint-<N>/` (`fleet-conductor.md` §4-§5, §8), the Run files in
`.session/orchestration/<slug>/` (`orca-orchestration` §Quick start), the board's data in
`.session/sprint-board/`. Never a second copy here.

---

## Boot: seven steps, one pass

| Step | Does | Owner of the detail |
|---|---|---|
| 1 | Load the skills: this one, then `sprint-testing` with `references/fleet-conductor.md` and `references/sprint-board.md`, then `orca-orchestration` with every stub in `orchestration.orchestrator_skills` | `orca-orchestration` §Quick start step 2 |
| 2 | Resolve the sprint and the board (`board sprints`, `use` or `new`, people), `sync --discover`, `add` late tickets, start the server when the page does not answer | `sprint-board.md` §1 row "0 boot" |
| 3 | The conductor-owned pre-flight: tokens, browser states, the credential check, the sibling-repo fetch gate and drift counts, the schema sync or its logged skip, the deployed build per repo | `references/boot-and-resume.md` §2 |
| 4 | Bind the sprint's Run (its id from `kickoff.md`, the roster or the board timeline) or create it; probe the reply direction ONCE before any worker depends on it | `references/boot-and-resume.md` §3, `orca-orchestration/references/coordinator-playbook.md` §8 |
| 5 | Arm the sentinel (skip with `--no-watch`) | `sprint-board.md` §7 |
| 6 | Read what waits: the Run mailbox, the board inbox plus the bounded `listen --since` replay, answers the owner gave in chat (relay, then mirror to the board), then the first watch pass | `sprint-board.md` §3, `references/watch-pass.md` |
| 7 | One status screen for the owner | §"Status screen" below |

Then stay in conductor mode: answer workers, keep the board current, run one watch pass on each sentinel
wake and re-arm it, close each worker and each round as they finish.

### What it asks, and what it never does

It asks only the two things in compact rule 3. It never messages a developer (Slack or otherwise) without
the owner's explicit order for that message (`sprint-board.md` §3-§4), never commits, and never prints a
credential: values are read by name only (Critical Rule #1).

### Status screen

In the owner's language, counts and tables, never a narrative (`orca-orchestration` hard rule 23):

- **In the test environment**: each ticket launched, held (and on whom), skipped or new, one reason each.
- **Who waits on whom**: workers waiting on the owner, the owner waiting on developers (open waits and
  drafts), tickets waiting on a deploy.
- **What the owner must decide**: each open question with its options, numbered so one line answers it,
  and for each blocker the person to ask (developer, product owner, or a named owner of the access).
- **Boot facts**: board URL, the sentinel armed (its task id) or not, the Run id, the pre-flight result and
  every deviation.

---

## The watch pass

One pass per sentinel wake (or per scheduled pass on a harness without background tasks), then re-arm.
Guard, detect, triage each NEW and RECHECK ticket, prepare and launch (the N=1 generate path), the
every-pass reads, one report line. A pass that fails a step logs it and moves on; a pass never blocks.
Full procedure: `references/watch-pass.md`. The wake reasons and what each one asks of the conductor:
`sprint-board.md` §7.

## Closing a worker and a round

When a worker reports done: read back its ticket's final status yourself, read its cost footer, close it
(`orca-orchestration/references/coordinator-playbook.md` §6), then the round-close subagent verifies the
artifacts and writes the sprint record. When every issue of the round is closed, say "round complete" in
the status and form the next round (`fleet-conductor.md` §6). Full procedure: `references/round-close.md`.

---

## Subagent Dispatch Strategy

This skill is **per-sprint scope**: `<scope>` = `sprint-<N>`. Session state lives at
`<<PRIMARY_ROOT>>/.session/sprint-conductor/sprint-<N>/` per `agentic-qa-core/references/session-management.md`
§3 + §9. Every dispatch follows the 7-component briefing (`agentic-qa-core/references/briefing-template.md`);
the pattern per step follows `agentic-qa-core/references/dispatch-patterns.md`. The workers themselves are
NOT subagents: they are supervised sessions launched through `orca-orchestration` (`fleet-conductor.md` §2).

| Step | Pattern | Subagent role | Reference |
|---|---|---|---|
| Boot pre-flight | inline (main thread) | none: logins stay in this terminal (credentials never travel into a briefing) and the drift result must be seen by the conductor that seeds the briefs | `references/boot-and-resume.md` §2 |
| Watch pass: detect + triage | inline (main thread) | none: each decision is the conductor's and is recorded on the board | `references/watch-pass.md` §1-§3 |
| Watch pass: brief seeding | Parallel | one subagent per arriving ticket: sync the ticket, read its story and ACs verbatim, its module's recorded fixtures, write `<KEY>/brief.md`; returns the brief path | `references/watch-pass.md` §4, `fleet-conductor.md` §4 |
| Status read for a large fleet | Single | one subagent reads every worker's `## Live Progress` and the `BLOCKED_` sweep and returns the dashboard table | `fleet-conductor.md` §10 |
| Round close | Single per finished worker; Sequential across workers of the same Epic | one subagent verifies the artifacts and writes the sprint record, returning a count table; a second close of the same Epic is dispatched only after the first returned, because both would publish its `## Module Context (QA)` section | `references/round-close.md` §2 |
| Resume | inline (main thread) | none: handles, the sentinel and the resume messages are the conductor's | `references/boot-and-resume.md` §4 |

> **Why inline for triage and resume**: they are decisions and transport, not reading. Delegating them
> adds a handoff that drops the one fact that mattered (a held ticket's blocker, a worker's new handle).

> **On any subagent failure**: STOP, report which pass, ticket or step failed with full context, present
> retry / skip-ticket / abort. No auto-fix. A skill that itself broke (a wrong step, a missing verifier, a
> stale rule) is reported upstream per `../agentic-qa-core/references/upstream-feedback.md`: drafted and
> redacted locally, filed only on explicit OK, verified with `gh issue view`.

---

## Skills to load

| Skill | Load when |
|---|---|
| `sprint-testing` (+ `references/fleet-conductor.md`, `references/sprint-board.md`) | boot Step 1, always |
| `orca-orchestration` + the stubs in `orchestration.orchestrator_skills` | boot Step 1, always (the gate passed) |
| `acli` / `xray-cli` | reading or writing the sprint record and reading back a ticket's status (`[ISSUE_TRACKER_TOOL]`, `[TMS_TOOL]`) |
| `evidence-artifact` | the round close finds a ticket or a bug without its evidence page and the conductor builds it from the worker's pack (`sprint-board.md` §6) |
| `git-flow-master` | before reading a merge or Merge Line state for the deploy check (`git-flow-master/references/observer.md`) |

## Pseudocode tags used here

| Tag | Resolves to | Defined in |
|---|---|---|
| `[ORCHESTRATION_TOOL]` | the orchestration CLI: Run, launch, mailbox, terminal read and close | `orca-orchestration/SKILL.md` |
| `[ISSUE_TRACKER_TOOL]` | `acli`, or `{{ISSUE_TRACKER_CLI}}` | `AGENTS.md` Tool Resolution |
| `[TMS_TOOL]` | `xray-cli` (jira-xray) or `acli` (jira-native) | `AGENTS.md` Tool Resolution |

---

## Session close

The conductor's session closes when the owner ends the run or the sprint closes (the board's
`snapshot --mode report` and `archive`, `sprint-board.md` §1). Before the closing message:

1. Every live worker is closed or listed with its reason to stay open (`orca-orchestration`
   hard rule 1), every granted write claim shows a release (`fleet-conductor.md` §13).
2. `kickoff.md` is current, so the next conductor resumes from it (`orca-orchestration/references/coordinator-playbook.md` §8).
3. The session-footer contract (`agentic-qa-core/references/session-footer-contract.md`): the screenshot
   list (usually none of the conductor's own) and the footer with skills, MCPs and CLIs used. Framing:
   **Execution through workers**: the testing levels the fleet's ATRs exercised, read from the round-close
   reports, with "none" stated per untouched level.
4. Lessons are PROPOSED to `refinements.md` per `agentic-qa-core/references/skill-refinement-protocol.md`,
   never applied to a live skill; the footer counts them.

---

## References

| Reference | Read when |
|---|---|
| `references/boot-and-resume.md` | Boot Steps 3-4 (the conductor-owned pre-flight, the Run and the reply probe) and the resume after a reboot or a session resume |
| `references/watch-pass.md` | Every sentinel wake: guard, detect, triage, prepare and launch, the every-pass reads, the redeploy notice, the report line |
| `references/round-close.md` | A worker reported done, or a round ended: the read-back, the verification subagent, module learnings, the sprint record, closing the worker |
| `sprint-testing/references/fleet-conductor.md` | Seeding any brief, writing `launch.txt`, forming a round, claims, the dashboard |
| `sprint-testing/references/sprint-board.md` | Any board command, the worker brief block, the channels, decision cards, the sentinel |
| `orca-orchestration/SKILL.md` | The gate, launching and closing workers, waiting on the mailbox |

---

## Pre-flight checklist

- [ ] Gate passed (or the one line said and nothing written)
- [ ] Sprint and board resolved; the cap resolved (asked only when the count exceeds it)
- [ ] Pre-flight green or each deviation logged in `kickoff.md` and in every brief it affects
- [ ] Run bound or created; reply direction probed once
- [ ] Sentinel armed with its baseline (or `--no-watch` stated in the status)
- [ ] Mailbox, inbox and the `listen --since` replay read; chat answers relayed and mirrored
- [ ] One status screen sent: counts, who waits on whom, numbered decisions, boot facts
