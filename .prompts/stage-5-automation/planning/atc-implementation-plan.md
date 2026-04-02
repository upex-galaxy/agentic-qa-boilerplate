# Plan ATC Implementation

> Generate a `{TICKET-ID}-{brief-title}.md` spec document for a single Acceptance Test Case.
> This document defines the ATC's contract BEFORE implementing it in code.
> It can be used standalone or as a companion to a test-implementation-plan.md.

---

## Purpose

Create a structured ATC specification that documents everything needed to implement a single Acceptance Test Case: method signature, assertions split (fixed vs test-level), endpoint/page details, types, and a copy-paste ready code template.

**This prompt is executed WHEN:**

- An ATC needs detailed specification before coding
- The user says "document this ATC" or "plan ATC for {TICKET-ID}"
- A test-implementation-plan.md references an ATC that needs elaboration
- A new ATC is being added to an existing component

---

## PREREQUISITE

> **Before executing any Xray commands**, load the Xray CLI Skill:
> `Use skill: xray-cli`

---

## INPUT REQUIRED

**One of the following:**

1. **Jira/Xray ticket ID** — `{TICKET-ID}` (e.g., `PROJ-123`, `UPEX-456`) to fetch test case details
2. **Manual description** — Endpoint/page, action, expected behavior
3. **ATC Registry entry** — From an existing test-implementation-plan.md

> **Note on ticket IDs**: The prefix comes from your Jira project key (e.g., `PROJ`, `UPEX`, `MYAPP`).
> There is no fixed convention — use whatever project key your team configures in Jira.

**Also needed:**

- Target component (existing or new)
- Module name (for folder placement)
- **ATC type**: API or UI (determines base class, return type, and assertion style)

---

## WORKFLOW

### Step 1: Gather Test Case Information

**If the test case exists in Jira/Xray:**

```bash
bun xray get {TICKET-ID}
```

Extract:
- **Name**: Test case name
- **Acceptance Criteria**: What it validates
- **Precondition**: Required state
- **Specification**: Steps and expected results
- **User Story**: Parent ticket (`{TICKET-ID}`)

**If manual description:** Document the action, endpoint/page, and expected behavior.

---

### Step 2: Load Required Reading

#### Always Required

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `.context/guidelines/TAE/test-design-principles.md` | ATCs vs helpers, naming, flow philosophy |
| REQUIRED | `.context/guidelines/TAE/automation-standards.md` | ATC rules, equivalence partitioning, anti-patterns |

#### Conditional: API ATC

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `tests/components/api/ApiBase.ts` | Tuple return pattern, HTTP methods |
| REQUIRED | `api/openapi-types.ts` | Search for relevant type schemas |
| HELPFUL  | `.context/guidelines/TAE/api-testing-patterns.md` | API-specific ATC patterns |
| HELPFUL  | `.context/api-architecture.md` | Endpoint details, request/response shapes |

#### Conditional: UI ATC

| Priority | File | Why |
|----------|------|-----|
| REQUIRED | `tests/components/ui/UiBase.ts` | Page helpers, interceptResponse pattern |
| REQUIRED | `.context/guidelines/TAE/e2e-testing-patterns.md` | UI-specific ATC patterns |
| HELPFUL  | `.context/guidelines/TAE/data-testid-usage.md` | Locator strategies and conventions |
| HELPFUL  | `.context/guidelines/TAE/playwright-automation-system.md` | Playwright automation patterns |

---

### Step 3: Determine Component Placement

**Questions to answer:**

1. **API ATC**: Which API endpoint does this ATC primarily call?
2. **UI ATC**: Which page/feature does this ATC interact with?
3. Which component OWNS that endpoint/page? (e.g., `BookingsApi` owns `/bookings/*`, `LoginPage` owns the login form)
4. Does the component already exist?
   - YES → Add method to existing component
   - NO → New component needed (also update the corresponding Fixture)

**Read the target component** (if it exists) to catalog:
- Existing helpers (no `@atc`)
- Existing ATCs (with `@atc`)
- Existing types and imports

---

### Step 4: Identify ATC Type

#### API ATCs

| Type | HTTP Method | Has Fixed Assertions | Example |
|------|-------------|---------------------|---------|
| **Mutation** | POST/PUT/PATCH/DELETE | Status + created/updated fields | `createBookingSuccessfully` |
| **Verification** | GET + assertions | Status + business rules | `getBookingWithRepeatGuestDetection` |
| **Negative** | Any (expects error) | Error status + message | `createBookingWithInvalidData` |

**Key rule:** If the method is a simple GET that just returns data WITHOUT assertions beyond status 200, it is a **helper**, NOT an ATC. Helpers do NOT get `@atc` decorators.

#### UI ATCs

| Type | User Action | Has Fixed Assertions | Example |
|------|-------------|---------------------|---------|
| **Happy path** | Fill + Submit + Navigate | URL change, success element visible | `submitFormSuccessfully` |
| **Validation** | Fill invalid + Submit | Error message visible, stays on page | `submitFormWithInvalidEmail` |
| **Navigation** | Click + Verify destination | URL, heading, key elements present | `navigateToDashboardSuccessfully` |
| **State change** | Toggle/Select + Verify UI update | Element state changed, text updated | `toggleFilterAndVerifyResults` |

**Key rule:** If the method is a simple navigation or click without assertions, it is a **helper**, NOT an ATC. Helpers do NOT get `@atc` decorators.

---

### Step 5: Define ATC Specification

**Determine:**

1. **Method name**: `{verb}{Resource}{Scenario}` (camelCase)
2. **Parameters**: Max 2 positional (use object param for 3+)
3. **Return type**: Depends on ATC type (see below)
4. **Fixed assertions**: Invariants that ALWAYS hold when this ATC succeeds
5. **Test-level assertions**: Variable checks left to the test file

#### Return Types by ATC Type

**API ATCs** — Always return tuples:

| HTTP Method | Return Type |
|-------------|-------------|
| GET / DELETE | `Promise<[APIResponse, TBody]>` |
| POST / PUT / PATCH | `Promise<[APIResponse, TBody, TPayload]>` |

**UI ATCs** — Always return void:

| ATC Type | Return Type |
|----------|-------------|
| All UI ATCs | `Promise<void>` |

#### Assertions Split Rule

- **Fixed (inside ATC)**: Invariants that ALWAYS hold — status code, required field presence, URL redirect, element visibility
- **Test-level (in test file)**: Specific values that change per scenario — commission amount, guest count, specific text content

---

### Step 6: Verify Naming Convention Compliance

Check against `automation-standards.md`:

- [ ] Follows `{verb}{Resource}{Scenario}` pattern
- [ ] Verb is meaningful: `create`, `update`, `delete`, `get`, `verify`, `submit`, `navigate`, `toggle`
- [ ] Scenario suffix matches type: `Successfully`, `WithInvalid{X}`, `WithNonExistent{X}`
- [ ] Not a disguised helper (has real assertions beyond status 200 or simple navigation)
- [ ] Not duplicating an existing ATC (check equivalence partitioning)

---

### Step 7: Generate the Document

Create the spec **inside the ticket's test-specs directory**:

```
.context/PBI/{module-name}/test-specs/{PREFIX}-T{NN}-{name}/atc/{TICKET-ID}-{brief-title}.md
```

Where `{module-name}` is the module being tested, and the ATC spec lives alongside the ticket's `spec.md` and `implementation-plan.md`.

---

## OUTPUT TEMPLATE

Use this template for the generated spec document:

````markdown
# ATC Spec: {TICKET-ID} — {ATC Name}

> **Ticket**: [{TICKET-ID}](https://your-jira-instance.atlassian.net/browse/{TICKET-ID})
> **Component**: `{ComponentName}` (`tests/components/{api|ui}/{ComponentName}.ts`)
> **Type**: {API | UI} — {Mutation | Verification | Negative | Happy path | Validation | Navigation | State change}
> **Parent Story**: {PARENT-TICKET-ID} (if applicable)

---

## 1. Test Case Summary

| Field | Value |
|-------|-------|
| **Name** | {Test case name from Jira/Xray} |
| **Objective** | {What this ATC validates — one sentence} |
| **Precondition** | {Required state before execution} |
| **Acceptance Criteria** | {What must be true for this ATC to pass} |

---

## 2. ATC Contract

```typescript
/**
 * ATC: {Brief description}
 *
 * {Longer description of what this ATC validates}
 *
 * Fixed assertions:
 * - {Assertion 1}
 * - {Assertion 2}
 */
@atc('{TICKET-ID}')
async {methodName}({parameters}): {ReturnType} {
  // implementation
}
```

### Method Signature

| Aspect | Value |
|--------|-------|
| **Name** | `{methodName}` |
| **Parameters** | `{paramName}: {ParamType}` |
| **Return Type** | See section below |

---

<!-- CONDITIONAL: Include the section that matches your ATC type -->

<!-- ==================== API ATC SECTION ==================== -->

## 3A. API Details (API ATCs Only)

### Endpoint

| Aspect | Value |
|--------|-------|
| **Method** | `{GET / POST / PUT / PATCH / DELETE}` |
| **Path** | `{/api/resource/path}` |
| **Auth Required** | `{Yes / No}` |
| **Content-Type** | `application/json` |

### Return Type

```typescript
// GET or DELETE
Promise<[APIResponse, {ResponseType}]>

// POST, PUT, or PATCH
Promise<[APIResponse, {ResponseType}, {PayloadType}]>
```

### OpenAPI Types

```typescript
// Import from api/openapi-types.ts or define locally
import type { {ResponseType}, {PayloadType} } from '@schemas/{domain}.types';

// If types don't exist in OpenAPI spec, define inline:
interface {ResponseType} {
  {field}: {type}
  // ...
}
```

### Request Body (Mutations Only)

```typescript
const payload: {PayloadType} = {
  {field}: {value},
  // ...
};
```

### Expected Response

```json
{
  "{field}": "{expected_value}",
  // ...
}
```

---

<!-- ==================== UI ATC SECTION ==================== -->

## 3B. UI Details (UI ATCs Only)

### Page Navigation

| Aspect | Value |
|--------|-------|
| **Page Path** | `{/page/path}` |
| **Requires Auth** | `{Yes / No}` |
| **Navigation Method** | `this.page.goto('{path}')` or via helper `this.goto()` |

### Return Type

```typescript
Promise<void>
```

### Locator Strategy

```typescript
// Inline locators (default — used in 1 ATC only)
const submitButton = this.page.getByTestId('submit-button');
const errorMessage = this.page.locator('[role="alert"]');

// Shared locators (extract to constructor — used in 2+ ATCs)
private readonly emailInput = () =>
  this.page.getByTestId('email-input')
    .or(this.page.locator('input[name="email"]'));
```

| Locator | Strategy | Selector | Used In |
|---------|----------|----------|---------|
| `{elementName}` | `getByTestId` / `locator` / `getByRole` | `{selector}` | This ATC only / Shared |

### Playwright Assertions

```typescript
// Visibility
await expect(element).toBeVisible();

// URL change
await expect(this.page).toHaveURL(/.*expected-path.*/);

// Text content
await expect(element).toHaveText('expected text');

// Element state
await expect(element).toBeDisabled();
await expect(element).toHaveAttribute('aria-selected', 'true');
```

### Intercepted Responses (If Applicable)

If the UI ATC needs to validate API responses triggered by user actions:

```typescript
const { responseBody, status } = await this.interceptResponse<TRequest, TResponse>({
  urlPattern: /\/api\/endpoint/,
  action: async () => await submitButton.click(),
});
```

---

## 4. Assertions Split

### Fixed Assertions (Inside ATC)

These assertions are ALWAYS checked — they define the ATC's success condition:

| # | Assertion | Code |
|---|-----------|------|
| 1 | {What it checks} | `expect({subject}).{matcher}({expected})` |
| 2 | {What it checks} | `expect({subject}).{matcher}({expected})` |

### Test-Level Assertions (In Test File)

These assertions change per test scenario — left to the test file:

| # | Assertion | Why It's Test-Level |
|---|-----------|---------------------|
| 1 | {What it checks} | {Changes per scenario — e.g., different commission rates} |
| 2 | {What it checks} | {Depends on test data} |

---

## 5. Code Template

<!-- Use the template that matches your ATC type -->

### API ATC Template

```typescript
// In: tests/components/api/{ComponentName}.ts

/**
 * ATC: {Brief description}
 *
 * {What this ATC validates}
 *
 * Fixed assertions:
 * - {assertion 1}
 * - {assertion 2}
 */
@atc('{TICKET-ID}')
async {methodName}({params}): Promise<[APIResponse, {TBody}, {TPayload}]> {
  const [response, body, payload] = await this.apiPOST<{TBody}, {TPayload}>(
    '{/api/endpoint}',
    {payloadVariable},
  );

  // Fixed assertions
  expect(response.status()).toBe({expectedStatus});
  expect(body.{field}).toBeDefined();

  return [response, body, payload];
}
```

**Usage in test file:**

```typescript
// In: tests/integration/{resource}/{resource}.test.ts

test('should {behavior} when {condition}', async ({ api }) => {
  const [response, body, payload] = await api.{component}.{methodName}({args});

  // Test-level assertions
  expect(body.{field}).toBe({expectedValue});
});
```

### UI ATC Template

```typescript
// In: tests/components/ui/{ComponentName}.ts

/**
 * ATC: {Brief description}
 *
 * {What this ATC validates}
 *
 * Fixed assertions:
 * - {assertion 1}
 * - {assertion 2}
 */
@atc('{TICKET-ID}')
async {methodName}({params}): Promise<void> {
  await this.goto();

  // Inline locators
  const {elementName} = this.page.getByTestId('{test-id}');

  // User actions
  await {elementName}.fill('{value}');
  await this.page.getByTestId('submit-button').click();

  // Fixed assertions
  await expect(this.page).toHaveURL(/.*{expected-path}.*/);
  await expect(this.page.getByTestId('{success-element}')).toBeVisible();
}
```

**Usage in test file:**

```typescript
// In: tests/e2e/{feature}/{feature}.test.ts

test('should {behavior} when {condition}', async ({ ui }) => {
  await ui.{component}.{methodName}({args});

  // Test-level assertions (if any)
  await expect(ui.{component}.page.getByTestId('{element}')).toHaveText('{expected}');
});
```

---

## 6. Equivalence Partitioning Check

| Input Variation | Expected Output | Same ATC? |
|-----------------|-----------------|-----------|
| {Input 1} | {Output type} | {Yes/No — Base case} |
| {Input 2} | {Output type} | {Yes — same output, parameterize} |
| {Input 3} | {Different output type} | {No — needs separate ATC} |

**Decision**: {Explain whether this should be one parameterized ATC or multiple ATCs}

---

## 7. Dependencies

### Precondition Steps

| Step | How | Component |
|------|-----|-----------|
| {e.g., Authenticate} | `steps.auth.authenticateAsAdmin()` | `AuthSteps` |
| {e.g., Create resource} | `api.resource.createHelper()` | `ResourceApi` |

### Required Components

| Component | Exists? | Action Needed |
|-----------|---------|---------------|
| `{ComponentName}` | {Yes/No} | {Add method / Create new + register in fixture} |
| `{StepsClass}` | {Yes/No} | {Use existing / Create if needed} |

---

## 8. Checklist

- [ ] Method name follows `{verb}{Resource}{Scenario}` convention
- [ ] Parameters: max 2 positional (3+ use object param)
- [ ] Return type matches ATC type (tuple for API, void for UI)
- [ ] Fixed assertions validate success invariants
- [ ] Test-level assertions documented for test file
- [ ] Not duplicating an existing ATC (equivalence partitioning checked)
- [ ] Locators use `getByTestId` with fallbacks (UI only)
- [ ] OpenAPI types identified or defined (API only)
- [ ] Component placement determined
- [ ] Precondition steps identified

---

## Cross-References

- **Coding prompt (API)**: `.prompts/stage-5-automation/coding/integration-test-coding.md`
- **Coding prompt (E2E)**: `.prompts/stage-5-automation/coding/e2e-test-coding.md`
- **Review prompt (API)**: `.prompts/stage-5-automation/review/integration-test-review.md`
- **Review prompt (E2E)**: `.prompts/stage-5-automation/review/e2e-test-review.md`
- **KATA guidelines**: `.context/guidelines/TAE/kata-ai-index.md`
- **Test design principles**: `.context/guidelines/TAE/test-design-principles.md`
- **Automation standards**: `.context/guidelines/TAE/automation-standards.md`
````

---

## REFERENCE

**Real example (auth module):**
- Implementation plan: `.context/PBI/auth/test-specs/AUTH-T01-user-session-validation/implementation-plan.md`
- ATC spec (API): `.context/PBI/auth/test-specs/AUTH-T01-user-session-validation/atc/UPEX-101-authenticate-successfully.md`
- ATC spec (UI): `.context/PBI/auth/test-specs/AUTH-T01-user-session-validation/atc/UPEX-105-login-successfully.md`

Read these files to understand the quality bar and level of detail expected.

---

## EXAMPLES

### Example 1: Triggering for an API ATC

**User says**: "Plan ATC for UPEX-045"

**AI does**:
1. Runs `bun xray get UPEX-045`
2. Loads required reading (API conditional files)
3. Identifies component: `BookingsApi`
4. Determines type: Mutation (POST)
5. Generates spec at `.context/PBI/bookings/test-specs/{PREFIX}-T{NN}-{name}/atc/UPEX-045-create-booking.md`

### Example 2: Triggering for a UI ATC

**User says**: "Document ATC for the login validation flow, ticket UPEX-789"

**AI does**:
1. Runs `bun xray get UPEX-789`
2. Loads required reading (UI conditional files)
3. Identifies component: `LoginPage`
4. Determines type: Validation (error display)
5. Generates spec at `.context/PBI/auth/test-specs/{PREFIX}-T{NN}-{name}/atc/UPEX-789-login-validation.md`

### Example 3: Manual description (no ticket)

**User says**: "Plan ATC for deleting a booking via API, should return 204"

**AI does**:
1. Skips Xray fetch (no ticket ID)
2. Loads API conditional files
3. Identifies component: `BookingsApi`
4. Determines type: Mutation (DELETE)
5. Generates spec with placeholder ticket ID `{TICKET-ID}`

---

## Cross-References

| Resource | Path |
|----------|------|
| **Stage 5 README** | `.prompts/stage-5-automation/README.md` |
| **Coding: API tests** | `.prompts/stage-5-automation/coding/integration-test-coding.md` |
| **Coding: E2E tests** | `.prompts/stage-5-automation/coding/e2e-test-coding.md` |
| **Review: API tests** | `.prompts/stage-5-automation/review/integration-test-review.md` |
| **Review: E2E tests** | `.prompts/stage-5-automation/review/e2e-test-review.md` |
| **KATA index** | `.context/guidelines/TAE/kata-ai-index.md` |
| **Test design principles** | `.context/guidelines/TAE/test-design-principles.md` |
| **Automation standards** | `.context/guidelines/TAE/automation-standards.md` |
| **API testing patterns** | `.context/guidelines/TAE/api-testing-patterns.md` |
| **E2E testing patterns** | `.context/guidelines/TAE/e2e-testing-patterns.md` |
| **Xray CLI** | `bun xray --help` |
