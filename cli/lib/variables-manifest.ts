/**
 * @fileoverview Canonical variable manifest — the SINGLE SOURCE OF TRUTH for
 * every environment variable this repo knows about and where each one must go.
 *
 * Per handoff decision D1 (`.scratch/handoff-installer-variables-automation.md`):
 * this typed module replaces the four disconnected, drift-prone lists that used
 * to scatter var routing across the codebase (`INSTALLER_DEFERRED_VARS`,
 * `MCP_SERVER_SECRETS`, `DAY_ZERO_*`, and `doctor.ts`'s `PROJECT_BOUND_VARS`).
 *
 * Consumers (wired in later phases — NOT this phase):
 *   - `cli/install.ts`          → manifest-driven collection + closing summary.
 *   - `cli/doctor.ts`           → required-var health checks.
 *   - `cli/update-boilerplate.ts` → `.env` drift detection on update.
 *
 * `.env.example` stays the human-facing doc humans copy from; `scripts/check-vars.ts`
 * asserts manifest ⇄ `.env.example` parity so they never drift (D1).
 *
 * Remote target for THIS repo (QA) = GitHub Actions secrets (`gh secret set`),
 * because the test suites run in GitHub Actions. `GITHUB_TOKEN` is deliberately
 * EXCLUDED from the manifest: it is auto-injected by Actions and must never be
 * pushed (see the comment on the local-only block below).
 *
 * EVERY variable carries a `scope` (ADR-0005), and the scope decides who may
 * validate it and where:
 *   - `core`     the framework needs it. Validated at import with a default
 *                (TEST_ENV) or, behind a `featureGate`, by the code path that
 *                turns the feature on (Xray sync, Jira scripts, portal publish).
 *   - `tooling`  a tool that can get its credential elsewhere (a harness-level
 *                MCP, a CLI login, a CI-only notifier). Never a blocker.
 *   - `project`  the application under test: its login, its database, its API.
 *                Declared here as typed EXAMPLES so a copied `.env` validates;
 *                the consumer that reads one fails by name (`config.testUser`).
 * The doctor exits 1 for NO credential of any scope; the installer offers and
 * never requires; the schema requires only unconditional core items.
 */

import * as fs from 'node:fs';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

/**
 * Where a variable must live.
 *   - `local`  → the developer's `.env` file.
 *   - `github` → a GitHub Actions repository secret (or CI env input).
 *
 * NOTE: `VarScope` (production/preview/development) is intentionally OMITTED for
 * this repo. GitHub Actions secrets have no per-scope concept — the field exists
 * only in the DEV (Vercel) sibling boilerplate. Kept out here for clarity rather
 * than carrying a dead field.
 */
export type VarDestination = 'local' | 'github';

/**
 * Where the tooling READS a variable's value from when it needs one.
 *
 * - `env-file` (the default) — the value lives in `.env`. True for every var
 *   with a `local` destination, which is almost all of them.
 * - `atlassian-instance` — resolved by `cli/lib/atlassian-instance.ts` from
 *   `.agents/project.yaml` -> `issue_tracker.atlassian_url`.
 *
 * The second case exists because `ATLASSIAN_URL` is deliberately NOT a local
 * variable: while it sat in `.env`, a stale copy in the process environment
 * shadowed the corrected file (both `bun`'s autoload and `dotenv-cli` skip a
 * var that is already set), and `jira:sync-issues` silently rebuilt the PBI
 * cache from a dead Jira site with exit code 0. The host is project identity,
 * so it is anchored to a versioned file that shows up in a diff.
 *
 * The NAME keeps a `github` destination because a CI step or third-party action
 * may still want the variable in its environment. Its value is pushed there FROM
 * the yaml, so the two cannot drift. The repo's own test runtime does not rely on
 * that: `config/variables.ts` resolves the host through the same resolver.
 */
export type VarValueSource = 'env-file' | 'atlassian-instance';

/**
 * Who owns the need for a variable (ADR-0005). See the file header for the
 * policy each scope carries.
 */
export type VarScope = 'core' | 'tooling' | 'project';

/**
 * The switch that makes a `core` / `tooling` variable relevant. A gated var is
 * validated by the code path behind the switch, never up front; the doctor
 * turns a missing one into a WARNING only while the gate is on.
 *
 *   - `atlassian-url`  `issue_tracker.atlassian_url` is set in `.agents/project.yaml`
 *                      (the Jira scripts, the Xray CLI and the Jira-Direct TMS
 *                      provider read the credentials over REST).
 *   - `auto-sync`      `AUTO_SYNC=true` (results write-back).
 *   - `tms-xray`       `AUTO_SYNC=true` AND `TMS_PROVIDER=xray`.
 *   - `portal-url`     `PORTAL_URL` is set (private report hosting, CI-only).
 */
export type VarFeatureGate = 'atlassian-url' | 'auto-sync' | 'tms-xray' | 'portal-url';

export const VAR_SCOPES: readonly VarScope[] = ['core', 'tooling', 'project'];
export const VAR_FEATURE_GATES: readonly VarFeatureGate[] = ['atlassian-url', 'auto-sync', 'tms-xray', 'portal-url'];

/**
 * A conditional-required clause: the var is required only when another env var
 * holds a specific value, e.g. `{ ifEnv: 'TEST_ENV=staging' }`.
 */
export interface VarRequiredIfEnv {
  ifEnv: string
}

/**
 * What the generated varlock schema (`.env.core.schema`, see
 * `cli/lib/env-schema.ts`) says about this variable, when it differs from what
 * the INSTALLER needs to know.
 *
 * The two questions are not the same. `required` above answers "does day-0
 * setup have to collect this?" (the Atlassian credentials: yes). The schema's
 * `@required` answers "must `varlock load` refuse to run without it?", which is
 * the contract `config/validateTestEnv.ts` enforces today: `TEST_ENV`, plus the
 * test-user credentials of the ACTIVE environment, nothing else. CI never holds
 * an Atlassian token, so marking it `@required` would fail every build. When
 * `schema.required` is absent the schema falls back to `required`.
 *
 *   - `required`  override for the schema only (same shape as `required`).
 *   - `type`      an env-spec type expression, e.g. `email`, `url`, `port`,
 *                 `boolean`, `enum(local, staging)`. Omitted = string.
 *   - `example`   placeholder printed as `@example` (documentation only).
 *   - `docs`      URL printed as `@docs(...)`.
 *   - `default`   value written on the item line, i.e. the schema DEFAULT.
 *                 Distinct from `defaultValue`, which the installer writes into
 *                 `.env`: a schema default needs no line in anybody's file.
 */
export interface VarSchemaHints {
  required?: boolean | VarRequiredIfEnv
  type?: string
  example?: string
  docs?: string
  default?: string
}

/**
 * Canonical description of one environment variable.
 *
 *   - `name`         UPPER_SNAKE_CASE env-var key.
 *   - `destinations` non-empty list of sinks this var must reach.
 *   - `secret`       true → mask in logs, pipe via stdin, treat as sensitive.
 *   - `required`     `true` (always), `false` (optional), or a conditional
 *                    clause (`{ ifEnv: 'TEST_ENV=local' }`).
 *   - `scope`        who owns the need: `core` | `tooling` | `project` (ADR-0005).
 *   - `featureGate`  the switch that makes a core / tooling var relevant; see
 *                    `VarFeatureGate`. Absent = relevant whenever `required`.
 *   - `usedBy`       the consumer(s) that read the value, for the doctor's
 *                    "Used by" column and the schema comment. Names files or
 *                    features, never line numbers.
 *   - `critical`     true → OFFERED at day-0 by the interactive installer, with
 *                    skip as a first-class answer (a human is at the keyboard,
 *                    so it is the cheapest moment to paste a credential). It is
 *                    not "required": the installer never blocks on it. false →
 *                    never asked at install, never warned about; surfaced only
 *                    in the closing "Next steps" list with its `obtainHint`,
 *                    and settable later via `bun run setup --variables`.
 *   - `obtainHint`   (NON-critical only) concise where/how-to-get-it pointer
 *                    printed in the closing next-steps section.
 *   - `defaultValue` (special cases only, e.g. TEST_ENV) value the installer
 *                    writes when the var is absent — WITHOUT prompting.
 *   - `note`         one-line human rationale / CI consumer reference.
 */
export interface VarSpec {
  name: string
  /**
   * Write destinations. A var declaring a non-default `valueSource` (see
   * `VarValueSource`) is never written to `.env` and therefore never carries
   * `local`; `validateVarManifest` enforces that. Note the converse does NOT
   * hold here: a CI-only var (AUTO_SYNC, SLACK_WEBHOOK_URL) is `github`-only
   * without declaring a `valueSource`.
   */
  destinations: VarDestination[]
  /**
   * Where the value is read from. Omitted = `env-file` (the overwhelming
   * default). A var declaring anything else has NO `.env` entry, so it is
   * absent from `.env.example` and exempt from the parity check.
   */
  valueSource?: VarValueSource
  secret: boolean
  scope: VarScope
  featureGate?: VarFeatureGate
  usedBy: string
  required: boolean | VarRequiredIfEnv
  critical: boolean
  obtainHint?: string
  defaultValue?: string
  note: string
  /** Schema-only hints. See `VarSchemaHints`. */
  schema?: VarSchemaHints
}

// ----------------------------------------------------------------------------
// The manifest — content sourced from §2 (QA table) of the handoff.
// ----------------------------------------------------------------------------

/**
 * Every variable this repo manages, with its destination routing.
 *
 * Excluded by design: `GITHUB_TOKEN` (auto-injected by GitHub Actions — pushing
 * it is both unnecessary and a footgun, so it is NOT listed here as pushable).
 */
export const VAR_MANIFEST: VarSpec[] = [
  // --- Environment selection ---
  // The enum is this repo's vocabulary, not the framework's: a project declares
  // its own environments in `config/variables.ts` and `.agents/project.yaml`.
  // It stays here anyway (D5, env-scopes SPIKE) because varlock resolves the
  // `@currentEnv` item during early initialization and refuses a second
  // declaration of it, so the project's `.env.schema` cannot re-type it the
  // way it can strengthen any other imported item (measured on varlock 1.20.0:
  // "TEST_ENV was already resolved during early initialization ... cannot be
  // redefined"). The point of use is the envDataMap lookup in
  // `config/variables.ts`, which names the valid set on a mismatch.
  {
    name: 'TEST_ENV',
    destinations: ['local', 'github'],
    secret: false,
    scope: 'core',
    usedBy: 'config/variables.core.ts (env.current); config/variables.ts envDataMap; scripts/api-login; CI env input',
    required: true,
    critical: false,
    defaultValue: 'local',
    obtainHint: 'defaults to local; reconfigure manually or via the /adapt-framework skill when you adapt the framework to your project-under-test.',
    note: 'Which environment to test against. CI env INPUT, not a secret. Has a default, so it never blocks; an undeclared value fails by name at the envDataMap lookup. Installer writes the default; never prompts.',
    schema: { type: 'enum(local, staging)', default: 'local' },
  },

  // --- Test user credentials (per-environment) ---
  // PROJECT-UNDER-TEST EXAMPLES. The framework never requires them: which
  // variable holds which environment's login is the project's vocabulary
  // (`config/variables.ts`), and a project with no login has none. They stay
  // declared, typed and OPTIONAL so a `.env` copied from the template still
  // validates, and the one place that needs a value, `config.testUser`, fails
  // with a named error at the point of use. Rename or delete them when you
  // adapt the framework.
  {
    name: 'LOCAL_USER_EMAIL',
    destinations: ['local', 'github'],
    secret: false,
    scope: 'project',
    usedBy: 'config.testUser (config/variables.ts) -> tests/setup/ui-auth.setup, api-auth.setup, scripts/api-login',
    required: false,
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Local test user email (project-under-test example: rename or delete when adapting). Read by config.testUser, which fails by name when empty. CI secret in the suite workflows.',
    schema: { type: 'email', example: 'qa.local@example.test' },
  },
  {
    name: 'LOCAL_USER_PASSWORD',
    destinations: ['local', 'github'],
    secret: true,
    scope: 'project',
    usedBy: 'config.testUser (config/variables.ts) -> tests/setup/ui-auth.setup, api-auth.setup, scripts/api-login',
    required: false,
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Local test user password (project-under-test example: rename or delete when adapting). Read by config.testUser, which fails by name when empty. CI secret in the suite workflows.',
  },
  {
    name: 'STAGING_USER_EMAIL',
    destinations: ['local', 'github'],
    secret: false,
    scope: 'project',
    usedBy: 'config.testUser (config/variables.ts) -> tests/setup/ui-auth.setup, api-auth.setup, scripts/api-login',
    required: false,
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Staging test user email (project-under-test example: rename or delete when adapting). Read by config.testUser, which fails by name when empty. CI secret in the suite workflows.',
    schema: { type: 'email', example: 'qa.staging@example.test' },
  },
  {
    name: 'STAGING_USER_PASSWORD',
    destinations: ['local', 'github'],
    secret: true,
    scope: 'project',
    usedBy: 'config.testUser (config/variables.ts) -> tests/setup/ui-auth.setup, api-auth.setup, scripts/api-login',
    required: false,
    critical: false,
    obtainHint: 'test-user creds for your project-under-test; set when adapting the framework to your project.',
    note: 'Staging test user password (project-under-test example: rename or delete when adapting). Read by config.testUser, which fails by name when empty. CI secret in the suite workflows.',
  },

  // --- Xray (TMS, optional) ---
  // Core-gated: `tests/utils/jiraSync.ts` and the Xray CLI need these in the
  // process and cannot get them anywhere else. Already point-of-use:
  // `global.setup` validates them only when AUTO_SYNC=true && TMS_PROVIDER=xray.
  {
    name: 'XRAY_CLIENT_ID',
    destinations: ['local', 'github'],
    secret: true,
    scope: 'core',
    featureGate: 'tms-xray',
    usedBy: 'tests/utils/jiraSync (write-back); bun xray auth; sync-jira-issues enrich',
    required: false,
    critical: false,
    obtainHint: 'Xray Cloud → API keys (only if your project uses Xray TMS).',
    note: 'Xray Cloud client id. Referenced by regression.yml §env; optional (needed only when AUTO_SYNC && xray).',
    schema: { docs: 'https://docs.getxray.app/display/XRAYCLOUD/Global+Settings%3A+API+Keys' },
  },
  {
    name: 'XRAY_CLIENT_SECRET',
    destinations: ['local', 'github'],
    secret: true,
    scope: 'core',
    featureGate: 'tms-xray',
    usedBy: 'tests/utils/jiraSync (write-back); bun xray auth; sync-jira-issues enrich',
    required: false,
    critical: false,
    obtainHint: 'Xray Cloud → API keys (only if your project uses Xray TMS).',
    note: 'Xray Cloud client secret. Referenced by regression.yml §env; optional (needed only when AUTO_SYNC && xray).',
  },
  {
    name: 'XRAY_PROJECT_KEY',
    destinations: ['local', 'github'],
    secret: false,
    scope: 'core',
    featureGate: 'tms-xray',
    usedBy: 'config.tms.xray.projectKey (tests/utils/jiraSync)',
    required: false,
    critical: false,
    obtainHint: 'your Xray project key (only if your project uses Xray TMS).',
    note: 'Xray project key. Optional operational param.',
  },
  {
    name: 'STP_EXECUTION_KEY',
    destinations: ['local', 'github'],
    secret: false,
    scope: 'core',
    featureGate: 'tms-xray',
    usedBy: 'config.tms.stpExecutionKey (tests/utils/jiraSync); regression.yml execution_key fallback',
    required: false,
    critical: false,
    obtainHint: 'key of the Test Execution this run imports into: the RTR (created by /regression-testing per run, linked to the RTP) by default, the sprint-close STR at sprint close. Both hang off the "QA Test Artifacts" epic. NEVER the key of a Plan (RTP or STP).',
    // Without it, an import mints a NEW Test Execution on every run. Xray's
    // import API cannot set a parent (`info` is `additionalProperties: false`),
    // so that item is orphaned: no QA-process epic, outside the ladder. Pointing
    // at an already-parented Execution is the only way results land where the
    // artifact ladder expects them. CI refuses to import without it rather than
    // industrialising the orphan.
    //
    // The NAME predates the RTR and is kept so downstream secrets keep working;
    // the semantics moved: the value is the RTR by default and the STR only at
    // sprint close. The regression workflow's `execution_key` dispatch input
    // overrides this secret per run, so the secret is really the fallback for a
    // scheduled run. A Test Plan derives its status from its Executions and is
    // never written into, so handing this a Plan key is a mistake the sync
    // detects and refuses. Xray-only: Modality jira-native has no Test Executions.
    note: 'The Test Execution this run imports into: the RTR by default, the sprint-close STR at sprint close (never a Plan key). Overridden per dispatch by execution_key; referenced by regression.yml; Xray-only, optional.',
  },
  {
    name: 'RTP_KEY',
    destinations: ['local'],
    secret: false,
    scope: 'core',
    featureGate: 'tms-xray',
    usedBy: 'config.tms.rtpKey (tests/utils/jiraSync fallback only)',
    required: false,
    critical: false,
    obtainHint: 'key of the RTP (Test Plan titled "RTP: <PROJECT>: Regression Test Plan"): only if you run bun run test:sync locally without an execution key.',
    // Read by the in-process Xray fallback ONLY (tests/utils/jiraSync.ts). When
    // no execution key is set and the sync has to mint an Execution, this key
    // goes into `info.testPlanKey` so the orphan is at least linked to the RTP.
    // No workflow reads it: CI gets a pre-created RTR from /regression-testing
    // through the `execution_key` input, so the fallback never fires there.
    note: 'Optional RTP key so the in-process Xray fallback links the Execution it mints to the plan. Local-only; no workflow reads it.',
  },

  // --- Operational CI flag ---
  {
    name: 'AUTO_SYNC',
    destinations: ['github'],
    secret: false,
    scope: 'core',
    usedBy: 'config.tms.autoSync (tests/utils/jiraSync, global.teardown); validateTestEnv; regression.yml',
    required: false,
    critical: false,
    obtainHint: 'CI flag — set to "true" in GitHub secrets only if you auto-sync Xray results from CI.',
    note: 'CI operational flag (default false). Referenced by regression.yml §env. GitHub-only.',
    schema: { type: 'boolean', default: 'false' },
  },

  // --- Atlassian (Day-0 credentials) ---
  // ATLASSIAN_URL is the ONE var that is not a `.env` entry. It is a public
  // hostname, not a secret, and it is project IDENTITY — so it is anchored to
  // `.agents/project.yaml` (versioned, shows up in a diff) instead of a local
  // file a stale process value can shadow in silence. See `VarValueSource`.
  //
  // It keeps a `github` destination so a CI step that wants the variable can be
  // fed from the yaml rather than a hand-maintained secret. The repo's own test
  // runtime does not need it: `config/variables.ts` resolves the host directly.
  //
  // The three are CORE, gated on the yaml host (D4): the Atlassian MCP can live
  // at user level, but `scripts/sync-jira-*.ts`, `scripts/check-jira-setup.ts`,
  // the Xray CLI and the Jira-Direct TMS provider read the credentials from the
  // process over REST and cannot get them anywhere else. `acli auth login`
  // keeps its own session and does not replace them. The gate is the host
  // being set: no host, nothing Jira-shaped runs, nothing to warn about.
  {
    name: 'ATLASSIAN_URL',
    destinations: ['github'],
    valueSource: 'atlassian-instance',
    secret: false,
    scope: 'core',
    featureGate: 'atlassian-url',
    usedBy: 'cli/lib/atlassian-instance (every jira:* script, acli --site, the Jira-Direct TMS provider)',
    required: true,
    critical: true,
    note: 'Atlassian site URL. SOURCE OF TRUTH is .agents/project.yaml -> issue_tracker.atlassian_url, NOT .env — prompted at install and written there. Read it with `bun run --silent jira:url`.',
  },
  {
    name: 'ATLASSIAN_EMAIL',
    destinations: ['local', 'github'],
    secret: false,
    scope: 'core',
    featureGate: 'atlassian-url',
    usedBy: 'scripts/sync-jira-*, scripts/check-jira-setup, cli/xray (REST); config.tms.jira.user',
    required: true,
    critical: true,
    note: 'Atlassian account email. Offered at day-0; needed once the Jira host is set (scripts, Xray CLI and the Jira-Direct TMS provider read it over REST). Never a blocker: a missing one is a doctor warning.',
    // Day-0 required for the installer, NOT for the runtime: CI validates a
    // build without any Atlassian credential (see `VarSchemaHints`).
    schema: { required: false, type: 'email', docs: 'https://id.atlassian.com/manage-profile/security/api-tokens' },
  },
  {
    name: 'ATLASSIAN_API_TOKEN',
    destinations: ['local', 'github'],
    secret: true,
    scope: 'core',
    featureGate: 'atlassian-url',
    usedBy: 'scripts/sync-jira-*, scripts/check-jira-setup, cli/xray (REST); config.tms.jira.apiToken',
    required: true,
    critical: true,
    note: 'Atlassian API token. Offered at day-0; needed once the Jira host is set (scripts, Xray CLI and the Jira-Direct TMS provider read it over REST). Never a blocker: a missing one is a doctor warning. Sensitive.',
    schema: { required: false, docs: 'https://id.atlassian.com/manage-profile/security/api-tokens' },
  },

  // --- Slack (CI-only notifier) ---
  {
    name: 'SLACK_WEBHOOK_URL',
    destinations: ['github'],
    secret: true,
    scope: 'tooling',
    usedBy: 'the commented notification step of the suite workflows (opt-in)',
    required: false,
    critical: false,
    obtainHint: 'Slack → Incoming Webhooks (optional CI notifications).',
    note: 'CI-only Slack webhook for notifications. Absent from .env.example historically; GitHub-only secret.',
    schema: { type: 'url', docs: 'https://api.slack.com/messaging/webhooks' },
  },

  // --- LOCAL-ONLY set: no CI consumer; never pushed to GitHub ---
  // (GITHUB_TOKEN is deliberately NOT in this manifest — auto-injected by Actions.)
  //
  // PROJECT scope, consumed by a local MCP server: the values are the app under
  // test's API and database, the server is only the reader. A project with no
  // spec or no database leaves them empty and that server starts degraded.
  // The keys of REMOTE servers (web search, Postman) are not here any more:
  // those servers run at harness level (a claude.ai connector, a user-scope
  // MCP, the OpenCode / Codex user config), resolved by capability, and the
  // project has nothing to say about their credentials (ADR-0005, D3).
  {
    name: 'API_BASE_URL',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'openapi MCP request base; curl execution after bun run api:login',
    required: false,
    critical: false,
    obtainHint: 'your project-under-test API base URL — set when adapting the framework.',
    note: 'Backend API base URL for OpenAPI MCP exploration. Local only.',
    schema: { type: 'url', example: 'http://localhost:3000' },
  },
  {
    name: 'OPENAPI_SPEC_PATH',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'openapi MCP (schema read-only)',
    required: false,
    critical: false,
    obtainHint: 'path/URL to your project OpenAPI spec — set when adapting the framework.',
    note: 'Path/URL to the OpenAPI spec for the OpenAPI MCP. Local only.',
    schema: { example: './api/openapi.json' },
  },
  {
    name: 'DBHUB_TYPE',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'dbhub MCP via dbhub.toml interpolation',
    required: false,
    critical: false,
    obtainHint: 'your project DB driver (sqlserver | postgres | mysql | sqlite | mariadb) — set when adapting the framework.',
    note: 'DBHub MCP driver (sqlserver | postgres | mysql | sqlite | mariadb). Local only.',
    schema: { type: 'enum(sqlserver, postgres, mysql, sqlite, mariadb)' },
  },
  {
    name: 'DBHUB_HOST',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'dbhub MCP via dbhub.toml interpolation',
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP host. Local only.',
  },
  {
    name: 'DBHUB_PORT',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'dbhub MCP via dbhub.toml interpolation',
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP port. Local only.',
    schema: { type: 'port', example: '5432' },
  },
  {
    name: 'DBHUB_DATABASE',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'dbhub MCP via dbhub.toml interpolation',
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP database name. Local only.',
  },
  {
    name: 'DBHUB_USER',
    destinations: ['local'],
    secret: false,
    scope: 'project',
    usedBy: 'dbhub MCP via dbhub.toml interpolation',
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP user. Local only.',
  },
  {
    name: 'DBHUB_PASSWORD',
    destinations: ['local'],
    secret: true,
    scope: 'project',
    usedBy: 'dbhub MCP via dbhub.toml interpolation',
    required: false,
    critical: false,
    obtainHint: 'your project DB connection — set when adapting the framework.',
    note: 'DBHub MCP password. Local only; sensitive.',
  },

  // --- Private report portal (TOOLING, CI-only, opt-in) ---
  // Read by `scripts/ci/publish-allure-portal.ts` through a named `requiredEnv`
  // throw, and only when the suite workflows find `PORTAL_URL` set: the
  // presence of that one secret IS the feature switch, and the script is the
  // point of use. Declared here so `bun run setup --variables --remote` can
  // push them and the doctor can list them; never in `.env`, never a blocker.
  // Runbook: .agents/skills/regression-testing/references/private-hosting-setup.md
  {
    name: 'PORTAL_URL',
    destinations: ['github'],
    secret: false,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal (the switch: set = publish privately)',
    required: false,
    critical: false,
    obtainHint: 'URL of your deployed Test Report Portal (private hosting runbook in the regression-testing skill). Leave unset to publish on GitHub Pages.',
    note: 'Base URL of the private Test Report Portal. Its presence switches the suite workflows from GitHub Pages to the portal. GitHub-only.',
    schema: { type: 'url', example: 'https://reports.example.test' },
  },
  {
    name: 'PORTAL_PROJECT',
    destinations: ['github'],
    secret: false,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal',
    required: false,
    critical: false,
    obtainHint: 'project slug created with the portal\'s create-project script.',
    note: 'Project slug in the Test Report Portal. GitHub-only; needed only when PORTAL_URL is set.',
  },
  {
    name: 'PORTAL_API_KEY',
    destinations: ['github'],
    secret: true,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal',
    required: false,
    critical: false,
    obtainHint: 'per-project key printed once by the portal\'s create-project script.',
    note: 'Per-project API key of the Test Report Portal. GitHub-only; needed only when PORTAL_URL is set. Sensitive.',
  },
  {
    name: 'R2_ACCOUNT_ID',
    destinations: ['github'],
    secret: false,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal (S3-compatible sync to R2)',
    required: false,
    critical: false,
    obtainHint: 'Cloudflare account id (bunx wrangler whoami).',
    note: 'Cloudflare R2 account id for the report bucket. GitHub-only; needed only when PORTAL_URL is set.',
  },
  {
    name: 'R2_ACCESS_KEY_ID',
    destinations: ['github'],
    secret: true,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal (S3-compatible sync to R2)',
    required: false,
    critical: false,
    obtainHint: 'id of the R2 API token created for the report bucket.',
    note: 'Cloudflare R2 access key id. GitHub-only; needed only when PORTAL_URL is set. Sensitive.',
  },
  {
    name: 'R2_SECRET_ACCESS_KEY',
    destinations: ['github'],
    secret: true,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal (S3-compatible sync to R2)',
    required: false,
    critical: false,
    obtainHint: 'SHA-256 of the R2 API token value (see the private hosting runbook).',
    note: 'Cloudflare R2 secret access key. GitHub-only; needed only when PORTAL_URL is set. Sensitive.',
  },
  {
    name: 'R2_BUCKET',
    destinations: ['github'],
    secret: false,
    scope: 'tooling',
    featureGate: 'portal-url',
    usedBy: 'scripts/ci/publish-allure-portal (S3-compatible sync to R2)',
    required: false,
    critical: false,
    obtainHint: 'name of the R2 bucket that holds the reports.',
    note: 'Cloudflare R2 bucket for the reports. GitHub-only; needed only when PORTAL_URL is set.',
  },
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * All manifest vars whose destinations include `dest`.
 * Preserves manifest order.
 */
export function varsFor(dest: VarDestination): VarSpec[] {
  return VAR_MANIFEST.filter(spec => spec.destinations.includes(dest));
}

/** A spec's value source, with the `env-file` default applied. */
export function valueSourceOf(spec: VarSpec): VarValueSource {
  return spec.valueSource ?? 'env-file';
}

/**
 * Vars whose value actually lives in `.env`. This — NOT the whole manifest — is
 * the set `.env.example` must document and the set the process⇄file drift check
 * compares, because a var sourced elsewhere has no `.env` line to be right or
 * wrong about.
 */
export function envFileVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => valueSourceOf(spec) === 'env-file');
}

/** All manifest vars of one scope, in manifest order. */
export function varsInScope(scope: VarScope, manifest: readonly VarSpec[] = VAR_MANIFEST): VarSpec[] {
  return manifest.filter(spec => spec.scope === scope);
}

/**
 * What the doctor and the updater need to know about the machine to decide
 * whether a gate is on. `atlassianHostSet` comes from the yaml resolver, the
 * rest from the `.env` snapshot; a caller that cannot resolve one leaves it
 * undefined and the gate reads as closed.
 */
export interface GateContext {
  env: Record<string, string>
  atlassianHostSet?: boolean
}

/**
 * Whether `spec`'s feature gate is ON right now. A spec with no gate is always
 * on (its `required` says the rest). Pure: the caller supplies the snapshot.
 */
export function gateIsOn(spec: VarSpec, ctx: GateContext): boolean {
  const on = (name: string, value = 'true'): boolean => (ctx.env[name] ?? '').trim() === value;
  switch (spec.featureGate) {
    case undefined: return true;
    case 'atlassian-url': return ctx.atlassianHostSet === true;
    case 'auto-sync': return on('AUTO_SYNC');
    case 'tms-xray': return on('AUTO_SYNC') && (ctx.env.TMS_PROVIDER ?? 'xray').trim() === 'xray';
    case 'portal-url': return (ctx.env.PORTAL_URL ?? '').trim().length > 0;
  }
}

/**
 * The OFFERED set — credentials the interactive installer asks for at day-0,
 * with skip as a first-class answer (manifest `critical: true`). It is a
 * convenience, not a requirement: the installer never blocks on one. Preserves
 * manifest order. The `--variables` "set/reset" path and `install.ts` day-0
 * collection both iterate this.
 */
export function criticalVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => spec.critical);
}

/**
 * The NON-critical set — vars NEVER prompted at install and never warned about.
 * Surfaced only in the closing "Next steps — finish later" list (each with its
 * `obtainHint`). Preserves manifest order.
 */
export function nonCriticalVars(): VarSpec[] {
  return VAR_MANIFEST.filter(spec => !spec.critical);
}

/**
 * True if the named var is declared `secret` in the manifest. Unknown names
 * return `false` (the manifest is authoritative; callers should not assume a
 * non-manifest var is sensitive based on this helper).
 */
export function isManifestSecret(name: string): boolean {
  const spec = VAR_MANIFEST.find(s => s.name === name);
  return spec ? spec.secret : false;
}

/**
 * Resolve whether `spec` is required GIVEN the current environment snapshot.
 *
 *   - `required: true`  → always required.
 *   - `required: false` → never required.
 *   - `required: {ifEnv: 'KEY=VALUE'}` → required only when `env[KEY] === VALUE`.
 *
 * A malformed `ifEnv` clause (no `=`) is treated as not-required rather than
 * throwing — `validateVarManifest()` is the place that rejects malformed specs.
 */
export function requiredNow(spec: VarSpec, env: Record<string, string>): boolean {
  if (typeof spec.required === 'boolean') {
    return spec.required;
  }
  const clause = spec.required.ifEnv;
  const eq = clause.indexOf('=');
  if (eq === -1) {
    return false;
  }
  const key = clause.slice(0, eq).trim();
  const expected = clause.slice(eq + 1).trim();
  return (env[key] ?? '') === expected;
}

/**
 * Parse the UNCOMMENTED `KEY=...` keys declared in a `.env.example` file.
 *
 * Lines that are blank, comments (`#`/`*` after optional leading whitespace),
 * or lack a `=` are ignored. Inline trailing comments on a value line do NOT
 * affect the key. Returns keys in file order, de-duplicated.
 */
export function parseDotEnvExampleKeys(envExamplePath: string): string[] {
  const raw = fs.readFileSync(envExamplePath, 'utf8');
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    // Strip an optional `export ` prefix, then take the key.
    const lhs = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[a-z_]\w*$/i.test(lhs)) {
      continue;
    }
    if (!seen.has(lhs)) {
      seen.add(lhs);
      keys.push(lhs);
    }
  }
  return keys;
}

/**
 * Parses a dotenv file into KEY -> VALUE pairs, applying the same line rules as
 * `parseDotEnvExampleKeys` plus value handling: one layer of matching quotes is
 * stripped, and on an UNQUOTED value a trailing `#` comment is removed. Later
 * definitions win, matching how both `bun` and `dotenv` load a file.
 *
 * The comment rule matters in practice: a template line like
 * `SUPABASE_URL=# https://<project-ref>.supabase.co` carries no value at all, and
 * reading the comment as the value would report phantom drift against whatever
 * the process actually holds. A `#` only opens a comment when it starts the value
 * or follows whitespace, so `pass#word` and `https://host/#anchor` survive intact,
 * and a quoted value is never touched.
 *
 * Returns an empty map when the file does not exist — callers decide whether an
 * absent `.env` is a skip (CI) or an error.
 */
export function parseDotEnvPairs(envPath: string): Map<string, string> {
  const pairs = new Map<string, string>();
  if (!fs.existsSync(envPath)) { return pairs; }
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('*')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const lhs = trimmed.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[a-z_]\w*$/i.test(lhs)) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    if (quoted) { value = quoted[2]; }
    else { value = value.replace(/(^|\s)#.*$/, '$1').trim(); }
    pairs.set(lhs, value);
  }
  return pairs;
}

// ----------------------------------------------------------------------------
// Validation (mirrors the spirit of validateComponentRegistry in
// cli/update-boilerplate.ts → updater-core.ts: pure, fails fast on a malformed
// registry before any consumer relies on it).
// ----------------------------------------------------------------------------

const VALID_DESTINATIONS: readonly VarDestination[] = ['local', 'github'];
const ENV_VAR_NAME = /^[A-Z][A-Z0-9_]*$/;

/**
 * Error thrown when the variable manifest is structurally invalid.
 */
export class VarManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VarManifestError';
  }
}

/**
 * Validate `VAR_MANIFEST`. Throws `VarManifestError` on the first problem found:
 *   - duplicate `name`
 *   - empty / malformed `name`
 *   - empty `destinations`, unknown destination, or duplicate destination
 *   - malformed conditional-required clause (`{ ifEnv }` without a `KEY=VALUE`)
 *   - unknown `scope` / `featureGate`; a gate on a project var; a non-core var
 *     that is required (ADR-0005); empty `usedBy`
 *   - empty `note`
 *
 * Pure / no I/O — safe to call at module load or startup so a bad entry fails
 * fast before install/doctor/update consume it.
 */
export function validateVarManifest(manifest: readonly VarSpec[] = VAR_MANIFEST): void {
  const seen = new Set<string>();
  for (const spec of manifest) {
    if (typeof spec.name !== 'string' || !ENV_VAR_NAME.test(spec.name)) {
      throw new VarManifestError(
        `Invalid var name '${String(spec.name)}'. Names must be UPPER_SNAKE_CASE (^[A-Z][A-Z0-9_]*$).`,
      );
    }
    if (seen.has(spec.name)) {
      throw new VarManifestError(`Duplicate var '${spec.name}' in VAR_MANIFEST.`);
    }
    seen.add(spec.name);

    if (!Array.isArray(spec.destinations) || spec.destinations.length === 0) {
      throw new VarManifestError(`Var '${spec.name}' has empty 'destinations'.`);
    }
    const destSeen = new Set<VarDestination>();
    for (const dest of spec.destinations) {
      if (!VALID_DESTINATIONS.includes(dest)) {
        throw new VarManifestError(
          `Var '${spec.name}' has unknown destination '${String(dest)}'. Valid: ${VALID_DESTINATIONS.join(', ')}.`,
        );
      }
      if (destSeen.has(dest)) {
        throw new VarManifestError(`Var '${spec.name}' lists destination '${dest}' more than once.`);
      }
      destSeen.add(dest);
    }

    // A var sourced OUTSIDE `.env` must never also be written INTO it — that
    // would re-create the second copy this whole design exists to remove.
    //
    // Only this direction is enforced. The converse ("env-file source implies a
    // local destination") holds in the DEV sibling but NOT here: this repo has a
    // legitimate CI-only category — AUTO_SYNC, SLACK_WEBHOOK_URL — that lives in
    // GitHub secrets and never in `.env`. Asserting it would reject them.
    if (valueSourceOf(spec) !== 'env-file' && spec.destinations.includes('local')) {
      throw new VarManifestError(
        `Var '${spec.name}' declares valueSource '${valueSourceOf(spec)}' but also targets 'local'. `
        + 'A var sourced outside .env must never be written back into it.',
      );
    }

    if (typeof spec.secret !== 'boolean') {
      throw new VarManifestError(`Var '${spec.name}' has non-boolean 'secret'.`);
    }

    if (typeof spec.required !== 'boolean') {
      if (!spec.required || typeof spec.required !== 'object' || !('ifEnv' in spec.required)) {
        throw new VarManifestError(`Var '${spec.name}' has invalid 'required' (expected boolean | { ifEnv }).`);
      }
      const clause = spec.required.ifEnv;
      if (typeof clause !== 'string' || !clause.includes('=') || clause.indexOf('=') === 0) {
        throw new VarManifestError(
          `Var '${spec.name}' has malformed 'required.ifEnv' (expected 'KEY=VALUE'): '${String(clause)}'.`,
        );
      }
    }

    if (!VAR_SCOPES.includes(spec.scope)) {
      throw new VarManifestError(
        `Var '${spec.name}' has unknown scope '${String(spec.scope)}'. Valid: ${VAR_SCOPES.join(', ')}.`,
      );
    }
    if (spec.featureGate !== undefined && !VAR_FEATURE_GATES.includes(spec.featureGate)) {
      throw new VarManifestError(
        `Var '${spec.name}' has unknown featureGate '${String(spec.featureGate)}'. Valid: ${VAR_FEATURE_GATES.join(', ')}.`,
      );
    }
    // A project variable has no framework switch: the app under test either has
    // the thing or it does not, and the consumer says so by name.
    if (spec.featureGate !== undefined && spec.scope === 'project') {
      throw new VarManifestError(`Var '${spec.name}' is project-scoped and cannot carry a featureGate.`);
    }
    // Only the framework may require anything, and a project credential is
    // validated by the code that reads it, never up front.
    if (spec.scope !== 'core' && spec.required !== false) {
      throw new VarManifestError(`Var '${spec.name}' is ${spec.scope}-scoped and must be 'required: false' (only core vars may be required).`);
    }
    if (spec.scope !== 'core' && spec.schema?.required !== undefined && spec.schema.required !== false) {
      throw new VarManifestError(`Var '${spec.name}' is ${spec.scope}-scoped and cannot be schema-required.`);
    }
    if (typeof spec.usedBy !== 'string' || spec.usedBy.trim() === '') {
      throw new VarManifestError(`Var '${spec.name}' has empty 'usedBy'.`);
    }

    if (typeof spec.critical !== 'boolean') {
      throw new VarManifestError(`Var '${spec.name}' has non-boolean 'critical'.`);
    }
    // NON-critical vars must explain where to get them (the closing next-steps
    // list relies on this). CRITICAL vars are prompted with their own day-0
    // notes, so an obtainHint is optional for them.
    if (!spec.critical && (typeof spec.obtainHint !== 'string' || spec.obtainHint.trim() === '')) {
      throw new VarManifestError(`Non-critical var '${spec.name}' is missing a non-empty 'obtainHint'.`);
    }
    if (spec.obtainHint !== undefined && typeof spec.obtainHint !== 'string') {
      throw new VarManifestError(`Var '${spec.name}' has non-string 'obtainHint'.`);
    }
    if (spec.defaultValue !== undefined && typeof spec.defaultValue !== 'string') {
      throw new VarManifestError(`Var '${spec.name}' has non-string 'defaultValue'.`);
    }

    if (typeof spec.note !== 'string' || spec.note.trim() === '') {
      throw new VarManifestError(`Var '${spec.name}' has empty 'note'.`);
    }

    // Schema hints are optional, but a present one must be well-formed: the
    // generator writes them verbatim into `.env.core.schema`, and varlock
    // reports a malformed decorator against the generated file, one step away
    // from the mistake.
    if (spec.schema !== undefined) {
      if (spec.schema === null || typeof spec.schema !== 'object') {
        throw new VarManifestError(`Var '${spec.name}' has non-object 'schema'.`);
      }
      const { required, type, example, docs, default: dflt } = spec.schema;
      if (required !== undefined && typeof required !== 'boolean') {
        const clause = (required as VarRequiredIfEnv | null)?.ifEnv;
        if (typeof clause !== 'string' || !clause.includes('=') || clause.indexOf('=') === 0) {
          throw new VarManifestError(`Var '${spec.name}' has malformed 'schema.required' (expected boolean | { ifEnv: 'KEY=VALUE' }).`);
        }
      }
      for (const [field, value] of [['type', type], ['example', example], ['docs', docs], ['default', dflt]] as const) {
        if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
          throw new VarManifestError(`Var '${spec.name}' has empty or non-string 'schema.${field}'.`);
        }
      }
      if (docs !== undefined && !/^https?:\/\//.test(docs)) {
        throw new VarManifestError(`Var '${spec.name}' has a 'schema.docs' that is not an http(s) URL.`);
      }
    }
  }
}
