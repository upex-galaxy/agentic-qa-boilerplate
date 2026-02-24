/**
 * Xray CLI - Test Plan Commands
 *
 * Commands: create, list
 */

import type { Flags, TestPlanResult } from '../types/index.js';
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

  log.dim(`Creating Test Plan in project ${projectKey}...`);

  const result = await graphql<{ createTestPlan: { testPlan: { jira: { key: string, summary: string }, issueId: string } } }>(MUTATIONS.createTestPlan, {
    projectKey,
    summary,
    description,
    testIssueIds,
  });

  const plan = result.createTestPlan.testPlan;
  log.success(`Test Plan created: ${plan.jira.key}`);
  console.log(`  Summary: ${plan.jira.summary}`);
}

// ============================================================================
// LIST
// ============================================================================

export async function list(flags: Flags): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql = getFlag(flags, 'jql')
    || (project ? `project = ${project} AND issuetype = "Test Plan"` : 'issuetype = "Test Plan"');

  const result = await graphql<{ getTestPlans: { total: number, results: TestPlanResult[] } }>(QUERIES.getTestPlans, { jql, limit });

  log.title(`Test Plans (${result.getTestPlans.total} total)`);

  if (result.getTestPlans.results.length === 0) {
    log.warn('No test plans found');
    return;
  }

  result.getTestPlans.results.forEach((p: TestPlanResult) => {
    const pStatus = typeof p.jira.status === 'object' && p.jira.status !== null ? p.jira.status.name : (p.jira.status || 'Unknown');
    console.log(`${p.jira.key}  ${pStatus}  ${p.jira.summary}`);
  });
}
