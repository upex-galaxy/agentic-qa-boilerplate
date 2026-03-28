/**
 * KATA Framework - User Session Integration Tests
 *
 * Tests for authenticated user session via API.
 * Validates that token propagation works correctly.
 *
 * Project: integration (depends on api-setup)
 */

import { config, expect, test } from '@TestFixture';

test.describe('UPEX-100: User Session API', { tag: ['@critical'] }, () => {
  /**
   * Validates that the auth token is automatically loaded from api-state.json
   * and can be used to make authenticated API calls.
   */
  test('UPEX-100: should get current user with valid token', async ({ api }) => {
    // The token is automatically loaded from api-state.json by ApiFixture
    // Use helper (not ATC) — this is a read-only verification
    const [response, userData] = await api.auth.getCurrentUser();

    // Test-level assertions (UPEX Dojo format)
    expect(response.status()).toBe(200);
    expect(userData.user).toBeDefined();
    expect(userData.user.id).toBeDefined();
    expect(userData.user.email).toBeDefined();
    expect(userData.user.name).toBeDefined();
    expect(typeof userData.user.name).toBe('string');
  });

  /**
   * Validates that unauthenticated requests are rejected.
   * Uses the helper directly with token cleared.
   */
  test('UPEX-100: should fail without token', async ({ api }) => {
    // Temporarily clear token to test unauthorized access
    api.clearAuthToken();

    const [response] = await api.auth.getCurrentUser();

    // Test-level assertions — no session should exist
    expect(response.status()).toBe(401);
    expect(response.ok()).toBe(false);
  });

  /**
   * Validates that we can re-authenticate and get a new token.
   * This tests the runtime token refresh capability.
   */
  test('UPEX-100: should be able to re-authenticate', async ({ api }) => {
    // Clear existing token
    api.clearAuthToken();

    // Re-authenticate using the ATC (UPEX Dojo uses 'email' field)
    const credentials = {
      email: config.testUser.email,
      password: config.testUser.password,
    };

    const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

    // Verify new token was obtained and set
    expect(response.status()).toBe(200);
    expect(tokenData.access_token).toBeDefined();
  });
});
