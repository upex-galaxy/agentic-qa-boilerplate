# Automation Standards

> Standards and conventions for the KATA Framework implementation.

---

## 1. ATC Fundamental Principles

### 1.1 Equivalence Partitioning

**Every ATC must represent a unique expected output.**

This is the most important rule for creating ATCs. An ATC is a complete test case, and each test case should validate a unique outcome.

**Rule**: If two ATCs have the same expected output → they should be ONE ATC with parameterization.

```typescript
// ❌ WRONG - These 3 ATCs have the SAME output (401 error)
@atc('TK-101')
async signInWithWrongPassword() { ... }  // → 401

@atc('TK-102')
async signInWithWrongEmail() { ... }     // → 401

@atc('TK-103')
async signInWithEmptyFields() { ... }    // → 401

// ✅ CORRECT - ONE ATC that covers invalid credentials (same output)
@atc('TK-101')
async signInWithInvalidCredentials(payload: SignInPayload) {
  // The test file can parameterize different invalid inputs
  // All lead to the same output: 401 error
}
```

**When to create multiple ATCs:**

- Different HTTP status codes (200 vs 401 vs 404)
- Different UI states (success redirect vs error message vs field validation)
- Different business outcomes (order created vs order rejected)

**When to use ONE parameterized ATC:**

- Same output with different input variations
- Same error message for different invalid inputs
- Same redirect for different valid data

**Conditionals in ATCs:**

Fixed assertions validate the invariant output. Use conditionals sparingly for slight output variations within the same behavior. If the actions or behavior fundamentally differ, create a separate ATC.

```typescript
// ✅ ACCEPTABLE - Minor conditional for slight output variation
@atc('TK-101')
async createOrderSuccessfully(payload: OrderPayload) {
  const [response, body] = await this.apiPOST<Order, OrderPayload>('/orders', payload);
  expect(response.status()).toBe(201);
  expect(body.id).toBeDefined();

  // Slight variation: express orders get expedited status
  if (payload.isExpress) {
    expect(body.status).toBe('expedited');
  } else {
    expect(body.status).toBe('pending');
  }
}

// ❌ WRONG - Behavior is fundamentally different, should be separate ATCs
@atc('TK-101')
async processPayment(payload: PaymentPayload) {
  if (payload.type === 'refund') {
    // Completely different endpoint and behavior
    await this.apiPOST('/refunds', payload);
  } else {
    await this.apiPOST('/payments', payload);
  }
}
```

### 1.2 Locators Inside ATCs (No Abstraction)

**All locators must be defined inline within ATCs. No separate locator objects or helper methods for single Playwright actions.**

KATA eliminates the traditional Page Object pattern of storing locators separately. Why?

1. **Locators are rarely reused** - Most locators are used in only one or two places
2. **Playwright is already simple** - `page.locator()` and `page.fill()` are one-liners
3. **Abstractions add complexity** - Helper methods obscure what the test actually does
4. **Maintenance is harder** - Locator files become outdated and disconnected from tests

```typescript
// ❌ WRONG - Unnecessary helper methods
class SignupPage extends UiBase {
  private async fillEmail(email: string) {
    await this.page.locator('#email').fill(email);
  }

  @atc('TK-101')
  async signupSuccessfully(data: SignUpData) {
    await this.fillEmail(data.email); // Why abstract a one-liner?
  }
}

// ✅ CORRECT - Locators inline within ATCs
class SignupPage extends UiBase {
  @atc('TK-101')
  async signupWithValidCredentials(data: SignUpData) {
    await this.goto();

    // Locators defined and used inline
    await this.page.locator('#email').fill(data.email);
    await this.page.locator('#password').fill(data.password);
    await this.page.locator('button[type="submit"]').click();

    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

**Exception - Shared Locators in Constructor:**

If a locator is used in **more than one ATC**, you may extract it to a constructor property. This is a **recommendation**, not a rule.

**Option 1: data-testid string (Preferred)**

```typescript
class CheckoutPage extends UiBase {
  // Store just the testid string - simple and clear
  private readonly cartTotalTestId = 'cart-total';

  @atc('TK-101')
  async addProductSuccessfully(product: string) {
    await expect(this.page.getByTestId(this.cartTotalTestId)).toContainText('$');
  }
}
```

**Option 2: Arrow function returning Locator**

```typescript
class CheckoutPage extends UiBase {
  // Arrow function for complex locators or dynamic selectors
  private readonly cartTotal = () => this.page.locator('[data-testid="cart-total"]');
  private readonly productRow = (name: string) => this.page.locator(`[data-product="${name}"]`);

  @atc('TK-101')
  async addProductSuccessfully(product: string) {
    await expect(this.cartTotal()).toContainText('$');
    await this.productRow(product).click();
  }
}
```

**When NOT to extract:**

- HTML roles that rarely change (e.g., `role="dialog"`, `role="alert"`)
- Standard form elements (`button[type="submit"]`)
- Locators used only once

**When to extract to UiBase:**

- If a locator is used across **multiple components** (rare), put it in `UiBase`

### 1.3 No Unnecessary Helpers

**If Playwright already does it in one line, don't create a helper method.**

ATCs should be self-contained. The only justification for a helper is:

1. The logic doesn't exist in Playwright
2. It's reused across MANY ATCs (5+)
3. It involves complex setup (not just a locator + action)

```typescript
// ❌ WRONG - fillEmail is just page.fill() - Playwright already does this
private async fillEmail(email: string) {
  await this.page.locator('#email').fill(email);
}

// ❌ WRONG - submitForm is just click() - Playwright already does this
private async submitForm() {
  await this.page.locator('button[type="submit"]').click();
}

// ✅ CORRECT - Complex setup that Playwright doesn't provide
private generateSecurePassword(): string {
  return `${this.faker.internet.password(12)}!1A`;
}

// ✅ CORRECT - Reused in 10+ ATCs across components
private async waitForLoadingComplete() {
  await this.page.waitForSelector('[data-loading="false"]');
  await this.page.waitForLoadState('networkidle');
}
```

### 1.4 ATC Composition Rules

**ATCs must NOT call other ATCs.** ATCs are atomic mini-flows.

Think of ATCs like Gherkin scenarios:

- **Given**: Steps (data passed as arguments)
- **When**: The action being tested
- **Then**: Expected outcome (fixed assertions)

```typescript
// ❌ WRONG - ATC calling another ATC
@atc('TK-101')
async checkoutWithNewUser(userData: UserData) {
  await this.signupWithValidCredentials(userData);  // Another ATC - DON'T DO THIS
  await this.addToCartSuccessfully(product);
}

// ✅ CORRECT - ATCs are atomic, combined in test files
test('TK-XXX: should checkout with new user', async ({ ui, api }) => {
  // Each ATC is called separately
  await ui.signup.signupWithValidCredentials(userData);
  await ui.cart.addToCartSuccessfully(product);
  await ui.checkout.completeCheckoutSuccessfully();
});
```

**Why this matters:**

- ATCs remain atomic and reusable
- Traceability is maintained (each ATC = one Jira/Xray test case)
- Failures are easier to diagnose
- Test files orchestrate the flow, ATCs execute actions

**For reusable step chains, see Section 1.7: Steps Module**

### 1.5 Test Data Strategy

KATA distinguishes between two types of test data:

#### Pre-Execution Variables (Static)

Defined before test runs in `config/variables.ts` or environment files:

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

#### Dynamic Variables (Runtime)

Generated during test execution using `TestContext` utilities:

```typescript
test('TK-XXX: should create user with dynamic data', async ({ api }) => {
  // Dynamic data generated at runtime
  const userData = api.generateUserData();
  await api.users.createUserSuccessfully(userData);
});
```

#### Data Directory Structure

```
/tests
└── /data
    ├── /fixtures          # JSON, CSV for parameterized tests
    │   ├── users.json
    │   └── products.csv
    ├── /uploads           # Files for upload tests
    │   ├── sample.pdf
    │   └── image.png
    └── /downloads         # Download destination (gitignore)
```

#### Parameterization in Tests

For data-driven testing, use Playwright's built-in parameterization:

```typescript
// Load test data from JSON
import usersData from '@data/fixtures/users.json';

for (const user of usersData) {
  test(`signup with ${user.type} user`, async ({ ui }) => {
    await ui.signup.signupWithValidCredentials({
      email: user.email,
      password: user.password,
    });
  });
}
```

**Data flow**: Files → Test arguments → ATC arguments

### 1.6 Stability (Anti-Flakiness)

KATA prioritizes **deterministic tests** over retry mechanisms.

#### No Retries by Default

```typescript
// playwright.config.ts
export default defineConfig({
  retries: 0, // KATA recommendation: investigate failures, don't mask them
});
```

**Why no retries?**

- If a test fails, investigate immediately
- Retries can mask real issues (environment, test code bugs, race conditions)
- Passing on retry is a red flag, not a success

#### Avoid Hardcoded Waits

```typescript
// ❌ WRONG - Hardcoded wait
await page.waitForTimeout(3000);

// ✅ CORRECT - Wait for specific condition
await page.waitForSelector('[data-loaded="true"]');
await page.waitForLoadState('networkidle');

// ✅ CORRECT - Intercept network request
await page.waitForResponse(resp => resp.url().includes('/api/data'));
```

#### Conditional Waits (Business Logic)

For unpredictable UI states (e.g., popup that may or may not appear):

```typescript
// ✅ ACCEPTABLE - Conditional wait for business logic
const popup = page.locator('[role="dialog"]');
const isVisible = await popup.isVisible({ timeout: 2000 }).catch(() => false);

if (isVisible) {
  await popup.locator('button:has-text("Close")').click();
}
// Continue with test regardless
```

#### Understand Backend Dependencies

Frontend actions often depend on backend requests. Instead of arbitrary waits, intercept:

```typescript
// ✅ CORRECT - Wait for API response before asserting
await Promise.all([
  page.waitForResponse(resp => resp.url().includes('/api/cart')),
  page.locator('[data-testid="add-to-cart"]').click(),
]);
```

### 1.7 Steps Module

When multiple tests need the same sequence of ATCs, create a **Steps** component.

**Problem**: Repetitive ATC chains across test files

```typescript
// Repeated in 10 test files - hard to maintain
test('TK-XXX: should complete test scenario', async ({ ui }) => {
  await ui.auth.loginSuccessfully(credentials);
  await ui.profile.completeOnboardingSuccessfully();
  await ui.settings.enableFeatureSuccessfully();
  // actual test...
});
```

**Solution**: Steps module

```typescript
// tests/components/steps/AuthSteps.ts
import { UiFixture } from '@UiFixture';

export class AuthSteps {
  constructor(private ui: UiFixture) {}

  /**
   * Sets up an authenticated user with completed onboarding.
   * Combines: login + onboarding + feature flag
   */
  async setupAuthenticatedUser(credentials: Credentials) {
    await this.ui.auth.loginSuccessfully(credentials);
    await this.ui.profile.completeOnboardingSuccessfully();
    await this.ui.settings.enableFeatureSuccessfully();
  }

  /**
   * Sets up a user with items in cart ready for checkout.
   */
  async setupUserWithCart(credentials: Credentials, products: string[]) {
    await this.setupAuthenticatedUser(credentials);
    for (const product of products) {
      await this.ui.cart.addToCartSuccessfully(product);
    }
  }
}
```

**Usage in tests:**

```typescript
test('TK-XXX: should complete checkout flow', async ({ ui }) => {
  const steps = new AuthSteps(ui);
  await steps.setupUserWithCart(credentials, ['Laptop', 'Mouse']);

  // Now test the actual checkout
  await ui.checkout.completeCheckoutSuccessfully();
});
```

**Key points:**

- Steps are NOT ATCs (no `@atc` decorator)
- They orchestrate ATCs, not replace them
- Changes to flow = edit one file, not 10 test files
- Named clearly: `setup*`, `prepare*`
- Used primarily for **preconditions** — reusable setup chains that multiple test files need

#### StepsFixture (Dependency Injection)

Like `ApiFixture` and `UiFixture`, Steps have their own fixture for DI:

```typescript
// tests/components/StepsFixture.ts
import type { TestContextOptions } from '@TestContext';
import { TestContext } from '@TestContext';
import { ApiFixture } from '@ApiFixture';
import { UiFixture } from '@UiFixture';
import { AuthSteps } from '@steps/AuthSteps';

export class StepsFixture extends TestContext {
  readonly auth: AuthSteps;

  constructor(options: TestContextOptions, api: ApiFixture, ui: UiFixture) {
    super(options);
    this.auth = new AuthSteps(ui, api);
    // Add more steps as needed:
    // this.checkout = new CheckoutSteps(ui, api);
  }
}
```

**Integration in TestFixture:**

```typescript
// TestFixture.ts - add steps alongside api and ui
export const test = base.extend<{
  test: TestFixture;
  api: ApiFixture;
  ui: UiFixture;
  steps: StepsFixture;
}>({
  // ... existing fixtures ...

  steps: async ({ page, request }, use) => {
    const options = { page, request };
    const api = new ApiFixture(options);
    const ui = new UiFixture(options);
    const stepsFixture = new StepsFixture(options, api, ui);
    await use(stepsFixture);
  },
});
```

**Usage with `{ steps }` fixture:**

```typescript
// Preconditions via steps fixture, then test the actual scenario
test('TK-XXX: should display order confirmation after checkout', async ({ steps, ui }) => {
  await steps.auth.setupAuthenticatedUser(credentials);
  await ui.checkout.completeCheckoutSuccessfully();
  await expect(ui.page.locator('[data-testid="confirmation"]')).toBeVisible();
});
```

#### Steps Directory Structure

```
tests/components/steps/
├── AuthSteps.ts          # Authentication + onboarding setup
├── BookingSteps.ts       # Booking precondition chains
└── ExampleSteps.ts       # Reference template (EXAMPLE ONLY)
```

#### When to Use Steps vs Direct ATC Calls

| Scenario | Use Steps | Use Direct ATCs |
|----------|-----------|-----------------|
| Same 3+ ATC chain in 3+ test files | Yes | No |
| One-off precondition | No | Yes |
| Complex setup with 5+ ATCs | Yes | No |
| Simple single-ATC setup | No | Yes |

---

## 2. Naming Conventions

### Components

| Type              | Class Name      | File Name                         |
| ----------------- | --------------- | --------------------------------- |
| **Test Context**  | `TestContext`   | `TestContext.ts`                  |
| **API Base**      | `ApiBase`       | `ApiBase.ts`                      |
| **UI Base**       | `UiBase`        | `UiBase.ts`                       |
| **API Component** | `{Resource}Api` | `AuthApi.ts`, `UsersApi.ts`       |
| **UI Component**  | `{Page}Page`    | `SignupPage.ts`, `LoginPage.ts`   |
| **Fixture**       | `{Type}Fixture` | `TestFixture.ts`, `ApiFixture.ts` |

### ATCs (Acceptance Test Cases)

**Pattern**: `{verb}{Resource}{Scenario}`

| Scenario Type | Suffix               | Example                          |
| ------------- | -------------------- | -------------------------------- |
| Success       | `Successfully`       | `signInSuccessfully()`           |
| Invalid Input | `WithInvalid{X}`     | `signInWithInvalidCredentials()` |
| Not Found     | `WithNonExistent{X}` | `getUserWithNonExistentId()`     |
| Expired       | `WithExpired{X}`     | `loginWithExpiredToken()`        |

### Test Files

| Type        | Pattern              | Example          |
| ----------- | -------------------- | ---------------- |
| E2E Test    | `{verb}{Feature}.test.ts`  | `createSignup.test.ts` |
| Integration | `{verb}{Resource}.test.ts` | `authenticateUser.test.ts` |

---

## 2. Component Structure

### File Template (API Component)

> **Note**: `TK-XXX` in `@atc()` represents the actual issue ID from your tracker (Jira, Xray, etc.). Replace with the real ticket ID (e.g., `TK-101`, `UPEX-456`).

```typescript
/**
 * KATA Framework - Layer 3: {Resource} API Component
 */

import { expect, type APIResponse } from '@playwright/test';
import { ApiBase } from '@api/ApiBase';
import { atc, step } from '@utils/decorators';
import type { Environment } from '@variables';

// ============================================
// Types
// ============================================

export interface ResourcePayload { ... }
export interface ResourceResponse { ... }

// ============================================
// Component Class
// ============================================

export class ResourceApi extends ApiBase {
  constructor(environment?: Environment) {
    super(environment);
  }

  // ============================================
  // Helpers (read-only, @step for tracing)
  // ============================================

  @step
  async getResourceById(id: string): Promise<[APIResponse, ResourceResponse]> {
    return this.apiGET<ResourceResponse>(`/api/resource/${id}`);
  }

  // ============================================
  // ATCs (state-changing, @atc for TMS)
  // ============================================

  @atc('TK-XXX')
  async createResourceSuccessfully(payload: ResourcePayload): Promise<[APIResponse, ResourceResponse, ResourcePayload]> {
    // Implementation
  }
}

export default ResourceApi;
```

### Order of Methods

1. Constructor
2. Navigation methods (UI only)
3. ATCs (decorated with `@atc`)
4. Helper methods (no decorator)

---

## 3. Test Structure (AAA Pattern)

All ATCs follow the **Arrange-Act-Assert** pattern:

```typescript
@atc('TK-101')
async signInSuccessfully(payload: SignInPayload): Promise<[APIResponse, AuthResponse, SignInPayload]> {
  // ACT - Perform the action
  const [response, body, sentPayload] = await this.apiPOST<AuthResponse, SignInPayload>(
    '/auth/signin',
    payload,
  );

  // ASSERT - Fixed assertions (validate action succeeded)
  expect(response.status()).toBe(200);
  expect(body.user).toBeDefined();
  expect(body.session.access_token).toBeDefined();

  // RETURN - For chaining with other ATCs
  return [response, body, sentPayload];
}
```

---

## 4. Docstrings

### Component Class

```typescript
/**
 * KATA Framework - Layer 3: Auth API Component
 *
 * Handles authentication operations: sign in, sign out, user profile.
 */
```

### ATC Methods

```typescript
/**
 * Sign in with valid credentials.
 * Returns: [APIResponse, AuthResponse, SignInPayload]
 */
@atc('TK-101')
async signInSuccessfully(payload: SignInPayload) { ... }
```

---

## 5. Type Hints

### API Components - Tuple Returns

API ATCs return tuples for type-safe access:

```typescript
// GET requests: [APIResponse, TBody]
async getUserSuccessfully(): Promise<[APIResponse, UserProfile]>

// POST/PUT/PATCH requests: [APIResponse, TBody, TPayload]
async createUserSuccessfully(payload: UserPayload): Promise<[APIResponse, UserResponse, UserPayload]>
```

### UI Components - Void Returns

```typescript
// UI ATCs typically return void - assertions are inside the ATC
async signupWithValidCredentials(data: SignUpData): Promise<void>

// Complete test cases, not single interactions
async loginWithInvalidCredentials(email: string, password: string): Promise<void>
```

---

## 6. Assertions

### Fixed Assertions (Inside ATCs)

Validate that the ATC itself worked correctly:

```typescript
// API: Status codes, required fields
expect(response.status()).toBe(200);
expect(body.id).toBeDefined();

// UI: Element state, visibility
await expect(emailInput.first()).toHaveValue(email);
await expect(this.page).toHaveURL(/.*dashboard.*/);
```

### Test-Level Assertions (In Test Files)

Validate results after combining multiple ATCs:

```typescript
test('TK-XXX: should complete flow', async ({ test }) => {
  const user = await test.api.auth.signInSuccessfully(credentials);

  // Test-level assertion - validates business logic
  expect(user.session.access_token).toMatch(/^eyJ/);
});
```

---

## 7. Error Handling

### Soft Fail Option

The `@atc` decorator accepts an optional second argument with the following options:

```typescript
@atc('TK-101', { softFail: true, severity: 'critical' })
async verifyOptionalField() {
  // softFail: failure won't stop test execution, just logs it
  // severity: associates criticality level for reporting
}
```

**Options:**

| Option     | Type    | Default | Description                                                    |
| ---------- | ------- | ------- | -------------------------------------------------------------- |
| `softFail` | boolean | `false` | When `true`, ATC failure doesn't block the test flow — only logs the failure |
| `severity` | string  | —       | Criticality level for reporting: `critical`, `high`, `medium`, `low` |

### When to Use Soft Fail

| Use Case               | Soft Fail |
| ---------------------- | --------- |
| Optional form fields   | ✅ Yes    |
| Exploratory tests      | ✅ Yes    |
| Critical functionality | ❌ No     |
| Blocking validation    | ❌ No     |

---

## 8. Code Quality

### Linting

ESLint with `@antfu/eslint-config` (flat config):

```bash
bun run lint        # Check for issues
bun run lint:fix    # Auto-fix issues
```

### Type Checking

TypeScript with relaxed mode (no experimentalDecorators):

```bash
bun run type-check  # Run tsc --noEmit
```

### Import Rules

**Mandatory aliases** - No relative imports:

```typescript
// ✅ CORRECT
import { config, env } from '@variables';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

// ❌ WRONG
import { config } from '../../../config/variables';
```

---

## 9. Test Independence

### Rules

1. **No shared state** between tests
2. **Each test creates its own data** (use `TestContext.generateUserData()`)
3. **Clean up after yourself** (use `afterEach` hooks if needed)
4. **Don't rely on test order**

### Example

```typescript
test('TK-XXX: should create user', async ({ api }) => {
  // Generate unique data for this test
  const userData = api.generateUserData();

  // Test is independent
  await api.users.createUserSuccessfully(userData);
});
```

---

## 10. Code Review Checklist

### Component Review

- [ ] File uses PascalCase naming
- [ ] Imports use aliases only
- [ ] Class extends correct base (`ApiBase` or `UiBase`)
- [ ] ATCs have `@atc` decorator with test ID
- [ ] Fixed assertions validate the action

### ATC Review

- [ ] Follows `{verb}{Resource}{Scenario}` naming
- [ ] Has proper return type annotation
- [ ] Contains fixed assertions
- [ ] Uses type-safe generics (API)
- [ ] Locators are inline (UI)

### Test File Review

- [ ] Uses `test` from `TestFixture`
- [ ] Creates own test data (no shared state)
- [ ] Test-level assertions validate business logic
- [ ] Clear test description

---

## 11. Anti-patterns

Common mistakes to avoid when implementing KATA:

| Anti-pattern                       | Why It's Bad                                  | Solution                         |
| ---------------------------------- | --------------------------------------------- | -------------------------------- |
| **ATC that only does one click**   | Not a test case, just an action               | Merge into complete ATC flow     |
| **Separate locator storage file**  | Maintenance overhead, disconnected from tests | Locators inline in ATCs          |
| **Multiple ATCs with same output** | Violates equivalence partitioning             | One parameterized ATC            |
| **Helper for `page.fill()`**       | Playwright already does this                  | Delete helper, use inline        |
| **ATC calling another ATC**        | Breaks atomicity and traceability             | Use Steps module                 |
| **`waitForTimeout(3000)`**         | Arbitrary, flaky, slow                        | Wait for specific condition      |
| **Relying on retries**             | Masks real issues                             | Investigate failures immediately |
| **Shared state between tests**     | Tests become order-dependent                  | Each test creates own data       |

### Examples

```typescript
// ❌ Anti-pattern: ATC with single interaction
@atc('TK-101')
async clickAddToCartButton() {
  await this.page.click('[data-testid="add-to-cart"]');
}

// ❌ Anti-pattern: Multiple ATCs for same output
@atc('TK-101') async loginWithWrongEmail() { /* → 401 */ }
@atc('TK-102') async loginWithWrongPassword() { /* → 401 */ }
@atc('TK-103') async loginWithEmptyFields() { /* → 401 */ }

// ❌ Anti-pattern: Locator file
// locators/checkout.ts
export const LOCATORS = {
  addToCartBtn: '[data-testid="add-to-cart"]',
  cartTotal: '[data-testid="cart-total"]',
};

// ❌ Anti-pattern: Helper for one-liner
private async fillEmail(email: string) {
  await this.page.locator('#email').fill(email);
}
```

---

## 12. Complementary Testing (Optional)

KATA is designed for **functional testing**. For other testing types, consider these as optional complements:

### Visual Regression Testing

Tools: Playwright visual comparisons, Percy, Chromatic

```typescript
// Playwright built-in visual comparison
await expect(page).toHaveScreenshot('homepage.png');
```

**When to use**: Design-heavy applications, component libraries

### Accessibility Testing

Tools: axe-core, Playwright accessibility snapshots

```typescript
// Using @axe-core/playwright
import AxeBuilder from '@axe-core/playwright';

test('TK-XXX: should pass accessibility checks', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
```

**When to use**: Public-facing applications, compliance requirements

### Performance Testing

Tools: Lighthouse CI, k6, Playwright Performance API

```typescript
// Basic performance metrics with Playwright
const metrics = await page.evaluate(() => JSON.stringify(window.performance.timing));
```

**When to use**: Performance-critical applications, SLAs

**Note**: These complement KATA but are outside its core scope. Implement based on project needs.

---

## 13. Playwright Artifacts Configuration

Configure artifact directories in `playwright.config.ts`:

```typescript
export default defineConfig({
  outputDir: 'test-results',

  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  // Artifact paths (add to .gitignore)
  // test-results/       - screenshots, videos, traces
  // tests/data/downloads/ - downloaded files during tests
});
```

**Directory structure:**

```
/test-results           # Playwright artifacts (gitignore)
├── /screenshots
├── /videos
└── /traces

/tests/data
├── /fixtures          # Test data files (commit)
├── /uploads           # Files for upload tests (commit)
└── /downloads         # Downloaded files (gitignore)
```

---

## References

- **KATA Architecture**: `kata-architecture.md`
