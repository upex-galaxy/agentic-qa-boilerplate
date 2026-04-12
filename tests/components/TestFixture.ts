/**
 * KATA Architecture - Layer 4: Unified Test Fixture
 *
 * Main entry point for all test types (E2E, Integration).
 * Combines API and UI fixtures for seamless hybrid testing.
 *
 * This file extends Playwright's test with custom fixtures that provide:
 * - `test`: Full fixture with both UI and API (for E2E tests)
 * - `ui`: UI-only fixture (for E2E tests)
 * - `api`: API-only fixture (for integration tests)
 *
 * IMPORTANT: All fixtures share the same context from TestContext.
 * This ensures that UI and API operations use the same Playwright drivers,
 * maintaining consistency across hybrid tests.
 *
 * Usage in E2E tests:
 *   test('example', async ({ test }) => {
 *     await test.ui.login.loginSuccessfully(credentials);
 *     await test.api.auth.getCurrentUser();
 *   });
 *
 * Usage in API-only tests:
 *   test('example', async ({ api }) => {
 *     await api.auth.authenticateSuccessfully(credentials);
 *   });
 */

import type { ApiState } from '@data/types';
import type { APIRequestContext, Page } from '@playwright/test';
import type { Environment } from '@variables';

import { existsSync, readFileSync } from 'node:fs';

import { ApiFixture } from '@ApiFixture';
import { test as base, expect } from '@playwright/test';
import { TestContext } from '@TestContext';
import { UiFixture } from '@UiFixture';
import { config, env } from '@variables';

// ============================================
// E2E Fixture (Page + API)
// ============================================

class TestFixture extends TestContext {
  /** API fixture - for making HTTP requests */
  api: ApiFixture;

  /** UI fixture - for browser interactions */
  ui: UiFixture;

  constructor(page: Page, request: APIRequestContext, environment?: Environment) {
    // Pass both drivers to TestContext
    super({ page, request, environment });

    // Create fixtures with the same options (shared context)
    const options = { page, request, environment: this.env };
    this.api = new ApiFixture(options);
    this.ui = new UiFixture(options);

    // Load token from file if exists (for E2E tests with storageState)
    this.loadTokenFromFile();
  }

  /**
   * Load auth token from api-state.json file.
   * Called automatically in constructor for E2E tests.
   */
  private loadTokenFromFile(): void {
    const apiStatePath = config.auth.apiStatePath;
    if (existsSync(apiStatePath)) {
      try {
        const content = readFileSync(apiStatePath, 'utf-8');
        const apiState: ApiState = JSON.parse(content);
        if (apiState.token) {
          this.api.setAuthToken(apiState.token);
        }
      }
      catch {
        // Silently ignore - token will be null
      }
    }
  }

  /**
   * Set auth token for API requests.
   * Use this to refresh token during tests (e.g., after re-login).
   */
  setAuthToken(token: string): void {
    this.api.setAuthToken(token);
  }

  /**
   * Clear auth token.
   * Use this to test unauthenticated scenarios.
   */
  clearAuthToken(): void {
    this.api.clearAuthToken();
  }

  /**
   * Direct access to Playwright Page instance.
   * Convenience getter for E2E tests that need direct page access.
   */
  get page(): Page {
    if (!this._page) {
      throw new Error('Page is not available.');
    }
    return this._page;
  }
}

// ============================================
// Playwright Test Extensions
// ============================================

/**
 * Extended Playwright test with KATA fixtures
 *
 * Fixtures provided:
 * - test: Full fixture with both UI and API (for E2E tests)
 * - ui: UI-only fixture (for UI-focused tests)
 * - api: API-only fixture (for integration tests - NO browser opened)
 *
 * IMPORTANT: Playwright fixtures are LAZY.
 * - If you only use `api`, NO browser is opened
 * - If you use `ui` or `test`, the browser is opened
 */
export const test = base.extend<{
  test: TestFixture
  api: ApiFixture
  ui: UiFixture
}>({
  // Full test fixture with UI + API (for E2E tests)
  test: async ({ page, request }, use) => {
    const fixture = new TestFixture(page, request);
    await use(fixture);
  },

  // UI-only fixture (opens browser)
  ui: async ({ page, request }, use) => {
    const uiFixture = new UiFixture({ page, request });
    await use(uiFixture);
  },

  // API-only fixture (NO browser opened - Playwright fixtures are lazy)
  api: async ({ request }, use) => {
    const apiFixture = new ApiFixture({ request });

    // Load token from file if exists (for integration tests)
    const apiStatePath = config.auth.apiStatePath;
    if (existsSync(apiStatePath)) {
      try {
        const content = readFileSync(apiStatePath, 'utf-8');
        const apiState: ApiState = JSON.parse(content);
        if (apiState.token) {
          apiFixture.setAuthToken(apiState.token);
        }
      }
      catch {
        // Silently ignore - token will be null
      }
    }

    await use(apiFixture);
  },
});

// ============================================
// Re-exports
// ============================================

export { ApiFixture, config, env, expect, TestFixture, UiFixture };
export type { Environment };
