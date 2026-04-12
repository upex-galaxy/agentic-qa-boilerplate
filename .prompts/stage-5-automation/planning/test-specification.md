# Test Specification

> Investigate a single ticket, bug, or coverage gap and produce an automation-ready `spec.md`.
> This is the **micro/medium-level** specification prompt — it creates one spec for one item.
> It complements `module-test-specification.md` (macro), which produces N specs for an entire module.

---

## Purpose

Generate a single `spec.md` file containing 1–7 TCs for a specific ticket, bug fix, or coverage gap. The spec follows the same quality standards and format as module-produced specs but with a lighter investigation scope focused on one feature area.

**This prompt is executed WHEN:**

- A User Story from the backlog needs a test spec (story-driven: 1–7 TCs)
- A bug fix needs regression coverage (bug-driven: 1–3 TCs)
- A coverage gap or edge case was identified during testing or code review (gap-driven: 1–2 TCs)
- The user says "create a spec for TK-XXX" or "spec this bug" or "add coverage for this edge case"
- A module already has `test-specs/` and needs an additional ticket added incrementally

**This prompt is NOT for:**

- Planning an entire module from scratch → use `module-test-specification.md` (macro)
- Planning the code implementation of an existing spec → use `test-implementation-plan.md`
- Specifying a single ATC method → use `atc-implementation-plan.md` (micro)
- Implementing tests → use `coding/e2e-test-coding.md` or `coding/integration-test-coding.md`

---

## Relationship to Other Planning Prompts

```
module-test-specification.md            <- Macro: entire module -> N specs
    |
test-specification.md (this)            <- Micro/Medium: 1 ticket/bug/gap -> 1 spec
    |
    v consumed by
test-implementation-plan.md             <- Medium: 1 spec -> 1 test file plan
    |
    v may detail individual ATCs via
atc-implementation-plan.md              <- Micro: 1 ATC -> 1 method spec
```

| Prompt | Scope | Input | Output |
|--------|-------|-------|--------|
| **module-test-specification** | 1 module (N specs) | Module name, stakeholder input | `test-specs/` directory with N spec dirs + ROADMAP + PROGRESS |
| **test-specification (this)** | 1 ticket/bug/gap (1 spec) | TMS ticket ID, bug description, or gap description | 1 spec dir with `spec.md` + PROGRESS update |
| **test-implementation-plan** | 1 spec (N ATCs) | spec.md from above | `implementation-plan.md` for coding phase |
| **atc-implementation-plan** | 1 ATC (1 method) | TC from a spec or TMS | ATC method specification |

---

## Scopes Served

This prompt adapts to three scopes. The scope determines the expected TC count and investigation depth.

| Scope | Trigger | Expected TCs | Investigation Depth |
|-------|---------|--------------|--------------------|
| **Story-driven** | A User Story (TK-XXX) from the backlog with Acceptance Criteria | 1–7 TCs | Read ACs, explore code for the feature area, check API endpoints |
| **Bug-driven** | A bug fix that needs regression coverage | 1–3 TCs | Understand the bug, identify the fix, write TCs that prevent recurrence |
| **Gap-driven** | A coverage gap or edge case found during testing/review | 1–2 TCs | Narrow: understand the specific behavior and write targeted TCs |

---

## INPUT REQUIRED

**One of the following:**

1. **TMS ticket ID** — e.g., `TK-633` (story-driven scope)
2. **Bug description** — What broke, how it was fixed, what regression test is needed (bug-driven scope)
3. **Gap description** — What behavior is uncovered and why it matters (gap-driven scope)

**Also needed:**

- **Module name** — e.g., "Orders Dashboard", "User Management", "Billing" (determines output directory)
- If not obvious, the user should specify: the module's **PREFIX** (e.g., `OD`, `UM`, `BL`) and the next available **ticket number** (e.g., `T14`)

**Also helpful (but AI can investigate if not provided):**

- Related existing specs in the module
- Known regressions or priority context
- Specific API endpoints or UI areas involved

---

## Prerequisites

Before starting, confirm you have access to:

1. **Existing test specs**: `.context/PBI/{module-name}/test-specs/` for prior specifications and PROGRESS.md
2. **QA guidelines**: `.context/guidelines/QA/atc-definition-strategy.md` for TC naming conventions
3. **Design principles**: `.context/guidelines/TAE/test-design-principles.md` for the TC Identity Rule
4. **Target frontend code** (if E2E): UI components and state for the module under test
5. **Target backend code** (if API): controllers, services, and business rules for the module under test

---

## WORKFLOW

### Step 1: Determine Scope and Gather Context

**Goal**: Understand WHAT to spec and gather enough context to define TCs.

#### 1a. Determine the scope

| If the input is... | Scope | Do this |
|--------------------|-------|---------|
| A TMS ticket ID | **Story-driven** | Fetch the ticket from Jira/Xray (MCP Atlassian + `bun xray`), extract ACs and context |
| A bug description | **Bug-driven** | Understand the root cause, identify the regression risk |
| A gap/edge case description | **Gap-driven** | Understand the uncovered behavior, assess risk |

**For story-driven (TMS ticket):**

Use the MCP Atlassian integration (or `bun xray test list`) to fetch the ticket. Extract:

- **Title**: Full ticket title
- **Module / Component**: Used for directory placement
- **Acceptance Criteria**: What to test
- **Dependencies**: Related tickets
- **Description**: Business context

#### 1b. Query TMS for existing TCs (TMS-first principle)

**TMS is the source of truth for TCs.** Before defining anything locally, check whether TCs already exist in your test management system for this ticket. Stage 4 (`test-documentation.md`) may have already created them.

```bash
# Xray example — list tests linked to a ticket
bun xray test list --project PROJ --jql "issue in linkedIssues('TK-XXX')"
```

**Decision tree:**

| Situation | Action |
|-----------|--------|
| TCs already exist in TMS | **Consume them as the base for spec.md.** Do NOT duplicate. Map each TMS TC (name, precondition, spec/Gherkin, AC link) into the spec.md format, keeping the TMS-generated IDs (e.g., `TC-47`, `PROJ-123`). Any gaps found during investigation become NEW TCs added to TMS before being added to spec.md. |
| No TCs exist in TMS (bug/gap scopes, or Stage 4 was skipped) | **Create them in TMS FIRST**, then write spec.md referencing the returned TMS IDs. |
| Some TCs exist, some gaps | Consume existing ones, create new ones in TMS for the gaps, then write spec.md. |

**Creating new TCs in TMS** (when missing):

```bash
# Xray — Gherkin test
bun xray test create --project PROJ --type Cucumber \
  --summary "Should {behavior} when {condition}" \
  --gherkin "Given {precondition}
When {user action}
Then {expected output}"

# Xray — Steps test
bun xray test create --project PROJ --type Manual \
  --summary "Should {behavior} when {condition}" \
  --step "Action | Data | Expected"
```

**Record the TMS-generated TC IDs** returned by each `create` (e.g., `TC-47`, `PROJ-123`). These are the canonical IDs you will use:

- In `spec.md` TC headings (`### TC-47: Should ...`)
- Later, in `@atc('TC-47')` decorators during the Code phase

> **Canonical ID rule**: Local `{PREFIX}-{NNN}` IDs are not used in spec.md content. The local `{PREFIX}-T{NN}-{name}/` folder naming is just for filesystem organization — all TC references inside spec.md use TMS IDs.

#### 1c. Investigate the feature area

Focused investigation (NOT a full module scan like the macro prompt):

| What to investigate | Where to look | What to extract |
|---------------------|---------------|-----------------|
| **Feature behavior** | ACs, ticket description, related docs | What the feature does, user actions, expected outcomes |
| **API endpoints** | `.context/api-architecture.md`, backend controllers, OpenAPI spec | Endpoints called, request/response shapes, business rules |
| **UI behavior** | Frontend state files, route/page components | Page states, conditional rendering, filters |
| **Data model** | Database MCP or code models | Relevant tables, fields, relationships |

**Key questions to answer before defining TCs:**

- [ ] What are the **user actions** that trigger behavior?
- [ ] What **preconditions** create different outcomes?
- [ ] What **data** is involved and what states does it have?
- [ ] What are the **edge cases** or failure modes?

---

### Step 2: Identify the Target Module and Check Existing Specs

**Goal**: Place the spec correctly and avoid duplicating existing TCs.

#### 2a. Determine output location

```
.context/PBI/{module-name}/test-specs/{PREFIX}-T{NN}-{name}/spec.md
```

Where:

- `{module-name}`: kebab-case from the ticket's module/component (e.g., `orders-dashboard`)
- `{PREFIX}`: 2–3 letter module abbreviation (e.g., `OD` for Orders Dashboard, `UM` for User Management)
- `{NN}`: Next available ticket number (check existing `test-specs/` directories)
- `{name}`: kebab-case descriptive name derived from the ticket title (max ~5 words)

#### 2b. Check for existing TCs (duplicate prevention)

> **Reference**: See `module-test-specification.md` for the full TC discovery workflow.

1. **Search existing specs** in `.context/PBI/{module-name}/test-specs/*/spec.md`
2. **Search existing test code** in `tests/e2e/` and `tests/integration/` for tests covering this area
3. **For each behavior identified in Step 1**, ask:

| Question | If YES | If NO |
|----------|--------|-------|
| Does a TC with this exact **precondition + action** already exist? | **Do not create** a duplicate. Update the existing TC if new assertions are needed | **Create** a new TC |
| Does an existing TC cover a superset of this behavior? | Don't create — it's already covered | Create a new TC |
| Does an existing TC cover only part of this behavior? | Add the missing assertions to the existing TC | N/A |

If any existing TCs need updates instead of new TCs, document this in an "Updated TCs" section in the spec.

---

### Step 3: Define Test Cases

**Goal**: Write each TC following the TC Identity Rule and KATA naming conventions.

> **TC Identity Rule**: A TC is defined by its **Precondition + Action** combination. All expected outputs from the same precondition + action belong to the SAME TC as assertions. Different precondition OR different action = different TC.
>
> **References**:
> - `guidelines/TAE/test-design-principles.md` (TC Identity Rule)
> - `guidelines/QA/atc-definition-strategy.md` (How to Define an ATC)

#### 3a. Identify unique Precondition + Action combinations

Start by listing the **user actions** under **different preconditions**. Each unique combination is a potential TC.

```
Feature: {feature name}

Actions identified:
  - {action 1}
  - {action 2}

Preconditions that create different behavior:
  - {precondition A} + {action 1} --> TC: {id}
  - {precondition B} + {action 1} --> TC: {id}
  - {precondition A} + {action 2} --> TC: {id}
```

#### 3b. Apply Equivalence Partitioning

Group inputs that produce the **same behavior** into one TC:

- If two preconditions produce the same outcome for the same action → one parameterized TC
- If a precondition produces a fundamentally different outcome → separate TC

#### 3c. TC naming convention

```
### {TMS_TC_ID}: Should {behavior} when {condition}
```

| Component | Description | Example |
|-----------|-------------|---------|
| `{TMS_TC_ID}` | TMS-generated canonical ID | `TC-47` or `PROJ-123` |
| `{behavior}` | Main behavior the system should exhibit | `display empty state`, `apply discount` |
| `{condition}` | Specific precondition that triggers this behavior | `when cart is empty` |

**Rules:**

- Use the `Should {behavior} when {condition}` format consistently (matches TMS and `atc-definition-strategy.md`)
- TC IDs are TMS-generated — never invent local-only IDs
- The `When` in Gherkin must describe a **user action**, not a system event
- No hardcoded data in Gherkin — use variables `{user_id}`, `{order_id}`
- If it chains 2+ user actions with intermediate verifications → flag as a multi-ATC test, not a single TC

#### 3d. TC IDs from TMS

- TC IDs come from Step 1b (TMS query or creation). Do NOT number them locally.
- If you discovered the need for additional TCs during Step 3 investigation that are NOT yet in TMS, create them in TMS now (using the `bun xray test create` commands from Step 1b) before writing them into spec.md.

#### 3e. Multi-step flows

If a test chains 2+ user actions with intermediate verifications, flag it as a multi-ATC test:

```markdown
### {TMS_TC_ID}: Should {behavior} when {condition}

**Type**: Multi-ATC test — composes {TC-A} + {TC-B} in sequence.
**Calls**: ATC {TC-A} ({description}), then ATC {TC-B} ({description}).
```

---

### Step 4: Generate spec.md

**Goal**: Produce the spec file using the standard template.

Create the directory and file:

```
.context/PBI/{module-name}/test-specs/{PREFIX}-T{NN}-{name}/spec.md
```

Use the output template below. The spec must be self-contained: a reader with zero context about the feature should understand what to test and why.

---

### Next Step: Workflow Status

Once `spec.md` is generated, the TCs remain in their initial state in TMS (e.g., `Candidate` / `Draft`). They will transition to `In Automation` when `test-implementation-plan.md` generates the implementation plan (next phase).

Do NOT transition the status during this prompt. The implementation plan prompt owns that transition.

---

### Step 5: Update PROGRESS.md (if it exists)

**Goal**: Keep the module's progress tracker current.

If `.context/PBI/{module-name}/test-specs/PROGRESS.md` exists:

1. **Determine the correct phase** for this new ticket (match priority and functional area to existing phases)
2. **Add a new row** to the appropriate phase table in the "Ticket Progress" section:

```markdown
| {PREFIX}-T{NN} | {Title} | {N} | `not-started` | -- | 0/{N} | {notes} |
```

3. **Update the "Current Status" section** counts:
   - Increment "Test Files Created" denominator (e.g., `0 / 13` → `0 / 14`)
   - Increment "Tests Automated" denominator (e.g., `0 / 43` → `0 / {43+N}`)

4. **Add a session log entry**:

```markdown
| {date} | Spec creation | {PREFIX}-T{NN} | Added spec for {title}. {N} TCs defined. |
```

If PROGRESS.md does NOT exist, skip this step. The spec is still valid standalone.

---

## OUTPUT TEMPLATE

The generated `spec.md` MUST follow this structure:

````markdown
# {PREFIX}-T{NN}: {Title}

| Field | Value |
|-------|-------|
| **Priority** | P0 / P1 / P2 |
| **Phase** | {phase number and name, or "Standalone" if no module phases exist} |
| **Items** | {N} TCs {+ M multi-ATC tests if any} |
| **Dependencies** | {other ticket IDs, or "None"} |
| **Requires** | {test data, accounts, or environment conditions needed} |
| **Source** | {Story: TK-XXX / Bug: {brief description} / Gap: {brief description}} |

---

## Summary

{What this spec covers and why it matters. Business context. 2–4 sentences.}

---

## Preconditions

{What data/state is needed before running these tests. List the entities, states, and conditions required. Use bullet points.}

---

## Test Cases

### {TMS_TC_ID}: Should {behavior} when {condition}

{Optional consolidation note if absorbing other TCs.}

**Preconditions**: {What state the system needs to be in}
**Action**: {What the user DOES — the trigger}
**Expected Output**:
- {Grouped by concern (e.g., LOADING BEHAVIOR, DATA REFRESH, URL)}
- {Assertion 1}
- {Assertion 2}
- {What should NOT be visible}

```gherkin
Scenario: {TMS_TC_ID} - Should {behavior} when {condition}
  Given {precondition about data/system state}
  When the user {ACTIVE ACTION they perform}
  Then {expected output}
  And {additional assertion}
```

---

{Repeat for each TC, separated by horizontal rules}

---

## Merged TCs (if any)

| Removed ID | Merged Into | Reason |
|-----------|-------------|--------|
| {ID} | {ID} | {Why they share the same precondition + action} |

---

## Updated TCs (if any)

| TC ID | Spec File | What Was Added | Reason |
|-------|-----------|----------------|--------|
| {ID} | {path to existing spec} | {New assertions or changes} | {Why — e.g., new requirement from TK-XXX} |

---

## Acceptance Criteria

- [ ] {N} TCs automated with {pattern description}
- [ ] {Specific validation per TC or group}
- [ ] Tests pass on both local and staging environments
````

**Notes on the template:**

- Omit "Merged TCs" and "Updated TCs" sections if not applicable
- The "Consolidated TCs" section (seen in module-produced specs) is only needed when absorbing TCs from OTHER tickets during a module-wide consolidation. For single-ticket specs, use "Merged TCs" for within-ticket merges only.
- Gherkin blocks should use triple backticks with the `gherkin` language tag
- Priority levels: P0 (critical path, must-have), P1 (high value, should-have), P2 (edge cases, nice-to-have)

---

## VALIDATION CHECKLIST

Before saving the spec, verify:

### TC Quality

- [ ] Every TC has a clear **Precondition → Action → Expected Output**
- [ ] Every TC name follows `Should {behavior} when {condition}`
- [ ] Every Gherkin `When` describes a **user action**, not a system event
- [ ] Multi-step flows are flagged as **multi-ATC tests**, not single TCs
- [ ] No hardcoded data in Gherkin (uses variables like `{user_id}`, `{order_id}`)

### TMS Source of Truth

- [ ] All TCs in spec.md exist in TMS with valid TMS-generated IDs
- [ ] spec.md uses TMS TC IDs — NOT local-only prefixes
- [ ] All TCs in TMS are in the initial workflow state (e.g., `Candidate` / `Draft`)
- [ ] Any gaps discovered during spec investigation were added to TMS FIRST, then to spec.md

### TC Identity Rule

- [ ] No two TCs in this spec share the **same precondition AND same action**
- [ ] If the same precondition + action produces multiple outputs, they are **assertions of one TC**, not separate TCs
- [ ] Equivalence partitioning applied (inputs producing the same behavior are grouped)

### Duplicate Prevention

- [ ] Checked existing specs in the module's `test-specs/` directory
- [ ] Checked existing test code in `tests/e2e/` and `tests/integration/`
- [ ] No TC duplicates an existing TC's precondition + action combination
- [ ] If updating existing TCs, documented in the "Updated TCs" section

### Completeness

- [ ] TC count is appropriate for scope (Story: 1–7, Bug: 1–3, Gap: 1–2)
- [ ] Summary explains "what" and "why" (a reader with zero context can understand)
- [ ] Preconditions section lists all required data/state
- [ ] Acceptance criteria are specific and checkable
- [ ] PROGRESS.md updated (if it exists for this module)

---

## REFERENCE

**Module-level spec prompt (macro equivalent):**
`.prompts/stage-5-automation/planning/module-test-specification.md`

**TC naming conventions:**
`.context/guidelines/QA/atc-definition-strategy.md`

**TC Identity Rule:**
`.context/guidelines/TAE/test-design-principles.md`

---

## See Also

- `module-test-specification.md` — Macro prompt for planning an entire module's test specs
- `test-implementation-plan.md` — Next step: plan the code implementation of this spec
- `atc-implementation-plan.md` — Detail a single ATC method if needed
- `guidelines/QA/atc-definition-strategy.md` — How to define and name ATCs
- `guidelines/TAE/test-design-principles.md` — TC Identity Rule, assertion rules
- `guidelines/TAE/automation-standards.md` — Implementation standards
