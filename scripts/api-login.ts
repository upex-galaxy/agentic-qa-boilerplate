#!/usr/bin/env bun
/**
 * API Login CLI - Authentication Token Generator
 *
 * Authenticates against the project API and stores the token for:
 *   1. Playwright tests     → .auth/api-state.json (unchanged)
 *   2. Agentic API testing  → .auth/tokens.env  (sourceable: `export API_TOKEN_<ROLE>_<ENV>='...'`)
 *                           → .auth/tokens.json (metadata: expiresIn, createdAt — for freshness checks)
 *
 * The token is NO LONGER written to .env and NOT injected into the OpenAPI MCP.
 * The OpenAPI MCP is schema-READ-ONLY; authenticated requests run via curl:
 *   source .auth/tokens.env && \
 *   curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"
 * Because no credential enters any MCP, NO agent/terminal restart is needed after
 * login (the MCP-spawn env cache no longer governs API auth).
 *
 * Usage:
 *   bun run api:login                       # Uses TEST_ENV from .env (default: local), role=user
 *   bun run api:login local                 # Authenticate against local environment
 *   bun run api:login staging               # Authenticate against staging environment
 *   bun run api:login staging --role admin  # Named role → var API_TOKEN_ADMIN_STAGING
 *   bun run api:login --help                # Show help
 *
 * Environment URLs, credentials, and auth endpoints are sourced from
 * config/variables.ts (single source of truth). See that file to add
 * new environments or change URLs.
 */

import type { ApiState } from '@data/types';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================
// Logging (must be defined early for validation errors)
// ============================================

const PREFIX = '[api-login]';

function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const icons = { info: '\u2139', success: '\u2713', warn: '\u26A0', error: '\u2717' };
  const colors = { info: '\x1B[36m', success: '\x1B[32m', warn: '\x1B[33m', error: '\x1B[31m' };
  console.log(`${colors[type]}${icons[type]}\x1B[0m ${PREFIX} ${msg}`);
}

// ============================================
// CLI Argument Parsing (BEFORE config import)
// ============================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Parse the optional --role / -r flag (default: 'user'). Removing it from args
// keeps the positional environment detection below intact. The role becomes the
// middle segment of the stored token var: API_TOKEN_<ROLE>_<ENV>.
let role = 'user';
const roleIdx = args.findIndex(a => a === '--role' || a === '-r');
if (roleIdx !== -1) {
  const roleVal = args[roleIdx + 1];
  if (!roleVal || roleVal.startsWith('-')) {
    log('--role requires a value (e.g. --role admin)', 'error');
    process.exit(1);
  }
  role = roleVal.toLowerCase();
  args.splice(roleIdx, 2);
}

// Validate and override TEST_ENV BEFORE importing config,
// because config/variables.ts reads TEST_ENV at evaluation time.
const validEnvs = ['local', 'staging']; // Must match Environment type in config/variables.ts
const envArg = args[0];
if (envArg) {
  if (!validEnvs.includes(envArg)) {
    log(`Unknown environment: "${envArg}"`, 'error');
    log(`Available environments: ${validEnvs.join(', ')}`, 'info');
    process.exit(1);
  }
  process.env.TEST_ENV = envArg;
}

// Dynamic import: config/variables.ts reads TEST_ENV at evaluation time,
// so we must set it above BEFORE this import runs.
const { config, env } = await import('@variables');

// ============================================
// Constants
// ============================================

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const AUTH_DIR = resolve(PROJECT_ROOT, '.auth');
const TOKENS_ENV_FILE = resolve(AUTH_DIR, 'tokens.env');
const TOKENS_JSON_FILE = resolve(AUTH_DIR, 'tokens.json');

// ╔══════════════════════════════════════════════════════════════════╗
// ║  PROJECT-SPECIFIC AUTHENTICATION CONFIGURATION                  ║
// ║  Adapt this section to match YOUR project's auth mechanism.     ║
// ║  The boilerplate default uses POST /auth/login with             ║
// ║  { email, password } → { access_token }.                       ║
// ║  Your project may use OAuth2, API keys, or a different format.  ║
// ╚══════════════════════════════════════════════════════════════════╝

/**
 * Build the request body for the auth endpoint.
 * Override this for different auth formats (e.g., { username, password }, OAuth2 form data).
 */
function buildAuthPayload(email: string, password: string): Record<string, string> {
  return { email, password };
}

/**
 * Extract token fields from the auth response.
 * Override this if your API returns tokens in a different shape.
 *
 * Expected response format (default):
 *   { access_token: string, token_type: string, expires_in: number, refresh_token?: string }
 */
function extractTokenFromResponse(body: Record<string, unknown>): {
  accessToken: string
  tokenType: string
  expiresIn: number
  refreshToken: string | null
} {
  return {
    accessToken: String(body.access_token ?? ''),
    tokenType: String(body.token_type ?? 'Bearer'),
    expiresIn: Number(body.expires_in ?? 86400),
    refreshToken: body.refresh_token ? String(body.refresh_token) : null,
  };
}

// ╔══════════════════════════════════════════════════════════════════╗
// ║  END OF PROJECT-SPECIFIC CONFIGURATION                          ║
// ╚══════════════════════════════════════════════════════════════════╝

// ============================================
// Authentication
// ============================================

async function authenticate(): Promise<ApiState | null> {
  const url = `${config.apiUrl}${config.auth.loginEndpoint}`;
  const { email, password } = config.testUser;

  if (!email || !password) {
    const prefix = env.current.toUpperCase();
    log('Missing credentials in .env file:', 'error');
    if (!email) { log(`  - ${prefix}_USER_EMAIL is not set`, 'error'); }
    if (!password) { log(`  - ${prefix}_USER_PASSWORD is not set`, 'error'); }
    log('Set these in your .env file and try again.', 'info');
    return null;
  }

  log(`Authenticating against ${url}...`);

  try {
    const payload = buildAuthPayload(email, password);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      log(`Authentication failed with status ${response.status}`, 'error');
      log(`Response: ${body}`, 'error');
      return null;
    }

    const responseBody = (await response.json()) as Record<string, unknown>;
    const tokenData = extractTokenFromResponse(responseBody);

    if (!tokenData.accessToken) {
      log('Authentication response did not contain an access token.', 'error');
      log(`Response keys: ${Object.keys(responseBody).join(', ')}`, 'error');
      return null;
    }

    return {
      token: tokenData.accessToken,
      tokenType: tokenData.tokenType,
      expiresIn: tokenData.expiresIn,
      refreshToken: tokenData.refreshToken,
      source: 'api-login',
      createdAt: new Date().toISOString(),
    };
  }
  catch (error) {
    log('Connection failed. Is the server running?', 'error');
    log(`  ${String(error)}`, 'error');
    return null;
  }
}

// ============================================
// Token Storage: api-state.json
// ============================================

function saveApiState(apiState: ApiState): void {
  const apiStatePath = config.auth.apiStatePath;
  writeFileSync(apiStatePath, JSON.stringify(apiState, null, 2));
  log(`Token saved to ${apiStatePath}`, 'success');
}

// ============================================
// Token Storage: .auth/tokens.env + .auth/tokens.json (consumed by curl)
// ============================================
//
// Agentic API testing executes authenticated requests with curl, NOT through
// the OpenAPI MCP (which is schema-read-only). The token is stored two ways,
// both under .auth/ (gitignored):
//   - .auth/tokens.env  — a shell-sourceable file. One line per role+env:
//     `export API_TOKEN_<ROLE>_<ENV>='<token>'`. The agent runs
//     `source .auth/tokens.env && curl -H "Authorization: Bearer $API_TOKEN_..."`
//     in a SINGLE shell call (env vars do NOT persist across the agent's separate
//     Bash calls — the file on disk is the source of truth, re-sourced per call).
//   - .auth/tokens.json — structured metadata (token, tokenType, expiresIn,
//     createdAt) keyed by `<ROLE>_<ENV>`, so the maneuver can check token
//     freshness before reusing it.
// Nothing is written to .env and no credential is injected into any MCP — so no
// agent/terminal restart is needed after login.

function ensureAuthDir(): void {
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }
}

/** Shell-escape a value for safe single-quote wrapping in tokens.env. */
function shellSingleQuote(value: string): string {
  return value.replace(/'/g, '\'\\\'\'');
}

/** Upsert one `export <VAR>='<token>'` line in .auth/tokens.env (other roles/envs preserved). */
function saveTokenEnv(varName: string, token: string): void {
  ensureAuthDir();
  const line = `export ${varName}='${shellSingleQuote(token)}'`;
  const existing = existsSync(TOKENS_ENV_FILE)
    ? readFileSync(TOKENS_ENV_FILE, 'utf-8').split('\n').filter(l => l.trim().length > 0)
    : [];
  const pattern = new RegExp(`^export ${varName}=`);

  let replaced = false;
  const updated = existing.map((l) => {
    if (pattern.test(l)) {
      replaced = true;
      return line;
    }
    return l;
  });
  if (!replaced) {
    updated.push(line);
  }

  writeFileSync(TOKENS_ENV_FILE, `${updated.join('\n')}\n`);
  log(`Token saved to .auth/tokens.env (${varName})`, 'success');
}

/** Upsert one entry in .auth/tokens.json keyed by `<ROLE>_<ENV>` (other entries preserved). */
function saveTokenMeta(key: string, entry: Record<string, unknown>): void {
  ensureAuthDir();
  let data: Record<string, unknown> = {};
  if (existsSync(TOKENS_JSON_FILE)) {
    try {
      data = JSON.parse(readFileSync(TOKENS_JSON_FILE, 'utf-8')) as Record<string, unknown>;
    }
    catch {
      data = {};
    }
  }
  data[key] = entry;
  writeFileSync(TOKENS_JSON_FILE, `${JSON.stringify(data, null, 2)}\n`);
  log(`Token metadata saved to .auth/tokens.json (${key})`, 'success');
}

// ============================================
// Help
// ============================================

function showHelp(): void {
  console.log(`
\x1B[1mAPI Login\x1B[0m - Authenticate and store a token for tests & agentic API testing

\x1B[1mUSAGE\x1B[0m
  bun run api:login [environment] [--role <role>]

\x1B[1mENVIRONMENTS\x1B[0m
  local       Authenticate against local dev server (default)
  staging     Authenticate against staging server

\x1B[1mEXAMPLES\x1B[0m
  bun run api:login                       # Uses TEST_ENV from .env, role=user
  bun run api:login local                 # Force local environment
  bun run api:login staging               # Force staging environment
  bun run api:login staging --role admin  # Named role -> var API_TOKEN_ADMIN_STAGING

\x1B[1mTOKEN STORAGE\x1B[0m
  .auth/api-state.json    Used by Playwright test fixtures (unchanged).
  .auth/tokens.env        Sourceable: export API_TOKEN_<ROLE>_<ENV>='<token>'.
                          One line per role+env (upserted; others preserved).
  .auth/tokens.json       Metadata (expiresIn, createdAt) keyed by <ROLE>_<ENV>
                          for token-freshness checks.
  NOTE: the token is NOT written to .env and NOT injected into any MCP. The
  OpenAPI MCP is schema-read-only; run authenticated requests via curl:
    source .auth/tokens.env && \\
    curl -H "Authorization: Bearer \$API_TOKEN_<ROLE>_<ENV>" "\$API_BASE_URL/<path>"
  No agent/terminal restart is needed after login.

\x1B[1mREQUIRED .env VARIABLES\x1B[0m
  For local:    LOCAL_USER_EMAIL, LOCAL_USER_PASSWORD
  For staging:  STAGING_USER_EMAIL, STAGING_USER_PASSWORD

\x1B[1mCONFIGURATION\x1B[0m
  Environment URLs:   config/variables.ts (envDataMap)
  Auth format:        scripts/api-login.ts (PROJECT-SPECIFIC section)

\x1B[1mOPTIONS\x1B[0m
  -r, --role <role>   Role label for the token var (default: user)
  -h, --help          Show this help
`);
}

// ============================================
// Main Execution
// ============================================

const ENV_UPPER = env.current.toUpperCase();
const ROLE_UPPER = role.toUpperCase();
const TOKEN_VAR = `API_TOKEN_${ROLE_UPPER}_${ENV_UPPER}`;
const TOKEN_KEY = `${ROLE_UPPER}_${ENV_UPPER}`;

console.log(`\n\x1B[1mAPI Login\x1B[0m — ${env.current} — role: ${role}\n`);

log(`User: ${config.testUser.email}`);

// 1. Authenticate
const apiState = await authenticate();
if (!apiState) {
  process.exit(1);
}

log('Authentication successful', 'success');
log(`Token type: ${apiState.tokenType}`);
log(`Expires in: ${apiState.expiresIn} seconds`);

// 2. Save the Playwright state (unchanged — consumed by the API fixture).
saveApiState(apiState);

// 3. Save the sourceable token + metadata for curl-based agentic API testing.
saveTokenEnv(TOKEN_VAR, apiState.token);
saveTokenMeta(TOKEN_KEY, {
  token: apiState.token,
  tokenType: apiState.tokenType,
  expiresIn: apiState.expiresIn,
  refreshToken: apiState.refreshToken,
  createdAt: apiState.createdAt,
  role,
  env: env.current,
  var: TOKEN_VAR,
});

console.log('\n\x1B[32m\u2713 Login completed!\x1B[0m');
console.log('\n\x1B[36mNext\x1B[0m \u2014 execute authenticated requests with curl (no restart needed):');
console.log('   source .auth/tokens.env && \\');
console.log(`   curl -s -H "Authorization: Bearer $${TOKEN_VAR}" "$API_BASE_URL/<path>"\n`);
