#!/usr/bin/env bun

/**
 * ============================================================================
 * AGENTS SETUP — Interactive CLI to fill / edit `.agents/project.yaml`
 * ============================================================================
 *
 * Walks the user through every variable declared in `.agents/project.yaml`
 * (flat sections + nested `environments:`), prompts for values with helpful
 * descriptions and inline validation, and writes the file back preserving
 * comments, blank lines, section headers and indentation.
 *
 * Companion to:
 *   - `scripts/agents-lint.ts`        (linter for {{VAR}} / <<VAR>> usage)
 *   - `scripts/sync-jira-fields.ts`   (Jira custom-fields catalog)
 *   - `scripts/check-jira-setup.ts`   (manifest vs catalog validator)
 *
 * ============================================================================
 * VARIABLE MODEL (S8)
 * ============================================================================
 *
 * project.yaml has two kinds of variables:
 *
 *   - FLAT vars        — top-level sections (project, backend, frontend,
 *                        database, issue_tracker, testing). Each leaf is a
 *                        single value. Skills reference them as bare
 *                        {{PROJECT_KEY}}, {{JIRA_URL}}, etc.
 *
 *   - ENV-SCOPED vars  — under `environments:`. Each environment (local,
 *                        staging, production, …) owns the same four leaves:
 *                        web_url, api_url, db_mcp, api_mcp. Skills reference
 *                        them either as bare {{WEB_URL}} (resolves against
 *                        the active env at runtime) or explicit
 *                        {{environments.<env>.<var>}} for cross-env contexts.
 *
 * `testing.default_env` is the keystone — it tells the AI which env is
 * "active" when a skill says {{WEB_URL}} without overriding the env. It MUST
 * match a key under `environments:`. The interactive flow re-prompts if it
 * doesn't.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 *   bun run agents:setup                          # interactive (default)
 *   bun run agents:setup --non-interactive        # env-driven, no prompts
 *   bun run agents:setup --dry-run                # print result, do not write
 *   bun run agents:setup --reset                  # set every field back to null
 *   bun run agents:setup --help                   # show help
 *
 * ENV-VAR MAPPING (--non-interactive):
 *
 *   FLAT:
 *     PROJECT_NAME, PROJECT_KEY, WEBAPP_DOMAIN
 *     BACKEND_REPO, BACKEND_STACK, BACKEND_ENTRY
 *     FRONTEND_REPO, FRONTEND_STACK, FRONTEND_ENTRY
 *     DB_TYPE
 *     ISSUE_TRACKER, ISSUE_TRACKER_CLI, JIRA_URL
 *     DEFAULT_ENV, TMS_CLI
 *
 *   ENV-SCOPED — pattern <KEY>_<ENV>, where KEY is the env-scoped leaf and
 *   ENV is the upper-cased environment name. The CLI scans process.env for
 *   any var matching the four scoped keys (WEB_URL, API_URL, DB_MCP, API_MCP)
 *   followed by `_<ENV>` and writes to `environments.<env>.<var>`. Examples:
 *     WEB_URL_LOCAL        -> environments.local.web_url
 *     API_URL_STAGING      -> environments.staging.api_url
 *     DB_MCP_PRODUCTION    -> environments.production.db_mcp
 *     API_MCP_QA           -> environments.qa.api_mcp
 *
 *   If `<ENV>` doesn't exist under `environments:` yet, the CLI creates it.
 *
 * Fields without a corresponding env var keep their current value. Validation
 * is identical to the interactive flow; failures print to stderr and exit 1.
 *
 * ============================================================================
 * EXIT CODES
 * ============================================================================
 *
 *   0  success (file written, dry-run printed, or no-op)
 *   1  user error: missing project.yaml, malformed YAML, validation failure
 *      in --non-interactive mode, or the user aborted with Ctrl+C
 *
 * ============================================================================
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { parse as parseYaml } from 'yaml';

// ============================================================================
// CONSTANTS
// ============================================================================

const REPO_ROOT = join(import.meta.dir, '..');
const PROJECT_YAML_PATH = join(REPO_ROOT, '.agents', 'project.yaml');

/** Default env names offered when none exist yet. */
const DEFAULT_ENVS = ['local', 'staging'];

/** Known choices for env name pickers (offer a sensible list, allow custom). */
const ENV_CHOICES = ['local', 'staging', 'production', 'dev', 'qa', 'uat'];

// ============================================================================
// COLORS / OUTPUT (mirrors scripts/sync-jira-fields.ts)
// ============================================================================

const colors = {
  reset: '\x1B[0m',
  bold: '\x1B[1m',
  dim: '\x1B[2m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  cyan: '\x1B[36m',
};

function out(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function err(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

const log = {
  info: (msg: string) => err(`${colors.blue}i${colors.reset} ${msg}`),
  success: (msg: string) => err(`${colors.green}+${colors.reset} ${msg}`),
  warn: (msg: string) => err(`${colors.yellow}!${colors.reset} ${msg}`),
  error: (msg: string) => err(`${colors.red}x${colors.reset} ${msg}`),
  dim: (msg: string) => err(`${colors.dim}${msg}${colors.reset}`),
  header: (msg: string) => err(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}`),
};

// ============================================================================
// FIELD CATALOG — flat fields, env-scoped leaf keys
// ============================================================================

type ValidatorKind = 'url' | 'project_key' | 'repo_path' | 'env_select' | 'non_empty';

interface FlatFieldSpec {
  section: string
  /** snake_case key in project.yaml. */
  key: string
  /** UPPER_SNAKE_CASE env-var name. */
  envVar: string
  validator: ValidatorKind
}

interface EnvScopedFieldSpec {
  /** snake_case leaf key under each environment. */
  key: string
  /** Pretty short label for prompts. */
  label: string
  validator: ValidatorKind
}

/** Flat fields, in YAML declaration order. NOTE: default_env is filled AFTER environments. */
const FLAT_FIELDS: FlatFieldSpec[] = [
  { section: 'project', key: 'project_name', envVar: 'PROJECT_NAME', validator: 'non_empty' },
  { section: 'project', key: 'project_key', envVar: 'PROJECT_KEY', validator: 'project_key' },
  { section: 'project', key: 'webapp_domain', envVar: 'WEBAPP_DOMAIN', validator: 'non_empty' },

  { section: 'backend', key: 'backend_repo', envVar: 'BACKEND_REPO', validator: 'repo_path' },
  { section: 'backend', key: 'backend_stack', envVar: 'BACKEND_STACK', validator: 'non_empty' },
  { section: 'backend', key: 'backend_entry', envVar: 'BACKEND_ENTRY', validator: 'non_empty' },

  { section: 'frontend', key: 'frontend_repo', envVar: 'FRONTEND_REPO', validator: 'repo_path' },
  { section: 'frontend', key: 'frontend_stack', envVar: 'FRONTEND_STACK', validator: 'non_empty' },
  { section: 'frontend', key: 'frontend_entry', envVar: 'FRONTEND_ENTRY', validator: 'non_empty' },

  { section: 'database', key: 'db_type', envVar: 'DB_TYPE', validator: 'non_empty' },

  { section: 'issue_tracker', key: 'issue_tracker', envVar: 'ISSUE_TRACKER', validator: 'non_empty' },
  { section: 'issue_tracker', key: 'issue_tracker_cli', envVar: 'ISSUE_TRACKER_CLI', validator: 'non_empty' },
  { section: 'issue_tracker', key: 'jira_url', envVar: 'JIRA_URL', validator: 'url' },

  // default_env is special: validated against the live env list at write time.
  { section: 'testing', key: 'default_env', envVar: 'DEFAULT_ENV', validator: 'env_select' },
  { section: 'testing', key: 'tms_cli', envVar: 'TMS_CLI', validator: 'non_empty' },
];

/** The four leaves that exist under EVERY environment. */
const ENV_SCOPED_FIELDS: EnvScopedFieldSpec[] = [
  { key: 'web_url', label: 'Frontend URL', validator: 'url' },
  { key: 'api_url', label: 'API base URL', validator: 'url' },
  { key: 'db_mcp', label: 'DB MCP server name', validator: 'non_empty' },
  { key: 'api_mcp', label: 'API MCP server name', validator: 'non_empty' },
];

// ============================================================================
// CLI / FLAGS
// ============================================================================

interface CliFlags {
  nonInteractive: boolean
  dryRun: boolean
  reset: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    nonInteractive: false,
    dryRun: false,
    reset: false,
    help: false,
  };
  for (const arg of argv) {
    switch (arg) {
      case '--non-interactive':
        flags.nonInteractive = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--reset':
        flags.reset = true;
        break;
      case '--help':
      case '-h':
        flags.help = true;
        break;
      default:
        log.warn(`Unknown flag: ${arg} (ignored)`);
    }
  }
  return flags;
}

function printHelp(): void {
  out(`agents-setup — interactive CLI to fill / edit .agents/project.yaml

USAGE:
  bun run agents:setup [flags]

FLAGS:
  --non-interactive    Read values from environment variables (no prompts).
                       One env var per field — see ENV-VAR MAPPING below.
                       Validates with the same rules as interactive mode.
                       Exits 1 on the first validation failure.
  --dry-run            Compute the final YAML and print it to stdout instead
                       of writing the file. Combine with --non-interactive
                       for scripted previews; combine with no flags for an
                       interactive preview that does not persist.
  --reset              Reset every field back to \`null\` and restore the
                       original \`# TODO:\` prefix on each comment. Asks for
                       confirmation. Useful for re-onboarding.
  --help, -h           Show this help.

VARIABLE MODEL:
  project.yaml has two kinds of variables:

    FLAT       — top-level sections (project, backend, frontend, database,
                 issue_tracker, testing). Skills reference them as bare
                 {{PROJECT_KEY}}, {{JIRA_URL}}, etc.

    ENV-SCOPED — under \`environments:\`. Each environment owns the same four
                 leaves: web_url, api_url, db_mcp, api_mcp. Skills reference
                 them either as bare {{WEB_URL}} (resolves to the active env
                 at runtime) or explicit {{environments.<env>.<var>}}.

  \`testing.default_env\` is the keystone — it picks the active env when a
  skill references {{WEB_URL}} without overriding it. Must match a key under
  \`environments:\`.

INTERACTIVE FLOW (default):
  - Loads .agents/project.yaml and detects which fields are unfilled.
  - Walks every flat field in YAML declaration order, grouped by section.
  - Asks which environments to keep / add / remove (default: local + staging).
  - For each environment, prompts for the four env-scoped vars.
  - Validates that default_env matches a real env (re-prompts if not).
  - For unfilled fields: prompts with the # TODO: description as helper text,
    suggests the example value as a default, and validates input. Empty input
    keeps the field as null (skip).
  - For filled fields: shows current value and asks keep / change / clear.
  - At the end: shows a summary, asks for confirmation, then writes the file
    back preserving every comment, blank line and section header.
  - Ctrl+C aborts cleanly without writing.

ENV-VAR MAPPING (--non-interactive):

  FLAT — one env var per field:
    PROJECT_NAME, PROJECT_KEY, WEBAPP_DOMAIN
    BACKEND_REPO, BACKEND_STACK, BACKEND_ENTRY
    FRONTEND_REPO, FRONTEND_STACK, FRONTEND_ENTRY
    DB_TYPE
    ISSUE_TRACKER, ISSUE_TRACKER_CLI, JIRA_URL
    DEFAULT_ENV, TMS_CLI

  ENV-SCOPED — pattern <KEY>_<ENV>:
    WEB_URL_LOCAL, WEB_URL_STAGING, …       -> environments.<env>.web_url
    API_URL_LOCAL, API_URL_STAGING, …       -> environments.<env>.api_url
    DB_MCP_LOCAL, DB_MCP_STAGING, …         -> environments.<env>.db_mcp
    API_MCP_LOCAL, API_MCP_STAGING, …       -> environments.<env>.api_mcp

  If <ENV> doesn't exist under \`environments:\` yet, the CLI creates it.

VALIDATION RULES:
  *_url, web_url, api_url   non-empty + must contain '.' or be 'localhost'
  project_key               non-empty + uppercase alphanumeric (auto-uppercased)
  *_repo                    non-empty (warns if path does not exist locally)
  default_env               must match a key under \`environments:\`
  all others                non-empty

OUTPUT:
  .agents/project.yaml is rewritten in place. Comments are preserved
  byte-for-byte for untouched fields; the \`# TODO:\` prefix is stripped from
  filled fields' comments (kept on null fields).

EXIT CODES:
  0  success (file written, dry-run printed, or no-op)
  1  user error (missing file, malformed YAML, validation failure, Ctrl+C)
`);
}

// ============================================================================
// LOADING
// ============================================================================

interface LoadedConfig {
  rawText: string
  /** Flat keys in `section.key -> value` form. */
  flatValues: Record<string, string | null>
  /** Per-env values: { local: { web_url: 'http://...', ... }, ... } */
  envValues: Record<string, Record<string, string | null>>
  /** Environment names found in the YAML, in declaration order. */
  envOrder: string[]
}

function loadProjectYaml(): LoadedConfig {
  if (!existsSync(PROJECT_YAML_PATH)) {
    log.error(`.agents/project.yaml not found at ${relative(process.cwd(), PROJECT_YAML_PATH)}`);
    log.dim('Run this command from the repo root, or check that .agents/ exists.');
    process.exit(1);
  }
  const rawText = readFileSync(PROJECT_YAML_PATH, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(rawText);
  }
  catch (e) {
    log.error(`Cannot parse .agents/project.yaml: ${(e as Error).message}`);
    log.dim('Fix the YAML syntax manually before re-running.');
    process.exit(1);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    log.error('.agents/project.yaml must be a YAML mapping at the top level.');
    process.exit(1);
  }
  const root = parsed as Record<string, unknown>;

  const flatValues: Record<string, string | null> = {};
  for (const f of FLAT_FIELDS) {
    const section = root[f.section];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
      flatValues[f.key] = null;
      continue;
    }
    const v = (section as Record<string, unknown>)[f.key];
    flatValues[f.key] = coerceToString(v);
  }

  const envValues: Record<string, Record<string, string | null>> = {};
  const envOrder: string[] = [];
  const environments = root.environments;
  if (environments && typeof environments === 'object' && !Array.isArray(environments)) {
    for (const [envName, envBody] of Object.entries(environments as Record<string, unknown>)) {
      envOrder.push(envName);
      const perEnv: Record<string, string | null> = {};
      if (envBody && typeof envBody === 'object' && !Array.isArray(envBody)) {
        const body = envBody as Record<string, unknown>;
        for (const sf of ENV_SCOPED_FIELDS) {
          perEnv[sf.key] = coerceToString(body[sf.key]);
        }
      }
      else {
        for (const sf of ENV_SCOPED_FIELDS) { perEnv[sf.key] = null; }
      }
      envValues[envName] = perEnv;
    }
  }

  return { rawText, flatValues, envValues, envOrder };
}

function coerceToString(v: unknown): string | null {
  if (v === null || v === undefined) { return null; }
  if (typeof v === 'string') { return v; }
  return String(v);
}

// ============================================================================
// EXAMPLE / DESCRIPTION EXTRACTION — pulls the inline `# TODO:` comment
// ============================================================================

/**
 * Match the value line for a key. If `parentKey` is provided, the match is
 * scoped to lines after the parent key heading (used for env-scoped lookups).
 * Returns `{ description, example }` from the comment or nulls.
 */
function extractCommentMeta(
  rawText: string,
  key: string,
  parentEnv?: string,
): { description: string | null, example: string | null } {
  const lines = rawText.split('\n');
  const lookFor = `${key}:`;
  let inEnvBlock = false;
  let inTargetEnv = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Track entry/exit of environments: section.
    if (/^environments:\s*$/.test(line)) {
      inEnvBlock = true;
      continue;
    }
    if (inEnvBlock) {
      // Top-level (column 0) line breaks out of environments:.
      if (/^[a-z_]/i.test(line)) { inEnvBlock = false; }
      // 2-space-indented child of environments: is an env header.
      const envHeader = line.match(/^ {2}([a-z_][a-z0-9_]*):\s*$/);
      if (envHeader) {
        inTargetEnv = parentEnv === envHeader[1];
        continue;
      }
    }
    // For env-scoped lookup: only consider lines while inside the target env.
    if (parentEnv) {
      if (!(inEnvBlock && inTargetEnv)) { continue; }
    }
    else {
      // For flat lookup: skip the environments: block to avoid name collisions
      // (e.g. a flat var named `web_url` would otherwise match the env-scoped
      //  one — defensive even though we don't currently have that overlap).
      if (inEnvBlock) { continue; }
    }
    if (line.trimStart().startsWith(lookFor)) {
      const m = line.match(/#\s*(?:TODO:\s+)?(\S.*)$/);
      if (!m) { return { description: null, example: null }; }
      const body = m[1].trim();
      const exMatch = body.match(/\(e\.g\.\s*([^)\s][^)]*)\)/);
      const example = exMatch ? exMatch[1].trim() : null;
      const description = body.replace(/\s*\(e\.g\.[^)]+\)/, '').trim() || null;
      return { description, example };
    }
  }
  return { description: null, example: null };
}

// ============================================================================
// VALIDATION
// ============================================================================

interface ValidationOutcome {
  ok: boolean
  /** Cleaned/normalized value. Only meaningful when ok=true. */
  value?: string
  /** Error message when ok=false. */
  error?: string
  /** Optional warning to surface to the user (non-blocking). */
  warning?: string
}

function validateUrl(raw: string): ValidationOutcome {
  const trimmed = raw.trim();
  if (!trimmed) { return { ok: false, error: 'Cannot be empty.' }; }
  // Strip protocol for the dot-or-localhost check.
  const stripped = trimmed.replace(/^https?:\/\//, '');
  const hostPart = stripped.split(/[/:?#]/)[0];
  if (hostPart === 'localhost' || stripped.startsWith('localhost')) {
    return { ok: true, value: trimmed };
  }
  if (!stripped.includes('.')) {
    return { ok: false, error: 'Must be a hostname with a dot (e.g. staging.example.com) or localhost.' };
  }
  return { ok: true, value: trimmed };
}

function validateProjectKey(raw: string): ValidationOutcome {
  const trimmed = raw.trim();
  if (!trimmed) { return { ok: false, error: 'Cannot be empty.' }; }
  if (!/^[A-Z0-9]+$/i.test(trimmed)) {
    return { ok: false, error: 'Must be alphanumeric (no spaces, dashes or underscores).' };
  }
  if (trimmed !== trimmed.toUpperCase()) {
    return {
      ok: true,
      value: trimmed.toUpperCase(),
      warning: `Project keys are conventionally uppercase. Auto-uppercased to '${trimmed.toUpperCase()}'.`,
    };
  }
  return { ok: true, value: trimmed };
}

function validateRepoPath(raw: string): ValidationOutcome {
  const trimmed = raw.trim();
  if (!trimmed) { return { ok: false, error: 'Cannot be empty.' }; }
  const candidate = resolve(REPO_ROOT, trimmed);
  if (!existsSync(candidate)) {
    return {
      ok: true,
      value: trimmed,
      warning: 'Path does not exist locally — that\'s fine if you\'ll clone it later.',
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * default_env validator depends on the live env list. We can't validate it
 * standalone — caller must use validateDefaultEnv with the resolved list.
 * For interactive input via `select`, the choice list is already constrained.
 */
function validateDefaultEnv(raw: string, knownEnvs: string[]): ValidationOutcome {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) { return { ok: false, error: 'Cannot be empty.' }; }
  if (!knownEnvs.includes(trimmed)) {
    return { ok: false, error: `Must be one of: ${knownEnvs.join(', ') || '(no envs defined)'}.` };
  }
  return { ok: true, value: trimmed };
}

function validateNonEmpty(raw: string): ValidationOutcome {
  const trimmed = raw.trim();
  if (!trimmed) { return { ok: false, error: 'Cannot be empty.' }; }
  return { ok: true, value: trimmed };
}

function validateField(validator: ValidatorKind, raw: string, knownEnvs: string[] = []): ValidationOutcome {
  switch (validator) {
    case 'url': return validateUrl(raw);
    case 'project_key': return validateProjectKey(raw);
    case 'repo_path': return validateRepoPath(raw);
    case 'env_select': return validateDefaultEnv(raw, knownEnvs);
    case 'non_empty': return validateNonEmpty(raw);
  }
}

// ============================================================================
// INTERACTIVE PROMPTS — flat fields
// ============================================================================

async function promptFlatField(
  field: FlatFieldSpec,
  rawText: string,
  currentValue: string | null,
  knownEnvs: string[],
): Promise<string | null> {
  const { description, example } = extractCommentMeta(rawText, field.key);
  const desc = description ?? `Value for ${field.key}`;

  if (field.validator === 'env_select') {
    if (knownEnvs.length === 0) {
      log.warn('No environments defined — skipping default_env. Define environments first.');
      return null;
    }
    const choice = await select({
      message: `${field.section}.${field.key} — ${desc}`,
      choices: knownEnvs.map(c => ({ value: c, name: c })),
      default: (currentValue && knownEnvs.includes(currentValue)) ? currentValue : knownEnvs[0],
    });
    return choice;
  }

  while (true) {
    const answer = await input({
      message: `${field.section}.${field.key} — ${desc}`,
      default: currentValue ?? example ?? undefined,
    });
    if (!answer.trim()) {
      log.dim('  (skipped — kept as null)');
      return null;
    }
    const result = validateField(field.validator, answer, knownEnvs);
    if (!result.ok) {
      log.error(`  ${result.error}`);
      continue;
    }
    if (result.warning) {
      log.warn(`  ${result.warning}`);
    }
    return result.value!;
  }
}

type EditAction = 'keep' | 'change' | 'clear';

async function promptEditAction(
  label: string,
  currentValue: string,
): Promise<EditAction> {
  const action = await select<EditAction>({
    message: `${label} = ${truncate(currentValue, 50)}`,
    choices: [
      { value: 'keep', name: 'keep current value' },
      { value: 'change', name: 'change to a new value' },
      { value: 'clear', name: 'clear (set to null)' },
    ],
    default: 'keep',
  });
  return action;
}

// ============================================================================
// INTERACTIVE PROMPTS — env-scoped fields
// ============================================================================

async function promptEnvScopedField(
  envName: string,
  field: EnvScopedFieldSpec,
  rawText: string,
  currentValue: string | null,
): Promise<string | null> {
  const { description, example } = extractCommentMeta(rawText, field.key, envName);
  const desc = description ?? `${field.label} for ${envName}`;

  while (true) {
    const answer = await input({
      message: `environments.${envName}.${field.key} — ${desc}`,
      default: currentValue ?? example ?? undefined,
    });
    if (!answer.trim()) {
      log.dim('  (skipped — kept as null)');
      return null;
    }
    const result = validateField(field.validator, answer);
    if (!result.ok) {
      log.error(`  ${result.error}`);
      continue;
    }
    if (result.warning) { log.warn(`  ${result.warning}`); }
    return result.value!;
  }
}

/**
 * Ask the user for the env list. Returns the new ordered env list.
 * Allows freeform input ("local, staging, production") OR a select-and-confirm
 * shortcut for the default pair.
 */
async function promptEnvList(currentEnvs: string[]): Promise<string[]> {
  log.header('[environments]');
  const currentSummary = currentEnvs.length ? currentEnvs.join(', ') : '(none yet)';
  log.dim(`Current: ${currentSummary}`);
  const useDefault = await confirm({
    message: `Use default environments (${DEFAULT_ENVS.join(' + ')})?`,
    default: currentEnvs.length === 0 || sameSet(currentEnvs, DEFAULT_ENVS),
  });
  if (useDefault) { return [...DEFAULT_ENVS]; }

  while (true) {
    const raw = await input({
      message: 'Comma-separated env names (e.g. local,staging,production)',
      default: currentEnvs.length ? currentEnvs.join(', ') : DEFAULT_ENVS.join(', '),
    });
    const parsed = raw.split(',').map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase());
    if (parsed.length === 0) {
      log.error('  At least one environment is required.');
      continue;
    }
    // Validate names: lowercase letters, digits, underscore.
    const bad = parsed.filter(s => !/^[a-z_][a-z0-9_]*$/.test(s));
    if (bad.length > 0) {
      log.error(`  Invalid env name(s): ${bad.join(', ')}. Use lowercase letters, digits, underscore.`);
      continue;
    }
    // Dedupe preserving order.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const e of parsed) {
      if (!seen.has(e)) {
        seen.add(e);
        ordered.push(e);
      }
    }
    if (!ordered.every(e => ENV_CHOICES.includes(e))) {
      const unknown = ordered.filter(e => !ENV_CHOICES.includes(e));
      log.warn(`  Unknown env name(s): ${unknown.join(', ')}. Accepting them anyway.`);
    }
    return ordered;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) { return false; }
  const setA = new Set(a);
  return b.every(x => setA.has(x));
}

// ============================================================================
// SUMMARY HELPERS
// ============================================================================

function truncate(s: string, max: number): string {
  if (s.length <= max) { return s; }
  return `${s.slice(0, max - 1)}…`;
}

function printSummary(
  flat: Record<string, string | null>,
  envOrder: string[],
  envValues: Record<string, Record<string, string | null>>,
): void {
  log.header('Final values');
  let currentSection = '';
  for (const f of FLAT_FIELDS) {
    if (f.section !== currentSection) {
      currentSection = f.section;
      err(`  ${colors.bold}[${f.section}]${colors.reset}`);
    }
    const v = flat[f.key];
    const display = v === null
      ? `${colors.dim}null${colors.reset}`
      : truncate(v, 60);
    err(`    ${f.key} = ${display}`);
  }
  err(`  ${colors.bold}[environments]${colors.reset}`);
  for (const envName of envOrder) {
    err(`    ${colors.bold}${envName}:${colors.reset}`);
    const perEnv = envValues[envName] ?? {};
    for (const sf of ENV_SCOPED_FIELDS) {
      const v = perEnv[sf.key];
      const display = v === null || v === undefined
        ? `${colors.dim}null${colors.reset}`
        : truncate(v, 60);
      err(`      ${sf.key} = ${display}`);
    }
  }
}

// ============================================================================
// YAML WRITE-BACK — line-edit strategy with parent-context tracking
// ============================================================================

/**
 * Quote a YAML string only when needed.
 */
function formatYamlValue(v: string): string {
  const needsQuote = (
    v === ''
    || /^(?:null|Null|NULL|~|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/.test(v)
    || /^-?\d/.test(v)
    || /[:#&*!|>'"%@`]/.test(v)
    || /^\s/.test(v) || /\s$/.test(v)
  );
  if (needsQuote) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return v;
}

/**
 * Targets we want to update. Key is a "path" string:
 *   - flat:       "<section>.<key>"            e.g. "project.project_name"
 *   - env-scoped: "environments.<env>.<key>"   e.g. "environments.local.web_url"
 */
type UpdateMap = Map<string, string | null>;

function buildUpdateMap(
  flat: Record<string, string | null>,
  envValues: Record<string, Record<string, string | null>>,
): UpdateMap {
  const m: UpdateMap = new Map();
  for (const f of FLAT_FIELDS) {
    m.set(`${f.section}.${f.key}`, flat[f.key] ?? null);
  }
  for (const [envName, perEnv] of Object.entries(envValues)) {
    for (const sf of ENV_SCOPED_FIELDS) {
      m.set(`environments.${envName}.${sf.key}`, perEnv[sf.key] ?? null);
    }
  }
  return m;
}

/**
 * Walk the YAML lines maintaining a stack of (indentLevel, name). For each
 * leaf-key line, compute its full dotted path, look up the new value in
 * `updates`, and rewrite the line with that scalar — preserving the comment
 * column when possible.
 *
 * Sections we add (new envs / new env-leaves) are appended at end-of-block;
 * sections we remove (deleted envs) have their lines stripped.
 */
function renderUpdatedYaml(
  rawText: string,
  desiredEnvOrder: string[],
  updates: UpdateMap,
): string {
  const inputLines = rawText.split('\n');
  const outLines: string[] = [];

  // We'll do a 2-pass approach:
  //   Pass 1: walk the existing file. For lines belonging to an env that the
  //   user kept, rewrite. For lines belonging to an env the user removed,
  //   skip them. For new envs, we'll insert blocks at the end of the
  //   `environments:` section.
  //   Pass 2: append blocks for envs in `desiredEnvOrder` that didn't exist.

  const desiredEnvSet = new Set(desiredEnvOrder);

  // Track indent level per nesting depth via a simple stack of names.
  // For our schema:
  //   depth 0 = top-level section names (no indent)
  //   depth 1 = leaf keys inside flat sections OR env names inside `environments:`
  //   depth 2 = leaf keys inside an environment
  let topSection: string | null = null;
  let currentEnv: string | null = null; // null when not inside `environments:`
  const knownExistingEnvs = new Set<string>();
  let inEnvBlock = false; // are we inside the `environments:` mapping?
  // Track where the `environments:` block ends so we know where to append new envs.
  let environmentsEndIndex: number | null = null; // index into outLines

  for (let i = 0; i < inputLines.length; i++) {
    const line = inputLines[i];

    // Detect top-level section header (no leading whitespace, ends with `:`).
    const topHeader = line.match(/^([a-z_][a-z0-9_]*):\s*(?:#.*)?$/);
    if (topHeader) {
      // Closing the previous `environments:` block (if any) — record end.
      if (inEnvBlock && environmentsEndIndex === null) {
        environmentsEndIndex = outLines.length; // current insertion point
      }
      topSection = topHeader[1];
      inEnvBlock = topSection === 'environments';
      currentEnv = null;
      outLines.push(line);
      continue;
    }

    // Inside `environments:` block.
    if (inEnvBlock) {
      // Env header: 2-space indent + name + colon.
      const envHeader = line.match(/^ {2}([a-z_][a-z0-9_]*):\s*(?:#.*)?$/);
      if (envHeader) {
        currentEnv = envHeader[1];
        knownExistingEnvs.add(currentEnv);
        if (!desiredEnvSet.has(currentEnv)) {
          // User removed this env — drop the header line and skip its body.
          // Skip-mode: advance i until we hit a sibling (2-space) or section.
          let j = i + 1;
          while (j < inputLines.length) {
            const next = inputLines[j];
            if (next.match(/^[a-z_][a-z0-9_]*:/)) { break; } // new top-level section
            if (next.match(/^ {2}[a-z_][a-z0-9_]*:\s*(?:#.*)?$/)) { break; } // sibling env
            j++;
          }
          i = j - 1; // outer for-loop will i++; we want the loop to land on j
          currentEnv = null;
          continue;
        }
        outLines.push(line);
        continue;
      }

      // Leaf inside an env (4-space indent).
      if (currentEnv && desiredEnvSet.has(currentEnv)) {
        const leaf = line.match(/^ {4}([a-z_][a-z0-9_]*):/);
        if (leaf) {
          const path = `environments.${currentEnv}.${leaf[1]}`;
          if (updates.has(path)) {
            outLines.push(rewriteLeafLine(line, updates.get(path)!));
            continue;
          }
        }
      }
      outLines.push(line);
      continue;
    }

    // Not in environments block: flat-section leaf line OR comment/blank.
    const leaf = line.match(/^ {2,}([a-z_][a-z0-9_]*):/);
    if (leaf && topSection) {
      const path = `${topSection}.${leaf[1]}`;
      if (updates.has(path)) {
        outLines.push(rewriteLeafLine(line, updates.get(path)!));
        continue;
      }
    }
    outLines.push(line);
  }

  // If `environments:` was never closed by another top-level section, the
  // trailing blank lines from the file are at the end; append point is just
  // before those trailing blanks.
  if (inEnvBlock && environmentsEndIndex === null) {
    environmentsEndIndex = outLines.length;
    // Move back over trailing blank lines so we insert before them.
    while (
      environmentsEndIndex > 0
      && outLines[environmentsEndIndex - 1].trim() === ''
    ) {
      environmentsEndIndex--;
    }
  }

  // Identify envs the user wants that don't exist in the file → append.
  const newEnvs = desiredEnvOrder.filter(e => !knownExistingEnvs.has(e));
  if (newEnvs.length > 0 && environmentsEndIndex !== null) {
    const inserts: string[] = [];
    for (const envName of newEnvs) {
      inserts.push(`  ${envName}:`);
      for (const sf of ENV_SCOPED_FIELDS) {
        const path = `environments.${envName}.${sf.key}`;
        const val = updates.get(path) ?? null;
        const scalar = val === null ? 'null' : formatYamlValue(val);
        // Comment shape mirrors the existing local/staging blocks: filled
        // values use `# <description>`, null values use `# TODO: <description>`.
        const comment = renderCommentForEnvLeaf(envName, sf, val !== null);
        inserts.push(`    ${sf.key}: ${scalar}${comment ? `              ${comment}` : ''}`);
      }
    }
    outLines.splice(environmentsEndIndex, 0, ...inserts);
  }

  // Stripping envs may leave back-to-back blank lines — collapse to max one.
  return collapseBlankRuns(outLines.join('\n'));
}

function collapseBlankRuns(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

function renderCommentForEnvLeaf(envName: string, sf: EnvScopedFieldSpec, filled: boolean): string {
  const descriptions: Record<string, string> = {
    web_url: `Frontend URL for ${envName} env (e.g. https://example.com)`,
    api_url: `API base URL for ${envName} env (e.g. https://api.example.com)`,
    db_mcp: `MCP server name for ${envName} DB (e.g. myproject-${envName}-db)`,
    api_mcp: `MCP server name for ${envName} API (e.g. myproject-${envName}-api)`,
  };
  const desc = descriptions[sf.key];
  if (!desc) { return ''; }
  return filled ? `# ${desc}` : `# TODO: ${desc}`;
}

/**
 * Rewrite a leaf line with a new scalar. Preserves indent, key, separator,
 * and the column at which the comment starts (when present); strips/restores
 * the `# TODO: ` prefix based on whether the new value is non-null.
 */
function rewriteLeafLine(line: string, newVal: string | null): string {
  // Match the head of the line (indent + key + colon + leading separator).
  // The value and trailing comment are extracted in a separate pass to avoid
  // super-linear backtracking between adjacent `\s*` / `[^#\n]*?` quantifiers.
  const head = line.match(/^(\s+)([a-z_][a-z0-9_]*):(\s*)/);
  if (!head) { return line; }
  const [headMatch, indent, key, sep] = head;

  // Split the remainder into "value region" and "trailing comment". A `#`
  // inside the value region would only matter if it lives inside quotes;
  // for our YAML schema (scalars like null / urls / words / quoted strings)
  // the simple "first un-quoted #" heuristic is enough.
  const rest = line.slice(headMatch.length);
  const commentIdx = findCommentStart(rest);
  const valueRegion = commentIdx === -1 ? rest : rest.slice(0, commentIdx);
  const comment = commentIdx === -1 ? undefined : rest.slice(commentIdx);

  // Trailing whitespace in the value region is preserved separately so the
  // no-comment path keeps the original spacing.
  const trailingWsMatch = valueRegion.match(/\s*$/);
  const trailingWs = trailingWsMatch ? trailingWsMatch[0] : '';

  const newScalar = newVal === null ? 'null' : formatYamlValue(newVal);

  let newComment = comment ?? '';
  if (newComment) {
    const cm = newComment.match(/^#\s*(?:TODO:\s+)?(\S.*)$/);
    const body = cm ? cm[1] : newComment.replace(/^#\s*/, '');
    newComment = newVal === null ? `# TODO: ${body}` : `# ${body}`;
  }

  const prefix = `${indent}${key}:${sep}${newScalar}`;
  if (newComment) {
    const origCommentIdx = line.indexOf(comment!);
    const targetCol = origCommentIdx >= 0 ? origCommentIdx : prefix.length + 1;
    const padCount = Math.max(1, targetCol - prefix.length);
    return `${prefix}${' '.repeat(padCount)}${newComment}`;
  }
  return `${prefix}${trailingWs}`;
}

/**
 * Locate the first `#` that starts a YAML line comment, ignoring `#` inside
 * single- or double-quoted scalars. Returns the index in `rest`, or -1.
 */
function findCommentStart(rest: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (inSingle) {
      if (ch === '\'') { inSingle = false; }
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') { inDouble = false; }
      continue;
    }
    if (ch === '\'') { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '#') { return i; }
  }
  return -1;
}

// ============================================================================
// FLOW: INTERACTIVE
// ============================================================================

async function runInteractive(loaded: LoadedConfig, dryRun: boolean): Promise<void> {
  log.header('agents-setup — interactive mode');

  // Step 1: walk flat fields except default_env (deferred to end).
  const newFlat: Record<string, string | null> = { ...loaded.flatValues };
  let currentSection = '';
  for (const field of FLAT_FIELDS) {
    if (field.key === 'default_env') { continue; } // deferred
    if (field.section !== currentSection) {
      currentSection = field.section;
      log.header(`[${field.section}]`);
    }
    const current = newFlat[field.key];
    if (current === null) {
      const next = await promptFlatField(field, loaded.rawText, null, []);
      newFlat[field.key] = next;
    }
    else {
      const action = await promptEditAction(`${field.section}.${field.key}`, current);
      if (action === 'keep') { continue; }
      if (action === 'clear') {
        newFlat[field.key] = null;
        continue;
      }
      const next = await promptFlatField(field, loaded.rawText, current, []);
      newFlat[field.key] = next;
    }
  }

  // Step 2: prompt for environments.
  const desiredEnvs = await promptEnvList(loaded.envOrder);

  // Step 3: per env, prompt for the four leaves.
  const newEnvValues: Record<string, Record<string, string | null>> = {};
  for (const envName of desiredEnvs) {
    log.header(`[environments.${envName}]`);
    const existing = loaded.envValues[envName] ?? {};
    const perEnv: Record<string, string | null> = {};
    for (const sf of ENV_SCOPED_FIELDS) {
      const cur = existing[sf.key] ?? null;
      if (cur === null) {
        perEnv[sf.key] = await promptEnvScopedField(envName, sf, loaded.rawText, null);
      }
      else {
        const action = await promptEditAction(`environments.${envName}.${sf.key}`, cur);
        if (action === 'keep') {
          perEnv[sf.key] = cur;
        }
        else if (action === 'clear') {
          perEnv[sf.key] = null;
        }
        else {
          perEnv[sf.key] = await promptEnvScopedField(envName, sf, loaded.rawText, cur);
        }
      }
    }
    newEnvValues[envName] = perEnv;
  }

  // Step 4: prompt for default_env now that env list is known.
  log.header('[testing]');
  const defaultField = FLAT_FIELDS.find(f => f.key === 'default_env')!;
  const currentDefault = newFlat.default_env;
  if (currentDefault === null || !desiredEnvs.includes(currentDefault)) {
    if (currentDefault !== null && !desiredEnvs.includes(currentDefault)) {
      log.warn(`Current default_env '${currentDefault}' is not in the env list — re-prompting.`);
    }
    newFlat.default_env = await promptFlatField(defaultField, loaded.rawText, null, desiredEnvs);
  }
  else {
    const action = await promptEditAction('testing.default_env', currentDefault);
    if (action === 'keep') {
      // ok
    }
    else if (action === 'clear') {
      newFlat.default_env = null;
    }
    else {
      newFlat.default_env = await promptFlatField(defaultField, loaded.rawText, currentDefault, desiredEnvs);
    }
  }

  printSummary(newFlat, desiredEnvs, newEnvValues);

  const proceed = await confirm({
    message: dryRun ? 'Print the resulting YAML to stdout?' : 'Save changes to .agents/project.yaml?',
    default: true,
  });

  if (!proceed) {
    log.warn('Cancelled. No changes saved.');
    process.exit(0);
  }

  const updates = buildUpdateMap(newFlat, newEnvValues);
  const updated = renderUpdatedYaml(loaded.rawText, desiredEnvs, updates);
  if (dryRun) {
    out(updated);
    log.success('Dry run complete — file NOT written.');
    return;
  }
  writeFileSync(PROJECT_YAML_PATH, updated, 'utf8');
  log.success(`Wrote ${relative(process.cwd(), PROJECT_YAML_PATH)}.`);
}

// ============================================================================
// FLOW: NON-INTERACTIVE
// ============================================================================

function runNonInteractive(loaded: LoadedConfig, dryRun: boolean): void {
  log.header('agents-setup — non-interactive mode');
  const newFlat: Record<string, string | null> = { ...loaded.flatValues };
  const newEnvValues: Record<string, Record<string, string | null>> = {};
  // Seed with existing envs.
  for (const e of loaded.envOrder) { newEnvValues[e] = { ...loaded.envValues[e] }; }

  let envWrites = 0;

  // Flat field env vars.
  for (const field of FLAT_FIELDS) {
    if (field.key === 'default_env') { continue; } // handled below
    const envValue = process.env[field.envVar];
    if (envValue === undefined) { continue; }
    const result = validateField(field.validator, envValue);
    if (!result.ok) {
      log.error(`${field.envVar}=${JSON.stringify(envValue)} — ${result.error}`);
      process.exit(1);
    }
    if (result.warning) { log.warn(`${field.envVar}: ${result.warning}`); }
    newFlat[field.key] = result.value!;
    envWrites++;
  }

  // Env-scoped: pattern <KEY>_<ENV> for each known scoped key.
  for (const sf of ENV_SCOPED_FIELDS) {
    const upperKey = sf.key.toUpperCase();
    for (const [varName, varVal] of Object.entries(process.env)) {
      if (!varName.startsWith(`${upperKey}_`)) { continue; }
      const envName = varName.slice(upperKey.length + 1).toLowerCase();
      if (!/^[a-z_][a-z0-9_]*$/.test(envName)) { continue; }
      if (varVal === undefined) { continue; }
      const result = validateField(sf.validator, varVal);
      if (!result.ok) {
        log.error(`${varName}=${JSON.stringify(varVal)} — ${result.error}`);
        process.exit(1);
      }
      if (result.warning) { log.warn(`${varName}: ${result.warning}`); }
      if (!newEnvValues[envName]) {
        newEnvValues[envName] = {};
        for (const s of ENV_SCOPED_FIELDS) { newEnvValues[envName][s.key] = null; }
      }
      newEnvValues[envName][sf.key] = result.value!;
      envWrites++;
    }
  }

  // default_env (now that env list is finalized).
  const desiredEnvs = Object.keys(newEnvValues).length > 0
    ? Object.keys(newEnvValues)
    : loaded.envOrder;
  const defaultEnvVal = process.env.DEFAULT_ENV;
  if (defaultEnvVal !== undefined) {
    const r = validateDefaultEnv(defaultEnvVal, desiredEnvs);
    if (!r.ok) {
      log.error(`DEFAULT_ENV=${JSON.stringify(defaultEnvVal)} — ${r.error}`);
      process.exit(1);
    }
    newFlat.default_env = r.value!;
    envWrites++;
  }

  if (envWrites === 0) {
    log.info('No matching environment variables set — file unchanged.');
    if (!dryRun) { return; }
  }
  else {
    log.info(`${envWrites} field(s) updated from environment variables.`);
  }

  const updates = buildUpdateMap(newFlat, newEnvValues);
  const updated = renderUpdatedYaml(loaded.rawText, desiredEnvs, updates);
  if (dryRun) {
    out(updated);
    log.success('Dry run complete — file NOT written.');
    return;
  }
  if (envWrites === 0) { return; }
  writeFileSync(PROJECT_YAML_PATH, updated, 'utf8');
  log.success(`Wrote ${relative(process.cwd(), PROJECT_YAML_PATH)}.`);
}

// ============================================================================
// FLOW: RESET
// ============================================================================

async function runReset(loaded: LoadedConfig): Promise<void> {
  log.header('agents-setup — reset mode');
  log.warn('This will set every field in .agents/project.yaml back to null and restore # TODO: comments.');

  const proceed = await confirm({
    message: 'Reset all values to null?',
    default: false,
  });

  if (!proceed) {
    log.info('Cancelled. No changes saved.');
    process.exit(0);
  }

  const blankFlat: Record<string, string | null> = {};
  for (const f of FLAT_FIELDS) { blankFlat[f.key] = null; }
  const blankEnvs: Record<string, Record<string, string | null>> = {};
  for (const envName of loaded.envOrder) {
    const perEnv: Record<string, string | null> = {};
    for (const sf of ENV_SCOPED_FIELDS) { perEnv[sf.key] = null; }
    blankEnvs[envName] = perEnv;
  }

  const updates = buildUpdateMap(blankFlat, blankEnvs);
  const updated = renderUpdatedYaml(loaded.rawText, loaded.envOrder, updates);
  writeFileSync(PROJECT_YAML_PATH, updated, 'utf8');
  log.success(
    `Reset ${relative(process.cwd(), PROJECT_YAML_PATH)} — `
    + `${FLAT_FIELDS.length} flat + ${ENV_SCOPED_FIELDS.length * loaded.envOrder.length} env-scoped fields are null.`,
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  process.on('SIGINT', () => {
    err('');
    log.warn('Cancelled. No changes saved.');
    process.exit(1);
  });

  const loaded = loadProjectYaml();

  if (flags.reset) {
    try {
      await runReset(loaded);
    }
    catch (e) {
      if (isAbortError(e)) {
        log.warn('Cancelled. No changes saved.');
        process.exit(1);
      }
      throw e;
    }
    return;
  }

  if (flags.nonInteractive) {
    runNonInteractive(loaded, flags.dryRun);
    return;
  }

  try {
    await runInteractive(loaded, flags.dryRun);
  }
  catch (e) {
    if (isAbortError(e)) {
      log.warn('Cancelled. No changes saved.');
      process.exit(1);
    }
    throw e;
  }
}

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') { return false; }
  const name = (e as { name?: string }).name;
  const msg = (e as { message?: string }).message ?? '';
  return name === 'ExitPromptError' || /User force closed|prompt was canceled/i.test(msg);
}

main().catch((e) => {
  log.error(`Unexpected error: ${(e as Error).message}`);
  if (process.env.DEBUG) {
    err(String((e as Error).stack ?? e));
  }
  process.exit(1);
});
