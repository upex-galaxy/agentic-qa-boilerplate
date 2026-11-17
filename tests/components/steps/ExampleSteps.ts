// Reference only: fictional endpoints such as /api/auth/login.

import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';

export interface AuthState {
  token: string
  userId: string
}

export class ExampleSteps extends TestContext {
  constructor(options: TestContextOptions = {}) {
    super(options);
  }

  async authenticateUser(email: string, password: string): Promise<AuthState> {
    if (!this._request) {
      throw new Error('Request context not set. Pass { request } in constructor options.');
    }

    const response = await this._request.post('/api/auth/login', {
      data: { email, password },
    });

    const body = await response.json();

    return {
      token: (body.token ?? body.access_token) as string,
      userId: (body.user?.id ?? body.userId) as string,
    };
  }

  async navigateAsAuthenticatedUser(args: { path: string, email: string, password: string }) {
    const { path, email, password } = args;
    if (!this._page || !this._request) {
      throw new Error(
        'Page and Request context must be set. Pass { page, request } in constructor options.',
      );
    }

    const auth = await this.authenticateUser(email, password);

    await this._page.evaluate((token) => {
      localStorage.setItem('authToken', token);
    }, auth.token);

    await this._page.goto(path);

    return auth;
  }

  async createTestResource(name: string): Promise<{ id: string }> {
    if (!this._request) {
      throw new Error('Request context not set. Pass { request } in constructor options.');
    }

    const response = await this._request.post('/api/resources', {
      data: { name },
    });

    const body = await response.json();
    return { id: body.id };
  }
}
