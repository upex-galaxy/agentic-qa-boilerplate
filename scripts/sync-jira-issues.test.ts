import { describe, expect, test } from 'bun:test';

import {
  classifyQaArtifactEpic,
  DEFAULT_QA_ARTIFACT_LABEL,
  MODULE_CONTEXT_HEADING,
  splitDescriptionSection,
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
