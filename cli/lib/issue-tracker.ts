// Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate. Node built-ins only: cli/preflight.ts imports it before `bun install`.

export type IssueTracker = 'jira' | 'github' | 'none';

export const ISSUE_TRACKERS: readonly IssueTracker[] = ['jira', 'github', 'none'];

export interface IssueTrackerReading {
  tracker: IssueTracker
  raw: string | null
  recognized: boolean
}

export function describeIssueTracker(raw: unknown): IssueTrackerReading {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { tracker: 'jira', raw: null, recognized: true };
  }
  const value = raw.trim().toLowerCase();
  if (value === 'github') { return { tracker: 'github', raw, recognized: true }; }
  if (value === 'none') { return { tracker: 'none', raw, recognized: true }; }
  // Every value written before the enum existed ran the Jira path, so unknown text keeps it.
  return { tracker: 'jira', raw, recognized: value.includes('jira') };
}

export function resolveIssueTracker(raw: unknown): IssueTracker {
  return describeIssueTracker(raw).tracker;
}

export function validateIssueTrackerAnswer(raw: string): { ok: boolean, value?: string, error?: string, warning?: string } {
  const trimmed = raw.trim();
  if (!trimmed) { return { ok: false, error: 'Cannot be empty.' }; }
  if ((ISSUE_TRACKERS as readonly string[]).includes(trimmed.toLowerCase())) { return { ok: true, value: trimmed.toLowerCase() }; }
  const named = describeIssueTracker(trimmed).recognized ? '' : ` It is not one of ${ISSUE_TRACKERS.join(' | ')}.`;
  return { ok: true, value: trimmed, warning: `"${trimmed}" resolves to jira; writing jira states it plainly.${named}` };
}

export function readIssueTrackerValue(yamlText: string): string | null {
  let section = '';
  for (const line of yamlText.split('\n')) {
    const top = /^([a-z_]+):/.exec(line);
    if (top) {
      section = top[1];
      continue;
    }
    if (section !== 'issue_tracker') { continue; }
    const leaf = /^ {2}issue_tracker:(.*)$/.exec(line);
    if (!leaf) { continue; }
    const hash = leaf[1].search(/(?:^|\s)#/);
    const value = (hash >= 0 ? leaf[1].slice(0, hash) : leaf[1]).trim().replace(/^(['"])(.*)\1$/, '$2');
    return value === '' || value === 'null' || value === '~' ? null : value;
  }
  return null;
}

export function issueTrackerOf(yamlText: string): IssueTrackerReading {
  return describeIssueTracker(readIssueTrackerValue(yamlText));
}

export const GH_PROJECT_SCOPE_FIX = 'gh auth refresh -h github.com -s project';

export interface GhAuthReading {
  account: string | null
  scopes: string[] | null
  hasProjectScope: boolean | null
}

export function parseGhAuthStatus(output: string): GhAuthReading {
  const blocks: string[][] = [];
  let host = '';
  for (const line of output.split('\n')) {
    const hostLine = /^(\S+)\s*$/.exec(line);
    if (hostLine) {
      host = hostLine[1];
      continue;
    }
    if (host !== 'github.com') { continue; }
    if (/github\.com account\s+\S+/.test(line)) {
      blocks.push([line]);
      continue;
    }
    blocks[blocks.length - 1]?.push(line);
  }
  const signedIn = blocks.filter(b => /Logged in to github\.com/.test(b[0]));
  const active = blocks.find(b => b.some(l => /Active account:\s*true/.test(l))) ?? (blocks.length === 1 ? blocks[0] : undefined);
  if (!active || !signedIn.includes(active)) { return { account: null, scopes: null, hasProjectScope: null }; }
  const account = /account\s+(\S+)/.exec(active[0])?.[1] ?? null;
  const scopeLine = active.find(l => /Token scopes:/.test(l));
  if (!scopeLine) { return { account, scopes: null, hasProjectScope: null }; }
  const scopes = [...scopeLine.slice(scopeLine.indexOf('Token scopes:') + 'Token scopes:'.length).matchAll(/'([^']+)'/g)].map(m => m[1]);
  return { account, scopes, hasProjectScope: scopes.includes('project') };
}
