# E2E Test Coding

> **Phase**: 2 of 3 (Plan → Coding → Review)
> **Purpose**: Implement E2E test automation following KATA architecture.
> **Input**: Approved plan from `planning/test-implementation-plan.md`.

---

## Purpose

Create E2E (End-to-End) automated tests for validated scenarios using the KATA framework.

**This prompt is executed AFTER:**

- Test documented in TMS (Stage 4)
- Test marked as "automation-candidate"
- KATA framework configured in project

**Prerequisites:**

- Access to Playwright MCP tools (for exploration)
- KATA framework configured in project
- Test case documented in TMS

---

## CRITICAL: Read KATA Guidelines First

**Before implementing ANY automation, read:**

```
MANDATORY READING (in order):
1. .context/guidelines/TAE/kata-ai-index.md       # Quick orientation
2. .context/guidelines/TAE/automation-standards.md # Rules and patterns
3. .context/guidelines/TAE/kata-architecture.md    # Layer structure
```

**Key KATA principles to follow:**

- ATCs represent UNIQUE expected outputs
- Locators INLINE within ATCs (no separate storage)
- NO helper methods for single Playwright actions
- ATCs do NOT call other ATCs
- Fixed assertions INSIDE ATCs

---

## Input Required

Provide ONE of the following:

1. **TMS Test ID** - Test case ID to fetch details from TMS
2. **Test case content** - Gherkin or traditional format directly
3. **Multiple Test IDs** - For batch automation

**Also specify:**

- Target component (existing or new)
- Related User Story ID

---

## Workflow

### Phase 1: Understand the Test Case

**Read the test case from TMS or input:**

```
Extract:
├── Test name/summary
├── Preconditions
├── Steps (Given/When/Then or traditional)
├── Expected outcomes
└── Test data requirements
```

**Map to KATA structure:**

| Test Element  | KATA Element                               |
| ------------- | ------------------------------------------ |
| Preconditions | Setup in test file or Steps module         |
| Steps         | ATC method calls                           |
| Assertions    | Fixed assertions in ATC                    |

---

### Phase 2: UI Exploration (Optional)

**If locators are unknown, explore with Playwright CLI:**

```bash
# Use skill first
Use skill: playwright-cli

# Then explore
playwright-cli goto "{url}"
playwright-cli snapshot
playwright-cli click "{selector}"
```

**Document locators found:**

```markdown
## Locators Identified

| Element       | Locator                 | Backup Locator                |
| ------------- | ----------------------- | ----------------------------- |
| Email input   | `#email`                | `[data-testid="email-input"]` |
| Submit button | `button[type="submit"]` | `[data-testid="submit"]`      |
```

---

### Phase 3: Architecture Decision

**Determine what to create/modify:**

```
Questions:
1. Does the UI component exist? (e.g., LoginPage.ts)
   └── YES → Add new ATC to existing component
   └── NO  → Create new component

2. Does the ATC already exist?
   └── YES → Use existing ATC
   └── NO  → Create new ATC

3. Is this a reusable flow (2+ tests)?
   └── YES → Consider Steps module
   └── NO  → Keep in test file
```

**Output plan to user:**

```markdown
## Implementation Plan

**Files to CREATE:**

- tests/components/ui/CheckoutPage.ts
  └── ATC: completeCheckoutSuccessfully

**Files to MODIFY:**

- tests/components/UiFixture.ts
  └── Add: readonly checkout: CheckoutPage

**Test file:**

- tests/e2e/checkout/checkout.test.ts
```

---

### Phase 4: Implement UI Component

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

### Phase 5: Register Component in Fixture

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

### Phase 6: Implement Test File

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

### Phase 7: Run and Validate

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

### Phase 8: Update TMS

**Mark test as automated in TMS:**

- Update test case with automation plan (file path and description)
- Link to test file location
- Update status if needed

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

### ✅ Correct: Use Steps Module

```typescript
// In test file (preconditions via Steps)
await steps.checkout.setupAuthenticatedUserWithCart(creds, product);
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

→ **Proceed to**: `review/e2e-test-review.md` (Phase 3)
