/**
 * KATA Framework - Layer 2: UI Base Component
 *
 * UiBase is the base class for all UI components.
 * Extends TestContext to inherit Playwright drivers and configuration.
 *
 * IMPORTANT: Use Playwright's native API directly (this.page).
 * Playwright auto-waits before every action - no wrappers needed.
 */

import type { Page, Request, Response } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';
import { attachRequestResponseToAllure } from '@utils/allure';

// ============================================
// Types
// ============================================

export interface InterceptedData<TRequest = unknown, TResponse = unknown> {
  url: string
  method: string
  status: number
  requestBody: TRequest | null
  responseBody: TResponse | null
  request: Request
  response: Response
}

export interface InterceptResponseArgs {
  /** URL pattern to match (string glob or RegExp) */
  urlPattern: string | RegExp
  /** Async function that triggers the request (e.g., button click) */
  action: () => Promise<void>
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Whether to attach request/response to Allure (default: true) */
  attachToAllure?: boolean
}

export interface WaitForResponseArgs {
  /** URL pattern to match (string glob or RegExp) */
  urlPattern: string | RegExp
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number
  /** Whether to attach request/response to Allure (default: true) */
  attachToAllure?: boolean
}

// ============================================
// UI Base Class
// ============================================

export class UiBase extends TestContext {
  /** Base URL from config - use with buildUrl() for full URLs */
  readonly baseUrl: string;

  constructor(options: TestContextOptions) {
    super(options);
    this.baseUrl = this.config.baseUrl;
  }

  // ============================================
  // Page Accessor with Validation
  // ============================================

  /**
   * Get Playwright Page instance.
   * Throws if page is not available (e.g., in API-only tests).
   */
  get page(): Page {
    if (!this._page) {
      throw new Error(
        'Page is not available. UiBase requires a page instance. '
        + 'Make sure you are using a UI fixture (ui or test), not api.',
      );
    }
    return this._page;
  }

  // ============================================
  // URL Helpers
  // ============================================

  /**
   * Build full URL from path using config baseUrl.
   * Useful when you need the full URL string (e.g., logging, assertions).
   *
   * NOTE: For page.goto(), use relative paths directly - Playwright's baseURL handles it.
   *
   * @example
   * const url = this.buildUrl('/signup'); // https://app.example.com/signup
   */
  buildUrl(path: string): string {
    const base = this.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // ============================================
  // Response Interception Helpers
  // ============================================

  /**
   * Wait for a response matching the URL pattern and capture request/response data.
   * Triggers the action and waits for the response.
   * Attaches both to Allure for debugging.
   *
   * @example
   * // Intercept login response
   * const { responseBody } = await this.interceptResponse<LoginPayload, TokenResponse>({
   *   urlPattern: /\/auth\/login/,
   *   action: async () => await this.page.locator('button[type="submit"]').click(),
   * });
   */
  async interceptResponse<TRequest = unknown, TResponse = unknown>(
    args: InterceptResponseArgs,
  ): Promise<InterceptedData<TRequest, TResponse>> {
    const { urlPattern, action, timeout = 30000, attachToAllure = true } = args;

    // Start waiting for the response before triggering the action
    const responsePromise = this.page.waitForResponse(
      response => this.matchesPattern(response.url(), urlPattern),
      { timeout },
    );

    // Trigger the action that causes the request
    await action();

    // Wait for the response
    const response = await responsePromise;
    const request = response.request();

    // Parse bodies
    const requestBody = this.parseRequestBody<TRequest>(request);
    const responseBody = await this.parseResponseBody<TResponse>(response);

    const interceptedData: InterceptedData<TRequest, TResponse> = {
      url: response.url(),
      method: request.method(),
      status: response.status(),
      requestBody,
      responseBody,
      request,
      response,
    };

    // Log interception
    const endpoint = response.url().split('?')[0];
    console.log(`---- Intercepted ${request.method()} ${response.status()} - ${endpoint}`);

    // Attach to Allure for debugging
    if (attachToAllure) {
      await attachRequestResponseToAllure({
        url: response.url(),
        method: request.method(),
        responseBody,
        requestBody,
      });
    }

    return interceptedData;
  }

  /**
   * Wait for a response matching the URL pattern without triggering an action.
   * Useful when the request is already in flight or will be triggered elsewhere.
   *
   * @example
   * // Start some action
   * await this.page.locator('button').click();
   * // Wait for the response
   * const { responseBody } = await this.waitForApiResponse<void, DataResponse>({
   *   urlPattern: /\/api\/data/,
   * });
   */
  async waitForApiResponse<TRequest = unknown, TResponse = unknown>(
    args: WaitForResponseArgs,
  ): Promise<InterceptedData<TRequest, TResponse>> {
    const { urlPattern, timeout = 30000, attachToAllure = true } = args;

    const response = await this.page.waitForResponse(
      resp => this.matchesPattern(resp.url(), urlPattern),
      { timeout },
    );

    const request = response.request();

    // Parse bodies
    const requestBody = this.parseRequestBody<TRequest>(request);
    const responseBody = await this.parseResponseBody<TResponse>(response);

    const interceptedData: InterceptedData<TRequest, TResponse> = {
      url: response.url(),
      method: request.method(),
      status: response.status(),
      requestBody,
      responseBody,
      request,
      response,
    };

    // Log interception
    const endpoint = response.url().split('?')[0];
    console.log(`---- Intercepted ${request.method()} ${response.status()} - ${endpoint}`);

    // Attach to Allure for debugging
    if (attachToAllure) {
      await attachRequestResponseToAllure({
        url: response.url(),
        method: request.method(),
        responseBody,
        requestBody,
      });
    }

    return interceptedData;
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Check if URL matches the given pattern.
   * Supports glob-like patterns: ** matches any path, * matches any segment
   */
  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    // Convert glob-like pattern to regex
    const regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(regexPattern).test(url);
  }

  /**
   * Parse request body from Playwright Request
   */
  private parseRequestBody<T>(request: Request): T | null {
    try {
      const postData = request.postData();
      if (postData) {
        return JSON.parse(postData) as T;
      }
    }
    catch {
      // Request body might not be JSON
    }
    return null;
  }

  /**
   * Parse response body from Playwright Response
   */
  private async parseResponseBody<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    }
    catch {
      // Response might not be JSON
    }
    return null;
  }
}
