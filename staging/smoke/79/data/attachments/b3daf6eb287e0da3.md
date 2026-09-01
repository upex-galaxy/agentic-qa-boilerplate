# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: integration/auth/user-session.test.ts >> UPEX-100: User Session API >> UPEX-100: should fail without token
- Location: tests/integration/auth/user-session.test.ts:35:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 401
Received: 200
```

# Test source

```ts
  1  | /**
  2  |  * KATA Architecture - User Session Integration Tests
  3  |  *
  4  |  * Tests for authenticated user session via API.
  5  |  * Validates that token propagation works correctly.
  6  |  *
  7  |  * Project: integration (depends on api-setup)
  8  |  */
  9  | 
  10 | import { config, expect, test } from '@TestFixture';
  11 | 
  12 | test.describe('UPEX-100: User Session API', { tag: ['@critical'] }, () => {
  13 |   /**
  14 |    * Validates that the auth token is automatically loaded from api-state.json
  15 |    * and can be used to make authenticated API calls.
  16 |    */
  17 |   test('UPEX-100: should get current user with valid token', async ({ api }) => {
  18 |     // The token is automatically loaded from api-state.json by ApiFixture
  19 |     // Use helper (not ATC) — this is a read-only verification
  20 |     const [response, userData] = await api.auth.getCurrentUser();
  21 | 
  22 |     // Test-level assertions (UPEX Dojo format)
  23 |     expect(response.status()).toBe(200);
  24 |     expect(userData.user).toBeDefined();
  25 |     expect(userData.user.id).toBeDefined();
  26 |     expect(userData.user.email).toBeDefined();
  27 |     expect(userData.user.name).toBeDefined();
  28 |     expect(typeof userData.user.name).toBe('string');
  29 |   });
  30 | 
  31 |   /**
  32 |    * Validates that unauthenticated requests are rejected.
  33 |    * Uses the helper directly with token cleared.
  34 |    */
  35 |   test('UPEX-100: should fail without token', async ({ api }) => {
  36 |     // Temporarily clear token to test unauthorized access
  37 |     api.clearAuthToken();
  38 | 
  39 |     const [response] = await api.auth.getCurrentUser();
  40 | 
  41 |     // Test-level assertions — no session should exist
> 42 |     expect(response.status()).toBe(401);
     |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  43 |     expect(response.ok()).toBe(false);
  44 |   });
  45 | 
  46 |   /**
  47 |    * Validates that we can re-authenticate and get a new token.
  48 |    * This tests the runtime token refresh capability.
  49 |    */
  50 |   test('UPEX-100: should be able to re-authenticate', async ({ api }) => {
  51 |     // Clear existing token
  52 |     api.clearAuthToken();
  53 | 
  54 |     // Re-authenticate using the ATC (UPEX Dojo uses 'email' field)
  55 |     const credentials = {
  56 |       email: config.testUser.email,
  57 |       password: config.testUser.password,
  58 |     };
  59 | 
  60 |     const [response, tokenData] = await api.auth.authenticateSuccessfully(credentials);
  61 | 
  62 |     // Verify new token was obtained and set
  63 |     expect(response.status()).toBe(200);
  64 |     expect(tokenData.access_token).toBeDefined();
  65 |   });
  66 | });
  67 | 
```