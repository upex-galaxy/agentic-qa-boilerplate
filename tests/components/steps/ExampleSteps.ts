/**
 * KATA Architecture - Example Steps
 *
 * ⚠️  REFERENCE ONLY - THIS MODULE USES FICTIONAL ENDPOINTS
 *
 * This file demonstrates the KATA pattern for the Steps module (Layer 3.5).
 * Endpoints like '/api/auth/login' are placeholders.
 * Use this as a structural guide, not as runnable code.
 *
 * To create your own functional steps:
 * 1. Copy this file to tests/components/steps/YourSteps.ts
 * 2. Replace fictional endpoints with your real API endpoints
 * 3. Update authentication logic to match your app's auth flow
 * 4. Import and use in your test fixtures or tests
 *
 * Steps are reusable precondition chains that prepare test state.
 * They are NOT ATCs - they don't have fixed assertions and are not
 * decorated with @atc. They combine multiple actions/ATCs to reach a
 * specific state before the real test runs.
 *
 * Common uses:
 * - Authentication (login, get token)
 * - Data setup (create user, seed database)
 * - State preparation (navigate to specific page with data)
 */

import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';

// ============================================
// Types
// ============================================

export interface AuthState {
  token: string
  userId: string
}

// ============================================
// Example Steps Class
// ============================================

export class ExampleSteps extends TestContext {
  constructor(options: TestContextOptions = {}) {
    super(options);
  }

  // ============================================
  // Step Methods (NOT ATCs)
  // ============================================

  /**
   * Step: Authenticate and get token
   *
   * This is a SETUP step, not an ATC.
   * It doesn't verify the auth worked - just gets the token.
   *
   * @returns Auth state with token and userId
   */
  async authenticateUser(email: string, password: string): Promise<AuthState> {
    if (!this._request) {
      throw new Error('Request context not set. Pass { request } in constructor options.');
    }

    // TODO: Update with your actual auth endpoint
    const response = await this._request.post('/api/auth/login', {
      data: { email, password },
    });

    const body = await response.json();

    return {
      token: (body.token ?? body.access_token) as string,
      userId: (body.user?.id ?? body.userId) as string,
    };
  }

  /**
   * Step: Navigate to authenticated page
   *
   * Combines login + navigation into a reusable precondition chain.
   */
  async navigateAsAuthenticatedUser(path: string, email: string, password: string) {
    if (!this._page || !this._request) {
      throw new Error(
        'Page and Request context must be set. Pass { page, request } in constructor options.',
      );
    }

    // Get auth token
    const auth = await this.authenticateUser(email, password);

    // Set token in browser storage (adjust for your app)
    await this._page.evaluate((token) => {
      localStorage.setItem('authToken', token);
    }, auth.token);

    // Navigate to target page
    await this._page.goto(path);

    return auth;
  }

  /**
   * Step: Create test data via API
   *
   * Sets up test data before running UI tests.
   */
  async createTestResource(name: string): Promise<{ id: string }> {
    if (!this._request) {
      throw new Error('Request context not set. Pass { request } in constructor options.');
    }

    // TODO: Update with your actual endpoint
    const response = await this._request.post('/api/resources', {
      data: { name },
    });

    const body = await response.json();
    return { id: body.id };
  }
}
