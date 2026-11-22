import type { IssueTracker } from './issue-tracker.ts';

export function skipJiraPhase(tracker: IssueTracker, skipEnv: boolean): boolean {
  return skipEnv || tracker !== 'jira';
}

export function missingClisFor(tracker: IssueTracker, externalClis: Record<string, string>): string[] {
  return Object.entries(externalClis)
    .filter(([name, status]) => status === 'missing' && (tracker === 'jira' || name !== 'acli'))
    .map(([name]) => name);
}
