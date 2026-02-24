#!/usr/bin/env bun

/**
 * ============================================================================
 * XRAY CLI - Command Line Interface for Xray Test Management
 * ============================================================================
 *
 * A CLI tool similar to GitHub's `gh` for managing Xray Cloud test cases,
 * executions, and results directly from terminal. Designed to be AI-friendly
 * with clear documentation and structured output.
 *
 * OFFICIAL DOCUMENTATION:
 *   - Xray Cloud REST API:   https://docs.getxray.app/display/XRAYCLOUD/REST+API
 *   - Xray GraphQL API:      https://docs.getxray.app/display/XRAYCLOUD/GraphQL+API
 *   - GraphQL Schema:        https://us.xray.cloud.getxray.app/doc/graphql/index.html
 *   - Authentication:        https://docs.getxray.app/display/XRAYCLOUD/Authentication+-+REST+v2
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * 1. Bun runtime (https://bun.sh) - Install with: curl -fsSL https://bun.sh/install | bash
 * 2. Xray Cloud API credentials (client_id + client_secret)
 * 3. No external dependencies required - uses native fetch API
 *
 * ============================================================================
 * ENVIRONMENT SETUP
 * ============================================================================
 *
 * Option 1: Login command (recommended - stores credentials securely)
 *   bun xray.ts auth login --client-id "YOUR_ID" --client-secret "YOUR_SECRET"
 *
 * Option 2: Environment variables
 *   export XRAY_CLIENT_ID="YOUR_CLIENT_ID"
 *   export XRAY_CLIENT_SECRET="YOUR_CLIENT_SECRET"
 *   bun xray.ts auth login
 *
 * Get your API keys at: Jira → Apps → Xray → Settings → API Keys
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * Run with Bun:
 *   bun xray.ts <command> <subcommand> [options]
 *
 * AUTHENTICATION:
 *   auth login              Authenticate with Xray Cloud
 *     --client-id <id>      API Client ID (or use XRAY_CLIENT_ID env var)
 *     --client-secret <key> API Client Secret (or use XRAY_CLIENT_SECRET env var)
 *     --project <key>       Set default project key
 *
 *   auth logout             Clear stored credentials
 *   auth status             Show current authentication status
 *
 * TEST MANAGEMENT:
 *   test create             Create a new test case
 *     --project <key>       Project key (required)
 *     --summary <text>      Test summary (required)
 *     --type <type>         Manual | Generic | Cucumber (default: Manual)
 *     --description <text>  Test description
 *     --labels <l1,l2>      Comma-separated labels
 *     --step <action|result>  Test step (repeatable, format: "action|result" or "action|data|result")
 *     --gherkin <feature>   Gherkin feature definition (for Cucumber tests)
 *     --definition <text>   Generic test definition
 *
 *   test get <key>          Get test details by issue key (e.g., PROJ-123)
 *   test list               List tests in a project
 *     --project <key>       Filter by project
 *     --jql <query>         Custom JQL filter
 *     --limit <n>           Max results (default: 20)
 *
 *   test add-step           Add a step to an existing test
 *     --test <id>           Test issue ID (required)
 *     --action <text>       Step action (required)
 *     --data <text>         Step test data
 *     --result <text>       Expected result
 *
 * TEST EXECUTIONS:
 *   exec create             Create a test execution
 *     --project <key>       Project key (required)
 *     --summary <text>      Execution summary (required)
 *     --tests <id1,id2>     Test issue IDs to include
 *
 *   exec get <id>           Get execution details with test runs
 *   exec list               List executions
 *   exec add-tests          Add tests to an existing execution
 *     --execution <id>      Execution issue ID
 *     --tests <id1,id2>     Test issue IDs to add
 *
 * TEST RUNS:
 *   run get <id>            Get test run details with step statuses
 *   run status              Update test run status
 *     --id <id>             Test run ID (required)
 *     --status <status>     TODO | EXECUTING | PASSED | FAILED | ABORTED | BLOCKED
 *
 *   run step-status         Update a specific step status
 *     --run <id>            Test run ID
 *     --step <id>           Step ID
 *     --status <status>     Step status
 *
 *   run comment             Add comment to test run
 *     --id <id>             Test run ID
 *     --comment <text>      Comment text
 *
 *   run defect              Link defects to test run
 *     --id <id>             Test run ID
 *     --issues <k1,k2>      Issue keys to link as defects
 *
 * TEST PLANS:
 *   plan create             Create a test plan
 *     --project <key>       Project key (required)
 *     --summary <text>      Plan summary (required)
 *     --tests <id1,id2>     Test issue IDs to include
 *
 *   plan list               List test plans
 *
 * TEST SETS:
 *   set create              Create a test set
 *     --project <key>       Project key (required)
 *     --summary <text>      Test set summary (required)
 *     --description <text>  Description
 *     --tests <id1,id2>     Test issue IDs to include
 *
 *   set get <id>            Get test set details with tests
 *   set list                List test sets
 *   set add-tests           Add tests to a test set
 *     --set <id>            Test set issue ID
 *     --tests <id1,id2>     Test issue IDs to add
 *
 *   set remove-tests        Remove tests from a test set
 *     --set <id>            Test set issue ID
 *     --tests <id1,id2>     Test issue IDs to remove
 *
 * IMPORT RESULTS:
 *   import junit            Import JUnit XML results
 *     --file <path>         XML file path (required)
 *     --project <key>       Project key
 *     --plan <key>          Test plan key
 *     --execution <key>     Existing execution key
 *
 *   import cucumber         Import Cucumber JSON results
 *     --file <path>         JSON file path (required)
 *     --project <key>       Project key
 *
 *   import xray             Import Xray JSON format
 *     --file <path>         JSON file path (required)
 *
 * BACKUP & RESTORE:
 *   backup export           Export all Xray data from a project
 *     --project <key>       Project key (required)
 *     --output <file>       Output file (default: xray-backup-<project>-<timestamp>.json)
 *     --include-runs        Include test execution runs and statuses
 *     --limit <n>           Batch size for fetching (default: 100)
 *
 *   backup restore          Restore Xray data to a project
 *     --file <path>         Backup file path (required)
 *     --project <key>       Target project key (required)
 *     --dry-run             Preview changes without making them
 *     --sync                Update existing tests instead of creating duplicates
 *     --map-keys <file>     CSV file with old_key,new_key mappings
 *
 * ============================================================================
 * EXAMPLES FOR AI
 * ============================================================================
 *
 * # Authenticate (run once, token cached for 24h)
 * bun xray.ts auth login --client-id "ABC123" --client-secret "xyz789"
 *
 * # Create a manual test with steps
 * bun xray.ts test create --project DEMO --summary "Verify user login" \
 *   --step "Navigate to /login|Login form is displayed" \
 *   --step "Enter valid credentials|user@test.com|Credentials accepted" \
 *   --step "Click Submit|Redirected to dashboard"
 *
 * # Create a Cucumber test
 * bun xray.ts test create --project DEMO --type Cucumber --summary "Login feature" \
 *   --gherkin "Feature: Login\n  Scenario: Valid login\n    Given I am on login page"
 *
 * # List tests in a project
 * bun xray.ts test list --project DEMO --limit 10
 *
 * # Get test details
 * bun xray.ts test get DEMO-123
 *
 * # Create test execution with specific tests
 * bun xray.ts exec create --project DEMO --summary "Sprint 5 Regression" \
 *   --tests "12345,67890"
 *
 * # Update test run status
 * bun xray.ts run status --id 5acc7ab0a3fe1b2c3d4e5f --status PASSED
 *
 * # Add comment to failed test
 * bun xray.ts run comment --id 5acc7ab0a3fe1b2c3d4e5f \
 *   --comment "Failed due to timeout in CI environment"
 *
 * # Import JUnit results from Playwright/Jest
 * bun xray.ts import junit --file ./test-results/junit.xml --project DEMO
 *
 * # Backup project data before migration
 * bun xray.ts backup export --project OLD_PROJ --include-runs --output backup.json
 *
 * # Backup only tests with actual Xray data (excludes tests without steps/gherkin/definition)
 * bun xray.ts backup export --project OLD_PROJ --only-with-data --include-runs --output backup.json
 *
 * # Restore to new project (preview first)
 * bun xray.ts backup restore --file backup.json --project NEW_PROJ --dry-run
 *
 * ============================================================================
 * XRAY + JIRA RELATIONSHIP
 * ============================================================================
 *
 * Xray uses Jira's issue system as its foundation:
 *
 *   - Test        → Jira issue with type "Test"
 *   - Test Set    → Jira issue with type "Test Set"
 *   - Test Plan   → Jira issue with type "Test Plan"
 *   - Test Exec   → Jira issue with type "Test Execution"
 *   - Precondition → Jira issue with type "Precondition"
 *
 * When you create a Test via this CLI, Xray:
 *   1. Creates a Jira issue (you get a key like PROJ-123)
 *   2. Stores test-specific data (steps, gherkin) in Xray's database
 *   3. Links them via issueId
 *
 * Issue ID vs Key:
 *   - issueId: Internal numeric ID (e.g., "12345")
 *   - key: Human-readable identifier (e.g., "PROJ-123")
 *
 * ============================================================================
 * TEST RUN STATUS VALUES
 * ============================================================================
 *
 *   - TODO       : Not yet executed
 *   - EXECUTING  : Currently being executed
 *   - PASSED     : Test passed successfully
 *   - FAILED     : Test failed
 *   - ABORTED    : Execution was aborted
 *   - BLOCKED    : Test blocked by external factor
 *
 * ============================================================================
 * TYPICAL TESTING WORKFLOWS
 * ============================================================================
 *
 * WORKFLOW 1: Manual Test Case Creation
 *   1. Create test: bun xray.ts test create --project PROJ --summary "..." --step "..."
 *   2. Create execution: bun xray.ts exec create --project PROJ --summary "Sprint X"
 *   3. Add tests: bun xray.ts exec add-tests --execution EXEC_ID --tests TEST_ID
 *   4. Execute and update: bun xray.ts run status --id RUN_ID --status PASSED
 *
 * WORKFLOW 2: Automation Results Import
 *   1. Run your automated tests (Playwright, Jest, Cypress, etc.)
 *   2. Import results: bun xray.ts import junit --file results.xml --project PROJ
 *   3. Xray automatically creates execution and updates test statuses
 *
 * WORKFLOW 3: Project Migration / Backup
 *   1. Export: bun xray.ts backup export --project OLD --include-runs --only-with-data --output backup.json
 *   2. Preview: bun xray.ts backup restore --file backup.json --project NEW --dry-run --sync
 *   3. Restore: bun xray.ts backup restore --file backup.json --project NEW --sync
 *   4. Key mapping saved to: key-mapping-NEW-<timestamp>.csv
 *
 *   Note: --sync mode will automatically change test types (Manual→Cucumber/Generic) if needed
 *
 * ============================================================================
 * CONFIG FILES
 * ============================================================================
 *
 *   ~/.xray-cli/config.json   Stored credentials (client_id, client_secret)
 *   ~/.xray-cli/token.json    Cached auth token (expires in 24h, auto-refreshes)
 *
 * ============================================================================
 * TROUBLESHOOTING
 * ============================================================================
 *
 * # Check auth status
 * bun xray.ts auth status
 *
 * # Re-authenticate if token issues
 * bun xray.ts auth logout
 * bun xray.ts auth login --client-id "..." --client-secret "..."
 *
 * # Enable debug mode for detailed errors
 * DEBUG=1 bun xray.ts test list --project PROJ
 *
 * # Common errors:
 * - "Not logged in" → Run auth login first
 * - "GraphQL errors" → Check if issue ID/key exists
 * - "Authentication failed" → Verify API credentials
 *
 * ============================================================================
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG_DIR = join(homedir(), '.xray-cli');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const TOKEN_FILE = join(CONFIG_DIR, 'token.json');

const XRAY_API_BASE = 'https://xray.cloud.getxray.app/api/v2';
const XRAY_GRAPHQL_URL = `${XRAY_API_BASE}/graphql`;
const XRAY_AUTH_URL = `${XRAY_API_BASE}/authenticate`;

// ============================================================================
// TYPES
// ============================================================================

interface Config {
  client_id: string
  client_secret: string
  default_project?: string
  // Jira REST API credentials (optional, for sync features)
  jira_base_url?: string
  jira_email?: string
  jira_api_token?: string
}

interface TokenData {
  token: string
  expires_at: number // Unix timestamp
}

interface TestStep {
  action: string
  data?: string
  result?: string
}

interface GraphQLResponse<T = unknown> {
  data?: T
  errors?: Array<{ message: string, path?: string[] }>
}

// GraphQL response types for Xray API
interface JiraFields {
  key?: string
  summary?: string
  description?: string
  status?: string | { name: string }
  labels?: string[]
}

interface TestTypeInfo {
  name: string
  kind?: string
}

interface TestStepResponse {
  id: string
  action: string
  data?: string
  result?: string
  comment?: string
  status?: { name: string, color?: string }
}

interface PreconditionResult {
  issueId: string
  jira: JiraFields
}

interface TestResult {
  issueId: string
  projectId?: string
  testType: TestTypeInfo
  steps?: TestStepResponse[]
  gherkin?: string
  unstructured?: string
  preconditions?: { results: PreconditionResult[] }
  jira: JiraFields
}

interface TestRunResult {
  id: string
  status: { name: string, color?: string, description?: string }
  comment?: string
  startedOn?: string
  finishedOn?: string
  defects?: string[]
  evidence?: Array<{ id: string, filename: string }>
  steps?: TestStepResponse[]
  test?: { issueId: string, jira: JiraFields }
  testExecution?: { issueId: string, jira: JiraFields }
}

interface TestExecutionResult {
  issueId: string
  jira: JiraFields
  tests?: { total: number, results: TestResult[] }
  testRuns?: { total: number, results: TestRunResult[] }
}

interface TestPlanResult {
  issueId: string
  jira: JiraFields
}

// Backup types
interface BackupTestStep {
  action: string
  data?: string
  result?: string
}

interface BackupTest {
  originalKey: string
  issueId: string
  summary: string
  description?: string
  testType: 'Manual' | 'Generic' | 'Cucumber'
  steps?: BackupTestStep[]
  gherkin?: string
  unstructured?: string
  labels?: string[]
}

interface BackupTestRunStep {
  stepIndex: number
  status: string
  comment?: string
}

interface BackupTestRun {
  testKey: string
  testIssueId: string
  status: string
  comment?: string
  defects?: string[]
  stepStatuses?: BackupTestRunStep[]
  startedOn?: string
  finishedOn?: string
}

interface BackupExecution {
  originalKey: string
  issueId: string
  summary: string
  testRuns: BackupTestRun[]
}

interface BackupData {
  exportedAt: string
  project: string
  version: string
  testsCount: number
  executionsCount: number
  tests: BackupTest[]
  executions: BackupExecution[]
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
  title: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`),
  dim: (msg: string) => console.log(`${colors.dim}${msg}${colors.reset}`),
  json: (obj: unknown) => console.log(JSON.stringify(obj, null, 2)),
};

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  }
  catch {
    return null;
  }
}

function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadToken(): TokenData | null {
  if (!existsSync(TOKEN_FILE)) {
    return null;
  }
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as TokenData;
    // Check if token is still valid (with 5 min buffer)
    if (data.expires_at > Date.now() + 5 * 60 * 1000) {
      return data;
    }
    return null; // Token expired
  }
  catch {
    return null;
  }
}

function saveToken(token: string): void {
  ensureConfigDir();
  const data: TokenData = {
    token,
    // Xray tokens last 24 hours, we'll set expiry to 23 hours to be safe
    expires_at: Date.now() + 23 * 60 * 60 * 1000,
  };
  writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
}

function clearToken(): void {
  if (existsSync(TOKEN_FILE)) {
    writeFileSync(TOKEN_FILE, '');
  }
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

async function authenticate(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(XRAY_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Authentication failed: ${response.status} - ${text}`);
  }

  // The API returns the token as a JSON string (with quotes)
  const token = await response.text();
  return token.replace(/"/g, ''); // Remove surrounding quotes
}

async function getValidToken(): Promise<string> {
  // First check for cached token
  const cached = loadToken();
  if (cached) {
    return cached.token;
  }

  // Need to authenticate
  const config = loadConfig();
  if (!config) {
    throw new Error('Not logged in. Run: xray auth login');
  }

  log.dim('Token expired, refreshing...');
  const token = await authenticate(config.client_id, config.client_secret);
  saveToken(token);
  return token;
}

// ============================================================================
// GRAPHQL CLIENT
// ============================================================================

// eslint-disable-next-line ts/no-explicit-any
async function graphql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getValidToken();

  const response = await fetch(XRAY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GraphQL request failed: ${response.status} - ${text}`);
  }

  const result = (await response.json()) as GraphQLResponse<T>;

  if (result.errors && result.errors.length > 0) {
    const errorMessages = result.errors.map(e => e.message).join('\n');
    throw new Error(`GraphQL errors:\n${errorMessages}`);
  }

  return result.data as T;
}

// ============================================================================
// REST API CLIENT (for imports)
// ============================================================================

// eslint-disable-next-line ts/no-explicit-any
async function restApi<T = any>(
  endpoint: string,
  options: {
    method?: string
    body?: unknown
    contentType?: string
  } = {},
): Promise<T> {
  const token = await getValidToken();
  const { method = 'POST', body, contentType = 'application/json' } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const response = await fetch(`${XRAY_API_BASE}${endpoint}`, {
    method,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`REST API error: ${response.status} - ${text}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  }
  catch {
    return text as T;
  }
}

// ============================================================================
// JIRA REST API CLIENT (for looking up issue IDs)
// ============================================================================

interface JiraIssue {
  id: string
  key: string
  fields?: {
    issuetype?: { name: string }
  }
}

/**
 * Look up a Jira issue by key to get its numeric ID
 * Requires Jira credentials configured via auth login --jira-*
 */
async function getJiraIssueId(key: string): Promise<string | null> {
  const config = loadConfig();

  // Check for Jira credentials in config or env vars
  const baseUrl = config?.jira_base_url || process.env.JIRA_BASE_URL;
  const email = config?.jira_email || process.env.JIRA_EMAIL;
  const token = config?.jira_api_token || process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !token) {
    return null; // Jira not configured
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
// HELPER FUNCTIONS
// ============================================================================

interface ExistingTest {
  issueId: string
  key: string
  testType: string
  hasSteps: boolean
  fromXray: boolean // true if found via Xray, false if assuming from key
}

/**
 * Check if a test exists by key and return its details
 * First tries Xray GraphQL, then Jira REST API, then assumes the issue exists
 */
async function findTestByKey(key: string, assumeExists = false): Promise<ExistingTest | null> {
  try {
    const result = await graphql<{ getTests: { results: Array<{
      issueId: string
      testType: { name: string }
      steps?: Array<{ id: string }>
      jira: { key: string }
    }> } }>(QUERIES.getTest, { jql: `key = ${key}` });

    if (result.getTests.results && result.getTests.results.length > 0) {
      const test = result.getTests.results[0];
      return {
        issueId: test.issueId,
        key: test.jira.key || key,
        testType: test.testType.name,
        hasSteps: (test.steps?.length || 0) > 0,
        fromXray: true,
      };
    }

    // If not found via Xray but assumeExists is true, try Jira REST API
    if (assumeExists) {
      // Try to get the numeric issueId from Jira REST API
      const jiraIssueId = await getJiraIssueId(key);

      if (jiraIssueId) {
        return {
          issueId: jiraIssueId, // Use numeric ID from Jira
          key,
          testType: 'Unknown',
          hasSteps: false,
          fromXray: false,
        };
      }

      // Last resort: use key as issueId (may not work for all mutations)
      return {
        issueId: key,
        key,
        testType: 'Unknown',
        hasSteps: false,
        fromXray: false,
      };
    }

    return null;
  }
  catch {
    // On error, if assumeExists, try Jira then fall back to key
    if (assumeExists) {
      const jiraIssueId = await getJiraIssueId(key);
      return {
        issueId: jiraIssueId || key,
        key,
        testType: 'Unknown',
        hasSteps: false,
        fromXray: false,
      };
    }
    return null;
  }
}

/**
 * Sync steps to an existing test (delete old steps, add new ones)
 */
async function syncTestSteps(
  issueId: string,
  steps: Array<{ action: string, data?: string, result?: string }>,
): Promise<void> {
  // Add each step
  for (const step of steps) {
    await graphql(MUTATIONS.addTestStep, {
      issueId,
      step: {
        action: step.action,
        data: step.data || '',
        result: step.result || '',
      },
    });
  }
}

// ============================================================================
// ARGUMENT PARSER
// ============================================================================

interface ParsedArgs {
  command: string
  subcommand: string
  flags: Record<string, string | boolean>
  positional: string[]
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0] || 'help',
    subcommand: args[1] || '',
    flags: {},
    positional: [],
  };

  let i = 2;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result.flags[key] = next;
        i += 2;
      }
      else {
        result.flags[key] = true;
        i += 1;
      }
    }
    else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        result.flags[key] = next;
        i += 2;
      }
      else {
        result.flags[key] = true;
        i += 1;
      }
    }
    else {
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
}

function requireFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = flags[name];
  if (!value || typeof value !== 'string') {
    throw new Error(`Missing required flag: --${name}`);
  }
  return value;
}

function getFlag(
  flags: Record<string, string | boolean>,
  name: string,
  defaultValue?: string,
): string | undefined {
  const value = flags[name];
  if (typeof value === 'string') {
    return value;
  }
  return defaultValue;
}

// ============================================================================
// GRAPHQL QUERIES & MUTATIONS
// ============================================================================

const QUERIES = {
  // Get a single test by issue ID or key
  getTest: `
    query GetTest($jql: String!) {
      getTests(jql: $jql, limit: 1) {
        results {
          issueId
          projectId
          testType { name }
          steps { id action data result }
          gherkin
          unstructured
          preconditions(limit: 10) { results { issueId jira(fields: ["key", "summary"]) } }
          jira(fields: ["key", "summary", "description", "status", "labels"])
        }
      }
    }
  `,

  // List tests with optional JQL filter
  getTests: `
    query GetTests($jql: String, $limit: Int!) {
      getTests(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          testType { name }
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  // Get test execution
  getTestExecution: `
    query GetTestExecution($issueId: String!) {
      getTestExecution(issueId: $issueId) {
        issueId
        jira(fields: ["key", "summary", "status"])
        tests(limit: 100) {
          total
          results {
            issueId
            testType { name }
            jira(fields: ["key", "summary"])
          }
        }
        testRuns(limit: 100) {
          total
          results {
            id
            status { name color }
            startedOn
            finishedOn
            test { issueId jira(fields: ["key"]) }
          }
        }
      }
    }
  `,

  // Get test run by ID
  getTestRunById: `
    query GetTestRunById($id: String!) {
      getTestRunById(id: $id) {
        id
        status { name color description }
        comment
        startedOn
        finishedOn
        defects
        evidence { id filename }
        steps {
          id
          action
          data
          result
          comment
          status { name color }
        }
        test { issueId jira(fields: ["key", "summary"]) }
        testExecution { issueId jira(fields: ["key"]) }
      }
    }
  `,

  // List test executions
  getTestExecutions: `
    query GetTestExecutions($jql: String, $limit: Int!) {
      getTestExecutions(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  // Get test plans
  getTestPlans: `
    query GetTestPlans($jql: String, $limit: Int!) {
      getTestPlans(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  // Get test sets
  getTestSets: `
    query GetTestSets($jql: String, $limit: Int!) {
      getTestSets(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary", "status"])
        }
      }
    }
  `,

  // Get single test set with tests
  getTestSet: `
    query GetTestSet($issueId: String!) {
      getTestSet(issueId: $issueId) {
        issueId
        jira(fields: ["key", "summary", "status", "description"])
        tests(limit: 100) {
          total
          results {
            issueId
            testType { name }
            jira(fields: ["key", "summary"])
          }
        }
      }
    }
  `,

  // Get tests with full data for backup
  getTestsFullData: `
    query GetTestsFullData($jql: String, $limit: Int!, $start: Int!) {
      getTests(jql: $jql, limit: $limit, start: $start) {
        total
        start
        limit
        results {
          issueId
          projectId
          testType { name kind }
          steps { id action data result }
          gherkin
          unstructured
          jira(fields: ["key", "summary", "description", "labels"])
        }
      }
    }
  `,

  // Get test executions with test runs for backup
  getExecutionsFullData: `
    query GetExecutionsFullData($jql: String, $limit: Int!) {
      getTestExecutions(jql: $jql, limit: $limit) {
        total
        results {
          issueId
          jira(fields: ["key", "summary"])
          testRuns(limit: 100) {
            total
            results {
              id
              status { name }
              comment
              defects
              startedOn
              finishedOn
              test { issueId jira(fields: ["key"]) }
              steps {
                id
                status { name }
                comment
              }
            }
          }
        }
      }
    }
  `,
};

const MUTATIONS = {
  // Create a new test
  createTest: `
    mutation CreateTest(
      $testType: UpdateTestTypeInput!,
      $steps: [CreateStepInput],
      $unstructured: String,
      $gherkin: String,
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $labels: [String],
      $folderPath: String
    ) {
      createTest(
        testType: $testType,
        steps: $steps,
        unstructured: $unstructured,
        gherkin: $gherkin,
        folderPath: $folderPath,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            labels: $labels,
            project: { key: $projectKey }
          }
        }
      ) {
        test {
          issueId
          testType { name }
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  // Add a step to existing test
  addTestStep: `
    mutation AddTestStep($issueId: String!, $step: CreateStepInput!) {
      addTestStep(issueId: $issueId, step: $step) {
        id
        action
        data
        result
      }
    }
  `,

  // Update test step
  updateTestStep: `
    mutation UpdateTestStep($stepId: String!, $step: UpdateStepInput!) {
      updateTestStep(stepId: $stepId, step: $step) {
        id
        action
        data
        result
      }
    }
  `,

  // Delete test step
  deleteTestStep: `
    mutation DeleteTestStep($issueId: String!, $stepId: String!) {
      deleteTestStep(issueId: $issueId, stepId: $stepId)
    }
  `,

  // Update Gherkin Test Definition (Cucumber tests)
  updateGherkinTestDefinition: `
    mutation UpdateGherkinTestDefinition($issueId: String!, $gherkin: String!) {
      updateGherkinTestDefinition(issueId: $issueId, gherkin: $gherkin) {
        issueId
        gherkin
      }
    }
  `,

  // Update Unstructured Test Definition (Generic tests)
  updateUnstructuredTestDefinition: `
    mutation UpdateUnstructuredTestDefinition($issueId: String!, $unstructured: String!) {
      updateUnstructuredTestDefinition(issueId: $issueId, unstructured: $unstructured) {
        issueId
        unstructured
      }
    }
  `,

  // Update Test Type (Manual, Cucumber, Generic)
  updateTestType: `
    mutation UpdateTestType($issueId: String!, $testType: UpdateTestTypeInput!) {
      updateTestType(issueId: $issueId, testType: $testType) {
        issueId
        testType {
          name
          kind
        }
      }
    }
  `,

  // Create test execution
  createTestExecution: `
    mutation CreateTestExecution(
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $testIssueIds: [String]
    ) {
      createTestExecution(
        testIssueIds: $testIssueIds,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            project: { key: $projectKey }
          }
        }
      ) {
        testExecution {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  // Create test plan
  createTestPlan: `
    mutation CreateTestPlan(
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $testIssueIds: [String]
    ) {
      createTestPlan(
        testIssueIds: $testIssueIds,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            project: { key: $projectKey }
          }
        }
      ) {
        testPlan {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  // Update test run status
  updateTestRunStatus: `
    mutation UpdateTestRunStatus($id: String!, $status: String!) {
      updateTestRunStatus(id: $id, status: $status)
    }
  `,

  // Update test run comment
  updateTestRunComment: `
    mutation UpdateTestRunComment($id: String!, $comment: String!) {
      updateTestRunComment(id: $id, comment: $comment)
    }
  `,

  // Update test run step status
  updateTestRunStepStatus: `
    mutation UpdateTestRunStepStatus($testRunId: String!, $stepId: String!, $status: String!) {
      updateTestRunStepStatus(testRunId: $testRunId, stepId: $stepId, status: $status) {
        warnings
      }
    }
  `,

  // Add defects to test run
  addDefectsToTestRun: `
    mutation AddDefectsToTestRun($id: String!, $issues: [String!]!) {
      addDefectsToTestRun(id: $id, issues: $issues) {
        addedDefects
        warnings
      }
    }
  `,

  // Add tests to test execution
  addTestsToTestExecution: `
    mutation AddTestsToTestExecution($issueId: String!, $testIssueIds: [String!]!) {
      addTestsToTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
        addedTests
        warning
      }
    }
  `,

  // Remove tests from test execution
  removeTestsFromTestExecution: `
    mutation RemoveTestsFromTestExecution($issueId: String!, $testIssueIds: [String!]!) {
      removeTestsFromTestExecution(issueId: $issueId, testIssueIds: $testIssueIds) {
        removedTests
        warning
      }
    }
  `,

  // Create test set
  createTestSet: `
    mutation CreateTestSet(
      $projectKey: String!,
      $summary: String!,
      $description: String,
      $testIssueIds: [String]
    ) {
      createTestSet(
        testIssueIds: $testIssueIds,
        jira: {
          fields: {
            summary: $summary,
            description: $description,
            project: { key: $projectKey }
          }
        }
      ) {
        testSet {
          issueId
          jira(fields: ["key", "summary"])
        }
        warnings
      }
    }
  `,

  // Add tests to test set
  addTestsToTestSet: `
    mutation AddTestsToTestSet($issueId: String!, $testIssueIds: [String!]!) {
      addTestsToTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
        addedTests
        warning
      }
    }
  `,

  // Remove tests from test set
  removeTestsFromTestSet: `
    mutation RemoveTestsFromTestSet($issueId: String!, $testIssueIds: [String!]!) {
      removeTestsFromTestSet(issueId: $issueId, testIssueIds: $testIssueIds) {
        removedTests
        warning
      }
    }
  `,
};

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

// --- AUTH COMMANDS ---

async function cmdAuthLogin(flags: Record<string, string | boolean>): Promise<void> {
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

  // Save config (including optional Jira credentials)
  saveConfig({
    client_id: clientId,
    client_secret: clientSecret,
    default_project: defaultProject,
    jira_base_url: jiraBaseUrl,
    jira_email: jiraEmail,
    jira_api_token: jiraApiToken,
  });

  // Save token
  saveToken(token);

  log.success('Successfully logged in to Xray Cloud');
  if (jiraBaseUrl && jiraEmail && jiraApiToken) {
    log.success('Jira REST API credentials saved (for sync features)');
  }
  log.dim(`Config saved to: ${CONFIG_FILE}`);
}

async function cmdAuthLogout(): Promise<void> {
  clearToken();
  if (existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, '');
  }
  log.success('Logged out successfully');
}

async function cmdAuthStatus(): Promise<void> {
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

  if (token) {
    const expiresIn = Math.round((token.expires_at - Date.now()) / 1000 / 60 / 60);
    log.success(`Token valid (expires in ~${expiresIn}h)`);
  }
  else {
    log.warn('Token expired (will refresh on next request)');
  }
}

// --- TEST COMMANDS ---

async function cmdTestCreate(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const projectKey = requireFlag(flags, 'project') || config?.default_project;
  const summary = requireFlag(flags, 'summary');
  const testType = getFlag(flags, 'type', 'Manual');
  const description = getFlag(flags, 'description');
  const labelsStr = getFlag(flags, 'labels');
  const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : undefined;
  const folderPath = getFlag(flags, 'folder');

  // Parse steps if provided (format: "action|data|result" or "action|result")
  const stepsFlags = Object.entries(flags)
    .filter(([k]) => k === 'step' || k.startsWith('step'))
    .map(([, v]) => v as string);

  let steps: TestStep[] | undefined;
  let unstructured: string | undefined;
  let gherkin: string | undefined;

  if (testType === 'Manual' && stepsFlags.length > 0) {
    steps = stepsFlags.map((s) => {
      const parts = s.split('|');
      if (parts.length === 2) {
        return { action: parts[0], result: parts[1] };
      }
      else if (parts.length >= 3) {
        return { action: parts[0], data: parts[1], result: parts[2] };
      }
      return { action: s, result: '' };
    });
  }
  else if (testType === 'Generic') {
    unstructured = getFlag(flags, 'definition') || summary;
  }
  else if (testType === 'Cucumber') {
    gherkin = getFlag(flags, 'gherkin');
    if (!gherkin) {
      throw new Error('Cucumber tests require --gherkin flag with feature definition');
    }
  }

  log.dim(`Creating ${testType} test in project ${projectKey}...`);

  const result = await graphql(MUTATIONS.createTest, {
    testType: { name: testType },
    steps,
    unstructured,
    gherkin,
    projectKey,
    summary,
    description,
    labels,
    folderPath,
  });

  const test = result.createTest.test;
  const warnings = result.createTest.warnings;

  log.success(`Test created: ${test.jira.key}`);
  console.log(`  Summary: ${test.jira.summary}`);
  console.log(`  Type: ${test.testType.name}`);
  console.log(`  Issue ID: ${test.issueId}`);

  if (warnings && warnings.length > 0) {
    log.warn('Warnings:');
    warnings.forEach((w: string) => console.log(`  - ${w}`));
  }
}

async function cmdTestGet(
  flags: Record<string, string | boolean>,
  positional: string[],
): Promise<void> {
  const key = positional[0] || getFlag(flags, 'key');
  if (!key) {
    throw new Error('Test key required. Usage: xray test get PROJ-123');
  }

  const result = await graphql(QUERIES.getTest, {
    jql: `key = ${key}`,
  });

  if (!result.getTests.results || result.getTests.results.length === 0) {
    throw new Error(`Test not found: ${key}`);
  }

  const test = result.getTests.results[0];

  log.title(`Test: ${test.jira.key}`);
  console.log(`Summary: ${test.jira.summary}`);
  console.log(`Type: ${test.testType.name}`);
  const testStatus = typeof test.jira.status === 'object' && test.jira.status !== null ? test.jira.status.name : (test.jira.status || 'Unknown');
  console.log(`Status: ${testStatus}`);
  console.log(`Issue ID: ${test.issueId}`);

  if (test.jira.labels && test.jira.labels.length > 0) {
    console.log(`Labels: ${test.jira.labels.join(', ')}`);
  }

  if (test.steps && test.steps.length > 0) {
    console.log(`\nSteps (${test.steps.length}):`);
    test.steps.forEach((s: TestStepResponse, i: number) => {
      console.log(`  ${i + 1}. ${s.action}`);
      if (s.data) {
        console.log(`     Data: ${s.data}`);
      }
      if (s.result) {
        console.log(`     Expected: ${s.result}`);
      }
    });
  }

  if (test.gherkin) {
    console.log('\nGherkin:');
    console.log(`  ${test.gherkin.split('\n').join('\n  ')}`);
  }

  if (test.unstructured) {
    console.log('\nDefinition:');
    console.log(`  ${test.unstructured}`);
  }

  if (test.preconditions?.results?.length > 0) {
    console.log('\nPreconditions:');
    test.preconditions.results.forEach((p: PreconditionResult) => {
      console.log(`  - ${p.jira.key}: ${p.jira.summary}`);
    });
  }
}

async function cmdTestList(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql
    = getFlag(flags, 'jql')
      || (project ? `project = ${project} AND issuetype = Test` : 'issuetype = Test');

  const result = await graphql(QUERIES.getTests, { jql, limit });

  log.title(`Tests (${result.getTests.total} total, showing ${result.getTests.results.length})`);

  if (result.getTests.results.length === 0) {
    log.warn('No tests found');
    return;
  }

  result.getTests.results.forEach((t: TestResult) => {
    const rawStatus = t.jira.status;
    const status = typeof rawStatus === 'object' && rawStatus !== null ? rawStatus.name : (rawStatus || 'Unknown');
    console.log(`${t.jira.key}  [${t.testType.name}]  ${status}  ${t.jira.summary}`);
  });
}

async function cmdTestAddStep(flags: Record<string, string | boolean>): Promise<void> {
  const issueId = requireFlag(flags, 'test');
  const action = requireFlag(flags, 'action');
  const data = getFlag(flags, 'data');
  const result = getFlag(flags, 'result');

  log.dim(`Adding step to test ${issueId}...`);

  const response = await graphql(MUTATIONS.addTestStep, {
    issueId,
    step: { action, data, result },
  });

  const step = response.addTestStep;
  log.success(`Step added (ID: ${step.id})`);
  console.log(`  Action: ${step.action}`);
  if (step.data) {
    console.log(`  Data: ${step.data}`);
  }
  if (step.result) {
    console.log(`  Expected: ${step.result}`);
  }
}

// --- EXECUTION COMMANDS ---

async function cmdExecCreate(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const projectKey = requireFlag(flags, 'project') || config?.default_project;
  const summary = requireFlag(flags, 'summary');
  const description = getFlag(flags, 'description');
  const testsStr = getFlag(flags, 'tests');
  const testIssueIds = testsStr ? testsStr.split(',').map(t => t.trim()) : [];

  log.dim(`Creating Test Execution in project ${projectKey}...`);

  const result = await graphql(MUTATIONS.createTestExecution, {
    projectKey,
    summary,
    description,
    testIssueIds,
  });

  const exec = result.createTestExecution.testExecution;
  log.success(`Test Execution created: ${exec.jira.key}`);
  console.log(`  Summary: ${exec.jira.summary}`);
  console.log(`  Issue ID: ${exec.issueId}`);
}

async function cmdExecGet(
  flags: Record<string, string | boolean>,
  positional: string[],
): Promise<void> {
  const issueId = positional[0] || requireFlag(flags, 'id');

  const result = await graphql(QUERIES.getTestExecution, { issueId });
  const exec = result.getTestExecution;

  log.title(`Test Execution: ${exec.jira.key}`);
  console.log(`Summary: ${exec.jira.summary}`);
  const execStatus = typeof exec.jira.status === 'object' && exec.jira.status !== null ? exec.jira.status.name : (exec.jira.status || 'Unknown');
  console.log(`Status: ${execStatus}`);
  console.log(`Tests: ${exec.tests.total}`);
  console.log(`Test Runs: ${exec.testRuns.total}`);

  if (exec.testRuns.results.length > 0) {
    console.log('\nTest Runs:');
    exec.testRuns.results.forEach((tr: TestRunResult) => {
      const testKey = tr.test?.jira?.key || 'Unknown';
      console.log(`  ${tr.id}  ${testKey}  [${tr.status.name}]`);
    });
  }
}

async function cmdExecList(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql
    = getFlag(flags, 'jql')
      || (project
        ? `project = ${project} AND issuetype = "Test Execution"`
        : 'issuetype = "Test Execution"');

  const result = await graphql(QUERIES.getTestExecutions, { jql, limit });

  log.title(`Test Executions (${result.getTestExecutions.total} total)`);

  if (result.getTestExecutions.results.length === 0) {
    log.warn('No test executions found');
    return;
  }

  result.getTestExecutions.results.forEach((e: TestExecutionResult) => {
    const eStatus = typeof e.jira.status === 'object' && e.jira.status !== null ? e.jira.status.name : (e.jira.status || 'Unknown');
    console.log(`${e.jira.key}  ${eStatus}  ${e.jira.summary}`);
  });
}

async function cmdExecAddTests(flags: Record<string, string | boolean>): Promise<void> {
  const issueId = requireFlag(flags, 'execution');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

  log.dim(`Adding ${testIssueIds.length} tests to execution...`);

  const result = await graphql(MUTATIONS.addTestsToTestExecution, {
    issueId,
    testIssueIds,
  });

  log.success(`Added ${result.addTestsToTestExecution.addedTests.length} tests`);
}

// --- RUN COMMANDS ---

async function cmdRunGet(
  flags: Record<string, string | boolean>,
  positional: string[],
): Promise<void> {
  const id = positional[0] || requireFlag(flags, 'id');

  const result = await graphql(QUERIES.getTestRunById, { id });
  const run = result.getTestRunById;

  log.title(`Test Run: ${run.id}`);
  console.log(`Test: ${run.test?.jira?.key || 'Unknown'} - ${run.test?.jira?.summary || ''}`);
  console.log(`Execution: ${run.testExecution?.jira?.key || 'Unknown'}`);
  console.log(`Status: ${run.status.name}`);

  if (run.comment) {
    console.log(`Comment: ${run.comment}`);
  }
  if (run.startedOn) {
    console.log(`Started: ${run.startedOn}`);
  }
  if (run.finishedOn) {
    console.log(`Finished: ${run.finishedOn}`);
  }
  if (run.defects?.length > 0) {
    console.log(`Defects: ${run.defects.join(', ')}`);
  }

  if (run.steps?.length > 0) {
    console.log(`\nSteps (${run.steps.length}):`);
    run.steps.forEach((s: TestStepResponse, i: number) => {
      const statusIcon
        = s.status?.name === 'PASSED' ? '✔' : s.status?.name === 'FAILED' ? '✖' : '○';
      console.log(`  ${statusIcon} ${i + 1}. ${s.action} [${s.status?.name || 'TODO'}]`);
      console.log(`     ID: ${s.id}`);
    });
  }
}

async function cmdRunStatus(flags: Record<string, string | boolean>): Promise<void> {
  const id = requireFlag(flags, 'id');
  const status = requireFlag(flags, 'status').toUpperCase();

  const validStatuses = ['TODO', 'EXECUTING', 'PASSED', 'FAILED', 'ABORTED', 'BLOCKED'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status. Valid values: ${validStatuses.join(', ')}`);
  }

  log.dim(`Updating test run ${id} to ${status}...`);

  await graphql(MUTATIONS.updateTestRunStatus, { id, status });

  log.success(`Test run status updated to ${status}`);
}

async function cmdRunStepStatus(flags: Record<string, string | boolean>): Promise<void> {
  const testRunId = requireFlag(flags, 'run');
  const stepId = requireFlag(flags, 'step');
  const status = requireFlag(flags, 'status').toUpperCase();

  log.dim(`Updating step ${stepId} to ${status}...`);

  await graphql(MUTATIONS.updateTestRunStepStatus, { testRunId, stepId, status });

  log.success(`Step status updated to ${status}`);
}

async function cmdRunComment(flags: Record<string, string | boolean>): Promise<void> {
  const id = requireFlag(flags, 'id');
  const comment = requireFlag(flags, 'comment');

  log.dim(`Adding comment to test run ${id}...`);

  await graphql(MUTATIONS.updateTestRunComment, { id, comment });

  log.success('Comment added');
}

async function cmdRunDefect(flags: Record<string, string | boolean>): Promise<void> {
  const id = requireFlag(flags, 'id');
  const issuesStr = requireFlag(flags, 'issues');
  const issues = issuesStr.split(',').map(i => i.trim());

  log.dim(`Adding ${issues.length} defects to test run...`);

  const result = await graphql(MUTATIONS.addDefectsToTestRun, { id, issues });

  log.success(`Added ${result.addDefectsToTestRun.addedDefects.length} defects`);
}

// --- PLAN COMMANDS ---

async function cmdPlanCreate(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const projectKey = requireFlag(flags, 'project') || config?.default_project;
  const summary = requireFlag(flags, 'summary');
  const description = getFlag(flags, 'description');
  const testsStr = getFlag(flags, 'tests');
  const testIssueIds = testsStr ? testsStr.split(',').map(t => t.trim()) : [];

  log.dim(`Creating Test Plan in project ${projectKey}...`);

  const result = await graphql(MUTATIONS.createTestPlan, {
    projectKey,
    summary,
    description,
    testIssueIds,
  });

  const plan = result.createTestPlan.testPlan;
  log.success(`Test Plan created: ${plan.jira.key}`);
  console.log(`  Summary: ${plan.jira.summary}`);
}

async function cmdPlanList(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql
    = getFlag(flags, 'jql')
      || (project ? `project = ${project} AND issuetype = "Test Plan"` : 'issuetype = "Test Plan"');

  const result = await graphql(QUERIES.getTestPlans, { jql, limit });

  log.title(`Test Plans (${result.getTestPlans.total} total)`);

  if (result.getTestPlans.results.length === 0) {
    log.warn('No test plans found');
    return;
  }

  result.getTestPlans.results.forEach((p: TestPlanResult) => {
    const pStatus = typeof p.jira.status === 'object' && p.jira.status !== null ? p.jira.status.name : (p.jira.status || 'Unknown');
    console.log(`${p.jira.key}  ${pStatus}  ${p.jira.summary}`);
  });
}

// --- TEST SET COMMANDS ---

async function cmdSetCreate(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const projectKey = requireFlag(flags, 'project') || config?.default_project;
  const summary = requireFlag(flags, 'summary');
  const description = getFlag(flags, 'description');
  const testsStr = getFlag(flags, 'tests');
  const testIssueIds = testsStr ? testsStr.split(',').map(t => t.trim()) : [];

  log.dim(`Creating Test Set in project ${projectKey}...`);

  const result = await graphql(MUTATIONS.createTestSet, {
    projectKey,
    summary,
    description,
    testIssueIds,
  });

  const testSet = result.createTestSet.testSet;
  log.success(`Test Set created: ${testSet.jira.key}`);
  console.log(`  Summary: ${testSet.jira.summary}`);
  console.log(`  Issue ID: ${testSet.issueId}`);

  if (result.createTestSet.warnings?.length > 0) {
    log.warn('Warnings:');
    result.createTestSet.warnings.forEach((w: string) => console.log(`  - ${w}`));
  }
}

async function cmdSetGet(
  flags: Record<string, string | boolean>,
  positional: string[],
): Promise<void> {
  const issueId = positional[0] || requireFlag(flags, 'id');

  const result = await graphql(QUERIES.getTestSet, { issueId });
  const testSet = result.getTestSet;

  log.title(`Test Set: ${testSet.jira.key}`);
  console.log(`Summary: ${testSet.jira.summary}`);
  const setStatus = typeof testSet.jira.status === 'object' && testSet.jira.status !== null ? testSet.jira.status.name : (testSet.jira.status || 'Unknown');
  console.log(`Status: ${setStatus}`);
  console.log(`Issue ID: ${testSet.issueId}`);
  console.log(`Tests: ${testSet.tests.total}`);

  if (testSet.tests.results.length > 0) {
    console.log('\nIncluded Tests:');
    testSet.tests.results.forEach((t: TestResult) => {
      console.log(`  ${t.jira.key}  [${t.testType.name}]  ${t.jira.summary}`);
    });
  }
}

async function cmdSetList(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  const limit = Number.parseInt(getFlag(flags, 'limit', '20') || '20', 10);
  const jql
    = getFlag(flags, 'jql')
      || (project ? `project = ${project} AND issuetype = "Test Set"` : 'issuetype = "Test Set"');

  const result = await graphql(QUERIES.getTestSets, { jql, limit });

  log.title(`Test Sets (${result.getTestSets.total} total)`);

  if (result.getTestSets.results.length === 0) {
    log.warn('No test sets found');
    return;
  }

  result.getTestSets.results.forEach((s: TestPlanResult) => {
    const sStatus = typeof s.jira.status === 'object' && s.jira.status !== null ? s.jira.status.name : (s.jira.status || 'Unknown');
    console.log(`${s.jira.key}  ${sStatus}  ${s.jira.summary}`);
  });
}

async function cmdSetAddTests(flags: Record<string, string | boolean>): Promise<void> {
  const issueId = requireFlag(flags, 'set');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

  log.dim(`Adding ${testIssueIds.length} tests to test set...`);

  const result = await graphql(MUTATIONS.addTestsToTestSet, {
    issueId,
    testIssueIds,
  });

  log.success(`Added ${result.addTestsToTestSet.addedTests.length} tests`);

  if (result.addTestsToTestSet.warning) {
    log.warn(result.addTestsToTestSet.warning);
  }
}

async function cmdSetRemoveTests(flags: Record<string, string | boolean>): Promise<void> {
  const issueId = requireFlag(flags, 'set');
  const testsStr = requireFlag(flags, 'tests');
  const testIssueIds = testsStr.split(',').map(t => t.trim());

  log.dim(`Removing ${testIssueIds.length} tests from test set...`);

  const result = await graphql(MUTATIONS.removeTestsFromTestSet, {
    issueId,
    testIssueIds,
  });

  log.success(`Removed ${result.removeTestsFromTestSet.removedTests.length} tests`);

  if (result.removeTestsFromTestSet.warning) {
    log.warn(result.removeTestsFromTestSet.warning);
  }
}

// --- IMPORT COMMANDS ---

async function cmdImportJunit(flags: Record<string, string | boolean>): Promise<void> {
  const file = requireFlag(flags, 'file');
  const projectKey = getFlag(flags, 'project');
  const testPlanKey = getFlag(flags, 'plan');
  const testExecKey = getFlag(flags, 'execution');

  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const content = readFileSync(file, 'utf-8');

  log.dim(`Importing JUnit results from ${file}...`);

  let endpoint = '/import/execution/junit';
  const params = new URLSearchParams();
  if (projectKey) {
    params.append('projectKey', projectKey);
  }
  if (testPlanKey) {
    params.append('testPlanKey', testPlanKey);
  }
  if (testExecKey) {
    params.append('testExecKey', testExecKey);
  }

  const queryString = params.toString();
  if (queryString) {
    endpoint += `?${queryString}`;
  }

  const result = await restApi(endpoint, {
    body: content,
    contentType: 'application/xml',
  });

  log.success('JUnit results imported');
  if (result.key) {
    console.log(`  Test Execution: ${result.key}`);
  }
  log.json(result);
}

async function cmdImportCucumber(flags: Record<string, string | boolean>): Promise<void> {
  const file = requireFlag(flags, 'file');
  const projectKey = getFlag(flags, 'project');
  const testPlanKey = getFlag(flags, 'plan');
  const testExecKey = getFlag(flags, 'execution');

  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const content = readFileSync(file, 'utf-8');

  log.dim(`Importing Cucumber results from ${file}...`);

  let endpoint = '/import/execution/cucumber';
  const params = new URLSearchParams();
  if (projectKey) {
    params.append('projectKey', projectKey);
  }
  if (testPlanKey) {
    params.append('testPlanKey', testPlanKey);
  }
  if (testExecKey) {
    params.append('testExecKey', testExecKey);
  }

  const queryString = params.toString();
  if (queryString) {
    endpoint += `?${queryString}`;
  }

  const result = await restApi(endpoint, {
    body: content,
    contentType: 'application/json',
  });

  log.success('Cucumber results imported');
  log.json(result);
}

async function cmdImportXray(flags: Record<string, string | boolean>): Promise<void> {
  const file = requireFlag(flags, 'file');

  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const content = readFileSync(file, 'utf-8');

  log.dim(`Importing Xray JSON results from ${file}...`);

  const result = await restApi('/import/execution', {
    body: content,
    contentType: 'application/json',
  });

  log.success('Xray JSON results imported');
  log.json(result);
}

// --- BACKUP COMMANDS ---

async function cmdBackupExport(flags: Record<string, string | boolean>): Promise<void> {
  const config = loadConfig();
  const project = getFlag(flags, 'project') || config?.default_project;
  if (!project) {
    throw new Error('Missing required flag: --project (or set default_project in config)');
  }
  const output = getFlag(flags, 'output') || `xray-backup-${project}-${Date.now()}.json`;
  const includeRuns = flags['include-runs'] === true || flags['include-runs'] === 'true';
  const onlyWithData = flags['only-with-data'] === true || flags['only-with-data'] === 'true';
  const limit = Number.parseInt(getFlag(flags, 'limit', '100') || '100', 10);

  log.title(`Xray Backup Export - Project: ${project}`);
  if (onlyWithData) {
    log.info('Only exporting tests with Xray data (steps, gherkin, or definition)');
  }

  // Step 1: Fetch all tests with full data
  log.dim('Fetching tests...');
  const testsData: BackupTest[] = [];
  let start = 0;
  let totalTests = 0;

  do {
    const result = await graphql(QUERIES.getTestsFullData, {
      jql: `project = ${project} AND issuetype = Test`,
      limit,
      start,
    });

    totalTests = result.getTests.total;
    const tests = result.getTests.results;

    for (const t of tests) {
      const testType = t.testType?.name || 'Manual';
      const backupTest: BackupTest = {
        originalKey: t.jira?.key || '',
        issueId: t.issueId,
        summary: t.jira?.summary || '',
        description: t.jira?.description || undefined,
        testType: testType as 'Manual' | 'Generic' | 'Cucumber',
        labels: t.jira?.labels || undefined,
      };

      // Add type-specific data
      let hasXrayData = false;
      if (testType === 'Manual' && t.steps?.length > 0) {
        backupTest.steps = t.steps.map((s: TestStepResponse) => ({
          action: s.action || '',
          data: s.data || undefined,
          result: s.result || undefined,
        }));
        hasXrayData = true;
      }
      else if (testType === 'Cucumber' && t.gherkin) {
        backupTest.gherkin = t.gherkin;
        hasXrayData = true;
      }
      else if (testType === 'Generic' && t.unstructured) {
        backupTest.unstructured = t.unstructured;
        hasXrayData = true;
      }

      // Skip tests without Xray data if --only-with-data flag is set
      if (onlyWithData && !hasXrayData) {
        continue;
      }

      testsData.push(backupTest);
    }

    start += limit;
    log.dim(`  Fetched ${Math.min(start, totalTests)}/${totalTests} tests...`);
  } while (start < totalTests);

  if (onlyWithData && testsData.length < totalTests) {
    log.success(`Exported ${testsData.length}/${totalTests} tests (${totalTests - testsData.length} skipped - no Xray data)`);
  }
  else {
    log.success(`Exported ${testsData.length} tests`);
  }

  // Step 2: Fetch executions with runs (if requested)
  const executionsData: BackupExecution[] = [];

  if (includeRuns) {
    log.dim('Fetching test executions with runs...');

    const execResult = await graphql(QUERIES.getExecutionsFullData, {
      jql: `project = ${project} AND issuetype = "Test Execution"`,
      limit: 100,
    });

    for (const exec of execResult.getTestExecutions.results) {
      const backupExec: BackupExecution = {
        originalKey: exec.jira?.key || '',
        issueId: exec.issueId,
        summary: exec.jira?.summary || '',
        testRuns: [],
      };

      if (exec.testRuns?.results) {
        for (const run of exec.testRuns.results) {
          const testRun: BackupTestRun = {
            testKey: run.test?.jira?.key || '',
            testIssueId: run.test?.issueId || '',
            status: run.status?.name || 'TODO',
            comment: run.comment || undefined,
            defects: run.defects || undefined,
            startedOn: run.startedOn || undefined,
            finishedOn: run.finishedOn || undefined,
          };

          // Include step statuses if available
          if (run.steps?.length > 0) {
            testRun.stepStatuses = run.steps.map((s: TestStepResponse, idx: number) => ({
              stepIndex: idx,
              status: s.status?.name || 'TODO',
              comment: s.comment || undefined,
            }));
          }

          backupExec.testRuns.push(testRun);
        }
      }

      executionsData.push(backupExec);
    }

    log.success(
      `Exported ${executionsData.length} executions with ${executionsData.reduce((sum, e) => sum + e.testRuns.length, 0)} test runs`,
    );
  }

  // Step 3: Build and save backup file
  const backup: BackupData = {
    exportedAt: new Date().toISOString(),
    project,
    version: '1.0',
    testsCount: testsData.length,
    executionsCount: executionsData.length,
    tests: testsData,
    executions: executionsData,
  };

  writeFileSync(output, JSON.stringify(backup, null, 2));

  log.success(`Backup saved to: ${output}`);
  console.log('\nSummary:');
  console.log(`  Tests: ${backup.testsCount}`);
  console.log(`  Executions: ${backup.executionsCount}`);
  console.log(`  File size: ${(Buffer.byteLength(JSON.stringify(backup)) / 1024).toFixed(2)} KB`);
}

async function cmdBackupRestore(flags: Record<string, string | boolean>): Promise<void> {
  const file = requireFlag(flags, 'file');
  const targetProject = requireFlag(flags, 'project');
  const dryRun = flags['dry-run'] === true;
  const syncMode = flags.sync === true;
  const mapKeysFile = getFlag(flags, 'map-keys');

  if (!existsSync(file)) {
    throw new Error(`Backup file not found: ${file}`);
  }

  log.title(`Xray Backup Restore - Target Project: ${targetProject}`);

  // Load backup
  const backupContent = readFileSync(file, 'utf-8');
  const backup: BackupData = JSON.parse(backupContent);

  log.info(`Backup from: ${backup.exportedAt}`);
  log.info(`Original project: ${backup.project}`);
  log.info(`Tests to restore: ${backup.testsCount}`);
  log.info(`Executions to restore: ${backup.executionsCount}`);

  if (dryRun) {
    log.warn('DRY RUN MODE - No changes will be made');
  }
  if (syncMode) {
    log.info('SYNC MODE - Will update existing tests instead of creating duplicates');
  }

  // Load key mapping if provided
  const keyMap: Map<string, string> = new Map();
  if (mapKeysFile && existsSync(mapKeysFile)) {
    const mapContent = readFileSync(mapKeysFile, 'utf-8');
    const lines = mapContent.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const [oldKey, newKey] = line.split(',').map(s => s.trim());
      if (oldKey && newKey) {
        keyMap.set(oldKey, newKey);
      }
    }
    log.info(`Loaded ${keyMap.size} key mappings from ${mapKeysFile}`);
  }

  // Restore tests
  let testsCreated = 0;
  let testsUpdated = 0;
  let testsSkipped = 0;
  let testsFailed = 0;

  console.log('\nRestoring tests...');

  for (const test of backup.tests) {
    // Check if we already have a mapping for this key (skip if exists in map)
    if (keyMap.has(test.originalKey)) {
      log.dim(`  Skipping ${test.originalKey} (already mapped)`);
      testsSkipped++;
      continue;
    }

    // In sync mode, check if test already exists in Xray (or assume it exists in Jira)
    if (syncMode) {
      // Pass assumeExists=true to use key as issueId when Xray doesn't have the test indexed
      const existingTest = await findTestByKey(test.originalKey, true);

      if (existingTest) {
        const source = existingTest.fromXray ? 'Xray' : 'Jira (assumed)';

        if (dryRun) {
          console.log(`  [DRY] Would sync: ${test.originalKey} (${test.testType}) - found via ${source}`);
          testsUpdated++;
          continue;
        }

        try {
          // Check if we need to update test type first (important after Xray reinstall)
          // This is needed when:
          // 1. Current type is Manual but backup has Cucumber/Generic data
          // 2. Current type is Unknown (from Jira REST) and backup has Cucumber/Generic data
          const hasXrayData = (test.testType === 'Cucumber' && test.gherkin)
            || (test.testType === 'Generic' && test.unstructured);
          const needsTypeChange = hasXrayData
            && existingTest.testType !== test.testType
            && (existingTest.testType === 'Manual' || existingTest.testType === 'Unknown');

          if (needsTypeChange) {
            log.dim(`  Changing test type: ${existingTest.testType || 'Manual'} → ${test.testType}`);
            await graphql(MUTATIONS.updateTestType, {
              issueId: existingTest.issueId,
              testType: { name: test.testType },
            });
          }

          // Update Xray-specific data based on test type
          if (test.testType === 'Manual' && test.steps && test.steps.length > 0) {
            // Only add steps if test doesn't have any (avoid duplicates)
            // If fromXray is false, we assume no steps exist yet
            if (!existingTest.hasSteps || !existingTest.fromXray) {
              await syncTestSteps(existingTest.issueId, test.steps);
              log.success(`Synced steps: ${test.originalKey} (${test.steps.length} steps added)`);
            }
            else {
              log.dim(`  Skipping steps for ${test.originalKey} (already has steps)`);
            }
          }
          else if (test.testType === 'Cucumber' && test.gherkin) {
            await graphql(MUTATIONS.updateGherkinTestDefinition, {
              issueId: existingTest.issueId,
              gherkin: test.gherkin,
            });
            log.success(`Synced gherkin: ${test.originalKey}`);
          }
          else if (test.testType === 'Generic' && test.unstructured) {
            await graphql(MUTATIONS.updateUnstructuredTestDefinition, {
              issueId: existingTest.issueId,
              unstructured: test.unstructured,
            });
            log.success(`Synced definition: ${test.originalKey}`);
          }
          else {
            log.dim(`  No Xray data to sync for ${test.originalKey}`);
          }

          keyMap.set(test.originalKey, existingTest.key);
          testsUpdated++;
        }
        catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          log.error(`Failed to sync ${test.originalKey}: ${errMsg}`);
          testsFailed++;
        }
        continue;
      }
    }

    // Create new test (normal mode or test not found in sync mode)
    if (dryRun) {
      console.log(`  [DRY] Would create: ${test.summary} (${test.testType})`);
      testsCreated++;
      continue;
    }

    try {
      // Prepare variables for createTest mutation
      const variables: Record<string, unknown> = {
        testType: { name: test.testType },
        projectKey: targetProject,
        summary: test.summary,
        description: test.description,
        labels: test.labels,
      };

      // Add type-specific data
      if (test.testType === 'Manual' && test.steps) {
        variables.steps = test.steps.map(s => ({
          action: s.action,
          data: s.data,
          result: s.result,
        }));
      }
      else if (test.testType === 'Cucumber' && test.gherkin) {
        variables.gherkin = test.gherkin;
      }
      else if (test.testType === 'Generic' && test.unstructured) {
        variables.unstructured = test.unstructured;
      }

      const result = await graphql(MUTATIONS.createTest, variables);
      const createdKey = result.createTest.test.jira?.key;

      log.success(`Created: ${createdKey} (from ${test.originalKey})`);

      // Store mapping for later (useful for executions)
      if (createdKey) {
        keyMap.set(test.originalKey, createdKey);
      }

      testsCreated++;
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create ${test.originalKey}: ${errMsg}`);
      testsFailed++;
    }
  }

  // Restore executions (if any)
  let execsCreated = 0;

  if (backup.executions.length > 0) {
    console.log('\nRestoring executions...');

    for (const exec of backup.executions) {
      if (dryRun) {
        console.log(`  [DRY] Would create execution: ${exec.summary}`);
        execsCreated++;
        continue;
      }

      try {
        // Map test keys to new keys
        const testIssueIds = exec.testRuns
          .map(r => keyMap.get(r.testKey) || r.testKey)
          .filter(Boolean);

        // Create the execution
        const execResult = await graphql(MUTATIONS.createTestExecution, {
          projectKey: targetProject,
          summary: exec.summary,
          testIssueIds,
        });

        const newExecKey = execResult.createTestExecution.testExecution.jira?.key;
        log.success(`Created execution: ${newExecKey} (from ${exec.originalKey})`);
        execsCreated++;

        // Note: Updating run statuses would require getting the new test run IDs
        // which is more complex. For now, we just log a warning.
        if (exec.testRuns.some(r => r.status !== 'TODO')) {
          log.warn(
            `  Execution has ${exec.testRuns.length} runs with status data. Manual status update may be needed.`,
          );
        }
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log.error(`Failed to create execution ${exec.originalKey}: ${errMsg}`);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  log.title('Restore Summary');
  console.log(`  Tests created: ${testsCreated}`);
  console.log(`  Tests updated: ${testsUpdated}`);
  console.log(`  Tests skipped: ${testsSkipped}`);
  console.log(`  Tests failed: ${testsFailed}`);
  if (backup.executions.length > 0) {
    console.log(`  Executions created: ${execsCreated}`);
  }

  if (!dryRun && keyMap.size > 0) {
    // Save the key mapping for reference
    const mapOutput = `key-mapping-${targetProject}-${Date.now()}.csv`;
    const mapContent = Array.from(keyMap.entries())
      .map(([old, newKey]) => `${old},${newKey}`)
      .join('\n');
    writeFileSync(mapOutput, `old_key,new_key\n${mapContent}`);
    log.info(`Key mapping saved to: ${mapOutput}`);
  }
}

// ============================================================================
// HELP
// ============================================================================

function showHelp(): void {
  console.log(`
${colors.bold}${colors.cyan}Xray CLI${colors.reset} - Command Line Interface for Xray Test Management

${colors.bold}USAGE${colors.reset}
  xray <command> <subcommand> [options]

${colors.bold}AUTHENTICATION${colors.reset}
  auth login     Login with Xray API credentials
                 --client-id <id>       Client ID (or XRAY_CLIENT_ID env var)
                 --client-secret <key>  Client Secret (or XRAY_CLIENT_SECRET env var)
                 --project <key>        Default project key

  auth logout    Clear stored credentials
  auth status    Show current authentication status

${colors.bold}TEST MANAGEMENT${colors.reset}
  test create    Create a new test case
                 --project <key>        Project key (required)
                 --summary <text>       Test summary (required)
                 --type <type>          Manual|Generic|Cucumber (default: Manual)
                 --description <text>   Test description
                 --labels <l1,l2>       Comma-separated labels
                 --folder <path>        Folder path in Xray
                 --step <action|result> Test step (repeatable for Manual tests)
                 --definition <text>    Definition (for Generic tests)
                 --gherkin <feature>    Gherkin feature (for Cucumber tests)

  test get <key>     Get test details
  test list          List tests
                     --project <key>    Filter by project
                     --jql <query>      Custom JQL filter
                     --limit <n>        Max results (default: 20)

  test add-step      Add step to existing test
                     --test <id>        Test issue ID (required)
                     --action <text>    Step action (required)
                     --data <text>      Step data
                     --result <text>    Expected result

${colors.bold}TEST EXECUTIONS${colors.reset}
  exec create    Create a test execution
                 --project <key>        Project key (required)
                 --summary <text>       Summary (required)
                 --description <text>   Description
                 --tests <id1,id2>      Test issue IDs to include

  exec get <id>      Get execution details
  exec list          List executions
  exec add-tests     Add tests to execution
                     --execution <id>   Execution issue ID
                     --tests <id1,id2>  Test issue IDs

${colors.bold}TEST RUNS${colors.reset}
  run get <id>       Get test run details
  run status         Update test run status
                     --id <id>          Test run ID (required)
                     --status <status>  TODO|EXECUTING|PASSED|FAILED|ABORTED|BLOCKED

  run step-status    Update step status
                     --run <id>         Test run ID
                     --step <id>        Step ID
                     --status <status>  Step status

  run comment        Add comment to test run
                     --id <id>          Test run ID
                     --comment <text>   Comment text

  run defect         Link defects to test run
                     --id <id>          Test run ID
                     --issues <k1,k2>   Issue keys to link

${colors.bold}TEST PLANS${colors.reset}
  plan create    Create a test plan
                 --project <key>        Project key (required)
                 --summary <text>       Summary (required)
                 --tests <id1,id2>      Test issue IDs

  plan list          List test plans

${colors.bold}TEST SETS${colors.reset}
  set create     Create a test set
                 --project <key>        Project key (required)
                 --summary <text>       Summary (required)
                 --description <text>   Description
                 --tests <id1,id2>      Test issue IDs to include

  set get <id>       Get test set details with included tests
  set list           List test sets
  set add-tests      Add tests to a test set
                     --set <id>         Test set issue ID
                     --tests <id1,id2>  Test issue IDs to add

  set remove-tests   Remove tests from a test set
                     --set <id>         Test set issue ID
                     --tests <id1,id2>  Test issue IDs to remove

${colors.bold}IMPORT RESULTS${colors.reset}
  import junit       Import JUnit XML results
                     --file <path>      XML file path (required)
                     --project <key>    Project key
                     --plan <key>       Test plan key
                     --execution <key>  Existing execution key

  import cucumber    Import Cucumber JSON results
                     --file <path>      JSON file path (required)
                     --project <key>    Project key

  import xray        Import Xray JSON format
                     --file <path>      JSON file path (required)

${colors.bold}BACKUP & RESTORE${colors.reset}
  backup export      Export all Xray data from a project
                     --project <key>    Project key (required)
                     --output <file>    Output file path (default: xray-backup-<project>-<timestamp>.json)
                     --include-runs     Include test execution runs and statuses
                     --only-with-data   Only export tests that have Xray data (steps, gherkin, definition)
                     --limit <n>        Batch size for fetching (default: 100)

  backup restore     Restore Xray data to a project
                     --file <path>      Backup file path (required)
                     --project <key>    Target project key (required)
                     --dry-run          Preview changes without making them
                     --sync             Update existing tests instead of creating duplicates
                     --map-keys <file>  CSV file with old_key,new_key mappings

${colors.bold}EXAMPLES${colors.reset}
  # Login
  xray auth login --client-id ABC123 --client-secret xyz789

  # Create a manual test with steps
  xray test create --project DEMO --summary "Verify login" \\
    --step "Open app|Login screen shown" \\
    --step "Enter credentials|admin/pass|Success message"

  # Update test run status
  xray run status --id 5acc7ab0a3fe1b --status PASSED

  # Import JUnit results
  xray import junit --file results.xml --project DEMO

  # Backup project data (all tests)
  xray backup export --project DEMO --output demo-backup.json --include-runs

  # Backup only tests with Xray data (excludes empty tests)
  xray backup export --project DEMO --only-with-data --include-runs

  # Restore to a new project (dry run first)
  xray backup restore --file demo-backup.json --project NEW_PROJ --dry-run

  # Restore with key mapping
  xray backup restore --file demo-backup.json --project NEW_PROJ --map-keys mapping.csv

${colors.bold}ENVIRONMENT VARIABLES${colors.reset}
  XRAY_CLIENT_ID      Xray API Client ID
  XRAY_CLIENT_SECRET  Xray API Client Secret

${colors.bold}CONFIG FILES${colors.reset}
  ~/.xray-cli/config.json   Stored credentials
  ~/.xray-cli/token.json    Cached auth token

${colors.dim}Version 1.0.0 | https://github.com/upex-galaxy/xray-cli${colors.reset}
`);
}

// ============================================================================
// MAIN ROUTER
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, subcommand, flags, positional } = parseArgs(args);

  try {
    switch (command) {
      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      case 'auth':
        switch (subcommand) {
          case 'login':
            await cmdAuthLogin(flags);
            break;
          case 'logout':
            await cmdAuthLogout();
            break;
          case 'status':
            await cmdAuthStatus();
            break;
          default:
            log.error(`Unknown auth command: ${subcommand}`);
            log.info('Available: login, logout, status');
        }
        break;

      case 'test':
        switch (subcommand) {
          case 'create':
            await cmdTestCreate(flags);
            break;
          case 'get':
            await cmdTestGet(flags, positional);
            break;
          case 'list':
            await cmdTestList(flags);
            break;
          case 'add-step':
            await cmdTestAddStep(flags);
            break;
          default:
            log.error(`Unknown test command: ${subcommand}`);
            log.info('Available: create, get, list, add-step');
        }
        break;

      case 'exec':
      case 'execution':
        switch (subcommand) {
          case 'create':
            await cmdExecCreate(flags);
            break;
          case 'get':
            await cmdExecGet(flags, positional);
            break;
          case 'list':
            await cmdExecList(flags);
            break;
          case 'add-tests':
            await cmdExecAddTests(flags);
            break;
          default:
            log.error(`Unknown exec command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests');
        }
        break;

      case 'run':
        switch (subcommand) {
          case 'get':
            await cmdRunGet(flags, positional);
            break;
          case 'status':
            await cmdRunStatus(flags);
            break;
          case 'step-status':
            await cmdRunStepStatus(flags);
            break;
          case 'comment':
            await cmdRunComment(flags);
            break;
          case 'defect':
            await cmdRunDefect(flags);
            break;
          default:
            log.error(`Unknown run command: ${subcommand}`);
            log.info('Available: get, status, step-status, comment, defect');
        }
        break;

      case 'plan':
        switch (subcommand) {
          case 'create':
            await cmdPlanCreate(flags);
            break;
          case 'list':
            await cmdPlanList(flags);
            break;
          default:
            log.error(`Unknown plan command: ${subcommand}`);
            log.info('Available: create, list');
        }
        break;

      case 'set':
      case 'testset':
        switch (subcommand) {
          case 'create':
            await cmdSetCreate(flags);
            break;
          case 'get':
            await cmdSetGet(flags, positional);
            break;
          case 'list':
            await cmdSetList(flags);
            break;
          case 'add-tests':
            await cmdSetAddTests(flags);
            break;
          case 'remove-tests':
            await cmdSetRemoveTests(flags);
            break;
          default:
            log.error(`Unknown set command: ${subcommand}`);
            log.info('Available: create, get, list, add-tests, remove-tests');
        }
        break;

      case 'import':
        switch (subcommand) {
          case 'junit':
            await cmdImportJunit(flags);
            break;
          case 'cucumber':
            await cmdImportCucumber(flags);
            break;
          case 'xray':
            await cmdImportXray(flags);
            break;
          default:
            log.error(`Unknown import format: ${subcommand}`);
            log.info('Available: junit, cucumber, xray');
        }
        break;

      case 'backup':
        switch (subcommand) {
          case 'export':
            await cmdBackupExport(flags);
            break;
          case 'restore':
            await cmdBackupRestore(flags);
            break;
          default:
            log.error(`Unknown backup command: ${subcommand}`);
            log.info('Available: export, restore');
        }
        break;

      default:
        if (command) {
          log.error(`Unknown command: ${command}`);
        }
        showHelp();
    }
  }
  catch (error) {
    if (error instanceof Error) {
      log.error(error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    }
    else {
      log.error(String(error));
    }
    process.exit(1);
  }
}

// Run
await main();
