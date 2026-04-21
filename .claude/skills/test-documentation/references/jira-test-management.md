# Jira Test Management Reference

How to create and maintain Test / ATP / ATR artifacts in Jira — both with and without Xray. Covers mode selection, field mapping, workflow, Description templates, and Jira-specific gotchas.

### Related references

- `xray-platform.md` — dense Xray concepts (issue types, RTM, data flow, API). Load when in **Modality A** and you need the *what* of Xray.
- `jira-setup.md` — one-time Jira / Xray project configuration checklist (issue types, custom fields, workflows, API access). Load before the first skill run on a new project.
- `tms-architecture.md` §Container per modality — which issue type ATP/ATR/TC map to in each modality.
- `tms-conventions.md` §IQL — Test Status (Workflow) vs Execution Status (Run) distinction.

### Tool tags used here

- `[ISSUE_TRACKER_TOOL]` — generic Jira operations (create issue, update fields, link issues, transition, search). Primary = `/acli` skill. Resolves per CLAUDE.md Tool Resolution.
- `[TMS_TOOL]` — Xray-specific operations (create Test, create Test Execution, import results). Only resolvable in **Modality A** via `/xray-cli`. In Modality B falls through to `[ISSUE_TRACKER_TOOL]`.

---

## 1. Which mode: Jira Native or Jira + Xray?

Pick once per project. Do not mix in the same repository.

| Question | Jira Native | Jira + Xray |
|----------|-------------|-------------|
| Is Xray installed and licensed in the Jira instance? | No | Yes |
| Do you need structured step-by-step execution with pass/fail per step? | No (Description only) | Yes |
| Do you need native JUnit/Cucumber import from CI/CD? | No (custom script) | Yes |
| Do you need Test Plan / Test Set / Test Execution hierarchies? | No | Yes |
| Is the team comfortable with Jira issue types only? | Yes | Either |

Decision rule:

- **Xray present** -> use Jira + Xray. The extra issue types (Test Plan, Test Set, Test Execution) are worth the complexity.
- **Xray absent** -> use Jira Native. Build a custom `Test` issue type and treat Description as the source of truth.

Once chosen, stay consistent: TC prefix depends on mode (see §5).

---

## 2. Entity models per mode

### Jira Native (no Xray)

Only three entities: User Story (pre-existing), Test (custom issue type), Epic (Regression Epic — parent of all Tests).

```
User Story (STORY-123)
    | is tested by
Test (TEST-456)
    | parent epic
Regression Epic (EPIC-001 — "Test Repository")
```

ATP and ATR live as additional custom issue types or as documents linked to the story. In this skill's convention, ATP = `Test Plan: {{PROJECT_KEY}}-{n}` and ATR = `Test Results: {{PROJECT_KEY}}-{n}` are stored as Jira issues of a generic type (Task or a custom "Test Plan" / "Test Results" type). Linking order: (1) create ATP and link to US; (2) create ATR and link to US; (3) update ATP to link to ATR; (4) for each TC, link to US + ATP + ATR + AC.

### Jira + Xray

Five extra issue types available:

| Issue Type | Purpose | Relationship |
|------------|---------|--------------|
| **Test** | Individual test case (Manual, Cucumber, Generic). | Child of Regression Epic; linked to User Story. |
| **Test Plan** | Groups Tests for a release / sprint. Contains Tests. | Planning-level container. |
| **Test Set** | Groups Tests by criteria (smoke, regression, domain). | Re-usable grouping; `TS_ID` becomes TC prefix. |
| **Test Execution** | One execution instance. Generates Test Runs. | Executes a Test Plan or ad-hoc set of Tests. |
| **Precondition** | Reusable prerequisite for Tests. | Referenced by Tests that share setup. |

Typical hierarchy:

```
Regression Epic
    |
    +-- Test Plan: PROJ Sprint 50
    |       |
    |       +-- Test Set: Sanity: PROJ-101: Allow credit card payment
    |       |       +-- Test (TC1, TC2, ...)
    |       |
    |       +-- Test Set: Regression: Checkout v2
    |               +-- Test (TC3, TC4, ...)
    |
    +-- Test Execution: Sanity: PROJ-101
            +-- Test Run per Test (PASS / FAIL / TODO)
```

---

## 3. Custom Test issue type — Jira Native configuration

Create a **Test** issue type in the Jira project with the following fields. This is admin work; do it once per project.

| Field | Type | Purpose |
|-------|------|---------|
| Summary | Text | TC title per naming convention. |
| Description | Long text (rich text) | Full TC documentation (Gherkin or steps + metadata). |
| Test Status | Select list | `Draft`, `In Design`, `Ready`, `Manual`, `In Review`, `Candidate`, `In Automation`, `Pull Request`, `Automated`, `Deprecated`. |
| Automation Candidate | Checkbox | Redundant with labels but easier to filter in JQL. |
| Priority | Select list | `Critical`, `High`, `Medium`, `Low`. |
| Labels | Multi-select | `regression`, `smoke`, `e2e`, `integration`, `automation-candidate`, `manual-only`, etc. |
| Components | Multi-select | Module / feature area for filtering. |
| Epic Link | Epic picker | Must point to the Regression Epic. |
| Linked Issues | Links | "tests" / "is tested by" -> User Story; "is blocked by" -> Bug (optional). |

Jira admin caveats:

- Add the Test issue type to the project's **Issue Type Scheme**, otherwise the type won't be selectable.
- Add the above fields to the Test **Screen Scheme** (Create / Edit / View screens). Missing fields silently disappear.
- Make `Test Status` available on the Edit screen so transitions do not require a separate workflow config.
- If the project uses a shared workflow scheme, add a Test-specific workflow with the states from §6; otherwise new Tests inherit the default workflow.

---

## 4. Field mapping — Jira Native vs Xray

Same concept, different storage. Use this when translating a TC design into actual TMS fields.

| TC concept | Jira Native | Xray |
|------------|-------------|------|
| Title | `Summary` | `Summary` |
| Steps (preconditions, action, expected) | Inside `Description` — as a table or Gherkin block | Xray `Test Steps` field (one row per step) OR `Cucumber` Gherkin field OR `Generic` text field |
| Test type (Manual / Cucumber / Generic) | No native concept — infer from Description format | Xray `Test Type` field: Manual / Cucumber / Generic |
| Preconditions | Inline at top of Description | Xray `Precondition` issue type, linked to the Test |
| Expected Result | Per-row column in Description steps table, or Gherkin `Then` | Per-step `Expected Result` column in Test Steps field |
| Priority | `Priority` field | `Priority` field |
| Labels | `Labels` field | `Labels` field |
| Components | `Components` field | `Components` field |
| Trace to User Story | Linked Issue "is tested by" | Linked Issue "is tested by" |
| Execution result | `Test Status` custom field | Xray `Test Run` inside a Test Execution |

Xray additionally exposes:

- `Test Repository` folder (flat path under the project) — not required if all Tests are under a single Regression Epic.
- `Test Sets` linked to the Test.
- `Pre-Conditions` (dedicated issue type) — reusable across Tests.

---

## 5. Naming — prefix depends on mode

The TC naming convention is the same in both modes — only the prefix differs.

```
{PREFIX}: TC#: Validate <CORE> <CONDITIONAL>
```

| Mode | `PREFIX` |
|------|----------|
| **Jira Native** | User Story ID (`PROJ-101`) |
| **Jira + Xray with Test Sets** | Test Set ID (`PROJ-150`) |
| **Jira + Xray without Test Sets** | User Story ID (`PROJ-101`) |

Pick one and stay consistent across the whole project. Mixing prefixes makes JQL searches unreliable.

Related naming:

| Entity | Pattern | Example |
|--------|---------|---------|
| Test Plan | `QA: TestPlan: <Strategy> <Version>` | `QA: TestPlan: Regression v2.1` |
| Test Set | `<Strategy>: <ID>: <Summary>` | `Sanity: PROJ-101: Allow credit card payment` |
| Test Execution | `<Strategy>: <ID>: <Summary>` | `Regression: TP-50: Sprint 50 Regression` |
| ReTesting (bug fix) | `ReTest: <BUG_ID>: <Summary>` | `ReTest: PROJ-202: Wrong error on invalid password` |
| Precondition | `<Epic>: <Component>: PRC: For <Action>` | `Checkout: Payment: PRC: For credit card flow` |

---

## 6. Workflow — states and transitions

Both modes use the same state machine. Xray does not impose its own workflow; it respects the Jira workflow attached to the Test issue type.

```
Draft
  | start design
In Design <--+ back
  | ready to run
Ready
  +-- for manual -----------> Manual (terminal-manual)
  +-- automation review ----> In Review
                                 | approve to automate
                                 v
                               Candidate
                                 | start automation
                                 v
                               In Automation
                                 | create PR
                                 v
                               Pull Request
                                 | merged
                                 v
                               Automated (terminal-automated)
```

Rules:

- Never skip a state. If a TC was wrongly moved to `Ready`, transition back with `back` to `In Design`, don't edit the status field directly.
- `Manual` and `Automated` are both terminal for day-to-day work. A Manual TC can re-enter `In Review` later if ROI changes.
- `Deprecated` is reachable from any state and can be recovered to `Draft`.

---

## 7. Description template (full TC documentation)

The Description is load-bearing in Jira Native mode and still recommended in Xray mode (Xray's structured Steps field is minimal). Paste this after the Test is created with `[ISSUE_TRACKER_TOOL] Update Issue`.

```
## Related Story
{{PROJECT_KEY}}-{n} — <Story Title>

## Priority / ROI
- Priority: {Critical|High|Medium|Low}
- ROI score: {number} (Frequency x Impact x Stability / Effort x Dependencies)
- Outcome: {Candidate|Manual|Deferred}

## Prior bugs covered
- {BUG-ID} — <one-line summary>
- (none) if first time

## Test Design

### Preconditions
- <precondition 1>
- <precondition 2>

### Action
<single sentence: what the user does>

### Expected Results (assertions of this TC — same precondition+action)
- <assertion 1>
- <assertion 2>
- <assertion 3>

### Gherkin (if Candidate)
```gherkin
@{priority} @regression @automation-candidate @{US_ID}
Scenario Outline: Validate <core> <conditional>
  Given <entity> exists with <identifier>
  When the user <main_action>
  Then <assertion 1>
  And <assertion 2>

  Examples:
    | var1 | var2 |
    | ...  | ...  |
```

## Variables
| Variable | How to obtain |
|----------|---------------|
| `{mentor_id}` | `SELECT id FROM mentors WHERE active = true LIMIT 1` |
| `{session_token}` | From login response `.token` |

## Implementation Code (filled by test-automation)
| Layer | File |
|-------|------|
| API component | `tests/components/api/MentorsApi.ts` |
| UI component | `tests/components/ui/MentorsPage.ts` |
| Test file | `tests/e2e/mentorsListing.test.ts` |
| Fixture | `tests/components/TestFixture.ts` |

## Architecture
{E2E / Integration / UI-only} — follows KATA layers.

## Available Test IDs (UI)
- `[data-testid="mentor-list"]`
- `[data-testid="mentor-card"]`
- `[data-testid="review-count"]`

## Refinement Notes
<Discrepancies found when grep'ing the code against the ATP. Empty if none.>
```

Notes:

- **Variables, not hardcoded data**: always `{mentor_id}`, never a literal UUID. The Variables table explains how to produce real values at runtime.
- **Implementation Code** table is empty at documentation time; `test-automation` fills it after the code lands.
- **Refinement Notes** captures ATP-vs-code discrepancies (routes renamed, text format changes, missing APIs). Mandatory when such discrepancies were found during source-code validation.

---

## 8. Creating a TC — pseudocode by mode

### Jira Native (Manual or Gherkin)

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test
  summary: {per TC naming convention}
  priority: {Critical|High|Medium|Low}
  labels: [regression, {smoke?}, {automation-candidate|manual-only}, {e2e|integration}]
  components: [{module}]
  epic: {REGRESSION_EPIC_KEY}

[ISSUE_TRACKER_TOOL] Link Issues:
  from: {TEST_KEY}
  to:   {STORY_KEY}
  linkType: "is tested by"

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template from §7}

[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {TEST_KEY}
  transition: start design
  # later: ready to run
  # later: for manual OR automation review -> approve to automate
```

### Jira + Xray (Cucumber)

> **Prerequisite**: Load `/xray-cli` and `/acli` skills before executing commands below.

```
[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Cucumber
  title: {per TC naming convention}
  gherkin: {from §7 Gherkin block}
  labels: [regression, automation-candidate, {scope}, {priority}]

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template from §7}

[ISSUE_TRACKER_TOOL] Link Issues:
  from: {TEST_KEY}
  to:   {STORY_KEY}
  linkType: "is tested by"

[ISSUE_TRACKER_TOOL] Link Issues:
  from: {TEST_KEY}
  to:   {TEST_SET_KEY}
  linkType: "is part of test set"   # if using Test Sets

[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {TEST_KEY}
  transition: start design
```

### Jira + Xray (Manual)

> **Prerequisite**: Load `/xray-cli` and `/acli` skills before executing commands below.

```
[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Manual
  title: {per TC naming convention}
  steps:
    - action: {step 1}
      data:   {step 1 data}
      result: {expected step 1}
    - action: {step 2}
      ...

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template from §7}
```

The two-call pattern (Xray + Update Issue) is mandatory in Xray mode. Skipping the second call leaves a TC with no readable documentation in Jira — only the bare Xray Steps field.

---

## 9. Test Plan / Test Set / Test Execution — Xray only

> **Prerequisite**: Load `/xray-cli` and `/acli` skills before executing the commands in this section. `Test Plan` and `Test Set` are created via `[ISSUE_TRACKER_TOOL]` (acli); `Test Execution` result imports use `[TMS_TOOL]` (xray-cli).

### Test Plan

Groups Tests for a release or sprint. One per release cadence.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test Plan
  summary: QA: TestPlan: Regression v2.1
  labels: [regression, {release}]

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TP_KEY}
  field: Tests
  value: [{TEST_KEY_1}, {TEST_KEY_2}, ...]
```

### Test Set

Groups Tests by domain / strategy. Reusable across sprints. TC prefix can be the Test Set ID.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test Set
  summary: Sanity: {{PROJECT_KEY}}-101: Allow credit card payment
  labels: [regression, sanity]
```

### Test Execution

One per execution run. Holds Test Runs with PASS / FAIL / TODO per Test.

```
[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: Sanity: {{PROJECT_KEY}}-101: <date>
  tests: [{TEST_KEY_1}, ...]

[TMS_TOOL] Import Results:
  format: junit      # or cucumber, xray-json
  file:   ./test-results/junit.xml
  execution: {EXEC_KEY}
```

Use `/xray-cli` skill for current CLI syntax. Import updates Test Runs automatically; no manual per-Test status updates needed.

---

## 10. CI/CD results flow

### Xray

```
Playwright runs tests
       |
       v
JUnit / Cucumber JSON report generated
       |
       v
[TMS_TOOL] Import Results -> Xray creates/updates Test Runs
       |
       v
Test Execution issue updated with pass/fail per Test
       |
       v
Test Plan rolls up execution status across all Tests
```

### Jira Native

> **Prerequisite**: Load `/acli` skill before executing commands below.

```
Playwright runs tests
       |
       v
Custom script parses JUnit output
       |
       v
For each Test:
  [ISSUE_TRACKER_TOOL] Update Issue:
    issue: {TEST_KEY}
    fields:
      Test Status: {Passed|Failed|Blocked}
  [ISSUE_TRACKER_TOOL] Add Comment:
    issue: {TEST_KEY}
    comment: "Run {date}: {result}. Duration: {ms}. CI: {url}"
```

Jira Native lacks run history per Test. If historical trend matters, store runs in a separate system (Allure, custom DB) and keep Jira as the latest-state view only.

---

## 11. Local cache — markdown per TC

After TMS creation, write one markdown per TC into `.context/PBI/{module}/{story}/tests/{TC-ID}-{slug}.md`. This lets `test-automation` hand off without re-reading the TMS.

```markdown
---
tc_id: PROJ-456
story: PROJ-123
priority: high
roi: 3.8
outcome: Candidate
labels: [regression, automation-candidate, e2e, high]
---

# PROJ-456: TC1: Validate successful login with valid credentials

## Preconditions
- <precondition 1>

## Action
<action>

## Expected Results
- <assertion 1>
- <assertion 2>

## Gherkin
```gherkin
{full gherkin}
```

## Variables
| Variable | How to obtain |
| ...      | ...           |

## Refinement Notes
<empty or discrepancy notes>
```

The frontmatter is machine-readable. A later `test-automation` run greps for `outcome: Candidate` and `labels: automation-candidate` to find work to do.

---

## 12. Jira-specific gotchas

1. **Issue Type Scheme**: if the Test issue type is missing from the project, `[ISSUE_TRACKER_TOOL] Create Issue` fails with a generic "invalid issue type" error. Check project admin -> Issue Types.

2. **Screen Scheme**: custom fields (`Test Status`, `Automation Candidate`) need to be on the Create/Edit/View screens. Otherwise they appear to "not save" — actually they are saved but hidden.

3. **Required fields**: Jira can require `Components`, `Fix Version`, `Affects Version`. These block creation silently if missing — `Create Issue` returns validation errors that are easy to miss in batch runs. Always validate a single test creation works before bulk.

4. **Permission schemes**: `Transition Issue` requires the transition permission. A user who can create Tests might not be able to transition them. Check the workflow's transition conditions before batch transitions.

5. **Link types**: "is tested by" / "tests" may not exist by default. Add them in Jira admin -> Issue Linking. Without them, `[ISSUE_TRACKER_TOOL] Link Issues` fails with "invalid link type".

6. **Xray + Jira Cloud API version**: Xray Cloud uses its own REST API separate from Jira's. The `[TMS_TOOL]` (xray-cli) handles this; do not try to create Xray Tests via `[ISSUE_TRACKER_TOOL]` directly — the resulting issue will not register in Xray's internal index.

7. **Rate limits**: Jira Cloud rate-limits at around 10 requests/sec per user. Batch operations hitting 100+ TCs need throttling. Prefer bulk endpoints (Jira `/rest/api/3/issue/bulk`, Xray `/import` endpoints) where available.

8. **Gherkin rendering**: Jira's rich-text editor mangles Gherkin indentation when pasted without a code block. Always wrap Gherkin in triple-backticks (``` ```gherkin ``` ```) inside the Description, or use Xray's dedicated Gherkin field.

9. **Character limits**: Summary is capped at 255 chars. Long TC titles ("PROJ-101: TC14: Validate successful checkout when user has multiple cards and applies stacked discounts...") truncate silently. Keep CORE + CONDITIONAL tight.

10. **Xray Test Type cannot change**: once a Test is created as `Manual`, converting it to `Cucumber` typically requires deletion and recreation. Pick the type correctly at creation time.

11. **Test Execution closure**: Xray Test Executions do not auto-close. Old Executions accumulate and skew metrics. Close them via `[ISSUE_TRACKER_TOOL] Transition Issue` once results are imported.

12. **Description overwrite**: `[ISSUE_TRACKER_TOOL] Update Issue` on Description replaces, it does not append. Always read the existing Description first if preserving earlier content matters.

---

## 13. Completeness checklist (per TC before moving to Ready)

- [ ] Summary follows `{PREFIX}: TC#: Validate <CORE> <CONDITIONAL>` — no anti-patterns
- [ ] Linked to User Story via "is tested by"
- [ ] Linked to Regression Epic (Epic Link)
- [ ] Priority set
- [ ] Labels include scope (regression/smoke/e2e/integration) and automation intent (automation-candidate or manual-only)
- [ ] Description uses the full template from §7 (no skeletons or TODOs)
- [ ] Variables table present if Gherkin references placeholders
- [ ] Prior bugs covered section filled (or "none")
- [ ] Refinement Notes filled if source-code validation found discrepancies
- [ ] Xray mode: Test Type set (Manual / Cucumber / Generic)
- [ ] Xray mode: Linked to Test Set (if project uses Test Sets)
- [ ] Workflow state = Ready (or Manual / Candidate once decision is made)
- [ ] Local cache markdown created under `.context/PBI/{module}/{story}/tests/`

---

## 14. Anti-patterns to reject

- **Summary**: `Login test`, `Login - error`, `TC1: Test form` — missing prefix, TC#, CORE, and CONDITIONAL.
- **Description**: bullet list of actions without expected results. Every step needs an expected, or use Gherkin.
- **Hardcoded data**: UUIDs, emails, passwords in Gherkin. Use `{variable}` + Variables table.
- **Splitting assertions into separate TCs**: "TC1: check panel A appears", "TC2: check panel B appears", "TC3: check panel C appears" where precondition+action is identical. These are one TC with three assertions.
- **Cross-cutting as TCs**: "Mobile responsive", "XSS prevention", "Performance", "Accessibility" as standalone TCs. These are validated inside other TCs or in an app-level suite.
- **Creating TCs before ATP/ATR exist**: leaves orphaned references. Always create ATP and ATR first, link them to the US, link ATP to ATR, and only then create each TC with links to US + ATP + ATR + AC.
- **Summary > 255 chars**: truncates silently. Shorten CONDITIONAL if needed.
- **Manual steps in Xray with no Description**: creating Xray Manual Tests but skipping `[ISSUE_TRACKER_TOOL] Update Issue` leaves a TC with minimal context. Always populate the full Description template.
