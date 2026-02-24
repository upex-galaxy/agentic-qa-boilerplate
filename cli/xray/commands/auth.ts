/**
 * Xray CLI - Auth Commands
 *
 * Commands: login, logout, status
 */

import type { Flags } from '../types/index.js';
import { existsSync, writeFileSync } from 'node:fs';
import { clearToken, configPaths, loadConfig, loadToken, saveConfig, saveToken } from '../lib/config.js';
import { authenticate } from '../lib/graphql.js';
import { log } from '../lib/logger.js';
import { getFlag } from '../lib/parser.js';

// ============================================================================
// LOGIN
// ============================================================================

export async function login(flags: Flags): Promise<void> {
  log.title('Xray CLI Authentication');

  const clientId = getFlag(flags, 'client-id') || process.env.XRAY_CLIENT_ID;
  const clientSecret = getFlag(flags, 'client-secret') || process.env.XRAY_CLIENT_SECRET;
  const defaultProject = getFlag(flags, 'project');

  // Optional Jira credentials for sync features
  const jiraBaseUrl = getFlag(flags, 'jira-url') || process.env.JIRA_BASE_URL;
  const jiraEmail = getFlag(flags, 'jira-email') || process.env.JIRA_EMAIL;
  const jiraApiToken = getFlag(flags, 'jira-token') || process.env.JIRA_API_TOKEN;

  if (!clientId || !clientSecret) {
    log.error('Missing credentials. Provide them via flags or environment variables:');
    console.log(`
  Option 1 - Flags:
    xray auth login --client-id YOUR_ID --client-secret YOUR_SECRET

  Option 2 - Environment variables:
    export XRAY_CLIENT_ID="YOUR_ID"
    export XRAY_CLIENT_SECRET="YOUR_SECRET"
    xray auth login

  Get your API keys from: Jira → Apps → Xray → Settings → API Keys

  Optional Jira credentials (for backup restore --sync):
    --jira-url <url>       Jira base URL (e.g., https://company.atlassian.net)
    --jira-email <email>   Jira account email
    --jira-token <token>   Jira API token (from id.atlassian.com)
`);
    throw new Error('Client ID and Client Secret are required');
  }

  log.dim('Authenticating with Xray...');
  const token = await authenticate(clientId, clientSecret);

  saveConfig({
    client_id: clientId,
    client_secret: clientSecret,
    default_project: defaultProject,
    jira_base_url: jiraBaseUrl,
    jira_email: jiraEmail,
    jira_api_token: jiraApiToken,
  });

  saveToken(token);

  log.success('Successfully logged in to Xray Cloud');
  if (jiraBaseUrl && jiraEmail && jiraApiToken) {
    log.success('Jira REST API credentials saved (for sync features)');
  }
  log.dim(`Config saved to: ${configPaths.file}`);
}

// ============================================================================
// LOGOUT
// ============================================================================

export async function logout(): Promise<void> {
  clearToken();
  if (existsSync(configPaths.file)) {
    writeFileSync(configPaths.file, '');
  }
  log.success('Logged out successfully');
}

// ============================================================================
// STATUS
// ============================================================================

export async function status(): Promise<void> {
  const config = loadConfig();
  const token = loadToken();

  if (!config) {
    log.warn('Not logged in');
    return;
  }

  log.title('Xray CLI Status');
  console.log(`Client ID: ${config.client_id.slice(0, 8)}...`);

  if (config.default_project) {
    console.log(`Default Project: ${config.default_project}`);
  }

  if (config.jira_base_url) {
    console.log(`Jira URL: ${config.jira_base_url}`);
  }

  if (token) {
    const expiresIn = Math.round((token.expires_at - Date.now()) / 1000 / 60 / 60);
    log.success(`Token valid (expires in ~${expiresIn}h)`);
  }
  else {
    log.warn('Token expired (will refresh on next request)');
  }
}
