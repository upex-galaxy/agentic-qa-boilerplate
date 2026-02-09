/**
 * KATA Framework - User Session Integration Tests
 *
 * Tests for authenticated user session via API.
 * Validates that token propagation works correctly.
 *
 * Project: integration (depends on api-setup)
 */

import { config, expect, test } from '@TestFixture';

test.describe('User Session API', () => {
  /**
   * Validates that the auth token is automatically loaded from api-state.json
   * and can be used to make authenticated API calls.
   */
  test('should get current user with valid token', async ({ api }) => {
    // The token is automatically loaded from api-state.json by ApiFixture
    // This tests that token propagation works correctly
    const [_response, userData] = await api.auth.getCurrentUserSuccessfully();

    // Additional assertions beyond the ATC's fixed assertions
    expect(userData.Roles).toBeDefined();
    expect(Array.isArray(userData.Roles)).toBe(true);
  });

  /**
   * Validates that the getCurrentUserUnauthorized ATC correctly
   * handles unauthenticated requests.
   */
  test('should fail without token', async ({ api }) => {
    // The ATC temporarily clears and restores the token
    const [response] = await api.auth.getCurrentUserUnauthorized();

    // Assertion is already in the ATC, this confirms it ran
    expect(response.ok()).toBe(false);
  });

  /**
   * Validates that we can re-authenticate and get a new token.
   * This tests the runtime token refresh capability.
   */
  test('should be able to re-authenticate', async ({ api }) => {
    // Clear existing token
    api.clearAuthToken();

    // Re-authenticate using the ATC
    const credentials = {
      username: config.testUser.email,
      password: config.testUser.password,
    };

    const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

    // Verify new token was obtained and set
    expect(response.status()).toBe(200);
    expect(tokenData.access_token).toBeDefined();

    // Now the token should be available for subsequent requests
    const [userResponse] = await api.auth.getCurrentUserSuccessfully();
    expect(userResponse.status()).toBe(200);
  });
});
