// Run after Playwright exits, not from global.teardown: KataReporter.onEnd() writes the report after the teardown project.

import type { AtcResult } from '@utils/decorators';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildXrayTests, findKeyProblems, keyProblemLine, readRunReport } from '@utils/xrayResults';
import { config, env } from '@variables';

interface XrayTestExecution {
  testKey: string
  status: 'PASSED' | 'FAILED' | 'TODO'
  comment: string
}

// Xray's info schema is closed and has no parent field: only testExecutionKey reaches an already-parented Execution.
interface XrayImportPayload {
  testExecutionKey?: string
  info?: {
    project: string
    summary: string
    description: string
    testEnvironments: string[]
    // Set only when RTP_KEY is non-empty: Xray rejects an empty string.
    testPlanKey?: string
  }
  tests: XrayTestExecution[]
}

interface SyncResult {
  provider: string
  success: boolean
  message: string
  details?: unknown
}

export async function syncResults(reportPath = 'reports/atc_results.json'): Promise<SyncResult> {
  if (!config.tms.autoSync) {
    console.log(
      '[SKIP] TMS sync is OFF — no result was written back to the TMS. Enable it with AUTO_SYNC=true.',
    );
    return { provider: 'none', success: true, message: 'Sync disabled' };
  }

  let results: Record<string, AtcResult[]>;

  const reportFile = Bun.file(reportPath);
  // test-outcomes.json alone is enough: when every ATC hung, it is the only record that they ran.
  if (await reportFile.exists() || existsSync(join(dirname(reportPath), 'test-outcomes.json'))) {
    const read = readRunReport(reportPath);
    if (read.problems.length > 0) {
      const message = read.problems.join('; ');
      console.error(`[ERROR] Nothing was written back: ${message}.`);
      return { provider: config.tms.provider, success: false, message };
    }
    results = read.results;
  }
  else {
    // In CI a missing report means the pipeline is wired wrong (this runs after Playwright): fail loudly; locally it is only a warning.
    const message = `ATC report file not found: ${reportPath}`;

    if (env.isCI) {
      console.error(
        `[ERROR] ${message}. It is written by KataReporter.onEnd() when the `
        + 'Playwright process exits, so run `bun run test:sync` as a step AFTER '
        + 'the test step, not before it and not inside the suite.',
      );
      return { provider: config.tms.provider, success: false, message };
    }

    console.warn(`[WARN] ${message} — run the suite first, then \`bun run test:sync\`.`);
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

// Diagnostic only: any failure returns null, it must never become a blocker.
async function readIssueType(issueKey: string): Promise<string | null> {
  const { url, user, apiToken } = config.tms.jira;

  if (!url || !user || !apiToken) {
    return null;
  }

  try {
    const response = await fetch(`${url}/rest/api/3/issue/${issueKey}?fields=issuetype`, {
      headers: {
        Authorization: `Basic ${btoa(`${user}:${apiToken}`)}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const issue = (await response.json()) as { fields?: { issuetype?: { name?: string } } };
    return issue.fields?.issuetype?.name ?? null;
  }
  catch {
    return null;
  }
}

async function syncToXray(results: Record<string, AtcResult[]>): Promise<SyncResult> {
  const keyProblems = findKeyProblems(results);
  if (keyProblems.length > 0) {
    console.error(`[ERROR] ${keyProblemLine(keyProblems)}`);
    return { provider: 'xray', success: false, message: 'Not a Test key' };
  }
  // Every ATC skipped at runtime: Xray's schema needs at least one entry.
  if (buildXrayTests(results).length === 0) {
    console.log('[WARN] No ATC result left to sync (every ATC was skipped)');
    return { provider: 'xray', success: true, message: 'No results to sync' };
  }

  const { clientId, clientSecret, projectKey } = config.tms.xray;
  const stpExecutionKey = config.tms.stpExecutionKey;

  if (!clientId || !clientSecret) {
    console.error(
      '[ERROR] Missing X-Ray credentials. Check XRAY_CLIENT_ID and XRAY_CLIENT_SECRET.',
    );
    return { provider: 'xray', success: false, message: 'Missing credentials' };
  }

  // Guard: Xray writes runs into Test Executions only, so a Test Plan (STP) key lands nowhere useful.
  if (stpExecutionKey) {
    const issueType = await readIssueType(stpExecutionKey);
    const kind = issueType?.toLowerCase() ?? '';

    if (issueType === null) {
      console.log(
        `[INFO] Could not read the issue type of ${stpExecutionKey} (no Atlassian `
        + 'credentials, or Jira unreachable): importing without the Plan-vs-Execution check.',
      );
    }
    else if (kind.includes('test plan')) {
      console.error(
        `[ERROR] STP_EXECUTION_KEY=${stpExecutionKey} is a "${issueType}": that is the `
        + 'key OF a Plan (the RTP or the STP). Pass the key of the RTR (or the sprint-close '
        + 'STR) instead: the Test Execution this run imports into. A Test Plan derives '
        + 'its status from its Executions, so results are never written into one.',
      );
      return {
        provider: 'xray',
        success: false,
        message: 'STP_EXECUTION_KEY points at a Test Plan, not at the RTR / STR Test Execution',
      };
    }
    else if (!kind.includes('test execution')) {
      console.warn(
        `[WARN] STP_EXECUTION_KEY=${stpExecutionKey} is a "${issueType}", not a Test `
        + 'Execution. Importing anyway — Xray decides whether it accepts the target.',
      );
    }
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

    // testKey only, no testInfo: Xray cannot create a Test from this import.
    const tests: XrayTestExecution[] = buildXrayTests(results);

    // Prefer an existing Execution (already parented and plan-linked); the info fallback lands unparented because its schema has no parent field.
    const rtpKey = config.tms.rtpKey;
    const payload: XrayImportPayload = stpExecutionKey
      ? { testExecutionKey: stpExecutionKey, tests }
      : {
          info: {
            project: projectKey,
            summary: `RTR: Build#${env.buildId}: Regression Testing`,
            description:
              `Automated test execution via KATA Architecture\nEnvironment: ${env.current}\n\n`
              + 'Created by the test run itself, so it has no parent Epic. Set '
              + 'STP_EXECUTION_KEY to the RTR (or the sprint-close STR): an existing Test '
              + 'Execution under the "QA Test Artifacts" epic, to keep results on a '
              + 'parented item instead.',
            testEnvironments: [env.current],
            ...(rtpKey ? { testPlanKey: rtpKey } : {}),
          },
          tests,
        };

    if (stpExecutionKey) {
      console.log(`[UPLOAD] Importing results into existing Test Execution ${stpExecutionKey}...`);
    }
    else {
      const planNote = rtpKey
        ? `The minted item is linked to the RTP ${rtpKey} (RTP_KEY).`
        : 'Set RTP_KEY so the minted item is at least linked to the RTP.';
      console.warn(
        '[WARN] STP_EXECUTION_KEY is not set: Xray will create a NEW, unparented '
        + 'Test Execution for this run. Point it at the RTR (or the sprint-close STR) '
        + `under the "QA Test Artifacts" epic to avoid orphan executions. ${planNote}`,
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

// Jira field ids are per-instance: .agents/jira-fields.json is the source, never hardcode.
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
    // Every execution skipped at runtime = NOT RUN (ADR-0020): nothing to write.
    if (executions.every(e => e.status === 'SKIP')) {
      continue;
    }
    const finalStatus = executions.some(e => e.status === 'FAIL') ? 'FAIL' : 'PASS';
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
