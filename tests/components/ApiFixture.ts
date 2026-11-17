import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { AuthApi } from '@api/AuthApi';
import { ExampleApi } from '@api/ExampleApi';

export class ApiFixture extends ApiBase {
  readonly auth: AuthApi;

  readonly example: ExampleApi;

  constructor(options: TestContextOptions) {
    super(options);

    this.auth = new AuthApi(options);
    this.example = new ExampleApi(options);
  }

  override setAuthToken(token: string) {
    super.setAuthToken(token);
    this.auth.setAuthToken(token);
    this.example.setAuthToken(token);
  }

  override clearAuthToken() {
    super.clearAuthToken();
    this.auth.clearAuthToken();
    this.example.clearAuthToken();
  }
}
