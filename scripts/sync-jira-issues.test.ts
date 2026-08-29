import { describe, expect, test } from 'bun:test';

import {
  classifyQaArtifactEpic,
  DEFAULT_QA_ARTIFACT_LABEL,
  fileNamePrefix,
  HIGHER_ALTITUDE_PREFIX,
  higherAltitudeLabel,
  ladderTitleAcronym,
  MODULE_CONTEXT_HEADING,
  splitDescriptionSection,
  standaloneSkipReason,
  sweptFromQaEpic,
} from './sync-jira-issues.ts';

const H = MODULE_CONTEXT_HEADING;

describe('splitDescriptionSection', () => {
  test('returns the description untouched when the heading is absent', () => {
    const md = 'As a user I want to log in.\n\n## Notes\n\nNothing here.';
    expect(splitDescriptionSection(md, H)).toEqual({ body: md, section: null });
  });

  test('splits the section out and strips it from the body', () => {
    const md = [
      'PO description text.',
      '',
      `## ${H}`,
      '',
      'Routes: `/auth/login`',
      'Tables: `users`, `sessions`',
      '',
      '## Other',
      '',
      'kept',
    ].join('\n');

    const { body, section } = splitDescriptionSection(md, H);
    expect(section).toBe('Routes: `/auth/login`\nTables: `users`, `sessions`');
    expect(body).toBe('PO description text.\n\n## Other\n\nkept');
  });

  test('runs the section to end of document when it is last', () => {
    const md = `PO text.\n\n## ${H}\n\nonly this`;
    const { body, section } = splitDescriptionSection(md, H);
    expect(section).toBe('only this');
    expect(body).toBe('PO text.');
  });

  test('keeps deeper headings inside the section', () => {
    const md = `intro\n\n## ${H}\n\n### Endpoints\n\nGET /me\n\n### Tables\n\nusers`;
    const { section } = splitDescriptionSection(md, H);
    expect(section).toContain('### Endpoints');
    expect(section).toContain('### Tables');
    expect(section).toContain('users');
  });

  test('stops at a higher-level heading, not just a sibling', () => {
    const md = `intro\n\n## ${H}\n\ninside\n\n# Appendix\n\noutside`;
    const { body, section } = splitDescriptionSection(md, H);
    expect(section).toBe('inside');
    expect(body).toBe('intro\n\n# Appendix\n\noutside');
  });

  test('matches the heading case-insensitively', () => {
    // A human retyping the heading in the Jira UI must not silently break the split.
    const md = 'intro\n\n## module context (qa)\n\nfound';
    expect(splitDescriptionSection(md, H).section).toBe('found');
  });

  test('treats a whitespace-only section as absent', () => {
    const md = `intro\n\n## ${H}\n\n   \n\n## Next\n\ntail`;
    expect(splitDescriptionSection(md, H).section).toBeNull();
  });

  test('ignores a heading that merely starts with the wanted text', () => {
    const md = `intro\n\n## ${H} Extended\n\nnope`;
    expect(splitDescriptionSection(md, H).section).toBeNull();
  });
});

describe('classifyQaArtifactEpic', () => {
  const cfg = { label: DEFAULT_QA_ARTIFACT_LABEL, cachedKeys: new Set(['PROJ-900']) };
  const epic = (over: Record<string, unknown>): never =>
    ({ key: 'PROJ-1', fields: { summary: 'Checkout', labels: [], ...over } }) as never;

  test('a product epic is not an artifact bucket', () => {
    expect(classifyQaArtifactEpic(epic({}), cfg)).toBeNull();
  });

  test('the label is authoritative', () => {
    expect(classifyQaArtifactEpic(epic({ labels: ['QA-Artifact'] }), cfg)).toEqual({ via: 'label' });
  });

  test('a cached qa_epics key is recognized without the label', () => {
    const e = { key: 'PROJ-900', fields: { summary: 'Anything', labels: [] } } as never;
    expect(classifyQaArtifactEpic(e, cfg)).toEqual({ via: 'cached-key' });
  });

  test('falls back to the QA name prefix, reporting the weaker signal', () => {
    expect(classifyQaArtifactEpic(epic({ summary: 'QA Test Repository' }), cfg))
      .toEqual({ via: 'name-prefix' });
  });

  test('the label wins over the prefix so the signal is never downgraded', () => {
    const e = epic({ summary: 'QA Test Repository', labels: ['QA-Artifact'] });
    expect(classifyQaArtifactEpic(e, cfg)).toEqual({ via: 'label' });
  });

  test('"QA" without a trailing space is a product epic', () => {
    // "QAlity Dashboard" must not be swept up by the prefix heuristic.
    expect(classifyQaArtifactEpic(epic({ summary: 'QAlity Dashboard' }), cfg)).toBeNull();
  });

  test('tolerates an epic with no labels field', () => {
    const e = { key: 'PROJ-2', fields: { summary: 'Checkout' } } as never;
    expect(classifyQaArtifactEpic(e, cfg)).toBeNull();
  });

  test('honours a project-specific label instead of the default', () => {
    const custom = { label: 'proceso-qa', cachedKeys: new Set<string>() };
    expect(classifyQaArtifactEpic(epic({ labels: ['proceso-qa'] }), custom)).toEqual({ via: 'label' });
    expect(classifyQaArtifactEpic(epic({ labels: ['QA-Artifact'] }), custom)).toBeNull();
  });
});

describe('ladderTitleAcronym / fileNamePrefix', () => {
  test('a conforming Test Plan title lends its acronym to the filename', () => {
    expect(fileNamePrefix('test_plan', 'FTP: PROJ-42: Checkout & Payments')).toBe('FTP');
    expect(fileNamePrefix('test_plan', 'STP: Sprint#30: Payments hardening')).toBe('STP');
    expect(fileNamePrefix('test_plan', 'ATP: PROJ-123: Apply discount at checkout')).toBe('ATP');
  });

  test('a conforming Test Execution title does the same', () => {
    expect(fileNamePrefix('test_execution', 'STR: Sprint#30: Regression Testing')).toBe('STR');
    expect(fileNamePrefix('test_execution', 'ATR: PROJ-123: Story Testing')).toBe('ATR');
  });

  test('the Re-Test Execution keeps its `ReTest:` spelling', () => {
    expect(fileNamePrefix('re_test_execution', 'ReTest: PROJ-123: Story Testing')).toBe('RETEST');
    expect(fileNamePrefix('re_test_execution', 'RE-TEST: PROJ-123: Story Testing')).toBe('RETEST');
  });

  test('acronyms are scoped per work type — a mis-titled Plan is not filed as a run', () => {
    // `ATR:` on a Test Plan is a titling mistake; it must not produce ATR-*.md
    // in test-plans/ and pretend the ladder is consistent.
    expect(ladderTitleAcronym('test_plan', 'ATR: PROJ-1: Story Testing')).toBeNull();
    expect(fileNamePrefix('test_plan', 'ATR: PROJ-1: Story Testing')).toBe('TESTPLAN');
    expect(ladderTitleAcronym('test_execution', 'ATP: PROJ-1: Something')).toBeNull();
  });

  test('a NON-conforming title keeps the legacy slug-based prefix', () => {
    // A project that never adopted the grammar must sync exactly as before.
    expect(fileNamePrefix('test_plan', 'Test Plan: PROJ-123')).toBe('TESTPLAN');
    expect(fileNamePrefix('test_plan', 'Regression plan for sprint 30')).toBe('TESTPLAN');
    expect(fileNamePrefix('test_execution', 'Regression: TP-50: Sprint 50')).toBe('TESTEXEC');
    expect(fileNamePrefix('re_test_execution', 'Retest of PROJ-1')).toBe('RETESTEXEC');
  });

  test('a work type with no ladder acronyms is never renamed by a title', () => {
    expect(ladderTitleAcronym('bug', 'ATP: PROJ-1: nope')).toBeNull();
    expect(fileNamePrefix('bug', 'ATP: PROJ-1: nope')).toBe('BUG');
    expect(fileNamePrefix('test_set', 'ATS: PROJ-1: Apply discount')).toBe('TESTSET');
  });

  test('an unknown slug degrades to its uppercased self', () => {
    expect(fileNamePrefix('custom_thing', 'Whatever')).toBe('CUSTOM_THING');
  });

  test('tolerates leading whitespace and a missing space after the colon', () => {
    expect(fileNamePrefix('test_plan', '  ATP:PROJ-1: tight')).toBe('ATP');
  });
});

describe('HIGHER_ALTITUDE_PREFIX (Story-altitude guard)', () => {
  test('still skips the feature and sprint altitudes', () => {
    expect(HIGHER_ALTITUDE_PREFIX.test('FTP: PROJ-42: Checkout')).toBe(true);
    expect(HIGHER_ALTITUDE_PREFIX.test('STP: Sprint#30: Hardening')).toBe(true);
    expect(HIGHER_ALTITUDE_PREFIX.test('STR: Sprint#30: Regression Testing')).toBe(true);
  });

  test('keeps the FTR legacy guard for pre-migration data', () => {
    // The rung was cut from the ladder; the skip stays so an old FTR is never
    // mistaken for a Story-altitude ATR.
    expect(HIGHER_ALTITUDE_PREFIX.test('FTR: PROJ-42: Feature results')).toBe(true);
    expect(higherAltitudeLabel('FTR: PROJ-42: Feature results')).toBe('feature-altitude');
  });

  test('no longer guards MTP — the Master Test Plan is an Epic, never a Test Plan', () => {
    expect(HIGHER_ALTITUDE_PREFIX.test('MTP: PROJ: Master')).toBe(false);
  });

  test('labels the sprint altitude for the info line', () => {
    expect(higherAltitudeLabel('STP: Sprint#30: Hardening')).toBe('sprint-altitude');
    expect(higherAltitudeLabel('STR: Sprint#30: Regression Testing')).toBe('sprint-altitude');
  });

  test('a Story-altitude title is not guarded at all', () => {
    expect(HIGHER_ALTITUDE_PREFIX.test('ATP: PROJ-123: Apply discount')).toBe(false);
    expect(HIGHER_ALTITUDE_PREFIX.test('ATR: PROJ-123: Story Testing')).toBe(false);
  });
});

describe('standaloneSkipReason / sweptFromQaEpic', () => {
  const entry = (over: Record<string, unknown>): never =>
    ({
      slug: 'test_plan',
      jiraIssueType: 'Test Plan',
      sync: 'discovery',
      recommended: false,
      coverable: false,
      container: false,
      role: null,
      content: 'description',
      defectLinkTypes: [],
      localDir: 'test-plans',
      ...over,
    }) as never;

  test('a `sync: never` declaration is honored, not just documented', () => {
    // The bug this closes: `get <KEY>` wrote Preconditions and Test Sets that
    // the yaml declared were never synced.
    expect(standaloneSkipReason(entry({ sync: 'never' }))).toContain('sync: never');
  });

  test('`sync: never` wins over every other property', () => {
    expect(standaloneSkipReason(entry({ sync: 'never', coverable: true }))).toContain('sync: never');
  });

  test('containers and Stories stay routed by the epic/story walk', () => {
    expect(standaloneSkipReason(entry({ container: true }))).toContain('routed via pull/epic/story');
    expect(standaloneSkipReason(entry({ slug: 'story' }))).toContain('routed via pull/epic/story');
  });

  test('a discovery-mode ladder artifact is writable as a standalone file', () => {
    expect(standaloneSkipReason(entry({}))).toBeNull();
    expect(standaloneSkipReason(entry({ slug: 'test_set', sync: 'discovery' }))).toBeNull();
  });

  test('the QA-epic sweep takes the ladder artifacts', () => {
    expect(sweptFromQaEpic(entry({}), 'FTP: PROJ-1: Checkout')).toBe(true);
    expect(sweptFromQaEpic(entry({}), 'STP: Sprint#30: Payments hardening')).toBe(true);
    expect(sweptFromQaEpic(entry({ slug: 'test_execution', jiraIssueType: 'Test Execution' }), 'STR: Sprint#30: Regression Testing')).toBe(true);
    expect(sweptFromQaEpic(entry({ slug: 'precondition', jiraIssueType: 'Precondition' }), 'User is logged in')).toBe(true);
    // ATS has no mirrored body anywhere, so test-sets/ is its only local home.
    expect(sweptFromQaEpic(entry({ slug: 'test_set', jiraIssueType: 'Test Set', sync: 'discovery' }), 'ATS: PROJ-12: Checkout')).toBe(true);
  });

  test('the sweep leaves owned types to their owner', () => {
    // Coverables have their own sweep + nest under what they block; Tests are
    // placed by the TC cascade with epics/_orphans/tests/ as the net.
    expect(sweptFromQaEpic(entry({ slug: 'bug', coverable: true }), 'Login fails')).toBe(false);
    expect(sweptFromQaEpic(entry({ slug: 'test_case', jiraIssueType: 'Test' }), 'should reject an expired token')).toBe(false);
    expect(sweptFromQaEpic(entry({ sync: 'never' }), 'FTP: PROJ-1: Checkout')).toBe(false);
    expect(sweptFromQaEpic(entry({ container: true }), 'FTP: PROJ-1: Checkout')).toBe(false);
  });

  test('the sweep skips Story-altitude Plans and Runs, whose body lives under the Story', () => {
    expect(sweptFromQaEpic(entry({}), 'ATP: PROJ-12: Checkout with a saved card')).toBe(false);
    expect(sweptFromQaEpic(entry({ slug: 'test_execution', jiraIssueType: 'Test Execution' }), 'ATR: PROJ-12: Story Testing')).toBe(false);
    expect(sweptFromQaEpic(entry({ slug: 're_test_execution', jiraIssueType: 'Re-Test Execution' }), 'ReTest: PROJ-88: token expiry')).toBe(false);
    // Case- and hyphen-insensitive, same as the acronym resolver.
    expect(sweptFromQaEpic(entry({}), 'atp: PROJ-12: lowercase')).toBe(false);
    expect(sweptFromQaEpic(entry({ slug: 're_test_execution', jiraIssueType: 'Re-Test Execution' }), 'RE-TEST: PROJ-88: hyphenated')).toBe(false);
  });
});
