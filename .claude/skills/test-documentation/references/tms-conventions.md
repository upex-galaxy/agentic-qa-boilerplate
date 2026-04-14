# TMS Conventions — Naming, Formats, Fields, Labels, ROI

The rulebook for documenting tests in any TMS. Read this when naming a TC, picking a format (Gherkin vs Traditional), setting fields, choosing labels, transitioning states, or scoring ROI.

---

## 1. Central principle

Document only tests that are already validated. The TMS is a tracking and regression-protection tool, not an exploration tool.

```
Explore (validate feature)   ->   Analyze (classify scenarios)   ->   Document (create TMS artifacts)
     ^                                                                        |
     |                                                                        v
     +--- NEVER document here                                 Document ONLY stable tests here
```

### When to create a TC

| Situation | Action | Reason |
|-----------|--------|--------|
| Feature explored and stable | Create TC | Behavior confirmed; documentation is reliable |
| Feature has critical open bugs | Wait for fixes | Documenting unstable behavior creates maintenance debt |
| Before any exploration | Do NOT document | You do not know what the system actually does yet |
| Bug fix verified | Create regression TC | Prevent recurrence |
| Hotfix deployed | Create smoke TC | Critical path must be continuously validated |

Decision rule: if you cannot confidently describe the expected behavior, the feature is not ready for TMS documentation.

---

## 2. TC naming convention (mandatory)

### Format by tool

| Tool stack | Format |
|-----------|--------|
| **Xray with Test Sets** | `{TS_ID}: TC#: Validate <CORE> <CONDITIONAL>` |
| **Xray without Test Sets** or **Jira native** | `{US_ID}: TC#: Validate <CORE> <CONDITIONAL>` |

### Components

| Component | What it is | Examples |
|-----------|-----------|----------|
| `TS_ID` | Test Set ID (Xray Test Set) | `GX-150` |
| `US_ID` | User Story ID | `GX-101` |
| `TC#` | Sequential TC number | `TC1`, `TC2`, `TC3` |
| `CORE` | The behavior: verb + object | `successful login`, `authentication error`, `cart behavior` |
| `CONDITIONAL` | The distinguishing condition | `with valid credentials`, `when password is incorrect`, `when exceeding 5 failed attempts` |

### Examples by test type

| Type | CORE | CONDITIONAL | Full title |
|------|------|-------------|-----------|
| Positive | successful login | with valid credentials | `GX-101: TC1: Validate successful login with valid credentials` |
| Negative | authentication error | when password is incorrect | `GX-101: TC2: Validate authentication error when password is incorrect` |
| Boundary | character limit | when entering exactly 50 chars | `GX-101: TC3: Validate character limit when entering exactly 50 chars` |
| Edge | cart behavior | when there are multiple same items | `GX-101: TC4: Validate cart behavior when there are multiple same items` |

### Anti-patterns (reject)

| Wrong | Right | Why |
|-------|-------|-----|
| `Login test` | `GX-101: TC1: Validate successful login with valid credentials` | Missing ID, TC#, CORE, CONDITIONAL |
| `Login - error` | `GX-101: TC2: Validate authentication error with invalid password` | Too vague |
| `TC1: Test form` | `GX-101: TC1: Validate form submission with all fields` | Missing ID; CORE not specific |
| `Should work correctly` | `GX-101: TC1: Validate successful login with valid credentials` | No behavior, no condition |

### Code-side naming (KATA)

The same TC, when implemented in code, uses:

```
test('PROJ-101: should <behavior> when <condition>', ...)
```

The prefix is the TMS-generated key (e.g., `PROJ-101`), not an invented convention. The `@atc('PROJ-101')` decorator carries the same key. This is what makes traceability work end-to-end.

---

## 3. Naming for other TMS artifact types

| Artifact | Format | Example |
|----------|--------|---------|
| User Story | `{{PROJECT_KEY}}-{n}` | `PROJ-123` |
| ATP | `Test Plan: {{PROJECT_KEY}}-{n}` | `Test Plan: PROJ-123` |
| ATR | `Test Results: {{PROJECT_KEY}}-{n}` | `Test Results: PROJ-123` |
| Test Suite (TS) | `<Strategy>: <ID>: <SUMMARY>` | `Sanity: GX-101: Allow credit card payment`; `Smoke: Core Features v2.0`; `Regression: Sprint 50` |
| Test Plan (Xray) | `QA: TestPlan: <Strategy> <Version>` | `QA: TestPlan: Regression S50`; `QA: TestPlan: Smoke v2` |
| Test Execution (TX) | `<Strategy>: <ID>: <SUMMARY>` | `Sanity: GX-101: Allow credit card payment`; `Regression: TP-50: Sprint 50 Regression` |
| ReTesting (RTX) | `ReTest: <BUGID>: <ISSUE_SUMMARY>` | `ReTest: GX-202: Does not show error when entering incorrect password` |
| Precondition (PRC) | `<EPIC>: <COMPONENT>: PRC: For <NEXT_ACTION>` | `CheckoutFlow: Payment: PRC: For processing credit card payment` |

---

## 4. TC required fields

Every TC in the TMS must have these fields populated. Exact field names vary by tool; the information must be present.

### Always required

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| ID | Auto-generated | Unique identifier | `PROJ-101` |
| Summary / Title | Text | TC name following naming convention | `GX-101: TC1: Validate ...` |
| Description / Steps | Long text | Gherkin or traditional step table | See §6 |
| Test Status | Select | Execution state | `NOT RUN` / `PASSED` / `FAILED` |
| Workflow Status | Select | Lifecycle state | `Draft`, `Ready`, `Candidate`, `Automated`, ... |
| Priority | Select | Business risk priority | `Critical` / `High` / `Medium` / `Low` |
| Labels | Multi-select | Classification tags | `regression`, `smoke`, `e2e` |
| Automation Candidate | Boolean | Automation flag | true / false |
| Parent | Link | Regression Epic | Epic: `Test Repository` |
| Linked Story | Link | Traceability to requirement | `PROJ-100` |

### Conditional

| Field | When required | Purpose |
|-------|--------------|---------|
| Linked Bug | When the TC is blocked by a bug | "is blocked by" |
| Automation Comment | When Automation Candidate = Yes | Justification: ROI score, reasoning |
| Test Data | When the test needs specific data | Inputs, preconditions, DB state |

---

## 5. Workflow state machine

### The full lifecycle

```
                                                    +------------+
                                                    | DEPRECATED |
                                                    +------------+
                                                          ^
                                                          | Any state
                                                          |
  Draft -> In Design -> Ready -+-- for manual --> Manual -+
                         ^     |                          |
              back       |     +-- automation review --> In Review
                         |                                   |
                         |                                   +-- approve to automate --> Candidate
                         |                                                                   |
                         |                                                                   +-- start automation --> In Automation
                         |                                                                                                |
                         |                                                                                                +-- create PR --> Pull Request
                         |                                                                                                                      |
                         |                                                                                                                      +-- merged --> Automated
                         |                                                                                                                                        |
                         +---------------------------------------------------------------------------------------------------------- back (rework) ---------------+
```

### State definitions

| State | Description | Entry | Exit |
|-------|-------------|-------|------|
| **Draft** | Newly created, placeholder | TC artifact created | Steps / Gherkin writing begins |
| **In Design** | Steps being written | Draft + linked story | Steps reviewable |
| **Ready** | Documented and complete | Steps reviewed | Manual or automation decision |
| **Manual** | Manual regression only | Not an automation candidate | Can be reconsidered later |
| **In Review** | Automation ROI under evaluation | Marked as candidate | Approved or rejected |
| **Candidate** | Approved for automation | Positive ROI | Automation begins |
| **In Automation** | ATC being implemented | Developer starts coding | PR created |
| **Pull Request** | Code submitted, awaiting merge | PR opened | PR merged |
| **Automated** | Running in CI/CD | PR merged | Final (unless deprecated) |
| **Deprecated** | Obsolete | Feature removed | Can be recovered |

### Rules

1. **No skipping** — Draft cannot jump to Automated.
2. **Backward transitions are limited** — only "back to In Design" and "any state to Deprecated".
3. **Manual is not a dead end** — Manual can later move to In Review if ROI changes.
4. **Automated is the goal** — move as many as reasonable into Automated.

### Transition names (used in `[ISSUE_TRACKER_TOOL] Transition Issue`)

| Transition | From -> To | Trigger |
|-----------|-----------|---------|
| `start design` | Draft -> In Design | Documentation begins |
| `ready to run` | In Design -> Ready | Documentation complete |
| `for manual` | Ready -> Manual | Not a candidate |
| `automation review` | Ready -> In Review | Evaluate ROI |
| `approve to automate` | In Review -> Candidate | Positive ROI |
| `start automation` | Candidate -> In Automation | Stage 5 begins |
| `create PR` | In Automation -> Pull Request | PR created (often auto) |
| `merged` | Pull Request -> Automated | PR merged (often auto) |

---

## 6. TC formats — Gherkin vs Traditional

Two formats are supported. Pick based on the automation path.

### Format selection rule

| Criterion | Gherkin | Traditional |
|-----------|---------|-------------|
| Automation candidate | Yes | No |
| Steps deterministic | Yes | May vary |
| Expected results exact | Yes | Subjective |
| Requires human judgment | No | Yes |

### Gherkin (for Candidates — high-quality pattern)

```gherkin
Feature: User Login

  Background:
    Given the system is in initial state

  @critical @smoke @regression @automation-candidate @{US_ID}
  Scenario Outline: Validate <core> <conditional>
    """
    Bugs covered: {BUG-ID1}, {BUG-ID2}
    Related Story: {US_ID}
    Priority: Critical
    ROI Score: 5.2
    """

    # === PRECONDITIONS (tester / script builds them) ===
    Given a <entity> exists with <identifier> in the database
    And <entity> has <quantity> <elements> where <quantity> <condition>
    And the user <authentication_state>

    # === ACTION ===
    When the user navigates to "<route>"
    And the user <main_action>

    # === VALIDATIONS ===
    Then <ui_element> is displayed with format "<expected_format>"
    And <additional_validation>

    # === EQUIVALENT PARTITIONS ===
    Examples: Happy path
      | entity | identifier | quantity | elements | condition | authentication_state | route | main_action | ui_element | expected_format | additional_validation |
      | ...    | ...        | ...      | ...      | ...       | ...                  | ...   | ...         | ...        | ...             | ...                   |

    Examples: Edge case
      | ... |

    Examples: Singular vs plural
      | ... |
```

Required elements:

| Element | Purpose |
|---------|---------|
| `Background` | Common context reused across scenarios |
| `Scenario Outline` + `Examples` | Parameterization; one per equivalence partition |
| Named `Examples:` | Clear partition labels (Happy path, Edge case, ...) |
| `<variables>` | Placeholders; never hardcoded values |
| `# === comments ===` | Visual structure (Preconditions / Action / Validations / Partitions) |
| `"""` docstring | Metadata: bugs, story, priority, ROI |
| Multi-tag | Priority + scope + automation + story ID |

### Traditional (for Manual TCs)

```
| Step | Action                | Test Data        | Expected Result         |
|------|----------------------|------------------|--------------------------|
| 1    | Navigate to /login    | -                | Login form visible       |
| 2    | Enter email           | user@example.com | Field shows entered val  |
| 3    | Enter password        | Password123!     | Field is masked          |
| 4    | Click Submit          | -                | Redirect to dashboard    |
| 5    | Verify welcome message| -                | "Welcome, User" visible  |
```

Use Traditional when: visual/subjective verification, exploratory elements, or explicitly marked `manual-only`.

### When to use which Gherkin construct

| Construct | Use when |
|-----------|----------|
| Simple `Scenario` | Only 1 case, no variations |
| `Scenario Outline` + `Examples` | Multiple equivalence partitions |
| `Background` | Several scenarios share preconditions |

---

## 7. Variable pattern (mandatory for Gherkin)

Never hardcode real data in TCs. Tests are executed repeatedly throughout the project's life; production/staging data changes. Use variables that describe the **type** of data.

### When to use a specific value

Only when the acceptance criterion itself defines the value:

```gherkin
# CORRECT - business rule defines the limit
Then the field must accept maximum 500 characters

# CORRECT - format is part of the requirement
Then the rating is displayed in "X.X/5.0" format
```

### Before vs after

```gherkin
# WRONG - hardcoded
Given a mentor exists with user_id "550e8400-e29b-41d4-a716-446655440000"
And the mentor has 23 reviews with average rating 4.7/5.0

# CORRECT - variable pattern
Given a verified mentor exists with {mentor_id} in the database
And the mentor has {N} reviews where {N} > 0
And the average rating {average} = sum of ratings / {N}
```

### Variables table (mandatory in TC Description)

Every TC with variables must include a table explaining how to obtain each one:

```
| Variable     | Description                  | How to obtain                                                              |
|--------------|------------------------------|----------------------------------------------------------------------------|
| {mentor_id}  | Verified mentor UUID         | SELECT id FROM profiles WHERE role='mentor' AND is_verified=true LIMIT 1   |
| {N}          | Review count                 | SELECT COUNT(*) FROM reviews WHERE subject_id = {mentor_id}                |
| {average}    | Average rating               | SELECT AVG(rating) FROM reviews WHERE subject_id = {mentor_id}             |
```

### Benefits

- **Durability**: the TC does not need updates when data changes.
- **Portability**: works in local, staging, QA.
- **Clarity**: the tester understands what they need.
- **Automation**: scripts can parameterize dynamically.

---

## 8. Labels and tagging

### Required (scope — at least one)

| Label | Meaning | When to apply |
|-------|---------|--------------|
| `smoke` | Critical path, must always pass | Core user journeys: login, checkout, main navigation. Aim for 10-20% of the suite. |
| `regression` | Full regression suite | Any stable, documented TC |
| `e2e` | End-to-end user journey | Tests spanning multiple features/modules |
| `integration` | API-level integration | Tests validating API contracts between services |
| `functional` | Isolated functional | Form validation, single-unit behavior |

### Automation status (applied during workflow)

| Label | Meaning | When applied |
|-------|---------|--------------|
| `automation-candidate` | Marked for automation | After positive ROI |
| `manual-only` | Cannot or should not be automated | Human judgment / visual / physical |
| `automated` | Implemented in code | After PR merged and test runs in CI |

### Priority (optional)

| Label | Maps to |
|-------|---------|
| `critical` | P1 |
| `high` | P2 |
| `medium` | P3 |
| `low` | P4 |

### Rules

1. Every TC gets `regression` unless it is explicitly throwaway or exploratory-only.
2. `smoke` is exclusive — only critical business path TCs.
3. `e2e` and `integration` describe **type**, not priority. A TC can be both `smoke` and `e2e`.
4. `manual-only` and `automated` are mutually exclusive.
5. `automation-candidate` is removed once the TC becomes `automated` or returns to `manual-only`.

---

## 9. ROI formula and automation decision

### The formula

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies)
```

Each factor scored 1-5:

| Factor | 1 | 2 | 3 | 4 | 5 |
|--------|---|---|---|---|---|
| **Frequency** (how often run) | Yearly / rarely | Every release | Every sprint | Daily | Every PR / commit |
| **Impact** (if it fails) | Cosmetic | Minor inconvenience | Degrades UX | Blocks feature | Revenue / core business |
| **Stability** (of the flow) | Very volatile, active dev | Unstable | Moderate, changes every sprint | Stable, minor changes | Unchanged for months |
| **Effort** (to automate) | Trivial (minutes) | Low (hours) | Moderate (1-2 days) | High (several days) | Very high (week+) |
| **Dependencies** | None / self-contained | 1-2 simple | 3-4 | 5+ | Complex externals |

Effort and Dependencies are divisors — higher score = worse.

### ROI decision thresholds (strict)

| Score | Decision | Action |
|-------|----------|--------|
| > 5.0 | **Automate** | Excellent ROI; include in regression |
| 3.0 - 5.0 | **Automate with caution** | Evaluate if a simpler alternative exists |
| 1.5 - 3.0 | **Case by case** | Prior bug? Critical flow? If no, defer |
| 0.5 - 1.5 | **Probably defer** | Include only if prior bug |
| < 0.5 | **Defer** | Not worth the maintenance cost |

These thresholds are strict by design:

1. Every test has maintenance cost.
2. Most bugs do not recur after the first fix.
3. Fewer well-chosen tests > many low-value tests.

### Component value bonus (reusability)

```
Component Value = Base ROI x (1 + 0.2 x N)
```

where `N` = number of E2E flows that reuse the TC. A low-ROI atomic like `authenticateSuccessfully` can become automate-worthy purely through reuse (used in 5 flows: 1.5 x 2.0 = 3.0 -> Automate).

### Phase 0 filter (applied BEFORE ROI)

For every candidate, answer three questions:

1. **Does it protect against FUTURE regressions?** If it was a one-time validation (typo, pluralization, rarely-touched code), defer.
2. **Are there PRIOR bugs?** If yes, prioritize even at moderate ROI.
3. **Is it APP-level or FEATURE-level?** XSS, a11y, performance, responsive are APP-level suites, not per-feature TCs.

Phase 0 fails -> Deferred. Phase 0 passes -> apply ROI.

### Risk matrix (sanity cross-check)

|                       | High probability | Medium | Low |
|-----------------------|------------------|--------|-----|
| **High impact** | P1 Critical | P2 High | P3 Medium |
| **Medium impact** | P2 High | P3 Medium | P4 Low |
| **Low impact** | P3 Medium | P4 Low | P5 Optional |

| Priority | Meaning | Automation urgency | CI/CD behavior |
|----------|---------|---------------------|----------------|
| P1 Critical | System unusable if this fails | Automate immediately | Runs on every commit (smoke) |
| P2 High | Major feature broken | Automate this sprint | Runs on PR merge |
| P3 Medium | Feature degraded, workaround exists | When capacity allows | Runs nightly or pre-release |
| P4 Low | Minor inconvenience | Evaluate ROI first | Runs weekly / on-demand |
| P5 Optional | Nice-to-have | Keep manual unless trivial | Manual regression only |

### Marking a Candidate in the TMS

```
[TMS_TOOL] Update test:
  test: {TEST_KEY}
  fields:
    automationCandidate: true
    labels: add "automation-candidate"
  comment: "ROI assessment: Frequency=4, Impact=5, Stability=4, Effort=2, Dependencies=1. ROI=4.0. Prior bug: BUG-XYZ. High-frequency critical path, low effort to automate."
```

---

## 10. TC identity — one TC, multiple assertions

A TC is defined by **Precondition + Action**. All expected results from the same (precondition, action) pair belong to the **same TC**.

```
Same TC (multiple assertions):
  Precondition: valid credentials + active account
  Action:       submit login
  Expected:     - redirect to dashboard
                - auth token in response
                - user profile accessible via /auth/me
                - session cookie set
                - welcome message shows user's name

Different TCs (preconditions differ):
  TC-A: Precondition = valid credentials      -> Action = submit login -> Expected = success
  TC-B: Precondition = locked account         -> Action = submit login -> Expected = 423 error
  TC-C: Precondition = invalid credentials    -> Action = submit login -> Expected = 401 error
```

Splitting one (precondition, action) into 5 "check panel A" / "check panel B" / ... TCs is a canonical anti-pattern.

### Equivalence Partitioning

Inputs producing the **same output** -> one parameterized TC (Scenario Outline + Examples).
Inputs producing **different outputs** -> separate TCs.

Example: all invalid credentials (wrong email, wrong password, empty fields) producing 401 -> one parameterized TC `loginWithInvalidCredentials`. Locked account producing 423 -> separate TC.

### Boundary Value Analysis

Test at the edges of equivalence classes. 7 chars (just below min) and 65 chars (just above max) are interesting; 30 chars in the middle of the valid range is not.

---

## 11. Traceability links

### Every TC must link to

| Link | Type | When |
|------|------|------|
| User Story | "tests" / "is tested by" | Always |
| ATP (Test Plan) | Parent / reference | Always, after ATP exists |
| ATR (Test Results) | Reference | Always, after ATR exists |
| Regression Epic | Parent | Always |
| Acceptance Criterion | Reference | Always |
| Bug (if blocked) | "is blocked by" | When a bug prevents execution |

### Regression Epic (test repository)

All TCs must belong to a Regression Epic — the permanent repository for the project. Before creating any TC:

```
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: type = Epic AND (summary ~ "regression" OR summary ~ "test repository" OR labels = "test-repository")
```

If none exists, ask the user before creating:

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Epic
  title: "{{PROJECT_KEY}} Test Repository"
  description: "Container epic for all {{PROJECT_KEY}} regression tests."
  labels: test-repository, regression, qa
```

Typical structure:

```
EPIC: {{PROJECT_KEY}} Test Repository
  |-- TC-001: [Smoke] Basic login
  |-- TC-002: [Smoke] Main navigation
  |-- TC-003: [Regression] Complete checkout
  |-- TC-004: [Regression] User profile update
  |-- TC-005: [E2E] Complete purchase flow
  +-- ... (added incrementally)
```

---

## 12. CI/CD sync rules

Automated results flow from CI to the TMS:

```
1. EXECUTE — Playwright runs tests with @atc decorators
2. REPORT  — Generate results (JUnit XML / JSON / Cucumber JSON)
3. SYNC    — CLI pushes results to TMS
4. UPDATE  — TMS Test Status + execution records updated
5. NOTIFY  — Team sees results in TMS dashboard
```

### Rules

1. **Sync only from CI** — never from local runs (they pollute the TMS).
2. **Sync on main/staging only** — feature branch results are ephemeral.
3. **Include build context** — every sync carries build ID, environment, timestamp.
4. **Handle failures gracefully** — a sync failure must not break the CI pipeline.

### Pseudocode

```
[TMS_TOOL] Import results:
  format: junit | cucumber
  file: {from CI test results path}
  project: {{PROJECT_KEY}}
  execution: {from execution key or auto-create}

[TMS_TOOL] Create execution:
  project: {{PROJECT_KEY}}
  title: {per execution naming convention}
  tests: {from test plan or label filter}

[TMS_TOOL] Update test status:
  test: {TEST_KEY}
  status: PASS | FAIL | BLOCKED
  comment: "Build: {CI build ID}, Env: {environment}"
```

---

## 13. Best practices

### Do

- Create TCs **after** the feature is stable and validated.
- Link every TC to its source story, ATP, ATR, and AC.
- Use Gherkin for automatable TCs; Traditional for manual.
- Evaluate ROI before marking candidates.
- Keep the Regression Epic as the single source of truth.
- Transition states sequentially — follow the workflow.
- Include test data and variables in the Description.
- Review TCs periodically and deprecate obsolete ones.
- Think of TCs as reusable components (atomic TCs compose into E2E flows).

### Don't

- Create TCs before exploring the feature.
- Create TCs without a parent (Regression Epic).
- Create TCs without traceability to a requirement.
- Skip workflow states (e.g., Draft directly to Automated).
- Automate without evaluating ROI first.
- Duplicate TCs for the same scenario (same precondition + action = same TC).
- Leave status stale after automating (update the TMS when the PR merges).
- Use generic summaries like `"Login test"` — follow the naming convention.
- Sync local test runs to the TMS.

---

## 14. Reference implementation — Jira + Xray

| Convention | Jira/Xray implementation |
|------------|-------------------------|
| TC ID | Jira issue key |
| TC issue type | Xray Test |
| Test Status field | Xray Test Status or Jira custom field |
| Workflow Status | Jira custom workflow or Xray Test Status |
| Regression Epic | Jira Epic with label `test-repository` |
| Test Execution | Xray Test Execution |
| Results import | Xray REST API (JUnit / Cucumber) |
| CLI | `bun xray` (load `/xray-cli` skill) |

Other TMS tools (Coda, Azure DevOps, TestRail) apply the same naming, labeling, workflow, and ROI conventions — only the underlying issue types differ.
