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

export type Flags = Record<string, string | boolean | string[]>;

export interface ParsedArgs {
  command: string
  subcommand: string
  flags: Flags
  positional: string[]
}

// ============================================================================
// EVIDENCE / ATTACHMENT TYPES
// ============================================================================

/**
 * Input shape for `addEvidenceToTestRun` and `addEvidenceToTestRunStep`
 * GraphQL mutations.
 *
 * `data` MUST be the file contents encoded as base64 (no `data:` prefix,
 * no padding tweaks — straight `Buffer.toString('base64')`).
 */
export interface AttachmentDataInput {
  filename: string
  mimeType: string
  data: string
}

export interface AddEvidenceResult {
  addedEvidence: string[]
  warnings: string[]
}

export interface RemoveEvidenceResult {
  removedEvidence: string[]
  warnings: string[]
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
  tests?: { total: number, results: TestResult[] }
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
  /** Test Repository folder path (e.g. `/Regression/Login`). Root tests omit this. */
  folderPath?: string
  /** Original keys of Preconditions associated with this Test. */
  preconditionKeys?: string[]
  /**
   * Original keys of requirement/story issues this Test covers.
   * Recorded for reference only — coverage is a Jira issue-link and is carried
   * by a native Jira project migration, so restore does NOT re-create it.
   */
  coverageKeys?: string[]
}

/** A Precondition issue (Xray) captured for backup. */
export interface BackupPrecondition {
  originalKey: string
  issueId: string
  summary: string
  description?: string
  /** Precondition type name: `Manual` | `Generic` | `Cucumber`. */
  preconditionType: 'Manual' | 'Generic' | 'Cucumber'
  definition?: string
  labels?: string[]
  folderPath?: string
}

/**
 * Shared shape for the two test-container issue types — Test Plan and Test Set.
 * Membership is stored as original Test keys; restore remaps them to the
 * destination issueIds via the key map.
 */
export interface BackupTestContainer {
  originalKey: string
  issueId: string
  summary: string
  description?: string
  testKeys: string[]
}

/** A Test Repository folder and the Tests it directly contains. */
export interface BackupFolder {
  /** Absolute folder path, e.g. `/Regression/Login`. */
  path: string
  testKeys: string[]
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

/**
 * Snapshot of the source project's Xray configuration, captured at export time
 * so `backup preflight` can diff it against the destination. Config cannot be
 * written via the Xray API — this drives a manual setup checklist.
 */
export interface BackupProjectSettings {
  /** Test type names defined for the project (e.g. Manual, Generic, Cucumber, + customs). */
  testTypes: string[]
  /** Default test type name, if resolvable. */
  defaultTestType?: string
  /** Test Run status names in use/available (from getStatuses). */
  runStatuses: string[]
  /** Configured Test Environments. */
  testEnvironments: string[]
  /** Issue type names treated as defects. */
  defectIssueTypes: string[]
}

export interface BackupData {
  exportedAt: string
  project: string
  /** Backup schema version. `1.0` = tests + executions only. `2.0` adds preconditions, plans, sets, folders. */
  version: string
  testsCount: number
  executionsCount: number
  /** v2.0 counts — absent in v1.0 backups. */
  preconditionsCount?: number
  testPlansCount?: number
  testSetsCount?: number
  foldersCount?: number
  tests: BackupTest[]
  executions: BackupExecution[]
  /** v2.0 entity arrays — absent in v1.0 backups; restore treats them as empty. */
  preconditions?: BackupPrecondition[]
  testPlans?: BackupTestContainer[]
  testSets?: BackupTestContainer[]
  folders?: BackupFolder[]
  /** Source Xray config snapshot for `preflight` diffing (v2.0+; may be absent). */
  projectSettings?: BackupProjectSettings
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
