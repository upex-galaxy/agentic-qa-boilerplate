/**
 * Xray CLI - Execution Commands
 *
 * Commands: create, get, list, add-tests, remove-tests
 */

import type { Flags, TestExecutionResult, TestRunResult } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { log } from '../lib/logger.js';
import { getFlag, requireFlag } from '../lib/parser.js';

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
  const testIssueIds = testsStr ? testsStr.split(',').map(t => t.trim()) : [];

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
  const issueId = positional[0] || requireFlag(flags, 'id');

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
  const issueId = requireFlag(flags, 'execution');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

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
  const issueId = requireFlag(flags, 'execution');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

  log.dim(`Removing ${testIssueIds.length} tests from execution...`);

  const result = await graphql<{ removeTestsFromTestExecution: { removedTests: string[] } }>(MUTATIONS.removeTestsFromTestExecution, {
    issueId,
    testIssueIds,
  });

  log.success(`Removed ${result.removeTestsFromTestExecution.removedTests.length} tests`);
}
