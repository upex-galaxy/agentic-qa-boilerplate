# TypeScript Patterns for KATA Framework

> **Purpose**: Coding patterns and conventions for the KATA Framework.
> **Audience**: AI assistants and developers writing code.
> **Principle**: Consistency, readability, and maintainability.

---

## 1. Parameter Pattern (Max 2 Positional)

**Rule**: If a function has 3+ parameters, use an object parameter.

```typescript
// BAD - Too many positional params
function interceptResponse(
  page: Page,
  urlPattern: string,
  action: () => Promise<void>,
  timeout?: number,
  attachToAllure?: boolean,
) { ... }

// GOOD - Object parameter
interface InterceptArgs {
  urlPattern: string | RegExp
  action: () => Promise<void>
  timeout?: number
  attachToAllure?: boolean
}

function interceptResponse(args: InterceptArgs) { ... }
```

**Benefits**:

- Self-documenting code
- IDE autocomplete shows parameter names
- Parameter order doesn't matter
- Easy to add optional params without breaking changes

---

## 2. DRY for Utilities - Context Matters

**Rule**: Extract to `tests/utils/` ONLY if utility is context-agnostic.

| Location       | When to Use                             | Example                                       |
| -------------- | --------------------------------------- | --------------------------------------------- |
| `tests/utils/` | Agnostic utilities (works for API + UI) | `allure.ts` (Allure attachments)              |
| `UiBase`       | Requires `PageContext` (Playwright)     | `interceptResponse()`, `waitForApiResponse()` |
| `ApiBase`      | Requires `APIRequestContext` (HTTP)     | `apiGET()`, `apiPOST()`                       |
| `TestContext`  | Shared across both (no external deps)   | `faker`, `config`, environment                |

**Architecture Principle**:

> Everything that requires `PageContext` (Playwright) goes in `UiBase`.
> Everything that requires `APIRequestContext` goes in `ApiBase`.
> Only truly agnostic utilities go in `tests/utils/`.

---

## 3. Shared Locator Pattern

**Rule**: If a locator is used in 2+ ATCs, extract to class property.

```typescript
class CheckoutPage extends UiBase {
  // Arrow function for dynamic locators (parameterized)
  private readonly productRow = (name: string) => this.page.locator(`[data-product="${name}"]`);

  // Simple locator for static elements
  private readonly submitButton = () => this.page.locator('button[type="submit"]');

  @atc('PROJ-001')
  async addProductSuccessfully(product: string) {
    await this.productRow(product).click();
    await this.submitButton().click();
  }

  @atc('PROJ-002')
  async removeProductSuccessfully(product: string) {
    await this.productRow(product).locator('[data-action="remove"]').click();
  }
}
```

**When to Extract**:

- Used in 2+ ATCs
- Complex selector with multiple fallbacks
- Dynamic selector that takes parameters

**When to Keep Inline**:

- Used only once
- Simple, obvious selector

---

## 4. Type Definitions

**Rule**: Define interfaces at the top of the file, after imports.

```typescript
import type { Page } from '@playwright/test';

// ============================================
// Types
// ============================================

export interface InterceptedData<TRequest = unknown, TResponse = unknown> {
  url: string
  method: string
  status: number
  requestBody: TRequest | null
  responseBody: TResponse | null
}

export interface InterceptResponseArgs {
  urlPattern: string | RegExp
  action: () => Promise<void>
  timeout?: number
}

// ============================================
// Implementation
// ============================================

export class UiBase { ... }
```

---

## 5. Generic Type Parameters

**Rule**: Use descriptive generic names, default to `unknown`.

```typescript
// GOOD - Clear intent with defaults
async interceptResponse<TRequest = unknown, TResponse = unknown>(
  args: InterceptResponseArgs,
): Promise<InterceptedData<TRequest, TResponse>> { ... }

// Usage with types
const { responseBody } = await this.interceptResponse<LoginPayload, TokenResponse>({
  urlPattern: /\/auth\/login/,
  action: async () => await this.submitButton().click(),
});

// Usage without types (falls back to unknown)
const { responseBody } = await this.interceptResponse({
  urlPattern: /\/api\/data/,
  action: async () => await this.loadButton().click(),
});
```

---

## 6. Private vs Public Methods

**Rule**: Use private for internal helpers, public for API.

```typescript
class UiBase extends TestContext {
  // PUBLIC: Part of the class API, documented
  async interceptResponse<T>(args: InterceptResponseArgs): Promise<T> {
    // Uses private helpers
    const response = await this.waitForMatchingResponse(args.urlPattern);
    return this.parseResponseBody(response);
  }

  // PRIVATE: Internal helper, not exposed
  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    const regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(regexPattern).test(url);
  }

  // PRIVATE: Internal helper
  private async parseResponseBody<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }
}
```

---

## 7. Error Handling Pattern

**Rule**: Fail fast with descriptive errors in public methods, silent fail in utilities.

```typescript
// PUBLIC METHOD: Fail fast with clear message
async apiGET<T>(endpoint: string): Promise<T> {
  if (!this.request) {
    throw new Error('Request context not set. Call setRequestContext() first.');
  }
  // ... implementation
}

// UTILITY: Silent fail, return null/undefined
private async parseResponseBody<T>(response: Response): Promise<T | null> {
  try {
    return await response.json() as T;
  } catch {
    // Response might not be JSON - return null, don't throw
    return null;
  }
}
```

---

## 8. Import Organization

**Rule**: Group imports in order: types, external, internal.

```typescript
// 1. Type imports (with 'import type')
import type { Environment } from '@variables';
import type { Page, Request, Response } from '@playwright/test';

// 2. Value imports from external packages
import { expect } from '@playwright/test';

// 3. Value imports from internal modules
import { TestContext } from '@TestContext';
import { buildUrl, config } from '@variables';
import { attachRequestResponseToAllure } from '@utils/allure';
```

---

## Quick Reference Table

| Pattern        | Rule                                  | Example                               |
| -------------- | ------------------------------------- | ------------------------------------- |
| **Parameters** | Max 2 positional, else use object     | `fn(args: Args)` not `fn(a, b, c, d)` |
| **Utilities**  | Only agnostic go to `utils/`          | `allure.ts` yes, `interception` no    |
| **Locators**   | Extract if used 2+ times              | `private readonly btn = () => ...`    |
| **Types**      | Define at top, after imports          | `interface X { ... }`                 |
| **Generics**   | Descriptive names, default to unknown | `<TRequest = unknown>`                |
| **Private**    | Internal helpers only                 | `private matchesPattern()`            |
| **Errors**     | Public: fail fast; Utils: silent      | `throw Error` vs `return null`        |
| **Imports**    | Order: types, external, internal      | Grouped with blank lines              |

---

## See Also

- [kata-ai-index.md](./kata-ai-index.md) - Full KATA framework guide
- [kata-architecture.md](./kata-architecture.md) - Layer architecture
- [automation-standards.md](./automation-standards.md) - Test writing standards
