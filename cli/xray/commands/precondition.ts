/**
 * Xray CLI - Precondition Commands
 *
 * Commands: create, list, get, add-to-test, remove-from-test, update
 *
 * Preconditions are first-class Xray issues (issuetype `Precondition`) that hold
 * setup state shared across Tests. The GraphQL mutations were always present in
 * the client (`createPrecondition`, `addPreconditionsToTest`, `updatePrecondition`)
 * — these commands expose them so operators no longer have to drop to raw GraphQL.
 */

import type { Flags, PreconditionResult } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS, QUERIES } from '../lib/graphql.js';
import { resolveIssueId, resolveIssueIds } from '../lib/jira.js';
import { log, warnCountedButUnresolved, warnIfTruncated } from '../lib/logger.js';
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
  const preconditionType = getFlag(flags, 'type', 'Manual');
  const definition = getFlag(flags, 'definition');
  const description = getFlag(flags, 'description');
  const labelsStr = getFlag(flags, 'labels');
  const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : undefined;
  const folderPath = getFlag(flags, 'folder');

  log.dim(`Creating ${preconditionType} precondition in project ${projectKey}...`);

  const result = await graphql<{ createPrecondition: { precondition: { issueId: string, preconditionType: { name: string }, jira: { key: string, summary: string } }, warnings: string[] } }>(
    MUTATIONS.createPrecondition,
    {
      preconditionType: { name: preconditionType },
      definition,
      projectKey,
      summary,
      description,
      labels,
      folderPath,
    },
  );

  const pre = result.createPrecondition.precondition;
  const warnings = result.createPrecondition.warnings;

  log.success(`Precondition created: ${pre.jira.key}`);
  console.log(`  Summary: ${pre.jira.summary}`);
  console.log(`  Type: ${pre.preconditionType.name}`);
  console.log(`  Issue ID: ${pre.issueId}`);

  if (warnings && warnings.length > 0) {
    log.warn('Warnings:');
    warnings.forEach((w: string) => console.log(`  - ${w}`));
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
    || (project ? `project = ${project} AND issuetype = "Precondition"` : 'issuetype = "Precondition"');

  const result = await graphql<{ getPreconditions: { total: number, results: PreconditionResult[] } }>(QUERIES.getPreconditions, { jql, limit });

  log.title(`Preconditions (${result.getPreconditions.total} total, showing ${result.getPreconditions.results.length})`);

  if (result.getPreconditions.results.length === 0) {
    if (result.getPreconditions.total > 0 && limit > 0) {
      warnCountedButUnresolved('preconditions', result.getPreconditions.total);
      return;
    }
    log.warn('No preconditions found');
    return;
  }

  warnIfTruncated(result.getPreconditions.total, result.getPreconditions.results.length, limit);

  result.getPreconditions.results.forEach((p: PreconditionResult) => {
    const pStatus = typeof p.jira.status === 'object' && p.jira.status !== null ? p.jira.status.name : (p.jira.status || 'Unknown');
    console.log(`${p.jira.key}  [${p.preconditionType?.name ?? 'Unknown'}]  ${pStatus}  ${p.jira.summary}`);
  });
}

// ============================================================================
// GET
// ============================================================================

export async function get(flags: Flags, positional: string[]): Promise<void> {
  const key = positional[0] || getFlag(flags, 'key');
  const issueId = getFlag(flags, 'id');

  if (!key && !issueId) {
    throw new Error('Precondition key or --id required. Usage: xray precondition get PROJ-123 | xray precondition get --id 11942');
  }

  // Same dual addressing as `test get`: JQL by key needs no Jira credentials,
  // numeric issueId is the handle that survives a JQL-unfriendly context.
  const result = issueId
    ? await graphql<{ getPreconditions: { results: PreconditionResult[] } }>(QUERIES.getPrecondition, { issueIds: [issueId] })
    : await graphql<{ getPreconditions: { results: PreconditionResult[] } }>(QUERIES.getPrecondition, { jql: `key = ${key}` });

  if (!result.getPreconditions.results || result.getPreconditions.results.length === 0) {
    throw new Error(`Precondition not found: ${key || `id ${issueId}`}`);
  }

  const pre = result.getPreconditions.results[0];

  log.title(`Precondition: ${pre.jira.key}`);
  console.log(`Summary: ${pre.jira.summary}`);
  console.log(`Type: ${pre.preconditionType?.name ?? 'Unknown'}`);
  const preStatus = typeof pre.jira.status === 'object' && pre.jira.status !== null ? pre.jira.status.name : (pre.jira.status || 'Unknown');
  console.log(`Status: ${preStatus}`);
  console.log(`Issue ID: ${pre.issueId}`);

  if (pre.jira.labels && pre.jira.labels.length > 0) {
    console.log(`Labels: ${pre.jira.labels.join(', ')}`);
  }

  if (pre.definition) {
    console.log('\nDefinition:');
    console.log(`  ${pre.definition.split('\n').join('\n  ')}`);
  }

  if (pre.tests?.results?.length) {
    console.log(`\nUsed by ${pre.tests.total} test(s):`);
    pre.tests.results.forEach((t) => {
      console.log(`  - ${t.jira.key}: ${t.jira.summary}`);
    });
  }
}

// ============================================================================
// ADD TO TEST
// ============================================================================

export async function addToTest(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'test'));
  const preStr = requireFlag(flags, 'preconditions');
  const preconditionIssueIds = await resolveIssueIds(preStr.split(',').map(p => p.trim()));

  log.dim(`Adding ${preconditionIssueIds.length} precondition(s) to test ${issueId}...`);

  const result = await graphql<{ addPreconditionsToTest: { addedPreconditions: string[], warning?: string } }>(
    MUTATIONS.addPreconditionsToTest,
    { issueId, preconditionIssueIds },
  );

  const added = result.addPreconditionsToTest.addedPreconditions ?? [];
  log.success(`Added ${added.length} precondition(s) to test ${issueId}`);
  if (result.addPreconditionsToTest.warning) {
    log.warn(result.addPreconditionsToTest.warning);
  }
}

// ============================================================================
// REMOVE FROM TEST
// ============================================================================

export async function removeFromTest(flags: Flags, positional: string[]): Promise<void> {
  const preconditionId = await resolveIssueId(positional[0] || requireFlag(flags, 'precondition'));
  const testId = await resolveIssueId(requireFlag(flags, 'test'));

  log.dim(`Removing precondition ${preconditionId} from test ${testId}...`);

  await graphql<{ removePreconditionsFromTest: string }>(
    MUTATIONS.removePreconditionsFromTest,
    { issueId: testId, preconditionIssueIds: [preconditionId] },
  );

  log.success(`Precondition ${preconditionId} removed from test ${testId}`);
}

// ============================================================================
// UPDATE (definition / type)
// ============================================================================

export async function update(flags: Flags): Promise<void> {
  const issueId = await resolveIssueId(requireFlag(flags, 'precondition'));
  const definition = getFlag(flags, 'definition');
  const type = getFlag(flags, 'type');

  if (definition === undefined && type === undefined) {
    throw new Error('Nothing to update: pass --definition and/or --type');
  }

  const data: { definition?: string, preconditionType?: { name: string } } = {};
  if (definition !== undefined) {
    data.definition = definition;
  }
  if (type !== undefined) {
    data.preconditionType = { name: type };
  }

  log.dim(`Updating precondition ${issueId}...`);

  await graphql<{ updatePrecondition: { issueId: string, definition?: string } }>(
    MUTATIONS.updatePrecondition,
    { issueId, data },
  );

  log.success(`Precondition ${issueId} updated`);
}
