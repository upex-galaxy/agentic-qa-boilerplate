/**
 * KATA Architecture - Test Environment Variables Validator
 *
 * PROJECT-OWNED. Validates the SHAPE of the runtime configuration, never the
 * presence of a project credential:
 * - `TEST_ENV` names an environment this project declares (here)
 * - TMS credentials, only when `AUTO_SYNC=true` (synced core:
 *   `validateTmsEnvironment` in `config/variables.core.ts`)
 *
 * The test-user pair (`LOCAL_USER_*`, `STAGING_USER_*`) is deliberately NOT
 * checked here any more. Those variables are project-under-test examples the
 * framework has no right to require: a project with no login has none, and a
 * CI job that only compiles the framework (`build.yml`, a fork PR with no
 * secrets) must pass without them. Their point of use is `config.testUser` in
 * `config/variables.ts`, a getter that throws a named error the moment the
 * ui-setup / api-setup projects read it with the active pair empty. Adopters
 * that ported the credential half of this file into their own copy can delete
 * it: the getter is the replacement.
 *
 * Usage:
 *   - Importable: call validateTestEnvironment(vars) with pre-extracted env vars
 *   - Standalone: bun run config/validateTestEnv.ts  (bun run test:env:check)
 */

// The Atlassian host is resolved, not read from the environment: it lives in
// `.agents/project.yaml` -> `issue_tracker.atlassian_url`. Imported from the
// synced core rather than through `@variables` so this module keeps working
// standalone without pulling in the whole config graph.
import { resolvedAtlassianUrlForValidation, validateTmsEnvironment } from './variables.core';

/**
 * The environments this project declares. Keep in step with `Environment` and
 * `envDataMap` in `config/variables.ts` (the 4-way env-enum reconciliation in
 * `/adapt-framework`): this list is what `test:env:check` names in its error.
 */
export const VALID_TEST_ENVS = ['local', 'staging'] as const;

/** Variables needed for validation (subset of all env vars) */
export interface EnvVarsToValidate {
  TEST_ENV: string
  AUTO_SYNC: string
  TMS_PROVIDER?: string
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
 * Validates the test environment configuration.
 * Throws Error if validation fails (fail-fast).
 *
 * @param vars - Pre-extracted environment variables (avoids multiple process.env reads)
 */
export function validateTestEnvironment(vars: EnvVarsToValidate): void {
  const errors: string[] = [];

  // TEST_ENV must be one of the environments this project declares.
  if (!(VALID_TEST_ENVS as readonly string[]).includes(vars.TEST_ENV)) {
    errors.push(`Unknown TEST_ENV: ${vars.TEST_ENV}. Valid values: ${VALID_TEST_ENVS.join(', ')}`);
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
    XRAY_CLIENT_ID: process.env.XRAY_CLIENT_ID,
    XRAY_CLIENT_SECRET: process.env.XRAY_CLIENT_SECRET,
    // Resolved, not read: the host lives in .agents/project.yaml and only falls
    // back to the env var for a repo that has not been set up yet.
    ATLASSIAN_URL: resolvedAtlassianUrlForValidation(),
    ATLASSIAN_EMAIL: process.env.ATLASSIAN_EMAIL,
    ATLASSIAN_API_TOKEN: process.env.ATLASSIAN_API_TOKEN,
  };

  console.log('\nValidating test environment configuration...');
  console.log(`  TEST_ENV: ${vars.TEST_ENV}`);
  console.log(`  AUTO_SYNC: ${vars.AUTO_SYNC}`);
  console.log(`  TMS_PROVIDER: ${vars.TMS_PROVIDER}`);
  console.log('  Test-user credentials are not checked here: config.testUser fails by name at the point of use.');

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
