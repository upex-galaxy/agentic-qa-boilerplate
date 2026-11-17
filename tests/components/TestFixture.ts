import type { ApiState } from '@data/types';
import type { APIRequestContext, Page } from '@playwright/test';
import type { Environment } from '@variables';

import { existsSync, readFileSync } from 'node:fs';

import { ApiFixture } from '@ApiFixture';
import { test as base, expect } from '@playwright/test';
import { TestContext } from '@TestContext';
import { UiFixture } from '@UiFixture';
import { config, env } from '@variables';
import { label } from 'allure-js-commons';

class TestFixture extends TestContext {
  api: ApiFixture;

  ui: UiFixture;

  constructor(page: Page, request: APIRequestContext, environment?: Environment) {
    super({ page, request, environment });

    const options = { page, request, environment: this.env };
    this.api = new ApiFixture(options);
    this.ui = new UiFixture(options);

    this.loadTokenFromFile();
  }

  private loadTokenFromFile(): void {
    const apiStatePath = config.auth.apiStatePath;
    if (existsSync(apiStatePath)) {
      try {
        const content = readFileSync(apiStatePath, 'utf-8');
        const apiState: ApiState = JSON.parse(content);
        if (apiState.token) {
          this.api.setAuthToken(apiState.token);
        }
      }
      catch {
        // Silently ignore - token will be null
      }
    }
  }

  setAuthToken(token: string): void {
    this.api.setAuthToken(token);
  }

  clearAuthToken(): void {
    this.api.clearAuthToken();
  }

  get page(): Page {
    if (!this._page) {
      throw new Error('Page is not available.');
    }
    return this._page;
  }
}

export const test = base.extend<{
  test: TestFixture
  api: ApiFixture
  ui: UiFixture
  _allureLayer: void
}>({
  _allureLayer: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument even when no fixture is used
    async ({}, use, testInfo) => {
      const file = testInfo.file.replace(/\\/g, '/');
      const layer = file.includes('/integration/')
        ? 'integration'
        : file.includes('/e2e/') ? 'e2e' : undefined;
      if (layer) {
        await label('layer', layer);
      }
      await use();
    },
    { auto: true },
  ],

  test: async ({ page, request }, use) => {
    const fixture = new TestFixture(page, request);
    await use(fixture);
  },

  ui: async ({ page, request }, use) => {
    const uiFixture = new UiFixture({ page, request });
    await use(uiFixture);
  },

  api: async ({ request }, use) => {
    const apiFixture = new ApiFixture({ request });

    const apiStatePath = config.auth.apiStatePath;
    if (existsSync(apiStatePath)) {
      try {
        const content = readFileSync(apiStatePath, 'utf-8');
        const apiState: ApiState = JSON.parse(content);
        if (apiState.token) {
          apiFixture.setAuthToken(apiState.token);
        }
      }
      catch {
        // Silently ignore - token will be null
      }
    }

    await use(apiFixture);
  },
});

export { ApiFixture, config, env, expect, TestFixture, UiFixture };
export type { Environment };
