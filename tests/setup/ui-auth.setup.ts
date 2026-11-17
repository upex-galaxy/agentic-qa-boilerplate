import type { ApiState } from '@data/types';
import type { TokenResponse } from '@schemas/auth.types';

import { writeFileSync } from 'node:fs';
import { test as setup } from '@TestFixture';
import { attachRequestResponseToAllure } from '@utils/allure';
import { config } from '@variables';

const storageStateFile = config.auth.storageStatePath;
const apiStateFile = config.auth.apiStatePath;

setup('UI Setup: authenticate via UI', async ({ ui, page }) => {
  console.log('[UI Setup] Starting UI authentication...');
  console.log('[UI Setup] Target: /login');

  await ui.login.goto();

  const credentials = {
    email: config.testUser.email,
    password: config.testUser.password,
  };

  // Register interception before login: the UI calls /api/auth/login right after the NextAuth sign-in.
  const tokenPromise = page.waitForResponse(
    resp => resp.url().includes(config.auth.tokenEndpoint)
      && resp.request().method() === 'POST'
      && resp.status() === 200,
    { timeout: 30000 },
  );

  await ui.login.loginSuccessfully(credentials);
  console.log('[UI Setup] UI login successful');

  console.log('[UI Setup] Intercepting token from login response...');
  const response = await tokenPromise;
  const tokenData = (await response.json()) as TokenResponse;

  await attachRequestResponseToAllure({
    url: response.url(),
    method: 'POST',
    responseBody: tokenData,
    requestBody: { email: credentials.email, password: '***' },
  });

  if (!tokenData?.access_token) {
    throw new Error('Token response missing access_token');
  }

  console.log('[UI Setup] Token intercepted successfully');

  await page.context().storageState({ path: storageStateFile });
  console.log(`[UI Setup] Storage state saved to ${storageStateFile}`);

  const apiState: ApiState = {
    token: tokenData.access_token,
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in,
    refreshToken: tokenData.refresh_token ?? null,
    source: 'ui-login',
    createdAt: new Date().toISOString(),
  };

  writeFileSync(apiStateFile, JSON.stringify(apiState, null, 2));
  console.log(`[UI Setup] API token saved to ${apiStateFile}`);

  console.log('[UI Setup] Authentication successful');
  console.log(`[UI Setup] Current URL: ${page.url()}`);
});
