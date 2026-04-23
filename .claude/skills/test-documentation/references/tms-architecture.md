# TMS Architecture — Entity Model and Traceability

Definitive reference for the four TMS entities, their fields, their links, and the order in which to create them. Read this when creating any artifact, validating traceability, or fixing broken links.

---

## 1. The four entities

Every QA-tested user story produces four artifact types. The model is tool-agnostic: the same structure applies in Jira+Xray, native Jira, Coda, Azure DevOps, and TestRail. Only the implementing issue types differ.

| Entity | Full name | Purpose | When created | Where the content lives |
|--------|-----------|---------|--------------|-------------------------|
| **US** | User Story / Backlog item | The requirement under test | Pre-QA | Description + ACs |
| **ATP** | Acceptance Test Plan | Approach, risk analysis, AC-to-TC coverage. Contains the Test Analysis. | Stage 1 (Planning) | ATP issue body |
| **ATR** | Acceptance Test Results | Execution results, findings, evidence. Contains the Test Report. | Stage 1 (created early), filled Stage 3 | ATR issue body |
| **TC** | Test Case | Individual test: precondition + action + expected. Lives in a test repository. | Stage 4 (Documentation) | TC issue body |

### Container per modality (load-bearing)

The entity model is tool-agnostic, but the **container** each entity lives in changes with the TMS modality. Resolve modality via `test-documentation/SKILL.md` §Phase 0 before using these mappings.

| Entity | Modality A — Xray on Jira | Modality B — Jira-native (no Xray) |
|--------|---------------------------|-------------------------------------|
| **US** | Jira `Story` | Jira `Story` |
| **ATP** | Xray `Test Plan` issue. Named `Test Plan: {{PROJECT_KEY}}-{n}`. Linked to the Story via "tests". | Story's `customfield_ATP` (e.g. `customfield_12400`) + comment mirror on the same Story. **No separate issue created.** |
| **ATR** | Xray `Test Execution` issue. Named `Test Results: {{PROJECT_KEY}}-{n}`. Holds `Test Runs` per TC, plus Environment, Begin/End Date. Gets populated by CI import. | Story's `customfield_ATR` (e.g. `customfield_12401`) + comment mirror. **No separate issue.** CI updates Test Status field on each TC directly. |
| **TC** | Xray `Test` issue (type Manual / Cucumber / Generic) | Jira-native `Test` custom issue type (set up per `references/jira-setup.md`) or `Task` with a `Test Type` custom field. |
| **Test Set / Precondition / Test Plan hierarchy** | First-class Xray issue types | Not available — group by labels + Regression Epic. |

Key consequences:

- In **Modality B**, there is no separate "Test Plan issue" to link to — all ATP/ATR content lives on the Story itself. Traceability from a TC back to the plan/results walks via the "is tested by" link to the Story, then reads the Story's custom fields.
- In **Modality A**, the `Test Plan` and `Test Execution` issues are real, queryable, filterable by JQL, and (critically) the Test Execution is the target of `[TMS_TOOL] Import Results` at the end of every CI run.
- The naming convention (`Test Plan: {{PROJECT_KEY}}-{n}` / `Test Results: {{PROJECT_KEY}}-{n}`) stays the same in both modalities — in B it identifies the section header in the Story comment, not an issue key.

---

## 2. Required fields per entity

### User Story (pre-existing)

| Field | Required | Notes |
|-------|----------|-------|
| ID | Yes | `{{PROJECT_KEY}}-{n}` auto-assigned |
| Title | Yes | |
| Acceptance Criteria | Yes | Testable conditions |
| Test Plan link | Yes (once ATP exists) | Bidirectional to ATP |
| Test Results link | Yes (once ATR exists) | Bidirectional to ATR |
| Test Cases links | Yes (once TCs exist) | 1:N |

### ATP

| Field | Required | Value source |
|-------|----------|--------------|
| Name | Yes | `Test Plan: {{PROJECT_KEY}}-{n}` |
| User Story link | Yes | Back-link to US |
| Test Coverage | Yes | AC-to-TC mapping table |
| Test Analysis | Yes | Rich text: approach, risks, test data, scenarios |
| Test Results link | Yes (after ATR exists) | Link to ATR |
| Complete flag | Yes | Set when filled |

### ATR

| Field | Required | Value source |
|-------|----------|--------------|
| Name | Yes | `Test Results: {{PROJECT_KEY}}-{n}` |
| User Story link | Yes | Back-link to US |
| Test Coverage | Yes | Same AC-to-TC view as ATP (shared or mirrored) |
| Test Report | Yes | Rich text: session summary, env, findings, evidence |
| Complete flag | Yes | Set when filled |

### TC

| Field | Required | Value source |
|-------|----------|--------------|
| ID | Yes | Auto-generated (e.g., `{{PROJECT_KEY}}-456`) |
| Name | Yes | `{US_ID or TS_ID}: TC#: Validate <CORE> <CONDITIONAL>` |
| Acceptance Criterion | Yes | Which AC this TC covers (1:N from TC side) |
| User Story link | Yes | Back-link to US |
| Test Plan link | Yes | Link to ATP |
| Test Results link | Yes | Link to ATR |
| Precondition | Yes | Environment, login state, test data, DB state |
| Specification | Yes | Step-by-step verification (Gherkin or table) |
| Test Status | Yes | `NOT RUN` / `PASSED` / `FAILED` |
| Workflow Status | Yes | `Draft` / `In Design` / `Ready` / `Candidate` / `Manual` / `In Automation` / `In Review` / `Pull Request` / `Automated` / `Deprecated` |
| Priority | Yes | `Critical` / `High` / `Medium` / `Low` |
| Labels | Yes | At least one scope label (`regression` almost always) |
| Automation Candidate | Yes (boolean) | True when Candidate path |
| Parent | Yes | Regression Epic / test repository |

---

## 3. Entity relationships

```
+------------------------------------------------------------+
|                                                            |
|   User Story ({{PROJECT_KEY}}-123)                         |
|     |                                                      |
|     +--- Test Plan link ---> ATP (Test Plan: ...-123)      |
|     |                          |                           |
|     +--- Test Results link ---> ATR (Test Results: ...-123)|
|     |                          |                           |
|     +--- Test Cases links --+                              |
|                             |                              |
|                             v                              |
|                        [ TC-1, TC-2, TC-3, ... TC-N ]      |
|                           |   |    |                       |
|                           |   |    +--- links to US, ATP, ATR, AC |
|                           |   +----- links to US, ATP, ATR, AC    |
|                           +-------- links to US, ATP, ATR, AC     |
|                                                                   |
|   All arrows are bidirectional: US <-> ATP <-> ATR <-> TC         |
+------------------------------------------------------------+
```

### Cardinality

| From | To | Cardinality | Link direction |
|------|----|-------------|----------------|
| US | ATP | 1:1 | Bidirectional |
| US | ATR | 1:1 | Bidirectional |
| US | TC | 1:N | Bidirectional |
| ATP | ATR | 1:1 | Bidirectional |
| ATP | TC | 1:N | TC references ATP |
| ATR | TC | 1:N | TC references ATR |
| TC | AC | N:1 (or N:M) | TC covers one or more ACs |

Given any one of the four, you must be able to navigate to the other three. That is what "traceability" means.

---

## 4. Traceability rules

### Mandatory links

| Entity | Required link | Value | When to set |
|--------|---------------|-------|-------------|
| **ATP** | User Story | US ID or title | At creation |
| **ATP** | Test Results (ATR) | ATR ID or name | After ATR is created |
| **ATR** | User Story | US ID or title | At creation |
| **TC** | User Story | US ID or title | At creation |
| **TC** | Test Plan (ATP) | ATP ID or name | At creation (if ATP exists) |
| **TC** | Test Result (ATR) | ATR ID or name | At creation (if ATR exists) |
| **TC** | Acceptance Criterion | AC reference | At creation |

A TC that is missing even one of Story / ATP / ATR is broken — use `fix-traceability` to repair.

### Validation checklist (before marking Complete)

- [ ] ATP links to User Story AND ATR
- [ ] ATR links to User Story
- [ ] Every TC links to User Story, ATP, and ATR
- [ ] ATP Test Coverage maps all ACs to TCs
- [ ] ATR Test Coverage reflects execution results
- [ ] User Story panel shows references to ATP, ATR, and all TCs

---

## 5. Creation and linking order

Artifacts must be created in a specific sequence. Creating TCs first, ATP second leaves orphaned references that are painful to repair.

### The sequence

```
Step 1. Create ATP
        -> link ATP to User Story
        (ATR link left empty for now)

Step 2. Create ATR
        -> link ATR to User Story

Step 3. Update ATP
        -> link ATP to ATR (bidirectional plan/results)

Step 4. For each TC (as Stage 4 progresses):
        Create TC
        -> link TC to User Story
        -> link TC to ATP
        -> link TC to ATR
        -> link TC to AC
```

### Why this order

1. **ATP first**: the plan must exist before execution results can reference it. Even if the Test Analysis content is filled later, the artifact is created early so that TCs can link to it.
2. **ATR second**: created early so the ATP can reference it. Test Report content is filled after execution.
3. **ATP <-> ATR third**: once both exist, wire up the bidirectional link.
4. **TCs last**: by the time a TC is created, both ATP and ATR exist, so all three links are set at creation.

### Pseudocode — full sequence

> **Prerequisite**: Load `/xray-cli` skill (Modality A) — in Modality B these `[TMS_TOOL]` calls fall through to `[ISSUE_TRACKER_TOOL]`, so load `/acli` instead. See §9 for the per-modality split.

```
[TMS_TOOL] Create ATP:
  name: Test Plan: {{PROJECT_KEY}}-{n}
  story: {from User Story title}

[TMS_TOOL] Create ATR:
  name: Test Results: {{PROJECT_KEY}}-{n}
  story: {from User Story title}

[TMS_TOOL] Update ATP:
  id: {from ATP created above}
  results: {from ATR name created above}

[TMS_TOOL] Create TC:
  name: {per TC naming convention}
  story: {from User Story title}
  test-plan: {from ATP name}
  test-result: {from ATR name}
  ac: {from the Acceptance Criterion this TC covers}
  project: {{PROJECT_KEY}}
```

---

## 6. Naming conventions (canonical)

| Entity | Pattern | Example |
|--------|---------|---------|
| User Story | `{{PROJECT_KEY}}-{n}` | `PROJ-123` |
| ATP | `Test Plan: {{PROJECT_KEY}}-{n}` | `Test Plan: PROJ-123` |
| ATR | `Test Results: {{PROJECT_KEY}}-{n}` | `Test Results: PROJ-123` |
| TC (TMS title) | `{US_ID or TS_ID}: TC#: Validate <CORE> <CONDITIONAL>` | `PROJ-150: TC1: Validate successful login with valid credentials` |
| TC (code / ATC) | `Should <behavior> when <condition>` | `Should display error when password is incorrect` |

Rules:

1. ATP and ATR names always include the User Story ID. This makes them searchable, unique per story, and impossible to confuse across stories.
2. TC names follow the pattern `{US_ID or TS_ID}: TC#: Validate <CORE> <CONDITIONAL>`, where `CORE` is verb + object describing the behavior (e.g., `successful login`, `authentication error`) and `CONDITIONAL` is the distinguishing condition (e.g., `with valid credentials`, `when password is incorrect`). The prefix is the Test Set ID (Xray with Test Sets) or the User Story ID (native Jira or Xray without Test Sets).
3. Code-side IDs match the TMS-generated key exactly. The `@atc('PROJ-456')` decorator uses the TMS issue key, not an invented module prefix.
4. Module prefixes (e.g., `AUTH-`, `ORD-`) are used only for local folder/file organization under `.context/PBI/.../tests/` — they are not the canonical ID.

---

## 7. Completed User Story view

When all In-Sprint Testing stages are complete, the User Story panel in the TMS should look like this:

```
User Story: PROJ-123 — <Story Title>

| Test Plan     | Test Plan: PROJ-123           | Complete |
| Test Results  | Test Results: PROJ-123        | Complete |
| Test Cases    | TC-1, TC-2, TC-3, TC-4        | All with status |

ATP (Test Plan: PROJ-123)
  User Story:    PROJ-123
  Test Analysis: [filled]
  Test Coverage: AC1 -> TC-1; AC2 -> TC-2; AC3 -> TC-3, TC-4
  Test Results:  Test Results: PROJ-123
  Complete:      Yes

ATR (Test Results: PROJ-123)
  User Story:    PROJ-123
  Test Report:   [filled]
  Test Coverage: AC1 -> TC-1 PASSED; AC2 -> TC-2 PASSED; AC3 -> TC-3 PASSED, TC-4 FAILED
  Complete:      Yes

Test Cases
  TC-1 | PASSED | AC1 | Should <behavior> when <condition>
  TC-2 | PASSED | AC2 | Should <behavior> when <condition>
  TC-3 | PASSED | AC3 | Should <behavior> when <condition>
  TC-4 | FAILED | AC3 | Should <behavior> when <condition>
```

### Completeness criteria

A User Story is fully documented when:

1. ATP exists, is linked, and is marked Complete.
2. ATR exists, is linked, and is marked Complete.
3. Every TC has a Test Status (`PASSED`, `FAILED`, or `NOT RUN`).
4. Every AC is covered by at least one TC.
5. ATP and ATR are bidirectionally linked.
6. Every TC links to US, ATP, and ATR.

Any failing criterion -> the story is not ready to close QA.

---

## 8. TC workflow state machine

The TC workflow spans three IQL stages. Key transitions: `start design` (Draft -> In Design), `ready to run` (In Design -> Ready), `for manual` (Ready -> Manual), `automation review` (Ready -> In Review), `approve to automate` (In Review -> Candidate), `start automation` (Candidate -> In Automation), `create PR` (In Automation -> Pull Request), `merged` (Pull Request -> Automated). Never skip states; use `back` to return to In Design if rework is needed.

```
Stage 2 (Execution)     Stage 4 (Documentation)     Stage 5 (Automation)
-----------------       -----------------------     ---------------------

Draft -> In Design -> Ready -+-- for manual --> Manual         (terminal manual)
                             |
                             +-- automation review --> In Review
                                                         |
                                                         +-- approve to automate --> Candidate
                                                                                         |
                                                                                         +-- start automation --> In Automation
                                                                                                                     |
                                                                                                                     +-- create PR --> Pull Request
                                                                                                                                          |
                                                                                                                                          +-- merged --> Automated

Any state -> Deprecated (when feature is removed)
```

Rules:
- No state can be skipped. Draft must go through In Design before Ready; Ready cannot go straight to Automated.
- Backward transitions are limited: only "back to In Design" (rework) and "any state to Deprecated".
- Manual is not a dead end: a Manual TC can later re-enter In Review if ROI changes.

---

## 9. Pseudocode — common entity operations

All operations use `[TMS_TOOL]` for TMS-specific actions and `[ISSUE_TRACKER_TOOL]` for generic issue operations. Resolution via CLAUDE.md Tool Resolution (Xray CLI, Jira CLI, or MCP fallback).

### List and read

> **Prerequisite**: Load `/xray-cli` skill (Modality A). In Modality B, load `/acli` — these calls map to JQL/search via `[ISSUE_TRACKER_TOOL]`.

```
[TMS_TOOL] List ATPs:
  project: {{PROJECT_KEY}}
  ticket: {from User Story ID}

[TMS_TOOL] List ATRs:
  project: {{PROJECT_KEY}}
  ticket: {from User Story ID}

[TMS_TOOL] List TCs:
  project: {{PROJECT_KEY}}
  ticket: {from User Story ID}

[TMS_TOOL] Get TC:
  id: {from TC ID}
```

### Create

Pseudocode splits by TMS modality — pick the block matching the resolution from SKILL.md §Phase 0. Full per-modality reference in SKILL.md §Quick reference.

#### Modality A — Xray on Jira

> **Prerequisite**: Load `/xray-cli` and `/acli` skills before executing commands below.

```
[TMS_TOOL] Create TestPlan:
  project: {{PROJECT_KEY}}
  title: Test Plan: {{PROJECT_KEY}}-{n}

[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: Test Results: {{PROJECT_KEY}}-{n}
  testPlan: {ATP_KEY}
  environment: {from session context}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "tests"
  outward: {ATP_KEY}
  inward:  {STORY_KEY}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "is tested by"
  outward: {ATR_KEY}
  inward:  {STORY_KEY}

[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Cucumber | Manual | Generic
  title: {per TC naming convention}
  steps-or-gherkin: {from test design}

[TMS_TOOL] AddTests:
  testPlan: {ATP_KEY}
  tests: [{TEST_KEY}]
[TMS_TOOL] AddTests:
  execution: {ATR_KEY}
  tests: [{TEST_KEY}]
```

#### Modality B — Jira-native (no Xray)

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
# ATP — lives on the Story, no new issue
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {customfield_ATP}: {Test Analysis body}   # confirm field id via jira-setup.md
  labels: +shift-left-reviewed

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: "=== Test Plan: {{PROJECT_KEY}}-{n} ===\n{Test Analysis body}"

# ATR — lives on the Story, no new issue
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {customfield_ATR}: {Test Report body}

[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: "=== Test Results: {{PROJECT_KEY}}-{n} ===\n{Test Report body}"

# TC — Jira-native Test issue
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test                              # or Task + customfield_TestType
  summary: {per TC naming convention}
  epic: {REGRESSION_EPIC_KEY}
  labels: [regression, ...]

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full TC template}
  fields:
    Test Status: Draft

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: "is tested by"
  outward: {TEST_KEY}
  inward:  {STORY_KEY}
```

### Update

> **Prerequisite**: Load `/xray-cli` skill (Modality A). In Modality B, load `/acli` — these update calls become `[ISSUE_TRACKER_TOOL] Update Issue` on the Story or Test customfields.

```
[TMS_TOOL] Update ATP:
  id: {from ATP ID}
  results: {from ATR name}
  analysis: {from test analysis content}
  complete: true

[TMS_TOOL] Update ATR:
  id: {from ATR ID}
  report: {from test report content}
  complete: true

[TMS_TOOL] Update TC:
  id: {from TC ID}
  status: PASSED
  workflow-status: Candidate
  precondition: {from test environment details}
  spec: {from step-by-step specification}
```

### Verify traceability

> **Prerequisite**: Load `/xray-cli` skill (Modality A). In Modality B, load `/acli` and walk the links manually via `[ISSUE_TRACKER_TOOL] Search Issues`.

```
[TMS_TOOL] Verify Traceability:
  issue: {from ticket ID}
```

Expected output: all links verified (US <-> ATP <-> ATR <-> TCs). If any link is missing, apply the fixes in §10.

---

## 10. Fixing broken traceability

Common failure modes and their fixes:

| Issue | Fix |
|-------|-----|
| TC not linked to Story | Update TC with Story reference |
| TC not linked to ATP | Update TC with ATP reference |
| TC not linked to ATR | Update TC with ATR reference |
| ATP not linked to ATR | Update ATP with ATR reference |
| ATP not linked to Story | Update ATP with Story reference |
| TC name doesn't follow convention | Rename TC to `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>` |
| ATP name wrong | Rename to `Test Plan: {{PROJECT_KEY}}-{n}` |
| ATR name wrong | Rename to `Test Results: {{PROJECT_KEY}}-{n}` |
| TC has no AC link | Identify which AC it covers and add the reference |

Procedure:

1. Run `[TMS_TOOL] Verify Traceability` — read the gap list.
2. For each issue, apply the fix above.
3. Re-run `[TMS_TOOL] Verify Traceability` to confirm all links are resolved.
4. Log what was fixed in a comment on the User Story for audit trail.

---

## 11. Reference implementation — Jira + Xray

The canonical implementation this file was derived from uses Jira with Xray. Mapping:

| Generic concept | Jira/Xray implementation |
|-----------------|-------------------------|
| Test Case ID | Jira issue key (e.g., `PROJ-123`) |
| Test Case issue type | Xray Test |
| Test Plan | Xray Test Plan (or Jira Story + custom field) |
| Test Execution (ATR) | Xray Test Execution |
| Regression Epic | Jira Epic with label `test-repository` |
| Results import | Xray REST API (JUnit / Cucumber formats) |
| CLI | `bun xray` (load `/xray-cli` skill) |

Other TMS tools (Coda, Azure DevOps, TestRail) implement the same four-entity model with different issue types. The naming conventions, linking order, and traceability rules above apply unchanged.
