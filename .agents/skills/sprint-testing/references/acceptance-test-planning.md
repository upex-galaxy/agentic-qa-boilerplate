# Acceptance Test Planning (Ticket-Level ATP)

> **Subagent context**: this file is part of the "Context docs" briefing component for the Stage 1 Planning subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 2 — Stage 1 Planning subagent").

Stage 1 Planning for a single ticket inside a sprint. The ATP is authored in-session, and where it lives depends on the TMS modality (resolved in Session Start §0):

- **Modality jira-native**: ATP = the Story's `{{jira.acceptance_test_plan}}` field (or `fallback:` comment), written via `[ISSUE_TRACKER_TOOL]`, then materialized to the read-only cache `.../stories/STORY-<KEY>-<slug>/acceptance-test-plan.md` by `bun run jira:sync-issues get <STORY_KEY> --include-comments`.
- **Modality jira-xray**: ATP = the **Test Plan** issue's `description`, written via `[ISSUE_TRACKER_TOOL]`, then materialized to `.../test-plans/ATP-<ATP_KEY>-<slug>.md` by `bun run jira:sync-issues get <ATP_KEY>`. The acronym prefix comes from a conforming ladder title; a Plan or Execution whose title does not follow the grammar keeps the legacy `TESTPLAN-` / `TESTEXEC-` / `RETESTEXEC-` prefix.

Read the synced ATP file for the active modality. Jira is the source of truth, so the synced file is never hand-written.

This reference covers **manual and exploratory in-sprint testing per ticket (Stage 1 planning)**. Its output is **TC outlines** (names plus a one-line precondition and expected result), not the persistent regression TC set. What happens to the outlines follows the modality-aware rule in `sprint-testing/SKILL.md` §"TC creation timing": **jira-native** creates no `Test` work items here (Stage 4 creates the regression-worthy ones); **jira-xray** **creates and executes** `Test` issues for the outlines this sprint (the `Test` is Xray's execution unit), and Stage 4 promotes them into the Regression Test Plan. ROI scores and Candidate/Manual/Deferred belong to `test-documentation` (Stage 4), automation `spec.md` to `test-automation/references/planning-playbook.md`, and bug reports to `reporting-templates.md` (pass 5c).

For feature or multi-story scope see `feature-test-planning.md`.

> **Before publishing the ATP body to Story rich-text fields** (`{{jira.acceptance_test_plan}}` or description), read `../../agentic-qa-core/references/jira-publishing-gotchas.md`. It covers the two ADF conversion gotchas (`md-to-adf` mark collision and MCP batched custom-field rejection) that fail silently with HTTP 400.
> **Format for readability** per `../../acli/references/adf-authoring-style.md`: ATP test steps read best as a table (step, expected), and a shared precondition fits a panel. A scenario that must be Gherkin keeps its fenced block, because the field's hard rule wins.

---

## The 4 Pillars of Spec-Driven Testing

Every phase below applies **Spec-Driven Testing (SDT)**: the specification decides what to test, not the tester's intuition. Every case traces to a risk or an AC, and the ACs are where coverage starts, not where it ends.

### 1. Test from Specs

```
BAD:  "I'm going to test the login and see what I find"   (aimless, no traceability)
GOOD: "I'm going to start from STORY-XXX's ACs, then probe BEYOND them —
       boundaries, invalid data, states, and anomalies the ACs don't mention"
```

Read the complete story, understand its ACs and review the documented test cases first. ACs are the floor of coverage, and verifying them is the minimum (Principle 1-2 of `agentic-qa-core/references/test-design-doctrine.md`).

### 2. Traceability

```
BAD:  Bug: "The button doesn't work"
GOOD: Bug: "AC-3 of STORY-XXX fails: The submit button doesn't respond after click"
```

Every finding (pass, fail or bug) references the story and the specific AC it validates or violates. Phase 6 enforces this.

### 3. Coverage from Requirements

```
BAD:  "I tested everything I could think of"             (subjective, gaps invisible)
GOOD: "I verified each AC (the floor) AND probed the risk beyond it —
       boundaries, invalid data, state transitions, anomalies"
```

Coverage has **two axes**, and reporting only the first reports the floor:

1. **AC-conformance (the floor)**: % of ACs verified + % of test outlines executed.
2. **Risk-beyond-AC**: boundary, negative, state-transition and anomaly cases derived by technique (EP, BVA, State-Transition, Decision Tables, Pairwise), per `agentic-qa-core/references/test-design-doctrine.md`.

Phase 4 builds the outline set across both axes. Report "100% of ACs verified" as the floor, then what was probed above it.

### 4. Exploratory with Purpose

```
BAD:  Random clicking through the application
GOOD: Focused exploration on the story's risk areas
```

Exploration starts from the story and its ACs, looks for undocumented edge cases and documents findings with full traceability. Phase 2 surfaces them; Phase 5 catalogs them.

### SDT anti-patterns (reject on sight)

Random testing, bugs without context and coverage by intuition are the BAD lines of the pillars above. Two more:

| Anti-pattern | Problem | SDT correction |
|--------------|---------|----------------|
| **Test without spec**: "I didn't read the story but I'll test anyway" | Cannot distinguish bug from expected behavior | Read the full ticket in Session Start before planning |
| **AC-bounded testing**: "all ACs pass, so we're done" | Stops at the floor; misses boundaries, errors, states the AC is silent on | Treat ACs as the entry condition; derive risk-beyond-AC cases by technique before declaring coverage |

### SDT workflow (how this reference implements it)

```
Specification              Testing                    Feedback
     |                         |                          |
     v                         v                          v
+---------+    +---------+    +---------+    +---------+
|  Story  | -> |  Test   | -> | Execute | -> | Report  |
|   +AC   |    | Outlines|    | & Find  |    | & Doc   |
+---------+    +---------+    +---------+    +---------+
  Phase 1-3      Phase 4       Stage 2        Stage 3
```

The phases below (0-8) are the concrete implementation of this pipeline for a single ticket.

---

## Inputs

Read every item before planning. If a project-wide context file is missing, stop and hand off to `project-discovery`.

> **Prerequisite**: load `/acli` before any `[ISSUE_TRACKER_TOOL]` WRITE. Detailed READS use `bun run jira:sync-issues`, not `/acli`. Skip the load if Session Start §0.1 in `SKILL.md` already did it.

| Input | Source |
|-------|--------|
| Ticket (title, description, ACs, priority, comments) | `bun run jira:sync-issues get <KEY> --include-comments` then read the synced `story.md` / `acceptance-criteria.md` / `comments.md` (Jira Key from `{STORY_PATH}/context.md`). NEVER `acli workitem view` for custom fields. |
| Team Discussion | Synced `comments.md`: extract decisions, tech notes, edge cases (see `session-entry-points.md`) |
| Parent epic + feature plan | `.context/PBI/epics/EPIC-<KEY>-<slug>/feature-test-plan.md` if it exists (synced from the epic) |
| Project-wide context | `bun run context:map business-data-context` / `business-e2e-context` / `business-api-context` (per touched level; `--section <id>` for one entity, journey or endpoint group), `.context/PBI/qa-artifacts/master-test-plan.md` |
| Module context | `.context/PBI/epics/EPIC-<KEY>-<slug>/module-context.md` |
| Code | `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` + `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}` (targeted reads only) |
| Test data candidates | `[DB_TOOL]` on `{{DB_MCP}}` |
| Architecture + API contracts (if generated) | `bun run context:map infra-context --section architecture` + its `nfr-*` sections; functional specs from the `business-e2e-context` `feature-*` sections; API contract from `api/openapi-types.ts` (types) + the `business-api-context` map (business) |

---

## Output

```
.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/
  acceptance-test-plan.md   # ATP — Jira-synced read-only cache (this doc's target output); never hand-written
  context.md                # hand-authored from session-start (NON-Jira, local-only)
  evidence/                 # NON-Jira, local-only

.session/sprint-testing/<scope>/
  test-session-memory.md    # hand-authored
```

Also:
- Write the ATP body to the Story's `{{jira.acceptance_test_plan}}` field (or `fallback:` comment) via `[ISSUE_TRACKER_TOOL]`, and append the refined AC section to the ticket description.
- Run `bun run jira:sync-issues get <KEY> --include-comments` to materialize `acceptance-test-plan.md`, then read it back to confirm. The synced file is a read-only cache: do not hand-edit it or commit hand-written ATP content.

---

## Phase 0 — Triage

Triage decides whether the ticket deserves a full ATP. **Vetoes beat risk score.**

### 0.0 Shift-Left short-circuit (check FIRST)

Before the veto and risk score, check whether the Story already passed through `/shift-left-testing`.

This gate is **fail-closed** (`agentic-qa-core/references/orchestration-doctrine.md`, FAIL-CLOSED GATES). The labels only say a pre-sprint pass happened; the ATP body it published is the pass. The default is therefore the full flow, and short-circuit mode opens only when every row below holds, each with its evidence noted in the session:

| Condition | Evidence to cite | When it is missing or doubtful |
|---|---|---|
| The Story carries `shift-left-reviewed` AND a dated `shift-left-{YYYY-MM-DD}` | the labels in the synced `story.md` | no Shift-Left pass: normal in-sprint flow, go to §0.1 |
| The dated label is less than 30 days old | the date parsed from that label against the run date | full flow |
| A pre-sprint ATP body exists in Jira | after `bun run jira:sync-issues get <STORY_KEY> --include-comments`: the synced `acceptance-test-plan.md` carries an ATP body (refined ACs, outline names). When that file is the "field not configured" stub, the body is the `## Acceptance Test Plan (ATP)` comment in the synced `comments.md` | full flow. A label with no body is a marker, not evidence |
| The refined ACs still match the current Story description | the comparison done in the validation step below | full flow |

Only `/shift-left-testing` produces this evidence. Stage 1 never adds the Shift-Left labels and never writes the ATP field before this check, so it cannot open its own gate.

Short-circuit mode action:

- READ the ATP body cited above, `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/acceptance-test-plan.md` (or the fallback comment), from the sync just run so it reflects Jira.

  > **Read the synced ATP, never a local scratch file.** Shift-Left wrote its refinement into the Jira `acceptance_test_plan` field (field-first: pre-sprint the ATP lives ONLY in that field, and the Test Plan ITEM is born in THIS stage, find-or-created from the field), so `acceptance-test-plan.md` is the pre-sprint refinement here. A local staging file under a gitignored path (such as `shift-left-refinement.md`) does not exist in a fresh session or on a teammate's machine, and a short-circuit that reads it silently degrades to a full re-run. Jira is the only copy every session can reach.

- VALIDATE: do the refined ACs still match the current Story description? If yes, **SKIP Phases 1, 2, 3** of this reference, since they were done pre-sprint.
- Continue from Phase 4 (Test Design, outlines), this time WITH parametrization tables, per-outline test-data JSON and numbered test steps. The pre-sprint draft outlined the names only; this Phase 4 fills in the executable detail.
- Also continue with Phase 5 (test-data generation strategy and Faker recipes), which was skipped pre-sprint too.
- The ATP authored here is a SUPERSET of the pre-sprint body. Write it back to the SAME `acceptance_test_plan` field AND into the Test Plan item this stage finds-or-creates FROM that field (pre-sprint there is no item, because shift-left is field-first by design). There is one ATP per Story: the in-sprint version supersedes the pre-sprint one, and the `shift-left-{YYYY-MM-DD}` label records when the early pass happened.

If any row of the table fails, or its evidence cannot be cited (refined ACs no longer match the current Story, the dated label is 30 days old or more, no ATP body after the sync), fall through to the standard Phase 0 below and run veto, risk and Phases 1-3 again. Re-running costs less than acting on stale or missing refinement.

### 0.1 Veto table

**SKIP TESTING (Code Review only):** backend-only code with no UI, infra / DevOps, static copy edits, pure CSS, documentation, tech-debt refactor with no behavior change, DB setup with no business logic.

**REQUIRE TESTING (force Full regardless of score):** money / billing, data integrity on core entities, auth / authorization, external integrations, bug fix in a critical module, calculations / formulas.

On SKIP, verify the fix in code, comment on the ticket and stop: no ATP. On REQUIRE, skip to 0.3.

### 0.2 Risk score (only if no veto)

| Factor | Score | Condition |
|--------|-------|-----------|
| New feature | +3 | New functionality vs modification |
| Dynamic data (API / DB) | +3 | Not hardcoded / static |
| Explicit ACs present | +2 | Acceptance criteria defined |
| User-facing | +2 | Affects UI or visible behavior |
| High effort | +2 | Person-hours > 4 |
| High priority | +1 | Priority High or Critical |
| Multi-component | +1 | Multiple codebase areas touched |

| Score | Level | Action |
|-------|-------|--------|
| 0-3 | LOW | Code Review only (treat as SKIP veto) |
| 4-7 | MEDIUM | Full ATP (standard flow) |
| 8+ | HIGH | Full ATP + extended edge cases |

When the change is already in a diff (a bug fix, or a Story that reached Ready For QA), the Multi-component factor and the Phase 1 regression surface are better judged after seeing what else the change can break. Call the Skill tool with "blast-radius" for that. The skill never needs a person; carry its one safety fact, proven or marked `unproven`, into the triage note. When the skill is not installed, do the step inline (read the diff, list the modules and callers it touches) and say in the triage note that the skill was absent. Never block on it.

Present the triage result to the user before proceeding. A supervised worker sends it to its conductor, and a routine with nobody present records it in the session notes and continues only when the delegating brief covers the decision (`agentic-qa-core/references/decision-protocol.md`).

### 0.3 Data feasibility check

For each AC, assess whether the test data is obtainable in staging. Classify with one of three patterns: **Discover** (data already exists as-is), **Modify** (existing data can be altered to match the precondition), **Generate** (must be created fresh via API/DB seeding or UI). If none applies, the AC is blocked pending data availability.

| AC | Precondition | Data found? | Pattern | Notes |
|----|--------------|-------------|---------|-------|
| AC1 | {state} | Yes / No | Discover / Modify / Generate | {entity found or blocker} |

A critical precondition with no data path is flagged as a risk in the ATP. When a veto-level AC is blocked on data, escalate to the user before writing outlines (conductor for a supervised worker; in a routine, report the blocker and stop before any outline or Jira write).

---

## Phase 1 — Critical Analysis

Anchor the ticket to its business and technical context.

### Business context
- Primary + secondary user personas affected
- Business value proposition + KPI influenced
- User journey and which step this ticket sits in

### Technical context
- Frontend: components, pages/routes, state management (if any)
- Backend: endpoints from the `business-api-context` map / `api/schemas/`, services, DB tables
- External services (if any)
- Integration points specific to this ticket

### Story complexity
Rate Low / Medium / High on each axis: business logic, integration, data validation, UI. Estimate the test effort. This sets the coverage expectations in Phase 4.

### Epic-level inheritance
From the feature plan and epic comments:
- Epic-level risks that apply to this ticket (restate with ticket-level relevance)
- Integration points inherited
- PO / Dev answers already given at epic level (reuse them, do not re-ask)
- Test strategy inherited (levels, tools)
- Unique considerations not covered at epic level

---

## Phase 2 — Story Quality Analysis

For each of these, write the entry in the shape shown:

- **Ambiguities**: location in the story + question for PO/Dev + impact on testing + suggested clarification
- **Gaps (missing info)**: type (AC / technical detail / business rule) + why it matters + what to add + risk if omitted
- **Edge cases not in the story**: scenario + expected behavior (best guess, flagged for PO confirmation) + criticality + action (add to AC / test only / ask PO)
- **Testability validation**: Yes / Partial / No + list of issues (vague AC, missing error messages, no test data examples, missing performance criteria, cannot isolate)

If the story is already clear, say so. A short "no issues found" beats invented questions.

---

## Phase 3 — Refined Acceptance Criteria

Rewrite each original AC as a Given / When / Then scenario with **specific data**, and add new scenarios for the edge cases Phase 2 surfaced.

Template per scenario:

- **Type**: Positive / Negative / Boundary / Edge
- **Priority**: Critical / High / Medium / Low
- **Given**: initial system state + preconditions (user role, pre-existing data, configuration)
- **When**: the triggering action with exact input values
- **Then**: expected UI result + API status+body (if applicable) + DB changes + system state

For Negative scenarios include the exact error message, status code, response error shape, and a "no DB change" verification.

Mark edge-case scenarios sourced from Phase 2 with **NEEDS PO/DEV CONFIRMATION** until someone answers.

**1:N is the default: explode, then justify any collapse.** A non-trivial AC implies several scenarios: at minimum a valid partition, each distinct invalid partition, and the boundaries. Derive them with the Phase 4 techniques. Reduce an AC to a single scenario only when it is trivially atomic (one boolean, no ranges, no states, no interacting inputs), and write the reason inline (`collapsed: trivially atomic`). The count is whatever the techniques yield, with no minimum and no maximum, but never "1 by default". Anti-padding still holds: a scenario must explore a partition, boundary, state or risk that a sibling does not. A complex money flow may need 12, and a trivially atomic toggle may justify 1.

---

## Phase 4 — Test Design (Test Outlines)

### Technique-driven derivation (run FIRST, it decides the outline set)

Counts come last. For each refined AC, pick the technique(s) its shape demands (canon and worked example: `agentic-qa-core/references/test-design-doctrine.md`). The triggers are binding:

| Trigger in the AC | Technique | What it produces |
|---|---|---|
| Any input domain (always) | **Equivalence Partitioning** | one outline per valid class + one per distinct invalid class |
| A range / limit / length / count / date-window | **Boundary Value Analysis** | outlines at `min-1·min·min+1 … max-1·max·max+1`, plus zero / empty / null / overflow |
| A status / lifecycle / workflow field | **State-Transition** | one outline per valid transition + per *invalid* transition (trigger rejected in a state) |
| 2+ conditions that interact (role × flag × status …) | **Decision Table** | enumerate condition combos, collapse equivalents, one outline per surviving rule |
| 3+ combinable factors (browser × locale × plan …) | **Pairwise** | all-pairs selection; **log that pairwise was applied** so the reduction is visible |
| Experience-based risk | **Error Guessing charter** | a time-boxed exploration mission (double-submit, back-button, `<script>`, expired token …) |

Record, per AC, which technique(s) fired and, if the AC collapsed to a single outline, the `trivially atomic` justification. An AC with a range and no BVA outlines, or a status field with no transition outlines, is an incomplete plan.

### Coverage estimate

| Type | Count | Notes |
|------|-------|-------|
| Positive | X | Happy path variants |
| Negative | Y | Invalid inputs, unauthorized access, missing fields |
| Boundary | Z | Min / max / empty / null / unicode / special chars |
| Integration | W | Per integration point from Phase 1 |
| API | V | Per endpoint touched |

Add a rationale paragraph: why this count, given the complexity axes from Phase 1.

### Parametrization

Identify groups where the same behavior runs with varying data. Render each group as:

| Param 1 | Param 2 | … | Expected |
|---------|---------|---|----------|

State the total tests from parametrization and the benefit (deduplication, broader input coverage). If there is no parametrization, explain briefly why.

### Test outline naming (Shift-Left convention)

Format: `Should <BEHAVIOR> <CONDITION>`.

- **BEHAVIOR** = verb + object (login successfully, display error, calculate total)
- **CONDITION** = the context that makes the case unique (with valid credentials, when field is empty, for premium users, at limit)

Examples:
- Positive: "Should login successfully with valid credentials"
- Negative: "Should display authentication error when password is incorrect"
- Boundary: "Should accept character limit when entering exactly 50 chars"
- Edge: "Should handle cart when there are multiple same items"

Names like `Login test`, `Login - error`, `Test the form` and `Negative case` fail, because they omit the behavior or the condition.

**Note:** in Stage 4, `test-documentation` prepends `{US_ID}: TC#:` (always the User Story key, never the Test Set ID) to formalize these in Xray. Test Set membership is a `TC→ATS` issue link in both modalities (plus the Xray-internal membership in jira-xray, `agentic-qa-core/references/traceability-linking.md` §9), never the title. Do not add the prefix here: this is manual / shift-left, not formal TC.

### Outline structure (per scenario)

For every outline produce:

- **Title** (Should … with …)
- **Related scenario** (Phase 3 reference)
- **Type / Priority / Test level** (UI / API / Integration / E2E)
- **Parametrized** (Yes + group / No)
- **Preconditions**: specific initial state, pre-existing data, user role
- **Test steps**: numbered actions with exact data (Data: Field1: "value1", …) and verifications (Verify: …)
- **Expected result**: UI visual / message, API status+body JSON, DB state change with table + record + fields, system state change
- **Test data**: JSON block of inputs and user context
- **Post-conditions**: state after the test, cleanup if any

Repeat for every scenario from Phase 3, and keep the full list.

### Integration outlines (if applicable)

For each integration point from Phase 1:

- **Integration point**: FE↔API, API↔DB, API↔External
- **Preconditions**: what must be running (backend up, mock configured, etc.)
- **Flow**: request → processing → response → downstream
- **Contract validation**: assertions against the OpenAPI spec (request shape, response shape, status codes)
- **Mock strategy**: for external services (MSW / Nock / provider test mode); real integration validated in staging manually
- **Expected result**: data flows correctly through the chain, with no loss or transformation error

---

## Phase 5 — Edge case + Test-data summary

### Edge case table
| Edge case | In original story? | Added to refined AC? | Outline | Priority |

### Test-data categories
| Data type | Count | Purpose | Examples |
| Valid / Invalid / Boundary / Edge |

### Data generation strategy
- **Static**: hardcoded because critical or specific
- **Dynamic (Faker.js)**: `faker.internet.email()`, `faker.person.firstName()`, `faker.number.int({min, max})`, `faker.date.recent()`
- **Cleanup**: tests are idempotent, data is cleaned after execution, order does not matter

---

## Phase 6 — Traceability + Ticket updates

### Update ticket in Jira / TMS

Append a "QA Refinements (Shift-Left Analysis)" section to the ticket description:
- Refined Acceptance Criteria (Phase 3)
- Edge Cases Identified (Phase 2)
- Clarified Business Rules (Phase 2)

### Create ATP + ATR (branch on TMS modality)

The modality was resolved in Session Start (§0) and persisted into `test-session-memory.md`; apply the matching branch (`test-documentation/references/tms-architecture.md` §Container per modality).

> **Prerequisite (both modalities)**: load `/acli` before executing any `[ISSUE_TRACKER_TOOL]` block below. In Modality jira-xray, also load `/xray-cli` for `[TMS_TOOL]` calls. Skip if Session Start §0.1 in `SKILL.md` already did.

> **Title grammar (QA planning ladder)**: every Plan, Set and Run uses `{ACRONYM}: {scope-id}: {descriptor}`.
> - **ATP** (Story Test Plan): `ATP: {STORY-KEY}: {story title}`, e.g. `ATP: PROJ-123: Apply discount at checkout`. Pre-sprint the ATP lives ONLY in the `{{jira.acceptance_test_plan}}` field (shift-left is field-first); Stage 1 finds-or-creates the item FROM the field.
> - **ATS** (Acceptance Test Set, the Story's coverage backbone): `ATS: {US_ID}: {story title}` (`{US_ID}` = the Story key), MANDATORY per Story even with a single TC, e.g. `ATS: PROJ-123: Apply discount at checkout`. Components are inherited from the Story (mandatory). Feature/suite-altitude grouping keeps the optional `TS: {EPIC|module}: Validate {feature}` form (components optional, because it crosses modules).
> - **ATR** (Story Test Execution): `ATR: {STORY-KEY}: Story Testing`. The Story-level run is named **Story Testing** and runs ONCE per sprint per Story, e.g. `ATR: PROJ-123: Story Testing`. ALWAYS created with the Test Environment (`active_env`).
> - **FTP** (Feature Test Plan, feature/Epic altitude, see `feature-test-planning.md`): `FTP: {EPIC-KEY}: {feature}`, e.g. `FTP: PROJ-42: Checkout & Payments`. Item-first; find-or-created and updated when this skill loads the Epic's context, consumed thereafter.
>
> Bug-fix verification keeps `ReTest: {BUG_KEY}: {summary}` (a Test Execution). At sprint altitude, `STP: Sprint#{N}: {objective}` is find-or-created at Session Start of the sprint's FIRST ticket (SKILL.md §Session Start 0.7) and updated per tested ticket; `STR: Sprint#{N}: Regression Testing` is created at sprint close (batch-close recap or `/regression-testing`, whichever arrives first). The ladder has no FTR or PRC rung: an FTR would duplicate the STR, and Precondition is already an Xray entity without a ladder acronym.

> **Items over fields (excellence default, both modalities)**: by excellence ATP is a **Test Plan** issue, ATR is a **Test Execution** issue and ATS is a **Test Set** issue. Parent every Test Plan (ATP / FTP / STP) to the **QA Master Test Plan** epic, and every Test Execution (ATR / STR) and Test Set (ATS) to the **QA Test Artifacts** epic. The Story custom field (`{{jira.acceptance_test_plan}}` / `{{jira.acceptance_test_results}}`) is a **fallback ONLY**, for instances where the Test Plan / Test Execution work types are unavailable.

#### Modality jira-xray — Set-first order (AUTHORITATIVE)

ATP = `Test Plan` issue. ATR = `Test Execution` issue. ATS = `Test Set` issue, the Story's coverage backbone (MANDATORY per Story, even with a single TC). Execute in THIS order. The ATP's and the ATR's test lists are DERIVED from the ATS membership, never maintained as three independent id lists.

```
# ① ATS — create/update the Story's Test Set holding ALL its TCs
#    (the sprint `Test` issues were created per SKILL.md §"TC creation timing")
[TMS_TOOL] Find-or-create TestSet:
  project: {{PROJECT_KEY}}
  title: ATS: {US_ID}: {story title}
  parentEpic: QA Test Artifacts
  components: {inherited from the Story — MANDATORY}

[TMS_TOOL] Add Tests to TestSet:            # Xray-internal membership (GraphQL) — creates NO Jira link
  set: {ATS_KEY}
  tests: [ALL of the Story's TCs]

[ISSUE_TRACKER_TOOL] Link Issues:           # ONE per member TC — the membership link, required in BOTH
  linkType: {{jira.link_types.test.name}}   # modalities (`traceability-linking.md` §9): ATS is tested by TC
  outward: {TC_KEY}
  inward:  {ATS_KEY}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by ATS — THE coverage link: this is what
  outward: {ATS_KEY}                        # fills the Xray coverage panel (`xray-cli/SKILL.md` §Direction)
  inward:  {STORY_KEY}

# ② ATP item FROM the field (find-or-create)
#    Pre-sprint the ATP lives ONLY in {{jira.acceptance_test_plan}} (shift-left is field-first).
#    Search for an existing `ATP: {STORY-KEY}:` Test Plan first; create only if absent.
[TMS_TOOL] Find-or-create TestPlan:
  project: {{PROJECT_KEY}}
  title: ATP: {STORY-KEY}: {story title}
  parentEpic: QA Master Test Plan

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {ATP_KEY}
  description: {full ATP body — seeded from the {{jira.acceptance_test_plan}} field content when the
                shift-left pass left it; authored fresh (item + field) when the field is empty}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Plan — ADMINISTRATIVE traceability
  outward: {ATP_KEY}                        # (contributes ZERO coverage, see `xray-cli/SKILL.md` §Direction; the ATS link
  inward:  {STORY_KEY}                      #  above is the coverage edge)

# ③ + ④ ATR — created WITH the Test Environment; test list derived from the ATS
[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: ATR: {STORY-KEY}: Story Testing
  parentEpic: QA Test Artifacts
  testPlan: {ATP_KEY}
  environment: {active_env from .agents/project.yaml, or the session env switch}
  # MANDATORY — no ATR without environment (hard gate: agentic-qa-core/references/stage-gates.md §Stage 1)
  tests: {derived FROM the ATS membership}

[TMS_TOOL] Add Tests to TestPlan:           # the Plan's test list too derives from the ATS membership
  plan: {ATP_KEY}
  tests: {derived FROM the ATS membership}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Execution — administrative only
  outward: {ATR_KEY}
  inward:  {STORY_KEY}
```

> Resolve the `test` link type by slug only and verify the direction after each create. See `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality + mandatory verification).

Load `/xray-cli` for the concrete CLI syntax.

#### Modality jira-native (no Xray) — first-class: same containers, no run engine

This branch is the **degraded fallback** (Test Plan / Test Execution work types unavailable). ATP and ATR live on the Story itself, with no separate issues. Use the custom field IDs from `test-documentation/references/jira-setup.md`: `{{jira.acceptance_test_plan}}` for ATP and `{{jira.acceptance_test_results}}` for ATR. Each field is the source of truth; a `## <label>` comment is posted ONLY as a fallback when the field is absent on the instance. `test-documentation` mode `repair-traceability` checks the field, or the fallback comment when the field is absent.

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: {full ATP body}

# Fallback only if {{jira.acceptance_test_plan}} is absent in .agents/jira-fields.json:
[ISSUE_TRACKER_TOOL] Add Comment:
  issue: {STORY_KEY}
  body: |
    ## Acceptance Test Plan (ATP)
    {full ATP body}

# ATR container is created empty now and filled at Stage 3:
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_results}}: "ATR: {STORY-KEY}: Story Testing — pending execution"
```

Load `/acli` for the concrete Jira CLI syntax.

### Comment with full outlines

Post the full ATP body as a notification comment with mentions for @PO, @Dev, @QA per project convention. Include an Action Required checklist (review ambiguities, answer critical questions, confirm edge-case behavior, validate the parametrization strategy). The comment is an outward Jira write, so a routine with nobody present posts it only when the delegating brief covers Jira writes, and otherwise stops before it and reports.

In Modality jira-native, when `{{jira.acceptance_test_plan}}` is absent the structured `## Acceptance Test Plan (ATP)` fallback comment carries the ATP content, and that is what `test-documentation` mode `repair-traceability` checks later.

### Materialize the local cache (from sync, never hand-written)

After the ATP content is in Jira, materialize the read-only cache for the modality and read it back to confirm:

- **Modality jira-native**: `bun run jira:sync-issues get <STORY_KEY> --include-comments` produces `acceptance-test-plan.md` in the STORY folder.
- **Modality jira-xray**: `bun run jira:sync-issues get <ATP_KEY>` produces `test-plans/ATP-<ATP_KEY>-<slug>.md` (per `work_types.test_plan.sync` in `.agents/jira-required.yaml`).

Jira is the source of truth and the synced file is a read-only cache. Never hand-write it.

### Status + ownership check (before the traceability check)

Every artifact this phase created carries `assignee` = the authenticated session user, set at create time (an unassigned Test Plan cannot have its test list edited in Xray later, `agentic-qa-core/references/artifact-lifecycle.md` §2). Each artifact leaves Stage 1 in the status below, starting from the one Jira's `create` transition gave it (§1):

| Artifact | Fire | Ends Stage 1 at |
|---|---|---|
| each sprint `Test` | `{{jira.transition.test_case.start_design}}` → `{{jira.transition.test_case.ready_to_run}}` | `{{jira.status.test_case.ready}}` (parent: **QA Test Repository**) |
| ATP | `{{jira.transition.test_plan.designed}}` | `{{jira.status.test_plan.ready}}` — **not** `completed`, that is Stage 3 |
| ATS | — | stays `{{jira.status.test_set.designing}}` (membership final at Stage 3) |
| ATR | — | stays `{{jira.status.test_execution.active}}` (the run has not happened) |

On an unmapped slug, run the fallback protocol in `agentic-qa-core/references/artifact-lifecycle.md` §4: list the LIVE transitions, propose the closest synonym in ONE `AskUserQuestion`, fire the live id on yes, and recommend `bun run jira:sync-workflows`. Do not skip silently and do not guess an id. A supervised worker passes that question to its conductor, and a routine with nobody present leaves the transition unfired and reports the unmapped slug.

### Traceability check

After materializing, verify the links:

- **Modality jira-xray**: run the **three-edge check** (`agentic-qa-core/references/traceability-linking.md` §Traceability verification: Link List on Story + ATP + ATR, or `bun xray trace {TICKET}`) and verify the Set-first model: **Story↔ATS via the `test` slug (the coverage link) + ATS membership complete + ATP/ATR test lists matching the ATS + Story↔ATP / Story↔ATR (administrative)**.
- **Modality jira-native**: verify the Story's `{{jira.acceptance_test_plan}}` is populated, or that the `## Acceptance Test Plan (ATP)` fallback comment exists.

Traceability reads stay on `[TMS_TOOL]` / `/acli`, not the sync. Bugs get the repro Test only at fix-verification (jira-xray) or no TCs at all (jira-native), so "missing TC" warnings on bugs before then are expected.

---

## Phase 7 — Final QA Feedback Report to the user

An executive summary covering:

- Story quality assessment (Good / Needs Improvement / Significant Issues)
- Key findings (1-3 bullets)
- Critical Questions for PO (with context + impact-if-unanswered + suggested answer if possible)
- Technical Questions for Dev (with context + testing impact)
- Suggested story improvements (current state → suggested change → benefit)
- Testing recommendations (pre / during / post implementation)
- Risks & mitigation (likelihood / impact / which outlines mitigate)
- What was done (Jira updates + local files + test coverage totals)
- Next steps, plus a **BLOCKER** note if PO/Dev answers are required before Dev starts

If risk is HIGH, add an extended-edge-cases callout and recommend a pre-implementation exploratory session.

---

## Phase 8 — No commit

Nothing is committed in this stage. The ATP is canonical in Jira, and the local `acceptance-test-plan.md` is a gitignored synced cache rebuilt by `bun run jira:sync-issues` (see `.agents/instructions/agent-local-context-pbi.md`). Never `git add` it, and never `git add -f` it, which would re-commit a generated Jira mirror.

---

## Bug Analysis variant

Bugs get ATP + ATR. The ATR is the retest Execution `ReTest: {BUG_KEY}: {summary}`, ALWAYS created with the Test Environment from `active_env`. In **Modality jira-xray**, plan ONE repro `Test` by default: it is created at fix-verification time (Stage 2), linked **Bug↔Test** via the `test` slug (Bug `is tested by` Test; bugs are coverable) and executed in the retest Execution with PASSED/FAILED recorded. Go 1:N only when the bug's scope genuinely covers distinct conditions, and justify it per `agentic-qa-core/references/test-design-doctrine.md`. In **Modality jira-native** there are **no TCs in-sprint**: the bug ticket is the implicit test case, and persistent-Test decisions defer to Stage 4 (golden rule unchanged). Replace Phases 1-4 with:

- **Reproduction**: exact steps from the bug ticket, expected vs actual
- **Root cause hypothesis** (from code exploration)
- **Fix verification plan**: the steps that must now pass on staging
- **Regression surface**: adjacent areas the fix could destabilize
- **Data integrity check**: if the bug touched persisted state, list the DB queries to run via `[DB_TOOL]` to confirm no orphaned records

Keep Phases 5-8 unchanged and skip Phase 3, since the bug ticket itself is the spec. The veto beats the risk score for bugs too (SKILL.md veto rules).

---

## Gotchas

1. **Plan before code**: write no outlines before the user OKs the story explanation from Session Start. A supervised worker takes that OK from its conductor, and a routine takes it from the delegating brief, stopping before any outline when the brief does not cover it.
2. **Specific data in scenarios**: "valid email" is not enough, write `"john+test@example.com"`.
3. **Inferred behavior is flagged**: behavior you invented is marked **NEEDS PO/DEV CONFIRMATION** and called out in the final report.
4. **Explode, then justify any collapse**: Phase 3 sets the rule. Forcing 10 empty outlines and stopping at 2 while boundaries and states go untested are both failures.
5. **TC body**: when TCs exist, the body is the `Test` issue's `description` (synced in both modalities). The Xray Gherkin / Test-Steps plugin field is NOT synced, since it only mirrors the description.
6. **Epic inheritance beats duplication**: if the feature plan already answered a risk or integration point, cite it.
7. **Language**: artifacts and commit messages are in English, and the conversation mirrors the user's language.
8. **Data feasibility blocks outlines**: see §0.3.
9. **Source order**: the canonical ATP is in Jira and the local file is a cache (see the top of this file).
10. **No ROI here**: this stage only tags Priority per outline.

---

## Checklist before handing off

- [ ] Triage decision recorded (SKIP / Code-Review / Full + risk score if computed)
- [ ] Data feasibility check complete, with the pattern column
- [ ] Phases 1-4 produced, edge cases labeled, PO-confirmation flags on inferred behavior
- [ ] Refined ACs + edge cases appended to the ticket description
- [ ] ATP content written to `{{jira.acceptance_test_plan}}` (or the `## Acceptance Test Plan (ATP)` fallback comment)
- [ ] jira-xray: Set-first order honored (ATP item from the field, ATS with ALL the Story's TCs linked via the `test` slug with components inherited, ATP/ATR lists derived from the ATS)
- [ ] jira-xray: ATR created WITH the Test Environment (`active_env`), because no environment means no ATR
- [ ] Synced ATP cache materialized, not hand-written (commands in Phase 6)
- [ ] Three-edge traceability check passed (Story↔ATS coverage + ATP↔Story + ATR↔Story administrative + lists match)
