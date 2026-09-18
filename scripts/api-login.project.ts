/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  PROJECT-SPECIFIC AUTHENTICATION ADAPTER                        ║
 * ║  THIS is the only file to adapt to YOUR project's auth flow.     ║
 * ║  It ships once with the scaffold and is never overwritten by     ║
 * ║  `bun run up` - the CLI around it (scripts/lib/api-login-core.ts) ║
 * ║  keeps syncing, so upstream improvements arrive without          ║
 * ║  clobbering this adaptation.                                     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * The boilerplate default is POST /auth/login with `{ email, password }`
 * returning `{ access_token, token_type, expires_in, refresh_token? }`.
 * Your project may use OAuth2 form data, an API key, a PAT exchange, or a
 * different response shape: change the two functions below.
 *
 * Contract (see `ApiLoginAdapter` in scripts/lib/api-login-core.ts):
 *   buildAuthPayload            (required) request body for the auth endpoint
 *   extractTokenFromResponse    (required) token fields out of the response
 *   loginEndpoint               (optional) overrides config.auth.loginEndpoint
 *   headers                     (optional) extra request headers
 *   environments                (optional) positional environments this project
 *                               accepts; keep in sync with the `Environment`
 *                               union in config/variables.ts
 *   extraFlags                  (optional) project flags that take a value
 *                               (e.g. ['--method']); their values arrive in
 *                               `context.flags` and never get mistaken for the
 *                               positional environment
 */

import type { ApiLoginContext, ExtractedToken } from './lib/api-login-core';

/**
 * Environments accepted as the positional argument. MUST match the
 * `Environment` union in config/variables.ts (add 'qa' / 'production' in both
 * places when the project grows them).
 */
export const environments = ['local', 'staging'] as const;

/**
 * Build the request body for the auth endpoint.
 * Override for different auth formats (e.g. `{ username, password }`, OAuth2).
 */
export function buildAuthPayload(
  email: string,
  password: string,
  _context: ApiLoginContext,
): Record<string, unknown> {
  return { email, password };
}

/**
 * Extract the token fields from the auth response.
 * Override if your API returns tokens in a different shape.
 *
 * Expected response format (default):
 *   { access_token: string, token_type: string, expires_in: number, refresh_token?: string }
 */
export function extractTokenFromResponse(
  body: Record<string, unknown>,
  _context: ApiLoginContext,
): ExtractedToken {
  return {
    accessToken: String(body.access_token ?? ''),
    tokenType: String(body.token_type ?? 'Bearer'),
    expiresIn: Number(body.expires_in ?? 86400),
    refreshToken: body.refresh_token ? String(body.refresh_token) : null,
  };
}
