import { describe, expect, test } from 'bun:test';
import { resolveIssueTracker } from './issue-tracker.ts';
import { missingClisFor, skipJiraPhase } from './tracker-gating.ts';

describe('skipJiraPhase', () => {
  test.each([null, 'Jira', 'JIRA', 'Jira Cloud', 'Linear', ''])('%p keeps the Jira phase on', (raw) => {
    expect(skipJiraPhase(resolveIssueTracker(raw), false)).toBe(false);
  });

  test('github and none skip it, and INSTALL_SKIP_JIRA skips it on any tracker', () => {
    expect(skipJiraPhase('github', false)).toBe(true);
    expect(skipJiraPhase('none', false)).toBe(true);
    expect(skipJiraPhase('jira', true)).toBe(true);
  });
});

describe('missingClisFor', () => {
  const clis = { acli: 'missing', gh: 'missing', jq: 'ok' };

  test('acli is required on jira only', () => {
    expect(missingClisFor('jira', clis)).toEqual(['acli', 'gh']);
    expect(missingClisFor('github', clis)).toEqual(['gh']);
    expect(missingClisFor('none', clis)).toEqual(['gh']);
  });
});
