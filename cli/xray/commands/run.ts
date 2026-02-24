/**
 * Xray CLI - Test Run Commands
 *
 * Commands: get, status, step-status, comment, defect
 */

import type { Flags, TestRunResult, TestStepResponse } from '../types/index.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { log } from '../lib/logger.js';
import { getFlag, requireFlag } from '../lib/parser.js';

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const id = positional[0] || requireFlag(flags, 'id');

  const result = await graphql<{ getTestRunById: TestRunResult }>(QUERIES.getTestRunById, { id });
  const run = result.getTestRunById;

  log.title(`Test Run: ${run.id}`);
  console.log(`Test: ${run.test?.jira?.key || 'Unknown'} - ${run.test?.jira?.summary || ''}`);
  console.log(`Execution: ${run.testExecution?.jira?.key || 'Unknown'}`);
  console.log(`Status: ${run.status.name}`);

  if (run.comment) {
    console.log(`Comment: ${run.comment}`);
  }
  if (run.startedOn) {
    console.log(`Started: ${run.startedOn}`);
  }
  if (run.finishedOn) {
    console.log(`Finished: ${run.finishedOn}`);
  }
  if (run.defects && run.defects.length > 0) {
    console.log(`Defects: ${run.defects.join(', ')}`);
  }

  if (run.steps && run.steps.length > 0) {
    console.log(`\nSteps (${run.steps.length}):`);
    run.steps.forEach((s: TestStepResponse, i: number) => {
      const statusIcon = s.status?.name === 'PASSED' ? '✔' : s.status?.name === 'FAILED' ? '✖' : '○';
      console.log(`  ${statusIcon} ${i + 1}. ${s.action} [${s.status?.name || 'TODO'}]`);
      console.log(`     ID: ${s.id}`);
    });
  }
}

// ============================================================================
// STATUS
// ============================================================================

export async function status(flags: Flags): Promise<void> {
  const id = requireFlag(flags, 'id');
  const statusValue = requireFlag(flags, 'status').toUpperCase();

  const validStatuses = ['TODO', 'EXECUTING', 'PASSED', 'FAILED', 'ABORTED', 'BLOCKED'];
  if (!validStatuses.includes(statusValue)) {
    throw new Error(`Invalid status. Valid values: ${validStatuses.join(', ')}`);
  }

  log.dim(`Updating test run ${id} to ${statusValue}...`);

  await graphql(MUTATIONS.updateTestRunStatus, { id, status: statusValue });

  log.success(`Test run status updated to ${statusValue}`);
}

// ============================================================================
// STEP STATUS
// ============================================================================

export async function stepStatus(flags: Flags): Promise<void> {
  const testRunId = requireFlag(flags, 'run');
  const stepId = requireFlag(flags, 'step');
  const statusValue = requireFlag(flags, 'status').toUpperCase();

  log.dim(`Updating step ${stepId} to ${statusValue}...`);

  await graphql(MUTATIONS.updateTestRunStepStatus, { testRunId, stepId, status: statusValue });

  log.success(`Step status updated to ${statusValue}`);
}

// ============================================================================
// COMMENT
// ============================================================================

export async function comment(flags: Flags): Promise<void> {
  const id = requireFlag(flags, 'id');
  const commentText = requireFlag(flags, 'comment');

  log.dim(`Adding comment to test run ${id}...`);

  await graphql(MUTATIONS.updateTestRunComment, { id, comment: commentText });

  log.success('Comment added');
}

// ============================================================================
// DEFECT
// ============================================================================

export async function defect(flags: Flags): Promise<void> {
  const id = requireFlag(flags, 'id');
  const issuesStr = requireFlag(flags, 'issues');
  const issues = issuesStr.split(',').map(i => i.trim());

  log.dim(`Adding ${issues.length} defects to test run...`);

  const result = await graphql<{ addDefectsToTestRun: { addedDefects: string[] } }>(MUTATIONS.addDefectsToTestRun, { id, issues });

  log.success(`Added ${result.addDefectsToTestRun.addedDefects.length} defects`);
}

// ============================================================================
// LIST (get runs from an execution)
// ============================================================================

export async function listRuns(flags: Flags): Promise<void> {
  const execId = getFlag(flags, 'execution');
  if (!execId) {
    throw new Error('Missing --execution flag. Usage: xray run list --execution EXEC_ID');
  }

  const result = await graphql<{ getTestExecution: { testRuns: { results: TestRunResult[] } } }>(QUERIES.getTestExecution, { issueId: execId });

  if (!result.getTestExecution.testRuns?.results?.length) {
    log.warn('No test runs found');
    return;
  }

  log.title('Test Runs');
  result.getTestExecution.testRuns.results.forEach((run: TestRunResult) => {
    console.log(`${run.id}  [${run.status.name}]  ${run.test?.jira?.key || 'Unknown'}`);
  });
}
