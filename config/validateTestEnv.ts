/**
 * KATA Architecture - Test Environment Variables Validator
 *
 * PROJECT-OWNED, and deliberately so. Validation splits unevenly: the
 * credential half names `LOCAL_USER_EMAIL` / `STAGING_USER_PASSWORD` and the
 * environment names themselves, which are this project's vocabulary, while the
 * TMS half names providers and Atlassian keys, which are framework facts. Only
 * the second half moved into the synced core (`validateTmsEnvironment`);
 * pushing the first half up there would have put a project's own configuration
 * into a file that gets overwritten.
 *
 * Validates required runtime variables for the active test environment:
 * - Credentials: Only for current TEST_ENV (local or staging) — here
 * - TMS: Only if AUTO_SYNC=true (Xray or Jira per TMS_PROVIDER) — synced core
 *
 * Usage:
 *   - Importable: call validateTestEnvironment(vars) with pre-extracted env vars
 *   - Standalone: bun run config/validateTestEnv.ts
 */

// The Atlassian host is resolved, not read from the environment: it lives in
// `.agents/project.yaml` -> `issue_tracker.atlassian_url`. Imported from the
// synced core rather than through `@variables` so this module keeps working
// standalone without pulling in the whole config graph.
import { resolvedAtlassianUrlForValidation, validateTmsEnvironment } from './variables.core';

/** Variables needed for validation (subset of all env vars) */
export interface EnvVarsToValidate {
  TEST_ENV: string
  AUTO_SYNC: string
  TMS_PROVIDER?: string
  LOCAL_USER_EMAIL?: string
  LOCAL_USER_PASSWORD?: string
  STAGING_USER_EMAIL?: string
  STAGING_USER_PASSWORD?: string
  XRAY_CLIENT_ID?: string
  XRAY_CLIENT_SECRET?: string
  /**
   * The Atlassian site HOST. Despite the name, callers must NOT source this
   * from `process.env` — it is resolved from `.agents/project.yaml`. The field
   * keeps the historical name so the shape stays stable for existing callers.
   */
  ATLASSIAN_URL?: string
  ATLASSIAN_EMAIL?: string
  ATLASSIAN_API_TOKEN?: string
}

/**
 * Validates test environment variables.
 * Throws Error if validation fails (fail-fast).
 *
 * @param vars - Pre-extracted environment variables (avoids multiple process.env reads)
 */
export function validateTestEnvironment(vars: EnvVarsToValidate): void {
  const errors: string[] = [];

  // Validate credentials for CURRENT environment only
  if (vars.TEST_ENV === 'local') {
    if (!vars.LOCAL_USER_EMAIL) {
      errors.push('LOCAL_USER_EMAIL is required for TEST_ENV=local');
    }
    if (!vars.LOCAL_USER_PASSWORD) {
      errors.push('LOCAL_USER_PASSWORD is required for TEST_ENV=local');
    }
  }
  else if (vars.TEST_ENV === 'staging') {
    if (!vars.STAGING_USER_EMAIL) {
      errors.push('STAGING_USER_EMAIL is required for TEST_ENV=staging');
    }
    if (!vars.STAGING_USER_PASSWORD) {
      errors.push('STAGING_USER_PASSWORD is required for TEST_ENV=staging');
    }
  }
  else {
    errors.push(`Unknown TEST_ENV: ${vars.TEST_ENV}. Valid values: local, staging`);
  }

  // TMS config (only when AUTO_SYNC=true) — synced half.
  errors.push(...validateTmsEnvironment(vars));

  if (errors.length > 0) {
    throw new Error(`Test environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

// Standalone execution: bun run config/validateTestEnv.ts
if (import.meta.main) {
  // Only standalone mode reads process.env directly
  const vars: EnvVarsToValidate = {
    TEST_ENV: process.env.TEST_ENV || 'local',
    AUTO_SYNC: process.env.AUTO_SYNC || 'false',
    TMS_PROVIDER: process.env.TMS_PROVIDER || 'xray',
    LOCAL_USER_EMAIL: process.env.LOCAL_USER_EMAIL,
    LOCAL_USER_PASSWORD: process.env.LOCAL_USER_PASSWORD,
    STAGING_USER_EMAIL: process.env.STAGING_USER_EMAIL,
    STAGING_USER_PASSWORD: process.env.STAGING_USER_PASSWORD,
    XRAY_CLIENT_ID: process.env.XRAY_CLIENT_ID,
    XRAY_CLIENT_SECRET: process.env.XRAY_CLIENT_SECRET,
    // Resolved, not read: the host lives in .agents/project.yaml and only falls
    // back to the env var for a repo that has not been set up yet.
    ATLASSIAN_URL: resolvedAtlassianUrlForValidation(),
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
  };

  console.log('\nValidating test environment variables...');
  console.log(`  TEST_ENV: ${vars.TEST_ENV}`);
  console.log(`  AUTO_SYNC: ${vars.AUTO_SYNC}`);
  console.log(`  TMS_PROVIDER: ${vars.TMS_PROVIDER}`);

  try {
    validateTestEnvironment(vars);
    console.log('\n✅ Test environment validated successfully');
  }
  catch (error) {
    console.error('\n❌ Validation failed:');
    console.error((error as Error).message);
    process.exit(1);
  }
}
