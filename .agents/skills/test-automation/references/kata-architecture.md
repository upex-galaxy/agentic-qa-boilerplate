# KATA architecture: layers, fixtures, ATCs, Steps

The full reference for the Komponent Action Test Architecture (KATA). Load it when you design a component, pick a fixture, wire an ATC or build a Steps chain.

> **Canonical formula — the one sentence every KATA surface must agree with:**
>
> **KATA organises automation in four layers with a single direction of dependency: TestContext,
> Base, domain Components and Fixtures. Steps is an optional intermediate layer between Components
> and Fixtures. Test files consume the Fixtures — they are not a layer.**
>
> Short form, for a chip or a title: **"four named layers, plus optional Steps"**. Never publish a
> bare number. Banned on every surface: "three layers", "five layers", "6 layers", "Test files" as
> a layer, and the acronym expanded with a C ("Component Action Test Architecture"). The expansion is
> **Komponent Action Test Architecture**: the K lives only in the name; the layer is "domain
> Components", spelled normally. DRY zones that are NOT layers: `tests/utils/`, `tests/data/`,
> `config/`. Consumers: `tests/e2e/`, `tests/integration/`.

---

## 1. The four layers

```
Layer 4 — Fixtures (DI)
    TestFixture, ApiFixture, UiFixture
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
    Playwright drivers (page, request), config, environment, DataFactory
```

| Layer | Responsibility | Typical files |
|-------|---------------|---------------|
| 1 — TestContext | Playwright drivers, config, env, DataFactory (faker-backed data) | `TestContext.ts` |
| 2 — Base | HTTP and Playwright helpers | `ApiBase.ts`, `UiBase.ts` |
| 3 — Domain | Business logic, ATCs | `UsersApi.ts`, `LoginPage.ts` |
| 3.5 — Steps | Reusable ATC chains for preconditions | `AuthSteps.ts`, `CheckoutSteps.ts` |
| 4 — Fixtures | DI entry point | `TestFixture.ts`, `ApiFixture.ts`, `UiFixture.ts` |
| Tests | Orchestrate ATCs into scenarios | `tests/e2e/**`, `tests/integration/**` |

A component in a higher layer may use a lower layer. A lower layer never reaches up.

---

## 2. Directory structure

```
/config
    variables.ts                 # Single source for env vars + URLs

/tests
  KataReporter.ts               # Custom Playwright reporter
  /components
    TestContext.ts              # Layer 1
    ApiFixture.ts               # Layer 4 (API only)
    UiFixture.ts                # Layer 4 (UI only)
    TestFixture.ts              # Layer 4 (unified: api + ui)

    /api
      ApiBase.ts                # Layer 2
      UsersApi.ts               # Layer 3
    /ui
      UiBase.ts                 # Layer 2
      LoginPage.ts              # Layer 3
    /steps
      ExampleSteps.ts           # Layer 3.5 (reference pattern)

  /data
    DataFactory.ts              # Typed faker-backed factories
    types.ts                    # Payload / domain TypeScript types
    constants.ts                # Static test values, boundaries (create-on-demand)
    /fixtures                   # Static JSON/CSV rows
    /mocks                      # Canned mock/stub responses (create-on-demand)
  /integration/{module}         # API-only tests
  /e2e/{module}                 # UI (+API) tests
  /setup
    global.setup.ts             # Global setup (+ api-auth / ui-auth setup projects)
  /teardown
    global.teardown.ts          # Global teardown
  /utils
    decorators.ts               # @atc, @step
```

`tests/data/` canonical TypeScript files (naming is fixed; create only when the scope needs them):

| File | Holds | Example members |
|------|-------|-----------------|
| `DataFactory.ts` | Typed, faker-backed factories that build payloads at runtime | `generateUserPayload()`, `generateOrderPayload()` |
| `types.ts` | Payload / domain TypeScript types shared by factories and ATCs | `UserPayload`, `OrderPayload` |
| `constants.ts` | Static test values, magic numbers, boundary constants | `MAX_ORDER_ITEMS`, `DEFAULT_PAGE_SIZE` |

Factories generate fresh runtime data. `tests/data/fixtures/` and `tests/data/mocks/` hold committed static data; their naming and folder conventions are in `automation-standards.md` §6.

Use the import aliases, never relative imports:

```typescript
import { config, env } from '@variables';
import { ApiBase } from '@api/ApiBase';
import { LoginPage } from '@ui/LoginPage';
import { atc, step } from '@utils/decorators';
import { TestContext, type TestContextOptions } from '@TestContext';
```

---

## 3. TestContext (Layer 1)

TestContext holds the Playwright drivers and the global utilities. Every higher layer extends it or receives its options.

```typescript
interface TestContextOptions {
  page?: Page;                   // optional: API tests don't need it
  request?: APIRequestContext;   // optional: some setups don't need it
  environment?: Environment;
}
```

It holds the Playwright drivers (`page`, `request`), selects URLs and credentials from `config` based on `TEST_ENV`, and exposes the environment label (`env`) and `DataFactory` (through `data`). It has no logger and no `faker` field; faker lives inside `tests/data/DataFactory.ts`. Playwright logic belongs in UiBase and HTTP logic in ApiBase.

---

## 4. Base Components (Layer 2)

### ApiBase

Wraps `APIRequestContext` with type-safe HTTP helpers that return tuples:

```typescript
protected async apiGET<T>(path: string): Promise<[APIResponse, T]>
protected async apiPOST<T, P>(path: string, payload: P): Promise<[APIResponse, T, P]>
protected async apiPUT<T, P>(path: string, payload: P): Promise<[APIResponse, T, P]>
protected async apiPATCH<T, P>(path: string, payload: P): Promise<[APIResponse, T, P]>
protected async apiPOSTForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<[APIResponse, T]>
protected async apiDELETE<T>(path: string): Promise<[APIResponse, T]>
```

### UiBase

Extends `TestContext`. Adds Playwright helpers: response interception, network waiting, storage-state snapshots, Allure attachments.

Anything that needs `PageContext` goes in UiBase, anything that needs `APIRequestContext` goes in ApiBase, and anything agnostic (Allure attachments, string helpers) goes in `tests/utils/`.

**Why E2E API calls carry the browser session.** `ApiBase`'s `request` getter returns `this._page.request` whenever a page exists and falls back to the standalone `APIRequestContext` only in API-only fixtures (`tests/components/api/ApiBase.ts`). `page.request` shares cookies and storage with the browser, so under `{ test }` or `{ ui }` the UI session cookie authenticates an API call. A negative auth test (clear the Bearer token, expect 401) therefore belongs under `{ api }`, where no cookie exists. Under `{ test }` the cookie still authenticates and the test gets 200.

---

## 5. Domain Components (Layer 3)

One component per file, with at most 15 to 20 ATCs. A component groups related ATCs, has a name that says what is in it and does not depend on other components. Split it when it passes about 500 lines, mixes unrelated responsibilities, makes a specific ATC hard to find, or no longer matches its name.

| Type | Class | File |
|------|-------|------|
| API | `{Resource}Api` | `{Resource}Api.ts` |
| UI | `{Page}Page` | `{Page}Page.ts` |

Order inside the class: constructor, navigation (UI only), helpers (no decorator or `@step`), then ATCs (`@atc`).

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

An ATC (Acceptance Test Case) is a complete test case, a mini-flow, and never a single interaction. Each ATC maps 1:1 to a ticket through `@atc('TICKET-ID')`.

### Rule 1: complete flow

```typescript
// WRONG: single interaction
@atc('TICKET-ID') async clickLoginButton() { await this.page.click('#login'); }

// RIGHT: complete mini-flow
@atc('TICKET-ID')
async loginWithValidCredentials(data: LoginData) {
  await this.page.goto('/login');
  await this.page.locator('#email').fill(data.email);
  await this.page.locator('#password').fill(data.password);
  await this.page.locator('button[type="submit"]').click();
  await expect(this.page).toHaveURL(/.*dashboard.*/);
}
```

### Rule 2: TC identity is precondition plus action

A TC is defined by two elements: the precondition (state) and the action (trigger). Every expected result from the same precondition and action is an assertion of the same TC, whichever panel or endpoint it validates.

```
// WRONG: three TCs share the same precondition and action
TC-A: Open published product -> verify Pricing block
TC-B: Open published product -> verify Reviews block
TC-C: Open published product -> verify page structure

// RIGHT: one TC with all assertions
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

A TC differs only when the precondition or the action changes. Checking a different field of the same response does not make a new TC.

### Rule 3: equivalence partitioning

Same expected output = one parameterized ATC.

```typescript
// WRONG: three ATCs, same output (HTTP 401)
@atc('T1') async loginWithWrongEmail() {}
@atc('T2') async loginWithWrongPassword() {}
@atc('T3') async loginWithEmptyFields() {}

// RIGHT: one parameterized ATC
@atc('T1')
async loginWithInvalidCredentials(payload: LoginPayload) {
  // Test file parameterizes different invalid inputs; all produce 401
}
```

Different status codes, UI states or business outcomes are separate ATCs. The same outcome with different data is one parameterized ATC. Minor conditional variations inside the same behavior are fine; a fundamentally different behavior is its own ATC.

> Rule 3 removes duplicates inside one partition. It does not authorize collapsing distinct partitions, boundaries or states into one ATC, and it does not replace Boundary Value Analysis. One AC still maps to several ATCs (1:N): one per partition, boundary case and state transition. The derivation canon and its triggers are in `agentic-qa-core/references/test-design-doctrine.md`.

### Rule 4: locators inline

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

A locator used once stays inline, and a single `page.fill()` or `page.click()` is never worth wrapping in a helper.

### Rule 5: ATCs do not call ATCs

ATCs are atomic. A chain reused across test files goes in the Steps module (§8).

```typescript
// WRONG
@atc('TICKET-ID')
async checkoutWithNewUser() {
  await this.signupSuccessfully(userData);   // calling an ATC!
  await this.addToCartSuccessfully(product);
}

// RIGHT: test file orchestrates, or Steps module
test('TICKET-ID: should checkout with new user', async ({ ui }) => {
  await ui.signup.signupWithValidCredentials(userData);
  await ui.cart.addToCartSuccessfully(product);
});
```

Lint checks this: `kata/atc-no-atc-call` flags `this.<atcMethod>(` inside another `@atc` method.

### Rule 6: fixed assertions inside, flow assertions outside

Fixed assertions (status code, required fields, URL redirect) go inside the ATC. Test-level assertions, the business outcomes that combine several ATCs, go in the test file.

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

### Rule 7: helpers vs ATCs

| Type | What it does | `@atc` |
|------|-------------|--------|
| Helper | A GET that only prepares data or reads context another step needs | No (optional `@step` for tracing) |
| ATC | An action that changes state, or a GET whose response is the business outcome under test | Yes, `@atc('TICKET-ID')` |

Ask whether the GET is the subject of the test case. When the TC's expected result is what a read endpoint returns (the right business data and shape, 401 without auth, 403 for the wrong role, 404 for an unknown id), that GET is an ATC: `api-patterns.md` §5 names one ATC per expected outcome, reads included. A GET that only fetches data for a later step is a helper. A GET that confirms an action's effect sits inside that action's ATC as a verification step. A GET whose only assertion is status 200 verifies no business outcome, so it is a disguised helper (`planning-playbook.md`, "Disguised helpers").

```typescript
// WRONG: a data-preparation GET wearing @atc (no business outcome asserted)
@atc('TICKET-ID') async getOrderForCheckout(id: string) { /* status 200 only */ }

// RIGHT: the GET is the outcome under test (access control on a read endpoint)
@atc('TICKET-ID')
async getCurrentUserUnauthorized(): Promise<[APIResponse, ApiErrorResponse]> {
  const [response, body] = await this.apiGET<ApiErrorResponse>('/auth/me');
  expect(response.status()).toBe(401);
  expect(body.error).toBeDefined();
  return [response, body];
}

// RIGHT: a GET confirming an action stays inside that action's ATC
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

Fixtures wire components together and expose them to tests. There are three kinds; `tests/components/TestFixture.ts` is the source of truth.

| Fixture | Exposes | Opens browser? |
|---------|---------|----------------|
| `ApiFixture` | `api.users`, `api.orders`, ... | No |
| `UiFixture` | `ui.login`, `ui.checkout`, ... | Yes |
| `TestFixture` | `test.api` + `test.ui` in one object (shared context) | Yes |

Steps classes are not a fixture. They live in `tests/components/steps/` and tests instantiate them directly (§8).

### TestFixture definition

The real file extends Playwright's `test` with the three fixtures. Simplified shape:

```typescript
import { test as base } from '@playwright/test';
import { ApiFixture } from '@ApiFixture';
import { UiFixture } from '@UiFixture';

export const test = base.extend<{
  test: TestFixture;   // TestFixture extends TestContext, holds .api + .ui
  api: ApiFixture;
  ui: UiFixture;
}>({
  test: async ({ page, request }, use) => {
    await use(new TestFixture(page, request));
  },
  api: async ({ request }, use) => { await use(new ApiFixture({ request })); },
  ui: async ({ page, request }, use) => { await use(new UiFixture({ page, request })); },
});

export { expect } from '@playwright/test';
```

### Lazy initialisation

Playwright instantiates only the fixtures a test requests, so API-only tests never open a browser.

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

A reusable precondition chain (3+ ATCs repeated across 3+ files) is not a fixture. It goes in a Steps class (§8), instantiated directly in the test.

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

Register every new component in its fixture: an unregistered component is unreachable from tests.

---

## 8. Steps Module (Layer 3.5)

When three or more ATCs run in the same order across three or more tests, the chain becomes a Step.

Steps are not ATCs: they carry no `@atc` decorator and the TMS does not receive them individually. Their purpose is to remove repetition in preconditions.

The real pattern is `tests/components/steps/ExampleSteps.ts`: a Steps class extends `TestContext`, takes `TestContextOptions` in its constructor and drives `this._page` / `this._request` directly. It needs no fixture registration.

```typescript
// tests/components/steps/AuthSteps.ts
import type { TestContextOptions } from '@TestContext';
import { TestContext } from '@TestContext';

export class AuthSteps extends TestContext {
  constructor(options: TestContextOptions = {}) {
    super(options);
  }

  async authenticateUser(email: string, password: string): Promise<{ token: string }> {
    if (!this._request) {
      throw new Error('Request context not set. Pass { request } in constructor options.');
    }
    const response = await this._request.post('/api/auth/login', {
      data: { email, password },
    });
    const body = await response.json();
    return { token: body.token };
  }

  // Object param: 3+ arguments never go positional (see typescript-patterns.md
  // §1). Three bare strings also read identically at the call site, so
  // swapping the last two is a silent bug.
  async navigateAsAuthenticatedUser(args: { path: string, email: string, password: string }) {
    const { path, email, password } = args;
    if (!this._page || !this._request) {
      throw new Error('Page and Request context must be set.');
    }
    const auth = await this.authenticateUser(email, password);
    await this._page.evaluate(token => localStorage.setItem('authToken', token), auth.token);
    await this._page.goto(path);
    return auth;
  }
}
```

Usage: instantiate the Steps class directly in the test (there is no `{ steps }` fixture):

```typescript
import { AuthSteps } from '@steps/AuthSteps';

test('TICKET-ID: should display confirmation after checkout', async ({ ui, page, request }) => {
  const steps = new AuthSteps({ page, request });
  await steps.navigateAsAuthenticatedUser({ path: '/checkout', email: config.testUser.email, password: config.testUser.password });
  await ui.checkout.completeCheckoutSuccessfully();
  await expect(page.locator('[data-testid="confirmation"]')).toBeVisible();
});
```

A one-off precondition or a single-ATC setup uses direct ATC calls. A setup of 5 or more ATCs is a Step even before it repeats.

---

## 9. Tests validate flows

Tests orchestrate ATCs and implement no logic. One test validates a complete flow with several assertions.

```typescript
// WRONG: six tests, same call, different field checks
test('should return orders', async ({ api }) => { ... });
test('should have referenceNumber', async ({ api }) => { ... });

// RIGHT: one test, complete contract
test('TICKET-ID: should create order with correct totals when discount is applied', async ({ api }) => {
  const [, order] = await api.orders.createOrderSuccessfully(orderData);
  const totals = await api.orders.getTotals({ orderId: order.id });
  expect(order.id).toBeDefined();
  expect(order.discountApplied).toBe(true);
  expect(totals.finalAmount).toBe(totals.baseAmount - totals.discountAmount);
});
```

Split into separate tests only when the scenario is fundamentally different (different precondition, role or outcome).

Every `test()` starts with the ticket ID: `test('TICKET-ID: should {behavior} when {condition}', ...)`. Use one ticket per `describe` and keep a ticket in one file. A file may hold several tickets when they test different aspects of the same feature.

Tests are independent: no shared state, each test generates its own data through `TestContext` helpers or faker, and none relies on test order.

---

## 10. Decorators: @atc and @step

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

`@atc` options: `softFail` (a failure logs but does not block) and `severity` for reporting. `severity` takes Allure's vocabulary, `'blocker' | 'critical' | 'normal' | 'minor' | 'trivial'` (`tests/utils/decorators.ts`), because the value goes straight to Allure. The `critical/high/medium/low` scale of the review checklists is a type error here. Both decorators mask sensitive parameters (`password`, `token`, `secret`) in trace output.

Decorators stay off Layer 2 base methods and private helpers. Tracing mechanics are in `atc-tracing.md`.

`bun run kata:manifest` extracts every component and ATC into `kata-manifest.json`. Load the manifest before proposing any new Component or ATC (Critical Rule #12 in `AGENTS.md`). The manifest is the registry of record, not the file system, and Husky enforces its freshness on commit (`bun run kata:manifest:check`).

---

## 11. Migrating an existing suite to KATA

This is for a project that already has Playwright tests and adopts this boilerplate. Migrate one area at a time and keep the old tests running until the replacement is proven.

1. Find ATC candidates. Read the current tests for blocks that repeat, map each to a Jira/Xray test case, and start with the most reused. A block with no test case behind it goes to `/test-documentation` first (signed ROI, `../SKILL.md` §"TC source gate"); this stage does not create the test case. Check `kata-manifest.json` first (Critical Rule #12): the boilerplate may already ship the component.
2. Adapt Layers 1-2 and leave them in place. `TestContext`, `ApiBase` and `UiBase` ship in `tests/components/`; wire your URLs and credentials through `config/variables.ts` and `.env` (`/test-framework-adaptation` does this).
3. Extract the first component. Pick one functional area, create `{Resource}Api` or `{Page}Page`, move its methods in as ATCs with `@atc('{TICKET-ID}')`, helpers with `@step`.
4. Register it in the fixture. Add it to `ApiFixture` / `UiFixture` (`tests/components/`), then rewrite ONE test to use `{ api }` / `{ ui }` / `{ test }` per the fixture selection table (§7).
5. Migrate progressively. One component per change, legacy tests running in parallel, each new ATC shown to behave like the code it replaces before the legacy code goes. Run `bun run kata:manifest` after each.
6. Turn on traceability last. Once ATCs carry real ticket ids, enable the TMS write-back (`AUTO_SYNC`, see `ci-integration.md` §5) and confirm the first synced run in Jira/Xray.

