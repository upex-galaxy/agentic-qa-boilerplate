# TMS Conventions

> **For**: QA Engineers, Test Automation Engineers
> **Purpose**: Rules, conventions, and standards for managing test artifacts in any Test Management System (TMS).
> **Scope**: This file is the "rulebook" -- it defines WHAT the standards are and WHY they exist.
> **Related files**:
> - `tms-architecture.md` -- Entity model: WHAT entities exist and HOW they relate
> - `tms-workflow.md` -- Lifecycle: HOW work flows through the system stage by stage
> - `.context/guidelines/TAE/tms-integration.md` -- Technical sync between KATA and Jira/Xray

---

## Central Principle: IQL-Aligned Test Documentation

Test documentation in the TMS follows the **Integrated Quality Lifecycle (IQL)** principle: tests are created **after** a feature is validated as stable, not before exploration.

The objective is to:

1. **Document** tests that were validated during exploratory testing
2. **Trace** tests to their source requirements (user stories, acceptance criteria)
3. **Prepare** tests for automation by evaluating ROI
4. **Maintain** a living regression repository that grows incrementally

**Rule**: Only document tests for functionalities that have already passed QA validation. The TMS is a documentation and tracking tool, not an exploration tool.

```
IQL Flow:

  Explore (validate feature) --> Analyze (classify scenarios) --> Document (create TMS artifacts)
       ^                                                                |
       |                                                                v
       +--- Do NOT document here             Document ONLY stable tests here
```

---

## When to Create Tests

| Situation | Action | Rationale |
|-----------|--------|-----------|
| Feature explored and stable | Create test artifacts | Feature behavior is confirmed; documentation is reliable |
| Feature has critical open bugs | Wait for fixes first | Documenting unstable behavior creates maintenance debt |
| Before any exploration | Do NOT document | You don't know what the system actually does yet |
| Bug fix verified | Create regression test | Prevent recurrence; add to regression suite |
| Hotfix deployed | Create smoke test | Critical path must be continuously validated |

**Decision rule**: If you cannot confidently describe the expected behavior, the feature is not ready for TMS documentation.

---

## Test Case Structure

Every test case in the TMS must contain the following fields. The exact field names may vary by tool (Jira custom fields, Xray native fields, etc.), but the information must be present.

### Required Fields

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| **ID** | Auto-generated | Unique identifier in the TMS | `PROJ-101`, `TK-042` |
| **Summary** | Text | Clear test case name following naming convention | `GX-101: TC1: Validate successful login with valid credentials` |
| **Description / Steps** | Long text | Test steps in Gherkin or traditional format | See "Test Case Formats" below |
| **Test Status** | Select list | Current state in the workflow | `Draft`, `Ready`, `Automated` |
| **Priority** | Select list | Business risk priority | `Critical`, `High`, `Medium`, `Low` |
| **Labels** | Multi-select | Classification tags | `smoke`, `regression`, `e2e` |
| **Automation Candidate** | Boolean | Whether the test is a candidate for automation | Yes / No |
| **Parent** | Link | Regression epic or test repository grouping | Epic: "Test Repository" |

### Conditional Fields

| Field | When Required | Purpose |
|-------|---------------|---------|
| **Linked Story** | Always | Traceability to the requirement being tested |
| **Linked Bug** | When blocked | Indicates which bug blocks execution |
| **Automation Comment** | When `Automation Candidate = Yes` | Justification for why automation is worthwhile |
| **Test Data** | When test requires specific data | Input values, preconditions, environment state |

### Naming Convention

Test case summaries follow a strict naming convention. See `.context/guidelines/TAE/test-design-principles.md` and `.context/guidelines/QA/jira-test-management.md` (section: "Ticket Naming Conventions") for the full specification.

**Quick reference format**:

```
<ID>: TC#: Validate <CORE behavior> <CONDITIONAL scenario>
```

Examples:
- `GX-101: TC1: Validate successful login with valid credentials`
- `GX-101: TC2: Validate authentication error when password is incorrect`
- `GX-101: TC3: Validate account lockout when exceeding 5 failed attempts`

---

## Test Case Formats

Two formats are supported. Choose based on the test's automation path.

### Option 1: Gherkin (Recommended for Automation)

Use Gherkin when the test is an automation candidate. This format maps directly to KATA ATCs and Cucumber-compatible TMS tools (e.g., Xray Cucumber tests).

```gherkin
Feature: User Login

@critical @smoke
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

**When to use Gherkin**:
- Test is marked as automation candidate
- Test has clearly defined preconditions, actions, and expected results
- Test will be implemented as an ATC in KATA

### Option 2: Traditional Format (For Manual Tests)

Use traditional step tables when the test requires human judgment or will remain manual.

| Step | Action | Test Data | Expected Result |
|------|--------|-----------|-----------------|
| 1 | Navigate to /login | - | Login form is visible |
| 2 | Enter email | user@example.com | Field shows entered value |
| 3 | Enter password | Password123! | Field is masked |
| 4 | Click Submit | - | Redirect to dashboard |
| 5 | Verify welcome message | - | "Welcome, User" is displayed |

**When to use Traditional**:
- Test requires visual or subjective verification
- Test involves exploratory elements
- Test is marked `manual-only`

### Format Selection Rule

| Criterion | Gherkin | Traditional |
|-----------|---------|-------------|
| Automation candidate | Yes | No |
| Steps are deterministic | Yes | May vary |
| Expected results are exact | Yes | Subjective |
| Requires human judgment | No | Yes |

---

## Test Status Workflow

Test cases progress through a defined state machine. Every test must follow these transitions -- skipping states is not allowed.

### State Machine

```
                                                              ┌────────────┐
                                                        +---->| DEPRECATED |
                                                        |     └────────────┘
                                                        |           ^
┌───────┐    ┌───────────┐    ┌───────┐    ┌────────┐   |           |
│ DRAFT │--->│ IN DESIGN │--->│ READY │--->│ MANUAL │---+     Any state
└───────┘    └─────┬─────┘    └───┬───┘    └────┬───┘   |
                   ^              |              |       |
                   | back         |              | later |
                   +---------+    |              v       |
                             |    v         ┌───────────┐|
                             | ┌───────────┐│ CANDIDATE │+
                             | │ IN REVIEW │└─────┬─────┘
                             | └─────┬─────┘      |
                             |       |             | start automation
                             |       | approve     v
                             |       |      ┌──────────────┐
                             |       +----->│ IN AUTOMATION │
                             |              └───────┬──────┘
                             |                      | create PR
                             |                      v
                             |              ┌──────────────┐
                             |              │ PULL REQUEST │
                             |              └───────┬──────┘
                             |                      | merged
                             |                      v
                             |              ┌───────────┐
                             +------------->│ AUTOMATED │
                                            └───────────┘
```

### State Definitions

| State | Description | Entry Criteria | Exit Criteria |
|-------|-------------|----------------|---------------|
| **Draft** | Newly created test, placeholder | Test artifact created in TMS | Steps/Gherkin writing begins |
| **In Design** | Steps or Gherkin being written | Draft exists with linked story | Steps are complete and reviewable |
| **Ready** | Documented and complete | Steps reviewed for clarity | Decision made: manual or automation review |
| **Manual** | Designated for manual regression | Not an automation candidate (ROI < threshold) | Can be reconsidered for automation later |
| **In Review** | Under automation ROI evaluation | Marked as automation candidate | Approved or rejected for automation |
| **Candidate** | Approved for automation | Positive ROI assessment | Automation work begins |
| **In Automation** | ATC being implemented in KATA | Developer starts coding | PR created with implementation |
| **Pull Request** | Code submitted, awaiting merge | PR opened in version control | PR merged to main/staging |
| **Automated** | Running in CI/CD pipeline | PR merged, test executes in CI | Final state (unless deprecated) |
| **Deprecated** | Obsolete or discarded | Feature removed, test no longer valid | Can be recovered if needed |

### Key Rules

1. **No skipping states**: A test cannot jump from Draft to Automated
2. **Backward transitions are limited**: Only "back to In Design" (for rework) and "any state to Deprecated"
3. **Manual is not a dead end**: Manual tests can later move to In Review if ROI changes
4. **Automated is the target state**: The goal is to move as many tests as possible to Automated

### Updating Status via TMS

```
[TMS_TOOL] Transition test:
  - test: {from test issue key}
  - status: {target state}
  - comment: {from transition reason}
```

---

## Automation Candidate Criteria

Not every test should be automated. Use this decision framework to evaluate candidates.

### Decision Factors

| Factor | Automate (High ROI) | Keep Manual (Low ROI) |
|--------|----------------------|----------------------|
| **Frequency** | Executed every sprint or more often | One-time or annual verification |
| **Stability** | Feature is stable, rarely changes | Feature is actively evolving |
| **Complexity** | Repetitive, deterministic steps | Requires human judgment or creativity |
| **Risk** | High business impact if it fails | Low-risk, cosmetic, or non-critical |
| **Dependencies** | Few external dependencies | Many third-party integrations |
| **Technology** | Supported by the test framework | Cannot be automated (e.g., physical verification) |

### ROI Formula

Use this simplified formula to score automation candidates:

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies)

Scoring scale (1-5 for each factor):

  Frequency:    1 = yearly ... 5 = every build
  Impact:       1 = cosmetic ... 5 = revenue-blocking
  Stability:    1 = changes weekly ... 5 = unchanged for months
  Effort:       1 = trivial to automate ... 5 = extremely complex
  Dependencies: 1 = self-contained ... 5 = depends on many externals

Interpretation:
  ROI > 1.5  --> Strong candidate for automation
  ROI 0.5-1.5 --> Evaluate case by case (consider team capacity)
  ROI < 0.5  --> Keep manual
```

### Marking Candidates in the TMS

When a test is identified as an automation candidate:

```
[TMS_TOOL] Update test:
  - test: {from test issue key}
  - fields:
    - automationCandidate: true
    - labels: add "automation-candidate"
  - comment: "ROI assessment: Frequency=4, Impact=5, Stability=4, Effort=2, Dependencies=1. ROI=4.0. High-frequency critical path, low effort to automate."
```

---

## Test Prioritization

### Risk Matrix

Priority is determined by crossing business impact with failure probability:

| Impact / Probability --> | High | Medium | Low |
|--------------------------|------|--------|-----|
| **High** | P1 - Critical | P2 - High | P3 - Medium |
| **Medium** | P2 - High | P3 - Medium | P4 - Low |
| **Low** | P3 - Medium | P4 - Low | P5 - Optional |

### Priority Definitions

| Priority | Meaning | Automation Priority | CI/CD Behavior |
|----------|---------|---------------------|----------------|
| **P1 - Critical** | System unusable if this fails | Automate immediately | Runs on every commit (smoke) |
| **P2 - High** | Major feature broken | Automate in current sprint | Runs on PR merge |
| **P3 - Medium** | Feature degraded but workaround exists | Automate when capacity allows | Runs nightly or pre-release |
| **P4 - Low** | Minor inconvenience | Evaluate ROI first | Runs weekly or on-demand |
| **P5 - Optional** | Nice-to-have validation | Keep manual unless trivial to automate | Manual regression only |

---

## Labels and Tagging

### Standard Labels

Every test case must have at least one label from each category below.

**Execution scope labels** (required -- at least one):

| Label | Meaning | When to Apply |
|-------|---------|---------------|
| `smoke` | Critical path, must always pass | Core user journeys: login, checkout, main navigation |
| `regression` | Full regression suite | Any stable, documented test case |
| `e2e` | End-to-end user journey | Tests that span multiple features/modules |
| `integration` | API-level integration test | Tests that validate API contracts between services |

**Automation status labels** (applied during workflow):

| Label | Meaning | When to Apply |
|-------|---------|---------------|
| `automation-candidate` | Marked for automation | After positive ROI assessment |
| `manual-only` | Cannot or should not be automated | Requires human judgment, visual inspection, etc. |
| `automated` | Test is implemented in code | After PR is merged and test runs in CI |

**Priority labels** (optional -- use when TMS priority field is insufficient):

| Label | Meaning |
|-------|---------|
| `critical` | Maps to P1 |
| `high` | Maps to P2 |
| `medium` | Maps to P3 |
| `low` | Maps to P4 |

### Tagging Rules

1. **Every test gets `regression`** unless it is explicitly a throwaway or exploratory-only test
2. **`smoke` is exclusive** -- only tests on the critical business path get this label. Aim for 10-20% of total tests
3. **`e2e` and `integration` describe test type**, not priority. A test can be both `smoke` and `e2e`
4. **`manual-only` and `automated` are mutually exclusive** -- a test cannot be both
5. **`automation-candidate` is removed** once the test moves to `automated` or back to `manual-only`

### Label Application via TMS

```
[TMS_TOOL] Update test:
  - test: {from test issue key}
  - fields:
    - labels: ["regression", "smoke", "e2e", "automation-candidate"]
```

---

## Traceability

### Link Structure

Every test must be traceable to its source requirement:

```
User Story (STORY-XXX)
    |
    | "is tested by"
    v
Test Case (TEST-XXX)
    |
    | "is blocked by" (optional)
    v
Bug (BUG-XXX)
```

### Required Links

| From | To | Link Type | When |
|------|----|-----------|------|
| Test | User Story | "tests" / "is tested by" | Always -- every test must trace to a requirement |
| Test | Regression Epic | Parent link | Always -- all tests belong to the test repository |
| Test | Bug | "is blocked by" | When a bug prevents test execution |
| Test | Test Plan | "belongs to" | When included in a release/sprint plan |

### Regression Epic (Test Repository)

All documented tests must belong to a Regression Epic that acts as the permanent test repository:

```
EPIC: [Project] Test Repository
  |-- TEST-001: [Smoke] Basic login
  |-- TEST-002: [Smoke] Main navigation
  |-- TEST-003: [Regression] Complete checkout
  |-- TEST-004: [Regression] User profile update
  |-- TEST-005: [E2E] Complete purchase flow
  +-- ... (tests added incrementally)
```

Before creating any test, verify the regression epic exists:

```
[TMS_TOOL] Search:
  - project: {{PROJECT_KEY}}
  - query: type = Epic AND (summary ~ "regression" OR summary ~ "test repository" OR labels = "test-repository")
```

If no regression epic exists, create one:

```
[TMS_TOOL] Create issue:
  - project: {{PROJECT_KEY}}
  - type: Epic
  - summary: "{{PROJECT_KEY}} Test Repository"
  - labels: ["test-repository", "regression"]
```

---

## CI/CD Integration Pattern

### Results Flow

Automated test results flow from execution to the TMS in a defined pipeline:

```
1. EXECUTE
   Playwright runs tests with @atc decorators
       |
       v
2. REPORT
   Generate results file (JUnit XML / JSON)
       |
       v
3. SYNC
   CLI/script pushes results to TMS
       |
       v
4. UPDATE
   TMS test status and execution records updated
       |
       v
5. NOTIFY
   Team sees pass/fail in TMS dashboard
```

### Sync Operations

**Import results after test run**:

```
[TMS_TOOL] Import results:
  - format: junit
  - file: {from test results path}
  - project: {{PROJECT_KEY}}
  - execution: {from execution key or auto-create}
```

**Create a test execution for a sprint/release**:

```
[TMS_TOOL] Create execution:
  - project: {{PROJECT_KEY}}
  - title: {per execution naming convention}
  - tests: {from test plan or label filter}
```

**Sync individual test result**:

```
[TMS_TOOL] Update test status:
  - test: {from test issue key}
  - status: PASS | FAIL | BLOCKED
  - comment: "Build: {from CI build ID}, Environment: {from test environment}"
```

### CI/CD Rules

1. **Sync only from CI/CD** -- never sync local runs (they pollute the TMS with noise)
2. **Sync on main/staging only** -- feature branch results are ephemeral
3. **Include build context** -- every sync must include build ID, environment, and timestamp
4. **Handle failures gracefully** -- sync failures must not break the CI pipeline

---

## Best Practices

### DO

- Create tests **after** the feature is stable and validated
- Link every test to its source user story
- Use Gherkin format for tests that will be automated
- Evaluate ROI before marking automation candidates
- Keep the regression epic as the single source of truth for all tests
- Transition states sequentially -- follow the workflow
- Include test data in the test case description
- Review tests periodically and deprecate obsolete ones
- Think of tests as reusable components (atomic tests compose into E2E flows)

### DON'T

- Create tests before exploring the functionality
- Create tests without a parent (regression epic)
- Create tests without traceability to a requirement
- Skip workflow states (e.g., Draft directly to Automated)
- Automate without evaluating ROI first
- Duplicate tests for the same scenario (same precondition + action = same TC)
- Leave status stale after automating (update the TMS when the PR merges)
- Use generic summaries like "Login test" -- follow the naming convention
- Sync local test runs to the TMS

---

## Quick Reference: Common TMS Operations

### Test Case Management

```
[TMS_TOOL] Create test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - steps: {from test analysis}
  - labels: {per labeling convention}
  - parent: {from regression epic key}

[TMS_TOOL] Update test:
  - test: {from test issue key}
  - fields:
    - status: {target state}
    - labels: {per labeling convention}
    - automationCandidate: true | false

[TMS_TOOL] List tests:
  - project: {{PROJECT_KEY}}
  - filters:
    - status: {from query criteria}
    - labels: {from label filter}

[TMS_TOOL] Get test:
  - test: {from test issue key}
```

### Test Execution

```
[TMS_TOOL] Create execution:
  - project: {{PROJECT_KEY}}
  - title: {per execution naming convention}
  - tests: {from test plan or label filter}

[TMS_TOOL] Import results:
  - format: junit | cucumber
  - file: {from test results path}
  - project: {{PROJECT_KEY}}
  - execution: {from execution key}
```

### Search and Query

```
[TMS_TOOL] Search:
  - project: {{PROJECT_KEY}}
  - query: {from search criteria}

[ISSUE_TRACKER_TOOL] Get issue:
  - issue: {from issue key}

[ISSUE_TRACKER_TOOL] Search issues:
  - project: {{PROJECT_KEY}}
  - query: {from JQL or search expression}
```

---

## Reference Implementation: Jira + Xray

The examples in this file use generic `[TMS_TOOL]` pseudocode. For Jira + Xray as a concrete implementation:

| Convention | Jira/Xray Implementation |
|------------|-------------------------|
| Test case ID | Jira issue key (e.g., `PROJ-123`) |
| Test status field | Xray Test Status or Jira custom field |
| Regression epic | Jira Epic with label `test-repository` |
| Test execution | Xray Test Execution issue type |
| Results import | Xray REST API (JUnit/Cucumber format) |
| CLI tool | `bun xray` (see `/xray-cli` skill) |

For implementation details specific to Jira/Xray, see:
- `.context/guidelines/QA/jira-test-management.md` -- Jira-specific workflow and fields
- `.context/guidelines/TAE/tms-integration.md` -- Technical sync configuration

---

## See Also

- `tms-architecture.md` -- Entity model and relationships
- `tms-workflow.md` -- Stage-by-stage lifecycle
- `.context/guidelines/TAE/test-design-principles.md` -- TC identity rule, ATC conventions, naming
- `.context/guidelines/QA/jira-test-management.md` -- Jira-specific test management
- `.context/guidelines/QA/spec-driven-testing.md` -- Spec-driven testing principle
- `.context/guidelines/TAE/tms-integration.md` -- KATA-to-TMS sync implementation

---

**Last Updated**: 2026-04-12