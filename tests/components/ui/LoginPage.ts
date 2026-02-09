/**
 * KATA Framework - Layer 3: Login Page Component
 *
 * UI component for authentication via the login page.
 * Handles login flows for E2E tests.
 *
 * Page: /login
 * Locators (verified):
 * - Username: input[name="username"]
 * - Password: input[name="password"]
 * - Submit: button[type="submit"]
 */

import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc } from '@utils/decorators';

// ============================================
// Types - Login data structures
// ============================================

/**
 * Login credentials for UI authentication
 */
export interface LoginCredentials {
  username: string
  password: string
}

// ============================================
// Login Page Component
// ============================================

export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers (Private)
  // ============================================

  /**
   * Fill login form and submit
   * Helper that combines fill + submit actions
   */
  private async fillAndSubmitLoginForm(credentials: LoginCredentials): Promise<void> {
    await this.page.locator('input[name="username"]').fill(credentials.username);
    await this.page.locator('input[name="password"]').fill(credentials.password);
    await this.page.locator('button[type="submit"]').click();
  }

  // ============================================
  // Navigation (Public)
  // ============================================

  /**
   * Navigate to the login page
   * Call this BEFORE using login ATCs
   */
  async goto(): Promise<void> {
    await this.page.goto(this.buildUrl('/login'));
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: Login with valid credentials - expects success
   *
   * IMPORTANT: Call goto() before this ATC.
   * Fills credentials, submits, and verifies redirect away from login page.
   *
   * @param credentials - Username (email) and password
   */
  @atc('CUR-LOGIN-001')
  async loginSuccessfully(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    // Fixed assertion - user should be redirected away from login page
    await this.page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await expect(this.page).not.toHaveURL(/.*\/login.*/);
  }

  /**
   * ATC: Login with invalid credentials - expects error
   *
   * IMPORTANT: Call goto() before this ATC.
   * Fills invalid credentials, submits, and verifies error message.
   *
   * @param credentials - Invalid username or password
   */
  @atc('CUR-LOGIN-002')
  async loginWithInvalidCredentials(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    // Fixed assertion - error should be visible and user stays on login page
    const errorIndicator = this.page
      .locator('[role="alert"]')
      .or(this.page.locator('.error-message'))
      .or(this.page.locator('.alert-danger'))
      .or(this.page.locator('[class*="error"]'));

    await expect(errorIndicator.first()).toBeVisible({ timeout: 5000 });
    await expect(this.page).toHaveURL(/.*\/login.*/);
  }
}
