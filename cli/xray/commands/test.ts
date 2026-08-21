/**
 * Xray CLI - Test Commands
 *
 * Commands: create, get, list, add-step, update-step, remove-step,
 * update-gherkin, update-definition, update-type, enrich (see ./enrich.ts)
 */

import type { Flags, PreconditionResult, TestResult, TestStepResponse } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { log, warnCountedButUnresolved, warnIfTruncated } from '../lib/logger.js';
import { getFlag, getFlagArray, requireFlag } from '../lib/parser.js';

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
  const testType = getFlag(flags, 'type', 'Manual');
  const description = getFlag(flags, 'description');
  const labelsStr = getFlag(flags, 'labels');
  const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : undefined;
  const folderPath = getFlag(flags, 'folder');

  // Manual steps are NOT created here. Xray Cloud's `createTest` mutation
  // accepts a `steps` argument but does not persist it reliably (steps silently
  // drop — observed stepCount:0 after a "Test created" success). The reliable
  // path is the dedicated `addTestStep` mutation. We therefore create the test
  // WITHOUT inline steps and require a follow-up `test add-step` per step.
  const stepsFlags = getFlagArray(flags, 'step');

  let unstructured: string | undefined;
  let gherkin: string | undefined;

  if (testType === 'Generic') {
    unstructured = getFlag(flags, 'definition') || summary;
  }
  else if (testType === 'Cucumber') {
    gherkin = getFlag(flags, 'gherkin');
    if (!gherkin) {
      throw new Error('Cucumber tests require --gherkin flag with feature definition');
    }
  }

  log.dim(`Creating ${testType} test in project ${projectKey}...`);

  const result = await graphql<{ createTest: { test: { jira: { key: string, summary: string }, testType: { name: string }, issueId: string }, warnings: string[] } }>(MUTATIONS.createTest, {
    testType: { name: testType },
    unstructured,
    gherkin,
    projectKey,
    summary,
    description,
    labels,
    folderPath,
  });

  const test = result.createTest.test;
  const warnings = result.createTest.warnings;

  log.success(`Test created: ${test.jira.key}`);
  console.log(`  Summary: ${test.jira.summary}`);
  console.log(`  Type: ${test.testType.name}`);
  console.log(`  Issue ID: ${test.issueId}`);

  if (warnings && warnings.length > 0) {
    log.warn('Warnings:');
    warnings.forEach((w: string) => console.log(`  - ${w}`));
  }

  // Surface the two-step requirement loudly so the operator never assumes the
  // steps they passed on `create` were persisted (they are not).
  if (stepsFlags.length > 0) {
    log.warn(`${stepsFlags.length} --step value(s) were NOT added — Xray Cloud does not persist steps on create.`);
    log.warn('Add each step explicitly, e.g.:');
    stepsFlags.forEach((s) => {
      const parts = s.split('|');
      const action = parts[0] ?? s;
      const hasData = parts.length >= 3;
      const data = hasData ? parts[1] : '';
      const expected = hasData ? parts[2] : (parts[1] ?? '');
      const dataFlag = data ? ` --data "${data}"` : '';
      const resultFlag = expected ? ` --result "${expected}"` : '';
      console.log(`  bun xray test add-step --test ${test.issueId} --action "${action}"${dataFlag}${resultFlag}`);
    });
  }
}

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const key = positional[0] || getFlag(flags, 'key');
  const issueId = getFlag(flags, 'id');

  if (!key && !issueId) {
    throw new Error('Test key or --id required. Usage: xray test get PROJ-123 | xray test get --id 11942');
  }

  // Addressing by numeric issueId is the only way to reach a test whose key you
  // do not know, and the handle that survives a JQL-unfriendly context.
  const result = issueId
    ? await graphql<{ getTests: { results: TestResult[] } }>(QUERIES.getTestById, { issueIds: [issueId] })
    : await graphql<{ getTests: { results: TestResult[] } }>(QUERIES.getTest, { jql: `key = ${key}` });

  if (!result.getTests.results || result.getTests.results.length === 0) {
    throw new Error(`Test not found: ${key || `id ${issueId}`}`);
  }

  const test = result.getTests.results[0];

  log.title(`Test: ${test.jira.key}`);
  console.log(`Summary: ${test.jira.summary}`);
  console.log(`Type: ${test.testType.name}`);
  const testStatus = typeof test.jira.status === 'object' && test.jira.status !== null ? test.jira.status.name : (test.jira.status || 'Unknown');
  console.log(`Status: ${testStatus}`);
  console.log(`Issue ID: ${test.issueId}`);

  if (test.jira.labels && test.jira.labels.length > 0) {
    console.log(`Labels: ${test.jira.labels.join(', ')}`);
  }

  if (test.steps && test.steps.length > 0) {
    console.log(`\nSteps (${test.steps.length}):`);
    test.steps.forEach((s: TestStepResponse, i: number) => {
      console.log(`  ${i + 1}. ${s.action}`);
      if (s.data) {
        console.log(`     Data: ${s.data}`);
      }
      if (s.result) {
        console.log(`     Expected: ${s.result}`);
      }
    });
  }

  if (test.gherkin) {
    console.log('\nGherkin:');
    console.log(`  ${test.gherkin.split('\n').join('\n  ')}`);
  }

  if (test.unstructured) {
    console.log('\nDefinition:');
    console.log(`  ${test.unstructured}`);
  }

  if (test.preconditions?.results?.length) {
    console.log('\nPreconditions:');
    test.preconditions.results.forEach((p: PreconditionResult) => {
      console.log(`  - ${p.jira.key}: ${p.jira.summary}`);
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
    || (project ? `project = ${project} AND issuetype = Test` : 'issuetype = Test');

  const result = await graphql<{ getTests: { total: number, results: TestResult[] } }>(QUERIES.getTests, { jql, limit });

  log.title(`Tests (${result.getTests.total} total, showing ${result.getTests.results.length})`);

  if (result.getTests.results.length === 0) {
    if (result.getTests.total > 0 && limit > 0) {
      warnCountedButUnresolved('tests', result.getTests.total);
      return;
    }
    log.warn('No tests found');
    return;
  }

  warnIfTruncated(result.getTests.total, result.getTests.results.length, limit);

  result.getTests.results.forEach((t: TestResult) => {
    const rawStatus = t.jira.status;
    const status = typeof rawStatus === 'object' && rawStatus !== null ? rawStatus.name : (rawStatus || 'Unknown');
    console.log(`${t.jira.key}  [${t.testType.name}]  ${status}  ${t.jira.summary}`);
  });
}

// ============================================================================
// ADD STEP
// ============================================================================

export async function addStep(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const action = requireFlag(flags, 'action');
  const data = getFlag(flags, 'data');
  const result = getFlag(flags, 'result');

  log.dim(`Adding step to test ${issueId}...`);

  const response = await graphql<{ addTestStep: TestStepResponse }>(MUTATIONS.addTestStep, {
    issueId,
    step: { action, data, result },
  });

  const step = response.addTestStep;
  log.success(`Step added (ID: ${step.id})`);
  console.log(`  Action: ${step.action}`);
  if (step.data) {
    console.log(`  Data: ${step.data}`);
  }
  if (step.result) {
    console.log(`  Expected: ${step.result}`);
  }
}

// ============================================================================
// UPDATE STEP
// ============================================================================

export async function updateStep(flags: Flags, positional: string[]): Promise<void> {
  // The test reference is accepted for symmetry with add-step/remove-step and
  // for self-documenting invocations; Xray's updateTestStep addresses the step
  // by its own id alone (step ids are globally unique).
  const testRef = positional[0] || getFlag(flags, 'test');
  const stepId = requireFlag(flags, 'step');
  const action = getFlag(flags, 'action');
  const data = getFlag(flags, 'data');
  const result = getFlag(flags, 'result');

  if (action === undefined && data === undefined && result === undefined) {
    throw new Error('Nothing to update: pass at least one of --action / --data / --result');
  }

  // Only the provided fields go into UpdateStepInput — an omitted flag leaves
  // that field of the step untouched.
  const step: { action?: string, data?: string, result?: string } = {};
  if (action !== undefined) {
    step.action = action;
  }
  if (data !== undefined) {
    step.data = data;
  }
  if (result !== undefined) {
    step.result = result;
  }

  log.dim(`Updating step ${stepId}${testRef ? ` of test ${testRef}` : ''}...`);

  const response = await graphql<{ updateTestStep: TestStepResponse }>(MUTATIONS.updateTestStep, {
    stepId,
    step,
  });

  const updated = response.updateTestStep;
  log.success(`Step updated (ID: ${updated.id})`);
  console.log(`  Action: ${updated.action}`);
  if (updated.data) {
    console.log(`  Data: ${updated.data}`);
  }
  if (updated.result) {
    console.log(`  Expected: ${updated.result}`);
  }
}

// ============================================================================
// REMOVE STEP
// ============================================================================

export async function removeStep(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const stepId = requireFlag(flags, 'step');

  log.dim(`Removing step ${stepId} from test ${issueId}...`);

  await graphql<{ deleteTestStep: boolean }>(MUTATIONS.deleteTestStep, {
    issueId,
    stepId,
  });

  log.success(`Step ${stepId} removed from test ${issueId}`);
}

// ============================================================================
// UPDATE DEFINITION (enrich an EXISTING test — Gherkin / unstructured / type)
// ============================================================================

export async function updateGherkin(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const gherkin = requireFlag(flags, 'gherkin');

  log.dim(`Updating Gherkin definition of test ${issueId}...`);

  const response = await graphql<{ updateGherkinTestDefinition: { issueId: string } }>(
    MUTATIONS.updateGherkinTestDefinition,
    { issueId, gherkin },
  );

  log.success(`Gherkin definition updated (issueId: ${response.updateGherkinTestDefinition.issueId})`);
}

export async function updateDefinition(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const unstructured = requireFlag(flags, 'definition');

  log.dim(`Updating unstructured definition of test ${issueId}...`);

  const response = await graphql<{ updateUnstructuredTestDefinition: { issueId: string } }>(
    MUTATIONS.updateUnstructuredTestDefinition,
    { issueId, unstructured },
  );

  log.success(`Definition updated (issueId: ${response.updateUnstructuredTestDefinition.issueId})`);
}

export async function updateType(flags: Flags): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const typeName = requireFlag(flags, 'type');

  log.dim(`Updating test type of ${issueId} to ${typeName}...`);

  const response = await graphql<{ updateTestType: { issueId: string, testType: { name: string } } }>(
    MUTATIONS.updateTestType,
    { issueId, testType: { name: typeName } },
  );

  log.success(`Test type updated to ${response.updateTestType.testType.name} (issueId: ${response.updateTestType.issueId})`);
}

// ============================================================================
// ENRICH (re-export)
// ============================================================================

// `test enrich` routes through this module like every other test subcommand,
// but its implementation is large enough (fs walking + batch fetching) to
// live in its own file.
export { enrich } from './enrich.js';
