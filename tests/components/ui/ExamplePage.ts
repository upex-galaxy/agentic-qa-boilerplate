// Reference only: fictional /example page and placeholder selectors.

import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { UiBase } from '@ui/UiBase';
import { atc, step } from '@utils/decorators';

export interface ExampleFormData {
  email: string
  password: string
  name?: string
}

export class ExamplePage extends UiBase {
  private readonly errorMessageTestId = 'error-message';

  private readonly emailInput = () =>
    this.page
      .getByTestId('email-input')
      .or(this.page.locator('#email'))
      .or(this.page.locator('input[name="email"]'));

  private readonly passwordInput = () =>
    this.page
      .getByTestId('password-input')
      .or(this.page.locator('#password'))
      .or(this.page.locator('input[name="password"]'));

  private readonly submitButton = () =>
    this.page.locator('button[type="submit"]').or(this.page.getByTestId('submit-button'));

  constructor(options: TestContextOptions) {
    super(options);
  }

  @step
  async goto() {
    await this.page.goto('/example');
  }

  @atc('PROJ-131')
  async submitFormWithValidData(data: ExampleFormData) {
    await this.goto();

    await this.emailInput().fill(data.email);
    await this.passwordInput().fill(data.password);
    await this.submitButton().click();

    await this.page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(this.page).toHaveURL(/.*dashboard.*/);
  }

  @atc('PROJ-132')
  async submitFormWithInvalidEmail(email: string, password: string) {
    await this.goto();

    await this.emailInput().fill(email);
    await this.passwordInput().fill(password);
    await this.submitButton().click();

    const errorMessage = this.page
      .getByTestId(this.errorMessageTestId)
      .or(this.page.getByRole('alert'));

    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  }
}
