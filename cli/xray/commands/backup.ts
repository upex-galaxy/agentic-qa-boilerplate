/**
 * Xray CLI - Backup Commands
 *
 * Commands: export, restore
 */

import type {
  BackupData,
  BackupExecution,
  BackupTest,
  BackupTestRun,
  ExistingTest,
  Flags,
  TestStepResponse,
} from '../types/index.js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { getJiraIssueId } from '../lib/jira.js';
import { log } from '../lib/logger.js';
import { getBoolFlag, getFlag, requireFlag } from '../lib/parser.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function findTestByKey(key: string, assumeExists = false): Promise<ExistingTest | null> {
  try {
    const result = await graphql<{
      getTests: {
        results: Array<{
          issueId: string
          testType: { name: string }
          steps?: Array<{ id: string }>
          jira: { key: string }
        }>
      }
    }>(QUERIES.getTest, { jql: `key = ${key}` });

    if (result.getTests.results && result.getTests.results.length > 0) {
      const test = result.getTests.results[0];
      return {
        issueId: test.issueId,
        key: test.jira.key || key,
        testType: test.testType.name,
        hasSteps: (test.steps?.length || 0) > 0,
        fromXray: true,
      };
    }

    if (assumeExists) {
      const jiraIssueId = await getJiraIssueId(key);

      if (jiraIssueId) {
        return {
          issueId: jiraIssueId,
          key,
          testType: 'Unknown',
          hasSteps: false,
          fromXray: false,
        };
      }

      return {
        issueId: key,
        key,
        testType: 'Unknown',
        hasSteps: false,
        fromXray: false,
      };
    }

    return null;
  }
  catch {
    if (assumeExists) {
      const jiraIssueId = await getJiraIssueId(key);
      return {
        issueId: jiraIssueId || key,
        key,
        testType: 'Unknown',
        hasSteps: false,
        fromXray: false,
      };
    }
    return null;
  }
}

async function syncTestSteps(
  issueId: string,
  steps: Array<{ action: string, data?: string, result?: string }>,
): Promise<void> {
  for (const step of steps) {
    await graphql(MUTATIONS.addTestStep, {
      issueId,
      step: {
        action: step.action,
        data: step.data || '',
        result: step.result || '',
      },
    });
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export async function backupExport(flags: Flags): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  if (!project) {
    throw new Error('Missing required flag: --project (or set default_project in config)');
  }
  const output = getFlag(flags, 'output') || `xray-backup-${project}-${Date.now()}.json`;
  const includeRuns = getBoolFlag(flags, 'include-runs');
  const onlyWithData = getBoolFlag(flags, 'only-with-data');
  const limit = Number.parseInt(getFlag(flags, 'limit', '100') || '100', 10);

  log.title(`Xray Backup Export - Project: ${project}`);
  if (onlyWithData) {
    log.info('Only exporting tests with Xray data (steps, gherkin, or definition)');
  }

  // Step 1: Fetch all tests with full data
  log.dim('Fetching tests...');
  const testsData: BackupTest[] = [];
  let start = 0;
  let totalTests = 0;

  do {
    const result = await graphql<{
      getTests: {
        total: number
        results: Array<{
          issueId: string
          testType?: { name: string }
          steps?: TestStepResponse[]
          gherkin?: string
          unstructured?: string
          jira: { key?: string, summary?: string, description?: string, labels?: string[] }
        }>
      }
    }>(QUERIES.getTestsFullData, {
      jql: `project = ${project} AND issuetype = Test`,
      limit,
      start,
    });

    totalTests = result.getTests.total;
    const tests = result.getTests.results;

    for (const t of tests) {
      const testType = t.testType?.name || 'Manual';
      const backupTest: BackupTest = {
        originalKey: t.jira?.key || '',
        issueId: t.issueId,
        summary: t.jira?.summary || '',
        description: t.jira?.description || undefined,
        testType: testType as 'Manual' | 'Generic' | 'Cucumber',
        labels: t.jira?.labels || undefined,
      };

      let hasXrayData = false;
      if (testType === 'Manual' && t.steps && t.steps.length > 0) {
        backupTest.steps = t.steps.map((s: TestStepResponse) => ({
          action: s.action || '',
          data: s.data || undefined,
          result: s.result || undefined,
        }));
        hasXrayData = true;
      }
      else if (testType === 'Cucumber' && t.gherkin) {
        backupTest.gherkin = t.gherkin;
        hasXrayData = true;
      }
      else if (testType === 'Generic' && t.unstructured) {
        backupTest.unstructured = t.unstructured;
        hasXrayData = true;
      }

      if (onlyWithData && !hasXrayData) {
        continue;
      }

      testsData.push(backupTest);
    }

    start += limit;
    log.dim(`  Fetched ${Math.min(start, totalTests)}/${totalTests} tests...`);
  } while (start < totalTests);

  if (onlyWithData && testsData.length < totalTests) {
    log.success(`Exported ${testsData.length}/${totalTests} tests (${totalTests - testsData.length} skipped - no Xray data)`);
  }
  else {
    log.success(`Exported ${testsData.length} tests`);
  }

  // Step 2: Fetch executions with runs (if requested)
  const executionsData: BackupExecution[] = [];

  if (includeRuns) {
    log.dim('Fetching test executions with runs...');

    const execResult = await graphql<{
      getTestExecutions: {
        results: Array<{
          issueId: string
          jira: { key?: string, summary?: string }
          testRuns?: {
            results: Array<{
              test?: { issueId: string, jira?: { key?: string } }
              status?: { name: string }
              comment?: string
              defects?: string[]
              startedOn?: string
              finishedOn?: string
              steps?: Array<{ status?: { name: string }, comment?: string }>
            }>
          }
        }>
      }
    }>(QUERIES.getExecutionsFullData, {
      jql: `project = ${project} AND issuetype = "Test Execution"`,
      limit: 100,
    });

    for (const exec of execResult.getTestExecutions.results) {
      const backupExec: BackupExecution = {
        originalKey: exec.jira?.key || '',
        issueId: exec.issueId,
        summary: exec.jira?.summary || '',
        testRuns: [],
      };

      if (exec.testRuns?.results) {
        for (const run of exec.testRuns.results) {
          const testRun: BackupTestRun = {
            testKey: run.test?.jira?.key || '',
            testIssueId: run.test?.issueId || '',
            status: run.status?.name || 'TODO',
            comment: run.comment || undefined,
            defects: run.defects || undefined,
            startedOn: run.startedOn || undefined,
            finishedOn: run.finishedOn || undefined,
          };

          if (run.steps && run.steps.length > 0) {
            testRun.stepStatuses = run.steps.map((s, idx: number) => ({
              stepIndex: idx,
              status: s.status?.name || 'TODO',
              comment: s.comment || undefined,
            }));
          }

          backupExec.testRuns.push(testRun);
        }
      }

      executionsData.push(backupExec);
    }

    log.success(
      `Exported ${executionsData.length} executions with ${executionsData.reduce((sum, e) => sum + e.testRuns.length, 0)} test runs`,
    );
  }

  // Step 3: Build and save backup file
  const backup: BackupData = {
    exportedAt: new Date().toISOString(),
    project,
    version: '1.0',
    testsCount: testsData.length,
    executionsCount: executionsData.length,
    tests: testsData,
    executions: executionsData,
  };

  writeFileSync(output, JSON.stringify(backup, null, 2));

  log.success(`Backup saved to: ${output}`);
  console.log('\nSummary:');
  console.log(`  Tests: ${backup.testsCount}`);
  console.log(`  Executions: ${backup.executionsCount}`);
  console.log(`  File size: ${(Buffer.byteLength(JSON.stringify(backup)) / 1024).toFixed(2)} KB`);
}

// ============================================================================
// RESTORE
// ============================================================================

export async function restore(flags: Flags): Promise<void> {
  const file = requireFlag(flags, 'file');
  const targetProject = requireFlag(flags, 'project');
  const dryRun = getBoolFlag(flags, 'dry-run');
  const syncMode = getBoolFlag(flags, 'sync');
  const mapKeysFile = getFlag(flags, 'map-keys');

  if (!existsSync(file)) {
    throw new Error(`Backup file not found: ${file}`);
  }

  log.title(`Xray Backup Restore - Target Project: ${targetProject}`);

  const backupContent = readFileSync(file, 'utf-8');
  const backup: BackupData = JSON.parse(backupContent);

  log.info(`Backup from: ${backup.exportedAt}`);
  log.info(`Original project: ${backup.project}`);
  log.info(`Tests to restore: ${backup.testsCount}`);
  log.info(`Executions to restore: ${backup.executionsCount}`);

  if (dryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
  }
  if (syncMode) {
    log.info('SYNC MODE - Will update existing tests instead of creating duplicates');
  }

  const keyMap: Map<string, string> = new Map();
  if (mapKeysFile && existsSync(mapKeysFile)) {
    const mapContent = readFileSync(mapKeysFile, 'utf-8');
    const lines = mapContent.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const [oldKey, newKey] = line.split(',').map(s => s.trim());
      if (oldKey && newKey) {
        keyMap.set(oldKey, newKey);
      }
    }
    log.info(`Loaded ${keyMap.size} key mappings from ${mapKeysFile}`);
  }

  let testsCreated = 0;
  let testsUpdated = 0;
  let testsSkipped = 0;
  let testsFailed = 0;

  console.log('\nRestoring tests...');

  for (const test of backup.tests) {
    if (keyMap.has(test.originalKey)) {
      log.dim(`  Skipping ${test.originalKey} (already mapped)`);
      testsSkipped++;
      continue;
    }

    if (syncMode) {
      const existingTest = await findTestByKey(test.originalKey, true);

      if (existingTest) {
        const source = existingTest.fromXray ? 'Xray' : 'Jira (assumed)';

        if (dryRun) {
          console.log(`  [DRY] Would sync: ${test.originalKey} (${test.testType}) - found via ${source}`);
          testsUpdated++;
          continue;
        }

        try {
          const hasXrayData = (test.testType === 'Cucumber' && test.gherkin)
            || (test.testType === 'Generic' && test.unstructured);
          const needsTypeChange = hasXrayData
            && existingTest.testType !== test.testType
            && (existingTest.testType === 'Manual' || existingTest.testType === 'Unknown');

          if (needsTypeChange) {
            log.dim(`  Changing test type: ${existingTest.testType || 'Manual'} → ${test.testType}`);
            await graphql(MUTATIONS.updateTestType, {
              issueId: existingTest.issueId,
              testType: { name: test.testType },
            });
          }

          if (test.testType === 'Manual' && test.steps && test.steps.length > 0) {
            if (!existingTest.hasSteps || !existingTest.fromXray) {
              await syncTestSteps(existingTest.issueId, test.steps);
              log.success(`Synced steps: ${test.originalKey} (${test.steps.length} steps added)`);
            }
            else {
              log.dim(`  Skipping steps for ${test.originalKey} (already has steps)`);
            }
          }
          else if (test.testType === 'Cucumber' && test.gherkin) {
            await graphql(MUTATIONS.updateGherkinTestDefinition, {
              issueId: existingTest.issueId,
              gherkin: test.gherkin,
            });
            log.success(`Synced gherkin: ${test.originalKey}`);
          }
          else if (test.testType === 'Generic' && test.unstructured) {
            await graphql(MUTATIONS.updateUnstructuredTestDefinition, {
              issueId: existingTest.issueId,
              unstructured: test.unstructured,
            });
            log.success(`Synced definition: ${test.originalKey}`);
          }
          else {
            log.dim(`  No Xray data to sync for ${test.originalKey}`);
          }

          keyMap.set(test.originalKey, existingTest.key);
          testsUpdated++;
        }
        catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          log.error(`Failed to sync ${test.originalKey}: ${errMsg}`);
          testsFailed++;
        }
        continue;
      }
    }

    if (dryRun) {
      console.log(`  [DRY] Would create: ${test.summary} (${test.testType})`);
      testsCreated++;
      continue;
    }

    try {
      const variables: Record<string, unknown> = {
        testType: { name: test.testType },
        projectKey: targetProject,
        summary: test.summary,
        description: test.description,
        labels: test.labels,
      };

      if (test.testType === 'Manual' && test.steps) {
        variables.steps = test.steps.map(s => ({
          action: s.action,
          data: s.data,
          result: s.result,
        }));
      }
      else if (test.testType === 'Cucumber' && test.gherkin) {
        variables.gherkin = test.gherkin;
      }
      else if (test.testType === 'Generic' && test.unstructured) {
        variables.unstructured = test.unstructured;
      }

      const result = await graphql<{ createTest: { test: { jira: { key: string } } } }>(MUTATIONS.createTest, variables);
      const createdKey = result.createTest.test.jira?.key;

      log.success(`Created: ${createdKey} (from ${test.originalKey})`);

      if (createdKey) {
        keyMap.set(test.originalKey, createdKey);
      }

      testsCreated++;
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create ${test.originalKey}: ${errMsg}`);
      testsFailed++;
    }
  }

  let execsCreated = 0;

  if (backup.executions.length > 0) {
    console.log('\nRestoring executions...');

    for (const exec of backup.executions) {
      if (dryRun) {
        console.log(`  [DRY] Would create execution: ${exec.summary}`);
        execsCreated++;
        continue;
      }

      try {
        const testIssueIds = exec.testRuns
          .map(r => keyMap.get(r.testKey) || r.testKey)
          .filter(Boolean);

        const execResult = await graphql<{ createTestExecution: { testExecution: { jira: { key: string } } } }>(MUTATIONS.createTestExecution, {
          projectKey: targetProject,
          summary: exec.summary,
          testIssueIds,
        });

        const newExecKey = execResult.createTestExecution.testExecution.jira?.key;
        log.success(`Created execution: ${newExecKey} (from ${exec.originalKey})`);
        execsCreated++;

        if (exec.testRuns.some(r => r.status !== 'TODO')) {
          log.warn(
            `  Execution has ${exec.testRuns.length} runs with status data. Manual status update may be needed.`,
          );
        }
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.error(`Failed to create execution ${exec.originalKey}: ${errMsg}`);
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  log.title('Restore Summary');
  console.log(`  Tests created: ${testsCreated}`);
  console.log(`  Tests updated: ${testsUpdated}`);
  console.log(`  Tests skipped: ${testsSkipped}`);
  console.log(`  Tests failed: ${testsFailed}`);
  if (backup.executions.length > 0) {
    console.log(`  Executions created: ${execsCreated}`);
  }

  if (!dryRun && keyMap.size > 0) {
    const mapOutput = `key-mapping-${targetProject}-${Date.now()}.csv`;
    const mapContent = Array.from(keyMap.entries())
      .map(([old, newKey]) => `${old},${newKey}`)
      .join('\n');
    writeFileSync(mapOutput, `old_key,new_key\n${mapContent}`);
    log.info(`Key mapping saved to: ${mapOutput}`);
  }
}
