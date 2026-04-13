# Plan Test Implementation

> **Phase**: 1 of 3 (Plan → Coding → Review)
> Generate a test-implementation-plan for an E2E or Integration test ticket.
> This document is the SINGLE SOURCE OF TRUTH for implementing a test.
> It must be created BEFORE writing any test code.

---

## Purpose

Create a structured implementation plan that documents everything needed to automate a test ticket. The plan covers: what to test, what code to create/modify, what ATCs exist vs need creation, test data strategy, and implementation order.

**This prompt is executed WHEN:**

- A new E2E or Integration test ticket needs to be automated
- The user says "plan the implementation for {TICKET-ID}" (e.g., UPEX-101, MYM-456)
- Before writing any test code for a ticket

> **Note on Ticket IDs:** The `{TICKET-ID}` placeholder represents your Jira project key + issue number. The prefix depends on your Jira project (e.g., `UPEX-101`, `MYM-456`, `QA-33`). There is no hardcoded prefix — always use whatever project key your Jira instance uses.

---

## PREREQUISITE

> **Before executing any Xray commands**, load the Xray CLI Skill:
> `Use skill: xray-cli`

Verify authentication:
```
[TMS_TOOL] Authenticate
```
> Resolved via [TMS_TOOL] — see Tool Resolution in CLAUDE.md

---

## INPUT REQUIRED

**Ticket ID:** `{TICKET-ID}` (e.g., `UPEX-101`)

**Test type (if not obvious):** `integration` or `e2e`

---

## WORKFLOW

### Step 1: Fetch Ticket from Jira/Xray

Fetch the Jira issue details:
```
[ISSUE_TRACKER_TOOL] Get Issue:
  - issue: {TICKET-ID}
```
> Resolved via [ISSUE_TRACKER_TOOL] — see Tool Resolution in CLAUDE.md

Extract and note:
- **Summary**: Full ticket title (for `{brief-title}` generation)
- **Project Key**: Jira project key (e.g., UPEX, MYM)
- **Acceptance Criteria**: What to test (from Description or AC field)
- **Dependencies**: Linked issues
- **Sprint**: Current sprint
- **Labels/Components**: Module classification

Also check for linked test issues:
```
[TMS_TOOL] List Tests:
  - filter: linked to {TICKET-ID}

[ISSUE_TRACKER_TOOL] Search Issues:
  - query: issues linked to {TICKET-ID} of type Test
```
> Resolved via [TMS_TOOL] and [ISSUE_TRACKER_TOOL] — see Tool Resolution in CLAUDE.md

---

### Step 2: Load Required Reading (IN THIS ORDER)

**Architecture & Patterns (HOW to write code):**

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `.context/guidelines/TAE/test-design-principles.md` | Source of truth: ATCs vs helpers, flow-based tests, naming |
| REQUIRED | `.context/guidelines/TAE/automation-standards.md` | ATC rules, naming conventions, anti-patterns |
| REQUIRED | `tests/components/TestContext.ts` | Layer 1 — Config, Faker, shared context |
| REQUIRED | `tests/data/types.ts` | Existing type aliases, OpenAPI patterns |
| REQUIRED | `tests/data/DataFactory.ts` | Data generation pattern, factory methods |
| REQUIRED | `tests/data/constants.ts` | Existing constants |

**Conditional — Integration (API) tests:**

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `tests/components/api/ApiBase.ts` | Layer 2 — HTTP methods, tuple returns, auth token |
| REQUIRED | `tests/components/api/AuthApi.ts` | Layer 3 reference — ATC pattern with `@atc`, types |
| REQUIRED | `tests/components/ApiFixture.ts` | Layer 4 — DI pattern, component registration |
| REQUIRED | `api/openapi-types.ts` | Search for relevant type schemas |

**Conditional — E2E (UI) tests:**

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `tests/components/ui/UiBase.ts` | Layer 2 — Playwright helpers, locator patterns |
| REQUIRED | `tests/components/UiFixture.ts` | Layer 4 — UI DI pattern, component registration |
| REQUIRED | `tests/components/api/ApiBase.ts` | Layer 2 — needed for API preconditions |
| REQUIRED | `tests/components/ApiFixture.ts` | Layer 4 — needed for API preconditions |
| HELPFUL  | Any existing `*Page.ts` in `tests/components/ui/` | Layer 3 reference — UI ATC pattern |

**Business Context (WHAT to test):**

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `.context/e2e-critical-flows.md` | Business flows and rules |
| REQUIRED | `.context/api-architecture.md` | Endpoint details, request/response shapes |
| HELPFUL  | `.context/business-data-map.md` | System flows, data relationships |

---

### Step 3: Analyze Existing Components

**Inventory what already exists:**

1. **Read the relevant fixture file(s)**:
   - Integration: `tests/components/ApiFixture.ts` — see all registered API components
   - E2E: `tests/components/TestFixture.ts` — see all registered components (API + UI)
2. **Read each relevant component** to catalog:
   - Existing helpers (read-only methods, no `@atc`)
   - Existing ATCs (methods with `@atc` decorator)
3. **Search for `@atc` decorators** across the codebase to find all existing ATC IDs:
   ```
   Search pattern: @atc\('
   ```
4. **Read existing test files** in the relevant directory:
   - Integration: `tests/integration/`
   - E2E: `tests/e2e/`

**Determine what is needed:**
- Which component(s) this ticket needs (existing or new?)
- Which helpers already exist vs need creation
- Which ATCs already exist vs need creation
- What new types are needed in `types.ts`
- What new factory methods are needed in `DataFactory.ts`
- What new constants are needed in `constants.ts`

**Conditional — E2E only:**
- What pages/views need UI components
- What locator strategies to use (data-testid preferred, CSS fallback)
- Whether `[AUTOMATION_TOOL]` should be used for locator discovery
- What precondition APIs are needed (setup data via API before UI verification)

---

### Step 4: Data Strategy & Feasibility Check

> **Required reading**: `.context/guidelines/TAE/test-data-management.md` — Section 1 (Philosophy) and Section 4 (Data Patterns)

**For each test precondition, determine the data pattern (in priority order):**

| Priority | Pattern | Check | Tool |
|----------|---------|-------|------|
| **1. Discover** | Does data already exist in the required state? | Query DB/API for matching entities | `[DB_TOOL]` or `[API_TOOL]` |
| **2. Modify** | Can existing data be altered to match preconditions? | Check available mutation endpoints | `[API_TOOL]` |
| **3. Generate** | Can the data be created from scratch via API? | Check available POST/PUT endpoints | `[API_TOOL]` or OpenAPI spec |
| **Blocker** | None of the above is feasible | Flag test as NOT automatable | Document reason |

**For each precondition, document:**
1. Which pattern will be used (Discover / Modify / Generate)
2. The specific API endpoint or DB query that obtains the data
3. How the data is passed to the test (beforeAll, beforeEach, test setup)
4. Cleanup/teardown needed (for Modify or Generate patterns)

**Important**: Never hardcode specific entity names, IDs, or dates in test files. Data must be obtained dynamically at runtime. If using Pattern 1 (Discover), the discovery query runs in `beforeAll` and the test skips gracefully if no matching data is found.

**Precondition validation**: When using Pattern 1 (Discover) or Pattern 2 (Modify) in `beforeAll`, apply the `test.skip()` guard pattern — never use `expect` in `beforeAll` for precondition data. Each test validates its own precondition with `test.skip()` so unrelated tests are not blocked. See `test-data-management.md` Section 5.3 for the full pattern.

**Conditional — E2E only:**
- Identify which data must be created via API before UI interaction
- Plan authentication state (storage state vs login flow)
- Document any UI-specific test data requirements (display values, formatted strings)

---

### Step 5: Determine Test Scenarios

Based on the ticket's Acceptance Criteria, identify:

1. **Test file name**: `{verb}{Feature}.test.ts` (camelCase with action verb)
2. **Test scenarios**: Each `test()` block = one fundamentally different scenario
3. **Fixture selection**:

| Test Type | Fixture | Browser? | Use When |
|-----------|---------|----------|----------|
| API only | `{ api }` | No (lazy) | Pure API/Integration testing |
| UI only | `{ ui }` | Yes | UI-focused testing |
| Hybrid | `{ test }` | Yes | API setup + UI verification |

4. **For each scenario**:
   - Test name: `{TICKET-ID}: should [behavior] when [condition]`
   - Which ATCs it calls (existing or new)
   - What preconditions it needs (Steps module or inline setup)
   - What test-level assertions it makes
   - Whether teardown is needed

**Apply test-design-principles.md rules:**
- Tests validate FLOWS, not individual properties
- Separate tests only when the SCENARIO is fundamentally different
- ATCs handle FIXED assertions; test files handle VARIABLE assertions
- ATCs are actions (POST/PUT/DELETE + verification), NOT simple GETs
- Use Steps module for reusable ATC chains (preconditions)

---

### Step 6: Generate the Document

Create the plan **inside the ticket's test-specs directory**:

```
.context/PBI/{module-name}/test-specs/{PREFIX}-T{NN}-{name}/implementation-plan.md
```

Where `{module-name}` is the module being tested, and `{PREFIX}-T{NN}-{name}` is the ticket directory from the module's test-specs.

---

## OUTPUT TEMPLATE

Use the template below. Sections marked with `[E2E ONLY]` or `[INTEGRATION ONLY]` should be included/excluded based on the test type.

````markdown
# Test Implementation Plan: {TICKET-ID}

> **Ticket**: [{TICKET-ID}: {Ticket Title}]({{JIRA_URL}}/browse/{TICKET-ID})
> **Type**: `integration` | `e2e`
> **Sprint**: {Sprint Name}
> **Created**: {date}

---

## 1. Ticket Summary

**What to test:**
{Brief description of the feature/behavior being tested}

**Acceptance Criteria:**
1. {AC from Jira ticket}
2. {AC from Jira ticket}
3. {AC from Jira ticket}

**Dependencies:**
- {TICKET-ID} — {description} (status: {status})

---

## 2. Architecture Decisions

### Component Strategy

| Decision | Value | Rationale |
|----------|-------|-----------|
| **Component** | `{Resource}Api.ts` or `{Page}Page.ts` | {New or existing?} |
| **Fixture** | `{ api }` / `{ ui }` / `{ test }` | {Why this fixture?} |
| **Test file** | `tests/{type}/{module}/{verbFeature}.test.ts` | {Naming rationale} |
| **Preconditions** | Steps module / inline | {What setup is needed?} |

<!-- [E2E ONLY] -->
### UI Elements

| Element | Locator Strategy | Locator Value |
|---------|------------------|---------------|
| {element name} | `data-testid` | `{testid-value}` |
| {element name} | `getByRole` | `{role, name}` |
| {element name} | `getByText` | `{text value}` |

**Locator Discovery Method:**
- [ ] `[AUTOMATION_TOOL]` screenshot + inspection
- [ ] Source code `data-testid` attributes
- [ ] DevTools manual inspection
<!-- [END E2E ONLY] -->

<!-- [INTEGRATION ONLY] -->
### API Details

| Aspect | Value |
|--------|-------|
| **Endpoint(s)** | `{METHOD} /api/v1/{resource}` |
| **OpenAPI Type(s)** | `{TypeName}` from `api/openapi-types.ts` |
| **Auth Required** | Yes / No |
| **Return Pattern** | Tuple: `[status, body]` |

**Request/Response Shapes:**
```typescript
// Request body (from OpenAPI types)
interface {RequestType} {
  field: type;
}

// Response body (from OpenAPI types)
interface {ResponseType} {
  field: type;
}
```
<!-- [END INTEGRATION ONLY] -->

---

## 3. ATC Registry

### Existing ATCs (Reuse)

| ATC ID | Component | Method | Description |
|--------|-----------|--------|-------------|
| `{EXISTING-ATC-ID}` | `{Component}` | `methodName()` | {What it does} |

### New ATCs (Create)

| ATC ID | Component | Method | Description |
|--------|-----------|--------|-------------|
| `{TICKET-ID}` | `{Component}` | `{verb}Successfully()` | {What it does} |

> **ATC ID Convention:** Use the Jira issue key from the ticket that originates the test case. The `@atc` decorator receives this ID: `@atc('{TICKET-ID}')`. If multiple ATCs come from the same ticket, append a suffix: `@atc('{TICKET-ID}-01')`, `@atc('{TICKET-ID}-02')`.

### New Helpers (No `@atc`)

| Component | Method | Returns | Description |
|-----------|--------|---------|-------------|
| `{Component}` | `get{Resource}()` | `{Type}` | {Read-only operation} |

---

## 4. Test Data Strategy

### Required Data

| Data | Source | Lifecycle |
|------|--------|-----------|
| {data item} | DataFactory / constants / API setup | Per-test / shared |

### DataFactory Additions

```typescript
// New method needed in DataFactory.ts
generate{Resource}Data(): {Type} {
  return {
    field: this.faker.{method}(),
  };
}
```

### Constants Additions

```typescript
// New constants needed in constants.ts
export const TEST_{RESOURCE} = {
  id: '{value}',
};
```

---

## 5. Test Scenarios

### File: `tests/{type}/{module}/{verbFeature}.test.ts`

**Fixture:** `{ api }` | `{ ui }` | `{ test }`

#### Scenario 1: {Primary happy path}
```
Test: "{TICKET-ID}: should {behavior} when {condition}"
Preconditions: {what setup is needed}
ATCs called: [{Component}.{method}()]
Test-level assertions: [{what to assert after ATC}]
Teardown: {cleanup needed? yes/no}
```

#### Scenario 2: {Alternative path or edge case}
```
Test: "{TICKET-ID}: should {behavior} when {condition}"
Preconditions: {what setup is needed}
ATCs called: [{Component}.{method}()]
Test-level assertions: [{what to assert after ATC}]
Teardown: {cleanup needed? yes/no}
```

<!-- [E2E ONLY] -->
### Navigation & Precondition Flow

```
1. API: Create test data via {Component}Api
2. Navigate: page.goto('{url}')
3. Interact: {describe UI interaction flow}
4. Assert: {describe expected UI state}
5. Teardown: {cleanup via API if needed}
```
<!-- [END E2E ONLY] -->

---

## 6. Implementation Order

> Execute in this order. Each step should be a commit.

- [ ] **Step 1**: Add types to `tests/data/types.ts` (if needed)
- [ ] **Step 2**: Add factory methods to `tests/data/DataFactory.ts` (if needed)
- [ ] **Step 3**: Add constants to `tests/data/constants.ts` (if needed)
- [ ] **Step 4**: Create/update Layer 3 component (`{Component}.ts`)
  - [ ] Add helpers (read-only methods)
  - [ ] Add ATCs (with `@atc` decorator)
- [ ] **Step 5**: Register component in fixture (`ApiFixture.ts` / `UiFixture.ts` / `TestFixture.ts`)
- [ ] **Step 6**: Create test file (`{verbFeature}.test.ts`)
- [ ] **Step 7**: Run tests and validate
- [ ] **Step 8**: Update Xray test status to "Automated"

```
[TMS_TOOL] Update Test:
  - test: {TICKET-ID}
  - status: Automated
```
> See /xray-cli skill for current CLI syntax.

---

## 7. Success Criteria

- [ ] All acceptance criteria from Jira ticket are covered
- [ ] ATCs follow KATA architecture (Layer 3, `@atc` decorator, fixed assertions)
- [ ] Test file uses correct fixture (`{ api }` / `{ ui }` / `{ test }`)
- [ ] No hardcoded waits — uses proper Playwright conditions
- [ ] Import aliases used (`@components/`, `@utils/`, `@schemas/`)
- [ ] Tests pass locally (`bun run test` or `bun run test:e2e`)
- [ ] Xray test marked as "Automated"

---

## Next Step

Proceed to Phase 2 (Coding) with the appropriate prompt:

- **E2E tests**: `.prompts/stage-5-automation/coding/e2e-test-coding.md`
- **Integration tests**: `.prompts/stage-5-automation/coding/integration-test-coding.md`

Pass this plan as input to the coding prompt.
````

---

## EXECUTION CHECKLIST

Before generating the plan, verify:

- [ ] Ticket fetched from Jira (via `[ISSUE_TRACKER_TOOL]` or `[TMS_TOOL]`)
- [ ] All REQUIRED files from Step 2 loaded and read
- [ ] Existing components inventoried (Step 3)
- [ ] `@atc` decorator search completed — no ID collisions
- [ ] Data strategy defined (Step 4)
- [ ] Test scenarios follow `test-design-principles.md` rules
- [ ] Plan saved to `.context/PBI/{module}/test-specs/{PREFIX}-T{NN}-{name}/implementation-plan.md`

---

## REFERENCE

**Real example (auth module):**
- Implementation plan: `.context/PBI/auth/test-specs/AUTH-T01-user-session-validation/implementation-plan.md`
- ATC spec (API): `.context/PBI/auth/test-specs/AUTH-T01-user-session-validation/atc/UPEX-101-authenticate-successfully.md`
- ATC spec (UI): `.context/PBI/auth/test-specs/AUTH-T01-user-session-validation/atc/UPEX-105-login-successfully.md`

Read these files to understand the quality bar and level of detail expected.

---

## ANTI-PATTERNS (Do NOT do these)

| Anti-Pattern | Correct Approach |
|--------------|------------------|
| Writing test code without a plan | Always create plan first |
| Creating ATCs for simple GET requests | GETs are helpers, not ATCs |
| One ATC per API field assertion | One ATC per flow/behavior |
| Hardcoding test data in test files | Use DataFactory or constants |
| Skipping fixture file registration | Always register new components |
| Using relative imports | Always use aliases (`@components/`, etc.) |
| Creating an ATC that calls another ATC | ATCs are atomic; use Steps for chains |
| Planning without reading existing code | Always inventory existing components first |
| Using a UI fixture for API-only tests | Use `{ api }` — no browser overhead |
| Hardcoding a ticket ID prefix convention | Use whatever Jira project key applies |
