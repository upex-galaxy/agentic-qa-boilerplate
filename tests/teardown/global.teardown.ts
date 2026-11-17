import { existsSync, readFileSync } from 'node:fs';

import { test as teardown } from '@playwright/test';
import { ATC_PARTIAL_PATH } from '@utils/decorators';
import { config } from '@variables';

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

  // No TMS sync here: onEnd() writes atc_results.json after this project, so a sync would read a missing or stale file; use bun run test:sync.
  if (config.tms.autoSync) {
    console.log(
      '\n[SYNC] TMS sync is ON — results are synced by the `bun run test:sync` step that runs after this process exits.',
    );
  }
  else {
    // Say it out loud: a silent no-op hid that results never reached Jira.
    console.log(
      '\n[SKIP] TMS sync is OFF — these results were NOT written back to the TMS. Set AUTO_SYNC=true to enable it, then run `bun run test:sync` after the suite.',
    );
    // Name the variable that applies: the jira-native modality has no Test Executions, so an execution key is wrong for it.
    if (config.tms.provider === 'xray') {
      console.log(
        '       Then set STP_EXECUTION_KEY to the RTR (the Test Execution for this regression run, linked to the RTP) or, at sprint close, to the STR; otherwise a new Execution is minted per run (set RTP_KEY so it is at least plan-linked).',
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
