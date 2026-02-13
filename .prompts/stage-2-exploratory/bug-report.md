# Bug Report

> AI-guided bug identification, retest, and complete Jira reporting with Custom Fields.

---

## Purpose

Identify, validate, and report defects found during exploratory testing. This prompt helps the AI:

1. **Retest the bug** to confirm it's reproducible
2. **Document the defect** with proper evidence
3. **Create the bug in Jira** with ALL required custom fields
4. **Attach evidence files** (screenshots, logs, etc.)

**Prerequisites:**

- Bug identified during exploratory testing
- Access to Playwright MCP tools (`mcp__playwright__*`)
- Access to Atlassian MCP tools (`mcp__atlassian__*`)

**Important:** This prompt is primarily configured for the **UPEX Galaxy Jira Workspace**. The custom field IDs below are shared across all projects in this workspace. For external workspaces, see the **Fallback Strategy** section.

---

## Custom Fields Schema (UPEX Galaxy Workspace)

> **CRITICAL:** Use these exact field IDs when creating bugs. For non-UPEX workspaces, see the **Fallback Strategy** section.

### Required Fields

| Field ID            | Jira Field Name                   | Type     | What to Fill                                                                                                                                                    |
| ------------------- | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customfield_10109` | Actual Result (Behavior)          | Textarea | Describe exactly what happened (the bug behavior). Include error messages, unexpected UI states, or incorrect data shown.                                       |
| `customfield_10110` | Expected Result (Output)          | Textarea | Describe what SHOULD have happened according to requirements or standard UX patterns.                                                                           |
| `customfield_10112` | Error Type                        | Dropdown | `Functional`, `Visual`, `Content`, `Performance`, `Crash`, `Data`, `Integration`, `Security`                                                                    |
| `customfield_10116` | SEVERITY                          | Dropdown | `Critical`, `Major`, `Moderate`, `Minor`, `Trivial`                                                                                                             |
| `customfield_12210` | Test Environment                  | Dropdown | `Dev`, `QA`, `UAT`, `Staging`, `Production`                                                                                                                     |
| `customfield_10701` | Root Cause                        | Dropdown | `Code Error`, `Config/Env Error`, `Environment Error`, `Requirement Error`, `Working As Designed (WAD)`, `Third-Party Error`, `Integration Error`, `Data Error` |
| `customfield_10049` | Root Cause Text                   | Textarea | Technical analysis: file path, function name, API endpoint, or "Investigation needed" if unknown                                                                |

### Optional Fields

| Field ID            | Jira Field Name | Type     | When to Use                                                                                                                    |
| ------------------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `customfield_10111` | Workaround      | Textarea | Only if a temporary solution exists. Otherwise, omit.                                                                          |
| `customfield_10607` | EVIDENCE        | Textarea | Additional notes about evidence (e.g., "See attached screenshot", "Video in attachments"). Omit if using attachments parameter |
| `customfield_12212` | Fix             | Radio    | `Bugfix` (standard) or `Hotfix` (critical for immediate deploy). For normal bugs use `Bugfix`.                                 |
| N/A                 | Web Link        | URL      | Only if the bug relates to a specific external URL or documentation. Omit if not applicable.                                   |

### Dropdown Values Reference

**`customfield_10112` (Error Type) - Use exact string:**

```
"Functional"  → Feature doesn't work as specified or AC
"Visual"      → UI/UX: layout, styles, responsive, alignment
"Content"     → Incorrect text, typos, translations, missing content
"Performance" → Slowness, timeouts, memory leaks
"Crash"       → App crash, error 500, white screen, fatal exception
"Data"        → Incorrect data, calculation errors, inconsistency
"Integration" → External service failure, APIs, webhooks
"Security"    → Auth bypass, data exposure, XSS, CSRF, permissions
```

**`customfield_10116` (SEVERITY) - Use exact string:**

```
"Critical"  → Core functionality blocked, no workaround, blocks release
"Major"     → Main feature affected, difficult workaround, urgent fix
"Moderate"  → Functionality affected with easy workaround, next sprint
"Minor"     → Minor issue, limited impact, low priority
"Trivial"   → Cosmetic, very low impact, fix when there's time
```

**`customfield_12210` (Test Environment) - Use exact string:**

```
"Dev"        → Local development (localhost, 127.0.0.1)
"QA"         → Testing/QA environment, test data
"UAT"        → User Acceptance Testing, stakeholder validation
"Staging"    → Pre-production (staging.*, *-staging.*, preview URLs)
"Production" → Live production environment
```

**`customfield_10701` (Root Cause) - Use exact string:**

```
"Code Error"                → Bug in source code, incorrect logic
"Config/Env Error"          → Environment variables, configs, feature flags
"Environment Error"         → Infrastructure, server, deploy, CI/CD
"Requirement Error"         → Incorrect spec, ambiguous AC, missing requirement
"Working As Designed (WAD)" → Not a bug, works as intended
"Third-Party Error"         → Bug in external library, dependency, framework
"Integration Error"         → External service down, third-party API failed
"Data Error"                → Corrupted data in DB, failed migration
```

**`customfield_12212` (Fix) - Use exact string:**

```
"Bugfix" → Standard fix for normal bugs
"Hotfix" → Critical fix for immediate production deploy
```

---

## Error Handling for Custom Fields

### If a Custom Field Fails

When Jira returns an error about a custom field (e.g., "Field customfield_XXXXX does not exist"), the AI must:

1. **DO NOT** attempt to discover or query for alternative field IDs
2. **Inform the user** with this message:

```
Custom Field Error

The custom field `customfield_XXXXX` ([Field Name]) returned an error.
This may indicate the field was disabled or renamed in Jira.

Action Required:
Please notify the Jira Workspace Admin to verify:
1. Is the field `[Field Name]` still active in the Bug issue type?
2. What is the current custom field ID?

Once confirmed, update this prompt file:
.prompts/stage-2-exploratory/bug-report.md

I will proceed to create the bug WITHOUT this field for now.
```

3. **Create the bug anyway** with the fields that DO work
4. **Add a comment** to the created bug noting which field failed

### If Dropdown Value Fails

If a dropdown value is rejected (e.g., "Option 'X' is not valid"):

```
Dropdown Value Error

The value "[Value]" for field `[Field Name]` is not valid.
Available options may have changed in Jira.

Action Required:
Please ask the Jira Admin for current valid options for the field "[Field Name]".

Using fallback: I will set this field to the most generic option or omit it.
```

---

## Fallback Strategy (Non-UPEX Workspaces)

> This section applies when using this prompt in Jira workspaces OTHER than UPEX Galaxy.

The custom field IDs in this prompt are specific to UPEX Galaxy workspace. For other workspaces, apply this fallback strategy in order:

### Fallback 1: Search for Equivalent Field

When a custom field ID fails (e.g., `customfield_10116` doesn't exist), use `mcp__atlassian__jira_search_fields` to find the equivalent field:

```
# Search for the field by name
Tool: mcp__atlassian__jira_search_fields
{
  "keyword": "severity"  // or "root cause", "error type", etc.
}
```

If a matching field is found:

1. Use the discovered field ID for this session
2. Inform the user: "Using `customfield_XXXXX` for [Field Name] in this workspace"
3. Proceed with bug creation

### Fallback 2: Ask User to Define Fields

If no equivalent field is found via search:

```
Custom Field Not Found

The field "[Field Name]" (UPEX ID: `customfield_XXXXX`) doesn't exist in this workspace.

Options:
1. Tell me the correct custom field ID for this workspace
2. Skip this field and include the info in Description
3. Create the bug without this field

Which would you prefer?
```

Wait for user response before proceeding.

### Fallback 3: Include in Description

As a last resort, if the custom field cannot be resolved:

1. **Omit the custom field** from `additional_fields`
2. **Add the information to the Description** using this format:

```markdown
---

_ADDITIONAL FIELDS (Custom fields not available)_

- _Error Type:_ [Value]
- _Severity:_ [Value]
- _Root Cause:_ [Value]
- _Test Environment:_ [Value]
```

3. **Add a note to the user:**

```
Some custom fields were unavailable in this Jira workspace.
I've included that information in the bug description instead.
Consider asking your Jira Admin to add these fields for better tracking.
```

### Field Mapping Guide for Other Workspaces

| UPEX Field Name  | Common Alternative Names                        |
| ---------------- | ----------------------------------------------- |
| SEVERITY         | Severity, Bug Severity, Impact Level            |
| Error Type       | Bug Type, Defect Type, Issue Category           |
| Test Environment | Environment, Testing Environment, Found In      |
| Root Cause       | Root Cause Analysis, Cause Category, Bug Origin |
| Actual Result    | Actual Behavior, What Happened, Bug Description |
| Expected Result  | Expected Behavior, Should Be, Acceptance        |

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
- Evidence: [Screenshot path if captured]

**Attempt 2 (if needed):**

- Result: [Reproduced / Not Reproduced]

**Conclusion:** [Bug confirmed / Could not reproduce]
```

---

### Phase 3: Bug Documentation

**Gather ALL required information. If any data is missing, the AI must:**

1. Search for the answer in the conversation context
2. Infer from available information (e.g., test environment from URL)
3. Ask the user explicitly if cannot determine

**Required Data Checklist:**

```markdown
## Bug Details

**Title:** [Standard format: <EPICNAME>: <COMPONENT>: <ISSUE_SUMMARY>]
Example: "CheckoutFlow: Payment: Error message not shown for incorrect password"

**Error Type:** [Functional/Visual/Content/Performance/Crash/Data/Integration/Security]

**SEVERITY:** [Critical/Major/Moderate/Minor/Trivial]

**Test Environment:** [Dev/QA/UAT/Staging/Production]

**Steps to Reproduce:**

1. [Precondition - user state, login, etc.]
2. [Navigation step]
3. [Action that triggers bug]
4. [Observe the bug]

**Expected Result:**
[What should happen according to requirements or common UX patterns]

**Actual Result:**
[What actually happens - be specific about error messages, behaviors]

**Root Cause (Category):**
[Code Error/Config-Env Error/Environment Error/Requirement Error/WAD/Third-Party Error/Integration Error/Data Error]

**Root Cause (Text):**
[Technical analysis if available - file, function, API endpoint involved]

**Evidence Files:** (Optional)

- [Path to screenshot if user provides]
- [Path to video recording if available]
- [Path to log file if relevant]

**Workaround:** (Optional)
[If there's a temporary way to achieve the goal]
```

---

### Phase 4: Human Confirmation

**CRITICAL: Always confirm with the user before creating in Jira.**

```
I've documented the following bug:

**Title:** [Title]
**Error Type:** [Error Type]
**Severity:** [Severity]
**Environment:** [Environment]

**Summary:** [Brief description]

**Custom Fields to populate:**
- Actual Result: Ready
- Expected Result: Ready
- Error Type: Ready
- SEVERITY: Ready
- Test Environment: Ready
- Root Cause (Category): Ready
- Root Cause (Text): Ready
- Fix: Ready (Bugfix)
- Workaround: [Ready/N/A]
- Evidence: [Ready/N/A]

**Attachments:** [List files to attach or "None"]

Do you want me to:
1. Create this bug in Jira (Complete with all fields)
2. Show me the full bug report first
3. I need to provide more information
4. Don't create, just save the documentation
```

---

### Phase 5: Create in Jira

**Step 1: Create the issue with all custom fields**

Use the EXACT JSON structure below. Replace only the values in `[brackets]`:

```json
Tool: mcp__atlassian__jira_create_issue

{
  "project_key": "[PROJECT_KEY]",
  "summary": "[Format: <EPICNAME>: <COMPONENT>: <ISSUE_SUMMARY>]",
  "issue_type": "Bug",
  "description": "[See Jira Description Template below]",
  "additional_fields": {
    "priority": {"name": "[Highest|High|Medium|Low]"},
    "labels": ["bug", "exploratory-testing"],

    "customfield_10109": "[ACTUAL RESULT: What happened - the bug behavior]",
    "customfield_10110": "[EXPECTED RESULT: What should have happened]",
    "customfield_10112": {"value": "[Functional|Visual|Content|Performance|Crash|Data|Integration|Security]"},
    "customfield_10116": {"value": "[Critical|Major|Moderate|Minor|Trivial]"},
    "customfield_12210": {"value": "[Dev|QA|UAT|Staging|Production]"},
    "customfield_10701": {"value": "[Code Error|Config/Env Error|Environment Error|Requirement Error|Working As Designed (WAD)|Third-Party Error|Integration Error|Data Error]"},
    "customfield_10049": "[ROOT CAUSE TEXT: Technical analysis or 'Investigation needed']",

    "customfield_10111": "[WORKAROUND: Temporary solution - omit if none]",
    "customfield_10607": "[EVIDENCE: Notes about attachments - omit if using attachments parameter]",
    "customfield_12212": {"value": "Bugfix"}
  }
}
```

**Field Format Rules:**

- **Textarea fields** (`customfield_10109`, `10110`, `10049`, `10111`, `10607`): Plain string
- **Dropdown fields** (`customfield_10112`, `10116`, `10701`, `12210`, `12212`): Object with `{"value": "Option"}`
- **Omit optional fields** by not including them (don't set to `null`)

**Step 2: Attach evidence files (if user provided)**

```json
Tool: mcp__atlassian__jira_update_issue

{
  "issue_key": "[PROJ-XXX]",
  "fields": {},
  "attachments": "/absolute/path/to/file1.png,/absolute/path/to/file2.mp4"
}
```

**Attachment Rules:**

- Use **absolute paths** only (e.g., `/home/user/screenshots/bug.png`)
- Comma-separated for multiple files
- Supported formats: `.png`, `.jpg`, `.gif`, `.mp4`, `.log`, `.txt`, `.pdf`
- If user says "attach this file" or provides a path, use it here

**Priority Mapping (SEVERITY → Jira Priority):**

| SEVERITY   | priority.name |
| ---------- | ------------- |
| Critical   | Highest       |
| Major      | High          |
| Moderate   | Medium        |
| Minor      | Low           |
| Trivial    | Lowest        |

---

### Phase 6: Post-Creation

**After creating the bug:**

1. **Confirm creation** with user:

   ```
   Bug created successfully!

   Issue Key: [PROJ-XXX]
   URL: https://[workspace].atlassian.net/browse/[PROJ-XXX]

   All custom fields populated
   Attachments uploaded (if any)
   Ready for QA triage
   ```

2. **Link to related story** (if applicable):

   ```
   Tool: mcp__atlassian__jira_add_comment

   Add comment to the original story:
   "Bug found during exploratory testing: [PROJ-XXX] - [Title]"
   ```

3. **Assign to team member** (if specified):

   ```
   Tool: mcp__atlassian__jira_update_issue

   Parameters:
   - issue_key: "[PROJ-XXX]"
   - fields: {"assignee": "email@example.com"}
   ```

---

## Bug Report Template (Jira Description)

Use this format for the `description` field:

```
_SUMMARY_
[One-paragraph summary of the bug and its impact]

----

_STEPS TO REPRODUCE_

h4. [Step 1 - Precondition]

h4. [Step 2 - Navigation]

h4. [Step 3 - Action]

h4. [Step 4 - Observe bug]

----

_TECHNICAL ANALYSIS_

* _File:_ [File path if known]
* _Function:_ [Function/Component name]
* _Network:_ [API call info if relevant]
* _Console:_ [Error messages if any]

----

_IMPACT_

* [Who is affected]
* [What functionality is blocked]
* [Business impact if applicable]

----

_RELATED STORIES_

* Related: [STORY-XXX if applicable]
* Blocks: [Other issues blocked by this bug]
```

---

## Bug Naming Convention

**Standard format for Bug/Defect titles:**

```
<EPICNAME>: <COMPONENT>: <ISSUE_SUMMARY>
```

| Component       | Description                          |
| --------------- | ------------------------------------ |
| `EPICNAME`      | Name of the epic or system (SUT)     |
| `COMPONENT`     | Module where the error occurs        |
| `ISSUE_SUMMARY` | Brief description of the failure     |

**Examples:**

```
CheckoutFlow: Payment: Error message not shown for incorrect password
UserAuth: Login: Session expires without warning message
Dashboard: Charts: Sales chart shows incorrect data
API: Users: PUT /users/settings returns 500 on save
```

**Complete reference:** `.context/guidelines/QA/jira-test-management.md` → Section "Ticket Naming Convention in Jira"

---

## Severity Guidelines

| SEVERITY     | Criteria                                             | Impact             | Examples                                          |
| ------------ | ---------------------------------------------------- | ------------------ | ------------------------------------------------- |
| **Critical** | Core functionality blocked, no workaround, data loss | Blocks release     | Login broken, checkout fails, data corruption     |
| **Major**    | Major feature broken, workaround is difficult        | Affects many users | Search returns wrong results, form doesn't submit |
| **Moderate** | Feature issue with easy workaround                   | Secondary flow     | Sorting doesn't work, but filtering does          |
| **Minor**    | Minor issue, limited impact                          | Low priority       | Minor validation missing, edge case               |
| **Trivial**  | Cosmetic, very low impact                            | Fix when possible  | Typo, slight alignment, minor UI glitch           |

---

## Error Type Guidelines

| Error Type      | When to Use                            | Example                                |
| --------------- | -------------------------------------- | -------------------------------------- |
| **Functional**  | Feature doesn't work as specified      | Button doesn't execute expected action |
| **Visual**      | Layout, styling, responsive, UX issues | Misaligned elements, wrong colors      |
| **Content**     | Wrong text, typos, translations        | "Savr" instead of "Save"               |
| **Performance** | Slow loading, timeouts, memory leaks   | Page takes >5s to load                 |
| **Crash**       | App crash, error 500, white screen     | Server error, React white screen       |
| **Data**        | Incorrect calculations, corrupted data | Invoice total calculated wrong         |
| **Integration** | External API failures, webhooks        | Stripe API returns error               |
| **Security**    | Auth bypass, data exposure, XSS, CSRF  | User sees another user's data          |

---

## Handling Missing Information

**If the AI cannot determine a required field:**

1. **Error Type**: Infer from bug behavior:
   - Feature doesn't work → `Functional`
   - Display/layout issues → `Visual`
   - Wrong text shown → `Content`
   - Slow responses → `Performance`
   - App crashes/freezes → `Crash`
   - Calculation errors → `Data`
   - Third-party API fails → `Integration`
   - Auth/permission issues → `Security`

2. **Test Environment**: Infer from URL:
   - `localhost`, `127.0.0.1` → `Dev`
   - `qa.`, `-qa.` → `QA`
   - UAT environment → `UAT`
   - `staging.` or `-staging.` → `Staging`
   - Production domain → `Production`

3. **SEVERITY**: Infer from impact:
   - Blocks user flow completely → `Critical`
   - Major feature broken → `Major`
   - Has easy workaround → `Moderate`
   - Minor issue → `Minor`
   - Cosmetic only → `Trivial`

4. **Root Cause (Category)**: Infer from analysis:
   - Bug in code logic → `Code Error`
   - Config/env vars issue → `Config/Env Error`
   - Infra/deploy problem → `Environment Error`
   - Unclear/wrong requirement → `Requirement Error`
   - Not a bug, intentional → `Working As Designed (WAD)`
   - Bug in library/framework → `Third-Party Error`
   - External service failed → `Integration Error`
   - DB data corrupted → `Data Error`

5. **Root Cause (Text)**: If unknown, document what IS known:
   - "API endpoint returns 500 - server-side investigation needed"
   - "Component fails to render - React error in console"

6. **If truly cannot determine**: Ask the user explicitly:
   ```
   I need clarification on the following:
   - [Field]: [Why it's unclear and options to choose from]
   ```

---

## Best Practices

1. **One bug per report** - Don't combine multiple issues
2. **Be specific** - Exact steps, exact data used
3. **Include evidence** - Screenshots are worth 1000 words
4. **Check for duplicates** - Search Jira before creating
5. **Confirm severity** - Don't over/under-estimate impact
6. **Always confirm with human** - Avoid false positives
7. **Fill ALL custom fields** - Incomplete reports slow down triage
8. **Attach files when available** - Use the attachments parameter

---

## Quick Reference: MCP Tools

| Action                | Tool                                       |
| --------------------- | ------------------------------------------ |
| Create bug            | `mcp__atlassian__jira_create_issue`        |
| Update/attach files   | `mcp__atlassian__jira_update_issue`        |
| Add comment           | `mcp__atlassian__jira_add_comment`         |
| Search for duplicates | `mcp__atlassian__jira_search`              |
| Get issue details     | `mcp__atlassian__jira_get_issue`           |
| Transition status     | `mcp__atlassian__jira_transition_issue`    |
| Take screenshot       | `mcp__playwright__browser_take_screenshot` |

---

## Complete Example

Here's a real example of creating a bug with all fields:

```json
// Step 1: Create the bug
mcp__atlassian__jira_create_issue({
  "project_key": "SQ",
  "summary": "ClientManagement: AddClient: Email case-insensitive validation missing",
  "issue_type": "Bug",
  "description": "_SUMMARY_\nThe system allows creating duplicate clients when the email uses different capitalization (e.g., user@email.com vs USER@email.com).\n\n----\n\n_STEPS TO REPRODUCE_\n\nh4. Create client with email 'test@email.com'\n\nh4. Create another client with email 'TEST@email.com'\n\nh4. Observe that both clients are created without error\n\n----\n\n_TECHNICAL ANALYSIS_\n\n* _File:_ src/app/(app)/clients/page.tsx\n* _Function:_ handleSubmit\n* _Problem:_ Email comparison is case-sensitive\n\n----\n\n_IMPACT_\n\n* Users can accidentally create duplicate clients\n* Data inconsistency in the database",
  "additional_fields": {
    "priority": {"name": "High"},
    "labels": ["bug", "exploratory-testing", "clients"],
    "customfield_10109": "When trying to create a client with email 'TEST@email.com' when 'test@email.com' already exists, the system accepts it and creates a duplicate client.",
    "customfield_10110": "The system should detect that the email already exists (case-insensitive comparison) and show a warning message.",
    "customfield_10112": {"value": "Functional"},
    "customfield_10116": {"value": "Major"},
    "customfield_12210": {"value": "Staging"},
    "customfield_10701": {"value": "Code Error"},
    "customfield_10049": "The duplicate validation in handleSubmit function compares emails with === instead of using toLowerCase() for case-insensitive comparison.",
    "customfield_12212": {"value": "Bugfix"}
  }
})

// Step 2: Attach screenshot (if user provided one)
mcp__atlassian__jira_update_issue({
  "issue_key": "SQ-69",
  "fields": {},
  "attachments": "/home/user/screenshots/duplicate-email-bug.png"
})
```

---

## Output

- Bug documented with ALL required custom fields
- Bug created in Jira with complete information
- Evidence files attached (if provided)
- Related story updated with bug reference
- Issue assigned (if specified)

---

## Troubleshooting

| Issue                                    | Solution                                                          |
| ---------------------------------------- | ----------------------------------------------------------------- |
| "Field customfield_XXXXX does not exist" | Notify user to contact Jira Admin. Create bug without that field. |
| "Option 'X' is not valid for field"      | Check Dropdown Values Reference section. Use exact string.        |
| "Attachment file not found"              | Verify absolute path. Ask user to confirm file location.          |
| Bug created but some fields empty        | Check if field format is correct (string vs object).              |
| Cannot transition to next status         | Some transitions require specific fields filled. Check workflow.  |
