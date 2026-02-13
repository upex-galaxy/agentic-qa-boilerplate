# US QA Workflow

> **Purpose**: Complete QA workflow for a single User Story, from exploratory testing to test automation.
> **Scope**: One US at a time - complete all stages before moving to the next US.
> **Output**: Tested feature, documented test cases, automated tests.

---

## Overview

This orchestrator guides the complete QA process for **one User Story**. Execute stages sequentially, completing each before moving to the next.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     QA WORKFLOW FOR ONE USER STORY                          │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Stage 1  │───►│ Stage 2  │───►│ Stage 3  │───►│ Stage 4  │───►│ Stage 5  │
  │ Shift-   │    │ Explora- │    │ Document │    │ Automate │    │ Regres-  │
  │ Left     │    │ tory     │    │ ation    │    │          │    │ sion     │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
       │               │               │               │               │
       ▼               ▼               ▼               ▼               ▼
    ATP/Test        Bugs +         ATCs in        Automated      Execution
    Plan            Findings        TMS           Tests          Report

  ◄────────────────── FEEDBACK LOOP ──────────────────────────────────────────►
```

---

## Input Required

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER STORY INFORMATION                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Story ID:        _________________________________ (e.g., PROJ-123)        │
│                                                                             │
│ Story Title:     _________________________________ (brief description)     │
│                                                                             │
│ Status:          ○ Ready For QA    ○ In Testing    ○ QA Approved           │
│                                                                             │
│ Staging URL:     _________________________________ (for testing)           │
│                                                                             │
│ Source:          ○ Jira (use MCP)    ○ Manual input                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting, verify:

- [ ] User Story is in "Ready For QA" status
- [ ] Feature is deployed to staging environment
- [ ] Access to staging URL is available
- [ ] Context files are loaded (see Context Loading section)

### Context Loading

```markdown
Load these files before starting:

1. `.context/guidelines/TAE/kata-ai-index.md` → KATA patterns
2. `.context/guidelines/TAE/automation-standards.md` → Coding standards
3. `.context/test-management-system.md` → TMS configuration (if exists)
4. `.context/project-test-guide.md` → What to test (if exists)
```

---

## Stage 1: Shift-Left Testing

> **Prompt**: `.prompts/stage-1-shift-left/acceptance-test-plan.md`
> **When**: Before or during development (optional if US is already in QA)
> **Output**: Acceptance Test Plan (ATP) with test scenarios

### Actions

1. **Read the User Story**
   - Get story details from Jira (if MCP available) or manual input
   - Extract Acceptance Criteria
   - Identify business rules

2. **Create ATP**
   - Use prompt to generate test scenarios
   - Apply nomenclature: `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>`
   - Identify variables and test data needs

3. **Decision**
   - Skip if US already has documented test cases
   - Continue if planning new tests

### Output Checkpoint

```markdown
## Stage 1 Complete

- [ ] ATP created with N test scenarios
- [ ] Test nomenclature applied
- [ ] Variables identified
- [ ] Ready for exploratory testing
```

---

## Stage 2: Exploratory Testing

> **Prompts**: `.prompts/stage-2-exploratory/*.md`
> **When**: Feature deployed to staging
> **Output**: Exploration findings, bugs reported

### Actions

1. **Smoke Test** (5-10 min)
   - Use: `.prompts/stage-2-exploratory/smoke-test.md`
   - Verify basic functionality works
   - Check no blocking errors

2. **Deep Exploration** (varies)
   - Use: `.prompts/stage-2-exploratory/ui-exploration.md` (for UI)
   - Use: `.prompts/stage-2-exploratory/api-exploration.md` (for API)
   - Use: `.prompts/stage-2-exploratory/db-exploration.md` (for data validation)
   - Test happy paths and edge cases
   - Document findings

3. **Bug Reporting** (if issues found)
   - Use: `.prompts/stage-2-exploratory/bug-report.md`
   - Create bugs in Jira (confirm with user first)
   - Link bugs to User Story

4. **Decision Point**
   - **PASSED**: Continue to Stage 3
   - **BLOCKED**: Wait for fixes, return to Step 1
   - **FAILED**: Report issues, escalate

### MCP Tools (if available)

```
- mcp__playwright__* → Browser automation for UI testing
- mcp__atlassian__* → Jira for bug creation
```

### Output Checkpoint

```markdown
## Stage 2 Complete

- [ ] Smoke test: PASSED / FAILED
- [ ] Exploratory testing: PASSED / FAILED / BLOCKED
- [ ] Bugs created: N (or none)
- [ ] Recommendation: APPROVE / REJECT / WAIT
```

---

## Stage 3: Test Documentation

> **Prompts**: `.prompts/stage-3-documentation/*.md`
> **When**: After exploratory testing passes
> **Output**: Test cases documented in TMS

### Actions

1. **Analyze Test Candidates**
   - Use: `.prompts/stage-3-documentation/test-analysis.md`
   - Review exploration findings
   - Identify scenarios for regression suite
   - Separate: automatable vs manual-only

2. **Prioritize for Automation**
   - Use: `.prompts/stage-3-documentation/test-prioritization.md`
   - Apply ROI formula
   - Rank by business impact

3. **Document in TMS**
   - Use: `.prompts/stage-3-documentation/test-documentation.md`
   - Create test cases with Gherkin format
   - Use variable pattern (no hardcoded data)
   - Link to User Story

### Output Checkpoint

```markdown
## Stage 3 Complete

- [ ] Test analysis completed
- [ ] N tests identified for automation
- [ ] N tests marked as manual-only
- [ ] Test cases created in TMS: TEST-001, TEST-002, ...
- [ ] Tests linked to US
```

---

## Stage 4: Test Automation

> **Prompts**: `.prompts/stage-4-automation/*.md`
> **When**: After test cases documented
> **Output**: Automated tests following KATA architecture

### Workflow: Plan → Coding → Review

For each test case to automate:

#### Phase 1: Plan

```markdown
# For E2E (UI) tests:
Use: `.prompts/stage-4-automation/e2e-test-automation-plan.md`

# For Integration (API) tests:
Use: `.prompts/stage-4-automation/integration-test-automation-plan.md`
```

#### Phase 2: Coding

```markdown
# For E2E (UI) tests:
Use: `.prompts/stage-4-automation/e2e-test-automation-coding.md`

# For Integration (API) tests:
Use: `.prompts/stage-4-automation/integration-test-automation-coding.md`
```

#### Phase 3: Review

```markdown
# For E2E (UI) tests:
Use: `.prompts/stage-4-automation/e2e-test-code-review.md`

# For Integration (API) tests:
Use: `.prompts/stage-4-automation/integration-test-code-review.md`
```

### Validation

```bash
# Run the new test
bun run test tests/e2e/{module}/{test}.test.ts

# Or for integration
bun run test tests/integration/{module}/{test}.test.ts

# Check linting
bun run lint

# Check types
bun run type-check
```

### Output Checkpoint

```markdown
## Stage 4 Complete

- [ ] Test plan created
- [ ] Component implemented (if needed)
- [ ] Test file created
- [ ] Fixture updated (if needed)
- [ ] Code review: APPROVED
- [ ] Test passes locally
- [ ] Lint/type-check pass
```

---

## Stage 5: Regression (Optional per US)

> **Prompts**: `.prompts/stage-5-regression/*.md`
> **When**: After automation complete OR at release time
> **Output**: Execution report, GO/NO-GO decision

### When to Execute

| Trigger | Action |
|---------|--------|
| Single US complete | Run sanity with new test |
| Sprint complete | Run full regression |
| Pre-release | Run full regression + report |

### Actions

1. **Execute Tests**
   - Use: `.prompts/stage-5-regression/regression-execution.md`
   - Trigger appropriate workflow via `gh` CLI
   - Monitor to completion

2. **Analyze Results**
   - Use: `.prompts/stage-5-regression/regression-analysis.md`
   - Classify any failures
   - Calculate metrics

3. **Generate Report** (for releases)
   - Use: `.prompts/stage-5-regression/regression-report.md`
   - Create GO/NO-GO recommendation
   - Share with stakeholders

### Quick Sanity for Single US

```bash
# Run only the new test(s)
gh workflow run sanity.yml \
  -f environment=staging \
  -f test_file="tests/e2e/{module}/{test}.test.ts"
```

### Output Checkpoint

```markdown
## Stage 5 Complete

- [ ] Tests executed successfully
- [ ] New test passes in CI
- [ ] No regressions introduced
- [ ] (Optional) Full regression report generated
```

---

## Workflow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE WORKFLOW FOR US: {US-ID}                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Stage 1: Shift-Left                                                        │
│  ├─ [ ] ATP created with test scenarios                                    │
│  └─ [ ] Variables and test data identified                                 │
│                                                                             │
│  Stage 2: Exploratory                                                       │
│  ├─ [ ] Smoke test PASSED                                                  │
│  ├─ [ ] Deep exploration complete                                          │
│  ├─ [ ] Bugs reported (if any)                                             │
│  └─ [ ] Decision: APPROVE / REJECT                                         │
│                                                                             │
│  Stage 3: Documentation                                                     │
│  ├─ [ ] Test analysis complete                                             │
│  ├─ [ ] Tests prioritized for automation                                   │
│  └─ [ ] Test cases created in TMS                                          │
│                                                                             │
│  Stage 4: Automation                                                        │
│  ├─ [ ] Plan created for each test                                         │
│  ├─ [ ] Code implemented (component + test)                                │
│  ├─ [ ] Code review APPROVED                                               │
│  └─ [ ] Tests pass locally                                                 │
│                                                                             │
│  Stage 5: Regression                                                        │
│  ├─ [ ] Sanity run with new test(s)                                        │
│  └─ [ ] No regressions introduced                                          │
│                                                                             │
│  ✅ US COMPLETE                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Progress Tracking Template

Copy this template to track progress for a specific US:

```markdown
# QA Progress: {US-ID} - {Title}

## User Story
- **ID**: {US-ID}
- **Title**: {Title}
- **Status**: Ready For QA → In Testing → QA Approved
- **Staging URL**: {URL}

## Stage 1: Shift-Left
- [ ] ATP created
- Scenarios: {N}
- Notes: {any notes}

## Stage 2: Exploratory
- [ ] Smoke: PASS / FAIL
- [ ] Exploration: PASS / FAIL
- Bugs: {list or "none"}
- Decision: {APPROVE / REJECT}

## Stage 3: Documentation
- [ ] Analysis complete
- [ ] Tests in TMS: {TEST-001, TEST-002, ...}
- Automation candidates: {N}
- Manual only: {N}

## Stage 4: Automation
| Test ID | Type | Status | File |
|---------|------|--------|------|
| TEST-001 | E2E | ✅ Done | tests/e2e/... |
| TEST-002 | API | 🔄 In Progress | tests/integration/... |

## Stage 5: Regression
- [ ] Sanity: PASS / FAIL
- [ ] Regression: N/A (single US)

## Completion
- [ ] All stages complete
- [ ] Ready for next US
```

---

## Related Documentation

| Stage | Prompts Directory |
|-------|-------------------|
| Stage 1 | `.prompts/stage-1-shift-left/` |
| Stage 2 | `.prompts/stage-2-exploratory/` |
| Stage 3 | `.prompts/stage-3-documentation/` |
| Stage 4 | `.prompts/stage-4-automation/` |
| Stage 5 | `.prompts/stage-5-regression/` |

### Guidelines

- `.context/guidelines/TAE/kata-ai-index.md` - KATA patterns
- `.context/guidelines/TAE/automation-standards.md` - Coding standards
- `.context/guidelines/QA/exploratory-testing.md` - Exploration techniques

### Utilities

- `.prompts/setup/kata-framework-adaptation.md` - Framework adaptation
- `.prompts/utilities/git-flow.md` - Git workflow

---

## Error Handling

| Situation | Action |
|-----------|--------|
| US not ready | Verify status, wait for "Ready For QA" |
| Staging down | Check deployment, escalate to DevOps |
| Critical bug found | Stop exploration, create bug, wait for fix |
| Test automation blocked | Mark test as manual-only, continue with others |
| Flaky test | Debug with `--debug` flag, add proper waits |
| CI failure | Check logs, verify environment configuration |

---

## Best Practices

1. **Complete one US before starting another** - Avoid context switching
2. **Don't skip exploratory** - Manual testing validates before automation
3. **Use variable pattern** - No hardcoded test data
4. **Follow KATA** - Consistent architecture across all tests
5. **Review before commit** - Code quality matters
6. **Run sanity after automation** - Verify new tests work in CI

---

**Last Updated**: 2026-02-11
