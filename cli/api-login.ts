#!/usr/bin/env bun
/**
 * API Login CLI - Authentication Token Generator
 *
 * Authenticates against the project API and stores the token for:
 *   1. Playwright tests  → .auth/api-state.json
 *   2. OpenAPI MCP tools → .mcp.json (API_HEADERS env var)
 *
 * Usage:
 *   bun run api:login                 # Uses TEST_ENV from .env (default: local)
 *   bun run api:login local           # Authenticate against local environment
 *   bun run api:login staging         # Authenticate against staging environment
 *   bun run api:login --help          # Show help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================
// Types
// ============================================

interface EnvConfig {
  apiBaseUrl: string
  authEndpoint: string
  envVarPrefix: string
  mcpServerKey: string
}

interface ApiState {
  token: string
  tokenType: string
  expiresIn: number
  refreshToken: string | null
  source: 'api-login'
  createdAt: string
}

interface McpConfig {
  mcpServers?: Record<string, {
    command?: string
    args?: string[]
    env?: Record<string, string>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

// ============================================
// Constants
// ============================================

const PROJECT_ROOT = resolve(import.meta.dir, '..');
const AUTH_DIR = resolve(PROJECT_ROOT, '.auth');
const API_STATE_FILE = resolve(AUTH_DIR, 'api-state.json');
const MCP_CONFIG_FILE = resolve(PROJECT_ROOT, '.mcp.json');
const PREFIX = '[api-login]';

// ╔══════════════════════════════════════════════════════════════════╗
// ║  PROJECT-SPECIFIC AUTHENTICATION CONFIGURATION                  ║
// ║  Adapt this section to match YOUR project's auth mechanism.     ║
// ║  The boilerplate default uses POST /api/auth/login with         ║
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
 * Expected response format (UPEX Dojo default):
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

/** Auth endpoint path (appended to apiBaseUrl). */
const AUTH_ENDPOINT = '/auth/login';

/** Key used to find the OpenAPI MCP server in .mcp.json */
const MCP_SERVER_KEY = 'openapi';

// ╔══════════════════════════════════════════════════════════════════╗
// ║  END OF PROJECT-SPECIFIC CONFIGURATION                          ║
// ╚══════════════════════════════════════════════════════════════════╝

// ============================================
// Environment Configuration
// ============================================

const ENV_CONFIGS: Record<string, EnvConfig> = {
  local: {
    apiBaseUrl: 'http://localhost:3000/api',
    authEndpoint: AUTH_ENDPOINT,
    envVarPrefix: 'LOCAL',
    mcpServerKey: MCP_SERVER_KEY,
  },
  staging: {
    apiBaseUrl: 'https://dojo.upexgalaxy.com/api',
    authEndpoint: AUTH_ENDPOINT,
    envVarPrefix: 'STAGING',
    mcpServerKey: MCP_SERVER_KEY,
  },
};

// ============================================
// Logging (matches sync-openapi.ts style)
// ============================================

function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const icons = { info: '\u2139', success: '\u2713', warn: '\u26A0', error: '\u2717' };
  const colors = { info: '\x1B[36m', success: '\x1B[32m', warn: '\x1B[33m', error: '\x1B[31m' };
  console.log(`${colors[type]}${icons[type]}\x1B[0m ${PREFIX} ${msg}`);
}

// ============================================
// Credential Lookup
// ============================================

function getCredentials(envVarPrefix: string): { email: string, password: string } | null {
  const emailKey = `${envVarPrefix}_USER_EMAIL`;
  const passwordKey = `${envVarPrefix}_USER_PASSWORD`;

  const email = process.env[emailKey];
  const password = process.env[passwordKey];

  if (!email || !password) {
    log('Missing credentials in .env file:', 'error');
    if (!email) { log(`  - ${emailKey} is not set`, 'error'); }
    if (!password) { log(`  - ${passwordKey} is not set`, 'error'); }
    log('Set these in your .env file and try again.', 'info');
    return null;
  }

  return { email, password };
}

// ============================================
// Authentication
// ============================================

async function authenticate(envConfig: EnvConfig, credentials: { email: string, password: string }): Promise<ApiState | null> {
  const url = `${envConfig.apiBaseUrl}${envConfig.authEndpoint}`;
  log(`Authenticating against ${url}...`);

  try {
    const payload = buildAuthPayload(credentials.email, credentials.password);

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
  if (!existsSync(AUTH_DIR)) {
    mkdirSync(AUTH_DIR, { recursive: true });
  }

  writeFileSync(API_STATE_FILE, JSON.stringify(apiState, null, 2));
  log(`Token saved to ${API_STATE_FILE}`, 'success');
}

// ============================================
// Token Storage: .mcp.json (OpenAPI MCP)
// ============================================

function updateMcpConfig(token: string, mcpServerKey: string): void {
  if (!existsSync(MCP_CONFIG_FILE)) {
    log(`.mcp.json not found at ${MCP_CONFIG_FILE} — skipping MCP update.`, 'warn');
    return;
  }

  try {
    const raw = readFileSync(MCP_CONFIG_FILE, 'utf-8');
    const mcpConfig: McpConfig = JSON.parse(raw);

    if (!mcpConfig.mcpServers?.[mcpServerKey]) {
      log(`No "${mcpServerKey}" server found in .mcp.json — skipping MCP update.`, 'warn');
      log('Token is still saved for Playwright tests.', 'info');
      return;
    }

    const server = mcpConfig.mcpServers[mcpServerKey];

    if (!server.env) {
      server.env = {};
    }

    // Update or set the API_HEADERS env var with the new Bearer token
    const currentHeaders = server.env.API_HEADERS ?? '';
    const bearerPattern = /Authorization:\s*Bearer\s+\S+/;

    if (bearerPattern.test(currentHeaders)) {
      // Replace existing Bearer token
      server.env.API_HEADERS = currentHeaders.replace(
        bearerPattern,
        `Authorization:Bearer ${token}`,
      );
    }
    else {
      // Set new Authorization header
      const separator = currentHeaders ? ' | ' : '';
      server.env.API_HEADERS = `${currentHeaders}${separator}Authorization:Bearer ${token}`;
    }

    writeFileSync(MCP_CONFIG_FILE, `${JSON.stringify(mcpConfig, null, 2)}\n`);
    log(`MCP config updated: ${mcpServerKey} server API_HEADERS`, 'success');
  }
  catch (error) {
    log('Failed to update .mcp.json — token is still saved for tests.', 'warn');
    log(`  ${String(error)}`, 'warn');
  }
}

// ============================================
// Help
// ============================================

function showHelp(): void {
  console.log(`
\x1B[1mAPI Login\x1B[0m - Authenticate and store token for tests & MCP tools

\x1B[1mUSAGE\x1B[0m
  bun run api:login [environment]

\x1B[1mENVIRONMENTS\x1B[0m
  local       Authenticate against local dev server (default)
  staging     Authenticate against staging server

\x1B[1mEXAMPLES\x1B[0m
  bun run api:login                  # Uses TEST_ENV from .env
  bun run api:login local            # Force local environment
  bun run api:login staging          # Force staging environment

\x1B[1mTOKEN STORAGE\x1B[0m
  .auth/api-state.json    Used by Playwright test fixtures
  .mcp.json               Injected into OpenAPI MCP server (if configured)

\x1B[1mREQUIRED .env VARIABLES\x1B[0m
  For local:    LOCAL_USER_EMAIL, LOCAL_USER_PASSWORD
  For staging:  STAGING_USER_EMAIL, STAGING_USER_PASSWORD

\x1B[1mOPTIONS\x1B[0m
  -h, --help    Show this help
`);
}

// ============================================
// CLI Entry Point
// ============================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}

// Resolve environment: CLI arg > TEST_ENV from .env > default 'local'
const envArg = args[0];
const environment = envArg ?? process.env.TEST_ENV ?? 'local';

if (!ENV_CONFIGS[environment]) {
  log(`Unknown environment: "${environment}"`, 'error');
  log(`Available environments: ${Object.keys(ENV_CONFIGS).join(', ')}`, 'info');
  process.exit(1);
}

const envConfig = ENV_CONFIGS[environment];

console.log(`\n\x1B[1mAPI Login\x1B[0m — ${environment}\n`);

// 1. Get credentials
const credentials = getCredentials(envConfig.envVarPrefix);
if (!credentials) {
  process.exit(1);
}

log(`User: ${credentials.email}`);

// 2. Authenticate
const apiState = await authenticate(envConfig, credentials);
if (!apiState) {
  process.exit(1);
}

log('Authentication successful', 'success');
log(`Token type: ${apiState.tokenType}`);
log(`Expires in: ${apiState.expiresIn} seconds`);

// 3. Save token to api-state.json
saveApiState(apiState);

// 4. Update .mcp.json (best-effort)
updateMcpConfig(apiState.token, envConfig.mcpServerKey);

console.log('\n\x1B[32m\u2713 Login completed!\x1B[0m\n');
