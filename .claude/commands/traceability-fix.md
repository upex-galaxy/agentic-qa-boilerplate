# Traceability Fix

Repair broken TMS traceability links between User Story, ATP, ATR, and Test Cases.

**Input:** $ARGUMENTS
(Ticket ID to fix, e.g. `UPEX-123`.)

---

## When to Use

- TCs are missing links to Story, Test Plan (ATP), or Test Result (ATR)
- ATP/ATR not linked to the User Story
- TC names do not follow the "Should X when Y" convention
- Traceability audit shows broken or missing links

## Traceability Model

All TMS artifacts must be linked bidirectionally:

```
User Story
+-- ATP (Acceptance Test Plan)
|   +-- ATR (Acceptance Test Results)
+-- TCs (Test Cases)
    +-- linked to ATP
    +-- linked to ATR
```

Each TC requires 3 links: Story, Test Plan (ATP), Test Result (ATR).

## Naming Conventions

| Artifact | Format |
|----------|--------|
| ATP | `Test Plan: {TICKET-ID}` |
| ATR | `Test Results: {TICKET-ID}` |
| TC | `Should {verb} {behavior} when {condition}` |

---

## Workflow

### Step 1: Fetch Ticket and Current Artifacts

```
[ISSUE_TRACKER_TOOL] Get Issue:
  - issueId: {from $ARGUMENTS}
```

Extract the ticket's full title and current linked artifacts.

```
[TMS_TOOL] List Tests:
  - issue: {from $ARGUMENTS}
```

List all TCs, ATPs, and ATRs associated with this ticket.

### Step 2: Audit Links

For each artifact, check:

| Check | Expected |
|-------|----------|
| ATP exists and is linked to Story | Yes |
| ATR exists and is linked to ATP | Yes |
| Each TC linked to Story | Yes |
| Each TC linked to ATP | Yes |
| Each TC linked to ATR | Yes |
| ATP name matches convention | `Test Plan: {TICKET-ID}` |
| ATR name matches convention | `Test Results: {TICKET-ID}` |
| TC names match convention | `Should {verb} when {condition}` |

Report all issues found before making any changes.

### Step 3: Present Fix Plan

List each issue and the proposed fix. Wait for user confirmation before proceeding.

Common fixes:

| Issue | Fix |
|-------|-----|
| TC not linked to Story | Add Story link to TC |
| TC not linked to ATP | Add Test Plan link to TC |
| TC not linked to ATR | Add Test Result link to TC |
| ATP not linked to Story | Add Story link to ATP |
| ATP not linked to ATR | Add ATR link to ATP |
| Name does not follow convention | Rename the artifact |

### Step 4: Apply Fixes

Execute each fix using the TMS tool:

```
[TMS_TOOL] Update Test:
  - testId: {tc-id}
  - fields: { links, name as needed }
```

### Step 5: Verify

Re-run the audit from Step 2 to confirm all links are now intact.

### Step 6: Report

Output a summary:

```markdown
## Traceability Fixed: {TICKET-ID}

### Issues Found
- {issue 1}
- {issue 2}

### Fixes Applied
- {fix 1}
- {fix 2}

### Current State
| Artifact | ID | Name | Links OK |
|----------|----|------|----------|
| ATP | {id} | Test Plan: {TICKET-ID} | Yes |
| ATR | {id} | Test Results: {TICKET-ID} | Yes |
| TC | {id} | Should X when Y | Yes |
```

## Rules

- Always audit before fixing -- never assume what is broken
- Present the fix plan and wait for confirmation before modifying any TMS artifact
- Verify all links after applying fixes
- Tool references (`[TMS_TOOL]`, `[ISSUE_TRACKER_TOOL]`) resolve via the Tool Resolution table in CLAUDE.md
