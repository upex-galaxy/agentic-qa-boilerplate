import { describe, expect, test } from 'bun:test';

import { MODULE_CONTEXT_HEADING, splitDescriptionSection } from './sync-jira-issues.ts';

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
