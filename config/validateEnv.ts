/**
 * KATA Architecture - Environment Variables Validator
 *
 * Validates required variables based on context:
 * - Credentials: Only for current TEST_ENV (local or staging)
 * - TMS: Only if AUTO_SYNC=true (validates Xray or Jira based on TMS_PROVIDER)
 *
 * Usage:
 *   - Called by variables.ts with pre-extracted env vars (single process.env read)
 *   - Standalone: bun run config/validateEnv.ts
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
  JIRA_URL?: string
  JIRA_USER?: string
  JIRA_API_TOKEN?: string
}

/**
 * Validates environment variables.
 * Throws Error if validation fails (fail-fast).
 *
 * @param vars - Pre-extracted environment variables (avoids multiple process.env reads)
 */
export function validateEnvironment(vars: EnvVarsToValidate): void {
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
      if (!vars.JIRA_URL) {
        errors.push('JIRA_URL is required when AUTO_SYNC=true and TMS_PROVIDER=jira');
      }
      if (!vars.JIRA_USER) {
        errors.push('JIRA_USER is required when AUTO_SYNC=true and TMS_PROVIDER=jira');
      }
      if (!vars.JIRA_API_TOKEN) {
        errors.push('JIRA_API_TOKEN is required when AUTO_SYNC=true and TMS_PROVIDER=jira');
      }
    }
    else {
      errors.push(`Unknown TMS_PROVIDER: ${provider}. Valid values: xray, jira`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

// Standalone execution: bun run config/validateEnv.ts
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
    JIRA_URL: process.env.JIRA_URL,
    JIRA_USER: process.env.JIRA_USER,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  };

  console.log('\nValidating environment variables...');
  console.log(`  TEST_ENV: ${vars.TEST_ENV}`);
  console.log(`  AUTO_SYNC: ${vars.AUTO_SYNC}`);
  console.log(`  TMS_PROVIDER: ${vars.TMS_PROVIDER}`);

  try {
    validateEnvironment(vars);
    console.log('\n✅ Environment validated successfully');
  }
  catch (error) {
    console.error('\n❌ Validation failed:');
    console.error((error as Error).message);
    process.exit(1);
  }
}
