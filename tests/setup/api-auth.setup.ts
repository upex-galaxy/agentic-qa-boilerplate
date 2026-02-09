/**
 * KATA Framework - API Auth Setup (Project)
 *
 * Authenticates via API directly using AuthApi.authenticateSuccessfully() ATC.
 * Generates a JWT token for use by Integration tests.
 *
 * Dependencies: global-setup
 * Dependents: integration
 */

import type { ApiState } from '@data/types';

import { writeFileSync } from 'node:fs';
import { test as setup } from '@TestFixture';
import { attachRequestResponseToAllure } from '@utils/allure';
import { config } from '@variables';

const apiStateFile = config.auth.apiStatePath;

/**
 * API Authentication Setup
 *
 * 1. Uses AuthApi.authenticateSuccessfully() ATC
 * 2. Saves token to api-state.json for integration tests
 */
setup('API Setup: authenticate via API', async ({ api }) => {
  console.log('[API Setup] Starting API authentication...');
  console.log(`[API Setup] Target: ${config.apiUrl}${config.auth.loginEndpoint}`);

  // Use AuthApi ATC
  const credentials = {
    username: config.testUser.email,
    password: config.testUser.password,
  };
  const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);

  // Attach to Allure for debugging
  await attachRequestResponseToAllure({
    url: response.url(),
    method: 'POST',
    responseBody: tokenData,
    requestBody: { username: credentials.username, password: '***' },
  });

  console.log('[API Setup] Authentication successful');
  console.log(`[API Setup] Token type: ${tokenData.token_type}`);
  console.log(`[API Setup] Expires in: ${tokenData.expires_in} seconds`);

  // Save token to file for use by integration tests
  const apiState: ApiState = {
    token: tokenData.access_token,
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in,
    refreshToken: tokenData.refresh_token ?? null,
    source: 'api-login',
    createdAt: new Date().toISOString(),
  };

  writeFileSync(apiStateFile, JSON.stringify(apiState, null, 2));
  console.log(`[API Setup] Token saved to ${apiStateFile}`);
});
