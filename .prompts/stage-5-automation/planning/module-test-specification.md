# Module Test Specification

> Investigate a module and produce a full set of automation-ready test specs.
> This is the **macro-level** planning prompt — it creates the work that
> `test-implementation-plan.md` (per ticket) and `atc-implementation-plan.md` (per ATC) then implement.

---

## Purpose

Generate a complete `test-specs/` directory for a module, containing:
- A master test plan document with architecture, calculations, endpoints, and selectors
- Individual test tickets (3-7 TCs each) with KATA-aligned Gherkin
- A roadmap with phases, dependencies, and progress tracking
- A reusable session prompt for the Test-Automation Agent

**This prompt is executed WHEN:**

- Planning test coverage for a new module or feature area
- The user says "plan tests for {module}" or "create test tickets for {module}"
- A stakeholder meeting identified test gaps for a module
- Reverse engineering an existing module that has no test coverage

**This prompt is NOT for:**

- Planning a single test file → use `test-implementation-plan.md` (ticket-driven scope)
- Specifying a single ATC → use `atc-implementation-plan.md` (regression/exploratory scope)
- Implementing tests → use `coding/e2e-test-coding.md` or `coding/integration-test-coding.md`

**See also:** The parent `README.md` documents all four planning scopes (module-driven, ticket-driven, regression-driven, exploratory-driven) and when to use each prompt.

---

## Relationship to Other Planning Prompts

```
module-test-specification.md (this)     <- Macro: entire module -> N tickets
    | produces test specs consumed by
test-implementation-plan.md             <- Medium: 1 ticket -> 1 test file plan
    | may reference individual ATCs via
atc-implementation-plan.md              <- Micro: 1 ATC -> 1 method spec
```

| Prompt | Scope | Input | Output | Who Executes |
|--------|-------|-------|--------|-------------|
| **module-test-specification** | 1 module (N tickets) | Any source (meetings, code, TMS, reverse eng) | `test-specs/` directory | Test-Manager Agent |
| **test-implementation-plan** | 1 ticket (N ATCs) | TK-XXX from TMS | `implementation-plan.md` | Test-Automation Agent |
| **atc-implementation-plan** | 1 ATC (1 method) | TC-XXX from TMS | `atc/{TICKET-ID}-spec.md` | Test-Automation Agent |

---

## INPUT REQUIRED

**One of the following:**

1. **Module name** — e.g., "Orders Dashboard", "User Management", "Billing"
2. **Feature area** — e.g., "Invoice Cap Application", "Audit Mode"
3. **Stakeholder input** — Meeting transcript, Slack thread, or TMS ticket with context

**Also helpful (but AI can investigate if not provided):**

- Known regressions or pain points
- Priority areas identified by Tech Lead or Product
- Existing context docs in `.context/`

---

## Overview

This workflow produces **test specifications** — not automated tests. It converts business knowledge, code analysis, and stakeholder input into structured, KATA-aligned test specs that the Test-Automation Agent can then implement.

```
+--------------------------------------+     +--------------------------------------+
|  Test-Manager Agent                  |     |  Test-Automation Agent               |
|                                      |     |                                      |
|  - Investigates module               |     |  - Reads test specs                  |
|  - Understands business              |---->|  - Implements in Playwright           |
|  - Creates test specs (Gherkin)      |     |  - Updates PROGRESS.md               |
|  - Defines TC/TS per functional area |     |  - Follows KATA architecture         |
|                                      |     |                                      |
|  Output: test-specs/                 |     |  Output: tests/ code                 |
+--------------------------------------+     +--------------------------------------+
```

### When to Use This Workflow

| Source | Example | How It Enters |
|--------|---------|---------------|
| **Stakeholder meeting** | Tech Lead discusses module gaps | Meeting transcript provided by user |
| **TMS ticket** | New feature US-XXX with acceptance criteria | User provides ticket ID or content |
| **Reverse engineering** | Module exists but has no test coverage | AI explores frontend + backend code |
| **Bug pattern** | Repeated regressions in a specific area | User describes the pattern |
| **E2E flow gap** | Critical flow identified but not covered | Existing context docs + code analysis |

---

## Prerequisites

Before starting, confirm you have access to:

1. **Context docs**: `.context/` directory in the main project
2. **Frontend code**: `{frontend-repo}/src/routes/{Module}/` for UI components, state, and API calls
3. **Backend code**: `{backend-repo}/src/{Module}/` for controllers, repositories, and view models
4. **Existing test plans**: `.context/PBI/` for any prior test documentation
5. **QA guidelines**: `.context/guidelines/QA/atc-definition-strategy.md` for naming conventions

---

## Step 1: Gather Context Sources

**Goal**: Collect ALL available information about the module before writing anything.

### What to Gather

| Source Type | Where to Find | What to Extract |
|-------------|---------------|-----------------|
| **Business context** | `.context/business/`, `.context/flows/` | What the module does, who uses it, why it matters |
| **Stakeholder input** | Meeting transcripts, Slack threads, TMS tickets | Priorities, known gaps, edge cases, recent regressions |
| **Existing test docs** | `.context/PBI/`, `.context/e2e/` | What's already covered, what's not |
| **Frontend code** | `{frontend-repo}/src/routes/{Module}/` | UI states, API calls, filters, conditional rendering |
| **Backend code** | `{backend-repo}/src/{Module}/` | Endpoints, calculations, business rules, data models |
| **Database schema** | DB MCP or code models | Tables, relationships, key fields |

### How to Investigate

Use **parallel subagents** to explore frontend, backend, and docs simultaneously:

```
Agent 1 (Frontend): Read main page component, state management, sub-components
  -> Extract: API endpoints called, filters, page states, conditional rendering, selectors

Agent 2 (Backend): Read controllers, repositories, view models, helpers
  -> Extract: Endpoint logic, calculations, data models, business rules

Agent 3 (Context): Read existing docs in .context/
  -> Extract: What's documented, what's missing, related flows
```

### Key Questions to Answer

Before moving to Step 2, you should be able to answer:

- [ ] What are the **page states** (empty, loading, loaded, error)?
- [ ] What are the **user actions** that trigger behavior (filter changes, clicks, navigation)?
- [ ] What **data** is displayed and where does it come from (which API endpoints)?
- [ ] What **calculations** happen (in backend? in frontend? both)?
- [ ] What **conditions** change the UI (feature flags, user role, config)?
- [ ] What are the **known regressions** or problem areas?
- [ ] Who are the **users** and what **permissions** differ between roles?

---

## Step 2: Create the Master Document

**Goal**: Produce a single comprehensive document that captures everything needed to define tests.

### Location

```
.context/PBI/{module-name}/{module-name}-ui-test-plan.md
```

### Structure

```markdown
# {Module Name} - UI/Data Test Plan

## 1. Executive Summary
   - Why this module matters
   - Key risks (data integrity vs UI behavior)
   - Stakeholder priorities (from meetings/tickets)

## 2. Module Overview
   - What it is, how it connects to other modules
   - Users and permissions (who sees what)

## 3. Page Architecture
   - Visual states (wireframes/diagrams)
   - Layout of panels and components
   - Conditional rendering rules
   - Status flows (if applicable)

## 4. Data Flow & API Endpoints
   - All API calls the page makes
   - Calculation logic (commission, caps, reductions, etc.)
   - Data refresh triggers (what resets when filters change)

## 5. Test Scenarios (Gherkin)
   - Organized by test suite / functional area
   - Each scenario with Preconditions -> Action -> Expected Output

## 6. Implementation Roadmap
   - Phases ordered by priority (P0 -> P2)
   - Dependencies between test suites

## 7. Test Data Strategy

   > Reference: `.context/guidelines/TAE/test-data-management.md`

   For each test ticket, determine the data pattern (priority order):

   | Priority | Pattern | Description | Feasibility Check |
   |----------|---------|-------------|-------------------|
   | **1. Discover** | Query system for existing data in required state | Zero DB impact, uses real data (preferred) | Can we query DB/API for entities matching preconditions? |
   | **2. Modify** | Find existing data and alter via API | When data exists but in wrong state | Does the API support the mutation needed? |
   | **3. Generate** | Create data from scratch via API | Last resort — when no usable data exists | Does a POST/PUT endpoint exist for this entity? |
   | **Blocker** | None feasible | Flag test as not automatable | Document reason and escalate |

   ### Preliminary Feasibility per Ticket

   {For each test ticket produced in Step 3, note:}

   | Ticket | Precondition | Pattern | Feasibility | Notes |
   |--------|-------------|---------|-------------|-------|
   | {PREFIX}-T01 | {what state is needed} | {Discover/Modify/Generate} | {Feasible / Risky / Blocker} | {API endpoint or DB query} |

   ### Data Discovery Queries

   {SQL queries or API calls to find suitable test data in the environment}

## 8. Key Selectors Reference
   - CSS selectors or accessibility identifiers for Playwright
```

### Tips

- Write this document as if the reader has ZERO context about the module
- Include the calculation formulas explicitly (don't assume the reader will look at code)
- Note the stakeholder's exact words when they describe priorities or pain points
- Diagrams > paragraphs (use ASCII art for layouts)

---

## Step 3: Break Into Test Tickets

**Goal**: Split the master document into individual, trackable tickets.

### Location

```
.context/PBI/{module-name}/test-specs/
+-- ROADMAP.md
+-- PROGRESS.md
+-- SESSION-PROMPT.md
+-- {PREFIX}-T01-{name}/
|   +-- spec.md
+-- {PREFIX}-T02-{name}/
|   +-- spec.md
+-- ...
```

Each ticket is a **directory** (not a flat file) so that the implementation plan and ATC specs can be co-located alongside the business spec later.

### Grouping Strategy

Group test cases into tickets by **functional area**, not by page section:

| Good Grouping (functional) | Bad Grouping (structural) |
|---------------------------|--------------------------|
| "Data Refresh on Filter Change" | "Left Panel Tests" |
| "Invoice Cap Application" | "API Response Tests" |
| "Admin vs Customer View" | "CSS Selector Tests" |

### Ticket Template

Each ticket file follows this structure:

```markdown
# {PREFIX}-T{NN}: {Title}

| Field | Value |
|-------|-------|
| **Priority** | P0 / P1 / P2 |
| **Phase** | {phase number and name} |
| **Items** | {N} TCs + {M} Test Scenarios |
| **Dependencies** | {other ticket IDs} |
| **Requires** | {test data or accounts needed} |

## Summary
What and why. Business context.

## Preconditions
What data/state is needed.

## Test Cases
{TC definitions - see Step 4}

## Test Scenarios (if any)
{TS definitions for multi-step flows}

## Acceptance Criteria
Checklist for considering this ticket done.
```

### How Many Tickets?

- **Target**: 3-7 TCs per ticket (enough to be meaningful, small enough to be one PR)
- **Exceptions**: Edge cases can be consolidated into one larger ticket
- **Rule**: If a ticket has 10+ TCs, it's probably too broad — split it

---

## Step 3.5: Check for Existing TCs

**Goal**: Before defining new TCs, verify what already exists to avoid duplication.

> **Reference**: See `guidelines/QA/test-spec-standards.md` for the full TC discovery and update workflow.

### What to Check

1. **Existing test specs**: Search `.context/PBI/{module-name}/test-specs/` for prior specifications
2. **Existing test code**: Search `tests/e2e/` and `tests/integration/` for implemented tests covering this module
3. **TMS**: Check your test management system for existing TCs linked to this module

### Decision: New TC or Update Existing?

For each behavior you've identified in Step 1-3, ask:

| Question | If YES | If NO |
|----------|--------|-------|
| Does a TC with this exact **precondition + action** already exist? | **Update** the existing TC with new assertions | **Create** a new TC |
| Does an existing TC cover a superset of this behavior? | Don't create — it's already covered | Create a new TC |
| Does an existing TC cover only part of this behavior? | Add the missing assertions to the existing TC | N/A |

### Track Updates

If updating existing TCs, document it:

```markdown
## Updated TCs

| TC ID | What Was Added | Reason |
|-------|----------------|--------|
| ORD-003 | Added assertion for empty state message | New requirement from US-456 |
```

---

## Step 4: Define Test Cases (KATA-Aligned)

**Goal**: Write each TC following KATA principles so it maps directly to automation.

> **TC Identity Rule**: A TC is defined by its **Precondition + Action** combination. All expected outputs from the same precondition + action belong to the SAME TC as assertions. Different precondition OR different action = different TC.
>
> **Reference**: See `guidelines/TAE/test-design-principles.md` Section 1 for the full definition, and `guidelines/QA/test-spec-standards.md` for TC discovery scopes.

### TC Naming Convention

```
### {ID}: Validate {CORE} when {CONDITIONAL}
```

| Component | Description | Example |
|-----------|-------------|---------|
| `{ID}` | Unique identifier `{PREFIX}-{NNN}` | `ORD-001` |
| `{CORE}` | Main behavior being validated | `empty state`, `cap discount` |
| `{CONDITIONAL}` | Specific condition that triggers this behavior | `when user has no orders` |

### TC Structure

Each TC must have three clear parts:

```markdown
### {ID}: Validate {CORE} when {CONDITIONAL}

**Preconditions**: {What state the system needs to be in}
**Action**: {What the user DOES — the trigger}
**Expected Output**:
- {Assertion 1}
- {Assertion 2}
- {What should NOT be visible}
```

Followed by the Gherkin:

```gherkin
Scenario: {ID} - Validate {CORE} when {CONDITIONAL}
  Given {precondition about data/system state}
  When the user {ACTIVE ACTION they perform}
  Then {expected output}
  And {additional assertion}
```

### Rules

| Rule | Description |
|------|-------------|
| **Action-first** | The `When` must describe what the user DOES, not what the system does passively |
| **TC Identity Rule** | Same precondition + same action = same TC. ALL expected outputs are assertions of that TC. Different precondition OR different action = different TC |
| **TC vs TS** | If it has ONE action -> TC. If it chains multiple actions -> Test Scenario |
| **No hardcoded data** | Use variables `{order_id}`, `{month}` — never specific values in Gherkin |
| **Validate, not Verify** | Use "Validate" consistently in TC names (naming convention) |

### When to Create a Test Scenario Instead

Flag as Test Scenario (TS) when:
- It chains 2+ user actions with intermediate verifications
- It requires cross-page navigation (page A -> page B comparison)
- It requires simulating errors (API failures, network issues)
- It involves browser navigation (back/forward button)

```markdown
### {ID}: TEST SCENARIO — {description}

**Type**: Test Scenario (chains multiple actions)
**Reuses**: {TC IDs that it composes}
```

---

## Step 5: Apply Equivalent Partitioning & Merge/Split

**Goal**: Reduce redundancy and ensure each TC has unique value.

### Merge Checklist

Review all TCs and merge when:

- [ ] Two TCs share the **same precondition AND same action** — merge into one TC (all outputs become assertions of the merged TC)
- [ ] A TC is just an **additional assertion** of another TC's action (e.g., URL check after filter change) -> absorb into the parent TC
- [ ] A trivial check (e.g., title text) can be added as one more assertion to a richer TC -> absorb

### Split Checklist

Split when:

- [ ] One TC tests **two fundamentally different outputs** from different preconditions or actions -> split into separate TCs
- [ ] One TC covers both **positive and negative** cases -> split by outcome

### Document Merges

Track all merges in a "Merged TCs" section and in the roadmap's changelog:

```markdown
## Merged TCs

| Removed ID | Merged Into | Reason |
|-----------|-------------|--------|
| ORD-006 | ORD-005 | Same precondition + action — URL check is an assertion within filter change |
```

---

## Step 6: Create Infrastructure Files

### ROADMAP.md

The index file with:
- Visual overview of all phases
- Ticket index table (ID, title, priority, phase, TC/TS counts, dependencies)
- Phase summary with totals
- Dependency graph (ASCII)
- Progress tracker (checkboxes)

### PROGRESS.md

The session-persistent tracking file with:
- Current status (which ticket, how many done)
- Ticket progress table (status per ticket)
- Test data discovered (entities, IDs, states found during implementation)
- Shared components created (page objects, fixtures)
- Decisions & learnings log
- Session log (date, what was done)

### SESSION-PROMPT.md

The reusable prompt for the Test-Automation Agent with:
- Step 1: Read PROGRESS.md first
- Step 2: Load context (CLAUDE.md, roadmap, current ticket, master document)
- Step 3: Work on the ticket (implement tests)
- Step 4: Update PROGRESS.md before closing session

---

## Step 7: Validate & Handoff

### Self-Review Checklist

Before considering the work done:

- [ ] Every TC has a clear **Precondition -> Action -> Expected Output**
- [ ] Every TC name follows `Validate <CORE> when <CONDITIONAL>`
- [ ] Every Gherkin `When` describes a **user action**, not a system event
- [ ] Multi-step flows are flagged as **Test Scenarios**, not TCs
- [ ] Equivalent partitioning applied (no redundant TCs)
- [ ] Step 3.5 completed (checked for existing TCs, no duplicates)
- [ ] Roadmap has accurate counts and dependencies
- [ ] PROGRESS.md is initialized and ready for the Test-Automation Agent
- [ ] SESSION-PROMPT.md has complete instructions for the Test-Automation Agent
- [ ] Master document has all context the Test-Automation Agent might need (calculations, selectors, API endpoints)

### Handoff to Test-Automation Agent

The user copies the prompt from `SESSION-PROMPT.md` into a new Claude Code session inside the test automation repo. The Test-Automation Agent:

1. Reads PROGRESS.md -> knows what to work on
2. Reads the ticket's `spec.md` -> knows the TCs to implement
3. Reads the master document -> has all technical context
4. Implements tests following KATA guidelines
5. Updates PROGRESS.md -> next session picks up where this left off

---

## Directory Structure Reference

```
.context/PBI/{module-name}/
+-- {module-name}-test-plan.md          <- Master document (Step 2)
+-- test-specs/                          <- Unified test specifications (Steps 3-6)
|   +-- ROADMAP.md                       <- Index, phases, dependencies
|   +-- PROGRESS.md                      <- Session-persistent tracking
|   +-- SESSION-PROMPT.md                <- Reusable prompt for Test-Automation Agent
|   +-- {PREFIX}-T01-{name}/             <- Ticket 1 (directory)
|   |   +-- spec.md                      <- Business spec: TCs in Gherkin
|   |   +-- implementation-plan.md       <- Technical plan (added by Test-Automation Agent)
|   |   +-- atc/                         <- ATC specs (added for complex ATCs)
|   |       +-- {TICKET-ID}-{name}.md
|   +-- {PREFIX}-T02-{name}/             <- Ticket 2
|       +-- spec.md
+-- TK-{number}-{title}/                <- Per-ticket PBI folders (manual testing)
    +-- context.md
```

**Naming conventions**:
- `{module-name}`: kebab-case (e.g., `orders-dashboard`, `user-management`, `billing`)
- `{PREFIX}`: 2-3 letter module abbreviation (e.g., `ORD` for Orders, `USR` for Users)
- `{NNN}`: Sequential TC number, zero-padded (e.g., `001`, `002`)

**Real example**: See `.context/PBI/auth/` for a complete, working example of this structure.

---

## Quick Reference: Process Timeline

```
Session 1 with Test-Manager Agent (this workflow)
--------------------------------------------------
[30 min] Step 1: Gather context (parallel subagents)
[20 min] Step 2: Create master document
[30 min] Step 3: Break into test tickets
[10 min] Step 3.5: Check for existing TCs
[20 min] Step 4: Define TCs with Gherkin
[10 min] Step 5: Apply EP merges/splits
[10 min] Step 6: Create infrastructure files
[10 min] Step 7: Validate & prepare handoff
--------------------------------------------------
Total: ~2.5 hours for a medium-complexity module

Session N with Test-Automation Agent
-------------------------------------
[per ticket] Read spec.md -> implement tests -> update progress
```

---

## See Also

- `guidelines/QA/atc-definition-strategy.md` — How to define and name ATCs
- `guidelines/QA/test-spec-standards.md` — TC discovery scopes, New vs Update TC workflow
- `guidelines/TAE/kata-ai-index.md` — KATA architecture for Test-Automation Agent
- `guidelines/TAE/test-design-principles.md` — TC Identity Rule, assertion rules
- `guidelines/TAE/automation-standards.md` — Implementation standards for Test-Automation Agent
