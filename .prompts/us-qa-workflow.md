# US QA Workflow

> **Purpose**: Complete In-Sprint Testing workflow for a single User Story, from planning to test automation.
> **Scope**: One US at a time - complete all stages before moving to the next US.
> **Output**: Tested feature, documented test cases, automated tests.
> Based on IQL (Integrated Quality Lifecycle) methodology.

---

## Overview

This orchestrator guides the complete QA process for **one User Story**, from session initialization to automation. It integrates with your TMS (Jira, Xray, etc.) for full traceability and uses local PBI documentation for AI context persistence.

**Entry Point + 6 Stages:**
0. **Session Start** (REQUIRED): Initialize session, load context, create PBI folder
1. **Planning (Shift-Left)**: Triage + Create ATP/ATR/TCs with full traceability
2. **Execution**: Execute TCs, update statuses (PASSED/FAILED)
3. **Reporting**: Complete ATR Test Report, report bugs
4. **Documentation**: Prioritize TCs for regression (ROI analysis)
5. **Automation**: Implement automated tests for Candidate TCs
6. **Regression**: Execute automated suites, analyze results, GO/NO-GO

**Key Principle:**
- **Stage 1 creates ALL TMS artifacts** (ATP, ATR, TCs) with complete traceability
- **Stage 2 executes** what was planned (no TC creation)
- **Stage 3 reports** results and bugs

Execute stages sequentially, completing each before moving to the next.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     QA WORKFLOW FOR ONE USER STORY                          │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Stage 1  │───►│ Stage 2  │───►│ Stage 3  │───►│ Stage 4  │───►│ Stage 5  │───►│ Stage 6  │
  │ Planning │    │ Execu-   │    │ Report-  │    │ Document │    │ Automate │    │ Regres-  │
  │          │    │ tion     │    │ ing      │    │ ation    │    │          │    │ sion     │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
       │               │               │               │               │               │
       ▼               ▼               ▼               ▼               ▼               ▼
    ATP/Test        Bugs +          Bug           ATCs in        Automated      Execution
    Plan            Findings        Reports        TMS           Tests          Report

  ◄────────────────── FEEDBACK LOOP ──────────────────────────────────────────►
```

---

## Input Required

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER STORY INFORMATION                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ Story ID:        _________________________________ (e.g., UPEX-123)        │
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

> **Run `session-start.md` FIRST** to initialize the testing session.
>
> Session Start provides:
> - Project context loaded (business-data-map, api-architecture, project-test-guide)
> - Module context loaded/created
> - PBI folder created: `.context/PBI/{module-name}/TK-{number}-{brief-title}/`
> - Skills loaded (TMS CLI, Playwright CLI)
> - Initial context.md with ACs and code locations
>
> **If session not initialized:** Run `session-start.md` before continuing.

Before starting, verify:

- [ ] Session Start executed (`session-start.md`)
- [ ] User Story is in "Ready For QA" status
- [ ] Feature is deployed to staging environment
- [ ] Access to staging URL is available
- [ ] Context files are loaded (see Context Loading section)

### Context Loading

```markdown
Load these files before starting (ordered by priority):

1. `.context/business-data-map.md` → Business flows and state machines
2. `.context/api-architecture.md` → API endpoints and authentication
3. `.context/project-test-guide.md` → What to test (if exists)
4. `.context/guidelines/TAE/kata-ai-index.md` → KATA patterns (for automation)
5. `.context/guidelines/TAE/automation-standards.md` → Coding standards (for automation)
6. `.context/test-management-system.md` → TMS configuration (if exists)
```

---

## Stage 1: Planning

> **Prompt**: `.prompts/stage-1-planning/acceptance-test-plan.md`
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
- [ ] Ready for execution testing
```

---

## Stage 2: Execution Testing

> **Prompts**: `.prompts/stage-2-execution/*.md`
> **When**: Feature deployed to staging
> **Output**: Exploration findings, bugs reported

### Actions

1. **Smoke Test** (5-10 min)
   - Use: `.prompts/stage-2-execution/smoke-test.md`
   - Verify basic functionality works
   - Check no blocking errors

2. **Deep Exploration** (varies)
   - Use: `.prompts/stage-2-execution/ui-exploration.md` (for UI)
   - Use: `.prompts/stage-2-execution/api-exploration.md` (for API)
   - Use: `.prompts/stage-2-execution/db-exploration.md` (for data validation)
   - Test happy paths and edge cases
   - Document findings

3. **Bug Reporting** (if issues found)
   - Use: `.prompts/stage-3-reporting/bug-report.md`
   - Create bugs in Jira (confirm with user first)
   - Link bugs to User Story

4. **Decision Point**
   - **PASSED**: Continue to Stage 3 (Reporting)
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

## Stage 3: Reporting

> **Prompts**: `.prompts/stage-3-reporting/*.md`
> **When**: After execution testing, when bugs are found
> **Output**: Formal bug reports, defect documentation

### Actions

1. **Document Bugs**
   - Use: `.prompts/stage-3-reporting/bug-report.md`
   - Create formal bug reports for all issues found during execution
   - Include reproduction steps, expected vs actual behavior
   - Attach screenshots/evidence

2. **Classify and Prioritize**
   - Assign severity and priority to each bug
   - Link bugs to User Story
   - Create bugs in Jira (confirm with user first)

3. **Decision Point**
   - **All bugs reported**: Continue to Stage 4 (Documentation)
   - **Critical bugs found**: Wait for fixes, return to Stage 2

### Output Checkpoint

```markdown
## Stage 3 Complete

- [ ] All bugs formally documented
- [ ] Bugs linked to User Story
- [ ] Bugs created in Jira (if applicable)
- [ ] Ready for test documentation
```

---

## Stage 4: Test Documentation

> **Prompts**: `.prompts/stage-4-documentation/*.md`
> **When**: After execution testing passes
> **Output**: Test cases documented in TMS

### Actions

1. **Analyze Test Candidates**
   - Use: `.prompts/stage-4-documentation/test-analysis.md`
   - Review exploration findings
   - Identify scenarios for regression suite
   - Separate: automatable vs manual-only

2. **Prioritize for Automation**
   - Use: `.prompts/stage-4-documentation/test-prioritization.md`
   - Apply ROI formula
   - Rank by business impact

3. **Document in TMS**
   - Use: `.prompts/stage-4-documentation/test-documentation.md`
   - Create test cases with Gherkin format
   - Use variable pattern (no hardcoded data)
   - Link to User Story

### Output Checkpoint

```markdown
## Stage 4 Complete

- [ ] Test analysis completed
- [ ] N tests identified for automation
- [ ] N tests marked as manual-only
- [ ] Test cases created in TMS: TEST-001, TEST-002, ...
- [ ] Tests linked to US
```

---

## Stage 5: Test Automation

> **Prompts**: `.prompts/stage-5-automation/*.md`
> **When**: After test cases documented
> **Output**: Automated tests following KATA architecture

### Workflow: Plan → Coding → Review

For each test case to automate:

#### Phase 1: Plan

```markdown
# For E2E (UI) or Integration (API) tests:
Use: `.prompts/stage-5-automation/planning/test-implementation-plan.md`

# For ATC spec planning:
Use: `.prompts/stage-5-automation/planning/atc-implementation-plan.md`
```

#### Phase 2: Coding

```markdown
# For E2E (UI) tests:
Use: `.prompts/stage-5-automation/coding/e2e-test-coding.md`

# For Integration (API) tests:
Use: `.prompts/stage-5-automation/coding/integration-test-coding.md`
```

#### Phase 3: Review

```markdown
# For E2E (UI) tests:
Use: `.prompts/stage-5-automation/review/e2e-test-review.md`

# For Integration (API) tests:
Use: `.prompts/stage-5-automation/review/integration-test-review.md`
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
## Stage 5 Complete

- [ ] Test plan created
- [ ] Component implemented (if needed)
- [ ] Test file created
- [ ] Fixture updated (if needed)
- [ ] Code review: APPROVED
- [ ] Test passes locally
- [ ] Lint/type-check pass
```

---

## Stage 6: Regression (Optional per US)

> **Prompts**: `.prompts/stage-6-regression/*.md`
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
   - Use: `.prompts/stage-6-regression/regression-execution.md`
   - Trigger appropriate workflow via `gh` CLI
   - Monitor to completion

2. **Analyze Results**
   - Use: `.prompts/stage-6-regression/regression-analysis.md`
   - Classify any failures
   - Calculate metrics

3. **Generate Report** (for releases)
   - Use: `.prompts/stage-6-regression/regression-report.md`
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
## Stage 6 Complete

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
│  Stage 1: Planning                                                          │
│  ├─ [ ] ATP created with test scenarios                                    │
│  └─ [ ] Variables and test data identified                                 │
│                                                                             │
│  Stage 2: Execution                                                         │
│  ├─ [ ] Smoke test PASSED                                                  │
│  ├─ [ ] Deep exploration complete                                          │
│  └─ [ ] Decision: APPROVE / REJECT                                         │
│                                                                             │
│  Stage 3: Reporting                                                         │
│  ├─ [ ] Bugs formally documented                                           │
│  └─ [ ] Bugs reported in Jira (if any)                                     │
│                                                                             │
│  Stage 4: Documentation                                                     │
│  ├─ [ ] Test analysis complete                                             │
│  ├─ [ ] Tests prioritized for automation                                   │
│  └─ [ ] Test cases created in TMS                                          │
│                                                                             │
│  Stage 5: Automation                                                        │
│  ├─ [ ] Plan created for each test                                         │
│  ├─ [ ] Code implemented (component + test)                                │
│  ├─ [ ] Code review APPROVED                                               │
│  └─ [ ] Tests pass locally                                                 │
│                                                                             │
│  Stage 6: Regression                                                        │
│  ├─ [ ] Sanity run with new test(s)                                        │
│  └─ [ ] No regressions introduced                                          │
│                                                                             │
│  ✅ US COMPLETE                                                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Traceability Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRACEABILITY HIERARCHY                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  USER STORY (US-XXX)                                            │
│       │                                                          │
│       ├──► ATP (Test Plan: US-XXX)                              │
│       │         │                                                │
│       │         └──► ATR (Test Results: US-XXX)                 │
│       │                    │                                     │
│       └──► TCs ────────────┘                                    │
│            (linked to Story + ATP + ATR)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**All artifacts are created in Stage 1 with complete links.**

---

## TC Workflow Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TC WORKFLOW STATUS LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Stage 1                Stage 4                    Stage 5                   │
│  ─────────              ─────────                  ─────────                 │
│  (Planning)             (Prioritize)               (Automate)                │
│                                                                              │
│  ┌──────┐   ┌──────┐   ┌───────────┐              ┌──────────────┐          │
│  │ Draft│──►│ Ready│──►│ Candidate │ ──────────►  │ In Automation│          │
│  └──────┘   └──────┘   └───────────┘              └──────────────┘          │
│     ↑           ↑            │                           │                   │
│   (create)  (traceability    │     ┌──────────┐          ▼                  │
│              verified)       └───► │  Manual  │   ┌──────────────┐          │
│                                    └──────────┘   │  In Review   │          │
│                                                   └──────────────┘          │
│                              │     (deferred)            │                   │
│                              └───► stays Ready           ▼                  │
│                                                   ┌──────────────┐          │
│                                                   │  Automated   │          │
│                                                   └──────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Stage 1 transitions:** Draft → Ready (after TC has full traceability: Story + ATP + ATR)

---

## TMS Artifacts Summary

| Stage | Artifact | Name Format |
|-------|----------|-------------|
| 1 | ATP | `Test Plan: US-{number}` |
| 1 | ATR | `Test Results: US-{number}` |
| 1 | TCs | `Should X when Y` |
| 3 | Bug | Bug report linked to US |
| 4 | TC Docs | Precondition, Spec, Automation Plan |
| 5 | Code | `tests/e2e/{module}/{test}.test.ts` |

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

## Stage 1: Planning
- [ ] ATP created
- Scenarios: {N}
- Notes: {any notes}

## Stage 2: Execution
- [ ] Smoke: PASS / FAIL
- [ ] Exploration: PASS / FAIL
- Decision: {APPROVE / REJECT}

## Stage 3: Reporting
- Bugs: {list or "none"}
- [ ] Bugs documented and linked

## Stage 4: Documentation
- [ ] Analysis complete
- [ ] Tests in TMS: {TEST-001, TEST-002, ...}
- Automation candidates: {N}
- Manual only: {N}

## Stage 5: Automation
| Test ID | Type | Status | File |
|---------|------|--------|------|
| TEST-001 | E2E | Done | tests/e2e/... |
| TEST-002 | API | In Progress | tests/integration/... |

## Stage 6: Regression
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
| Stage 1 - Planning | `.prompts/stage-1-planning/` |
| Stage 2 - Execution | `.prompts/stage-2-execution/` |
| Stage 3 - Reporting | `.prompts/stage-3-reporting/` |
| Stage 4 - Documentation | `.prompts/stage-4-documentation/` |
| Stage 5 - Automation | `.prompts/stage-5-automation/` |
| Stage 6 - Regression | `.prompts/stage-6-regression/` |

### Guidelines

- `.context/guidelines/TAE/kata-ai-index.md` - KATA patterns
- `.context/guidelines/TAE/automation-standards.md` - Coding standards
- `.context/guidelines/QA/exploratory-testing.md` - Exploration techniques

### Utilities

- `.prompts/setup/kata-architecture-adaptation.md` - Framework adaptation
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

## Bug Workflow (Alternative Path)

For **bugs**, use a different workflow:

```
session-start.md (Entry Point)
    ↓
bug-qa-workflow.md (Complete Bug Workflow)
├── PHASE 1: Triage + Planning
├── PHASE 2: Execution
└── PHASE 3: Reporting
    ↓
Done
```

**Key Differences:**

| Aspect | User Story | Bug |
|--------|------------|-----|
| Entry Point | `session-start.md` | `session-start.md` |
| Workflow | 6 stages (separate prompts) | 1 workflow (all phases in one) |
| TCs | Created in Stage 1 | Not needed (bug = test case) |
| ATP | Full Test Analysis | Bug Analysis |
| Automation | Stage 5 (after QA Approved) | Assessed in PHASE 3 |

**Bugs do NOT go through Stage 2-6.** The `bug-qa-workflow.md` is a hybrid that combines planning + execution + reporting.

**See:** [Bug QA Workflow](./bug-qa-workflow.md)

---

**Last Updated**: 2026-04-02
