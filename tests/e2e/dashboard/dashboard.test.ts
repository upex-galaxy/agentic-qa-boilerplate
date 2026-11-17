import { expect, test } from '@TestFixture';

test.describe('UPEX-200: Dashboard', { tag: ['@critical'] }, () => {
  // eslint-disable-next-line kata/no-raw-page-in-spec -- infrastructure check: the saved storage state loads; no Page component exists for it
  test('UPEX-200: should load dashboard when a saved session is restored', async ({ page }) => {
    await page.goto('/');

    await expect(page).not.toHaveURL(/.*\/login.*/);

    await expect(page).toHaveTitle(/.+/);
  });

  test('UPEX-200: should return the current user when the API session is valid', async ({ api }) => {
    const [response, userInfo] = await api.auth.getCurrentUser();

    expect(response.ok()).toBe(true);
    expect(response.status()).toBe(200);
    expect(userInfo.user.email).toBeDefined();
    expect(userInfo.user.id).toBeDefined();
  });
});
