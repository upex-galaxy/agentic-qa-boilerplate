/**
 * Xray CLI - Test Commands
 *
 * Commands: create, get, list, add-step
 */

import type { Flags, PreconditionResult, TestResult, TestStep, TestStepResponse } from '../types/index.js';
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
  const testType = getFlag(flags, 'type', 'Manual');
  const description = getFlag(flags, 'description');
  const labelsStr = getFlag(flags, 'labels');
  const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : undefined;
  const folderPath = getFlag(flags, 'folder');

  // Collect all --step flags
  const stepsFlags: string[] = [];
  for (const [key, value] of Object.entries(flags)) {
    if (key === 'step' && typeof value === 'string') {
      stepsFlags.push(value);
    }
  }

  let steps: TestStep[] | undefined;
  let unstructured: string | undefined;
  let gherkin: string | undefined;

  if (testType === 'Manual' && stepsFlags.length > 0) {
    steps = stepsFlags.map((s) => {
      const parts = s.split('|');
      if (parts.length === 2) {
        return { action: parts[0], result: parts[1] };
      }
      else if (parts.length >= 3) {
        return { action: parts[0], data: parts[1], result: parts[2] };
      }
      return { action: s, result: '' };
    });
  }
  else if (testType === 'Generic') {
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
    steps,
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
}

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const key = positional[0] || getFlag(flags, 'key');
  if (!key) {
    throw new Error('Test key required. Usage: xray test get PROJ-123');
  }

  const result = await graphql<{ getTests: { results: TestResult[] } }>(QUERIES.getTest, {
    jql: `key = ${key}`,
  });

  if (!result.getTests.results || result.getTests.results.length === 0) {
    throw new Error(`Test not found: ${key}`);
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
    log.warn('No tests found');
    return;
  }

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
