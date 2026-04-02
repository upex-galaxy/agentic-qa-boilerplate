# Test Report

Act as a Senior QA Engineer completing the test documentation cycle.

---

## TASK

**STAGE 3: COMPLETE TEST REPORTING**

Fill the ATR Test Report, mark ATR as complete, and add a summary comment to the User Story. This completes the In-Sprint Testing workflow.

**Prerequisite:** Complete Stage 2 (Execution) first.

---

## TOOLS USED IN THIS STAGE

| Tool | Purpose |
|------|---------|
| TMS CLI | Update ATR with Test Report, mark complete |
| TMS CLI | Update TC status, list for summary |

---

## LOAD LOCAL CONTEXT (REQUIRED)

Read PBI context to compile report:

```
.context/PBI/{module-name}/TK-{number}-{brief-title}/
+-- context.md        # Session notes, TCs created
+-- test-analysis.md  # Original test plan (if exists)
+-- test-report.md    # Draft to finalize
+-- evidence/         # Screenshots taken
```

**From PBI files, gather:**
- All session notes from context.md
- TCs created and their status
- Bugs found
- Evidence files

---

## INPUT REQUIRED

### 1. Ticket ID (REQUIRED)

**Format:** `TK-{number}`

### 2. Gather Test Results

Fetch from your TMS:
- Ticket details
- ATR linked to this ticket
- All TCs linked to this ticket

### 3. Verify All TCs Complete

All TCs should have final status:
- PASSED
- FAILED (with bug reported)

**No TCs should be NOT RUN.**

---

## WORKFLOW

### Step 1: Collect Test Summary

From the TC list, compile:

| Metric | Value |
|--------|-------|
| Total TCs | {count} |
| PASSED | {count} |
| FAILED | {count} |
| Pass Rate | {percentage}% |

### Step 2: Identify Test Data Used

List all entities used during testing:

| Entity | Name | ID | Used For |
|--------|------|----|----------|
| {type} | {name} | {id} | AC{N} |

### Step 3: Compile Findings

**Bugs Found:**
- {Bug 1 summary - severity}
- {Bug 2 summary - severity}
- None (if no bugs)

**Observations:**
- {Any notable behavior observed}
- {Edge cases discovered}
- {UX feedback}

### Step 4: Generate Test Report Content

**Format (Plain Text for ATR):**

```
TK-{number} TEST RESULTS
Tested: {date}
Environment: {Staging / localhost}
Tester: {name/email}
Result: {PASSED|FAILED|PASSED WITH ISSUES} ({passed}/{total})

SUMMARY
  {Brief description of what was tested}
  {Overall outcome statement}

TEST CASES
  TC-{id}: {name} ... {status}
  TC-{id}: {name} ... {status}

TEST DATA
  {Entity}: {name} (ID: {id})
  {Additional entities used}

BUGS FOUND
  {None | List bugs with severity}

OBSERVATIONS
  {Notable findings, edge cases, UX feedback}

RECOMMENDATIONS
  {Suggestions for automation, future testing, improvements}
```

### Step 5: Update ATR in TMS

Update the ATR with the Test Report content from Step 4. Mark the ATR as complete in your TMS.

### Step 6: Save Final PBI Documentation

**Finalize test-report.md:**

```markdown
# Test Report: TK-{number}

Mirror of ATR Test Report in TMS.

---

**Date:** {date}
**Environment:** {Staging / localhost}
**Result:** {PASSED|FAILED|BLOCKED} ({X}/{Y})

---

## Summary

{Brief summary of what was tested and outcome}

---

## Test Cases

| TC ID | Name | Status |
|-------|------|--------|
| TC-{id} | {name} | PASSED |
| TC-{id} | {name} | PASSED |

---

## Findings

{Bugs found, observations, edge cases}

---

## Test Data Used

| Purpose | Entity | ID |
|---------|--------|-----|
| AC1 | {name} | {id} |
| AC2 | {name} | {id} |

---

## Evidence

- `evidence/ac1-{desc}.png` - {what it shows}
- `evidence/ac2-{desc}.png` - {what it shows}
```

**Update context.md** with final status:
```markdown
## Final Status

**Result:** {PASSED|FAILED|BLOCKED}
**Workflow Complete:** {date}
**Next:** {Tested | Wait for fixes}
```

### Step 7: Prepare QA Comment (MANDATORY)

**IMPORTANT:** This step is MANDATORY before transitioning the ticket. The comment provides traceability of what was tested.

**Choose template based on result:**

#### Template A: All Tests PASSED

```
QA Testing Complete - TK-{number}

Environment: {Staging|localhost}
Result: PASSED ({passed}/{total} TCs)

TEST DATA USED:
- {Entity type}: {name} (ID: {id})
- {Additional entities as needed}

VERIFIED BEHAVIORS:
- AC1: {brief description} - VERIFIED
- AC2: {brief description} - VERIFIED
- AC3: {brief description} - VERIFIED

{If clarifications obtained from dev, add:}
CLARIFICATIONS:
- {Brief note about what was clarified}

Artifacts: ATP-{id}, ATR-{id}, TC-{ids}
```

#### Template B: Tests FAILED (Confirmed defect)

**Only use after AI and user agree there's a real defect.**

```
QA Testing Complete - TK-{number}

Environment: {Staging|localhost}
Result: FAILED ({passed}/{total} TCs)

TEST DATA USED:
- {Entity type}: {name} (ID: {id})

VERIFIED BEHAVIORS:
- AC1: {brief description} - VERIFIED
- AC2: {brief description} - VERIFIED

FAILED VERIFICATION:
- AC3: {brief description} - FAILED
  Expected: {what should happen}
  Actual: {what happened}
  Impact: {user/business impact}

DEFECT: {Brief description of the confirmed defect}

Artifacts: ATP-{id}, ATR-{id}, TC-{ids}
```

Post the comment to the ticket in your TMS.

#### Step 7b: Provide Evidence Screenshots

**MANDATORY:** After posting the comment, provide the user with the path(s) to the 1-2 most important evidence screenshots so they can attach them to the TMS comment.

**Format:**
```
Comment posted to TMS.

Evidence screenshots to attach:
1. {path/to/evidence/TK-{number}-{primary-evidence}.png} — {brief description}
2. {path/to/evidence/TK-{number}-{secondary-evidence}.png} — {brief description, if applicable}
```

**Guidelines:**
- Select 1-2 screenshots that best demonstrate the verification (not all screenshots taken)
- For bugs: the screenshot showing the fix works (expected behavior)
- For features: screenshots showing key ACs verified
- For regressions: before/after comparison if available
- Do NOT include intermediate screenshots (login pages, navigation, etc.)

### Step 8: Transition Ticket to Tested (REQUIRED)

If all tests PASSED and no blockers, transition the ticket to "Tested" status in your TMS.

### Step 9: Report to User

**Output Format:**

```markdown
## Test Reporting Complete

**Ticket:** TK-{number} - {title}
**Result:** {PASSED|FAILED|PASSED WITH ISSUES}

### Test Summary

| Metric | Value |
|--------|-------|
| Total TCs | {count} |
| PASSED | {count} |
| FAILED | {count} |
| Pass Rate | {percentage}% |

### Artifacts Updated

| Artifact | Status |
|----------|--------|
| ATR Test Report | Filled |
| ATR Complete | Marked |
| US Comment | Ready to post |

### Test Cases

| TC ID | Name | Status |
|-------|------|--------|
| TC-{id} | {name} | {status} |

### Bugs Found

{None | List with IDs}

### Next Steps

{If all PASSED}:
- Ticket transitioned to Tested
- Consider Stage 4 (Documentation) to prioritize TCs for automation

{If any FAILED}:
- Bugs need resolution
- Re-test failed TCs when fixes deployed
- Update ATR after re-test

### Automation Candidates

{List TCs that are good candidates for automation}
- TC-{id}: {reason}
```

---

## ERROR HANDLING

| Situation | Action |
|-----------|--------|
| TCs still NOT RUN | Complete testing before reporting |
| ATR doesn't exist | Run Stage 1 first (planning/shift-left) |
| Cannot update ATR | Check TMS CLI auth, retry |
| Mixed results | Report as "PASSED WITH ISSUES" |

---

## AFTER REPORTING

### If All PASSED

1. Ticket transitioned to Tested (Step 8)
2. Consider running Stage 4 (Documentation) to:
   - Prioritize TCs for automation
   - Document TCs formally
   - Transition Workflow Status to Candidate/Manual

### If Any FAILED

1. Wait for bug fixes
2. Re-test failed TCs only
3. Update ATR with re-test results
4. Update US comment
5. Repeat until all PASSED

---

**Related**: [Session Start](../session-start.md) | [Stage 1 - Planning](../stage-1-planning/) | [Stage 2 - Execution](../stage-2-execution/) | [Bug Report](./bug-report.md) | [Stage 4 - Documentation](../stage-4-documentation/) | [PBI Structure](../../.context/PBI/README.md)
