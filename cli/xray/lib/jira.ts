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
 *   3. `ATLASSIAN_URL` env var                                (last resort; NOT a
 *      .env variable anymore — a hit means a stale copy is loose in the process)
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
 * Public accessor for the resolved Jira host, same precedence as every REST
 * lookup above. Used by `test enrich` to render `/browse/` links matching the
 * ones `sync-jira-issues` already writes; `null` degrades to plain keys.
 */
export function getJiraBaseUrl(): string | null {
  return resolveJiraBaseUrl(loadConfig()?.jira_base_url);
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

/** One `issuelinks` entry as seen FROM the issue that was read. */
export interface IssueLinkView {
  key: string
  id: string
  /**
   * Id of the LINK itself (`issuelinks[].id`), not of either issue. It is the
   * only handle `DELETE /rest/api/3/issueLink/{issueLinkId}` accepts, so a
   * remediation that names a link has to carry it.
   */
  linkId: string
  /** Jira issue type display name of the LINKED issue. */
  issueType: string
  summary: string
  /** Display name of the link type on this instance. */
  linkTypeName: string
  /**
   * Which FIELD the LINKED issue appears under in this entry — the raw shape,
   * not a semantic reading. `inward` means the entry carries
   * `inwardIssue: <linked>`, which for the `test` link type on a Story is the
   * shape Xray's coverage panel counts (measured; see `createIssueLink`).
   *
   * Stated as a shape on purpose: the outward/inward DESCRIPTIONS can be read
   * in either direction by an operator, and doing so is what produced a wrong
   * coverage recipe. The field name cannot be read two ways.
   */
  side: 'inward' | 'outward'
}

/**
 * Read every `issuelinks` entry of `issueKey`, typed and with direction kept.
 *
 * Unlike `getLinkedTests` this filters nothing: the three-edge traceability
 * check (`trace`) needs Test Sets, Test Plans and Test Executions, and it needs
 * to know which side the Story sits on, because an inverted `test` link still
 * exists and still reads as a link — it just carries no coverage.
 *
 * Returns `null` when Jira credentials are not configured, same contract as
 * every read above. Throws on a non-OK Jira response.
 */
export async function getIssueLinks(issueKey: string): Promise<IssueLinkView[] | null> {
  const config = loadConfig();
  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const response = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}?fields=issuelinks,summary,issuetype`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Jira REST request failed for ${issueKey}: ${response.status} ${response.statusText}`);
  }

  const issue = (await response.json()) as JiraIssueWithLinks;
  const out: IssueLinkView[] = [];
  for (const link of issue.fields?.issuelinks ?? []) {
    // The entry names the OTHER issue, under the field name that issue carried
    // in the payload that created the link (measured round trip — see
    // `createIssueLink`). `side` reports that field name verbatim.
    const outward = link.outwardIssue;
    const inward = link.inwardIssue;
    const linked = outward ?? inward;
    if (!linked) {
      continue;
    }
    out.push({
      key: linked.key,
      id: linked.id,
      linkId: link.id,
      issueType: linked.fields?.issuetype?.name ?? 'unknown',
      summary: linked.fields?.summary ?? '',
      linkTypeName: link.type?.name ?? 'unknown',
      side: outward ? 'outward' : 'inward',
    });
  }
  return out;
}

/**
 * Resolve every issue key matching a JQL query via `POST /rest/api/3/search/jql`.
 *
 * Used by `trace --jql` to turn "every Story in this project with a Test link"
 * into a repair worklist. The endpoint pages by opaque token and requires the
 * same `jql`/`fields` on every request: a token-only body answers 400.
 *
 * Returns `null` when Jira credentials are not configured. Throws on a non-OK
 * response.
 */
export async function searchIssueKeys(jql: string, maxResults = 100): Promise<string[] | null> {
  const config = loadConfig();
  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const keys: string[] = [];
  let nextPageToken: string | undefined;

  for (;;) {
    const body: Record<string, unknown> = nextPageToken
      ? { jql, fields: ['key'], maxResults, nextPageToken }
      : { jql, fields: ['key'], maxResults };

    const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jira REST JQL search failed: ${response.status} ${response.statusText} - ${text}`);
    }

    const page = (await response.json()) as {
      isLast?: boolean
      nextPageToken?: string
      issues?: Array<{ key: string }>
    };
    for (const issue of page.issues ?? []) {
      keys.push(issue.key);
    }

    if (page.isLast || !page.nextPageToken) {
      break;
    }
    nextPageToken = page.nextPageToken;
  }

  return keys;
}

// ============================================================================
// ISSUE LINK CREATION — the coverage write-path (`link create`)
// ============================================================================

/** The exact `POST /rest/api/3/issueLink` body sent, returned so callers can report it. */
export interface IssueLinkPayload {
  type: { name: string }
  outwardIssue: { key: string }
  inwardIssue: { key: string }
}

/**
 * Build the `POST /rest/api/3/issueLink` body for "`subjectKey` <outward verb>
 * `objectKey`" — e.g. "the ATS *tests* the Story".
 *
 * The field assignment is INVERTED relative to what the field names suggest,
 * and that is a measured fact, not a reading of Jira's docs:
 *
 *   1. Round trip. A link POSTed as `{outwardIssue: A, inwardIssue: B}` reads
 *      back from B's `issuelinks` as `outwardIssue: A`, and from A's as
 *      `inwardIssue: B`. A key keeps the PAYLOAD field name it was sent under
 *      when the other issue is read.
 *   2. Coverage. Xray counts a Story's coverage only from the entry that
 *      carries the artifact under `inwardIssue` on the STORY. Measured on one
 *      Story holding both shapes over two disjoint sets of ten Tests: the ten
 *      under `inwardIssue` were returned by `getCoverableIssue(...).tests`, the
 *      ten under `outwardIssue` were not (live instance, 2026-09).
 *
 * So the covering artifact must be sent as `inwardIssue` and the covered issue
 * as `outwardIssue`. The previous assignment was the other way round, which
 * made the documented recipe `link create <ARTIFACT> <STORY> --type test`
 * store the zero-coverage shape while its confirmation line described the
 * correct one — the read path (`trace`) was right all along.
 *
 * `typeName` is the instance's DISPLAY name; callers resolve it from the
 * `.agents/jira-required.yaml` link-type catalog, never hardcode it.
 */
export function buildIssueLinkPayload(
  typeName: string,
  subjectKey: string,
  objectKey: string,
): IssueLinkPayload {
  return {
    type: { name: typeName },
    outwardIssue: { key: objectKey },
    inwardIssue: { key: subjectKey },
  };
}

/**
 * Create a Jira issue link via `POST /rest/api/3/issueLink`.
 *
 * `subjectKey` performs the link type's OUTWARD verb, `objectKey` receives it
 * (coverage: subject = the Test / Test Set, object = the Story). See
 * `buildIssueLinkPayload` for the measured field mapping.
 *
 * Returns the payload actually POSTed, so the caller's confirmation line can be
 * generated from it instead of from an assumption, or `null` when Jira
 * credentials are not configured (same contract as every read above — the
 * caller surfaces the guiding error). Throws on a non-OK Jira response, with
 * the body included: Jira's 404 for an unknown link-type name is otherwise
 * indistinguishable from a missing issue.
 */
export async function createIssueLink(
  typeName: string,
  subjectKey: string,
  objectKey: string,
): Promise<IssueLinkPayload | null> {
  const config = loadConfig();
  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  const payload = buildIssueLinkPayload(typeName, subjectKey, objectKey);
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const response = await fetch(`${baseUrl}/rest/api/3/issueLink`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Jira REST issueLink create failed (${subjectKey} -> ${objectKey}, type "${typeName}"): `
      + `${response.status} ${response.statusText} - ${text}`,
    );
  }

  return payload;
}

/**
 * Delete one Jira issue link by its own id via
 * `DELETE /rest/api/3/issueLink/{issueLinkId}`.
 *
 * It exists because repairing an inverted coverage link REQUIRES a delete:
 * Jira dedupes a link between the same pair and type regardless of direction,
 * so creating the corrected link on top of the wrong one is a silent no-op
 * (measured). The id is the `issuelinks[].id` of the entry, surfaced by
 * `getIssueLinks` as `linkId` — never an issue id and never an issue key.
 *
 * Returns `null` when Jira credentials are not configured. Throws on a non-OK
 * response; 204 and 200 both mean deleted.
 */
export async function deleteIssueLink(linkId: string): Promise<true | null> {
  const config = loadConfig();
  const baseUrl = resolveJiraBaseUrl(config?.jira_base_url);
  const email = config?.jira_email || process.env.ATLASSIAN_EMAIL;
  const token = config?.jira_api_token || process.env.ATLASSIAN_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null;
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const response = await fetch(`${baseUrl}/rest/api/3/issueLink/${encodeURIComponent(linkId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Jira REST issueLink delete failed (link id ${linkId}): `
      + `${response.status} ${response.statusText} - ${text}`,
    );
  }

  return true;
}
