/**
 * KATA Framework - Layer 3: Auth API Component
 *
 * API component for authentication operations.
 * Handles login, token management, and user info retrieval.
 *
 * ATCs follow flow-based design: each ATC is an ACTION + VERIFICATION,
 * not a simple GET. Read-only operations are helpers (no @atc).
 *
 * TODO: Replace 'PROJ' in @atc IDs with your Jira project key (e.g., 'UPEX-101', 'MYM-101')
 *
 * Endpoints:
 * - POST /api/auth/login - Authenticate and get JWT token
 * - GET /api/auth/me - Get current user info (requires auth)
 */

import type { APIResponse } from '@playwright/test';
import type { AuthErrorResponse, LoginPayload, TokenResponse, UserInfoResponse } from '@schemas/auth.types';
import type { TestContextOptions } from '@TestContext';

import { ApiBase } from '@api/ApiBase';
import { expect } from '@playwright/test';
import { atc, step } from '@utils/decorators';

// Re-export types for consumers that import from AuthApi
export type { AuthErrorResponse, LoginPayload, TokenResponse, UserInfoResponse } from '@schemas/auth.types';

// ============================================
// Auth API Component
// ============================================

export class AuthApi extends ApiBase {
  constructor(options: TestContextOptions) {
    super(options);
  }

  // ============================================
  // Helpers - Read-only operations (no @atc)
  // ============================================

  /**
   * Helper: Get current authenticated user info.
   *
   * Read-only GET — used as a verification step inside ATCs
   * or for test-level assertions. Not an ATC because it's
   * just a data retrieval, not a complete action flow.
   *
   * @returns Tuple with response and user info
   */
  @step
  async getCurrentUser(): Promise<[APIResponse, UserInfoResponse]> {
    const [response, body] = await this.apiGET<UserInfoResponse>(this.config.auth.meEndpoint);
    return [response, body];
  }

  // ============================================
  // ATCs - Complete Test Cases (ACTION + VERIFICATION)
  // ============================================

  /**
   * ATC: Authenticate with valid credentials - expects success (200)
   *
   * Complete flow:
   * 1. POST credentials to /auth/login (ACTION)
   * 2. GET /auth/me to confirm session is valid (VERIFICATION)
   * 3. Validate token response and user info
   *
   * The token is automatically set for subsequent API requests.
   *
   * @param credentials - Email and password
   * @returns Tuple with response, token data, and sent payload
   */
  @atc('PROJ-101')
  async authenticateSuccessfully(
    credentials: LoginPayload,
  ): Promise<[APIResponse, TokenResponse, LoginPayload]> {
    // ACTION: POST login credentials
    const [response, body, sentPayload] = await this.apiPOST<TokenResponse, LoginPayload>(
      this.config.auth.loginEndpoint,
      credentials,
    );

    // Fixed assertions - validates successful authentication
    expect(response.status()).toBe(200);
    expect(body.access_token).toBeDefined();
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBeGreaterThan(0);

    // Store token for subsequent requests
    this.setAuthToken(body.access_token);

    // VERIFICATION: Confirm the session is valid via GET /auth/me
    const [meResponse, meBody] = await this.getCurrentUser();
    expect(meResponse.status()).toBe(200);
    expect(meBody.user).toBeDefined();
    expect(meBody.user.email).toBe(credentials.email);

    return [response, body, sentPayload];
  }

  /**
   * ATC: Login with invalid credentials - expects error (401)
   *
   * Complete flow:
   * 1. POST invalid credentials to /auth/login (ACTION)
   * 2. GET /auth/me to confirm NO session was created (VERIFICATION)
   * 3. Validate error response and unauthorized access
   *
   * @param credentials - Invalid email or password
   * @returns Tuple with error response and sent payload
   */
  @atc('PROJ-102')
  async loginWithInvalidCredentials(
    credentials: LoginPayload,
  ): Promise<[APIResponse, AuthErrorResponse, LoginPayload]> {
    // ACTION: POST invalid credentials
    const [response, body, sentPayload] = await this.apiPOST<AuthErrorResponse, LoginPayload>(
      this.config.auth.loginEndpoint,
      credentials,
    );

    // Fixed assertions - validates error response (UPEX Dojo returns 401)
    expect(response.status()).toBe(401);
    expect(response.ok()).toBe(false);
    expect(body.error).toBeDefined();

    // VERIFICATION: Confirm no session was created via GET /auth/me → 401
    const savedToken = this.authToken;
    this.clearAuthToken();
    const [meResponse] = await this.getCurrentUser();
    expect(meResponse.status()).toBe(401);
    // Restore token if one existed before this ATC
    if (savedToken) {
      this.setAuthToken(savedToken);
    }

    return [response, body, sentPayload];
  }
}
