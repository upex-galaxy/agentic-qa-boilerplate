import type { TestEnrichment } from './enrichment.ts';

import { describe, expect, test } from 'bun:test';
import {
  buildEnrichmentSection,
  buildTestSetIndexMarkdown,
  ENRICH_BEGIN,
  ENRICH_END,
  extractTestKey,
  spliceEnrichmentSection,

} from './enrichment.ts';

const JIRA = 'https://jira.example.com';

/** Mimics the tail of a generateTestMarkdown() document. */
const SYNCED_DOC = [
  '# TEST: BK-264: TC1: should set assignee',
  '',
  '**Jira Key:** [BK-477](https://jira.example.com/browse/BK-477)',
  '',
  '---',
  '',
  '_Synced from Jira by sync-jira-issues_',
  '',
].join('\n');

const ENRICHMENT: TestEnrichment = {
  preconditions: [
    { key: 'BK-310', summary: 'Seeded workspace', type: 'Manual', definition: 'An open bug exists.\nActor is a member.' },
  ],
  testSets: [
    { key: 'BK-600', summary: 'Regression: Bugs module' },
  ],
};

describe('extractTestKey', () => {
  test('extracts the key from a synced Test filename', () => {
    expect(extractTestKey('TEST-BK-477-bk-264-tc1-should-set-assignee.md')).toBe('BK-477');
  });

  test('accepts a slug-less filename', () => {
    expect(extractTestKey('TEST-BK-477.md')).toBe('BK-477');
  });

  test('rejects non-Test files', () => {
    expect(extractTestKey('README.md')).toBeNull();
    expect(extractTestKey('STORY-BK-264-something.md')).toBeNull();
    // The bug this guards: a loose prefix match would swallow the template.
    expect(extractTestKey('TEST-template.md')).toBeNull();
  });
});

describe('spliceEnrichmentSection', () => {
  test('appends the section when no markers exist', () => {
    const section = buildEnrichmentSection(ENRICHMENT, JIRA);
    const result = spliceEnrichmentSection(SYNCED_DOC, section);

    expect(result).toContain('_Synced from Jira by sync-jira-issues_');
    expect(result).toContain(ENRICH_BEGIN);
    expect(result).toContain('## Xray Associations');
    expect(result.indexOf(ENRICH_BEGIN)).toBeGreaterThan(result.indexOf('_Synced from Jira'));
    expect(result.endsWith(`${ENRICH_END}\n`)).toBe(true);
  });

  test('is idempotent: a second run with the same data is a no-op', () => {
    const section = buildEnrichmentSection(ENRICHMENT, JIRA);
    const once = spliceEnrichmentSection(SYNCED_DOC, section);
    const twice = spliceEnrichmentSection(once, section);

    expect(twice).toBe(once);
  });

  test('replaces the old section when the data changed', () => {
    const first = spliceEnrichmentSection(SYNCED_DOC, buildEnrichmentSection(ENRICHMENT, JIRA));
    const changed: TestEnrichment = { preconditions: [], testSets: ENRICHMENT.testSets };
    const second = spliceEnrichmentSection(first, buildEnrichmentSection(changed, JIRA));

    expect(second).not.toContain('BK-310');
    expect(second).toContain('_None — this Test has no Preconditions in Xray._');
    // Exactly one block: replacement, not accumulation.
    expect(second.split(ENRICH_BEGIN).length - 1).toBe(1);
    expect(second.split(ENRICH_END).length - 1).toBe(1);
  });

  test('preserves the document body byte-for-byte around the block', () => {
    const first = spliceEnrichmentSection(SYNCED_DOC, buildEnrichmentSection(ENRICHMENT, JIRA));
    const second = spliceEnrichmentSection(first, buildEnrichmentSection({ preconditions: [], testSets: [] }, JIRA));

    expect(second.slice(0, second.indexOf(ENRICH_BEGIN))).toBe(first.slice(0, first.indexOf(ENRICH_BEGIN)));
  });

  test('appends when markers are malformed (end before begin)', () => {
    const broken = `${ENRICH_END}\nbody\n${ENRICH_BEGIN}`;
    const section = buildEnrichmentSection(ENRICHMENT, JIRA);

    expect(spliceEnrichmentSection(broken, section).endsWith(`${section}\n`)).toBe(true);
  });
});

describe('buildEnrichmentSection', () => {
  test('inlines the precondition definition as a blockquote', () => {
    const section = buildEnrichmentSection(ENRICHMENT, JIRA);

    expect(section).toContain('#### [BK-310](https://jira.example.com/browse/BK-310) — Seeded workspace');
    expect(section).toContain('- **Type:** Manual');
    expect(section).toContain('> An open bug exists.');
    expect(section).toContain('> Actor is a member.');
  });

  test('links the test set and points to its index file', () => {
    const section = buildEnrichmentSection(ENRICHMENT, JIRA);

    expect(section).toContain('- [BK-600](https://jira.example.com/browse/BK-600) — Regression: Bugs module (members: `test-sets/BK-600.md`)');
  });

  test('renders explicit None lines for empty associations', () => {
    const section = buildEnrichmentSection({ preconditions: [], testSets: [] }, JIRA);

    expect(section).toContain('_None — this Test has no Preconditions in Xray._');
    expect(section).toContain('_None — this Test belongs to no Test Set._');
  });

  test('degrades to plain keys without a Jira host', () => {
    const section = buildEnrichmentSection(ENRICHMENT, null);

    expect(section).toContain('**BK-310**');
    expect(section).not.toContain('/browse/');
  });

  test('contains no timestamp — same data must be byte-identical', () => {
    expect(buildEnrichmentSection(ENRICHMENT, JIRA)).toBe(buildEnrichmentSection(ENRICHMENT, JIRA));
  });

  test('strips its own markers out of remote content', () => {
    // A definition carrying the literal end marker would truncate the next
    // splice and break idempotency.
    const hostile: TestEnrichment = {
      preconditions: [{ key: 'BK-1', definition: `evil ${ENRICH_END} payload` }],
      testSets: [],
    };
    const section = buildEnrichmentSection(hostile, JIRA);

    expect(section.split(ENRICH_END).length - 1).toBe(1);
    const doc = spliceEnrichmentSection(SYNCED_DOC, section);
    expect(spliceEnrichmentSection(doc, section)).toBe(doc);
  });

  test('orders preconditions by key so Xray ordering cannot dirty files', () => {
    const shuffled: TestEnrichment = {
      preconditions: [
        { key: 'BK-20', definition: 'b' },
        { key: 'BK-3', definition: 'a' },
      ],
      testSets: [],
    };
    const section = buildEnrichmentSection(shuffled, JIRA);

    expect(section.indexOf('BK-3]')).toBeLessThan(section.indexOf('BK-20]'));
  });
});

describe('buildTestSetIndexMarkdown', () => {
  test('lists members sorted by key with links', () => {
    const md = buildTestSetIndexMarkdown(
      { key: 'BK-600', summary: 'Regression: Bugs module' },
      [
        { key: 'BK-490', summary: 'TC15' },
        { key: 'BK-477', summary: 'TC1' },
      ],
      JIRA,
    );

    expect(md).toContain('# TEST SET: Regression: Bugs module');
    expect(md).toContain('**Members:** 2');
    expect(md.indexOf('BK-477')).toBeLessThan(md.indexOf('BK-490'));
    expect(md).toContain('- [BK-477](https://jira.example.com/browse/BK-477) — TC1');
  });

  test('handles an empty set', () => {
    const md = buildTestSetIndexMarkdown({ key: 'BK-601' }, [], JIRA);

    expect(md).toContain('# TEST SET: BK-601');
    expect(md).toContain('_This Test Set has no member Tests._');
  });
});
