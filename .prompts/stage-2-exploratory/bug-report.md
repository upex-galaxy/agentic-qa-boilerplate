# Bug Report

> AI-guided bug identification, retest, and Jira/Xray reporting.

---

## Purpose

Identify, validate, and report defects found during exploratory testing. This prompt helps the AI:

1. **Retest the bug** to confirm it's reproducible
2. **Document the defect** with proper evidence
3. **Create the bug in Jira** using Atlassian MCP

**Prerequisites:**

- Bug identified during exploratory testing
- Access to Playwright MCP tools (`mcp__playwright__*`)
- Access to Atlassian MCP tools (`mcp__atlassian__*`)

---

## Workflow

### Phase 1: Bug Confirmation

**Before reporting, confirm the bug is real.**

**Ask the user:**

```
I found a potential issue during exploration:

[Brief description of the issue]

Would you like me to:
1. Retest the bug to confirm it's reproducible
2. Skip retest and proceed to documentation
3. Dismiss this as not a bug
```

---

### Phase 2: Retest (If Requested)

**Determine retest approach based on bug type:**

| Bug Type     | Retest Method                         |
| ------------ | ------------------------------------- |
| **UI Bug**   | Use Playwright MCP to reproduce steps |
| **API Bug**  | Use API calls or network observation  |
| **Data Bug** | Query database or verify via API      |

**For UI Retest:**

```
Tools:
- mcp__playwright__browser_navigate
- mcp__playwright__browser_snapshot
- mcp__playwright__browser_click
- mcp__playwright__browser_type
- mcp__playwright__browser_take_screenshot
```

**Document retest results:**

```markdown
## Retest Results

**Attempt 1:**

- Steps executed: [1, 2, 3...]
- Result: [Reproduced / Not Reproduced]
- Evidence: [Screenshot if applicable]

**Attempt 2 (if needed):**

- Result: [Reproduced / Not Reproduced]

**Conclusion:** [Bug confirmed / Could not reproduce]
```

---

### Phase 3: Bug Documentation

**Gather complete information:**

```markdown
## Bug Details

**Title:** [Clear, descriptive title]

**Severity:**

- [ ] Critical - Blocks core functionality, no workaround
- [ ] High - Major feature broken, difficult workaround
- [ ] Medium - Feature issue, easy workaround exists
- [ ] Low - Cosmetic issue, doesn't affect functionality

**Environment:**

- URL: [Staging URL where bug occurs]
- Browser: [Chrome/Firefox/Safari + version]
- OS: [Windows/Mac/Linux]
- User Role: [Admin/User/Guest]

**Steps to Reproduce:**

1. [Detailed step 1]
2. [Detailed step 2]
3. [Detailed step 3]
4. [Observe the bug]

**Expected Behavior:**
[What should happen according to requirements]

**Actual Behavior:**
[What actually happens]

**Evidence:**

- Screenshot: [Attached/Reference]
- Console Errors: [If any]
- Network Errors: [If any]

**Additional Notes:**
[Any relevant context]
```

---

### Phase 4: Human Confirmation

**CRITICAL: Always confirm with the user before creating in Jira.**

```
I've documented the following bug:

**Title:** [Title]
**Severity:** [Severity]
**Summary:** [Brief description]

Do you want me to:
1. Create this bug in Jira (Simple - default fields)
2. Create this bug in Jira (Complete - with Custom Fields)
3. Show me the full bug report first
4. Don't create, just save the documentation
```

---

### Phase 5: Create in Jira

**Use Atlassian MCP to create the bug.**

#### Option 1: Simple Bug Report

Uses default Jira fields:

```
Tool: mcp__atlassian__create_issue

Fields:
- project: [Project Key]
- issueType: "Bug"
- summary: [Title]
- description: [Full description in Jira markdown]
- priority: [Maps from severity]
- labels: ["bug", "exploratory-testing", "STORY-XXX"]
```

#### Option 2: Complete Bug Report (Custom Fields)

**First, identify available Custom Fields:**

```
Tool: mcp__atlassian__get_issue_metadata

Purpose: Get the schema for Bug issue type including custom fields
```

**Common Custom Fields to populate:**

| Custom Field        | Description        | Example Value     |
| ------------------- | ------------------ | ----------------- |
| `customfield_XXXXX` | Environment        | "Staging"         |
| `customfield_XXXXX` | Browser            | "Chrome 120"      |
| `customfield_XXXXX` | Steps to Reproduce | [Formatted steps] |
| `customfield_XXXXX` | Expected Result    | [Text]            |
| `customfield_XXXXX` | Actual Result      | [Text]            |
| `customfield_XXXXX` | Affected Version   | "1.2.0"           |

**Note:** Custom field IDs vary by Jira project. The AI should query the project metadata to identify available fields.

---

### Phase 6: Post-Creation

**After creating the bug:**

1. **Confirm creation** with user:

   ```
   Bug created successfully!

   Issue Key: [BUG-XXX]
   URL: [Jira URL]

   The bug has been linked to the related story [STORY-XXX].
   ```

2. **Link to related story** (if applicable):

   ```
   Tool: mcp__atlassian__add_comment

   Add comment to the original story:
   "Bug found during exploratory testing: [BUG-XXX] - [Title]"
   ```

3. **Update session notes** with bug reference

---

## Bug Report Template (Jira Description)

```markdown
h2. Summary
[Brief description of the bug]

h2. Environment

- _URL:_ [URL]
- _Browser:_ [Browser + version]
- _OS:_ [OS]
- _User Role:_ [Role]

h2. Steps to Reproduce

# [Step 1]

# [Step 2]

# [Step 3]

# Observe the bug

h2. Expected Behavior
[What should happen]

h2. Actual Behavior
[What actually happens]

h2. Evidence
[Screenshots, console errors, network logs]

h2. Additional Context

- _Related Story:_ [STORY-XXX]
- _Found During:_ Exploratory Testing
- _Reproducible:_ Yes/No/Intermittent
```

---

## Severity Guidelines

| Severity     | Criteria                                             | Examples                                          |
| ------------ | ---------------------------------------------------- | ------------------------------------------------- |
| **Critical** | Core functionality blocked, no workaround, data loss | Login broken, checkout fails, data corruption     |
| **High**     | Major feature broken, workaround is difficult        | Search returns wrong results, form doesn't submit |
| **Medium**   | Feature issue with easy workaround                   | Sorting doesn't work, but filtering does          |
| **Low**      | Cosmetic, doesn't affect functionality               | Typo, alignment issue, minor UI glitch            |

---

## Best Practices

1. **One bug per report** - Don't combine multiple issues
2. **Be specific** - Exact steps, exact data used
3. **Include evidence** - Screenshots are worth 1000 words
4. **Check for duplicates** - Search Jira before creating
5. **Confirm severity** - Don't over/under-estimate impact
6. **Always confirm with human** - Avoid false positives

---

## Output

- Bug documented with full details
- Bug created in Jira (if confirmed by user)
- Related story updated with bug reference
- Session notes updated with bug information
