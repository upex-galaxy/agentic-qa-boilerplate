/**
 * KATA Framework - Layer 3: Example Page Component
 *
 * ⚠️  REFERENCE ONLY - THIS COMPONENT USES FICTIONAL PAGES
 *
 * This file demonstrates the KATA pattern for UI components.
 * Pages like '/example' and selectors are placeholders.
 * Use this as a structural guide, not as runnable code.
 *
 * To create your own functional component:
 * 1. Copy this file to tests/components/ui/YourPage.ts
 * 2. Replace fictional URLs with your real page paths
 * 3. Update locators to match your application's DOM
 * 4. Register in UiFixture.ts
 * 5. Run: bun run kata:manifest
 *
 * KATA Principles Demonstrated:
 * - ATCs are COMPLETE test cases (mini-flows), NOT single interactions
 * - Locators INLINE within ATCs by default
 * - Shared locators extracted to constructor when used in 2+ ATCs
 * - Each ATC has a UNIQUE expected output (Equivalence Partitioning)
 *
 * Locator Strategies Shown:
 * - Option 1: data-testid string (preferred) - use with page.getByTestId()
 * - Option 2: Arrow function returning Locator - for complex/dynamic selectors
 */

import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

// ============================================
// Types - Define your component's data structures
// ============================================

export interface ExampleFormData {
  email: string
  password: string
  name?: string
}

// ============================================
// Example Page Component
// ============================================

export class ExamplePage extends UiBase {
  // ============================================
  // Shared Locators (Extracted because used in 2+ ATCs)
  // ============================================

  // Option 1: data-testid string (simplest approach)
  private readonly errorMessageTestId = 'error-message';

  // Option 2: Arrow functions (for complex locators with fallbacks)
  private readonly emailInput = () =>
    this.page
      .getByTestId('email-input')
      .or(this.page.locator('#email'))
      .or(this.page.locator('input[name="email"]'));

  private readonly passwordInput = () =>
    this.page
      .getByTestId('password-input')
      .or(this.page.locator('#password'))
      .or(this.page.locator('input[name="password"]'));

  private readonly submitButton = () =>
    this.page.locator('button[type="submit"]').or(this.page.getByTestId('submit-button'));

  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Navigation
  // ============================================

  async goto() {
    // TODO: Update with your page path
    await this.page.goto('/example');
  }

  // ============================================
  // ATCs - Complete Test Cases
  // Each ATC = Unique Expected Output
  // ============================================

  /**
   * ATC: Submit form with valid data
   *
   * Complete flow: navigate, fill form, submit, verify success.
   * Expected Output: Success state (e.g., redirect, success message)
   *
   * TODO: Replace 'PROJ' with your Jira project key (e.g., @atc('UPEX-101'))
   */
  @atc('PROJ-101')
  async submitFormWithValidData(data: ExampleFormData) {
    await this.goto();

    // Using shared locators (extracted because used in multiple ATCs)
    await this.emailInput().first().fill(data.email);
    await this.passwordInput().first().fill(data.password);
    await this.submitButton().click();

    // TODO: Update assertion for your success condition
    // Example: redirect to dashboard
    await this.page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }

  /**
   * ATC: Submit form with invalid email
   *
   * Complete error flow: navigate, fill invalid data, submit, verify error.
   * Expected Output: Error message displayed (different from success)
   *
   * TODO: Replace 'PROJ' with your Jira project key (e.g., @atc('UPEX-102'))
   */
  @atc('PROJ-102')
  async submitFormWithInvalidEmail(email: string, password: string) {
    await this.goto();

    // Using shared locators
    await this.emailInput().first().fill(email);
    await this.passwordInput().first().fill(password);
    await this.submitButton().click();

    // Using data-testid string option with fallbacks
    const errorMessage = this.page
      .getByTestId(this.errorMessageTestId)
      .or(this.page.locator('.error-message'))
      .or(this.page.locator('[role="alert"]'));

    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
  }
}
