/**
 * Xray CLI - Test Run Commands
 *
 * Commands: get, status, step-status, comment, defect, evidence,
 * step-evidence, evidence-list, evidence-rm
 */

import type {
  AddEvidenceResult,
  AttachmentDataInput,
  Flags,
  RemoveEvidenceResult,
  TestRunResult,
  TestStepResponse,
} from '../types/index.js';
import { chunkAttachments, listDirFiles, readFileAsAttachment } from '../lib/evidence.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { resolveIssueId } from '../lib/jira.js';
import { log } from '../lib/logger.js';
import { getFlag, getFlagArray, requireFlag } from '../lib/parser.js';

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

  // Xray's DEFAULT vocabulary. It is not the instance's: a project can drop
  // statuses (one measured instance accepts only TODO / EXECUTING / PASSED /
  // FAILED) and Xray rejects the others at mutation time. This list therefore
  // only catches typos; the instance has the last word, and the error below is
  // what tells the caller so instead of leaving a bare GraphQL failure.
  const defaultStatuses = ['TODO', 'EXECUTING', 'PASSED', 'FAILED', 'ABORTED', 'BLOCKED'];
  if (!defaultStatuses.includes(statusValue)) {
    log.warn(
      `'${statusValue}' is not one of Xray's default statuses (${defaultStatuses.join(', ')}). `
      + 'Sending it anyway — a project may define its own.',
    );
  }

  log.dim(`Updating test run ${id} to ${statusValue}...`);

  try {
    await graphql(MUTATIONS.updateTestRunStatus, { id, status: statusValue });
  }
  catch (err) {
    throw new Error(
      `Could not set run ${id} to ${statusValue}: ${err instanceof Error ? err.message : String(err)}\n`
      + 'If the status was rejected, this project does not define it. Xray statuses are per-instance '
      + '(Settings -> Test Run Statuses); a project may accept only TODO / EXECUTING / PASSED / FAILED. '
      + 'Record a blocked or aborted case in the status the project DOES define, and say so in the run '
      + 'comment (\'run comment --id <id> --comment ...\') — never leave the run TODO as if it was never executed.',
    );
  }

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
// STEP COMMENT
// ============================================================================

export async function stepComment(flags: Flags): Promise<void> {
  const testRunId = requireFlag(flags, 'run');
  const stepId = requireFlag(flags, 'step');
  const commentText = requireFlag(flags, 'comment');

  log.dim(`Updating step ${stepId} comment on run ${testRunId}...`);

  await graphql(MUTATIONS.updateTestRunStepComment, { testRunId, stepId, comment: commentText });

  log.success('Step comment updated');
}

// ============================================================================
// EVIDENCE — UPLOAD
// ============================================================================

function collectEvidenceFiles(flags: Flags): string[] {
  const files = getFlagArray(flags, 'file');
  const dir = getFlag(flags, 'dir');
  if (dir) {
    files.push(...listDirFiles(dir));
  }
  return files;
}

async function uploadEvidenceBatches(
  mutation: string,
  baseVariables: Record<string, unknown>,
  attachments: AttachmentDataInput[],
  resultKey: 'addEvidenceToTestRun' | 'addEvidenceToTestRunStep',
): Promise<{ uploaded: number, warnings: string[] }> {
  const batches = chunkAttachments(attachments);
  let uploaded = 0;
  const warnings: string[] = [];
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    if (batches.length > 1) {
      log.dim(`  Batch ${i + 1}/${batches.length}: ${batch.length} file(s)...`);
    }
    const result = await graphql<Record<typeof resultKey, AddEvidenceResult>>(
      mutation,
      { ...baseVariables, evidence: batch },
    );
    const payload = result[resultKey];
    uploaded += payload.addedEvidence?.length ?? 0;
    if (payload.warnings?.length) {
      warnings.push(...payload.warnings);
    }
  }
  return { uploaded, warnings };
}

export async function evidence(flags: Flags): Promise<void> {
  const id = requireFlag(flags, 'id');
  const files = collectEvidenceFiles(flags);
  if (files.length === 0) {
    throw new Error('Provide at least one --file <path> (repeatable) or --dir <directory>');
  }

  log.dim(`Reading ${files.length} file(s) for upload to test run ${id}...`);
  const attachments = files.map(readFileAsAttachment);

  const { uploaded, warnings } = await uploadEvidenceBatches(
    MUTATIONS.addEvidenceToTestRun,
    { id },
    attachments,
    'addEvidenceToTestRun',
  );

  log.success(`Uploaded ${uploaded} / ${files.length} attachment(s)`);
  for (const w of warnings) {
    log.warn(w);
  }
}

export async function stepEvidence(flags: Flags): Promise<void> {
  const testRunId = requireFlag(flags, 'run');
  const stepId = requireFlag(flags, 'step');
  const files = collectEvidenceFiles(flags);
  if (files.length === 0) {
    throw new Error('Provide at least one --file <path> (repeatable) or --dir <directory>');
  }

  log.dim(`Reading ${files.length} file(s) for upload to step ${stepId} of run ${testRunId}...`);
  const attachments = files.map(readFileAsAttachment);

  const { uploaded, warnings } = await uploadEvidenceBatches(
    MUTATIONS.addEvidenceToTestRunStep,
    { testRunId, stepId },
    attachments,
    'addEvidenceToTestRunStep',
  );

  log.success(`Uploaded ${uploaded} / ${files.length} attachment(s) to step ${stepId}`);
  for (const w of warnings) {
    log.warn(w);
  }
}

// ============================================================================
// EVIDENCE — LIST / REMOVE
// ============================================================================

export async function evidenceList(flags: Flags): Promise<void> {
  const id = requireFlag(flags, 'id');

  const result = await graphql<{ getTestRunById: TestRunResult }>(QUERIES.getTestRunById, { id });
  const run = result.getTestRunById;

  log.title(`Evidence on test run ${run.id}`);
  if (!run.evidence || run.evidence.length === 0) {
    log.warn('No evidence attached');
    return;
  }
  run.evidence.forEach((e: { id: string, filename: string }) => {
    console.log(`  ${e.id}  ${e.filename}`);
  });
}

export async function evidenceRm(flags: Flags): Promise<void> {
  const id = requireFlag(flags, 'id');
  const evidenceIds = getFlagArray(flags, 'evidence');
  const evidenceFilenames = getFlagArray(flags, 'filename');

  if (evidenceIds.length === 0 && evidenceFilenames.length === 0) {
    throw new Error('Provide at least one --evidence <id> or --filename <name> (both flags are repeatable)');
  }

  log.dim(`Removing ${evidenceIds.length + evidenceFilenames.length} attachment(s) from run ${id}...`);

  const result = await graphql<{ removeEvidenceFromTestRun: RemoveEvidenceResult }>(
    MUTATIONS.removeEvidenceFromTestRun,
    {
      id,
      evidenceIds: evidenceIds.length > 0 ? evidenceIds : null,
      evidenceFilenames: evidenceFilenames.length > 0 ? evidenceFilenames : null,
    },
  );

  const removed = result.removeEvidenceFromTestRun.removedEvidence?.length ?? 0;
  log.success(`Removed ${removed} attachment(s)`);
  for (const w of result.removeEvidenceFromTestRun.warnings || []) {
    log.warn(w);
  }
}

// ============================================================================
// LIST (get runs from an execution)
// ============================================================================

export async function listRuns(flags: Flags): Promise<void> {
  const execFlag = getFlag(flags, 'execution');
  if (!execFlag) {
    throw new Error('Missing --execution flag. Usage: xray run list --execution EXEC_ID');
  }
  const execId = await resolveIssueId(execFlag);

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
