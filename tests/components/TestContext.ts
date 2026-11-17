import type { APIRequestContext, Page } from '@playwright/test';
import type { Environment } from '@variables';

import { DataFactory } from '@DataFactory';
import { config, env } from '@variables';

export interface TestContextOptions {
  page?: Page
  request?: APIRequestContext
  environment?: Environment
}

export class TestContext {
  protected readonly _page?: Page;

  protected readonly _request?: APIRequestContext;

  readonly env: Environment;

  readonly config = config;

  static readonly data = DataFactory;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }

  get data(): typeof DataFactory {
    return TestContext.data;
  }
}
