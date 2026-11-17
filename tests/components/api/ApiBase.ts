import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';
import { attachRequestResponseToAllure } from '@utils/allure';

export interface RequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string>
  timeout?: number
}

export class ApiBase extends TestContext {
  readonly apiBaseUrl: string;

  authToken: string | null = null;

  requestHeaders: Record<string, string> = {
    // Accept */* avoids 406 from servers that reject an explicit application/json.
    'Accept': '*/*',
    'Content-Type': 'application/json',
  };

  constructor(options: TestContextOptions) {
    super(options);
    this.apiBaseUrl = this.config.apiUrl;
  }

  get request(): APIRequestContext {
    // page.request shares cookies and storage with the browser; standalone request otherwise.
    if (this._page) {
      return this._page.request;
    }

    if (!this._request) {
      throw new Error(
        'Request context is not available. ApiBase requires a request instance. '
        + 'Make sure you are using an API fixture (api or test).',
      );
    }
    return this._request;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  async getResponseJsonObject<T = Record<string, unknown>>(response: APIResponse): Promise<T> {
    const status = response.status();
    const endpoint = response.url().split('?')[0];

    console.log(`---- API ${response.ok() ? 'OK' : 'NOK'}: ${status} - ${endpoint}`);

    try {
      return (await response.json()) as T;
    }
    catch {
      return {} as T;
    }
  }

  // protected on purpose: tests go through an ATC or @step helper, never raw HTTP.
  protected async apiGET<TBody = Record<string, unknown>>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<[APIResponse, TBody]> {
    const url = this.apiEndpoint(endpoint);
    const headers = this.buildHeaders(options.headers);

    const response = await this.request.get(url, {
      headers,
      params: options.params,
      timeout: options.timeout ?? this.config.browser.defaultTimeout,
    });

    const body = await this.getResponseJsonObject<TBody>(response);

    await attachRequestResponseToAllure({ url: endpoint, method: 'GET', responseBody: body });

    return [response, body];
  }

  protected async apiPOST<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
    endpoint: string,
    data: TPayload,
    options: RequestOptions = {},
  ): Promise<[APIResponse, TBody, TPayload]> {
    const url = this.apiEndpoint(endpoint);
    const headers = this.buildHeaders(options.headers);

    const response = await this.request.post(url, {
      headers,
      data,
      params: options.params,
      timeout: options.timeout ?? this.config.browser.defaultTimeout,
    });

    const body = await this.getResponseJsonObject<TBody>(response);

    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'POST',
      responseBody: body,
      requestBody: data,
    });

    return [response, body, data];
  }

  protected async apiPUT<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
    endpoint: string,
    data: TPayload,
    options: RequestOptions = {},
  ): Promise<[APIResponse, TBody, TPayload]> {
    const url = this.apiEndpoint(endpoint);
    const headers = this.buildHeaders(options.headers);

    const response = await this.request.put(url, {
      headers,
      data,
      params: options.params,
      timeout: options.timeout ?? this.config.browser.defaultTimeout,
    });

    const body = await this.getResponseJsonObject<TBody>(response);

    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'PUT',
      responseBody: body,
      requestBody: data,
    });

    return [response, body, data];
  }

  protected async apiPATCH<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
    endpoint: string,
    data: TPayload,
    options: RequestOptions = {},
  ): Promise<[APIResponse, TBody, TPayload]> {
    const url = this.apiEndpoint(endpoint);
    const headers = this.buildHeaders(options.headers);

    const response = await this.request.patch(url, {
      headers,
      data,
      params: options.params,
      timeout: options.timeout ?? this.config.browser.defaultTimeout,
    });

    const body = await this.getResponseJsonObject<TBody>(response);

    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'PATCH',
      responseBody: body,
      requestBody: data,
    });

    return [response, body, data];
  }

  protected async apiPOSTForm<TBody = Record<string, unknown>>(
    endpoint: string,
    formData: Record<string, string>,
    options: RequestOptions = {},
  ): Promise<[APIResponse, TBody, Record<string, string>]> {
    const url = endpoint.startsWith('http') ? endpoint : this.apiEndpoint(endpoint);
    const headers = {
      ...this.buildHeaders(options.headers),
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const response = await this.request.post(url, {
      headers,
      form: formData,
      params: options.params,
      timeout: options.timeout ?? this.config.browser.defaultTimeout,
    });

    const body = await this.getResponseJsonObject<TBody>(response);

    const safeFormData = { ...formData };
    if (safeFormData.password) {
      safeFormData.password = '***';
    }
    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'POST',
      responseBody: body,
      requestBody: safeFormData,
    });

    return [response, body, formData];
  }

  protected async apiDELETE<TBody = Record<string, unknown>>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<[APIResponse, TBody]> {
    const url = this.apiEndpoint(endpoint);
    const headers = this.buildHeaders(options.headers);

    const response = await this.request.delete(url, {
      headers,
      params: options.params,
      timeout: options.timeout ?? this.config.browser.defaultTimeout,
    });

    const body = await this.getResponseJsonObject<TBody>(response);

    await attachRequestResponseToAllure({ url: endpoint, method: 'DELETE', responseBody: body });

    return [response, body];
  }

  apiEndpoint(endpoint: string): string {
    const base = this.apiBaseUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${cleanEndpoint}`;
  }

  buildHeaders(customHeaders?: Record<string, string>) {
    const headers: Record<string, string> = {
      ...this.requestHeaders,
      ...customHeaders,
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }
}
