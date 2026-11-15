# Planning Playbook: spec.md, automation-plan.md, atc/*.md

Load this during Phase 1 (Plan) of the Plan, Code, Review pipeline. It says what the three plan documents are, how to fill each by scope (Module, Ticket, Regression), how to classify test data while planning, and what has to be true before Plan hands over to Code.

SKILL.md §"Pick the planning scope first" decides which scope applies. This file assumes that is settled and documents what to produce.

> **Two plans exist.** This playbook authors the **automation plan** (`automation-plan.md`): a hand-written file in the Epic's `test-specs/<scope>/` tree, committed to git, with no Jira counterpart. The Story's dev `implementation-plan.md` is a different file: a Jira-synced, read-only cache in the Story folder (`.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/implementation-plan.md`). Read it as input via `bun run jira:sync-issues get <STORY-KEY>` and do not hand-write it. The names differ so the two cannot be mixed up.

> **Path model.** All `test-specs/` artifacts live at the **Epic** level: `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/` (sibling of `stories/`). Module = Epic (1:1). `<scope>` = the ticket or regression slug, or the module slug.

---

## Plan dispatch (Single subagent)

A single subagent runs the Plan phase. The orchestrator does not read the KATA references, the existing component code or the OpenAPI schemas while planning: that exploration stays in the subagent's context, which keeps the orchestrator's small.

**Briefing** (7 components per `agentic-qa-core/references/briefing-template.md`):

```
Goal: Produce spec.md + automation-plan.md for scope <SCOPE> (module|ticket|ATC) <SCOPE_KEY>.
Context docs:
  - kata-manifest.json (root): read it first. It is the registry of every existing Component and ATC, used for reuse detection and ID-collision avoidance before drafting anything.
  - .context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/ (Jira-synced caches: story.md, acceptance-criteria.md, implementation-plan.md (dev plan), acceptance-test-plan.md; read-only input; materialize via `bun run jira:sync-issues get <STORY-KEY> --include-comments`)
  - .context/PBI/qa-artifacts/master-test-plan.md
  - `bun run context:map business-data-context` and `bun run context:map business-e2e-context` (per touched level; add `business-api-context` for API scope; `--section <id>` for one entity, journey or endpoint group)
  - .agents/skills/test-automation/references/kata-architecture.md
  - .agents/skills/test-automation/references/atc-tracing.md
  - tests/components/<api|ui>/ (existing components — open ONLY when the manifest entry is ambiguous)
  - api/schemas/ (TypeScript types for API tests)
Project Standards (auto-resolved): <compact rules pulled from .agents/skills/REGISTRY.md per agentic-qa-core/references/skill-resolver.md; authoritative for listed conventions, so do not re-read full SKILL.md files>
Skills to load: (none; the orchestrator already loaded the planning skill)
Exact instructions:
  1. Load kata-manifest.json first. Cross-check every candidate Component name against components.api[].name + components.ui[].name, and every candidate ATC ID against components.{api,ui}[].atcs[].id. A match is a reuse signal: plan no duplicate.
  2. Read remaining context docs to understand scope, business risks, and any coverage the manifest does not surface.
  3. Draft spec.md with: scope summary, the TMS-ID table of TCs in scope, and the Automation Plan (order, shared fixtures, blockers). Do not restate TC bodies: they live in Jira and sync into test-cases/.
  4. Draft automation-plan.md with: target file paths, fixture selection (api / ui / test), reused-vs-new components (cite manifest entries), dependency order, estimated complexity per ATC.
  5. Write both files to .context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/<scope-slug>/.
Report format:
  JSON: { "spec_path": "...", "plan_path": "...", "atc_count": <int>, "new_components": [...], "reused_components": [...], "open_questions": [...] }
Rules:
  - Apply the inline-locator rule (locators inline in ATCs, extract only when reused 2+ times).
  - Apply the ATC-identity rule (same output = one parameterized ATC).
  - Write the spec and the plan only; test code belongs to Phase 2.
  - Surface open questions to the orchestrator instead of guessing.
  - Plan only the TCs that passed the TC source gate (SKILL.md §"TC source gate"): each exists in the TMS with a signed `Candidate` verdict. Do not create, derive or score a TC; a missing one is an open question routed to /test-documentation.
```

The orchestrator reads the JSON report, surfaces any open_questions, and dispatches Code only after the plan is approved (§10).

---

## 1. Plan document map

Every scope produces at least `spec.md`. Ticket and regression scopes add `automation-plan.md`, and complex ATCs add per-ATC specs under `atc/`. All live at the Epic level under `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/`.

`test-specs/` is the one `[COMMIT]` island inside an otherwise gitignored Jira cache (`.agents/instructions/agent-local-context-pbi.md`). These files describe the **test code**, so they land in the same commit as the code they produce; otherwise a reviewer cannot compare plan with implementation. The same line decides what belongs here: a Jira `Test` issue holds the test case, and an `atc/*.md` holds how to implement it in KATA. Same ID, two documents, two owners.

| Document | Scope that produces it | Location |
|----------|-----------------------|----------|
| `spec.md` | Module (N specs), Ticket (1), Regression (1) | `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/{PREFIX}-T{NN}-{name}/spec.md` |
| `automation-plan.md` | Ticket, Regression | Same folder as spec.md — `automation-plan.md` |
| `atc/{TICKET-ID}-{brief-title}.md` | Complex ATCs from any scope | Same folder — `atc/{TICKET-ID}-{brief-title}.md` |
| `ROADMAP.md`, `PROGRESS.md` | Module only | `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/` |

Canonical folder naming:

- `{module}`, kebab-case business area (`orders-dashboard`, `user-management`).
- `{PREFIX}`, 2–3 letter module abbreviation (`OD`, `UM`, `AUTH`). Used for the filesystem only, never for TC IDs.
- `T{NN}`, zero-padded ticket slot (`T01`, `T02`, …).
- `{name}`, ≤5-word kebab-case title.
- `{TICKET-ID}`, TMS ticket key (e.g., `UPEX-123`). TC IDs in spec content are always TMS-generated; local IDs are never invented.

---

## 2. Inputs and outputs by scope

### 2.1 Module-driven (macro)

Inputs:

- Module name or feature area (`"Orders Dashboard"`, `"Billing"`), and the module's signed `Candidate` TCs from `/test-documentation` (the TC source gate's list). This scope designs the automation of those TCs, not the TCs themselves.
- Any stakeholder input: meeting transcript, priority list, known regressions.
- Access to frontend and backend source for the module.
- Access to the business context maps (`bun run context:map <slug>`) and the existing PBI under `.context/PBI/`.

Outputs:

```
.context/PBI/epics/EPIC-<KEY>-<slug>/
  test-specs/
    {module}-test-plan.md         # Master document (Section 5)
    ROADMAP.md                    # Ticket index, phases, dependency graph
    PROGRESS.md                   # Session-persistent tracker
    {PREFIX}-T01-{name}/spec.md   # 3–7 TCs per ticket
    {PREFIX}-T02-{name}/spec.md
    …
```

Scope targets: 3–7 TCs per ticket. A ticket with 10+ TCs is too broad, so split it. Group tickets by functional area, not by UI section.

### 2.2 Ticket-driven (medium)

Inputs:

- Ticket ID in the TMS (e.g., `UPEX-101`).
- Test type, `integration` or `e2e` (ask if not obvious).
- Existing module context, if the ticket belongs to a module with prior `test-specs/`.

Outputs:

```
.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/{PREFIX}-T{NN}-{name}/
  spec.md                # 1–7 TCs derived from the ticket's ACs
  automation-plan.md     # Architecture decisions, ATC registry, scenarios, implementation order
  atc/*.md               # Only for ATCs complex enough to warrant a per-ATC spec
```

Expected TC count: 1–7 per ticket (story-driven).

### 2.3 Micro (bug-driven or discovery-driven)

Inputs:

- A single signed `Candidate` TC (often added after a bug fix), or the one signed TC of a coverage gap (origin `discovery-driven`, `../../agentic-qa-core/references/discovery-driven-doctrine.md` §2).
- Target component (existing or new).
- Module name for folder placement.

Outputs:

```
.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/{PREFIX}-T{NN}-{name}/
  spec.md                # 1–3 TCs (bug-driven) or 1–2 (discovery-driven gap)
  automation-plan.md     # Optional: skip when the spec is trivially one method
  atc/{TICKET-ID}-{brief-title}.md  # Usually present — regression = one ATC in detail
```

A Micro plan is the smallest unit of work. It is often just `spec.md` + `atc/*.md` with no automation plan, because one ATC is the whole job.

---

## 3. TMS-first principle: consume, never create (applies to every scope)

TCs in `spec.md` reference TMS-generated IDs, and every one has passed the TC source gate (SKILL.md §"TC source gate"). Before writing TCs:

> **Prerequisite**: Load `/xray-cli` skill (Modality jira-xray) or `/acli` (Modality jira-native) before executing the TMS commands below.

1. Query the TMS for tests already linked to the ticket (via `[TMS_TOOL] List Tests`, resolved per AGENTS.md Tool Resolution).
2. **Every TC exists with a signed `Candidate` verdict**: consume them as the base for `spec.md` and do not duplicate.
3. **TCs are missing, unsigned, or not `Candidate`**: stop. Route the scope (Story key, coverage Tech Story key, or gap ids) to `/test-documentation`, which runs Analyze, Prioritize (ROI) and Document and collects the person's signature. This skill does not create a Test (`[TMS_TOOL] Create Test` is not one of its calls) and does not score one.
4. **Partial**: the person decides whether to route the rest and wait, or to narrow the work package to the signed TCs now. The gap is never filled here. In a supervised worker the launcher holds this decision; in a routine, narrow to the signed TCs, list the rest as routed, and report.

> A Test that enters the regression repository without a signed ROI verdict is the back door this rule closes: it skips the >50% Candidate/Manual alarm and the person's signature (`../../agentic-qa-core/references/stage-gates.md` §Automation).

Local `{PREFIX}-T{NN}` naming is filesystem scaffolding. All TC headings inside `spec.md` use the TMS IDs (`### PROJ-101: should ...`). The same IDs become `@atc('PROJ-101')` decorators during the Code phase.

---

## 4. `spec.md` structure

The spec is the **automation batch plan**: which TCs this scope automates, in what order, and what they share. It does NOT restate the test cases.

> **Why it carries no Gherkin.** The TC body (preconditions, action, expected output, Gherkin) lives in the Jira `Test` issue, and `bun run jira:sync-issues` materializes every Test linked to a Story into `test-cases/TEST-<KEY>-<slug>.md` under that Story. A copy here puts the same text on disk twice, and the copy nobody re-synced is the one people read. Reference the TMS ID; the body is one sync away.

> **Reference TCs by Jira key, not by path.** Folder slugs come from issue summaries, so a Story retitled in Jira renames its folder and breaks every hardcoded link, relative or aliased. The key is the only stable identifier.

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
{What this scope automates and why it matters. 2–4 sentences.}

## Test Cases

> Bodies live in Jira. Synced copies sit under the covering Story's `test-cases/`
> (or `epics/_orphans/tests/` when the Test covers nothing); run
> `bun run jira:sync-issues get {TICKET-ID}` if they are not on disk.

| TMS ID | Title | Type | Priority |
|--------|-------|------|----------|
| {TMS_TC_ID} | should {behavior} when {condition} | Positive / Negative / Boundary | P0 |

## Automation Plan

**Order**: {execution order and why — e.g. "PROJ-501 first: it seeds the coupon
the rest reuse"}

**Shared fixtures**: {fixtures these TCs have in common, and which ATC creates each}

**Blocked by**: {missing mock, unavailable env, unbuilt helper — or "Nothing"}

**Preconditions for the whole scope**: {entities, states, accounts required before
any of these run — distinct from a single TC's own preconditions, which live in Jira}

## Merged TCs (if any)
| Removed ID | Merged Into | Reason |

## Updated TCs (if any)
| TC ID | Spec File | What Was Added | Reason |

## Acceptance Criteria
- [ ] {N} TCs automated with {pattern description}
- [ ] Tests pass on local and staging
```

Rules for `spec.md`:

- Every row in the Test Cases table carries a **TMS-generated ID** with a signed `Candidate` verdict. A local-only ID means the TC was never documented: route it to `/test-documentation` (§3) and do not create it here.
- Leave out the Gherkin, the steps and the expected output. Explaining what a TC verifies belongs in the Jira issue.
- Flag multi-step flows (2+ actions with intermediate verifications) as multi-ATC tests, not a single TC.
- Priority levels: P0 (release-blocker), P1 (high value), P2 (edge cases).
- The Automation Plan section is the part only this file can hold: order, shared fixtures and blockers belong to the batch, not to any one test case.

---

## 5. Module-scope master document (`{module}-test-plan.md`)

Only module scope produces this master doc, in addition to the per-ticket specs, at `.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/{module}-test-plan.md` (inside the committed `test-specs/` island; anywhere else under the Epic folder is gitignored). It is the single source of module-level context that every ticket spec references.

Sections, in order:

1. **Executive Summary**: why the module matters, key risks, stakeholder priorities.
2. **Module Overview**: what it is, who uses it, how it connects to other modules.
3. **Page/API Architecture**: visual states, panel layout, conditional rendering, status flows.
4. **Data Flow & API Endpoints**: all endpoints the page calls, calculation formulas, refresh triggers.
5. **TCs in scope**: the module's signed `Candidate` TC keys, organised by functional area. The Gherkin (Preconditions, Action, Expected) lives in each Test's body, written by `/test-documentation`; this document authors no scenario.
6. **Implementation Roadmap**: phases ordered from P0 to P2 with dependencies between tickets.
7. **Test Data Strategy**: per-ticket feasibility table (Discover, Modify, Generate; see §7).
8. **Key Selectors Reference**: CSS selectors or `data-testid` values the automation will target.

Write it for a reader with zero context: calculation formulas spelled out, stakeholder quotes where they describe priorities, and ASCII diagrams for layouts (a diagram beats a paragraph).

---

## 6. `automation-plan.md` structure

The automation plan is the technical contract: what code to write, which components already exist, which ATCs to reuse or create, and the implementation order. It is hand-written in `test-specs/`, separate from the Story's Jira-synced dev `implementation-plan.md`.

```markdown
# Test Automation Plan: {TICKET-ID}

> Ticket: {TICKET-ID} — {Title}
> Type: integration | e2e
> Sprint: {Sprint Name}
> Created: {date}

## 1. Ticket Summary
- What to test
- Acceptance Criteria (list)
- Dependencies (other ticket IDs)

## 2. Architecture Decisions

> **ADR promotion check.** Decisions in this section are **ticket-local** by default and stay in this plan. One that passes all three gates of `agentic-qa-core/references/adr-doctrine.md` §1 (hard to reverse, surprising without context, a real trade-off between alternatives) is promoted to a standalone `ADR-NNNN-<slug>.md` in `.context/ADR/`, with a `See ADR-NNNN` backlink in the table below. Candidates are a fixture lifecycle reused across tickets, a test-data-isolation contract, a Page-Object-vs-Screenplay shift, an auth-in-tests change, a flake-retry policy. Passing one or two gates is not enough, and over-recording buries the decisions that matter. Procedure: `agentic-qa-core/references/adr-doctrine.md` §1–§2; template and lifecycle: `.context/ADR/README.md`. The AI drafts `Proposed`; the human approves.

### Component Strategy
| Decision | Value | Rationale |
| Component | {Resource}Api.ts / {Page}Page.ts | New or existing? |
| Fixture | { api } / { ui } / { test } | Why this fixture? |
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
- [ ] TMS TC transitions to Pull Request when the PR opens (`create_pr` transition) — Automated only lands post-merge via the `merged` transition

## 7. Success Criteria
- [ ] All ACs covered — **the floor, not the bar.** Also: risk-beyond-AC covered (invalid/boundary inputs, auth/error paths, state transitions, anomalies the AC is silent on) per `agentic-qa-core/references/test-design-doctrine.md`
- [ ] Boundary cases (BVA) automated wherever an AC has a range / limit / length / date-window (EP-merge does NOT cover off-by-one)
- [ ] KATA compliance
- [ ] Fixture correct
- [ ] No hardcoded waits
- [ ] Aliases used
- [ ] Tests pass locally
- [ ] TMS TC moved to Pull Request on PR open (never "Automated" after local validation — Automated is exclusively the `merged` transition, once the code is on the production branch with CI green there)
```

Each box in Section 6 maps to a single commit; split a commit that would mix "new types" with "new ATC".

---

## 7. Data classification: Discover / Modify / Generate

Classify every precondition in a plan by how its data will be obtained, while planning, so the coding phase inherits a decision instead of making one. Try Discover first, then Modify, then Generate.

| Priority | Pattern | Description | Feasibility check |
|----------|---------|-------------|-------------------|
| 1 | **Discover** | Query the system for existing data already in the required state. Zero DB impact. Preferred. | Can DB/API return an entity matching the preconditions? |
| 2 | **Modify** | Find existing data and alter it via API to reach the required state. | Does the API expose the mutation needed? |
| 3 | **Generate** | Create data from scratch via API (faker payload + POST). Last resort. | Does a POST/PUT endpoint exist for this entity? |
| — | **Blocker** | No pattern is feasible. | Flag the ticket as not automatable; document the gap and escalate. |

Workflow during planning:

1. List each precondition (`user in X role`, `order in Y status`, `feature flag Z enabled`).
2. For each one, pick the highest-priority pattern that works (Discover before Modify before Generate).
3. Document the chosen pattern, the exact endpoint or DB query that obtains the data, and where it runs (`beforeAll`, `beforeEach`, test-level setup).
4. For Modify and Generate, document cleanup/teardown (a test that creates state owns its cleanup).

Rules:

- Fetch entity IDs, usernames and dates at runtime or generate them via faker; hardcoded values rot.
- Discover queries run in `beforeAll`. If the query finds nothing, the test calls `test.skip()` and does not `expect(...).toBe(...)` on precondition data, so missing data for one test never blocks unrelated tests.
- If two tests need different states of the same entity, each creates its own record. There is no shared mutable state.
- Auth tokens and credentials come from `.env` via the project's variables module, never generated and never hardcoded.

Record a feasibility row per ticket inside the plan (module master doc §7 and automation-plan §4):

```
| Ticket | Precondition | Pattern | Feasibility | Notes |
| OD-T01 | user with 0 orders | Discover | Risky | Query may be slow — add timeout guard |
| OD-T02 | order with discount applied | Generate | Feasible | POST /orders then POST /orders/{id}/discount |
```

---

## 8. `atc/{TICKET-ID}-{brief-title}.md` structure

Write a per-ATC spec when the ATC is too complex for the implementation plan to carry its detail, or when a Micro plan is just one ATC.

Template (abbreviated):

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

## 6. Technique-derivation check (decides the ATC set — 1:N per AC)
> Full canon and triggers: `agentic-qa-core/references/test-design-doctrine.md`. EP-merge collapses inputs only within a partition, never across partitions, boundaries or states.

| AC | Technique fired | ATCs produced |
|----|-----------------|---------------|
| (per AC) | EP (always) / BVA (range·limit·length·date) / State-Transition (status field) / Decision Table (2+ interacting conditions) / Pairwise (3+ factors) | … |

**Equivalence Partitioning detail:**
| Input | Expected output | Same ATC? |

**Boundary Value Analysis detail** (mandatory if any range or limit exists, otherwise state N/A):
| Field + range | Boundary ATCs (`min-1·min·min+1 … max-1·max·max+1`, zero/empty/null) |

**Two reduction axes — keep them separate** (canon: doctrine §"Part 2.5"):
- EP and BVA decide how many parameterized `@atc`s the cases split across: one per partition, boundary and state.
- Decision Table and Pairwise reduce the data rows inside one parameterized ATC. When an ATC's data set combines 2+ interacting conditions, a Decision Table keeps one row per surviving rule; with 3+ factors, Pairwise keeps all-pairs rows instead of the full cartesian product. They shrink the fixture/`data-factory` row set, not the ATC count. Log the reduction in the fixture or the spec so it is visible and not a silent cap.

| Parameterized ATC | Reduction applied | Rows after reduction |
|---|---|---|
| (per multi-factor ATC) | Decision Table / Pairwise / none | … |

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

Disguised helpers: a method that only does a GET with a status-200 assertion, or only a click without outcome assertions, is a helper (no `@atc`), not an ATC.

---

## 9. Using `kata-manifest.json` during planning

`kata-manifest.json` (root) is the registry of every component and every `@atc('ID')` call in `tests/components/**`. Load it before drafting any plan (Critical Rule #12 in `AGENTS.md`). The husky pre-commit gate keeps it fresh, and reviewers and downstream agents consult it rather than the file system, so a component that exists only on disk does not count.

Regenerate when stale: `bun run kata:manifest`. Validate: `bun run kata:manifest:check` (CI-grade; exits 1 if stale).

Planning tasks the manifest answers:

| Need | How |
|------|-----|
| "Does an `OrdersApi` component already exist?" | Look under `components.api[].name` |
| "Is ATC `UPEX-101` already decorated somewhere?" | Grep `atcs[].id` in every component |
| "Which component owns endpoint X?" | Component names map to domain; confirm by opening the file only if unclear |
| "Which Steps classes already compose ATCs?" | Check the manifest's steps listing (`tests/components/steps/` scan) and its method list |

Include two tables in the implementation plan based on manifest output:

- **Existing ATCs (Reuse)**: populated from manifest entries whose `id` matches ACs already covered.
- **New ATCs (Create)**: ATC IDs that must be created for this ticket.

A planned "new component" the manifest already lists is a duplicate, and a planned `@atc('PROJ-XXX')` ID already in `atcs[].id` is an ID collision. Review rejects both, and reading `kata-manifest.json` first avoids both.

---

## 10. Approval gate: Plan to Code

Phase 2 (Code) starts only from a written plan that has been approved. The gate prevents the most common failure mode, coding the wrong scope.

Gate checklist:

- [ ] `spec.md` exists and every TC has a TMS-generated ID.
- [ ] For ticket/regression scope: `automation-plan.md` exists with §3 ATC Registry populated.
- [ ] For complex ATCs: `atc/*.md` exists with the contract (signature + fixed assertions) defined.
- [ ] Data strategy is documented per precondition (pattern + source + placement + cleanup).
- [ ] Fixture decision is recorded (`{ api }` / `{ ui }` / `{ test }`).
- [ ] Every "New ATC" in the registry has a unique `@atc` ID that does not collide with `bun run kata:manifest` output.
- [ ] Module master doc exists (module scope only) with §4 Data Flow and §7 Data Strategy populated.
- [ ] Implementation order is defined with one commit per step.

Presentation to the user:

1. Summarise the scope (module / ticket / regression).
2. List the TCs from `spec.md` (IDs + titles).
3. List the ATCs to be created and reused from `automation-plan.md` §3.
4. Flag any preconditions classified as Risky or Blocker in §7, the user decides whether to proceed, adjust scope, or defer.
5. Wait for explicit approval before moving to Phase 2.

On approval, Phase 2 begins. Without it, revise the plan; on rejection, document the reason in the plan and iterate.

Who approves depends on the session (canon: `agentic-qa-core/references/decision-protocol.md`). With a person present, the person. In a supervised worker, the conductor or launcher holds the gate: send it the same summary and wait. In a routine with nobody, a delegating brief that names this plan's scope is the approval; without one, write the plan files (reversible), stop before Phase 2, and report the plan with its open questions.

---

## 11. Checklists by scope

### Module-driven

- [ ] Parallel context gathering complete (frontend, backend, existing `.context/` docs).
- [ ] Master document written with all 8 sections (§5).
- [ ] Tickets grouped by functional area (not by page section).
- [ ] Each ticket has 3–7 TCs; none exceed 10.
- [ ] Equivalence Partitioning applied across TCs; merges documented.
- [ ] Every TC has a TMS-generated ID and a signed `Candidate` verdict (§3); none created here.
- [ ] ROADMAP.md, PROGRESS.md created.
- [ ] Data strategy table filled for every ticket (§7).

### Ticket-driven

- [ ] Story materialized via `bun run jira:sync-issues get <STORY-KEY> --include-comments`; ACs, dev implementation-plan and ATP read from the synced `.md` (a plain view returns null for custom fields). Never read custom fields with `acli workitem view`.
- [ ] TMS queried; every TC in scope passed the TC source gate (missing or unsigned ones routed to `/test-documentation`, never created here).
- [ ] `spec.md` written with 1–7 TCs.
- [ ] `automation-plan.md` §3 ATC Registry populated against `kata:manifest` output.
- [ ] Fixture decision made and justified.
- [ ] Every precondition classified (§7).
- [ ] Implementation order written with one commit per step.

### Micro (bug-driven or discovery-driven)

- [ ] Bug or gap is well-understood; the TC that would have caught it exists in the TMS with a signed `Candidate` verdict (1–3 bug, 1–2 gap). If none exists, run `/test-documentation` first.
- [ ] ATC spec written (`atc/*.md`), since the regression is one method's worth of work.
- [ ] Data strategy documented on the ATC spec (§8 in the ATC template) since there is often no parent automation-plan.
- [ ] Component placement decided, existing component vs new + fixture update.

With every box checked, the plan is ready for the approval gate (§10) and then Phase 2 (Code).

---

## 12. Interrupted-session recovery

When `/test-automation` is invoked mid-flow, or resumed after context loss, the first stop is the Phase 0 session contract: read `.session/test-automation/<scope>/{plan.md, progress.md}` per `agentic-qa-core/references/session-management.md` and offer resume, restart or abort. A person picks; a supervised worker takes the launcher's choice; a routine resumes unless its brief says otherwise. `PROGRESS.md` and `ROADMAP.md` (in `test-specs/`) are the module-batch trackers. Read them to confirm which ticket the resume applies to; they complement the `.session/` contract and do not replace it.

| Has plan? (`automation-plan.md`) | Has test code? (`tests/e2e/**` or `tests/integration/**`) | Resume from |
|---|---|---|
| No  | No  | **Phase 1 — Plan** |
| Yes | No  | **Phase 2 — Code** |
| Yes | Yes | **Phase 3 — Review** |

Whatever row the resume lands on, the TC source gate (`../SKILL.md` §"TC source gate") runs first, before Code or Review continue: a plan written before the gate existed, or before a verdict changed, may list TCs that are no longer signed Candidates.

### 12.1 Revision-loop ceiling (Phase 3 · Review)

The ceiling is **2** revision loops. If the test is still not APPROVED after 2 rounds, present the remaining issues and ask for guidance (a supervised worker sends them to its launcher; a routine reports them), so reviewer and coder do not trade mutations forever.

### 12.2 Quality Gates G1–G4

Named phase-transition checkpoints. Each blocks progression until its criteria are met.

| Gate | Between | Criteria |
|---|---|---|
| **G1 · Plan exists** | Phase 1 → Phase 2 | `automation-plan.md` created with ATCs defined (see §10 Approval gate) |
| **G2 · Tests pass** | Phase 2 → Phase 3 | All ATCs green locally — soft override allowed only after §12.3 bug-detection sub-protocol |
| **G3 · Review OK** | Phase 3 → Archive | Reviewer verdict = APPROVED, or §12.1 ceiling (2 rounds) reached and the user decided next steps |
| **G4 · Progress updated** | Archive → next ticket | `PROGRESS.md` reflects the completed ticket (status, test file path, done count, Session Log entry) |

### 12.3 G2 failure protocol: legitimate bugs during automation

If G2 fails because a test uncovers a real product bug (not flaky, not a coding error), run this sub-protocol before using the soft override:

> **Prerequisite**: Load `/acli` skill before executing the `[ISSUE_TRACKER_TOOL]` commands below.

1. **Search the issue tracker** for an existing bug that matches the observed vs expected behaviour (`[ISSUE_TRACKER_TOOL] Search Issues`).
2. **If the bug is already reported**:
   - Add a test annotation tying the failure to the bug key, e.g. `test.fail('Blocked by {BUG-KEY}')` or a `@blocked:{BUG-KEY}` tag.
   - Keep the test in the suite during automation runs; the failure is informative, so it is not skipped silently.
   - The `@blocked:{BUG-KEY}` tag lets `/regression-testing` filter the test out of GO/NO-GO decisions until the bug is fixed.
3. **If the bug is not reported**:
   - Present the observed vs expected diff and wait for explicit confirmation that it is a real defect. A supervised worker sends it to its launcher. A routine with nobody records the failure in `PROGRESS.md`, files nothing (a Jira write is outward) and reports.
   - Classify it first: Bug, Defect or Improvement by the feature's lifecycle stage, not by where the failing test ran (feature live above Staging is a Bug; still pre-release is a Defect; an under-specified or absent AC surfaced by a test-beyond-AC is an Improvement), per `agentic-qa-core/references/defect-management-doctrine.md` (Part 1). Also identify the affected product component. This is the Jira classification, independent of the `@atc(...)` Allure severity, which is reporting metadata and not the Jira severity field.
   - On approval, delegate report creation to `/sprint-testing` (Stage 3 Reporting; see `sprint-testing/references/reporting-templates.md` §1), passing the classification and affected component in the handoff so it files the correct issue type. `/sprint-testing` does the filing (QA Assignee, components, QA process epic).
   - Once the issue key is issued, apply step 2 above.
4. **Document in `PROGRESS.md`**: record each blocked test and bug key in the Session Log and the Blocked tests table (§13.2), so the next session does not re-investigate the same failure.

G2 can be overridden, and Phase 3 (Review) can start, only after steps 1–4. A failing test with no bug key behind it is not an acceptable override.

---

## 13. Shared state files: templates

Both files live under the Epic's `test-specs/` (`.context/PBI/epics/EPIC-<KEY>-<slug>/test-specs/`) and are the source of truth for module-wide automation progress. Copy the template blocks and fill them; keep the section headings unchanged so later sessions can grep them.

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
| T01 | done | tests/e2e/login.test.ts | 3/3 | — |
| T02 | in-progress | tests/e2e/signup.test.ts | 1/5 | Fixture blocked on email-verify mock |

## Session log

| Date | Action | Actor | Artifacts |
|---|---|---|---|
| 2026-04-19 | Planned T02 | AI | automation-plan.md |
| 2026-04-20 | Coded T02 ATC1 | AI | tests/e2e/signup.test.ts |

## Shared components created

- `UserFormPage` (`tests/components/ui/UserFormPage.ts`) — used by T02, T05
- `AuthApi.signupWithRetry` — used by T02, T04

## Blocked tests

| Test | Bug key | Reason | Since |
|---|---|---|---|
| `signup > invalid email rejects` | UPEX-999 | Server-side validation missing | 2026-04-20 |
````

The Blocked tests table comes from §12.3: every test marked `test.fail('Blocked by {BUG-KEY}')` and tagged `@blocked:{BUG-KEY}` (the blocked-by-bug convention of `automation-standards.md` §7, distinct from `softFail` and `@flaky`) appears here with its bug key, the reason and the date the block began. Remove a row only when the bug is closed and the test goes green.
