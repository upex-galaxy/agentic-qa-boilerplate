/**
 * Xray CLI - Test Plan Commands
 *
 * Commands: create, list, add-tests, remove-tests
 */

import type { Flags, TestPlanResult } from '../types/index.js';
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

// ============================================================================
// ADD TESTS
// ============================================================================

export async function addTests(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'plan'));
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = await resolveIssueIds(testsStr.split(',').map(t => t.trim()));

  log.dim(`Adding ${testIssueIds.length} tests to plan...`);

  const result = await graphql<{ addTestsToTestPlan: { addedTests: string[] } }>(MUTATIONS.addTestsToTestPlan, {
    issueId,
    testIssueIds,
  });

  log.success(`Added ${result.addTestsToTestPlan.addedTests.length} tests`);
}

// ============================================================================
// REMOVE TESTS
// ============================================================================

export async function removeTests(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'plan'));
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = await resolveIssueIds(testsStr.split(',').map(t => t.trim()));

  log.dim(`Removing ${testIssueIds.length} tests from plan...`);

  await graphql(MUTATIONS.removeTestsFromTestPlan, { issueId, testIssueIds });

  log.success(`Removed ${testIssueIds.length} tests`);
}

// ============================================================================
// SYNC (Jira-layer ↔ Xray-layer reconciliation)
// ============================================================================

export interface PlanSyncResult {
  planKey: string
  planId: string
  jiraLinkedIds: string[]
  xrayAttachedIds: string[]
  missingInXray: { id: string, key: string }[]
  missingInJira: string[]
  applied: string[]
}

export async function syncPlan(input: string, options: { apply: boolean } = { apply: false }): Promise<PlanSyncResult> {
  const issueId = await resolveIssueId(input);
  const xrayResult = await graphql<{ getTestPlan: TestPlanResult }>(QUERIES.getTestPlan, { issueId });
  const planEntity = xrayResult.getTestPlan;
  const planKey = planEntity.jira?.key ?? input;

  const linked = await getLinkedTests(planKey);
  if (linked === null) {
    throw new Error(
      'Jira credentials are required for `plan sync` (the Jira-layer view comes from Jira REST, '
      + 'separate from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  const xrayAttachedIds = (planEntity.tests?.results ?? []).map(t => t.issueId);
  const xraySet = new Set(xrayAttachedIds);
  const linkedSet = new Set(linked.map(l => l.id));

  const missingInXray = linked.filter(l => !xraySet.has(l.id));
  const missingInJira = xrayAttachedIds.filter(id => !linkedSet.has(id));

  const result: PlanSyncResult = {
    planKey,
    planId: issueId,
    jiraLinkedIds: linked.map(l => l.id),
    xrayAttachedIds,
    missingInXray,
    missingInJira,
    applied: [],
  };

  if (options.apply && missingInXray.length > 0) {
    log.dim(`Re-attaching ${missingInXray.length} test(s) at the Xray layer...`);
    const applyResult = await graphql<{ addTestsToTestPlan: { addedTests: string[] } }>(MUTATIONS.addTestsToTestPlan, {
      issueId,
      testIssueIds: missingInXray.map(m => m.id),
    });
    result.applied = applyResult.addTestsToTestPlan.addedTests ?? [];
  }

  return result;
}

export async function sync(flags: Flags): Promise<void> {
  const input = requireFlag(flags, 'plan');
  const apply = getBoolFlag(flags, 'apply');
  const result = await syncPlan(input, { apply });

  log.title(`Test Plan: ${result.planKey} (${result.planId})`);
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
