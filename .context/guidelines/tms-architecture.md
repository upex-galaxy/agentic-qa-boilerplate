# TMS Entity Architecture

> **Purpose**: Defines the Test Management System entity model, traceability rules, and linking order for QA artifacts.
> **Methodology**: IQL (Integrated Quality Lifecycle) -- maps to Mid-Game Steps 5-9 (Plan, Execute, Report, Document, Automate).
> **Audience**: AI agents and QA engineers creating or linking TMS artifacts.
> **Scope**: Tool-agnostic. Uses `[TMS_TOOL]` pseudocode. Concrete examples reference Jira/Xray as one possible implementation.

---

## 1. Overview

The TMS entity model is the structural backbone of the IQL workflow. It answers three questions:

1. **What entities exist** in a quality-managed project?
2. **How do they connect** to form bidirectional traceability?
3. **What is mandatory** when creating or updating each entity?

Every User Story that goes through In-Sprint Testing produces four types of artifacts. These artifacts are the same regardless of whether the TMS is Jira + Xray, Coda, Azure DevOps, or any other platform.

---

## 2. TMS Entity Model

### The Four Core Entities

```
BACKLOG (User Stories)          The requirement being tested
    |
    +-- ATP (Acceptance Test Plan)     The test planning artifact
    +-- ATR (Acceptance Test Results)  The test execution results artifact
    +-- TC  (Test Cases)               Individual test case documentation
```

### Entity Definitions

| Entity | Full Name | Purpose | When Created | IQL Stage |
|--------|-----------|---------|--------------|-----------|
| **Backlog (US)** | User Story / Backlog Item | The requirement under test. Source of Acceptance Criteria. | Before QA involvement | -- |
| **ATP** | Acceptance Test Plan | Documents the test approach, risk analysis, and test coverage mapping (AC to TC). Contains the **Test Analysis**. | Stage 1 (Planning) | Steps 1-2 |
| **ATR** | Acceptance Test Results | Documents execution results, findings, evidence, and the **Test Report**. | Stage 1 (created early for traceability, filled in Stage 3) | Step 4 |
| **TC** | Test Case | Individual test case with preconditions, steps, expected results, and execution status. Lives in a Test Repository. | Stage 2 (Execution) | Steps 3-4 |

### Key Fields per Entity

**Backlog (User Story)**

| Field | Description | Required |
|-------|-------------|----------|
| ID | Issue tracker ID (e.g., `{{PROJECT_KEY}}-123`) | Yes |
| Title | User Story summary | Yes |
| Acceptance Criteria | Testable conditions | Yes |
| Test Plan link | Reference to ATP | Yes (after ATP exists) |
| Test Results link | Reference to ATR | Yes (after ATR exists) |
| Test Cases link | References to TCs | Yes (after TCs exist) |

**ATP (Acceptance Test Plan)**

| Field | Description | Required |
|-------|-------------|----------|
| Name | `{per ATP naming convention}` | Yes |
| User Story | Link back to the Backlog item | Yes |
| Test Coverage | AC-to-TC mapping table | Yes |
| Test Analysis | Rich text: approach, risks, test data needs, scenarios | Yes |
| Test Results link | Link to corresponding ATR | Yes (after ATR exists) |
| Complete | Completion flag | Yes |

**ATR (Acceptance Test Results)**

| Field | Description | Required |
|-------|-------------|----------|
| Name | `{per ATR naming convention}` | Yes |
| User Story | Link back to the Backlog item | Yes |
| Test Coverage | Same AC-to-TC view as ATP (shared or mirrored) | Yes |
| Test Report | Rich text: session summary, environment, findings, evidence | Yes |
| Complete | Completion flag | Yes |

**TC (Test Case)**

| Field | Description | Required |
|-------|-------------|----------|
| ID | Auto-generated or tracker-assigned (e.g., `{{PROJECT_KEY}}-456`) | Yes |
| Name | `{per TC naming convention}` | Yes |
| Acceptance Criteria | Which AC this TC covers | Yes |
| User Story | Link back to the Backlog item | Yes |
| Test Plan link | Link to the ATP | Yes |
| Test Results link | Link to the ATR | Yes |
| Precondition | Environment, login, test data, data state | Yes |
| Specification | Step-by-step verification | Yes |
| Test Status | NOT RUN / PASSED / FAILED | Yes |
| Workflow Status | Draft / Ready / Candidate / Manual / In Automation / In Review / Automated | Yes |

---

## 3. Entity Relationships

### Architecture Diagram

```
+------------------------------------------------------------------+
|                      TMS ENTITY ARCHITECTURE                     |
+------------------------------------------------------------------+
|                                                                  |
|   BACKLOG (User Stories)                                         |
|   +------------------+                                           |
|   | US: PROJ-123     |                                           |
|   | - Title          |                                           |
|   | - ACs            |                                           |
|   | - Test Plan  ----+---------+                                 |
|   | - Test Results ---+-----+  |                                 |
|   | - Test Cases ----+-+ |  |  |                                 |
|   +------------------+ | |  |  |                                 |
|                        | |  |  |                                 |
|        +---------------+ |  |  +----------+                      |
|        |      +----------+  |             |                      |
|        |      |             |             |                      |
|        v      v             v             v                      |
|   +--------+ +--------+ +----------------+                      |
|   | TC-1   | | TC-2   | | ATP            | <---> | ATR          |
|   | TC-3   | | TC-N   | | Test Plan:     |       | Test Results:|
|   +---+----+ +---+----+ | PROJ-123       |       | PROJ-123     |
|       |          |       +-------+--------+       +------+-------+
|       |          |               |                       |       |
|       +----------+---------------+-----------------------+       |
|                  |                                                |
|           BIDIRECTIONAL TRACEABILITY                              |
|           US <--> ATP <--> ATR <--> TC                           |
|                                                                  |
+------------------------------------------------------------------+
```

### Relationship Summary

| From | To | Cardinality | Link Direction |
|------|----|-------------|----------------|
| User Story | ATP | 1:1 | Bidirectional |
| User Story | ATR | 1:1 | Bidirectional |
| User Story | TC | 1:N | Bidirectional |
| ATP | ATR | 1:1 | Bidirectional |
| ATP | TC | 1:N | TC references ATP |
| ATR | TC | 1:N | TC references ATR |
| TC | AC | N:1 | TC covers one or more ACs |

### Traceability Chain

```
US (requirement) <---> ATP (plan) <---> ATR (results) <---> TC (test case)
```

Every entity in the chain must be reachable from any other entity. Given a TC, you can navigate to its ATP, ATR, and User Story. Given a User Story, you can see all TCs, the plan, and the results.

---

## 4. Traceability Rules

### Mandatory Links

These links MUST exist. An entity without its required links is considered incomplete.

| Entity | Required Link | Value | When to Set |
|--------|--------------|-------|-------------|
| **ATP** | User Story | Backlog item title or ID | At creation |
| **ATP** | Test Results (ATR) | ATR name or ID | After ATR is created |
| **ATR** | User Story | Backlog item title or ID | At creation |
| **TC** | User Story | Backlog item title or ID | At creation |
| **TC** | Test Plan (ATP) | ATP name or ID | At creation (if ATP exists) |
| **TC** | Test Result (ATR) | ATR name or ID | At creation (if ATR exists) |

### Validation Checklist

Before marking any entity as "Complete", verify:

- [ ] ATP links to User Story AND ATR
- [ ] ATR links to User Story
- [ ] Every TC links to User Story, ATP, and ATR
- [ ] ATP Test Coverage maps all ACs to TCs
- [ ] ATR Test Coverage reflects execution results
- [ ] User Story shows references to ATP, ATR, and all TCs

---

## 5. Linking Order

Artifacts must be created and linked in a specific sequence to maintain traceability without orphaned references.

### Creation Sequence

```
Step 1: Create ATP
        +-- Link ATP --> User Story
        +-- (ATR link left empty for now)

Step 2: Create ATR
        +-- Link ATR --> User Story

Step 3: Update ATP to link ATR
        +-- Link ATP --> ATR (bidirectional)

Step 4: Create TCs (as testing progresses)
        +-- Link each TC --> User Story
        +-- Link each TC --> ATP
        +-- Link each TC --> ATR
```

### Why This Order Matters

1. **ATP first**: The plan must exist before execution begins. Even if the Test Analysis content is written later (on-demand), the artifact is created early for traceability.
2. **ATR second**: The results artifact is created early so that the ATP can reference it. The Test Report content is filled after execution.
3. **ATP-ATR link third**: Once both exist, the bidirectional link between plan and results is established.
4. **TCs last**: Test Cases are created during execution (Stage 2). By this point, both ATP and ATR exist, so all three links (US, ATP, ATR) can be set at creation time.

### Pseudocode: Full Linking Sequence

```
[TMS_TOOL] Create ATP:
  - name: {per ATP naming convention}
  - story: {from User Story title}

[TMS_TOOL] Create ATR:
  - name: {per ATR naming convention}
  - story: {from User Story title}

[TMS_TOOL] Update ATP:
  - id: {from ATP created above}
  - results: {from ATR name created above}

[TMS_TOOL] Create TC:
  - name: {per TC naming convention}
  - story: {from User Story title}
  - test-plan: {from ATP name}
  - test-result: {from ATR name}
  - ac: {from Acceptance Criteria}
```

---

## 6. Naming Conventions

Consistent naming enables searching, filtering, and automatic linking across TMS entities.

### Patterns

| Entity | Pattern | Example |
|--------|---------|---------|
| User Story | `{{PROJECT_KEY}}-{number}` | `PROJ-123` |
| ATP | `Test Plan: {{PROJECT_KEY}}-{number}` | `Test Plan: PROJ-123` |
| ATR | `Test Results: {{PROJECT_KEY}}-{number}` | `Test Results: PROJ-123` |
| TC (TMS title) | `{per TC naming convention}` | `PROJ-150: TC1: Validate successful login with valid credentials` |
| TC (code/ATC) | `Should [behavior] when [condition]` | `Should display error when password is incorrect` |

### Naming Rules

1. **ATP and ATR names always include the User Story ID**. This makes them searchable and unique per story.
2. **TC names follow the TC naming convention** defined in `.context/guidelines/TAE/test-design-principles.md` (see "Test Case (TC)" section).
3. **The `{{PROJECT_KEY}}` variable** is resolved from `CLAUDE.md` Project Variables. Replace it with the actual project key (e.g., `UPEX`, `TK`, `GX`).
4. **TC IDs in code** use the issue tracker's real ID (e.g., `@atc('PROJ-456')`), not an invented convention.

### Reference Implementation (Jira/Xray)

In Jira with Xray, these map to:

| Entity | Jira Issue Type | Naming |
|--------|----------------|--------|
| User Story | Story | `PROJ-123` (auto-assigned) |
| ATP | Test Plan (Xray) or custom | `Test Plan: PROJ-123` |
| ATR | Test Execution (Xray) or custom | `Test Results: PROJ-123` |
| TC | Test (Xray) | `PROJ-456: TC1: Validate ...` |

In other platforms (Coda, Azure DevOps, TestRail), the same naming patterns apply -- only the underlying issue types differ.

---

## 7. User Story Completed View

When all In-Sprint Testing stages are complete, a User Story should present the following view in the TMS:

### Expected State

```
+---------------------------------------------------------------+
| User Story: PROJ-123 - [Story Title]                          |
+---------------------------------------------------------------+
| Test Plan     | Test Plan: PROJ-123           | Complete       |
| Test Results  | Test Results: PROJ-123        | Complete       |
| Test Cases    | TC-1, TC-2, TC-3, TC-4       | All with status|
+---------------------------------------------------------------+

ATP (Test Plan: PROJ-123)
  - User Story:    PROJ-123
  - Test Analysis:  [filled]
  - Test Coverage:  AC1 -> TC-1, AC2 -> TC-2, AC3 -> TC-3, TC-4
  - Test Results:   Test Results: PROJ-123
  - Complete:       Yes

ATR (Test Results: PROJ-123)
  - User Story:    PROJ-123
  - Test Report:    [filled]
  - Test Coverage:  AC1 -> TC-1 PASSED, AC2 -> TC-2 PASSED, ...
  - Complete:       Yes

Test Cases:
  TC-1  | PASSED | AC1 | Should [behavior] when [condition]
  TC-2  | PASSED | AC2 | Should [behavior] when [condition]
  TC-3  | PASSED | AC3 | Should [behavior] when [condition]
  TC-4  | FAILED | AC3 | Should [behavior] when [condition]
```

### Completeness Criteria

A User Story is considered **fully documented** when:

1. ATP exists, is linked, and marked Complete
2. ATR exists, is linked, and marked Complete
3. All TCs have a Test Status (PASSED, FAILED, or NOT RUN)
4. All ACs are covered by at least one TC
5. ATP and ATR are bidirectionally linked
6. Every TC links to the US, ATP, and ATR

---

## 8. TC Workflow Status Lifecycle

Test Cases move through workflow states across IQL stages. This lifecycle is independent of the TMS platform.

```
Stage 2 (Execution)     Stage 4 (Documentation)      Stage 5 (Automation)
-------------------     -----------------------      --------------------

+-------+              +-----------+                +---------------+
| Draft | --> +-------+| Candidate |--------------->| In Automation |
+-------+    | Ready |+-----------+                +---------------+
             +-------+                                     |
                |      +---------+                         v
                +----->| Manual  |                +---------------+
                |      +---------+                |  In Review    |
                |                                 +---------------+
                +----> (deferred,                         |
                        stays Ready)                      v
                                                  +---------------+
                                                  |  Automated    |
                                                  +---------------+
```

| Status | Stage | Description | Set By |
|--------|-------|-------------|--------|
| **Draft** | 2 | TC created with minimal info during execution | Auto |
| **Ready** | 2 | TC has name, AC, and Test Status | Manual |
| **Candidate** | 4 | Approved for automation (positive ROI) | Manual |
| **Manual** | 4 | Manual regression only (low ROI) | Manual |
| **In Automation** | 5 | ATC implementation in progress | Manual |
| **In Review** | 5 | PR created, awaiting review | Manual |
| **Automated** | 5 | PR merged, test running in CI | Manual |

---

## 9. Quick Reference

### Pseudocode Commands

All operations use `[TMS_TOOL]` pseudocode. The AI resolves this to the actual tool via `CLAUDE.md` Tool Resolution.

**List and Read**

```
[TMS_TOOL] List ATPs:
  - project: {{PROJECT_KEY}}
  - ticket: {from User Story ID}

[TMS_TOOL] List ATRs:
  - project: {{PROJECT_KEY}}
  - ticket: {from User Story ID}

[TMS_TOOL] List TCs:
  - project: {{PROJECT_KEY}}
  - ticket: {from User Story ID}

[TMS_TOOL] Get TC:
  - id: {from TC ID}
```

**Create**

```
[TMS_TOOL] Create ATP:
  - name: {per ATP naming convention}
  - story: {from User Story title}
  - project: {{PROJECT_KEY}}

[TMS_TOOL] Create ATR:
  - name: {per ATR naming convention}
  - story: {from User Story title}
  - project: {{PROJECT_KEY}}

[TMS_TOOL] Create TC:
  - name: {per TC naming convention}
  - story: {from User Story title}
  - ac: {from Acceptance Criteria}
  - test-plan: {from ATP name}
  - test-result: {from ATR name}
  - project: {{PROJECT_KEY}}
```

**Update**

```
[TMS_TOOL] Update ATP:
  - id: {from ATP ID}
  - results: {from ATR name}
  - analysis: {from test analysis content}
  - complete: true

[TMS_TOOL] Update ATR:
  - id: {from ATR ID}
  - report: {from test report content}
  - complete: true

[TMS_TOOL] Update TC:
  - id: {from TC ID}
  - status: PASSED
  - workflow-status: Candidate
  - precondition: {from test environment details}
  - spec: {from step-by-step specification}
```

---

## 10. Relationship to Other Guidelines

| Guideline | Relationship |
|-----------|-------------|
| `tms-conventions.md` | Naming rules, labeling, field formats (the "how to fill" companion) |
| `tms-workflow.md` | Stage-by-stage workflow using these entities (the "when to act" companion) |
| `QA/jira-test-management.md` | Jira/Xray-specific implementation details |
| `TAE/tms-integration.md` | Code-level TMS sync (decorators, CI/CD import) |
| `TAE/test-design-principles.md` | TC naming convention, ATC rules, TC identity |

This file is the **map**. The conventions file tells you how to fill each field. The workflow file tells you when to create each artifact and in what order within a sprint.

---

**Last Updated**: 2026-04-12
