import { describe, expect, test } from 'bun:test';

import { describeIssueTracker, issueTrackerOf, parseGhAuthStatus, readIssueTrackerValue, resolveIssueTracker, validateIssueTrackerAnswer } from './issue-tracker.ts';

describe('resolveIssueTracker', () => {
  test.each([
    [null, 'jira'],
    [undefined, 'jira'],
    ['', 'jira'],
    ['   ', 'jira'],
    ['jira', 'jira'],
    ['Jira', 'jira'],
    ['JIRA', 'jira'],
    ['Jira Cloud', 'jira'],
    ['Atlassian Jira (company-managed)', 'jira'],
    ['github', 'github'],
    ['GitHub', 'github'],
    [' GITHUB ', 'github'],
    ['none', 'none'],
    ['None', 'none'],
  ] as const)('%p resolves to %p', (raw, expected) => {
    expect(resolveIssueTracker(raw)).toBe(expected);
  });

  test('a non-string value keeps the Jira path', () => {
    expect(resolveIssueTracker(42)).toBe('jira');
    expect(resolveIssueTracker(true)).toBe('jira');
    expect(resolveIssueTracker({ github: true })).toBe('jira');
  });

  test('text outside the enum keeps the Jira path and is flagged as unrecognized', () => {
    expect(describeIssueTracker('GitHub Issues')).toEqual({ tracker: 'jira', raw: 'GitHub Issues', recognized: false });
    expect(describeIssueTracker('Linear')).toEqual({ tracker: 'jira', raw: 'Linear', recognized: false });
    expect(describeIssueTracker('Jira')).toEqual({ tracker: 'jira', raw: 'Jira', recognized: true });
    expect(describeIssueTracker(null)).toEqual({ tracker: 'jira', raw: null, recognized: true });
  });
});

describe('validateIssueTrackerAnswer', () => {
  test('the enum, any case, is written lower-case', () => {
    expect(validateIssueTrackerAnswer(' GitHub ')).toEqual({ ok: true, value: 'github' });
    expect(validateIssueTrackerAnswer('JIRA')).toEqual({ ok: true, value: 'jira' });
    expect(validateIssueTrackerAnswer('none')).toEqual({ ok: true, value: 'none' });
  });

  test('older text naming Jira is kept, with a warning', () => {
    expect(validateIssueTrackerAnswer('Jira Cloud')).toMatchObject({ ok: true, value: 'Jira Cloud', warning: expect.stringContaining('resolves to jira') });
  });

  test('other text is kept, as the resolver keeps it on Jira, with a warning naming the enum; nothing is refused', () => {
    expect(validateIssueTrackerAnswer('Linear')).toMatchObject({ ok: true, value: 'Linear', warning: expect.stringContaining('not one of jira | github | none') });
    expect(validateIssueTrackerAnswer('GitHub Issues')).toMatchObject({ ok: true, value: 'GitHub Issues' });
    expect(validateIssueTrackerAnswer('  ').ok).toBe(false);
  });
});

describe('readIssueTrackerValue', () => {
  const yaml = (leaf: string): string => `project:\n  project_name: x\n\nissue_tracker:\n${leaf}\n  issue_tracker_cli: gh\n  github:\n    issue_tracker: decoy\n\ntesting:\n  issue_tracker: decoy\n`;

  test('reads the leaf of the issue_tracker block only', () => {
    expect(readIssueTrackerValue(yaml('  issue_tracker: github'))).toBe('github');
    expect(readIssueTrackerValue(yaml('  issue_tracker: \'GitHub\' # picked by bun setup'))).toBe('GitHub');
    expect(readIssueTrackerValue(yaml('  issue_tracker: "Jira Cloud"'))).toBe('Jira Cloud');
  });

  test('null, ~, empty and a missing block read as null', () => {
    expect(readIssueTrackerValue(yaml('  issue_tracker: null # TODO: fill per project'))).toBeNull();
    expect(readIssueTrackerValue(yaml('  issue_tracker: ~'))).toBeNull();
    expect(readIssueTrackerValue(yaml('  issue_tracker:'))).toBeNull();
    expect(readIssueTrackerValue('project:\n  project_name: x\n')).toBeNull();
    expect(readIssueTrackerValue('')).toBeNull();
  });

  test('issueTrackerOf resolves what it reads', () => {
    expect(issueTrackerOf(yaml('  issue_tracker: none')).tracker).toBe('none');
    expect(issueTrackerOf(yaml('  issue_tracker: null')).tracker).toBe('jira');
  });
});

describe('parseGhAuthStatus', () => {
  const two = [
    'github.com',
    '  ✓ Logged in to github.com account first (keyring)',
    '  - Active account: false',
    '  - Token scopes: \'gist\', \'project\', \'repo\'',
    '',
    '  ✓ Logged in to github.com account second (keyring)',
    '  - Active account: true',
    '  - Git operations protocol: https',
    '  - Token scopes: \'gist\', \'read:org\', \'repo\', \'workflow\'',
  ].join('\n');

  test('reads the active account, not the first one', () => {
    expect(parseGhAuthStatus(two)).toEqual({ account: 'second', scopes: ['gist', 'read:org', 'repo', 'workflow'], hasProjectScope: false });
  });

  test('sees the project scope on the active account', () => {
    const out = two.replace('\'read:org\', \'repo\', \'workflow\'', '\'project\', \'repo\'');
    expect(parseGhAuthStatus(out).hasProjectScope).toBe(true);
  });

  test('a single account without the Active line is the active one', () => {
    const out = 'github.com\n  ✓ Logged in to github.com account solo (oauth_token)\n  - Token scopes: \'project\', \'repo\'\n';
    expect(parseGhAuthStatus(out)).toEqual({ account: 'solo', scopes: ['project', 'repo'], hasProjectScope: true });
  });

  test('no scope line (an env token) and no session read as unknown', () => {
    expect(parseGhAuthStatus('github.com\n  ✓ Logged in to github.com account ci (GH_TOKEN)\n  - Active account: true\n')).toEqual({ account: 'ci', scopes: null, hasProjectScope: null });
    expect(parseGhAuthStatus('You are not logged into any GitHub hosts. To log in, run: gh auth login')).toEqual({ account: null, scopes: null, hasProjectScope: null });
  });

  test('a failed account block is its own block, and a failed active account reads as signed out', () => {
    const out = [
      'github.com',
      '  ✓ Logged in to github.com account good (keyring)',
      '  - Active account: false',
      '  - Token scopes: \'project\'',
      '',
      '  X Failed to log in to github.com account bad (keyring)',
      '  - Active account: true',
      '  - The token in keyring is invalid.',
    ].join('\n');
    expect(parseGhAuthStatus(out)).toEqual({ account: null, scopes: null, hasProjectScope: null });
  });

  test('stderr-only output (older gh) parses the same', () => {
    const stderrOnly = '\ngithub.com\n  ✓ Logged in to github.com account solo (keyring)\n  - Active account: true\n  - Token scopes: \'project\'\n';
    expect(parseGhAuthStatus(stderrOnly).hasProjectScope).toBe(true);
  });

  test('another host does not count', () => {
    const out = 'ghe.acme.dev\n  ✓ Logged in to ghe.acme.dev account x (keyring)\n  - Active account: true\n  - Token scopes: \'project\'\n';
    expect(parseGhAuthStatus(out).hasProjectScope).toBeNull();
  });
});
