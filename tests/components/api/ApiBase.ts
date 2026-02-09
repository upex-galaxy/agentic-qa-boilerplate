/**
 * KATA Framework - Layer 2: API Base Component
 *
 * ApiBase provides type-safe HTTP methods for all API components.
 * Uses Playwright's native APIRequestContext for requests.
 * Extends TestContext to inherit Playwright drivers and configuration.
 *
 * Key Pattern:
 * - GET/DELETE return: [APIResponse, TBody]
 * - POST/PUT/PATCH return: [APIResponse, TBody, TPayload]
 * - Always specify response_model (and payload_model for mutations) for type safety
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';
import { attachRequestResponseToAllure } from '@utils/allure';

// ============================================
// Types
// ============================================

export interface RequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string>
  timeout?: number
}

// ============================================
// API Base Class
// ============================================

export class ApiBase extends TestContext {
  /** Base URL for API requests */
  readonly apiBaseUrl: string;

  /** Authentication token for Bearer auth */
  authToken: string | null = null;

  /** Default request headers */
  requestHeaders: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  };

  constructor(options: TestContextOptions) {
    super(options);
    this.apiBaseUrl = this.config.apiUrl;
  }

  // ============================================
  // Request Accessor with Validation
  // ============================================

  /**
   * Get Playwright APIRequestContext instance.
   * Throws if request is not available.
   */
  get request(): APIRequestContext {
    if (!this._request) {
      throw new Error(
        'Request context is not available. ApiBase requires a request instance. '
        + 'Make sure you are using an API fixture (api or test).',
      );
    }
    return this._request;
  }

  // ============================================
  // Authentication Methods
  // ============================================

  /**
   * Set authentication token for subsequent requests.
   * Token will be included as Bearer token in Authorization header.
   */
  setAuthToken(token: string) {
    this.authToken = token;
  }

  /**
   * Clear authentication token.
   */
  clearAuthToken() {
    this.authToken = null;
  }

  // ============================================
  // Response Parser Helper
  // ============================================

  /**
   * Parse response as JSON with error handling.
   * Returns empty object if parsing fails.
   */
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

  // ============================================
  // HTTP Methods - Type Safe with Tuples
  // ============================================

  /**
   * Generic GET request with automatic response parsing and Allure attachment.
   *
   * @param endpoint - The API endpoint URL
   * @param options - Optional request options (headers, params, timeout)
   * @returns Tuple [APIResponse, TBody] - Response object and parsed body
   *
   * @example
   * // With specific interface type
   * const [response, userData] = await this.apiGET<UserResponse>('/api/user/123');
   *
   * // With query parameters
   * const [response, results] = await this.apiGET<SearchResults>('/api/search', { params: { q: 'test' } });
   */
  async apiGET<TBody = Record<string, unknown>>(
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

    // Allure attachment
    await attachRequestResponseToAllure({ url: endpoint, method: 'GET', responseBody: body });

    return [response, body];
  }

  /**
   * Generic POST request with automatic response parsing and Allure attachment.
   *
   * @param endpoint - The API endpoint URL
   * @param data - Request payload data
   * @param options - Optional request options (headers, params, timeout)
   * @returns Tuple [APIResponse, TBody, TPayload] - Response, parsed body, and original payload
   *
   * @example
   * const [response, result, payload] = await this.apiPOST<CreateResponse, CreatePayload>(
   *   '/api/users',
   *   { name: 'John', email: 'john@example.com' }
   * );
   */
  async apiPOST<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
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

    // Allure attachments
    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'POST',
      responseBody: body,
      requestBody: data,
    });

    return [response, body, data];
  }

  /**
   * Generic PUT request with automatic response parsing and Allure attachment.
   *
   * @param endpoint - The API endpoint URL
   * @param data - Request payload data
   * @param options - Optional request options (headers, params, timeout)
   * @returns Tuple [APIResponse, TBody, TPayload] - Response, parsed body, and original payload
   *
   * @example
   * const [response, updated, payload] = await this.apiPUT<UserResponse, UpdatePayload>(
   *   '/api/user/123',
   *   { name: 'John Updated' }
   * );
   */
  async apiPUT<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
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

    // Allure attachments
    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'PUT',
      responseBody: body,
      requestBody: data,
    });

    return [response, body, data];
  }

  /**
   * Generic PATCH request with automatic response parsing and Allure attachment.
   *
   * @param endpoint - The API endpoint URL
   * @param data - Request payload data
   * @param options - Optional request options (headers, params, timeout)
   * @returns Tuple [APIResponse, TBody, TPayload] - Response, parsed body, and original payload
   *
   * @example
   * const [response, patched, payload] = await this.apiPATCH<UserResponse, PatchPayload>(
   *   '/api/user/123',
   *   { status: 'active' }
   * );
   */
  async apiPATCH<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
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

    // Allure attachments
    await attachRequestResponseToAllure({
      url: endpoint,
      method: 'PATCH',
      responseBody: body,
      requestBody: data,
    });

    return [response, body, data];
  }

  /**
   * Generic DELETE request with automatic response parsing and Allure attachment.
   *
   * @param endpoint - The API endpoint URL
   * @param options - Optional request options (headers, params, timeout)
   * @returns Tuple [APIResponse, TBody] - Response object and parsed body
   *
   * @example
   * const [response, result] = await this.apiDELETE<DeleteResponse>('/api/user/123');
   */
  async apiDELETE<TBody = Record<string, unknown>>(
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

    // Allure attachment
    await attachRequestResponseToAllure({ url: endpoint, method: 'DELETE', responseBody: body });

    return [response, body];
  }

  // ============================================
  // Helper Methods
  // ============================================

  /**
   * Build full API URL from endpoint using config apiUrl.
   * Required because Playwright's request context doesn't use baseURL.
   *
   * @example
   * const url = this.apiEndpoint('/users'); // http://localhost:64422/api/users
   */
  apiEndpoint(endpoint: string): string {
    const base = this.apiBaseUrl.replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${cleanEndpoint}`;
  }

  /**
   * Build request headers with auth token if available
   */
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
