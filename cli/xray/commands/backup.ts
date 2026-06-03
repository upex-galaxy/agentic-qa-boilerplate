/**
 * Xray CLI - Backup Commands
 *
 * Commands: export, restore
 *
 * Backup schema v2.0 captures the full Xray footprint of a project:
 *   - Tests (Manual steps / Cucumber gherkin / Generic definition) + their
 *     Test Repository folder, Precondition associations and coverage keys.
 *   - Preconditions (type + definition + folder).
 *   - Test Plans + Test Sets (membership by Test key).
 *   - Test Executions + run statuses (with --include-runs).
 *   - Test Repository folder tree (derived from each Test's folder path).
 *
 * v1.0 backups (tests + executions only) restore unchanged — the new arrays
 * default to empty.
 *
 * CROSS-SITE NOTE: Xray's GraphQL API addresses everything by the *numeric*
 * issueId, which is re-assigned per Jira Cloud site. The Jira *key* is what a
 * native project migration preserves. Restore therefore matches by key
 * (`--sync`) and re-resolves the destination issueId via Jira REST. Configure
 * the TARGET site's Jira creds (auth login --jira-*) before a --sync restore.
 */

import type {
  BackupData,
  BackupExecution,
  BackupFolder,
  BackupPrecondition,
  BackupTest,
  BackupTestContainer,
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
// SHARED GraphQL RESPONSE SHAPES
// ============================================================================

interface KeyedIssue { issueId: string, jira?: { key?: string } }
interface ContainerResult {
  issueId: string
  jira?: { key?: string, summary?: string, description?: string }
  tests?: { results: KeyedIssue[] }
}

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

/**
 * Resolve an existing issue (Precondition, Test Plan, Test Set, Execution) by
 * its Jira key to a numeric issueId via Jira REST. Used by --sync restore when
 * the entity already exists on the destination site (e.g. after a native Jira
 * project migration preserved the key). Returns null when Jira creds are
 * missing or the key does not resolve.
 */
async function resolveExistingIssue(key: string): Promise<string | null> {
  if (!key) {
    return null;
  }
  return getJiraIssueId(key);
}

/** Resolve the destination project's numeric projectId (needed by folder mutations). */
let cachedProjectId: string | null = null;
async function resolveProjectId(projectKey: string): Promise<string> {
  if (cachedProjectId) {
    return cachedProjectId;
  }
  const result = await graphql<{ getTests: { results: Array<{ projectId?: string }> } }>(
    QUERIES.getTest,
    { jql: `project = ${projectKey} AND issuetype = Test` },
  );
  const pid = result.getTests.results[0]?.projectId;
  if (!pid) {
    throw new Error(
      `Cannot resolve numeric projectId for ${projectKey}. `
      + 'Folder restore needs at least one Test to already exist in the target project.',
    );
  }
  cachedProjectId = pid;
  return pid;
}

/** `/a/b/c` -> [`/a`, `/a/b`, `/a/b/c`] so parent folders are created first. */
function ancestorPaths(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    cur += `/${p}`;
    out.push(cur);
  }
  return out;
}

function mapKeysToIds(keys: string[] | undefined, idMap: Map<string, string>): string[] {
  if (!keys) {
    return [];
  }
  return keys.map(k => idMap.get(k)).filter((v): v is string => Boolean(v));
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

  // v2.0 entities are exported by default; opt out per-entity or all at once.
  const testsOnly = getBoolFlag(flags, 'tests-only');
  const withPreconditions = !testsOnly && !getBoolFlag(flags, 'no-preconditions');
  const withPlans = !testsOnly && !getBoolFlag(flags, 'no-plans');
  const withSets = !testsOnly && !getBoolFlag(flags, 'no-sets');
  const withFolders = !testsOnly && !getBoolFlag(flags, 'no-folders');

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
          folder?: { path?: string }
          preconditions?: { results: KeyedIssue[] }
          coverableIssues?: { results: KeyedIssue[] }
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
      const folderPath = t.folder?.path && t.folder.path !== '/' ? t.folder.path : undefined;
      const preconditionKeys = (t.preconditions?.results || [])
        .map(p => p.jira?.key)
        .filter((k): k is string => Boolean(k));
      const coverageKeys = (t.coverableIssues?.results || [])
        .map(c => c.jira?.key)
        .filter((k): k is string => Boolean(k));

      const backupTest: BackupTest = {
        originalKey: t.jira?.key || '',
        issueId: t.issueId,
        summary: t.jira?.summary || '',
        description: t.jira?.description || undefined,
        testType: testType as 'Manual' | 'Generic' | 'Cucumber',
        labels: t.jira?.labels || undefined,
        folderPath,
        preconditionKeys: preconditionKeys.length > 0 ? preconditionKeys : undefined,
        coverageKeys: coverageKeys.length > 0 ? coverageKeys : undefined,
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

  // Step 2: Preconditions
  const preconditionsData: BackupPrecondition[] = [];
  if (withPreconditions) {
    log.dim('Fetching preconditions...');
    let pStart = 0;
    let pTotal = 0;
    do {
      const result = await graphql<{
        getPreconditions: {
          total: number
          results: Array<{
            issueId: string
            preconditionType?: { name?: string }
            definition?: string
            folder?: { path?: string }
            jira: { key?: string, summary?: string, description?: string, labels?: string[] }
          }>
        }
      }>(QUERIES.getPreconditionsFullData, {
        jql: `project = ${project} AND issuetype = Precondition`,
        limit,
        start: pStart,
      });
      pTotal = result.getPreconditions.total;
      for (const p of result.getPreconditions.results) {
        preconditionsData.push({
          originalKey: p.jira?.key || '',
          issueId: p.issueId,
          summary: p.jira?.summary || '',
          description: p.jira?.description || undefined,
          preconditionType: (p.preconditionType?.name || 'Manual') as 'Manual' | 'Generic' | 'Cucumber',
          definition: p.definition || undefined,
          labels: p.jira?.labels || undefined,
          folderPath: p.folder?.path && p.folder.path !== '/' ? p.folder.path : undefined,
        });
      }
      pStart += limit;
    } while (pStart < pTotal);
    log.success(`Exported ${preconditionsData.length} preconditions`);
  }

  // Step 3: Test Plans + Test Sets (membership by Test key)
  const testPlansData: BackupTestContainer[] = [];
  if (withPlans) {
    log.dim('Fetching test plans...');
    await fetchContainers(QUERIES.getTestPlansFullData, 'getTestPlans', project, limit, testPlansData);
    log.success(`Exported ${testPlansData.length} test plans`);
  }

  const testSetsData: BackupTestContainer[] = [];
  if (withSets) {
    log.dim('Fetching test sets...');
    await fetchContainers(QUERIES.getTestSetsFullData, 'getTestSets', project, limit, testSetsData);
    log.success(`Exported ${testSetsData.length} test sets`);
  }

  // Step 4: Folders — derived from each Test's repository folder path
  const foldersData: BackupFolder[] = [];
  if (withFolders) {
    const folderMap = new Map<string, string[]>();
    for (const t of testsData) {
      if (!t.folderPath || !t.originalKey) {
        continue;
      }
      const arr = folderMap.get(t.folderPath) || [];
      arr.push(t.originalKey);
      folderMap.set(t.folderPath, arr);
    }
    for (const [path, testKeys] of folderMap) {
      foldersData.push({ path, testKeys });
    }
    if (foldersData.length > 0) {
      log.success(`Exported ${foldersData.length} repository folders`);
    }
  }

  // Step 5: Executions with runs (if requested)
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

  // Step 6: Build and save backup file
  const backup: BackupData = {
    exportedAt: new Date().toISOString(),
    project,
    version: '2.0',
    testsCount: testsData.length,
    executionsCount: executionsData.length,
    preconditionsCount: preconditionsData.length,
    testPlansCount: testPlansData.length,
    testSetsCount: testSetsData.length,
    foldersCount: foldersData.length,
    tests: testsData,
    executions: executionsData,
    preconditions: preconditionsData,
    testPlans: testPlansData,
    testSets: testSetsData,
    folders: foldersData,
  };

  writeFileSync(output, JSON.stringify(backup, null, 2));

  log.success(`Backup saved to: ${output}`);
  console.log('\nSummary:');
  console.log(`  Tests:         ${backup.testsCount}`);
  console.log(`  Preconditions: ${backup.preconditionsCount}`);
  console.log(`  Test Plans:    ${backup.testPlansCount}`);
  console.log(`  Test Sets:     ${backup.testSetsCount}`);
  console.log(`  Folders:       ${backup.foldersCount}`);
  console.log(`  Executions:    ${backup.executionsCount}`);
  console.log(`  File size:     ${(Buffer.byteLength(JSON.stringify(backup)) / 1024).toFixed(2)} KB`);
}

/** Paginate a Test Plan / Test Set query and push normalized containers. */
async function fetchContainers(
  query: string,
  root: 'getTestPlans' | 'getTestSets',
  project: string,
  limit: number,
  out: BackupTestContainer[],
): Promise<void> {
  const issuetype = root === 'getTestPlans' ? 'Test Plan' : 'Test Set';
  let start = 0;
  let total = 0;
  do {
    const result = await graphql<Record<string, { total: number, results: ContainerResult[] }>>(query, {
      jql: `project = ${project} AND issuetype = "${issuetype}"`,
      limit,
      start,
    });
    const node = result[root];
    total = node.total;
    for (const c of node.results) {
      out.push({
        originalKey: c.jira?.key || '',
        issueId: c.issueId,
        summary: c.jira?.summary || '',
        description: c.jira?.description || undefined,
        testKeys: (c.tests?.results || [])
          .map(t => t.jira?.key)
          .filter((k): k is string => Boolean(k)),
      });
    }
    start += limit;
  } while (start < total);
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

  // v1.0 backups have no v2.0 arrays — default them to empty.
  const preconditions = backup.preconditions ?? [];
  const testPlans = backup.testPlans ?? [];
  const testSets = backup.testSets ?? [];
  const folders = backup.folders ?? [];

  log.info(`Backup from: ${backup.exportedAt} (schema v${backup.version})`);
  log.info(`Original project: ${backup.project}`);
  log.info(`Tests: ${backup.testsCount} · Preconditions: ${preconditions.length} · Plans: ${testPlans.length} · Sets: ${testSets.length} · Folders: ${folders.length} · Executions: ${backup.executionsCount}`);

  if (dryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
  }
  if (syncMode) {
    log.info('SYNC MODE - Match existing issues by key (needs target Jira creds) instead of creating duplicates');
  }

  // keyMap: originalKey -> destination key. idMap: originalKey -> destination numeric issueId.
  const keyMap: Map<string, string> = new Map();
  const idMap: Map<string, string> = new Map();

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

  // --------------------------------------------------------------------------
  // Phase 1: Preconditions
  // --------------------------------------------------------------------------
  let preCreated = 0;
  let preSynced = 0;
  let preFailed = 0;

  if (preconditions.length > 0) {
    console.log('\nRestoring preconditions...');
    for (const pre of preconditions) {
      if (syncMode) {
        const existingId = await resolveExistingIssue(pre.originalKey);
        if (existingId) {
          if (dryRun) {
            console.log(`  [DRY] Would sync precondition: ${pre.originalKey}`);
            idMap.set(pre.originalKey, existingId);
            preSynced++;
            continue;
          }
          try {
            await graphql(MUTATIONS.updatePrecondition, {
              issueId: existingId,
              data: {
                definition: pre.definition,
                folderPath: pre.folderPath,
                preconditionType: { name: pre.preconditionType },
              },
            });
            idMap.set(pre.originalKey, existingId);
            keyMap.set(pre.originalKey, pre.originalKey);
            log.success(`Synced precondition: ${pre.originalKey}`);
            preSynced++;
          }
          catch (error) {
            log.error(`Failed to sync precondition ${pre.originalKey}: ${error instanceof Error ? error.message : String(error)}`);
            preFailed++;
          }
          continue;
        }
      }

      if (dryRun) {
        console.log(`  [DRY] Would create precondition: ${pre.summary} (${pre.preconditionType})`);
        preCreated++;
        continue;
      }

      try {
        const result = await graphql<{ createPrecondition: { precondition: { issueId: string, jira: { key: string } } } }>(
          MUTATIONS.createPrecondition,
          {
            preconditionType: { name: pre.preconditionType },
            definition: pre.definition,
            projectKey: targetProject,
            summary: pre.summary,
            description: pre.description,
            labels: pre.labels,
            folderPath: pre.folderPath,
          },
        );
        const created = result.createPrecondition.precondition;
        if (created?.jira?.key) {
          keyMap.set(pre.originalKey, created.jira.key);
        }
        if (created?.issueId) {
          idMap.set(pre.originalKey, created.issueId);
        }
        log.success(`Created precondition: ${created?.jira?.key} (from ${pre.originalKey})`);
        preCreated++;
      }
      catch (error) {
        log.error(`Failed to create precondition ${pre.originalKey}: ${error instanceof Error ? error.message : String(error)}`);
        preFailed++;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Phase 2: Tests
  // --------------------------------------------------------------------------
  let testsCreated = 0;
  let testsUpdated = 0;
  let testsSkipped = 0;
  let testsFailed = 0;

  console.log('\nRestoring tests...');

  for (const test of backup.tests) {
    if (keyMap.has(test.originalKey) && !idMap.has(test.originalKey)) {
      // Pre-mapped via --map-keys but no id yet; resolve so links/folders work.
      const mappedId = await resolveExistingIssue(keyMap.get(test.originalKey)!);
      if (mappedId) {
        idMap.set(test.originalKey, mappedId);
      }
      log.dim(`  Skipping ${test.originalKey} (already mapped)`);
      testsSkipped++;
      await associateTestExtras(test, idMap, dryRun);
      continue;
    }

    if (syncMode) {
      const existingTest = await findTestByKey(test.originalKey, true);

      if (existingTest) {
        const source = existingTest.fromXray ? 'Xray' : 'Jira (assumed)';

        if (dryRun) {
          console.log(`  [DRY] Would sync: ${test.originalKey} (${test.testType}) - found via ${source}`);
          idMap.set(test.originalKey, existingTest.issueId);
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
          idMap.set(test.originalKey, existingTest.issueId);
          await associateTestExtras(test, idMap, dryRun);
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
        folderPath: test.folderPath,
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

      const result = await graphql<{ createTest: { test: { issueId: string, jira: { key: string } } } }>(MUTATIONS.createTest, variables);
      const created = result.createTest.test;
      const createdKey = created?.jira?.key;

      log.success(`Created: ${createdKey} (from ${test.originalKey})`);

      if (createdKey) {
        keyMap.set(test.originalKey, createdKey);
      }
      if (created?.issueId) {
        idMap.set(test.originalKey, created.issueId);
      }
      await associateTestExtras(test, idMap, dryRun);

      testsCreated++;
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create ${test.originalKey}: ${errMsg}`);
      testsFailed++;
    }
  }

  // --------------------------------------------------------------------------
  // Phase 3: Test Repository folders
  // --------------------------------------------------------------------------
  let foldersCreated = 0;
  if (folders.length > 0) {
    console.log('\nRestoring repository folders...');
    if (dryRun) {
      console.log(`  [DRY] Would create/populate ${folders.length} folders`);
    }
    else {
      try {
        const projectId = await resolveProjectId(targetProject);
        // Create every ancestor path first (shallow -> deep), idempotently.
        const allPaths = new Set<string>();
        for (const f of folders) {
          for (const p of ancestorPaths(f.path)) {
            allPaths.add(p);
          }
        }
        const sorted = [...allPaths].sort((a, b) => a.split('/').length - b.split('/').length);
        for (const path of sorted) {
          try {
            await graphql(MUTATIONS.createFolder, { projectId, path });
          }
          catch {
            // Folder already exists — fine.
          }
        }
        for (const f of folders) {
          const testIds = mapKeysToIds(f.testKeys, idMap);
          if (testIds.length === 0) {
            continue;
          }
          try {
            await graphql(MUTATIONS.addTestsToFolder, { projectId, path: f.path, testIssueIds: testIds });
            log.success(`Folder ${f.path}: ${testIds.length} tests`);
            foldersCreated++;
          }
          catch (error) {
            log.error(`Failed to populate folder ${f.path}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      catch (error) {
        log.warn(`Skipping folders: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Phase 4: Test Sets, then Test Plans
  // --------------------------------------------------------------------------
  const setsCreated = await restoreContainers(testSets, 'Test Set', targetProject, idMap, keyMap, syncMode, dryRun, {
    create: MUTATIONS.createTestSet,
    add: MUTATIONS.addTestsToTestSet,
    createRoot: 'createTestSet',
    createField: 'testSet',
  });
  const plansCreated = await restoreContainers(testPlans, 'Test Plan', targetProject, idMap, keyMap, syncMode, dryRun, {
    create: MUTATIONS.createTestPlan,
    add: MUTATIONS.addTestsToTestPlan,
    createRoot: 'createTestPlan',
    createField: 'testPlan',
  });

  // --------------------------------------------------------------------------
  // Phase 5: Executions + run statuses
  // --------------------------------------------------------------------------
  let execsCreated = 0;
  let runsRestored = 0;

  if (backup.executions.length > 0) {
    console.log('\nRestoring executions...');

    for (const exec of backup.executions) {
      const testIssueIds = exec.testRuns
        .map(r => idMap.get(r.testKey) || keyMap.get(r.testKey) || r.testIssueId)
        .filter(Boolean);

      if (dryRun) {
        console.log(`  [DRY] Would create execution: ${exec.summary} (${exec.testRuns.length} runs)`);
        execsCreated++;
        continue;
      }

      try {
        let execIssueId: string | null = null;

        if (syncMode) {
          execIssueId = await resolveExistingIssue(exec.originalKey);
          if (execIssueId && testIssueIds.length > 0) {
            await graphql(MUTATIONS.addTestsToTestExecution, {
              issueId: execIssueId,
              testIssueIds,
            });
          }
        }

        if (!execIssueId) {
          const execResult = await graphql<{ createTestExecution: { testExecution: { issueId: string, jira: { key: string } } } }>(MUTATIONS.createTestExecution, {
            projectKey: targetProject,
            summary: exec.summary,
            testIssueIds,
          });
          execIssueId = execResult.createTestExecution.testExecution.issueId;
          log.success(`Created execution: ${execResult.createTestExecution.testExecution.jira?.key} (from ${exec.originalKey})`);
        }
        else {
          log.success(`Synced execution: ${exec.originalKey}`);
        }
        execsCreated++;

        runsRestored += await restoreRunStatuses(execIssueId, exec, keyMap);
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.error(`Failed to restore execution ${exec.originalKey}: ${errMsg}`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n${'='.repeat(50)}`);
  log.title('Restore Summary');
  console.log(`  Preconditions: ${preCreated} created, ${preSynced} synced, ${preFailed} failed`);
  console.log(`  Tests:         ${testsCreated} created, ${testsUpdated} synced, ${testsSkipped} skipped, ${testsFailed} failed`);
  if (folders.length > 0) {
    console.log(`  Folders:       ${foldersCreated} populated`);
  }
  if (testSets.length > 0) {
    console.log(`  Test Sets:     ${setsCreated} restored`);
  }
  if (testPlans.length > 0) {
    console.log(`  Test Plans:    ${plansCreated} restored`);
  }
  if (backup.executions.length > 0) {
    console.log(`  Executions:    ${execsCreated} restored, ${runsRestored} run statuses applied`);
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

/**
 * Associate a restored Test with its Preconditions (folder is handled in the
 * dedicated folder phase). No-op in dry-run or when the test/precondition ids
 * are not resolvable.
 */
async function associateTestExtras(
  test: BackupTest,
  idMap: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    return;
  }
  const testId = idMap.get(test.originalKey);
  if (!testId) {
    return;
  }
  const preIds = mapKeysToIds(test.preconditionKeys, idMap);
  if (preIds.length > 0) {
    try {
      await graphql(MUTATIONS.addPreconditionsToTest, {
        issueId: testId,
        preconditionIssueIds: preIds,
      });
      log.dim(`  Linked ${preIds.length} precondition(s) to ${test.originalKey}`);
    }
    catch (error) {
      log.error(`Failed to link preconditions for ${test.originalKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Restore a list of Test Plans or Test Sets. Returns the count restored. */
async function restoreContainers(
  containers: BackupTestContainer[],
  label: string,
  targetProject: string,
  idMap: Map<string, string>,
  keyMap: Map<string, string>,
  syncMode: boolean,
  dryRun: boolean,
  ops: { create: string, add: string, createRoot: string, createField: string },
): Promise<number> {
  if (containers.length === 0) {
    return 0;
  }
  console.log(`\nRestoring ${label.toLowerCase()}s...`);
  let count = 0;

  for (const c of containers) {
    const testIds = mapKeysToIds(c.testKeys, idMap);

    if (dryRun) {
      console.log(`  [DRY] Would restore ${label}: ${c.summary} (${testIds.length} tests)`);
      count++;
      continue;
    }

    try {
      let issueId: string | null = null;
      if (syncMode) {
        issueId = await resolveExistingIssue(c.originalKey);
        if (issueId && testIds.length > 0) {
          await graphql(ops.add, { issueId, testIssueIds: testIds });
        }
      }

      if (!issueId) {
        const result = await graphql<Record<string, Record<string, { issueId: string, jira: { key: string } }>>>(ops.create, {
          projectKey: targetProject,
          summary: c.summary,
          description: c.description,
          testIssueIds: testIds,
        });
        const created = result[ops.createRoot]?.[ops.createField];
        if (created?.jira?.key) {
          keyMap.set(c.originalKey, created.jira.key);
        }
        if (created?.issueId) {
          idMap.set(c.originalKey, created.issueId);
        }
        log.success(`Created ${label}: ${created?.jira?.key} (from ${c.originalKey}, ${testIds.length} tests)`);
      }
      else {
        log.success(`Synced ${label}: ${c.originalKey} (${testIds.length} tests)`);
      }
      count++;
    }
    catch (error) {
      log.error(`Failed to restore ${label} ${c.originalKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return count;
}

/**
 * After an execution exists with its tests attached, set each run's status,
 * comment and defects. Test runs are matched to the backup by destination Test
 * key. Returns the number of run statuses applied.
 */
async function restoreRunStatuses(
  execIssueId: string,
  exec: BackupExecution,
  keyMap: Map<string, string>,
): Promise<number> {
  const meaningful = exec.testRuns.filter(r => r.status && r.status !== 'TODO');
  if (meaningful.length === 0) {
    return 0;
  }

  let runByKey: Map<string, string>;
  try {
    const ex = await graphql<{
      getTestExecution: {
        testRuns?: { results: Array<{ id: string, test?: { jira?: { key?: string } } }> }
      }
    }>(QUERIES.getTestExecution, { issueId: execIssueId });
    runByKey = new Map(
      (ex.getTestExecution.testRuns?.results || [])
        .filter(r => r.test?.jira?.key)
        .map(r => [r.test!.jira!.key as string, r.id]),
    );
  }
  catch (error) {
    log.warn(`  Could not read runs for ${exec.originalKey}: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }

  let applied = 0;
  for (const run of meaningful) {
    const destKey = keyMap.get(run.testKey) || run.testKey;
    const runId = runByKey.get(destKey);
    if (!runId) {
      continue;
    }
    try {
      await graphql(MUTATIONS.updateTestRunStatus, { id: runId, status: run.status });
      if (run.comment) {
        await graphql(MUTATIONS.updateTestRunComment, { id: runId, comment: run.comment });
      }
      if (run.defects && run.defects.length > 0) {
        await graphql(MUTATIONS.addDefectsToTestRun, { id: runId, issues: run.defects });
      }
      applied++;
    }
    catch (error) {
      log.error(`  Failed to set run status for ${destKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return applied;
}
