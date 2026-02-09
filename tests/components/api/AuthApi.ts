/**
 * KATA Framework - Layer 3: Auth API Component
 *
 * API component for authentication operations.
 * Handles login, token management, and user info retrieval.
 *
 * Endpoints:
 * - POST /api/auth/login - Authenticate and get JWT token
 * - GET /api/auth/me - Get current user info (requires auth)
 */

import type { TokenResponse } from '@data/types';
import type { APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc } from '@utils/decorators';

// Re-export TokenResponse for consumers that import from AuthApi
export type { TokenResponse } from '@data/types';

// ============================================
// Types - Auth API data structures
// ============================================

/**
 * Login request payload
 * Note: 'username' field accepts email addresses
 */
export interface LoginPayload {
  username: string
  password: string
}

/**
 * Error response for failed login
 */
export interface AuthErrorResponse {
  error: string
  statusCode?: number
  identityServerError?: {
    error: string
    error_description: string
  }
  hint?: string
}

/**
 * User info response from /auth/me
 * Note: API uses PascalCase for properties
 */
export interface UserInfoResponse {
  UserId: string
  Username: string
  Email: string
  Roles: string[]
  Claims?: Array<{
    Type: string
    Value: string
  }>
}

// ============================================
// Auth API Component
// ============================================

export class AuthApi extends ApiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // ATCs - Complete Test Cases
  // ============================================

  /**
   * ATC: Authenticate with valid credentials - expects success (200)
   *
   * Complete flow: POST credentials, validate token response, store token.
   * The token is automatically set for subsequent API requests.
   *
   * @param credentials - Username (email) and password
   * @returns Tuple with response, token data, and sent payload
   */
  @atc('CUR-AUTH-001')
  async authenticateSuccessfully(
    credentials: LoginPayload,
  ): Promise<[APIResponse, TokenResponse, LoginPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
      '/auth/login',
      credentials,
    );

    // Fixed assertions - validates successful authentication
    expect(response.status()).toBe(200);
    expect(body.access_token).toBeDefined();
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBeGreaterThan(0);

    // Store token for subsequent requests
    this.setAuthToken(body.access_token);

    return [response, body, sentPayload];
  }

  /**
   * ATC: Login with invalid credentials - expects error (400)
   *
   * Validates that invalid credentials return appropriate error response.
   *
   * @param credentials - Invalid username or password
   * @returns Tuple with error response and sent payload
   */
  @atc('CUR-AUTH-002')
  async loginWithInvalidCredentials(
    credentials: LoginPayload,
  ): Promise<[APIResponse, AuthErrorResponse, LoginPayload]> {
    const [response, body, sentPayload] = await this.apiPOST<AuthErrorResponse, LoginPayload>(
      '/auth/login',
      credentials,
    );

    // Fixed assertions - validates error response
    expect(response.status()).toBe(400);
    expect(response.ok()).toBe(false);
    expect(body.error).toBeDefined();

    return [response, body, sentPayload];
  }

  /**
   * ATC: Get current user info - expects success (200)
   *
   * Retrieves authenticated user information.
   * Requires a valid auth token to be set.
   *
   * @returns Tuple with response and user info
   */
  @atc('CUR-AUTH-003')
  async getCurrentUserSuccessfully(): Promise<[APIResponse, UserInfoResponse]> {
    const [response, body] = await this.apiGET<UserInfoResponse>('/auth/me');

    // Fixed assertions - validates user info response
    expect(response.status()).toBe(200);
    expect(body.UserId).toBeDefined();
    expect(body.Email).toBeDefined();

    return [response, body];
  }

  /**
   * ATC: Get current user without auth - expects unauthorized (401)
   *
   * Validates that unauthenticated requests are rejected.
   */
  @atc('CUR-AUTH-004')
  async getCurrentUserUnauthorized(): Promise<[APIResponse, Record<string, unknown>]> {
    // Temporarily clear auth token
    const savedToken = this.authToken;
    this.clearAuthToken();

    const [response, body] = await this.apiGET<Record<string, unknown>>('/auth/me');

    // Restore token if it was set
    if (savedToken) {
      this.setAuthToken(savedToken);
    }

    // Fixed assertions - validates unauthorized response
    expect(response.status()).toBe(401);
    expect(response.ok()).toBe(false);

    return [response, body];
  }
}
