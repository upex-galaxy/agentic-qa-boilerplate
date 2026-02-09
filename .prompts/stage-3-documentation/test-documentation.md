# Test Documentation

> Create Test issues in Jira/Xray for regression testing.

---

## Purpose

Document prioritized test cases in Jira/Xray as "Test" issue type for traceability and regression management.

**This prompt is executed AFTER:**

- Test analysis completed
- Tests prioritized for regression

**Prerequisites:**

- Access to Atlassian MCP tools (`mcp__atlassian__*`)
- Jira project with Xray "Test" issue type configured
- Prioritized test list from previous steps

---

## Input Required

1. **Prioritized test list** - From test-prioritization.md
2. **Related User Story ID** - To link tests
3. **Format preference** - Ask user:

```
How would you like to document the test cases?

1. Gherkin format (KATA standard - recommended)
2. Traditional format (Steps | Data | Expected Result)
```

---

## Workflow

### Phase 1: Verify Xray Configuration

**Check Test issue type exists:**

```
Tool: mcp__atlassian__getJiraIssue

Verify:
- Issue type "Test" is available (Xray)
- Identify custom fields for Test issues
- Note the "Test Status" custom field ID
```

**Expected Custom Fields:**

| Field         | Purpose                  | Example Values           |
| ------------- | ------------------------ | ------------------------ |
| Test Status   | Automation status        | New, Automated, Manual   |
| Test Type     | E2E, Integration, Manual | e2e, integration, manual |
| Related Story | Link to US               | STORY-123                |

---

### Phase 2: Generate Test Case Content

**For each prioritized test, generate content in chosen format:**

#### Gherkin Format (Recommended)

```gherkin
Feature: [Feature Name]

  Background:
    Given I am a registered user
    And I am on the application

  @critical @automation-candidate
  Scenario: [Scenario Name]
    Given [precondition]
    When [action]
    And [additional action]
    Then [expected outcome]
    And [additional verification]

  @high @automation-candidate
  Scenario Outline: [Parameterized Scenario Name]
    Given [precondition]
    When I enter "<input_field>" with "<value>"
    Then I should see "<expected_result>"

    Examples:
      | input_field | value    | expected_result |
      | email       | valid@   | Success         |
      | email       | invalid  | Error message   |
```

#### Traditional Format

```markdown
## Test Case: [Test Name]

**Priority:** [Critical/High/Medium/Low]
**Type:** [E2E/Integration/Manual]
**Automation Status:** [Candidate/Manual-only]

### Preconditions

- User is logged in
- Test data is prepared

### Steps

| #   | Action             | Test Data | Expected Result         |
| --- | ------------------ | --------- | ----------------------- |
| 1   | Navigate to [page] | -         | Page loads successfully |
| 2   | Enter [field]      | [value]   | Field accepts input     |
| 3   | Click [button]     | -         | [Expected outcome]      |

### Postconditions

- [Cleanup actions if needed]
```

---

### Phase 3: Create Test Issues in Xray

**For each test case:**

```
Tool: mcp__atlassian__createJiraIssue (with Xray Test type)

Parameters:
{
  "project": "[PROJECT_KEY]",
  "issueType": "Test",
  "summary": "[ATC-XXX] [Test Case Name]",
  "description": "[Gherkin or Traditional content]",
  "labels": ["regression", "automation-candidate", "feature-name"],
  "customFields": {
    "testStatus": "New",
    "testType": "e2e"
  }
}
```

**Naming Convention:**

```
Summary: [ATC-XXX] [Verb] [Feature] [Scenario]

Examples:
- [ATC-001] Login with valid credentials
- [ATC-002] Validate password requirements
- [ATC-003] Handle expired session gracefully
```

---

### Phase 4: Link to Related Story

**After creating each Test issue:**

```
Tool: mcp__atlassian__addJiraComment

Add to the related User Story:
"Test case documented: [TEST-XXX] - [Test Name]"
```

**Or use issue linking if available:**

```
Link type: "is tested by"
Outward: User Story
Inward: Test issue
```

---

### Phase 5: Confirmation & Summary

**Present to user:**

```markdown
# Test Documentation Complete

## Tests Created in Xray

| Test ID  | Name                         | Type   | Status               |
| -------- | ---------------------------- | ------ | -------------------- |
| TEST-001 | Login with valid credentials | E2E    | Automation Candidate |
| TEST-002 | Password validation          | E2E    | Automation Candidate |
| TEST-003 | Visual alignment check       | Manual | Manual Only          |

## Summary

- **Total tests created:** [N]
- **Automation candidates:** [N]
- **Manual only:** [N]
- **Linked to:** [STORY-XXX]

## Next Steps

### For Automation Candidates:

Proceed to **Stage 4: Test Automation**

- TEST-001, TEST-002 ready for ATC implementation

### For Manual Tests:

Added to manual regression checklist

- TEST-003 requires human execution

Would you like me to proceed with automation for the candidate tests?
```

---

## Test Issue Template (Xray Description)

### Gherkin Template

```
h2. Test Case

{code:language=gherkin}
Feature: [Feature Name]

@[priority] @[automation-status]
Scenario: [Scenario Name]
  Given [precondition]
  When [action]
  Then [expected outcome]
{code}

h2. Metadata

* *Priority:* [Critical/High/Medium/Low]
* *Test Type:* [E2E/Integration/Manual]
* *Automation Status:* [Candidate/Automated/Manual-only]
* *Related Story:* [STORY-XXX]

h2. Notes

[Any additional context or considerations]
```

### Traditional Template

```
h2. Test Case: [Name]

h3. Preconditions
* [Precondition 1]
* [Precondition 2]

h3. Test Steps

||#||Action||Test Data||Expected Result||
|1|[Action 1]|[Data]|[Expected]|
|2|[Action 2]|[Data]|[Expected]|
|3|[Action 3]|[Data]|[Expected]|

h3. Metadata

* *Priority:* [Critical/High/Medium/Low]
* *Test Type:* [E2E/Integration/Manual]
* *Automation Status:* [Candidate/Automated/Manual-only]
* *Related Story:* [STORY-XXX]
```

---

## Labels Convention

| Label                                  | Meaning                   |
| -------------------------------------- | ------------------------- |
| `regression`                           | Part of regression suite  |
| `automation-candidate`                 | Should be automated       |
| `manual-only`                          | Cannot be automated       |
| `e2e`                                  | End-to-end test type      |
| `integration`                          | API integration test type |
| `critical` / `high` / `medium` / `low` | Priority                  |

---

## Output

- Test issues created in Xray
- Tests linked to related User Stories
- Clear automation status for each test
- Ready for Stage 4 (automation) or manual regression

---

## Post-Refactor Note

**PENDING:** This prompt needs further refinement:

- Specify exact Custom Field IDs for the project
- Define Test Status workflow transitions
- Add support for X-Ray specific fields (if using X-Ray)
