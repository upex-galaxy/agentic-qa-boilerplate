/**
 * KATA Framework - Example Integration Test
 *
 * ⚠️  REFERENCE ONLY - THIS TEST IS NOT FUNCTIONAL
 *
 * This file demonstrates the KATA pattern for API/Integration tests.
 * It uses fictional endpoints that don't exist.
 * DO NOT run this test - it will fail.
 *
 * To create your own functional tests:
 * 1. Copy this file to tests/integration/[feature].test.ts
 * 2. Update the ATCs in your API components with real endpoints
 * 3. Configure real API URLs in config/variables.ts
 *
 * Key Pattern:
 * - ATCs are complete test cases with fixed assertions
 * - Test file orchestrates ATCs for API testing
 * - No browser needed - uses API fixture directly
 */

import { expect, test } from '@TestFixture';

test.describe('PROJ-100: Example API', () => {
  /**
   * Tests successful resource creation.
   * ATC: PROJ-101
   */
  test('PROJ-100: should create resource successfully', async ({ api }) => {
    // ARRANGE - Prepare test data using DataFactory (available via api.data)
    const payload = api.data.createCredentials();

    // ACT & ASSERT - ATC handles the complete flow
    const [_response, body, sentPayload] = await api.example.createResourceSuccessfully(payload);

    // Additional test-level assertions (optional)
    expect(body.user.email).toBe(sentPayload.email);
  });

  /**
   * Tests error handling for invalid data.
   * ATC: PROJ-102
   */
  test('PROJ-100: should return error for invalid data', async ({ api }) => {
    // ARRANGE - Invalid payload
    const invalidPayload = {
      email: 'invalid-email',
      password: '123', // Too short
    };

    // ACT & ASSERT - ATC validates error response
    await api.example.createResourceWithInvalidData(invalidPayload);
  });
});
