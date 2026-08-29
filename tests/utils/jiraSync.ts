/**
 * KATA Architecture - TMS Synchronization
 *
 * Syncs ATC results to Test Management Systems.
 * Supports: X-Ray Cloud, Jira Direct
 *
 * Usage:
 *   bun run test:sync
 *   AUTO_SYNC=true bun test
 */

import type { AtcResult } from '@utils/decorators';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, env } from '@variables';

// ============================================
// Types
// ============================================

interface XrayTestExecution {
  testKey: string
  status: 'PASSED' | 'FAILED' | 'TODO'
  comment: string
}

/**
 * Body of `POST /api/v2/import/execution` (Xray JSON result format).
 *
 * Two mutually exclusive modes:
 *   - `testExecutionKey` — write the runs onto an EXISTING Test Execution.
 *   - `info` — let Xray create a new one from these fields.
 *
 * The `info` schema is closed (`additionalProperties: false`) and admits only
 * project / summary / description / version / revision / user / startDate /
 * finishDate / testPlanKey / testEnvironments. There is NO parent field, so an
 * Execution created here CANNOT be attached to the "QA Test Artifacts" epic by
 * this call — only `testExecutionKey`, pointing at an item somebody already
 * parented, satisfies the artifact doctrine. See the comment on `payload` below.
 */
interface XrayImportPayload {
  testExecutionKey?: string
  info?: {
    project: string
    summary: string
    description: string
    testEnvironments: string[]
  }
  tests: XrayTestExecution[]
}

interface SyncResult {
  provider: string
  success: boolean
  message: string
  details?: unknown
}

// ============================================
// Main Sync Function
// ============================================

export async function syncResults(reportPath = 'reports/atc_results.json'): Promise<SyncResult> {
  if (!config.tms.autoSync) {
    console.log(
      '[SKIP] TMS sync is OFF — no result was written back to the TMS. Enable it with AUTO_SYNC=true.',
    );
    return { provider: 'none', success: true, message: 'Sync disabled' };
  }

  let results: Record<string, AtcResult[]>;

  const reportFile = Bun.file(reportPath);
  if (await reportFile.exists()) {
    const reportData = (await reportFile.json()) as { results?: Record<string, AtcResult[]> };
    results = reportData.results ?? {};
  }
  else {
    console.warn('[WARN] ATC report file not found:', reportPath);
    results = {};
  }

  if (Object.keys(results).length === 0) {
    console.log('[WARN] No ATC results to sync');
    return { provider: config.tms.provider, success: true, message: 'No results to sync' };
  }

  console.log(
    `\n[SYNC] Syncing ${Object.keys(results).length} test results to ${config.tms.provider}...`,
  );

  switch (config.tms.provider) {
    case 'xray':
      return syncToXray(results);
    case 'jira':
      return syncToJiraDirect(results);
    case 'none':
      console.log('[SKIP] No TMS provider configured');
      return { provider: 'none', success: true, message: 'No provider configured' };
  }
}

// ============================================
// X-Ray Cloud Sync
// ============================================

async function syncToXray(results: Record<string, AtcResult[]>): Promise<SyncResult> {
  const { clientId, clientSecret, projectKey } = config.tms.xray;
  const executionKey = config.tms.executionKey;

  if (!clientId || !clientSecret) {
    console.error(
      '[ERROR] Missing X-Ray credentials. Check XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
    );
    return { provider: 'xray', success: false, message: 'Missing credentials' };
  }

  try {
    console.log('[AUTH] Authenticating with X-Ray Cloud...');

    const authResponse = await fetch('https://xray.cloud.getxray.app/api/v2/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!authResponse.ok) {
      const error = await authResponse.text();
      console.error('[ERROR] X-Ray authentication failed:', error);
      return { provider: 'xray', success: false, message: 'Authentication failed' };
    }

    const token = await authResponse.json();

    const tests: XrayTestExecution[] = [];

    for (const [testId, executions] of Object.entries(results)) {
      const finalStatus = executions.every(e => e.status === 'PASS') ? 'PASSED' : 'FAILED';
      const lastExecution = executions[executions.length - 1];

      tests.push({
        testKey: testId,
        status: finalStatus,
        comment:
          `KATA ATC: ${lastExecution.methodName}\n`
          + `Executions: ${executions.length}\n`
          + `Duration: ${lastExecution.duration}ms\n`
          + `Last run: ${lastExecution.executedAt}\n${
            lastExecution.error !== null ? `\nError:\n${lastExecution.error}` : ''
          }`,
      });
    }

    // Preferred path: write onto an Execution that already exists in Jira. That
    // item was created by /regression-testing or /sprint-testing, so it already
    // carries its parent ("QA Test Artifacts" epic), its Test Environment and a
    // title in the ratified grammar. Nothing is invented here.
    //
    // Fallback path (no TMS_EXECUTION_KEY): Xray creates the Execution from
    // `info`. That schema has no parent field, so the item lands UNPARENTED and
    // no later call in this file can adopt it — reparenting is a Jira REST
    // `PUT /issue/{key}` on the parent field, which needs Atlassian credentials
    // the Xray provider does not have. We do what the API does allow: the
    // ratified title shape and the Test Environment from the active env.
    const payload: XrayImportPayload = executionKey
      ? { testExecutionKey: executionKey, tests }
      : {
          info: {
            project: projectKey,
            // {ACRONYM}: {scope-id}: {descriptor} — docs/qa-standard/planning-ladder-proposal.md
            summary: `STR: Build#${env.buildId}: Regression Testing`,
            description:
              `Automated test execution via KATA Architecture\nEnvironment: ${env.current}\n\n`
              + 'Created by the test run itself, so it has no parent Epic. Set '
              + 'TMS_EXECUTION_KEY to an existing Test Execution under the "QA Test '
              + 'Artifacts" epic to keep results on a parented item instead.',
            testEnvironments: [env.current],
          },
          tests,
        };

    if (executionKey) {
      console.log(`[UPLOAD] Importing results into existing Test Execution ${executionKey}...`);
    }
    else {
      console.warn(
        '[WARN] TMS_EXECUTION_KEY is not set — Xray will create a NEW, unparented '
        + 'Test Execution for this run. Point it at the STR/ATR item under the '
        + '"QA Test Artifacts" epic to avoid orphan executions.',
      );
      console.log('[UPLOAD] Importing results to X-Ray...');
    }

    const importResponse = await fetch('https://xray.cloud.getxray.app/api/v2/import/execution', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!importResponse.ok) {
      const error = await importResponse.text();
      console.error('[ERROR] X-Ray import failed:', error);
      return { provider: 'xray', success: false, message: 'Import failed' };
    }

    const result = await importResponse.json();
    console.log('[SUCCESS] Results synced to X-Ray Cloud');
    console.log(`   Test Execution: ${result.key}`);

    return {
      provider: 'xray',
      success: true,
      message: `Synced to Test Execution: ${result.key}`,
      details: result,
    };
  }
  catch (error) {
    console.error('[ERROR] X-Ray sync error:', error);
    return {
      provider: 'xray',
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// Jira Direct Sync
// ============================================

/**
 * Resolve the Jira custom field that holds a test's run status.
 *
 * Custom-field ids are per-instance data: they differ between workspaces and
 * are reassigned by a site migration. The catalog `.agents/jira-fields.json`
 * is their single source of truth, so the id is never hardcoded in config or
 * docs. `JIRA_TEST_STATUS_FIELD` stays available as an explicit override.
 *
 * Returns null when neither source provides one — the caller aborts rather
 * than PUT an empty field key, which Jira answers with an opaque 400.
 */
function resolveTestStatusField(): string | null {
  if (config.tms.jira.testStatusField) {
    return config.tms.jira.testStatusField;
  }

  try {
    const catalogPath = join(process.cwd(), '.agents', 'jira-fields.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as Record<string, { id?: string }>;
    return catalog.test_status?.id ?? null;
  }
  catch {
    return null;
  }
}

async function syncToJiraDirect(results: Record<string, AtcResult[]>): Promise<SyncResult> {
  const { url, user, apiToken } = config.tms.jira;

  if (!url || !user || !apiToken) {
    console.error('[ERROR] Missing Atlassian credentials. Check ATLASSIAN_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN.');
    return { provider: 'jira', success: false, message: 'Missing credentials' };
  }

  const testStatusField = resolveTestStatusField();

  if (!testStatusField) {
    console.error(
      '[ERROR] Could not resolve the test status field. Regenerate the catalog with '
      + '`bun run jira:sync-fields --force` so `.agents/jira-fields.json` carries a '
      + '`test_status` slug, or set JIRA_TEST_STATUS_FIELD in .env to override it.',
    );
    return { provider: 'jira', success: false, message: 'Unresolved test status field' };
  }

  const auth = btoa(`${user}:${apiToken}`);
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
  };

  let successCount = 0;
  let failCount = 0;

  for (const [testId, executions] of Object.entries(results)) {
    const finalStatus = executions.every(e => e.status === 'PASS') ? 'PASS' : 'FAIL';
    const lastExecution = executions[executions.length - 1];

    try {
      console.log(`[UPDATE] Updating ${testId}...`);

      const updateResponse = await fetch(`${url}/rest/api/3/issue/${testId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          fields: {
            [testStatusField]: { value: finalStatus },
          },
        }),
      });

      if (!updateResponse.ok && updateResponse.status !== 204) {
        console.warn(`[WARN] Failed to update field for ${testId}: ${updateResponse.status}`);
      }

      const commentBody = {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: `KATA Execution - ${finalStatus}`,
                  marks: [{ type: 'strong' }],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: `ATC: ${lastExecution.methodName}\n` },
                { type: 'text', text: `Executions: ${executions.length}\n` },
                { type: 'text', text: `Duration: ${lastExecution.duration}ms\n` },
                { type: 'text', text: `Environment: ${env.current}\n` },
                { type: 'text', text: `Build: ${env.buildId}\n` },
                { type: 'text', text: `Timestamp: ${lastExecution.executedAt}` },
              ],
            },
            ...(lastExecution.error !== null
              ? [
                  {
                    type: 'codeBlock',
                    attrs: { language: 'text' },
                    content: [{ type: 'text', text: `Error:\n${lastExecution.error}` }],
                  },
                ]
              : []),
          ],
        },
      };

      const commentResponse = await fetch(`${url}/rest/api/3/issue/${testId}/comment`, {
        method: 'POST',
        headers,
        body: JSON.stringify(commentBody),
      });

      if (commentResponse.ok || commentResponse.status === 201) {
        console.log(`[SUCCESS] Updated ${testId} -> ${finalStatus}`);
        successCount++;
      }
      else {
        console.warn(`[WARN] Updated ${testId} but failed to add comment`);
        successCount++;
      }
    }
    catch (error) {
      console.error(`[ERROR] Failed to update ${testId}:`, error);
      failCount++;
    }
  }

  console.log(`\n[SUMMARY] Sync: ${successCount} success, ${failCount} failed`);

  return {
    provider: 'jira',
    success: failCount === 0,
    message: `Updated ${successCount}/${successCount + failCount} issues`,
  };
}

// ============================================
// CLI Entry Point
// ============================================

if (process.argv[1]?.includes('jiraSync')) {
  syncResults()
    .then((result) => {
      console.log('\n[RESULT]', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export default syncResults;
