# E2E Test Automation Coding

> **Phase**: 2 of 3 (Plan → Coding → Review)
> **Purpose**: Implement the KATA component and test file based on the approved plan.
> **Input**: Approved plan from Phase 1.

---

## Context Loading

**Load these files before proceeding:**

1. `.context/guidelines/TAE/kata-ai-index.md` → Core KATA patterns
2. `.context/guidelines/TAE/typescript-patterns.md` → TypeScript conventions
3. `.context/guidelines/TAE/automation-standards.md` → Rules and standards
4. `.context/playwright-automation-system.md` → Code architecture

**Optional (for UI exploration):**
- Use Playwright MCP (`mcp__playwright__*`) to explore UI and capture locators

---

## Input Required

1. **Approved Plan** from Phase 1 (`e2e-test-automation-plan.md`)
2. **Original Test Case** (Gherkin from Stage 3)

---

## Implementation Workflow

### Step 1: Verify Prerequisites

Before coding, verify:

```bash
# Check if base classes exist
cat tests/components/ui/UiBase.ts

# Check fixture structure
cat tests/components/UiFixture.ts

# Verify import aliases in tsconfig
grep -A 10 '"paths"' tsconfig.json
```

---

### Step 2: Create Type Definitions (if needed)

If the plan requires new types, add them first:

```typescript
// tests/data/types.ts

// Add new type for your component
export interface LoginCredentials {
  email: string;
  password: string;
}

export interface UserRegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

// Type for ATC parameters
export interface CheckoutData {
  productId: string;
  quantity: number;
  shippingAddress: ShippingAddress;
}
```

---

### Step 3: Implement UI Component

Create the KATA component following Layer 3 structure:

#### Component Template

```typescript
// tests/components/ui/{PageName}Page.ts

import type { TestContextOptions } from '@components/TestContext';
import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface {TypeName} {
  email: string;
  password: string;
  // Add fields based on test case variables
}

// ============================================================================
// COMPONENT IMPLEMENTATION
// ============================================================================

/**
 * {PageName}Page - UI Component for {feature description}
 *
 * Layer: 3 (Domain Component)
 * Extends: UiBase
 *
 * ATCs:
 * - {TEST-XXX}: {atcName}() - {description}
 */
export class {PageName}Page extends UiBase {
  // ==========================================================================
  // SHARED LOCATORS (used in 2+ ATCs)
  // ==========================================================================

  /**
   * Extract locator ONLY if used in multiple ATCs.
   * Otherwise, keep locators inline in ATC methods.
   */
  private readonly submitButton = () => this.page.locator('[data-testid="submit-btn"]');

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  /**
   * Navigate to the page.
   * Call this BEFORE ATCs that require navigation.
   */
  async goto(): Promise<void> {
    await this.page.goto(this.buildUrl('/{route}'));
    await this.page.waitForLoadState('networkidle');
  }

  // ==========================================================================
  // ATCs (Acceptance Test Cases)
  // ==========================================================================

  /**
   * {TEST-XXX}: {Description of what this ATC validates}
   *
   * Preconditions:
   * - Call goto() before this ATC
   * - User may need to be authenticated (see test file)
   *
   * Fixed Assertions:
   * - {assertion 1}
   * - {assertion 2}
   */
  @atc('{TEST-XXX}')
  async {atcName}(data: {TypeName}): Promise<void> {
    // -------------------------------------------------------------------------
    // ACTION: Fill form fields
    // -------------------------------------------------------------------------
    await this.page.locator('[data-testid="email-input"]').fill(data.email);
    await this.page.locator('[data-testid="password-input"]').fill(data.password);

    // -------------------------------------------------------------------------
    // ACTION: Submit form
    // -------------------------------------------------------------------------
    await this.submitButton().click();

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS: Validate expected outcome
    // -------------------------------------------------------------------------
    await expect(this.page).toHaveURL(/.*dashboard.*/);
    await expect(this.page.locator('[data-testid="welcome-message"]')).toBeVisible();
  }

  /**
   * {TEST-YYY}: Validate error when {negative condition}
   *
   * Preconditions:
   * - Call goto() before this ATC
   *
   * Fixed Assertions:
   * - Error message is displayed
   * - URL remains on same page
   */
  @atc('{TEST-YYY}')
  async {atcName}WithInvalid{X}(data: {TypeName}): Promise<void> {
    // -------------------------------------------------------------------------
    // ACTION: Fill form with invalid data
    // -------------------------------------------------------------------------
    await this.page.locator('[data-testid="email-input"]').fill(data.email);
    await this.page.locator('[data-testid="password-input"]').fill(data.password);

    // -------------------------------------------------------------------------
    // ACTION: Submit form
    // -------------------------------------------------------------------------
    await this.submitButton().click();

    // -------------------------------------------------------------------------
    // FIXED ASSERTIONS: Validate error state
    // -------------------------------------------------------------------------
    await expect(this.page.locator('[role="alert"]')).toBeVisible();
    await expect(this.page).toHaveURL(/.*login.*/); // Stays on same page
  }

  // ==========================================================================
  // PRIVATE HELPERS (if needed)
  // ==========================================================================

  /**
   * Helper to fill common form fields.
   * Use when same fill pattern is used in multiple ATCs.
   * NOT a public method - only used internally.
   */
  private async fillLoginForm(data: {TypeName}): Promise<void> {
    await this.page.locator('[data-testid="email-input"]').fill(data.email);
    await this.page.locator('[data-testid="password-input"]').fill(data.password);
  }
}
```

---

### Step 4: Register Component in Fixture

Add the new component to `UiFixture.ts`:

```typescript
// tests/components/UiFixture.ts

import type { TestContextOptions } from '@components/TestContext';
import { UiBase } from '@ui/UiBase';

// Import existing components
import { LoginPage } from '@ui/LoginPage';
// Add new import
import { {PageName}Page } from '@ui/{PageName}Page';

export class UiFixture extends UiBase {
  // Existing components
  public readonly login: LoginPage;

  // Add new component
  public readonly {pageName}: {PageName}Page;

  constructor(options: TestContextOptions) {
    super(options);

    // Initialize existing components
    this.login = new LoginPage(options);

    // Initialize new component
    this.{pageName} = new {PageName}Page(options);
  }
}
```

---

### Step 5: Implement Test File

Create the test file following KATA patterns:

#### Test File Template

```typescript
// tests/e2e/{feature}/{feature}.test.ts

import { expect } from '@playwright/test';
import { test } from '@TestFixture';
import type { {TypeName} } from '@ui/{PageName}Page';

// ============================================================================
// TEST SUITE: {Feature Name}
// ============================================================================

test.describe('{Feature Name}', () => {
  // ==========================================================================
  // TEST DATA FACTORY
  // ==========================================================================

  /**
   * Generate test data using Faker.
   * Called in each test to ensure unique data.
   */
  const createValidData = (): {TypeName} => ({
    email: `test-${Date.now()}@example.com`,
    password: 'SecurePassword123!',
    // Use TestContext.data.createXxx() if available
  });

  const createInvalidData = (): {TypeName} => ({
    email: 'invalid-email',
    password: 'short',
  });

  // ==========================================================================
  // TESTS: Happy Path
  // ==========================================================================

  test('should {action} successfully @regression @{feature}', async ({ ui }) => {
    // -------------------------------------------------------------------------
    // ARRANGE: Prepare test data
    // -------------------------------------------------------------------------
    const data = createValidData();

    // -------------------------------------------------------------------------
    // ACT: Navigate and execute ATC
    // -------------------------------------------------------------------------
    await ui.{pageName}.goto();
    await ui.{pageName}.{atcName}(data);

    // -------------------------------------------------------------------------
    // ASSERT: Optional test-level assertions (beyond ATC assertions)
    // -------------------------------------------------------------------------
    // ATC already validates primary assertions
    // Add test-specific assertions here if needed
  });

  // ==========================================================================
  // TESTS: Edge Cases / Negative
  // ==========================================================================

  test('should show error with invalid {field} @regression @{feature}', async ({ ui }) => {
    // -------------------------------------------------------------------------
    // ARRANGE
    // -------------------------------------------------------------------------
    const data = createInvalidData();

    // -------------------------------------------------------------------------
    // ACT
    // -------------------------------------------------------------------------
    await ui.{pageName}.goto();
    await ui.{pageName}.{atcName}WithInvalid{X}(data);

    // -------------------------------------------------------------------------
    // ASSERT: Additional negative case assertions
    // -------------------------------------------------------------------------
    // ATC validates error is shown
  });

  // ==========================================================================
  // TESTS: With API Setup (Hybrid)
  // ==========================================================================

  test('should {action} with existing data @regression', async ({ test: fixture }) => {
    const { api, ui } = fixture;

    // -------------------------------------------------------------------------
    // ARRANGE: Create data via API (fast setup)
    // -------------------------------------------------------------------------
    const [, createdResource] = await api.{resource}.createSuccessfully({
      // Resource data
    });

    // -------------------------------------------------------------------------
    // ACT: Verify via UI
    // -------------------------------------------------------------------------
    await ui.{pageName}.goto();
    await ui.{pageName}.view{Resource}Successfully(createdResource.id);

    // -------------------------------------------------------------------------
    // ASSERT
    // -------------------------------------------------------------------------
    // ATC handles assertions
  });
});
```

---

### Step 6: Run and Validate

Execute the test to verify implementation:

```bash
# Run specific test file
bun run test tests/e2e/{feature}/{feature}.test.ts

# Run with UI mode for debugging
bun run test:ui --grep "{test name}"

# Run with trace for detailed debugging
bun run test --trace on tests/e2e/{feature}/{feature}.test.ts
```

---

## Code Quality Checklist

Before completing the Coding phase, verify:

### Component Quality
- [ ] Extends `UiBase` correctly
- [ ] Constructor accepts `TestContextOptions`
- [ ] `@atc` decorator with correct Test ID
- [ ] Locators are inline (unless shared in 2+ ATCs)
- [ ] Fixed assertions inside ATC (not just in test)
- [ ] No `waitForTimeout()` - use proper wait conditions
- [ ] Import aliases used (`@ui/`, `@utils/`, etc.)

### Test File Quality
- [ ] Imports `test` from `@TestFixture`
- [ ] Test data generated fresh (not hardcoded)
- [ ] ARRANGE-ACT-ASSERT structure
- [ ] Appropriate tags (`@regression`, `@smoke`, etc.)
- [ ] Each test is independent (no shared state)
- [ ] Descriptive test names

### Type Safety
- [ ] All parameters have TypeScript types
- [ ] Return types specified on methods
- [ ] No `any` types
- [ ] Types exported for test file use

---

## Common Implementation Patterns

### Wait for API Response

```typescript
// Wait for specific API call to complete
const responsePromise = this.page.waitForResponse(
  response => response.url().includes('/api/endpoint') && response.status() === 200
);
await this.submitButton().click();
await responsePromise;
```

### Intercept and Validate Response

```typescript
// Using UiBase.interceptResponse helper
const { responseBody, status } = await this.interceptResponse<RequestType, ResponseType>({
  urlPattern: /\/api\/endpoint/,
  action: async () => {
    await this.submitButton().click();
  },
});

expect(status).toBe(200);
expect(responseBody.success).toBe(true);
```

### Handle Modals/Dialogs

```typescript
// Wait for modal and interact
await expect(this.page.locator('[data-testid="confirm-modal"]')).toBeVisible();
await this.page.locator('[data-testid="confirm-btn"]').click();
await expect(this.page.locator('[data-testid="confirm-modal"]')).not.toBeVisible();
```

### Dynamic Content

```typescript
// Wait for list to load
await this.page.waitForSelector('[data-testid="item-list"] [data-testid="item"]');
const items = this.page.locator('[data-testid="item-list"] [data-testid="item"]');
await expect(items).toHaveCount(expectedCount);
```

### Form with Multiple Steps

```typescript
// Step 1
await this.page.locator('[data-testid="step-1-field"]').fill(data.step1Value);
await this.page.locator('[data-testid="next-btn"]').click();

// Wait for step 2
await expect(this.page.locator('[data-testid="step-2-form"]')).toBeVisible();

// Step 2
await this.page.locator('[data-testid="step-2-field"]').fill(data.step2Value);
await this.page.locator('[data-testid="submit-btn"]').click();
```

---

## Anti-Patterns to Avoid

### ❌ Wrong: Single Interaction ATC

```typescript
// This is NOT an ATC - it's just a click
@atc('TEST-001')
async clickSubmit() {
  await this.page.click('#submit');
}
```

### ✅ Correct: Complete Test Case

```typescript
// Complete flow with assertions
@atc('TEST-001')
async submitFormSuccessfully(data: FormData) {
  await this.page.fill('#email', data.email);
  await this.page.fill('#name', data.name);
  await this.page.click('#submit');
  await expect(this.page).toHaveURL(/.*success.*/);
}
```

### ❌ Wrong: Hardcoded Waits

```typescript
await this.page.waitForTimeout(3000); // Never do this
```

### ✅ Correct: Condition-Based Waits

```typescript
await this.page.waitForSelector('[data-loaded="true"]');
await this.page.waitForLoadState('networkidle');
await expect(element).toBeVisible();
```

### ❌ Wrong: ATC Calling ATC

```typescript
@atc('TEST-001')
async checkoutFlow() {
  await this.loginSuccessfully(creds); // Another ATC!
  await this.addToCartSuccessfully(product); // Another ATC!
}
```

### ✅ Correct: Use Flows Module

```typescript
// In test file
const flows = new CheckoutFlows(ui);
await flows.setupAuthenticatedUserWithCart(creds, product);
await ui.checkout.completeCheckoutSuccessfully();
```

---

## Output Checklist

After completing the Coding phase:

- [ ] UI Component created: `tests/components/ui/{PageName}Page.ts`
- [ ] Component registered in: `tests/components/UiFixture.ts`
- [ ] Test file created: `tests/e2e/{feature}/{feature}.test.ts`
- [ ] Types defined (if new): `tests/data/types.ts`
- [ ] Test passes locally: `bun run test <test-file>`
- [ ] No TypeScript errors: `bun run type-check`
- [ ] Linting passes: `bun run lint`

---

## Next Step

Once implementation is complete and tests pass:

→ **Proceed to**: `e2e-test-code-review.md` (Phase 3)
