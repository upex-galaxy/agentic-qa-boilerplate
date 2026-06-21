/**
 * Xray CLI - Precondition Commands
 *
 * Commands: create, add-to-test, update
 *
 * Preconditions are first-class Xray issues (issuetype `Precondition`) that hold
 * setup state shared across Tests. The GraphQL mutations were always present in
 * the client (`createPrecondition`, `addPreconditionsToTest`, `updatePrecondition`)
 * — these commands expose them so operators no longer have to drop to raw GraphQL.
 */

import type { Flags } from '../types/index.js';
import { loadConfig } from '../lib/config.js';
import { graphql, MUTATIONS } from '../lib/graphql.js';
import { resolveIssueId, resolveIssueIds } from '../lib/jira.js';
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
