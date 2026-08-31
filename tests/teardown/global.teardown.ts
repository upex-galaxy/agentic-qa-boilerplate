/**
 * KATA Architecture - Global Teardown (Project)
 *
 * Runs LAST after all test projects complete.
 * Generates reports, syncs to TMS, cleans up resources.
 *
 * Dependencies: e2e, integration (runs after all tests)
 * Dependents: None (this is the final step)
 */

import { existsSync, readFileSync } from 'node:fs';

import { test as teardown } from '@playwright/test';
import { ATC_PARTIAL_PATH } from '@utils/decorators';
import { syncResults } from '@utils/jiraSync';
import { config } from '@variables';

/**
 * Global Teardown: generate reports and sync TMS
 *
 * Generates ATC execution report and syncs results to TMS if enabled.
 */
teardown('Global Teardown: generate reports and sync TMS', async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('KATA Architecture - Global Teardown');
  console.log('='.repeat(60));

  // Read NDJSON directly (KataReporter.onEnd() hasn't fired yet)
  if (existsSync(ATC_PARTIAL_PATH)) {
    try {
      const lines = readFileSync(ATC_PARTIAL_PATH, 'utf-8').split('\n').filter(Boolean);
      const grouped: Record<string, { hasFail: boolean, allSkip: boolean, count: number }> = {};

      for (const line of lines) {
        const entry = JSON.parse(line) as { testId: string, status: string };
        if (!grouped[entry.testId]) {
          grouped[entry.testId] = { hasFail: false, allSkip: true, count: 0 };
        }
        grouped[entry.testId].count++;
        if (entry.status === 'FAIL') {
          grouped[entry.testId].hasFail = true;
        }
        if (entry.status !== 'SKIP') {
          grouped[entry.testId].allSkip = false;
        }
      }

      let passed = 0;
      let failed = 0;
      let skipped = 0;
      let executions = 0;

      for (const g of Object.values(grouped)) {
        executions += g.count;
        if (g.hasFail) {
          failed++;
        }
        else if (g.allSkip) {
          skipped++;
        }
        else {
          passed++;
        }
      }

      const total = Object.keys(grouped).length;

      console.log('\nATC Coverage:');
      console.log(`   ${total} unique ATC tracked (${executions} total executions)`);
      console.log(`   ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⏭️ Skipped: ${skipped}`);
    }
    catch (error) {
      console.warn('[WARN] Could not read ATC partial results:', error);
    }
  }
  else {
    console.log('\n[INFO] No ATC results found (no @atc decorators executed)');
  }

  // Sync results to TMS.
  // Read through `config`, not process.env: config/variables.ts is the single
  // place this repo resolves environment variables from.
  if (config.tms.autoSync) {
    console.log('\n[SYNC] Syncing results to TMS...');
    try {
      const result = await syncResults();
      if (result) {
        console.log(`   Provider: ${result.provider}`);
        console.log(`   Status: ${result.success ? 'Success' : 'Failed'}`);
        console.log(`   Message: ${result.message}`);
      }
    }
    catch (error) {
      console.error('[ERROR] TMS sync failed:', error);
    }
  }
  else {
    // Say it out loud. A silent no-op here is why nobody noticed that automated
    // results never reached Jira in the shipped configuration.
    console.log(
      '\n[SKIP] TMS sync is OFF — these results were NOT written back to the TMS. Set AUTO_SYNC=true to enable it.',
    );
    // Name the variable that actually applies. Modality jira-native has no Test
    // Executions at all, so pointing its users at an execution key teaches a
    // model of the TMS that does not exist on their instance.
    if (config.tms.provider === 'xray') {
      console.log(
        '       Then set STP_EXECUTION_KEY to the STR (the Test Execution linked to the sprint STP), or a new (unparented) one is created per run.',
      );
    }
    else if (config.tms.provider === 'jira') {
      console.log(
        '       Results then land on each Test issue: the status field from .agents/jira-fields.json (`test_status`), or JIRA_TEST_STATUS_FIELD to override it.',
      );
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('[OK] Global teardown complete');
  console.log(`${'='.repeat(60)}\n`);
});
