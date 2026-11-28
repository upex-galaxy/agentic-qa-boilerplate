import type { Locator, Page, Request, Response } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { expect } from '@playwright/test';
import { TestContext } from '@TestContext';
import { attachRequestResponseToAllure } from '@utils/allure';
import { env } from '@variables';

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
  urlPattern: string | RegExp
  action: () => Promise<void>
  timeout?: number
  attachToAllure?: boolean
}

export interface WaitForResponseArgs {
  urlPattern: string | RegExp
  timeout?: number
  attachToAllure?: boolean
}

export class UiBase extends TestContext {
  readonly baseUrl: string;

  constructor(options: TestContextOptions) {
    super(options);
    this.baseUrl = this.config.baseUrl;
  }

  get page(): Page {
    if (!this._page) {
      throw new Error(
        'Page is not available. UiBase requires a page instance. '
        + 'Make sure you are using a UI fixture (ui or test), not api.',
      );
    }
    return this._page;
  }

  buildUrl(path: string): string {
    const base = this.baseUrl.replace(/\/$/, '');
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  }

  // fill() writes the value into its step title and error log, which reach the published report; evaluate() writes neither.
  async fillSecret(field: Locator, value: string): Promise<void> {
    await this.refuseTracedCredential();
    await expect(field).toBeVisible();
    await expect(field).toBeEditable();
    await field.evaluate((element, secret) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new TypeError('fillSecret() needs an input or a textarea');
      }
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      element.focus();
      // The native setter is what lets a framework-controlled input see the change.
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, secret);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  // A trace holds the typed value and travels inside the published report. start() fails only while one records.
  private async refuseTracedCredential(): Promise<void> {
    const { tracing } = this.page.context();
    try {
      await tracing.start();
    }
    catch (error) {
      if (!String(error).includes('already started')) {
        throw error;
      }
      const message = 'fillSecret() types a credential while a trace records. Add test.use({ trace: \'off\' }) at the top of this spec file.';
      if (env.isCI) {
        throw new Error(message);
      }
      console.warn(`⚠️ ${message} CI refuses this run.`);
      return;
    }
    await tracing.stop();
  }

  async interceptResponse<TRequest = unknown, TResponse = unknown>(
    args: InterceptResponseArgs,
  ): Promise<InterceptedData<TRequest, TResponse>> {
    const { urlPattern, action, timeout = 30000, attachToAllure = true } = args;

    // Start waiting for the response before triggering the action
    const responsePromise = this.page.waitForResponse(
      response => this.matchesPattern(response.url(), urlPattern),
      { timeout },
    );

    await action();

    const response = await responsePromise;
    const request = response.request();

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

    const endpoint = response.url().split('?')[0];
    console.log(`---- Intercepted ${request.method()} ${response.status()} - ${endpoint}`);

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

  async waitForApiResponse<TRequest = unknown, TResponse = unknown>(
    args: WaitForResponseArgs,
  ): Promise<InterceptedData<TRequest, TResponse>> {
    const { urlPattern, timeout = 30000, attachToAllure = true } = args;

    const response = await this.page.waitForResponse(
      resp => this.matchesPattern(resp.url(), urlPattern),
      { timeout },
    );

    const request = response.request();

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

    const endpoint = response.url().split('?')[0];
    console.log(`---- Intercepted ${request.method()} ${response.status()} - ${endpoint}`);

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

  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(url);
    }
    const regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(regexPattern).test(url);
  }

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
