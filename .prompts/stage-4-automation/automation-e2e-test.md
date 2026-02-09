# Automation E2E Test

> Implement E2E test automation following KATA architecture.

---

## Purpose

Create E2E (End-to-End) automated tests for validated scenarios using the KATA framework.

**This prompt is executed AFTER:**

- Test documented in Jira/Xray (Stage 3)
- Test marked as "automation-candidate"
- Framework setup complete (kata-framework-setup.md)

**Prerequisites:**

- Access to Playwright MCP tools (for exploration)
- KATA framework configured in project
- Test case documented in Jira/Xray

---

## CRITICAL: Read KATA Guidelines First

**Before implementing ANY automation, read:**

```
MANDATORY READING (in order):
1. .context/guidelines/TAE/KATA-AI-GUIDE.md       # Quick orientation
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

1. **Xray Test ID** - `TEST-XXX` to fetch test case details
2. **Test case content** - Gherkin or traditional format directly
3. **Multiple Test IDs** - For batch automation

**Also specify:**

- Target component (existing or new)
- Related User Story ID

---

## Workflow

### Phase 1: Understand the Test Case

**Read the test case from Jira/Xray or input:**

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
| Preconditions | Setup in test file or Preconditions module |
| Steps         | ATC method calls                           |
| Assertions    | Fixed assertions in ATC                    |

---

### Phase 2: UI Exploration (Optional)

**If locators are unknown, explore with Playwright MCP:**

```
Tools:
- mcp__playwright__browser_navigate → Go to page
- mcp__playwright__browser_snapshot → Get page structure
- mcp__playwright__browser_click → Test interactions
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
   └── YES → Consider Preconditions module
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

### Phase 4: Implement ATC

**Follow KATA template strictly:**

```typescript
/**
 * KATA Framework - Layer 3: {Page} Page Component
 */
import { expect, type Page } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';
import type { Environment } from '@variables';

// Types
export interface CheckoutData {
  cardNumber: string;
  expiry: string;
  cvv: string;
}

export class CheckoutPage extends UiBase {
  constructor(page: Page, environment?: Environment) {
    super(page, environment);
  }

  async goto() {
    await this.page.goto('/checkout');
  }

  @atc('TEST-XXX') // Map to Xray Test ID
  async completeCheckoutSuccessfully(data: CheckoutData) {
    await this.goto();

    // Locators INLINE - not stored separately
    await this.page.locator('#card-number').fill(data.cardNumber);
    await this.page.locator('#expiry').fill(data.expiry);
    await this.page.locator('#cvv').fill(data.cvv);
    await this.page.locator('button[type="submit"]').click();

    // Fixed assertions - validate ATC succeeded
    await expect(this.page).toHaveURL(/.*confirmation.*/);
    await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible();
  }
}
```

---

### Phase 5: Implement Test File

```typescript
import { test, expect } from '@TestFixture';

test.describe('Checkout Flow', () => {
  test('should complete checkout successfully @critical', async ({ kata }) => {
    // ARRANGE - Test data
    const checkoutData = {
      cardNumber: '4242424242424242',
      expiry: '12/25',
      cvv: '123',
    };

    // Preconditions (if needed)
    await kata.ui.auth.loginSuccessfully(credentials);
    await kata.ui.cart.addItemSuccessfully('Product A');

    // ACT - Use ATC
    await kata.ui.checkout.completeCheckoutSuccessfully(checkoutData);

    // ASSERT - Additional test-level assertions (if needed)
    // Note: Most assertions should be in the ATC
  });
});
```

---

### Phase 6: Register Component

**Add to UiFixture.ts:**

```typescript
import { CheckoutPage } from '@ui/CheckoutPage';

export class UiFixture extends UiBase {
  readonly checkout: CheckoutPage; // Add

  constructor(page: Page, environment?: Environment) {
    super(page, environment);
    this.checkout = new CheckoutPage(page, environment); // Initialize
  }
}
```

---

### Phase 7: Validate

**Run the test:**

```bash
bun run test tests/e2e/checkout/checkout.test.ts
```

**KATA Compliance Checklist:**

- [ ] ATC has `@atc('TEST-XXX')` decorator
- [ ] ATC represents UNIQUE expected output
- [ ] Locators are INLINE (not stored separately)
- [ ] NO helper methods for single actions
- [ ] Fixed assertions validate success
- [ ] Uses import aliases (`@components/`, `@utils/`)
- [ ] Component registered in Fixture
- [ ] Test imports from `@TestFixture`

---

### Phase 8: Update Xray

**Mark test as automated:**

```
Tool: mcp__atlassian__* (if available)

Update:
- Test Status: "Automated"
- Add label: "automated"
- Add comment: "Automated in TEST-XXX - [file path]"
```

---

## Multiple ATCs

**If automating multiple tests:**

1. Group related ATCs in same component
2. Create each ATC following the same pattern
3. One commit per logical group

```bash
git add tests/components/ui/CheckoutPage.ts tests/e2e/checkout/
git commit -m "feat(test): add checkout automation - TEST-001, TEST-002"
```

---

## Output

- ATC implemented following KATA standards
- Test file created/updated
- Component registered in Fixture
- Test passing locally
- Xray test marked as automated
