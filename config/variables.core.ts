/**
 * KATA Architecture — SYNCED CORE of the variables module.
 *
 * `bun run up` OVERWRITES this file. The project's own half is
 * `config/variables.ts`, which imports from here and is never overwritten.
 *
 * WHY THE SPLIT EXISTS. `config/variables.ts` is on the updater's protected
 * watchlist because every project adapts its environments, its URLs and its
 * credential map — correctly so. But the same file also resolved the Atlassian
 * host used by `config.tms.jira.url`, which the Jira-Direct TMS provider writes
 * test results back onto. An adapted copy therefore stopped receiving resolver
 * fixes in the one failure class AGENTS.md §7 singles out: a stale host does
 * not raise an error, it writes to the wrong site in silence.
 *
 * WHAT LIVES HERE. Everything with no project knowledge in it: the `.env`
 * bootstrap, the instance-resolver wiring, generic environment detection, and
 * the TMS / browser / reporting blocks, which are read by synced code
 * (`tests/utils/jiraSync.ts`, `playwright.config.ts`, `ApiBase`) and describe
 * the framework rather than the product under test.
 *
 * WHAT DOES NOT. The environment names, the URL map, the credential map and
 * the auth endpoints. Those are the project's, and moving them into a file
 * that gets overwritten would be strictly worse than not splitting at all.
 */

import { normalizeAtlassianUrl, readAtlassianUrlFromYaml } from '../cli/lib/atlassian-instance';

// Load .env file into process.env (Playwright VSCode extension needs it).
// In CI, env vars come from GitHub Secrets, so .env doesn't exist — hence the
// try/catch. Runs at import time, exactly as it did before the split, so the
// project half sees a populated `process.env` however it is loaded.
try {
  process.loadEnvFile();
}
catch {
  // .env file doesn't exist (expected in CI environments)
}

const {
  // === Environment Detection ===
  TEST_ENV = 'local', // Used: env.current, selects URLs and credentials
  CI, // Used: env.isCI (global.setup, KataReporter)
  BUILD_ID, // Used: env.buildId (jiraSync)

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
 * THE REASON THIS FILE IS SYNCED. The fallback is NOT the happy path — it
 * exists so a project that has not yet run `bun run agents:setup`, and any CI
 * job still injecting the old secret, keeps working instead of failing at test
 * time. When both are set and disagree the yaml wins, because the env value is
 * the one that survives a site migration inside an inherited process
 * environment.
 *
 * `''` when neither is set. Callers already treat an empty host as "Jira not
 * configured" and surface a guiding error, so this never silently guesses.
 *
 * Read it from a shell with `bun run --silent jira:url`.
 */
export const atlassianUrl: string
  = readAtlassianUrlFromYaml()
    ?? normalizeAtlassianUrl(process.env.ATLASSIAN_URL)
    ?? '';

/**
 * Environment detection that carries no project knowledge.
 *
 * `current` is the raw `TEST_ENV` string: which names are legal is the
 * project's call, so the project half narrows it to its own `Environment`
 * union and adds the per-environment booleans.
 */
export const CORE_ENV = {
  current: TEST_ENV,
  isCI: CI === 'true',
  buildId: BUILD_ID ?? 'local',
} as const;

/** Read by `tests/utils/jiraSync.ts` and `global.teardown` — both synced. */
export const TMS_CONFIG = {
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
} as const;

/** Read by `playwright.config.ts` and `ApiBase` — both synced. */
export const BROWSER_CONFIG = {
  headless: HEADLESS !== 'false',
  defaultTimeout: Number.parseInt(DEFAULT_TIMEOUT, 10),
} as const;

/** Read by `playwright.config.ts` and the Allure reporter — both synced. */
export const REPORTING_CONFIG = {
  allureResultsDir: ALLURE_RESULTS_DIR,
  screenshotOnFailure: SCREENSHOT_ON_FAILURE !== 'false',
  videoOnFailure: VIDEO_ON_FAILURE !== 'false',
} as const;

/**
 * The TMS half of environment validation: which credentials a provider needs
 * once `AUTO_SYNC=true`. Provider names, variable names and the Atlassian-host
 * guidance are all framework facts, so they belong with the resolver.
 *
 * The credential half is NOT here. It names `LOCAL_USER_EMAIL` /
 * `STAGING_USER_PASSWORD` and the environment names themselves, which are the
 * project's own vocabulary — see `config/validateTestEnv.ts`.
 *
 * Returns messages rather than throwing so the project half can present its
 * own errors in the same list.
 */
export function validateTmsEnvironment(vars: {
  AUTO_SYNC: string
  TMS_PROVIDER?: string
  XRAY_CLIENT_ID?: string
  XRAY_CLIENT_SECRET?: string
  ATLASSIAN_URL?: string
  ATLASSIAN_EMAIL?: string
  ATLASSIAN_API_TOKEN?: string
}): string[] {
  if (vars.AUTO_SYNC !== 'true') { return []; }

  const errors: string[] = [];
  const provider = vars.TMS_PROVIDER || 'xray';

  if (provider === 'xray') {
    if (!vars.XRAY_CLIENT_ID) {
      errors.push('XRAY_CLIENT_ID is required when AUTO_SYNC=true and TMS_PROVIDER=xray');
    }
    if (!vars.XRAY_CLIENT_SECRET) {
      errors.push('XRAY_CLIENT_SECRET is required when AUTO_SYNC=true and TMS_PROVIDER=xray');
    }
  }
  else if (provider === 'jira') {
    if (!vars.ATLASSIAN_URL) {
      errors.push(
        'The Atlassian host is required when AUTO_SYNC=true and TMS_PROVIDER=jira. '
        + 'It is NOT an env var: set `issue_tracker.atlassian_url` in .agents/project.yaml '
        + '(`bun run agents:setup`), then check it with `bun run --silent jira:url`.',
      );
    }
    if (!vars.ATLASSIAN_EMAIL) {
      errors.push('ATLASSIAN_EMAIL is required when AUTO_SYNC=true and TMS_PROVIDER=jira');
    }
    if (!vars.ATLASSIAN_API_TOKEN) {
      errors.push('ATLASSIAN_API_TOKEN is required when AUTO_SYNC=true and TMS_PROVIDER=jira');
    }
  }
  else {
    errors.push(`Unknown TMS_PROVIDER: ${provider}. Valid values: xray, jira`);
  }

  return errors;
}

/**
 * The Atlassian host as validation wants it: resolved from the yaml, never
 * read from `process.env` directly. Kept here so both the standalone validator
 * and any caller assembling its own `vars` object go through one resolver.
 */
export function resolvedAtlassianUrlForValidation(): string | undefined {
  return readAtlassianUrlFromYaml()
    ?? normalizeAtlassianUrl(process.env.ATLASSIAN_URL)
    ?? undefined;
}
