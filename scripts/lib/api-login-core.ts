/**
 * API Login CORE - the synced half of `bun run api:login`.
 *
 * Everything in this file is GENERIC: CLI parsing, environment selection,
 * `--role` / `--profile`, token storage, freshness metadata and `--help`.
 * It is a normally SYNCED file, so improvements made upstream reach every
 * consumer project through `bun run up`.
 *
 * Everything PROJECT-SPECIFIC (how the auth request is shaped, how the token
 * is read back out of the response, which environments exist) lives in
 * `scripts/api-login.project.ts` - the adapter, shipped once and then owned by
 * the project. `scripts/api-login.ts` is the 10-line entry that wires the two
 * together. Adapt the adapter, never this file.
 *
 * Token storage (unchanged by the split):
 *   1. Playwright tests     -> `.auth/api-state.json`
 *   2. Agentic API testing  -> `.auth/tokens.env`  (sourceable: `export API_TOKEN_<ROLE>_<ENV>='...'`)
 *                           -> `.auth/tokens.json` (metadata: expiresIn, createdAt - for freshness checks)
 * With `--profile <name>` the two agentic files move under
 * `.auth/profiles/<name>/` so several token sets (one per orchestration
 * worker, session or credential) coexist without overwriting the default one.
 * `.auth/api-state.json` is never profiled.
 *
 * The token is NOT written to .env and NOT injected into any MCP. The OpenAPI
 * MCP is schema-READ-ONLY; authenticated requests run via curl:
 *   source .auth/tokens.env && \
 *   curl -H "Authorization: Bearer $API_TOKEN_<ROLE>_<ENV>" "$API_BASE_URL/<path>"
 * Because no credential enters any MCP, NO agent/terminal restart is needed
 * after login (the MCP-spawn env cache no longer governs API auth).
 */

import type { ApiState } from '@data/types';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// ============================================
// Public contract: the project adapter
// ============================================

/** The token fields the core stores, whatever shape the API returned them in. */
export interface ExtractedToken {
  accessToken: string
  tokenType: string
  expiresIn: number
  refreshToken: string | null
}

/** What the core resolved from the command line, handed to every adapter hook. */
export interface ApiLoginContext {
  /** The active environment (`env.current` from config/variables.ts). */
  env: string
  /** `--role` (lowercased); default `user`. */
  role: string
  /** `--profile`, or null for the default `.auth/` paths. */
  profile: string | null
  /** Values of the adapter's own `extraFlags`, keyed by flag name (`--method`). */
  flags: Readonly<Record<string, string>>
}

/**
 * The project-specific half. `scripts/api-login.project.ts` exports these as
 * named exports and the entry point passes its module namespace here, so the
 * two required hooks are type-checked at the call site.
 */
export interface ApiLoginAdapter {
  /** Request body for the auth endpoint (e.g. `{ username, password }`, OAuth2 fields). */
  buildAuthPayload: (email: string, password: string, context: ApiLoginContext) => Record<string, unknown>
  /** Pull the token fields out of the auth response body. */
  extractTokenFromResponse: (body: Record<string, unknown>, context: ApiLoginContext) => ExtractedToken
  /** Overrides `config.auth.loginEndpoint` (relative to `config.apiUrl`). */
  loginEndpoint?: string
  /** Extra request headers (merged over `Accept` + `Content-Type`). */
  headers?: Record<string, string>
  /**
   * Environments this project accepts as the positional argument. Must match
   * the `Environment` union in `config/variables.ts`. Declared here and not in
   * the core because the core is synced and the environment map is not.
   */
  environments?: readonly string[]
  /**
   * Project-specific value-taking flags (e.g. `['--method']`). Declaring them
   * keeps their VALUE from being mistaken for the positional environment, and
   * their values arrive in `context.flags`.
   */
  extraFlags?: readonly string[]
}

/** Test/embedding seams. Every field defaults to the production behaviour. */
export interface ApiLoginRuntime {
  /** Defaults to `process.argv.slice(2)`. */
  argv?: readonly string[]
  /** Defaults to `<repo>/.auth`. */
  authDir?: string
  /** Defaults to `config.auth.apiStatePath`. */
  apiStatePath?: string
  /** Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Defaults to `console.log`. */
  log?: (line: string) => void
}

const DEFAULT_ENVIRONMENTS = ['local', 'staging'] as const;
const DEFAULT_ROLE = 'user';

// ============================================
// CLI parsing
// ============================================

export interface ParsedApiLoginArgs {
  help: boolean
  /** null = no positional given; the config default (TEST_ENV) applies. */
  environment: string | null
  role: string
  profile: string | null
  flags: Record<string, string>
  /** null = the command line is valid. */
  error: string | null
}

/**
 * Single left-to-right pass: every known flag consumes its own value, so a
 * flag value can NEVER be read as the positional environment. A naive
 * positional scan that looks at the first token not starting with `-` would
 * misread a flag's value (e.g. `--profile W1`) as the environment; this
 * parser strips each flag and its value before ever inspecting the
 * positional slot, so that class of bug cannot occur here. Both
 * `--flag value` and `--flag=value` are accepted, in any order relative to
 * the environment. An unrecognized flag is an ERROR instead of a silent
 * environment guess.
 */
export function parseApiLoginArgs(
  argv: readonly string[],
  options: { environments?: readonly string[], extraFlags?: readonly string[] } = {},
): ParsedApiLoginArgs {
  const environments = options.environments ?? DEFAULT_ENVIRONMENTS;
  const extraFlags = options.extraFlags ?? [];
  const parsed: ParsedApiLoginArgs = {
    help: false,
    environment: null,
    role: DEFAULT_ROLE,
    profile: null,
    flags: {},
    error: null,
  };

  // Help wins wherever it appears, even next to an invalid argument: someone
  // who mistyped a flag is exactly who needs the help screen.
  if (argv.includes('--help') || argv.includes('-h')) {
    parsed.help = true;
    return parsed;
  }

  const valueFlags = new Set<string>(['--role', '-r', '--profile', ...extraFlags]);

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? '';

    // `--flag=value` is split here so the branch below only deals with names.
    let name = token;
    let inlineValue: string | null = null;
    if (token.startsWith('-')) {
      const eq = token.indexOf('=');
      if (eq > 0) {
        name = token.slice(0, eq);
        inlineValue = token.slice(eq + 1);
      }
    }

    if (valueFlags.has(name)) {
      const value = inlineValue ?? argv[i + 1] ?? '';
      if (inlineValue === null) { i++; }
      if (!value || (inlineValue === null && value.startsWith('-'))) {
        parsed.error = `${name} requires a value (e.g. ${name} ${name === '--profile' ? 'W1' : 'admin'})`;
        return parsed;
      }
      if (name === '--role' || name === '-r') {
        parsed.role = value.toLowerCase();
      }
      else if (name === '--profile') {
        if (!/^[\w.-]+$/.test(value) || value === '.' || value === '..') {
          parsed.error = `--profile must be a single path segment (letters, digits, . _ -): got "${value}"`;
          return parsed;
        }
        parsed.profile = value;
      }
      else {
        parsed.flags[name] = value;
      }
      continue;
    }

    if (token.startsWith('-')) {
      parsed.error = `Unknown option: "${token}". Run with --help for the supported options.`;
      return parsed;
    }

    if (parsed.environment === null) {
      if (!environments.includes(token)) {
        parsed.error = `Unknown environment: "${token}". Available environments: ${environments.join(', ')}`;
        return parsed;
      }
      parsed.environment = token;
      continue;
    }

    parsed.error = `Unexpected argument: "${token}" (the environment is already "${parsed.environment}")`;
    return parsed;
  }

  return parsed;
}

// ============================================
// Token storage helpers (pure, so they are unit-testable)
// ============================================

/** Shell-escape a value for safe single-quote wrapping in tokens.env. */
export function shellSingleQuote(value: string): string {
  return value.replace(/'/g, '\'\\\'\'');
}

/**
 * Upsert one `export <VAR>='<token>'` line in a tokens.env body. Other
 * roles/envs already in the file are preserved.
 */
export function upsertTokenEnvLine(existingContent: string, varName: string, token: string): string {
  const line = `export ${varName}='${shellSingleQuote(token)}'`;
  const existing = existingContent.split('\n').filter(l => l.trim().length > 0);
  const pattern = new RegExp(`^export ${varName}=`);

  let replaced = false;
  const updated = existing.map((l) => {
    if (pattern.test(l)) {
      replaced = true;
      return line;
    }
    return l;
  });
  if (!replaced) { updated.push(line); }

  return `${updated.join('\n')}\n`;
}

/** Upsert one entry in a tokens.json body keyed by `<ROLE>_<ENV>` (others preserved). */
export function upsertTokenMeta(existingContent: string, key: string, entry: Record<string, unknown>): string {
  let data: Record<string, unknown> = {};
  if (existingContent.trim().length > 0) {
    try {
      data = JSON.parse(existingContent) as Record<string, unknown>;
    }
    catch {
      data = {};
    }
  }
  data[key] = entry;
  return `${JSON.stringify(data, null, 2)}\n`;
}

// ============================================
// Help
// ============================================

/** The `--help` screen. Environments and required .env vars follow the adapter. */
export function renderHelp(adapter: Pick<ApiLoginAdapter, 'environments' | 'extraFlags'> = {}): string {
  const environments = adapter.environments ?? DEFAULT_ENVIRONMENTS;
  const extraFlags = adapter.extraFlags ?? [];
  const credentials = environments
    .map(e => `  For ${e}:${' '.repeat(Math.max(1, 12 - e.length))}${e.toUpperCase()}_USER_EMAIL, ${e.toUpperCase()}_USER_PASSWORD`)
    .join('\n');
  const extra = extraFlags.length > 0
    ? `\n  ${extraFlags.join(', ')}${' '.repeat(2)}Project-specific (scripts/api-login.project.ts)`
    : '';

  return `
\x1B[1mAPI Login\x1B[0m - Authenticate and store a token for tests & agentic API testing

\x1B[1mUSAGE\x1B[0m
  bun run api:login [environment] [--role <role>] [--profile <name>]

\x1B[1mENVIRONMENTS\x1B[0m
  ${environments.join(', ')}
  Declared by scripts/api-login.project.ts (environments) and config/variables.ts.
  Omitted -> TEST_ENV from .env (default: local).

\x1B[1mEXAMPLES\x1B[0m
  bun run api:login                       # Uses TEST_ENV from .env, role=user
  bun run api:login ${environments[0] ?? 'local'}                 # Force an environment
  bun run api:login ${environments[1] ?? 'local'} --role admin  # Named role -> var API_TOKEN_ADMIN_${(environments[1] ?? 'local').toUpperCase()}
  bun run api:login ${environments[1] ?? 'local'} --profile W1  # Isolated token set -> .auth/profiles/W1/
  bun run api:login --profile W1          # Flags may come before the environment

\x1B[1mTOKEN STORAGE\x1B[0m
  .auth/api-state.json    Used by Playwright test fixtures (unchanged; never profiled).
  .auth/tokens.env        Sourceable: export API_TOKEN_<ROLE>_<ENV>='<token>'.
                          One line per role+env (upserted; others preserved).
  .auth/tokens.json       Metadata (expiresIn, createdAt) keyed by <ROLE>_<ENV>
                          for token-freshness checks.
  --profile <name>        Writes tokens.env / tokens.json under
                          .auth/profiles/<name>/ instead of .auth/ directly -
                          an isolated token set (e.g. per orchestration worker)
                          that never overwrites the default one.
  NOTE: the token is NOT written to .env and NOT injected into any MCP. The
  OpenAPI MCP is schema-read-only; run authenticated requests via curl:
    source .auth/tokens.env && \\
    curl -H "Authorization: Bearer \$API_TOKEN_<ROLE>_<ENV>" "\$API_BASE_URL/<path>"
  No agent/terminal restart is needed after login.

\x1B[1mREQUIRED .env VARIABLES\x1B[0m
${credentials}

\x1B[1mCONFIGURATION\x1B[0m
  Environment URLs:   config/variables.ts (envDataMap)
  Auth format:        scripts/api-login.project.ts (project adapter)
  CLI behaviour:      scripts/lib/api-login-core.ts (synced; do not adapt)

\x1B[1mOPTIONS\x1B[0m
  -r, --role <role>     Role label for the token var (default: ${DEFAULT_ROLE})
  --profile <name>      Isolated token set under .auth/profiles/<name>/ (default: none)
  -h, --help            Show this help${extra}
`;
}

// ============================================
// Runner
// ============================================

const PREFIX = '[api-login]';
const ICONS = { info: 'ℹ', success: '✓', warn: '⚠', error: '✗' } as const;
const COLORS = { info: '\x1B[36m', success: '\x1B[32m', warn: '\x1B[33m', error: '\x1B[31m' } as const;

/**
 * Runs the whole CLI and RETURNS the exit code (it never calls
 * `process.exit`, so tests can drive it in-process). `scripts/api-login.ts`
 * turns the code into the process status.
 */
export async function runApiLogin(adapter: ApiLoginAdapter, runtime: ApiLoginRuntime = {}): Promise<number> {
  const out = runtime.log ?? ((line: string) => console.log(line));
  const log = (msg: string, type: keyof typeof ICONS = 'info') => {
    out(`${COLORS[type]}${ICONS[type]}\x1B[0m ${PREFIX} ${msg}`);
  };

  const argv = runtime.argv ?? process.argv.slice(2);
  const parsed = parseApiLoginArgs(argv, {
    environments: adapter.environments,
    extraFlags: adapter.extraFlags,
  });

  if (parsed.help) {
    out(renderHelp(adapter));
    return 0;
  }

  if (parsed.error) {
    log(parsed.error, 'error');
    return 1;
  }

  // TEST_ENV must be set BEFORE config/variables.ts is evaluated: it reads the
  // variable at module-evaluation time. Hence the dynamic import below.
  if (parsed.environment) {
    process.env.TEST_ENV = parsed.environment;
  }

  const { config, env } = await import('@variables');

  const projectRoot = resolve(import.meta.dir, '..', '..');
  const authDir = runtime.authDir ?? resolve(projectRoot, '.auth');
  const tokensDir = parsed.profile ? resolve(authDir, 'profiles', parsed.profile) : authDir;
  const tokensEnvFile = resolve(tokensDir, 'tokens.env');
  const tokensJsonFile = resolve(tokensDir, 'tokens.json');
  const apiStatePath = runtime.apiStatePath ?? config.auth.apiStatePath;
  const relativeTokensEnv = `.auth/${parsed.profile ? `profiles/${parsed.profile}/` : ''}tokens.env`;
  const relativeTokensJson = `.auth/${parsed.profile ? `profiles/${parsed.profile}/` : ''}tokens.json`;

  const context: ApiLoginContext = {
    env: env.current,
    role: parsed.role,
    profile: parsed.profile,
    flags: parsed.flags,
  };

  const envUpper = env.current.toUpperCase();
  const roleUpper = parsed.role.toUpperCase();
  const tokenVar = `API_TOKEN_${roleUpper}_${envUpper}`;
  const tokenKey = `${roleUpper}_${envUpper}`;

  out(`\n\x1B[1mAPI Login\x1B[0m — ${env.current} — role: ${parsed.role}${parsed.profile ? ` — profile: ${parsed.profile}` : ''}\n`);
  log(`User: ${config.testUser.email}`);

  // 1. Authenticate
  const url = `${config.apiUrl}${adapter.loginEndpoint ?? config.auth.loginEndpoint}`;
  const { email, password } = config.testUser;

  if (!email || !password) {
    log('Missing credentials in .env file:', 'error');
    if (!email) { log(`  - ${envUpper}_USER_EMAIL is not set`, 'error'); }
    if (!password) { log(`  - ${envUpper}_USER_PASSWORD is not set`, 'error'); }
    log('Set these in your .env file and try again.', 'info');
    return 1;
  }

  log(`Authenticating against ${url}...`);

  const doFetch = runtime.fetchImpl ?? fetch;
  let apiState: ApiState;

  try {
    const payload = adapter.buildAuthPayload(email, password, context);

    const response = await doFetch(url, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        ...adapter.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      log(`Authentication failed with status ${response.status}`, 'error');
      log(`Response: ${body}`, 'error');
      return 1;
    }

    const responseBody = (await response.json()) as Record<string, unknown>;
    const tokenData = adapter.extractTokenFromResponse(responseBody, context);

    if (!tokenData.accessToken) {
      log('Authentication response did not contain an access token.', 'error');
      log(`Response keys: ${Object.keys(responseBody).join(', ')}`, 'error');
      return 1;
    }

    apiState = {
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
    return 1;
  }

  log('Authentication successful', 'success');
  log(`Token type: ${apiState.tokenType}`);
  log(`Expires in: ${apiState.expiresIn} seconds`);

  // 2. Save the Playwright state (unchanged - consumed by the API fixture).
  const apiStateDir = dirname(apiStatePath);
  if (!existsSync(apiStateDir)) {
    mkdirSync(apiStateDir, { recursive: true });
  }
  writeFileSync(apiStatePath, JSON.stringify(apiState, null, 2));
  log(`Token saved to ${apiStatePath}`, 'success');

  // 3. Save the sourceable token + metadata for curl-based agentic API testing.
  //    The agent runs `source <tokens.env> && curl -H "Authorization: Bearer
  //    $API_TOKEN_..."` in a SINGLE shell call: env vars do NOT persist across
  //    an agent's separate Bash calls, so the file on disk is the source of
  //    truth and is re-sourced per call.
  if (!existsSync(tokensDir)) {
    mkdirSync(tokensDir, { recursive: true });
  }

  const envBody = existsSync(tokensEnvFile) ? readFileSync(tokensEnvFile, 'utf-8') : '';
  writeFileSync(tokensEnvFile, upsertTokenEnvLine(envBody, tokenVar, apiState.token));
  log(`Token saved to ${relativeTokensEnv} (${tokenVar})`, 'success');

  const jsonBody = existsSync(tokensJsonFile) ? readFileSync(tokensJsonFile, 'utf-8') : '';
  writeFileSync(tokensJsonFile, upsertTokenMeta(jsonBody, tokenKey, {
    token: apiState.token,
    tokenType: apiState.tokenType,
    expiresIn: apiState.expiresIn,
    refreshToken: apiState.refreshToken,
    createdAt: apiState.createdAt,
    role: parsed.role,
    env: env.current,
    var: tokenVar,
    profile: parsed.profile,
  }));
  log(`Token metadata saved to ${relativeTokensJson} (${tokenKey})`, 'success');

  out('\n\x1B[32m✓ Login completed!\x1B[0m');
  out('\n\x1B[36mNext\x1B[0m — execute authenticated requests with curl (no restart needed):');
  out(`   source ${relativeTokensEnv} && \\`);
  out(`   curl -s -H "Authorization: Bearer $${tokenVar}" "$API_BASE_URL/<path>"\n`);

  return 0;
}
