# Jira Test Management Guidelines

> **For**: QA Engineers
> **Stage**: 3 (Test Documentation)
> **Purpose**: Standards for test management in Jira (with or without Xray)

---

## Central Principle

Test Management in Jira begins **AFTER** a functionality is **stable and functional**. The objective is to:

1. **Document** the tests validated during exploratory testing
2. **Trace** tests to user stories
3. **Prepare** tests for automation
4. **Maintain** an organized regression repository

---

## Test Management Modes

### Key Question Before Starting

Before documenting tests, determine:

```
Does the project use Xray as a Test Management plugin?

- YES → Use Xray CLI (`bun xray`) + MCP Atlassian
- NO  → Use only MCP Atlassian with native "Test" Issue Type
```

### Mode Comparison

| Aspect               | Jira Native (no Xray)      | Jira + Xray                               |
| -------------------- | -------------------------- | ----------------------------------------- |
| **Issue Type**       | Test (custom)              | Test, Test Plan, Test Set, Test Execution |
| **Test Steps**       | In Description (markdown)  | Structured field with individual steps    |
| **Execution**        | Custom field "Test Status" | Test Execution issues with runs           |
| **Traceability**     | Manual links               | Automatic bidirectional links             |
| **Tool**             | MCP Atlassian              | MCP Atlassian + Xray CLI (`bun xray`)    |
| **CI/CD Results**    | Custom API                 | Native JUnit/Cucumber import              |

---

## Xray Issue Types

When the project uses Xray, these additional issue types are available:

| Issue Type         | Purpose                                    | Relationship                |
| ------------------ | ------------------------------------------ | --------------------------- |
| **Test**           | Individual test case                       | Child of Epic/Story         |
| **Test Plan**      | Groups tests for a release/sprint          | Contains Tests              |
| **Test Set**       | Groups tests by criteria (smoke, regression)| Contains Tests             |
| **Test Execution** | Execution instance of tests                | Executes Tests, generates Runs |
| **Precondition**   | Reusable prerequisites                     | Referenced by Tests         |

---

## Jira Configuration (Native Mode)

Create a custom Issue Type called **Test** with the following fields:

| Field                | Type         | Purpose                                                     |
| -------------------- | ------------ | ----------------------------------------------------------- |
| Summary              | Text         | Clear test case name                                        |
| Description          | Long text    | Test steps (Gherkin or traditional)                         |
| Test Status          | Select list  | `Draft`, `In Design`, `Ready`, `Manual`, `In Review`, `Candidate`, `In Automation`, `Pull Request`, `Automated`, `Deprecated` |
| Automation Candidate | Checkbox     | Is it a candidate for automation?                           |
| Priority             | Select list  | `Critical`, `High`, `Medium`, `Low`                         |
| Labels               | Multi-select | `regression`, `smoke`, `e2e`, `integration`                 |

---

## Test Workflow in Jira

### State Diagram and Transitions

```
┌─────────┐
│  START  │
└────┬────┘
     │ Create
     ▼
┌─────────┐    automation review    ┌────────────┐
│  DRAFT  │◄────────────────────────│ DEPRECATED │
└────┬────┘                         └────────────┘
     │ start design                        ▲
     ▼                                     │ Any
┌───────────┐                              │
│ IN DESIGN │◄─────┐                       │
└─────┬─────┘      │ back                  │
      │ ready to run                       │
      ▼                                    │
┌─────────┐    for manual    ┌────────┐    │
│  READY  │─────────────────►│ MANUAL │────┤
└────┬────┘                  └────┬───┘    │
     │                            │        │
     │ automation review          │ automated
     ▼                            ▼        │
┌───────────┐  approve      ┌───────────┐  │
│ IN REVIEW │──────────────►│ CANDIDATE │  │
└─────┬─────┘  to automate  └─────┬─────┘  │
      │                           │        │
      │ for automation            │ start automation
      │                           ▼        │
      │                     ┌──────────────┐
      │                     │ IN AUTOMATION │
      │                     └───────┬──────┘
      │                             │ create PR
      │                             ▼
      │                     ┌──────────────┐
      │                     │ PULL REQUEST │
      │                     └───────┬──────┘
      │                             │ merged
      │                             ▼
      │                     ┌───────────┐
      └────────────────────►│ AUTOMATED │
                            └───────────┘
```

### Workflow States

| State             | Description                           | Next Step                            |
| ----------------- | ------------------------------------- | ------------------------------------ |
| **Draft**         | Newly created test, draft             | Start design                         |
| **In Design**     | Writing steps/gherkin                 | Mark ready when complete             |
| **Ready**         | Documented, ready for decision        | → Manual or → In Review              |
| **Manual**        | Manual regression test                | (can move to In Review later)        |
| **In Review**     | Review for automation (ROI)           | → Candidate or → Manual              |
| **Candidate**     | Approved for automation               | Start automation                     |
| **In Automation** | Automation in progress                | Create PR when ready                 |
| **Pull Request**  | PR open, waiting for merge            | (auto-transitions with integration)  |
| **Automated**     | Test automated and in CI/CD           | Final state (automated regression)   |
| **Deprecated**    | Obsolete/discarded test               | Can be recovered                     |

### Key Transitions

| Transition            | From → To                       | Trigger                          |
| --------------------- | ------------------------------- | -------------------------------- |
| `start design`        | Draft → In Design               | AI starts documentation          |
| `ready to run`        | In Design → Ready               | Documentation complete           |
| `for manual`          | Ready → Manual                  | Not a candidate for automation   |
| `automation review`   | Ready → In Review               | Evaluate ROI for automation      |
| `approve to automate` | In Review → Candidate           | Positive ROI, approved           |
| `start automation`    | Candidate → In Automation       | Stage 4 begins                   |
| `create PR`           | In Automation → Pull Request    | PR created (auto with integration)|
| `merged`              | Pull Request → Automated        | PR merged (auto with integration)|

---

## Regression Epic (Test Repository)

### Concept

**ALL** documented tests must belong to a Regression Epic. This epic acts as the central repository.

### Naming

```
Valid names for the epic:
- "Test Repository"
- "QA Regression Suite"
- "[Project] Regression Tests"
- Any epic with label "regression" or "test-repository"
```

### Mandatory Verification

Before creating any Test, verify:

```
1. Does a regression epic exist in the project?
   - JQL: project = PROJ AND issuetype = Epic AND (summary ~ "regression" OR summary ~ "test repository" OR labels = "test-repository")

2. If NOT:
   - Ask the user if they want to create one
   - Suggested name: "[PROJECT] Test Repository"
   - Labels: test-repository, regression

3. If YES:
   - Use that epic as parent for all Tests
```

### Structure in Jira

```
EPIC: Test Repository (always In Progress)
├── TEST-001: [Smoke] Basic login
├── TEST-002: [Smoke] Main navigation
├── TEST-003: [Regression] Complete checkout
├── TEST-004: [Regression] User profile
├── TEST-005: [E2E] Complete purchase flow
└── ... (tests added continuously)
```

---

## Tools by Mode

### Jira Native (no Xray)

| Tool                                               | Use                        |
| -------------------------------------------------- | -------------------------- |
| `mcp__atlassian__createJiraIssue`                  | Create Test issues         |
| `mcp__atlassian__getJiraIssue`                     | Read story/test details    |
| `mcp__atlassian__searchJiraIssues`                 | Search regression epic     |
| `mcp__atlassian__updateJiraIssue`                  | Update status/fields       |
| `mcp__atlassian__addCommentToJiraIssue`            | Add notes/results          |
| `mcp__atlassian__getJiraProjectIssueTypesMetadata` | Get Test schema            |
| `mcp__atlassian__transitionJiraIssue`              | Move between states        |

### Jira + Xray

Use **both** tools:

**MCP Atlassian** (for standard Jira operations):

- Create/read generic issues
- Search epics
- Add comments
- Links between issues

**Xray CLI** (for Xray-specific operations):

```bash
# Authentication (once per session)
bun xray auth login --client-id "$XRAY_CLIENT_ID" --client-secret "$XRAY_CLIENT_SECRET"

# Create test with structured steps
bun xray test create --project PROJ --summary "Successful login" \
  --step "Navigate to /login|Form visible" \
  --step "Enter credentials|user@test.com|Login successful"

# Create Cucumber test
bun xray test create --project PROJ --type Cucumber --summary "Login feature" \
  --gherkin "Feature: Login\n  Scenario: Valid login\n    Given I am on login"

# List project tests
bun xray test list --project PROJ

# Create Test Execution
bun xray exec create --project PROJ --summary "Sprint 10 Regression"

# Import automation results
bun xray import junit --file results.xml --project PROJ
```

---

## Test Case Format

### Option 1: Gherkin (Recommended)

```gherkin
Feature: User Login

@critical @regression
Scenario: Successful login with valid credentials
  Given I am on the login page
  When I enter email "user@example.com"
  And I enter password "Password123!"
  And I click the submit button
  Then I should be redirected to the dashboard
  And I should see a welcome message

@high @regression
Scenario Outline: Failed login with invalid credentials
  Given I am on the login page
  When I enter email "<email>"
  And I enter password "<password>"
  And I click the submit button
  Then I should see the error message "<error>"

  Examples:
    | email            | password   | error                |
    | invalid          | Pass123!   | Invalid email format |
    | user@example.com | incorrect  | Invalid credentials  |
```

### Option 2: Traditional Format (Steps)

| Step | Action             | Test Data        | Expected Result       |
| ---- | ------------------ | ---------------- | --------------------- |
| 1    | Navigate to /login | -                | Form visible          |
| 2    | Enter email        | user@example.com | Field populated       |
| 3    | Enter password     | Password123!     | Field masked          |
| 4    | Click Submit       | -                | Redirect to dashboard |

---

## Automation Analysis (ROI)

### Criteria for Automation

| Factor           | Automate (ROI+)         | Keep Manual (ROI-)     |
| ---------------- | ----------------------- | ---------------------- |
| **Frequency**    | Execute frequently      | One-time only          |
| **Stability**    | Stable flow             | Changing flow          |
| **Complexity**   | Repetitive steps        | Requires human judgment|
| **Risk**         | High impact if fails    | Low risk               |
| **Dependencies** | Few dependencies        | Many integrations      |
| **Technology**   | Supported by framework  | Not automatable        |

### Simplified ROI Formula

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies)

- If ROI > 1.5 → Candidate
- If ROI 0.5-1.5 → Evaluate case by case
- If ROI < 0.5 → Manual
```

### Tests as Components (Lego)

An individual test can be part of a larger flow:

```
Atomic test: "Successful login"
    └── E2E component: "Complete purchase flow"
        ├── Successful login (this test)
        ├── Add product to cart
        ├── Checkout process
        └── Order confirmation

Benefit: Automate atomically, compose into E2E
```

---

## Test Prioritization

### Risk Matrix

| Impact / Probability → | High          | Medium      | Low           |
| ----------------------- | ------------- | ----------- | ------------- |
| **High**                | P1 - Critical | P2 - High   | P3 - Medium   |
| **Medium**              | P2 - High     | P3 - Medium | P4 - Low      |
| **Low**                 | P3 - Medium   | P4 - Low    | P5 - Optional |

### Priority Labels

| Label         | Meaning               | Action                 |
| ------------- | --------------------- | ---------------------- |
| `smoke`       | Smoke test, essential | Always execute         |
| `regression`  | Full regression       | Execute before release |
| `e2e`         | Critical end-to-end   | Automate first         |
| `integration` | System integration    | Automate               |
| `manual-only` | Not automatable       | Manual regression      |

---

## Traceability

### Link Structure

```
User Story (STORY-XXX)
    ↓ is tested by
Test (TEST-XXX)
    ↓ is blocked by (optional)
Bug (BUG-XXX)
```

### Required Links

| From | To         | Link Type                    |
| ---- | ---------- | ---------------------------- |
| Test | User Story | "tests" / "is tested by"     |
| Test | Epic       | Parent (Regression Epic)     |
| Test | Bug        | "is blocked by" (if applies) |

---

## Standard Labels

| Label                            | Meaning                 |
| -------------------------------- | ----------------------- |
| `smoke`                          | Smoke test, critical    |
| `regression`                     | Regression suite        |
| `e2e`                            | End-to-end test         |
| `integration`                    | API integration test    |
| `manual-only`                    | Not automatable         |
| `automation-candidate`           | Marked for automation   |
| `critical`/`high`/`medium`/`low` | Priority                |

---

## Ticket Naming Conventions

### Naming Standard per Issue Type

This guide standardizes naming for each ticket type to facilitate traceability and organization.

---

### Test Case (TC)

**Format by tool:**

| Tool            | Format                                      |
| --------------- | ------------------------------------------- |
| **Xray**        | `<TS_ID>: TC#: Validate <CORE> <CONDITIONAL>` |
| **Jira native** | `<US_ID>: TC#: Validate <CORE> <CONDITIONAL>` |

**Component Definition:**

| Component     | What it is                                                              | Examples                                                                      |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `TS_ID`       | **Test Set ID** - Xray Test Set ID (only if using Xray)                | `GX-150` (where GX-150 is a Test Set)                                         |
| `US_ID`       | **User Story ID** - Related US ID (if using Jira native)               | `GX-101` (where GX-101 is a User Story)                                       |
| `TC#`         | Sequential test case number                                            | `TC1`, `TC2`, `TC3`...                                                        |
| `CORE`        | **Main behavior** being validated (verb + object)                      | `successful login`, `validation error`, `user creation`                       |
| `CONDITIONAL` | **The condition or context** that makes this scenario unique           | `with valid credentials`, `when field is empty`, `when exceeding the limit`   |

**Mental Formula:**

```
"[ID]: TC#: Validate [WHAT behavior] [UNDER WHAT condition]"
```

**Examples by Test Type:**

| Type     | CORE                         | CONDITIONAL                        | Full Title                                                                    |
| -------- | ---------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| Positive | `successful login`           | `with valid credentials`           | `GX-101: TC1: Validate successful login with valid credentials`               |
| Negative | `authentication error`       | `when password is incorrect`       | `GX-101: TC2: Validate authentication error when password is incorrect`       |
| Boundary | `character limit`            | `when entering exactly 50 chars`   | `GX-101: TC3: Validate character limit when entering exactly 50 chars`        |
| Edge     | `cart behavior`              | `when there are multiple same items`| `GX-101: TC4: Validate cart behavior when there are multiple same items`     |

**Anti-patterns (avoid):**

| Incorrect                 | Correct                                                              | Why                                    |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| `Login test`              | `GX-101: TC1: Validate successful login with valid credentials`      | Missing ID, TC#, CORE and CONDITIONAL  |
| `Login - error`           | `GX-101: TC2: Validate authentication error with invalid password`   | Too vague                              |
| `TC1: Test form`          | `GX-101: TC1: Validate form submission with all fields`              | Missing ID, CORE is not specific       |

**English naming pattern:**

```
[Should] [Feature-Expected-Behavior] [Condition(If/When/With/At)]
```

| Type     | Title                                                     |
| -------- | --------------------------------------------------------- |
| Positive | Should login successfully with valid credentials          |
| Negative | Should display error message when password is incorrect   |
| Boundary | Should accept exactly 50 characters in name field         |
| Edge     | Should calculate total correctly with multiple same items |

---

### Test Suite (TS)

**Format:**

```
<ExecutionStrategy>: <ID>: <SUITE_SUMMARY>
```

| Suite Type                     | ExecutionStrategy    | ID          | SUITE_SUMMARY         |
| ------------------------------ | -------------------- | ----------- | --------------------- |
| For specific User Story        | `Sanity`             | US ID       | Brief US title        |
| For general functionalities    | `Smoke`/`Regression` | (optional)  | Identifying title     |

**Examples:**

```
Sanity: GX-101: Allow credit card payment
Smoke: Core Features v2.0
Regression: Sprint 50
```

---

### Test Plan

**Format:**

```
QA: TestPlan: <ExecutionStrategy> <ReleaseVersion(optional)>
```

**Examples:**

```
QA: TestPlan: Regression S50
QA: TestPlan: Smoke v2
QA: TestPlan: Sanity ShoppingCart v2
```

---

### Test Execution (TX)

**Format:**

```
<ExecutionStrategy>: <ID>: <TX_SUMMARY>
```

**Examples:**

```
Sanity: GX-101: Allow credit card payment
Regression: TP-50: Sprint 50 Regression
```

---

### ReTesting (RTX)

**Format:**

```
ReTest: <BUGID>: <ISSUE_SUMMARY>
```

**Example:**

```
ReTest: GX-202: Does not show error when entering incorrect password
```

---

### Preconditions (PRC)

**Format:**

```
<EPICNAME>: <COMPONENT>: PRC: For <NEXT_ACTION>
```

**Example:**

```
CheckoutFlow: Payment: PRC: For processing credit card payment
```

---

### Naming Summary Table

| Issue Type      | Format                                       | Example                                               |
| --------------- | -------------------------------------------- | ----------------------------------------------------- |
| Test Case (TC)  | `<TS_ID>: TC#: Validate <CORE> <CONDITIONAL>`| `GX-101: TC2: Validate add product to cart...`        |
| Test Suite (TS) | `<Strategy>: <ID>: <SUMMARY>`                | `Sanity: GX-101: Allow credit card payment`           |
| Test Plan       | `QA: TestPlan: <Strategy> <Version>`         | `QA: TestPlan: Regression v1.3`                       |
| Test Execution  | `<Strategy>: <ID>: <SUMMARY>`                | `Sanity: GX-101: Allow credit card payment`           |
| ReTesting       | `ReTest: <BUGID>: <ISSUE_SUMMARY>`           | `ReTest: GX-202: Does not show error when...`         |
| Precondition    | `<EPIC>: <COMP>: PRC: For <ACTION>`          | `CheckoutFlow: Payment: PRC: For processing payment`  |

---

### Recommendations

- **Uniformity:** Maintain this format across all ticket creations
- **Clarity:** Use short, concise titles; details go in the description
- **Traceability:** Link Test Cases with User Stories and Test Suites
- **Consistency:** Ensure the entire team adopts the standard

---

## CI/CD Integration

### With Xray

```yaml
# GitHub Actions example
- name: Import test results to Xray
  run: bun xray import junit --file ./test-results/junit.xml --project PROJ
```

### Without Xray (Jira native)

Update "Test Status" field via API or MCP after execution.

### Results Flow

```
Playwright executes tests
        ↓
Generates JSON report
        ↓
Script syncs with Jira
        ↓
"Test Status" field updated
        ↓
Comment with execution details
```

---

## Complete Documentation Flow

```
1. EXPLORE (Stage 2)
   └── Validate functionality
   └── Identify scenarios

2. ANALYZE (Stage 3 - step 1)
   └── Read US, comments, linked issues
   └── Classify scenarios
   └── Identify E2E/Integration components

3. PRIORITIZE (Stage 3 - step 2)
   └── Calculate ROI
   └── Apply risk matrix
   └── Decide: Automated vs Manual
   └── Order by priority

4. DOCUMENT (Stage 3 - step 3)
   └── Verify/create regression epic
   └── Create Test issues (Jira or Xray)
   └── Transition: Draft → In Design → Ready
   └── Decide path: → Manual or → In Review
   └── If In Review: evaluate → Candidate

5. AUTOMATE (Stage 4)
   └── Candidate → In Automation → PR → Automated
```

---

## Best Practices

### DO

- Create tests **AFTER** the feature is stable
- Verify regression epic before creating tests
- Link tests to User Stories
- Use Gherkin format for automatable tests
- Transition states according to the workflow
- Clearly mark automation candidates
- Think of tests as reusable components

### DON'T

- Create tests before exploring the functionality
- Tests without parent (regression epic)
- Tests without traceability to requirements
- Skip workflow states
- Automate without evaluating ROI
- Duplicate tests for the same functionality

---

## See Also

- `.context/guidelines/QA/spec-driven-testing.md` - SDT principle
- `.context/guidelines/QA/atc-definition-strategy.md` - ATC definition strategy
- `.context/guidelines/TAE/tms-integration.md` - TMS integration
- `.context/jira-platform.md` - Jira platform documentation

---

**Last Updated**: 2026-03-18
