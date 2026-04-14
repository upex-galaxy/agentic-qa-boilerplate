# KATA Architecture — Layers, Fixtures, ATCs, Steps

Full reference for the Component Action Test Architecture (KATA). Load when designing new components, picking fixtures, wiring ATCs, or building Steps chains.

---

## 1. The Four Layers

```
Layer 4 — Fixtures (DI)
    TestFixture, ApiFixture, UiFixture, StepsFixture
        |
        v
Layer 3.5 — Steps (optional)
    AuthSteps, CheckoutSteps — reusable ATC chains for preconditions
        |
        v
Layer 3 — Domain Components (ATCs)
    UsersApi, LoginPage, CheckoutPage — @atc lives here
        |
        v
Layer 2 — Base Components
    ApiBase (HTTP helpers), UiBase (Playwright helpers)
        |
        v
Layer 1 — TestContext
    Config, logger, faker, environment accessors
```

| Layer | Responsibility | Typical files |
|-------|---------------|---------------|
| 1 — TestContext | Global utilities (config, logger, faker, env) | `TestContext.ts` |
| 2 — Base | HTTP and Playwright helpers | `ApiBase.ts`, `UiBase.ts` |
| 3 — Domain | Business logic, ATCs | `UsersApi.ts`, `LoginPage.ts` |
| 3.5 — Steps | Reusable ATC chains for preconditions | `AuthSteps.ts`, `CheckoutSteps.ts` |
| 4 — Fixtures | DI entry point | `TestFixture.ts`, `ApiFixture.ts`, `UiFixture.ts`, `StepsFixture.ts` |
| Tests | Orchestrate ATCs into scenarios | `tests/e2e/**`, `tests/integration/**` |

Rule: a component in a higher layer may use a lower layer, never the other way round.

---

## 2. Directory Structure

```
/config
    variables.ts                 # Single source for env vars + URLs

/tests
  /components
    TestContext.ts              # Layer 1
    ApiFixture.ts               # Layer 4 (API only)
    UiFixture.ts                # Layer 4 (UI only)
    StepsFixture.ts             # Layer 4 (Steps)
    TestFixture.ts              # Layer 4 (unified: api + ui + steps)

    /api
      ApiBase.ts                # Layer 2
      UsersApi.ts               # Layer 3
    /ui
      UiBase.ts                 # Layer 2
      LoginPage.ts              # Layer 3
    /steps
      AuthSteps.ts              # Layer 3.5

  /data/fixtures                # JSON/CSV test data
  /integration/{module}         # API-only tests
  /e2e/{module}                 # UI (+API) tests
  /utils
    decorators.ts               # @atc, @step
```

Import aliases are mandatory (no relative imports):

```typescript
import { config, env } from '@variables';
import { ApiBase } from '@api/ApiBase';
import { LoginPage } from '@ui/LoginPage';
import { atc, step } from '@utils/decorators';
import { TestContext, type TestContextOptions } from '@TestContext';
```

---

## 3. TestContext (Layer 1)

Stores Playwright drivers and global utilities. Every higher layer extends it or receives its options.

```typescript
interface TestContextOptions {
  page?: Page;                   // Optional — API tests don't need it
  request?: APIRequestContext;   // Optional — some setups don't need it
  environment?: Environment;
}
```

Responsibilities: select URLs/credentials from `config` based on `TEST_ENV`; expose `faker`; expose environment label; provide shared logger/attachment helpers.

Do not put Playwright-specific logic here (belongs in UiBase). Do not put HTTP-specific logic here (belongs in ApiBase).

---

## 4. Base Components (Layer 2)

### ApiBase

Wraps `APIRequestContext` with type-safe HTTP helpers that return tuples:

```typescript
protected async apiGET<T>(path: string): Promise<[APIResponse, T]>
protected async apiPOST<T, P>(path: string, payload: P): Promise<[APIResponse, T, P]>
protected async apiPUT<T, P>(path: string, payload: P): Promise<[APIResponse, T, P]>
protected async apiPATCH<T, P>(path: string, payload: P): Promise<[APIResponse, T, P]>
protected async apiDELETE<T>(path: string): Promise<[APIResponse, T]>
```

### UiBase

Extends `TestContext`. Adds Playwright helpers: response interception, network waiting, storage-state snapshots, Allure attachments.

Rule: anything that needs `PageContext` goes in UiBase; anything needing `APIRequestContext` goes in ApiBase; anything agnostic (allure attachments, string helpers) goes in `tests/utils/`.

---

## 5. Domain Components (Layer 3)

One component per file. Max 15–20 ATCs per component — split if larger.

| Type | Class | File |
|------|-------|------|
| API | `{Resource}Api` | `{Resource}Api.ts` |
| UI | `{Page}Page` | `{Page}Page.ts` |

Order inside the class: constructor → navigation (UI only) → helpers (no decorator or `@step`) → ATCs (`@atc`).

### API component template

```typescript
import { expect, type APIResponse } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import type { TestContextOptions } from '@TestContext';

export interface UserPayload { name: string; email: string; }
export interface UserResponse { id: string; name: string; email: string; }

export class UsersApi extends ApiBase {
  constructor(options: TestContextOptions) { super(options); }

  @step
  async getUserById(id: string): Promise<[APIResponse, UserResponse]> {
    return this.apiGET<UserResponse>(`/users/${id}`);
  }

  @atc('TICKET-ID')
  async createUserSuccessfully(payload: UserPayload): Promise<[APIResponse, UserResponse, UserPayload]> {
    const [response, body, sent] = await this.apiPOST<UserResponse, UserPayload>('/users', payload);
    expect(response.status()).toBe(201);
    expect(body.id).toBeDefined();
    return [response, body, sent];
  }
}
```

### UI component template

```typescript
import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';
import type { TestContextOptions } from '@TestContext';

export interface LoginData { email: string; password: string; }

export class LoginPage extends UiBase {
  private readonly submitButton = () => this.page.locator('button[type="submit"]');

  constructor(options: TestContextOptions) { super(options); }

  @atc('TICKET-ID')
  async loginWithValidCredentials(data: LoginData): Promise<void> {
    await this.page.goto('/login');
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    await this.submitButton().click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

---

## 6. ATC Rules

An ATC (Acceptance Test Case) is a **complete test case (mini-flow), not a single interaction**. Each ATC maps 1:1 to a ticket via `@atc('TICKET-ID')`.

### Rule 1 — Complete flow

```typescript
// WRONG — single interaction
@atc('TICKET-ID') async clickLoginButton() { await this.page.click('#login'); }

// RIGHT — complete mini-flow
@atc('TICKET-ID')
async loginWithValidCredentials(data: LoginData) {
  await this.page.goto('/login');
  await this.page.locator('#email').fill(data.email);
  await this.page.locator('#password').fill(data.password);
  await this.page.locator('button[type="submit"]').click();
  await expect(this.page).toHaveURL(/.*dashboard.*/);
}
```

### Rule 2 — TC Identity = Precondition + Action

A TC is defined by exactly two elements: the precondition (state) and the action (trigger). Every expected result from the same precondition + action is an assertion of the **same TC**, no matter which panel or endpoint it validates.

```
// WRONG — three TCs share the same precondition and action
TC-A: Open published product -> verify Pricing block
TC-B: Open published product -> verify Reviews block
TC-C: Open published product -> verify page structure

// RIGHT — one TC with all assertions
TC: Open product detail page for published in-stock product
  Precondition: product is published and stock > 0
  Action: user navigates to the product detail page
  Expected:
    - Page structure visible
    - Pricing values correct (Base - Discount = Final)
    - Inventory metrics correct
    - Reviews block shows rating + count
    - Add to Cart enabled
```

A TC is only different when the **precondition** or **action** changes — not when you check a different field of the same response.

### Rule 3 — Equivalence Partitioning

Same expected output = one parameterized ATC.

```typescript
// WRONG — three ATCs, same output (HTTP 401)
@atc('T1') async loginWithWrongEmail() {}
@atc('T2') async loginWithWrongPassword() {}
@atc('T3') async loginWithEmptyFields() {}

// RIGHT — one parameterized ATC
@atc('T1')
async loginWithInvalidCredentials(payload: LoginPayload) {
  // Test file parameterizes different invalid inputs; all produce 401
}
```

Different status codes, different UI states, or different business outcomes = separate ATCs. Same outcome, different data = one parameterized ATC. Minor conditional variations within the same behavior are acceptable; fundamentally different behavior is a separate ATC.

### Rule 4 — Locators inline

Locators go inside the ATC, not in separate files.

```typescript
// WRONG
export const LOCATORS = { email: '#email', password: '#password' };

// RIGHT
@atc('TICKET-ID')
async loginWithValidCredentials(data: LoginData) {
  await this.page.locator('#email').fill(data.email);
  await this.page.locator('#password').fill(data.password);
}
```

Exception — if the same locator is used in 2+ ATCs of the same component, extract to a `private readonly` arrow function on the class:

```typescript
class CheckoutPage extends UiBase {
  private readonly cartTotal = () => this.page.locator('[data-testid="cart-total"]');
  private readonly productRow = (name: string) => this.page.locator(`[data-product="${name}"]`);
}
```

Never extract a locator used once. Never wrap a single `page.fill()` or `page.click()` in a helper.

### Rule 5 — ATCs do not call ATCs

ATCs are atomic. For reusable chains across multiple test files, use the Steps module (Section 8).

```typescript
// WRONG
@atc('TICKET-ID')
async checkoutWithNewUser() {
  await this.signupSuccessfully(userData);   // calling an ATC!
  await this.addToCartSuccessfully(product);
}

// RIGHT — test file orchestrates, or Steps module
test('TICKET-ID: should checkout with new user', async ({ ui }) => {
  await ui.signup.signupWithValidCredentials(userData);
  await ui.cart.addToCartSuccessfully(product);
});
```

### Rule 6 — Fixed assertions inside, flow assertions outside

Fixed assertions (status code, required fields, URL redirect) go inside the ATC. Test-level assertions (business outcomes combining multiple ATCs) go in the test file.

```typescript
@atc('TICKET-ID')
async signInSuccessfully(payload: SignInPayload) {
  const [response, body] = await this.apiPOST<AuthResponse, SignInPayload>('/auth/signin', payload);
  expect(response.status()).toBe(200);               // FIXED
  expect(body.session.access_token).toBeDefined();   // FIXED
  return [response, body];
}

// test file
test('TICKET-ID: should persist session after login', async ({ test }) => {
  const [, body] = await test.api.auth.signInSuccessfully(credentials);
  expect(body.session.access_token).toMatch(/^eyJ/); // TEST-LEVEL
});
```

### Rule 7 — Helpers vs ATCs

| Type | What it does | `@atc` |
|------|-------------|--------|
| Helper | Retrieves data (read-only, no state change) | No — optional `@step` for tracing |
| ATC | Performs an action that changes state | Yes — `@atc('TICKET-ID')` |

A GET that validates access control (403/401) is still a helper — the ATC is the action that established the context. The GET belongs *inside* the ATC as a verification step.

```typescript
// WRONG — bare GET as an ATC
@atc('TICKET-ID') async getCurrentUserUnauthorized() { ... }

// RIGHT — GET embedded inside the real action
@atc('TICKET-ID')
async loginWithInvalidCredentials(credentials: LoginPayload) {
  const [loginResp] = await this.apiPOST('/auth/login', credentials);
  const [meResp] = await this.apiGET('/auth/me');
  expect(loginResp.status()).toBe(401);
  expect(meResp.status()).toBe(401);
}
```

### ATC structure

```
1. Preconditions  -> received via parameters (not internal setup)
2. Action         -> POST / PUT / click / submit
3. Verification   -> optional GET or page check
4. Assertions     -> fixed assertions on expected outcome
5. Return         -> [response, body, payload] for API, void for UI
```

### ATC naming

Format: `{verb}{Resource}{Scenario}`

| Scenario | Suffix | Example |
|----------|--------|---------|
| Success | `Successfully` / `WithValidCredentials` | `createOrderSuccessfully` |
| Invalid input | `WithInvalid{X}` | `loginWithInvalidCredentials` |
| Not found | `WithNonExistent{X}` | `getUserWithNonExistentId` |
| Expired | `WithExpired{X}` | `loginWithExpiredToken` |

---

## 7. Fixtures (Layer 4)

Fixtures wire components together and expose them to tests. Four kinds:

| Fixture | Exposes | Opens browser? |
|---------|---------|----------------|
| `ApiFixture` | `api.users`, `api.orders`, ... | No |
| `UiFixture` | `ui.login`, `ui.checkout`, ... | Yes |
| `StepsFixture` | `steps.auth`, `steps.checkout`, ... | Depends on steps used |
| `TestFixture` | `api`, `ui`, `steps` in one object | Yes |

### TestFixture definition

```typescript
import { test as base } from '@playwright/test';
import { ApiFixture } from '@ApiFixture';
import { UiFixture } from '@UiFixture';
import { StepsFixture } from '@StepsFixture';

export const test = base.extend<{
  test: TestFixture;
  api: ApiFixture;
  ui: UiFixture;
  steps: StepsFixture;
}>({
  test: async ({ page, request }, use) => {
    const options = { page, request };
    const api = new ApiFixture(options);
    const ui = new UiFixture(options);
    const steps = new StepsFixture(options, api, ui);
    await use({ api, ui, steps, page, request });
  },
  api: async ({ request }, use) => { await use(new ApiFixture({ request })); },
  ui: async ({ page, request }, use) => { await use(new UiFixture({ page, request })); },
  steps: async ({ page, request }, use) => {
    const options = { page, request };
    const api = new ApiFixture(options);
    const ui = new UiFixture(options);
    await use(new StepsFixture(options, api, ui));
  },
});

export { expect } from '@playwright/test';
```

### Lazy initialisation

Playwright only instantiates the fixtures a test requests. API-only tests never open a browser.

```typescript
// No browser
test('TICKET-ID: should get orders', async ({ api }) => {
  await api.orders.getOrders({ limit: 10 });
});

// Browser opens
test('TICKET-ID: should view order list', async ({ ui }) => {
  await ui.orders.navigateTo();
});

// Browser opens, API and UI share the same context
test('TICKET-ID: should create via API and verify via UI', async ({ test }) => {
  const [, order] = await test.api.orders.createOrderSuccessfully(data);
  await test.ui.orders.verifyOrderVisibleInList(order.id);
});
```

### Fixture selection table

| Test type | Fixture | Browser? | Use when |
|-----------|---------|----------|----------|
| API only (integration) | `{ api }` | No | Pure API testing. Default for `tests/integration/**`. |
| UI only | `{ ui }` | Yes | UI-focused testing, no API setup. |
| Hybrid | `{ test }` | Yes | API setup + UI action + API verification. |
| Reusable precondition chains | `{ steps }` | Depends | 3+ ATCs repeated across 3+ files. |

### Registration pattern

```typescript
// tests/components/UiFixture.ts
export class UiFixture extends TestContext {
  readonly login: LoginPage;
  readonly checkout: CheckoutPage;

  constructor(options: TestContextOptions) {
    super(options);
    this.login = new LoginPage(options);
    this.checkout = new CheckoutPage(options);
  }
}
```

Creating a component without registering it in the fixture means tests cannot reach it. Registration is mandatory.

---

## 8. Steps Module (Layer 3.5)

When three or more ATCs run in the same order across three or more tests, the chain becomes a Step.

Steps are NOT ATCs: no `@atc` decorator, not reported individually to the TMS, purpose is eliminating repetition in **preconditions**.

```typescript
// tests/components/steps/AuthSteps.ts
import type { UiFixture } from '@UiFixture';
import type { ApiFixture } from '@ApiFixture';

export class AuthSteps {
  constructor(private ui: UiFixture, private api: ApiFixture) {}

  async setupAuthenticatedUser(credentials: Credentials) {
    await this.ui.auth.loginWithValidCredentials(credentials);
    await this.ui.profile.completeOnboardingSuccessfully();
    await this.ui.settings.enableFeatureFlagSuccessfully();
  }

  async setupUserWithCart(credentials: Credentials, products: string[]) {
    await this.setupAuthenticatedUser(credentials);
    for (const product of products) {
      await this.ui.cart.addToCartSuccessfully(product);
    }
  }
}
```

StepsFixture:

```typescript
// tests/components/StepsFixture.ts
export class StepsFixture extends TestContext {
  readonly auth: AuthSteps;

  constructor(options: TestContextOptions, api: ApiFixture, ui: UiFixture) {
    super(options);
    this.auth = new AuthSteps(ui, api);
  }
}
```

Usage:

```typescript
test('TICKET-ID: should display confirmation after checkout', async ({ steps, ui }) => {
  await steps.auth.setupUserWithCart(credentials, ['Laptop']);
  await ui.checkout.completeCheckoutSuccessfully();
  await expect(ui.page.locator('[data-testid="confirmation"]')).toBeVisible();
});
```

When to use Steps vs direct ATC calls:

| Scenario | Steps | Direct ATCs |
|----------|-------|-------------|
| Same 3+ ATC chain in 3+ test files | Yes | No |
| One-off precondition for one test | No | Yes |
| Complex setup with 5+ ATCs | Yes | No |
| Simple single-ATC setup | No | Yes |

---

## 9. Tests Validate FLOWS

Tests orchestrate ATCs; they do not implement logic. One test validates a complete flow with multiple assertions.

```typescript
// WRONG — six tests, same call, different field checks
test('should return orders', async ({ api }) => { ... });
test('should have referenceNumber', async ({ api }) => { ... });

// RIGHT — one test, complete contract
test('TICKET-ID: should create order with correct totals when discount is applied', async ({ api }) => {
  const [, order] = await api.orders.createOrderSuccessfully(orderData);
  const totals = await api.orders.getTotals({ orderId: order.id });
  expect(order.id).toBeDefined();
  expect(order.discountApplied).toBe(true);
  expect(totals.finalAmount).toBe(totals.baseAmount - totals.discountAmount);
});
```

Separate tests only when the scenario is fundamentally different (different precondition, role, or outcome).

Every `test()` must have the ticket ID as a prefix: `test('TICKET-ID: should {behavior} when {condition}', ...)`. One ticket per `describe`; never split a ticket across files. Multiple tickets can coexist in one file when they test different aspects of the same feature.

Test independence: no shared state, each test generates its own data via `TestContext` helpers or faker, never rely on test ordering.

---

## 10. Decorators — @atc and @step

```typescript
@atc('TICKET-ID')
async signInSuccessfully(payload: SignInPayload) { ... }

@atc('TICKET-ID', { softFail: true, severity: 'critical' })
async verifyOptionalField() { ... }

@step
async getCurrentUser() { ... }
```

| Aspect | `@atc` | `@step` |
|--------|--------|---------|
| Purpose | TMS traceability + tracing | Tracing only |
| Apply to | Layer 3 state-changing ATCs | Layer 3 read-only helpers |
| NDJSON export | Yes | No |

`@atc` options: `softFail` (failure logs but does not block), `severity` (critical/high/medium/low for reporting). Both decorators mask sensitive parameters (`password`, `token`, `secret`) in trace output.

Never apply decorators to Layer 2 base methods or private helpers. Detailed tracing mechanics live in a separate tracing reference.

`bun run kata:manifest` extracts every component and ATC into `kata-manifest.json` — use it to discover what exists without scanning the codebase.
