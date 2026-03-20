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

test.describe('UPEX-200: Dashboard', () => {
  /**
   * @critical - Validates Global Setup authentication
   *
   * This test verifies that the authenticated session from e2e-setup
   * is correctly loaded and allows access to protected pages.
   */
  test('UPEX-200: should load dashboard with authenticated session @critical', async ({ page }) => {
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
  test('UPEX-200: should access user info via API with session token', async ({ test: fixture }) => {
    // Use helper (not ATC) — this is a read-only verification
    const [response, userInfo] = await fixture.api.auth.getCurrentUser();

    // Test-level assertions (UPEX Dojo format: { user: {...} })
    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);
    expect(userInfo.user.email).toBeDefined();
    expect(userInfo.user.id).toBeDefined();
  });
});
