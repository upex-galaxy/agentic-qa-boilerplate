/**
 * Xray CLI - Repair Command
 *
 * Bulk Jira-layer ↔ Xray-layer reconciliation across every Test Execution,
 * Test Plan, and Test Set in a project.
 */

import type { Flags, TestExecutionResult, TestPlanResult, TestSetResult } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, QUERIES } from '../lib/graphql.js';
import { log } from '../lib/logger.js';
import { getBoolFlag, getFlag } from '../lib/parser.js';
import { syncExecution } from './exec.js';
import { syncPlan } from './plan.js';
import { syncSet } from './set.js';

interface DeltaCounts {
  total: number
  inSync: number
  missingInXray: number
  missingInJira: number
  applied: number
}

function emptyCounts(): DeltaCounts {
  return { total: 0, inSync: 0, missingInXray: 0, missingInJira: 0, applied: 0 };
}

export async function repair(flags: Flags): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  if (!project) {
    throw new Error('Missing required flag: --project (or configure a default project via auth login)');
  }
  const apply = getBoolFlag(flags, 'apply');
  const limit = Number.parseInt(getFlag(flags, 'limit', '100') || '100', 10);

  log.title(`Repair scan for project ${project}${apply ? ' (--apply enabled)' : ' (dry-run)'}`);

  // ----- Test Executions -----
  const execJql = `project = ${project} AND issuetype = "Test Execution"`;
  const execList = await graphql<{ getTestExecutions: { total: number, results: TestExecutionResult[] } }>(
    QUERIES.getTestExecutions,
    { jql: execJql, limit },
  );

  log.dim(`\nScanning ${execList.getTestExecutions.results.length} of ${execList.getTestExecutions.total} Test Execution(s)...`);
  const execCounts = emptyCounts();
  for (const exec of execList.getTestExecutions.results) {
    const key = exec.jira?.key ?? exec.issueId;
    execCounts.total += 1;
    try {
      const r = await syncExecution(key, { apply });
      if (r.missingInXray.length === 0 && r.missingInJira.length === 0) {
        execCounts.inSync += 1;
        continue;
      }
      execCounts.missingInXray += r.missingInXray.length;
      execCounts.missingInJira += r.missingInJira.length;
      execCounts.applied += r.applied.length;
      const flagsLabel = [
        r.missingInXray.length > 0 ? `${r.missingInXray.length} missing@Xray` : '',
        r.missingInJira.length > 0 ? `${r.missingInJira.length} missing@Jira` : '',
        r.applied.length > 0 ? `${r.applied.length} re-attached` : '',
      ].filter(Boolean).join(' / ');
      log.warn(`  ${key}: ${flagsLabel}`);
    }
    catch (err) {
      log.error(`  ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ----- Test Plans -----
  const planJql = `project = ${project} AND issuetype = "Test Plan"`;
  const planList = await graphql<{ getTestPlans: { total: number, results: TestPlanResult[] } }>(
    QUERIES.getTestPlans,
    { jql: planJql, limit },
  );

  log.dim(`\nScanning ${planList.getTestPlans.results.length} of ${planList.getTestPlans.total} Test Plan(s)...`);
  const planCounts = emptyCounts();
  for (const planEntity of planList.getTestPlans.results) {
    const key = planEntity.jira?.key ?? planEntity.issueId;
    planCounts.total += 1;
    try {
      const r = await syncPlan(key, { apply });
      if (r.missingInXray.length === 0 && r.missingInJira.length === 0) {
        planCounts.inSync += 1;
        continue;
      }
      planCounts.missingInXray += r.missingInXray.length;
      planCounts.missingInJira += r.missingInJira.length;
      planCounts.applied += r.applied.length;
      const flagsLabel = [
        r.missingInXray.length > 0 ? `${r.missingInXray.length} missing@Xray` : '',
        r.missingInJira.length > 0 ? `${r.missingInJira.length} missing@Jira` : '',
        r.applied.length > 0 ? `${r.applied.length} re-attached` : '',
      ].filter(Boolean).join(' / ');
      log.warn(`  ${key}: ${flagsLabel}`);
    }
    catch (err) {
      log.error(`  ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ----- Test Sets -----
  const setJql = `project = ${project} AND issuetype = "Test Set"`;
  const setList = await graphql<{ getTestSets: { total: number, results: TestSetResult[] } }>(
    QUERIES.getTestSets,
    { jql: setJql, limit },
  );

  log.dim(`\nScanning ${setList.getTestSets.results.length} of ${setList.getTestSets.total} Test Set(s)...`);
  const setCounts = emptyCounts();
  for (const setEntity of setList.getTestSets.results) {
    const key = setEntity.jira?.key ?? setEntity.issueId;
    setCounts.total += 1;
    try {
      const r = await syncSet(key, { apply });
      if (r.missingInXray.length === 0 && r.missingInJira.length === 0) {
        setCounts.inSync += 1;
        continue;
      }
      setCounts.missingInXray += r.missingInXray.length;
      setCounts.missingInJira += r.missingInJira.length;
      setCounts.applied += r.applied.length;
      const flagsLabel = [
        r.missingInXray.length > 0 ? `${r.missingInXray.length} missing@Xray` : '',
        r.missingInJira.length > 0 ? `${r.missingInJira.length} missing@Jira` : '',
        r.applied.length > 0 ? `${r.applied.length} re-attached` : '',
      ].filter(Boolean).join(' / ');
      log.warn(`  ${key}: ${flagsLabel}`);
    }
    catch (err) {
      log.error(`  ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ----- Summary -----
  log.title('\nSummary');
  console.log(`  Test Executions: ${execCounts.inSync}/${execCounts.total} in sync, ${execCounts.missingInXray} missing@Xray, ${execCounts.missingInJira} missing@Jira${apply ? `, ${execCounts.applied} re-attached` : ''}`);
  console.log(`  Test Plans:      ${planCounts.inSync}/${planCounts.total} in sync, ${planCounts.missingInXray} missing@Xray, ${planCounts.missingInJira} missing@Jira${apply ? `, ${planCounts.applied} re-attached` : ''}`);
  console.log(`  Test Sets:       ${setCounts.inSync}/${setCounts.total} in sync, ${setCounts.missingInXray} missing@Xray, ${setCounts.missingInJira} missing@Jira${apply ? `, ${setCounts.applied} re-attached` : ''}`);
  if (!apply && (execCounts.missingInXray > 0 || planCounts.missingInXray > 0 || setCounts.missingInXray > 0)) {
    log.dim('\n  Re-run with --apply to re-attach Xray-layer tests for every drift detected.');
  }
}
