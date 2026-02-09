# E2E Testing Patterns

> How to write End-to-End tests using the KATA framework.

---

## Overview

E2E Testing in KATA validates complete user journeys through the browser. These tests interact with the UI just like a real user would, verifying that the entire system works correctly from the frontend to the backend.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      E2E TESTING ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Test File (.test.ts)                                                   │
│        │                                                                 │
│        ▼                                                                 │
│   ┌───────────┐     ┌─────────────────────────────────────────────────┐ │
│   │ UiFixture │────▶│  Page Components (LoginPage, BookingsPage, etc.)│ │
│   └───────────┘     │       │                                         │ │
│                     │       ▼                                         │ │
│                     │  ┌─────────┐   ┌──────────────────────────────┐ │ │
│                     │  │ UiBase  │──▶│ Playwright Page + Helpers    │ │ │
│                     │  └─────────┘   └──────────────────────────────┘ │ │
│                     │       │                                         │ │
│                     │       ▼                                         │ │
│                     │  ┌─────────────┐                                │ │
│                     │  │ TestContext │ (config, faker, environment)   │ │
│                     │  └─────────────┘                                │ │
│                     └─────────────────────────────────────────────────┘ │
│                                                                          │
│   Optional: ApiFixture for hybrid testing (API setup + UI validation)   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
tests/
├── e2e/                          # E2E test files
│   ├── module-example/
│   │   └── example.test.ts       # Example tests (reference only)
│   ├── auth/
│   │   └── login.test.ts         # Login flow tests
│   └── bookings/
│       └── bookings.test.ts      # Bookings flow tests
│
├── components/
│   ├── TestContext.ts            # Layer 1: Config, Faker, Environment
│   ├── TestFixture.ts            # Layer 4: Unified fixture (api + ui)
│   ├── UiFixture.ts              # Layer 4: DI container for UI components
│   └── ui/
│       ├── UiBase.ts             # Layer 2: Page helpers, interception
│       ├── LoginPage.ts          # Layer 3: Login ATCs
│       └── BookingsPage.ts       # Layer 3: Bookings ATCs
│
├── setup/                        # Auth setup (authenticated state)
│   └── ui-auth.setup.ts          # Login and save storageState
```

---

## Layer Architecture for E2E Testing

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Test File (tests/e2e/auth/login.test.ts)                               │
│  → Orchestrates ATCs, no business logic here                            │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ uses { ui } or { test } fixture
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  UiFixture (tests/components/UiFixture.ts)                              │
│  → Dependency Injection container                                        │
│  → Exposes all UI components: ui.login, ui.bookings, etc.               │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ instantiates
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Page Components (tests/components/ui/*.ts)                              │
│  → LoginPage, BookingsPage, InvoicesPage, etc.                           │
│  → Contains ATCs (@atc decorator) with fixed assertions                  │
│  → Locators defined inline within ATCs                                   │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ extends
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  UiBase (tests/components/ui/UiBase.ts)                                  │
│  → Playwright Page instance (this.page)                                  │
│  → Response interception helpers                                         │
│  → URL building helper                                                   │
└────────────────────────┬────────────────────────────────────────────────┘
                         │ extends
                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  TestContext (tests/components/TestContext.ts)                           │
│  → Environment config (dev, staging, prod)                               │
│  → Faker instance for test data generation                               │
│  → Global utilities                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Writing E2E Tests

### 1. Test File Structure

```typescript
// tests/e2e/auth/login.test.ts
import { expect, test } from '@TestFixture';

test.describe('Login Flow', () => {
  test('should login with valid credentials @critical', async ({ ui }) => {
    // ARRANGE - Prepare test data
    const credentials = {
      username: 'admin@example.com',
      password: 'ValidPassword123!',
    };

    // ACT & ASSERT - ATC handles the complete flow
    await ui.login.loginSuccessfully(credentials);

    // Additional test-level assertions (optional)
    await expect(ui.page).toHaveURL(/.*dashboard.*/);
  });

  test('should show error for invalid credentials', async ({ ui }) => {
    // ARRANGE
    const invalidCredentials = {
      username: 'fake@example.com',
      password: 'wrongpassword',
    };

    // ACT & ASSERT
    await ui.login.loginWithInvalidCredentials(invalidCredentials);
  });
});
```

### 2. Page Component Structure

```typescript
// tests/components/ui/BookingsPage.ts
import type { Page } from '@playwright/test';

import type { Environment } from '@variables';
import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

// ============================================
// Types
// ============================================

export interface BookingFilter {
  hotelId?: number;
  month?: string;
}

// ============================================
// Page Component
// ============================================

export class BookingsPage extends UiBase {
  constructor(page: Page, environment?: Environment) {
    super(page, environment);
  }

  // ============================================
  // Navigation
  // ============================================

  async goto() {
    await this.page.goto('/bookings');
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  @atc('CUR-BOOK-UI-001')
  async viewBookingsSuccessfully(filter: BookingFilter) {
    await this.goto();

    // Apply filters - locators inline
    if (filter.hotelId) {
      await this.page.locator('[data-testid="hotel-filter"]').selectOption(String(filter.hotelId));
    }
    if (filter.month) {
      await this.page.locator('[data-testid="month-filter"]').fill(filter.month);
    }

    // Submit filter
    await this.page.locator('[data-testid="apply-filter"]').click();

    // Fixed assertions
    await expect(this.page.locator('[data-testid="bookings-table"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="booking-row"]').first()).toBeVisible();
  }

  @atc('CUR-BOOK-UI-002')
  async viewEmptyBookingsState(filter: BookingFilter) {
    await this.goto();

    // Apply filters that return no results
    if (filter.hotelId) {
      await this.page.locator('[data-testid="hotel-filter"]').selectOption(String(filter.hotelId));
    }

    await this.page.locator('[data-testid="apply-filter"]').click();

    // Fixed assertions - empty state should be visible
    await expect(this.page.locator('[data-testid="empty-state"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="booking-row"]')).toHaveCount(0);
  }
}
```

### 3. Register Component in UiFixture

```typescript
// tests/components/UiFixture.ts
import type { Page } from '@playwright/test';

import type { Environment } from '@variables';
import { BookingsPage } from '@ui/BookingsPage'; // Import new component
import { LoginPage } from '@ui/LoginPage';
import { UiBase } from '@ui/UiBase';

export class UiFixture extends UiBase {
  readonly login: LoginPage;
  readonly bookings: BookingsPage; // Add new component

  constructor(page: Page, environment?: Environment) {
    super(page, environment);
    this.login = new LoginPage(page, environment);
    this.bookings = new BookingsPage(page, environment); // Initialize
  }
}
```

---

## UiBase Features

### Playwright Page Access

All UI components have direct access to the Playwright Page:

```typescript
// In any Page component
await this.page.goto('/bookings');
await this.page.locator('button').click();
await this.page.waitForURL(/.*dashboard.*/);
```

### Response Interception

UiBase provides helpers to intercept API responses during UI actions:

#### interceptResponse - Capture API response from an action

```typescript
@atc('CUR-LOGIN-001')
async loginAndCaptureToken(credentials: LoginCredentials) {
  await this.goto();

  await this.page.locator('input[name="username"]').fill(credentials.username);
  await this.page.locator('input[name="password"]').fill(credentials.password);

  // Intercept the login API response when clicking submit
  const { responseBody, status } = await this.interceptResponse<LoginPayload, TokenResponse>({
    urlPattern: /\/auth\/login/,
    action: async () => {
      await this.page.locator('button[type="submit"]').click();
    },
  });

  // Fixed assertions using intercepted data
  expect(status).toBe(200);
  expect(responseBody?.access_token).toBeDefined();

  await this.page.waitForURL(url => !url.pathname.includes('/login'));
}
```

#### waitForApiResponse - Wait for an already-triggered response

```typescript
@atc('CUR-BOOK-UI-003')
async loadBookingsAndVerifyCount() {
  await this.goto();

  // Click filter and wait for response
  await this.page.locator('[data-testid="apply-filter"]').click();

  const { responseBody } = await this.waitForApiResponse<void, Booking[]>({
    urlPattern: /\/api\/bookings/,
  });

  // Use API response to verify UI state
  const expectedCount = responseBody?.length ?? 0;
  await expect(this.page.locator('[data-testid="booking-row"]')).toHaveCount(expectedCount);
}
```

---

## Hybrid Testing (API + UI)

The most powerful pattern: use API for setup and verification, UI for the actual flow.

### Using the Full Test Fixture

```typescript
// tests/e2e/bookings/create-booking.test.ts
import { expect, test } from '@TestFixture';

test.describe('Create Booking Flow', () => {
  test('should create booking via UI and verify via API', async ({ test: fixture }) => {
    const { api, ui } = fixture;

    // SETUP via API - fast, reliable
    await api.auth.loginSuccessfully({
      username: 'admin@example.com',
      password: 'AdminPass123!',
    });

    // ACT via UI - test the actual user flow
    await ui.bookings.goto();
    await ui.bookings.createBookingSuccessfully({
      hotelId: 123,
      guestEmail: ui.generateEmail('booking-test'),
      confirmationNumber: ui.faker.string.alphanumeric(10),
    });

    // VERIFY via API - reliable data verification
    const [, bookings] = await api.bookings.getBookingsSuccessfully(123);
    expect(bookings.length).toBeGreaterThan(0);
  });
});
```

### Accessing Both Fixtures Separately

```typescript
test('hybrid approach with separate fixtures', async ({ ui, api }) => {
  // API for data setup (no browser needed for this step)
  await api.auth.loginSuccessfully(credentials);

  // UI for the flow
  await ui.bookings.viewBookingsSuccessfully({ hotelId: 123 });
});
```

---

## ATC Naming Conventions for UI

| Scenario         | Pattern                      | Example                      |
| ---------------- | ---------------------------- | ---------------------------- |
| Success flow     | `{action}Successfully`       | `loginSuccessfully`          |
| Validation error | `{action}WithInvalid{Field}` | `submitFormWithInvalidEmail` |
| Empty state      | `view{Resource}EmptyState`   | `viewBookingsEmptyState`     |
| Specific state   | `{action}With{State}`        | `loginWithExpiredSession`    |

### Examples

```typescript
// Success scenarios
@atc('CUR-LOGIN-001') async loginSuccessfully(...) { ... }
@atc('CUR-BOOK-001') async viewBookingsSuccessfully(...) { ... }
@atc('CUR-BOOK-002') async createBookingSuccessfully(...) { ... }

// Error scenarios
@atc('CUR-LOGIN-010') async loginWithInvalidCredentials(...) { ... }
@atc('CUR-BOOK-010') async submitBookingWithInvalidData(...) { ... }

// State scenarios
@atc('CUR-BOOK-020') async viewBookingsEmptyState(...) { ... }
@atc('CUR-DASH-001') async viewDashboardWithNoData(...) { ... }
```

---

## Locators Best Practices

### Inline Locators (Default)

Locators go directly inside ATCs. No separate locator objects needed:

```typescript
// ✅ CORRECT - Locators inline
@atc('CUR-LOGIN-001')
async loginSuccessfully(credentials: LoginCredentials) {
  await this.page.locator('input[name="username"]').fill(credentials.username);
  await this.page.locator('input[name="password"]').fill(credentials.password);
  await this.page.locator('button[type="submit"]').click();
}

// ❌ WRONG - Separate locator objects
class LoginPage extends UiBase {
  locators = {
    usernameInput: this.page.locator('input[name="username"]'),
    passwordInput: this.page.locator('input[name="password"]'),
    submitButton: this.page.locator('button[type="submit"]'),
  };
}
```

### Extract Only if Reused (2+ Times)

```typescript
// ✅ CORRECT - Extracted because used in multiple ATCs
class BookingsPage extends UiBase {
  get filterButton() {
    return this.page.locator('[data-testid="apply-filter"]');
  }

  @atc('CUR-BOOK-001')
  async viewBookingsSuccessfully(filter: BookingFilter) {
    // ... apply filter
    await this.filterButton.click();
    // ...
  }

  @atc('CUR-BOOK-002')
  async viewBookingsWithDifferentFilter(filter: BookingFilter) {
    // ... apply different filter
    await this.filterButton.click();
    // ...
  }
}
```

### Locator Selector Priority

1. `data-testid` attributes (preferred for E2E)
2. Semantic selectors (`role`, `aria-label`)
3. CSS selectors (avoid if possible)

```typescript
// ✅ Best
await this.page.locator('[data-testid="submit-button"]').click();
await this.page.getByRole('button', { name: 'Submit' }).click();

// ✅ Acceptable
await this.page.locator('button[type="submit"]').click();

// ❌ Fragile - avoid
await this.page.locator('.btn-primary.mt-4').click();
await this.page.locator('div > form > button:nth-child(3)').click();
```

---

## Authenticated Tests

### Auth Setup File

```typescript
// tests/setup/ui-auth.setup.ts
import { expect, test as setup } from '@playwright/test';

import { config } from '@variables';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, request }) => {
  // Login via API (faster than UI)
  const response = await request.post(config.apiUrl + '/auth/login', {
    data: {
      username: config.auth.username,
      password: config.auth.password,
    },
  });

  expect(response.ok()).toBeTruthy();

  const { access_token } = await response.json();

  // Visit app to set cookies/localStorage
  await page.goto(config.baseUrl);
  await page.evaluate(token => {
    localStorage.setItem('token', token);
  }, access_token);

  // Save storage state
  await page.context().storageState({ path: authFile });
});
```

### Using Authenticated State

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'e2e',
      dependencies: ['setup'],
      use: {
        storageState: 'playwright/.auth/user.json',
      },
    },
  ],
});
```

---

## Running E2E Tests

```bash
# Run all E2E tests
bun run test:e2e

# Run specific test file
bun run test tests/e2e/auth/login.test.ts

# Run with specific browser
bun run test:e2e --project=chromium
bun run test:e2e --project=firefox
bun run test:e2e --project=webkit

# Run with UI mode (interactive)
bun run test:ui

# Run critical tests only (smoke)
bun run test:e2e --grep @critical

# Debug mode
bun run test:e2e --debug

# Generate Allure report
bun run test:allure
```

---

## Fixed Assertions in UI ATCs

Every ATC must include **fixed assertions** that validate the expected behavior:

```typescript
@atc('CUR-LOGIN-001')
async loginSuccessfully(credentials: LoginCredentials) {
  await this.goto();

  await this.page.locator('input[name="username"]').fill(credentials.username);
  await this.page.locator('input[name="password"]').fill(credentials.password);
  await this.page.locator('button[type="submit"]').click();

  // Fixed assertions - ALWAYS validate these
  await this.page.waitForURL(url => !url.pathname.includes('/login'));
  await expect(this.page).not.toHaveURL(/.*\/login.*/);
}
```

### Test-Level Assertions (Optional)

Additional assertions can be added in test files:

```typescript
test('login flow', async ({ ui }) => {
  await ui.login.loginSuccessfully(credentials);

  // Additional test-level assertions
  await expect(ui.page.locator('[data-testid="user-menu"]')).toBeVisible();
  await expect(ui.page.locator('[data-testid="welcome-message"]')).toContainText('Welcome');
});
```

---

## ATCs Don't Call ATCs

ATCs are atomic units. They should NOT call other ATCs. Use **Flows** for reusable ATC chains:

```typescript
// ❌ WRONG - ATC calling another ATC
class BookingsPage extends UiBase {
  @atc('CUR-BOOK-001')
  async createBookingSuccessfully(...) {
    await this.loginPage.loginSuccessfully(...); // WRONG!
    // ...
  }
}

// ✅ CORRECT - Use flows or setup in test file
test('create booking', async ({ ui }) => {
  await ui.login.loginSuccessfully(credentials); // Setup in test
  await ui.bookings.createBookingSuccessfully(data); // Then the actual ATC
});
```

---

## Best Practices

### 1. Use Playwright's Auto-Wait

Don't add explicit waits unless necessary. Playwright auto-waits for elements:

```typescript
// ✅ CORRECT - Playwright auto-waits
await this.page.locator('button').click();
await expect(this.page.locator('.result')).toBeVisible();

// ❌ WRONG - Unnecessary explicit wait
await this.page.waitForTimeout(2000);
await this.page.locator('button').click();
```

### 2. Keep Tests Independent

Each test should be able to run independently:

```typescript
// ✅ CORRECT - Test is self-contained
test('view bookings', async ({ ui }) => {
  await ui.login.loginSuccessfully(credentials);
  await ui.bookings.viewBookingsSuccessfully({ hotelId: 123 });
});

// ❌ WRONG - Depends on previous test
test('create booking', async ({ ui }) => {
  // Assumes login happened in previous test
  await ui.bookings.createBookingSuccessfully(data);
});
```

### 3. Use Tags for Test Organization

```typescript
test('critical login flow @critical @smoke', async ({ ui }) => { ... });
test('edge case login @regression', async ({ ui }) => { ... });
```

Run by tag: `bun run test --grep @critical`

---

## Allure Reporting

Intercepted responses are automatically attached to Allure reports. View with:

```bash
bun run test:allure
```

---

## References

- **KATA Architecture**: `.context/guidelines/TAE/kata-architecture.md`
- **Automation Standards**: `.context/guidelines/TAE/automation-standards.md`
- **API Testing Patterns**: `.context/guidelines/TAE/api-testing-patterns.md`
- **TypeScript Patterns**: `.context/guidelines/TAE/typescript-patterns.md`
