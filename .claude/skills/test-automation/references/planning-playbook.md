# Planning Playbook — spec.md, implementation-plan.md, atc/*.md

Load during Phase 1 (Plan) of the Plan → Code → Review pipeline. Covers the three plan documents KATA automation uses, how to populate each by scope (Module / Ticket / Regression), the Discover → Modify → Generate data-classification workflow used while planning, and the approval gate between Plan and Code.

Scope-selection rules (which scope to pick, the one-line summary of each) live in SKILL.md §"Pick the planning scope first". This file assumes the scope has been chosen and documents what to produce.

---

## 1. Plan document map

Three document types, each tied to a scope. Every scope produces at least `spec.md`; ticket and regression scopes add `implementation-plan.md`; complex ATCs add per-ATC specs under `atc/`.

| Document | Scope that produces it | Location |
|----------|-----------------------|----------|
| `spec.md` | Module (N specs), Ticket (1), Regression (1) | `.context/PBI/{module}/test-specs/{PREFIX}-T{NN}-{name}/spec.md` |
| `implementation-plan.md` | Ticket, Regression | Same folder as spec.md — `implementation-plan.md` |
| `atc/{TICKET-ID}-{brief-title}.md` | Complex ATCs from any scope | Same folder — `atc/{TICKET-ID}-{brief-title}.md` |
| `ROADMAP.md`, `PROGRESS.md` | Module only | `.context/PBI/{module}/test-specs/` |

Canonical folder naming:

- `{module}` — kebab-case business area (`orders-dashboard`, `user-management`).
- `{PREFIX}` — 2–3 letter module abbreviation (`OD`, `UM`, `AUTH`). Used for filesystem only — not for TC IDs.
- `T{NN}` — zero-padded ticket slot (`T01`, `T02`, …).
- `{name}` — ≤5-word kebab-case title.
- `{TICKET-ID}` — TMS ticket key (e.g., `UPEX-123`). TC IDs in spec content must always be TMS-generated; never invent local IDs.

---

## 2. Inputs and outputs by scope

### 2.1 Module-driven (macro)

Inputs:

- Module name or feature area (`"Orders Dashboard"`, `"Billing"`).
- Any stakeholder input: meeting transcript, priority list, known regressions.
- Access to frontend and backend source for the module.
- Access to `.context/` docs (business-data-map, api-architecture, existing PBI).

Outputs:

```
.context/PBI/{module}/
  {module}-test-plan.md          # Master document (Section 4)
  test-specs/
    ROADMAP.md                    # Ticket index, phases, dependency graph
    PROGRESS.md                   # Session-persistent tracker
    {PREFIX}-T01-{name}/spec.md   # 3–7 TCs per ticket
    {PREFIX}-T02-{name}/spec.md
    …
```

Scope targets: 3–7 TCs per ticket. A ticket with 10+ TCs is too broad — split it. Group tickets by functional area, not by UI section.

### 2.2 Ticket-driven (medium)

Inputs:

- Ticket ID in the TMS (e.g., `UPEX-101`).
- Test type — `integration` or `e2e` (ask if not obvious).
- Existing module context, if the ticket belongs to a module with prior `test-specs/`.

Outputs:

```
.context/PBI/{module}/test-specs/{PREFIX}-T{NN}-{name}/
  spec.md                # 1–7 TCs derived from the ticket's ACs
  implementation-plan.md # Architecture decisions, ATC registry, scenarios, implementation order
  atc/*.md               # Only for ATCs complex enough to warrant a per-ATC spec
```

Expected TC count: 1–7 per ticket (story-driven).

### 2.3 Regression-driven (micro)

Inputs:

- A single TC (often added after a bug fix) or a focused coverage gap.
- Target component (existing or new).
- Module name for folder placement.

Outputs:

```
.context/PBI/{module}/test-specs/{PREFIX}-T{NN}-{name}/
  spec.md                # 1–3 TCs (bug-driven) or 1–2 (gap-driven)
  implementation-plan.md # Optional — skip when the spec is trivially one method
  atc/{TICKET-ID}-{brief-title}.md  # Usually present — regression = one ATC in detail
```

A regression-driven plan is the smallest unit of work. Often it is just `spec.md` + `atc/*.md`, no implementation plan, because one ATC is the whole body of work.

---

## 3. TMS-first principle (applies to every scope)

TCs in `spec.md` must reference TMS-generated IDs, never local-only IDs. Before writing TCs:

> **Prerequisite**: Load `/xray-cli` skill (Modality A) or `/acli` (Modality B) before executing the TMS commands below.

1. Query the TMS for tests already linked to the ticket (via `[TMS_TOOL] List Tests` — resolve per CLAUDE.md Tool Resolution).
2. **If TCs exist** — consume them as the base for `spec.md`; do not duplicate.
3. **If TCs are missing** — create them in the TMS first (`[TMS_TOOL] Create Test`), capture the returned IDs, then write `spec.md`.
4. **If partial** — consume what exists, create the gaps in TMS, write `spec.md` with the combined set.

Local `{PREFIX}-T{NN}` naming is filesystem scaffolding. All TC headings inside `spec.md` use the TMS IDs (`### TC-47: Should ...` or `### UPEX-123: Should ...`). The same IDs become `@atc('TC-47')` decorators during the Code phase.

---

## 4. `spec.md` structure

The spec is the business-facing contract. A reader with zero context should understand **what** to test and **why**. Use the template below, omit sections that do not apply.

```markdown
# {PREFIX}-T{NN}: {Title}

| Field | Value |
|-------|-------|
| **Priority** | P0 / P1 / P2 |
| **Phase** | {phase number + name, or "Standalone"} |
| **Items** | {N} TCs {+ M multi-ATC tests if any} |
| **Dependencies** | {other ticket IDs, or "None"} |
| **Requires** | {test data, accounts, env conditions} |
| **Source** | Story: {TICKET-ID} / Bug: {brief} / Gap: {brief} |

## Summary
{What this spec covers and why it matters. 2–4 sentences.}

## Preconditions
- {Entities, states, conditions required before running these tests}

## Test Cases

### {TMS_TC_ID}: Should {behavior} when {condition}

**Preconditions**: {System state}
**Action**: {User action — the trigger}
**Expected Output**:
- {Assertion 1}
- {Assertion 2}
- {What should NOT be visible}

\`\`\`gherkin
Scenario: {TMS_TC_ID} - Should {behavior} when {condition}
  Given {state}
  When the user {active action}
  Then {outcome}
  And {additional assertion}
\`\`\`

---

## Merged TCs (if any)
| Removed ID | Merged Into | Reason |

## Updated TCs (if any)
| TC ID | Spec File | What Was Added | Reason |

## Acceptance Criteria
- [ ] {N} TCs automated with {pattern description}
- [ ] Tests pass on local and staging
```

Rules for `spec.md`:

- TC heading format — `### {TMS_TC_ID}: Should {behavior} when {condition}`.
- Gherkin `When` describes a **user action**, not a passive system event.
- No hardcoded values in Gherkin — use variables `{user_id}`, `{order_id}`, `{month}`.
- Multi-step flows (2+ actions with intermediate verifications) are flagged as multi-ATC tests, not a single TC.
- Priority levels: P0 (release-blocker), P1 (high value), P2 (edge cases).

---

## 5. Module-scope master document (`{module}-test-plan.md`)

Module scope alone produces this master doc in addition to the per-ticket specs. It is the single source of truth for module-level context that every ticket spec will reference.

Sections, in order:

1. **Executive Summary** — why the module matters, key risks, stakeholder priorities.
2. **Module Overview** — what it is, who uses it, how it connects to other modules.
3. **Page/API Architecture** — visual states, panel layout, conditional rendering, status flows.
4. **Data Flow & API Endpoints** — all endpoints the page calls, calculation formulas, refresh triggers.
5. **Test Scenarios (Gherkin)** — organised by functional area, each scenario with Preconditions → Action → Expected.
6. **Implementation Roadmap** — phases ordered P0 → P2 with dependencies between tickets.
7. **Test Data Strategy** — per-ticket feasibility table (Discover / Modify / Generate — see §7).
8. **Key Selectors Reference** — CSS selectors or `data-testid` values the automation will target.

Write it as if the reader has zero context. Include calculation formulas explicitly, stakeholder quotes where they describe priorities, and ASCII diagrams for layouts. Diagrams beat paragraphs.

---

## 6. `implementation-plan.md` structure

The implementation plan is the technical contract — what code to write, which components already exist, which ATCs to reuse vs create, the implementation order.

```markdown
# Test Implementation Plan: {TICKET-ID}

> Ticket: {TICKET-ID} — {Title}
> Type: integration | e2e
> Sprint: {Sprint Name}
> Created: {date}

## 1. Ticket Summary
- What to test
- Acceptance Criteria (list)
- Dependencies (other ticket IDs)

## 2. Architecture Decisions

### Component Strategy
| Decision | Value | Rationale |
| Component | {Resource}Api.ts / {Page}Page.ts | New or existing? |
| Fixture | { api } / { ui } / { test } / { steps } | Why this fixture? |
| Test file | tests/{type}/{module}/{verbFeature}.test.ts | Naming rationale |
| Preconditions | Steps module / inline | What setup is needed? |

### [E2E ONLY] UI Elements
| Element | Locator Strategy | Locator Value |

### [INTEGRATION ONLY] API Details
| Aspect | Value |
| Endpoint(s) | METHOD /api/v1/... |
| OpenAPI Type(s) | {TypeName} from @schemas/... |
| Auth Required | Yes / No |
| Return Pattern | Tuple: [APIResponse, TBody] or [APIResponse, TBody, TPayload] |

## 3. ATC Registry

### Existing ATCs (Reuse)
| ATC ID | Component | Method | Description |

### New ATCs (Create)
| ATC ID | Component | Method | Description |

### New Helpers (No @atc)
| Component | Method | Returns | Description |

## 4. Test Data Strategy
| Data | Source | Lifecycle |

### DataFactory additions / Constants additions
(code snippets)

## 5. Test Scenarios
### File: tests/{type}/{module}/{verbFeature}.test.ts
Fixture: { api } / { ui } / { test }

#### Scenario 1: {happy path}
Test: "{TICKET-ID}: should {behavior} when {condition}"
Preconditions: ...
ATCs called: ...
Test-level assertions: ...
Teardown: ...

## 6. Implementation Order
- [ ] Add types to tests/data/types.ts
- [ ] Add factory methods to tests/data/DataFactory.ts
- [ ] Add constants to tests/data/constants.ts
- [ ] Create/update Layer 3 component
- [ ] Register component in fixture
- [ ] Create test file
- [ ] Run tests and validate
- [ ] Update TMS status to "Automated"

## 7. Success Criteria
- [ ] All ACs covered
- [ ] KATA compliance
- [ ] Fixture correct
- [ ] No hardcoded waits
- [ ] Aliases used
- [ ] Tests pass locally
- [ ] TMS marked Automated
```

Implementation-order rule of thumb: each box in Section 6 should map to a single commit. If a commit would mix "new types" and "new ATC", split it.

---

## 7. Data classification — Discover / Modify / Generate

Every precondition in a plan must be classified by how its data will be obtained. Apply this during planning — never defer to the coding phase. Priority is strict: try Discover first, then Modify, then Generate.

| Priority | Pattern | Description | Feasibility check |
|----------|---------|-------------|-------------------|
| 1 | **Discover** | Query the system for existing data already in the required state. Zero DB impact. Preferred. | Can DB/API return an entity matching the preconditions? |
| 2 | **Modify** | Find existing data and alter it via API to reach the required state. | Does the API expose the mutation needed? |
| 3 | **Generate** | Create data from scratch via API (faker payload + POST). Last resort. | Does a POST/PUT endpoint exist for this entity? |
| — | **Blocker** | No pattern is feasible. | Flag ticket as NOT automatable; document the gap and escalate. |

Workflow during planning:

1. List each precondition (`user in X role`, `order in Y status`, `feature flag Z enabled`).
2. For each one, pick the lowest-priority pattern that works.
3. Document the chosen pattern, the exact endpoint or DB query that obtains the data, and where it runs (`beforeAll`, `beforeEach`, test-level setup).
4. For Modify and Generate, document cleanup/teardown (a test that creates state owns its cleanup).

Rules:

- Never hardcode entity IDs, usernames, or dates. Fetch dynamically at runtime or generate via faker.
- Discover queries run in `beforeAll`. If the query finds nothing, the test uses `test.skip()` — never `expect(...).toBe(...)` on precondition data. Unrelated tests must not be blocked by missing data for one test.
- If two tests need different states of the same entity, each test creates its own record. No shared mutable state.
- Auth tokens and credentials always come from `.env` via the project's variables module — never generated and never hardcoded.

Record a feasibility row per ticket inside the plan (module master doc §7 and implementation-plan §4):

```
| Ticket | Precondition | Pattern | Feasibility | Notes |
| OD-T01 | user with 0 orders | Discover | Risky | Query may be slow — add timeout guard |
| OD-T02 | order with discount applied | Generate | Feasible | POST /orders then POST /orders/{id}/discount |
```

---

## 8. `atc/{TICKET-ID}-{brief-title}.md` structure

Produce a per-ATC spec when the ATC is complex enough that the implementation plan cannot carry the detail, or when a regression-driven plan is just one ATC.

Template (abbreviated — full sections below):

```markdown
# ATC Spec: {TICKET-ID} — {ATC Name}

> Ticket: {TICKET-ID}
> Component: {ComponentName} (tests/components/{api|ui}/{ComponentName}.ts)
> Type: API | UI — Mutation | Verification | Negative | Happy path | Validation | Navigation | State change
> Parent Story: {PARENT-TICKET-ID} (if applicable)

## 1. Test Case Summary
| Name | Objective | Precondition | Acceptance Criteria |

## 2. ATC Contract
\`\`\`typescript
/**
 * ATC: brief description
 * Fixed assertions:
 *  - ...
 */
@atc('{TICKET-ID}')
async {methodName}({params}): {ReturnType} { /* ... */ }
\`\`\`

## 3A. API Details (API ATCs)  — endpoint, return type, OpenAPI imports, request/response shapes
## 3B. UI Details (UI ATCs)     — page path, locator strategy, Playwright assertions, intercept patterns

## 4. Assertions Split
### Fixed (inside ATC)           — invariants that always hold
### Test-level (in test file)    — varies per scenario

## 5. Code Template              — copy-pasteable skeleton with placeholders

## 6. Equivalence Partitioning check
| Input | Expected output | Same ATC? |

## 7. Dependencies
- Precondition Steps
- Required Components (exists? action needed)

## 8. Data Context (skip if parent plan covers it)
| Precondition | Pattern | Source | Placement | Cleanup |

## 9. Checklist
- [ ] verb{Resource}{Scenario} naming
- [ ] Max 2 positional params
- [ ] Correct return type (tuple for API, void for UI)
- [ ] Fixed vs test-level assertions split
- [ ] Not duplicating an existing ATC (EP checked)
```

ATC classification during planning:

| Type | API trigger | UI trigger | Fixed assertion shape |
|------|-------------|------------|----------------------|
| Mutation | POST/PUT/PATCH/DELETE | Fill + Submit + Navigate | Status 2xx + created/updated fields |
| Verification | GET + business-rule check | State-change verification | Status + business-rule invariants |
| Negative | Any (expects 4xx/5xx) | Invalid submit | Error status + error contract |
| Validation (UI) | — | Invalid form submit | Error visible, no navigation |
| Navigation (UI) | — | Click + destination | URL + heading + key elements |

Disguised helpers — if the method only does a GET with a status-200 assertion, or only a click without outcome assertions, it is a helper (no `@atc`), not an ATC.

---

## 9. Using `bun run kata:manifest` during planning

`bun run kata:manifest` writes `kata-manifest.json` — a static registry of every component and every `@atc('ID')` call in `tests/components/**`. Run it **before** writing the plan so the plan references real existing components instead of fabricating duplicates.

Planning tasks the manifest answers:

| Need | How |
|------|-----|
| "Does an `OrdersApi` component already exist?" | Look under `components.api[].name` |
| "Is ATC `UPEX-101` already decorated somewhere?" | Grep `atcs[].id` in every component |
| "Which component owns endpoint X?" | Component names map to domain; confirm by opening the file only if unclear |
| "Which Steps classes already compose ATCs?" | Check `preconditions[]` and its method list |

Include two tables in the implementation plan based on manifest output:

- **Existing ATCs (Reuse)** — populated from manifest entries whose `id` matches ACs already covered.
- **New ATCs (Create)** — ATC IDs that must be created for this ticket.

Running the manifest costs nothing; always do it before proposing new components. A planned "new component" that the manifest already lists is a duplicate and will be rejected in review.

---

## 10. Approval gate — Plan → Code

Never start Phase 2 (Code) without a written plan the user has approved. The gate is structural, not procedural politeness: it prevents the most common failure mode (coding the wrong scope).

Gate checklist:

- [ ] `spec.md` exists and every TC has a TMS-generated ID.
- [ ] For ticket/regression scope: `implementation-plan.md` exists with §3 ATC Registry populated.
- [ ] For complex ATCs: `atc/*.md` exists with the contract (signature + fixed assertions) defined.
- [ ] Data strategy is documented per precondition (pattern + source + placement + cleanup).
- [ ] Fixture decision is recorded (`{ api }` / `{ ui }` / `{ test }` / `{ steps }`).
- [ ] Every "New ATC" in the registry has a unique `@atc` ID that does not collide with `bun run kata:manifest` output.
- [ ] Module master doc exists (module scope only) with §4 Data Flow and §7 Data Strategy populated.
- [ ] Implementation order is defined with one commit per step.

Presentation to the user:

1. Summarise the scope (module / ticket / regression).
2. List the TCs from `spec.md` (IDs + titles).
3. List the ATCs to be created and reused from `implementation-plan.md` §3.
4. Flag any preconditions classified as Risky or Blocker in §7 — the user decides whether to proceed, adjust scope, or defer.
5. Wait for explicit approval before moving to Phase 2.

On approval, Phase 2 begins. If approval is not forthcoming, revise the plan — do not start coding with an unapproved plan. On rejection, document the reason in the plan and iterate.

---

## 11. Checklists by scope

### Module-driven

- [ ] Parallel context gathering complete (frontend, backend, existing `.context/` docs).
- [ ] Master document written with all 8 sections (§5).
- [ ] Tickets grouped by functional area (not by page section).
- [ ] Each ticket has 3–7 TCs; none exceed 10.
- [ ] Equivalence Partitioning applied across TCs; merges documented.
- [ ] Every TC has a TMS-generated ID (§3).
- [ ] ROADMAP.md, PROGRESS.md created.
- [ ] Data strategy table filled for every ticket (§7).

### Ticket-driven

- [ ] Ticket fetched from the issue tracker; ACs extracted.
- [ ] TMS queried for existing tests; missing ones created there first.
- [ ] `spec.md` written with 1–7 TCs.
- [ ] `implementation-plan.md` §3 ATC Registry populated against `kata:manifest` output.
- [ ] Fixture decision made and justified.
- [ ] Every precondition classified (§7).
- [ ] Implementation order written with one commit per step.

### Regression-driven

- [ ] Bug or gap is well-understood; the TC that would have caught it is written.
- [ ] TMS TC exists (1–3 bug, 1–2 gap).
- [ ] ATC spec written (`atc/*.md`) because the regression is one method's worth of work.
- [ ] Data strategy documented on the ATC spec (§8 in the ATC template) since there is often no parent implementation-plan.
- [ ] Component placement decided — existing component vs new + fixture update.

When every box is checked, the plan is ready to hand off to Phase 2 (Code). Until then, the plan is not complete and the approval gate (§10) has not been reached.

---

## 12. Interrupted-session recovery

When `/test-automation` is invoked mid-flow (or resumed after context loss), determine the resume step from the PBI state. The skill reads `PROGRESS.md` + `ROADMAP.md` directly — no `@`-loadable session file needed.

| Has plan? (`implementation-plan.md`) | Has test code? (`tests/e2e/**` or `tests/integration/**`) | Resume from |
|---|---|---|
| No  | No  | **STEP 2 (Planning)** |
| Yes | No  | **STEP 3 (Coding)** |
| Yes | Yes | **STEP 4 (Review)** |

Before classifying state, read the current ticket in `PROGRESS.md` §Current status to confirm which ticket the resume applies to.

### 12.1 Revision-loop ceiling (Phase 3 · Review)

Maximum revision loops: **2**. If the test is still not APPROVED after 2 revision rounds, present all remaining issues to the user and ask for guidance. Do not enter an infinite loop of reviewer ↔ coder mutations.

### 12.2 Quality Gates G1–G4

Named phase-transition checkpoints. Each gate blocks progression until its criteria are met.

| Gate | Between | Criteria |
|---|---|---|
| **G1 · Plan exists** | STEP 2 → STEP 3 | `implementation-plan.md` created with ATCs defined (see §10 Approval gate) |
| **G2 · Tests pass** | STEP 3 → STEP 4 | All ATCs green locally — soft override allowed only after §12.3 bug-detection sub-protocol |
| **G3 · Review OK** | STEP 4 → STEP 5 | Reviewer verdict = APPROVED, or §12.1 ceiling (2 rounds) reached and the user decided next steps |
| **G4 · Progress updated** | STEP 5 → STEP 6 | `PROGRESS.md` reflects the completed ticket (status, test file path, done count, Session Log entry) |

### 12.3 G2 failure protocol — legitimate bugs during automation

If G2 fails because a test uncovers a real product bug (not flaky, not a coding error), follow this sub-protocol **before** invoking the soft override:

> **Prerequisite**: Load `/acli` skill before executing the `[ISSUE_TRACKER_TOOL]` commands below.

1. **Search the issue tracker** for an existing bug that matches the observed vs expected behaviour (`[ISSUE_TRACKER_TOOL] Search Issues`).
2. **If the bug is already reported**:
   - Add a test annotation tying the failure to the bug key — e.g. `test.fail('Blocked by {BUG-KEY}')` or a `@blocked:{BUG-KEY}` tag.
   - Keep the test in the suite during automation runs (no silent skip — the failure is informative).
   - The `@blocked:{BUG-KEY}` tag lets `/regression-testing` filter the test out of GO/NO-GO decisions until the bug is fixed.
3. **If the bug is NOT reported**:
   - Present the observed vs expected diff to the user and wait for explicit confirmation that it is a real defect.
   - On approval, delegate bug-report creation to `/sprint-testing` (Stage 3 Reporting — see `sprint-testing/references/reporting-templates.md` §1).
   - Once the bug key is issued, apply step 2 above.
4. **Document in `PROGRESS.md`** — record each blocked test + bug key in the Session Log (and the Blocked tests table, see §13.2) so the next session does not re-investigate the same failure.

Only after steps 1–4 can G2 be overridden and STEP 4 (Review) start. A failing test without a bug key behind it is never an acceptable override.

---

## 13. Shared state files — templates

Both files live under `.context/PBI/{module}/test-specs/` and are the single source of truth for module-wide automation progress. Populate the template blocks verbatim (copy, then fill); keep section headings stable so future sessions can grep reliably.

### 13.1 `ROADMAP.md` (ticket index + dependencies)

````md
# {MODULE} · Automation Roadmap

## Tickets

| ID | Title | Priority | Phase | Dependencies | TCs |
|---|---|---|---|---|---|
| {PREFIX}-T01-{slug} | ... | P0 | Plan | — | 3 |
| {PREFIX}-T02-{slug} | ... | P1 | Code | T01 | 5 |

## Dependency graph

```
T01 ──┬──► T02 ──► T04
      └──► T03
```

## Phase progress

- Plan:   ▓▓▓▓░ 4/5
- Code:   ▓▓░░░ 2/5
- Review: ▓░░░░ 1/5
````

### 13.2 `PROGRESS.md` (session-persistent tracker)

````md
# {MODULE} · Automation Progress

## Current status

- Current ticket: {PREFIX}-T02-{slug}
- Completed: 1/5
- Remaining: 4/5

## Tickets

| Ticket | Status | Test file | Done | Notes |
|---|---|---|---|---|
| T01 | done | tests/e2e/login.spec.ts | 3/3 | — |
| T02 | in-progress | tests/e2e/signup.spec.ts | 1/5 | Fixture blocked on email-verify mock |

## Session log

| Date | Action | Actor | Artifacts |
|---|---|---|---|
| 2026-04-19 | Planned T02 | AI | implementation-plan.md |
| 2026-04-20 | Coded T02 ATC1 | AI | tests/e2e/signup.spec.ts |

## Shared components created

- `UserFormPage` (`tests/components/ui/UserFormPage.ts`) — used by T02, T05
- `AuthApi.signupWithRetry` — used by T02, T04

## Blocked tests

| Test | Bug key | Reason | Since |
|---|---|---|---|
| `signup > invalid email rejects` | UPEX-999 | Server-side validation missing | 2026-04-20 |
````

The Blocked tests table is populated from §12.3 — every `@blocked:{BUG-KEY}` test must appear here with the reason and the date the block began. Remove a row only when the bug is closed and the test goes green.
