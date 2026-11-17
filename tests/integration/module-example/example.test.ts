// Reference only: fictional endpoints; this test is not functional.

import { expect, test } from '@TestFixture';

test.describe('PROJ-100: Example API', () => {
  test('PROJ-100: should create resource successfully', { tag: ['@critical'] }, async ({ api }) => {
    const payload = api.data.createCredentials();

    const [_response, body, sentPayload] = await api.example.createResourceSuccessfully(payload);

    expect(body.user.email).toBe(sentPayload.email);
  });

  test('PROJ-100: should return error for invalid data', async ({ api }) => {
    const invalidPayload = {
      email: 'invalid-email',
      password: '123',
    };

    await api.example.createResourceWithInvalidData(invalidPayload);
  });
});
