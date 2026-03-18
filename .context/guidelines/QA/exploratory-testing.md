# Exploratory Testing Guidelines

> **For**: QA Engineers
> **Stage**: 2 (Exploratory Testing)
> **Purpose**: Standards for performing effective exploratory testing

---

## Central Principle

Exploratory Testing validates functionality **BEFORE** investing in automation. It is an active exploration process where the QA:

1. **Explores** the functionality with a critical eye
2. **Documents** findings in real-time
3. **Decides** if the functionality is ready for production

---

## When to Perform Exploratory Testing

| Trigger                      | Scope                  | Objective           |
| ---------------------------- | ---------------------- | ------------------- |
| User Story in "Ready for QA" | Individual story       | Validate ACs        |
| Feature deployed to staging  | Epic/Complete feature  | Comprehensive validation |
| Hotfix deployed              | Affected area          | Quick regression    |
| Release candidate            | Complete application   | Smoke + Sanity      |

---

## Prerequisites

Before starting an exploratory testing session:

- [ ] Feature deployed in staging
- [ ] Access to staging URL
- [ ] Acceptance Criteria or Test Cases available
- [ ] Playwright MCP connected (recommended)
- [ ] Jira/Atlassian MCP connected (for creating bugs)

---

## MCP Tools

### Playwright MCP (Recommended)

Use Playwright MCP to explore the application systematically:

| Tool                                       | Use                              |
| ------------------------------------------ | -------------------------------- |
| `mcp__playwright__browser_navigate`        | Navigate to pages                |
| `mcp__playwright__browser_snapshot`        | Capture page structure           |
| `mcp__playwright__browser_click`           | Interact with elements           |
| `mcp__playwright__browser_type`            | Fill form fields                 |
| `mcp__playwright__browser_take_screenshot` | Capture visual evidence          |

**Typical flow with Playwright MCP:**

```
1. browser_navigate → Go to page
2. browser_snapshot → Understand structure
3. browser_click / browser_type → Execute actions
4. browser_take_screenshot → Capture evidence
5. Repeat for each scenario
```

See `.context/guidelines/MCP/playwright.md` for more details.

---

## Exploratory Testing Flow

```
┌─────────────────────────────────────────┐
│     STAGE 2: EXPLORATORY TESTING        │
├─────────────────────────────────────────┤
│ 1. Smoke Test (quick validation)        │
│    └── Do the basics work?              │
│                                         │
│ 2. Guided Exploration                   │
│    └── Follow ACs or Test Cases         │
│    └── Document findings                │
│                                         │
│ 3. Edge Cases Exploration               │
│    └── Empty inputs, limits             │
│    └── Alternative flows                │
│                                         │
│ 4. Bug Reporting (if any)               │
│    └── Confirm reproducibility          │
│    └── Create in Jira                   │
│                                         │
│ 5. Final Decision                       │
│    └── PASSED → QA Approved             │
│    └── FAILED → Wait for fixes          │
└─────────────────────────────────────────┘
```

---

## Exploration Techniques

### 1. Happy Path Testing

Validate the main flows according to Acceptance Criteria:

```markdown
Scenario: Successful login

1. Navigate to /login
2. Enter valid email
3. Enter valid password
4. Click Submit
   ✓ Result: Redirect to dashboard
```

### 2. Boundary Testing

Test limits and extreme conditions:

| Input      | Values to Test                              |
| ---------- | ------------------------------------------- |
| Text fields | Empty, 1 char, maximum, > maximum          |
| Numbers    | 0, -1, MAX_INT, decimals                    |
| Dates      | Past, today, future, invalid                |
| Emails     | Valid format, invalid, with special chars   |

### 3. Negative Testing

Test how the application handles errors:

```markdown
Negative scenarios:

- Login with invalid credentials
- Submit form without required fields
- Access protected pages without auth
- Operations with non-existent data
```

### 4. State Testing

Test behavior in different states:

- Page refresh in the middle of flow
- Browser "Back" button
- Multiple tabs with same session
- Session timeout

### 5. Security Quick Checks

Basic security validations:

- SQL Injection: `'; DROP TABLE users; --`
- XSS: `<script>alert('xss')</script>`
- Direct access to protected URLs
- Sensitive data exposure in console

---

## Session Documentation

During exploration, document in real-time:

```markdown
## Session Notes - [Feature/Story]

**Date:** YYYY-MM-DD
**Duration:** X minutes
**URL:** [staging URL]

### Scenarios Tested

#### 1. [Scenario name] - ✅ PASSED

- Action: [what I did]
- Result: [what happened]
- Notes: [observations]

#### 2. [Scenario name] - ❌ FAILED

- Action: [what I did]
- Expected: [what should have happened]
- Actual: [what happened]
- Evidence: [screenshot]

### Issues Found

1. **[Bug title]**
   - Severity: Critical/High/Medium/Low
   - Steps: [reproduction]
   - Evidence: [screenshot]

### General Observations

- [What worked well]
- [Areas of concern]
- [Improvement suggestions]
```

---

## Decision Criteria

### PASSED (QA Approved)

- ✅ All Acceptance Criteria validated
- ✅ No critical or high bugs
- ✅ UX is acceptable
- ✅ Performance is acceptable

### PASSED with Issues

- ✅ Core functionality works
- ⚠️ Minor bugs found
- → Create bugs in Jira
- → Continue to documentation

### FAILED

- ❌ Critical bugs found
- ❌ ACs not met
- → Report and wait for fixes
- → DO NOT continue to documentation

---

## Best Practices

### DO

- ✅ **Explore, don't just execute** - Look for unexpected behaviors
- ✅ **Document in real-time** - Don't wait until the end
- ✅ **Take screenshots** - Visual evidence is invaluable
- ✅ **Review console/network** - Hidden errors appear there
- ✅ **Think like a user** - What would confuse a real user?
- ✅ **Time-box exploration** - Don't spend infinite time on one area

### DON'T

- ❌ **Don't automate before exploring** - Validate first
- ❌ **Don't ignore edge cases** - That's where bugs live
- ❌ **Don't assume it "works"** - Verify everything
- ❌ **Don't create bugs without reproducing** - Confirm before reporting

---

## Integration with QA Flow

Exploratory Testing is the **first step** of the QA flow:

```
Stage 2: Exploratory Testing
    ↓
    (PASSED)
    ↓
Stage 3: Test Documentation
    ↓
Stage 4: Test Automation
```

**See also:**

- `.context/guidelines/MCP/playwright.md` - Playwright MCP usage

---

## Stage Output

After completing exploratory testing:

1. **Session Notes** with all findings
2. **Bugs reported** in Jira (if any)
3. **Clear decision**: PASSED / FAILED
4. **State transition** in Jira (if PASSED)
5. **Candidate list** for documentation and automation

---

**Last Updated**: 2026-02-12
