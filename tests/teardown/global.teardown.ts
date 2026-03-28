/**
 * KATA Framework - Global Teardown (Project)
 *
 * Runs LAST after all test projects complete.
 * Generates reports, syncs to TMS, cleans up resources.
 *
 * Dependencies: e2e, integration (runs after all tests)
 * Dependents: None (this is the final step)
 */

import { test as teardown } from '@playwright/test';
import { generateAtcReport } from '@utils/decorators';
import { syncResults } from '@utils/jiraSync';

/**
 * Global Teardown: generate reports and sync TMS
 *
 * Generates ATC execution report and syncs results to TMS if enabled.
 */
teardown('Global Teardown: generate reports and sync TMS', async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('KATA Framework - Global Teardown');
  console.log('='.repeat(60));

  // Generate ATC results report
  try {
    const summary = await generateAtcReport('reports/atc_results.json');

    console.log('\nATC Execution Summary:');
    console.log(`   Total: ${summary.total}`);
    console.log(`   Passed: ${summary.passed}`);
    console.log(`   Failed: ${summary.failed}`);
    console.log(`   Skipped: ${summary.skipped}`);
    console.log(`   Test IDs: ${summary.testIds.length}`);
  }
  catch (error) {
    console.warn('[WARN] Could not generate ATC report:', error);
  }

  // Sync results to TMS
  const { AUTO_SYNC } = process.env;

  if (AUTO_SYNC === 'true') {
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
    console.log('\n[SKIP] TMS sync disabled (set AUTO_SYNC=true to enable)');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('[OK] Global teardown complete');
  console.log(`${'='.repeat(60)}\n`);
});
