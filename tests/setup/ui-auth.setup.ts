/**
 * KATA Framework - UI Auth Setup (Project)
 *
 * Authenticates via the login page UI and captures the auth token
 * by intercepting the /connect/token API response during the login flow.
 *
 * This provides BOTH:
 * - Browser session (storageState) for UI tests
 * - API token (same session) for API calls within E2E tests
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
 * UI Authentication Setup with Token Interception
 *
 * 1. Navigates to login page (via LoginPage.goto())
 * 2. Intercepts /connect/token response to capture token
 * 3. Uses LoginPage.loginSuccessfully() ATC
 * 4. Saves both storageState (UI) and api-state (API token)
 */
setup('UI Setup: authenticate via UI', async ({ ui, page }) => {
  console.log('[UI Setup] Starting UI authentication with token interception...');
  console.log('[UI Setup] Target: /login');

  // Navigate to login page (outside of ATC)
  await ui.login.goto();

  // Start waiting for the token response BEFORE triggering login
  const tokenPromise = page.waitForResponse(resp => resp.url().includes('/connect/token'), {
    timeout: 30000,
  });

  // Use LoginPage ATC (no navigation inside)
  const credentials = {
    username: config.testUser.email,
    password: config.testUser.password,
  };
  await ui.login.loginSuccessfully(credentials);

  // Wait for the intercepted token response
  const response = await tokenPromise;
  const tokenData = (await response.json()) as TokenResponse;

  // Attach to Allure for debugging
  await attachRequestResponseToAllure({
    url: response.url(),
    method: 'POST',
    responseBody: tokenData,
    requestBody: { username: credentials.username, password: '***' },
  });

  // Verify login was successful
  if (!response.ok() || !tokenData?.access_token) {
    const status = response.status();
    console.error(`[UI Setup] Authentication failed: ${status}`);
    throw new Error(`UI authentication failed: ${status}`);
  }

  console.log('[UI Setup] Token intercepted successfully');

  // Save storage state (cookies + localStorage) for UI tests
  await page.context().storageState({ path: storageStateFile });
  console.log(`[UI Setup] Storage state saved to ${storageStateFile}`);

  // Save the captured token for API calls within E2E tests
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
