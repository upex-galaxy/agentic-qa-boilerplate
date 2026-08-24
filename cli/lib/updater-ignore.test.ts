import { describe, expect, test } from 'bun:test';

import { groupIgnoreLines, ignoreLineStem } from './updater-ignore.ts';

// The exact ladder from AGENTS.md §9 — the case the grouping exists for.
const PBI_LADDER = [
  '.context/PBI/*',
  '!.context/PBI/README.md',
  '!.context/PBI/templates/',
  '!.context/PBI/epics/',
  '.context/PBI/epics/*',
  '!.context/PBI/epics/*/',
  '.context/PBI/epics/*/*',
  '!.context/PBI/epics/*/test-specs/',
];

describe('ignoreLineStem', () => {
  test('strips the leading negation', () => {
    expect(ignoreLineStem('!.context/PBI/README.md')).toBe('.context/PBI/README.md');
  });

  test('strips trailing glob segments and slashes', () => {
    expect(ignoreLineStem('.context/PBI/*')).toBe('.context/PBI');
    expect(ignoreLineStem('.context/PBI/epics/*/*')).toBe('.context/PBI/epics');
    expect(ignoreLineStem('!.context/PBI/templates/')).toBe('.context/PBI/templates');
    expect(ignoreLineStem('dist/**')).toBe('dist');
  });

  test('keeps mid-path globs (still prefix-comparable)', () => {
    expect(ignoreLineStem('!.context/PBI/epics/*/test-specs/')).toBe('.context/PBI/epics/*/test-specs');
  });
});

describe('groupIgnoreLines', () => {
  test('the PBI gitignore ladder collapses into ONE atomic group', () => {
    const groups = groupIgnoreLines(PBI_LADDER);
    expect(groups).toHaveLength(1);
    expect(groups[0].atomic).toBe(true);
    expect(groups[0].lines).toEqual(PBI_LADDER);
  });

  test('unrelated single lines stay individual and non-atomic', () => {
    const groups = groupIgnoreLines(['node_modules/', 'dist/', '.env']);
    expect(groups).toHaveLength(3);
    for (const g of groups) {
      expect(g.atomic).toBe(false);
      expect(g.lines).toHaveLength(1);
    }
  });

  test('a ladder between unrelated lines groups only the ladder', () => {
    const lines = ['node_modules/', ...PBI_LADDER, '.env'];
    const groups = groupIgnoreLines(lines);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ lines: ['node_modules/'], atomic: false });
    expect(groups[1]).toEqual({ lines: PBI_LADDER, atomic: true });
    expect(groups[2]).toEqual({ lines: ['.env'], atomic: false });
  });

  test('a pattern followed by an unrelated negation does not group', () => {
    const groups = groupIgnoreLines(['dist/', '!coverage/keep.md']);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => !g.atomic)).toBe(true);
  });

  test('consecutive prefix-sharing patterns WITHOUT a negation stay individual', () => {
    // No re-include ladder involved — grouping them all-or-nothing would only
    // remove choice, not prevent corruption.
    const groups = groupIgnoreLines(['dist/', 'dist/assets/*']);
    expect(groups).toHaveLength(2);
    expect(groups.every(g => !g.atomic && g.lines.length === 1)).toBe(true);
  });

  test('a minimal pattern + negation pair is atomic', () => {
    const groups = groupIgnoreLines(['reports/*', '!reports/README.md']);
    expect(groups).toHaveLength(1);
    expect(groups[0].atomic).toBe(true);
    expect(groups[0].lines).toEqual(['reports/*', '!reports/README.md']);
  });

  test('preserves input order across groups', () => {
    const lines = ['a/*', '!a/keep', 'zzz.log', 'b/*', '!b/keep'];
    const groups = groupIgnoreLines(lines);
    expect(groups.map(g => g.lines).flat()).toEqual(lines);
    expect(groups).toHaveLength(3);
    expect(groups[0].atomic).toBe(true);
    expect(groups[1].atomic).toBe(false);
    expect(groups[2].atomic).toBe(true);
  });

  test('empty input yields no groups', () => {
    expect(groupIgnoreLines([])).toEqual([]);
  });
});
