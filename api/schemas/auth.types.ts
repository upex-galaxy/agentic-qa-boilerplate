/**
 * KATA Framework - Type Facade: Auth Domain
 *
 * Type definitions for authentication endpoints.
 * When openapi-types.ts is available (after `bun run api:sync`),
 * migrate Custom Types to Schema/Endpoint Types using @openapi imports.
 *
 * Consumed by: tests/components/api/AuthApi.ts
 *
 * Migration example:
 *   import type { components, paths } from '@openapi';
 *   export type TokenResponse = components['schemas']['TokenResponse'];
 *   type LoginPath = paths['/api/auth/login']['post'];
 *   export type LoginRequest = LoginPath['requestBody']['content']['application/json'];
 */

// ============================================================================
// Schema Types (from components.schemas)
// ============================================================================

// TODO: Uncomment after running `bun run api:sync` and replace Custom Types below
// import type { components, paths } from '@openapi';
// export type TokenResponse = components['schemas']['TokenResponse'];
// export type UserInfo = components['schemas']['UserInfoModel'];

// ============================================================================
// Endpoint Types - POST /api/auth/login
// ============================================================================

// TODO: Uncomment after running `bun run api:sync`
// type LoginPath = paths['/api/auth/login']['post'];
// export type LoginPayload = LoginPath['requestBody']['content']['application/json'];
// export type LoginSuccessResponse = LoginPath['responses']['200']['content']['application/json'];
// export type LoginErrorResponse = LoginPath['responses']['401']['content']['application/json'];

// ============================================================================
// Endpoint Types - GET /api/auth/me
// ============================================================================

// TODO: Uncomment after running `bun run api:sync`
// type MePath = paths['/api/auth/me']['get'];
// export type MeResponse = MePath['responses']['200']['content']['application/json'];

// ============================================================================
// Custom Types (pre-sync definitions — replace with OpenAPI types when available)
// ============================================================================

/**
 * Login request payload.
 * TODO: Replace with OpenAPI endpoint type after sync.
 */
export interface LoginPayload {
  email: string
  password: string
}

/**
 * Token response from authentication endpoints.
 * Compatible with IdentityServer4 token response.
 * TODO: Replace with OpenAPI schema type after sync.
 */
export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

/**
 * Error response for failed authentication.
 * TODO: Replace with OpenAPI endpoint type after sync (if documented in spec).
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
 * User info response from /api/auth/me.
 * TODO: Replace with OpenAPI endpoint type after sync.
 */
export interface UserInfoResponse {
  user: {
    id: string
    email: string
    name: string
    createdAt: string
    updatedAt: string
  }
}
