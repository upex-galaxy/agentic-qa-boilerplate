/**
 * Xray CLI - Type Definitions
 *
 * All TypeScript types, interfaces, and constants for the Xray CLI.
 */

// ============================================================================
// API CONFIGURATION
// ============================================================================

export const XRAY_API_BASE = 'https://xray.cloud.getxray.app/api/v2';
export const XRAY_GRAPHQL_URL = `${XRAY_API_BASE}/graphql`;
export const XRAY_AUTH_URL = `${XRAY_API_BASE}/authenticate`;

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface Config {
  client_id: string
  client_secret: string
  default_project?: string
  jira_base_url?: string
  jira_email?: string
  jira_api_token?: string
}

export interface TokenData {
  token: string
  expires_at: number
}

// ============================================================================
// COMMAND TYPES
// ============================================================================

export type Flags = Record<string, string | boolean>;

export interface ParsedArgs {
  command: string
  subcommand: string
  flags: Flags
  positional: string[]
}

// ============================================================================
// TEST TYPES
// ============================================================================

export interface TestStep {
  action: string
  data?: string
  result?: string
}

export interface TestStepResponse {
  id: string
  action: string
  data?: string
  result?: string
  comment?: string
  status?: { name: string, color?: string }
}

export interface TestTypeInfo {
  name: string
  kind?: string
}

export interface JiraFields {
  key?: string
  summary?: string
  description?: string
  status?: string | { name: string }
  labels?: string[]
}

export interface PreconditionResult {
  issueId: string
  jira: JiraFields
}

export interface TestResult {
  issueId: string
  projectId?: string
  testType: TestTypeInfo
  steps?: TestStepResponse[]
  gherkin?: string
  unstructured?: string
  preconditions?: { results: PreconditionResult[] }
  jira: JiraFields
}

export interface TestRunResult {
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

export interface TestExecutionResult {
  issueId: string
  jira: JiraFields
  tests?: { total: number, results: TestResult[] }
  testRuns?: { total: number, results: TestRunResult[] }
}

export interface TestPlanResult {
  issueId: string
  jira: JiraFields
}

export interface TestSetResult {
  issueId: string
  jira: JiraFields
  tests?: { total: number, results: TestResult[] }
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface ExistingTest {
  issueId: string
  key: string
  testType: string
  hasSteps: boolean
  fromXray: boolean
}

export interface JiraIssue {
  id: string
  key: string
  fields?: {
    issuetype?: { name: string }
  }
}

// ============================================================================
// BACKUP TYPES
// ============================================================================

export interface BackupTestStep {
  action: string
  data?: string
  result?: string
}

export interface BackupTest {
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

export interface BackupTestRunStep {
  stepIndex: number
  status: string
  comment?: string
}

export interface BackupTestRun {
  testKey: string
  testIssueId: string
  status: string
  comment?: string
  defects?: string[]
  stepStatuses?: BackupTestRunStep[]
  startedOn?: string
  finishedOn?: string
}

export interface BackupExecution {
  originalKey: string
  issueId: string
  summary: string
  testRuns: BackupTestRun[]
}

export interface BackupData {
  exportedAt: string
  project: string
  version: string
  testsCount: number
  executionsCount: number
  tests: BackupTest[]
  executions: BackupExecution[]
}

// ============================================================================
// GRAPHQL TYPES
// ============================================================================

export interface GraphQLResponse<T = unknown> {
  data?: T
  errors?: Array<{ message: string, path?: string[] }>
}

// ============================================================================
// IMPORT RESULT TYPES
// ============================================================================

export interface ImportResult {
  id?: string
  key?: string
  self?: string
  testExecIssue?: {
    id: string
    key: string
    self: string
  }
}
