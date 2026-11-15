# Jira Test Management Reference

How to create and maintain Test, ATP and ATR artifacts in Jira, with and without Xray. It covers mode selection, field mapping, the workflow, the Description template and the Jira gotchas that break batch runs.

### Related references

- `xray-platform.md`: the Xray concepts (issue types, RTM, data flow, API). Load it in Modality jira-xray when you need the what of Xray.
- `jira-setup.md`: the one-time Jira and Xray project configuration checklist (issue types, custom fields, workflows, API access). Load it before the first skill run on a new project.
- `tms-architecture.md` §Container per modality: which issue type ATP, ATR and TC map to in each modality.
- `tms-conventions.md` §IQL: the Test Status (workflow) versus Execution Status (run) distinction.
- `../../agentic-qa-core/references/jira-publishing-gotchas.md`: the ADF rich-text publishing gotchas (the `md-to-adf` mark collision and the MCP batched custom-field rejection, both of which fail silently with HTTP 400). Read it before publishing any Test, ATP or ATR body to a Jira rich-text field.

### Tool tags used here

- `[ISSUE_TRACKER_TOOL]`: generic Jira operations (create issue, update fields, link issues, transition, search). The primary tool is the `/acli` skill; it resolves per AGENTS.md Tool Resolution.
- `[TMS_TOOL]`: Xray-specific operations (create Test, create Test Execution, import results). It resolves only in Modality jira-xray, through `/xray-cli`. In Modality jira-native it falls through to `[ISSUE_TRACKER_TOOL]`.

---

## 1. Which mode: Jira Native or Jira + Xray?

Pick once per project and keep one mode per repository; mixing them splits the traceability graph.

| Question | Jira Native | Jira + Xray |
|----------|-------------|-------------|
| Is Xray installed and licensed in the Jira instance? | No | Yes |
| Do you need structured step-by-step execution with pass/fail per step? | No (Description only) | Yes |
| Do you need native JUnit/Cucumber import from CI/CD? | No (custom script) | Yes |
| Do you need Test Plan / Test Set / Test Execution hierarchies? | No | Yes |
| Is the team comfortable with Jira issue types only? | Yes | Either |

Decision rule:

- Xray present: use Jira + Xray. The extra issue types (Test Plan, Test Set, Test Execution) are worth the complexity.
- Xray absent: use Jira Native. Build a custom `Test` issue type and treat the Description as the source of truth.

The TC prefix is the User Story key in either mode (see §5).

---

## 2. Entity models per mode

### Jira Native (no Xray)

Core entities: User Story (already there), Test (custom issue type), Epic (the Regression Epic, parent of all Tests), plus the ATS when the Test Set work type exists.

```
User Story (STORY-123)
    | is tested by
ATS (ATS: STORY-123: <story title>)        <- when the Test Set work type exists
    | is tested by (TC->ATS membership links)
Test (TEST-456)
    | parent epic
Regression Epic (EPIC-001: "QA Test Repository")

# Without the Test Set work type: no ATS, the Test links to the Story directly
# (is tested by, the cascade's last resort).
```

Items over fields: ATP and ATR are real Jira issues even without Xray. The ATP is a `Test Plan` issue titled `ATP: {STORY-KEY}: {story title}` (parented to QA Master Test Plan) and the ATR is a `Test Execution` issue titled `ATR: {STORY-KEY}: Story Testing` (parented to QA Test Artifacts). Both are native Jira work types, so create them as such. ATP and ATR as Story custom fields (or a Task standing in) is a degraded fallback, used only when the instance lacks those work types.

The same rule covers the ATS. With the Test Set work type present, create an `ATS: {US_ID}: {story title}` item (parent QA Test Artifacts, components inherited from the Story) and record membership as TC to ATS issue links (the "membership is never a link" rule is xray-only). Without the work type there is no ATS, and TCs link straight to the Story.

Linking order (Set-first):

1. Find-or-create the ATS and link it to the US (the coverage link).
2. Find-or-create the ATP and link it to the US.
3. Create the ATR and link it to the US.
4. Update the ATP to link to the ATR.
5. For each TC, add it to the ATS (or link it to the US directly when there is no ATS), then link it to the ATP, the ATR and the AC.
6. Derive the Plan and Execution test lists from the ATS membership.

### Jira + Xray

Xray adds five issue types:

| Issue Type | Purpose | Relationship |
|------------|---------|--------------|
| **Test** | Individual test case (Manual, Cucumber, Generic). | Child of Regression Epic; linked to User Story. |
| **Test Plan** | Groups Tests for a release / sprint. Contains Tests. | Planning-level container. |
| **Test Set** | Two altitudes: the per-Story **ATS** (`ATS: {US_ID}: {story title}`, mandatory, holds all the Story's TCs, and its `is tested by` link to the Story fills the coverage panel) and the optional feature-level `TS:` grouping (smoke, regression, domain). | Membership is Xray-internal state (managed via `/xray-cli`, read via `bun xray test enrich`), NEVER a Jira issue link and NEVER the TC prefix (the prefix is always `{US_ID}`). |
| **Test Execution** | One execution instance. Generates Test Runs. | Executes a Test Plan or ad-hoc set of Tests. |
| **Precondition** | Reusable prerequisite for Tests. | Referenced by Tests that share setup. |

Typical hierarchy. The parents are the QA-process Epics: Plans under QA Master Test Plan; Executions, Sets and Preconditions under QA Test Artifacts; Tests under QA Test Repository.

```
QA Master Test Plan (Epic)
    |
    +-- Test Plan: STP: Sprint#50: Payments hardening   (sprint plan)
    +-- Test Plan: ATP: PROJ-101: Pay with credit card  (story plan)
            |
            +-- (Test Set / Tests grouped via links)

QA Test Artifacts (Epic)
    |
    +-- Test Set: ATS: PROJ-101: Pay with credit card       (MANDATORY per Story —
    |       +-- Test (TC1, TC2, ...)         ALL the Story's TCs; membership = TC->ATS link
    |                                        + Xray-internal; prefix stays {US_ID};
    |                                        ATS->Story link = coverage)
    +-- Test Set: TS: Checkout: Validate checkout v2        (OPTIONAL feature grouping)
    |       +-- Test (TC3, TC4, ...)
    +-- Test Execution: ATR: PROJ-101: Story Testing
            +-- Test Run per Test (PASS / FAIL / TODO)

QA Test Repository (Epic)
    +-- Test (TC1, TC2, TC3, TC4, ...)       (the permanent test repository)
```

---

## 3. Custom Test issue type: Jira Native configuration

Create a `Test` issue type in the Jira project with the fields below. This is admin work, done once per project.

| Field | Type | Purpose |
|-------|------|---------|
| Summary | Text | TC title per naming convention. |
| Description | Long text (rich text) | Full TC documentation (Gherkin or steps + metadata). |
| Test Status | Select list | The options that `test_status.options` in `.agents/jira-required.yaml` declares (Execution Status, per `tms-conventions.md` §IQL); the workflow status lives on the Test's own workflow (`.agents/jira-workflows.json` `work_types.test_case`). |
| Automation Candidate | Checkbox | Redundant with labels but easier to filter in JQL. |
| Priority | Select list | `Critical`, `High`, `Medium`, `Low`. |
| Labels | Multi-select | `regression`, `smoke`, `e2e`, `integration`, `automation-candidate`, `manual-only`, etc. |
| Components | Multi-select | Affected product module. Mandatory on every Test (defect-management doctrine Part 3), not a filtering nicety. |
| Epic Link | Epic picker | Must point to the Regression Epic. |
| Linked Issues | Links | "tests" / "is tested by" -> User Story; "is blocked by" -> Bug (optional). |

Jira admin caveats:

- Add the Test issue type to the project's Issue Type Scheme, or the type is not selectable.
- Add the fields above to the Test Screen Scheme (Create, Edit and View screens). A missing field disappears without an error.
- Put `Test Status` on the Edit screen so transitions need no separate workflow config.
- If the project uses a shared workflow scheme, add a Test-specific workflow with the states from §6; otherwise new Tests inherit the default workflow.

---

## 4. Field mapping: Jira Native vs Xray

The same concept is stored differently in each mode. Use this table to translate a TC design into TMS fields.

| TC concept | Jira Native | Xray |
|------------|-------------|------|
| Title | `Summary` | `Summary` |
| Steps (preconditions, action, expected) | Inside `Description`, as a table or Gherkin block | Xray `Test Steps` field (one row per step) OR `Cucumber` Gherkin field OR `Generic` text field |
| Test type (Manual / Cucumber / Generic) | No native concept; infer it from the Description format | Xray `Test Type` field: Manual / Cucumber / Generic |
| Preconditions | Inline at top of Description | Xray `Precondition` issue type, associated to the Test (Xray-internal association managed via `/xray-cli`, surfaced into the synced cache by its `test enrich` command; not a Jira issue link) |
| Expected Result | Per-row column in Description steps table, or Gherkin `Then` | Per-step `Expected Result` column in Test Steps field |
| Priority | `Priority` field | `Priority` field |
| Labels | `Labels` field | `Labels` field |
| Components | `Components` field | `Components` field |
| Trace to User Story | Via the ATS when the Test Set work type exists (TC→ATS links + ATS→Story "is tested by"); direct TC→Story "is tested by" only without it (cascade last resort) | Via the ATS (TC→ATS links, the Xray-internal membership, and the ATS→Story "is tested by" link, the one that fills the coverage panel), plus TC "is designed by" ATP and "is executed by" ATR (administrative). No direct TC→Story link while the ATS exists. |
| Execution result | `Test Status` custom field | Xray `Test Run` inside a Test Execution |

Xray additionally exposes:

- `Test Repository` folder (a flat path under the project), not required when all Tests sit under a single Regression Epic.
- `Test Sets` associated to the Test (Xray-internal membership; for the Story's ATS it is also a TC→ATS issue link, `agentic-qa-core/references/traceability-linking.md` §9).
- `Pre-Conditions` (a dedicated issue type), reusable across Tests (the association is Xray-internal too).

---

## 5. Naming: the prefix is the User Story key

The TC naming convention is identical in every modality. The prefix is always the User Story key (`{US_ID}`), never the Test Set ID.

```
{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]
```

| Modality | `PREFIX` |
|------|----------|
| **Jira Native** | User Story ID (`PROJ-101`) |
| **Jira + Xray with Test Sets** | User Story ID (`PROJ-101`); Test Set membership is a link plus Xray-internal state, not a prefix |
| **Jira + Xray without Test Sets** | User Story ID (`PROJ-101`) |

The prefix never changes with mode. Membership in the Story's ATS is a TC→ATS issue link in both modalities, plus Xray-internal membership under Modality jira-xray (managed via `/xray-cli` add-to-set, read via `bun xray test enrich`). It is NEVER in the TC title, which keeps JQL by Story key reliable across the whole project.

Related names follow the planning-ladder grammar `{ACRONYM}: {scope-id}: {descriptor}` (full table: `tms-conventions.md` §3):

| Entity | Jira work type | Pattern | Example |
|--------|----------------|---------|---------|
| Story Test Plan (ATP) | Test Plan | `ATP: {STORY-KEY}: {story title}` | `ATP: PROJ-101: Pay with credit card` |
| Story Test Execution (ATR) | Test Execution | `ATR: {STORY-KEY}: Story Testing` | `ATR: PROJ-101: Story Testing` |
| Feature Test Plan (FTP) | Test Plan | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` |
| Sprint Test Plan (STP) | Test Plan | `STP: Sprint#{N}: {objective}` | `STP: Sprint#50: Payments hardening` |
| Sprint Test Results (STR) | Test Execution | `STR: Sprint#{N}: Regression Testing` | `STR: Sprint#50: Regression Testing` |
| Acceptance Test Set (ATS, per-Story, **mandatory**) | Test Set | `ATS: {US_ID}: {story title}` | `ATS: PROJ-101: Pay with credit card` |
| Test Set (TS, feature-level, **optional**) | Test Set | `TS: {EPIC-KEY\|module}: Validate {feature}` | `TS: PROJ-42: Validate credit card payment` |
| ReTesting (bug fix) | Test Execution | `ReTest: {BUG-KEY}: {summary}` | `ReTest: PROJ-202: Wrong error on invalid password` |
| Precondition | Precondition | `{COMPONENT}: {required state}` (no ladder acronym) | `Payment: Authenticated user with a saved card` |

A Precondition's title states the required state; its content holds the setup steps. Keep the two distinct.

---

## 6. Workflow: states and transitions

State and transition names below match the workflow declared in `.agents/jira-workflows.json` (see `.agents/jira-required.yaml` `work_types.test_case`). Skills resolve names via `{{jira.status.test_case.<slug>}}` and `{{jira.transition.test_case.<slug>}}`. Refresh with `bun run jira:sync-workflows` if your project renames any state.

Both modes use the same state machine. Xray imposes no workflow of its own; it follows the Jira workflow attached to the Test issue type.

```
Draft
  | start design
In Design <--+ back
  | ready to run
READY
  +-- for manual -----------> MANUAL (manual regression branch)
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
                               AUTOMATED (terminal-automated)
```

Rules:

- `.agents/jira-workflows.json` (`work_types.test_case`) is the authoritative source for status and transition names. A name that is not in that file does not exist in the instance.
- Never skip a state. If a TC was moved to `READY` by mistake, transition back to `In Design` with `back` instead of editing the status field.
- `MANUAL` and `AUTOMATED` are both terminal for day-to-day work. A MANUAL TC can re-enter `In Review`, `Candidate` or `AUTOMATED` later if ROI changes.
- `DEPRECATED` is reachable from any state and recovers to `Draft` (`recover`).

---

## 7. Description template (full TC documentation)

The Description carries the whole TC in Jira Native mode, and it is still worth filling in Xray mode because Xray's Steps field is minimal. Paste it after the Test is created, with `[ISSUE_TRACKER_TOOL] Update Issue`. Format it per `../../acli/references/adf-authoring-style.md`: a table for the step-to-expected grid (more scannable than bullets), nested lists for multi-level preconditions, and a panel for a critical assumption. Add richness where it helps the reader, not as decoration.

```
## Related Story
{{PROJECT_KEY}}-{n} — <Story Title>

## Priority / ROI
- Priority: {Critical|High|Medium|Low}
- ROI score: {number} (Frequency x Impact x Stability / Effort x Dependencies / 10, the `/ 10` normalization; see `tms-conventions.md` §9)
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
Scenario Outline: should <outcome> <connector> <condition>
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

- Use variables, not hardcoded data: `{mentor_id}`, never a literal UUID. The Variables table says how to produce real values at runtime.
- The Implementation Code table is empty at documentation time; `test-automation` fills it after the code lands.
- Refinement Notes records ATP-versus-code discrepancies (routes renamed, text format changes, missing APIs). It is mandatory whenever source-code validation found such discrepancies.

---

## 8. Creating a TC: pseudocode by mode

Parenting and components (binding, from `../../agentic-qa-core/references/defect-management-doctrine.md`). In both modalities every created `Test` (TC) parents to the QA Test Repository process epic, found or created by `qa.qa_epics.test_repository_epic.name` ("QA Test Repository"). Never parent it to a product or dev epic and never leave it unparented (Part 4). Its `components` field is mandatory and names the affected product module (Part 3).

The three-axis model splits the work: the parent says only which QA bucket, `components` carries the product area, and Story coverage travels on the link graph, never on the parent. That graph is the ATS→Story `is tested by` link (the coverage-panel link), with membership Xray-internal under jira-xray and TC→ATS links under jira-native. A direct TC→Story `is tested by` is the cascade's last resort, for setups with no ATS. The `epic:` / `REGRESSION_EPIC_KEY` in the blocks below resolves to the QA Test Repository epic.

### Jira Native (Manual or Gherkin)

Prerequisite: load the `/acli` skill before running the commands below.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test
  summary: {per TC naming convention}
  priority: {Critical|High|Medium|Low}
  labels: [regression, {smoke?}, {automation-candidate|manual-only}, {e2e|integration}]
  components: [{module}]
  epic: {REGRESSION_EPIC_KEY}

# With a Test Set work type (ATS exists — membership IS a link, as in jira-xray):
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {TEST_KEY}
  to:   {ATS_KEY}
  linkType: {{jira.link_types.test.name}}   # ATS is tested by Test (TC -> ATS membership)

# Without a Test Set work type (no ATS): direct Story link — cascade last resort
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {TEST_KEY}
  to:   {STORY_KEY}
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template from §7}

[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {TEST_KEY}
  transition: start design
  # later: ready to run
  # later: for manual OR automation review -> approve to automate
```

Resolve the `test` link type by slug only and verify its direction after creation; see `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality and mandatory verification).

### Jira + Xray (Cucumber)

Prerequisite: load the `/xray-cli` and `/acli` skills before running the commands below.

```
[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Cucumber
  title: {per TC naming convention}
  gherkin: {from §7 Gherkin block}
  labels: [regression, automation-candidate, {scope}, {priority}]
  components: [{module}]          # mandatory — affected product module

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template from §7}

# Set-first membership: add the TC to the Story's ATS TWICE — the Xray-internal membership
# (/xray-cli add-to-set; it creates no Jira link) AND the TC->ATS `test` issue link
# (traceability-linking.md §9: the membership every reader walks, in both modalities).
# Coverage flows through the ATS->Story `is tested by` link (already created in the
# Set-first preflight — the coverage-panel link).
[TMS_TOOL] Add Test to Test Set:   # /xray-cli — Xray-internal membership
  test:    {TEST_KEY}
  testSet: {ATS_KEY}               # the Story's ATS; the optional feature TS: is a second add
[ISSUE_TRACKER_TOOL] Link Issues:  # the membership link (ATS only, never the feature TS:)
  from: {TEST_KEY}
  to:   {ATS_KEY}
  linkType: {{jira.link_types.test.name}}   # ATS is tested by Test

# Administrative edges: ATP designs TC, ATR executes TC. The Test is NOT linked to the
# Story directly while the ATS exists — direct TC->Story is the cascade's last resort.
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {ATP_KEY}
  to:   {TEST_KEY}
  linkType: {{jira.link_types.test_design.name}}    # ATP designs TC / TC is designed by ATP
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {ATR_KEY}
  to:   {TEST_KEY}
  linkType: {{jira.link_types.test_execute.name}}   # ATR executes TC / TC is executed by ATR

[ISSUE_TRACKER_TOOL] Transition Issue:
  issue: {TEST_KEY}
  transition: start design
```

Resolve the `test_design` / `test_execute` link types by slug only and verify their direction after creation; see `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §3 catalog, §4 directionality, §9 Test Set caveat).

Confirmed: the Xray-internal attach (`plan add-tests` / `exec add-tests`) creates NO Jira links. The `designs` and `executes` Jira edges MUST be created explicitly through `[ISSUE_TRACKER_TOOL]` (`/acli`), separate from the Xray-internal membership. Membership goes through `/xray-cli`, never `acli link create`; the Jira links go through `/acli`, never `/xray-cli`. Do NOT link the Test to the Story directly under Modality jira-xray, because coverage flows through the ATS→Story link (a direct TC→Story link is the cascade's last resort, for setups with no ATS).

### Stage-4 promote + enrich — tool resolution map (Modality jira-xray)

When `/test-documentation` Stage 4 promotes a sprint Xray Test into regression, resolve each operation to its tool through the pseudocode. The exact command lives in `/xray-cli`, so load it; this table only says which tool owns the operation.

| Promote / enrich op | Resolves via | Coverage |
|---|---|---|
| Re-derive + rewrite the canonical **title** on an existing Test (runs FIRST) | `[ISSUE_TRACKER_TOOL]` (the summary is a Jira field) | ✓ (no `[TMS_TOOL]` summary update exists; route it via the issue tracker) |
| Add Test → feature **Test Set** | `[TMS_TOOL]` (Xray-internal membership) | ✓ supported |
| Add Test → **Regression Test Plan (RTP)** | `[TMS_TOOL]` | ✓ supported |
| Label `regression-candidate` on an **existing** Test | `[ISSUE_TRACKER_TOOL]` (labels are a Jira field) | ✓ (no `[TMS_TOOL]` update-label for an existing Test; route it via the issue tracker) |
| Enrich **Manual** Test steps | `[TMS_TOOL]` | ✓ supported |
| Enrich **Gherkin** / definition / change **test type** on an existing Test | `[TMS_TOOL]` | ✓ supported (update-gherkin / update-definition / update-type) |

Every Stage-4 promote and enrich operation resolves through a tool: `[TMS_TOOL]` for Test Set and Test Plan membership and for step, Gherkin, definition and type enrichment; `[ISSUE_TRACKER_TOOL]` for the title and the labels on an existing Test. You can author rich Gherkin at creation time or enrich an existing sprint Test in place during promotion; both paths work.

Order matters: the title row runs before membership and label. A sprint Test carries a sprint-era summary, and promoting it untouched is what leaves the RTP full of non-canonical titles. So re-derive the title, rewrite it if it differs, verify it, and only then add the Test to the RTP and apply `regression-candidate`. Full rule: `SKILL.md` §"Title on promotion".

### Jira + Xray (Manual)

Prerequisite: load the `/xray-cli` and `/acli` skills before running the commands below.

```
[TMS_TOOL] Create Test:
  project: {{PROJECT_KEY}}
  type: Manual
  title: {per TC naming convention}
  components: [{module}]          # mandatory — affected product module
  # NO inline steps here — Xray Cloud drops steps passed on create. Create the
  # Test bare, then add each step in a follow-up call.

[TMS_TOOL] Add Step:           # one call per step (Xray Cloud only registers steps added post-create)
  test:   {TEST_KEY}
  action: {step 1}
  data:   {step 1 data}
  result: {expected step 1}
# ...repeat [TMS_TOOL] Add Step for each remaining step...

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TEST_KEY}
  description: {full Description template from §7}

# Set-first membership: Xray-internal membership AND the TC->ATS `test` link
# (traceability-linking.md §9), as in the Cucumber block above.
[TMS_TOOL] Add Test to Test Set:
  test:    {TEST_KEY}
  testSet: {ATS_KEY}
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {TEST_KEY}
  to:   {ATS_KEY}
  linkType: {{jira.link_types.test.name}}   # ATS is tested by Test — the membership link

# Administrative edges: ATP designs TC, ATR executes TC. The Test is NOT linked to the
# Story directly while the ATS exists (direct TC->Story = cascade last resort).
# Slug + direction: traceability-linking.md §3/§4/§9.
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {ATP_KEY}
  to:   {TEST_KEY}
  linkType: {{jira.link_types.test_design.name}}    # ATP designs TC
[ISSUE_TRACKER_TOOL] Link Issues:
  from: {ATR_KEY}
  to:   {TEST_KEY}
  linkType: {{jira.link_types.test_execute.name}}   # ATR executes TC
```

Xray mode needs both calls, the Xray one and `Update Issue`. Without the Update Issue call the TC has no readable documentation in Jira, only the bare Xray Steps field. For manual steps, Xray Cloud drops any steps passed on `Create Test`, so create the Test without steps and add each one with `[TMS_TOOL] Add Step`, one call per step.

---

## 9. Test Plan / Test Set / Test Execution

Items over fields: `Test Plan`, `Test Set` and `Test Execution` are native Jira work types, so create them as real issues in both modalities (Xray adds only the run and coverage engine and the result import on top). Titles follow the ladder grammar (§5). Parent Plans to QA Master Test Plan; parent Executions, Sets and Preconditions to QA Test Artifacts.

Prerequisite: load the `/xray-cli` and `/acli` skills before running the commands in this section. `Test Plan` and `Test Set` are created via `[ISSUE_TRACKER_TOOL]` (acli); `Test Execution` result imports use `[TMS_TOOL]` (xray-cli).

### Test Plan

Groups Tests for a release or sprint, one per release cadence.

```
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test Plan
  summary: STP: Sprint#50: Payments hardening
  labels: [regression, {release}]
  components: [{module}]          # mandatory — inherit the source Story's components
  # Parent Epic: QA Master Test Plan

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {TP_KEY}
  field: Tests
  value: [{TEST_KEY_1}, {TEST_KEY_2}, ...]
```

### Test Set: ATS (mandatory per Story) + TS (optional feature grouping)

There are two Set altitudes. The ATS (`ATS: {US_ID}: {story title}`) is mandatory per Story. It holds all the Story's TCs (even one), and its `is tested by` link to the Story is what fills the Xray coverage panel (ATP and ATR links contribute zero coverage, verified live). The ATP's and Execution's test lists derive from its membership (Set-first). The feature-level TS (`TS: {EPIC-KEY|module}: Validate {feature}`) is an optional grouping (smoke, regression, domain), reusable across sprints.

The TC title prefix is always `{US_ID}` (the User Story key) whatever the Set membership (see §5). Under jira-xray, membership is Xray-internal (added via `/xray-cli`, read via `bun xray test enrich`), NEVER a Jira issue link and NEVER the TC prefix. The jira-native carve-out: membership IS a TC→ATS issue link.

```
# ATS: MANDATORY per Story (Set-first: created before the first TC)
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test Set
  summary: ATS: {{PROJECT_KEY}}-101: Pay with credit card
  labels: [regression]
  components: [{inherited from the source Story}]   # mandatory on the ATS; the
  # components exemption applies to the feature-level TS: only
  # Parent Epic: QA Test Artifacts

[ISSUE_TRACKER_TOOL] Link Issues:
  from: {ATS_KEY}
  to:   {STORY_KEY}
  linkType: {{jira.link_types.test.name}}   # Story is tested by ATS: THE coverage-panel link

# TS: OPTIONAL feature-level grouping
[ISSUE_TRACKER_TOOL] Create Issue:
  project: {{PROJECT_KEY}}
  issueType: Test Set
  summary: TS: {EPIC-KEY|module}: Validate {feature}
  labels: [regression, sanity]
  # components: OPTIONAL on the feature-level TS: only — the sole TMS artifact exempt
  # from the components mandate (a feature Set can span modules; its member Tests and
  # the per-Story ATS carry them)
  # Parent Epic: QA Test Artifacts
```

### Test Execution

One per execution run; it holds a Test Run per Test with PASS, FAIL or TODO.

```
[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: ATR: {{PROJECT_KEY}}-101: Story Testing
  tests: [{TEST_KEY_1}, ...]
  components: [{module}]          # mandatory — inherit the source Story's components
  # Parent Epic: QA Test Artifacts

[TMS_TOOL] Import Results:
  format: xray-json  # never junit: it creates Tests
  file:   the per-ATC payload built from reports/atc_results.json (one testKey per @atc id)
  execution: {EXEC_KEY}
```

Load `/xray-cli` for the CLI syntax. The import updates Test Runs itself, so no per-Test status update is needed.

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

Prerequisite: load the `/acli` skill before running the commands below.

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

Jira Native keeps no run history per Test. When the historical trend matters, store runs in a separate system (Allure, a custom DB) and keep Jira as the latest-state view.

---

## 11. Local cache: markdown per TC (synced, never hand-authored)

After TMS creation, run `bun run jira:sync-issues get <STORY_KEY>`. `scripts/sync-jira-issues.ts` materializes every `Test` issue linked to the Story into `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/test-cases/TEST-<KEY>-<slug>.md`. The directory is a `[SYNC]` Jira mirror (gitignored; see `.agents/instructions/agent-local-context-pbi.md`). This skill creates the `Test` issue, links it to the Story, syncs, and reads the materialized file. It never writes into `test-cases/`. The cache lets `test-automation` take over without re-reading the TMS.

Because the synced file only mirrors what Jira holds, everything it should show (Gherkin, Variables table, Refinement Notes, the `outcome` and `labels` metadata) has to land in the `Test` issue itself: the Description through the full §7 template, and labels as Jira labels. A generated file looks like this:

```markdown
# TEST: PROJ-123: TC1: should grant access when credentials are valid

**Jira Key:** [PROJ-456](https://.../browse/PROJ-456)
**Status:** READY
**Components:** Auth

---

## Test Description

{the full §7 Description template as it stands in Jira — Preconditions, Action,
Expected Results, Gherkin, Variables table, Refinement Notes}

---

## Related Issues

- is designed by: [PROJ-441](...) - ATP: PROJ-123: ...
- is executed by: [PROJ-442](...) - ATR: PROJ-123: Story Testing

---

## Metadata

- **Created:** ... / **Updated:** ... / **Reporter:** ...
```

A later `test-automation` run greps the synced files for `automation-candidate` (mirrored from the Jira labels) to find work to do. That is why the labels are set on the `Test` issue and not annotated locally.

---

## 12. Jira-specific gotchas

1. Issue Type Scheme: if the Test issue type is missing from the project, `[ISSUE_TRACKER_TOOL] Create Issue` fails with a generic "invalid issue type" error. Check project admin, Issue Types.

2. Screen Scheme: custom fields (`Test Status`, `Automation Candidate`) must be on the Create, Edit and View screens. Otherwise they look unsaved when they were saved and are only hidden.

3. Required fields: Jira can require `Components`, `Fix Version` and `Affects Version`. A missing one blocks creation, and the validation errors from `Create Issue` are easy to miss in a batch run. Check that a single test creation works before going to bulk.

4. Permission schemes: `Transition Issue` needs the transition permission, and a user who can create Tests may not be able to transition them. Check the workflow's transition conditions before batch transitions.

5. Link types: "is tested by" and "tests" may not exist by default. Add them in Jira admin, Issue Linking. Without them, `[ISSUE_TRACKER_TOOL] Link Issues` fails with "invalid link type".

6. Xray + Jira Cloud API: Xray Cloud has its own REST API, separate from Jira's, and `[TMS_TOOL]` (xray-cli) handles it. Create Xray Tests through `[TMS_TOOL]`, not `[ISSUE_TRACKER_TOOL]`: an issue made that way does not register in Xray's internal index.

7. Rate limits: Jira Cloud rate-limits at around 10 requests/sec per user, so batches of 100+ TCs need throttling. Prefer bulk endpoints (Jira `/rest/api/3/issue/bulk`, Xray `/import` endpoints) where available.

8. Gherkin rendering: Jira's rich-text editor mangles Gherkin indentation when pasted without a code block. Wrap Gherkin in triple backticks (a fenced `gherkin` block) inside the Description, or use Xray's dedicated Gherkin field.

9. Character limits: Summary is capped at 255 chars, and a longer TC title ("PROJ-101: TC14: should complete checkout when user has multiple cards and applies stacked discounts...") truncates silently. Keep CORE + CONDITIONAL tight.

10. Xray Test Type cannot change: converting a `Manual` Test to `Cucumber` typically means deleting and recreating it. Pick the type at creation.

11. Test Execution closure: Xray Test Executions do not auto-close, and old ones pile up and skew metrics. Close each one with `[ISSUE_TRACKER_TOOL] Transition Issue` once its results are imported.

12. Description overwrite: `[ISSUE_TRACKER_TOOL] Update Issue` on the Description replaces it and does not append. Read the existing Description first when earlier content matters.

---

## 13. Completeness checklist (per TC, before moving to READY)

- [ ] Summary follows `{US_ID}: TC#: should <expected outcome> [<connector> <condition>] [given <precondition>]` with no anti-patterns. On a promoted sprint Test, check the live summary, not the one you intended at create time (`SKILL.md` §"Title on promotion")
- [ ] Traced to the User Story via the cascade: member of the Story's ATS (TC→ATS link in both modalities; jira-xray also Xray-internal), "is designed by" ATP and "is executed by" ATR. A direct TC→Story "is tested by" is allowed only when no ATS exists (jira-native without the Test Set work type)
- [ ] Linked to Regression Epic (Epic Link)
- [ ] Components set (affected product module; mandatory, defect-management doctrine Part 3)
- [ ] Priority set
- [ ] Labels include scope (regression/smoke/e2e/integration) and automation intent (automation-candidate or manual-only)
- [ ] Description uses the full template from §7 (no skeletons or TODOs)
- [ ] Variables table present if Gherkin references placeholders
- [ ] Prior bugs covered section filled (or "none")
- [ ] Refinement Notes filled if source-code validation found discrepancies
- [ ] Xray mode: Test Type set (Manual / Cucumber / Generic)
- [ ] Added to the Story's ATS (mandatory: TC→ATS issue link in both modalities; Xray mode also writes the Xray-internal membership via `/xray-cli`); optional feature `TS:` per promotion
- [ ] Workflow state = READY (or MANUAL / Candidate once decision is made)
- [ ] Local cache materialized (never hand-written) via `bun run jira:sync-issues get <STORY_KEY>`, one `TEST-<KEY>-<slug>.md` per Test under `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/test-cases/`

---

## 14. Anti-patterns to reject

- Summary like `Login test`, `Login - error` or `TC1: Test form`: each lacks the prefix, the TC#, CORE and CONDITIONAL.
- A Description that is a bullet list of actions with no expected results. Every step needs an expected result, or use Gherkin.
- Hardcoded data (UUIDs, emails, passwords) in Gherkin. Use `{variable}` plus the Variables table.
- Splitting assertions into separate TCs ("TC1: check panel A appears", "TC2: check panel B appears", "TC3: check panel C appears") when precondition and action are identical. That is one TC with three assertions.
- Cross-cutting concerns as TCs ("Mobile responsive", "XSS prevention", "Performance", "Accessibility"). Validate them inside other TCs or in an app-level suite.
- Creating TCs before the ATS, ATP and ATR exist, which leaves orphaned references. Follow the Set-first linking order in §2; only in jira-native without the Test Set work type does a TC link to the US (`is tested by`) directly, as the cascade's last resort.
- Linking every TC directly to the Story while its ATS covers it, which floods the Story panel with noise. The Story links to its ATS (coverage), ATP and ATR (administrative), and TCs aggregate to the Story through the ATS. A direct Story to TC link is not a defect in itself, since it is the cascade's documented last resort when no ATS is available. The defect is a TC with no path to its Story.
- A Summary over 255 chars, which truncates silently. Shorten CONDITIONAL if needed.
- Xray Manual Tests with no Description. Skipping `[ISSUE_TRACKER_TOOL] Update Issue` leaves a TC with minimal context, so populate the full Description template.
