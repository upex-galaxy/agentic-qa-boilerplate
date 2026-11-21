# TMS Conventions: Naming, Formats, Fields, Labels, ROI

The rulebook for documenting tests in any TMS. Read it when you name a TC, pick a format (Gherkin or Traditional), set fields, choose labels, transition states or score ROI. Titles, labels and ID formats here are parsed by later stages, so copy the literals exactly.

---

## 1. Central principle

Document only tests that are already validated. The TMS tracks tests and protects against regressions; it is not where you explore, because documenting behavior you have not confirmed creates maintenance debt.

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
| Before any exploration | Do not document | You do not know what the system actually does yet |
| Bug fix verified | Create regression TC | Prevent recurrence |
| Hotfix deployed | Create smoke TC | Critical path must be continuously validated |

If you cannot confidently describe the expected behavior, the feature is not ready for TMS documentation.

---

## 2. TC naming convention (mandatory)

### Format (all tools, all modalities)

The prefix is always the User Story key (`{US_ID}`), never the Test Set ID, in every modality (Jira-native, Xray with Test Sets, Xray without Test Sets).

```
{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]
```

> Membership in the Story's ATS is a TC→ATS issue link in both modalities. Under Modality jira-xray it is also Xray-internal state (managed via `/xray-cli`, read via the test enrich command of `/xray-cli`). It never goes in the TC title (`../../agentic-qa-core/references/traceability-linking.md` §9).

### Components

| Component | What it is | Examples |
|-----------|-----------|----------|
| `US_ID` | User Story ID (always the prefix) | `GX-101` |
| `TC#` | Sequential TC number | `TC1`, `TC2`, `TC3` |
| `CORE` | Expected outcome (verb + object), phrased after `should` | `grant access`, `reject login`, `cap input` |
| `CONDITIONAL` | Optional connector clause (`when …` / `if …`) plus optional `given …` | `when credentials are valid`, `if password is incorrect`, `when cart is empty given a logged-in user` |

### Examples by test type

| Type | CORE | CONDITIONAL | Full title |
|------|------|-------------|-----------|
| Positive | grant access | when credentials are valid | `GX-101: TC1: should grant access when credentials are valid` |
| Negative | reject login | if password is incorrect | `GX-101: TC2: should reject login if password is incorrect` |
| Boundary | cap input | when exceeding 50 chars | `GX-101: TC3: should cap input when exceeding 50 chars` |
| Edge | block checkout | when cart is empty given a logged-in user | `GX-101: TC4: should block checkout when cart is empty given a logged-in user` |

### Anti-patterns (reject)

| Wrong | Right | Why |
|-------|-------|-----|
| `Login test` | `GX-101: TC1: should grant access when credentials are valid` | Missing ID, TC#, outcome, condition |
| `Login - error` | `GX-101: TC2: should show auth error when password is incorrect` | Too vague |
| `TC1: Test form` | `GX-101: TC1: should submit form when all fields are filled` | Missing ID; outcome not specific |
| `should work correctly` | `GX-101: TC1: should grant access when credentials are valid` | No concrete outcome and no condition. The word "should" is not the problem |

### Code-side naming (KATA)

The same TC, when implemented in code, uses:

```
test('PROJ-101: should <behavior> when <condition>', ...)
```

The prefix is the TMS-generated key (for example `PROJ-101`), not an invented one. The `@atc('PROJ-101')` decorator carries the same key, and that shared key is what makes traceability work end to end.

---

## 3. Naming for other TMS artifact types

All Plans and Runs follow one unified grammar, the QA planning ladder:

```
{ACRONYM}: {scope-id}: {descriptor}
```

- `ACRONYM`: `FTP` · `STP` · `ATP` · `RTP` (Plans) · `STR` · `ATR` · `RTR` (Runs; there is no FTR rung, because feature results are read from the per-Story ATRs and reviewed at sprint close next to the STR, and the results side has no aggregation edge) · `ATS` (Acceptance Test Set, per-Story, mandatory) · `TS` (feature-level Test Set, optional grouping) · `ReTest` (bug re-test Run). A reader or a JQL query sees altitude and plan-versus-run in the first token, and each Plan pairs visually with its Run.
- `scope-id`: the key of the thing under test at that altitude: feature-Epic key, `Sprint#{N}`, Story key, or the project key or module for the product-altitude RTP.
- `descriptor`: human-readable text that embeds the testing term where required (`Story Testing`, `Feature Testing`, `Regression Testing`).

| Artifact | Jira work type | Format | Example |
|----------|----------------|--------|---------|
| User Story | Story | `{{PROJECT_KEY}}-{n}` | `PROJ-123` |
| ATP: Story Test Plan | Test Plan | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-123: Apply discount at checkout` |
| ATR: Story Test Execution | Test Execution | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-123: Story Testing` |
| FTP: Feature Test Plan | Test Plan | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` |
| STP: Sprint Test Plan | Test Plan | `STP: Sprint#{N}: {objective}` | `STP: Sprint#30: Payments hardening` |
| RTP: Regression Test Plan (product-altitude, long-lived) | Test Plan | `RTP: {PROJECT_KEY\|module}: Regression Test Plan` | `RTP: PROJ: Regression Test Plan` |
| STR: Sprint Test Results | Test Execution | `STR: Sprint#{N}: Regression Testing` | `STR: Sprint#30: Regression Testing` |
| RTR: Regression Test Results (one per verdict) | Test Execution | `RTR: {env}-{YYYY-MM-DD}\|{release-tag}: Regression Testing` | `RTR: staging-2026-09-23: Regression Testing` |
| ATS: Acceptance Test Set (per-Story, mandatory) | Test Set | `ATS: {US_ID}: {story title}` | `ATS: GX-101: Pay with credit card` |
| Test Set (TS, feature-level, optional) | Test Set | `TS: {EPIC-KEY\|module}: Validate {feature}` | `TS: GX-42: Validate credit card payment` |
| ReTesting (RTX) | Test Execution | `ReTest: {BUG-KEY}: {summary}` | `ReTest: GX-202: Does not show error when entering incorrect password` |
| Precondition | Precondition | `{COMPONENT}: {required state}` (no ladder acronym) | `Payment: Authenticated user with a saved card` |

Notes:

- Items beat fields. Every Plan is a Test Plan issue and every Run is a Test Execution issue, in both modalities (these are native Jira work types, independent of Xray). The Story custom field for ATP/ATR is a degraded fallback, used only when those work types are unavailable in the instance. See `tms-architecture.md` §Container per modality.
- QA-process Epic homes (3-axis model): every Test Plan (FTP/STP/ATP/RTP) parents to QA Master Test Plan; every Test Execution (STR/ATR/RTR), Test Set (ATS and TS) and Precondition parents to QA Test Artifacts; every Test (TC) parents to QA Test Repository. The parent says only which QA bucket. Scope (Story, feature, Sprint) travels on an issue link and product area on `components`. `components` is mandatory on Tests, Test Plans, Test Executions and the per-Story ATS (all inherit the source Story's components), and optional only on the feature-level `TS:`, because a feature Set can span modules and its member Tests carry them.
- `ReTest:` is already prefix-style and stays as it is. It is a Test Execution under QA Test Artifacts.
- Precondition: the title states the required state and the content holds the setup steps, kept distinct (`Payment: Authenticated user with a saved card` titles the state; the steps to reach it live in the issue body).
- The ATS is mandatory per Story, even with a single TC, and holds all the Story's TCs; the ATP's and the Execution's test lists derive from its membership (Set-first). Its ATS→Story `is tested by` link is what fills the Xray coverage panel; ATP and ATR links do not (verified live). The feature-level `TS:` survives as an optional grouping (smoke, regression or feature suite).
- `Validate` stays the feature-level Test Set grouping word (consistent with the code `describe()` law); the `TS:` prefix adds the work-type and altitude signal on top. The per-Story `ATS:` mirrors the Story title instead.

---

## 4. TC required fields

Every TC in the TMS has these fields populated. Exact field names vary by tool; the information must be present.

### Always required

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| ID | Auto-generated | Unique identifier | `PROJ-101` |
| Summary / Title | Text | TC name following naming convention | `GX-101: TC1: should ...` |
| Description / Steps | Long text | Gherkin or traditional step table | See §6 |
| Test Status | Select | Execution state | `NOT RUN` / `PASSED` / `FAILED` |
| Workflow Status | Select | Lifecycle state | `Draft`, `In Design`, `READY`, `In Review`, `Candidate`, `In Automation`, `Pull Request`, `AUTOMATED`, `MANUAL`, `DEPRECATED` (§5) |
| Priority | Select | Business risk priority | `Critical` / `High` / `Medium` / `Low` |
| Labels | Multi-select | Classification tags | `regression`, `smoke`, `e2e` |
| Components | Multi-select | Affected product module, mandatory (defect-management doctrine Part 3) | `Payments` |
| Automation Candidate | Boolean | Automation flag | true / false |
| Parent | Link | Regression Epic | Epic: `QA Test Repository` |
| Linked Story | Link | Traceability to the requirement, by cascade: primary through the Story's ATS (membership + ATS→Story `is tested by`, the coverage-panel link); jira-xray adds ATP (`is designed by`) / ATR (`is executed by`) administrative edges; jira-native without a Test Set work type links the TC to the Story directly (`is tested by`, the cascade's last resort) | `PROJ-100` (direct, last resort) |

### Conditional

| Field | When required | Purpose |
|-------|--------------|---------|
| Linked Bug | When the TC is blocked by a bug | "is blocked by" |
| Automation Comment | When Automation Candidate = Yes | Justification: ROI score, reasoning |
| Test Data | When the test needs specific data | Inputs, preconditions, DB state |

### IQL: Test Status (Workflow) vs Execution Status (Run)

These are two independent fields with two independent lifecycles. Mixing them is the most common cause of bad dashboards, bad JQL and stale triage decisions.

| Dimension | Test Status (Workflow) | Execution Status (Run) |
|-----------|----------------------------|-----------------------------|
| Lives on | The Test issue itself | A single Test Run inside a Test Execution (Xray) or a Test Status custom field on the Test issue (Jira-native) |
| Answers | "Where is this TC in its documentation / automation lifecycle?" | "Did the TC pass the last time we ran it?" |
| Values | `Draft` / `In Design` / `READY` / `MANUAL` / `In Review` / `Candidate` / `In Automation` / `Pull Request` / `AUTOMATED` / `DEPRECATED` | `TODO` / `EXECUTING` / `PASS` / `FAIL` / `ABORTED` / `BLOCKED` |
| Changed by | QA analyst, QA engineer (manual transitions) | Execution: either a human runner or `[TMS_TOOL] Import Results` in CI |
| Persists across runs | Yes (workflow is the long-lived state) | No (each Test Run carries its own status; history lives in the Test Execution) |
| Used by | Planning, ROI prioritization, automation intake | Regression reporting, GO / NO-GO, CI health |

Canonical Execution Status values (used in every TMS):

| Value | Icon | Meaning | Next action |
|-------|------|---------|-------------|
| `TODO` | gray | Not yet executed in this run | Execute or skip |
| `EXECUTING` | blue | Run in progress | Wait for completion |
| `PASS` | green | Passed in this run | Keep in regression |
| `FAIL` | red | Failed in this run | Investigate / file bug |
| `ABORTED` | orange | Execution stopped (crash, timeout, user-abort) | Review environment, retry |
| `BLOCKED` | yellow | Could not execute (missing data, dep down) | Resolve blocker, retry |

What this means for reporting:

- "TC is `AUTOMATED`" (workflow) is compatible with "last Test Run was `FAIL`" (run). The TC is live in CI, but its last run failed.
- ATR's "PASSED / FAILED / PASSED WITH ISSUES" rollup comes from the Execution Status across all TCs in the ATR, not from the Test Status.
- A TC in `Draft` (workflow) never has an Execution Status, because it has not been executed yet.
- When a skill says "Test Status: NOT RUN / PASSED / FAILED", it means the Execution Status field in Jira-native mode (where there is no separate Test Run entity). In Xray mode the equivalent lives on the Test Run and `NOT RUN` maps to `TODO`.

---

## 5. Workflow state machine

> Source of truth: `.agents/jira-workflows.json` (`work_types.test_case`) declares every status and transition name below, and a status absent from that file does not exist in the instance (`Approved`, `Automating` and `Merge Request` are common inventions and none of them exist). See `.agents/jira-required.yaml` `work_types.test_case` for the methodology's required slugs. Skills resolve names through `{{jira.status.test_case.<slug>}}` and `{{jira.transition.test_case.<slug>}}`. If your project's Jira renames a state or transition, run `bun run jira:sync-workflows` to refresh the substrate so the slug to literal-name mapping stays correct.

### The full lifecycle

```
                                                    +------------+
                                                    | DEPRECATED |
                                                    +------------+
                                                          ^
                                                          | Any state
                                                          |
  Draft -> In Design -> READY -+-- for manual --> MANUAL -+
                         ^     |                          |
              back       |     +-- automation review --> In Review
                         |                                   |
                         |                                   +-- approve to automate --> Candidate
                         |                                                                   |
                         |                                                                   +-- start automation --> In Automation
                         |                                                                                                |
                         |                                                                                                +-- create PR --> Pull Request
                         |                                                                                                                      |
                         |                                                                                                                      +-- merged --> AUTOMATED
                         |                                                                                                                                        |
                         +---------------------------------------------------------------------------------------------------------- back (rework) ---------------+
```

### State definitions

| State | Description | Entry | Exit |
|-------|-------------|-------|------|
| Draft | Newly created, placeholder | TC artifact created | Steps / Gherkin writing begins |
| In Design | Steps being written | Draft + linked story | Steps reviewable |
| READY | Documented and complete | Steps reviewed | Manual or automation decision |
| MANUAL | Manual regression only | Not an automation candidate | Can be reconsidered later |
| In Review | Automation ROI under evaluation | Marked as candidate | Approved or rejected |
| Candidate | Approved for automation | Positive ROI | Automation begins |
| In Automation | ATC being implemented | Developer starts coding | PR created |
| Pull Request | Code submitted, awaiting merge | PR opened | Code on the production branch |
| AUTOMATED | Running in CI/CD | Code on the production branch (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §6) | Final (unless deprecated) |
| DEPRECATED | Obsolete | Feature removed | Can be recovered (`recover` -> Draft) |

### Rules

1. No skipping: Draft cannot jump to AUTOMATED.
2. Backward transitions are limited to the `back_*` family (one step back per state) plus "any state to DEPRECATED".
3. MANUAL is not a dead end. It can later move to In Review, Candidate or AUTOMATED if ROI changes.
4. AUTOMATED is the goal, so move as many TCs there as is reasonable.

### Transition names (used in `[ISSUE_TRACKER_TOOL] Transition Issue`)

| Transition | From -> To | Trigger |
|-----------|-----------|---------|
| `start design` | Draft -> In Design | Documentation begins |
| `ready to run` | In Design -> READY | Documentation complete |
| `for manual` | READY -> MANUAL | Not a candidate |
| `automation review` | READY -> In Review | Evaluate ROI |
| `approve to automate` | In Review -> Candidate | Positive ROI |
| `start automation` | Candidate -> In Automation | Stage 5 begins |
| `create PR` | In Automation -> Pull Request | PR created (often auto) |
| `merged` | Pull Request -> AUTOMATED | PR merged into the production branch (`../../agentic-qa-core/references/discovery-driven-doctrine.md` §6); an automation that fires it must filter on that base branch |
| `Deprecated` | Any -> DEPRECATED | TC retired |
| `recover` | DEPRECATED -> Draft | TC revived |

---

## 6. TC formats: Gherkin vs Traditional

Two formats are supported. The automation path decides which one a TC gets.

### Format selection rule

| Criterion | Gherkin | Traditional |
|-----------|---------|-------------|
| Automation candidate | Yes | No |
| Steps deterministic | Yes | May vary |
| Expected results exact | Yes | Subjective |
| Requires human judgment | No | Yes |

### Gherkin (for Candidates, the high-quality pattern)

```gherkin
Feature: User Login

  Background:
    Given the system is in initial state

  @critical @smoke @regression @automation-candidate @{US_ID}
  Scenario Outline: should <outcome> <connector> <condition>
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

Use Traditional for visual or subjective verification, exploratory elements, or a TC explicitly marked `manual-only`.

### When to use which Gherkin construct

| Construct | Use when |
|-----------|----------|
| Simple `Scenario` | Only 1 case, no variations |
| `Scenario Outline` + `Examples` | Multiple equivalence partitions |
| `Background` | Several scenarios share preconditions |

---

## 7. Variable pattern (mandatory for Gherkin)

Keep real data out of TCs. Tests run repeatedly over the project's life and production and staging data changes, so use variables that describe the type of data.

### Placeholder style (mandatory)

Variable placeholders in scenario steps are `{snake_case}` in curly braces: `{user_id}`, `{order_amount}`, `{discount_code}`. The one exception is a short uppercase symbol for a count or index (`{N}`), kept terse by convention. Scenario steps hold no hardcoded values; every value a step consumes is referenced by its `{snake_case}` name and resolved through the Variables table below. This differs from the `<column>` angle-bracket syntax a `Scenario Outline` binds to its `Examples:` columns: angle brackets name a per-row Examples value, curly braces name a Variables-table lookup (see the `Examples:` vs `Variables` note below).

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

> `Examples:` and `Variables` are two different tables. The `Examples:` table (in
> the Gherkin §"Gherkin") supplies the varying data values per equivalence
> partition, meaning what changes in each parameterized run (the artifact-economy
> lever, doctrine §"Part 2.5"). The `Variables` table (here, in the Description)
> explains how to obtain each variable at runtime (the SQL or source query) and
> does not vary per run. Rule of thumb: a value that changes the case is an
> `Examples` column; a value you must look up to run the case is a `Variables`
> row. A parameterized TC typically has both.

Every TC with variables includes a table explaining how to obtain each one:

```
| Variable     | Description                  | How to obtain                                                              |
|--------------|------------------------------|----------------------------------------------------------------------------|
| {mentor_id}  | Verified mentor UUID         | SELECT id FROM profiles WHERE role='mentor' AND is_verified=true LIMIT 1   |
| {N}          | Review count                 | SELECT COUNT(*) FROM reviews WHERE subject_id = {mentor_id}                |
| {average}    | Average rating               | SELECT AVG(rating) FROM reviews WHERE subject_id = {mentor_id}             |
```

### Benefits

- The TC does not need updates when data changes.
- It works in local, staging and QA.
- The tester sees what data they need.
- Scripts can parameterize it dynamically.

---

## 8. Labels and tagging

### Required (scope, at least one)

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
2. `smoke` is reserved for critical business path TCs.
3. `e2e` and `integration` describe type, not priority. A TC can be both `smoke` and `e2e`.
4. `manual-only` and `automated` are mutually exclusive.
5. `automation-candidate` is removed once the TC becomes `automated` or returns to `manual-only`.

---

## 9. ROI formula and automation decision

### The formula

```
ROI = (Frequency x Impact x Stability) / (Effort x Dependencies) / 10
```

The trailing `/ 10` is a normalization constant, not a sixth factor. Raw, the quotient over 1-5 factors spans `0.04 .. 125`; normalized it spans `0.004 .. 12.5`, which is the scale every threshold and worked example below reads on. Always divide by 10. A neutral all-3s scenario scores `(3x3x3)/(3x3)/10 = 0.3` → Defer, consistent with "most scenarios should be Deferred".

Each factor scored 1-5:

| Factor | 1 | 2 | 3 | 4 | 5 |
|--------|---|---|---|---|---|
| Frequency (how often run) | Yearly / rarely | Every release | Every sprint | Daily | Every PR / commit |
| Impact (if it fails) | Cosmetic | Minor inconvenience | Degrades UX | Blocks feature | Revenue / core business |
| Stability (of the flow) | Very volatile, active dev | Unstable | Moderate, changes every sprint | Stable, minor changes | Unchanged for months |
| Effort (to automate) | Trivial (minutes) | Low (hours) | Moderate (1-2 days) | High (several days) | Very high (week+) |
| Dependencies | None / self-contained | 1-2 simple | 3-4 | 5+ | Complex externals |

Effort and Dependencies are divisors, so a higher score is worse.

### ROI decision thresholds (strict)

| Score | Decision | Action |
|-------|----------|--------|
| > 5.0 | Automate | Excellent ROI; include in regression |
| 3.0 - 5.0 | Automate with caution | Evaluate if a simpler alternative exists |
| 1.5 - 3.0 | Case by case | Prior bug? Critical flow? If no, defer |
| 0.5 - 1.5 | Probably defer | Include only if prior bug, and only as **Manual** — not as Candidate; otherwise Defer |
| < 0.5 | Defer | Not worth the maintenance cost |

The thresholds are strict on purpose. Every test has a maintenance cost, most bugs do not recur after the first fix, and a few well-chosen tests beat many low-value ones.

The `0.5-1.5` prior-bug rescue never promotes a TC to Candidate: that rescue is reserved for `1.5-3.0` (SKILL.md Phase 2, "Three outcomes"). A `0.5-1.5` scenario with a prior bug is documented as a Manual TC in the manual regression suite; without a prior bug it is Deferred.

### Component value bonus (reusability)

```
Component Value = Base ROI x (1 + 0.2 x N)
```

where `N` = number of E2E flows that reuse the TC. A moderate-ROI atomic like `authenticateSuccessfully` can cross out of the defer bands purely through reuse (base ROI 2.0, reused in 3+ flows: `2.0 x 1.6 = 3.2` -> Automate with caution).

`N` is a qualitative heuristic, not a measurement, and nothing in this repo tracks it. The formula above illustrates the shape of the bonus; it is not arithmetic you can look up. Three rules:

1. Estimate `N` qualitatively from the ATP and the feature map (how many documented flows plausibly pass through this step), never from a grep.
2. Cap the bonus at `N = 3` (max multiplier `x1.6`), so an estimate you cannot verify cannot triple a score.
3. Record the estimate in the ROI comment alongside the five factors, for example `Reuse: N~3 (estimated from ATP: login, checkout, profile-edit). Bonus x1.6.` An unrecorded bonus cannot be audited.

### The ROI comment and its signature

Every Candidate and Manual TC carries one ROI comment, written when its verdict transition fires. The last line is the person's signature, copied from their answer. The agent never writes it on its own behalf.

```
ROI: F4 x I5 x S4 / (E2 x D2) / 10 = 2.0 (+ prior bug PROJ-7044) -> Candidate
Band: 1.5-3.0 | In-band: yes
Reuse: N~2 (estimated from ATP: checkout, refund). Bonus x1.4.
Verdict signed: <person>, <where>, <YYYY-MM-DD>
```

`Band` names the row of the "ROI decision thresholds (strict)" table the score falls in, and `In-band?` is `yes` when the verdict matches what that band and its rule (prior bug, critical flow) allow, `no` when it does not — a Candidate verdict on a `0.5-1.5` score is always `no`, since that band's rescue only reaches Manual. A batch sign-off (§"The sign-only pass") rejects any verdict carrying `In-band: no` back to Prioritize instead of signing it.

`<where>` names something a reader can check, not a bare channel name:

| The person answered through | `<where>` is |
|---|---|
| a Jira comment of their own | that comment's id or URL |
| the `mkd` decision deck | the path of the saved Result JSON or of the decision record (`.session/decisions/<topic>-<date>.json`, `agentic-qa-core/references/decision-protocol.md`) |
| the question tool | the path of the decision record the answer was saved to |

How the signature is collected follows `AGENTS.md` §2: a batch of verdicts to react to point by point goes in the `mkd` decision deck, a single verdict through the question tool. Only an attended session writes the line. A subagent, a fleet worker or a routine lists the verdicts as pending in its report, and the session talking to the person collects them.

`/test-automation`'s TC source gate reads this line from Jira and counts it only when the comment's `created` and `updated` timestamps both predate the automation run, so a signature cannot be written and used inside the same run.

#### The sign-only pass

This pass is for a Candidate (or Manual) TC whose verdict is recorded but unsigned, typically one created before the signature rule. It runs in mode `document`, in an attended session, and re-scores nothing:

1. Show the person each TC with its recorded ROI comment (factors, score, verdict), as a batch in the `mkd` deck or one by one through the question tool.
2. For each verdict the person confirms, add a new comment on the TC: the recorded `ROI:` line copied unchanged, then `Verdict signed:` with a checkable `<where>`. Leave the old comment unedited, since an edit moves its `updated` timestamp and hides what was recorded.
3. A verdict the person changes is not a sign-only case: run Prioritize for that TC.
4. Read each comment back through `[ISSUE_TRACKER_TOOL]` (Critical Rule #16).

The gate reads the latest comment that carries `Verdict signed:`.

### Phase 0 filter (applied before ROI)

For every candidate, answer three questions:

1. Does it protect against future regressions? If it was a one-time validation (typo, pluralization, rarely-touched code), defer.
2. Are there prior bugs? If yes, prioritize even at moderate ROI.
3. Is it app-level or feature-level? XSS, a11y, performance and responsive are app-level suites, not per-feature TCs.

Phase 0 fails -> Deferred. Phase 0 passes -> apply ROI.

### Risk matrix (sanity cross-check)

|                       | High probability | Medium | Low |
|-----------------------|------------------|--------|-----|
| High impact | P1 Critical | P2 High | P3 Medium |
| Medium impact | P2 High | P3 Medium | P4 Low |
| Low impact | P3 Medium | P4 Low | P5 Optional |

| Priority | Meaning | Automation urgency | CI/CD behavior |
|----------|---------|---------------------|----------------|
| P1 Critical | System unusable if this fails | Automate immediately | Runs on every commit (smoke) |
| P2 High | Major feature broken | Automate this sprint | Runs on PR merge |
| P3 Medium | Feature degraded, workaround exists | When capacity allows | Runs nightly or pre-release |
| P4 Low | Minor inconvenience | Evaluate ROI first | Runs weekly / on-demand |
| P5 Optional | Nice-to-have | Keep manual unless trivial | Manual regression only |

### Marking a Candidate in the TMS

> Prerequisite: load `/xray-cli` (Modality jira-xray). In Modality jira-native, load `/acli` instead; the `[TMS_TOOL] Update test` call becomes `[ISSUE_TRACKER_TOOL] Update Issue` on the Test issue.

```
[TMS_TOOL] Update test:
  test: {TEST_KEY}
  fields:
    automationCandidate: true
    labels: add "automation-candidate"
  comment: "ROI assessment: Frequency=4, Impact=5, Stability=4, Effort=2, Dependencies=1. ROI=4.0. Prior bug: BUG-XYZ. High-frequency critical path, low effort to automate."
```

---

## 10. TC identity: one TC, multiple assertions

A TC is defined by Precondition + Action. All expected results from the same (precondition, action) pair belong to the same TC.

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

Splitting one (precondition, action) pair into five "check panel A", "check panel B" ... TCs is the canonical anti-pattern.

### Equivalence Partitioning

Inputs producing the same output -> one parameterized TC (Scenario Outline + Examples).
Inputs producing different outputs -> separate TCs.

Example: all invalid credentials (wrong email, wrong password, empty fields) producing 401 -> one parameterized TC `loginWithInvalidCredentials`. Locked account producing 423 -> separate TC.

### Boundary Value Analysis (required wherever a range or limit exists)

Test at the edges of equivalence classes: `min-1 · min · min+1` and `max-1 · max · max+1`, plus zero, empty, null and overflow. 7 chars (just below an 8-min) and 65 chars (just above a 64-max) are interesting; 30 chars in the middle of the valid range is not. EP without BVA misses off-by-one defects, so when an AC names a numeric range, string length, collection size, date window, quota or pagination limit, boundary TCs are mandatory.

### State-Transition (required for stateful entities)

When an entity has a status or lifecycle (draft → submitted → approved; cart → paid → shipped; active → locked → closed), derive one TC per valid transition and one per invalid transition (a trigger fired in a state that should reject it, for example "approve an already-closed item → rejected"). Defects concentrate in the invalid transitions, so testing only the target state is not enough.

### Decision Tables (required when 2+ conditions interact)

When the outcome depends on a combination of conditions (role × feature-flag × account-status), build a decision table: enumerate the condition combinations, collapse impossible or equivalent columns, and derive one TC per surviving rule. Cover the combinations the AC leaves unmentioned too.

### Pairwise / combinatorial (required when 3+ combinable factors)

When 3+ independent factors each have multiple values (browser × locale × plan × payment-method), the full grid explodes. Use all-pairs selection, covering every pair of factor-values at least once, and log that pairwise was applied so the reduction is visible instead of a silent cap.

> Full canon + worked example: `agentic-qa-core/references/test-design-doctrine.md`. The techniques decide the TC set; ROI (SKILL.md Phase 2) then decides which TCs are Candidate, Manual or Deferred.

---

## 11. Traceability links

### Every TC must link to

| Link | Type | When |
|------|------|------|
| ATS (Acceptance Test Set) | Membership: TC→ATS issue link (both modalities, Test Set work type present) plus Xray-internal (jira-xray) | Always. The ATS holds all the Story's TCs; its ATS→Story `is tested by` link is what fills the coverage panel |
| User Story | "tests" / "is tested by" | Last resort only (cascade step 3): jira-native without a Test Set work type, where no ATS is possible and the direct TC→Story link carries traceability. Not needed while an ATS covers the TC |
| ATP (Test Plan) | Parent / reference | Always, after the ATP exists (administrative, contributes no coverage) |
| ATR (Test Results) | Reference | Always, after the ATR exists (administrative, contributes no coverage) |
| Regression Epic | Parent | Always |
| Acceptance Criterion | Reference | Always |
| Bug (if blocked) | "is blocked by" | When a bug prevents execution |

### Regression Epic (test repository)

Every TC belongs to a Regression Epic, the permanent repository for the project. Before creating a TC:

> Prerequisite: load `/acli` before running the commands in this section.

```
[ISSUE_TRACKER_TOOL] Search Issues:
  project: {{PROJECT_KEY}}
  query: type = Epic AND summary ~ "{qa.qa_epics.test_repository_epic.name}"
  # Resolve by the configured name (qa.qa_epics.test_repository_epic.name — "QA Test Repository"),
  # then fall back to the cached epic key. Identity is NOT a label lookup — the
  # QA-Artifact label marks QA-process epics but the configured name is the resolver.
```

If none exists, ask the user before creating it. A supervised worker leaves the creation to its conductor, and a routine with nobody present creates it only when the delegating brief covers it, otherwise reports the missing Epic and stops (`../../agentic-qa-core/references/decision-protocol.md`):

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Epic
  title: "QA Test Repository"   # configured name qa.qa_epics.test_repository_epic.name
  description: "Container epic for all {{PROJECT_KEY}} regression tests."
  labels: QA-Artifact, regression, qa   # QA-Artifact is mandatory on QA-process epics
```

Typical structure:

```
EPIC: QA Test Repository
  |-- TC-001: [Smoke] Basic login
  |-- TC-002: [Smoke] Main navigation
  |-- TC-003: [Regression] Complete checkout
  |-- TC-004: [Regression] User profile update
  |-- TC-005: [E2E] Complete purchase flow
  +-- ... (added incrementally)
```

---

## 12. CI/CD sync rules

Automated results flow from CI to the TMS, and only from CI, so local runs do not pollute it:

```
1. EXECUTE — Playwright runs tests with @atc decorators
2. REPORT  — Generate results (JUnit XML / JSON / Cucumber JSON)
3. SYNC    — CLI pushes results to TMS
4. UPDATE  — TMS Test Status + execution records updated
5. NOTIFY  — Team sees results in TMS dashboard
```

### Rules

1. Sync only from CI, never from local runs.
2. Sync on main or staging only, because feature branch results are ephemeral.
3. Include build context: every sync carries build ID, environment and timestamp.
4. Handle failures gracefully: a sync failure must not break the CI pipeline.

### Pseudocode

> Prerequisite: load `/xray-cli` (Modality jira-xray). In Modality jira-native, load `/acli` instead; result sync loops over `[ISSUE_TRACKER_TOOL] Update Issue` per TC.

```
[TMS_TOOL] Import results:
  format: xray-json   # never junit: it creates Tests
  file: {the per-ATC payload built from reports/atc_results.json, one testKey per @atc id}
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

- Create TCs after the feature is stable and validated.
- Add every TC to its Story's ATS (the coverage backbone) and link it to the ATP, ATR and AC. Use a direct Story link only as the cascade's last resort (no ATS).
- Use Gherkin for automatable TCs and Traditional for manual ones.
- Evaluate ROI before marking candidates.
- Keep the Regression Epic as the single source of truth.
- Transition states sequentially, following the workflow.
- Include test data and variables in the Description.
- Review TCs periodically and deprecate obsolete ones.
- Treat TCs as reusable components (atomic TCs compose into E2E flows).

### Don't

Each item below breaks a rule stated earlier in this file:

- Create TCs before exploring the feature, without a parent (Regression Epic), or without traceability to a requirement.
- Skip workflow states (for example Draft directly to AUTOMATED).
- Automate without evaluating ROI first.
- Duplicate TCs for the same scenario (same precondition + action = same TC).
- Leave status stale after automating (update the TMS when the PR merges).
- Use generic summaries like `"Login test"` instead of the naming convention.
- Sync local test runs to the TMS.

---

## 14. Reference implementation: Jira + Xray

| Convention | Jira/Xray implementation |
|------------|-------------------------|
| TC ID | Jira issue key |
| TC issue type | Xray Test |
| Test Status field | Xray Test Status or Jira custom field |
| Workflow Status | Jira custom workflow or Xray Test Status |
| Regression Epic | Jira Epic resolved by configured name (`qa.qa_epics.test_repository_epic.name`, "QA Test Repository"), then cached key; carries the `QA-Artifact` label |
| Test Execution | Xray Test Execution |
| Results import | Xray REST API (JUnit / Cucumber) |
| CLI | `bun xray` (load `/xray-cli` skill) |

Other TMS tools (Coda, Azure DevOps, TestRail) apply the same naming, labeling, workflow and ROI conventions; only the underlying issue types differ.
