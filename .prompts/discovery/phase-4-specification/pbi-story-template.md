# PBI: Story Template

> **Phase**: 4 - Specification
> **Objective**: Create templates for user stories, bugs, and test artifacts

---

## 📥 Input Required

### From Previous Prompts:

- `.context/PBI/README.md` (backlog location)
- `.context/PRD/user-personas.md` (user types)
- `.context/SRS/functional-specs.md` (acceptance criteria format)

### From PM Tool Analysis:

- Existing story format (if any)
- Required fields
- Custom fields

---

## 🎯 Objective

Create standardized templates for:

1. User stories (new feature requests)
2. Bug reports (defect documentation)
3. Test artifacts (test plans, cases linked to stories)

These templates ensure consistency when creating new work items.

---

## 🔍 Discovery Process

### Step 1: Analyze Existing Patterns

**Actions:**

1. Fetch sample stories from backlog:

   ```
   # Using MCP
   jira issue list --project=PROJ --type=Story --order-by=created --limit=5

   # Using CLI
   jira issue list -p PROJ -t Story --plain | head -5
   ```

2. Check for existing templates in PM tool:
   - Jira: Project Settings → Issue Types → [Type] → Description Template
   - Azure DevOps: Project Settings → Process → Work Item Types

3. Identify required vs optional fields:
   ```
   # Check issue create screen
   jira issue createmeta --project=PROJ
   ```

**Output:**

- Current story format
- Required fields
- Custom fields used

### Step 2: Define Story Template

**Standard story structure:**

```
AS A [user type]
I WANT TO [action]
SO THAT [benefit]
```

**Acceptance criteria format:**

```
GIVEN [precondition]
WHEN [action]
THEN [expected result]
```

### Step 3: Define Bug Template

**Standard bug structure:**

```
Environment: [where it happened]
Steps to Reproduce: [numbered steps]
Expected: [what should happen]
Actual: [what actually happened]
Evidence: [screenshots, logs]
```

### Step 4: Create Test Artifact Templates

Templates for Phase 5+ integration:

- Test plan template
- Test case template
- Test execution template

---

## 📤 Output Generated

### Create Directory Structure

```bash
mkdir -p .context/PBI/templates
```

### Output 1: `.context/PBI/templates/user-story.md`

````markdown
# User Story Template

## Quick Create (Jira CLI)

```bash
jira issue create -p PROJECT_KEY -t Story \
  -s "[Feature]: Brief description" \
  -l "feature,sprint-X" \
  -b "$(cat <<'EOF'
## User Story

**As a** [user persona from PRD],
**I want to** [action/capability],
**So that** [business value/benefit].

## Acceptance Criteria

### AC1: [Scenario name]
- **Given** [precondition]
- **When** [action taken]
- **Then** [expected outcome]

### AC2: [Scenario name]
- **Given** [precondition]
- **When** [action taken]
- **Then** [expected outcome]

### AC3: [Scenario name]
- **Given** [precondition]
- **When** [action taken]
- **Then** [expected outcome]

## Technical Notes

- [ ] API changes required: [Yes/No]
- [ ] Database changes required: [Yes/No]
- [ ] UI changes required: [Yes/No]
- [ ] Dependencies: [List any blockers]

## Out of Scope

- [What this story does NOT include]

## Design/Mockups

[Link to Figma/design if available]

## Related Stories

- Blocked by: [PROJ-XXX]
- Related to: [PROJ-YYY]
EOF
)"
```
````

## Template Fields

| Field        | Required | Example                              |
| ------------ | -------- | ------------------------------------ |
| Summary      | Yes      | `[Feature]: User can reset password` |
| Description  | Yes      | Full story template above            |
| Story Points | No       | 3, 5, 8                              |
| Labels       | No       | `feature`, `frontend`                |
| Sprint       | No       | Current sprint                       |
| Assignee     | No       | Developer                            |

## User Personas Reference

Use personas from `.context/PRD/user-personas.md`:

| Persona        | Use When                 |
| -------------- | ------------------------ |
| [Primary User] | Customer-facing features |
| [Admin User]   | Administrative features  |
| [Guest User]   | Pre-login features       |

## Acceptance Criteria Guidelines

### Good AC Example

```
Given I am a logged-in user on the dashboard
When I click the "Export" button
Then a CSV file downloads containing my data from the last 30 days
And the filename includes today's date
```

### Bad AC Example

```
The export feature should work properly.
```

### AC Checklist

- [ ] Specific and measurable
- [ ] Testable (can be automated)
- [ ] Independent (doesn't assume other ACs)
- [ ] Business-focused (not technical implementation)

````

### Output 2: `.context/PBI/templates/bug-report.md`

```markdown
# Bug Report Template

## Quick Create (Jira CLI)

```bash
jira issue create -p PROJECT_KEY -t Bug \
  -s "[BUG]: Brief description of the issue" \
  -l "bug,needs-triage" \
  --priority "High" \
  -b "$(cat <<'EOF'
## Bug Summary

[One-line description of what's broken]

## Environment

| Aspect | Value |
|--------|-------|
| **Environment** | Production / Staging / Development |
| **Browser** | Chrome 120 / Firefox 121 / Safari 17 |
| **OS** | macOS 14 / Windows 11 / iOS 17 |
| **User Type** | Admin / Regular User / Guest |
| **Date/Time** | YYYY-MM-DD HH:MM UTC |

## Steps to Reproduce

1. Navigate to [URL]
2. Log in as [user type]
3. Click on [element]
4. Observe [behavior]

## Expected Behavior

[What should happen according to specs]

## Actual Behavior

[What actually happens]

## Evidence

### Screenshots
[Attach screenshots or paste image links]

### Console Logs
````

[Paste relevant console errors]

```

### Network Requests
```

[Paste relevant failed requests]

```

### Video Recording
[Link to Loom/screen recording if available]

## Impact Assessment

| Aspect | Value |
|--------|-------|
| **Severity** | Critical / High / Medium / Low |
| **Users Affected** | All / Specific segment / Single user |
| **Workaround** | Yes (describe) / No |
| **Frequency** | Always / Sometimes / Rarely |

## Regression

- [ ] This worked before (version/date: ___)
- [ ] This never worked
- [ ] Unknown

## Related Issues

- Possibly related to: [PROJ-XXX]
- Duplicate of: [PROJ-YYY] (if applicable)

## Additional Context

[Any other relevant information]
EOF
)"
```

## Bug Severity Guide

| Severity     | Criteria                            | Example                            |
| ------------ | ----------------------------------- | ---------------------------------- |
| **Critical** | System down, data loss, security    | Cannot login, payment fails        |
| **High**     | Major feature broken, no workaround | Cannot create orders               |
| **Medium**   | Feature impaired, workaround exists | Filter not working, can use search |
| **Low**      | Minor issue, cosmetic               | Typo, alignment issue              |

## Required Fields Checklist

- [ ] Clear, descriptive summary
- [ ] Steps to reproduce (numbered)
- [ ] Expected vs Actual behavior
- [ ] Environment details
- [ ] At least one piece of evidence
- [ ] Severity assessment

````

### Output 3: `.context/PBI/templates/test-plan.md`

```markdown
# Test Plan Template

> **For Story**: [PROJ-XXX]
> **Story Title**: [Title]
> **Sprint**: [Sprint Name]

---

## Story Summary

[Paste or summarize the user story]

### Acceptance Criteria Reference

| AC# | Description | Test Cases |
|-----|-------------|------------|
| AC1 | [Summary] | TC-001, TC-002 |
| AC2 | [Summary] | TC-003 |
| AC3 | [Summary] | TC-004, TC-005 |

---

## Test Scope

### In Scope
- [ ] [Feature/component to test]
- [ ] [Feature/component to test]

### Out of Scope
- [ ] [What won't be tested and why]

---

## Test Approach

### Test Types Required

| Type | Required | Reason |
|------|----------|--------|
| Functional | ✅ | Verify ACs |
| UI/UX | ✅ | New UI components |
| API | [Yes/No] | [Reason] |
| Performance | [Yes/No] | [Reason] |
| Security | [Yes/No] | [Reason] |
| Accessibility | [Yes/No] | [Reason] |

### Test Environments

| Environment | URL | Purpose |
|-------------|-----|---------|
| Local | localhost:3000 | Development testing |
| Staging | staging.example.com | Integration testing |
| Production | example.com | Smoke test only |

---

## Test Data Requirements

| Data | Source | Setup |
|------|--------|-------|
| Test user | Seed data | `test@example.com` |
| Sample data | Fixtures | Run seed script |
| [Specific data] | [Source] | [How to set up] |

---

## Test Cases

### TC-001: [Test Case Title]

| Attribute | Value |
|-----------|-------|
| **Priority** | P0 / P1 / P2 |
| **Type** | Functional / UI / API |
| **AC Reference** | AC1 |
| **Automatable** | Yes / No |

**Preconditions:**
- User is logged in
- [Other preconditions]

**Steps:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
- [Expected outcome 1]
- [Expected outcome 2]

**Test Data:**
- [Specific data needed]

---

### TC-002: [Test Case Title]

[Same structure as TC-001]

---

## Edge Cases & Negative Tests

| ID | Scenario | Expected |
|----|----------|----------|
| NEG-001 | [Invalid input scenario] | [Error message] |
| NEG-002 | [Unauthorized access] | [403/redirect] |
| EDGE-001 | [Boundary condition] | [Behavior] |

---

## Dependencies & Blockers

| Item | Status | Impact |
|------|--------|--------|
| [Dependency 1] | [Status] | [How it affects testing] |

---

## Risks

| Risk | Mitigation |
|------|------------|
| [Risk 1] | [How to handle] |

---

## Test Execution Checklist

- [ ] Test environment ready
- [ ] Test data set up
- [ ] All test cases documented
- [ ] Automation scripts ready (if applicable)
- [ ] QA assigned and available

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| QA | [Name] | [Date] | ✅ Pass / ❌ Fail |
| Dev | [Name] | [Date] | Reviewed |
| PO | [Name] | [Date] | Approved |
````

### Output 4: `.context/PBI/templates/test-case.md`

```markdown
# Test Case Template

## Test Case: TC-[XXX]

### Metadata

| Field            | Value                                              |
| ---------------- | -------------------------------------------------- |
| **ID**           | TC-XXX                                             |
| **Title**        | [Descriptive title]                                |
| **Story**        | PROJ-XXX                                           |
| **AC Reference** | AC1, AC2                                           |
| **Priority**     | P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low) |
| **Type**         | Functional / UI / API / E2E                        |
| **Automation**   | Manual / Automated / To Automate                   |
| **Author**       | [Name]                                             |
| **Created**      | [Date]                                             |

---

### Description

[Brief description of what this test verifies]

---

### Preconditions

1. [Precondition 1 - e.g., User is logged in]
2. [Precondition 2 - e.g., Test data exists]
3. [Precondition 3]

### Test Data

| Data        | Value            | Notes             |
| ----------- | ---------------- | ----------------- |
| User        | test@example.com | Regular user role |
| [Data item] | [Value]          | [Notes]           |

---

### Steps

| #   | Action                 | Expected Result         |
| --- | ---------------------- | ----------------------- |
| 1   | Navigate to [URL/page] | Page loads successfully |
| 2   | [Action description]   | [Expected outcome]      |
| 3   | [Action description]   | [Expected outcome]      |
| 4   | [Action description]   | [Expected outcome]      |

---

### Expected Results

1. [Primary expected outcome]
2. [Secondary expected outcome]
3. [State after test]

---

### Actual Results (Execution)

| Execution | Date   | Tester | Result            | Notes   |
| --------- | ------ | ------ | ----------------- | ------- |
| 1         | [Date] | [Name] | ✅ Pass / ❌ Fail | [Notes] |
| 2         | [Date] | [Name] | ✅ Pass / ❌ Fail | [Notes] |

---

### Evidence

**Screenshots:**
[Attach or link]

**Logs:**
```

[Paste relevant logs]

```

**Bug Reference (if failed):**
- [PROJ-XXX]: [Bug title]

---

### Notes

[Any additional information, edge cases observed, etc.]
```

### Update `.context/PBI/README.md`:

Add section:

```markdown
## Templates

Templates are available in `.context/PBI/templates/`:

| Template        | Purpose                  | Usage            |
| --------------- | ------------------------ | ---------------- |
| `user-story.md` | Create new stories       | Copy and fill    |
| `bug-report.md` | Report bugs              | Copy and fill    |
| `test-plan.md`  | Plan testing for a story | Create per story |
| `test-case.md`  | Individual test cases    | Create per AC    |
```

### Update CLAUDE.md:

```markdown
## Phase 4 Progress

- [x] pbi-backlog-mapping.md ✅
- [x] pbi-story-template.md ✅
  - Templates created: 4
  - Location: .context/PBI/templates/

## Phase 4 Complete ✅

Discovery phases (0-4) complete. Ready for QA phases (5+).
```

---

## 🔗 Next Prompt

| Condition          | Next Prompt                     |
| ------------------ | ------------------------------- |
| Templates created  | Phase 5 - Shift-Left Testing    |
| Need custom fields | Adapt templates to PM tool      |
| Integration needed | Configure MCP for live creation |

---

## Tips

1. **Adapt to your PM tool** - Modify fields as needed
2. **Keep templates simple** - Don't over-engineer
3. **AC format matters** - Given/When/Then is testable
4. **Link everything** - Stories ↔ Tests ↔ Bugs
