/**
 * KATA Framework - Example E2E Test
 *
 * ⚠️  REFERENCE ONLY - THIS TEST IS NOT FUNCTIONAL
 *
 * This file demonstrates the KATA pattern for E2E tests.
 * It uses fictional endpoints and pages that don't exist.
 * DO NOT run this test - it will fail.
 *
 * To create your own functional tests:
 * 1. Copy this file to tests/e2e/[feature]/[feature].test.ts
 * 2. Update the ATCs in your UI components with real selectors
 * 3. Configure real URLs in config/variables.ts
 *
 * Key Pattern:
 * - ATCs are complete test cases with fixed assertions
 * - Test file orchestrates ATCs and adds test-level assertions
 * - Use @critical tag for smoke tests
 */

import { expect, test } from '@TestFixture';

test.describe('Example Feature', () => {
  /**
   * @critical - Included in smoke tests
   *
   * Tests the happy path for the example feature.
   * ATC: PROJ-UI-001
   */
  test('should complete example flow successfully @critical', async ({ ui }) => {
    // ARRANGE - Generate test data using DataFactory (available via ui.data)
    const testData = ui.data.createCredentials();

    // ACT & ASSERT - ATC handles the complete flow with fixed assertions
    await ui.example.submitFormWithValidData({
      email: testData.email,
      password: testData.password,
    });

    // Additional test-level assertion (optional)
    await expect(ui.page).toHaveURL(/.*dashboard.*/);
  });

  /**
   * Tests error handling for invalid input.
   * ATC: PROJ-UI-002
   */
  test('should show error for invalid input', async ({ ui }) => {
    // ARRANGE
    const invalidEmail = 'not-an-email';
    const password = 'ValidPassword123!';

    // ACT & ASSERT - ATC handles validation
    await ui.example.submitFormWithInvalidEmail(invalidEmail, password);
  });
});
