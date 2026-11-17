import type { TestContextOptions } from '@TestContext';

import { ExamplePage } from '@ui/ExamplePage';
import { LoginPage } from '@ui/LoginPage';
import { UiBase } from '@ui/UiBase';

export class UiFixture extends UiBase {
  readonly login: LoginPage;

  readonly example: ExamplePage;

  constructor(options: TestContextOptions) {
    super(options);

    this.login = new LoginPage(options);
    this.example = new ExamplePage(options);
  }
}
