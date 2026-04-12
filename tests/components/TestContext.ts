/**
 * KATA Architecture - Layer 1: Test Context
 *
 * TestContext is the foundation layer that centralizes Playwright drivers
 * and shared configuration for all test components.
 *
 * This class manages:
 * - Playwright drivers (page, request) - injected from fixtures
 * - Environment configuration
 * - DataFactory access via `this.data`
 *
 * All components (UiBase, ApiBase) inherit from this class to access
 * the same context, ensuring consistency across UI and API operations.
 */

import type { APIRequestContext, Page } from '@playwright/test';
import type { Environment } from '@variables';

import { DataFactory } from '@DataFactory';
import { config, env } from '@variables';

// ============================================
// Types
// ============================================

export interface TestContextOptions {
  /** Playwright Page instance (required for UI tests) */
  page?: Page
  /** Playwright APIRequestContext instance (required for API tests) */
  request?: APIRequestContext
  /** Environment to use (defaults to current from config) */
  environment?: Environment
}

// ============================================
// Test Context Class
// ============================================

export class TestContext {
  /** Playwright Page instance - available in UI tests */
  protected readonly _page?: Page;

  /** Playwright APIRequestContext instance - available in API tests */
  protected readonly _request?: APIRequestContext;

  /** Current environment (local, staging, production) */
  readonly env: Environment;

  /** Global configuration from variables.ts */
  readonly config = config;

  /** DataFactory - Generador centralizado de datos de prueba */
  static readonly data = DataFactory;

  constructor(options: TestContextOptions = {}) {
    this._page = options.page;
    this._request = options.request;
    this.env = options.environment ?? env.current;
  }

  /** Acceso a DataFactory desde instancia (conveniente para componentes) */
  get data(): typeof DataFactory {
    return TestContext.data;
  }
}
