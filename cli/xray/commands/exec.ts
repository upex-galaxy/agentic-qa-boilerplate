/**
 * Xray CLI - Execution Commands
 *
 * Commands: create, get, list, add-tests, remove-tests
 */

import type { Flags, TestExecutionResult, TestRunResult } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { getLinkedTests, resolveIssueId, resolveIssueIds } from '../lib/jira.js';
import { log } from '../lib/logger.js';
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

  log.dim(`Creating Test Execution in project ${projectKey}...`);

  const result = await graphql<{ createTestExecution: { testExecution: { jira: { key: string, summary: string }, issueId: string } } }>(MUTATIONS.createTestExecution, {
    projectKey,
    summary,
    description,
    testIssueIds,
  });

  const exec = result.createTestExecution.testExecution;
  log.success(`Test Execution created: ${exec.jira.key}`);
  console.log(`  Summary: ${exec.jira.summary}`);
  console.log(`  Issue ID: ${exec.issueId}`);
}

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const issueId = await resolveIssueId(positional[0] || requireFlag(flags, 'id'));

  const result = await graphql<{ getTestExecution: TestExecutionResult }>(QUERIES.getTestExecution, { issueId });
  const exec = result.getTestExecution;

  log.title(`Test Execution: ${exec.jira.key}`);
  console.log(`Summary: ${exec.jira.summary}`);
  const execStatus = typeof exec.jira.status === 'object' && exec.jira.status !== null ? exec.jira.status.name : (exec.jira.status || 'Unknown');
  console.log(`Status: ${execStatus}`);
  console.log(`Tests: ${exec.tests?.total || 0}`);
  console.log(`Test Runs: ${exec.testRuns?.total || 0}`);

  if (exec.testRuns?.results && exec.testRuns.results.length > 0) {
    console.log('\nTest Runs:');
    exec.testRuns.results.forEach((tr: TestRunResult) => {
      const testKey = tr.test?.jira?.key || 'Unknown';
      console.log(`  ${tr.id}  ${testKey}  [${tr.status.name}]`);
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
    || (project ? `project = ${project} AND issuetype = "Test Execution"` : 'issuetype = "Test Execution"');

  const result = await graphql<{ getTestExecutions: { total: number, results: TestExecutionResult[] } }>(QUERIES.getTestExecutions, { jql, limit });

  log.title(`Test Executions (${result.getTestExecutions.total} total)`);

  if (result.getTestExecutions.results.length === 0) {
    log.warn('No test executions found');
    return;
  }

  result.getTestExecutions.results.forEach((e: TestExecutionResult) => {
    const eStatus = typeof e.jira.status === 'object' && e.jira.status !== null ? e.jira.status.name : (e.jira.status || 'Unknown');
    console.log(`${e.jira.key}  ${eStatus}  ${e.jira.summary}`);
  });
}

// ============================================================================
// ADD TESTS
// ============================================================================

export async function addTests(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'execution'));
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = await resolveIssueIds(testsStr.split(',').map(t => t.trim()));

  log.dim(`Adding ${testIssueIds.length} tests to execution...`);

  const result = await graphql<{ addTestsToTestExecution: { addedTests: string[] } }>(MUTATIONS.addTestsToTestExecution, {
    issueId,
    testIssueIds,
  });

  log.success(`Added ${result.addTestsToTestExecution.addedTests.length} tests`);
}

// ============================================================================
// REMOVE TESTS
// ============================================================================

export async function removeTests(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'execution'));
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = await resolveIssueIds(testsStr.split(',').map(t => t.trim()));

  log.dim(`Removing ${testIssueIds.length} tests from execution...`);

  const result = await graphql<{ removeTestsFromTestExecution: { removedTests: string[] } }>(MUTATIONS.removeTestsFromTestExecution, {
    issueId,
    testIssueIds,
  });

  log.success(`Removed ${result.removeTestsFromTestExecution.removedTests.length} tests`);
}

// ============================================================================
// SYNC (Jira-layer ↔ Xray-layer reconciliation)
// ============================================================================

interface ExecSyncResult {
  execKey: string
  execId: string
  jiraLinkedIds: string[]
  xrayAttachedIds: string[]
  missingInXray: { id: string, key: string }[]
  missingInJira: string[]
  applied: string[]
}

export async function syncExecution(input: string, options: { apply: boolean } = { apply: false }): Promise<ExecSyncResult> {
  const issueId = await resolveIssueId(input);
  const xrayResult = await graphql<{ getTestExecution: TestExecutionResult }>(QUERIES.getTestExecution, { issueId });
  const exec = xrayResult.getTestExecution;
  const execKey = exec.jira?.key ?? input;

  const linked = await getLinkedTests(execKey);
  if (linked === null) {
    throw new Error(
      'Jira credentials are required for `exec sync` (the Jira-layer view comes from Jira REST, '
      + 'separate from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  const xrayAttachedIds = (exec.tests?.results ?? []).map(t => t.issueId);
  const xraySet = new Set(xrayAttachedIds);
  const linkedSet = new Set(linked.map(l => l.id));

  const missingInXray = linked.filter(l => !xraySet.has(l.id));
  const missingInJira = xrayAttachedIds.filter(id => !linkedSet.has(id));

  const result: ExecSyncResult = {
    execKey,
    execId: issueId,
    jiraLinkedIds: linked.map(l => l.id),
    xrayAttachedIds,
    missingInXray,
    missingInJira,
    applied: [],
  };

  if (options.apply && missingInXray.length > 0) {
    log.dim(`Re-attaching ${missingInXray.length} test(s) at the Xray layer...`);
    const applyResult = await graphql<{ addTestsToTestExecution: { addedTests: string[] } }>(MUTATIONS.addTestsToTestExecution, {
      issueId,
      testIssueIds: missingInXray.map(m => m.id),
    });
    result.applied = applyResult.addTestsToTestExecution.addedTests ?? [];
  }

  return result;
}

function printSyncReport(label: string, result: ExecSyncResult): void {
  log.title(`${label}: ${result.execKey} (${result.execId})`);
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
}

export async function sync(flags: Flags): Promise<void> {
  const input = requireFlag(flags, 'execution');
  const apply = getBoolFlag(flags, 'apply');
  const result = await syncExecution(input, { apply });
  printSyncReport('Test Execution', result);
  if (!apply && result.missingInXray.length > 0) {
    log.dim('  Re-run with --apply to re-attach the Xray-layer tests automatically.');
  }
}
