/**
 * Xray CLI - Test Enrichment Command
 *
 * Command: test enrich
 *
 * Backfills the synced Test markdown cache (`.context/PBI/`) with the two
 * associations the Jira REST API cannot see: Precondition content and Test Set
 * membership. Both are Xray-internal — NOT Jira issue links — so
 * `scripts/sync-jira-issues.ts` never mirrors them; this command reads them
 * from Xray GraphQL and splices a delimited section into each `TEST-*.md`
 * (see `../lib/enrichment.ts` for the section contract and why Preconditions
 * are inlined while Test Sets stay metadata + index).
 *
 * Read-only against Jira/Xray. Additive on disk: missing credentials or a
 * Test unknown to Xray are reported and skipped, never thrown — enrichment
 * must not fail a pipeline that runs it after every sync.
 */

import type { TestEnrichment } from '../lib/enrichment.js';
import type { Flags } from '../types/index.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { loadConfig } from '../lib/config.js';
import {
  buildEnrichmentSection,
  buildTestSetIndexMarkdown,
  extractTestKey,
  spliceEnrichmentSection,

} from '../lib/enrichment.js';
import { graphql, QUERIES } from '../lib/graphql.js';
import { getJiraBaseUrl } from '../lib/jira.js';
import { log } from '../lib/logger.js';
import { getBoolFlag, getFlag } from '../lib/parser.js';

// ============================================================================
// GraphQL RESPONSE SHAPES
// ============================================================================

interface EnrichmentQueryResult {
  getTests: {
    total: number
    results: Array<{
      issueId: string
      jira?: { key?: string }
      preconditions?: {
        results: Array<{
          issueId: string
          preconditionType?: { name?: string }
          definition?: string
          jira?: { key?: string, summary?: string }
        }>
      }
      testSets?: {
        results: Array<{
          issueId: string
          jira?: { key?: string, summary?: string }
        }>
      }
    }>
  }
}

interface TestSetQueryResult {
  getTestSet: {
    issueId: string
    jira?: { key?: string, summary?: string }
    tests?: { total: number, results: Array<{ issueId: string, jira?: { key?: string, summary?: string } }> }
  }
}

// ============================================================================
// FILE DISCOVERY
// ============================================================================

/**
 * Find synced Test files under the PBI cache. They live in
 * `epics/<epic>/stories/<story>/test-cases/` or `epics/_orphans/tests/`;
 * matching on the parent directory name (rather than a fixed depth) tolerates
 * both without hardcoding the tree shape twice.
 */
function findTestFiles(pbiRoot: string): Array<{ key: string, path: string }> {
  const epicsDir = join(pbiRoot, 'epics');
  if (!existsSync(epicsDir)) {
    return [];
  }

  const found: Array<{ key: string, path: string }> = [];
  const entries = readdirSync(epicsDir, { recursive: true }) as string[];

  for (const entry of entries) {
    const name = basename(entry);
    const parent = basename(dirname(entry));
    if (parent !== 'test-cases' && parent !== 'tests') {
      continue;
    }
    const key = extractTestKey(name);
    if (key) {
      found.push({ key, path: join(epicsDir, entry) });
    }
  }

  return found;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// XRAY FETCH
// ============================================================================

function toEnrichment(result: EnrichmentQueryResult['getTests']['results'][number]): TestEnrichment {
  return {
    preconditions: (result.preconditions?.results || [])
      .filter(p => p.jira?.key)
      .map(p => ({
        key: p.jira!.key!,
        summary: p.jira?.summary,
        type: p.preconditionType?.name,
        definition: p.definition,
      })),
    testSets: (result.testSets?.results || [])
      .filter(s => s.jira?.key)
      .map(s => ({ key: s.jira!.key!, summary: s.jira?.summary })),
  };
}

/**
 * Fetch enrichment data for a batch of keys, collecting Test Set issueIds on
 * the way (needed later to resolve full Set membership for the indexes).
 *
 * A `key in (...)` JQL fails WHOLE if any key no longer exists in Jira (e.g.
 * a Test deleted after the last sync), so a failed batch degrades to per-key
 * queries — one stale key must not blank out the other 49.
 */
async function fetchBatch(
  keys: string[],
  enrichments: Map<string, TestEnrichment>,
  setIssueIds: Map<string, string>,
): Promise<void> {
  const collect = (result: EnrichmentQueryResult): void => {
    for (const test of result.getTests.results) {
      const key = test.jira?.key;
      if (!key) {
        continue;
      }
      enrichments.set(key, toEnrichment(test));
      for (const set of test.testSets?.results || []) {
        if (set.jira?.key) {
          setIssueIds.set(set.jira.key, set.issueId);
        }
      }
    }
  };

  try {
    const result = await graphql<EnrichmentQueryResult>(QUERIES.getTestsEnrichment, {
      jql: `key in (${keys.join(', ')})`,
      limit: Math.min(keys.length, 100),
    });
    collect(result);
  }
  catch (error) {
    log.warn(`Batch of ${keys.length} keys failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)}) — retrying per key...`);
    for (const key of keys) {
      try {
        const result = await graphql<EnrichmentQueryResult>(QUERIES.getTestsEnrichment, {
          jql: `key = ${key}`,
          limit: 1,
        });
        collect(result);
      }
      catch {
        // Not found / not visible in Xray — the write loop reports it as skipped.
      }
    }
  }
}

// ============================================================================
// ENRICH
// ============================================================================

export async function enrich(flags: Flags): Promise<void> {
  const pbiRoot = getFlag(flags, 'dir', '.context/PBI') || '.context/PBI';
  const project = getFlag(flags, 'project');
  const batchSize = Number.parseInt(getFlag(flags, 'batch', '50') || '50', 10);
  const dryRun = getBoolFlag(flags, 'dry-run');
  const skipSetIndex = getBoolFlag(flags, 'no-set-index');

  // Missing credentials are a skip, not a crash: enrichment is additive and a
  // sync pipeline without Xray auth still produced a valid (just leaner) cache.
  if (!loadConfig()) {
    log.warn('Xray credentials not configured (run: xray auth login) — enrichment skipped.');
    return;
  }

  log.title(`Xray Test Enrichment - ${pbiRoot}`);

  let files = findTestFiles(pbiRoot);
  if (project) {
    files = files.filter(f => f.key.startsWith(`${project}-`));
  }
  if (files.length === 0) {
    log.warn(`No synced TEST-*.md files found under ${join(pbiRoot, 'epics')}${project ? ` for project ${project}` : ''}.`);
    return;
  }

  // One key can map to several files if a Test was re-parented between syncs;
  // enrich every copy rather than guessing which one is current.
  const filesByKey = new Map<string, string[]>();
  for (const file of files) {
    const paths = filesByKey.get(file.key) || [];
    paths.push(file.path);
    filesByKey.set(file.key, paths);
  }

  const keys = [...filesByKey.keys()];
  log.info(`Found ${files.length} Test file(s) (${keys.length} unique keys)${dryRun ? ' [dry-run]' : ''}`);

  log.dim('Fetching Preconditions + Test Set membership from Xray...');
  const enrichments = new Map<string, TestEnrichment>();
  const setIssueIds = new Map<string, string>();
  for (const batch of chunk(keys, batchSize)) {
    await fetchBatch(batch, enrichments, setIssueIds);
    log.dim(`  Fetched ${Math.min(enrichments.size, keys.length)}/${keys.length} tests...`);
  }

  const jiraBaseUrl = getJiraBaseUrl();
  if (!jiraBaseUrl) {
    log.warn('No Jira host resolved — rendering plain keys instead of /browse/ links.');
  }

  // Splice the section into each file. Unchanged files are not rewritten so
  // repeated runs leave mtimes (and any file watchers) alone.
  let written = 0;
  let unchanged = 0;
  let notInXray = 0;
  for (const [key, paths] of filesByKey) {
    const enrichment = enrichments.get(key);
    if (!enrichment) {
      notInXray++;
      log.dim(`  ${key} not found in Xray — skipped`);
      continue;
    }
    const section = buildEnrichmentSection(enrichment, jiraBaseUrl);
    for (const path of paths) {
      const current = readFileSync(path, 'utf-8');
      const next = spliceEnrichmentSection(current, section);
      if (next === current) {
        unchanged++;
        continue;
      }
      if (!dryRun) {
        writeFileSync(path, next);
      }
      written++;
    }
  }

  // Test Set indexes: membership aggregated Set-first. The Set's FULL member
  // list comes from getTestSet — the per-test data only proves membership of
  // the tests we scanned, and a Set can contain Tests outside this cache.
  let indexesWritten = 0;
  if (!skipSetIndex && setIssueIds.size > 0) {
    const setsDir = join(pbiRoot, 'test-sets');
    log.dim(`Writing ${setIssueIds.size} Test Set index(es) to ${setsDir}...`);
    if (!dryRun && !existsSync(setsDir)) {
      mkdirSync(setsDir, { recursive: true });
    }
    for (const [setKey, issueId] of setIssueIds) {
      try {
        const result = await graphql<TestSetQueryResult>(QUERIES.getTestSet, { issueId });
        const set = result.getTestSet;
        const members = (set.tests?.results || [])
          .filter(t => t.jira?.key)
          .map(t => ({ key: t.jira!.key!, summary: t.jira?.summary }));
        const markdown = buildTestSetIndexMarkdown(
          { key: setKey, summary: set.jira?.summary },
          members,
          jiraBaseUrl,
        );
        if (!dryRun) {
          writeFileSync(join(setsDir, `${setKey}.md`), markdown);
        }
        indexesWritten++;
      }
      catch (error) {
        log.warn(`Test Set ${setKey}: index skipped (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
      }
    }
  }

  log.success(`Enrichment complete${dryRun ? ' (dry-run — nothing written)' : ''}`);
  console.log(`  Files updated:    ${written}`);
  console.log(`  Files unchanged:  ${unchanged}`);
  console.log(`  Not in Xray:      ${notInXray}`);
  console.log(`  Set indexes:      ${indexesWritten}`);
}
