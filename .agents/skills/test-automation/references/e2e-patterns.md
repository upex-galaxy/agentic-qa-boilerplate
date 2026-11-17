# E2E patterns: page components, locators, waits

> **Subagent context**: when the test-automation Code phase is dispatched (Sequential, see SKILL.md §Subagent Dispatch Strategy), this file is part of the subagent's "Context docs" briefing component.

How to write a KATA `Page` component and an E2E test that drives Playwright. Load it when you write UI ATCs, pick locators, handle waits or wire API-assisted UI flows. Architecture, fixture selection, AAA, ATC naming and test-file structure are in `kata-architecture.md` and `automation-standards.md`; this file covers the Playwright mechanics.

---

## 1. Where UI code lives

```
tests/components/ui/
  UiBase.ts               # Layer 2: Playwright helpers
  LoginPage.ts            # Layer 3: one file per page/feature
  CheckoutPage.ts
tests/components/UiFixture.ts       # registers every Page component
tests/e2e/{module}/{verbFeature}.test.ts
tests/setup/ui-auth.setup.ts        # storageState generator (optional)
```

A Page component is not a 1:1 map of a URL. It is the smallest group of ATCs that share a domain (login, checkout, product listing). Split a Page that passes about 15 to 20 ATCs.

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
  private readonly emailInput = () => this.page.getByTestId('email_input');
  private readonly passwordInput = () => this.page.getByTestId('password_input');
  private readonly submitButton = () => this.page.getByTestId('login_submit_button');

  // 2. Constructor
  constructor(options: TestContextOptions) { super(options); }

  // 3. Navigation helper
  async goto(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.page.locator('#email')).toBeVisible();
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

Method order inside the class: shared locators, constructor, navigation, ATCs. Private helpers go at the bottom, and only when the class uses them 2 or more times.

---

## 3. Locator strategy

### Priority ladder

| Priority | Strategy | Use when |
|----------|---------|----------|
| 1 | `getByTestId('X')` or `locator('[data-testid="X"]')` | Preferred: it is the contract between dev and QA |
| 2 | `getByRole('button', { name: 'Submit' })` | Semantic elements with accessible name |
| 3 | `getByLabel('Email')` | Form inputs with an associated `<label>` |
| 4 | `getByText('Sign in')` | Unique visible text; fragile if copy changes |
| 5 | CSS / XPath (`button[type="submit"]`) | Last resort |

Keep one priority per selector: no `.container [data-testid="x"]`, no DOM chains such as `div > form > button:nth-child(3)`, and no class hooks such as `.btn-primary`, because styling changes.

### `data-testid` naming contract (used in application code)

The product code owns the contract and tests only read it. Expect:

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

### Locator examples

```typescript
// WRONG: CSS class selectors break when styling changes
page.locator('.btn-primary');

// WRONG: DOM structure selectors break when layout changes
page.locator('div > form > button:last-child');

// WRONG: Text that may change (copy updates, i18n)
page.getByText('Sign In'); // may change to 'Login' or 'Iniciar sesión'

// WRONG: Hardcoded index without reason
page.locator('[data-testid="card"]').nth(2); // why the third one?

// WRONG: Mixing CSS with data-testid
page.locator('.container [data-testid="button"]');

// RIGHT: Direct data-testid
page.getByTestId('login_submit_button');

// RIGHT: Role-based for semantic elements without testid
page.getByRole('button', { name: /submit/i });

// RIGHT: Filter by content when needed
page.getByTestId('product_card').filter({ hasText: 'iPhone' });

// RIGHT: Specific dynamic testid
page.getByTestId(`product_card_${productSlug}`);
```

### When a `data-testid` is missing

1. Verify it is really missing in browser DevTools (`document.querySelectorAll('[data-testid]')`) or with the testid enumeration snippet in section 10.
2. File a ticket against the application repo with the component path, route, element description and a proposed name that follows the naming contract above.
3. Work around it temporarily with `getByRole` or `getByLabel` and leave a `// TODO: replace with getByTestId('X') when DEV adds the testid` comment.
4. A brittle CSS or XPath fallback ships only with that TODO, so the tech debt stays visible.

### Inline vs shared locators

Locators stay inline inside the ATC. Extract one to a `private readonly` arrow function only when the same locator is used in 2 or more ATCs of that component (`kata-architecture.md` §6 Rule 4).

```typescript
// inline (default): used once
await this.page.locator('[data-testid="forgot_password_link"]').click();

// shared: used in 2+ ATCs of this class
private readonly cartTotal = () => this.page.locator('[data-testid="cart_total"]');
private readonly productRow = (name: string) =>
  this.page.locator(`[data-product="${name}"]`);
```

Locators never go in a separate `locators/*.ts` file, and a single `page.fill()` or `page.click()` is not worth a private helper.

### Lists and dynamic IDs

```typescript
// Multiple elements with the same testid
const cards = this.page.getByTestId('product_card');
await expect(cards).toHaveCount(3);
const first = cards.nth(0);

// Filter by text
const iphoneCard = cards.filter({ hasText: 'iPhone' });

// Dynamic id prefix
const editButton = this.page.locator('[data-testid^="edit_product_"]').first();

// Exact dynamic id
await this.page.getByTestId(`edit_product_${productId}`).click();
```

---

## 4. Waits: conditions, never timeouts

Playwright auto-waits on locator actions (`click`, `fill`, `toBeVisible`). Add an explicit wait only when timing depends on a specific network call, a navigation or a DOM mutation that Playwright cannot infer.

### Allowed wait patterns

```typescript
// Network-driven
await this.page.waitForResponse(r => r.url().includes('/api/cart') && r.ok());
await this.page.waitForURL(u => !u.pathname.includes('/login'));

// DOM-driven
await expect(this.page.locator('[data-loaded="true"]')).toBeVisible();
await expect(locator).toBeVisible();
await expect(locator).toHaveCount(expected);
```

### Banned patterns

```typescript
// NEVER (arbitrary sleeps are flaky)
await this.page.waitForTimeout(3000);                    // arbitrary, flaky
await this.page.waitForTimeout(500);                     // even small values
await this.page.waitForSelector('[data-loaded="true"]'); // use expect(locator).toBeVisible()
await this.page.waitForLoadState('networkidle');         // never settles on apps that poll
await setTimeout(...);                                   // node-level sleep
```

Retries hide the same problem, so `playwright.config.ts` sets `retries: 0`. A test that passes on retry is flaky; find the root cause.

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
  this.page.locator('[data-testid="add_to_cart_button"]').click(),
]);
```

---

## 5. UiBase helpers: interception

UiBase wraps Playwright's response APIs twice. Use the wrappers when a UI action fires a network call whose payload or status code is part of the assertion.

### `interceptResponse`: capture the response of an action

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

### `waitForApiResponse`: wait for an already-triggered response

```typescript
@atc('TICKET-ID')
async loadOrdersAndVerifyCount(): Promise<void> {
  await this.goto();
  await this.page.locator('[data-testid="apply_filter_button"]').click();

  const { responseBody } = await this.waitForApiResponse<void, Order[]>({
    urlPattern: /\/api\/orders/,
  });

  await expect(this.page.locator('[data-testid="order_item"]')).toHaveCount(responseBody?.length ?? 0);
}
```

The Allure report receives intercepted payloads automatically.

---

## 6. Fixed assertions and test-level assertions

Every UI ATC holds fixed assertions that validate its primary expected outcome:

```typescript
@atc('TICKET-ID')
async loginWithValidCredentials(data: LoginCredentials): Promise<void> {
  await this.emailInput().fill(data.email);
  await this.passwordInput().fill(data.password);
  await this.submitButton().click();

  // Fixed assertions live inside the ATC
  await this.page.waitForURL(u => !u.pathname.includes('/login'));
  await expect(this.page).not.toHaveURL(/.*\/login.*/);
}
```

Extra, test-specific assertions go in the test file (`kata-architecture.md` §6 Rule 6):

```typescript
test('TICKET-ID: should show welcome banner after login', async ({ ui }) => {
  await ui.login.loginWithValidCredentials(credentials);
  await expect(ui.page.locator('[data-testid="welcome_message"]')).toContainText('Welcome');
});
```

---

## 7. Test file template (E2E)

```typescript
import { test, expect } from '@TestFixture';

test.describe('TICKET-ID: Validate checkout flow', () => {
  let product: ProductCandidate | null;

  test.beforeAll(async ({ api }) => {
    // DISCOVER, no assertions (see test-data-management.md)
    product = await api.products.findAvailableProduct();
  });

  test('TICKET-ID: should complete checkout when cart is valid @critical', async ({ test: fixture }) => {
    if (!product) return test.skip(true, 'No available product');
    const { api, ui } = fixture;

    // ARRANGE: API setup, UI action, API verification
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

The skeleton above applies these rules, and all of them are mandatory:

- `test` comes from `@TestFixture`, not `@playwright/test`.
- The ticket ID prefixes both `describe` and `test`.
- `beforeAll` discovers data without assertions and each test guards with `test.skip()` (`test-data-management.md` §7).
- Data comes from `ui.data.*` / `api.data.*`, never hardcoded.
- Tags (`@critical`, `@smoke`, `@regression`) sit at the correct level.

---

## 8. Hybrid testing: API setup plus UI flow

The fastest reliable pattern sets up state through the API, drives the feature through the UI and verifies through the API.

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

## 9. Authenticated tests: storage state reuse

When login is a precondition for most tests, log in once and reuse the resulting storage state.

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

Log in through the API inside the setup, which is faster and less fragile than UI login. For multi-role runs, generate one storageState per role.

---

## 10. Common UI patterns

### Modal / dialog

```typescript
await expect(this.page.locator('[data-testid="confirm_modal"]')).toBeVisible();
await this.page.locator('[data-testid="confirm_button"]').click();
await expect(this.page.locator('[data-testid="confirm_modal"]')).not.toBeVisible();
```

### Lists with dynamic count

```typescript
const items = this.page.locator('[data-testid="item_list"] [data-testid="item"]');
await expect(items).toHaveCount(expectedCount);
```

### Multi-step form

```typescript
await this.page.locator('[data-testid="step_1_input"]').fill(data.step1Value);
await this.page.locator('[data-testid="next_button"]').click();
await expect(this.page.locator('[data-testid="step_2_section"]')).toBeVisible();
await this.page.locator('[data-testid="step_2_input"]').fill(data.step2Value);
await this.page.locator('[data-testid="submit_button"]').click();
```

### Element states (loading / empty / error)

```typescript
await expect(this.page.getByTestId('products_loading')).toBeVisible();
await expect(this.page.getByTestId('products_empty_state')).toContainText('No products found');
await expect(this.page.getByTestId('products_error_state')).toBeVisible();
```

### Form field errors

```typescript
await expect(this.page.getByTestId('form_name_error')).toHaveText('Name is required');
await expect(this.page.getByTestId('form_email_error')).toHaveText('Invalid email');
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
bun run allure:generate
```

---

## 12. Implementation checklist (E2E coding phase)

Tick these before leaving the coding phase for the review:

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
- [ ] `bun run types:check` clean.
- [ ] `bun run lint:check` clean.
