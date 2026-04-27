# Sprint Orchestration — Batch-Sprint Mode

Use this reference when iterating multiple tickets in a sprint. Covers: generating the `SPRINT-{N}-TESTING.md` framework file, the per-ticket orchestration loop, checkpoint mechanics, stop/pause/resume logic, and the `continue-from` parameter. Single-ticket mode is described in `session-entry-points.md`.

---

## Parameters

| Parameter | Required | Meaning |
|-----------|----------|---------|
| `sprint-file` | YES | Path to the framework file, e.g. `.context/reports/SPRINT-5-TESTING.md`. |
| `continue-from` | NO | Ticket ID (e.g. `{{PROJECT_KEY}}-277`) to resume from. |

If a parameter is missing, ASK the user before proceeding. Before starting, verify:

1. The file exists and is readable.
2. It contains at least one ticket row with a recognizable status (`PENDING`, `PASSED`, `FAILED`, `BLOCKED`, `DEFERRED`, `SKIPPED`).
3. If `continue-from` was provided, the ticket ID exists in the file. If not, list the available tickets and ask.

---

## Orchestrator ground rules

You are the ORCHESTRATOR for in-sprint QA on `{{PROJECT_NAME}}`. Manage the workflow by dispatching sub-agents per stage, maintaining shared memory, and interacting with the user at defined checkpoints.

1. NEVER execute testing stages yourself. ALWAYS delegate to a sub-agent via the Agent tool (sequential fallback when sub-agents are unavailable).
2. Sub-agents run SEQUENTIALLY — one stage at a time. Wait for completion before dispatching the next.
3. After every sub-agent finishes, re-read `test-session-memory.md` and present a brief summary to the user.
4. TOOL FAILURE -> STOP, surface error, do NOT dispatch next sub-agent, wait for user instructions.
5. BUG_FOUND -> PAUSE, present bug to user, wait for decision.

---

## Part 1 — Sprint Roadmap Generator

Use when the user asks "generate the sprint testing framework", "set up sprint N", or when `sprint-file` is missing. **Auto-invoked by `SKILL.md` §Session Start step 0.5** in batch-sprint mode whenever `.context/reports/SPRINT-{N}-TESTING.md` is missing or stale (>24h). Never run as a standalone command — it is a precondition of the skill.

### Inputs

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `sprint_number` | YES | Sprint to generate | `10` |
| `qa_lead` | NO | Defaults to `git config user.name`, ask if missing | `Jane Doe` |
| `previous_sprint_file` | NO | For carryover detection | `.context/reports/SPRINT-9-TESTING.md` |

Output path: `.context/reports/SPRINT-{sprint_number}-TESTING.md`. If it already exists, warn + ask before overwriting.

> **Prerequisite**: Load `/acli` skill before the `[ISSUE_TRACKER_TOOL]` call in Step 1 below. Sprint Roadmap Generator runs before per-ticket Session Start, so §0.1 has not yet executed — load it explicitly here.

### Steps

1. **Query tickets** via `[ISSUE_TRACKER_TOOL]` for `Sprint {N}` with fields: Ticket ID, Type, Title, Priority, Status, QA Assignee, Developer, Project/Epic, Platform. Sort by Priority DESC, Status ASC.
2. **Classify** each ticket's board status:

   | Board Status | QA Category | Wave |
   |--------------|-------------|------|
   | DevStage / QA Ready / Testing | Active testing queue | Wave 1 |
   | TestedDevStage (no artifacts) | Missing formal testing | Wave 1 (priority) |
   | Dev Complete (Merged) | Next deploy candidates | Wave 2 |
   | Dev Complete (In Review) | Pipeline | Wave 2 |
   | In Progress | Still in development | Pipeline |
   | Blocked | Monitor | Pipeline |
   | Prioritized / Backlog | Not started | Backlog |
   | Done | Completed | Done |
   | Cancelled | No action | Cancelled |

   Status names are project-specific — adapt to `{{ISSUE_TRACKER}}`. Principle: tickets closest to "ready for QA" go in Wave 1.

3. **Detect carryovers** if `previous_sprint_file` was provided. Scan it for tickets whose status is NOT `PASSED` / `CANCELLED` / `Done`. For each, check whether it appears in the current sprint; if yes mark as carryover with prior context; if no note as "dropped from sprint" and inform the user.
4. **Organize waves**:
   - Wave 1 = DevStage / QA Ready + tickets in a "tested" state missing formal artifacts. Sort: Priority then QA assignment.
   - Wave 2 = Dev Complete split into "Merged on Dev" + "Ready for Review", sort by Priority.
   - Pipeline = In Progress + Blocked, grouped separately.
   - Backlog / Done / Cancelled listed for completeness.
5. **Detect QA automation tasks**: `Type = QA Task` OR title contains "E2E Tests" / "Integration Tests", assigned to `qa_lead`. Collect into their own section.
6. **Write** the file using the structure below.
7. **Report** a short board summary: totals, wave counts, carryovers.

### Framework file structure

```markdown
# Sprint {N} - In-Sprint Testing Tracker

> Purpose: track QA testing progress; provide AI context for resuming sessions.
> Sprint: {N} | QA: {qa_lead} | Started: {YYYY-MM-DD} | Last Updated: {date} (initial generation)

## Board Summary
| Status | Count | QA Relevant |
|--------|-------|-------------|
| ... | ... | YES - reason / NO |
| Total Sprint {N} | {total} | |

## Testing Queue (Priority Order)

### Wave 1 - NOW IN DEVSTAGE ({date})
| # | Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs | Status |
|---|--------|------|-------|----------|-----|---------|----------|-----|-----|-----|--------|
| 1 | {ID} | {type} | {title} | {priority} | {dev} | {project} | {platform} | - | - | - | PENDING |

#### Wave 1 Notes
- {Ticket ID}: {context, shift-left work, special considerations}

#### Wave 1 Dependencies
- {Ticket A} relates to {Ticket B} — {reason}

### Missing Formal Testing (TestedDevStage without Artifacts)
{include ONLY if present}
| Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs | Issue |

### Wave 2 - Pipeline (Dev Complete)
#### Dev Complete (Merged) - {count}
| Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs |

#### Dev Complete (In Review) - {count}
| Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs | Notes |

### In Progress - Still Being Developed ({count})
### Blocked ({count})
### Prioritized ({count})
### Done ({count})
### Cancelled ({count})

## Sprint Carryovers from Sprint {N-1}
{include ONLY if previous_sprint_file was provided}
| Ticket | Sprint {N-1} Status | Sprint {N} Status | Notes |

## QA Automation Tasks (Our Work)
{include ONLY if detected}
| Ticket | Title | Status | Notes |

## Sprint {N} Stats
| Metric | Value |
|--------|-------|
| Total Sprint Tickets | {total} |
| DevStage (QA Queue) | {count} |
| Wave 1 Tested (PASSED) | 0/{wave1_count} |
| Pipeline (Dev Complete + In Progress) | {count} |
| Blocked / Prioritized / Done / Cancelled | {counts} |
| Carryovers from Sprint {N-1} | {count or 0} |
| Total Tested So Far | 0 |

## Session Log
### {YYYY-MM-DD} - Sprint {N} Setup & Triage
- Queried {{ISSUE_TRACKER}}: {total} tickets in Sprint {N}
- {wave1_count} DevStage tickets identified ({list IDs})
- {assigned_count} assigned to {qa_lead}, {unassigned_count} unassigned
- {carryover_count} carryovers from Sprint {N-1}: {list}
- Created SPRINT-{N}-TESTING.md tracker
```

### Framework file conventions

1. **Status column in Wave 1**: the orchestrator scans for `PENDING` to pick the next ticket. Valid values during a sprint: `PENDING`, `PASSED`, `FAILED`, `BLOCKED`, `DEFERRED`, `SKIPPED`.
2. **ATP / ATR / TCs columns**: initialized as `-`; updated AFTER Stage 3 completes for each ticket (e.g. `51`, `61`, `4`).
3. **Priority order** inside Wave 1: the `#` column determines testing order — pick the lowest-numbered `PENDING`. Order: Critical bugs -> Critical features -> High -> Medium -> Low.
4. **Wave promotion**: when tickets move to DevStage mid-sprint, append them to a new wave section (Wave 2 becomes active, renumber). Read the latest wave with `PENDING` tickets.
5. **Session Log**: each testing session appends an entry. Provides continuity across AI sessions.

---

## Part 2 — The per-ticket loop

```
ORCHESTRATOR                           SUB-AGENTS
    |
    |-> Read SPRINT-{N}-TESTING.md
    |-> Pick next ticket (see STEP 1)
    |
    |-> Dispatch SESSION START ------> Creates PBI + context.md + test-session-memory.md
    |-> Present Story Explanation, WAIT for user OK
    |
    |-> Dispatch PLANNING ----------> Updates memory (artifacts, test data)
    |-> Brief user (1-2 lines)
    |
    |-> Dispatch EXECUTION ---------> Updates memory (TC statuses, findings)
    |-> If BUG_FOUND: present, WAIT for user decision
    |
    |-> Dispatch REPORTING ---------> Updates memory (final status)
    |-> Verify Checklist
    |-> Update SPRINT-{N}-TESTING.md (Status, ATP, ATR, TCs)
    |-> Present per-ticket summary, WAIT for user OK
    |-> Loop to next ticket
```

### STEP 1 — Auto-detect the next ticket

Scan the sprint file in this order:

1. If `continue-from` was provided, jump directly to that ticket.
2. "Missing Formal Testing" section — tickets in a tested state with no ATP/ATR. Process these first (retroactive formal testing).
3. Current wave (Wave 1 by default) — first ticket with `Status = PENDING`.
4. If the current wave is done, check whether a new wave has formed and repeat.

Once chosen: note ID / type / title / priority, check for an existing `test-session-memory.md` (interrupted session), tell the user which ticket and why.

### STEP 2 — Dispatch sub-agents per workflow

| Ticket Type | Sub-agent 1 | Sub-agent 2 | Sub-agent 3 | Sub-agent 4 |
|-------------|-------------|-------------|-------------|-------------|
| Feature / Product Roadmap / UX-UI / Task / QA Task | Session Start | Stage 1 Planning (Feature) | Stage 2 Execution | Stage 3 Reporting |
| Bug | Session Start | Bug Planning (Phase 1: Triage + Planning) | Bug Execution (Phase 2) | Bug Reporting (Phase 3) |

---

## Sub-agent prompt templates

Every template shares the same shell below. The orchestrator fills `{placeholders}` per sub-agent, then adds the sub-agent-specific TASK block from the matrix that follows. Detailed step instructions for each stage live in the stage-specific reference — do NOT duplicate them here.

### Shared shell

```
ROLE: QA sub-agent executing {STAGE} for {{PROJECT_KEY}}-{number}.

REFERENCES TO LOAD: {reference name from matrix}

CONTEXT FILES TO READ (in order):
  1. {test-session-memory.md path}   # READ THIS FIRST (except Session Start — writes it)
  2. {context.md path}
  3. {module-context.md path}
  # Session Start reads instead: .context/mapping/business-data-map.md, .context/mapping/business-feature-map.md, .context/mapping/business-api-map.md, .context/master-test-plan.md

TICKET: {{PROJECT_KEY}}-{number} -- {title}
TYPE: {type}
PRIORITY: {priority}
TEST DATA: {from memory, when relevant}

TASK: {stage-specific steps — see matrix}

MEMORY UPDATE: before finishing, update the relevant section of test-session-memory.md
  (Stage Results > {Stage}; TMS Artifacts; Test Data; Bugs Found; Observations).

EXIT CHECKLIST: in memory.md > Checklist > {Stage}, mark [x] every completed item.
  Leave [ ] + explanation in Observations for any uncompleted item.

REPORT BACK: structured summary — see matrix.

IMPORTANT: credentials always from .env. Never hardcode. Never ask the user for
  confirmation yourself — the orchestrator handles user interaction.
```

### Per-stage matrix

> **Prerequisite (every row that mentions `[ISSUE_TRACKER_TOOL]` or `[TMS_TOOL]`)**: the dispatched sub-agent must load `/acli` before executing the task; in Modality A (Xray) also load `/xray-cli`. Sub-agents inherit the orchestrator's skill registry, so the orchestrator only needs to load them once at Session Start §0.1 — but include the reminder in the sub-agent TASK block if it executes standalone.

| Stage | Reference to load | TASK (summary) | REPORT BACK |
|-------|-------------------|----------------|-------------|
| **Session Start** | `references/session-entry-points.md` (Session Start section) | Fetch ticket + comments via `[ISSUE_TRACKER_TOOL]`; extract Team Discussion; load project context; load/create module-context; explore backend + frontend; find test data via `[DB_TOOL]` on `{{DB_MCP}}`; create PBI folder + context.md + evidence/ + test-session-memory.md; configure `.playwright/cli.config.json` if UI testing; write Story Explanation into memory. | Status, PBI path, memory path, Story Explanation (verbatim), Readiness READY/BLOCKED, Checklist X/Y, 2-3 sentence key findings. |
| **Planning (Feature)** | `references/acceptance-test-planning.md` | Triage (veto or risk score); discover test data; create ATP + ATR linked to Story; link ATP -> ATR; fill Test Analysis in ATP; write AC Gaps (or confirm none); create TCs with full traceability (`--story + --test-plan + --test-result`); `[TMS_TOOL] trace {{PROJECT_KEY}}-{number}`; mark ATP complete; transition TCs to Ready; create test-analysis.md in PBI. | Status, Triage result, ATP ID, ATR ID, TC IDs+names, Test data, AC Gaps, Checklist X/Y. |
| **Planning (Bug)** | `references/session-entry-points.md` (Bug workflow Phase 1) + `references/acceptance-test-planning.md` (Bug Analysis variant) | Veto check (SKIP -> Code Review workflow, finish; REQUIRE -> continue); Bug Analysis; create ATP + ATR (no TCs); link; fill Bug Analysis in ATP; discover test data; mark ATP complete. | Status, Veto (skip/require + reason), ATP ID, ATR ID, Bug Analysis 2-3 sentences, Checklist X/Y. |
| **Execution (Feature)** | `references/exploration-patterns.md` | SMOKE TEST FIRST (configure evidence dir; Go / No-Go); then UI exploration on `{{WEB_URL}}`, API on `{{API_URL}}`, DB via `[DB_TOOL]` — whichever apply; update TC statuses (PASSED/FAILED); explore beyond TCs; create new TCs for significant findings. | Status (COMPLETED/BLOCKED/BUG_FOUND), Smoke PASSED/FAILED, TC results X/Y + FAILED list, new TCs, bugs, observations, evidence paths, Checklist X/Y. |
| **Execution (Bug)** | `references/session-entry-points.md` (Bug workflow Phase 2) + `references/exploration-patterns.md` (evidence + smoke + DB cross-validation) | Configure evidence dir; reproduce original bug; verify fix resolves it; regression pass on adjacent areas; DB cross-validation if applicable; capture evidence. | Status, Fix verified YES/NO, Regression issues none/describe, evidence paths, Checklist X/Y. |
| **Reporting** (Feature & Bug) | `references/reporting-templates.md` | Compile TC summary; fill ATR Test Report via `[TMS_TOOL] atr update`; mark ATR complete; create test-report.md in PBI; post QA comment via `[ISSUE_TRACKER_TOOL]`; transition ticket to tested state. | Status, Result PASSED/FAILED, ATR ID, TC summary, ticket status Tested, bugs filed, evidence paths (for user to attach), QA comment pasted/clipboard, Checklist X/Y. |

---

## test-session-memory.md template

Created at `.context/PBI/{module-name}/{{PROJECT_KEY}}-{number}-{brief-title}/test-session-memory.md`. Shared memory across sub-agents.

```markdown
# Test Session Memory: {{PROJECT_KEY}}-{number}

> Shared memory across sub-agents. Each stage updates its section.
> Last updated: {YYYY-MM-DD HH:MM} by Session Start

## Ticket
- ID / Title / Type / Priority / Dev / Project / Platform / Sprint / Status

## Story Explanation
{2-3 paragraphs written for the QA lead to read + confirm before proceeding}

## Acceptance Criteria
{Numbered list from the ticket}

## Team Discussion
{Key points from ticket comments — chronological; skip bot / social noise}

## Environment
- Web: {{WEB_URL}} | API: {{API_URL}}
- DB MCP: {{DB_MCP}} | API MCP: {{API_MCP}}

## Test Data
{Entities / IDs / owners from DB exploration}

## Repositories
- Backend: {{BACKEND_REPO}} ({{BACKEND_STACK}}, entry {{BACKEND_ENTRY}})
- Frontend: {{FRONTEND_REPO}} ({{FRONTEND_STACK}}, entry {{FRONTEND_ENTRY}})

## Code Locations
### Backend ({{BACKEND_REPO}})
### Frontend ({{FRONTEND_REPO}})
### Database ({{DB_TYPE}})

## TMS Artifacts
| Type | ID | Name | Status |
|------|----|------|--------|
| ATP  | -  | -    | -      |
| ATR  | -  | -    | -      |
| TC   | -  | -    | -      |

## Paths
- PBI: .context/PBI/{module-name}/{{PROJECT_KEY}}-{number}-{brief-title}/
- Module Context: .context/PBI/{module-name}/module-context.md

## Stage Results
### Session Start
### Planning
### Execution
### Reporting

## Bugs Found
{append when found}

## Observations
{non-blocking findings}

## Checklist

### Session Start
- [ ] Ticket + comments fetched
- [ ] Project context loaded
- [ ] Module context loaded or created
- [ ] Code explored (backend + frontend as applicable)
- [ ] Test data candidates identified
- [ ] PBI folder + context.md + test-session-memory.md created
- [ ] Story Explanation written
- [ ] Playwright config set (if UI test)

### Planning (Feature)
- [ ] Triage completed (veto or risk score)
- [ ] Test data discovered via DB
- [ ] ATP + ATR created and linked to Story; ATP linked to ATR
- [ ] Test Analysis filled in ATP
- [ ] AC Gaps written (or confirmed: none)
- [ ] TCs created with full traceability
- [ ] Traceability verified ([TMS_TOOL] trace)
- [ ] ATP marked complete; TCs transitioned to Ready
- [ ] test-analysis.md created in PBI

### Planning (Bug)
- [ ] Veto check completed
- [ ] Bug Analysis written in ATP
- [ ] ATP + ATR created and linked
- [ ] Test data discovered
- [ ] ATP marked complete

### Execution
- [ ] Smoke test passed (Go/No-Go)
- [Feature] All TCs executed; none NOT RUN
- [Feature] TCs marked PASSED or FAILED in [TMS_TOOL]
- [Feature] Edge cases explored beyond TCs
- [Bug] Fix verified against original bug ACs
- [Bug] Regression check on adjacent areas
- [ ] DB cross-validation performed (if applicable)
- [ ] Evidence screenshots saved
- [ ] Bugs documented (if found)

### Reporting
- [ ] ATR report filled and marked complete
- [ ] test-report.md created in PBI
- [ ] QA comment posted
- [ ] Ticket transitioned to tested state
```

---

## STEP 4 — Post-ticket actions (orchestrator-owned)

After Sub-agent 4 finishes:

1. Read the final `test-session-memory.md`.
2. Verify the Checklist (STEP 5 below).
3. Update `SPRINT-{N}-TESTING.md`:
   - Change Status `PENDING` -> `PASSED` / `FAILED`.
   - Fill ATP / ATR / TCs columns.
   - Update the Stats section.
4. Present a per-ticket summary:

   ```
   TICKET: {{PROJECT_KEY}}-{XXX} -- {title}
   TYPE: {type} | PRIORITY: {priority} | RESULT: {PASSED/FAILED}
   ARTIFACTS: ATP-{N}, ATR-{N}, TCs: {list}
   BUGS: {count or none} | AC GAPS: {count or none}
   OBSERVATIONS: {if any}

   Remaining queue:
   {list remaining PENDING tickets with priority}

   Ready for next ticket? (waiting for OK)
   ```
5. WAIT for user OK before the next ticket.

---

## STEP 5 — Final verification (orchestrator)

Inspect `test-session-memory.md > Checklist`.

1. Count `[x]` vs `[ ]` across all stages, filtering by ticket type (Feature or Bug).
2. All applicable `[x]`: proceed to update the sprint file.
3. Any applicable `[ ]` still:
   - Check Observations for the reason.
   - Valid reason (e.g. "N/A — no UI changes"): proceed.
   - Missing / unclear: inform the user and ask before marking done.
4. Orchestrator-only items:
   - [ ] Story explained and confirmation received
   - [ ] Sprint testing file updated
   - [ ] Final summary presented to user

---

## STEP 6 — Interrupted session recovery

If `test-session-memory.md` already exists for the next ticket:

1. Read it to determine the last completed stage.
2. Inform the user: "Found interrupted session for `{{PROJECT_KEY}}-{XXX}`. Last completed: {stage}. Resuming from {next stage}."
3. Skip completed stages; dispatch the next sub-agent in sequence.
4. The sub-agent reads the existing memory and continues from there.

Same procedure when `continue-from` is given.

---

## STEP 7 — Session summary (before wrapping up)

When the user indicates they are done (or wrapping up), present:

```markdown
## Sprint {N} -- Session Summary ({date})

| # | Ticket | Type | Priority | Title | Result | Board Status | Dev | TCs | AC Gaps | Bugs | Artifacts |
|---|--------|------|----------|-------|--------|--------------|-----|-----|---------|------|-----------|
| 1 | {{PROJECT_KEY}}-{X} | {type} | {priority} | {title} | {PASSED/FAILED/SKIPPED} | {board status} | {dev} | {X/Y (rate%)} | {count or None} | {count or None} | ATP-{N}, ATR-{N}, TCs {list} |
```

**Column definitions**: Type (Bug / Product Roadmap / Feature / Task); Priority (Critical / High / Medium / Not as Important); Result (PASSED / FAILED / SKIPPED + reason); Board Status (current on `{{ISSUE_TRACKER}}`); Dev (implementer); TCs (pass/total + rate; for bugs "DB verified" or "N/A"); AC Gaps (None if all verified); Bugs (None if clean); Artifacts (IDs).

After the table:

```
Session stats: {X} tickets tested, {Y} TCs executed, {Z}% pass rate
Remaining queue: {list remaining PENDING tickets with priority}
```

---

## Error protocol recap

| Signal | Action |
|--------|--------|
| Sub-agent returns `Status: BLOCKED` | Do NOT advance. Show reason, wait for user. |
| Sub-agent reports TOOL FAILURE (MCP / `[AUTOMATION_TOOL]` / `[TMS_TOOL]` / `[ISSUE_TRACKER_TOOL]`) | Stop, surface error, wait for user instructions. |
| Sub-agent reports BUG_FOUND | Pause, present bug, wait for user decision. |
| Framework file missing / malformed | Offer to (re)generate via Part 1. |
| `continue-from` ticket not in file | List available tickets, ask user to confirm. |

Never proceed silently past an error.
