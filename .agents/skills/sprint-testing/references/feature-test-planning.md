# Feature Test Planning (Feature / Multi-Story Scope)

Use when the Stage 1 work scope is a whole feature (epic, module, multi-story batch) rather than a single story. Output is a feature-level test plan that informs per-ticket ATPs. The FTP is **item-first**: find-or-create the **Test Plan** issue `FTP: {EPIC-KEY}: {feature}` (parent: **QA Master Test Plan** epic) whenever this skill loads the Epic's context, author/refresh the plan into its `description`, and CONSUME it as context thereafter. The Epic's feature-test-plan custom field (if one exists in `.agents/jira-fields.json`) or a structured `## Feature Test Plan` comment per the `fallback:` convention in `.agents/jira-required.yaml` is the **fallback ONLY** when the Test Plan work type is unavailable — both written via `[ISSUE_TRACKER_TOOL]`. Then materialize the local cache: `bun run jira:sync-issues get <EPIC-KEY> --include-comments` → `.context/PBI/epics/EPIC-<KEY>-<slug>/feature-test-plan.md` (fallback path; the FTP item's description syncs like any Test Plan issue). NEVER hand-write that file.

For single-story Stage 1 work read `acceptance-test-planning.md` instead. Sprint-testing planning is manual / exploratory — do not confuse it with `test-automation`'s `planning-playbook.md` (which produces `spec.md` for automation code) or `test-documentation`'s ROI scoring (which decides which tests enter the regression backlog).

---

## When to generate a feature-level plan

| Signal | Action |
|--------|--------|
| Ticket is an epic or module with 3+ child stories and shared risks | Generate feature test plan first, then per-story ATPs |
| Single story, no siblings | Skip — go straight to `acceptance-test-planning.md` |
| Story belongs to an epic that already has a synced `feature-test-plan.md` | Reuse. New ATP inherits risks + integration points from it |
| Feature groups cross cutting concerns (auth, data integrity, money flows) | Generate even for 2 stories — shared risk surface justifies it |

A feature plan exists to capture shared risks, integration points, and critical questions **once**, so the downstream per-story ATPs do not duplicate them.

---

## A living document, and its sibling stories

Two properties follow from the feature altitude. Both change how the plan is used downstream, and neither is optional.

**The FTP is living, not frozen.** It is authored once per epic and then refined continuously across it. Every story that ships teaches the team something the plan did not know — an integration boundary that turned out to be real, a risk that never materialized, an answer the PO finally gave. Fold that back into the plan (see Gotcha 6, "Regeneration"). A feature plan that has not moved since the first story of a long epic is stale, not stable.

**Analyze the sibling stories, not just the one in hand.** When a tester picks up a story, the unit of analysis is the epic, not the ticket: read the siblings that already shipped, the ones currently in development, and the ones that are only defined and not yet built. That full-feature picture is what makes the per-story ATPs good — it surfaces shared preconditions, cross-story state, and regression surface that a single-story reading cannot see. The sibling list comes free from the JQL child-story query in "Inputs required".

---

## Inputs required

Read before starting. All paths relative to repo root.

> **Prerequisite**: Load `/acli` skill before any `[ISSUE_TRACKER_TOOL]` WRITE (epic field/comment update). Detailed READS of the epic + children use `bun run jira:sync-issues` — not `/acli`. Skip the load if Session Start §0.1 in `SKILL.md` already loaded it.

| Input | Source |
|-------|--------|
| Epic / feature ticket (detail) | `bun run jira:sync-issues get <EPIC-KEY> --include-comments` then read the synced `epic.md` / custom-field files |
| Child story list | `bun run jira:sync-issues jql "parent = <EPIC-KEY>"` (or `[ISSUE_TRACKER_TOOL]` search for a trivial key/summary list only) |
| Business context | `.context/business/business-data-map.md` + `.context/master-test-plan.md` |
| API context | `.context/business/business-api-map.md` (business angle) + `api/schemas/` (generated types from `bun run api:sync`) |
| Architecture + SRS (if present) | `.context/SRS/architecture.md`, `.context/SRS/functional-specs.md`, `.context/SRS/non-functional-specs.md` (API contract comes from `api/openapi-types.ts` and `.context/business/business-api-map.md`, not from SRS) |
| Prior epic discussions | Synced `comments.md` from the epic (Team Discussion extraction — see `session-entry-points.md`) |

If project-wide context files are missing, stop and hand off to `project-discovery`. Do not proceed on partial context.

---

## Output location

```
.context/PBI/epics/EPIC-<KEY>-<slug>/
  feature-test-plan.md     # this document — Jira-synced (read-only cache); never hand-written
  context.md               # hand-authored from session-start (NON-Jira)
  stories/                 # child STORY-<KEY>-<slug>/ folders get their own ATP later
```

Keep the feature plan **feature-level**: no per-story test cases, no test data values. Those belong in the per-story ATP.

---

## Nomenclature — FTP (item-first)

The feature altitude is this doc's home altitude, so its artifact is named here per the
ratified QA Planning Ladder (`docs/qa-standard/planning-ladder-proposal.md`). Grammar:
`{ACRONYM}: {scope-id}: {descriptor}`.

| Artifact | Jira work type | Title pattern | Example | Parent Epic (axis 1) | Scope link (axis 2) |
|----------|----------------|---------------|---------|----------------------|---------------------|
| **FTP** — Feature Test Plan | **Test Plan** | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` | **QA Master Test Plan** (`qa.qa_epics.master_test_plan_epic`) | `tests` the product **feature Epic** |

- **Item-first (by excellence).** The FTP **Test Plan** issue is the home of the
  feature-test-plan body (the 7 sections below); the epic feature-test-plan custom field /
  `## Feature Test Plan` comment is the **fallback only** when the Test Plan work type
  is absent from the instance. As soon as the FTP item exists it is the single source of truth.
- **Lifecycle.** Find-or-created/updated whenever this skill loads the Epic's context;
  CONSUMED as context thereafter (see "A living document" above).
- **Cardinality.** FTP = **1 per feature**.
- **No FTR.** The Feature Test Results rung is **RETIRED from the ladder** — feature results
  roll up through the per-story ATRs and the sprint recap Execution
  `STR: Sprint#{N}: Regression Testing` (created at sprint close by the batch-close recap or
  `/regression-testing`, whichever arrives first). Do not create `FTR:` items.
- **Roll-up (optional).** Each per-story ATP MAY link `ATP is part of FTP` for coverage
  aggregation; parent of every Plan stays the QA Master Test Plan Epic regardless of roll-up.

---

## Section order of `feature-test-plan.md`

The output document has seven sections. AI fills each one by reading the specified inputs.

### 1. Business Context

From `business-data-map.md` + `.context/business/business-model.md` + `.context/PRD/*` (if present) extract:

- Primary user personas affected
- Business value proposition and success metrics (KPIs the feature influences)
- Critical user journeys the feature enables or modifies

Keep to 5-10 bullets. The goal is to anchor risk analysis, not reproduce the PRD.

### 2. Technical Architecture

From `business-api-map.md` + `SRS/*` + `api/schemas/` + backend/frontend code exploration:

- Frontend components / pages / routes touched
- Backend endpoints + services (reference IDs from `business-api-map.md`, `api/schemas/`, or `api-contracts.yaml`)
- Database tables + critical queries
- External services (payment, email, auth provider, webhooks)
- Integration points table (internal: FE↔API, API↔DB, API↔Auth; external: API↔Stripe, API↔Email, …)

Render the integration points as a table — every row is a testable boundary. This table drives Section 3.

### 3. Risk Analysis

Three categories: technical, business, integration. For each risk:

| Column | Content |
|--------|---------|
| Description | One sentence |
| Impact | High / Medium / Low |
| Likelihood | High / Medium / Low |
| Area | Frontend / Backend / DB / Integration / Business |
| Mitigation | Which tests / validations / mocks cover it |

**Rubric for impact:**
- High: money, data integrity, auth, production-critical path
- Medium: degraded UX, recoverable state loss, non-critical integrations
- Low: cosmetic, internal tooling, dev-only paths

**Rubric for likelihood:**
- High: new code, external integration, first release
- Medium: modified code with partial coverage
- Low: mature code, heavy existing coverage

Prioritize the top 3 in the summary. Down-scope anything Low + Low to a mention only.

### 4. Critical Analysis & Questions

For every ambiguity found while reading the epic + stories:

- **Ambiguity**: one sentence, cite story ID
- **Question for PO / Dev**: specific, answerable
- **Impact if unresolved**: one sentence

Also list **missing information** (ACs that lack error messages, pricing with no rounding rule, timeouts undefined) and **suggested improvements** (concrete edits to the stories before sprint).

Do **not** force questions. If the epic is clear, say so. Shift-left value comes from raising genuine gaps, not ticking a checklist.

### 5. Test Strategy

Anchor each testing level to the integration points from Section 2.

| Level | Focus | Tool / owner |
|-------|-------|--------------|
| Unit | Business logic, validation, utilities | Dev (QA verifies presence) |
| Integration | Each integration point from Section 2 | QA + Dev |
| E2E | Critical user journeys from Section 1 | QA |
| API | Endpoints from Section 2, contract-validated against OpenAPI | QA |
| Non-functional | NFRs from `SRS/non-functional-specs.md` if present | QA |

**Scope**: list what is in and out of scope explicitly. Out-of-scope items become hand-offs to sibling epics, platform teams, or regression.

Do **not** prescribe test counts in Section 5. Counts live in Section 6.

### 6. Test Matrix per Child Story

For each child story build a row:

| Story | Complexity | Positive | Negative | Boundary | Integration | API | Notes |
|-------|-----------|----------|----------|----------|-------------|-----|-------|

- **Complexity**: Low / Medium / High based on logic + integration + UI
- **Counts**: realistic estimates. Do **not** force a minimum.
- **Notes**: parametrization opportunities, shared preconditions, blockers

The matrix is an estimate, not a commitment. Per-story ATPs refine the numbers.

### 7. Shared Resources

- **Test data**: describe categories needed across stories (valid personas, invalid inputs, boundary values, edge case data). Reference Faker.js and factories rather than hardcoded samples.
- **Test environments**: staging URL + DB + external service mode (mocked / real-staging).
- **Entry / Exit criteria** at feature level. Per-story criteria go in the ATP.

Entry = what must exist before feature testing begins. Exit = what makes the epic "QA-done" (all stories pass individually, integration tests across stories pass, E2E journey green, critical / high bugs resolved, NFRs validated, QA sign-off doc).

---

## Risk-based triage rubric

Apply before committing to the full 7-section document. Decides how heavy the plan should be.

| Epic signature | Output |
|----------------|--------|
| Money / billing / payments flow | Full 7 sections, extended edge cases, security review callout |
| Data integrity CRUD on core entities | Full 7 sections, cross-entity integration tests |
| Auth / authorization / roles | Full 7 sections, security-focused negative cases |
| External integration (Stripe, auth provider, email) | Full 7 sections, contract tests + mock strategy |
| Visual / cosmetic / copy only | Skip feature plan — each story gets ATP-only Code-Review triage |
| Tech-debt refactor with no behavior change | Skip feature plan — verify via Code Review in each story |
| Pure documentation / config | Skip feature plan entirely |

Match the veto table in `acceptance-test-planning.md` and the SKILL.md veto rules. Sprint-testing triage is consistent across scopes.

---

## Scenario decomposition at feature level

Feature plans decompose scenarios by **story**, not by individual test. Per story, call out which positive / negative / boundary classes apply without listing specific inputs.

Example (auth epic):

| Story | Positive class | Negative class | Boundary class |
|-------|---------------|---------------|----------------|
| Login with email | Correct credentials | Wrong password, locked account, unverified email | Min/max password length, unicode email |
| Forgot password | Valid email triggers reset | Unknown email, rate-limit hit | Token expiry, token reuse |
| OAuth callback | Valid provider response | Revoked token, provider timeout | First-time vs repeat |

The ATP refines each class into concrete test outlines. The feature plan stops at classes.

---

## Variable and test-data identification

Identify variables once at feature level to avoid per-story re-discovery.

- **Shared personas**: list roles used across stories (admin, standard user, trial user). Reference from `user-personas.md` if present.
- **Shared fixtures**: entities that pre-exist in the active env's DB (e.g., a seeded tenant, a baseline catalog). Found via `[DB_TOOL]` on `{{DB_MCP}}`.
- **Dynamic generators**: Faker utilities reused across stories (`faker.internet.email`, `faker.person.firstName`, `faker.finance.amount`).
- **Factories**: entity factories from `tests/data/` that stories should extend rather than duplicate.

Feed this section into each child ATP so per-story planning only has to say "uses shared persona X + factory Y".

---

## Output rules for the AI

1. **Author the plan, then write it to Jira first — never hand-write the local file.** Item-first: find-or-create the **FTP Test Plan item** `FTP: {EPIC-KEY}: {feature}` (parent: **QA Master Test Plan** epic) and write the feature-test-plan content into its `description`; link it `tests` the feature Epic via the `test` slug. ONLY when the Test Plan work type is unavailable, fall back to the epic's feature-test-plan custom field (if present in `.agents/jira-fields.json`), otherwise to a structured `## Feature Test Plan` comment per the `fallback:` convention — all via `[ISSUE_TRACKER_TOOL]`.
2. **Update the epic in Jira / TMS** via `[ISSUE_TRACKER_TOOL]`: append a "QA Test Strategy — Shift-Left Analysis" section to the epic description with a summary (top 3 risks, total TC estimate, critical questions pointer, test strategy headline). Add label `test-plan-ready`.
3. **Materialize the local cache**: run `bun run jira:sync-issues get <EPIC-KEY> --include-comments`, which writes `.context/PBI/epics/EPIC-<KEY>-<slug>/feature-test-plan.md`. Read it back to confirm.
4. **Report to the user**: executive summary covering complexity, top 3 risks, open PO/Dev questions, and the estimated total test count.

Mirror-order is Jira → local. The local `feature-test-plan.md` is a read-only cache emitted by the sync; Jira is source of truth.

---

## Pseudocode for the full pass

```
Resolve epic key from the synced `epic.md` `**Jira Key:**` field (or the invocation)
Read business + technical + feature context per "Inputs required" (via jira:sync-issues for Jira detail)
Apply triage rubric — decide Full / Code-Review-only / Skip
If Skip or Code-Review-only:
  Comment on epic with triage result, stop
Else:
  Section 1..7 = produce content from inputs
  # Item-first (excellence path):
  [TMS_TOOL] Find-or-create TestPlan:
    title: FTP: <EPIC-KEY>: {feature}
    parentEpic: QA Master Test Plan
  [ISSUE_TRACKER_TOOL] Update Issue: issue=<FTP_KEY>, description={the 7-section plan}
  [ISSUE_TRACKER_TOOL] Link Issues: linkType={{jira.link_types.test.name}}, outward=<FTP_KEY>, inward=<EPIC-KEY>   # FTP tests the feature Epic
  # Fallback ONLY when the Test Plan work type is unavailable:
  #   [ISSUE_TRACKER_TOOL] write feature-test-plan content to the epic field (or `## Feature Test Plan` fallback comment)
  [ISSUE_TRACKER_TOOL] update epic description + label `test-plan-ready`
  bun run jira:sync-issues get <EPIC-KEY> --include-comments   # materializes feature-test-plan.md (fallback path; the FTP item syncs as a Test Plan issue)
  Read the materialized copy to confirm
  Report executive summary to user
  Block sprint start until PO/Dev answer critical questions
```

---

## Gotchas

1. **Keep the plan feature-level.** Zero test outlines, zero literal test data. All of that is ATP territory.
2. **Do not forbid low counts.** A 2-line story may legitimately need 1 test. Force-fitting "at least 5 per story" produces low-value tests.
3. **Team Discussion is non-blocking.** Extract PO / Dev answers from epic comments, but never wait for them synchronously — timebox Section 4 to "mark open and move on".
4. **Traceability**: once per-story ATPs exist, link back `{STORY_ATP} ← {EPIC_FTP}` via a line at the top of each ATP. Sprint-testing Stage 1 does not create Xray TCs yet (`test-documentation` owns that in Stage 4).
5. **Hand-off to ATP**: feature plan is input to every child story's `acceptance-test-planning.md` run. Each child ATP MUST cite the shared risks, integration points, and personas from the feature plan rather than rediscovering them.
6. **Regeneration**: if requirements change mid-sprint, re-run with updated inputs and overwrite. Do not amend previous comments — add a fresh dated comment with changes called out.
7. **Language**: artifacts in English; user-facing conversation can mirror the user's language.

---

## Checklist before handing off

- [ ] Triage decision recorded (Full / Code-Review-only / Skip)
- [ ] All 7 sections filled for Full scope
- [ ] Top 3 risks prioritized
- [ ] Critical questions marked with owner (PO / Dev) and impact
- [ ] Integration points table present and drives Section 5 strategy
- [ ] Test matrix has a row per child story with realistic counts
- [ ] Shared personas, fixtures, generators listed for reuse
- [ ] FTP item (`FTP: {EPIC-KEY}: {feature}`) find-or-created under QA Master Test Plan with the plan in its description and linked `tests` the feature Epic — field / `## Feature Test Plan` fallback comment ONLY when the Test Plan work type is unavailable — AND the local cache materialized via `bun run jira:sync-issues`
- [ ] Epic labeled `test-plan-ready`
- [ ] Executive summary delivered to user, blocker called out if critical questions open
