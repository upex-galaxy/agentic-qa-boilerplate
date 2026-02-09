# KATA Dependency Injection Strategy

> **Purpose**: Explains how Playwright drivers flow through the KATA architecture and why this design enables optimal test performance.
>
> **Audience**: QA Engineers, AI Agents implementing KATA components.
>
> **Prerequisites**: Read `kata-fundamentals.md` for KATA philosophy.

---

## Overview

KATA uses **constructor-based dependency injection** to propagate Playwright drivers (`page` and `request`) through the component hierarchy. This design, combined with **Playwright's lazy fixture initialization**, ensures:

1. **E2E tests** share the same browser context for UI and API operations
2. **API-only tests** never open a browser (zero overhead)
3. **Components remain decoupled** from Playwright's fixture system

---

## The Problem This Solves

### Anti-Pattern: Direct Fixture Access

```typescript
// BAD: Component directly depends on Playwright fixture system
class BookingsPage {
  constructor(private page: Page) {} // Where does page come from?
}

// Test must wire everything manually
test('example', async ({ page }) => {
  const bookingsPage = new BookingsPage(page);
  // What about API calls? Need another instance?
});
```

**Issues:**
- Components are tightly coupled to Playwright
- No shared context between UI and API operations
- Tests become boilerplate-heavy

### Anti-Pattern: Setter Injection

```typescript
// BAD: Setter pattern breaks immutability
class ApiClient {
  private request?: APIRequestContext;

  setRequestContext(request: APIRequestContext) {
    this.request = request;
  }
}
```

**Issues:**
- Object can be used before initialization
- Mutable state complicates debugging
- No compile-time safety

---

## The KATA Solution

### Core Principle: Single Entry Point, Shared Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Playwright Test Runner                          │
│                                                                      │
│  ┌─────────┐     ┌─────────┐                                        │
│  │  page   │     │ request │  ← Playwright creates these lazily     │
│  └────┬────┘     └────┬────┘                                        │
│       │               │                                              │
│       └───────┬───────┘                                              │
│               ▼                                                      │
│  ┌────────────────────────┐                                          │
│  │   TestContextOptions   │  ← Interface for driver passing         │
│  │  { page?, request? }   │                                          │
│  └───────────┬────────────┘                                          │
│              │                                                       │
└──────────────┼───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        KATA Architecture                             │
│                                                                      │
│  Layer 1: TestContext                                                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  _page?: Page          (stored, not used directly)             │  │
│  │  _request?: APIRequestContext                                  │  │
│  │  config, faker, env    (shared utilities)                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│              │ extends                                               │
│              ▼                                                       │
│  Layer 2: Base Classes                                               │
│  ┌────────────────────────┐    ┌────────────────────────┐           │
│  │       UiBase           │    │       ApiBase          │           │
│  │  get page(): Page      │    │  get request(): API... │           │
│  │  (validates + returns) │    │  (validates + returns) │           │
│  └────────────────────────┘    └────────────────────────┘           │
│              │ extends                    │ extends                  │
│              ▼                            ▼                          │
│  Layer 3: Components (ATCs)                                          │
│  ┌────────────────────────┐    ┌────────────────────────┐           │
│  │     LoginPage          │    │     BookingsApi        │           │
│  │     BookingsPage       │    │     InvoicesApi        │           │
│  │  (uses this.page)      │    │  (uses this.request)   │           │
│  └────────────────────────┘    └────────────────────────┘           │
│              │ composed by                │ composed by              │
│              ▼                            ▼                          │
│  Layer 4: Fixtures                                                   │
│  ┌────────────────────────┐    ┌────────────────────────┐           │
│  │      UiFixture         │    │      ApiFixture        │           │
│  │  .login, .bookings     │    │  .bookings, .invoices  │           │
│  └────────────────────────┘    └────────────────────────┘           │
│              │ combined in                │                          │
│              └──────────┬─────────────────┘                          │
│                         ▼                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    FullTestFixture                             │  │
│  │  .ui  → UiFixture                                              │  │
│  │  .api → ApiFixture                                             │  │
│  │  .page → Direct access for assertions                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. TestContextOptions Interface

The bridge between Playwright and KATA:

```typescript
// tests/components/TestContext.ts

export interface TestContextOptions {
  page?: Page;
  request?: APIRequestContext;
  environment?: Environment;
}
```

**Why optional (`?`)?**
- API tests don't need `page`
- Setup scripts might not need `request`
- Flexibility for different test scenarios

### 2. TestContext: The Foundation

```typescript
export class TestContext {
  // Protected: accessible by subclasses, not external code
  protected readonly _page?: Page;
  protected readonly _request?: APIRequestContext;

  // Public utilities available to all components
  readonly env: Environment;
  readonly config = config;
  readonly faker = faker;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }
}
```

**Key Design Decisions:**
- `_page` and `_request` are **protected**: Only base classes expose them via getters
- `readonly`: Immutable after construction
- `options = {}`: Default empty object allows instantiation without arguments

### 3. Base Classes: Validated Access

```typescript
// tests/components/ui/UiBase.ts

export class UiBase extends TestContext {
  constructor(options: TestContextOptions) {
    super(options);
  }

  get page(): Page {
    if (!this._page) {
      throw new Error(
        'Page is not available. Ensure you are using the `ui` fixture ' +
        'or passed { page } in TestContextOptions.'
      );
    }
    return this._page;
  }
}
```

```typescript
// tests/components/api/ApiBase.ts

export class ApiBase extends TestContext {
  constructor(options: TestContextOptions) {
    super(options);
  }

  get request(): APIRequestContext {
    if (!this._request) {
      throw new Error(
        'Request context is not available. Ensure you are using the `api` fixture ' +
        'or passed { request } in TestContextOptions.'
      );
    }
    return this._request;
  }
}
```

**Why getters instead of direct property access?**
1. **Runtime validation**: Clear error messages when misconfigured
2. **Encapsulation**: External code cannot set these properties
3. **Type narrowing**: Return type is `Page`, not `Page | undefined`

### 4. TestFixture: The Entry Point

```typescript
// tests/components/TestFixture.ts

export const test = base.extend<{
  test: FullTestFixture;
  api: ApiFixture;
  ui: UiFixture;
}>({
  // Full fixture: UI + API with shared context
  test: async ({ page, request }, use) => {
    const fixture = new FullTestFixture(page, request);
    await use(fixture);
  },

  // API-only fixture: NO browser opened
  api: async ({ request }, use) => {
    const apiFixture = new ApiFixture({ request });
    await use(apiFixture);
  },

  // UI fixture: Has both page and request for hybrid tests
  ui: async ({ page, request }, use) => {
    const uiFixture = new UiFixture({ page, request });
    await use(uiFixture);
  },
});
```

---

## Playwright Lazy Fixture Initialization

### How It Works

From [Playwright Test Fixtures documentation](https://playwright.dev/docs/test-fixtures):

> "Fixtures are created on demand. Only fixtures that are actually required by a test are created."

This means:

```typescript
// This test NEVER opens a browser
test('API test', async ({ api }) => {
  // Only `request` is initialized, not `page`
  await api.bookings.getAll();
});

// This test opens a browser
test('E2E test', async ({ ui }) => {
  // Both `page` and `request` are initialized
  await ui.login.authenticate(user, password);
});
```

### Proof of Lazy Loading

```typescript
// In TestFixture.ts

api: async ({ request }, use) => {
  //        ^^^^^^^^^ Only request is requested from Playwright
  //                  No `page` dependency = no browser
  const apiFixture = new ApiFixture({ request });
  await use(apiFixture);
},
```

**Performance Impact:**
- API tests: ~50ms startup (no browser)
- UI tests: ~2-5s startup (browser launch)

### Test Runner Output Comparison

```bash
# API tests only
$ bun run test:integration
Running 50 tests...
Finished in 4.2s  # Fast: no browser

# E2E tests
$ bun run test:e2e
Running 20 tests...
Finished in 45s  # Slower: browser operations
```

---

## Shared Context in E2E Tests

### The Problem: Separate Contexts

```typescript
// BAD: API and UI have different contexts
test('create via API, verify via UI', async ({ api, ui }) => {
  // API uses one request context
  const booking = await api.bookings.create(data);

  // UI uses a different session - might not see the booking!
  await ui.bookings.navigateTo();
});
```

### The Solution: Unified Fixture

```typescript
// GOOD: Same context for both operations
test('create via API, verify via UI', async ({ test: fixture }) => {
  // Both use the same request context (same auth token)
  const booking = await fixture.api.bookings.create(data);

  // UI shares the context - guaranteed to see the booking
  await fixture.ui.bookings.navigateToBooking(booking.id);
});
```

### How Shared Context Works

```typescript
class FullTestFixture extends TestContext {
  api: ApiFixture;
  ui: UiFixture;

  constructor(page: Page, request: APIRequestContext, environment?: Environment) {
    super({ page, request, environment });

    // SAME options object passed to both fixtures
    const options = { page, request, environment: this.env };
    this.api = new ApiFixture(options);
    this.ui = new UiFixture(options);
  }
}
```

---

## Instance Flow Visualization

### For an E2E Test

```
1. Playwright creates `page` and `request`
   │
2. TestFixture.ts receives them in fixture function
   │
   └─► const fixture = new FullTestFixture(page, request)
       │
3. FullTestFixture constructor
   │
   ├─► super({ page, request }) → TestContext stores _page, _request
   │
   ├─► const options = { page, request, environment }
   │
   ├─► new ApiFixture(options)
   │   │
   │   └─► Passes same options to ApiBase → BookingsApi, InvoicesApi...
   │
   └─► new UiFixture(options)
       │
       └─► Passes same options to UiBase → LoginPage, BookingsPage...

4. All components share the SAME page and request instances
```

### For an API Test

```
1. Playwright creates ONLY `request` (no browser)
   │
2. TestFixture.ts receives request
   │
   └─► const apiFixture = new ApiFixture({ request })
       │
3. ApiFixture constructor
   │
   └─► Passes { request } to all API components

4. No page involved → No browser opened → Fast execution
```

---

## Best Practices

### DO: Pass Options Through Constructors

```typescript
// Component always receives options in constructor
export class BookingsPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }
}
```

### DON'T: Create Components Without Context

```typescript
// BAD: Where will page come from?
const bookings = new BookingsPage();
```

### DO: Use Appropriate Fixture

```typescript
// API test → use `api` fixture
test('get bookings', async ({ api }) => {
  await api.bookings.getAll();
});

// E2E test → use `ui` fixture
test('view bookings page', async ({ ui }) => {
  await ui.bookings.navigateTo();
});

// Hybrid test → use `test` fixture
test('create via API, verify via UI', async ({ test: fixture }) => {
  const booking = await fixture.api.bookings.create(data);
  await fixture.ui.bookings.verifyExists(booking.id);
});
```

### DON'T: Request Unused Fixtures

```typescript
// BAD: Requests page but never uses it
test('API only', async ({ ui }) => {  // ui requests page!
  await ui.request.get('/api/bookings');  // Only uses request
});

// GOOD: Use api fixture for API-only tests
test('API only', async ({ api }) => {
  await api.bookings.getAll();
});
```

---

## Troubleshooting

### Error: "Page is not available"

**Cause**: Using UI component without `page` in options.

**Fix**: Use `ui` or `test` fixture instead of `api`:

```typescript
// Before (wrong)
test('example', async ({ api }) => {
  await api.page.goto('/');  // Error: api doesn't have page
});

// After (correct)
test('example', async ({ ui }) => {
  await ui.page.goto('/');
});
```

### Error: "Request context is not available"

**Cause**: Using API component without `request` in options.

**Fix**: Ensure you're using `api`, `ui`, or `test` fixture:

```typescript
// All three fixtures provide request
test('example', async ({ api }) => {
  await api.bookings.getAll();  // Works
});
```

### Browser Opens for API Tests

**Cause**: Fixture is requesting `page` even if test doesn't use it.

**Check**: Your fixture definition in TestFixture.ts:

```typescript
// WRONG: Requests page unnecessarily
api: async ({ page, request }, use) => {  // <-- page here triggers browser
  const apiFixture = new ApiFixture({ request });
  await use(apiFixture);
},

// CORRECT: Only request needed
api: async ({ request }, use) => {  // <-- No page, no browser
  const apiFixture = new ApiFixture({ request });
  await use(apiFixture);
},
```

---

## Summary

| Principle | Implementation |
|-----------|----------------|
| **Single source of truth** | Playwright creates drivers once |
| **Constructor injection** | Options passed at instantiation |
| **Immutability** | `readonly` properties, no setters |
| **Validated access** | Getters with runtime checks |
| **Lazy initialization** | Only requested fixtures are created |
| **Shared context** | Same options object to all components |

---

## Related Documents

| Document | Location | Purpose |
|----------|----------|---------|
| KATA Fundamentals | `/docs/testing/test-architecture/kata-fundamentals.md` | KATA philosophy and component design |
| KATA Architecture | `/.context/guidelines/TAE/kata-architecture.md` | Layer structure and project reference |
| TypeScript Patterns | `/.context/guidelines/TAE/typescript-patterns.md` | Coding patterns and DRY principles |
| KATA AI Guide | `/.context/guidelines/TAE/KATA-AI-GUIDE.md` | Quick reference for AI agents |

### Source Code

| File | Purpose |
|------|---------|
| `tests/components/TestContext.ts` | Layer 1: TestContextOptions interface |
| `tests/components/ui/UiBase.ts` | Layer 2: Page getter with validation |
| `tests/components/api/ApiBase.ts` | Layer 2: Request getter with validation |
| `tests/components/TestFixture.ts` | Layer 4: Playwright fixture definitions |

---

**Last Updated**: February 2026
