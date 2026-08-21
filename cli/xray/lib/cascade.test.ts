import { describe, expect, test } from 'bun:test';
import { diffMembership } from './cascade.ts';

describe('diffMembership', () => {
  test('splits members into missing and present', () => {
    const { missing, present } = diffMembership(['1', '2', '3'], ['2']);

    expect(missing).toEqual(['1', '3']);
    expect(present).toEqual(['2']);
  });

  test('empty source yields nothing to add', () => {
    expect(diffMembership([], ['1', '2'])).toEqual({ missing: [], present: [] });
  });

  test('empty target attaches every member', () => {
    expect(diffMembership(['1', '2'], [])).toEqual({ missing: ['1', '2'], present: [] });
  });

  test('identical memberships report everything as skipped', () => {
    expect(diffMembership(['1', '2'], ['2', '1'])).toEqual({ missing: [], present: ['1', '2'] });
  });

  test('collapses duplicated source ids so a mutation never sends one twice', () => {
    const { missing, present } = diffMembership(['1', '1', '2', '2'], ['2']);

    expect(missing).toEqual(['1']);
    expect(present).toEqual(['2']);
  });

  test('preserves source order in both buckets', () => {
    const { missing, present } = diffMembership(['9', '3', '7', '1'], ['3', '1']);

    expect(missing).toEqual(['9', '7']);
    expect(present).toEqual(['3', '1']);
  });

  test('ignores target ids absent from the source (removal is not its job)', () => {
    const { missing, present } = diffMembership(['1'], ['1', '999']);

    expect(missing).toEqual([]);
    expect(present).toEqual(['1']);
  });
});
