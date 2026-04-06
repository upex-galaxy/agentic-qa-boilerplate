# Test Analysis

> Analyze the complete context of a User Story to identify regression test candidates.

> **Note**: If you completed Stage 1 planning (`acceptance-test-plan.md`), the test analysis was already performed during shift-left testing. You can **skip this prompt** and proceed directly to `test-prioritization.md`. Use this prompt only if Stage 1 was skipped or if additional analysis is needed.

---

## Purpose

Gather and analyze all available information about a feature to identify which scenarios should become regression tests (manual or automated).

**CRITICAL CONTEXT:**

The User Story is already in **QA Approved** status, which means:

- All exploratory testing COMPLETED
- ALL tests ALREADY PASSED
- Bugs found have BEEN CLOSED
- The functionality is STABLE

**We are NOT designing tests to execute**. We are deciding **which of the tests already executed are worth keeping in regression** to protect against future changes.

---

## Prerequisites

**Load required context:**

```
Read: .context/guidelines/QA/jira-test-management.md
```

**Required tools:**

- MCP Atlassian (to read Jira)

---

## Input Required

Provide **at least one** of the following:

1. **User Story ID** - For complete analysis from Jira
2. **Epic ID** - For analysis of multiple stories
3. **Exploratory session notes** - Path or content

---

## Required Test Nomenclature

**Format:** `Validate <CORE> <CONDITIONAL>`

| Component     | What it is                                         | Examples                                             |
| ------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `CORE`        | The main behavior (verb + object)                  | `successful login`, `reviews display`                |
| `CONDITIONAL` | The condition that makes this scenario unique      | `with valid credentials`, `when there are 10+ reviews` |

**Correct examples:**

- `Validate reviews display when mentor has multiple reviews`
- `Validate error message with retry option when API returns 500`
- `Empty state` (too vague, not a flow)
- `API error handling` (feature, not scenario)
- `Mobile responsive` (cross-cutting, not a separate test)

**Complete reference:** `.context/guidelines/QA/jira-test-management.md`

---

## Workflow

### Phase 1: Gather Context from Jira

**Use MCP Atlassian to obtain:**

```
1. Complete User Story:
   Tool: mcp__atlassian__jira_get_issue
   - Summary, Description, Acceptance Criteria
   - Current status (must be QA Approved)
   - Labels and components

2. US Comments:
   Tool: mcp__atlassian__jira_get_issue (includes comments)
   - Development notes
   - QA feedback
   - Technical discussions

3. Linked Issues:
   - Related bugs (is blocked by, causes) ← CRITICAL for risk
   - Sub-tasks
   - Other related stories (relates to)
   - Existing tests (is tested by)

4. Parent Epic (if applicable):
   - Broader business context
   - Other stories from the same epic
```

**Extract from each source:**

| Source           | What to look for                             |
| ---------------- | -------------------------------------------- |
| Description      | Acceptance Criteria, business rules          |
| US Comments      | Edge cases discussed, technical decisions    |
| Bug Comments     | Known issues, risk areas                     |
| Sub-tasks        | Implementation details                       |
| Exploratory notes| Validated scenarios, observations            |

---

### Phase 1.5: Gather Already Documented Tests

**IMPORTANT:** DO NOT invent new tests. Look for ones that ALREADY exist:

**Sources of existing tests:**

| Source                   | Path/Location                                                | What it contains                   |
| ------------------------ | ------------------------------------------------------------ | ---------------------------------- |
| **Acceptance Test Plan** | `.context/PBI/epics/.../stories/.../acceptance-test-plan.md` | Test cases from Shift-Left         |
| **Jira Comments**        | Comment "Acceptance Test Plan" in the US                     | Documented test cases              |
| **Session Notes**        | Exploratory testing notes                                    | Validated scenarios                |
| **Closed Bugs**          | Linked issues with status CLOSED                             | Areas that failed and were fixed   |

**Reuse existing nomenclature:**

If a test was already documented in Shift-Left as:

```
Validate complete reviews display when mentor has multiple reviews
```

Use THAT SAME nomenclature throughout the analysis to maintain traceability.

---

### Phase 2: Separate Cross-Cutting Characteristics vs Real Scenarios

**CRITICAL:** Before listing scenarios, identify what is a REAL TEST vs what is a CHARACTERISTIC validated WITHIN tests.

#### Cross-Cutting Characteristics (NOT separate tests)

These are validated **WITHIN** each test, not as independent tests:

| Characteristic        | How it's validated                                 | Example                           |
| --------------------- | -------------------------------------------------- | --------------------------------- |
| **Mobile responsive** | Execute each test in mobile AND desktop viewports  | Don't create "Mobile responsive" test |
| **XSS prevention**    | Include data with special characters in test data  | Don't create "XSS prevention" test |
| **Performance**       | Measure load time in each test                     | Don't create "Performance" test   |
| **Accessibility**     | A11y assertions in UI tests                        | Don't create "Accessibility" test |
| **API contract**      | Verify responses in each API test                  | Don't create "API validation" test|
| **Error handling**    | Validate as part of specific negative scenarios    | Don't create generic "Error handling" test |

#### Real Scenarios (ARE tests)

A real scenario is a **USER FLOW** with:

- Clear business objective
- Start, action, and verifiable result
- Nomenclature: `Validate <CORE> <CONDITIONAL>`

**Separation example:**

| Characteristic (NOT a test)    | Real Scenario (IS a test)                                      |
| ------------------------------ | -------------------------------------------------------------- |
| `Empty state`                  | `Validate informative message when mentor has no reviews`      |
| `API error handling`           | `Validate error message with retry when API returns 500`       |
| `Mobile responsive`            | Validated by executing ALL tests in mobile                     |
| `Pagination`                   | `Validate navigation between pages when there are 10+ reviews` |

---

### Phase 2.5: Classify Identified Scenarios

**For each REAL scenario found, classify:**

#### By Business Priority

| Classification | Criteria                              |
| -------------- | ------------------------------------- |
| **Critical**   | Core business flow, high impact       |
| **High**       | Important feature, frequent usage     |
| **Medium**     | Secondary feature, moderate impact    |
| **Low**        | Edge case, rare usage                 |

#### By Automatability

| Automatable                | Not Automatable            |
| -------------------------- | -------------------------- |
| Deterministic outcomes     | Requires human judgment    |
| Stable locators/APIs       | Visual-only validation     |
| Repeatable steps           | Complex/manual setup       |
| Clear assertions           | Third-party integrations   |
| Few dependencies           | Very dynamic data          |

#### By Test Type

| Type            | Description                    | Example                        |
| --------------- | ------------------------------ | ------------------------------ |
| **E2E**         | Complete user flow             | Login → Purchase → Confirmation|
| **Integration** | Communication between systems  | Auth API → Products API        |
| **Functional**  | Specific isolated functionality| Form validation                |
| **Smoke**       | Basic functionality check      | App loads, login works         |

#### E2E/Integration Detection

**Ask:**

1. Is this story part of a larger flow that crosses multiple modules?
   - YES → Consider E2E test that integrates with other stories

2. Does this story consume or provide APIs that other features use?
   - YES → Consider Integration test

3. Is this story atomic and self-contained?
   - YES → Only Functional/Smoke tests

---

### Phase 3: Identify Reusable Components

**"Lego" Concept:** Each atomic test can be a component of larger tests.

```
Analyze if the scenario:

1. Is a COMPONENT of a larger E2E flow
   Example: "Successful login" → component of "Complete checkout flow"

2. Can REUSE existing components
   Example: "Edit profile" test can reuse "Successful login"

3. Is a COMPLETE E2E flow that groups several components
   Example: "Complete checkout" = Login + Cart + Payment + Confirmation
```

**Document relationships:**

```
Scenario: Successful login
├── Type: Functional (atomic)
├── Component of: [Checkout E2E, Profile E2E, Admin E2E]
└── Value: High (reusable in multiple flows)
```

---

### Phase 4: Generate Analysis Report

```markdown
# Test Analysis Report

**User Story:** [STORY-XXX] [Summary]
**Epic:** [EPIC-XXX] [Epic name]
**Date:** [Date]
**Analyst:** AI Assistant

---

## Sources Analyzed

| Source           | Issues/Docs          | Key Insights              |
| ---------------- | -------------------- | ------------------------- |
| User Story       | STORY-XXX            | [AC summary]              |
| US Comments      | [N] comments         | [Edge cases mentioned]    |
| Related Bugs     | BUG-XXX, BUG-YYY     | [Risk areas]              |
| Exploratory notes| [Path or reference]  | [Validated scenarios]     |
| Linked Stories   | STORY-YYY            | [Additional context]      |

---

## Identified Scenarios

### Critical Priority

| #   | Scenario            | Type       | Automatable | Component of  |
| --- | ------------------- | ---------- | ----------- | ------------- |
| 1   | [Successful login]  | Functional | Yes         | Checkout E2E  |
| 2   | [Complete checkout] | E2E        | Yes         | -             |

### High Priority

| #   | Scenario              | Type        | Automatable | Component of  |
| --- | --------------------- | ----------- | ----------- | ------------- |
| 3   | [Password validation] | Functional  | Yes         | Login         |
| 4   | [Payment error]       | Integration | Yes         | Checkout E2E  |

### Medium Priority

| #   | Scenario        | Type       | Automatable | Notes            |
| --- | --------------- | ---------- | ----------- | ---------------- |
| 5   | [Edit profile]  | Functional | Yes         | Secondary flow   |

### Low Priority / Deferred

| #   | Scenario                    | Reason to Defer        |
| --- | --------------------------- | ---------------------- |
| 6   | [Rarely used feature X]     | < 1% user usage        |

---

## Component Map (Lego)

E2E: Complete Purchase Flow
├── [1] Successful login (Functional)
├── [NEW] Search product (Functional)
├── [NEW] Add to cart (Functional)
├── [4] Payment process (Integration)
└── [NEW] Order confirmation (Functional)

E2E: Profile Management
├── [1] Successful login (reused)
├── [5] Edit profile (Functional)
└── [NEW] Change password (Functional)

---

## Candidate Summary

| Category                      | Count              |
| ----------------------------- | ------------------ |
| Total real scenarios          | [N]                |
| Cross-cutting characteristics | [N] (NOT tests)    |
| Regression candidates         | [N]                |
| With prior bugs (risk)        | [N]                |
| Automatable                   | [N]                |
| Manual-only                   | [N]                |
| Deferred                      | [N]                |

---

## Prior Bug Analysis (Risk)

**CRITICAL:** Closed bugs indicate areas that failed before and CAN fail again.

| Bug ID  | Description   | Affected Area | Related Scenario? | Higher Risk? |
| ------- | ------------- | ------------- | ----------------- | ------------ |
| BUG-XXX | [Description] | [Area]        | [Scenario #N]     | YES/NO       |

**Rule:** If a scenario is related to a prior bug, it has **higher priority** for regression.

---

## Recommendations

### For Prioritization (next step):

- Scenarios [X, Y] have prior bugs → Higher priority
- Scenario [Z] is main flow → Consider
- Scenarios [A, B, C] are edge cases → Probably defer

### Risk Areas Detected:

- [Area X] had prior bugs (BUG-XXX) → **Include in regression**
- [Area Y] mentioned in comments as complex → **Evaluate**

### Need for E2E/Integration Tests:

| Needs E2E? | Reason |
| ---------- | ------ |
| YES / NO   | [This story is part of flow X that crosses Y and Z] |

| Needs Integration? | Reason |
| ------------------ | ------ |
| YES / NO           | [This story consumes/provides API X used by Y] |
```

---

## Decision Point

After analysis, proceed to:

| Result                          | Next Step                  |
| ------------------------------- | -------------------------- |
| Candidates identified           | → `test-prioritization.md` |
| No candidates (simple feature)  | → Close or go to Stage 4   |
| Needs more exploration          | → Return to Stage 2        |

---

## Output

- Analysis report with classified scenarios
- List of regression candidates
- Component map (lego relationships)
- Recommendations for prioritization
- Identified risk areas
