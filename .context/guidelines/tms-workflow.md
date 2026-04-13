# TMS Workflow Guide

> **Purpose**: Step-by-step operational guide for the In-Sprint Testing workflow.
> **Methodology**: IQL (Integrated Quality Lifecycle) aligned -- implements Early-Game (Steps 1-4) through Mid-Game (Steps 5-9).
> **Scope**: The 5-stage pipeline from Planning to Automation, tool-agnostic with pseudocode operations.
> **Related files**:
>   - `tms-architecture.md` -- Entity model, relationships, and TMS structure
>   - `tms-conventions.md` -- Naming rules, labeling standards, field definitions
>   - `TAE/tms-integration.md` -- Technical sync between test code and TMS

---

## How to Read This Guide

This guide uses **pseudocode tags** for all tool operations. The AI resolves these to concrete tools at runtime using the Tool Resolution table in `CLAUDE.md`.

| Tag | Domain | Example tool |
|-----|--------|-------------|
| `[TMS_TOOL]` | Test management (plans, executions, test cases) | Xray CLI, Zephyr, TestRail |
| `[ISSUE_TRACKER_TOOL]` | Issue tracking (tickets, transitions, comments) | Jira, Azure DevOps, Linear |

**Value types in pseudocode:**

| Syntax | Meaning | Example |
|--------|---------|---------|
| Literal value | Fixed domain concept | `type: Manual` |
| `{per <convention>}` | Consult a naming/labeling rule | `title: {per TC naming convention}` |
| `{{VARIABLE}}` | Project-configured value | `project: {{PROJECT_KEY}}` |
| `{from <source>}` | Derived during session | `scenarios: {from test analysis}` |

---

## Workflow Overview

```
IN-SPRINT TESTING WORKFLOW
============================================================================================

  STAGE 1          STAGE 2          STAGE 3          STAGE 4          STAGE 5
  Planning    -->  Execution   -->  Reporting   -->  Documentation -->  Automation
  (Analysis)      (Testing)        (Results)        (Prioritization)   (Code)

  IQL Step 1       IQL Steps 3-4    IQL Step 4       IQL Steps 5-6     IQL Steps 7-9
  Early-Game       Early-Game       Early-Game       Mid-Game          Mid-Game
  (Step 2 = Dev parallel work, outside QA workflow)
============================================================================================
```

Each stage produces artifacts that feed the next. Stages 1-3 happen **within the sprint**. Stage 4 can overlap with the next sprint. Stage 5 is continuous backlog work.

---

## Stage 1: Planning (Analysis)

**When**: Ticket enters refinement or development queue
**Who**: QA Engineer / QA Analyst
**Goal**: Prevent defects, improve AC quality, identify test needs early
**IQL Phase**: Early-Game (Step 1: Requirements Analysis)

### What QA Does

1. **ATP already exists** (created during session initialization for traceability)
2. **Fill the Test Analysis** with:
   - Test approach and strategy
   - Risk areas identified
   - Test data requirements
   - Suggested test scenarios
   - UX improvement suggestions (Shift-Left feedback)
3. **Mark ATP complete** when analysis is done

### Timing

| Approach | Description |
|----------|-------------|
| **Shift-Left (Ideal)** | Fill Test Analysis BEFORE development starts |
| **On-Demand** | Fill Test Analysis when ticket enters active development |

The ATP artifact is created in session initialization for traceability. The Test Analysis content can be written at any time.

### Benefits

- Prevents defects before they are coded
- Improves AC quality with testability feedback
- Identifies test data needs early
- Documents expected behavior upfront

### Operations

```
[TMS_TOOL] Update test plan:
  - id: {from ATP created in session start}
  - analysis: {from test analysis content}
  - complete: true

[TMS_TOOL] List test plans:
  - project: {{PROJECT_KEY}}
  - ticket: {from current ticket ID}
```

---

## Stage 2: Execution (Testing)

**When**: Ticket transitions to active development/testing status
**Who**: QA Engineer
**Goal**: Execute exploratory testing, create Test Cases as you test
**IQL Phase**: Early-Game (Steps 3-4: Exploratory Testing + Risk-Based Prioritization)

### What QA Does

1. **Initialize session context** (load ticket, ACs, environment)
2. **Execute exploratory testing** per Acceptance Criteria
3. **Create Test Cases** in the TMS as you test:

```
[TMS_TOOL] Create test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - story: {from ticket full title}
  - ac: {from acceptance criteria being tested}
  - status: PASSED | FAILED | NOT_RUN
```

4. **Update Test Case details** with specifications:

```
[TMS_TOOL] Update test:
  - id: {from created test case}
  - precondition: {from test environment and data state}
  - spec: {from test steps performed}
```

5. **Collect evidence** (screenshots, traces, logs)
6. **Update test status** as you go:
   - `NOT_RUN` -- Initial state
   - `PASSED` -- Test passed
   - `FAILED` -- Test failed (create bug ticket)

### IQL Priority

> **Report findings FIRST, then formalize TC documentation.**

The goal is fast feedback. Document findings immediately, polish test cases later.

### TC Workflow Status in This Stage

- TCs start as **Draft** (minimal info, created during testing)
- Tester transitions to **Ready** when TC has:
  - Name (per naming convention)
  - AC linked
  - Test status (PASSED/FAILED)

---

## Stage 3: Reporting (Results)

**When**: All test cases for the ticket are executed
**Who**: QA Engineer
**Goal**: Document results, report findings, complete the testing cycle
**IQL Phase**: Early-Game (Step 4: Defect Reporting and Results)

### What QA Does

1. **ATR already exists** (created during session initialization). If not:

```
[TMS_TOOL] Create test result:
  - project: {{PROJECT_KEY}}
  - story: {from ticket full title}
```

2. **Fill the Test Report** with:
   - Session summary
   - Environment tested
   - Test data used
   - Findings (bugs, observations, data issues)
   - Screenshots/evidence attached
   - Recommendations

3. **Add summary comment** to the User Story:

```
[ISSUE_TRACKER_TOOL] Add comment:
  - issue: {from ticket ID}
  - body: |
      QA Results for {{PROJECT_KEY}}-XXX:
      - AC1: Description -- PASSED
      - AC2: Description -- PASSED
      - AC3: Description -- FAILED (BUG-XXX)

      Environment: [tested environment]
      Test data: [data used]
      Findings: [summary of issues found]
```

4. **Mark ATR complete**:

```
[TMS_TOOL] Update test result:
  - id: {from ATR ID}
  - report: {from test report content}
  - complete: true
```

5. **Transition the ticket** to tested status:

```
[ISSUE_TRACKER_TOOL] Transition issue:
  - issue: {from ticket ID}
  - status: {from tested status in project workflow}
```

### Expected Outcome

After Stage 3, the ticket should show:

```
Test Plan:    ATP for TICKET-XXX -- Complete
Test Results: ATR for TICKET-XXX -- Complete
Test Cases:   TC-1 PASSED, TC-2 PASSED, TC-3 FAILED ...
Coverage:     X% PASSED
```

---

## Stage 4: Documentation (Prioritization)

**When**: Ticket is in tested status, all TCs have execution status
**Who**: QA Engineer
**Goal**: Prioritize TCs for regression using ROI analysis, document candidate specs
**IQL Phase**: Mid-Game (Steps 5-6: TC Documentation + Automation Assessment)

### What QA Does

1. **List TCs** for the ticket:

```
[TMS_TOOL] List tests:
  - project: {{PROJECT_KEY}}
  - ticket: {from ticket ID}
```

2. **Apply ROI Analysis** to each TC:

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies)
```

| Factor | High Score | Low Score |
|--------|-----------|-----------|
| Frequency | Executed often (regression, smoke) | One-time validation |
| Impact | High business risk if it fails | Low-risk edge case |
| Stability | Stable flow, unlikely to change | Volatile, changing often |
| Effort | Simple to automate | Complex setup or dependencies |
| Dependencies | Self-contained | Requires external systems |

3. **Decide for each TC**:

| ROI Score | Decision | Workflow Status Transition |
|-----------|----------|---------------------------|
| > 3.0 | Automate | Ready --> **Candidate** |
| 0.5 - 3.0 | Manual regression | Ready --> **Manual** |
| < 0.5 | Defer | Stays as **Ready** |

4. **Document Candidate TCs** with full specifications:
   - Precondition (complete: environment, login, test data, data state)
   - Specification (step-by-step with expected results)
   - Test Automation Plan (approach, test type, components needed)

### Operations

```
[TMS_TOOL] Update test:
  - id: {from TC ID}
  - workflow-status: Candidate | Manual
  - precondition: {from complete environment description}
  - spec: {from numbered test steps}
  - automation-plan: {from automation approach}
```

### Expected Distribution

**Most TCs should be DEFERRED.** If more than 50% go to regression, review whether the criteria are too permissive.

Target per User Story:
- Simple feature: 1-3 TCs for regression
- Complex feature: 3-5 TCs for regression

---

## Stage 5: Automation (Code)

**When**: TCs have Workflow Status = Candidate
**Who**: QA Automation Engineer / SDET
**Goal**: Implement automated tests using KATA Architecture, get them into CI
**IQL Phase**: Mid-Game (Steps 7-9: TAUS Automation + CI Verification + PR Review)

### What QA Does

1. **Read TC documentation** (Precondition, Specification, Automation Plan)

2. **Mark TC as In Automation**:

```
[TMS_TOOL] Update test:
  - id: {from TC ID}
  - workflow-status: In Automation
```

3. **Implement the ATC** in the appropriate component (Page Object or API Component), following KATA Architecture

4. **Write the test file** in `tests/e2e/` or `tests/integration/`

5. **Create PR** and update TC status:

```
[TMS_TOOL] Update test:
  - id: {from TC ID}
  - workflow-status: In Review
```

6. **After PR merge**, mark TC as Automated:

```
[TMS_TOOL] Update test:
  - id: {from TC ID}
  - workflow-status: Automated
  - automation-plan: |
      Automated in tests/e2e/{feature}/{test-file}.ts
      ATC: ComponentName.methodName()
```

### Workflow Status Transitions in This Stage

```
Candidate --> In Automation --> In Review --> Automated
```

---

## TC Workflow Status Lifecycle

The 7 workflow states track a Test Case from creation through automation.

```
TC WORKFLOW STATUS LIFECYCLE
============================================================================================

  Stage 2                   Stage 4                         Stage 5
  (Execution)               (Documentation)                 (Automation)
  -----------               ---------------                 -----------

  +--------+                +-----------+                   +---------------+
  | Draft  | ---> +-------+ | Candidate | ----------------> | In Automation |
  +--------+     | Ready | +-----------+                   +---------------+
                 +-------+                                         |
                    |       +--------+                             v
                    +-----> | Manual |                   +---------------+
                    |       +--------+                   |  In Review    |
                    |                                    +---------------+
                    |       (deferred:                          |
                    +---->  stays Ready)                        v
                                                         +---------------+
                                                         |  Automated    |
                                                         +---------------+

============================================================================================
```

### State Descriptions

| Status | Description | Set By | Stage |
|--------|-------------|--------|-------|
| **Draft** | TC created with minimal info during testing | Automatic | Stage 2 |
| **Ready** | TC has name, AC link, and test status | Manual | Stage 2 |
| **Candidate** | Approved for automation after ROI analysis | Manual | Stage 4 |
| **Manual** | Assigned to manual regression suite | Manual | Stage 4 |
| **In Automation** | ATC implementation in progress | Manual | Stage 5 |
| **In Review** | Pull Request created, awaiting code review | Manual | Stage 5 |
| **Automated** | PR merged, ATC running in CI/CD | Manual | Stage 5 |

### Transition Rules

| From | To | Trigger | Who |
|------|----|---------|-----|
| Draft | Ready | TC has required fields populated | QA Engineer |
| Ready | Candidate | ROI > 3.0, approved for automation | QA Engineer |
| Ready | Manual | ROI 0.5-3.0, manual regression | QA Engineer |
| Candidate | In Automation | Engineer starts implementation | QA Automation |
| In Automation | In Review | PR created | QA Automation |
| In Review | Automated | PR merged | QA Automation |

---

## IQL Phase Mapping

This table shows exactly which IQL steps each workflow stage implements.

| Workflow Stage | IQL Phase | IQL Steps | IQL Activities |
|----------------|-----------|-----------|----------------|
| **Stage 1: Planning** | Early-Game | Step 1: Requirements Analysis | Analyze requirements, evaluate risks, write BDD scenarios |
| **Stage 2: Execution** | Early-Game | Step 2: Development (parallel), Step 3: Exploratory Testing | Execute tests alongside development, create TCs |
| **Stage 3: Reporting** | Early-Game | Step 4: Risk-Based Prioritization | Document results, classify findings, report to team |
| **Stage 4: Documentation** | Mid-Game | Step 5: TC Documentation, Step 6: Automation Assessment | Full TC specs, ROI analysis, candidate selection |
| **Stage 5: Automation** | Mid-Game | Step 7: TAUS Automation, Step 8: CI Verification, Step 9: PR Review | Implement ATCs, verify in CI, code review cycle |

**Not covered by this workflow**: IQL Late-Game (Steps 10-15) covers production monitoring, canary releases, A/B testing, and chaos engineering. Those are operational concerns outside the In-Sprint testing scope.

---

## Workflow Summary Table

| Stage | Trigger | Actions | Artifact | IQL Steps |
|-------|---------|---------|----------|-----------|
| **1. Planning** | Ticket enters refinement/dev | Create ATP, fill Test Analysis | ATP (complete) | 1 |
| **2. Execution** | Ticket in active development | Exploratory testing, create TCs | TCs with status | 2-3 |
| **3. Reporting** | All TCs executed | Fill ATR, comment on ticket, transition | ATR (complete) | 4 |
| **4. Documentation** | Ticket in tested status | ROI analysis, document candidate specs | TC specs | 5-6 |
| **5. Automation** | TC = Candidate | Implement ATC, create PR, merge | Code in CI | 7-9 |

---

## Best Practices

### Test Case Quality

- **Preconditions**: Always include environment, login credentials reference, test data, and required data state
- **Specifications**: Numbered steps with verifiable expected results
- **Naming**: Follow `{per TC naming convention}` -- see `tms-conventions.md`
- **AC Mapping**: Every TC must link to at least one Acceptance Criterion

### Evidence

- Take screenshots for each AC verified
- Attach evidence to the Test Report
- Use meaningful filenames: `ac1-awaiting-data.png`, `ac2-invoice-paid.png`
- Include trace files for complex failures

### Findings

- Report bugs immediately -- do not wait for TC documentation (IQL priority: fast feedback)
- Use consistent format in comments (AC-by-AC breakdown)
- Include reproduction steps for every bug
- Classify severity: Critical > High > Medium > Low

### Traceability

- **Every TC** links to a User Story (required)
- **Every TC** links to an ATP and ATR (required when they exist)
- **Every bug** links to the failing TC and the User Story
- **Linking order**: ATP first, then ATR, then update ATP to reference ATR, then create TCs linking both

### Automation Discipline

- Never automate without ROI analysis (Stage 4 must precede Stage 5)
- Most TCs should be deferred -- automation is expensive, be selective
- Update workflow status at every transition -- do not skip states
- Document the ATC location in the automation plan field after merge

---

## CLI Quick Reference

Common operations expressed in pseudocode. The AI resolves `[TMS_TOOL]` and `[ISSUE_TRACKER_TOOL]` to concrete tools via `CLAUDE.md` Tool Resolution.

### Test Plans (ATP)

```
[TMS_TOOL] Create test plan:
  - project: {{PROJECT_KEY}}
  - story: {from ticket full title}

[TMS_TOOL] Update test plan:
  - id: {from ATP ID}
  - analysis: {from test analysis content}
  - name: {per TP naming convention}
  - complete: true

[TMS_TOOL] List test plans:
  - project: {{PROJECT_KEY}}
  - ticket: {from ticket ID}
```

### Test Results (ATR)

```
[TMS_TOOL] Create test result:
  - project: {{PROJECT_KEY}}
  - story: {from ticket full title}

[TMS_TOOL] Update test result:
  - id: {from ATR ID}
  - report: {from test report content}
  - name: {per ATR naming convention}
  - complete: true

[TMS_TOOL] List test results:
  - project: {{PROJECT_KEY}}
  - ticket: {from ticket ID}
```

### Test Cases (TC)

```
[TMS_TOOL] Create test:
  - project: {{PROJECT_KEY}}
  - title: {per TC naming convention}
  - story: {from ticket full title}
  - ac: {from acceptance criteria}
  - status: PASSED | FAILED | NOT_RUN

[TMS_TOOL] Update test:
  - id: {from TC ID}
  - workflow-status: Draft | Ready | Candidate | Manual | In Automation | In Review | Automated
  - precondition: {from environment and data state}
  - spec: {from numbered test steps}
  - automation-plan: {from automation approach}

[TMS_TOOL] List tests:
  - project: {{PROJECT_KEY}}
  - ticket: {from ticket ID}

[TMS_TOOL] Get test:
  - id: {from TC ID}
```

### Issue Tracker Operations

```
[ISSUE_TRACKER_TOOL] Get issue:
  - issue: {from ticket ID}

[ISSUE_TRACKER_TOOL] Add comment:
  - issue: {from ticket ID}
  - body: {from QA results summary}

[ISSUE_TRACKER_TOOL] Transition issue:
  - issue: {from ticket ID}
  - status: {from target workflow status}

[ISSUE_TRACKER_TOOL] Search issues:
  - project: {{PROJECT_KEY}}
  - query: {from search criteria}
```

### Result Import (CI/CD)

```
[TMS_TOOL] Import results:
  - format: junit | cucumber
  - file: {from test results path}
  - project: {{PROJECT_KEY}}
  - execution: {from test execution ID}
```

---

## Reference Implementation: Jira + Xray

The pseudocode above is tool-agnostic. For teams using **Jira + Xray** as their TMS:

| Pseudocode Entity | Xray Equivalent | Jira Native Equivalent |
|-------------------|-----------------|------------------------|
| Test Plan (ATP) | Test Plan issue type | Epic or custom issue |
| Test Result (ATR) | Test Execution issue type | Custom issue or comment |
| Test Case (TC) | Test issue type | Task with `test-case` label |
| Test Suite | Test Set issue type | Label-based grouping |
| Precondition | Precondition issue type | Description field |

For CLI syntax when using Xray, see the `/xray-cli` skill. For Jira native operations, see the Atlassian CLI or MCP tool.

---

## See Also

- `tms-architecture.md` -- Entity model and relationships
- `tms-conventions.md` -- Naming, labeling, and field standards
- `TAE/tms-integration.md` -- Technical sync between test code and TMS
- `QA/jira-test-management.md` -- Jira-specific test management reference
- `CLAUDE.md` -- Tool Resolution table and project variables
- `docs/methodology/IQL-methodology.md` -- Full IQL methodology reference

---

**Last Updated**: 2026-04-12
