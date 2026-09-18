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
 * Accepts one key, several keys, or `--jql` — because the worst traceability
 * failure this check catches is an inverted coverage link, which looks like
 * nothing at all on a single Story (the link is present, the panel is simply
 * empty) and only reads as a pattern across a project.
 *
 * Exits 0 only when every edge of every Story passes.
 */

import type { MembershipLists, TraceEdge, TraceLinkRecord } from '../lib/trace.js';
import type { Flags, TestPlanResult, TestResult, TestSetResult } from '../types/index.js';
import { graphql, QUERIES } from '../lib/graphql.js';
import { getIssueLinks, resolveIssueId, searchIssueKeys } from '../lib/jira.js';
import { extractLinkType, loadLinkTypeCatalog } from '../lib/link-types.js';
import { colors, log } from '../lib/logger.js';
import { getBoolFlag, getFlag, getFlagArray } from '../lib/parser.js';
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

/** One Story's verdict, in the shape `--json` emits per story. */
interface StoryTrace {
  story: string
  linkType: string
  artifacts: {
    ats: string | null
    atp: string | null
    atr: string | null
    ambiguous: { ats: string[], atp: string[], atr: string[] }
  }
  tests: MembershipLists
  edges: TraceEdge[]
  verdict: 'PASS' | 'FAIL'
}

/**
 * Resolve the set of Stories to verify.
 *
 * Several keys and `--jql` exist for the aggregate case: an inverted coverage
 * link is invisible per Story (the link is there, the panel is just empty), so
 * the finding that matters — "half the project's traceability points the wrong
 * way" — only appears when the check runs across a project in one pass.
 * Comma-separated keys are split, because that is how a worklist gets pasted.
 */
async function resolveStoryKeys(flags: Flags, positional: string[]): Promise<string[]> {
  const fromArgs = [...positional, ...getFlagArray(flags, 'story')]
    .flatMap(token => token.split(','))
    .map(token => token.trim())
    .filter(token => token !== '');

  const jql = getFlag(flags, 'jql');
  if (jql) {
    const limit = Number.parseInt(getFlag(flags, 'limit', '100') as string, 10);
    const found = await searchIssueKeys(jql, Number.isNaN(limit) ? 100 : limit);
    if (found === null) {
      throw new Error(
        'Jira credentials are required for `trace --jql` (the search runs on the Jira layer). '
        + 'Run \'bun xray auth login --jira-url --jira-email --jira-token\' first.',
      );
    }
    fromArgs.push(...found);
  }

  return [...new Set(fromArgs)];
}

async function traceStory(storyKey: string, linkTypeName: string): Promise<StoryTrace> {
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
    linkId: l.linkId,
    // `getIssueLinks` reports which FIELD the artifact appears under in the
    // Story's entry; the coverage edge requires `inwardIssue`.
    storySide: l.side,
  }));

  const artifacts = resolveTraceArtifacts(storyKey, records);

  const edges: TraceEdge[] = [
    checkLinkEdge(
      { id: 'story-ats', label: `Story↔ATS (coverage, link type ${linkTypeName})`, acronym: 'ATS', artifact: artifacts.ats },
      linkTypeName,
      storyKey,
    ),
    checkLinkEdge(
      { id: 'atp-story', label: 'ATP↔Story (administrative)', acronym: 'ATP', artifact: artifacts.atp },
      linkTypeName,
      storyKey,
    ),
    checkLinkEdge(
      { id: 'atr-story', label: 'ATR↔Story (administrative)', acronym: 'ATR', artifact: artifacts.atr },
      linkTypeName,
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

  return {
    story: storyKey,
    linkType: linkTypeName,
    artifacts: {
      ats: artifacts.ats?.key ?? null,
      atp: artifacts.atp?.key ?? null,
      atr: artifacts.atr?.key ?? null,
      ambiguous: artifacts.ambiguous,
    },
    tests: lists,
    edges,
    verdict: verdict.ok ? 'PASS' : 'FAIL',
  };
}

function printStory(result: StoryTrace): void {
  log.title(`Traceability: ${result.story}`);
  for (const edge of result.edges) {
    const mark = edge.status === 'PASS'
      ? `${colors.green}PASS${colors.reset}`
      : `${colors.red}FAIL${colors.reset}`;
    console.log(`  [${mark}] ${edge.label}`);
    console.log(`         ${edge.detail}`);
    if (edge.remediation) {
      console.log(`         ${colors.yellow}fix:${colors.reset} ${edge.remediation}`);
    }
  }

  for (const [acronym, extras] of Object.entries(result.artifacts.ambiguous)) {
    if (extras.length > 0) {
      log.warn(`More than one ${acronym.toUpperCase()} candidate linked; ignored: ${extras.join(', ')}`);
    }
  }

  if (result.verdict === 'PASS') {
    log.success('Traceability verified — all four edges hold.');
    return;
  }
  const failed = result.edges.filter(e => e.status === 'FAIL').length;
  log.error(`Traceability NOT verified — ${failed} of ${result.edges.length} edge(s) failed.`);
}

export async function trace(flags: Flags, positional: string[]): Promise<void> {
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

  const storyKeys = await resolveStoryKeys(flags, positional);
  if (storyKeys.length === 0) {
    throw new Error(
      'At least one Story key is required. Usage:\n'
      + '  xray trace <STORY_KEY> [<STORY_KEY> ...] [--json]\n'
      + '  xray trace --jql "project = DEMO AND issuetype = Story" [--limit <n>] [--json]\n'
      + 'It verifies Story↔ATS (coverage), ATP↔Story, ATR↔Story and the list parity between them.',
    );
  }

  const results: StoryTrace[] = [];
  const unreadable: Array<{ story: string, error: string }> = [];
  for (const storyKey of storyKeys) {
    // One unreadable Story must not abort a sweep of forty: a worklist that
    // stops at the first permission error is not a worklist.
    if (storyKeys.length === 1) {
      results.push(await traceStory(storyKey, linkType.name));
      continue;
    }
    try {
      results.push(await traceStory(storyKey, linkType.name));
    }
    catch (err) {
      unreadable.push({ story: storyKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const failed = results.filter(r => r.verdict === 'FAIL');

  if (asJson) {
    // A single key keeps the original single-object shape; a sweep wraps it, so
    // existing one-Story consumers are untouched.
    if (storyKeys.length === 1 && results.length === 1) {
      log.json(results[0]);
    }
    else {
      log.json({
        stories: results,
        unreadable,
        summary: {
          checked: results.length,
          passed: results.length - failed.length,
          failed: failed.length,
          unreadable: unreadable.length,
        },
      });
    }
    if (failed.length > 0 || unreadable.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  for (const result of results) {
    printStory(result);
  }

  if (storyKeys.length > 1) {
    log.title(`Repair worklist: ${failed.length} of ${results.length} Stories need work`);
    for (const result of failed) {
      console.log(`  ${result.story}`);
      for (const edge of result.edges.filter(e => e.status === 'FAIL' && e.remediation !== null)) {
        console.log(`    ${colors.yellow}fix:${colors.reset} ${edge.remediation}`);
      }
    }
    for (const row of unreadable) {
      log.warn(`${row.story}: not checked — ${row.error}`);
    }
  }

  if (failed.length > 0 || unreadable.length > 0) {
    process.exitCode = 1;
  }
}
