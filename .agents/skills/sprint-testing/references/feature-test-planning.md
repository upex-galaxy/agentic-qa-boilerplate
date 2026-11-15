# Feature Test Planning (Feature / Multi-Story Scope)

Use this when the Stage 1 scope is a whole feature (epic, module, multi-story batch) rather than one story. The output is a feature-level test plan that informs the per-ticket ATPs.

The FTP is item-first. Whenever this skill loads an Epic's context, it finds or creates the Test Plan issue `FTP: {EPIC-KEY}: {feature}` (parent: QA Master Test Plan epic), authors or refreshes the plan in its `description`, and reads it as context from then on. The Epic's feature-test-plan custom field (if one exists in `.agents/jira-fields.json`) or a structured `## Feature Test Plan` comment per the `fallback:` convention in `.agents/jira-required.yaml` is the fallback, used only when the Test Plan work type is unavailable. Both are written via `[ISSUE_TRACKER_TOOL]`.

The local cache is materialized along whichever path the write took, and neither file is hand-written:

- Item-first: `bun run jira:sync-issues get <FTP_KEY>` produces `.context/PBI/test-plans/FTP-<FTP_KEY>-<slug>.md`.
- Fallback (no `Test Plan` work type): `bun run jira:sync-issues get <EPIC-KEY> --include-comments` produces `.context/PBI/epics/EPIC-<KEY>-<slug>/feature-test-plan.md`, written only from the Epic's field.

For single-story Stage 1 work read `acceptance-test-planning.md` instead. This planning is manual and exploratory. It differs from `test-automation`'s `planning-playbook.md` (which produces `spec.md` for automation code) and from `test-documentation`'s ROI scoring (which decides which tests enter the regression backlog).

---

## When to generate a feature-level plan

| Signal | Action |
|--------|--------|
| Ticket is an epic or module with 3+ child stories and shared risks | Generate feature test plan first, then per-story ATPs |
| Single story, no siblings | Skip and go straight to `acceptance-test-planning.md` |
| Story belongs to an epic that already has a synced `feature-test-plan.md` | Reuse. New ATP inherits risks + integration points from it |
| Feature groups cross cutting concerns (auth, data integrity, money flows) | Generate even for 2 stories: the shared risk surface justifies it |

A feature plan captures shared risks, integration points and critical questions once, so the per-story ATPs do not repeat them.

---

## A living document, and its sibling stories

Two properties follow from the feature altitude, and both change how the plan is used downstream.

**The FTP is living.** It is authored once per epic and refined across it. Every story that ships teaches the team something the plan did not know: an integration boundary that turned out to be real, a risk that never materialized, an answer the PO finally gave. Fold that back into the plan (see Gotcha 6, "Regeneration"). A plan untouched since the first story of a long epic is stale.

**Analyze the sibling stories, not just the one in hand.** When a tester picks up a story, the unit of analysis is the epic: the siblings that already shipped, the ones in development, and the ones only defined. That full-feature picture surfaces shared preconditions, cross-story state and regression surface that a single-story reading cannot see, and it is what makes the per-story ATPs good. The sibling list comes from the JQL child-story query in "Inputs required".

---

## Inputs required

Paths are relative to the repo root.

> **Prerequisite**: load the `/acli` skill before any `[ISSUE_TRACKER_TOOL]` write (epic field or comment update). Detailed reads of the epic and its children use `bun run jira:sync-issues`, not `/acli`. Skip the load when Session Start §0.1 in `SKILL.md` already did it.

| Input | Source |
|-------|--------|
| Epic / feature ticket (detail) | `bun run jira:sync-issues get <EPIC-KEY> --include-comments` then read the synced `epic.md` / custom-field files |
| Child story list | `bun run jira:sync-issues jql "parent = <EPIC-KEY>"` (or `[ISSUE_TRACKER_TOOL]` search for a trivial key/summary list only) |
| Business context | `bun run context:map business-data-context` + `bun run context:map business-e2e-context` (journeys) + `.context/PBI/qa-artifacts/master-test-plan.md` |
| API context | `bun run context:map business-api-context` (business angle) + `api/schemas/` (generated types from `bun run api:sync`) |
| Architecture + NFRs (if generated) | `bun run context:map infra-context --section architecture` and the `nfr-*` sections (`--list` shows them); functional specs live in the `business-e2e-context` `feature-*` sections. API contract comes from `api/openapi-types.ts` and the `business-api-context` map |
| Prior epic discussions | Synced `comments.md` from the epic (Team Discussion extraction, see `session-entry-points.md`) |

When project-wide context files are missing, stop and hand off to `project-discovery`: partial context produces a plan built on guesses.

---

## Output location

```
.context/PBI/epics/EPIC-<KEY>-<slug>/
  feature-test-plan.md     # this document: Jira-synced (read-only cache), never hand-written
  context.md               # hand-authored from session-start (NON-Jira)
  stories/                 # child STORY-<KEY>-<slug>/ folders get their own ATP later
```

---

## Nomenclature: FTP (item-first)

This doc owns the feature altitude, so its artifact is named here per the QA Planning Ladder (`.agents/skills/agentic-qa-core/references/planning-ladder.md`). Grammar:
`{ACRONYM}: {scope-id}: {descriptor}`.

| Artifact | Jira work type | Title pattern | Example | Parent Epic (axis 1) | Scope link (axis 2) |
|----------|----------------|---------------|---------|----------------------|---------------------|
| **FTP** (Feature Test Plan) | **Test Plan** | `FTP: {EPIC-KEY}: {feature}` | `FTP: PROJ-42: Checkout & Payments` | **QA Master Test Plan** (`qa.qa_epics.master_test_plan_epic`) | `tests` the product **feature Epic** |

- Item-first. The FTP Test Plan issue holds the feature-test-plan body (the 7 sections below). The epic custom field or `## Feature Test Plan` comment is the fallback for instances without the Test Plan work type. Once the FTP item exists it is the single source of truth.
- Lifecycle: found or created and updated whenever this skill loads the Epic's context, then read as context (see "A living document" above).
- Cardinality: one FTP per feature.
- No FTR. The ladder has no Feature Test Results rung. Feature results are read from the per-story ATRs and reviewed together at sprint close, alongside the sprint recap Execution `STR: Sprint#{N}: Regression Testing` (created at sprint close by the batch-close recap or `/regression-testing`, whichever arrives first). Results are not aggregated structurally: no `ATR is part of STR` edge exists (see `agentic-qa-core/references/traceability-linking.md` §3), so no `FTR:` items are created.
- Roll-up (optional): each per-story ATP may link `ATP is part of FTP` for coverage aggregation. The parent of every Plan stays the QA Master Test Plan Epic either way.

---

## Section order of `feature-test-plan.md`

The plan has seven sections. Fill each one from the inputs named under it.

### 1. Business Context

From the data map (`business-data-context`) + the domain map (`bun run context:map business-domain-context --section business-model`) + the personas and journeys in `business-e2e-context` (`persona-*`, `journey-*`) extract:

- Primary user personas affected
- Business value proposition and success metrics (KPIs the feature influences)
- Critical user journeys the feature enables or modifies

Keep to 5-10 bullets: they anchor the risk analysis and do not reproduce the business context.

### 2. Technical Architecture

From the API map (`business-api-context`) + the infra map (`infra-context`: `architecture`, `backend`, `frontend`) + `api/schemas/` + backend/frontend code exploration:

- Frontend components / pages / routes touched
- Backend endpoints + services (reference section ids from the `business-api-context` map or `api/schemas/`)
- Database tables + critical queries
- External services (payment, email, auth provider, webhooks)
- Integration points table (internal: FE↔API, API↔DB, API↔Auth; external: API↔Stripe, API↔Email, …)

Render the integration points as a table. Every row is a testable boundary, and the table drives Section 3.

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

Put the top 3 in the summary. A Low impact + Low likelihood risk gets a mention only.

### 4. Critical Analysis & Questions

For every ambiguity found while reading the epic + stories:

- **Ambiguity**: one sentence, cite story ID
- **Question for PO / Dev**: specific, answerable
- **Impact if unresolved**: one sentence

Also list **missing information** (ACs that lack error messages, pricing with no rounding rule, timeouts undefined) and **suggested improvements** (concrete edits to the stories before sprint).

Questions are not quota. If the epic is clear, say so: the shift-left value is in genuine gaps, not a ticked checklist.

### 5. Test Strategy

Anchor each testing level to the integration points from Section 2.

| Level | Focus | Tool / owner |
|-------|-------|--------------|
| Unit | Business logic, validation, utilities | Dev (QA verifies presence) |
| Integration | Each integration point from Section 2 | QA + Dev |
| E2E | Critical user journeys from Section 1 | QA |
| API | Endpoints from Section 2, contract-validated against OpenAPI | QA |
| Non-functional | NFRs from the `infra-context` `nfr-*` sections if generated | QA |

**Scope**: list what is in and out of scope explicitly. Out-of-scope items become hand-offs to sibling epics, platform teams, or regression.

Test counts live in Section 6, not here.

### 6. Test Matrix per Child Story

For each child story build a row:

| Story | Complexity | Positive | Negative | Boundary | Integration | API | Notes |
|-------|-----------|----------|----------|----------|-------------|-----|-------|

- **Complexity**: Low / Medium / High based on logic + integration + UI
- **Counts**: realistic estimates, with no forced minimum.
- **Notes**: parametrization opportunities, shared preconditions, blockers

The matrix is an estimate. Per-story ATPs refine the numbers.

### 7. Shared Resources

- **Test data**: describe categories needed across stories (valid personas, invalid inputs, boundary values, edge case data). Reference Faker.js and factories rather than hardcoded samples.
- **Test environments**: staging URL + DB + external service mode (mocked / real-staging).
- **Entry / Exit criteria** at feature level. Per-story criteria go in the ATP.

Entry = what must exist before feature testing begins. Exit = what makes the epic "QA-done" (all stories pass individually, integration tests across stories pass, E2E journey green, critical / high bugs resolved, NFRs validated, QA sign-off doc).

---

## Risk-based triage rubric

Apply this before committing to the full 7-section document. It decides how heavy the plan should be.

| Epic signature | Output |
|----------------|--------|
| Money / billing / payments flow | Full 7 sections, extended edge cases, security review callout |
| Data integrity CRUD on core entities | Full 7 sections, cross-entity integration tests |
| Auth / authorization / roles | Full 7 sections, security-focused negative cases |
| External integration (Stripe, auth provider, email) | Full 7 sections, contract tests + mock strategy |
| Visual / cosmetic / copy only | Skip the feature plan; each story gets ATP-only Code-Review triage |
| Tech-debt refactor with no behavior change | Skip the feature plan; verify via Code Review in each story |
| Pure documentation / config | Skip the feature plan entirely |

This matches the veto table in `acceptance-test-planning.md` and the SKILL.md veto rules, so triage is consistent across scopes.

---

## Scenario decomposition at feature level

Feature plans decompose scenarios by story, not by individual test. Per story, name which positive / negative / boundary classes apply without listing specific inputs.

Example (auth epic):

| Story | Positive class | Negative class | Boundary class |
|-------|---------------|---------------|----------------|
| Login with email | Correct credentials | Wrong password, locked account, unverified email | Min/max password length, unicode email |
| Forgot password | Valid email triggers reset | Unknown email, rate-limit hit | Token expiry, token reuse |
| OAuth callback | Valid provider response | Revoked token, provider timeout | First-time vs repeat |

The ATP refines each class into concrete test outlines; the feature plan stops at classes.

---

## Variable and test-data identification

Identify variables once at feature level so no story rediscovers them.

- **Shared personas**: list roles used across stories (admin, standard user, trial user). Reference the `persona-*` sections of `business-e2e-context` if generated.
- **Shared fixtures**: entities that pre-exist in the active env's DB (e.g., a seeded tenant, a baseline catalog). Found via `[DB_TOOL]` on `{{DB_MCP}}`.
- **Dynamic generators**: Faker utilities reused across stories (`faker.internet.email`, `faker.person.firstName`, `faker.finance.amount`).
- **Factories**: entity factories from `tests/data/` that stories should extend rather than duplicate.

Feed this section into each child ATP so per-story planning only says "uses shared persona X + factory Y".

---

## Output rules for the AI

1. Write to Jira first, and never hand-write the local file. Item-first: find or create the FTP Test Plan item `FTP: {EPIC-KEY}: {feature}` (parent: QA Master Test Plan epic), write the plan into its `description`, and link it `tests` the feature Epic via the `test` slug. Only when the Test Plan work type is unavailable, fall back to the epic's feature-test-plan custom field (if present in `.agents/jira-fields.json`), otherwise to a structured `## Feature Test Plan` comment per the `fallback:` convention. All writes go via `[ISSUE_TRACKER_TOOL]`.
2. Update the epic in Jira / TMS via `[ISSUE_TRACKER_TOOL]`: append a "QA Test Strategy — Shift-Left Analysis" section to the epic description with a summary (top 3 risks, total TC estimate, critical questions pointer, test strategy headline), and add the label `test-plan-ready`.
3. Materialize the local cache along the path the write took (the two commands are in the opening section) and read the file back to confirm. A sweep with an unfiltered `bun run jira:sync-issues pull` also picks up the FTP item, via the QA-process-epic sweep. The `FTP-` filename prefix comes from the conforming `FTP:` title; a non-conforming title falls back to `TESTPLAN-`. On the fallback path `feature-test-plan.md` is written only from the Epic field, so it stays a stub when the FTP item is the home.
4. Report to the user: an executive summary covering complexity, top 3 risks, open PO/Dev questions and the estimated total test count.

Whichever file the sync emits (`test-plans/FTP-<KEY>-<slug>.md` item-first, `feature-test-plan.md` on the fallback path) is a read-only cache, and Jira is the source of truth.

---

## Pseudocode for the full pass

```
Resolve epic key from the synced `epic.md` `**Jira Key:**` field (or the invocation)
Read business + technical + feature context per "Inputs required" (via jira:sync-issues for Jira detail)
Apply triage rubric: decide Full / Code-Review-only / Skip
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
  # Fallback only when the Test Plan work type is unavailable:
  #   [ISSUE_TRACKER_TOOL] write feature-test-plan content to the epic field (or `## Feature Test Plan` fallback comment)
  [ISSUE_TRACKER_TOOL] update epic description + label `test-plan-ready`
  bun run jira:sync-issues get <EPIC-KEY> --include-comments   # materializes feature-test-plan.md (fallback path; the FTP item syncs as a Test Plan issue)
  Read the materialized copy to confirm
  Report executive summary to user
  Hold sprint start until PO/Dev answer critical questions
```

---

## Gotchas

1. **Keep the plan feature-level.** Test outlines and literal test data are ATP territory.
2. **Low counts are fine.** A 2-line story may need 1 test; forcing "at least 5 per story" produces low-value tests.
3. **Team Discussion is non-blocking.** Extract PO / Dev answers from epic comments without waiting for them: timebox Section 4 to "mark open and move on".
4. **Traceability.** Once per-story ATPs exist, link back `{STORY_ATP} ← {EPIC_FTP}` via a line at the top of each ATP. Stage 1 TC timing follows `SKILL.md` §"TC creation timing" (jira-xray creates sprint `Test` issues; jira-native defers to Stage 4 `test-documentation`).
5. **Hand-off to ATP.** The feature plan is input to every child story's `acceptance-test-planning.md` run, and each child ATP cites the shared risks, integration points and personas from it instead of rediscovering them.
6. **Regeneration.** When requirements change mid-sprint, re-run with updated inputs and overwrite. Previous comments stay as they are: add a fresh dated comment with the changes called out.
7. **Language.** Artifacts are in English; user-facing conversation can mirror the user's language.

---

## Checklist before handing off

- [ ] Triage decision recorded (Full / Code-Review-only / Skip), and all 7 sections filled for Full scope
- [ ] Top 3 risks prioritized, critical questions carry an owner (PO / Dev) and an impact
- [ ] Integration points table present and driving Section 5; test matrix has a row per child story; shared personas, fixtures and generators listed
- [ ] FTP item found or created under QA Master Test Plan, linked `tests` the feature Epic, local cache materialized via `bun run jira:sync-issues` (field / `## Feature Test Plan` comment only when the Test Plan work type is unavailable)
- [ ] Epic labeled `test-plan-ready`
- [ ] Executive summary delivered to the user, with the blocker called out when critical questions are open

---

## With nobody at the keyboard

Two points wait on a person: the executive-summary report, and holding sprint start until PO/Dev answer the critical questions (`agentic-qa-core/references/decision-protocol.md`). With a person present, report and hold as written. A supervised worker sends the summary and the open questions to its conductor or launcher, which holds the gate. A routine with nobody authors the plan and the local cache, then stops before the Jira writes (FTP item, epic description, `test-plan-ready` label) unless a delegating brief covers them, and reports what it would have written.

---

## Worked example: `FTP: UPEX-100: Authentication`

A compact FTP body from this repo's own sample module (Epic `UPEX-100`, cached at `.context/PBI/epics/EPIC-UPEX-100-authentication/`). It is the automation-leaning subset a small, single-story feature needs, not the full 7-section Full-scope plan: read it for tone and granularity, not as a template. The selectors table is there because the module is already automated; a pre-automation FTP would stop at section 4.

### FTP: UPEX-100: Authentication

> **Module**: Authentication (`/auth/*`)
> **Total Tickets**: 1
> **Total Items**: 4 TCs (2 API + 2 UI)
> **Created**: 2026-03-19

---

#### 1. Executive Summary

The authentication module is the gateway to the entire application. Every user flow depends on a valid session, making auth the highest-priority module for test coverage.

**Key Risks:**
- Invalid credentials silently creating sessions (security breach)
- Token expiration not enforced (stale sessions)
- Protected endpoints accessible without auth (authorization bypass)

---

#### 2. Module Overview

| Aspect | Value |
|--------|-------|
| **Domain** | Authentication & Session Management |
| **Primary Actors** | All users (login is universal) |
| **API Endpoints** | `POST /api/auth/login`, `GET /api/auth/me` |
| **UI Pages** | `/login` (public form) |

---

#### 3. Data Flow & API Endpoints

```
Login Flow (API):
POST /api/auth/login { email, password }
  → 200: { access_token, token_type, expires_in }
  → 401: { error }

Session Verification:
GET /api/auth/me (requires Bearer token)
  → 200: { user: { id, email, name } }
  → 401: unauthorized
```

```
Login Flow (UI):
/login page → fill form → submit
  → Success: redirect away from /login
  → Failure: error message, stay on /login
```

---

#### 4. Test Data Strategy

| Data | Source | Notes |
|------|--------|-------|
| Valid credentials | `config.testUser` from `.env` | Pre-existing test user |
| Invalid credentials | Inline in test | Hardcoded bad values |
| Auth token | `api-state.json` from setup project | Auto-loaded by ApiFixture |

---

#### 5. Key Selectors Reference

| Element | Selector | Page |
|---------|----------|------|
| Email input | `[data-testid="login-email-input"]` | `/login` |
| Password input | `[data-testid="login-password-input"]` | `/login` |
| Submit button | `[data-testid="login-submit-button"]` | `/login` |

---

#### See Also

- Test specs: `.context/PBI/epics/EPIC-UPEX-100-authentication/test-specs/`
- Components and test files: the Auth entries in `kata-manifest.json`
