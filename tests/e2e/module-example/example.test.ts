// Reference only: fictional endpoints and pages; this test is not functional.

import { expect, test } from '@TestFixture';

test.describe('PROJ-200: Example Feature', () => {
  test('PROJ-200: should complete example flow successfully', { tag: ['@critical'] }, async ({ ui }) => {
    const testData = ui.data.createCredentials();

    await ui.example.submitFormWithValidData({
      email: testData.email,
      password: testData.password,
    });

    await expect(ui.page).toHaveURL(/.*dashboard.*/);
  });

  test('PROJ-200: should show error for invalid input', async ({ ui }) => {
    const invalidEmail = 'not-an-email';
    const password = 'ValidPassword123!';

    await ui.example.submitFormWithInvalidEmail(invalidEmail, password);
  });
});
