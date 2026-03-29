/**
 * KATA Framework - TMS Synchronization
 *
 * Syncs ATC results to Test Management Systems.
 * Supports: X-Ray Cloud, Jira Direct
 *
 * Usage:
 *   bun run test:sync
 *   AUTO_SYNC=true bun test
 */

import type { AtcResult } from '@utils/decorators';
import { config, env } from '@variables';

// ============================================
// Types
// ============================================

interface XrayTestExecution {
  testKey: string
  status: 'PASSED' | 'FAILED' | 'TODO'
  comment: string
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
    console.log('[SKIP] TMS sync disabled. Set AUTO_SYNC=true to enable.');
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

    const payload = {
      info: {
        project: projectKey,
        summary: `KATA Execution - ${env.buildId}`,
        description: `Automated test execution via KATA Framework\nEnvironment: ${env.current}`,
      },
      tests,
    };

    console.log('[UPLOAD] Importing results to X-Ray...');

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

async function syncToJiraDirect(results: Record<string, AtcResult[]>): Promise<SyncResult> {
  const { url, user, apiToken, testStatusField } = config.tms.jira;

  if (!url || !user || !apiToken) {
    console.error('[ERROR] Missing Jira credentials. Check JIRA_URL, JIRA_USER, JIRA_API_TOKEN.');
    return { provider: 'jira', success: false, message: 'Missing credentials' };
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
