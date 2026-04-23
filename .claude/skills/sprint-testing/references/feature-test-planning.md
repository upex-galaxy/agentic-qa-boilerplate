# Feature Test Planning (Feature / Multi-Story Scope)

Use when the Stage 1 work scope is a whole feature (epic, module, multi-story batch) rather than a single story. Output is a feature-level test plan that informs per-ticket ATPs. Produces `feature-test-plan.md` inside the feature's PBI folder.

For single-story Stage 1 work read `acceptance-test-planning.md` instead. Sprint-testing planning is manual / exploratory — do not confuse it with `test-automation`'s `planning-playbook.md` (which produces `spec.md` for automation code) or `test-documentation`'s ROI scoring (which decides which tests enter the regression backlog).

---

## When to generate a feature-level plan

| Signal | Action |
|--------|--------|
| Ticket is an epic or module with 3+ child stories and shared risks | Generate feature test plan first, then per-story ATPs |
| Single story, no siblings | Skip — go straight to `acceptance-test-planning.md` |
| Story belongs to an epic that already has `feature-test-plan.md` | Reuse. New ATP inherits risks + integration points from it |
| Feature groups cross cutting concerns (auth, data integrity, money flows) | Generate even for 2 stories — shared risk surface justifies it |

A feature plan exists to capture shared risks, integration points, and critical questions **once**, so the downstream per-story ATPs do not duplicate them.

---

## Inputs required

Read before starting. All paths relative to repo root.

> **Prerequisite**: Load `/acli` skill before any `[ISSUE_TRACKER_TOOL]` call (epic fetch, child story list, epic-description update, epic comment). Skip if Session Start §0.1 in `SKILL.md` already loaded it.

| Input | Source |
|-------|--------|
| Epic / feature ticket | `[ISSUE_TRACKER_TOOL]` using Jira Key from epic.md |
| Child story list | `[ISSUE_TRACKER_TOOL]` (children of the epic) |
| Business context | `.context/mapping/business-data-map.md` + `.context/master-test-plan.md` |
| API context | `.context/mapping/business-api-map.md` (business angle) + `api/schemas/` (generated types from `bun run api:sync`) |
| Architecture + SRS (if present) | `.context/SRS/architecture.md`, `.context/SRS/functional-specs.md`, `.context/SRS/non-functional-specs.md` (API contract comes from `api/openapi-types.ts` and `.context/mapping/business-api-map.md`, not from SRS) |
| Prior epic discussions | Epic comments (Team Discussion extraction — see `session-entry-points.md`) |

If project-wide context files are missing, stop and hand off to `project-discovery`. Do not proceed on partial context.

---

## Output location

```
.context/PBI/{module-name}/{EPIC-KEY}-{brief-title}/
  feature-test-plan.md     # this document
  context.md               # from session-start
  stories/                 # child tickets get their own ATP later
```

Keep the feature plan **feature-level**: no per-story test cases, no test data values. Those belong in the per-story ATP.

---

## Section order of `feature-test-plan.md`

The output document has seven sections. AI fills each one by reading the specified inputs.

### 1. Business Context

From `business-data-map.md` + `.context/PRD/*` (if present) extract:

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
- **Shared fixtures**: entities that pre-exist in staging DB (e.g., a seeded tenant, a baseline catalog). Found via `[DB_TOOL]` on `{{DB_MCP_STAGING}}`.
- **Dynamic generators**: Faker utilities reused across stories (`faker.internet.email`, `faker.person.firstName`, `faker.finance.amount`).
- **Factories**: entity factories from `tests/data/` that stories should extend rather than duplicate.

Feed this section into each child ATP so per-story planning only has to say "uses shared persona X + factory Y".

---

## Output rules for the AI

1. **Write the plan locally first.** File path `.context/PBI/{module}/{EPIC}/feature-test-plan.md`.
2. **Update the epic in Jira / TMS** via `[ISSUE_TRACKER_TOOL]`: append a "QA Test Strategy — Shift-Left Analysis" section to the epic description with a summary (top 3 risks, total TC estimate, critical questions pointer, test strategy headline). Add label `test-plan-ready`.
3. **Comment on the epic** with the full plan body (mirror of the local file). Mention @PO, @Dev, @QA per project convention.
4. **Report to the user**: executive summary covering complexity, top 3 risks, open PO/Dev questions, and the estimated total test count.

Mirror-order is Jira → local. Local file is an exact copy of the comment body for version control.

---

## Pseudocode for the full pass

```
Resolve epic key from `{EPIC_PATH}/epic.md` `**Jira Key:**` field
Read business + technical + feature context per "Inputs required"
Apply triage rubric — decide Full / Code-Review-only / Skip
If Skip or Code-Review-only:
  Comment on epic with triage result, stop
Else:
  Section 1..7 = produce content from inputs
  Write `.context/PBI/{module}/{EPIC}/feature-test-plan.md`
  [ISSUE_TRACKER_TOOL] update epic description + label `test-plan-ready`
  [ISSUE_TRACKER_TOOL] add epic comment (mirror of local file)
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
- [ ] `feature-test-plan.md` written locally AND mirrored as epic comment
- [ ] Epic labeled `test-plan-ready`
- [ ] Executive summary delivered to user, blocker called out if critical questions open
