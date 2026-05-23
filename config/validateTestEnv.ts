/**
 * KATA Architecture - Test Environment Variables Validator
 *
 * Validates required runtime variables for the active test environment:
 * - Credentials: Only for current TEST_ENV (local or staging)
 * - TMS: Only if AUTO_SYNC=true (validates Xray or Jira based on TMS_PROVIDER)
 *
 * Usage:
 *   - Importable: call validateTestEnvironment(vars) with pre-extracted env vars
 *   - Standalone: bun run config/validateTestEnv.ts
 */

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

  // Validate TMS config only if AUTO_SYNC=true
  if (vars.AUTO_SYNC === 'true') {
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
        errors.push('ATLASSIAN_URL is required when AUTO_SYNC=true and TMS_PROVIDER=jira');
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
  }

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
    ATLASSIAN_URL: process.env.ATLASSIAN_URL,
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
