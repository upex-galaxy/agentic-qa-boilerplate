# Acceptance Test Planning (Ticket-Level ATP)

> **Subagent context**: this file is part of the "Context docs" briefing component for the Stage 1 Planning subagent (see `sprint-testing/SKILL.md` §Subagent Dispatch Strategy and `sprint-orchestration.md` §"Briefing 2 — Stage 1 Planning subagent").

Stage 1 Planning for a single ticket inside a sprint. The ATP is authored in-session; **where it lives depends on TMS modality** (resolved in Session Start §0):

- **Modality jira-native**: ATP = the Story's `{{jira.acceptance_test_plan}}` field (or `fallback:` comment), written via `[ISSUE_TRACKER_TOOL]`, then materialized to the read-only cache `.../stories/STORY-<KEY>-<slug>/acceptance-test-plan.md` by `bun run jira:sync-issues get <STORY_KEY> --include-comments`.
- **Modality jira-xray**: ATP = the **Test Plan** issue's `description`, written via `[ISSUE_TRACKER_TOOL]`, then materialized to `.../test-plans/TESTPLAN-<ATP_KEY>-<slug>.md` by `bun run jira:sync-issues get <ATP_KEY>`.

The old local `test-analysis.md` mirror is **retired** — read the synced ATP file for the active modality instead. Jira is source of truth; never hand-write the synced file.

This reference is for **manual / exploratory in-sprint testing per ticket RIGHT NOW**. Its planning output is **TC outlines** (names + 1-line precond/expected), not the persistent regression TC set. Per the modality-aware TC-creation-timing rule (`sprint-testing/SKILL.md` §"TC creation timing"): **jira-native** creates no `Test` work items here (regression TCs are created in Stage 4, regression-worthy only); **jira-xray** **creates + executes** `Test` issues for the planned outlines this sprint (the `Test` is Xray's execution unit), which Stage 4 then selects + promotes into the Regression Test Plan. Either way this reference does **not** compute ROI scores or decide Candidate/Manual/Deferred (see `test-documentation` for Stage 4), nor produce automation `spec.md` (see `test-automation/planning-playbook.md`). Bug reports are covered in `reporting-templates.md` (pass 5c).

For feature / multi-story scope see `feature-test-planning.md`.

> **Before publishing ATP body to Story rich-text fields** (`{{jira.acceptance_test_plan}}` or description), read `../../agentic-qa-core/references/jira-publishing-gotchas.md` — covers the two ADF conversion gotchas (`md-to-adf` mark collision + MCP batched custom-field rejection) that silently fail HTTP 400.
> **And format for readability** per `../../acli/references/adf-authoring-style.md` — ATP test steps read best as a table (step → expected); use a panel for a shared precondition that spans scenarios. The field's hard-rule wins: if a scenario must be Gherkin, keep the fenced block — do not replace it with a table.

---

## The 4 Pillars of Spec-Driven Testing

Every phase in this document is an application of **Spec-Driven Testing (SDT)**: the specification defines what to test, not the tester's intuition. The four pillars are:

### 1. Test from Specs

```
BAD:  "I'm going to test the login and see what I find"   (aimless, no traceability)
GOOD: "I'm going to start from STORY-XXX's ACs, then probe BEYOND them —
       boundaries, invalid data, states, and anomalies the ACs don't mention"
```

Before testing: read the complete story, understand its ACs, and review documented test cases. The specification defines the **starting point** of coverage, not its limit. ACs are the floor — verifying them is the minimum, not the goal (Principle 1-2 of `agentic-qa-core/references/test-design-doctrine.md`). SDT means *anchored* testing (every case traces to a risk or an AC), NOT *AC-bounded* testing.

### 2. Traceability

```
BAD:  Bug: "The button doesn't work"
GOOD: Bug: "AC-3 of STORY-XXX fails: The submit button doesn't respond after click"
```

Every finding (pass, fail, or bug) must reference the story AND the specific AC it validates or violates. Phase 6 of this reference enforces this.

### 3. Coverage from Requirements

```
BAD:  "I tested everything I could think of"             (subjective, gaps invisible)
GOOD: "I verified each AC (the floor) AND probed the risk beyond it —
       boundaries, invalid data, state transitions, anomalies"
```

Coverage has **two axes**, and reporting only the first reports the floor:

1. **AC-conformance (the floor)** — % of ACs verified + % of test outlines executed.
2. **Risk-beyond-AC** — boundary / negative / state-transition / anomaly cases derived by technique (EP, BVA, State-Transition, Decision Tables, Pairwise), per `agentic-qa-core/references/test-design-doctrine.md`.

Phase 4 builds the outline set across BOTH axes. Never present "100% of ACs verified" as completeness — state it as the floor, then report what was probed above it.

### 4. Exploratory with Purpose

```
BAD:  Random clicking through the application
GOOD: Focused exploration on the story's risk areas
```

Exploratory testing starts from the story and its ACs, looks for undocumented edge cases, and documents findings with full traceability. Phase 2 surfaces these; Phase 5 catalogs them.

### SDT anti-patterns (reject on sight)

| Anti-pattern | Problem | SDT correction |
|--------------|---------|----------------|
| **Random testing** — "click around and see what happens" | No focus, no measurable coverage, no traceability | Start from story + ACs, produce outlines first |
| **Test without spec** — "I didn't read the story but I'll test anyway" | Cannot distinguish bug from expected behavior | Read the full ticket in Session Start before planning |
| **Bug without context** — "Bug: the button doesn't work" | Dev cannot determine intended behavior | Reference story ID + AC number + reproduction steps |
| **Coverage by intuition** — "I tested everything I could think of" | Subjective, gaps invisible | Measure against AC list (floor) + risk-beyond-AC outline checklist (EP / BVA / state / decision-table) |
| **AC-bounded testing** — "all ACs pass, so we're done" | Stops at the floor; misses boundaries, errors, states the AC is silent on | Treat ACs as the entry condition; derive risk-beyond-AC cases by technique before declaring coverage |

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

Read every item before planning. Fail fast if any project-wide context file is missing — hand off to `project-discovery`.

> **Prerequisite**: Load `/acli` skill before any `[ISSUE_TRACKER_TOOL]` WRITE. Detailed READS use `bun run jira:sync-issues` — not `/acli`. Skip the load if Session Start §0.1 in `SKILL.md` already loaded it.

| Input | Source |
|-------|--------|
| Ticket (title, description, ACs, priority, comments) | `bun run jira:sync-issues get <KEY> --include-comments` then read the synced `story.md` / `acceptance-criteria.md` / `comments.md` (Jira Key from `{STORY_PATH}/context.md`). NEVER `acli workitem view` for custom fields. |
| Team Discussion | Synced `comments.md` — extract decisions, tech notes, edge cases (see `session-entry-points.md`) |
| Parent epic + feature plan | `.context/PBI/epics/EPIC-<KEY>-<slug>/feature-test-plan.md` if it exists (synced from the epic) |
| Project-wide context | `.context/business/business-data-map.md`, `.context/business/business-feature-map.md`, `.context/business/business-api-map.md`, `.context/master-test-plan.md` |
| Module context | `.context/PBI/epics/EPIC-<KEY>-<slug>/module-context.md` |
| Code | `{{BACKEND_REPO}}/{{BACKEND_ENTRY}}` + `{{FRONTEND_REPO}}/{{FRONTEND_ENTRY}}` (targeted reads only) |
| Test data candidates | `[DB_TOOL]` on `{{DB_MCP}}` |
| Architecture + API contracts (if present) | `.context/SRS/architecture.md`, `.context/SRS/functional-specs.md`, `.context/SRS/non-functional-specs.md`; API contract from `api/openapi-types.ts` (types) + `.context/business/business-api-map.md` (business) |

---

## Output

```
.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-{{PROJECT_KEY}}-{number}-{brief-title}/
  acceptance-test-plan.md   # ATP — Jira-synced read-only cache (this doc's target output); never hand-written
  context.md                # hand-authored from session-start (NON-Jira)
  test-session-memory.md    # hand-authored (NON-Jira)
  evidence/
```

Also:
- Author the ATP body → write it to the Story's `{{jira.acceptance_test_plan}}` field (or `fallback:` comment) via `[ISSUE_TRACKER_TOOL]`; append the refined AC section to the ticket description; add label `shift-left-reviewed`.
- Run `bun run jira:sync-issues get <KEY> --include-comments` to materialize `acceptance-test-plan.md`; read it back to confirm. The synced file is a read-only cache — do not hand-edit or commit hand-written ATP content.

---

## Phase 0 — Triage

Triage decides whether the ticket deserves a full ATP. **Vetoes beat risk score.**

### 0.0 Shift-Left short-circuit (check FIRST)

Before running the veto + risk score, check whether the Story already passed through `/shift-left-testing`:

1. Read the Story labels from the synced `story.md` (or a trivial `[ISSUE_TRACKER_TOOL]` lookup for labels only).
2. Look for label `shift-left-reviewed` AND a dated label `shift-left-{YYYY-MM-DD}`.
3. Parse the date. If `today - date < 30 days` AND the Story's description has not changed since that date → **short-circuit mode**.

Short-circuit mode action:

- READ `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/shift-left-refinement.md` (the pre-sprint artifact).
- VALIDATE: do the refined ACs still match the current Story description? If yes, **SKIP Phases 1, 2, 3** of this reference — they were done pre-sprint.
- Continue from Phase 4 (Test Design — outlines), this time WITH parametrization tables + per-outline test-data JSON + numbered test steps. The pre-sprint draft outlined the NAMES only; this Phase 4 fills in the executable detail.
- ALSO continue with Phase 5 (test-data generation strategy + Faker recipes) — also skipped pre-sprint.
- The ATP authored here is a SUPERSET of `shift-left-refinement.md`; once written to Jira and synced it materializes as `acceptance-test-plan.md`. Both `shift-left-refinement.md` and `acceptance-test-plan.md` coexist in the STORY folder.

If validation fails (refined ACs no longer match the current Story OR the dated label is >30 days old OR `shift-left-refinement.md` is missing on disk), fall through to the standard Phase 0 below — run veto + risk + Phases 1-3 again. Re-running is cheaper than acting on stale refinement.

If the Story has NO `shift-left-reviewed` label, this is normal in-sprint flow — proceed to §0.1.

### 0.1 Veto table

**SKIP TESTING (Code Review only):** backend-only code with no UI, infra / DevOps, static copy edits, pure CSS, documentation, tech-debt refactor with no behavior change, DB setup with no business logic.

**REQUIRE TESTING (force Full regardless of score):** money / billing, data integrity on core entities, auth / authorization, external integrations, bug fix in a critical module, calculations / formulas.

If SKIP → verify fix in code, comment on ticket, done. No ATP. If REQUIRE → skip to 0.3.

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

Present triage result to the user before proceeding.

### 0.3 Data feasibility check

For each AC, assess whether test data is obtainable in staging. Classify using one of three patterns: **Discover** (data already exists as-is), **Modify** (existing data can be altered to match the precondition), **Generate** (must be created fresh via API/DB seeding or UI). If none applies, the AC is blocked pending data availability.

| AC | Precondition | Data found? | Pattern | Notes |
|----|--------------|-------------|---------|-------|
| AC1 | {state} | Yes / No | Discover / Modify / Generate | {entity found or blocker} |

If a critical precondition has no data path → flag as risk in the ATP. If a veto-level AC blocks data, escalate to the user before writing outlines.

---

## Part 0 — Git preparation

Checkout from `staging`, pull, create branch `test/{JIRA_KEY}/{short-desc}`. Only PBI-folder changes land on this branch (the synced `acceptance-test-plan.md` read-only cache plus hand-authored `context.md`) — no production code, no framework config.

---

## Phase 1 — Critical Analysis

Anchor the ticket to business + technical context.

### Business context
- Primary + secondary user personas affected
- Business value proposition + KPI influenced
- User journey and which step this ticket sits in

### Technical context
- Frontend: components, pages/routes, state management (if any)
- Backend: endpoints from `business-api-map.md` / `api/schemas/` / `api-contracts.yaml`, services, DB tables
- External services (if any)
- Integration points specific to this ticket

### Story complexity
Rate Low / Medium / High on each axis: business logic, integration, data validation, UI. Estimate test effort. This drives coverage expectations in Phase 4.

### Epic-level inheritance
From the feature plan + epic comments:
- Epic-level risks that apply to this ticket (restate with ticket-level relevance)
- Integration points inherited
- PO / Dev answers already given at epic level (reuse, do not re-ask)
- Test strategy inherited (levels, tools)
- Unique considerations not covered at epic level

---

## Phase 2 — Story Quality Analysis

For each:

- **Ambiguities**: location in story + question for PO/Dev + impact on testing + suggested clarification
- **Gaps (missing info)**: type (AC / technical detail / business rule) + why critical + what to add + risk if omitted
- **Edge cases not in story**: scenario + expected behavior (best guess, flag for PO confirmation) + criticality + action (add to AC / test only / ask PO)
- **Testability validation**: Yes / Partial / No + list of issues (vague AC, missing error messages, no test data examples, missing performance criteria, cannot isolate)

If the story is already clear, say so — a short "no issues found" is better than inventing questions.

---

## Phase 3 — Refined Acceptance Criteria

Rewrite each original AC as a Given / When / Then scenario with **specific data**. Add new scenarios for edge cases surfaced in Phase 2.

Template per scenario:

- **Type**: Positive / Negative / Boundary / Edge
- **Priority**: Critical / High / Medium / Low
- **Given**: initial system state + preconditions (user role, pre-existing data, configuration)
- **When**: the triggering action with exact input values
- **Then**: expected UI result + API status+body (if applicable) + DB changes + system state

For Negative scenarios include the exact error message, status code, response error shape, and a "no DB change" verification.

Mark edge-case scenarios sourced from Phase 2 with **NEEDS PO/DEV CONFIRMATION** until answered.

**1:N is the default (explode, then justify any collapse).** A non-trivial AC implies *several* scenarios — at minimum a valid partition, each distinct invalid partition, and the boundaries. Derive them with the techniques in Phase 4. Reduce an AC to a *single* scenario ONLY when it is trivially atomic (one boolean, no ranges, no states, no interacting inputs) and write the reason inline (`collapsed: trivially atomic`). The count is whatever the techniques yield — there is no minimum and no maximum, but it is never "1 by default". Anti-padding still holds: a scenario must explore a partition/boundary/state/risk a sibling does not. A complex money flow may need 12; a trivially-atomic toggle may justify 1.

---

## Phase 4 — Test Design (Test Outlines)

### Technique-driven derivation (run FIRST — it decides the outline set)

Do not jump to counts. For each refined AC, pick the technique(s) its shape demands (full canon + worked example: `agentic-qa-core/references/test-design-doctrine.md`). The triggers are binding:

| Trigger in the AC | Technique | What it produces |
|---|---|---|
| Any input domain (always) | **Equivalence Partitioning** | one outline per valid class + one per distinct invalid class |
| A range / limit / length / count / date-window | **Boundary Value Analysis** | outlines at `min-1·min·min+1 … max-1·max·max+1`, plus zero / empty / null / overflow |
| A status / lifecycle / workflow field | **State-Transition** | one outline per valid transition + per *invalid* transition (trigger rejected in a state) |
| 2+ conditions that interact (role × flag × status …) | **Decision Table** | enumerate condition combos, collapse equivalents, one outline per surviving rule |
| 3+ combinable factors (browser × locale × plan …) | **Pairwise** | all-pairs selection; **log that pairwise was applied** so the reduction is visible |
| Experience-based risk | **Error Guessing charter** | a time-boxed exploration mission (double-submit, back-button, `<script>`, expired token …) |

Record, per AC: which technique(s) fired, and — if an AC collapsed to a single outline — the `trivially atomic` justification. An AC with a range that has no BVA outlines, or a status field with no transition outlines, is an incomplete plan.

### Coverage estimate

| Type | Count | Notes |
|------|-------|-------|
| Positive | X | Happy path variants |
| Negative | Y | Invalid inputs, unauthorized access, missing fields |
| Boundary | Z | Min / max / empty / null / unicode / special chars |
| Integration | W | Per integration point from Phase 1 |
| API | V | Per endpoint touched |

Rationale paragraph: why this count, given the complexity axes from Phase 1.

### Parametrization

Identify groups where the same behavior runs with varying data. Render each group as:

| Param 1 | Param 2 | … | Expected |
|---------|---------|---|----------|

State total tests from parametrization and the benefit (deduplication, broader input coverage). If no parametrization, briefly explain why.

### Test outline naming (Shift-Left convention)

Format: `Should <BEHAVIOR> <CONDITION>`.

- **BEHAVIOR** = verb + object (login successfully, display error, calculate total)
- **CONDITION** = context that makes the case unique (with valid credentials, when field is empty, for premium users, at limit)

Examples:
- Positive — "Should login successfully with valid credentials"
- Negative — "Should display authentication error when password is incorrect"
- Boundary — "Should accept character limit when entering exactly 50 chars"
- Edge — "Should handle cart when there are multiple same items"

Anti-patterns: `Login test`, `Login - error`, `Test the form`, `Negative case`. Always describe behavior AND condition.

**Note:** In Stage 4 `test-documentation` prepends `<TS_ID>: TC#:` to formalize these in Xray. Do not add the prefix here — this is manual / shift-left, not formal TC.

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
- **Post-conditions**: state after test, cleanup if any

Repeat for all scenarios identified in Phase 3. Do not truncate the list.

### Integration outlines (if applicable)

For each integration point from Phase 1:

- **Integration point**: FE↔API, API↔DB, API↔External
- **Preconditions**: what must be running (backend up, mock configured, etc.)
- **Flow**: request → processing → response → downstream
- **Contract validation**: assertions against OpenAPI spec (request shape, response shape, status codes)
- **Mock strategy**: for external services (MSW / Nock / provider test mode); real integration validated in staging manually
- **Expected result**: data flows correctly through the chain, no loss / transformation error

---

## Phase 5 — Edge case + Test-data summary

### Edge case table
| Edge case | In original story? | Added to refined AC? | Outline | Priority |

### Test-data categories
| Data type | Count | Purpose | Examples |
| Valid / Invalid / Boundary / Edge |

### Data generation strategy
- **Static**: hardcoded because critical / specific
- **Dynamic (Faker.js)**: `faker.internet.email()`, `faker.person.firstName()`, `faker.number.int({min, max})`, `faker.date.recent()`
- **Cleanup**: tests idempotent, data cleaned after execution, order-independent

---

## Phase 6 — Traceability + Ticket updates

### Update ticket in Jira / TMS

Append "QA Refinements (Shift-Left Analysis)" section to the ticket description:
- Refined Acceptance Criteria (Phase 3)
- Edge Cases Identified (Phase 2)
- Clarified Business Rules (Phase 2)

Add label `shift-left-reviewed`.

### Create ATP + ATR — branch on TMS modality

The modality was resolved in Session Start (§0) and persisted into `test-session-memory.md`. Apply the matching branch. Full reference: `test-documentation/references/tms-architecture.md` §Container per modality.

> **Prerequisite (both modalities)**: Load `/acli` skill before executing any `[ISSUE_TRACKER_TOOL]` block below. In Modality jira-xray, additionally load `/xray-cli` for `[TMS_TOOL]` calls. Skip if Session Start §0.1 in `SKILL.md` already loaded them.

#### Modality jira-xray

ATP = `Test Plan` issue. ATR = `Test Execution` issue. Both linked bidirectionally to the Story.

```
[TMS_TOOL] Create TestPlan:
  project: {{PROJECT_KEY}}
  title: Test Plan: {{PROJECT_KEY}}-{n}

[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {ATP_KEY}
  description: {full ATP body}

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Plan
  outward: {ATP_KEY}
  inward:  {STORY_KEY}

[TMS_TOOL] Create Execution:
  project: {{PROJECT_KEY}}
  title: Test Results: {{PROJECT_KEY}}-{n}
  testPlan: {ATP_KEY}
  environment: {from session context, e.g. "Staging"}
  # tests: [] — filled at Stage 3 or by CI import

[ISSUE_TRACKER_TOOL] Link Issues:
  linkType: {{jira.link_types.test.name}}   # Story is tested by Test Execution
  outward: {ATR_KEY}
  inward:  {STORY_KEY}
```

> Resolve the `test` link type by slug only and verify direction after each create — see `agentic-qa-core/references/traceability-linking.md` (§2 slug resolution, §4 directionality + mandatory verification).

Load `/xray-cli` skill for the concrete CLI syntax.

#### Modality jira-native (no Xray)

ATP/ATR live on the Story itself — no separate issues. Use the custom field IDs from `test-documentation/references/jira-setup.md`: `{{jira.acceptance_test_plan}}` for ATP and `{{jira.acceptance_test_results}}` for ATR. Each field is the source of truth; a `## <label>` comment is posted ONLY as a fallback when the field is absent on the instance. `fix-traceability` checks the field, or the fallback comment when the field is absent.

```
[ISSUE_TRACKER_TOOL] Update Issue:
  issue: {STORY_KEY}
  fields:
    {{jira.acceptance_test_plan}}: {full ATP body}
  labels: +shift-left-reviewed

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
    {{jira.acceptance_test_results}}: "Test Results: {{PROJECT_KEY}}-{n} — pending execution"
```

Load `/acli` skill for the concrete Jira CLI syntax.

### Comment with full outlines

Post the full ATP body as a notification comment with mentions for @PO, @Dev, @QA per project convention. Include an Action Required checklist (review ambiguities, answer critical questions, confirm edge-case behavior, validate parametrization strategy).

In Modality jira-native, when `{{jira.acceptance_test_plan}}` is absent the structured `## Acceptance Test Plan (ATP)` fallback comment carries the ATP content — that is what `fix-traceability` checks later.

### Materialize the local cache (from sync, never hand-written)

After the ATP content is in Jira, materialize the read-only cache per modality, then read it back to confirm:

- **Modality jira-native**: `bun run jira:sync-issues get <STORY_KEY> --include-comments` → `acceptance-test-plan.md` in the STORY folder.
- **Modality jira-xray**: `bun run jira:sync-issues get <ATP_KEY>` → `test-plans/TESTPLAN-<ATP_KEY>-<slug>.md` (the sync supports the Test Plan issue type).

Jira is source of truth; the synced file is a read-only cache — NEVER hand-write it.

### Traceability check

After materializing, run `[TMS_TOOL] trace {TICKET}` (Modality jira-xray) or verify the Story's `{{jira.acceptance_test_plan}}` is populated (or the `## Acceptance Test Plan (ATP)` fallback comment exists) (Modality jira-native). Traceability reads stay on `[TMS_TOOL]` / `/acli` — not the sync. TCs are not created in this skill — the trace is for the ATP artifact alone. Bugs produce ATP + ATR with no TCs (the bug is the implicit test case); "missing TC" warnings on bugs are expected.

---

## Phase 7 — Final QA Feedback Report to the user

Executive summary covering:

- Story quality assessment (Good / Needs Improvement / Significant Issues)
- Key findings (1-3 bullets)
- Critical Questions for PO (with context + impact-if-unanswered + suggested answer if possible)
- Technical Questions for Dev (with context + testing impact)
- Suggested story improvements (current state → suggested change → benefit)
- Testing recommendations (pre / during / post implementation)
- Risks & mitigation (likelihood / impact / which outlines mitigate)
- What was done (Jira updates + local files + test coverage totals)
- Next steps + **BLOCKER** note if PO/Dev answers are required before Dev starts

If risk is HIGH, add an extended-edge-cases callout and recommend a pre-implementation exploratory session.

---

## Phase 8 — Commit

On branch `test/{JIRA_KEY}/{short-desc}`:

```
git add .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/acceptance-test-plan.md
git commit -m "test({JIRA_KEY}): add shift-left test outlines for {brief-title}"
```

Never include AI-attribution. Never amend pushed commits. Never push to `main` without explicit user confirmation (see SKILL.md Gotchas).

---

## Bug Analysis variant

Bugs get ATP + ATR but **no TCs** — the bug ticket is the implicit test case. Replace Phases 1-4 with:

- **Reproduction**: exact steps from the bug ticket → expected vs actual
- **Root cause hypothesis** (from code exploration)
- **Fix verification plan**: the steps that must now pass on staging
- **Regression surface**: adjacent areas that could be destabilized by the fix
- **Data integrity check**: if the bug touched persisted state, list the DB queries to run via `[DB_TOOL]` to confirm no orphaned records

Keep Phases 5-8 unchanged. Skip Phase 3 refinement since the bug ticket itself is the spec.

See SKILL.md veto rules — veto beats risk score for bugs too.

---

## Gotchas

1. **Plan before code** — no outline writing before the user OKs the story explanation from Session Start.
2. **Specific data in scenarios** — "valid email" is not enough; write `"john+test@example.com"`.
3. **Edge cases flagged for PO** — if you invented the expected behavior, mark it **NEEDS PO/DEV CONFIRMATION** and call it out in the final report.
4. **Explode by default; justify any collapse (not the reverse)** — the count is whatever the Phase 4 techniques yield. A trivially-atomic AC may legitimately collapse to 1-2 outlines *with a stated reason* (`trivially atomic`); a money/range/stateful AC almost never does. Anti-padding = never add an outline that explores nothing a sibling does not — NOT "default to the smallest number". Both forcing 10 empty outlines and stopping at 2 when boundaries/states are untested are failures.
5. **Traceability now, TCs later** — this skill produces the ATP only. Stage 4 `test-documentation` turns these outlines into Xray TCs with ROI scoring. When TCs do exist, the TC body = the `Test` issue's `description` (synced in both modalities); the Xray Gherkin / Test-Steps plugin field is NOT synced — it only mirrors the description.
6. **Epic inheritance beats duplication** — if the feature plan already answered a risk or integration point, cite it, do not re-derive.
7. **Language** — artifacts + commit messages in English; conversation mirrors the user's language.
8. **Data feasibility is a blocker** — if a critical AC has no reachable data, stop and surface the blocker before writing outlines.
9. **Source order** — the canonical ATP is in Jira (jira-native: Story `{{jira.acceptance_test_plan}}` field or `## Acceptance Test Plan (ATP)` fallback comment; jira-xray: the Test Plan issue's `description`). The local synced file is a read-only cache materialized by `bun run jira:sync-issues` (jira-native → `acceptance-test-plan.md`; jira-xray → `test-plans/TESTPLAN-<ATP_KEY>-<slug>.md`). Never hand-write or hand-edit the synced file.
10. **No ROI here** — prioritization for regression backlog is `test-documentation`'s job; this skill only tags Priority per outline.

---

## Checklist before handing off

- [ ] Triage decision recorded (SKIP / Code-Review / Full + risk score if computed)
- [ ] Data feasibility check complete with pattern column
- [ ] Branch `test/{JIRA_KEY}/{short-desc}` created from `staging`
- [ ] Phases 1-4 produced with realistic scenario + outline counts
- [ ] Edge cases labeled, PO-confirmation flags on any inferred behavior
- [ ] Refined ACs + Edge Cases appended to ticket description
- [ ] Label `shift-left-reviewed` added
- [ ] ATP content written to `{{jira.acceptance_test_plan}}` (or `## Acceptance Test Plan (ATP)` fallback comment)
- [ ] Synced ATP cache materialized (not hand-written) — jira-native: `acceptance-test-plan.md` via `bun run jira:sync-issues get <STORY_KEY> --include-comments`; jira-xray: `test-plans/TESTPLAN-<ATP_KEY>-<slug>.md` via `bun run jira:sync-issues get <ATP_KEY>`
- [ ] Trace verified via `[TMS_TOOL] trace {TICKET}`
- [ ] Final report delivered to user with open questions + blocker note if needed
- [ ] Commit landed on the test branch, no AI attribution
