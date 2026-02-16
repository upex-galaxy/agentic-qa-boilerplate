/**
 * KATA Framework - UI Auth Setup
 *
 * Authenticates via the login page UI and obtains an API token.
 *
 * Auth Flow Support:
 * - NextAuth (UPEX Dojo): Uses cookies for session, requires separate API call for JWT
 * - Supabase/Token-based: Can intercept token from login response via page.waitForResponse()
 *
 * This provides BOTH:
 * - Browser session (storageState) for UI tests
 * - API token for API calls within E2E tests
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
 * 2. Uses LoginPage.loginSuccessfully() ATC
 * 3. Saves storageState (cookies) for UI tests
 * 4. Obtains JWT token via API call (for NextAuth apps that don't expose token in login response)
 * 5. Saves api-state (token) for API integration
 *
 * Note: For apps that return token in login response (e.g., Supabase),
 * you can use page.waitForResponse() to intercept the token instead of step 4.
 */
setup('UI Setup: authenticate via UI', async ({ ui, page, request }) => {
  console.log('[UI Setup] Starting UI authentication...');
  console.log('[UI Setup] Target: /login');

  // Navigate to login page (outside of ATC)
  await ui.login.goto();

  // Credentials for login
  const credentials = {
    email: config.testUser.email,
    password: config.testUser.password,
  };

  // Use LoginPage ATC - handles session (cookies/localStorage)
  await ui.login.loginSuccessfully(credentials);
  console.log('[UI Setup] UI login successful');

  // Save storage state (cookies + localStorage) for UI tests
  await page.context().storageState({ path: storageStateFile });
  console.log(`[UI Setup] Storage state saved to ${storageStateFile}`);

  // Obtain JWT token via API for API testing within E2E
  // Note: NextAuth stores session in cookies, so we need a separate call to get JWT
  // For token-based auth (Supabase), use page.waitForResponse() instead
  console.log('[UI Setup] Obtaining API token...');
  const tokenResponse = await request.post(`${config.apiUrl}${config.auth.loginEndpoint}`, {
    data: credentials,
  });

  if (!tokenResponse.ok()) {
    const status = tokenResponse.status();
    console.error(`[UI Setup] API token request failed: ${status}`);
    throw new Error(`Failed to obtain API token: ${status}`);
  }

  const tokenData = (await tokenResponse.json()) as TokenResponse;

  // Attach to Allure for debugging
  await attachRequestResponseToAllure({
    url: `${config.apiUrl}${config.auth.loginEndpoint}`,
    method: 'POST',
    responseBody: tokenData,
    requestBody: { email: credentials.email, password: '***' },
  });

  // Verify token was obtained
  if (!tokenData?.access_token) {
    throw new Error('API token response missing access_token');
  }

  console.log('[UI Setup] API token obtained successfully');

  // Save the token for API calls within E2E tests
  const apiState: ApiState = {
    token: tokenData.access_token,
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in,
    refreshToken: null,
    source: 'ui-login',
    createdAt: new Date().toISOString(),
  };

  writeFileSync(apiStateFile, JSON.stringify(apiState, null, 2));
  console.log(`[UI Setup] API token saved to ${apiStateFile}`);

  console.log('[UI Setup] Authentication successful');
  console.log(`[UI Setup] Current URL: ${page.url()}`);
});
