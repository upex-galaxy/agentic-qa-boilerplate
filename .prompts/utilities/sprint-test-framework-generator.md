# Sprint Test Framework Generator

> **Purpose**: Auto-generate a `SPRINT-{N}-TESTING.md` file that serves as the single source of truth for in-sprint QA testing. This file is consumed by the sprint-testing-agent orchestrator.
> **When to use**: At the start of each sprint, or when a new wave of tickets enters the testing queue.
> **Output**: `.context/PBI/SPRINT-{N}-TESTING.md`

---

## Parameters

Provide these when loading the prompt. If not provided, the AI will ask.

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `sprint_number` | YES | The sprint number to generate | `10` |
| `qa_lead` | NO | QA lead name (defaults to git user or asks) | `Jane Doe` |
| `previous_sprint_file` | NO | Path to previous sprint file for carryover detection | `.context/PBI/SPRINT-9-TESTING.md` |

---

## Execution Steps

### STEP 0: VALIDATE PARAMETERS

```
IF sprint_number is not provided:
  ASK the user: "Which sprint number should I generate the framework for?"
  WAIT for response.

IF qa_lead is not provided:
  CHECK git config user.name
  IF found: USE as default, CONFIRM with user
  ELSE: ASK "Who is the QA lead for this sprint?"

SET output_path = .context/PBI/SPRINT-{sprint_number}-TESTING.md

IF output_path already exists:
  WARN: "SPRINT-{N}-TESTING.md already exists. Overwrite? (y/n)"
  WAIT for confirmation.
```

### STEP 1: QUERY SPRINT TICKETS

Fetch all tickets assigned to the current sprint from the issue tracker.

```
[ISSUE_TRACKER_TOOL] Query Sprint Tickets:
  - sprint: Sprint {sprint_number}
  - fields: Ticket ID, Type, Title, Priority, Status, QA Assignee, Developer, Project/Epic, Platform
  - sort: Priority DESC, Status ASC
```

Collect and store the full ticket list. Count totals by status.

### STEP 2: CLASSIFY TICKETS BY STATUS

Map each ticket's current status to a QA-relevant category:

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

**Status mapping is project-specific.** Adapt the board status names to match your {{ISSUE_TRACKER}} workflow. The key principle: tickets closest to "ready for QA" go in Wave 1, the rest cascade into Wave 2+ and pipeline.

### STEP 3: DETECT CARRYOVERS (if previous sprint file provided)

```
IF previous_sprint_file is provided:
  READ the previous SPRINT-{N-1}-TESTING.md
  SCAN for tickets where:
    - Status = PENDING, BLOCKED, or DEFERRED
    - Status != PASSED and Status != CANCELLED and Status != Done
  For each carryover ticket:
    - Note: Ticket ID, previous wave, previous status, any existing ATP/ATR/TC IDs
    - Check if the ticket appears in the current sprint query results
    - If YES: mark as carryover with prior context
    - If NO: note as "dropped from sprint" (inform user)
```

### STEP 4: ORGANIZE WAVES

**Wave 1** (NOW - Active Testing Queue):
- All tickets in DevStage / QA Ready status
- Any tickets marked "TestedDevStage" but missing formal artifacts (ATP/ATR/TCs)
- Sort by: Priority (Critical > High > Medium > Low), then by QA assignment

**Wave 2** (Pipeline - Dev Complete):
- Split into: "Merged on Dev" (closest to deploy) and "Ready for Review" (in code review)
- Sort by: Priority

**Pipeline** (In Progress / Blocked):
- Group separately: In Progress vs Blocked
- Note any tickets with QA assignee (early awareness)

**Backlog / Done / Cancelled**:
- List for completeness, minimal detail

### STEP 5: DETECT QA AUTOMATION TASKS

```
SCAN ticket list for:
  - Type = "QA Task" OR Title contains "E2E Tests" / "Integration Tests"
  - Assignee matches qa_lead
COLLECT into a separate "QA Automation Tasks" section
```

### STEP 6: GENERATE THE FILE

Write the file to `{output_path}` using the structure defined below.

### STEP 7: REPORT

After generating, present a summary:

```
SPRINT-{N}-TESTING.md generated at: {output_path}

Board Summary:
  - Total tickets: {count}
  - Wave 1 (active testing): {count}
  - Wave 2 (pipeline): {count}
  - In Progress: {count}
  - Blocked: {count}
  - Carryovers from Sprint {N-1}: {count}

Next action: Load the sprint testing orchestrator to begin testing.
  Context: Load @.context/PBI/SPRINT-{N}-TESTING.md
```

---

## Output File Structure

The generated `SPRINT-{N}-TESTING.md` must follow this exact structure. The sprint-testing-agent orchestrator parses the Testing Queue tables to auto-detect the next ticket.

```markdown
# Sprint {N} - In-Sprint Testing Tracker

> **Purpose**: Track QA testing progress, provide AI context for resuming sessions.
> **Sprint**: Sprint {N}
> **QA**: {qa_lead}
> **Started**: {YYYY-MM-DD}
> **Last Updated**: {YYYY-MM-DD} (Initial generation)

---

## Board Summary

| Status | Count | QA Relevant |
|--------|-------|-------------|
| {status_1} | {count} | {YES - reason / NO} |
| {status_2} | {count} | {YES - reason / NO} |
| ... | ... | ... |
| **Total Sprint {N}** | **{total}** | |

---

## Testing Queue (Priority Order)

### Wave 1 - NOW IN DEVSTAGE ({date})

{count} tickets in DevStage. {assigned_count} assigned to QA ({qa_lead}), {unassigned_count} unassigned.

| # | Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs | Status |
|---|--------|------|-------|----------|-----|---------|----------|-----|-----|-----|--------|
| 1 | {ID} | {type} | {title} | {priority} | {dev} | {project} | {platform} | - | - | - | PENDING |
| ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

#### Wave 1 Notes

- **{Ticket ID}**: {Brief context about the ticket - what it is, any shift-left work done, special considerations.}

#### Wave 1 Dependencies

- {Ticket A} relates to {Ticket B} — {reason}
- {Ticket C} is standalone

---

### Missing Formal Testing (TestedDevStage without Artifacts)

{Include this section ONLY if there are tickets in a tested state with no ATP/ATR/TCs.}

| Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs | Issue |
|--------|------|-------|----------|-----|---------|----------|-----|-----|-----|-------|
| {ID} | {type} | {title} | {priority} | {dev} | {project} | {platform} | - | - | - | Missing formal testing artifacts |

---

### Wave 2 - Pipeline (Dev Complete)

#### Dev Complete (Merged) - {count} tickets

| Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs |
|--------|------|-------|----------|-----|---------|----------|-----|-----|-----|
| {ID} | {type} | {title} | {priority} | {dev} | {project} | {platform} | - | - | - |

#### Dev Complete (In Review) - {count} tickets

| Ticket | Type | Title | Priority | Dev | Project | Platform | ATP | ATR | TCs | Notes |
|--------|------|-------|----------|-----|---------|----------|-----|-----|-----|-------|
| {ID} | {type} | {title} | {priority} | {dev} | {project} | {platform} | - | - | - | {context} |

---

### In Progress - Still Being Developed ({count} tickets)

| Ticket | Type | Title | Priority | Dev | Project | Platform | Notes |
|--------|------|-------|----------|-----|---------|----------|-------|
| {ID} | {type} | {title} | {priority} | {dev} | {project} | {platform} | {context} |

---

### Blocked ({count} tickets)

| Ticket | Type | Title | Priority | Dev | QA Assignee | Notes |
|--------|------|-------|----------|-----|-------------|-------|
| {ID} | {type} | {title} | {priority} | {dev} | {qa or -} | {reason} |

---

### Prioritized ({count} tickets)

| Ticket | Type | Title | Priority | Dev | Notes |
|--------|------|-------|----------|-----|-------|
| {ID} | {type} | {title} | {priority} | {dev} | {context} |

---

### Done ({count} tickets)

| Ticket | Type | Title | Dev | QA | Notes |
|--------|------|-------|-----|-----|-------|
| {ID} | {type} | {title} | {dev} | {qa or -} | {brief note} |

---

### Cancelled ({count} tickets)

| Ticket | Title | Notes |
|--------|-------|-------|
| {ID} | {title} | {reason if known} |

---

## Sprint Carryovers from Sprint {N-1}

{Include this section ONLY if previous_sprint_file was provided and carryovers were detected.}

| Ticket | Sprint {N-1} Status | Sprint {N} Status | Notes |
|--------|---------------------|-------------------|-------|
| {ID} | {previous status and wave} | {current status} | {context: existing artifacts, shift-left work, etc.} |

---

## QA Automation Tasks (Our Work)

{Include this section ONLY if QA automation tasks were detected.}

| Ticket | Title | Status | Notes |
|--------|-------|--------|-------|
| {ID} | {title} | {status} | {context} |

---

## Sprint {N} Stats

| Metric | Value |
|--------|-------|
| Total Sprint Tickets | {total} |
| DevStage (QA Queue) | {count} |
| Wave 1 Tested (PASSED) | 0/{wave1_count} |
| Pipeline (Dev Complete + In Progress) | {count} |
| Blocked | {count} |
| Prioritized | {count} |
| Done | {count} |
| Cancelled | {count} |
| Carryovers from Sprint {N-1} | {count or 0} |
| Total Tested So Far | 0 |

---

## Session Log

### {YYYY-MM-DD} - Sprint {N} Setup & Triage

- Queried {{ISSUE_TRACKER}} backlog: {total} tickets in Sprint {N}
- {wave1_count} DevStage tickets identified ({list ticket IDs})
- {assigned_count} assigned to QA ({qa_lead}), {unassigned_count} unassigned
- {carryover_count} carryovers from Sprint {N-1}: {list if any}
- {count} tickets in pipeline (Dev Complete + In Progress)
- Created SPRINT-{N}-TESTING.md tracker
```

---

## Key Conventions

1. **Status field in Wave 1 table**: The orchestrator scans for `PENDING` to find the next ticket. Always initialize new tickets as `PENDING`. Valid statuses during the sprint: `PENDING`, `PASSED`, `FAILED`, `BLOCKED`, `DEFERRED`, `SKIPPED`.

2. **ATP/ATR/TCs columns**: Initialize as `-`. Updated by the orchestrator after each ticket is tested (e.g., `51`, `61`, `4`).

3. **Priority order in Wave 1**: The `#` column determines testing order. The orchestrator picks the lowest-numbered `PENDING` ticket. Order by: Critical bugs first, then Critical features, then High, Medium, Low.

4. **Wave promotion**: When tickets move to DevStage mid-sprint, add them to a new wave section (Wave 2 becomes the active wave, renumber accordingly). The orchestrator always reads the latest wave with `PENDING` tickets.

5. **Session Log**: Each testing session appends entries. This provides continuity across AI sessions.

---

## Related

- **Consumer**: `.prompts/orchestrators/sprint-testing-agent.md` (orchestrator that reads this file)
- **Context files**: `.context/business-data-map.md`, `.context/project-test-guide.md`
- **PBI structure**: `CLAUDE.md` section "Local Context (PBI)"
