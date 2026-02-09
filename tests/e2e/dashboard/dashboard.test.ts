/**
 * KATA Framework - Dashboard E2E Test
 *
 * Simple validation test to verify the Global Setup authentication works.
 * This test relies on the e2e-auth.setup.ts to have already logged in
 * and saved the browser session to .auth/user.json.
 *
 * If this test passes, it confirms:
 * 1. The e2e-setup project ran successfully
 * 2. Login via UI worked
 * 3. Storage state was saved and loaded correctly
 * 4. The authenticated session is valid
 */

import { expect, test } from '@TestFixture';

test.describe('Dashboard', () => {
  /**
   * @critical - Validates Global Setup authentication
   *
   * This test verifies that the authenticated session from e2e-setup
   * is correctly loaded and allows access to protected pages.
   */
  test('should load dashboard with authenticated session @critical', async ({ page }) => {
    // Navigate to home/dashboard - should work because we're authenticated
    await page.goto('/');

    // Verify we're NOT redirected to login (would happen if not authenticated)
    await expect(page).not.toHaveURL(/.*\/login.*/);

    // Verify the page loaded successfully
    // The exact content will depend on the application's dashboard implementation
    // For now, we just verify we're on a valid page and not an error page
    await expect(page).toHaveTitle(/.+/); // Page has a title
  });

  /**
   * Validates that the test user info is accessible via API.
   * Uses the same session from the browser to verify API access.
   */
  test('should access user info via API with session token', async ({ test: fixture }) => {
    // Try to get current user - this validates the API can use the session
    // Note: In E2E tests, the API client shares the browser's session context
    // when making requests through the page context
    const [response, userInfo] = await fixture.api.auth.getCurrentUserSuccessfully();

    // Verify user info matches test user (API uses PascalCase)
    expect(response.ok()).toBe(true);
    expect(userInfo.Email).toBeDefined();
    expect(userInfo.UserId).toBeDefined();
  });
});
