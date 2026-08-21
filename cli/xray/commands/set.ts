/**
 * Xray CLI - Test Set Commands
 *
 * Commands: create, get, list, add-tests, remove-tests, sync
 */

import type { Flags, TestResult, TestSetResult } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { getLinkedTests, resolveIssueId, resolveIssueIds } from '../lib/jira.js';
import { log, warnCountedButUnresolved, warnIfTruncated } from '../lib/logger.js';
import { getBoolFlag, getFlag, requireFlag } from '../lib/parser.js';

// ============================================================================
// CREATE
// ============================================================================

export async function create(flags: Flags): Promise<void> {
  const config = loadConfig();
  const projectKey = getFlag(flags, 'project') || config?.default_project;
  if (!projectKey) {
    throw new Error('Missing required flag: --project');
  }
  const summary = requireFlag(flags, 'summary');
  const description = getFlag(flags, 'description');
  const testsStr = getFlag(flags, 'tests');
  const testIssueIds = testsStr
    ? await resolveIssueIds(testsStr.split(',').map(t => t.trim()))
    : [];

  log.dim(`Creating Test Set in project ${projectKey}...`);

  const result = await graphql<{ createTestSet: { testSet: { jira: { key: string, summary: string }, issueId: string } } }>(MUTATIONS.createTestSet, {
    projectKey,
    summary,
    description,
    testIssueIds,
  });

  const set = result.createTestSet.testSet;
  log.success(`Test Set created: ${set.jira.key}`);
  console.log(`  Summary: ${set.jira.summary}`);
  console.log(`  Issue ID: ${set.issueId}`);
}

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const issueId = await resolveIssueId(positional[0] || requireFlag(flags, 'id'));

  const result = await graphql<{ getTestSet: TestSetResult }>(QUERIES.getTestSet, { issueId });
  const set = result.getTestSet;

  log.title(`Test Set: ${set.jira.key}`);
  console.log(`Summary: ${set.jira.summary}`);
  const setStatus = typeof set.jira.status === 'object' && set.jira.status !== null ? set.jira.status.name : (set.jira.status || 'Unknown');
  console.log(`Status: ${setStatus}`);
  console.log(`Tests: ${set.tests?.total || 0}`);

  if (set.tests?.results && set.tests.results.length > 0) {
    console.log('\nTests:');
    set.tests.results.forEach((t: TestResult) => {
      console.log(`  ${t.jira.key}  [${t.testType.name}]  ${t.jira.summary}`);
    });
  }
}

// ============================================================================
// LIST
// ============================================================================

export async function list(flags: Flags): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql = getFlag(flags, 'jql')
    || (project ? `project = ${project} AND issuetype = "Test Set"` : 'issuetype = "Test Set"');

  const result = await graphql<{ getTestSets: { total: number, results: TestSetResult[] } }>(QUERIES.getTestSets, { jql, limit });

  log.title(`Test Sets (${result.getTestSets.total} total, showing ${result.getTestSets.results.length})`);

  if (result.getTestSets.results.length === 0) {
    if (result.getTestSets.total > 0 && limit > 0) {
      warnCountedButUnresolved('test sets', result.getTestSets.total);
      return;
    }
    log.warn('No test sets found');
    return;
  }

  warnIfTruncated(result.getTestSets.total, result.getTestSets.results.length, limit);

  result.getTestSets.results.forEach((s: TestSetResult) => {
    const sStatus = typeof s.jira.status === 'object' && s.jira.status !== null ? s.jira.status.name : (s.jira.status || 'Unknown');
    console.log(`${s.jira.key}  ${sStatus}  ${s.jira.summary}`);
  });
}

// ============================================================================
// ADD TESTS
// ============================================================================

export async function addTests(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'set'));
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = await resolveIssueIds(testsStr.split(',').map(t => t.trim()));

  log.dim(`Adding ${testIssueIds.length} tests to test set...`);

  const result = await graphql<{ addTestsToTestSet: { addedTests: string[] } }>(MUTATIONS.addTestsToTestSet, {
    issueId,
    testIssueIds,
  });

  log.success(`Added ${result.addTestsToTestSet.addedTests.length} tests`);
}

// ============================================================================
// REMOVE TESTS
// ============================================================================

export async function removeTests(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'set'));
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = await resolveIssueIds(testsStr.split(',').map(t => t.trim()));

  log.dim(`Removing ${testIssueIds.length} tests from test set...`);

  const result = await graphql<{ removeTestsFromTestSet: { removedTests: string[] } }>(MUTATIONS.removeTestsFromTestSet, {
    issueId,
    testIssueIds,
  });

  log.success(`Removed ${result.removeTestsFromTestSet.removedTests.length} tests`);
}

// ============================================================================
// SYNC (Jira-layer ↔ Xray-layer reconciliation)
// ============================================================================

export interface SetSyncResult {
  setKey: string
  setId: string
  jiraLinkedIds: string[]
  xrayAttachedIds: string[]
  missingInXray: { id: string, key: string }[]
  missingInJira: string[]
  applied: string[]
}

export async function syncSet(input: string, options: { apply: boolean } = { apply: false }): Promise<SetSyncResult> {
  const issueId = await resolveIssueId(input);
  const xrayResult = await graphql<{ getTestSet: TestSetResult }>(QUERIES.getTestSet, { issueId });
  const setEntity = xrayResult.getTestSet;
  const setKey = setEntity.jira?.key ?? input;

  const linked = await getLinkedTests(setKey);
  if (linked === null) {
    throw new Error(
      'Jira credentials are required for `set sync` (the Jira-layer view comes from Jira REST, '
      + 'separate from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  const xrayAttachedIds = (setEntity.tests?.results ?? []).map(t => t.issueId);
  const xraySet = new Set(xrayAttachedIds);
  const linkedSet = new Set(linked.map(l => l.id));

  const missingInXray = linked.filter(l => !xraySet.has(l.id));
  const missingInJira = xrayAttachedIds.filter(id => !linkedSet.has(id));

  const result: SetSyncResult = {
    setKey,
    setId: issueId,
    jiraLinkedIds: linked.map(l => l.id),
    xrayAttachedIds,
    missingInXray,
    missingInJira,
    applied: [],
  };

  if (options.apply && missingInXray.length > 0) {
    log.dim(`Re-attaching ${missingInXray.length} test(s) at the Xray layer...`);
    const applyResult = await graphql<{ addTestsToTestSet: { addedTests: string[] } }>(MUTATIONS.addTestsToTestSet, {
      issueId,
      testIssueIds: missingInXray.map(m => m.id),
    });
    result.applied = applyResult.addTestsToTestSet.addedTests ?? [];
  }

  return result;
}

export async function sync(flags: Flags): Promise<void> {
  const input = requireFlag(flags, 'set');
  const apply = getBoolFlag(flags, 'apply');
  const result = await syncSet(input, { apply });

  log.title(`Test Set: ${result.setKey} (${result.setId})`);
  console.log(`  Jira-layer tests:  ${result.jiraLinkedIds.length}`);
  console.log(`  Xray-layer tests:  ${result.xrayAttachedIds.length}`);
  if (result.missingInXray.length === 0 && result.missingInJira.length === 0) {
    log.success('  In sync — both layers match');
    return;
  }
  if (result.missingInXray.length > 0) {
    log.warn(`  Missing at Xray layer (${result.missingInXray.length}): ${result.missingInXray.map(m => m.key).join(', ')}`);
  }
  if (result.missingInJira.length > 0) {
    log.warn(`  Missing at Jira layer (${result.missingInJira.length}): ${result.missingInJira.join(', ')}`);
  }
  if (result.applied.length > 0) {
    log.success(`  Applied: re-attached ${result.applied.length} test(s) at the Xray layer`);
  }
  if (!apply && result.missingInXray.length > 0) {
    log.dim('  Re-run with --apply to re-attach the Xray-layer tests automatically.');
  }
}
