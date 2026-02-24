/**
 * Xray CLI - Test Set Commands
 *
 * Commands: create, get, list, add-tests, remove-tests
 */

import type { Flags, TestResult, TestSetResult } from '../types/index.js';
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
  const issueId = positional[0] || requireFlag(flags, 'id');

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

  log.title(`Test Sets (${result.getTestSets.total} total)`);

  if (result.getTestSets.results.length === 0) {
    log.warn('No test sets found');
    return;
  }

  result.getTestSets.results.forEach((s: TestSetResult) => {
    const sStatus = typeof s.jira.status === 'object' && s.jira.status !== null ? s.jira.status.name : (s.jira.status || 'Unknown');
    console.log(`${s.jira.key}  ${sStatus}  ${s.jira.summary}`);
  });
}

// ============================================================================
// ADD TESTS
// ============================================================================

export async function addTests(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'set');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

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
  const issueId = requireFlag(flags, 'set');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

  log.dim(`Removing ${testIssueIds.length} tests from test set...`);

  const result = await graphql<{ removeTestsFromTestSet: { removedTests: string[] } }>(MUTATIONS.removeTestsFromTestSet, {
    issueId,
    testIssueIds,
  });

  log.success(`Removed ${result.removeTestsFromTestSet.removedTests.length} tests`);
}
