import { config, expect, test } from '@TestFixture';

test.describe('UPEX-100: User Session API', { tag: ['@critical'] }, () => {
  test('UPEX-100: should get current user with valid token', async ({ api }) => {
    const [response, userData] = await api.auth.getCurrentUser();

    expect(response.status()).toBe(200);
    expect(userData.user).toBeDefined();
    expect(userData.user.id).toBeDefined();
    expect(userData.user.email).toBeDefined();
    expect(userData.user.name).toBeDefined();
    expect(typeof userData.user.name).toBe('string');
  });

  test('UPEX-100: should fail without token', async ({ api }) => {
    api.clearAuthToken();

    const [response] = await api.auth.getCurrentUser();

    expect(response.status()).toBe(401);
    expect(response.ok()).toBe(false);
  });

  test('UPEX-100: should be able to re-authenticate', async ({ api }) => {
    api.clearAuthToken();

    const credentials = {
      email: config.testUser.email,
      password: config.testUser.password,
    };

    const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

    expect(response.status()).toBe(200);
    expect(tokenData.access_token).toBeDefined();
  });
});
