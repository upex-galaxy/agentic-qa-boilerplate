# Traceability Fix

Act as a Senior QA Engineer fixing TMS traceability and naming conventions.

---

## TASK

**FIX TMS TRACEABILITY AND NAMING ISSUES**

Use this prompt when:
- Traceability is broken (artifacts not linked correctly)
- Naming conventions are incorrect
- TCs missing required fields
- ATP/ATR not linked to User Story

---

## WHEN TO USE

| Symptom | Use This Prompt |
|---------|-----------------|
| TMS traceability check shows missing links | Yes |
| TC missing Test Plan or Test Result link | Yes |
| ATP/ATR not linked to User Story | Yes |
| TC name doesn't follow "Should X when Y" format | Yes |
| ATP/ATR name doesn't follow standard format | Yes |

---

## PREREQUISITE

> **Before executing any TMS commands**, ensure the TMS tool is available and authenticated.
>
> ```
> [TMS_TOOL] Authenticate
> ```
>
> Resolved via [TMS_TOOL] — see Tool Resolution in CLAUDE.md

---

## INPUT REQUIRED

**Ticket ID:** `{TICKET-ID}` (e.g., UPEX-123, TK-456)

---

## WORKFLOW

### Step 1: Run Traceability Check

Use your TMS CLI tool to verify all artifact links:

```
[TMS_TOOL] List Tests:
  - issue: {TICKET-ID}

[TMS_TOOL] Verify Traceability:
  - issue: {TICKET-ID}
```

> Resolved via [TMS_TOOL] — see Tool Resolution in CLAUDE.md

**Expected output:** All links verified (Story <-> ATP <-> ATR <-> TCs)

**If issues found:** Continue to Step 2.

### Step 2: Get Full Ticket Details

Fetch the ticket to get its full title and current links:

```
[ISSUE_TRACKER_TOOL] Get Issue:
  - issueId: {TICKET-ID}
```

> Resolved via [ISSUE_TRACKER_TOOL] — see Tool Resolution in CLAUDE.md

**Extract the full title** — this is needed for linking operations.

### Step 3: List Current Artifacts

List all artifacts associated with this ticket:

- **ATP (Acceptance Test Plan):** Should exist and be linked to Story
- **ATR (Acceptance Test Results):** Should exist and be linked to ATP
- **TCs (Test Cases):** Should be linked to Story, ATP, and ATR

### Step 4: Fix Missing Links

Based on what's missing, create or update links:

#### Common Fixes

| Issue | Fix |
|-------|-----|
| TC not linked to Story | Update TC with Story reference |
| TC not linked to Test Plan | Update TC with ATP reference |
| TC not linked to Test Result | Update TC with ATR reference |
| ATP not linked to ATR | Update ATP with ATR reference |
| ATP not linked to Story | Update ATP with Story reference |
| TC name incorrect | Rename to "Should {behavior} when {condition}" |

### Step 5: Verify Fix

Re-run the traceability check from Step 1 to confirm all links are resolved.

---

## TRACEABILITY MODEL

All TMS artifacts must be linked bidirectionally:

```
User Story
    ├── ATP (Acceptance Test Plan)
    │       └── ATR (Acceptance Test Results)
    └── TCs (Test Cases)
            ├── linked to ATP
            └── linked to ATR
```

**TCs require 3 links:** Story, Test Plan (ATP), Test Result (ATR)

---

## NAMING CONVENTIONS

| Artifact | Field | Format |
|----------|-------|--------|
| ATP | Name | `Test Plan: {TICKET-ID}` |
| ATR | Name | `Test Results: {TICKET-ID}` |
| TC | Name | `Should {verb} {behavior} when {condition}` |
| All | User Story | Full ticket title from TMS |

---

## OUTPUT

After fixing, report:

```markdown
## Traceability Fixed: {TICKET-ID}

### Issues Found
- {issue 1}
- {issue 2}

### Fixes Applied
- {fix 1}
- {fix 2}

### Verification
- Traceability check: All links verified

### Current State
| Artifact | ID | Name | Linked |
|----------|-----|------|--------|
| ATP | {id} | Test Plan: {TICKET-ID} | Yes |
| ATR | {id} | Test Results: {TICKET-ID} | Yes |
| TC | {id} | Should X when Y | Yes |
```

---

**Related**: [Acceptance Test Plan](../stage-1-planning/acceptance-test-plan.md) | [QA Workflow](../us-qa-workflow.md)
