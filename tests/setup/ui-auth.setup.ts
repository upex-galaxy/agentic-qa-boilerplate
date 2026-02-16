/**
 * KATA Framework - UI Auth Setup
 *
 * Authenticates via the login page UI and intercepts the JWT token
 * using page.waitForResponse() - single authentication, no separate API call.
 *
 * This provides BOTH:
 * - Browser session (storageState) for UI tests
 * - API token (intercepted) for API calls within E2E tests
 *
 * Dependencies: global-setup
 * Dependents: e2e
 */

import type { ApiState, TokenResponse } from '@data/types';

import { writeFileSync } from 'node:fs';
import { test as setup } from '@TestFixture';
import { attachRequestResponseToAllure } from '@utils/allure';
import { config } from '@variables';

const storageStateFile = config.auth.storageStatePath;
const apiStateFile = config.auth.apiStatePath;

/**
 * UI Authentication Setup
 *
 * 1. Navigates to login page (via LoginPage.goto())
 * 2. Sets up response interception BEFORE triggering login
 * 3. Uses LoginPage.loginSuccessfully() ATC (triggers login + token fetch)
 * 4. Captures JWT token from intercepted response
 * 5. Saves storageState (cookies) for UI tests
 * 6. Saves api-state (token) for API integration
 */
setup('UI Setup: authenticate via UI', async ({ ui, page }) => {
  console.log('[UI Setup] Starting UI authentication...');
  console.log('[UI Setup] Target: /login');

  // Navigate to login page (outside of ATC)
  await ui.login.goto();

  // Credentials for login
  const credentials = {
    email: config.testUser.email,
    password: config.testUser.password,
  };

  // Set up response interception BEFORE triggering login
  // The login UI calls /api/auth/login after successful NextAuth sign-in
  const tokenPromise = page.waitForResponse(
    resp => resp.url().includes(config.auth.tokenEndpoint)
      && resp.request().method() === 'POST'
      && resp.status() === 200,
    { timeout: 30000 },
  );

  // Use LoginPage ATC - triggers NextAuth sign-in + token fetch
  await ui.login.loginSuccessfully(credentials);
  console.log('[UI Setup] UI login successful');

  // Capture JWT token from intercepted response
  console.log('[UI Setup] Intercepting token from login response...');
  const response = await tokenPromise;
  const tokenData = (await response.json()) as TokenResponse;

  // Attach to Allure for debugging
  await attachRequestResponseToAllure({
    url: response.url(),
    method: 'POST',
    responseBody: tokenData,
    requestBody: { email: credentials.email, password: '***' },
  });

  // Verify token was obtained
  if (!tokenData?.access_token) {
    throw new Error('Token response missing access_token');
  }

  console.log('[UI Setup] Token intercepted successfully');

  // Save storage state (cookies + localStorage) for UI tests
  await page.context().storageState({ path: storageStateFile });
  console.log(`[UI Setup] Storage state saved to ${storageStateFile}`);

  // Save the token for API calls within E2E tests
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
