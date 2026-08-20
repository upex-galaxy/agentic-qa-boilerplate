import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  computeGaps,
  groupByComponent,
  loadPbiTree,
  parseHeaderField,
  parseIssueTitle,
  parseJiraKeyField,
  parseSyncedName,
  parseTestMarkdown,
  statusTone,
} from './tests-map.ts';

// ============================================================================
// FIXTURE BUILDERS — synthetic markdown in the exact shape generateTestMarkdown
// (sync-jira-issues.ts) writes. Deliberately NOT the live BK cache, which
// changes on every hydrate.
// ============================================================================

function testMd(over: { key?: string, summary?: string, status?: string, components?: string } = {}): string {
  return [
    `# TEST: ${over.summary ?? 'TC1: should log in'}`,
    '',
    `**Jira Key:** [${over.key ?? 'PROJ-10'}](https://example.atlassian.net/browse/${over.key ?? 'PROJ-10'})`,
    `**Status:** ${over.status ?? 'AUTOMATED'}`,
    `**Components:** ${over.components ?? 'None'}`,
    '',
    '---',
    '',
    '## Test Description',
    '',
    'steps here',
    '',
  ].join('\n');
}

function issueMd(title: string, key: string, status: string): string {
  return [
    `# ${title}`,
    '',
    `**Jira Key:** [${key}](https://example.atlassian.net/browse/${key})`,
    `**Status:** ${status}`,
    '',
  ].join('\n');
}

describe('parseHeaderField', () => {
  test('extracts a bold-label header line', () => {
    expect(parseHeaderField('**Status:** In Design\n', 'Status')).toBe('In Design');
  });

  test('returns null when the label is absent', () => {
    expect(parseHeaderField('# Title\n\nbody', 'Status')).toBeNull();
  });

  test('does not match the label mid-line', () => {
    expect(parseHeaderField('see **Status:** ok', 'Status')).toBeNull();
  });
});

describe('parseJiraKeyField', () => {
  test('splits key and url out of the markdown link', () => {
    const { key, url } = parseJiraKeyField('**Jira Key:** [BK-6](https://x.net/browse/BK-6)');
    expect(key).toBe('BK-6');
    expect(url).toBe('https://x.net/browse/BK-6');
  });

  test('tolerates a bare key with no link', () => {
    expect(parseJiraKeyField('**Jira Key:** BK-6')).toEqual({ key: 'BK-6', url: null });
  });
});

describe('parseSyncedName', () => {
  test('splits prefix, dashed Jira key, and slug', () => {
    expect(parseSyncedName('EPIC-BK-1-tenancy-identity'))
      .toEqual({ prefix: 'EPIC', key: 'BK-1', slug: 'tenancy-identity' });
  });

  test('handles a name with no slug', () => {
    expect(parseSyncedName('TEST-PROJ-250')).toEqual({ prefix: 'TEST', key: 'PROJ-250', slug: '' });
  });

  test('rejects the _orphans bucket and other non-synced names', () => {
    expect(parseSyncedName('_orphans')).toBeNull();
    expect(parseSyncedName('templates')).toBeNull();
    expect(parseSyncedName('stories')).toBeNull();
  });
});

describe('parseIssueTitle', () => {
  test('strips the generator prefix from an epic heading', () => {
    expect(parseIssueTitle('# EPIC: Tenancy & Identity\n\nbody')).toBe('Tenancy & Identity');
  });

  test('strips only the first prefix from a TEST heading with inner colons', () => {
    // Lazy match: "TEST: " goes, "BK-6: TC1: ..." stays — that IS the summary.
    expect(parseIssueTitle('# TEST: BK-6: TC1: should switch\n')).toBe('BK-6: TC1: should switch');
  });

  test('leaves a story heading with no prefix untouched', () => {
    expect(parseIssueTitle('# TMS-Workspace | Switch between workspaces')).toBe('TMS-Workspace | Switch between workspaces');
  });
});

describe('parseTestMarkdown', () => {
  test('parses the full generated header', () => {
    const parsed = parseTestMarkdown(testMd({ key: 'BK-250', status: 'AUTOMATED', components: 'Tenancy & Identity, Billing' }), 'TEST-BK-250-x.md');
    expect(parsed.key).toBe('BK-250');
    expect(parsed.summary).toBe('TC1: should log in');
    expect(parsed.status).toBe('AUTOMATED');
    expect(parsed.components).toEqual(['Tenancy & Identity', 'Billing']);
    expect(parsed.url).toContain('/browse/BK-250');
  });

  test('"None" components normalize to an empty list', () => {
    expect(parseTestMarkdown(testMd({ components: 'None' }), 'TEST-PROJ-10-a.md').components).toEqual([]);
  });

  test('falls back to the filename key and Unknown status on a degenerate file', () => {
    const parsed = parseTestMarkdown('just prose, no headers', 'TEST-BK-999-mystery.md');
    expect(parsed.key).toBe('BK-999');
    expect(parsed.status).toBe('Unknown');
    expect(parsed.summary).toBe('TEST-BK-999-mystery');
    expect(parsed.components).toEqual([]);
  });
});

describe('statusTone', () => {
  test('maps statuses case-insensitively onto the palette', () => {
    expect(statusTone('AUTOMATED')).toBe('good');
    expect(statusTone('Deprecated')).toBe('bad');
    expect(statusTone('Draft')).toBe('warn');
    expect(statusTone('Candidate')).toBe('neutral');
  });
});

// ============================================================================
// TREE LOADING + GAPS — synthetic tree in a tmpdir
// ============================================================================

function buildSyntheticTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'tests-map-'));
  const epicA = join(root, 'epics', 'EPIC-PROJ-1-checkout');
  const covered = join(epicA, 'stories', 'STORY-PROJ-2-pay-with-card');
  const uncovered = join(epicA, 'stories', 'STORY-PROJ-3-refund');
  const epicB = join(root, 'epics', 'EPIC-PROJ-4-search'); // stories, zero tests
  const bare = join(epicB, 'stories', 'STORY-PROJ-5-filter');
  const epicC = join(root, 'epics', 'EPIC-PROJ-6-empty-shell'); // no stories

  mkdirSync(join(covered, 'test-cases'), { recursive: true });
  mkdirSync(uncovered, { recursive: true });
  mkdirSync(bare, { recursive: true });
  mkdirSync(join(epicC, 'stories'), { recursive: true });
  mkdirSync(join(root, 'epics', '_orphans', 'tests'), { recursive: true });
  mkdirSync(join(root, 'bugs', 'BUG-PROJ-50-broken-total', 'test-cases'), { recursive: true });

  writeFileSync(join(epicA, 'epic.md'), issueMd('EPIC: Checkout', 'PROJ-1', 'In Progress'));
  writeFileSync(join(covered, 'story.md'), issueMd('Pay with card', 'PROJ-2', 'Done'));
  writeFileSync(join(covered, 'test-cases', 'TEST-PROJ-10-happy-path.md'), testMd({ key: 'PROJ-10', components: 'Checkout' }));
  writeFileSync(join(covered, 'test-cases', 'TEST-PROJ-11-declined.md'), testMd({ key: 'PROJ-11', status: 'Draft' }));
  writeFileSync(join(uncovered, 'story.md'), issueMd('Refund', 'PROJ-3', 'Ready For QA'));
  writeFileSync(join(epicB, 'epic.md'), issueMd('EPIC: Search', 'PROJ-4', 'Planning'));
  writeFileSync(join(bare, 'story.md'), issueMd('Filter', 'PROJ-5', 'Backlog'));
  writeFileSync(join(epicC, 'epic.md'), issueMd('EPIC: Empty Shell', 'PROJ-6', 'Planning'));
  writeFileSync(join(root, 'epics', '_orphans', 'tests', 'TEST-PROJ-40-loose.md'), testMd({ key: 'PROJ-40', status: 'DEPRECATED' }));
  writeFileSync(join(root, 'bugs', 'BUG-PROJ-50-broken-total', 'bug.md'), issueMd('Broken total', 'PROJ-50', 'Closed'));
  writeFileSync(join(root, 'bugs', 'BUG-PROJ-50-broken-total', 'test-cases', 'TEST-PROJ-51-regression.md'), testMd({ key: 'PROJ-51', components: 'Checkout' }));

  return root;
}

describe('loadPbiTree + computeGaps', () => {
  const root = buildSyntheticTree();
  const model = loadPbiTree(root);
  if (!model) { throw new Error('synthetic tree failed to load'); }
  const gaps = computeGaps(model);

  test('materializes the Epic -> Story -> Test hierarchy', () => {
    expect(model.epics.map(e => e.key)).toEqual(['PROJ-1', 'PROJ-4', 'PROJ-6']);
    const checkout = model.epics[0];
    expect(checkout.title).toBe('Checkout');
    expect(checkout.stories).toHaveLength(2);
    expect(checkout.stories[0].tests.map(t => t.key)).toEqual(['PROJ-10', 'PROJ-11']);
  });

  test('collects orphans and bug-covered tests separately', () => {
    expect(model.orphanTests.map(t => t.key)).toEqual(['PROJ-40']);
    expect(model.otherCoverables).toEqual([
      expect.objectContaining({ kind: 'bugs', key: 'PROJ-50', title: 'Broken total' }),
    ]);
  });

  test('records the repo-relative path of each test file', () => {
    expect(model.orphanTests[0].relPath).toBe(join('epics', '_orphans', 'tests', 'TEST-PROJ-40-loose.md'));
  });

  test('flags the story with no test-cases', () => {
    expect(gaps.storiesWithoutTests.map(g => g.story.key)).toEqual(['PROJ-3', 'PROJ-5']);
  });

  test('flags the epic whose stories have zero tests, not the covered one', () => {
    expect(gaps.epicsWithoutTests.map(e => e.key)).toEqual(['PROJ-4']);
  });

  test('flags the epic with no stories at all', () => {
    expect(gaps.epicsWithoutStories.map(e => e.key)).toEqual(['PROJ-6']);
  });

  test('counts component-less tests across stories, bugs and orphans', () => {
    expect(gaps.testsWithoutComponent.map(t => t.key).sort()).toEqual(['PROJ-11', 'PROJ-40']);
  });

  test('groupByComponent pins the unassigned bucket first', () => {
    const groups = groupByComponent([
      ...model.epics.flatMap(e => e.stories.flatMap(s => s.tests)),
      ...model.orphanTests,
    ]);
    expect([...groups.keys()][0]).toBe('(no component)');
    expect(groups.get('Checkout')?.map(t => t.key)).toEqual(['PROJ-10']);
  });

  rmSync(root, { recursive: true, force: true });
});

describe('loadPbiTree on an empty or absent tree', () => {
  test('an absent root yields null, not a throw', () => {
    expect(loadPbiTree(join(tmpdir(), 'tests-map-does-not-exist'))).toBeNull();
  });

  test('a hollow tree (dirs but no synced issues) yields null', () => {
    const root = mkdtempSync(join(tmpdir(), 'tests-map-hollow-'));
    mkdirSync(join(root, 'epics'), { recursive: true });
    expect(loadPbiTree(root)).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });
});
