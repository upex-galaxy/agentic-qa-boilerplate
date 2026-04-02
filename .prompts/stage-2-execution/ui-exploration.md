# Exploratory Testing Session

> AI-guided exploratory testing using Playwright MCP tools.

---

## Purpose

Execute exploratory testing on a deployed feature to validate functionality, discover edge cases, and identify potential defects before automation.

**This prompt is executed AFTER:**

- Smoke test passed (deployment is functional)
- Feature is deployed to staging

**Prerequisites:**

- Access to Playwright MCP tools (`mcp__playwright__*`)
- Staging URL accessible
- Test cases or acceptance criteria as input

---

## Input Required

### Option 1: Shift-Left Test Cases (Recommended)

If the project has Shift-Left Testing documentation:

```
Provide:
- Path to acceptance-test-plan.md file
- OR Jira issue with test cases in comments
- OR test cases directly in the prompt
```

### Option 2: Acceptance Criteria

If no Shift-Left documentation exists:

```
Provide:
- User Story ID (e.g., MYM-123)
- OR path to story.md file
- OR acceptance criteria directly in the prompt
```

### Option 3: Epic/Multiple Stories

For broader exploration:

```
Provide:
- Epic ID or multiple Story IDs
- Feature scope description
```

---

## Workflow

### Phase 1: Context Gathering

**Actions:**

1. **Read test requirements** from the provided input
2. **Identify key scenarios** to explore:
   - Happy paths (primary user flows)
   - Edge cases (boundary conditions)
   - Negative scenarios (error handling)
3. **Determine exploration scope:**
   - UI interactions to test
   - API calls to validate (via network observation)
   - Data flows to verify

**Output to user:**

```markdown
## Exploration Plan

**Feature:** [Feature name]
**Scope:** [US/Epic being tested]
**Staging URL:** [URL]

### Scenarios to Explore:

1. [Scenario 1 - Happy path]
2. [Scenario 2 - Edge case]
3. [Scenario 3 - Negative]
   ...

Shall I proceed with the exploration?
```

---

### Phase 2: UI Exploration (Playwright MCP)

**Tools to use:**

| Tool                                       | Purpose                 |
| ------------------------------------------ | ----------------------- |
| `mcp__playwright__browser_navigate`        | Navigate to pages       |
| `mcp__playwright__browser_snapshot`        | Capture page structure  |
| `mcp__playwright__browser_click`           | Interact with elements  |
| `mcp__playwright__browser_type`            | Fill form fields        |
| `mcp__playwright__browser_take_screenshot` | Capture visual evidence |

**For each scenario:**

1. **Navigate** to the starting point
2. **Capture snapshot** to understand the page structure
3. **Execute actions** step by step
4. **Observe results:**
   - Did the expected outcome occur?
   - Any unexpected behavior?
   - Console errors? (check via snapshot)
   - Network failures?
5. **Document findings** as you go

**Session Notes Format:**

```markdown
### Scenario: [Name]

**Steps Executed:**

1. [Action] → [Result]
2. [Action] → [Result]
3. [Action] → [Result]

**Outcome:** [PASSED / ISSUE FOUND]

**Notes:**

- [Observation 1]
- [Observation 2]
```

---

### Phase 3: Edge Case Testing

**Techniques to apply:**

1. **Boundary Testing:**
   - Empty inputs
   - Maximum length inputs
   - Special characters: `<script>`, `'; DROP TABLE`, etc.
   - Numeric boundaries (0, -1, MAX_INT)

2. **State Testing:**
   - Refresh page mid-flow
   - Back button behavior
   - Multiple tabs/sessions
   - Timeout scenarios

3. **Data Validation:**
   - Invalid email formats
   - Weak passwords
   - Duplicate submissions
   - Concurrent modifications

**Document each test:**

```markdown
### Edge Case: [Description]

**Input:** [What was tested]
**Expected:** [What should happen]
**Actual:** [What happened]
**Status:** [PASSED / FAILED / OBSERVATION]
```

---

### Phase 4: Session Summary

**Generate comprehensive notes:**

```markdown
# Exploratory Testing Session Notes

**Date:** [Date]
**Feature:** [Feature/US being tested]
**Staging URL:** [URL]
**Duration:** [Time spent]

---

## Executive Summary

- **Overall Status:** [PASSED / ISSUES FOUND / BLOCKED]
- **Scenarios Tested:** [X of Y]
- **Issues Found:** [Number]

---

## Scenarios Tested

### 1. [Scenario Name] - [PASSED/FAILED]

[Details...]

### 2. [Scenario Name] - [PASSED/FAILED]

[Details...]

---

## Issues Found

### Issue 1: [Title]

- **Severity:** [Critical/High/Medium/Low]
- **Steps to Reproduce:**
  1. [Step 1]
  2. [Step 2]
- **Expected:** [Expected behavior]
- **Actual:** [Actual behavior]
- **Evidence:** [Screenshot reference]

---

## Observations & Recommendations

### Positive Findings:

- [What worked well]

### Areas of Concern:

- [Potential issues to monitor]

### Recommendations for Automation:

- [Scenarios that should be automated]
- [Priority suggestions]

---

## Next Steps

- [ ] Report critical bugs (use bug-report.md)
- [ ] Transition US status if PASSED
- [ ] Proceed to Test Documentation phase (if applicable)
```

---

## Decision Point

After exploration, decide:

| Result           | Action                                                   |
| ---------------- | -------------------------------------------------------- |
| **PASSED**       | Transition US to "QA Approved", proceed to documentation |
| **ISSUES FOUND** | Use `bug-report.md` for each issue, wait for fixes       |
| **BLOCKED**      | Report blocker, do not proceed                           |

---

## Best Practices

1. **Explore, don't just execute** - Look for unexpected behaviors
2. **Document as you go** - Don't wait until the end
3. **Take screenshots** - Visual evidence is invaluable
4. **Check console/network** - Hidden errors often appear there
5. **Think like a user** - What would confuse a real user?
6. **Time-box exploration** - Don't spend infinite time on one area

---

## Integration with KATA

This exploratory testing phase feeds into:

1. **Bug Reports** - Issues found → `bug-report.md`
2. **Test Documentation** - Validated scenarios → Jira Test issues
3. **Automation Candidates** - Stable scenarios → ATCs

The goal is to validate functionality BEFORE investing in automation.

---

## Output

- Session notes with all findings
- List of issues (if any) ready for bug reporting
- Recommendations for test documentation and automation
