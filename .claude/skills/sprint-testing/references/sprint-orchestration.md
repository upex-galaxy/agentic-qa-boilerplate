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
   - Wave 1 = DevStage / {{jira.status.story.ready_for_qa}} + tickets in a "tested" state missing formal artifacts. Sort: Priority then QA assignment.
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

Every dispatch uses the **6-component briefing format** defined in `.claude/skills/framework-core/references/briefing-template.md` (Goal / Context docs / Skills to load / Exact instructions / Report format / Rules). The four briefings below cover the per-ticket cadence (Session Start -> Stage 1 -> Stage 2 -> Stage 3) and are used VERBATIM in BOTH single-ticket and batch modes — single-ticket runs them once, batch loops them per Wave 1 PENDING ticket. Detailed step instructions live in the stage-specific reference — do NOT duplicate them here.

> **Variable resolution**: `<TICKET_KEY>`, `<MODULE>`, `<BRIEF_TITLE>`, `<PBI_FOLDER>`, `<ENV>` are session variables filled by the orchestrator before dispatch. `<PBI_FOLDER>` resolves to `.context/PBI/<MODULE>/<TICKET_KEY>-<BRIEF_TITLE>/` (absolute path). `{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{API_URL}}`, `{{API_MCP}}`, `{{DB_MCP}}` resolve from `.agents/project.yaml` per `AGENTS.md` §"Project Variables".

> **Skill-loading invariant**: every briefing that touches `[ISSUE_TRACKER_TOOL]` requires `/acli`; every briefing that touches `[TMS_TOOL]` in Modality A also requires `/xray-cli`. Sub-agents inherit the orchestrator's skill registry, so the orchestrator only needs to load them once at Session Start §0.1 — but each briefing's "Skills to load" line lists them explicitly so the dispatch is self-contained.

> **Bug-vs-Feature divergence**: the Stage 1 briefing applies the veto + risk-score decision tree only when `<TICKET_TYPE>` is `Bug`; for Feature/Story tickets it produces the full ATP per `acceptance-test-planning.md` Phases 1-7. The Stage 2 and Stage 3 briefings keep the same shape; their internal step list adapts (smoke + reproduce + regression vs smoke + triforce; Template C/D vs PASSED/FAILED comment).

### Briefing 1 — Session Start subagent

```
Goal: Fetch ticket <TICKET_KEY> from the issue tracker, load relevant context, create the PBI folder, and return a session-start report.

Context docs:
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/AGENTS.md (§"Local Context (PBI)" folder convention)
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/master-test-plan.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/mapping/business-data-map.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/mapping/business-feature-map.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/mapping/business-api-map.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/sprint-testing/references/session-entry-points.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.agents/project.yaml (project metadata + active env)

Skills to load: /acli (for the issue-tracker fetch)

Exact instructions:
  1. [ISSUE_TRACKER_TOOL] Fetch Issue: <TICKET_KEY> (capture: type, summary, AC list, status, components, fix-version, comments).
  2. Determine <MODULE> from components/labels per session-entry-points.md §"Step 4 — Module context".
  3. Generate <BRIEF_TITLE> (max 5 words, kebab-case) from the ticket summary.
  4. Create <PBI_FOLDER> = .context/PBI/<MODULE>/<TICKET_KEY>-<BRIEF_TITLE>/ with:
       - context.md (ticket summary + AC list + Team Discussion + Related Code + "Open questions" section, populated per session-entry-points.md §"Step 7")
       - test-session-memory.md (template from this reference §"test-session-memory.md template")
       - evidence/ (empty directory)
  5. Extract Team Discussion from comments per session-entry-points.md §"Step 1b" rules.
  6. For Bug tickets: include the bug-specific fields (steps to reproduce, expected vs actual) in context.md.
  7. Write the Story Explanation into test-session-memory.md (the orchestrator presents it to the user).

Report format:
  {
    "ticket_key": "<TICKET_KEY>",
    "type": "Story | Bug | Task | ...",
    "module": "<MODULE>",
    "pbi_folder": "<absolute path>",
    "memory_path": "<PBI_FOLDER>/test-session-memory.md",
    "ac_count": <int>,
    "open_questions": [...],
    "ticket_summary": "...",
    "story_explanation": "<verbatim text written to memory>",
    "readiness": "READY | BLOCKED",
    "checklist": "X/Y"
  }

Rules:
  - Do NOT modify the issue in the issue tracker (read-only operation; no comments, no transitions).
  - Do NOT load all of .context/ — only the docs listed above.
  - Critical Rule #1 (Login Credentials): if any tool needs auth, reference .env keys; never hardcode.
  - Never ask the user for confirmation — the orchestrator handles user interaction.
```

### Briefing 2 — Stage 1 Planning subagent

```
Goal: Produce ATP, risk-triage, and draft TCs for <TICKET_KEY> in <PBI_FOLDER>; for Bug tickets, apply the veto + risk-score decision tree before producing the ATP.

Context docs:
  - <PBI_FOLDER>/context.md (output of Session Start)
  - <PBI_FOLDER>/test-session-memory.md (READ FIRST — shared memory)
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/sprint-testing/references/acceptance-test-planning.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/mapping/business-feature-map.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/mapping/business-api-map.md (if API-affecting)
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/PBI/<MODULE>/module-context.md (if it exists)

Skills to load: /acli (for ATP/ATR creation + Story link); in Modality A also /xray-cli (for [TMS_TOOL] Test Plan / Test Execution issues).

Exact instructions:
  1. Bug branch: run the veto decision tree per acceptance-test-planning.md §"Phase 0 — Triage" (SKIP -> emit veto_outcome=skip, write minimal Bug Analysis, exit; REQUIRE -> continue).
  2. Risk triage per acceptance-test-planning.md §"0.2 Risk score" (impact x likelihood -> P0|P1|P2 distribution).
  3. Translate ACs into ATP rows (one row per testable behavior); apply Phases 1-4 of acceptance-test-planning.md (Critical Analysis, Story Quality, Refined ACs, Test Outlines).
  4. Draft TC outlines (summary + steps + expected) — full TC bodies are formalized in Stage 4 (test-documentation), not here.
  5. Create ATP + ATR per the modality branch in acceptance-test-planning.md §"Phase 6 — Traceability + Ticket updates":
       - Modality A: [TMS_TOOL] Create TestPlan + Create Execution; link to Story via [ISSUE_TRACKER_TOOL] Link Issues.
       - Modality B: [ISSUE_TRACKER_TOOL] Update Issue with {{jira.acceptance_test_plan_atp}} field + comment mirror.
  6. Write artifacts to <PBI_FOLDER>/test-analysis.md (byte-for-byte mirror of the Jira/TMS comment).
  7. Update <PBI_FOLDER>/test-session-memory.md sections: TMS Artifacts, Test Data, Stage Results > Planning, Checklist > Planning.

Report format:
  {
    "atp_path": "<PBI_FOLDER>/test-analysis.md",
    "atp_id": "<TMS issue key | story-field>",
    "atr_id": "<TMS issue key | story-field>",
    "atc_drafts": [{ "title": "...", "type": "Positive|Negative|Boundary|Edge", "priority": "P0|P1|P2" }],
    "risk_distribution": { "P0": <int>, "P1": <int>, "P2": <int> },
    "veto_outcome": "proceed | skip | require | escalate",
    "ac_gaps": [...],
    "open_questions": [...],
    "checklist": "X/Y"
  }

Rules:
  - Do NOT execute any test (Stage 2 owns execution).
  - Do NOT create formal TMS Test entities (Stage 4 / test-documentation owns that).
  - Critical Rule #2 (Plan Before Coding): outputs are plans + outlines, no test code.
  - Surface open_questions to the orchestrator instead of guessing AC behavior.
  - Mirror order: Jira/TMS comment is canonical; <PBI_FOLDER>/test-analysis.md is the byte-for-byte mirror.
```

### Briefing 3 — Stage 2 Execution subagent

```
Goal: Run smoke pass + triforce exploration (UI / API / DB) for <TICKET_KEY> against the <ENV> environment; capture evidence; surface any BUG_FOUND.

Context docs:
  - <PBI_FOLDER>/test-analysis.md (the ATP from Stage 1)
  - <PBI_FOLDER>/test-session-memory.md (READ FIRST — shared memory)
  - <PBI_FOLDER>/context.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/sprint-testing/references/exploration-patterns.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.agents/project.yaml (active env URLs and MCP names)
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.context/mapping/business-data-map.md (entity flows for DB exploration)

Skills to load: /playwright-cli (UI exploration); the active environment's API and DB MCPs ({{API_MCP}} and {{DB_MCP}} from project.yaml). For Bug tickets: same set, no extras.

Exact instructions:
  1. Mark the ticket as actively testing (substrate-driven, idempotent, non-blocking). Resolve `{{jira.transition.<work_type>.start_testing}}` and `{{jira.status.<work_type>.in_test}}` from `.agents/jira-workflows.json` (per AGENTS.md §"Project Variables"). Call `[ISSUE_TRACKER_TOOL] Get Transitions` for `<TICKET_KEY>`. Skip (and emit `skipped_reason`) if any of these hold:
       - current status already equals `{{jira.status.<work_type>.in_test}}` -> `"already_in_test"`
       - the substrate slug is undefined for `<work_type>` (e.g. Bug work types without an intermediate in-testing state) -> `"no_in_test_state_for_<work_type>"`
       - the resolved transition id is not available from the current status -> `"transition_not_available_from_<current_status>"`
     Otherwise execute `[ISSUE_TRACKER_TOOL] Transition Issue` with the resolved transition id and append `{ when: "pre-smoke", from, to, transition_id }` to `Stage Results > Execution > Transition Trail` in `test-session-memory.md`. Never abort Stage 2 on this step — surface the skip reason in the report and proceed.
  2. Configure evidence: set .playwright/cli.config.json `outputDir` to <PBI_FOLDER>/evidence/. Screenshots also need full path in --filename (outputDir does NOT apply to .png).
  3. Smoke (5-10 min, ALWAYS FIRST): validate the happy path of every P0 ATC. If smoke fails, emit smoke_result=fail and STOP — do NOT proceed to deep exploration.
  4. Triforce UI: explore edge cases, empty states, validation errors per exploration-patterns.md §1.
  5. Triforce API: hit the relevant endpoints with valid + invalid + boundary payloads via the API MCP per exploration-patterns.md §2.
  6. Triforce DB: verify state changes via the DB MCP for write-side ATCs per exploration-patterns.md §3.
  7. Bug branch: replace steps 4-6 with reproduce-original -> verify-fix -> regression-pass on adjacent areas -> DB cross-validation if data-integrity bug (per session-entry-points.md §"Bug workflow Phase 2").
  8. Capture evidence (screenshots, traces, response samples) under <PBI_FOLDER>/evidence/ using the naming rule from exploration-patterns.md.
  9. For each defect found: build a BUG_FOUND entry with severity, repro steps, evidence paths.
  10. Update <PBI_FOLDER>/test-session-memory.md sections: Stage Results > Execution, Bugs Found, Observations, Checklist > Execution.

Report format:
  {
    "start_test_transition": { "executed": true|false, "from": "<status>", "to": "<status>", "transition_id": "<id|null>", "skipped_reason": null|"<reason>" },
    "smoke_result": "pass | fail | partial",
    "triforce": {
      "ui": [{ "atc": "...", "result": "PASSED|FAILED", "evidence": [...] }],
      "api": [{ "endpoint": "...", "result": "PASSED|FAILED", "evidence": [...] }],
      "db": [{ "query": "...", "result": "PASSED|FAILED", "evidence": [...] }]
    },
    "tc_results": { "passed": <int>, "failed": <int>, "total": <int> },
    "bugs_found": [{ "summary": "...", "severity": "Critical|High|Medium|Low", "evidence_paths": [...], "repro_steps": "..." }],
    "blockers": [...],
    "checklist": "X/Y"
  }

Rules:
  - Do NOT file the bug in the issue tracker yet — Stage 3 handles filing per the bug-report template in reporting-templates.md.
  - Do NOT modify production data; for write-side checks use staging entities flagged in the ATP.
  - Critical Rule #1 (Login Credentials): credentials always from .env; never hardcode.
  - Stop and surface to orchestrator on any blocker (env down, auth failure, infra issue) — do NOT auto-retry.
```

### Briefing 4 — Stage 3 Reporting subagent

```
Goal: Fill the ATR, post the QA comment, transition the issue, and file bug reports for <TICKET_KEY>.

Context docs:
  - <PBI_FOLDER>/test-analysis.md (ATP)
  - <PBI_FOLDER>/test-session-memory.md (READ FIRST — shared memory; contains Stage 2 results)
  - <PBI_FOLDER>/evidence/ (Stage 2 evidence)
  - <PBI_FOLDER>/context.md (ticket summary)
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.claude/skills/sprint-testing/references/reporting-templates.md
  - /home/sai/Desktop/upex/web-apps/agentic-qa-boilerplate/.agents/jira-fields.json (custom field IDs for ATR/ATP — Modality B only)

Skills to load: /acli (issue updates + comments + transitions + bug creation); in Modality A also /xray-cli (only when ATR is an Xray Test Execution and Test Run statuses must be updated).

Exact instructions:
  1. Compile TC summary from test-session-memory.md (total, PASSED, FAILED, pass rate).
  2. Fill <PBI_FOLDER>/test-report.md from the ATR template in reporting-templates.md §"ATR Test Report body".
  3. Update the ATR in TMS:
       - Modality A: [TMS_TOOL] Update Test Execution / Run statuses; mark ATR complete.
       - Modality B: [ISSUE_TRACKER_TOOL] Update Issue with {{jira.acceptance_test_results_atr}} field + comment mirror.
  4. Post QA comment on <TICKET_KEY> via [ISSUE_TRACKER_TOOL] Add Comment using the matching template from reporting-templates.md (Story PASSED/FAILED, or Bug Template C/D).
  5. Transition <TICKET_KEY> to the work-type terminal QA state via [ISSUE_TRACKER_TOOL] Transition Issue. Resolve from substrate:
       - Story PASSED -> `{{jira.transition.story.qa_sign_off}}` (`in_test` -> `qa_approved`).
       - Bug PASSED -> `{{jira.transition.bug.retest_passed}}` (`ready_for_qa` -> `closed`).
       - FAILED (any work type) -> do NOT execute `qa_sign_off` / `retest_passed`. Leave the ticket in its current state, ensure the QA comment + bug links surface the outcome to dev, and emit `transition_skipped: "failed_no_canonical_transition"`. The "send back to dev" transition is project-specific and not part of the canonical substrate yet.
     Append the executed transition (or skip reason) to `Stage Results > Reporting > Transition Trail` in `test-session-memory.md`. Never close the ticket yourself; never bypass the substrate slug.
  6. For each BUG_FOUND from Stage 2: [ISSUE_TRACKER_TOOL] Create Issue --type Bug with the summary format `<EPIC>: <COMPONENT>: <ISSUE_SUMMARY>` from reporting-templates.md §1.2; populate description, severity, repro steps, evidence links; link to the parent ticket.
  7. Update <PBI_FOLDER>/test-session-memory.md sections: TMS Artifacts (final IDs), Stage Results > Reporting, Checklist > Reporting.

Report format:
  {
    "atr_path": "<PBI_FOLDER>/test-report.md",
    "atr_id": "<TMS issue key | story-field>",
    "result": "PASSED | FAILED",
    "tc_summary": { "total": <int>, "passed": <int>, "failed": <int>, "pass_rate": "<percent>" },
    "qa_comment_id": "<comment id or 'posted'>",
    "transition": "<from_status> -> <to_status>",
    "bugs_filed": [{ "key": "<TMS_KEY>", "summary": "..." }],
    "evidence_paths_for_user": [...],
    "errors": [...],
    "checklist": "X/Y"
  }

Rules:
  - Do NOT edit ACs on the parent ticket (read-only on AC fields).
  - Do NOT close the ticket — only transition to the QA-defined state.
  - Apply the bug summary format from reporting-templates.md §1.2 verbatim (no improvisation).
  - On 4xx/5xx from any [ISSUE_TRACKER_TOOL] / [TMS_TOOL] call: stop, report partial state, do NOT auto-retry the transition.
  - Critical Rule #3 (No AI Attribution): the QA comment must look human-authored.
  - All TMS content in English (Critical Rule from AGENTS.md §"Language").
```

### Shared sub-agent shell (legacy — kept for memory bookkeeping)

The four briefings above replace the previous narrative shell. The memory-update + checklist-tick contract that every subagent must honor is summarized below — each briefing's "Exact instructions" already references it explicitly.

```
MEMORY UPDATE: before finishing, update the relevant section of test-session-memory.md
  (Stage Results > {Stage}; TMS Artifacts; Test Data; Bugs Found; Observations).

EXIT CHECKLIST: in memory.md > Checklist > {Stage}, mark [x] every completed item.
  Leave [ ] + explanation in Observations for any uncompleted item.

IMPORTANT: credentials always from .env. Never hardcode. Never ask the user for
  confirmation — the orchestrator handles user interaction.
```

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
{Stage 2 subagent fills this with smoke / triforce / bug findings. MUST include a `#### Transition Trail` sub-block recording every status change driven by the skill (one row per transition):}

#### Transition Trail
| When | From | To | Transition ID |
|------|------|----|---------------|
| Pre-smoke | {{jira.status.<work_type>.ready_for_qa}} | {{jira.status.<work_type>.in_test}} | <id> |
| Post-Stage 3 | {{jira.status.<work_type>.in_test}} | {{jira.status.<work_type>.qa_approved}} | <id> |

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
- [ ] Ticket transitioned to in-test (or skipped per substrate)
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
- [ ] Ticket transitioned to the work-type terminal QA state via substrate (or skipped on FAILED)
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
