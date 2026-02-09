/**
 * KATA Framework - Global Setup (Project)
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
import { env } from '@variables';

/**
 * Prepare test environment
 *
 * Creates required directories and validates environment configuration.
 */
setup('Global Setup: prepare environment', async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('KATA Framework - Global Setup');
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
 * Validates TMS credentials when AUTO_SYNC is enabled
 */
function validateTmsConfig(): void {
  const { TMS_PROVIDER = 'xray', AUTO_SYNC } = process.env;

  const requiredForTms: Record<string, string[]> = {
    xray: ['XRAY_CLIENT_ID', 'XRAY_CLIENT_SECRET'],
    jira: ['JIRA_API_TOKEN', 'JIRA_BASE_URL'],
  };

  if (AUTO_SYNC !== 'true') {
    return;
  }

  const requiredKeys = requiredForTms[TMS_PROVIDER];
  if (requiredKeys === undefined) {
    return;
  }

  const missing = requiredKeys.filter(
    key => process.env[key] === undefined || process.env[key] === '',
  );
  if (missing.length > 0) {
    console.warn(`[WARN] Missing TMS credentials for ${TMS_PROVIDER}: ${missing.join(', ')}`);
    console.warn('   TMS sync will be skipped during test execution.');
  }
}
