/**
 * @fileoverview Tests for the Jira-slug reverse check in `scripts/lint-vars.ts`.
 *
 * The forward direction — a skill referencing a slug the manifest does not
 * declare — already fails the lint and is exercised every run. The REVERSE
 * direction is the one that needs a test, because on this repo it correctly
 * reports zero: every declared slug is consumed. A check that is green on the
 * only repo it ever runs against is indistinguishable from a check that cannot
 * fire, so the discrimination is pinned here instead.
 *
 * Importing this module must not run the linter: `main()` sits behind
 * `import.meta.main` for exactly that reason.
 */

import { describe, expect, test } from 'bun:test';

import { slugUsedAsIdentifier } from './lint-vars.ts';

describe('slugUsedAsIdentifier', () => {
  // The three shapes that are real consumption. `scripts/sync-jira-issues.ts`
  // uses the first two for all 25 manifest slugs, which is why the reverse
  // check finds no orphans on this repo — and why a substring match would have
  // been useless in the other direction too.
  test('a quoted key counts', () => {
    expect(slugUsedAsIdentifier('  mockup: \'mockup\',', 'mockup')).toBe(true);
    expect(slugUsedAsIdentifier('const f = { a: "story_points" };', 'story_points')).toBe(true);
    expect(slugUsedAsIdentifier('const f = `weblink`;', 'weblink')).toBe(true);
  });

  test('a property access counts', () => {
    expect(slugUsedAsIdentifier('CUSTOM_FIELDS.out_of_scope,', 'out_of_scope')).toBe(true);
  });

  test('a {{jira.*}} template inside a TS string counts', () => {
    expect(slugUsedAsIdentifier('const t = "{{jira.acceptance_criteria}}";', 'acceptance_criteria')).toBe(true);
  });

  // The failure the first implementation had. Half these slugs are ordinary
  // English, so `text.includes(slug)` matched a comment somewhere for every
  // candidate and the check reported zero findings forever — coverage-shaped,
  // and worth nothing.
  test('prose that merely mentions the word does NOT count', () => {
    expect(slugUsedAsIdentifier('// the workflow for this is documented above', 'workflow')).toBe(false);
    expect(slugUsedAsIdentifier('// out of scope for this release', 'scope')).toBe(false);
    expect(slugUsedAsIdentifier('// attach the evidence to the ticket', 'evidence')).toBe(false);
    expect(slugUsedAsIdentifier('/** fix the caller */', 'fix')).toBe(false);
  });

  test('a longer slug containing this one does not count as a use of it', () => {
    expect(slugUsedAsIdentifier('x = \'feature_test_plan\';', 'test_plan')).toBe(false);
  });

  test('a slug with regex metacharacters is matched literally, not as a pattern', () => {
    expect(slugUsedAsIdentifier('x = \'a.b\';', 'a.b')).toBe(true);
    expect(slugUsedAsIdentifier('x = \'axb\';', 'a.b')).toBe(false);
  });
});
