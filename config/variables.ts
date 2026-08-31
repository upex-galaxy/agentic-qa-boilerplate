/**
 * KATA Architecture - Environment Variables Configuration
 *
 * SINGLE SOURCE OF TRUTH for all environment variables.
 * This is the ONLY file that should read process.env.
 *
 * ONE VALUE IS NOT AN ENV VAR: the Atlassian site host. It is resolved from
 * `.agents/project.yaml` -> `issue_tracker.atlassian_url` via the canonical
 * resolver, with `ATLASSIAN_URL` kept only as a fallback. While the host lived
 * in `.env`, a stale copy inherited from the parent process shadowed the file in
 * silence (bun's autoload and dotenv-cli both skip an already-set var, and a
 * restart re-inherits it) and pointed Jira writes at a dead site. The host is
 * project identity, so it is anchored to a versioned file that shows up in a
 * diff. That matters here specifically: `config.tms.jira.url` drives the
 * Jira-Direct TMS provider, which WRITES test results back to issues.
 *
 * This file therefore stays the single place config is resolved from — it just
 * resolves from two sources now, not one.
 *
 * Bun automatically loads .env files - no dotenv dependency needed.
 * But the Playwright VSCode extension requires reading process.env as Node.js, so we use loadEnvFile()
 *
 * Usage:
 *   import { config, env } from '@variables';
 */

// Safe above loadEnvFile(): this module reads nothing at import time — both
// helpers touch the filesystem only when called. (ESM hoists imports anyway, so
// placing it lower would imply an ordering that does not exist.)
import { normalizeAtlassianUrl, readAtlassianUrlFromYaml } from '../cli/lib/atlassian-instance';

// Load .env file into process.env (Playwright VSCode extension needs it)
// In CI, env vars come from GitHub Secrets, so .env doesn't exist - hence try/catch
try {
  process.loadEnvFile();
}
catch {
  // .env file doesn't exist (expected in CI environments)
}
// ============================================
// Environment Type Definitions
// ============================================

export type Environment = 'local' | 'staging'; // Add more when needed (e.g., 'production')

// ============================================
// Destructure Environment Variables (Single Access)
// ============================================

const {
  // === Environment Detection ===
  TEST_ENV = 'local', // Used: env.current, selects URLs and credentials
  CI, // Used: env.isCI (global.setup, KataReporter)
  BUILD_ID, // Used: env.buildId (jiraSync)

  // === Test User Credentials (only current TEST_ENV required) ===
  LOCAL_USER_EMAIL, // Required if TEST_ENV=local
  LOCAL_USER_PASSWORD, // Required if TEST_ENV=local
  STAGING_USER_EMAIL, // Required if TEST_ENV=staging
  STAGING_USER_PASSWORD, // Required if TEST_ENV=staging

  // === TMS Configuration ===
  TMS_PROVIDER = 'xray', // Used: config.tms.provider (jiraSync) - 'xray' | 'jira'
  AUTO_SYNC = 'false', // Used: config.tms.autoSync (jiraSync, global.teardown)
  // Key of the STR — the Test Execution linked to the sprint's STP — that this
  // run writes results ONTO. NOT the STP's own key: an Xray Test Plan derives
  // its status from its Executions and is never written into. The item is
  // created by /regression-testing or /sprint-testing, already parented to the
  // "QA Test Artifacts" epic. Empty = the sync mints its own Execution, which
  // no API call can parent afterwards. Read only when TMS_PROVIDER=xray.
  // See tests/utils/jiraSync.ts.
  STP_EXECUTION_KEY = '', // Used: config.tms.stpExecutionKey (jiraSync)

  // === Xray Cloud (required only if TMS_PROVIDER=xray AND AUTO_SYNC=true) ===
  XRAY_CLIENT_ID = '', // Required if AUTO_SYNC=true (jiraSync)
  XRAY_CLIENT_SECRET = '', // Required if AUTO_SYNC=true (jiraSync)
  XRAY_PROJECT_KEY = '', // Used: config.tms.xray.projectKey (jiraSync)

  // === Atlassian credentials ===
  // Used by MCP, acli, xray-cli, scripts/sync-jira-*.ts, cli/doctor.ts and
  // the Jira-Direct TMS provider. Required only if TMS_PROVIDER=jira AND
  // AUTO_SYNC=true (or when using MCP / acli / scripts locally).
  //
  // The site HOST is NOT read here — see `atlassianUrl` below. Only the two
  // real secrets come from the environment.
  ATLASSIAN_EMAIL = '',
  ATLASSIAN_API_TOKEN = '',
  // === Jira-specific operational params (NOT credentials) ===
  // Optional override. Left empty on purpose: custom-field ids are per-instance
  // data and must not be hardcoded here (see the `acli` skill, anti-pattern T2).
  // When empty, it resolves at runtime from `.agents/jira-fields.json` -> the
  // `test_status` slug. Regenerate that catalog with `bun run jira:sync-fields --force`.
  JIRA_TEST_STATUS_FIELD = '', // Used: config.tms.jira.testStatusField

  // === Browser Configuration ===
  HEADLESS = 'true', // Used: config.browser.headless (playwright.config)
  DEFAULT_TIMEOUT = '30000', // Used: config.browser.defaultTimeout (playwright.config, ApiBase)

  // === Reporting Configuration ===
  ALLURE_RESULTS_DIR = './allure-results', // Used: config.reporting.allureResultsDir (playwright.config)
  SCREENSHOT_ON_FAILURE = 'true', // Used: config.reporting.screenshotOnFailure (playwright.config)
  VIDEO_ON_FAILURE = 'true', // Used: config.reporting.videoOnFailure (playwright.config, CI only)
} = process.env;

/**
 * The Atlassian site host, from `.agents/project.yaml` ->
 * `issue_tracker.atlassian_url`, falling back to `ATLASSIAN_URL`.
 *
 * The fallback is NOT the happy path — it exists so a project that has not yet
 * run `bun run agents:setup`, and any CI job still injecting the old secret,
 * keeps working instead of failing at test time. When both are set and disagree
 * the yaml wins, because the env value is the one that survives a site migration
 * inside an inherited process environment.
 *
 * `''` when neither is set. Callers already treat an empty host as "Jira not
 * configured" and surface a guiding error, so this never silently guesses.
 *
 * Read it from a shell with `bun run --silent jira:url`.
 */
const atlassianUrl: string
  = readAtlassianUrlFromYaml()
    ?? normalizeAtlassianUrl(process.env.ATLASSIAN_URL)
    ?? '';

// ============================================
// Environment Detection
// ============================================

export const env = {
  current: TEST_ENV as Environment,
  isLocal: TEST_ENV === 'local' || TEST_ENV === undefined,
  isStaging: TEST_ENV === 'staging',
  isCI: CI === 'true',
  buildId: BUILD_ID ?? 'local',
} as const;

// ============================================
// Test-User Credentials Mapping (variables from .env)
// After validation, current environment credentials are guaranteed to exist
// ============================================

const userCredentialsMap: Record<Environment, { email: string, password: string }> = {
  local: {
    email: LOCAL_USER_EMAIL ?? '',
    password: LOCAL_USER_PASSWORD ?? '',
  },
  staging: {
    email: STAGING_USER_EMAIL ?? '',
    password: STAGING_USER_PASSWORD ?? '',
  },
};

// ============================================
// ENV DATA Mapping (hardcoded - not secrets because these are not sensitive data like credentials)
// ============================================

const envDataMap: Record<
  Environment,
  { base: string, api: string, user: { email: string, password: string } }
> = {
  local: {
    base: 'http://localhost:3000',
    api: 'http://localhost:3000/api',
    user: userCredentialsMap.local,
  },
  staging: {
    base: 'https://dojo.upexgalaxy.com',
    api: 'https://dojo.upexgalaxy.com/api',
    user: userCredentialsMap.staging,
  },
};
const envData = envDataMap[env.current];

// ============================================
// Main Configuration Object
// ============================================

export const config = {
  // URLs - selected by TEST_ENV from urlMap
  baseUrl: envData.base,
  apiUrl: envData.api,

  // Authentication config (UPEX Dojo endpoints - relative to apiUrl)
  auth: {
    loginEndpoint: '/auth/login',
    tokenEndpoint: '/auth/login', // Endpoint to intercept for token (used by page.waitForResponse)
    meEndpoint: '/auth/me',
    tokenLifetimeSeconds: 86400, // 24 hours (1 day)
    // Storage paths for authenticated sessions
    storageStatePath: '.auth/user.json',
    apiStatePath: '.auth/api-state.json',
  },

  // Test User (configure in .env)
  testUser: envData.user,

  // TMS
  tms: {
    provider: TMS_PROVIDER as 'xray' | 'jira' | 'none',
    autoSync: AUTO_SYNC === 'true',
    stpExecutionKey: STP_EXECUTION_KEY,
    xray: {
      clientId: XRAY_CLIENT_ID,
      clientSecret: XRAY_CLIENT_SECRET,
      projectKey: XRAY_PROJECT_KEY,
    },
    jira: {
      url: atlassianUrl,
      user: ATLASSIAN_EMAIL,
      apiToken: ATLASSIAN_API_TOKEN,
      testStatusField: JIRA_TEST_STATUS_FIELD,
    },
  },

  // Browser
  browser: {
    headless: HEADLESS !== 'false',
    defaultTimeout: Number.parseInt(DEFAULT_TIMEOUT, 10),
  },

  // Reporting
  reporting: {
    allureResultsDir: ALLURE_RESULTS_DIR,
    screenshotOnFailure: SCREENSHOT_ON_FAILURE !== 'false',
    videoOnFailure: VIDEO_ON_FAILURE !== 'false',
  },
} as const;
