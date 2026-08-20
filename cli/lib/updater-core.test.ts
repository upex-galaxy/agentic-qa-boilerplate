import { describe, expect, test } from 'bun:test';

import { isRepoOnlyPath } from './updater-core.ts';

describe('isRepoOnlyPath', () => {
  const prefixes = ['docs/qa-standard'];

  test('matches the prefix itself', () => {
    expect(isRepoOnlyPath('docs/qa-standard', prefixes)).toBe(true);
  });

  test('matches anything beneath the prefix', () => {
    expect(isRepoOnlyPath('docs/qa-standard/planning-ladder-proposal.md', prefixes)).toBe(true);
    expect(isRepoOnlyPath('docs/qa-standard/nested/deep.md', prefixes)).toBe(true);
  });

  test('leaves siblings alone', () => {
    // The bug this guards: a naive startsWith would swallow all three.
    expect(isRepoOnlyPath('docs/qa-standards/x.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('docs/qa-standard-archive/x.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('docs/qa-standardish.md', prefixes)).toBe(false);
  });

  test('leaves unrelated paths alone', () => {
    expect(isRepoOnlyPath('docs/methodology/kata-fundamentals.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('.claude/skills/acli/SKILL.md', prefixes)).toBe(false);
  });

  test('does not match a parent of the prefix', () => {
    expect(isRepoOnlyPath('docs', prefixes)).toBe(false);
  });

  test('normalizes backslashes on both sides', () => {
    expect(isRepoOnlyPath('docs\\qa-standard\\x.md', prefixes)).toBe(true);
    expect(isRepoOnlyPath('docs/qa-standard/x.md', ['docs\\qa-standard'])).toBe(true);
  });

  test('tolerates a trailing slash in the configured prefix', () => {
    expect(isRepoOnlyPath('docs/qa-standard/x.md', ['docs/qa-standard/'])).toBe(true);
  });

  test('an empty prefix never matches, so a stray entry cannot blank the sync', () => {
    expect(isRepoOnlyPath('docs/anything.md', [''])).toBe(false);
    expect(isRepoOnlyPath('docs/anything.md', ['/'])).toBe(false);
  });

  test('no prefixes configured means nothing is filtered', () => {
    expect(isRepoOnlyPath('docs/qa-standard/x.md', [])).toBe(false);
  });
});
