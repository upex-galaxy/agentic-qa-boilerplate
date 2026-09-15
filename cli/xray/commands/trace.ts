/**
 * Xray CLI - Traceability Command
 *
 * Command: trace
 *
 * One call for the three-edge traceability check
 * (`agentic-qa-core/references/traceability-linking.md` §10). It exists because
 * the check used to be four separate reads that nobody ran in full: consumers
 * verified the coverage edge alone and logged "traceability verified", leaving
 * a Story whose ATP or ATR was unlinked with an incomplete audit trail.
 *
 * Reads only. The Jira layer supplies the Story's issue links; the Xray GraphQL
 * layer supplies the test lists, because Test Set membership and Plan/Execution
 * attachment are Xray-internal and invisible to a link read (§9).
 *
 * Exits 0 only when every edge passes.
 */

import type { MembershipLists, TraceEdge, TraceLinkRecord } from '../lib/trace.js';
import type { Flags, TestPlanResult, TestResult, TestSetResult } from '../types/index.js';
import { graphql, QUERIES } from '../lib/graphql.js';
import { getIssueLinks, resolveIssueId } from '../lib/jira.js';
import { extractLinkType, loadLinkTypeCatalog } from '../lib/link-types.js';
import { colors, log } from '../lib/logger.js';
import { getBoolFlag, getFlag } from '../lib/parser.js';
import { checkLinkEdge, checkMembership, resolveTraceArtifacts, traceVerdict } from '../lib/trace.js';

interface ExecutionTestsResult {
  issueId: string
  tests?: { total: number, results: TestResult[] }
}

/** Test keys of a container, or null when there is no container to read. */
async function testKeysOf(
  key: string | null,
  read: (issueId: string) => Promise<{ tests?: { results: Array<{ jira: { key?: string } }> } } | null>,
): Promise<string[] | null> {
  if (key === null) {
    return null;
  }
  const issueId = await resolveIssueId(key);
  const container = await read(issueId);
  if (!container) {
    return null;
  }
  return (container.tests?.results ?? [])
    .map(t => t.jira.key)
    .filter((k): k is string => typeof k === 'string');
}

export async function trace(flags: Flags, positional: string[]): Promise<void> {
  const storyKey = positional[0] || getFlag(flags, 'story');
  if (!storyKey) {
    throw new Error(
      'A Story key is required. Usage: xray trace <STORY_KEY> [--json]\n'
      + 'It verifies Story↔ATS (coverage), ATP↔Story, ATR↔Story and the list parity between them.',
    );
  }

  const asJson = getBoolFlag(flags, 'json');

  // The link type is addressed by SLUG and resolved against the versioned
  // catalog: a workspace that renamed "Test" must still be matched by its own
  // name, and a hardcoded name would report a false FAIL on every edge.
  const catalog = loadLinkTypeCatalog();
  if (catalog === null) {
    throw new Error(
      'Cannot read .agents/jira-required.yaml — the link-type catalog that maps slugs to this '
      + 'instance\'s link-type names. Run from the repo root, or restore the file.',
    );
  }
  const linkType = extractLinkType(catalog, 'test');
  if (!linkType) {
    throw new Error('The link-type catalog defines no `test` slug — re-run `bun run jira:sync-link-types`.');
  }

  const links = await getIssueLinks(storyKey);
  if (links === null) {
    throw new Error(
      'Jira credentials are required for `trace` (issue links live on the Jira layer, separate '
      + 'from the Xray GraphQL API). Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
    );
  }

  const records: TraceLinkRecord[] = links.map(l => ({
    key: l.key,
    issueType: l.issueType,
    summary: l.summary,
    linkTypeName: l.linkTypeName,
    // The Story is the inward party exactly when it reads the inward
    // description — which is how `getIssueLinks` already labels the side.
    storySide: l.side,
  }));

  const artifacts = resolveTraceArtifacts(storyKey, records);

  const edges: TraceEdge[] = [
    checkLinkEdge(
      { id: 'story-ats', label: `Story↔ATS (coverage, link type ${linkType.name})`, acronym: 'ATS', artifact: artifacts.ats },
      linkType.name,
      storyKey,
    ),
    checkLinkEdge(
      { id: 'atp-story', label: 'ATP↔Story (administrative)', acronym: 'ATP', artifact: artifacts.atp },
      linkType.name,
      storyKey,
    ),
    checkLinkEdge(
      { id: 'atr-story', label: 'ATR↔Story (administrative)', acronym: 'ATR', artifact: artifacts.atr },
      linkType.name,
      storyKey,
    ),
  ];

  const lists: MembershipLists = {
    ats: await testKeysOf(artifacts.ats?.key ?? null, async issueId =>
      (await graphql<{ getTestSet: TestSetResult }>(QUERIES.getTestSet, { issueId })).getTestSet),
    atp: await testKeysOf(artifacts.atp?.key ?? null, async issueId =>
      (await graphql<{ getTestPlan: TestPlanResult }>(QUERIES.getTestPlan, { issueId })).getTestPlan),
    atr: await testKeysOf(artifacts.atr?.key ?? null, async issueId =>
      (await graphql<{ getTestExecution: ExecutionTestsResult }>(QUERIES.getTestExecution, { issueId })).getTestExecution),
  };

  edges.push(checkMembership(lists, {
    ats: artifacts.ats?.key ?? null,
    atp: artifacts.atp?.key ?? null,
    atr: artifacts.atr?.key ?? null,
  }));

  const verdict = traceVerdict(edges);

  if (asJson) {
    log.json({
      story: storyKey,
      linkType: linkType.name,
      artifacts: {
        ats: artifacts.ats?.key ?? null,
        atp: artifacts.atp?.key ?? null,
        atr: artifacts.atr?.key ?? null,
        ambiguous: artifacts.ambiguous,
      },
      tests: lists,
      edges,
      verdict: verdict.ok ? 'PASS' : 'FAIL',
    });
    if (!verdict.ok) {
      process.exitCode = 1;
    }
    return;
  }

  log.title(`Traceability: ${storyKey}`);
  for (const edge of edges) {
    const mark = edge.status === 'PASS'
      ? `${colors.green}PASS${colors.reset}`
      : `${colors.red}FAIL${colors.reset}`;
    console.log(`  [${mark}] ${edge.label}`);
    console.log(`         ${edge.detail}`);
    if (edge.remediation) {
      console.log(`         ${colors.yellow}fix:${colors.reset} ${edge.remediation}`);
    }
  }

  for (const [acronym, extras] of Object.entries(artifacts.ambiguous)) {
    if (extras.length > 0) {
      log.warn(`More than one ${acronym.toUpperCase()} candidate linked; ignored: ${extras.join(', ')}`);
    }
  }

  if (verdict.ok) {
    log.success('Traceability verified — all four edges hold.');
    return;
  }

  log.error(`Traceability NOT verified — ${verdict.failed.length} of ${edges.length} edge(s) failed.`);
  process.exitCode = 1;
}
