# Jira Test Management Guidelines

> **For**: QA Engineers
> **Stage**: 3 (Test Documentation)
> **Purpose**: Standards for test management in Jira

---

## Central Principle

Test Management in Jira begins **AFTER** a functionality is **stable and functional**. The objective is to:

1. **Document** the tests validated during exploratory testing
2. **Trace** tests to user stories
3. **Prepare** tests for automation

---

## When to Create Tests in Jira

| Moment                      | Action                           |
| --------------------------- | -------------------------------- |
| Feature explored and stable | Create Test issues               |
| Feature with critical bugs  | Wait for fixes first             |
| Before exploring            | Don't document before validating |

**Rule**: Only document tests for functionalities that have already passed QA Approved.

---

## Issue Type: Test

### Jira Configuration

Create a custom Issue Type called **Test** with the following fields:

| Field                | Type         | Purpose                                                     |
| -------------------- | ------------ | ----------------------------------------------------------- |
| Summary              | Text         | Clear test case name                                        |
| Description          | Long text    | Test steps (Gherkin or traditional)                         |
| Test Status          | Select list  | `New`, `Designed`, `Review`, `Ready`, `Automated`, `Manual` |
| Automation Candidate | Checkbox     | Is it a candidate for automation?                           |
| Priority             | Select list  | `Critical`, `High`, `Medium`, `Low`                         |
| Labels               | Multi-select | `regression`, `smoke`, `e2e`, `integration`                 |

---

## Test Workflow in Jira

```
┌─────────┐    ┌──────────┐    ┌────────┐    ┌───────┐    ┌───────────┐
│   New   │ → │ Designed │ → │ Review │ → │ Ready │ → │ Automated │
└─────────┘    └──────────┘    └────────┘    └───────┘    └───────────┘
                                   │                           ↑
                                   │         ┌────────┐        │
                                   └────────→│ Manual │────────┘
                                             └────────┘    (if not automated)
```

### States

| State         | Description                | Next step                    |
| ------------- | -------------------------- | ---------------------------- |
| **New**       | Newly created test         | Write steps                  |
| **Designed**  | Steps documented           | Peer review                  |
| **Review**    | Under review by another QA | Approve or reject            |
| **Ready**     | Approved, ready to use     | Decide: Automate?            |
| **Automated** | Test automated in KATA     | Runs in CI                   |
| **Manual**    | Test stays manual          | Include in manual regression |

---

## Traceability

### Link Structure

Each Test must be connected to:

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
| Test | Bug        | "is blocked by" (if applies) |
| Test | Epic       | Via the story                |

---

## Test Case Format

### Option 1: Gherkin (Recommended for KATA)

```gherkin
Feature: User Login

Scenario: Successful login with valid credentials
  Given I am on the login page
  When I enter email "user@example.com"
  And I enter password "Password123!"
  And I click the submit button
  Then I should be redirected to the dashboard
  And I should see a welcome message

Scenario Outline: Failed login with invalid credentials
  Given I am on the login page
  When I enter email "<email>"
  And I enter password "<password>"
  And I click the submit button
  Then I should see the error message "<error>"

  Examples:
    | email            | password   | error                    |
    | invalid          | Pass123!   | Invalid email format     |
    | user@example.com | incorrect  | Invalid credentials      |
```

### Option 2: Traditional Format

| Step | Action             | Test Data        | Expected Result       |
| ---- | ------------------ | ---------------- | --------------------- |
| 1    | Navigate to /login | -                | Form visible          |
| 2    | Enter email        | user@example.com | Field populated       |
| 3    | Enter password     | Password123!     | Field masked          |
| 4    | Click Submit       | -                | Redirect to dashboard |

---

## Test Plan

### Structure by Sprint

In theory, each sprint has its own Test Plan:

```
Sprint 10 - Test Plan
├── TEST-101: Login with valid credentials
├── TEST-102: Login with invalid credentials
├── TEST-103: New user registration
└── TEST-104: Password recovery
```

### Test Repository (Permanent Epic)

In practice, maintain a **permanent Epic** as repository:

```
EPIC: Test Repository (always In Progress)
├── TEST-001: [Smoke] Basic login
├── TEST-002: [Smoke] Main navigation
├── TEST-003: [Regression] Complete checkout
├── TEST-004: [Regression] User profile
└── ... (tests added continuously)
```

**Benefits:**

- Epic never closes
- Easy to find all tests
- Tests added incrementally
- Connected to CI for results

---

## Automation Analysis

### Criteria for Automation

| Factor         | Automate             | Keep Manual             |
| -------------- | -------------------- | ----------------------- |
| **Frequency**  | Execute frequently   | One-time only           |
| **Stability**  | Stable flow          | Changing flow           |
| **Complexity** | Repetitive steps     | Requires human judgment |
| **Risk**       | High impact if fails | Low risk                |
| **ROI**        | High value vs effort | Effort > benefit        |

### Marking in Jira

For tests that are automation candidates:

- Checkbox: `Automation Candidate = Yes`
- Label: `automation-candidate`
- Comment: Reason why it should be automated

---

## CI/CD Integration

### Xray Cloud (Premium)

If the project uses Xray:

1. Tests in Jira have Xray `Test` type
2. Results are imported automatically
3. See `../TAE/tms-integration.md` for configuration

### Jira Direct (Budget-Friendly)

If there is NO Xray:

1. Custom field `Test Status` with values: PASS/FAIL/BLOCKED
2. Results updated via Jira API
3. Comments with execution details

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

## Test Prioritization

### Risk Matrix

| Impact ↓ / Probability → | High          | Medium      | Low           |
| ------------------------ | ------------- | ----------- | ------------- |
| **High**                 | P1 - Critical | P2 - High   | P3 - Medium   |
| **Medium**               | P2 - High     | P3 - Medium | P4 - Low      |
| **Low**                  | P3 - Medium   | P4 - Low    | P5 - Optional |

### Priority Labels

| Label         | Meaning               | Action                 |
| ------------- | --------------------- | ---------------------- |
| `smoke`       | Smoke test, essential | Always execute         |
| `regression`  | Full regression       | Execute before release |
| `e2e`         | Critical end-to-end   | Automate first         |
| `integration` | System integration    | Automate               |
| `manual-only` | Not automatable       | Manual regression      |

---

## Best Practices

### DO

- Create tests **AFTER** feature is stable
- Link tests to User Stories
- Use Gherkin format for automatable tests
- Clearly mark automation candidates
- Include test data in test cases
- Keep repository epic updated

### DON'T

- Create tests before exploring functionality
- Tests without traceability to requirements
- Generic tests without clear steps
- Duplicate tests for the same functionality
- Forget to update status after automating

---

## Xray CLI Commands

The Xray CLI is available in `cli/xray.ts`:

| Command                             | Use                     |
| ----------------------------------- | ----------------------- |
| `bun xray auth`                     | Authenticate with Xray  |
| `bun xray test list`                | List all tests          |
| `bun xray test get PROJECT-123`     | Get test details        |
| `bun xray test create`              | Create new test         |
| `bun xray test update PROJECT-123`  | Update test status      |
| `bun xray results import`           | Import test results     |
| `bun xray execution create`         | Create test execution   |

See `.context/jira-platform.md` for full CLI documentation.

---

## MCP Tools

### Atlassian MCP

| Tool                                               | Use                |
| -------------------------------------------------- | ------------------ |
| `mcp__atlassian__createJiraIssue`                  | Create Test issues |
| `mcp__atlassian__getJiraIssue`                     | Read story details |
| `mcp__atlassian__addCommentToJiraIssue`            | Add results        |
| `mcp__atlassian__getJiraProjectIssueTypesMetadata` | Get Test schema    |

See `.context/guidelines/MCP/atlassian.md` for more details.

---

## Complete Flow

```
1. EXPLORE (Stage 2)
   └── Validate functionality
   └── Identify scenarios

2. ANALYZE (Stage 3 - step 1)
   └── Review session notes
   └── Classify: automatable vs manual

3. PRIORITIZE (Stage 3 - step 2)
   └── Apply risk matrix
   └── Order by priority

4. DOCUMENT (Stage 3 - step 3)
   └── Create Test issues in Jira
   └── Link to stories
   └── Mark automation candidates

5. AUTOMATE (Stage 4)
   └── Implement ATCs in KATA
   └── Update status in Jira via CLI or sync
```

---

## See Also

- `.context/guidelines/QA/spec-driven-testing.md` - SDT principle
- `.context/guidelines/QA/exploratory-testing.md` - Exploratory testing
- `.context/guidelines/TAE/tms-integration.md` - TMS integration
- `.context/jira-platform.md` - Jira platform documentation
- `.prompts/stage-3-documentation/` - Documentation prompts
- `.prompts/us-qa-workflow.md` - Complete QA workflow

---

**Last Updated**: 2026-02-12
