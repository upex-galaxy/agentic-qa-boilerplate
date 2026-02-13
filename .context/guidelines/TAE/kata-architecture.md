# KATA Architecture - Project Reference

**Komponent Action Test Architecture**

> _"Like a kata in martial arts, where each movement is practiced repeatedly until perfection, the KATA framework converts system actions into reusable and precise blocks."_

**Full Documentation**: See `docs/methodology/kata-fundamentals.md` for complete KATA framework documentation.

---

## 1. Executive Summary

KATA (Komponent Action Test Architecture) is a testing framework that solves common test automation problems:

- **Code Duplication**: Reusable ATCs (Acceptance Test Cases) instead of copy-paste
- **Maintenance Nightmare**: Changes in one component, not scattered across 100 tests
- **Business Disconnect**: 1:1 mapping between code and Jira/Xray test cases
- **No Visibility**: Granular reports showing which ATCs passed/failed, not just tests
- **Messy Architecture**: Clear layer separation with Dependency Injection

---

## 2. Project-Specific Configuration

### Tech Stack

| Layer           | Technology                                                    |
| --------------- | ------------------------------------------------------------- |
| **Language**    | TypeScript (relaxed mode - no experimentalDecorators)         |
| **Runtime**     | Bun (native TC39 Stage 3 decorators)                          |
| **Test Runner** | Playwright Test (for both API and UI)                         |
| **Assertions**  | Playwright expect + custom matchers                           |
| **TMS**         | Jira + Xray (Test Management for Jira)                        |
| **CI/CD**       | GitHub Actions                                                |
| **Reporting**   | KataReporter (terminal) + Playwright HTML + Allure (optional) |

### Test ID Format

- Format: `PROJECT-XXX` (e.g., `UPEX-123`, `UPEX-456`)
- Maps directly to Jira issue IDs
- Used in `@atc('PROJECT-XXX')` decorators

### Language Convention

- **All code**: English (components, ATCs, variables, comments)
- **Documentation**: Can be Spanish or English (team preference)

---

## 3. KATA Layer Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Test Files Layer                   │
│    (test_user_journey.e2e.ts, test_api.test.ts)    │
└────────────────────┬────────────────────────────────┘
                     │ imports fixture + flows
                     ▼
┌─────────────────────────────────────────────────────┐
│               Fixture Layer (DI)                    │
│   TestFixture - Unified Entry Point                 │
│   ├── api: ApiFixture                               │
│   └── ui: UiFixture                                 │
└────────┬────────────────────────────────────────────┘
         │ instantiates components
         ▼
┌─────────────────────────────────────────────────────┐
│        Flows Layer (Optional)               │
│   (AuthFlows, CheckoutFlows) - Reusable ATC chains  │
│         ← Orchestrates ATCs, NOT an ATC itself      │
└────────┬────────────────────────────────────────────┘
         │ uses
         ▼
┌─────────────────────────────────────────────────────┐
│           Specific Components Layer                 │
│    (UsersApi, ProductsApi, LoginPage, CartPage)     │
│            ← ATCs live here (atomic)                │
└────────┬────────────────────────────────────────────┘
         │ inherits from
         ▼
┌─────────────────────────────────────────────────────┐
│              Base Components Layer                  │
│          (ApiBase, UiBase) - Helpers                │
└────────┬────────────────────────────────────────────┘
         │ inherits from
         ▼
┌─────────────────────────────────────────────────────┐
│             Test Context Layer                      │
│  (TestContext) - Config, Logger, HTTP, Faker        │
└─────────────────────────────────────────────────────┘
```

### Layer Descriptions

| Layer                   | Responsibility                                            | Examples                                          |
| ----------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| **Test Context**        | Global utilities (config, logger, faker, HTTP client)     | `TestContext.ts`                                  |
| **Base Components**     | Helpers for API or UI (HTTP methods, Playwright wrappers) | `ApiBase.ts`, `UiBase.ts`                         |
| **Specific Components** | Business-specific logic, contains ATCs                    | `UsersApi.ts`, `LoginPage.ts`                     |
| **Flows**               | Reusable ATC chains for test setup (optional)             | `AuthFlows.ts`, `CheckoutFlows.ts`                |
| **Fixtures**            | Dependency Injection entry point                          | `ApiFixture.ts`, `UiFixture.ts`, `TestFixture.ts` |
| **Test Files**          | Orchestrate ATCs to validate flows                        | `test_checkout_flow.e2e.ts`                       |

---

## 4. Directory Structure

```
/config                              # Configuration at project root
│   └── variables.ts                 # SINGLE SOURCE OF TRUTH for env vars & URLs
│
/tests
├── /components                       # All KATA components
│   ├── TestContext.ts               # Layer 1: Global utilities
│   │
│   ├── ApiFixture.ts                # Layer 4: API Fixture (DI)
│   ├── UiFixture.ts                 # Layer 4: UI Fixture (DI)
│   ├── TestFixture.ts               # Layer 4: Unified Fixture (recommended)
│   │
│   ├── /api                         # Layers 2 & 3: API Components
│   │   ├── ApiBase.ts              # Layer 2: REST helpers (type-safe generics)
│   │   └── AuthApi.ts              # Layer 3: AuthApi with ATCs
│   │
│   ├── /ui                          # Layers 2 & 3: UI Components
│   │   ├── UiBase.ts               # Layer 2: Minimal base (direct Playwright)
│   │   └── SignupPage.ts           # Layer 3: SignupPage with ATCs
│   │
│   └── /flows               # Layer 3.5: Reusable ATC chains (optional)
│       └── AuthFlows.ts            # Combines ATCs for test setup
│
├── /data                            # Test data files
│   ├── /fixtures                   # JSON, CSV for parameterization
│   ├── /uploads                    # Files for upload tests
│   └── /downloads                  # Download destination (gitignore)
│
├── /integration                     # Integration tests (API only)
│   └── auth.test.ts
│
├── /e2e                             # E2E tests (UI + API)
│   └── /auth
│       └── signUp.test.ts
│
├── /utils                           # Helper utilities
│   ├── decorators.ts               # @atc decorator (TC39 Stage 3 format)
│   ├── KataReporter.ts             # Custom terminal reporter
│   └── jiraSync.ts                  # TMS integration
│
├── globalSetup.ts                   # Global setup
└── globalTeardown.ts                # Global teardown
│
/test-results                        # Playwright artifacts (gitignore)
├── /screenshots
├── /videos
└── /traces
│
/playwright.config.ts                # Playwright configuration (uses @variables)
```

### Import Aliases (Mandatory)

All imports MUST use aliases. No relative imports allowed.

```typescript
// ✅ CORRECT
import { config, env } from '@variables';
import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

// ❌ WRONG - No relative imports
import { config } from '../../../config/variables';
```

Configure in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@config/*": ["./config/*"],
      "@components/*": ["./tests/components/*"],
      "@utils/*": ["./tests/utils/*"]
    }
  }
}
```

---

## 5. Key Concepts

### 5.1 ATC (Acceptance Test Case)

An **ATC** is an automated acceptance test case that represents a **complete test case** (mini-flow), NOT a single interaction.

**Characteristics:**

- Maps 1:1 with a test case in Jira/Xray (via `@atc('PROJECT-XXX')`)
- Contains fixed assertions that validate the complete flow worked
- Is a **complete test case** - navigate, act, assert
- Returns data for chaining with other ATCs (API) or void (UI)

**Critical Rules:**

1. **Equivalence Partitioning**: Each ATC must have a **unique expected output**. If two ATCs have the same output, merge them into ONE parameterized ATC.

2. **Locators Inline**: All locators go directly inside the ATC. No separate locator objects or helper methods for single Playwright actions.

3. **No Unnecessary Helpers**: If Playwright does it in one line, don't abstract it.

4. **ATCs Don't Call ATCs**: ATCs are atomic. They should NOT call other ATCs. Use the **Flows** module for reusable ATC chains (see `automation-standards.md` section 1.7).

**Example (API):**

```typescript
@atc('UPEX-123')
async createUserSuccessfully(userData: UserPayload): Promise<[APIResponse, User, UserPayload]> {
  const [response, body, payload] = await this.apiPOST<User, UserPayload>('/users', userData);

  // Fixed Assertions
  expect(response.status()).toBe(201);
  expect(body.id).toBeDefined();

  return [response, body, payload];
}
```

**Example (UI) - Locators Inline:**

```typescript
@atc('UPEX-456')
async signupWithValidCredentials(data: SignUpData) {
  await this.page.goto('/signup');

  // Locators defined inline - NOT in separate helper methods
  await this.page.locator('#email').fill(data.email);
  await this.page.locator('#password').fill(data.password);
  await this.page.locator('button[type="submit"]').click();

  // Fixed Assertions
  await expect(this.page).toHaveURL(/.*dashboard.*/);
}
```

### 5.2 Component

A **Component** encapsulates related functionality of the system under test.

**Types:**

- **API Components**: Group related endpoints (e.g., `UsersApi`, `OrdersApi`)
- **UI Components**: Group elements of a page (e.g., `LoginPage`, `CartPage`)

**Rules:**

- One component per file
- ATCs are public methods with `@atc` decorator
- Inherits from `ApiBase` or `UiBase`
- No more than 15-20 ATCs per component (split if larger)

### 5.3 Fixture (Dependency Injection)

A **Fixture** is the entry point that instantiates all components and makes them accessible.

> **Deep Dive**: See `/docs/testing/test-architecture/dependency-injection-strategy.md` for complete DI architecture, Playwright lazy loading, and instance flow diagrams.

**Core Pattern: TestContextOptions**

All components receive Playwright drivers via `TestContextOptions`:

```typescript
// TestContextOptions interface - the bridge between Playwright and KATA
interface TestContextOptions {
  page?: Page; // Optional: API tests don't need it
  request?: APIRequestContext; // Optional: Some setups don't need it
  environment?: Environment;
}
```

**Fixture Definition (TestFixture.ts):**

```typescript
export const test = base.extend<{
  test: TestFixture;
  api: ApiFixture;
  ui: UiFixture;
}>({
  // Full fixture: UI + API with shared context
  test: async ({ page, request }, use) => {
    const fixture = new TestFixture(page, request);
    await use(fixture);
  },

  // API-only fixture: NO browser opened (Playwright lazy loading)
  api: async ({ request }, use) => {
    const apiFixture = new ApiFixture({ request });
    await use(apiFixture);
  },

  // UI fixture: Has both page and request
  ui: async ({ page, request }, use) => {
    const uiFixture = new UiFixture({ page, request });
    await use(uiFixture);
  },
});
```

**Key Principle: Lazy Fixture Initialization**

Playwright only creates fixtures that are actually requested:

```typescript
// This test NEVER opens a browser
test('API test', async ({ api }) => {
  await api.bookings.getAll(); // Only request context used
});

// This test opens a browser
test('E2E test', async ({ ui }) => {
  await ui.login.authenticate(user, password); // page context used
});
```

**Usage in tests:**

```typescript
test('complete purchase flow', async ({ test: fixture }) => {
  // Use API for fast setup (same context as UI)
  const user = await fixture.api.users.createUserSuccessfully({
    name: 'John',
    email: 'john@example.com',
  });

  // Use UI for the flow to validate (shares context with API)
  await fixture.ui.login.loginSuccessfully(user.email, 'pass123');
  await fixture.ui.cart.addProductToCart('Laptop');
  const order = await fixture.ui.checkout.completePurchaseSuccessfully();

  // Use API for reliable verification
  const orderData = await fixture.api.orders.getOrderSuccessfully(order.id);
  expect(orderData.status).toBe('completed');
});
```

### 5.4 Fixed Assertions vs Test-Level Assertions

**Fixed Assertions** (inside ATCs):

- Validate that the ATC itself worked correctly
- Always execute when the ATC is called
- Examples: status code 201, required fields present, data types correct

**Test-Level Assertions** (in test files):

- Validate the result of combining multiple ATCs
- Verify final system state after a flow
- Examples: balance updated after payment, order contains correct items

---

## 6. Naming Conventions

### Components

| Type               | Format          | File Name                         |
| ------------------ | --------------- | --------------------------------- |
| **API Component**  | `{Resource}Api` | `AuthApi.ts`, `UsersApi.ts`       |
| **UI Component**   | `{Page}Page`    | `SignupPage.ts`, `LoginPage.ts`   |
| **Base Component** | `{Type}Base`    | `ApiBase.ts`, `UiBase.ts`         |
| **Fixture**        | `{Type}Fixture` | `TestFixture.ts`, `ApiFixture.ts` |
| **Context**        | `TestContext`   | `TestContext.ts`                  |

**File Naming**: PascalCase (matches class name exactly)

### ATCs

**Format**: `{verb}{Resource}{Scenario}`

**Examples:**

- ✅ `signInWithValidCredentials(credentials)` - Complete login flow
- ✅ `signInWithInvalidCredentials(credentials)` - Complete error flow
- ✅ `signupWithValidCredentials(data)` - Complete signup flow
- ✅ `addProductToCartSuccessfully(productId)` - Complete add-to-cart flow
- ❌ `fillEmailSuccessfully(email)` - WRONG: Single interaction, not a test case
- ❌ `submitFormSuccessfully()` - WRONG: Single interaction, not a test case
- ❌ `clickLoginButton()` - WRONG: Single interaction, not a test case

**Rules:**

- Always camelCase
- Always English
- **Must be complete test cases (mini-flows), NOT single interactions**
- Success scenarios: `Successfully` or `WithValidCredentials` suffix
- Error scenarios: `WithInvalid{X}`, `WithExpired{Y}`, `WithNonExistent{Z}`

### Test Files

| Type                 | Pattern              | Example                              |
| -------------------- | -------------------- | ------------------------------------ |
| **E2E Test**         | `{feature}.test.ts`  | `signUp.test.ts`, `checkout.test.ts` |
| **Integration Test** | `{resource}.test.ts` | `auth.test.ts`, `users.test.ts`      |
| **Utility Test**     | `{util}.test.ts`     | `decorators.test.ts`                 |

---

## 7. Traceability

### @atc Decorator

The `@atc` decorator connects code with Jira/Xray using **TC39 Stage 3 decorators** (Bun native):

```typescript
// TC39 Stage 3 format - NOT legacy TypeScript decorators
@atc('PROJ-API-001')
async signInSuccessfully(payload: SignInPayload): Promise<[APIResponse, AuthResponse, SignInPayload]> {
  const [response, body, sentPayload] = await this.apiPOST<AuthResponse, SignInPayload>(
    '/auth/signin',
    payload,
  );

  // Fixed assertions
  expect(response.status()).toBe(200);
  expect(body.session.access_token).toBeDefined();

  return [response, body, sentPayload];
}
```

**Decorator Signature (TC39 format):**

```typescript
export function atc(testId: string, options: AtcOptions = {}) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    originalMethod: T,
    context: ClassMethodDecoratorContext,  // TC39 format - NOT (target, key, descriptor)
  ): T { ... }
}
```

**Benefits:**

- Automatic traceability to Jira/Xray test cases
- Granular reporting (which ATCs passed/failed)
- Synchronization with TMS (Jira/Xray)
- Console output: `[ATC-PASS] PROJ-API-001 | signInSuccessfully`

### Test Results Synchronization

After test execution, results are synced to Jira/Xray:

```
Test Execution (Playwright)
    ↓
Generate JSON Report (atc_results.json)
    ↓
Sync to TMS via API (Xray)
    ↓
Update Xray Test Cases (PASSED/FAILED)
```

**Configuration**: See `tms-integration.md` for setup details.

---

## 8. Best Practices

### When to Use Fixed Assertions

✅ **Use inside ATCs for:**

- Validating HTTP status codes (200, 201, 400, etc.)
- Verifying required fields exist (`user.id`, `user.email`)
- Checking data types are correct
- Validating business rules (e.g., `total > 0`)

### When to Use Test-Level Assertions

✅ **Use in test files for:**

- Validating results from combining multiple ATCs
- Verifying final system state after a flow
- Checking relationships between data from different ATCs

### When to Use Soft Fail

✅ **Use `soft_fail=true` when:**

- Validating optional form fields
- Running exploratory tests where you want to see all failures
- Testing non-critical features that shouldn't block the flow

❌ **Don't use soft fail when:**

- Testing critical functionality
- Failure means subsequent ATCs don't make sense

### API vs UI Separation

✅ **Keep API and UI completely isolated:**

- Integration tests (API only) run without browser (faster)
- E2E tests can combine both strategically
- Clear autocomplete: `fixture.api.` shows endpoints, `fixture.ui.` shows pages

✅ **In E2E tests:**

- Use API for fast setup (create test data)
- Use UI for the flow you want to validate
- Use API for reliable verification (check final state)

---

## 9. Component Catalog

For a complete list of implemented components and their ATCs, see:

- **`component-catalog.md`** - All components with descriptions
- **`atc-registry.md`** - All ATCs mapped to Jira/Xray test cases

---

## 10. References

- **Full KATA Documentation**: `/docs/testing/test-architecture/kata-fundamentals.md`
- **Dependency Injection Strategy**: `/docs/testing/test-architecture/dependency-injection-strategy.md`
- **Automation Standards**: `.context/guidelines/TAE/automation-standards.md`
- **TMS Integration**: `.context/guidelines/TAE/tms-integration.md`
- **CI/CD Integration**: `.context/guidelines/TAE/ci-cd-integration.md`
- **Framework Setup**: `.prompts/utilities/kata-framework-setup.md`
