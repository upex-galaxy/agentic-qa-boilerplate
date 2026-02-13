# Data-TestID Usage Guidelines

> **For**: Test Automation Engineers
> **Stage**: 4 (Test Automation)
> **Purpose**: How to USE data-testid in Playwright tests

---

## Purpose

This document explains how to use existing `data-testid` attributes in the application for test automation with Playwright.

---

## Naming Conventions (Quick Reference)

Understanding the naming conventions helps predict `data-testid` values:

| Context           | Convention   | Example                         |
| ----------------- | ------------ | ------------------------------- |
| Component (root)  | `camelCase`  | `data-testid="shoppingCart"`    |
| Specific element  | `snake_case` | `data-testid="email_input"`     |
| Component section | `snake_case` | `data-testid="billing_section"` |
| Action button     | `snake_case` | `data-testid="checkout_button"` |

**Pattern**: `{description}_{type}` where type = `input`, `button`, `link`, `section`, `list`, `item`, etc.

---

## Locator Priority

In Playwright, follow this priority when selecting elements:

| Priority | Locator       | When to use                        |
| -------- | ------------- | ---------------------------------- |
| **1**    | `data-testid` | Always preferred                   |
| **2**    | `getByRole`   | Semantic elements (buttons, links) |
| **3**    | `getByLabel`  | Inputs with associated label       |
| **4**    | `getByText`   | Unique visible content             |
| **5**    | CSS/XPath     | Last resort                        |

**Rule**: If `data-testid` exists, use it. It's the most stable locator and resistant to UI changes.

---

## Playwright Syntax

### Basic Selector

```typescript
// ✅ Correct - Use getByTestId
const loginButton = page.getByTestId('login-submit-button');

// ✅ Also valid - locator with CSS
const loginButton = page.locator('[data-testid="login-submit-button"]');

// ❌ Incorrect - Use CSS class (fragile)
const loginButton = page.locator('.btn-primary');
```

### Within KATA Components

```typescript
// tests/components/ui/LoginPage.ts
export class LoginPage extends UiBase {
  // Locators defined as properties (only if used in 2+ ATCs)
  private readonly emailInput = () => this.page.getByTestId('login-email-input');
  private readonly passwordInput = () => this.page.getByTestId('login-password-input');
  private readonly submitButton = () => this.page.getByTestId('login-submit-button');
  private readonly errorMessage = () => this.page.getByTestId('login-error-message');

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ATC that uses the locators
  @atc('AUTH-UI-001')
  async loginSuccessfully(email: string, password: string) {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }
}
```

---

## Common Patterns

### 1. Lists of Elements

When there are multiple elements with the same pattern:

```typescript
// In the DOM:
// <div data-testid="product-card">...</div>
// <div data-testid="product-card">...</div>
// <div data-testid="product-card">...</div>

// Get all
const allCards = page.getByTestId('product-card');
const count = await allCards.count();

// Get by index
const firstCard = allCards.nth(0);
const lastCard = allCards.last();

// Iterate
for (const card of await allCards.all()) {
  // do something with each card
}
```

### 2. Elements with Dynamic ID

```typescript
// In the DOM:
// <button data-testid="edit-product-123">Edit</button>
// <button data-testid="edit-product-456">Edit</button>

// Exact selector
const editButton = page.getByTestId('edit-product-123');

// Selector with regex (if ID is variable)
const editButton = page.locator('[data-testid^="edit-product-"]').first();
```

### 3. Element States

```typescript
// Loading state
const loadingSpinner = page.getByTestId('products-loading');
await expect(loadingSpinner).toBeVisible();

// Empty state
const emptyState = page.getByTestId('products-empty-state');
await expect(emptyState).toContainText('No products found');

// Error state
const errorState = page.getByTestId('products-error-state');
await expect(errorState).toBeVisible();
```

### 4. Forms

```typescript
// Fields
const nameInput = page.getByTestId('form-name-input');
const emailInput = page.getByTestId('form-email-input');

// Error validation
const nameError = page.getByTestId('form-name-error');
await expect(nameError).toHaveText('Name is required');

// Submit
const submitButton = page.getByTestId('form-submit-button');
```

---

## When data-testid is Missing

### Step 1: Verify if it Exists

Use browser DevTools:

```javascript
// In browser Console
document.querySelectorAll('[data-testid]');
```

### Step 2: Report to DEV Team

If a necessary `data-testid` is missing:

1. **Create Jira issue** with:
   - Affected component
   - Page/route where it is located
   - Element that needs testid
   - Suggested name following `data-testid-standards.md`

2. **Request format**:

```markdown
## data-testid Request

**Component:** LoginForm
**Route:** /auth/login
**Element:** Form submit button

**Suggested data-testid:** `login-submit-button`

**Reason:** Needed to automate E2E login test
```

### Step 3: Temporary Workaround

If urgent and cannot wait:

```typescript
// ⚠️ TEMPORARY - Use less stable fallback
const submitButton = page.getByRole('button', { name: 'Login' });

// Add comment for future refactor
// TODO: Change to getByTestId('login-submit-button') when DEV adds the testid
```

---

## Anti-Patterns

### DON'T Do

```typescript
// ❌ Selectors based on CSS classes
page.locator('.btn-primary');

// ❌ Selectors based on DOM structure
page.locator('div > form > button:last-child');

// ❌ Selectors by changing text
page.getByText('Sign In'); // may change to 'Login'

// ❌ Hardcode indices without reason
page.locator('[data-testid="card"]').nth(2); // why the third one?

// ❌ Mix CSS selectors with data-testid
page.locator('.container [data-testid="button"]');
```

### DO Do

```typescript
// ✅ Use direct data-testid
page.getByTestId('login-submit-button');

// ✅ Use getByRole for semantic elements without testid
page.getByRole('button', { name: /submit/i });

// ✅ Chain with filter when necessary
page.getByTestId('product-card').filter({ hasText: 'iPhone' });

// ✅ Use descriptive locator
const specificCard = page.getByTestId('product-card-iphone-15');
```

---

## Integration with KATA

### In Components

Components encapsulate locators and expose ATCs:

```typescript
// tests/components/ui/LoginPage.ts
import { UiBase } from './UiBase';
import { atc } from '@utils/decorators';

export class LoginPage extends UiBase {
  // Shared locators (used in multiple ATCs)
  private readonly emailInput = () => this.page.getByTestId('login-email-input');
  private readonly passwordInput = () => this.page.getByTestId('login-password-input');
  private readonly submitButton = () => this.page.getByTestId('login-submit-button');
  private readonly errorMessage = () => this.page.getByTestId('login-error-message');

  @atc('AUTH-UI-001')
  async loginSuccessfully(email: string, password: string) {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }

  @atc('AUTH-UI-002')
  async loginWithInvalidCredentials(email: string, password: string) {
    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();
    await expect(this.errorMessage()).toBeVisible();
  }
}
```

### In Tests

Tests use fixture and call ATCs:

```typescript
// tests/e2e/auth/login.test.ts
import { test, expect } from '@TestFixture';

test('login with valid credentials', async ({ ui }) => {
  await ui.page.goto('/login');
  await ui.login.loginSuccessfully('user@example.com', 'Password123!');
});

test('login with invalid credentials shows error', async ({ ui }) => {
  await ui.page.goto('/login');
  await ui.login.loginWithInvalidCredentials('wrong@example.com', 'badpass');
});
```

---

## Debugging

### Find Elements by data-testid

```bash
# In Playwright Inspector (UI Mode)
npx playwright test --ui

# In Debug Mode
npx playwright test --debug
```

### List All data-testid on a Page

```typescript
// Utility script
test('list all testids', async ({ page }) => {
  await page.goto('/login');

  const testIds = await page.evaluate(() => {
    const elements = document.querySelectorAll('[data-testid]');
    return Array.from(elements).map(el => ({
      testId: el.getAttribute('data-testid'),
      tagName: el.tagName,
      text: el.textContent?.slice(0, 50),
    }));
  });

  console.table(testIds);
});
```

---

## See Also

- `./automation-standards.md` - General automation standards
- `./kata-architecture.md` - KATA Architecture
- `./kata-ai-index.md` - AI implementation guide
