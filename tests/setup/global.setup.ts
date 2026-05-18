/**
 * KATA Architecture - Global Setup (Project)
 *
 * Runs FIRST before all other projects.
 * Prepares the test environment: creates directories, validates config.
 *
 * Dependencies: None (this is the root)
 * Dependents: ui-setup, api-setup
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test as setup } from '@playwright/test';
import { config, env } from '@variables';

/**
 * Prepare test environment
 *
 * Creates required directories and validates environment configuration.
 */
setup('Global Setup: prepare environment', async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('KATA Architecture - Global Setup');
  console.log('='.repeat(60));
  console.log(`Environment: ${env.current}`);
  console.log(`CI Mode: ${env.isCI ? 'Yes' : 'No'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Ensure required directories exist
  const directories = [
    'test-results',
    'test-results/screenshots',
    'playwright-report',
    'allure-results',
    'reports',
    '.auth',
  ];

  for (const dir of directories) {
    const fullPath = join(process.cwd(), dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`[CREATED] ${dir}`);
    }
  }

  // Validate TMS configuration if AUTO_SYNC is enabled
  validateTmsConfig();

  console.log('[OK] Global setup complete\n');
});

/**
 * Validates resolved TMS credentials when AUTO_SYNC is enabled.
 *
 * Reads values from `config.tms`, the single resolution point for Atlassian /
 * Xray credentials. Local runs emit a warning and continue; CI runs escalate
 * to a non-zero exit code so missing secrets fail the workflow loudly.
 */
function validateTmsConfig(): void {
  if (!config.tms.autoSync) {
    return;
  }

  const missing: string[] = [];

  if (config.tms.provider === 'xray') {
    if (!config.tms.xray.clientId) {
      missing.push('XRAY_CLIENT_ID');
    }
    if (!config.tms.xray.clientSecret) {
      missing.push('XRAY_CLIENT_SECRET');
    }
  }
  else if (config.tms.provider === 'jira') {
    if (!config.tms.jira.url) {
      missing.push('ATLASSIAN_URL');
    }
    if (!config.tms.jira.user) {
      missing.push('ATLASSIAN_EMAIL');
    }
    if (!config.tms.jira.apiToken) {
      missing.push('ATLASSIAN_API_TOKEN');
    }
  }
  else {
    return;
  }

  if (missing.length === 0) {
    return;
  }

  if (env.isCI) {
    console.error(
      '[ERROR] AUTO_SYNC=true in CI but TMS credentials missing for '
      + `${config.tms.provider}: ${missing.join(', ')}. `
      + 'Add the missing values as repository Secrets and reference them '
      + 'in the workflow env block.',
    );
    process.exitCode = 1;
    return;
  }

  console.warn(`[WARN] Missing TMS credentials for ${config.tms.provider}: ${missing.join(', ')}`);
  console.warn('   TMS sync will be skipped during test execution.');
}
