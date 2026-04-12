# Test Documentation

> Create Test issues in Jira (with or without Xray) following the workflow states and transitions.

---

## Purpose

Document in Jira the tests that passed the prioritization filter to maintain them in regression.

**⚠️ CRITICAL CONTEXT:**

- The User Story is in **QA Approved** status
- The tests we document here **ALREADY PASSED** during exploratory testing
- **We are NOT designing new tests**, we are formalizing already validated tests
- We only document tests that passed the strict prioritization filter

**This prompt is executed AFTER:**

- Test analysis completed
- Tests prioritized with strict filter (Phase 0 + ROI)
- Path decision (Candidate/Manual/Deferred) for each test

---

## Prerequisites

**Load required context:**

```
Read: .context/guidelines/QA/jira-test-management.md
```

**Tools by modality:**

- **Native Jira:** `[ISSUE_TRACKER_TOOL]`
- **Jira + Xray:** `[TMS_TOOL]` + `[ISSUE_TRACKER_TOOL]`

> See /xray-cli skill for current CLI syntax. Tool Resolution in CLAUDE.md handles priority.

---

## Input Required

1. **Prioritized test list** - From `test-prioritization.md` (only those that passed filter)
2. **Related User Story ID** - For traceability
3. **Jira Project Key** - To create issues
4. **Existing nomenclature** - Use test names from acceptance-test-plan.md or session notes

---

## Preserve Nomenclature

**⚠️ MANDATORY:** Use the SAME nomenclature that was used in previous phases.

**Sources of nomenclature (in priority order):**

1. **Test Prioritization Report** → Final names with `Validate <CORE> <CONDITIONAL>` format
2. **Acceptance Test Plan** → `.context/PBI/epics/.../stories/.../acceptance-test-plan.md`
3. **Session Notes** → Exploratory testing notes

**Traceability example:**

```
Shift-Left (Stage 1):
  → "Validate reviews display when mentor has multiple reviews"

Test Analysis (Stage 3):
  → "Validate reviews display when mentor has multiple reviews" (same)

Test Prioritization (Stage 3):
  → "Validate reviews display when mentor has multiple reviews" (same)

Test Documentation (Stage 3):
  → "MYM-35: TC1: Validate reviews display when mentor has multiple reviews"
```

The only change is adding the `{US_ID}: TC#:` prefix when documenting in Jira.

---

## Complete Workflow

### Phase 0: Determine Modality and Format

**Mandatory questions if not known:**

```
QUESTION 1: What Test Management tool does the project use?

1. Xray (Jira plugin) → Use [TMS_TOOL] + [ISSUE_TRACKER_TOOL]
2. Only native Jira → Use only [ISSUE_TRACKER_TOOL] with Issue Type "Test"
```

```
QUESTION 2: In what format do you want to document the test cases?

1. Gherkin (Given/When/Then) → Recommended for automation
2. Traditional steps (Step/Action/Data/Result) → Classic QA format
```

**Valid combinations:**

| Tool        | Format  | How to create                                                    |
| ----------- | ------- | ---------------------------------------------------------------- |
| Xray        | Gherkin | `[TMS_TOOL] Create Test:` type: Cucumber, gherkin: {from test design} |
| Xray        | Steps   | `[TMS_TOOL] Create Test:` type: Manual, steps: {from test design}    |
| Native Jira | Gherkin | `[ISSUE_TRACKER_TOOL] Create Issue:` with Gherkin in description |
| Native Jira | Steps   | `[ISSUE_TRACKER_TOOL] Create Issue:` with steps table in description |

**Verify TMS authentication (if applicable):**

```
[TMS_TOOL] Authenticate
```

> Resolved via [TMS_TOOL] — see Tool Resolution in CLAUDE.md. See /xray-cli skill for current CLI syntax.

---

### Phase 1: Verify/Create Regression Epic

**MANDATORY before creating any test.**

**Search for existing epic:**

```
[ISSUE_TRACKER_TOOL] Search Issues:
  - project: {{PROJECT_KEY}}
  - issueType: Epic
  - query: summary contains "regression" OR "test repository" OR label "test-repository"
```

**If epic does NOT exist:**

1. Ask the user:

   ```
   I didn't find a regression epic in project {PROJECT_KEY}.

   Would you like me to create one named "{PROJECT_KEY} Test Repository"?

   This epic will be the container for all regression tests.
   ```

2. If accepted, create:

   ```
   [ISSUE_TRACKER_TOOL] Create Issue:
     - project: {{PROJECT_KEY}}
     - issueType: Epic
     - title: "{{PROJECT_KEY}} Test Repository"
     - description: "Container epic for all project regression tests."
     - labels: test-repository, regression, qa
   ```

**Save reference:**

```
REGRESSION_EPIC_KEY = {EPIC-XXX}
```

---

### Phase 2: Source Code Validation

**⚠️ CRITICAL:** Before documenting any test, validate that the design matches the actual implementation.

**Why this is necessary:**

- Prioritized tests come from the Acceptance Test Plan (Stage 1), which was written BEFORE implementation
- Actual code may differ from the original plan
- Detecting discrepancies NOW prevents invalid tests in automation

#### 2.1 Locate Implementation Plan (Primary Source)

**FIRST: Look for the User Story implementation plan:**

```
Path: .context/PBI/epics/EPIC-{PROJECT}-{NUM}-{name}/stories/STORY-{US_ID}-{name}/implementation-plan.md
```

**From the implementation plan extract:**

- Files created/modified (list of paths)
- Architecture decisions (SSR vs API vs Client)
- Main components
- Relevant technical decisions

**IF implementation plan doesn't exist:**

- Document: "No implementation plan exists, validating directly from code"
- Proceed to direct search in source code

#### 2.2 Validate Against Source Code (Source of Truth)

**AFTER: Validate that the plan matches the actual implementation:**

1. Verify that files listed in the plan exist
2. Search for additional files not mentioned in the plan
3. Read components to extract critical information

**Files to search:**

- Pages: `src/app/**/page.tsx`
- Components: `src/components/**/*.tsx`
- APIs (if they exist): `src/app/api/**/*.ts`
- Services/libs: `src/lib/`, `src/services/`
- Types: `src/types/`

#### 2.3 Extract Critical Information

| Information      | Why it's important                  | How to obtain it                                   |
| ---------------- | ----------------------------------- | -------------------------------------------------- |
| **Architecture** | Know if it's SSR, API, or Client-side | Read page.tsx, search for `fetch`, `use client`, hooks |
| **Test IDs**     | For E2E automation                  | `grep -r "data-testid=" src/components/`           |
| **UI Formats**   | Validate exact expected results     | Read component JSX                                 |
| **Validations**  | Confirm business rules              | Read component logic                               |
| **Database queries** | For variables section           | Read queries in pages/services                     |

#### 2.4 Validation Checklist

**For each test case, verify:**

- [ ] Do the mentioned endpoints/APIs exist?
- [ ] Do text formats match the real UI?
- [ ] Are test-ids available in the code?
- [ ] Is the architecture correct (SSR/API/Client)?
- [ ] Do queries to fetch data work?

#### 2.5 Document Discrepancies

**If differences are found between original design and implementation:**

1. Correct the test case design
2. Add "Refinement Notes" section to the test:

```markdown
h2. Refinement Notes

_Refined:_ {date}
_Reason:_ Pre-documentation validation
_Changes:_

- {Change 1}
- {Change 2}
```

**Examples of common discrepancies:**

- API `/api/reviews` → Doesn't exist, uses SSR with direct Supabase
- Format "based on N reviews" → Real UI shows "(N reviews)"
- Hardcoded UUID → Should be variable `{mentor_id}`

#### 2.6 Phase Output

Document for each test:

```markdown
## Implementation Code

| File                                       | Purpose              |
| ------------------------------------------ | -------------------- |
| src/app/(main)/mentors/[id]/page.tsx       | Main page (SSR)      |
| src/components/reviews/reviews-section.tsx | Reviews container    |
| src/components/reviews/rating-display.tsx  | Average rating       |

## Architecture

- **Data Fetching:** {SSR via Supabase | API REST | Client-side}
- **Main component:** {ComponentName}
- **Validations:** {Description}

## Available Test IDs

```
data-testid="component-name"
data-testid="other-component"
```

```

---

### Phase 3: Create Tests

#### Modality A: With Xray ([TMS_TOOL])

**⚠️ IMPORTANT:** Xray requires 2 steps for complete documentation:

1. **Step 1:** Create the Test with `[TMS_TOOL]` (registers in Xray)
2. **Step 2:** Update issue Description with `[ISSUE_TRACKER_TOOL]` (backup + context)

##### Step 1: Create Test in TMS

**For each prioritized test:**

```
# Manual test with steps
[TMS_TOOL] Create Test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - type: Manual
  - labels: regression, {from test analysis: test-type}, {from test analysis: priority}
  - steps: {from test design}

# Cucumber test (for automation) - See high-quality Gherkin format below
[TMS_TOOL] Create Test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - type: Cucumber
  - labels: regression, automation-candidate, {from test analysis: test-type}
  - gherkin: {from test design}
```

> See /xray-cli skill for current CLI syntax.

**Save the TEST_KEY returned by the tool** for the next step.

##### High-Quality Gherkin Format for Xray

**⚠️ MANDATORY:** Xray Gherkin must be complete and high quality:

```gherkin
Feature: {Feature Name}

  Background:
    # Common context for all scenarios in this feature
    Given {common_context_if_applicable}

  @{priority} @regression @automation-candidate @{test-id}
  Scenario Outline: {Scenario Name with <variable>}
    """
    Bugs covered: {BUG-ID1}, {BUG-ID2}
    Related Story: {US_ID}
    """

    # === PRECONDITIONS (Variables - tester/script builds them) ===
    Given a <entity> exists with <identifier> in the database
    And <entity> has <quantity> <elements> where <quantity> <condition>
    And the user <authentication_state>

    # === ACTION ===
    When the user navigates to "<route>"
    And the user <main_action>

    # === VALIDATIONS ===
    Then <ui_element> is displayed with format "<expected_format>"
    And <additional_validation>

    # === EQUIVALENT PARTITIONS ===
    Examples: Case with valid data (Happy Path)
      | entity | identifier | quantity | elements | condition | authentication_state | route | main_action | ui_element | expected_format | additional_validation |
      | verified mentor | {mentor_id} | {N} | reviews | > 0 | is NOT authenticated | /mentors/{mentor_id} | waits for full load | rating display | "{average}/5.0" | histogram visible |

    Examples: Case without data (Edge Case)
      | entity | identifier | quantity | elements | condition | authentication_state | route | main_action | ui_element | expected_format | additional_validation |
      | verified mentor | {mentor_id} | 0 | reviews | = 0 | is NOT authenticated | /mentors/{mentor_id} | waits for full load | empty state | "No reviews yet" | histogram hidden |

    Examples: Singular vs plural case
      | entity | identifier | quantity | elements | condition | authentication_state | route | main_action | ui_element | expected_format | additional_validation |
      | verified mentor | {mentor_id} | 1 | review | = 1 | is NOT authenticated | /mentors/{mentor_id} | waits for full load | count | "(1 review)" | no "s" |
      | verified mentor | {mentor_id} | 5 | reviews | > 1 | is NOT authenticated | /mentors/{mentor_id} | waits for full load | count | "(5 reviews)" | with "s" |
```

**Key elements of high-quality Gherkin:**

| Element               | Purpose                         | Example                                       |
| --------------------- | ------------------------------- | --------------------------------------------- |
| `Background`          | Reusable common context         | `Given the system is in initial state`        |
| `Scenario Outline`    | Parameterization with Examples  | Allows iterating multiple cases               |
| `Examples` with name  | Clear equivalent partitions     | `Examples: Happy Path`, `Examples: Edge Case` |
| `<variables>`         | Placeholders for data           | `<mentor_id>`, `<quantity>`, `<format>`       |
| `# ===` comments      | Clear visual structure          | `# === PRECONDITIONS ===`                     |
| `"""` docstring       | Test metadata                   | Bugs covered, Related story                   |
| Multiple tags         | Categorization and filtering    | `@critical @regression @MYM-35`               |

**When to use each type:**

| Type                            | Use when...                                      |
| ------------------------------- | ------------------------------------------------ |
| Simple `Scenario`               | There's only 1 case, no variations               |
| `Scenario Outline` + `Examples` | There are multiple equivalent partitions to test |
| `Background`                    | Several scenarios share preconditions            |

##### Step 2: Update Description with Complete Template

**MANDATORY after creating each test in Xray:**

```
[ISSUE_TRACKER_TOOL] Update Issue:
  - issue: {TEST_KEY}
  - description: {from test design gherkin + additional template sections}
```

**The Jira Description contains:**

1. **Copy of Xray Gherkin** (same as the gherkin parameter in Step 1)
2. **Additional template sections:** Variables, Implementation Code, Architecture, Test IDs, etc.

**Use the "Description Format - Complete Template" documented in Modality B.**

##### Concrete example (both steps):

```
# Step 1: Create in TMS with high-quality Gherkin
[TMS_TOOL] Create Test:
  - project: {{PROJECT_KEY}}
  - type: Cucumber
  - title: {per TC naming convention}
  - labels: regression, automation-candidate, e2e, critical
  - gherkin: {from test design — see High-Quality Gherkin Format above}

# Output: Created test {TEST_KEY}
```

> See /xray-cli skill for current CLI syntax.

```
# Step 2: Update Description with Gherkin + Template
[ISSUE_TRACKER_TOOL] Update Issue:
  - issue: {TEST_KEY}
  - description: {from test design gherkin + complete template with variables, implementation code, architecture}
```

> Use the "Description Format - Complete Template" documented in Modality B below.

---

#### Modality B: Jira Only (without Xray)

```
[ISSUE_TRACKER_TOOL] Create Issue:
  - project: {{PROJECT_KEY}}
  - issueType: Test
  - title: {per TC naming convention}
  - description: {from test design in Gherkin or traditional format}
  - labels: regression, {from test analysis: test-type}, {from test analysis: priority}
  - parent: {REGRESSION_EPIC_KEY}
```

**Description Format (Gherkin) - Complete Template:**

```
h2. Test Case Information

_Related Story:_ {US_ID}
_Type:_ {E2E | Functional | Integration}
_Priority:_ {Critical | High | Medium | Low}
_Status:_ Candidate (for automation)
_ROI Score:_ {X.X}

h2. Prior Bugs Covered

* {BUG-ID}: {Description of fixed bug}

h2. Test Design (Variable Pattern)

{code:language=gherkin}
Feature: {Feature Name}

  @{priority} @regression @automation-candidate
  Scenario: {Scenario Name}

    # === PRECONDITIONS (Variables - tester builds them) ===
    Given {precondition with {variable_1}}
    And {precondition with {variable_2}}

    # === ACTION ===
    When {user action}

    # === VALIDATIONS ===
    Then {validation 1}
    And {validation 2}
{code}

h2. Test Case Variables

|| Variable || Description || How to obtain ||
| {variable_1} | Description | SQL query or instruction |
| {variable_2} | Description | SQL query or instruction |

h2. Implementation Code

|| File || Purpose ||
| src/app/.../page.tsx | Main page |
| src/components/... | UI Component |

h2. Architecture

* *Data Fetching:* {SSR via Supabase | API REST | Client-side fetch}
* *Main component:* {ComponentName}

h2. Test IDs Available for Automation

{code}
data-testid="component-1"
data-testid="component-2"
{code}

h2. Preconditions

* {Precondition 1}
* {Precondition 2}

h2. Expected Results

* *UI:* {Description of what should be visible}
* *Data:* {How data loads}
* *Database:* {Expected DB changes, if applicable}

h2. Refinement Notes

_Refined:_ {date}
_Reason:_ Pre-automation validation
_Changes:_
* {Change made}
```

---

### Phase 4: Link to User Story

**After creating each Test:**

```
[ISSUE_TRACKER_TOOL] Link Issues:
  - linkType: "tests" / "is tested by"
  - outward: {TEST_KEY}
  - inward: {STORY_KEY}
```

**Or add comment to the US:**

```
[ISSUE_TRACKER_TOOL] Add Comment:
  - issue: {STORY_KEY}
  - comment: "Test case documented: [{TEST_KEY}] - {from test design: test name}"
```

---

### Phase 5: Transition Workflow States

**Transition sequence for each test:**

```
1. Test created → Status: DRAFT (automatic on creation)

2. Start documentation:
   [ISSUE_TRACKER_TOOL] Transition Issue:
     - issue: {TEST_KEY}
     - transition: "start design"
   → Status: IN DESIGN

3. Complete documentation:
   [ISSUE_TRACKER_TOOL] Transition Issue:
     - issue: {TEST_KEY}
     - transition: "ready to run"
   → Status: READY

4. Decide path based on prioritization:

   IF (Path = Candidate):
     [ISSUE_TRACKER_TOOL] Transition Issue:
       - issue: {TEST_KEY}
       - transition: "automation review"
     → Status: IN REVIEW

     Then (if ROI confirmed):
     [ISSUE_TRACKER_TOOL] Transition Issue:
       - issue: {TEST_KEY}
       - transition: "approve to automate"
     → Status: CANDIDATE

   IF (Path = Manual):
     [ISSUE_TRACKER_TOOL] Transition Issue:
       - issue: {TEST_KEY}
       - transition: "for manual"
     → Status: MANUAL
```

**Visual flow:**

```
[Create Test]
     │
     ▼
  DRAFT ──"start design"──► IN DESIGN ──"ready to run"──► READY
                                                            │
                                    ┌───────────────────────┴───────────────────────┐
                                    │                                               │
                            "for manual"                                "automation review"
                                    │                                               │
                                    ▼                                               ▼
                                 MANUAL                                         IN REVIEW
                                                                                    │
                                                                        "approve to automate"
                                                                                    │
                                                                                    ▼
                                                                               CANDIDATE
                                                                                    │
                                                                        (Stage 4 continues)
```

---

### Phase 6: Summary and Confirmation

**Generate final report:**

```markdown
# Test Documentation Complete

**Project:** {PROJECT_KEY}
**Regression Epic:** {REGRESSION_EPIC_KEY}
**User Story:** {STORY-XXX}
**Date:** {Date}

---

## Tests Created

| Test ID  | Name                     | Type       | Final Status | Path     |
| -------- | ------------------------ | ---------- | ------------ | -------- |
| TEST-001 | Successful login         | E2E        | Candidate    | Automate |
| TEST-002 | Password validation      | Functional | Candidate    | Automate |
| TEST-003 | Visual alignment check   | Manual     | Manual       | Manual   |

---

## Summary

| Metric                | Value |
| --------------------- | ----- |
| Tests created         | [N]   |
| Automation Candidates | [N]   |
| Manual Only           | [N]   |
| Linked to US          | [N]   |

---

## Traceability

```
STORY-XXX: {Story Summary}
├── TEST-001: Successful login [Candidate]
├── TEST-002: Password validation [Candidate]
└── TEST-003: Visual alignment [Manual]
```

---

## Next Steps

### For Candidates (Automation):
The following tests are ready for **Stage 4: Test Automation**:
- TEST-001 (E2E)
- TEST-002 (Functional)

### For Manual:
The following tests enter **Manual Regression**:
- TEST-003

---

Would you like to proceed to Stage 4 with the identified candidates?
```

---

### Phase 7: Document Locally (Cache)

**MANDATORY:** Create local markdown files as cache for documented tests.

**Purpose:**

- Avoid re-reading Jira/Xray in future sessions
- Provide immediate context for Stage 4 (Automation)
- Maintain local ↔ Jira traceability

**Directory structure:**

```
.context/PBI/epics/EPIC-XXX-{name}/stories/STORY-YYY-{name}/
├── story.md                    # (existing)
├── acceptance-test-plan.md     # (existing - from Stage 1)
├── implementation-plan.md      # (existing)
└── tests/                      # ← NEW directory
    ├── {TEST-ID}-{name}.md
    └── ...
```

**File template (one per test):**

```markdown
# {TEST-ID}: {Test Name}

**Jira:** [{TEST-ID}]({JIRA_URL}/browse/{TEST-ID})
**Status:** {CANDIDATE | MANUAL}
**Type:** {E2E | Integration | Functional | Smoke}
**Related Story:** {STORY-XXX}
**ROI Score:** {X.X}

---

## Implementation Code

| File                 | Purpose           |
| -------------------- | ----------------- |
| src/app/.../page.tsx | Main page         |
| src/components/...   | UI Components     |

## Architecture

- **Data Fetching:** {SSR via Supabase | API REST | Client-side}
- **Main component:** {ComponentName}

## Available Test IDs

```
data-testid="component-1"
data-testid="component-2"
```

---

## Test Case Variables

| Variable | Description | How to obtain |
|----------|-------------|---------------|
| {var_1} | Description | SQL Query |
| {var_2} | Description | SQL Query |

---

## Test Design

{Test content in chosen format: Gherkin or Traditional Steps}
```

**Example with Gherkin format:**

```markdown
# GX-101-TC1: Validate successful login with valid credentials

**Jira:** [GX-101-TC1](https://company.atlassian.net/browse/GX-101-TC1)
**Status:** CANDIDATE
**Type:** Functional
**Related Story:** GX-100
**ROI Score:** 12.5

---

## Test Design

Feature: User Login

@critical @regression
Scenario: Successful login with valid credentials
Given I am on the login page
When I enter email "user@example.com"
And I enter password "Password123!"
And I click the submit button
Then I should be redirected to the dashboard
```

**Example with traditional Steps format:**

```markdown
# GX-101-TC2: Validate error when entering incorrect password

**Jira:** [GX-101-TC2](https://company.atlassian.net/browse/GX-101-TC2)
**Status:** MANUAL
**Type:** Functional
**Related Story:** GX-100
**ROI Score:** 0.8

---

## Test Design

| Step | Action                       | Data             | Expected Result             |
| ---- | ---------------------------- | ---------------- | --------------------------- |
| 1    | Navigate to /login           | -                | Login form visible          |
| 2    | Enter valid email            | user@example.com | Field populated             |
| 3    | Enter invalid password       | wrongpass        | Field masked                |
| 4    | Click Submit                 | -                | Error message visible       |
```

---

## TMS Action Reference

### Create Tests

```
# Manual with steps
[TMS_TOOL] Create Test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - type: Manual
  - steps: {from test design}

# Cucumber
[TMS_TOOL] Create Test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - type: Cucumber
  - gherkin: {from test design}

# Generic (for scripts)
[TMS_TOOL] Create Test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - type: Generic
  - definition: {from automation script path}
```

### List and Query

```
# List tests
[TMS_TOOL] List Tests:
  - project: {{PROJECT_KEY}}

# View details
[TMS_TOOL] Get Test:
  - issue: {TEST_KEY}

# Add step to existing test
[TMS_TOOL] Add Step:
  - issue: {TEST_KEY}
  - action: {from test design: step action}
  - data: {from test design: test data}
  - result: {from test design: expected result}
```

### Test Executions (for regression)

```
# Create execution
[TMS_TOOL] Create Execution:
  - project: {{PROJECT_KEY}}
  - title: {per execution naming convention}
  - tests: {from regression candidate list}

# Add tests to existing execution
[TMS_TOOL] Add Tests to Execution:
  - execution: {EXEC_KEY}
  - tests: {from regression candidate list}
```

> See /xray-cli skill for current CLI syntax.

---

## Test Case Nomenclature

**MANDATORY:** Follow the standard naming convention for formal test cases in Jira/Xray.

### Format by Tool

| Tool            | Format                                         |
| --------------- | ---------------------------------------------- |
| **Xray**        | `<TS_ID>: TC#: Validate <CORE> <CONDITIONAL>`  |
| **Native Jira** | `<US_ID>: TC#: Validate <CORE> <CONDITIONAL>`  |

### Component Definitions

| Component     | What it is                                                              | Examples                                                                            |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `TS_ID`       | **Test Set ID** - Xray Test Set ID (only if using Xray)                 | `GX-150` (where GX-150 is a Test Set)                                               |
| `US_ID`       | **User Story ID** - Related US ID (if using native Jira)                | `GX-101` (where GX-101 is a User Story)                                             |
| `TC#`         | Sequential test case number                                              | `TC1`, `TC2`, `TC3`...                                                              |
| `CORE`        | **The main behavior** being validated (verb + object)                   | `successful login`, `validation error`, `user creation`                             |
| `CONDITIONAL` | **The condition or context** that makes this scenario unique            | `with valid credentials`, `when field is empty`, `when exceeding limit`             |

### Mental Formula

```
"[ID]: TC#: Validate [WHAT behavior] [UNDER WHAT condition]"
```

### Examples by Test Type

| Type     | CORE                         | CONDITIONAL                           | Complete Title                                                                          |
| -------- | ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| Positive | `successful login`           | `with valid credentials`              | `GX-101: TC1: Validate successful login with valid credentials`                         |
| Negative | `authentication error`       | `when password is incorrect`          | `GX-101: TC2: Validate authentication error when password is incorrect`                 |
| Boundary | `character limit`            | `when entering exactly 50 chars`      | `GX-101: TC3: Validate character limit when entering exactly 50 chars`                  |
| Edge     | `cart behavior`              | `when there are multiple same items`  | `GX-101: TC4: Validate cart behavior when there are multiple same items`                |

### Anti-patterns (avoid)

| ❌ Incorrect             | ✅ Correct                                                             | Why                              |
| ------------------------ | --------------------------------------------------------------------- | -------------------------------- |
| `Login test`             | `GX-101: TC1: Validate successful login with valid credentials`       | Missing ID, TC#, CORE and CONDITIONAL |
| `Login - error`          | `GX-101: TC2: Validate authentication error with invalid password`    | Too vague                        |
| `TC1: Test form`         | `GX-101: TC1: Validate form submission with all fields`               | Missing ID, CORE not specific    |

### For English Projects

```
[Should] [Feature-Expected-Behavior] [Condition(If/When/With/At)]
```

| Type     | Title                                                     |
| -------- | --------------------------------------------------------- |
| Positive | Should login successfully with valid credentials          |
| Negative | Should display error message when password is incorrect   |
| Boundary | Should accept exactly 50 characters in name field         |
| Edge     | Should calculate total correctly with multiple same items |

**Complete reference:** `.context/guidelines/QA/jira-test-management.md` → Section "Ticket Nomenclature in Jira"

---

## Variable Pattern for Test Data

**⚠️ CRITICAL:** Test cases must NOT contain hardcoded data from the real application.

### Fundamental Principle

A test case is executed **repeatedly throughout the project's life**. Production/staging data **changes, iterates, gets destroyed**. Therefore:

- ❌ **DO NOT use specific real values** (UUIDs, IDs, emails of real users)
- ✅ **Use variables/placeholders** that describe the TYPE of data required
- ✅ **The tester builds the preconditions** by searching or creating the necessary data

### When TO use specific data

Only when the **acceptance criterion** defines an explicit value tied to a business rule:

```gherkin
# ✅ CORRECT - The business rule defines the limit
Then the field must accept maximum 500 characters

# ✅ CORRECT - The format is part of the requirement
Then the rating is displayed in "X.X/5.0" format
```

### Variable Format

Use braces `{variable}` to indicate parameterizable data:

| Variable      | Description                  | How the tester obtains it                                             |
| ------------- | ---------------------------- | --------------------------------------------------------------------- |
| `{user_id}`   | UUID of an existing user     | Query DB or create test user                                          |
| `{mentor_id}` | UUID of a verified mentor    | `SELECT id FROM profiles WHERE role='mentor' AND is_verified=true`    |
| `{N}`         | Quantity of elements         | Count in DB or define in setup                                        |
| `{average}`   | Calculated value             | Derived from setup data                                               |

### Example: Before vs After

**❌ INCORRECT (hardcoded data):**

```gherkin
Given a mentor exists with user_id "550e8400-e29b-41d4-a716-446655440000"
And the mentor has 23 reviews with average rating 4.7/5.0
And rating distribution is: 15 five-star, 5 four-star, 2 three-star, 0 two-star, 1 one-star
```

**✅ CORRECT (variable pattern):**

```gherkin
Given a verified mentor exists with {mentor_id} in the database
And the mentor has {N} reviews where {N} > 0
And each review has a rating between 1 and 5 stars
And the average rating {average} = sum of ratings / {N}
And the rating distribution is calculable from the {N} reviews
```

### Equivalent Partitions

When a business rule accepts a **range of values**, document the partition, not a specific value:

| Partition            | Class               | Data example                           |
| -------------------- | ------------------- | -------------------------------------- |
| Review count         | N > 0 (with reviews)| Any mentor with at least 1 review      |
| Review count         | N = 0 (no reviews)  | New mentor without reviews             |
| Average rating       | 1.0 ≤ X ≤ 5.0       | The calculated average                 |
| Pluralization        | N = 1 (singular)    | "1 review"                             |
| Pluralization        | N > 1 (plural)      | "N reviews"                            |

### Variables Section in Test Case

**MANDATORY:** Include a variables table with queries to obtain them:

```markdown
## Test Case Variables

| Variable    | Description               | How to obtain                                                              |
| ----------- | ------------------------- | -------------------------------------------------------------------------- |
| {mentor_id} | Verified mentor UUID      | `SELECT id FROM profiles WHERE role='mentor' AND is_verified=true LIMIT 1` |
| {N}         | Review count              | `SELECT COUNT(*) FROM reviews WHERE subject_id = {mentor_id}`              |
| {average}   | Average rating            | `SELECT AVG(rating) FROM reviews WHERE subject_id = {mentor_id}`           |
```

### Notes for the Tester

Always include a section explaining how to build preconditions:

```gherkin
# === NOTES FOR THE TESTER ===
# - {mentor_id}: Query DB for a mentor with is_verified=true and role='mentor'
# - {N}: Count existing reviews for that mentor where is_hidden=false
# - {average}: Calculated automatically, validate against DB or UI
# - If there's not enough data, create preconditions by inserting test data
```

### Benefits of This Pattern

1. **Durability:** The test case doesn't need updates when data changes
2. **Portability:** Works in any environment (local, staging, QA)
3. **Clarity:** The tester understands WHAT they need, doesn't depend on a magic value
4. **Automation:** The script can parameterize values dynamically

---

## Standard Labels

| Label                            | Use                          |
| -------------------------------- | ---------------------------- |
| `regression`                     | All regression tests         |
| `smoke`                          | Smoke tests (critical)       |
| `e2e`                            | End-to-end tests             |
| `integration`                    | API integration tests        |
| `functional`                     | Unit functional tests        |
| `automation-candidate`           | Marked for automation        |
| `manual-only`                    | Not automatable              |
| `critical`/`high`/`medium`/`low` | Priority                     |

---

## Common Errors

| Error                       | Solution                                     |
| --------------------------- | -------------------------------------------- |
| "Not logged in"             | `[TMS_TOOL] Authenticate` (reads from .env)  |
| "Issue type Test not found" | Verify Xray is installed in the project      |
| "Epic not found"            | Create regression epic first (Phase 1)       |
| "Transition not allowed"    | Verify current issue status                  |

---

## Output

### If using [TMS_TOOL] (Xray):

- Tests created in Jira with Xray "Test" Issue Type
- Structured steps (if Steps format) or embedded Gherkin (if Cucumber format)
- Tests linked to User Story
- Tests within Regression Epic
- States transitioned according to workflow

### If using [ISSUE_TRACKER_TOOL] only (native Jira):

- Tests created in Jira with "Test" Issue Type (custom)
- Content in Description (Gherkin or Steps table)
- Tests linked to User Story
- Tests within Regression Epic
- States transitioned according to workflow

### Local Output (Cache):

- `tests/` directory in story folder
- One `.md` file per documented test
- Format according to chosen option (Gherkin or Steps)

### For next stages:

- Tests with **CANDIDATE** status → Ready for Stage 4 (Automation)
- Tests with **MANUAL** status → Manual regression suite
