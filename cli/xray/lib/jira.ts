/**
 * Xray CLI - Jira REST API Module
 *
 * Jira REST API client for issue lookups.
 */

import type { JiraIssue } from '../types/index.js';
import { loadConfig } from './config.js';

// ============================================================================
// JIRA REST API CLIENT
// ============================================================================

/**
 * Look up a Jira issue by key to get its numeric ID
 * Requires Jira credentials configured via auth login --jira-*
 */
export async function getJiraIssueId(key: string): Promise<string | null> {
  const config = loadConfig();

  const baseUrl = config?.jira_base_url || process.env.JIRA_BASE_URL;
  const email = config?.jira_email || process.env.JIRA_EMAIL;
  const token = config?.jira_api_token || process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  try {
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    const response = await fetch(`${baseUrl}/rest/api/3/issue/${key}?fields=issuetype`, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const issue = (await response.json()) as JiraIssue;
    return issue.id;
  }
  catch {
    return null;
  }
}

// ============================================================================
// ISSUE REFERENCE RESOLUTION
// ============================================================================

const NUMERIC_PATTERN = /^\d+$/;
const KEY_PATTERN = /^[A-Z][A-Z0-9_]+-\d+$/;

const issueIdCache = new Map<string, string>();

/**
 * Normalize an issue reference into a numeric Xray issueId.
 *
 * Accepts:
 *   - Numeric id (`12345`) → returned as-is.
 *   - Jira key (`SQ-194`) → resolved via Jira REST `GET /rest/api/3/issue/{key}`.
 *
 * Throws a guiding error when the input is malformed or when key resolution
 * fails because Jira credentials are not configured.
 *
 * Resolutions are cached in-process so repeated lookups within one CLI
 * invocation hit Jira at most once per key.
 */
export async function resolveIssueId(input: string): Promise<string> {
  const trimmed = input.trim();

  if (NUMERIC_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!KEY_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid issue reference: '${input}' (expected Jira key like SQ-123 or numeric issue id)`,
    );
  }

  const cached = issueIdCache.get(trimmed);
  if (cached) {
    return cached;
  }

  const id = await getJiraIssueId(trimmed);
  if (!id) {
    throw new Error(
      `Cannot resolve Jira key '${trimmed}' to a numeric issueId. `
      + 'Either pass the numeric id directly or run '
      + '\'bun xray auth login --jira-url <url> --jira-email <email> --jira-token <token>\' '
      + 'to enable key resolution.',
    );
  }

  issueIdCache.set(trimmed, id);
  return id;
}

/**
 * Resolve a list of issue references in parallel.
 * See `resolveIssueId` for accepted input forms and error semantics.
 */
export async function resolveIssueIds(inputs: string[]): Promise<string[]> {
  return Promise.all(inputs.map(resolveIssueId));
}

// ============================================================================
// ISSUE LINKS — Jira-layer view used by sync/repair commands
// ============================================================================

interface JiraLinkedIssue {
  id: string
  key: string
  fields?: {
    issuetype?: { name: string }
    summary?: string
  }
}

interface JiraIssueLink {
  id: string
  type: { name: string, inward?: string, outward?: string }
  inwardIssue?: JiraLinkedIssue
  outwardIssue?: JiraLinkedIssue
}

interface JiraIssueWithLinks {
  id: string
  key: string
  fields?: {
    issuelinks?: JiraIssueLink[]
  }
}

export interface LinkedTest {
  /** Numeric Jira issue id of the linked Test. Same id Xray uses internally. */
  id: string
  key: string
  /** Original link type name from Jira (`"Test"`, `"Tests"`, `"Test Execute"`, ...). */
  linkType: string
}

/**
 * Walk the `issuelinks` of `issueKey` and return every linked issue whose
 * issuetype is `"Test"`. Detects the link in either direction (outward and
 * inward) so a Test Execution that points at its tests AND a Test that
 * points at its plan are both surfaced.
 *
 * Returns `null` if Jira credentials are not configured (caller can decide
 * whether that is fatal — sync commands treat it as fatal with a guiding
 * error, the repair bulk command surfaces it once at startup).
 */
export async function getLinkedTests(issueKey: string): Promise<LinkedTest[] | null> {
  const config = loadConfig();
  const baseUrl = config?.jira_base_url || process.env.JIRA_BASE_URL;
  const email = config?.jira_email || process.env.JIRA_EMAIL;
  const token = config?.jira_api_token || process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}?fields=issuelinks`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Jira REST request failed for ${issueKey}: ${response.status} ${response.statusText}`);
  }

  const issue = (await response.json()) as JiraIssueWithLinks;
  const links = issue.fields?.issuelinks ?? [];
  const out: LinkedTest[] = [];
  for (const link of links) {
    const linked = link.outwardIssue ?? link.inwardIssue;
    if (!linked) {
      continue;
    }
    if (linked.fields?.issuetype?.name !== 'Test') {
      continue;
    }
    out.push({ id: linked.id, key: linked.key, linkType: link.type?.name ?? 'unknown' });
  }
  return out;
}
