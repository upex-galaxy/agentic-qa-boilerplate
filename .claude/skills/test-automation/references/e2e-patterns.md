# E2E Patterns — Page Components, Locators, Waits

> **Subagent context**: when the test-automation Code phase is dispatched (Sequential, see SKILL.md §Subagent Dispatch Strategy), this file is part of the subagent's "Context docs" briefing component.

How to write a KATA `Page` component and E2E test that drives Playwright. Load when writing UI ATCs, picking locators, handling waits, or wiring API-assisted UI flows. Architecture, fixture selection, AAA, ATC naming, and test-file structure live in `kata-architecture.md` and `automation-standards.md` — this reference focuses on Playwright-specific mechanics.

---

## 1. Where UI code lives

```
tests/components/ui/
  UiBase.ts               # Layer 2 — Playwright helpers
  LoginPage.ts            # Layer 3 — one file per page/feature
  CheckoutPage.ts
tests/components/UiFixture.ts       # registers every Page component
tests/e2e/{module}/{verbFeature}.test.ts
tests/setup/ui-auth.setup.ts        # storageState generator (optional)
```

A Page component **is not** a 1:1 map of a URL. It is the smallest group of ATCs that share the same domain (login, checkout, product listing). Pages with more than ~15–20 ATCs should be split.

---

## 2. Page component skeleton

```typescript
import type { TestContextOptions } from '@TestContext';
import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

export interface LoginCredentials { email: string; password: string; }

export class LoginPage extends UiBase {
  // 1. Shared locators (only when used in 2+ ATCs)
  private readonly emailInput = () => this.page.getByTestId('login-email-input');
  private readonly passwordInput = () => this.page.getByTestId('login-password-input');
  private readonly submitButton = () => this.page.getByTestId('login-submit-button');

  // 2. Constructor
  constructor(options: TestContextOptions) { super(options); }

  // 3. Navigation helper
  async goto(): Promise<void> {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  // 4. ATCs
  @atc('TICKET-ID')
  async loginWithValidCredentials(data: LoginCredentials): Promise<void> {
    await this.emailInput().fill(data.email);
    await this.passwordInput().fill(data.password);
    await this.submitButton().click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }

  @atc('TICKET-ID')
  async loginWithInvalidCredentials(data: LoginCredentials): Promise<void> {
    await this.emailInput().fill(data.email);
    await this.passwordInput().fill(data.password);
    await this.submitButton().click();
    await expect(this.page.locator('[role="alert"]')).toBeVisible();
    await expect(this.page).toHaveURL(/.*\/login.*/);
  }
}
```

Method order inside the class: shared locators → constructor → navigation → ATCs. Private helpers at the bottom only if they are used 2+ times within the class.

---

## 3. Locator strategy

### Priority ladder

| Priority | Strategy | Use when |
|----------|---------|----------|
| 1 | `getByTestId('X')` or `locator('[data-testid="X"]')` | Always preferred — contract between dev and QA |
| 2 | `getByRole('button', { name: 'Submit' })` | Semantic elements with accessible name |
| 3 | `getByLabel('Email')` | Form inputs with an associated `<label>` |
| 4 | `getByText('Sign in')` | Unique visible text; fragile if copy changes |
| 5 | CSS / XPath (`button[type="submit"]`) | Last resort |

Never mix priorities in one selector (`.container [data-testid="x"]`). Never chain DOM structure (`div > form > button:nth-child(3)`). Never reach for `.btn-primary` or other class hooks — styling can change.

### Playwright selector syntax

```typescript
// CORRECT — getByTestId (preferred)
const loginButton = page.getByTestId('login-submit-button');

// CORRECT — locator with CSS attribute (also valid, same stability)
const loginButton = page.locator('[data-testid="login-submit-button"]');

// CORRECT — role-based when no testid exists
const loginButton = page.getByRole('button', { name: /submit/i });

// WRONG — CSS class (fragile, changes with styling)
const loginButton = page.locator('.btn-primary');

// WRONG — DOM structure (fragile, changes with layout refactors)
const loginButton = page.locator('div > form > button:last-child');
```

### `data-testid` naming contract (used in application code)

The product code owns the contract; tests only read it. Expect:

| Context | Convention | Pattern | Example |
|---------|-----------|---------|---------|
| Component root | camelCase | `{componentName}` | `data-testid="shoppingCart"` |
| Text input | snake_case | `{description}_input` | `data-testid="email_input"` |
| Button | snake_case | `{description}_button` | `data-testid="checkout_button"` |
| Link | snake_case | `{description}_link` | `data-testid="forgot_password_link"` |
| Section / container | snake_case | `{description}_section` | `data-testid="billing_section"` |
| List container | snake_case | `{description}_list` | `data-testid="order_list"` |
| List item | snake_case | `{description}_item` | `data-testid="order_item"` |
| Error message | snake_case | `{description}_error` | `data-testid="form_email_error"` |
| Loading state | snake_case | `{description}_loading` | `data-testid="products_loading"` |
| Empty state | snake_case | `{description}_empty_state` | `data-testid="products_empty_state"` |

General pattern: `{description}_{type}` where `type` identifies the element's role. Component roots use camelCase; all nested elements use snake_case.

### Locator anti-patterns

```typescript
// WRONG: CSS class selectors — break when styling changes
page.locator('.btn-primary');

// WRONG: DOM structure selectors — break when layout changes
page.locator('div > form > button:last-child');

// WRONG: Text that may change (copy updates, i18n)
page.getByText('Sign In'); // may change to 'Login' or 'Iniciar sesión'

// WRONG: Hardcoded index without reason
page.locator('[data-testid="card"]').nth(2); // why the third one?

// WRONG: Mixing CSS with data-testid
page.locator('.container [data-testid="button"]');

// RIGHT: Direct data-testid
page.getByTestId('login-submit-button');

// RIGHT: Role-based for semantic elements without testid
page.getByRole('button', { name: /submit/i });

// RIGHT: Filter by content when needed
page.getByTestId('product-card').filter({ hasText: 'iPhone' });

// RIGHT: Specific dynamic testid
page.getByTestId(`product-card-${productSlug}`);
```

### When a `data-testid` is missing

1. **Verify it exists** — use browser DevTools: `document.querySelectorAll('[data-testid]')` or the testid enumeration snippet in section 10.
2. **File a ticket** against the application repo with: component path, route, element description, and a proposed name following the naming contract above.
3. **Work around temporarily** with `getByRole` or `getByLabel` and leave a `// TODO: replace with getByTestId('X') when DEV adds the testid` comment.
4. Never ship a brittle CSS/XPath fallback without the TODO — otherwise it hides the tech debt.

### Inline vs shared locators

Locators default to **inline** inside the ATC. Extract to a `private readonly` arrow function on the class only when the **same** locator is used in 2+ ATCs of that component.

```typescript
// inline (default) — used once
await this.page.locator('[data-testid="forgot-password-link"]').click();

// shared — used in 2+ ATCs of this class
private readonly cartTotal = () => this.page.locator('[data-testid="cart-total"]');
private readonly productRow = (name: string) =>
  this.page.locator(`[data-product="${name}"]`);
```

Never put locators in a separate `locators/*.ts` file. Never wrap a single `page.fill()` or `page.click()` in a private helper.

### Lists and dynamic IDs

```typescript
// Multiple elements with the same testid
const cards = this.page.getByTestId('product-card');
await expect(cards).toHaveCount(3);
const first = cards.nth(0);

// Filter by text
const iphoneCard = cards.filter({ hasText: 'iPhone' });

// Dynamic id prefix
const editButton = this.page.locator('[data-testid^="edit-product-"]').first();

// Exact dynamic id
await this.page.getByTestId(`edit-product-${productId}`).click();
```

---

## 4. Waits — no timeouts, condition-first

Playwright auto-waits on locator actions (`click`, `fill`, `toBeVisible`). Explicit waits are only needed when timing depends on a specific network call, a navigation, or a DOM mutation that Playwright cannot infer.

### Allowed wait patterns

```typescript
// Network-driven
await this.page.waitForLoadState('networkidle');         // last resort — slow
await this.page.waitForResponse(r => r.url().includes('/api/cart') && r.ok());
await this.page.waitForURL(u => !u.pathname.includes('/login'));

// DOM-driven
await this.page.waitForSelector('[data-loaded="true"]');
await expect(locator).toBeVisible();
await expect(locator).toHaveCount(expected);
```

### Banned patterns

```typescript
// NEVER
await this.page.waitForTimeout(3000);                    // arbitrary, flaky
await this.page.waitForTimeout(500);                     // even small values
await setTimeout(...);                                   // node-level sleep
```

Retries masks the same problem (`retries: 0` in `playwright.config.ts`). If a test passes on retry, it is flaky — investigate the root cause.

### Conditional UI (popups, modals)

```typescript
const popup = this.page.locator('[role="dialog"]');
const isVisible = await popup.isVisible({ timeout: 2000 }).catch(() => false);
if (isVisible) await popup.locator('button:has-text("Close")').click();
```

### Intercepting the real backend call

```typescript
await Promise.all([
  this.page.waitForResponse(r => r.url().includes('/api/cart')),
  this.page.locator('[data-testid="add-to-cart"]').click(),
]);
```

---

## 5. UiBase helpers — interception

UiBase exposes two wrappers around Playwright's response APIs. Use them when a UI action fires a network call whose payload or status code is part of the assertion.

### `interceptResponse` — capture response from an action

```typescript
@atc('TICKET-ID')
async loginAndCaptureToken(credentials: LoginCredentials) {
  await this.goto();
  await this.emailInput().fill(credentials.email);
  await this.passwordInput().fill(credentials.password);

  const { responseBody, status } = await this.interceptResponse<LoginPayload, TokenResponse>({
    urlPattern: /\/auth\/login/,
    action: async () => { await this.submitButton().click(); },
  });

  expect(status).toBe(200);
  expect(responseBody?.access_token).toBeDefined();
  await this.page.waitForURL(url => !url.pathname.includes('/login'));
}
```

### `waitForApiResponse` — wait for an already-triggered response

```typescript
@atc('TICKET-ID')
async loadOrdersAndVerifyCount(): Promise<void> {
  await this.goto();
  await this.page.locator('[data-testid="apply-filter"]').click();

  const { responseBody } = await this.waitForApiResponse<void, Order[]>({
    urlPattern: /\/api\/orders/,
  });

  await expect(this.page.locator('[data-testid="order-row"]')).toHaveCount(responseBody?.length ?? 0);
}
```

Intercepted payloads attach automatically to the Allure report.

---

## 6. Fixed assertions and test-level assertions

Every UI ATC contains **fixed assertions** that validate the primary expected outcome:

```typescript
@atc('TICKET-ID')
async loginWithValidCredentials(data: LoginCredentials): Promise<void> {
  await this.emailInput().fill(data.email);
  await this.passwordInput().fill(data.password);
  await this.submitButton().click();

  // Fixed assertions — live inside the ATC
  await this.page.waitForURL(u => !u.pathname.includes('/login'));
  await expect(this.page).not.toHaveURL(/.*\/login.*/);
}
```

Additional, test-specific assertions go in the test file:

```typescript
test('TICKET-ID: should show welcome banner after login', async ({ ui }) => {
  await ui.login.loginWithValidCredentials(credentials);
  await expect(ui.page.locator('[data-testid="welcome-message"]')).toContainText('Welcome');
});
```

---

## 7. Test file template (E2E)

```typescript
import { test, expect } from '@TestFixture';

test.describe('TICKET-ID: Checkout flow', () => {
  let product: ProductCandidate | null;

  test.beforeAll(async ({ api }) => {
    // DISCOVER — no assertions (see test-data-management.md)
    product = await api.products.findAvailableProduct();
  });

  test('TICKET-ID: should complete checkout when cart is valid @critical', async ({ test: fixture }) => {
    if (!product) return test.skip(true, 'No available product');
    const { api, ui } = fixture;

    // ARRANGE — API setup, UI action, API verification
    await api.auth.loginSuccessfully(credentials);
    const checkoutData = ui.data.createCheckoutData();

    // ACT
    await ui.checkout.goto();
    await ui.checkout.completeCheckoutSuccessfully(checkoutData);

    // ASSERT (beyond the ATC's fixed assertions)
    const [, orders] = await api.orders.getOrdersSuccessfully({ customerId: product.customerId });
    expect(orders.length).toBeGreaterThan(0);
  });

  test('TICKET-ID: should show error with invalid email', async ({ ui }) => {
    if (!product) return test.skip(true, 'No available product');
    const invalid = ui.data.createCheckoutData({ email: 'invalid-email' });
    await ui.checkout.goto();
    await ui.checkout.completeCheckoutWithInvalidEmail(invalid);
  });
});
```

Rules applied in the skeleton above (all mandatory):

- `test` imported from `@TestFixture` (not `@playwright/test`).
- Ticket ID prefix in both `describe` and `test`.
- `beforeAll` discovers data without assertions; each test guards with `test.skip()` (see `test-data-management.md` §7).
- Dynamic data via `ui.data.*` / `api.data.*`, never hardcoded.
- Tags (`@critical`, `@smoke`, `@regression`) applied at the correct level.

---

## 8. Hybrid testing — API setup + UI flow

The fastest reliable pattern: set up state via API (no browser UI fiddling), drive the feature via UI, verify via API.

```typescript
test('TICKET-ID: should create order via UI and verify via API', async ({ test: fixture }) => {
  const { api, ui } = fixture;

  await api.auth.loginSuccessfully({ email, password });

  await ui.orders.goto();
  await ui.orders.createOrderSuccessfully({
    customerId: 123,
    guestEmail: ui.generateEmail('order-test'),
    confirmationNumber: ui.faker.string.alphanumeric(10),
  });

  const [, orders] = await api.orders.getOrdersSuccessfully({ customerId: 123 });
  expect(orders.length).toBeGreaterThan(0);
});
```

Pick the fixture by test shape (`automation-standards.md` §1 has the full matrix): `{ui}` for pure UI, `{test}` for hybrid, `{api}` for API-only.

---

## 9. Authenticated tests — storage state reuse

For suites where login is a precondition for most tests, log in once and reuse the resulting storage state.

```typescript
// tests/setup/ui-auth.setup.ts
import { expect, test as setup } from '@playwright/test';
import { config } from '@variables';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, request }) => {
  const response = await request.post(`${config.apiUrl}/auth/login`, {
    data: { email: config.testUser.email, password: config.testUser.password },
  });
  expect(response.ok()).toBeTruthy();

  const { access_token } = await response.json();
  await page.goto(config.baseUrl);
  await page.evaluate(token => localStorage.setItem('token', token), access_token);
  await page.context().storageState({ path: authFile });
});
```

```typescript
// playwright.config.ts (excerpt)
projects: [
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  {
    name: 'e2e',
    dependencies: ['setup'],
    use: { storageState: 'playwright/.auth/user.json' },
  },
],
```

Use API login (not UI login) inside the setup — faster and less fragile. For multi-role test runs, generate one storageState per role.

---

## 10. Common UI patterns

### Modal / dialog

```typescript
await expect(this.page.locator('[data-testid="confirm-modal"]')).toBeVisible();
await this.page.locator('[data-testid="confirm-btn"]').click();
await expect(this.page.locator('[data-testid="confirm-modal"]')).not.toBeVisible();
```

### Lists with dynamic count

```typescript
await this.page.waitForSelector('[data-testid="item-list"] [data-testid="item"]');
const items = this.page.locator('[data-testid="item-list"] [data-testid="item"]');
await expect(items).toHaveCount(expectedCount);
```

### Multi-step form

```typescript
await this.page.locator('[data-testid="step-1-field"]').fill(data.step1Value);
await this.page.locator('[data-testid="next-btn"]').click();
await expect(this.page.locator('[data-testid="step-2-form"]')).toBeVisible();
await this.page.locator('[data-testid="step-2-field"]').fill(data.step2Value);
await this.page.locator('[data-testid="submit-btn"]').click();
```

### Element states (loading / empty / error)

```typescript
await expect(this.page.getByTestId('products-loading')).toBeVisible();
await expect(this.page.getByTestId('products-empty-state')).toContainText('No products found');
await expect(this.page.getByTestId('products-error-state')).toBeVisible();
```

### Form field errors

```typescript
await expect(this.page.getByTestId('form-name-error')).toHaveText('Name is required');
await expect(this.page.getByTestId('form-email-error')).toHaveText('Invalid email');
```

### Debugging: enumerate all testids on a page

```typescript
test('dev-only: list testids on /login', async ({ page }) => {
  await page.goto('/login');
  const ids = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid]')).map(el => ({
      testId: el.getAttribute('data-testid'),
      tag: el.tagName,
      text: el.textContent?.slice(0, 50),
    })),
  );
  console.table(ids);
});
```

Use `playwright test --ui` (inspector) or `--debug` to step through locator resolution.

---

## 11. Running E2E tests

```bash
# Whole suite
bun run test:e2e

# One file
bun run test tests/e2e/auth/login.test.ts

# By tag
bun run test:e2e --grep @critical
bun run test:e2e --grep @smoke

# By browser (if multi-project configured)
bun run test:e2e --project=chromium
bun run test:e2e --project=firefox

# Interactive debugging
bun run test:ui
bun run test --debug tests/e2e/auth/login.test.ts
bun run test --trace on tests/e2e/auth/login.test.ts

# Report
bun run test:allure
```

---

## 12. Implementation checklist (E2E coding phase)

Before leaving the coding phase and running the review:

- [ ] Component extends `UiBase`, constructor takes `TestContextOptions` and calls `super`.
- [ ] Every ATC decorated with `@atc('TICKET-ID')` where the ID matches a real TMS case.
- [ ] Locators inline unless used in 2+ ATCs (then `private readonly` arrow).
- [ ] Locator priority respected (`getByTestId` first).
- [ ] Every ATC contains at least one fixed assertion.
- [ ] No `waitForTimeout`.
- [ ] New component registered in `UiFixture.ts`.
- [ ] Test file under `tests/e2e/{module}/`, name is `{verb}{Feature}.test.ts`.
- [ ] `test` imported from `@TestFixture`.
- [ ] Ticket ID prefix in describe/test.
- [ ] Data via `ui.data.*` / `api.data.*`, no hardcoding.
- [ ] `beforeAll` has no assertions; each test uses `test.skip()` guard.
- [ ] Tags (`@critical`, `@smoke`, `@regression`) applied.
- [ ] `bun run test <file>` passes.
- [ ] `bun run type-check` clean.
- [ ] `bun run lint` clean.
