# Stage 3: Test Documentation

> **Purpose**: Document test cases in Jira/Xray AFTER the feature has passed exploratory testing.
> **When to use**: When US status is "QA Approved" and test cases need formal documentation.

## Overview

Test Documentation is the asynchronous process of formalizing test cases in Jira/Xray for traceability and regression management.

**Why this stage exists:**

- Features are validated first (rapid feedback)
- Documentation happens when feature is stable
- Tests are documented for regression (manual or automated)
- Clear traceability between requirements and tests

**Benefits:**
- Formal test case management in Jira/Xray
- Clear automation vs manual classification
- Risk-based prioritization
- Traceability to requirements

## Prompts in This Stage

| Order | Prompt                   | Purpose                                   | Output                  |
| ----- | ------------------------ | ----------------------------------------- | ----------------------- |
| 1     | `test-analysis.md`       | Analyze candidates for regression testing | Analysis report         |
| 2     | `test-prioritization.md` | Prioritize which tests to document        | Prioritization report   |
| 3     | `test-documentation.md`  | Create Test issues in Jira/Xray           | Test issues in Xray     |

## Prerequisites

- US status: "QA Approved" (exploratory testing passed)
- Exploratory session notes with validated scenarios
- Access to Atlassian MCP tools

## Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TEST DOCUMENTATION WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────────┐
         │  US Status: QA Approved                 │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  1. test-analysis.md                    │
         │     - Review exploratory findings       │
         │     - Identify scenarios for regression │
         │     - Classify: automatable vs manual   │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  2. test-prioritization.md              │
         │     - Apply risk-based prioritization   │
         │     - Determine which tests go to       │
         │       regression                        │
         │     - Mark automation candidates        │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  3. test-documentation.md               │
         │     - Create Test issues in Xray        │
         │     - Format: Gherkin (recommended)     │
         │       or Traditional                    │
         │     - Link to related User Story        │
         └────────────────┬────────────────────────┘
                          │
                          ▼
         ┌─────────────────────────────────────────┐
         │  Output: Test cases documented in Xray  │
         │     - Some marked for automation        │
         │       → Stage 4                         │
         │     - Some marked manual-only           │
         │       → Manual regression               │
         └─────────────────────────────────────────┘
```

## Test Case Classification

| Type            | Description                  | Next Step             |
| --------------- | ---------------------------- | --------------------- |
| **Automatable** | Can be automated with KATA   | → Stage 4: Automation |
| **Manual-only** | Requires human judgment      | → Manual regression   |
| **Deferred**    | Low priority, document later | → Backlog             |

## Xray Test Issue Type

**Required fields:**

- Issue Type: `Test` (Custom Issue Type)
- Summary: Clear test case name
- Description: Test case in Gherkin or Traditional format
- Custom Field: `Test Status` (New, Automated, Manual)
- Labels: `regression`, `automation-candidate`, etc.
- Link: Related User Story

## Test Case Formats

### Gherkin (KATA Standard - Recommended)

```gherkin
Feature: User Login

Scenario: Successful login with valid credentials
  Given I am on the login page
  When I enter valid email "user@example.com"
  And I enter valid password "Password123!"
  And I click the submit button
  Then I should be redirected to the dashboard
  And I should see a welcome message

Scenario Outline: Login with invalid credentials
  Given I am on the login page
  When I enter email "<email>"
  And I enter password "<password>"
  And I click the submit button
  Then I should see an error message "<error>"

  Examples:
    | email              | password    | error                    |
    | invalid            | Password1!  | Invalid email format     |
    | user@example.com   | wrong       | Invalid credentials      |
    | user@example.com   |             | Password is required     |
```

### Traditional Format (Alternative)

| Step | Action                 | Test Data          | Expected Result         |
| ---- | ---------------------- | ------------------ | ----------------------- |
| 1    | Navigate to login page | -                  | Login form is displayed |
| 2    | Enter email            | <user@example.com> | Email field populated   |
| 3    | Enter password         | Password123!       | Password field masked   |
| 4    | Click submit           | -                  | Redirect to dashboard   |

## Tools Required

| Tool                                               | Purpose                 |
| -------------------------------------------------- | ----------------------- |
| `mcp__atlassian__createJiraIssue`            | Create Test issues      |
| `mcp__atlassian__getJiraIssue`               | Get Test issue schema   |
| `mcp__atlassian__addJiraComment`             | Link to related stories |

## Output

- Test cases created in Xray as "Test" issue type
- Tests linked to related User Stories
- Tests classified (automation candidate vs manual)
- Ready for automation (Stage 4) or manual regression

## Next Stage

For tests marked as **automation candidates**:

- Proceed to **Stage 4: Test Automation**
- Implement ATCs following KATA architecture

---

**Related**: [Stage 2 - Exploratory](../stage-2-exploratory/) | [Stage 4 - Automation](../stage-4-automation/)
