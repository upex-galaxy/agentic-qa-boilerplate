/**
 * KATA Architecture - Dashboard E2E Test
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

test.describe('UPEX-200: Dashboard', { tag: ['@critical'] }, () => {
  /**
   * @critical - Validates Global Setup authentication
   *
   * This test verifies that the authenticated session from e2e-setup
   * is correctly loaded and allows access to protected pages.
   */
  // Raw `page`, deliberately, and the ONLY place in this repo where that is
  // right. This asserts INFRASTRUCTURE — that `ui-setup` saved a storage state
  // and Playwright loaded it — not a domain flow. There is no Page component to
  // route through because there is no feature under test. Every test that
  // exercises the product goes through `{ ui }` / `{ api }` / `{ test }`.
  test('UPEX-200: should load dashboard when a saved session is restored', async ({ page }) => {
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
   * Validates that the authenticated API session resolves the current user.
   *
   * `{ api }`, not `{ test }`. This never touches the UI, and the hybrid
   * fixture opens a browser for nothing (fixture-selection table in
   * `/test-automation`). The previous comment claimed it reused "the same
   * session from the browser" — it never did: the API fixture carries the
   * Bearer token from `api-setup`, not the browser cookie.
   */
  test('UPEX-200: should return the current user when the API session is valid', async ({ api }) => {
    // Use helper (not ATC) — this is a read-only verification
    const [response, userInfo] = await api.auth.getCurrentUser();

    // Test-level assertions (UPEX Dojo format: { user: {...} })
    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);
    expect(userInfo.user.email).toBeDefined();
    expect(userInfo.user.id).toBeDefined();
  });
});
