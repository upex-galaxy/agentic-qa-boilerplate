/**
 * Xray CLI - Jira REST API Module
 *
 * Jira REST API client for issue lookups.
 */

import type { JiraIssue } from '../types/index.js';
import { normalizeAtlassianUrl, readAtlassianUrlFromYaml } from '../../lib/atlassian-instance';
import { loadConfig } from './config.js';

// ============================================================================
// JIRA REST API CLIENT
// ============================================================================

/**
 * Resolves the Jira host used for REST lookups. Precedence:
 *   1. `~/.xray-cli/config.json` -> jira_base_url             (the login's decision)
 *   2. `.agents/project.yaml` -> issue_tracker.atlassian_url  (versioned, reviewable)
 *   3. `ATLASSIAN_URL` env var                                (last resort)
 *
 * The stored config stays FIRST because it is not a passive cache: it is what
 * `auth login` decided, and that decision may have come from an explicit
 * `--jira-url` (the documented way to point the CLI at another site). Demoting it
 * below the yaml would silently discard that override at request time while
 * `auth status` still reported it, which is worse than the problem being fixed.
 *
 * The yaml sits ABOVE the env var, though, and that is the actual fix here. When
 * no login has run, the old code fell straight through to `ATLASSIAN_URL` — the
 * variable that survives a site migration inside an inherited process
 * environment. The hazard is not cosmetic: `resolveIssueId` turns a Jira key into
 * a NUMERIC id, and that id is fed to Xray mutations that write run statuses and
 * link defects. Resolve the key against the wrong site and the id may still exist
 * on the right one, pointing at an unrelated issue.
 *
 * The Xray API itself is unaffected: XRAY_AUTH_URL / XRAY_GRAPHQL_URL are fixed
 * global endpoints, and the instance is identified by the client id/secret pair.
 * Only these Jira REST lookups need a host.
 *
 * A stored host that disagrees with the yaml is reported once per process: the
 * config is machine-global, written once, and never revisited, so after a site
 * migration it keeps pointing at the old instance until someone re-runs login.
 *
 * Returns `null` when no source is set (callers already treat that as
 * "credentials not configured" and surface a guiding error).
 */
let staleConfigReported = false;
function resolveJiraBaseUrl(configuredBaseUrl: string | undefined): string | null {
  const configUrl = normalizeAtlassianUrl(configuredBaseUrl);
  const yamlUrl = readAtlassianUrlFromYaml();

  if (configUrl) {
    if (yamlUrl && !staleConfigReported && configUrl.toLowerCase() !== yamlUrl.toLowerCase()) {
      staleConfigReported = true;
      console.warn(
        `⚠ xray: stored Jira host (${configUrl}) disagrees with .agents/project.yaml (${yamlUrl}). `
        + 'Using the stored value, since it is what `xray auth login` recorded. If the site was '
        + 'migrated, re-run `bun xray auth login` to refresh ~/.xray-cli/config.json.',
      );
    }
    return configUrl;
  }

  return yamlUrl ?? normalizeAtlassianUrl(process.env.ATLASSIAN_URL);
}

/**
 * Look up a Jira issue by key to get its numeric ID
 * Requires Jira credentials configured via auth login --jira-*
 */
export async function getJiraIssueId(key: string): Promise<string | null> {
  const config = loadConfig();

  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

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

/**
 * Enumerate every project on the Jira site (key + name + numeric id) via
 * `GET /rest/api/3/project/search`, paginating `maxResults=50`. Used by
 * `backup export --all` to discover which projects to probe for Xray data.
 *
 * Returns `null` when Jira credentials are not configured (caller surfaces a
 * guiding error). Throws on a non-OK Jira response.
 */
export async function listProjects(): Promise<Array<{ key: string, name: string, id: string }> | null> {
  const config = loadConfig();
  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const projects: Array<{ key: string, name: string, id: string }> = [];
  let startAt = 0;
  const maxResults = 50;

  for (;;) {
    const response = await fetch(
      `${baseUrl}/rest/api/3/project/search?startAt=${startAt}&maxResults=${maxResults}`,
      { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } },
    );

    if (!response.ok) {
      throw new Error(`Jira REST project search failed: ${response.status} ${response.statusText}`);
    }

    const page = (await response.json()) as {
      isLast?: boolean
      values?: Array<{ id: string, key: string, name: string }>
    };
    for (const p of page.values ?? []) {
      projects.push({ key: p.key, name: p.name, id: p.id });
    }

    if (page.isLast || !page.values || page.values.length < maxResults) {
      break;
    }
    startAt += maxResults;
  }

  return projects;
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
 *   - Jira key (`{{PROJECT_KEY}}-194`) → resolved via Jira REST `GET /rest/api/3/issue/{key}`.
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
      `Invalid issue reference: '${input}' (expected Jira key like {{PROJECT_KEY}}-123 or numeric issue id)`,
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
  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

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
