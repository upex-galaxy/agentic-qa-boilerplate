# TypeScript Patterns for KATA

Coding conventions that apply to every Layer 2, 3, and 3.5 file. Load when writing or reviewing component code. For architectural rules (layers, ATC identity, fixture selection), see `kata-architecture.md`.

---

## 1. Parameter Pattern (Max 2 Positional)

If a function has 3+ parameters, use an object parameter. No exceptions.

```typescript
// WRONG
function interceptResponse(
  page: Page,
  urlPattern: string,
  action: () => Promise<void>,
  timeout?: number,
  attachToAllure?: boolean,
) { ... }

// RIGHT
interface InterceptArgs {
  urlPattern: string | RegExp;
  action: () => Promise<void>;
  timeout?: number;
  attachToAllure?: boolean;
}

function interceptResponse(args: InterceptArgs) { ... }
```

Benefits: self-documenting call sites, IDE autocomplete shows parameter names, order-independent, easy to add optional params without breaking changes.

This rule applies to ATCs as well. An ATC that took `(email, password, rememberMe, redirectUrl)` must take `(args: LoginArgs)` instead.

---

## 2. DRY by Layer — Where Does Code Live?

The physical location of helper code matters. Moving a helper to the wrong place creates coupling and fragile tests.

| Location | When to put code here | Example |
|----------|-----------------------|---------|
| `tests/utils/` | Agnostic utility (works for API AND UI, no Playwright deps) | `allure.ts` (Allure attachment helpers), string formatters |
| `UiBase` | Requires `PageContext` (Playwright `page`) | `interceptResponse()`, `waitForApiResponse()` |
| `ApiBase` | Requires `APIRequestContext` | `apiGET()`, `apiPOST()` |
| `TestContext` | Shared across API + UI, no external Playwright deps | `faker`, `config` accessors, environment selection |
| Layer 3 component | Domain-specific logic for one resource/page | `generateOrderPayload()` inside `OrdersApi` |

Architectural principle:

> Anything that needs `PageContext` goes in UiBase.
> Anything that needs `APIRequestContext` goes in ApiBase.
> Only truly agnostic utilities go in `tests/utils/`.

If you are tempted to put an API helper in `tests/utils/`, stop — it means the utility still depends on `APIRequestContext`, which means it belongs in `ApiBase`.

---

## 3. Shared Locator Pattern (UI)

If a locator is used in 2+ ATCs of the same component, extract it to a class property. If used once, keep it inline.

```typescript
class CheckoutPage extends UiBase {
  // Arrow function for dynamic locators
  private readonly productRow = (name: string) =>
    this.page.locator(`[data-product="${name}"]`);

  // Static element used in multiple ATCs
  private readonly submitButton = () => this.page.locator('button[type="submit"]');

  @atc('TICKET-ID')
  async addProductSuccessfully(product: string) {
    await this.productRow(product).click();
    await this.submitButton().click();
  }

  @atc('TICKET-ID')
  async removeProductSuccessfully(product: string) {
    await this.productRow(product).locator('[data-action="remove"]').click();
  }
}
```

When to extract:

- Used in 2+ ATCs of the same component.
- Complex selector with fallbacks.
- Dynamic selector that takes parameters.

When to keep inline:

- Used only once.
- Simple, obvious selector like `button[type="submit"]` used once.

When to move to UiBase:

- Used across **multiple components** (rare) — e.g., a global nav element.

Never extract to a separate `locators/*.ts` file. That is an anti-pattern in KATA.

---

## 4. Type Definitions

Define interfaces at the top of the file, after imports, before the class.

```typescript
import type { Page } from '@playwright/test';

// ============================================
// Types
// ============================================

export interface InterceptedData<TRequest = unknown, TResponse = unknown> {
  url: string;
  method: string;
  status: number;
  requestBody: TRequest | null;
  responseBody: TResponse | null;
}

export interface InterceptResponseArgs {
  urlPattern: string | RegExp;
  action: () => Promise<void>;
  timeout?: number;
}

// ============================================
// Implementation
// ============================================

export class UiBase { ... }
```

Every payload and response type used by a component should be defined here (or imported from `@schemas/{domain}.types` if generated from OpenAPI). Avoid inline object types in method signatures — always name the interface.

---

## 5. Generic Type Parameters

Use descriptive generic names and default to `unknown`.

```typescript
// GOOD — clear intent with defaults
async interceptResponse<TRequest = unknown, TResponse = unknown>(
  args: InterceptResponseArgs,
): Promise<InterceptedData<TRequest, TResponse>> { ... }

// Usage with types
const { responseBody } = await this.interceptResponse<LoginPayload, TokenResponse>({
  urlPattern: /\/auth\/login/,
  action: async () => await this.submitButton().click(),
});

// Usage without types (falls back to unknown — safe)
const { responseBody } = await this.interceptResponse({
  urlPattern: /\/api\/data/,
  action: async () => await this.loadButton().click(),
});
```

Never use single-letter generics (`T`, `U`) in public APIs — they give no hint about intent. Internal private methods may use `T` if obvious.

---

## 6. Private vs Public Methods

Private helpers live only inside the class; public methods form the external API.

```typescript
class UiBase extends TestContext {
  // PUBLIC — part of the class API, documented
  async interceptResponse<T>(args: InterceptResponseArgs): Promise<T> {
    const response = await this.waitForMatchingResponse(args.urlPattern);
    return this.parseResponseBody(response);
  }

  // PRIVATE — internal helper
  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) return pattern.test(url);
    const regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(regexPattern).test(url);
  }

  private async parseResponseBody<T>(response: Response): Promise<T | null> {
    try { return (await response.json()) as T; }
    catch { return null; }
  }
}
```

Do not mark a method `public` if it is a helper inside an ATC. Keep private methods private — ATCs stay the public API surface.

---

## 7. Error Handling

Fail fast in public methods with a descriptive error. Silent fail in utility helpers that legitimately may not find data.

```typescript
// PUBLIC — fail fast
async apiGET<T>(endpoint: string): Promise<T> {
  if (!this.request) {
    throw new Error('Request context not set. Call setRequestContext() first.');
  }
  // ... implementation
}

// UTILITY — silent fail, return null/undefined
private async parseResponseBody<T>(response: Response): Promise<T | null> {
  try { return (await response.json()) as T; }
  catch { return null; }    // response may not be JSON — that is not an error
}
```

Rule:

| Method type | On unexpected state | Rationale |
|-------------|---------------------|-----------|
| Public ATC or helper | Throw with descriptive message | Test should fail loudly at the call site |
| Private utility (parser, matcher) | Return `null` / `undefined` | Caller decides what to do with missing data |

Never swallow errors inside ATCs without re-throwing — the test must fail visibly.

---

## 8. Import Organization

Group imports in order: type imports, external value imports, internal value imports. One blank line between groups.

```typescript
// 1. Type imports (use 'import type')
import type { Environment } from '@variables';
import type { Page, Request, Response } from '@playwright/test';

// 2. Value imports from external packages
import { expect } from '@playwright/test';

// 3. Value imports from internal modules
import { TestContext } from '@TestContext';
import { buildUrl, config } from '@variables';
import { attachRequestResponseToAllure } from '@utils/allure';
```

Always prefer `import type` for types that are only referenced in type positions — it erases cleanly at build time.

### Import aliases are mandatory

No relative imports. Configure once in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@config/*": ["./config/*"],
      "@variables": ["./config/variables.ts"],
      "@components/*": ["./tests/components/*"],
      "@api/*": ["./tests/components/api/*"],
      "@ui/*": ["./tests/components/ui/*"],
      "@steps/*": ["./tests/components/steps/*"],
      "@utils/*": ["./tests/utils/*"],
      "@schemas/*": ["./api/schemas/*"],
      "@TestContext": ["./tests/components/TestContext.ts"],
      "@TestFixture": ["./tests/components/TestFixture.ts"],
      "@ApiFixture": ["./tests/components/ApiFixture.ts"],
      "@UiFixture": ["./tests/components/UiFixture.ts"],
      "@StepsFixture": ["./tests/components/StepsFixture.ts"],
      "@data/*": ["./tests/data/*"]
    }
  }
}
```

```typescript
// RIGHT
import { config } from '@variables';
import { UsersApi } from '@api/UsersApi';

// WRONG
import { config } from '../../../config/variables';
```

Lint rejects relative imports via `eslint-plugin-import` rules. Fix them — do not disable the rule.

---

## 9. Test Design Conventions (code-level)

These conventions apply to every test file. They are the code-level expression of the TC-identity rule (documented in `kata-architecture.md`).

### Helpers live at the top of the component

```
OrdersApi.ts:
  // --- Helpers (no @atc) ---
  getOrders(filters)       → GET /orders
  getOrderById(id)         → GET /orders/{id}
  getTotals(filters)       → GET /orders/totals

  // --- ATCs (@atc) ---
  @atc('TICKET-ID')
  createOrderSuccessfully(orderData)   → POST /orders + GET verification
```

Helpers can be called inside ATCs as verification steps, inside test files for preconditions, or inside Steps for setup chains.

### Test file naming

Pattern: `{verb}{Feature}.test.ts` in camelCase with a verb describing the user action.

- Good: `applyDiscount.test.ts`, `createOrder.test.ts`, `refreshCatalog.test.ts`, `authenticateUser.test.ts`.
- Bad: `discount.test.ts` (no verb), `orderFlow.test.ts` (too broad), `check_discount.test.ts` (verb is a test verb, not a user action).

### Test block naming

```typescript
test.describe('TICKET-ID: Apply Discount Code', () => {
  test('TICKET-ID: should apply percentage discount when code is valid', ...);
  test('TICKET-ID: should apply fixed-amount discount when code is valid', ...);
  test('TICKET-ID: should reject discount when code has expired', ...);
});
```

- `describe` may include the ticket ID when the file is tied to a single ticket.
- Every `test()` includes the ticket ID as a prefix followed by `should {behavior} when {condition}`.
- One ticket per `describe`; never split a ticket across files. Multiple tickets can coexist in one file when they test different aspects of the same feature.

### Tests validate FLOWS, not properties

One test validates a complete flow with multiple assertions. Do NOT split six tests that each check one field of the same response.

```typescript
// WRONG — splits a single flow into six tests
test('should return orders', async ({ api }) => { ... });
test('should have referenceNumber', async ({ api }) => { ... });
test('should have totalAmount', async ({ api }) => { ... });

// RIGHT — one test, complete contract
test('TICKET-ID: should create order with correct totals when discount applied', async ({ api }) => {
  const [, order] = await api.orders.createOrderSuccessfully(orderData);
  const totals = await api.orders.getTotals({ orderId: order.id });
  expect(order.id).toBeDefined();
  expect(order.discountApplied).toBe(true);
  expect(totals.finalAmount).toBe(totals.baseAmount - totals.discountAmount);
});
```

Separate tests only when the scenario is fundamentally different:

| Separate test? | Reason |
|----------------|--------|
| Yes | Different flow (positive vs negative) |
| Yes | Different precondition that changes the outcome |
| Yes | Different user role or permissions |
| No | Same flow, different field assertions |
| No | Same response, different property checks |

### Test independence

- No shared state between tests.
- Each test generates its own data via `TestContext` helpers or faker (e.g., `api.generateUserData()`).
- Do not rely on test ordering.
- Clean up in `afterEach` only when the test created state that would persist and affect others.

### Assertion layers

```
Test flow
  ├── ATC 1: createOrderSuccessfully()
  │     └── [ATC assertions: status 201, order persisted]
  ├── ATC 2: applyDiscountSuccessfully()
  │     └── [ATC assertions: discount applied, total recalculated]
  └── Test-level assertions:
        └── [Final state: final total = base - discount, tax applied correctly]
```

ATC assertions validate that each individual action worked. Test-level assertions validate the outcome of combining multiple actions.

### Preconditions strategy

Each test sets up its own data via API (or DB) before executing the scenario:

1. Preconditions — prepare test data to create the scenario.
2. Actions — perform the test steps (API calls or UI interactions).
3. Assertions — validate expected behavior with the given data.

Rules: each test creates its own scenario independently; tests must not depend on or interfere with others; preconditions come from API endpoints or the DB connection; shared environments are used collaboratively but data inside each test is managed per-test.

### Integration vs E2E test design

| Aspect | Integration | E2E |
|--------|-------------|-----|
| Scope | API endpoint chain (2-3 endpoints) | Full user journey (UI + API) |
| Speed | Fast (no browser) | Slower (browser required) |
| Fixture | `{ api }` | `{ ui }` / `{ test }` / `{ steps }` |
| Preconditions | API calls | API calls (setup) + UI (action) |
| Value | Validates business logic correctness | Validates user experience |

Both follow the same principles: complete flows, ATCs for actions and helpers for reads, multiple assertions per test, separate tests only for fundamentally different scenarios.

---

## 10. Quick Reference

| Pattern | Rule | Example |
|---------|------|---------|
| Parameters | Max 2 positional, else use object | `fn(args: Args)` not `fn(a, b, c, d)` |
| Utilities | Only agnostic go to `utils/` | `allure.ts` yes, `interception` no |
| Locators | Extract if used 2+ times in same component | `private readonly btn = () => ...` |
| Types | Define at top, after imports, named interfaces | `interface X { ... }` |
| Generics | Descriptive names, default to `unknown` | `<TRequest = unknown>` |
| Private | Internal helpers only | `private matchesPattern()` |
| Errors | Public: fail fast; private utility: silent fail | `throw Error` vs `return null` |
| Imports | Order: type, external, internal; aliases only | Grouped with blank lines |
| Test files | `{verb}{Feature}.test.ts`, ticket ID in `test()` | `applyDiscount.test.ts` |
| Test independence | No shared state, each test generates data | `api.generateUserData()` |
