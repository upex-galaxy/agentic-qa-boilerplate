# TypeScript Patterns for KATA

The coding conventions for every Layer 2, 3 and 3.5 file. Load it when you write or review component code. The architectural rules (layers, ATC identity, fixture selection) are in `kata-architecture.md`, and naming and tagging are in `automation-standards.md`.

---

## 1. Parameter Pattern (Max 2 Positional)

A function with 3 or more parameters takes an object parameter instead. There are no exceptions.

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

The call sites document themselves, autocomplete shows the parameter names, order stops mattering, and adding an optional parameter breaks no caller.

ATCs follow the same rule: one that took `(email, password, rememberMe, redirectUrl)` takes `(args: LoginArgs)` instead.

---

## 2. DRY by Layer: Where Does Code Live?

A helper in the wrong place creates coupling and fragile tests, so its location matters.

| Location | When to put code here | Example |
|----------|-----------------------|---------|
| `tests/utils/` | Agnostic utility (works for API AND UI, no Playwright deps) | `allure.ts` (Allure attachment helpers), string formatters |
| `UiBase` | Requires `PageContext` (Playwright `page`) | `interceptResponse()`, `waitForApiResponse()` |
| `ApiBase` | Requires `APIRequestContext` | `apiGET()`, `apiPOST()` |
| `TestContext` | Shared across API + UI, no external Playwright deps | `faker`, `config` accessors, environment selection |
| Layer 3 component | Domain-specific logic for one resource/page | `generateOrderPayload()` inside `OrdersApi` |

The principle:

> Anything that needs `PageContext` goes in UiBase.
> Anything that needs `APIRequestContext` goes in ApiBase.
> Only truly agnostic utilities go in `tests/utils/`.

An API helper that seems to fit in `tests/utils/` still depends on `APIRequestContext`, so it belongs in `ApiBase`.

---

## 3. Shared Locator Pattern (UI)

A locator used in 2 or more ATCs of the same component becomes a class property. One used once stays inline.

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

Extract when the locator is used in 2 or more ATCs of the same component, when it is a complex selector with fallbacks, or when it is a dynamic selector that takes parameters.

Keep it inline when it is used once, including a simple, obvious selector like `button[type="submit"]`.

Move it to UiBase when it is used across multiple components (rare), such as a global nav element.

A separate `locators/*.ts` file is an anti-pattern in KATA, so do not extract there.

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

Define every payload and response type a component uses here, or import it from `@schemas/{domain}.types` when it is generated from OpenAPI. Name the interface instead of writing an inline object type in a method signature.

---

## 5. Generic Type Parameters

Give generics descriptive names and default them to `unknown`.

```typescript
// GOOD: clear intent with defaults
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

Single-letter generics (`T`, `U`) tell a reader nothing about intent, so keep them out of public APIs. Internal private methods may use `T` when it is obvious.

---

## 6. Private vs Public Methods

Private helpers live only inside the class, and the public methods form its external API.

```typescript
class UiBase extends TestContext {
  // PUBLIC: part of the class API, documented
  async interceptResponse<T>(args: InterceptResponseArgs): Promise<T> {
    const response = await this.waitForMatchingResponse(args.urlPattern);
    return this.parseResponseBody(response);
  }

  // PRIVATE: internal helper
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

A helper inside an ATC is not `public`. Private methods stay private so the ATCs remain the public API surface.

---

## 7. Error Handling

Methods a test can reach fail fast with a descriptive error. Utility helpers that may legitimately find no data fail silently.

```typescript
// REACHABLE BY A TEST (an ATC): fail fast
@atc('TICKET-ID')
async createOrderSuccessfully(payload: OrderPayload): Promise<[APIResponse, OrderResponse, OrderPayload]> {
  const [response, body, sent] = await this.apiPOST<OrderResponse, OrderPayload>('/orders', payload);
  expect(response.status()).toBe(201);
  return [response, body, sent];
}

// The HTTP helpers themselves are `protected` (see kata-architecture.md §4):
// a test must go through an ATC, never past it to raw HTTP. `ApiBase` throws
// from its `get request()` getter when no context is available — there is no
// `setRequestContext()` to call, the context is constructor-injected.

// UTILITY: silent fail, return null/undefined
private async parseResponseBody<T>(response: Response): Promise<T | null> {
  try { return (await response.json()) as T; }
  catch { return null; }    // response may not be JSON: that is not an error
}
```

The rule:

| Method type | On unexpected state | Rationale |
|-------------|---------------------|-----------|
| Public ATC or helper | Throw with descriptive message | Test should fail loudly at the call site |
| Private utility (parser, matcher) | Return `null` / `undefined` | Caller decides what to do with missing data |

An ATC never swallows an error without re-throwing, because the test has to fail visibly.

---

## 8. Import Organization

Group imports in this order, with one blank line between groups: type imports, external value imports, internal value imports.

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

Use `import type` for anything referenced only in type positions; it erases cleanly at build time.

### Import aliases are mandatory

Relative imports are not allowed. The aliases are declared in `tsconfig.base.json` (synced); the project half is `tsconfig.json`.

```typescript
// RIGHT
import { config } from '@variables';
import { UsersApi } from '@api/UsersApi';

// WRONG
import { config } from '../../../config/variables';
```

Lint rejects relative imports: `KATA_IMPORT_ALIASES` in `eslint.config.base.js`, a core `no-restricted-imports` block scoped to `tests/**/*.ts` + `playwright.config.ts`. Dynamic `await import('./x')` is outside the rule. Fix the imports and leave the rule enabled.


`kata/layer-imports` also checks where `@faker-js/faker`, `@openapi` and `test` may be imported from.

---

## 9. Test Design Conventions (code-level)

These conventions apply to every test file. They are the code-level expression of the TC-identity rule in `kata-architecture.md`. Naming, the flows-not-properties rule and the assertion layers are stated once in `automation-standards.md` §1 and §2, and this section adds only what shows up in code.

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

### Test file and block naming

File names follow `{verb}{Feature}.test.ts` in camelCase, with a verb for the user action: `applyDiscount.test.ts` and `authenticateUser.test.ts` are good, while `discount.test.ts` (no verb), `orderFlow.test.ts` (too broad) and `check_discount.test.ts` (a test verb, not a user action) are not.

```typescript
test.describe('TICKET-ID: Validate discount codes', () => {
  test('TICKET-ID: should apply percentage discount when code is valid', ...);
  test('TICKET-ID: should apply fixed-amount discount when code is valid', ...);
  test('TICKET-ID: should reject discount when code has expired', ...);
});
```

The `describe` may carry the ticket ID when the file is tied to a single ticket. Every `test()` starts with the ticket ID followed by `should {behavior} when {condition}`. The full rules for files, tickets and hierarchy are in `automation-standards.md` §1.

### Tests validate flows, not properties

One test covers a complete flow with several assertions, and six tests that each check one field of the same response are wrong (worked example in `automation-standards.md` §2). Split only when the scenario really differs:

| Separate test? | Reason |
|----------------|--------|
| Yes | Different flow (positive vs negative) |
| Yes | Different precondition that changes the outcome |
| Yes | Different user role or permissions |
| No | Same flow, different field assertions |
| No | Same response, different property checks |

### Test independence

- No shared state between tests, and no reliance on test ordering.
- Each test generates its own data through `TestContext` helpers or faker (for example `api.generateUserData()`).
- Clean up in `afterEach` only when the test created state that would persist and affect others.

### Preconditions strategy

Each test sets up its own data through the API (or the DB) before running the scenario, in this order: preconditions create the scenario, actions perform the steps (API calls or UI interactions), and assertions validate the expected behavior with that data. Tests neither depend on nor interfere with each other, and preconditions come from API endpoints or the DB connection. Shared environments are used collaboratively, but the data inside each test is managed per test.

### Assertion layers

ATC assertions validate that each individual action worked. Test-level assertions validate the outcome of combining several actions (diagram in `automation-standards.md` §2).

### Integration vs E2E test design

| Aspect | Integration | E2E |
|--------|-------------|-----|
| Scope | API endpoint chain (2-3 endpoints) | Full user journey (UI + API) |
| Speed | Fast (no browser) | Slower (browser required) |
| Fixture | `{ api }` | `{ ui }` / `{ test }` |
| Preconditions | API calls | API calls (setup) + UI (action) |
| Value | Validates business logic correctness | Validates user experience |

Both follow the same principles: complete flows, ATCs for actions and helpers for reads, several assertions per test, and separate tests only for fundamentally different scenarios.

---

## 10. Quick Reference

The 2-parameter limit is lint-checked by `max-params` on the component layers; the `ApiBase` HTTP primitives are exempt.

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
