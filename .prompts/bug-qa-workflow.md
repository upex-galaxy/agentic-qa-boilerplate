# Bug QA Workflow

> Complete workflow for Bug Retesting using your TMS (Jira, Xray, Coda, etc.).
> Based on IQL (Iterative Quality Leadership) methodology.

---

## Overview

This workflow guides QA through the complete bug retesting process, from session initialization to verification and reporting.

**Entry Point + 3 Phases:**
0. **Session Start** (REQUIRED): Initialize session, load context, create PBI folder
1. **Triage + Planning**: Determine if retesting needed, create ATP/ATR, Bug Analysis
2. **Execution**: Configure Playwright, verify fix, capture evidence
3. **Reporting**: Update ATR, assess automation, update ticket status

**Key Principle**: Bugs already have implicit test cases (reproduction steps -> expected behavior). Don't over-engineer the documentation.

---

## Workflow Diagram

```
+-----------------------------------------------------------------------------+
|                           BUG QA WORKFLOW                                    |
+-----------------------------------------------------------------------------+
|                                                                             |
|  SESSION START (Entry Point) <- Run session-start.md                        |
|  - Load context, create PBI folder, load skills                             |
|       |                                                                     |
|       v                                                                     |
|  PHASE 1: TRIAGE + PLANNING                                                |
|  +------------------------------------------------------------+            |
|  |  TRIAGE: Does it require retesting?                        |            |
|  |     +-> NO -> Code Review Workflow -> END                  |            |
|  |     +-> YES -> Full Retesting:                             |            |
|  |              - Discover Test Data                          |            |
|  |              - Create ATP (with Bug Analysis)              |            |
|  |              - Create ATR (for results)                    |            |
|  +------------------------------------------------------------+            |
|       |                                                                     |
|       v                                                                     |
|  PHASE 2: EXECUTION                                                         |
|  - Configure Playwright CLI for evidence                                    |
|  - Verify bug fix (reproduce -> confirm fixed)                              |
|  - Quick regression check                                                   |
|  - Capture evidence (screenshots)                                           |
|       |                                                                     |
|       v                                                                     |
|  PHASE 3: REPORTING                                                         |
|  - Update ATR with verification results                                     |
|  - Assess automation opportunity                                            |
|  - Update ticket status (Tested / Back to Dev)                              |
|  - Update local PBI documentation                                           |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## PREREQUISITE

> **Run `session-start.md` FIRST** to initialize the testing session (if configured for your project).
>
> Session Start provides:
> - Project context loaded (business docs, architecture docs)
> - Module context loaded/created
> - PBI folder created: `.context/PBI/{module-name}/TK-{number}-{brief-title}/`
> - Skills loaded (TMS CLI, Playwright CLI)
> - Initial context.md created
>
> **Note:** Bugs use the SAME folder structure as User Stories.
>
> **If session not initialized:** Run `session-start.md` before continuing.

---

## WHEN TO USE THIS WORKFLOW

| Work Type | Use This Prompt? |
|-----------|------------------|
| Bug | Yes |
| Feature | No - Use `shift-left-testing.md` |
| Task | No - Use `shift-left-testing.md` |
| Tech Debt | Maybe - If it has testable behavior |

| Ticket Status | Use This Prompt? |
|---------------|------------------|
| Deployed to staging | Yes - Bug deployed, ready to retest |
| In Progress / Dev Complete | No - Wait for staging deployment |
| Already tested | No - Already verified |

---

## INPUT REQUIRED

**Ticket ID:** `TK-{number}`
**Environment:** Staging (default) or localhost

---

## PHASE 1: TRIAGE + PLANNING

### Step 1.1: Triage - Fetch Bug and Analyze

**Goal**: Determine if this bug requires Full Retesting, Code Review only, or can be skipped.

**Philosophy**: Test where it matters. Skip where testing adds no value.

Fetch the ticket from your TMS and extract: Title, Status, Work Type, Person Hours, Description, Priority, Module.

### Step 1.2: Check Vetos (Bypass Score)

Vetos are conditions that immediately determine the outcome, bypassing the risk score calculation.

#### VETO: SKIP RETESTING

If ANY of these conditions apply, recommend **Code Review only** (no Full Retesting):

| Condition | Indicators (Keywords / Patterns) |
|-----------|----------------------------------|
| Pure text/label fix | "typo", "label", "text", "copy", "spelling", "tooltip" + hardcoded in frontend |
| Pure visual/CSS fix | "color", "style", "spacing", "font", "alignment", "responsive", "UI polish" |
| Documentation fix | "README", "docs", "comments", "swagger", "help text" |
| Config/infrastructure | "config", "env", "pipeline", "deployment", "CI/CD" |
| Tech debt cleanup | "refactor", "cleanup", "rename" + no functional change |

**How to verify "Pure text fix":**
- If the text comes from API/DB -> NOT pure text (needs retesting)
- If the text is hardcoded in frontend code -> Pure text (skip retesting)

#### VETO: REQUIRE RETESTING

If ANY of these conditions apply, require **Full Retesting** regardless of score:

| Condition | Examples |
|-----------|----------|
| Affects money/billing | Invoices, payments, pricing, fees, commissions, caps |
| Affects data integrity | CRUD operations, import/export, data sync, calculations |
| Auth/Authorization | Login, permissions, roles, security, tokens |
| External integrations | Third-party APIs, webhooks, email services, payment gateways |
| State machine bugs | Workflow transitions, status changes, multi-step processes |
| Calculations/formulas | Any bug involving numeric calculations users depend on |

**If a veto applies -> Skip to Step 1.4 with the veto result.**

### Step 1.3: Calculate Risk Score (Only if No Veto)

If no veto applies, calculate the risk score by adding points for each factor that applies:

| Risk Factor | Points | How to Evaluate |
|-------------|--------|-----------------|
| **Bug involves API/DB data** (vs hardcoded) | +3 | Does the fix touch backend data flow? |
| **Bug has clear reproduction steps** | +2 | Are there specific steps to verify the fix? |
| **Affects user-facing functionality** | +2 | Will end users notice if this regresses? |
| **Priority = High or Critical** | +2 | Check Priority field in ticket |
| **Bug involves state changes** | +2 | Does it affect workflow/status transitions? |
| **Multiple components affected** | +1 | Does fix touch Frontend + Backend? |
| **Bug reported by external user** | +1 | Was this reported by a customer (not internal)? |

**Score Interpretation:**

| Score | Risk Level | Recommendation |
|-------|------------|----------------|
| 0-3 | LOW | Code Review only |
| 4-7 | MEDIUM | Ask user preference |
| 8+ | HIGH | Full Retesting required |

### Step 1.4: Present Triage Result

**Format for ALL triage results:**

```
## TRIAGE RESULT: TK-{number}

### Bug Summary

[Explain clearly:]
- What was broken (the problem)
- What the fix should do
- Which module/area is affected
- How the user would have experienced the bug

### Reproduction Steps (from ticket)

1. {step 1}
2. {step 2}
3. Expected: {what should happen now}

### Triage Decision

{One of the following sections based on result type}
```

**Section for VETO: SKIP**

```
Decision: DOES NOT REQUIRE RETESTING
Reason: {veto condition}

Evidence: {why this applies}

Environment: {Staging / localhost}

RECOMMENDATION: Code Review Workflow
- Verify the fix in code
- Confirm no residual instances remain
- Do NOT create full ATP/ATR

Understood? Shall we proceed with Code Review Workflow?
```

**Section for VETO: REQUIRE**

```
Decision: REQUIRES FULL RETESTING
Reason: {veto condition - e.g., "Affects billing/commissions"}

Evidence: {why this applies}

Understood? Shall we proceed with Full Retesting Workflow?
```

**Section for SCORE-BASED (no veto)**

```
Decision: {DOES NOT REQUIRE / GRAY ZONE / REQUIRES FULL RETESTING}

Risk Score: {X} ({LOW/MEDIUM/HIGH})

Factors:
- [+3] Bug involves API/DB data
- [+2] Clear reproduction steps
- [+2] User-facing functionality
- ...

{If LOW (0-3)}:
RECOMMENDATION: Code Review Workflow
Understood? Shall we proceed with Code Review or would you prefer Full Retesting?

{If MEDIUM (4-7)}:
This bug is in the gray zone (score 4-7).
Which do you prefer?
1. Code Review Workflow (lightweight)
2. Full Retesting Workflow (ATP/ATR)

{If HIGH (8+)}:
RECOMMENDATION: Full Retesting Workflow
Understood? Shall we proceed with Full Retesting Workflow?
```

**MANDATORY: WAIT for user confirmation before continuing.**

The user may:
- Ask clarifying questions about the bug
- Request more context about the fix
- Confirm to proceed
- Override the recommendation (e.g., request Full Retesting for a LOW score)

---

### CODE REVIEW WORKFLOW (For Low-Risk Bugs)

If triage result is Code Review, follow these steps instead of Full Retesting (PHASE 2-3):

Since bug-qa-workflow is only used when the bug is deployed (merged), code is always available.

#### CR-1: Search for the Fix in Code

```bash
# Search for the fix location
grep -r "fixed value" /path/to/codebase

# Search for any residual old values
grep -r "old buggy value" /path/to/codebase
```

#### CR-2: Verify Fix Was Made Correctly

- Check the fix addresses the reported issue
- Check for residual buggy code
- Check for similar issues in related code

#### CR-3: Prepare Comment for Ticket

```
QA CODE REVIEW - TK-{number}

Reviewed: {date}
Type: Low Risk Bug Fix (Code Review only)

TRIAGE:
- {Veto: SKIP or Risk Score = X (LOW)}

VERIFICATION:
- [x] Fix found in: {file locations}
- [x] Issue "{bug description}" addressed
- [x] No residual problematic code found

RESULT: Verified

No ATP/ATR created (low risk fix).
Ready for Tested status.
```

#### CR-4: Post Comment to TMS

Copy the comment and post it to the ticket in your TMS.

**END OF CODE REVIEW WORKFLOW** - Do not continue.

---

### Step 1.5: Create TMS Artifacts (ATP + ATR, No TCs)

For bugs, create ATP (for analysis) and ATR (for results), but **no TCs** — the bug itself is the test case.

Create the following artifacts in your TMS:
- **ATP** (Acceptance Test Plan): Named "Test Plan: TK-{number}"
- **ATR** (Acceptance Test Results): Named "Test Results: TK-{number}"
- Link ATP to ATR

**Why no TCs for bugs?**
- The bug ticket itself is the implicit test case
- Reproduction steps = test steps
- Expected vs Actual = pass/fail criteria

### Step 1.6: Discover Test Data

Before executing tests, identify the test data needed to reproduce and verify the bug.

**Use database MCP or API calls to find suitable test data:**

```sql
-- Example queries based on bug type:

-- For entity-related bugs:
SELECT id, name, status, created_at
FROM {entity_table}
WHERE status = '{required_status}'
ORDER BY created_at DESC
LIMIT 5;

-- For relationship-related bugs:
SELECT a.id, a.name, COUNT(b.id) as related_count
FROM {parent_table} a
JOIN {child_table} b ON b.parent_id = a.id
WHERE b.created_at >= '{date}'
GROUP BY a.id, a.name
ORDER BY related_count DESC
LIMIT 5;
```

**Document discovered test data for the Bug Analysis.**

### Step 1.7: Fill Test Analysis (Bug Analysis)

Fill the ATP with a Bug Analysis that serves as your **execution guide**.

```
BUG ANALYSIS - TK-{number}
Date: {today}

BUG SUMMARY
  Was: {what was broken - the problem}
  Fix: {what the fix should do}
  Module: {affected module/area}

TEST DATA
  Environment: {Staging / localhost}
  Entity: {name} (ID: {id})
  Related data: {additional context, if applicable}
  User: {role needed to reproduce}
  URL: {direct link to affected page}

VERIFICATION STRATEGY
  1. Navigate to: {affected area}
  2. Setup: {preconditions if any}
  3. Reproduce: {original bug steps}
  4. Verify fix: {what to observe}
  5. Regression: {related areas to check}

RISK ASSESSMENT
  Priority: {from ticket}
  If regresses: {user impact}
```

**Why fill Test Analysis for bugs?**
- Serves as execution guide before touching the browser
- Documents test data so it's reusable
- Creates a strategy instead of ad-hoc testing
- Helps if retesting is needed later

### Step 1.8: Load Playwright CLI Skill

```
Use skill: playwright-cli
```

### Step 1.9: Verify Traceability

Verify ATP and ATR are linked correctly in your TMS. Traceability checks may show "gaps" for missing TCs — **this is expected and OK for bugs**.

**Expected traceability for bugs:**
- ATP linked to ticket: OK
- ATR linked to ticket: OK
- ATP linked to ATR: OK
- TCs missing: OK (bug = implicit test case)

---

## PHASE 2: EXECUTION

### Step 2.1: Configure Playwright Evidence

Before using playwright-cli, configure output directory for snapshots:

```json
// .playwright/cli.config.json
{
  "baseUrl": "{staging-url}",
  "outputDir": ".context/PBI/{module-name}/TK-{number}-{brief-title}/evidence"
}
```

This ensures snapshots (.yml) and console logs are saved to the ticket's evidence folder.

**IMPORTANT:** `outputDir` does NOT affect screenshots (.png). Screenshots are saved to the current working directory by default. To save screenshots to the evidence folder, always use the full relative path in `--filename`:

```bash
playwright-cli screenshot --filename=.context/PBI/{module-name}/TK-{number}-{brief-title}/evidence/TK-{number}-{desc}.png
```

---

### Step 2.2: Verify Bug Fix

Use the playwright-cli skill to navigate and verify:

```
Use skill: playwright-cli
```

**Verification Steps:**

1. **Navigate** to the affected area
2. **Reproduce** the original bug scenario
3. **Observe** that the bug NO LONGER occurs
4. **Verify** expected behavior works correctly
5. **Screenshot** the correct behavior as evidence

**Evidence Naming:**
```
.context/PBI/{module-name}/TK-{number}-{brief-title}/evidence/TK-{number}-{brief-description}.png
```

---

### Step 2.3: Quick Regression Check

Verify the fix didn't break related functionality:

| Check | Description |
|-------|-------------|
| **Adjacent features** | Do nearby features still work? |
| **Similar scenarios** | Does it work with different data? |
| **Edge cases** | Does it handle empty/null/max values? |

**If regression found:** Document it and create new bug ticket.

---

## PHASE 3: REPORTING

### Step 3.1: Assess Automation Opportunity

Evaluate if this bug is a good automation candidate:

| Criteria | Score (0-2) | Notes |
|----------|-------------|-------|
| **Reproducibility** | | Can it be reliably reproduced? |
| **Stability** | | Are the steps consistent? |
| **Risk** | | How bad if it regresses? |
| **Frequency** | | How often is this area changed? |
| **Complexity** | | How hard to automate? |

**Total Score:**
- 8-10: High priority automation candidate
- 5-7: Medium priority - automate if time permits
- 0-4: Low priority - manual testing sufficient

**Automation Assessment:**

```
AUTOMATION CANDIDATE: [YES/NO/MAYBE]

Rationale:
  [Brief explanation]

Suggested Test Type:
  [ ] E2E (UI) - Needs browser interaction
  [ ] API Integration - Backend validation
  [ ] DB Validation - Data integrity check

Estimated Effort:
  [ ] Low (< 1 hour)
  [ ] Medium (1-4 hours)
  [ ] High (> 4 hours)
```

---

### Step 3.2: Update ATR with Results

#### 3.2a. Check for Existing ATR

Check your TMS for an existing ATR linked to this ticket.

#### 3.2b. Create or Update ATR

**If no ATR exists:** Create one named "Bug Verification: TK-{number}".

**Update ATR with results:**

```
BUG VERIFICATION REPORT

TICKET
  TK-{number}: {title}

ENVIRONMENT
  Staging: {url}
  Test Date: {date}

RESULT
  [PASSED/FAILED]

VERIFICATION
  1. {step} - {result}
  2. {step} - {result}
  3. {step} - {result}

REGRESSION CHECK
  Adjacent features: OK
  Similar scenarios: OK
  Edge cases: OK

AUTOMATION ASSESSMENT
  Candidate: [YES/NO]
  Priority: [HIGH/MEDIUM/LOW]
  Rationale: {brief explanation}
```

---

### Step 3.3: Update Ticket Status

Based on verification result:

**If PASSED:**
- Add comment with verification summary
- Transition ticket to "Tested" status in your TMS

**If FAILED:**
- Add comment with failure details
- Move back to "In Progress"
- Tag developer

**MANDATORY: Prepare comment BEFORE transitioning ticket.**

#### Template C: Bug VERIFIED (Fix works)

```
QA Bug Verification - TK-{number}

Environment: {Staging|localhost}
Result: VERIFIED - Bug fix confirmed

TEST DATA USED:
- {Entity}: {name} (ID: {id})

VERIFICATION:
- Original bug scenario: No longer reproduces
- Expected behavior: Now works correctly
- Regression check: No issues found

Artifacts: ATP-{id}, ATR-{id}
```

#### Template D: Bug NOT FIXED

**Only use after AI and user agree the bug is NOT fixed.**

```
QA Bug Verification - TK-{number}

Environment: {Staging|localhost}
Result: NOT FIXED - Issue persists

TEST DATA USED:
- {Entity}: {name} (ID: {id})

VERIFICATION FAILED:
- Reproduction steps: {steps taken}
- Expected: {what should happen}
- Actual: {what still happens}

Returning to dev for review.

Artifacts: ATP-{id}, ATR-{id}
```

Post the comment to the ticket in your TMS.

#### Step 3.3b: Provide Evidence Screenshots

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
- For regressions: before/after comparison if available
- Do NOT include intermediate screenshots (login pages, navigation, etc.)

---

### Step 3.4: Update Local Documentation

Update the PBI entry (folder created by session-start):

```bash
# Folder already exists: .context/PBI/{module-name}/TK-{number}-{brief-title}/
# Update context.md with verification results
```

**Create context.md:**

```markdown
# TK-{number}: {Title}

**Type:** Bug
**Status:** [VERIFIED/FAILED]
**Verified:** {date}

---

## Bug Summary

**Was:** {what was broken}
**Now:** {what was fixed}

---

## Verification Result

[PASSED/FAILED]

Evidence: `.context/PBI/{module-name}/TK-{number}-{brief-title}/evidence/*.png`

---

## Automation Assessment

**Candidate:** [YES/NO]
**Priority:** [HIGH/MEDIUM/LOW]
**Reason:** {brief explanation}

---

## Notes

{Any additional observations}
```

---

### Step 3.5: Report to User

**Output Format:**

```markdown
## Bug Verification Complete: TK-{number}

**Bug:** {Title}
**Dev:** {Assignee}
**Result:** [PASSED/FAILED]

### Verification Summary

| Step | Result |
|------|--------|
| Reproduced original scenario | OK |
| Bug no longer occurs | OK |
| Expected behavior works | OK |
| Regression check passed | OK |

### Evidence

Screenshot: `.context/PBI/{module-name}/TK-{number}-{brief-title}/evidence/TK-{number}-{desc}.png`

### Automation Assessment

**Candidate:** [YES/NO]
**Priority:** [HIGH/MEDIUM/LOW]
**Type:** [E2E/API/DB]
**Effort:** [LOW/MEDIUM/HIGH]

### TMS Artifacts

- ATR: {id} - Bug Verification: TK-{number}

### Next Steps

1. [If PASSED] Ready for production deployment
2. [If automation candidate] Add to automation backlog
3. [If FAILED] Return to dev with details
```

---

## QUALITY CHECKLIST

Before completing verification:

- [ ] Reproduction steps were clear
- [ ] Test data discovered and documented
- [ ] **ATP filled with Bug Analysis** (execution guide)
- [ ] Bug fix verified working
- [ ] Regression check completed
- [ ] Evidence captured (screenshot)
- [ ] Automation opportunity assessed
- [ ] ATR documented with results
- [ ] Ticket status updated
- [ ] Local PBI created

---

## WHAT NOT TO DO

| Avoid | Why |
|-------|-----|
| Creating TCs for bugs | The bug itself is the test case (reproduction steps = test steps) |
| Skipping Bug Analysis | The ATP with Bug Analysis is your execution guide - don't test ad-hoc |
| Skipping test data discovery | Document test data so it's reusable if retesting is needed |
| Skipping automation assessment | Bugs are prime candidates for regression tests |
| Testing without reproduction steps | Always confirm steps exist before testing |

---

## BUG VS USER STORY COMPARISON

| Aspect | Bug | User Story |
|--------|-----|------------|
| Has ACs? | No - Has Expected vs Actual | Yes - Multiple ACs |
| Test Planning | ATP with Bug Analysis | ATP with Test Analysis |
| Test Cases | None needed (bug = test case) | 1 positive + 1 negative per AC |
| Test Data | Discovered in Step 1.6 | Discovered in Step 0.1 |
| Documentation | ATP (Bug Analysis) + ATR | ATP + ATR + TCs (full) |
| Automation | High priority if recurring | Based on business value |

---

## RELATED PROMPTS

| When | Use |
|------|-----|
| New feature/task | `stage-1-planning/feature-test-plan.md` |
| Feature in staging | `stage-2-execution/smoke-test.md` |
| Write automated test | `stage-5-automation/coding/e2e-test-coding.md` |
| Full test reporting | `stage-3-reporting/test-report.md` |

---

**Remember:** Bugs are OPPORTUNITIES for automation. Every verified bug fix is a potential regression test. Assess and flag them accordingly.
