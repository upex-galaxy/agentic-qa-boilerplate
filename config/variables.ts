/**
 * KATA Framework - Environment Variables Configuration
 *
 * SINGLE SOURCE OF TRUTH for all environment variables.
 * This is the ONLY file that should read process.env.
 *
 * Bun automatically loads .env files - no dotenv dependency needed.
 * But the Playwright VSCode extension requires reading process.env as Node.js, so we use loadEnvFile()
 *
 * Usage:
 *   import { config, env } from '@variables';
 */

import { validateEnvironment } from './validateEnv';

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

  // === Xray Cloud (required only if TMS_PROVIDER=xray AND AUTO_SYNC=true) ===
  XRAY_CLIENT_ID = '', // Required if AUTO_SYNC=true (jiraSync)
  XRAY_CLIENT_SECRET = '', // Required if AUTO_SYNC=true (jiraSync)
  XRAY_PROJECT_KEY = '', // Used: config.tms.xray.projectKey (jiraSync)

  // === Jira Direct (required only if TMS_PROVIDER=jira AND AUTO_SYNC=true) ===
  JIRA_URL = '', // Required if TMS_PROVIDER=jira (jiraSync)
  JIRA_USER = '', // Required if TMS_PROVIDER=jira (jiraSync)
  JIRA_API_TOKEN = '', // Required if TMS_PROVIDER=jira (jiraSync)
  JIRA_TEST_STATUS_FIELD = 'customfield_10100', // Used: config.tms.jira.testStatusField

  // === Browser Configuration ===
  HEADLESS = 'true', // Used: config.browser.headless (playwright.config)
  DEFAULT_TIMEOUT = '30000', // Used: config.browser.defaultTimeout (playwright.config, ApiBase)

  // === Reporting Configuration ===
  ALLURE_RESULTS_DIR = './allure-results', // Used: config.reporting.allureResultsDir (playwright.config)
  SCREENSHOT_ON_FAILURE = 'true', // Used: config.reporting.screenshotOnFailure (playwright.config)
  VIDEO_ON_FAILURE = 'true', // Used: config.reporting.videoOnFailure (playwright.config, CI only)
} = process.env;

// ============================================
// Environment Validation (Fail Fast)
// ============================================
// Pass pre-extracted vars to avoid multiple process.env reads

validateEnvironment({
  TEST_ENV,
  AUTO_SYNC,
  TMS_PROVIDER,
  LOCAL_USER_EMAIL,
  LOCAL_USER_PASSWORD,
  STAGING_USER_EMAIL,
  STAGING_USER_PASSWORD,
  XRAY_CLIENT_ID,
  XRAY_CLIENT_SECRET,
  JIRA_URL,
  JIRA_USER,
  JIRA_API_TOKEN,
});

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
    xray: {
      clientId: XRAY_CLIENT_ID,
      clientSecret: XRAY_CLIENT_SECRET,
      projectKey: XRAY_PROJECT_KEY,
    },
    jira: {
      url: JIRA_URL,
      user: JIRA_USER,
      apiToken: JIRA_API_TOKEN,
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
