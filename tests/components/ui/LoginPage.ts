import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc, step } from '@utils/decorators';

export interface LoginCredentials {
  email: string
  password: string
}

export class LoginPage extends UiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  private async fillAndSubmitLoginForm(credentials: LoginCredentials): Promise<void> {
    await this.page.locator('[data-testid="login-email-input"]').fill(credentials.email);
    await this.fillSecret(this.page.locator('[data-testid="login-password-input"]'), credentials.password);
    await this.page.locator('[data-testid="login-submit-button"]').click();
  }

  @step
  async goto(): Promise<void> {
    await this.page.goto(this.buildUrl('/login'));
  }

  // ATCs do not navigate: call goto() first.
  @atc('PROJ-111')
  async loginSuccessfully(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    await this.page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });
    await expect(this.page).not.toHaveURL(/.*\/login.*/);
  }

  @atc('PROJ-112')
  async loginWithInvalidCredentials(credentials: LoginCredentials): Promise<void> {
    await this.fillAndSubmitLoginForm(credentials);

    const errorIndicator = this.page.locator('[data-testid="login-error"]');
    await expect(errorIndicator).toBeVisible({ timeout: 5000 });
    await expect(this.page).toHaveURL(/.*\/login.*/);
  }
}
