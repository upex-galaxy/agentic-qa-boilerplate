import { describe, expect, test } from 'bun:test';
import { extractLinkType, listLinkTypeSlugs } from './link-types.ts';

/** Mimics the `.agents/jira-required.yaml` -> `link_types` shape. */
const CATALOG = {
  link_types: {
    required: {
      test: {
        name: 'Test',
        outward: 'tests',
        inward: 'is tested by',
        description: 'Coverage edge.',
        fallback: 'relates',
        used_by: ['sprint-testing'],
      },
      blocks: {
        name: 'Blocks',
        outward: 'blocks',
        inward: 'is blocked by',
        fallback: 'blocking',
      },
    },
    optional: {
      relates: {
        name: 'Relates',
        outward: 'relates to',
        inward: 'relates to',
        fallback: null,
      },
      test_execute: {
        name: 'Test Execute',
        outward: 'executes',
        inward: 'is executed by',
        fallback: 'test',
      },
    },
  },
};

describe('extractLinkType', () => {
  test('resolves a required slug with name and directions', () => {
    expect(extractLinkType(CATALOG, 'test')).toEqual({
      slug: 'test',
      name: 'Test',
      outward: 'tests',
      inward: 'is tested by',
      fallback: 'relates',
    });
  });

  test('resolves an optional slug', () => {
    expect(extractLinkType(CATALOG, 'test_execute')?.name).toBe('Test Execute');
  });

  test('normalizes a null fallback', () => {
    expect(extractLinkType(CATALOG, 'relates')?.fallback).toBeNull();
  });

  test('returns null for an unknown slug', () => {
    expect(extractLinkType(CATALOG, 'nope')).toBeNull();
  });

  test('rejects a half-filled entry missing direction semantics', () => {
    const broken = { link_types: { required: { test: { name: 'Test' } } } };

    expect(extractLinkType(broken, 'test')).toBeNull();
  });

  test('required tier wins when a slug exists in both tiers', () => {
    const dupe = {
      link_types: {
        required: { test: { name: 'Test', outward: 'tests', inward: 'is tested by' } },
        optional: { test: { name: 'Shadowed', outward: 'x', inward: 'y' } },
      },
    };

    expect(extractLinkType(dupe, 'test')?.name).toBe('Test');
  });

  test('tolerates a document without link_types', () => {
    expect(extractLinkType({}, 'test')).toBeNull();
    expect(extractLinkType(null, 'test')).toBeNull();
    expect(extractLinkType('garbage', 'test')).toBeNull();
  });
});

describe('listLinkTypeSlugs', () => {
  test('lists required first, then optional, each sorted', () => {
    expect(listLinkTypeSlugs(CATALOG)).toEqual(['blocks', 'test', 'relates', 'test_execute']);
  });

  test('deduplicates a slug present in both tiers', () => {
    const dupe = {
      link_types: {
        required: { test: {} },
        optional: { test: {}, relates: {} },
      },
    };

    expect(listLinkTypeSlugs(dupe)).toEqual(['test', 'relates']);
  });

  test('returns empty for a document without link_types', () => {
    expect(listLinkTypeSlugs({})).toEqual([]);
    expect(listLinkTypeSlugs(null)).toEqual([]);
  });
});
