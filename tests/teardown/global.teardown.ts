/**
 * KATA Architecture - Global Teardown (Project)
 *
 * Runs LAST after all test projects complete.
 * Prints the ATC coverage summary and says where the TMS write-back happens.
 *
 * It does NOT sync: `reports/atc_results.json` is written by
 * KataReporter.onEnd(), which fires after this project. `bun run test:sync`
 * does the write-back once the Playwright process has exited.
 *
 * Dependencies: e2e, integration (runs after all tests)
 * Dependents: None (this is the final step)
 */

import { existsSync, readFileSync } from 'node:fs';

import { test as teardown } from '@playwright/test';
import { ATC_PARTIAL_PATH } from '@utils/decorators';
import { config } from '@variables';

/**
 * Global Teardown: report ATC coverage
 *
 * Summarises the ATC executions of this run from the NDJSON partial file and
 * states whether the TMS write-back is enabled for the follow-up sync step.
 */
teardown('Global Teardown: report ATC coverage', () => {
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

  // TMS sync does NOT happen here.
  //
  // `reports/atc_results.json` is written by KataReporter.onEnd(), and a
  // Playwright reporter's onEnd() fires after EVERY project has finished —
  // this teardown project included. Any sync started from inside this test
  // would read a file that does not exist yet (CI) or the previous run's file
  // (local). The write-back therefore runs as a separate step once the
  // Playwright process has exited: `bun run test:sync`.
  if (config.tms.autoSync) {
    console.log(
      '\n[SYNC] TMS sync is ON — results are synced by the `bun run test:sync` step that runs after this process exits.',
    );
  }
  else {
    // Say it out loud. A silent no-op here is why nobody noticed that automated
    // results never reached Jira in the shipped configuration.
    console.log(
      '\n[SKIP] TMS sync is OFF — these results were NOT written back to the TMS. Set AUTO_SYNC=true to enable it, then run `bun run test:sync` after the suite.',
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
