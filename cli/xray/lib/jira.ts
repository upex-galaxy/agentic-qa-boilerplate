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
