#!/usr/bin/env bun

/**
 * ============================================================================
 * JIRA SYNC CLI - Sync Jira Epics & Stories to Local Markdown Files
 * ============================================================================
 *
 * A CLI tool to synchronize Jira issues (Epics and User Stories) to local
 * Markdown files in `.context/PBI/`. Follows Context Engineering principles.
 *
 * JIRA API DOCUMENTATION:
 *   - REST API v3: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
 *   - JQL Search:  https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
 *   - Authentication: Basic Auth with email:api_token
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * 1. Bun runtime (https://bun.sh)
 * 2. Atlassian API credentials (email + API token)
 * 3. No external dependencies - uses native fetch API
 *
 * ============================================================================
 * ENVIRONMENT SETUP
 * ============================================================================
 *
 * Required environment variables:
 *   ATLASSIAN_URL=https://your-instance.atlassian.net
 *   ATLASSIAN_EMAIL=your-email@example.com
 *   ATLASSIAN_API_TOKEN=ATATT3x...
 *
 * Project key resolution (in precedence order):
 *   1. JIRA_PROJECT_KEY env var (override, e.g. JIRA_PROJECT_KEY=ACME bun run jira:sync-issues ...)
 *   2. .agents/project.yaml -> project.project_key (default source-of-truth)
 *   3. None set or `null` -> the script fails with an actionable message.
 *
 * Optional:
 *   JIRA_SYNC_OUTPUT=.context/PBI      # Output directory
 *
 * Get your API token at: https://id.atlassian.com/manage-profile/security/api-tokens
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * Run with Bun:
 *   bun run jira:sync-issues <command> [options]
 *
 * COMMANDS:
 *   status              Check configuration and connection
 *   pull                Sync all Epics and Stories from Jira
 *     --epic <key>      Sync specific epic with all its stories
 *     --story <key>     Sync specific story only
 *     --include-comments Include Jira comments in comments.md
 *     --dry-run         Show what would be done without writing files
 *     --json            Output results as JSON
 *   get <KEY>           Sync ONE issue (any type) with ALL custom fields (canonical read; replaces `acli view`)
 *   jql "<query>"       Sync every issue matching a raw JQL query
 *   help                Show this help message
 *
 * EXAMPLES:
 *   bun run jira:sync-issues status
 *   bun run jira:sync-issues pull
 *   bun run jira:sync-issues pull --epic {{PROJECT_KEY}}-20
 *   bun run jira:sync-issues pull --story {{PROJECT_KEY}}-21
 *   bun run jira:sync-issues pull --include-comments --dry-run
 *
 * ============================================================================
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OUTPUT_DIR = '.context/PBI';
const PROJECT_YAML_PATH = join(import.meta.dir, '..', '.agents', 'project.yaml');

// No files are protected from overwrite. Jira is the single source of truth and the
// sync re-materializes every file it owns on each run (per-field files only when the
// Jira field is non-empty). Hand-authored NON-Jira files (context.md, evidence/,
// test-specs/, …) use names the sync never writes, so they are never touched.

/**
 * Maps each semantic key consumed by this script to its canonical Jira slug
 * (matching a top-level key in `.agents/jira-fields.json`). The actual `customfield_XXXXX`
 * IDs are resolved at runtime by `buildCustomFields()` — never hardcoded here, so
 * the script stays portable across Jira workspaces.
 */
const SLUG_MAPPING = {
  // Story fields
  acceptanceCriteria: 'acceptance_criteria',
  businessRules: 'business_rules_specification',
  scope: 'scope',
  mockup: 'mockup',
  workflow: 'workflow',
  storyPoints: 'story_points',
  webLink: 'weblink',
  outOfScope: 'out_of_scope',
  specImplementationPlan: 'spec_implementation_plan',
  acceptanceTestPlan: 'acceptance_test_plan',
  acceptanceTestResults: 'acceptance_test_results',
  // Epic-level planning fields
  featureImplementationPlan: 'feature_implementation_plan',
  featureTestPlan: 'feature_test_plan',
  // Bug/Defect fields
  actualResult: 'actual_result',
  expectedResult: 'expected_result',
  errorType: 'error_type',
  severity: 'severity',
  testEnvironment: 'test_environment',
  rootCause: 'root_cause',
  workaround: 'workaround',
  evidence: 'evidence',
  fixType: 'fix',
} as const;

type SemanticKey = keyof typeof SLUG_MAPPING;

interface JiraFieldEntry {
  id: string
  type?: string
  name?: string
  options?: Record<string, string>
  system?: boolean
  provider?: string
}

/**
 * Loads `.agents/jira-fields.json` from the repo root. The file is generated by
 * `bun run jira:sync-fields` and is a record of `{ <slug>: { id, type, ... } }`.
 * Throws if the file is missing or unparseable — without it the script cannot
 * resolve any custom field ID.
 */
function loadJiraFields(): Record<string, JiraFieldEntry> {
  const path = join(import.meta.dir, '..', '.agents', 'jira-fields.json');
  if (!existsSync(path)) {
    throw new Error(
      `sync-jira-issues: ${path} does not exist. Run \`bun run jira:sync-fields --force\` to generate it.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  }
  catch (err) {
    throw new Error(`sync-jira-issues: cannot parse ${path}: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`sync-jira-issues: ${path} must be a JSON object`);
  }
  return parsed as Record<string, JiraFieldEntry>;
}

/**
 * Semantic keys whose Jira custom field could NOT be resolved from
 * `.agents/jira-fields.json` (field not configured in this Jira instance).
 * Populated by `buildCustomFields()`. The per-field writer (`syncFieldFiles`)
 * consults this to emit a fallback-pointer stub instead of silently skipping —
 * so downstream skills know the field's content lives in the issue's
 * comments/description (see `.agents/jira-required.yaml` → `fallback:`).
 */
const UNRESOLVED_FIELDS = new Set<SemanticKey>();

/**
 * Resolves every entry in `SLUG_MAPPING` against `.agents/jira-fields.json` and returns
 * a `{ <semanticKey>: customfield_XXXXX }` record matching the legacy shape that
 * the rest of this file consumes (so call sites need no change).
 *
 * Graceful degradation: a slug missing from the catalog is NO LONGER fatal. Its ID
 * resolves to `''` — a harmless empty field id that is filtered out of API requests
 * and yields `undefined` on lookup — and the semantic key is recorded in
 * `UNRESOLVED_FIELDS`. A workspace that hasn't configured every methodology custom
 * field can still sync the issues it can; missing fields fall back to comments/
 * description rather than blocking the whole run.
 */
function buildCustomFields(): Record<SemanticKey, string> {
  const fields = loadJiraFields();
  const out = {} as Record<SemanticKey, string>;
  for (const [semanticKey, slug] of Object.entries(SLUG_MAPPING) as [SemanticKey, string][]) {
    const entry = fields[slug];
    if (!entry || typeof entry.id !== 'string') {
      out[semanticKey] = '';
      UNRESOLVED_FIELDS.add(semanticKey);
      continue;
    }
    out[semanticKey] = entry.id;
  }
  return out;
}

/** Custom field IDs resolved at runtime from `.agents/jira-fields.json` (see SLUG_MAPPING). */
const CUSTOM_FIELDS = buildCustomFields();

/** Fields to request for Epics */
const EPIC_FIELDS = [
  'summary',
  'description',
  'status',
  'priority',
  'labels',
  'created',
  'updated',
  'reporter',
  'assignee',
  'parent',
  'issuetype',
  // Epic-level planning fields (rich text → materialized as separate files)
  CUSTOM_FIELDS.featureImplementationPlan,
  CUSTOM_FIELDS.featureTestPlan,
].filter(Boolean); // drop unresolved fields ('') so they never hit the Jira API

/** Fields to request for Stories */
const STORY_FIELDS = [
  ...EPIC_FIELDS,
  CUSTOM_FIELDS.acceptanceCriteria,
  CUSTOM_FIELDS.businessRules,
  CUSTOM_FIELDS.scope,
  CUSTOM_FIELDS.outOfScope,
  CUSTOM_FIELDS.mockup,
  CUSTOM_FIELDS.workflow,
  CUSTOM_FIELDS.specImplementationPlan,
  CUSTOM_FIELDS.acceptanceTestPlan,
  CUSTOM_FIELDS.acceptanceTestResults,
  CUSTOM_FIELDS.storyPoints,
  CUSTOM_FIELDS.webLink,
  'issuelinks', // For traceability (tests, defects, bugs, etc.)
].filter(Boolean); // drop unresolved fields ('') so they never hit the Jira API

/** Fields to request for Bugs/Defects */
const BUG_FIELDS = [
  ...EPIC_FIELDS,
  'issuelinks', // For defects linked to stories
  'components',
  // Bug/Defect custom fields
  CUSTOM_FIELDS.actualResult,
  CUSTOM_FIELDS.expectedResult,
  CUSTOM_FIELDS.errorType,
  CUSTOM_FIELDS.severity,
  CUSTOM_FIELDS.testEnvironment,
  CUSTOM_FIELDS.rootCause,
  CUSTOM_FIELDS.workaround,
  CUSTOM_FIELDS.evidence,
  CUSTOM_FIELDS.fixType,
].filter(Boolean); // drop unresolved fields ('') so they never hit the Jira API

/** Fields to request for Tests */
const TEST_FIELDS = [
  ...EPIC_FIELDS,
  'issuelinks',
  'components',
];

/** Fields to request for Improvements */
const IMPROVEMENT_FIELDS = [
  ...EPIC_FIELDS,
  'issuelinks',
  'components',
];

// ============================================================================
// TYPES
// ============================================================================

interface Config {
  baseUrl: string
  email: string
  apiToken: string
  project: string
  projectKeySource: ProjectKeySource
  outputDir: string
}

interface JiraUser {
  accountId: string
  displayName: string
  emailAddress?: string
}

interface JiraStatus {
  name: string
  statusCategory: {
    name: string
    colorName: string
  }
}

interface JiraPriority {
  name: string
  id: string
}

interface JiraIssueType {
  name: string
  subtask: boolean
}

interface JiraIssueLink {
  id: string
  type: {
    id: string
    name: string
    inward: string
    outward: string
  }
  inwardIssue?: { key: string, fields: { summary: string, issuetype: JiraIssueType } }
  outwardIssue?: { key: string, fields: { summary: string, issuetype: JiraIssueType } }
}

interface JiraComponent {
  id: string
  name: string
}

interface JiraIssueFields {
  summary: string
  description: AdfDocument | string | null
  status: JiraStatus
  priority: JiraPriority
  labels: string[]
  created: string
  updated: string
  reporter: JiraUser | null
  assignee: JiraUser | null
  parent?: { key: string, fields: { summary: string } }
  issuetype: JiraIssueType
  issuelinks?: JiraIssueLink[]
  components?: JiraComponent[]
  [key: string]: unknown
}

interface JiraIssue {
  id: string
  key: string
  self: string
  fields: JiraIssueFields
}

interface JiraComment {
  id: string
  author: JiraUser
  body: AdfDocument | string
  created: string
  updated: string
}

interface JiraSearchResponse {
  issues: JiraIssue[]
  total: number
  isLast?: boolean
  nextPageToken?: string
}

interface JiraCommentsResponse {
  comments: JiraComment[]
  total: number
}

// Atlassian Document Format types
interface AdfMark {
  type: 'strong' | 'em' | 'code' | 'link' | 'strike' | 'underline' | 'textColor' | 'subsup'
  attrs?: { href?: string, [key: string]: unknown }
}

interface AdfNode {
  type: string
  content?: AdfNode[]
  text?: string
  marks?: AdfMark[]
  attrs?: { level?: number, language?: string, [key: string]: unknown }
}

interface AdfDocument {
  type: 'doc'
  version: 1
  content: AdfNode[]
}

type IssueTypeFilter = 'stories' | 'bugs' | 'defects' | 'improvements' | 'tests';

interface SyncOptions {
  epicKey?: string
  storyKey?: string
  issueType: IssueTypeFilter
  includeComments: boolean
  dryRun: boolean
  json: boolean
}

interface SyncResult {
  success: boolean
  synced: {
    epics: number
    stories: number
    bugs: number
    defects: number
    improvements: number
    tests: number
  }
  warnings: string[]
  files: {
    created: number
    updated: number
    skipped: number
  }
  duration_ms: number
}

interface ParsedArgs {
  command: string
  subcommand?: IssueTypeFilter
  epic?: string
  story?: string
  getKey?: string
  jql?: string
  includeComments: boolean
  dryRun: boolean
  json: boolean
}

// ============================================================================
// COLORS & OUTPUT HELPERS
// ============================================================================

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
  white: '\x1B[37m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✔${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.error(`${colors.red}✖${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
  line: (msg: string) => console.log(msg),
  dim: (msg: string) => console.log(`${colors.dim}${msg}${colors.reset}`),
  json: (obj: unknown) => console.log(JSON.stringify(obj, null, 2)),
  tree: (prefix: string, msg: string, isLast: boolean) => {
    const branch = isLast ? '└─' : '├─';
    console.log(`  ${branch} ${prefix}: ${msg}`);
  },
};

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

const ISSUE_TYPE_SUBCOMMANDS = new Set<IssueTypeFilter>([
  'stories',
  'bugs',
  'defects',
  'improvements',
  'tests',
]);

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0] || 'help',
    includeComments: false,
    dryRun: false,
    json: false,
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    // Check if this is a subcommand for pull
    if (ISSUE_TYPE_SUBCOMMANDS.has(arg as IssueTypeFilter)) {
      result.subcommand = arg as IssueTypeFilter;
      continue;
    }

    switch (arg) {
      case '--epic':
        result.epic = nextArg;
        i++;
        break;
      case '--story':
        result.story = nextArg;
        i++;
        break;
      case '--include-comments':
        result.includeComments = true;
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--json':
        result.json = true;
        break;
    }
  }

  // Positional capture for single-issue / JQL read commands.
  if (result.command === 'get') {
    result.getKey = args[1];
  }
  if (result.command === 'jql') {
    result.jql = args.slice(1).filter(a => !a.startsWith('--')).join(' ').trim();
  }

  return result;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

type ProjectKeySource = 'env' | 'project.yaml';

interface ResolvedProjectKey {
  key: string
  source: ProjectKeySource
}

/**
 * Reads `project.project_key` from `.agents/project.yaml`. Returns `null` when
 * the file is missing, the field is absent, or its value is `null` / a blank
 * string (the boilerplate ships with `project_key: null` on purpose).
 */
function readProjectKeyFromYaml(): string | null {
  if (!existsSync(PROJECT_YAML_PATH)) { return null; }
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(PROJECT_YAML_PATH, 'utf8'));
  }
  catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') { return null; }
  const project = (parsed as Record<string, unknown>).project;
  if (project === null || typeof project !== 'object') { return null; }
  const raw = (project as Record<string, unknown>).project_key;
  if (typeof raw !== 'string') { return null; }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Resolves the active Jira project key. Precedence:
 *   1. `JIRA_PROJECT_KEY` env var (explicit override).
 *   2. `.agents/project.yaml` → `project.project_key`.
 *   3. Neither set → throws an actionable error so the script never silently
 *      points at a stale or wrong project.
 */
function resolveProjectKey(): ResolvedProjectKey {
  const envKey = process.env.JIRA_PROJECT_KEY?.trim();
  if (envKey) { return { key: envKey, source: 'env' }; }
  const yamlKey = readProjectKeyFromYaml();
  if (yamlKey) { return { key: yamlKey, source: 'project.yaml' }; }
  throw new Error(
    'sync-jira-issues: project key is not set. '
    + 'Either pass `JIRA_PROJECT_KEY=<KEY>` or set `project.project_key` in `.agents/project.yaml` '
    + '(run `bun run agents:setup` for an interactive walkthrough).',
  );
}

function getConfig(): Config {
  const baseUrl = process.env.ATLASSIAN_URL;
  const email = process.env.ATLASSIAN_EMAIL;
  const apiToken = process.env.ATLASSIAN_API_TOKEN;

  const missing: string[] = [];
  if (!baseUrl) { missing.push('ATLASSIAN_URL'); }
  if (!email) { missing.push('ATLASSIAN_EMAIL'); }
  if (!apiToken) { missing.push('ATLASSIAN_API_TOKEN'); }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const projectKey = resolveProjectKey();

  return {
    baseUrl: baseUrl!.replace(/\/$/, ''), // Remove trailing slash
    email: email!,
    apiToken: apiToken!,
    project: projectKey.key,
    projectKeySource: projectKey.source,
    outputDir: process.env.JIRA_SYNC_OUTPUT || DEFAULT_OUTPUT_DIR,
  };
}

/**
 * Prints "Using project=<KEY> (source: ...)" once per command run so the user
 * never has to guess which project the script is hitting. Skipped under
 * `--json` so machine-readable output stays clean.
 */
function logProjectBanner(config: Config, options: { json?: boolean } = {}): void {
  if (options.json) { return; }
  const sourceLabel = config.projectKeySource === 'env'
    ? 'JIRA_PROJECT_KEY env override'
    : '.agents/project.yaml';
  log.info(`Using project=${config.project} (source: ${sourceLabel})`);
}

// ============================================================================
// JIRA API CLIENT
// ============================================================================

async function jiraFetch<T>(
  config: Config,
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${config.baseUrl}${endpoint}`;
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${text}`);
  }

  return response.json() as Promise<T>;
}

async function searchIssues(
  config: Config,
  jql: string,
  fields: string[],
  maxResults = 100,
): Promise<JiraIssue[]> {
  const allIssues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  let hasMorePages = true;

  while (hasMorePages) {
    const body: Record<string, unknown> = nextPageToken
      ? { nextPageToken }
      : { jql, fields, maxResults };

    const response = await jiraFetch<JiraSearchResponse>(
      config,
      '/rest/api/3/search/jql',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );

    allIssues.push(...response.issues);

    if (response.isLast || !response.nextPageToken) {
      hasMorePages = false;
    }
    else {
      nextPageToken = response.nextPageToken;
    }
  }

  return allIssues;
}

async function fetchIssue(config: Config, key: string, fields: string[]): Promise<JiraIssue> {
  return jiraFetch<JiraIssue>(
    config,
    `/rest/api/3/issue/${key}?fields=${fields.join(',')}`,
  );
}

async function fetchComments(config: Config, key: string): Promise<JiraComment[]> {
  const response = await jiraFetch<JiraCommentsResponse>(
    config,
    `/rest/api/3/issue/${key}/comment`,
  );
  return response.comments;
}

// ============================================================================
// ADF TO MARKDOWN CONVERTER
// ============================================================================

function adfToMarkdown(adf: AdfDocument | string | null | undefined): string {
  if (!adf) { return ''; }
  if (typeof adf === 'string') { return cleanMarkdown(adf); }
  if (!adf.content) { return ''; }

  const markdown = adf.content.map(node => processNode(node)).join('\n\n');
  return cleanMarkdown(markdown);
}

/**
 * Post-process markdown to convert wiki legacy formats.
 * Jira sometimes uses old wiki syntax like "h4. Title" instead of ADF.
 */
function cleanMarkdown(text: string): string {
  return text
    .replace(/^h1\.\s*/gm, '# ')
    .replace(/^h2\.\s*/gm, '## ')
    .replace(/^h3\.\s*/gm, '### ')
    .replace(/^h4\.\s*/gm, '#### ')
    .replace(/^h5\.\s*/gm, '##### ')
    .replace(/^h6\.\s*/gm, '###### ')
    .replace(/\{noformat\}/g, '```')
    .replace(/\{code(?::.*?)?\}/g, '```')
    .replace(/\*([^*\n]+)\*/g, '**$1**') // Wiki bold *text* to Markdown **text**
    .replace(/_([^_\n]+)_/g, '*$1*'); // Wiki italic _text_ to Markdown *text*
}

/**
 * Generate traceability section from issue links.
 * Groups links by issue type (Tests, Defects, Bugs, etc.) for better readability.
 */
function generateTraceabilitySection(
  issuelinks: JiraIssueLink[] | undefined,
  config: Config,
): string | null {
  if (!issuelinks || issuelinks.length === 0) { return null; }

  // Group links by issue type
  const grouped: Record<string, Array<{ key: string, summary: string, status: string, relation: string }>> = {};

  for (const link of issuelinks) {
    const issue = link.inwardIssue || link.outwardIssue;
    if (!issue) { continue; }

    const issueType = issue.fields.issuetype?.name || 'Other';
    const relation = link.inwardIssue ? link.type.inward : link.type.outward;
    const status = (issue.fields as Record<string, unknown>).status as { name: string } | undefined;

    if (!grouped[issueType]) {
      grouped[issueType] = [];
    }

    grouped[issueType].push({
      key: issue.key,
      summary: issue.fields.summary,
      status: status?.name || 'Unknown',
      relation,
    });
  }

  // Build markdown output
  const lines: string[] = [];

  // Define preferred order for issue types
  const typeOrder = ['Test', 'Test Execution', 'Defect', 'Bug', 'Story', 'Improvement', 'Task', 'Epic'];

  // Sort types by preferred order, then alphabetically for unknown types
  const sortedTypes = Object.keys(grouped).sort((a, b) => {
    const aIndex = typeOrder.indexOf(a);
    const bIndex = typeOrder.indexOf(b);
    if (aIndex === -1 && bIndex === -1) { return a.localeCompare(b); }
    if (aIndex === -1) { return 1; }
    if (bIndex === -1) { return -1; }
    return aIndex - bIndex;
  });

  for (const issueType of sortedTypes) {
    const issues = grouped[issueType];
    const pluralType = issues.length > 1 ? `${issueType}s` : issueType;

    lines.push(`### ${pluralType} (${issues.length})`, '');

    for (const issue of issues) {
      lines.push(`- [${issue.key}](${config.baseUrl}/browse/${issue.key}): ${issue.summary} _(${issue.status})_`);
    }

    lines.push('');
  }

  return lines.join('\n').trim();
}

function processNode(node: AdfNode): string {
  switch (node.type) {
    case 'paragraph':
      return processInlineContent(node.content);

    case 'heading': {
      const level = '#'.repeat(node.attrs?.level || 1);
      return `${level} ${processInlineContent(node.content)}`;
    }

    case 'bulletList':
      return (
        node.content
          ?.map((item) => {
            const content = item.content?.[0];
            return `- ${processInlineContent(content?.content)}`;
          })
          .join('\n') || ''
      );

    case 'orderedList':
      return (
        node.content
          ?.map((item, i) => {
            const content = item.content?.[0];
            return `${i + 1}. ${processInlineContent(content?.content)}`;
          })
          .join('\n') || ''
      );

    case 'codeBlock': {
      const lang = node.attrs?.language || '';
      const code = node.content?.map(n => n.text || '').join('') || '';
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }

    case 'blockquote':
      return (
        node.content
          ?.map(p => `> ${processNode(p)}`)
          .join('\n') || ''
      );

    case 'rule':
      return '---';

    case 'table': {
      if (!node.content) { return ''; }
      const rows = node.content.map((row) => {
        const cells
          = row.content?.map(cell => processInlineContent(cell.content?.[0]?.content)) || [];
        return `| ${cells.join(' | ')} |`;
      });
      if (rows.length > 0) {
        // Add header separator after first row
        const headerSep = `| ${rows[0]
          .split('|')
          .filter(c => c.trim())
          .map(() => '---')
          .join(' | ')} |`;
        rows.splice(1, 0, headerSep);
      }
      return rows.join('\n');
    }

    case 'mediaSingle':
    case 'mediaGroup':
      // Skip media for now
      return '';

    case 'panel': {
      const panelType = String(node.attrs?.panelType || 'info').toUpperCase();
      const content = node.content?.map(n => processNode(n)).join('\n') || '';
      return `> **${panelType}:** ${content}`;
    }

    default:
      return processInlineContent(node.content);
  }
}

function processInlineContent(content: AdfNode[] | undefined): string {
  if (!content) { return ''; }

  return content
    .map((item) => {
      if (item.type === 'text') {
        let text = item.text || '';
        if (item.marks) {
          for (const mark of item.marks) {
            switch (mark.type) {
              case 'strong':
                text = `**${text}**`;
                break;
              case 'em':
                text = `*${text}*`;
                break;
              case 'code':
                text = `\`${text}\``;
                break;
              case 'link':
                text = `[${text}](${mark.attrs?.href})`;
                break;
              case 'strike':
                text = `~~${text}~~`;
                break;
            }
          }
        }
        return text;
      }
      if (item.type === 'hardBreak') { return '\n'; }
      if (item.type === 'mention') { return `@${String(item.attrs?.text || 'user')}`; }
      if (item.type === 'emoji') { return String(item.attrs?.shortName || ''); }
      if (item.type === 'inlineCard') { return `[${String(item.attrs?.url || 'link')}](${String(item.attrs?.url || '')})`; }
      return '';
    })
    .join('');
}

// ============================================================================
// SLUG GENERATOR
// ============================================================================

function generateSlug(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[áàäâã]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöôõ]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

// ============================================================================
// FILE SYSTEM OPERATIONS
// ============================================================================

function findExistingFolder(baseDir: string, key: string, type: 'epic' | 'story'): string | null {
  const prefix = type === 'epic' ? `EPIC-${key}` : `STORY-${key}`;
  const searchDir = type === 'epic' ? join(baseDir, 'epics') : baseDir;

  if (!existsSync(searchDir)) { return null; }

  try {
    const entries = readdirSync(searchDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith(prefix)) {
        return join(searchDir, entry.name);
      }
    }
  }
  catch {
    // Directory doesn't exist or can't be read
  }

  return null;
}

function getFolderName(key: string, summary: string, type: 'epic' | 'story'): string {
  const prefix = type === 'epic' ? 'EPIC' : 'STORY';
  const slug = generateSlug(summary);
  return `${prefix}-${key}-${slug}`;
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/**
 * Writes an index / standalone-issue file. Jira is the source of truth, so this
 * always overwrites (no protection). `'skipped'` is retained in the return union
 * only for call-site compatibility — it is never produced.
 */
function writeIndexFile(
  filePath: string,
  content: string,
  dryRun: boolean,
): { written: boolean, status: 'created' | 'updated' | 'skipped' } {
  const exists = existsSync(filePath);

  if (!dryRun) {
    writeFileSync(filePath, content, 'utf-8');
  }

  return {
    written: true,
    status: exists ? 'updated' : 'created',
  };
}

// ============================================================================
// PER-FIELD FILE MATERIALIZATION (hybrid output: index + 1 file per rich-text field)
// ============================================================================

interface FieldFileSpec {
  key: SemanticKey
  file: string
  title: string
}

/** Story-level rich-text fields → one Markdown file each (written only when non-empty). */
const STORY_FIELD_FILES: FieldFileSpec[] = [
  { key: 'acceptanceCriteria', file: 'acceptance-criteria.md', title: 'Acceptance Criteria' },
  { key: 'businessRules', file: 'business-rules.md', title: 'Business Rules' },
  { key: 'scope', file: 'scope.md', title: 'Scope' },
  { key: 'outOfScope', file: 'out-of-scope.md', title: 'Out Of Scope' },
  { key: 'workflow', file: 'workflow.md', title: 'Workflow' },
  { key: 'mockup', file: 'mockup.md', title: 'Mockup' },
  { key: 'specImplementationPlan', file: 'implementation-plan.md', title: 'Implementation Plan (Dev)' },
  { key: 'acceptanceTestPlan', file: 'acceptance-test-plan.md', title: 'Acceptance Test Plan (QA)' },
  { key: 'acceptanceTestResults', file: 'acceptance-test-results.md', title: 'Acceptance Test Results (QA)' },
];

/** Epic-level rich-text planning fields → one Markdown file each. */
const EPIC_FIELD_FILES: FieldFileSpec[] = [
  { key: 'featureImplementationPlan', file: 'feature-implementation-plan.md', title: 'Feature Implementation Plan (Dev)' },
  { key: 'featureTestPlan', file: 'feature-test-plan.md', title: 'Feature Test Plan (QA)' },
];

/**
 * Writes a per-field Markdown file. Always overwrites — Jira is the source of
 * truth for these fields and no file is protected; this is only ever called when
 * the Jira field has content.
 */
function writeFieldFile(
  filePath: string,
  content: string,
  dryRun: boolean,
): 'created' | 'updated' {
  const exists = existsSync(filePath);
  if (!dryRun) { writeFileSync(filePath, content, 'utf-8'); }
  return exists ? 'updated' : 'created';
}

/** Renders the body of a per-field Markdown file (thin header + the field content). */
function renderFieldFile(
  issueKey: string,
  spec: FieldFileSpec,
  content: string,
  config: Config,
): string {
  return [
    `# ${issueKey} — ${spec.title}`,
    '',
    `> Jira field: \`${CUSTOM_FIELDS[spec.key]}\` · [View in Jira](${config.baseUrl}/browse/${issueKey})`,
    '',
    content.trim(),
    '',
    '---',
    `_Synced from Jira by sync-jira-issues · ${new Date().toISOString()}_`,
    '',
  ].join('\n');
}

/**
 * Renders a fallback-pointer stub for a per-field file whose Jira custom field is
 * NOT configured in this workspace (the semantic key is in `UNRESOLVED_FIELDS`).
 * The dedicated file still exists so skills find a predictable path, but it points
 * to the fallback source (the issue's comments / description) per the
 * `.agents/jira-required.yaml` → `fallback:` contract.
 */
function renderFieldStub(
  issueKey: string,
  spec: FieldFileSpec,
  config: Config,
): string {
  return [
    `# ${issueKey} — ${spec.title}`,
    '',
    `> ⚠️ The Jira custom field for \`${spec.title}\` is **not configured** in this Jira instance.`,
    '> Per the methodology fallback, this field\'s content lives in the issue\'s comments or description.',
    `> Re-sync with \`--include-comments\` and read \`comments.md\`, or [View in Jira](${config.baseUrl}/browse/${issueKey}).`,
    '',
    '---',
    `_Synced from Jira by sync-jira-issues · ${new Date().toISOString()}_`,
    '',
  ].join('\n');
}

/**
 * Materializes the per-field files for an issue into `folder`. Returns the specs
 * actually written (field non-empty) so the index can link them.
 */
function syncFieldFiles(
  issueKey: string,
  fields: JiraIssueFields,
  specs: FieldFileSpec[],
  folder: string,
  config: Config,
  dryRun: boolean,
  result: SyncResult,
): FieldFileSpec[] {
  const present: FieldFileSpec[] = [];
  for (const spec of specs) {
    // Field not configured in this Jira instance → emit a fallback-pointer stub
    // so the dedicated file path is predictable and skills know to read the
    // fallback (comments/description) instead.
    if (UNRESOLVED_FIELDS.has(spec.key)) {
      const filePath = join(folder, spec.file);
      const status = writeFieldFile(filePath, renderFieldStub(issueKey, spec, config), dryRun);
      if (status === 'created') { result.files.created++; }
      else { result.files.updated++; }
      present.push(spec);
      continue;
    }
    const raw = fields[CUSTOM_FIELDS[spec.key]] as AdfDocument | string | null;
    const md = adfToMarkdown(raw);
    if (!md.trim()) { continue; }
    const filePath = join(folder, spec.file);
    const status = writeFieldFile(filePath, renderFieldFile(issueKey, spec, md, config), dryRun);
    if (status === 'created') { result.files.created++; }
    else { result.files.updated++; }
    present.push(spec);
  }
  return present;
}

// ============================================================================
// MARKDOWN GENERATORS
// ============================================================================

function generateEpicMarkdown(
  epic: JiraIssue,
  stories: JiraIssue[],
  config: Config,
  presentFields: FieldFileSpec[] = [],
): string {
  const fields = epic.fields;
  const description = adfToMarkdown(fields.description);

  // Calculate total story points
  const totalPoints = stories.reduce((sum, story) => {
    const points = story.fields[CUSTOM_FIELDS.storyPoints];
    return sum + (typeof points === 'number' ? points : 0);
  }, 0);

  const lines: string[] = [
    `# EPIC: ${fields.summary}`,
    '',
    `**Jira Key:** [${epic.key}](${config.baseUrl}/browse/${epic.key})`,
    `**Priority:** ${fields.priority?.name || 'Not set'}`,
    `**Status:** ${fields.status?.name || 'Unknown'}`,
    `**Total Story Points:** ${totalPoints}`,
    '',
    '---',
    '',
    '## Description',
    '',
    description || '_No description provided_',
    '',
  ];

  // Add stories table if there are any
  if (stories.length > 0) {
    lines.push('---', '', '## User Stories', '', '| Key | Story | Points | Priority | Status |', '| --- | ----- | ------ | -------- | ------ |');

    for (const story of stories) {
      const storyFields = story.fields;
      const points = storyFields[CUSTOM_FIELDS.storyPoints] as number | undefined;
      lines.push(
        `| [${story.key}](${config.baseUrl}/browse/${story.key}) | ${String(storyFields.summary)} | ${points ?? '-'} | ${String(storyFields.priority?.name || '-')} | ${String(storyFields.status?.name || '-')} |`,
      );
    }

    lines.push('');
  }

  // Planning field files (hybrid: epic rich-text plans live in their own files)
  if (presentFields.length > 0) {
    lines.push('---', '', '## Planning', '');
    for (const spec of presentFields) {
      lines.push(`- [${spec.title}](./${spec.file})`);
    }
    lines.push('');
  }

  // Add metadata
  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );

  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }

  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

function generateStoryMarkdown(
  story: JiraIssue,
  epic: JiraIssue | null,
  config: Config,
  presentFields: FieldFileSpec[] = [],
): string {
  const fields = story.fields;

  // Index only — rich-text fields live in their own files (see `presentFields`).
  const description = adfToMarkdown(fields.description);
  const storyPoints = fields[CUSTOM_FIELDS.storyPoints] as number | undefined;
  const webLink = fields[CUSTOM_FIELDS.webLink] as string | null;

  const lines: string[] = [
    `# ${fields.summary}`,
    '',
    `**Jira Key:** [${story.key}](${config.baseUrl}/browse/${story.key})`,
  ];

  if (epic) {
    lines.push(`**Epic:** [${epic.key}](${config.baseUrl}/browse/${epic.key}) (${epic.fields.summary})`);
  }

  lines.push(
    `**Type:** ${String(fields.issuetype?.name || 'Story')}`,
    `**Status:** ${String(fields.status?.name || 'Unknown')}`,
    `**Priority:** ${String(fields.priority?.name || 'Not set')}`,
    `**Story Points:** ${storyPoints ?? '-'}`,
  );
  if (webLink) {
    lines.push(`**Web Link:** ${webLink}`);
  }

  lines.push('', '---', '', '## Overview', '');
  lines.push(description || '_No description provided_', '');

  // Manifest of per-field files (1 file = 1 Jira custom field)
  if (presentFields.length > 0) {
    lines.push(
      '---',
      '',
      '## Fields',
      '',
      '> Each rich-text field is a separate file in this folder.',
      '',
    );
    for (const spec of presentFields) {
      lines.push(`- [${spec.title}](./${spec.file})`);
    }
    lines.push('');
  }

  // Traceability - linked issues grouped by type
  const traceabilitySection = generateTraceabilitySection(fields.issuelinks, config);
  if (traceabilitySection) {
    lines.push('---', '', '## Traceability', '', traceabilitySection, '');
  }

  // Metadata
  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );

  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }

  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

function generateCommentsMarkdown(
  comments: JiraComment[],
  issueKey: string,
  config: Config,
): string {
  const lines: string[] = [
    `# Comments for ${issueKey}`,
    '',
    `[View in Jira](${config.baseUrl}/browse/${issueKey})`,
    '',
    '---',
    '',
  ];

  if (comments.length === 0) {
    lines.push('_No comments_');
  }
  else {
    for (const comment of comments) {
      const author = comment.author?.displayName || 'Unknown';
      const date = new Date(comment.created).toLocaleString();
      const body = adfToMarkdown(comment.body as AdfDocument);

      lines.push(`### ${author} - ${date}`, '', body, '', '---', '');
    }
  }

  lines.push('', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

/**
 * Extract value from Jira dropdown/select field.
 * Handles both simple strings and complex {value: string} objects.
 */
function getDropdownValue(field: unknown): string | null {
  if (!field) { return null; }
  if (typeof field === 'string') { return field; }
  if (typeof field === 'object' && field !== null) {
    const obj = field as Record<string, unknown>;
    if ('value' in obj && typeof obj.value === 'string') { return obj.value; }
    if ('name' in obj && typeof obj.name === 'string') { return obj.name; }
  }
  return null;
}

function generateBugMarkdown(
  bug: JiraIssue,
  config: Config,
): string {
  const fields = bug.fields;
  const description = adfToMarkdown(fields.description);
  const components = fields.components?.map(c => c.name).join(', ') || 'None';

  // Extract custom fields
  const actualResult = adfToMarkdown(fields[CUSTOM_FIELDS.actualResult] as AdfDocument | null);
  const expectedResult = adfToMarkdown(fields[CUSTOM_FIELDS.expectedResult] as AdfDocument | null);
  const errorType = getDropdownValue(fields[CUSTOM_FIELDS.errorType]);
  const severity = getDropdownValue(fields[CUSTOM_FIELDS.severity]);
  const testEnvironment = getDropdownValue(fields[CUSTOM_FIELDS.testEnvironment]);
  const rootCause = getDropdownValue(fields[CUSTOM_FIELDS.rootCause]);
  const workaround = adfToMarkdown(fields[CUSTOM_FIELDS.workaround] as AdfDocument | null);
  const evidence = adfToMarkdown(fields[CUSTOM_FIELDS.evidence] as AdfDocument | null);
  const fixType = getDropdownValue(fields[CUSTOM_FIELDS.fixType]);

  const lines: string[] = [
    `# BUG: ${fields.summary}`,
    '',
    `**Jira Key:** [${bug.key}](${config.baseUrl}/browse/${bug.key})`,
    `**Priority:** ${fields.priority?.name || 'Not set'}`,
    `**Status:** ${fields.status?.name || 'Unknown'}`,
    `**Components:** ${components}`,
  ];

  // Add severity and error type inline if available
  if (severity) { lines.push(`**Severity:** ${severity}`); }
  if (errorType) { lines.push(`**Error Type:** ${errorType}`); }
  if (testEnvironment) { lines.push(`**Test Environment:** ${testEnvironment}`); }
  if (fixType) { lines.push(`**Fix Type:** ${fixType}`); }

  lines.push('', '---', '', '## Description', '', description || '_No description provided_', '');

  // Actual Result section
  if (actualResult) {
    lines.push('---', '', '## 🐞 Actual Result', '', actualResult, '');
  }

  // Expected Result section
  if (expectedResult) {
    lines.push('---', '', '## ✅ Expected Result', '', expectedResult, '');
  }

  // Root Cause section (category only)
  if (rootCause) {
    lines.push('---', '', '## 🔍 Root Cause', '', `**Category:** ${rootCause}`, '');
  }

  // Workaround section (optional)
  if (workaround) {
    lines.push('---', '', '## 🚩 Workaround', '', workaround, '');
  }

  // Evidence section (optional)
  if (evidence) {
    lines.push('---', '', '## 🧫 Evidence', '', evidence, '');
  }

  // Add issue links if any
  if (fields.issuelinks && fields.issuelinks.length > 0) {
    lines.push('---', '', '## Related Issues', '');
    for (const link of fields.issuelinks) {
      if (link.inwardIssue) {
        lines.push(`- ${link.type.inward}: [${link.inwardIssue.key}](${config.baseUrl}/browse/${link.inwardIssue.key}) - ${link.inwardIssue.fields.summary}`);
      }
      if (link.outwardIssue) {
        lines.push(`- ${link.type.outward}: [${link.outwardIssue.key}](${config.baseUrl}/browse/${link.outwardIssue.key}) - ${link.outwardIssue.fields.summary}`);
      }
    }
    lines.push('');
  }

  // Metadata
  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );

  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }

  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

function generateDefectMarkdown(
  defect: JiraIssue,
  linkedStory: { key: string, summary: string } | null,
  config: Config,
): string {
  const fields = defect.fields;
  const description = adfToMarkdown(fields.description);
  const components = fields.components?.map(c => c.name).join(', ') || 'None';

  // Extract custom fields (same as bugs)
  const actualResult = adfToMarkdown(fields[CUSTOM_FIELDS.actualResult] as AdfDocument | null);
  const expectedResult = adfToMarkdown(fields[CUSTOM_FIELDS.expectedResult] as AdfDocument | null);
  const errorType = getDropdownValue(fields[CUSTOM_FIELDS.errorType]);
  const severity = getDropdownValue(fields[CUSTOM_FIELDS.severity]);
  const testEnvironment = getDropdownValue(fields[CUSTOM_FIELDS.testEnvironment]);
  const rootCause = getDropdownValue(fields[CUSTOM_FIELDS.rootCause]);
  const workaround = adfToMarkdown(fields[CUSTOM_FIELDS.workaround] as AdfDocument | null);
  const evidence = adfToMarkdown(fields[CUSTOM_FIELDS.evidence] as AdfDocument | null);
  const fixType = getDropdownValue(fields[CUSTOM_FIELDS.fixType]);

  const lines: string[] = [
    `# DEFECT: ${fields.summary}`,
    '',
    `**Jira Key:** [${defect.key}](${config.baseUrl}/browse/${defect.key})`,
  ];

  if (linkedStory) {
    lines.push(`**Related Story:** [${linkedStory.key}](${config.baseUrl}/browse/${linkedStory.key}) - ${linkedStory.summary}`);
  }

  lines.push(
    `**Priority:** ${fields.priority?.name || 'Not set'}`,
    `**Status:** ${fields.status?.name || 'Unknown'}`,
    `**Components:** ${components}`,
  );

  // Add severity and error type inline if available
  if (severity) { lines.push(`**Severity:** ${severity}`); }
  if (errorType) { lines.push(`**Error Type:** ${errorType}`); }
  if (testEnvironment) { lines.push(`**Test Environment:** ${testEnvironment}`); }
  if (fixType) { lines.push(`**Fix Type:** ${fixType}`); }

  lines.push('', '---', '', '## Description', '', description || '_No description provided_', '');

  // Actual Result section
  if (actualResult) {
    lines.push('---', '', '## 🐞 Actual Result', '', actualResult, '');
  }

  // Expected Result section
  if (expectedResult) {
    lines.push('---', '', '## ✅ Expected Result', '', expectedResult, '');
  }

  // Root Cause section (category only)
  if (rootCause) {
    lines.push('---', '', '## 🔍 Root Cause', '', `**Category:** ${rootCause}`, '');
  }

  // Workaround section (optional)
  if (workaround) {
    lines.push('---', '', '## 🚩 Workaround', '', workaround, '');
  }

  // Evidence section (optional)
  if (evidence) {
    lines.push('---', '', '## 🧫 Evidence', '', evidence, '');
  }

  // Add all issue links
  if (fields.issuelinks && fields.issuelinks.length > 0) {
    lines.push('---', '', '## Related Issues', '');
    for (const link of fields.issuelinks) {
      if (link.inwardIssue) {
        lines.push(`- ${link.type.inward}: [${link.inwardIssue.key}](${config.baseUrl}/browse/${link.inwardIssue.key}) - ${link.inwardIssue.fields.summary}`);
      }
      if (link.outwardIssue) {
        lines.push(`- ${link.type.outward}: [${link.outwardIssue.key}](${config.baseUrl}/browse/${link.outwardIssue.key}) - ${link.outwardIssue.fields.summary}`);
      }
    }
    lines.push('');
  }

  // Metadata
  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );

  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }

  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

function generateImprovementMarkdown(
  improvement: JiraIssue,
  config: Config,
): string {
  const fields = improvement.fields;
  const description = adfToMarkdown(fields.description);
  const components = fields.components?.map(c => c.name).join(', ') || 'None';

  const lines: string[] = [
    `# IMPROVEMENT: ${fields.summary}`,
    '',
    `**Jira Key:** [${improvement.key}](${config.baseUrl}/browse/${improvement.key})`,
    `**Priority:** ${fields.priority?.name || 'Not set'}`,
    `**Status:** ${fields.status?.name || 'Unknown'}`,
    `**Components:** ${components}`,
    '',
    '---',
    '',
    '## Description',
    '',
    description || '_No description provided_',
    '',
  ];

  // Add issue links if any
  if (fields.issuelinks && fields.issuelinks.length > 0) {
    lines.push('---', '', '## Related Issues', '');
    for (const link of fields.issuelinks) {
      if (link.inwardIssue) {
        lines.push(`- ${link.type.inward}: [${link.inwardIssue.key}](${config.baseUrl}/browse/${link.inwardIssue.key}) - ${link.inwardIssue.fields.summary}`);
      }
      if (link.outwardIssue) {
        lines.push(`- ${link.type.outward}: [${link.outwardIssue.key}](${config.baseUrl}/browse/${link.outwardIssue.key}) - ${link.outwardIssue.fields.summary}`);
      }
    }
    lines.push('');
  }

  // Metadata
  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );

  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }

  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

function generateTestMarkdown(
  test: JiraIssue,
  config: Config,
): string {
  const fields = test.fields;
  const description = adfToMarkdown(fields.description);
  const components = fields.components?.map(c => c.name).join(', ') || 'None';

  const lines: string[] = [
    `# TEST: ${fields.summary}`,
    '',
    `**Jira Key:** [${test.key}](${config.baseUrl}/browse/${test.key})`,
    `**Status:** ${fields.status?.name || 'Unknown'}`,
    `**Components:** ${components}`,
    '',
    '---',
    '',
    '## Test Description',
    '',
    description || '_No description provided_',
    '',
  ];

  // Add issue links if any
  if (fields.issuelinks && fields.issuelinks.length > 0) {
    lines.push('---', '', '## Related Issues', '');
    for (const link of fields.issuelinks) {
      if (link.inwardIssue) {
        lines.push(`- ${link.type.inward}: [${link.inwardIssue.key}](${config.baseUrl}/browse/${link.inwardIssue.key}) - ${link.inwardIssue.fields.summary}`);
      }
      if (link.outwardIssue) {
        lines.push(`- ${link.type.outward}: [${link.outwardIssue.key}](${config.baseUrl}/browse/${link.outwardIssue.key}) - ${link.outwardIssue.fields.summary}`);
      }
    }
    lines.push('');
  }

  // Metadata
  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );

  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }

  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

/**
 * Generic materializer for Xray container issue types (Test Plan, Test Execution,
 * Test Set, Pre-Condition). Captures the `description` — which is where the ATP body
 * (Test Plan) and ATR body (Test Execution) live in Modality jira-xray — plus links
 * and metadata. Run results / per-TC pass-fail / coverage are NOT captured here; read
 * those via xray-cli.
 */
function generateXrayArtifactMarkdown(
  issue: JiraIssue,
  label: string,
  config: Config,
): string {
  const fields = issue.fields;
  const description = adfToMarkdown(fields.description);
  const components = fields.components?.map(c => c.name).join(', ') || 'None';

  const lines: string[] = [
    `# ${label}: ${fields.summary}`,
    '',
    `**Jira Key:** [${issue.key}](${config.baseUrl}/browse/${issue.key})`,
    `**Status:** ${fields.status?.name || 'Unknown'}`,
    `**Components:** ${components}`,
    '',
    '> Run results / coverage are NOT synced — read those via xray-cli. This file mirrors the issue description.',
    '',
    '---',
    '',
    '## Description',
    '',
    description || '_No description provided_',
    '',
  ];

  if (fields.issuelinks && fields.issuelinks.length > 0) {
    lines.push('---', '', '## Related Issues', '');
    for (const link of fields.issuelinks) {
      if (link.inwardIssue) {
        lines.push(`- ${link.type.inward}: [${link.inwardIssue.key}](${config.baseUrl}/browse/${link.inwardIssue.key}) - ${link.inwardIssue.fields.summary}`);
      }
      if (link.outwardIssue) {
        lines.push(`- ${link.type.outward}: [${link.outwardIssue.key}](${config.baseUrl}/browse/${link.outwardIssue.key}) - ${link.outwardIssue.fields.summary}`);
      }
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '## Metadata',
    '',
    `- **Created:** ${fields.created ? new Date(fields.created).toLocaleDateString() : 'Unknown'}`,
    `- **Updated:** ${fields.updated ? new Date(fields.updated).toLocaleDateString() : 'Unknown'}`,
    `- **Reporter:** ${fields.reporter?.displayName || 'Unknown'}`,
    `- **Assignee:** ${fields.assignee?.displayName || 'Unassigned'}`,
  );
  if (fields.labels && fields.labels.length > 0) {
    lines.push(`- **Labels:** ${fields.labels.join(', ')}`);
  }
  lines.push('', '---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

function generateEpicTreeMarkdown(
  epics: Array<{ epic: JiraIssue, stories: JiraIssue[] }>,
  config: Config,
): string {
  const lines: string[] = [
    '# Epic Tree',
    '',
    `_Project: ${config.project}_`,
    '',
    '---',
    '',
  ];

  for (const { epic, stories } of epics) {
    const totalPoints = stories.reduce((sum, story) => {
      const points = story.fields[CUSTOM_FIELDS.storyPoints];
      return sum + (typeof points === 'number' ? points : 0);
    }, 0);

    lines.push(
      `## [${epic.key}](${config.baseUrl}/browse/${epic.key}) - ${epic.fields.summary}`,
      '',
      `**Status:** ${epic.fields.status?.name} | **Stories:** ${stories.length} | **Points:** ${totalPoints}`,
      '',
    );

    if (stories.length > 0) {
      for (const story of stories) {
        const points = story.fields[CUSTOM_FIELDS.storyPoints] as number | undefined;
        const status = String(story.fields.status?.name || 'Unknown');
        lines.push(`- [${story.key}](${config.baseUrl}/browse/${story.key}) ${String(story.fields.summary)} _(${points ?? '-'} pts, ${status})_`);
      }
      lines.push('');
    }
  }

  lines.push('---', '', '_Synced from Jira by sync-jira-issues_', `_Last sync: ${new Date().toISOString()}_`, '');

  return lines.join('\n');
}

// ============================================================================
// SYNC ENGINE
// ============================================================================

async function syncStory(
  config: Config,
  story: JiraIssue,
  epic: JiraIssue | null,
  epicFolderPath: string,
  options: SyncOptions,
  result: SyncResult,
): Promise<void> {
  const storiesDir = join(epicFolderPath, 'stories');

  // Find or create story folder
  let storyFolder = findExistingFolder(storiesDir, story.key, 'story');
  if (!storyFolder) {
    const folderName = getFolderName(story.key, story.fields.summary, 'story');
    storyFolder = join(storiesDir, folderName);
  }

  if (!options.dryRun) {
    ensureDir(storyFolder);
  }

  // Materialize per-field files first so the index can list which exist.
  const present = syncFieldFiles(story.key, story.fields, STORY_FIELD_FILES, storyFolder, config, options.dryRun, result);

  // Write story.md (index)
  const storyContent = generateStoryMarkdown(story, epic, config, present);
  const storyPath = join(storyFolder, 'story.md');
  const storyResult = writeIndexFile(storyPath, storyContent, options.dryRun);

  if (storyResult.status === 'created') { result.files.created++; }
  else if (storyResult.status === 'updated') { result.files.updated++; }
  else { result.files.skipped++; }

  // Write comments.md if requested
  if (options.includeComments) {
    const comments = await fetchComments(config, story.key);
    const commentsContent = generateCommentsMarkdown(comments, story.key, config);
    const commentsPath = join(storyFolder, 'comments.md');
    const commentsResult = writeIndexFile(commentsPath, commentsContent, options.dryRun);

    if (commentsResult.status === 'created') { result.files.created++; }
    else if (commentsResult.status === 'updated') { result.files.updated++; }
    else { result.files.skipped++; }
  }

  result.synced.stories++;
}

async function syncEpic(
  config: Config,
  epicKey: string,
  options: SyncOptions,
  result: SyncResult,
): Promise<{ epic: JiraIssue, stories: JiraIssue[] } | null> {
  // Fetch epic
  const epic = await fetchIssue(config, epicKey, EPIC_FIELDS);

  if (epic.fields.issuetype?.name !== 'Epic') {
    result.warnings.push(`${epicKey}: Not an Epic (is ${epic.fields.issuetype?.name})`);
    return null;
  }

  // Fetch stories for this epic (only Stories, not Bugs/Tests/etc.)
  const stories = await searchIssues(
    config,
    `project = ${config.project} AND parent = ${epicKey} AND issuetype = Story ORDER BY key ASC`,
    STORY_FIELDS,
  );

  // Find or create epic folder
  const epicsDir = join(config.outputDir, 'epics');
  let epicFolder = findExistingFolder(config.outputDir, epicKey, 'epic');
  if (!epicFolder) {
    const folderName = getFolderName(epicKey, epic.fields.summary, 'epic');
    epicFolder = join(epicsDir, folderName);
  }

  if (!options.dryRun) {
    ensureDir(epicFolder);
  }

  if (!options.json) {
    log.line('');
    log.info(`Syncing ${basename(epicFolder)}`);
  }

  // Materialize epic-level planning field files (feature impl plan, feature test plan)
  const presentEpicFields = syncFieldFiles(epic.key, epic.fields, EPIC_FIELD_FILES, epicFolder, config, options.dryRun, result);

  // Write epic.md (index)
  const epicContent = generateEpicMarkdown(epic, stories, config, presentEpicFields);
  const epicPath = join(epicFolder, 'epic.md');
  const epicResult = writeIndexFile(epicPath, epicContent, options.dryRun);

  if (epicResult.status === 'created') { result.files.created++; }
  else if (epicResult.status === 'updated') { result.files.updated++; }
  else { result.files.skipped++; }

  result.synced.epics++;

  // Sync stories
  for (let i = 0; i < stories.length; i++) {
    const story = stories[i];
    const isLast = i === stories.length - 1;

    if (!options.json) {
      log.tree(story.key, story.fields.summary, isLast);
    }

    await syncStory(config, story, epic, epicFolder, options, result);
  }

  if (!options.json && stories.length > 0) {
    log.success(`${stories.length} stories synced`);
  }

  return { epic, stories };
}

/**
 * Syncs a single Story (used by `pull --story`, `get`, and `jql`). Places the
 * story under its parent epic's folder; orphan stories (no parent) land under
 * `epics/_orphans/` instead of failing, so a `get <orphan>` still materializes.
 */
async function syncSingleStory(
  config: Config,
  storyKey: string,
  options: SyncOptions,
  result: SyncResult,
): Promise<void> {
  if (!options.json) {
    log.info(`Fetching story ${storyKey}...`);
  }

  const story = await fetchIssue(config, storyKey, STORY_FIELDS);

  if (story.fields.issuetype?.name === 'Epic') {
    throw new Error(`${storyKey} is an Epic, not a Story. Use the epic path (pull --epic / get) instead.`);
  }

  const parentKey = story.fields.parent?.key;
  let epic: JiraIssue | null = null;
  let epicFolder: string;

  if (parentKey) {
    epic = await fetchIssue(config, parentKey, EPIC_FIELDS);
    epicFolder = findExistingFolder(config.outputDir, parentKey, 'epic')
      ?? join(config.outputDir, 'epics', getFolderName(parentKey, epic.fields.summary, 'epic'));
  }
  else {
    result.warnings.push(`${storyKey}: Story has no parent Epic (orphan) — placed under epics/_orphans/`);
    epicFolder = join(config.outputDir, 'epics', '_orphans');
  }

  if (!options.dryRun) {
    ensureDir(epicFolder);
    ensureDir(join(epicFolder, 'stories'));
  }

  if (!options.json) {
    log.tree(story.key, story.fields.summary, true);
  }

  await syncStory(config, story, epic, epicFolder, options, result);
}

async function syncAll(config: Config, options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();

  const result: SyncResult = {
    success: true,
    synced: { epics: 0, stories: 0, bugs: 0, defects: 0, improvements: 0, tests: 0 },
    warnings: [],
    files: { created: 0, updated: 0, skipped: 0 },
    duration_ms: 0,
  };

  try {
    // Ensure output directories exist
    if (!options.dryRun) {
      ensureDir(config.outputDir);
      ensureDir(join(config.outputDir, 'epics'));
    }

    const allEpicData: Array<{ epic: JiraIssue, stories: JiraIssue[] }> = [];

    if (options.storyKey) {
      await syncSingleStory(config, options.storyKey, options, result);
    }
    else if (options.epicKey) {
      // Sync single epic
      if (!options.json) {
        log.info(`Fetching epic ${options.epicKey}...`);
      }

      const epicData = await syncEpic(config, options.epicKey, options, result);
      if (epicData) {
        allEpicData.push(epicData);
      }
    }
    else {
      // Sync all epics
      if (!options.json) {
        log.info('Fetching epics from Jira...');
      }

      const epics = await searchIssues(
        config,
        `project = ${config.project} AND issuetype = Epic ORDER BY key ASC`,
        EPIC_FIELDS,
      );

      if (!options.json) {
        log.success(`Found ${epics.length} epics`);
      }

      // Also find orphan stories (stories without parent epic)
      const orphanStories = await searchIssues(
        config,
        `project = ${config.project} AND issuetype = Story AND parent is EMPTY ORDER BY key ASC`,
        STORY_FIELDS,
      );

      if (orphanStories.length > 0) {
        for (const story of orphanStories) {
          result.warnings.push(`${story.key}: Story without Epic parent (skipped)`);
        }
      }

      // Sync each epic
      for (const epic of epics) {
        const epicData = await syncEpic(config, epic.key, options, result);
        if (epicData) {
          allEpicData.push(epicData);
        }
      }
    }

    // Generate epic-tree.md if we synced multiple epics
    if (allEpicData.length > 0 && !options.storyKey) {
      const treeContent = generateEpicTreeMarkdown(allEpicData, config);
      const treePath = join(config.outputDir, 'epic-tree.md');
      const treeResult = writeIndexFile(treePath, treeContent, options.dryRun);

      if (treeResult.status === 'created') { result.files.created++; }
      else if (treeResult.status === 'updated') { result.files.updated++; }
    }
  }
  catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Error: ${errorMessage}`);
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

async function syncBugs(config: Config, options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();

  const result: SyncResult = {
    success: true,
    synced: { epics: 0, stories: 0, bugs: 0, defects: 0, improvements: 0, tests: 0 },
    warnings: [],
    files: { created: 0, updated: 0, skipped: 0 },
    duration_ms: 0,
  };

  try {
    const bugsDir = join(config.outputDir, 'bugs');
    if (!options.dryRun) {
      ensureDir(bugsDir);
    }

    if (!options.json) {
      log.info('Fetching bugs from Jira...');
    }

    const bugs = await searchIssues(
      config,
      `project = ${config.project} AND issuetype = Bug ORDER BY key ASC`,
      BUG_FIELDS,
    );

    if (!options.json) {
      log.success(`Found ${bugs.length} bugs`);
    }

    for (const bug of bugs) {
      const slug = generateSlug(bug.fields.summary);
      const filename = `BUG-${bug.key}-${slug}.md`;
      const filePath = join(bugsDir, filename);

      if (!options.json) {
        log.tree(bug.key, bug.fields.summary, bug === bugs[bugs.length - 1]);
      }

      const content = generateBugMarkdown(bug, config);
      const writeResult = writeIndexFile(filePath, content, options.dryRun);

      if (writeResult.status === 'created') { result.files.created++; }
      else if (writeResult.status === 'updated') { result.files.updated++; }
      else { result.files.skipped++; }

      result.synced.bugs++;
    }
  }
  catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Error: ${errorMessage}`);
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

/**
 * Find the Story linked to a Defect through issuelinks.
 * Returns the first Story found in the links.
 */
function findLinkedStory(defect: JiraIssue): { key: string, summary: string } | null {
  const links = defect.fields.issuelinks || [];

  for (const link of links) {
    // Check inward issues (e.g., "is caused by" Story)
    if (link.inwardIssue?.fields.issuetype?.name === 'Story') {
      return {
        key: link.inwardIssue.key,
        summary: link.inwardIssue.fields.summary,
      };
    }
    // Check outward issues (e.g., "causes" Story)
    if (link.outwardIssue?.fields.issuetype?.name === 'Story') {
      return {
        key: link.outwardIssue.key,
        summary: link.outwardIssue.fields.summary,
      };
    }
  }

  return null;
}

async function syncDefects(config: Config, options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();

  const result: SyncResult = {
    success: true,
    synced: { epics: 0, stories: 0, bugs: 0, defects: 0, improvements: 0, tests: 0 },
    warnings: [],
    files: { created: 0, updated: 0, skipped: 0 },
    duration_ms: 0,
  };

  try {
    if (!options.json) {
      log.info('Fetching defects from Jira...');
    }

    const defects = await searchIssues(
      config,
      `project = ${config.project} AND issuetype = Defect ORDER BY key ASC`,
      BUG_FIELDS, // Defects use the same fields as Bugs
    );

    if (!options.json) {
      log.success(`Found ${defects.length} defects`);
    }

    for (const defect of defects) {
      const linkedStory = findLinkedStory(defect);

      let defectDir: string;
      if (linkedStory) {
        // Find the Story folder and put defect inside it
        const epicsDir = join(config.outputDir, 'epics');
        let storyFolder: string | null = null;

        // Search for the story folder in all epic folders
        if (existsSync(epicsDir)) {
          const epicFolders = readdirSync(epicsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => join(epicsDir, d.name));

          for (const epicFolder of epicFolders) {
            const storiesDir = join(epicFolder, 'stories');
            const found = findExistingFolder(storiesDir, linkedStory.key, 'story');
            if (found) {
              storyFolder = found;
              break;
            }
          }
        }

        if (storyFolder) {
          defectDir = join(storyFolder, 'defects');
        }
        else {
          // Story folder not found, put in orphan defects folder
          result.warnings.push(`${defect.key}: Linked story ${linkedStory.key} folder not found, placing in defects/`);
          defectDir = join(config.outputDir, 'defects');
        }
      }
      else {
        // No linked story, put in orphan defects folder
        result.warnings.push(`${defect.key}: No linked Story found, placing in defects/`);
        defectDir = join(config.outputDir, 'defects');
      }

      if (!options.dryRun) {
        ensureDir(defectDir);
      }

      const slug = generateSlug(defect.fields.summary);
      const filename = `DEFECT-${defect.key}-${slug}.md`;
      const filePath = join(defectDir, filename);

      if (!options.json) {
        const location = linkedStory ? `→ ${linkedStory.key}` : '(orphan)';
        log.tree(defect.key, `${defect.fields.summary} ${location}`, defect === defects[defects.length - 1]);
      }

      const content = generateDefectMarkdown(defect, linkedStory, config);
      const writeResult = writeIndexFile(filePath, content, options.dryRun);

      if (writeResult.status === 'created') { result.files.created++; }
      else if (writeResult.status === 'updated') { result.files.updated++; }
      else { result.files.skipped++; }

      result.synced.defects++;
    }
  }
  catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Error: ${errorMessage}`);
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

async function syncImprovements(config: Config, options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();

  const result: SyncResult = {
    success: true,
    synced: { epics: 0, stories: 0, bugs: 0, defects: 0, improvements: 0, tests: 0 },
    warnings: [],
    files: { created: 0, updated: 0, skipped: 0 },
    duration_ms: 0,
  };

  try {
    const improvementsDir = join(config.outputDir, 'improvements');
    if (!options.dryRun) {
      ensureDir(improvementsDir);
    }

    if (!options.json) {
      log.info('Fetching improvements from Jira...');
    }

    const improvements = await searchIssues(
      config,
      `project = ${config.project} AND issuetype = Improvement ORDER BY key ASC`,
      IMPROVEMENT_FIELDS,
    );

    if (!options.json) {
      log.success(`Found ${improvements.length} improvements`);
    }

    for (const improvement of improvements) {
      const slug = generateSlug(improvement.fields.summary);
      const filename = `IMPROVEMENT-${improvement.key}-${slug}.md`;
      const filePath = join(improvementsDir, filename);

      if (!options.json) {
        log.tree(improvement.key, improvement.fields.summary, improvement === improvements[improvements.length - 1]);
      }

      const content = generateImprovementMarkdown(improvement, config);
      const writeResult = writeIndexFile(filePath, content, options.dryRun);

      if (writeResult.status === 'created') { result.files.created++; }
      else if (writeResult.status === 'updated') { result.files.updated++; }
      else { result.files.skipped++; }

      result.synced.improvements++;
    }
  }
  catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Error: ${errorMessage}`);
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

async function syncTests(config: Config, options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();

  const result: SyncResult = {
    success: true,
    synced: { epics: 0, stories: 0, bugs: 0, defects: 0, improvements: 0, tests: 0 },
    warnings: [],
    files: { created: 0, updated: 0, skipped: 0 },
    duration_ms: 0,
  };

  try {
    const testsDir = join(config.outputDir, 'tests');
    if (!options.dryRun) {
      ensureDir(testsDir);
    }

    if (!options.json) {
      log.info('Fetching tests from Jira...');
    }

    const tests = await searchIssues(
      config,
      `project = ${config.project} AND issuetype = Test ORDER BY key ASC`,
      TEST_FIELDS,
    );

    if (!options.json) {
      log.success(`Found ${tests.length} tests`);
    }

    for (const test of tests) {
      const slug = generateSlug(test.fields.summary);
      const filename = `TEST-${test.key}-${slug}.md`;
      const filePath = join(testsDir, filename);

      if (!options.json) {
        log.tree(test.key, test.fields.summary, test === tests[tests.length - 1]);
      }

      const content = generateTestMarkdown(test, config);
      const writeResult = writeIndexFile(filePath, content, options.dryRun);

      if (writeResult.status === 'created') { result.files.created++; }
      else if (writeResult.status === 'updated') { result.files.updated++; }
      else { result.files.skipped++; }

      result.synced.tests++;
    }
  }
  catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.warnings.push(`Error: ${errorMessage}`);
  }

  result.duration_ms = Date.now() - startTime;
  return result;
}

// ============================================================================
// SINGLE-ISSUE / JQL ROUTING (canonical read path — replaces `acli view`)
// ============================================================================

function emptyResult(): SyncResult {
  return {
    success: true,
    synced: { epics: 0, stories: 0, bugs: 0, defects: 0, improvements: 0, tests: 0 },
    warnings: [],
    files: { created: 0, updated: 0, skipped: 0 },
    duration_ms: 0,
  };
}

/**
 * Writes a single non-Story/Epic issue to its type folder. Handles Bug, Defect,
 * Improvement, Test (full custom-field materializers) plus the Xray container types
 * Test Plan / Test Execution / Test Set / Pre-Condition (generic description capture —
 * this is where the ATP/ATR body lives in Modality jira-xray).
 */
async function syncStandaloneIssue(
  config: Config,
  key: string,
  type: string,
  options: SyncOptions,
  result: SyncResult,
): Promise<void> {
  let fields: string[];
  let subdir: string;
  let prefix: string;
  switch (type) {
    case 'Bug': fields = BUG_FIELDS; subdir = 'bugs'; prefix = 'BUG'; break;
    case 'Defect': fields = BUG_FIELDS; subdir = 'defects'; prefix = 'DEFECT'; break;
    case 'Improvement': fields = IMPROVEMENT_FIELDS; subdir = 'improvements'; prefix = 'IMPROVEMENT'; break;
    case 'Test': fields = TEST_FIELDS; subdir = 'tests'; prefix = 'TEST'; break;
    case 'Test Plan': fields = TEST_FIELDS; subdir = 'test-plans'; prefix = 'TESTPLAN'; break;
    case 'Test Execution': fields = TEST_FIELDS; subdir = 'test-executions'; prefix = 'TESTEXEC'; break;
    case 'Test Set': fields = TEST_FIELDS; subdir = 'test-sets'; prefix = 'TESTSET'; break;
    case 'Pre-Condition': fields = TEST_FIELDS; subdir = 'preconditions'; prefix = 'PRECONDITION'; break;
    default:
      result.warnings.push(`${key}: unsupported issue type '${type}' — skipped`);
      return;
  }

  const issue = await fetchIssue(config, key, fields);
  const dir = join(config.outputDir, subdir);
  if (!options.dryRun) { ensureDir(dir); }
  const filePath = join(dir, `${prefix}-${key}-${generateSlug(issue.fields.summary)}.md`);

  let content: string;
  if (type === 'Defect') { content = generateDefectMarkdown(issue, findLinkedStory(issue), config); }
  else if (type === 'Bug') { content = generateBugMarkdown(issue, config); }
  else if (type === 'Improvement') { content = generateImprovementMarkdown(issue, config); }
  else if (type === 'Test') { content = generateTestMarkdown(issue, config); }
  else { content = generateXrayArtifactMarkdown(issue, type.toUpperCase(), config); }

  const r = writeIndexFile(filePath, content, options.dryRun);
  if (r.status === 'created') { result.files.created++; }
  else if (r.status === 'updated') { result.files.updated++; }
  else { result.files.skipped++; }

  if (type === 'Bug') { result.synced.bugs++; }
  else if (type === 'Defect') { result.synced.defects++; }
  else if (type === 'Improvement') { result.synced.improvements++; }
  else if (type === 'Test') { result.synced.tests++; }
}

/** Detects an issue's type and routes it to the correct materializer (full custom fields). */
async function routeIssueByKey(
  config: Config,
  key: string,
  options: SyncOptions,
  result: SyncResult,
): Promise<void> {
  const probe = await fetchIssue(config, key, ['issuetype', 'summary']);
  const type = probe.fields.issuetype?.name ?? 'Unknown';

  if (type === 'Epic') {
    await syncEpic(config, key, options, result);
  }
  else if (type === 'Story') {
    await syncSingleStory(config, key, options, result);
  }
  else {
    await syncStandaloneIssue(config, key, type, options, result);
  }
}

function printGetSummary(result: SyncResult, options: SyncOptions): void {
  if (options.json) { log.json(result); return; }
  if (result.warnings.length > 0) {
    log.line('');
    log.warn(`${result.warnings.length} warning(s):`);
    for (const w of result.warnings) { log.dim(`  - ${w}`); }
  }
  log.line('');
  log.title('Summary');
  log.line('─'.repeat(20));
  const s = result.synced;
  log.line(`Synced: ${s.epics} epic(s), ${s.stories} story(ies), ${s.bugs} bug(s), ${s.defects} defect(s), ${s.improvements} improvement(s), ${s.tests} test(s)`);
  log.line(`Files created:  ${result.files.created}`);
  log.line(`Files updated:  ${result.files.updated}`);
  log.line(`Files skipped:  ${result.files.skipped}`);
  log.line(`Duration:       ${(result.duration_ms / 1000).toFixed(1)}s`);
  log.line('');
  if (result.success) { log.success('Sync completed'); }
  else { log.error('Sync completed with errors'); }
}

// ============================================================================
// COMMANDS
// ============================================================================

async function cmdStatus(): Promise<void> {
  log.title('Jira Sync - Configuration Status');
  log.line('─'.repeat(40));

  try {
    const config = getConfig();

    log.success(`ATLASSIAN_URL: ${config.baseUrl}`);
    log.success(`ATLASSIAN_EMAIL: ${config.email}`);
    log.success(`ATLASSIAN_API_TOKEN: ${'*'.repeat(20)}`);
    logProjectBanner(config);
    log.info(`Output: ${config.outputDir}`);

    log.line('');
    log.info('Testing connection...');

    // Test connection by fetching project
    await jiraFetch(config, `/rest/api/3/project/${config.project}`);

    log.success(`Connected to project ${config.project}`);
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Missing required environment')) {
      log.error(errorMessage);
    }
    else if (errorMessage.includes('401')) {
      log.error('Authentication failed. Check ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN');
    }
    else if (errorMessage.includes('404')) {
      log.error('Project not found. Check JIRA_PROJECT_KEY env var or `project.project_key` in `.agents/project.yaml`.');
    }
    else {
      log.error(`Connection failed: ${errorMessage}`);
    }

    process.exit(1);
  }
}

async function cmdPull(options: SyncOptions): Promise<void> {
  const issueTypeLabels: Record<IssueTypeFilter, string> = {
    stories: 'Epics & Stories',
    bugs: 'Bugs',
    defects: 'Defects',
    improvements: 'Improvements',
    tests: 'Tests',
  };

  if (!options.json) {
    log.title(`Jira Sync - Pull ${issueTypeLabels[options.issueType]}`);
    log.line('─'.repeat(40));

    if (options.dryRun) {
      log.warn('DRY RUN - No files will be written');
    }
  }

  try {
    const config = getConfig();
    logProjectBanner(config, { json: options.json });
    let result: SyncResult;

    // Route to the appropriate sync function based on issue type
    switch (options.issueType) {
      case 'bugs':
        result = await syncBugs(config, options);
        break;
      case 'defects':
        result = await syncDefects(config, options);
        break;
      case 'improvements':
        result = await syncImprovements(config, options);
        break;
      case 'tests':
        result = await syncTests(config, options);
        break;
      case 'stories':
      default:
        result = await syncAll(config, options);
        break;
    }

    if (options.json) {
      log.json(result);
    }
    else {
      // Print warnings
      if (result.warnings.length > 0) {
        log.line('');
        log.warn(`${result.warnings.length} warning(s):`);
        for (const warning of result.warnings) {
          log.dim(`  - ${warning}`);
        }
      }

      // Print summary based on issue type
      log.line('');
      log.title('Summary');
      log.line('─'.repeat(20));

      // Show relevant counts based on issue type
      if (options.issueType === 'stories') {
        log.line(`Epics synced:   ${result.synced.epics}`);
        log.line(`Stories synced: ${result.synced.stories}`);
      }
      else if (options.issueType === 'bugs') {
        log.line(`Bugs synced:    ${result.synced.bugs}`);
      }
      else if (options.issueType === 'defects') {
        log.line(`Defects synced: ${result.synced.defects}`);
      }
      else if (options.issueType === 'improvements') {
        log.line(`Improvements synced: ${result.synced.improvements}`);
      }
      else if (options.issueType === 'tests') {
        log.line(`Tests synced:   ${result.synced.tests}`);
      }

      log.line(`Files created:  ${result.files.created}`);
      log.line(`Files updated:  ${result.files.updated}`);
      log.line(`Files skipped:  ${result.files.skipped}`);
      log.line(`Duration:       ${(result.duration_ms / 1000).toFixed(1)}s`);
      log.line('');

      if (result.success) {
        log.success('Sync completed');
      }
      else {
        log.error('Sync completed with errors');
        process.exit(1);
      }
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (options.json) {
      log.json({ success: false, error: errorMessage });
    }
    else {
      log.error(errorMessage);
    }

    process.exit(1);
  }
}

async function cmdGet(key: string, options: SyncOptions): Promise<void> {
  if (!options.json) {
    log.title(`Jira Sync - Get ${key}`);
    log.line('─'.repeat(40));
    if (options.dryRun) { log.warn('DRY RUN - No files will be written'); }
  }
  const startTime = Date.now();
  const result = emptyResult();
  try {
    const config = getConfig();
    logProjectBanner(config, { json: options.json });
    if (!options.dryRun) {
      ensureDir(config.outputDir);
      ensureDir(join(config.outputDir, 'epics'));
    }
    await routeIssueByKey(config, key, options, result);
  }
  catch (error) {
    result.success = false;
    result.warnings.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  result.duration_ms = Date.now() - startTime;
  printGetSummary(result, options);
  if (!result.success) { process.exit(1); }
}

async function cmdJql(jql: string, options: SyncOptions): Promise<void> {
  if (!options.json) {
    log.title('Jira Sync - JQL');
    log.line('─'.repeat(40));
    log.dim(`  ${jql}`);
    if (options.dryRun) { log.warn('DRY RUN - No files will be written'); }
  }
  const startTime = Date.now();
  const result = emptyResult();
  try {
    const config = getConfig();
    logProjectBanner(config, { json: options.json });
    if (!options.dryRun) {
      ensureDir(config.outputDir);
      ensureDir(join(config.outputDir, 'epics'));
    }
    const matches = await searchIssues(config, jql, ['issuetype', 'summary']);
    if (!options.json) { log.success(`JQL matched ${matches.length} issue(s)`); }
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      if (!options.json) { log.tree(m.key, m.fields.summary, i === matches.length - 1); }
      try {
        await routeIssueByKey(config, m.key, options, result);
      }
      catch (error) {
        result.warnings.push(`${m.key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  catch (error) {
    result.success = false;
    result.warnings.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
  result.duration_ms = Date.now() - startTime;
  printGetSummary(result, options);
  if (!result.success) { process.exit(1); }
}

function cmdHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}Jira Sync CLI${colors.reset}
Sync Jira Epics & Stories to local Markdown files

${colors.bold}USAGE${colors.reset}
  bun run jira:sync-issues <command> [subcommand] [options]

${colors.bold}COMMANDS${colors.reset}
  status              Check configuration and connection
  pull                Sync Epics and Stories from Jira (default)
  get <KEY>           Sync ONE issue (any type) with ALL custom fields → local files
  jql "<query>"       Sync EVERY issue matching a raw JQL query (custom fields incl.)
  help                Show this help message

${colors.bold}PULL SUBCOMMANDS${colors.reset}
  pull                Sync Epics + Stories (default) → .context/PBI/epics/
  pull bugs           Sync Bugs → .context/PBI/bugs/
  pull defects        Sync Defects → inside Story folders
  pull improvements   Sync Improvements → .context/PBI/improvements/
  pull tests          Sync Tests → .context/PBI/tests/

${colors.bold}OPTIONS${colors.reset}
  --epic <key>        Sync specific epic with all its stories
  --story <key>       Sync specific story only
  --include-comments  Include Jira comments in comments.md
  --dry-run           Show what would be done without writing files
  --json              Output results as JSON

${colors.bold}EXAMPLES${colors.reset}
  bun run jira:sync-issues status
  bun run jira:sync-issues pull
  bun run jira:sync-issues pull --epic {{PROJECT_KEY}}-20
  bun run jira:sync-issues pull --story {{PROJECT_KEY}}-21
  bun run jira:sync-issues pull bugs
  bun run jira:sync-issues pull defects
  bun run jira:sync-issues pull improvements --dry-run
  bun run jira:sync-issues pull tests
  bun run jira:sync-issues get {{PROJECT_KEY}}-40
  bun run jira:sync-issues jql "project = {{PROJECT_KEY}} AND status = 'Shift-Left QA'"
  bun run jira:sync-issues pull --include-comments --dry-run

${colors.bold}ENVIRONMENT VARIABLES${colors.reset}
  ATLASSIAN_URL         Jira instance URL (required)
  ATLASSIAN_EMAIL       Your email (required)
  ATLASSIAN_API_TOKEN   API token (required)
  JIRA_PROJECT_KEY          Project key override (default: read from .agents/project.yaml)
  JIRA_SYNC_OUTPUT      Output directory (default: .context/PBI)

${colors.bold}OVERWRITE POLICY${colors.reset}
  Jira is the source of truth — NO files are protected. Every file the sync owns
  (story.md, epic.md, per-field .md, comments.md, bug/test/test-plan/... .md) is
  re-materialized on each run (per-field files only when the Jira field is non-empty).
  Hand-authored NON-Jira files (context.md, evidence/, test-specs/) use names the
  sync never writes.

${colors.dim}Get API token: https://id.atlassian.com/manage-profile/security/api-tokens${colors.reset}
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'status':
      await cmdStatus();
      break;

    case 'pull':
      await cmdPull({
        epicKey: args.epic,
        storyKey: args.story,
        issueType: args.subcommand || 'stories',
        includeComments: args.includeComments,
        dryRun: args.dryRun,
        json: args.json,
      });
      break;

    case 'get':
      if (!args.getKey) {
        log.error('Usage: bun run jira:sync-issues get <ISSUE-KEY>');
        process.exit(1);
      }
      await cmdGet(args.getKey, {
        issueType: 'stories',
        includeComments: args.includeComments,
        dryRun: args.dryRun,
        json: args.json,
      });
      break;

    case 'jql':
      if (!args.jql) {
        log.error('Usage: bun run jira:sync-issues jql "<JQL query>"');
        process.exit(1);
      }
      await cmdJql(args.jql, {
        issueType: 'stories',
        includeComments: args.includeComments,
        dryRun: args.dryRun,
        json: args.json,
      });
      break;

    case 'help':
    case '--help':
    case '-h':
      cmdHelp();
      break;

    default:
      log.error(`Unknown command: ${args.command}`);
      log.info('Run "bun run jira:sync-issues help" for usage');
      process.exit(1);
  }
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
