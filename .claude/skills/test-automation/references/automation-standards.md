# Automation Standards

Canonical conventions for naming, tagging, folder layout, data management, anti-patterns, and quality gates in KATA. Load when the standards need verification — before opening a PR, when reviewing test code, or when structuring a new module. Architectural and code-style rules live in `kata-architecture.md` and `typescript-patterns.md`.

---

## 1. Naming Conventions

### Components

| Type | Class name | File name |
|------|-----------|-----------|
| Test Context | `TestContext` | `TestContext.ts` |
| API Base | `ApiBase` | `ApiBase.ts` |
| UI Base | `UiBase` | `UiBase.ts` |
| API Component | `{Resource}Api` | `UsersApi.ts`, `OrdersApi.ts` |
| UI Component | `{Page}Page` | `LoginPage.ts`, `CheckoutPage.ts` |
| Steps | `{Domain}Steps` | `AuthSteps.ts`, `CheckoutSteps.ts` |
| Fixture | `{Type}Fixture` | `ApiFixture.ts`, `UiFixture.ts`, `StepsFixture.ts`, `TestFixture.ts` |

File naming: PascalCase, matches class name exactly. All code in English (components, ATCs, variables, comments). Documentation may be Spanish or English per team preference; skills and context docs are English-only.

### ATCs (Acceptance Test Cases)

Pattern: `{verb}{Resource}{Scenario}` — always camelCase, always English.

| Scenario | Suffix | Example |
|----------|--------|---------|
| Success | `Successfully` / `WithValidCredentials` | `signInSuccessfully`, `loginWithValidCredentials` |
| Invalid input | `WithInvalid{X}` | `signInWithInvalidCredentials` |
| Not found | `WithNonExistent{X}` | `getUserWithNonExistentId` |
| Expired | `WithExpired{X}` | `loginWithExpiredToken` |
| Forbidden | `WithRestricted{X}` / `WithInsufficient{X}` | `loadDashboardWithRestrictedRole` |

Rules:

- Name must describe **what action** is performed and **what outcome** is expected.
- Must be a complete test case, not a single interaction.
- `clickLoginButton()`, `fillEmailSuccessfully()`, `submitFormSuccessfully()` are **wrong** — they describe interactions, not test cases.

### Test Files

| Type | Pattern | Example |
|------|---------|---------|
| E2E | `{verb}{Feature}.test.ts` | `processCheckout.test.ts`, `createSignup.test.ts` |
| Integration | `{verb}{Resource}.test.ts` | `authenticateUser.test.ts`, `createOrder.test.ts` |
| Utility | `{util}.test.ts` | `decorators.test.ts` |

Rules:

- File-name verb describes the **user action** (apply, create, submit, refresh), not a test verb like `verify`, `check`, or `test`.
- One file = one feature. A feature may have multiple `describe` blocks (tickets) that touch the same functionality.
- One ticket = one `describe`. Never split a ticket across files.
- Multiple tickets can coexist in one file when they test different aspects of the same feature.

### Test Hierarchy

The four-level hierarchy maps to how work is organized:

```
Module (directory)        -> tests/e2e/orders/
  Feature (file)          -> applyDiscount.test.ts
    Ticket (describe)     -> 'TICKET-ID: Apply Discount Code'
      Scenario (test)     -> 'TICKET-ID: should apply percentage discount when code is valid'
```

| Level | Maps to | Naming | Example |
|-------|---------|--------|---------|
| Directory | Module / product area | kebab-case | `orders/`, `products/`, `auth/` |
| File | Feature / functional area | `{verb}{Feature}.test.ts` (camelCase) | `applyDiscount.test.ts` |
| `describe()` | Ticket / User Story | `'{TICKET-ID}: {Title}'` | `'UPEX-411: Apply Discount Code'` |
| `test()` | Scenario / test case | `'{TICKET-ID}: should {behavior} when {condition}'` | `'UPEX-411: should apply percentage discount when code is valid'` |

Every `test()` must include the ticket ID as a prefix. `describe` blocks may include the ticket ID when the file is tied to a single ticket.

---

## 2. ATC Design Philosophy

This section codifies the rules that determine what is an ATC, when two scenarios collapse into one ATC, and how assertions relate to test cases. These rules are the source of truth for KATA test design.

### What is an ATC (and what is NOT)

An ATC represents a **complete action** that changes or validates system state. It maps 1:1 with a test case ticket in the TMS via `@atc('TICKET-ID')`.

| Type | What it does | Example | Has `@atc`? |
|------|-------------|---------|-------------|
| **ATC** | Action that changes system state | `authenticateSuccessfully()`, `createOrderSuccessfully()` | Yes |
| **Helper** | Reads data (no state change) | `getOrders(filters)`, `getCurrentUser()` | No (use `@step`) |

A simple GET is a helper, not an ATC. A GET that verifies an action's outcome belongs **inside** the ATC as a verification step:

```typescript
@atc('TICKET-ID')
async createOrderSuccessfully(orderData) {
  // ACTION
  const [response, body, sent] = await this.apiPOST(...);
  // VERIFICATION (GET to confirm persistence)
  const [, persisted] = await this.apiGET(`/orders/${body.id}`);
  // ASSERTIONS
  expect(response.status()).toBe(201);
  expect(persisted.id).toBe(body.id);
  return [response, body, sent];
}
```

### TC Identity Rule: Precondition + Action

A test case's identity is determined by exactly two elements:

1. **Precondition**: the state the system must be in
2. **Action**: the user trigger

**All expected results** from the same (precondition, action) pair belong to the **same TC** — regardless of which panel, endpoint, or UI section they validate.

```
TC Identity = Precondition + Action
              |
              All expected outputs are assertions of THIS TC
```

| Different TC? | Reason |
|--------------|--------|
| Yes | Different **precondition**: product out-of-stock vs in-stock |
| Yes | Different **action**: open detail page vs click "Add to Cart" |
| Yes | Different **equivalent partition**: percentage discount vs fixed-amount |
| **No** | Same precondition + action, checking pricing block vs reviews block |
| **No** | Same precondition + action, checking one more field in the response |

**Anti-pattern — splitting by concern:**

```
// WRONG: 3 separate TCs for the same input
TC-A: Open published product -> verify Pricing block values
TC-B: Open published product -> verify Reviews block values
TC-C: Open published product -> verify detail page structure
// These share the SAME precondition and action -> they are ONE TC
```

**Correct — one TC, all assertions:**

```
TC: Open product detail page for published in-stock product
  Precondition: Product is published and has stock > 0
  Action: Navigate to product detail page
  Expected Output:
    - Page structure visible (heading, image gallery, reviews section)
    - Pricing values correct (base - discount = final)
    - Inventory metrics correct (stock count, delivery estimate)
    - Add to Cart button enabled
    - Reviews block shows rating + review count
```

### Equivalence Partitioning

Inputs that produce the **same output type** collapse into one parameterized ATC. Inputs that produce **different outputs** require separate ATCs.

| Same ATC (parameterize) | Different ATC (create new) |
|--------------------------|---------------------------|
| Different **data** but same **behavior** | Different **actions** or **behavior** |
| All inputs produce the same output type | Outputs are fundamentally different |
| Buy 1 product vs buy 5 products (same checkout flow) | Credit card checkout vs bank transfer (different steps) |
| Minor output variation -> use conditionals sparingly | Different endpoint, UI flow, or assertion set |

```typescript
// WRONG: three ATCs that all produce HTTP 401
@atc('T1') async loginWithWrongEmail() { /* -> 401 */ }
@atc('T2') async loginWithWrongPassword() { /* -> 401 */ }
@atc('T3') async loginWithEmptyFields() { /* -> 401 */ }

// RIGHT: one parameterized ATC
@atc('T1')
async loginWithInvalidCredentials(payload: LoginPayload) {
  // All variations produce 401 with an error message
  const [response, body] = await this.apiPOST<ErrorResponse, LoginPayload>('/auth/login', payload);
  expect(response.status()).toBe(401);
  expect(body.error).toBeDefined();
  return [response, body, payload];
}
```

**Rule of thumb**: if the **actions** inside the ATC change, it is a different ATC. If only the **data** changes but the system behaves identically, it is the same ATC.

### Tests validate FLOWS, not individual properties

Do not create N tests checking N fields of the same response. One test validates the complete flow with multiple assertions.

```typescript
// WRONG: 3 tests for the same API call
test('should return orders', async ({ api }) => {
  const orders = await api.orders.getOrders(filters);
  expect(orders.length).toBeGreaterThan(0);
});
test('should have referenceNumber', async ({ api }) => {
  const orders = await api.orders.getOrders(filters);  // same call
  expect(orders[0].referenceNumber).toBeDefined();
});

// RIGHT: one test, multiple assertions on the same flow
test('TICKET-ID: should create order with correct totals when discount applied', async ({ api }) => {
  const [, order] = await api.orders.createOrderSuccessfully(orderData);
  const totals = await api.orders.getTotals({ orderId: order.id });
  expect(order.id).toBeDefined();
  expect(order.discountApplied).toBe(true);
  expect(totals.finalAmount).toBe(totals.baseAmount - totals.discountAmount);
});
```

Separate tests only when the **scenario is fundamentally different** (different flow, different preconditions, different user role) — not when checking a different field of the same response.

### Assertion layers

Assertions exist at two levels and serve different purposes:

```
Test Flow
  |
  +-- ATC 1: createOrderSuccessfully()
  |     +-- [ATC assertions: status 201, order persisted]
  |
  +-- ATC 2: applyDiscountSuccessfully()
  |     +-- [ATC assertions: discount applied, total recalculated]
  |
  +-- Test-level assertions:
        +-- [Final state: total matches base - discount, tax correct]
```

- **ATC assertions** (fixed, inside the ATC): validate that the individual action succeeded. These run every time the ATC is called, in every test.
- **Test-level assertions** (in the test file): validate the overall outcome after combining multiple ATCs. These are specific to the scenario.

Assertions are checkpoints along a flow, not the purpose of the test. The test is the journey; assertions are road signs.

---

## 3. Folder Structure

```
/config
    variables.ts                 # Single source of truth for env + URLs

/tests
  /components
    TestContext.ts
    ApiFixture.ts
    UiFixture.ts
    StepsFixture.ts
    TestFixture.ts
    /api
      ApiBase.ts
      {Resource}Api.ts
    /ui
      UiBase.ts
      {Page}Page.ts
    /steps
      {Domain}Steps.ts
  /data
    /fixtures                    # JSON/CSV for parameterization (commit)
    /uploads                     # Files for upload tests (commit)
    /downloads                   # Download destination (gitignore)
  /integration
    /{module}/{verbFeature}.test.ts
  /e2e
    /{module}/{verbFeature}.test.ts
  /utils
    decorators.ts
    KataReporter.ts
  globalSetup.ts
  globalTeardown.ts

/test-results                    # Playwright artifacts (gitignore)
  /screenshots
  /videos
  /traces

/playwright.config.ts
```

### Playwright artifact configuration

```typescript
// playwright.config.ts
export default defineConfig({
  outputDir: 'test-results',
  retries: 0,
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
```

`test-results/` and `tests/data/downloads/` are gitignored. `tests/data/fixtures/` and `tests/data/uploads/` are committed.

---

## 4. Tagging Strategy

Use Playwright tags on `test()` and `describe()` to group runs and drive the CI matrix.

| Tag | Meaning | Typical use |
|-----|---------|-------------|
| `@critical` | Core user journey (login, checkout, payment). Blocks release if fails. | Smoke suite, gated deploys. |
| `@smoke` | Post-deploy health check. Runs on every deployment. | Smoke workflow. |
| `@regression` | Full coverage. Runs nightly / pre-release. | Regression workflow. |
| `@e2e` | End-to-end (UI + API). | Scope selection in CI. |
| `@api` / `@integration` | API-only tests. | Scope selection in CI. |
| `@flaky` | Known intermittent — under stabilization. | Excluded from `@critical` runs. |

Example:

```typescript
test.describe('TICKET-ID: Apply Discount Code @regression', () => {
  test('TICKET-ID: should apply percentage discount when code is valid @critical', async ({ api }) => {
    ...
  });
});
```

Run selection:

```bash
bun run test --grep "@critical"
bun run test --grep "@smoke"
bun run test --grep "@regression"
bun run test --grep-invert "@flaky"
```

Every `@critical` test is also `@smoke` in practice. Tags are additive — you can carry multiple tags on the same test.

---

## 5. Component Structure

### File template (API component)

```typescript
/**
 * KATA Layer 3 — {Resource} API Component
 */
import { expect, type APIResponse } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import type { TestContextOptions } from '@TestContext';

// ============================================
// Types
// ============================================

export interface ResourcePayload { ... }
export interface ResourceResponse { ... }

// ============================================
// Component Class
// ============================================

export class ResourceApi extends ApiBase {
  constructor(options: TestContextOptions) { super(options); }

  // ─── HELPERS (read-only, @step for tracing) ────────────

  @step
  async getResourceById(id: string): Promise<[APIResponse, ResourceResponse]> {
    return this.apiGET<ResourceResponse>(`/api/resource/${id}`);
  }

  // ─── ATCs (state-changing, @atc for TMS) ───────────────

  @atc('TICKET-ID')
  async createResourceSuccessfully(payload: ResourcePayload):
    Promise<[APIResponse, ResourceResponse, ResourcePayload]> {
    const [response, body, sent] = await this.apiPOST<ResourceResponse, ResourcePayload>(
      '/api/resource', payload);
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    return [response, body, sent];
  }
}

export default ResourceApi;
```

### Method order inside a component

1. Constructor
2. Shared locators (UI only, `private readonly`)
3. Navigation methods (UI only)
4. Helpers (no decorator, optional `@step`)
5. ATCs (`@atc('TICKET-ID')`)

### AAA (Arrange-Act-Assert) inside an ATC

```typescript
@atc('TICKET-ID')
async signInSuccessfully(payload: SignInPayload):
  Promise<[APIResponse, AuthResponse, SignInPayload]> {
  // ACT — perform the action
  const [response, body, sent] = await this.apiPOST<AuthResponse, SignInPayload>(
    '/auth/signin', payload);

  // ASSERT — fixed assertions validate the action succeeded
  expect(response.status()).toBe(200);
  expect(body.user).toBeDefined();
  expect(body.session.access_token).toBeDefined();

  // RETURN — for chaining with other ATCs
  return [response, body, sent];
}
```

"Arrange" for ATCs is usually empty — preconditions are passed in as parameters, not built inside the ATC.

### Return types

```typescript
// API GET           Promise<[APIResponse, TBody]>
// API POST/PUT/PATCH Promise<[APIResponse, TBody, TPayload]>
// UI ATC            Promise<void>
```

API ATCs return tuples to enable chaining; UI ATCs typically return `void` because assertions are inside the ATC. When a UI ATC must expose data to the test file (e.g., a generated order ID from the confirmation page), return a typed object.

### Docstrings

Component class:

```typescript
/**
 * KATA Layer 3 — Auth API Component.
 * Handles authentication operations: sign in, sign out, user profile.
 */
```

ATC methods:

```typescript
/**
 * Sign in with valid credentials.
 * Returns: [APIResponse, AuthResponse, SignInPayload]
 */
@atc('TICKET-ID')
async signInSuccessfully(payload: SignInPayload) { ... }
```

---

## 6. Test Data Strategy

KATA distinguishes three sources of test data. Classify every data need in the plan before coding.

### Pre-Execution variables (static)

Defined in `config/variables.ts` and `.env` before the run:

```typescript
// config/variables.ts
export const config = {
  testUser: {
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
  },
  apiKey: process.env.API_KEY,
};
```

Rule: credentials come from `.env` only. Never hardcode, never check into git.

### Dynamic variables (runtime)

Generated during test execution using `TestContext` utilities (typically `faker`):

```typescript
test('TICKET-ID: should create user with dynamic data', async ({ api }) => {
  const userData = api.generateUserData();
  await api.users.createUserSuccessfully(userData);
});
```

Rule: every test generates its own unique data so parallel runs and retries never collide.

### Fixture files (parameterisation)

For data-driven tests, load from JSON/CSV in `tests/data/fixtures/`:

```typescript
import usersData from '@data/fixtures/users.json';

for (const user of usersData) {
  test(`TICKET-ID: should signup ${user.type} user`, async ({ ui }) => {
    await ui.signup.signupWithValidCredentials({
      email: user.email,
      password: user.password,
    });
  });
}
```

Data flow: files → test arguments → ATC arguments.

### Discover → Modify → Generate

The full data strategy (when to reuse staging data, when to mutate it, when to generate fresh) lives in `test-data-management.md`. At the standards level, three rules hold:

1. **Never assume data exists.** If a test needs a user, either create one via API or generate from faker.
2. **Never mutate someone else's data.** If a test updates a record, it must create that record first.
3. **Never share state between tests.** Parallel runs depend on it.

---

## 7. Stability (Anti-Flakiness)

### No retries by default

```typescript
// playwright.config.ts
export default defineConfig({ retries: 0 });
```

Retries mask real issues. Passing on retry is a red flag, not a success. Fix the root cause.

### No hardcoded waits

```typescript
// WRONG
await page.waitForTimeout(3000);

// RIGHT
await page.waitForSelector('[data-loaded="true"]');
await page.waitForLoadState('networkidle');
await page.waitForResponse(resp => resp.url().includes('/api/data') && resp.ok());
```

### Conditional waits for unpredictable UI

```typescript
const popup = page.locator('[role="dialog"]');
const isVisible = await popup.isVisible({ timeout: 2000 }).catch(() => false);
if (isVisible) await popup.locator('button:has-text("Close")').click();
```

### Intercept the real backend call

```typescript
await Promise.all([
  page.waitForResponse(resp => resp.url().includes('/api/cart')),
  page.locator('[data-testid="add-to-cart"]').click(),
]);
```

### Soft fail (use sparingly)

```typescript
@atc('TICKET-ID', { softFail: true, severity: 'medium' })
async verifyOptionalField() { ... }
```

| Use soft fail | Do not use soft fail |
|---------------|----------------------|
| Optional form fields | Critical functionality |
| Exploratory tests | Blocking validation |
| Non-critical features that should not stop the flow | When failure means subsequent ATCs are meaningless |

---

## 8. Error Handling

### Inside ATCs (public methods)

Fail fast with a descriptive error.

```typescript
async apiGET<T>(endpoint: string): Promise<[APIResponse, T]> {
  if (!this.request) {
    throw new Error('Request context not set. Ensure fixture provides request.');
  }
  ...
}
```

### Inside utilities (private helpers)

Silent fail — return `null` / `undefined` for missing data.

```typescript
private async parseResponseBody<T>(response: Response): Promise<T | null> {
  try { return (await response.json()) as T; }
  catch { return null; }
}
```

Never swallow errors inside an ATC without re-throwing — the test must fail visibly.

---

## 9. Code Quality

### Linting

ESLint with `@antfu/eslint-config` (flat config):

```bash
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix issues
```

### Type Checking

TypeScript with relaxed mode (no `experimentalDecorators`):

```bash
bun run type-check  # tsc --noEmit
```

### Import aliases (mandatory)

```typescript
// RIGHT
import { config, env } from '@variables';
import { ApiBase } from '@api/ApiBase';

// WRONG
import { config } from '../../../config/variables';
```

See `typescript-patterns.md` for the full alias list.

---

## 10. Review Checklists

Every component and every test file is gated by a checklist before merge. Paste this into PR reviews.

### Component review

- [ ] File name is PascalCase and matches the class name.
- [ ] Class extends `ApiBase` or `UiBase` (never `TestContext` directly in Layer 3).
- [ ] Constructor accepts `TestContextOptions` and passes to `super()`.
- [ ] Helpers at top (no decorator or `@step`), ATCs below with `@atc('TICKET-ID')`.
- [ ] ATCs have tuple return type (API) or `Promise<void>` (UI).
- [ ] Every ATC contains fixed assertions.
- [ ] Imports use aliases only, no relative paths.

### ATC review

- [ ] Name follows `{verb}{Resource}{Scenario}` camelCase.
- [ ] Represents a complete test case (mini-flow), not a single `page.click()`.
- [ ] Different expected outputs = different ATCs; same output with different data = one parameterized ATC (equivalence partitioning).
- [ ] Locators inline unless used in 2+ ATCs of this component (then `private readonly`).
- [ ] No ATC calls another ATC. Chains live in `tests/components/steps/`.
- [ ] Max 2 positional parameters; 3+ use an object parameter.
- [ ] Return type annotated explicitly.
- [ ] `@atc('TICKET-ID')` references a real TMS ticket.
- [ ] No hardcoded waits (`waitForTimeout`).
- [ ] Sensitive parameters (password, token) named correctly so decorators mask them.

### Test file review

- [ ] File under `tests/integration/{module}/` or `tests/e2e/{module}/`.
- [ ] Name follows `{verb}{Feature}.test.ts` camelCase with a user-action verb.
- [ ] Every `test()` has the ticket ID prefix and `should {behavior} when {condition}` format.
- [ ] Uses the correct fixture: `{ api }`, `{ ui }`, `{ test }`, or `{ steps }`.
- [ ] Creates its own test data — no shared state with other tests.
- [ ] Test-level assertions validate business logic, not individual fields of a single response.
- [ ] Tags applied where needed (`@critical`, `@smoke`, `@regression`).
- [ ] No relative imports.
- [ ] Component used is registered in the relevant fixture.

---

## 11. Anti-Patterns

Common mistakes that fail code review.

| Anti-pattern | Why it is wrong | Fix |
|--------------|-----------------|-----|
| ATC that only wraps one `page.click()` | Not a test case, just an interaction | Merge into a complete ATC flow |
| Separate `locators/*.ts` file | Maintenance overhead, disconnected from tests | Inline in ATC, or `private readonly` on class for 2+ uses |
| Multiple ATCs with the same expected output | Violates equivalence partitioning | One parameterized ATC |
| Helper that wraps a single `page.fill()` | Playwright already does it | Delete helper, call `page.fill()` inline |
| ATC calling another ATC | Breaks atomicity and traceability | Use Steps module |
| `waitForTimeout(3000)` | Arbitrary, flaky, slow | Wait for specific condition |
| Relying on retries (`retries > 0`) | Masks real issues | Investigate failure, fix root cause |
| Shared state between tests | Tests become order-dependent | Each test creates its own data |
| Component not registered in fixture | Tests cannot access it | Add to `ApiFixture` / `UiFixture` / `StepsFixture` |
| Relative imports (`../../../config`) | Breaks lint, hurts refactors | Use alias (`@variables`, `@api/`, ...) |
| Test name without ticket ID | Breaks TMS traceability | `test('TICKET-ID: should ... when ...')` |
| Six tests checking six fields of one response | Violates TC Identity rule | One test with multiple assertions |

### Worked anti-pattern examples

```typescript
// ATC with a single interaction — WRONG
@atc('TICKET-ID')
async clickAddToCartButton() {
  await this.page.click('[data-testid="add-to-cart"]');
}

// Multiple ATCs, same output (HTTP 401) — WRONG
@atc('T1') async loginWithWrongEmail() { /* -> 401 */ }
@atc('T2') async loginWithWrongPassword() { /* -> 401 */ }
@atc('T3') async loginWithEmptyFields() { /* -> 401 */ }

// Separate locator file — WRONG
// locators/checkout.ts
export const LOCATORS = {
  addToCartBtn: '[data-testid="add-to-cart"]',
  cartTotal: '[data-testid="cart-total"]',
};

// Helper wrapping a one-liner — WRONG
private async fillEmail(email: string) {
  await this.page.locator('#email').fill(email);
}
```

---

## 12. Quality Gates (Must Pass Before Merge)

These gates block PR merge. Run them locally before opening the PR.

| Gate | Command | Must be |
|------|---------|---------|
| Tests pass | `bun run test <path>` | All green, zero retries used |
| Type check | `bun run type-check` | No errors |
| Lint | `bun run lint` | No errors |
| Component registered | visual | In relevant fixture |
| ATC IDs linked | visual | Every `@atc('X')` maps to a real TMS test case |
| Tags correct | visual | `@critical` / `@smoke` / `@regression` applied as planned |
| No AI attribution in commits | `git log` | No "Co-Authored-By: Claude" or similar |

### Validation loop

```bash
# 1. Write code
# 2. Run the new test
bun run test tests/integration/orders/createOrder.test.ts

# 3. If green, check types
bun run type-check

# 4. If clean, lint
bun run lint

# 5. If clean, extract manifest and verify ATC IDs
bun run kata:manifest

# 6. Open PR, confirm reviewer checklist passes
```

Order matters. Do not chase lint errors before tests pass — the test may remove the problematic code.

---

## 13. Complementary Testing (Optional)

KATA covers functional testing. For other testing types, integrate as needed without breaking the architecture.

| Type | Tools | When to use |
|------|-------|-------------|
| Visual regression | Playwright `toHaveScreenshot`, Percy, Chromatic | Design-heavy applications, component libraries |
| Accessibility | `@axe-core/playwright` | Public-facing apps, compliance requirements |
| Performance | Lighthouse CI, k6, Playwright Performance API | SLAs, performance-critical paths |

These live alongside functional tests but are out of KATA's core scope. Add them when the project requires them; do not force them into ATCs.

---

## 14. Quick Reference

```bash
# Local validation loop
bun run test <path>
bun run type-check
bun run lint

# Discovery + manifest
bun run kata:manifest            # extract components + ATCs into kata-manifest.json

# OpenAPI schema sync (if API component types come from spec)
bun run api:sync

# Environment setup
cp .env.example .env             # populate test credentials
```

File path shapes:

```
tests/components/api/{Resource}Api.ts
tests/components/ui/{Page}Page.ts
tests/components/steps/{Domain}Steps.ts
tests/integration/{module}/{verbFeature}.test.ts
tests/e2e/{module}/{verbFeature}.test.ts
```
