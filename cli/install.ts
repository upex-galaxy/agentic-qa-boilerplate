#!/usr/bin/env bun
/**
 * Project installer for agentic-qa-boilerplate.
 *
 * Drives the end-to-end onboarding for a freshly-cloned QA boilerplate across
 * 5 named phases:
 *
 *   PHASE 1 — DETECTION
 *     1-repo-verify     Verify repo root (package.json name / installer.lock.json)
 *     2-gentle-ai-detect  Detect gentle-ai (presence + version)
 *     3-gentle-ai-install gentle-ai install / skip decision
 *     4-agent-detect    Detect agents (Claude Code / OpenCode) and prompt selection
 *
 *   PHASE 2 — INSTALLATION
 *     5-deps-install    Install dependencies (`bun install`)
 *     6-playwright      Install Playwright browsers (`bun run pw:install`)
 *     8-skills-gentle-ai Install engram via gentle-ai minimal preset (or skip)
 *     9-skills-community Install community skills via `bunx skills add`
 *
 *   PHASE 3 — CONFIGURATION
 *     10-mcp-env        Wire `.env` for MCP servers + offer direnv autoload
 *     13-github-repo    GitHub repository (optional)
 *
 *   PHASE 4 — VERIFICATION
 *     11-verify-clis    Verify external CLIs (bun, gh, acli, playwright-cli, resend, jq)
 *     14-state-write    Persist `.template/installer.state.json`
 *
 *   PHASE 5 — INITIAL CONFIGURATION
 *     7-agents-setup    Run agents:setup (.agents/project.yaml populator)
 *     12.4-acli-auth    Atlassian credentials + acli session login
 *     13-jira-sync-fields  Jira auth loop + `bun run jira:sync-fields`
 *     13b-jira-sync-workflows  `bun run jira:sync-workflows`
 *     14-jira-check     `bun run jira:check`
 *
 * Idempotency: each step writes an ISO timestamp to state.steps[<key>] on success.
 * Re-runs skip completed steps unless overridden via:
 *   INSTALL_FORCE_ALL=1                  Clear all step timestamps before running
 *   INSTALL_FORCE_<STEP_KEY>=1           Clear one step (e.g. INSTALL_FORCE_5_DEPS_INSTALL=1)
 *   --force (CLI flag)                   Same as INSTALL_FORCE_ALL=1
 *   --force-step <key> (CLI flag)        Same as INSTALL_FORCE_<key>=1
 *   --validate-skills (CLI flag)         Smoke-test mode: probe skills.sh, no install
 *
 * Usage:
 *   bun run setup
 *   bun run setup --non-interactive
 *   bun run setup --force
 *   bun run setup --force-step 5-deps-install
 *   bun run setup --validate-skills
 *
 * Non-interactive env vars:
 *   INSTALL_AGENTS=claude-code,opencode   Comma-list of agents to configure
 *   INSTALL_SKIP_GENTLE_AI=1              Treat gentle-ai as skipped
 *   INSTALL_SKIP_DEPS=1                   Skip `bun install`
 *   INSTALL_SKIP_PLAYWRIGHT=1             Skip `bun run pw:install`
 *   INSTALL_SKIP_AGENTS_SETUP=1           Skip `bun run agents:setup`
 *   INSTALL_FORCE_AGENTS_SETUP=1          Re-run agents:setup even if state shows it ran
 *   INSTALL_FORCE_GENTLE_AI=1             Re-run gentle-ai engram install even if state shows it ran
 *   INSTALL_FORCE_COMMUNITY=1             Re-run community skill install even if state shows it ran
 *   INSTALL_FORCE_GITHUB=1                Re-run GitHub remote setup even if a remote is already wired
 *   INSTALL_SKIP_COMMUNITY=1              Skip `bunx skills add` step
 *   INSTALL_SKIP_JIRA=1                   Skip optional Jira bootstrap
 *   INSTALL_SKIP_API=1                    Skip optional API auth bootstrap
 *   INSTALL_SKIP_DIRENV=1                 Skip direnv autoload setup
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { checkbox, password } from '@inquirer/prompts';
import * as tui from './lib/tui.ts';
import { runVariablesFlow } from './lib/variables-flow.ts';
import { criticalVars, nonCriticalVars, varsFor } from './lib/variables-manifest.ts';

// ============================================================================
// Types
// ============================================================================

type AgentId = 'claude-code' | 'opencode';

type InstallStatus = 'installed' | 'skipped' | 'failed';

type McpStatus = 'configured-with-key' | 'configured-no-key' | 'placeholder' | 'skipped-by-user';

type CliStatus = 'found' | 'missing';

interface GentleAiInfo {
  found: boolean
  version?: string
  compatible?: boolean
  status: 'installed' | 'missing' | 'skipped' | 'incompatible'
}

interface AgentDetection {
  claudeCode: boolean
  opencode: boolean
}

interface OptionalBootstrapStatus {
  ran: boolean
  ok?: boolean
}

interface GithubRemoteInfo {
  account: string
  repo: string
  visibility: 'private' | 'public' | 'internal' | 'unknown'
  url: string
  createdAt: string
}

interface InstallState {
  version: 1
  installedAt: string
  agents: AgentId[]
  gentleAi: {
    status: GentleAiInfo['status']
    version?: string
    checkedAt: string
  }
  /**
   * Legacy step fields kept for forward-compat when reading older state files.
   * New idempotency logic uses steps: Record<string, string> below.
   */
  legacySteps?: {
    depsInstalled?: boolean
    playwrightInstalled?: boolean
    agentsSetupRanAt?: string
    gentleAiInstalledAt?: string
    communitySkillsInstalledAt?: string
    githubRemoteWiredAt?: string
    jiraBootstrap?: OptionalBootstrapStatus
    apiBootstrap?: OptionalBootstrapStatus
  }
  /**
   * Step-level idempotency: each key is a step name (e.g. "5-deps-install"),
   * each value is the ISO timestamp of the last successful completion.
   * Re-runs skip a step when its key is present unless INSTALL_FORCE_* overrides.
   */
  steps: Record<string, string>
  skills: Record<string, InstallStatus>
  mcps: Record<string, McpStatus>
  externalClis: Record<string, CliStatus>
  pendingEnvVars: string[]
  github?: GithubRemoteInfo
  postInstall: {
    agentsSetup: 'pending' | 'completed' | 'skipped-non-interactive' | 'failed'
    acliAuth: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-binary' | 'skipped-no-auth' | 'failed'
    jiraSyncFields: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-auth' | 'skipped-no-admin' | 'failed'
    jiraSyncWorkflows: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-no-auth' | 'skipped-no-admin' | 'failed'
    jiraCheck: 'pending' | 'completed' | 'skipped-non-interactive' | 'skipped-prereq' | 'failed'
  }
}

// ============================================================================
// Constants
// ============================================================================

const REPO_ROOT = resolve(import.meta.dir, '..');
const STATE_PATH = join(REPO_ROOT, '.template', 'installer.state.json');
const CLAUDE_MCP_PATH = join(REPO_ROOT, '.mcp.json');
const OPENCODE_CONFIG_PATH = join(REPO_ROOT, 'opencode.jsonc');
const ENV_PATH = join(REPO_ROOT, '.env');
const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example');

const REPO_NAME = 'agentic-qa-boilerplate';

const MIN_GENTLE_AI_VERSION = [1, 26, 5] as const;

const ENGRAM_COMPONENT = 'engram';

/**
 * gentle-ai install uses the `minimal` preset → installs ONLY the engram
 * component (persistent memory binary + MCP adapter + agent config wiring).
 *
 * Rationale: this is a QA repo. Our workflow skills (sprint-testing,
 * test-automation, test-documentation, regression-testing) already provide
 * Plan → Code → Verify natively. SDD-* skills target software-design workflows
 * (specs, archives, strict TDD) that don't apply to E2E/API test authoring.
 * The vendored `judgment-day` skill (committed under .claude/skills/) provides
 * adversarial dual-review without needing the SDD bundle.
 *
 * If you want the full SDD suite for `/framework-development` framework
 * evolution work, run manually:
 *   gentle-ai install --agent <a> --components engram,sdd
 */

const CANONICAL_MCPS = [
  'context7',
  'tavily',
  'playwright',
  'dbhub',
  'openapi',
  'postman',
] as const;

// External CLIs are NEVER installed by this script — install commands depend on
// the user's OS and we refuse to guess. We only verify presence, surface the
// purpose, and point users to the official docs. `install` is OPTIONAL and only
// set for genuinely cross-platform commands.
const EXTERNAL_CLIS: ReadonlyArray<{ name: string, install?: string, docs: string, purpose: string, required?: boolean }> = [
  {
    name: 'bun',
    docs: 'https://bun.com/',
    purpose: 'general-purpose runtime + package manager (this repo runs on bun)',
  },
  {
    name: 'gh',
    docs: 'https://github.com/cli/cli#installation',
    purpose: 'GitHub CLI — repos, PRs, releases, gh api',
  },
  {
    // Promoted to the sole default tool for Jira/Confluence/TMS work
    // (Atlassian MCP is opt-in via docs/mcp/).
    name: 'acli',
    docs: 'https://developer.atlassian.com/cloud/acli/guides/install-acli/',
    purpose: 'Atlassian (Jira/Confluence) CLI — used by /acli skill',
    required: true,
  },
  {
    // Binary produced by @playwright/cli is `playwright-cli`, NOT
    // @playwright/test (devDep test runner library producing no global
    // binary).
    name: 'playwright-cli',
    install: 'bun add -g @playwright/cli@latest',
    docs: 'https://playwright.dev/agent-cli/introduction',
    purpose: 'browser automation — screenshots, traces, recordings',
  },
  {
    name: 'jq',
    docs: 'https://jqlang.org/',
    purpose: 'JSON processor — required by /acli skill for parsing acli --json output',
  },
  {
    name: 'resend',
    docs: 'https://resend.com/docs/cli',
    purpose: 'email development + transactional sending',
  },
];

interface CommunitySkill {
  package: string // git URL or shorthand 'owner/repo'
  skill?: string // omit or '*' to install all skills from the package
}

/**
 * Community skills installed at PROJECT level (`bunx skills add`).
 * Hosts third-party skills that are critical to this QA stack. They land in
 * .claude/skills/ alongside our committed skills — the boilerplate scaffolds
 * the full skill set into the consumer repo, so a fresh clone has everything
 * needed. Skills authored by us (sprint-testing, test-automation,
 * agentic-qa-core, project-discovery, regression-testing, test-documentation,
 * agentic-qa-onboard, acli, xray-cli, git-flow-master) live committed under
 * .claude/skills/ and are NOT listed here.
 */
const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  // playwright-cli (Microsoft): browser automation CLI used by /sprint-testing
  // and /test-automation as the primary [AUTOMATION_TOOL].
  { package: 'https://github.com/microsoft/playwright-cli', skill: 'playwright-cli' },
  // playwright-best-practices (currents.dev): patterns / anti-flaky / axe-core /
  // fixtures reference loaded by /test-automation during the Code phase.
  { package: 'https://github.com/currents-dev/playwright-best-practices-skill', skill: 'playwright-best-practices' },
  // resend-cli (resend.com): email testing flows. Pairs with the `resend`
  // external CLI verified in step 11 — see CLAUDE.md §6.5 CLI→Skill auto-load.
  // Project-level because email provider choice varies per project.
  { package: 'https://github.com/resend/resend-skills', skill: 'resend-cli' },
];

/**
 * Community skills installed at USER (global) level (`bunx skills add --global`).
 * Useful across most projects regardless of stack. QA-tuned subset of the dev
 * universal layer — design/automation skills (n8n-skills, emil-design-eng,
 * ui-ux-pro-max) live only in the dev repo since QA does not author UI or
 * automation flows. html-ppt is a cross-project utility useful for report
 * generation. bun is the runtime used across all projects.
 */
const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  { package: 'https://github.com/anthropics/skills', skill: 'skill-creator' },
  { package: 'https://github.com/vercel-labs/skills', skill: 'find-skills' },
  { package: 'https://github.com/xixu-me/skills', skill: 'github-actions-docs' },
  { package: 'https://github.com/obra/superpowers', skill: 'brainstorming' },
  { package: 'https://github.com/lewislulu/html-ppt-skill', skill: 'html-ppt' },
  { package: 'https://bun.sh/docs', skill: 'bun' },
  // Cross-project human-in-the-loop feedback CLI (`toki`): a blocking browser UI
  // the AI drives mid-conversation to collect structured, anchored answers.
  { package: 'https://github.com/upex-galaxy/agentic-user-skills', skill: 'wokitoki' },
];

// Matches Claude Code ${VAR} and ${VAR:-default} placeholders in .mcp.json.
const MCP_VAR_PATTERN = /\$\{([A-Z][A-Z0-9_]*)(?::-[^}]*)?\}/g;
// Matches OpenCode {env:VAR} placeholders in opencode.jsonc.
const OPENCODE_VAR_PATTERN = /\{env:([A-Z][A-Z0-9_]*)\}/g;
const SECRET_NAME_HINTS = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD'];

// Map MCP server → env vars its secrets depend on. Servers with empty arrays
// have no secrets (so they're always "configured-no-key").
//
// `dbhub` is intentionally NOT managed by the installer or doctor — the user
// must edit `dbhub.toml` manually based on the target project's database
// (sqlserver/postgres/mysql/sqlite/mariadb). Marked as `placeholder` always.
const MCP_SERVER_SECRETS: Record<string, readonly string[]> = {
  context7: [],
  tavily: ['TAVILY_API_KEY'],
  playwright: [],
  dbhub: ['DBHUB_HOST', 'DBHUB_DATABASE', 'DBHUB_USER', 'DBHUB_PASSWORD'],
  openapi: ['API_BASE_URL', 'OPENAPI_SPEC_PATH', 'API_TOKEN'],
  postman: ['POSTMAN_API_KEY'],
};

// Vars discovered from committed MCP configs that the installer should NOT
// prompt for at install time — they are project-bound (require an existing
// backend / Postman workspace / DB connection) and are surfaced later by
// `bun run doctor` once the user has the necessary external resources.
const INSTALLER_DEFERRED_VARS = new Set<string>([
  'API_BASE_URL',
  'OPENAPI_SPEC_PATH',
  'API_TOKEN',
  'POSTMAN_API_KEY',
  'DBHUB_HOST',
  'DBHUB_DATABASE',
  'DBHUB_USER',
  'DBHUB_PASSWORD',
]);

// The CRITICAL set (project-independent tool credentials) is owned by the day-0
// credentials step. configureMcps skips any of these it encounters (e.g.
// TAVILY_API_KEY surfaced from .mcp.json) so the user is asked exactly once.
const CRITICAL_VAR_NAMES = new Set<string>(criticalVars().map(s => s.name));

// ============================================================================
// CLI flags
// ============================================================================

// Auto-detect non-TTY (e.g. when an AI agent or CI pipeline invokes the
// installer) so prompts don't hang waiting for stdin. The flag still wins
// explicitly when passed; without it, lack of a TTY forces the same mode.
const NON_INTERACTIVE
  = process.argv.includes('--non-interactive') || !process.stdin.isTTY;
const AUTO_NON_INTERACTIVE
  = !process.argv.includes('--non-interactive') && !process.stdin.isTTY;

// --force: clear all step timestamps → re-run everything
const FORCE_ALL = process.argv.includes('--force') || process.env.INSTALL_FORCE_ALL === '1';

// --force-step <key>: clear one step
const FORCE_STEP_IDX = process.argv.indexOf('--force-step');
const FORCE_STEP_KEY = FORCE_STEP_IDX !== -1 ? (process.argv[FORCE_STEP_IDX + 1] ?? '') : '';

// --variables: run ONLY the env-var setup flow (local + remote), then exit —
// skipping the normal install pipeline. Companion flags below are scoped to it.
const VARIABLES_MODE = process.argv.includes('--variables');
// --variables-mode <local|remote|both> (default: both). Accepts the bare
// `--variables-local` / `--variables-remote` shorthands too.
const VARIABLES_MODE_IDX = process.argv.indexOf('--variables-mode');
const VARIABLES_MODE_ARG = VARIABLES_MODE_IDX !== -1 ? (process.argv[VARIABLES_MODE_IDX + 1] ?? '') : '';
// --dry-run: print what WOULD be set (names + scopes, never values) without writing.
const DRY_RUN = process.argv.includes('--dry-run');
// --yes: pre-approve remote secret writes (required for non-interactive remote push).
const YES = process.argv.includes('--yes');

const SKIP_GENTLE_AI = process.env.INSTALL_SKIP_GENTLE_AI === '1';
const SKIP_DEPS = process.env.INSTALL_SKIP_DEPS === '1';
const SKIP_PLAYWRIGHT = process.env.INSTALL_SKIP_PLAYWRIGHT === '1';
const SKIP_AGENTS_SETUP = process.env.INSTALL_SKIP_AGENTS_SETUP === '1';
const FORCE_AGENTS_SETUP = process.env.INSTALL_FORCE_AGENTS_SETUP === '1';
const FORCE_GENTLE_AI = process.env.INSTALL_FORCE_GENTLE_AI === '1';
// --sync-skills: standalone repair mode — re-installs community skills targeting
// the selected agent(s) so they land in each agent's own skills dir (e.g. Claude
// Code's `.claude/skills/`). Implies a forced community re-run.
const SYNC_SKILLS = process.argv.includes('--sync-skills');
const FORCE_COMMUNITY = process.env.INSTALL_FORCE_COMMUNITY === '1' || SYNC_SKILLS;
const FORCE_GITHUB = process.env.INSTALL_FORCE_GITHUB === '1';
const SKIP_JIRA = process.env.INSTALL_SKIP_JIRA === '1';
const SKIP_API = process.env.INSTALL_SKIP_API === '1';
const SKIP_COMMUNITY = process.env.INSTALL_SKIP_COMMUNITY === '1';
const SKIP_DIRENV = process.env.INSTALL_SKIP_DIRENV === '1';

// ============================================================================
// Logger (wraps tui + keeps inline COLORS for printClosingSummary)
// ============================================================================

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  bold: '\x1B[1m',
};

const log = {
  info: (msg: string) => tui.log.info(msg),
  success: (msg: string) => tui.log.success(msg),
  warn: (msg: string) => tui.log.warn(msg),
  error: (msg: string) => tui.log.error(msg),
  banner: (msg: string) => tui.section(msg),
  step: (_n: number, _total: number, title: string) => tui.section(title),
  dim: (msg: string) => process.stdout.write(`${COLORS.dim}${msg}${COLORS.reset}\n`),
};

// ============================================================================
// Idempotency helpers
// ============================================================================

/**
 * Returns true when a step should run (not yet completed, or forced).
 * Env-var override: INSTALL_FORCE_<UPPER_STEP_KEY>=1 (dashes become underscores).
 */
function shouldRunStep(state: InstallState, key: string, forceKeys: Set<string>): boolean {
  if (FORCE_ALL) { return true; }
  if (forceKeys.has(key)) { return true; }
  // Env-var override: e.g. INSTALL_FORCE_5_DEPS_INSTALL=1
  const envKey = `INSTALL_FORCE_${key.toUpperCase().replace(/-/g, '_')}`;
  if (process.env[envKey] === '1') { return true; }
  return !state.steps[key];
}

function markStepDone(state: InstallState, key: string): void {
  state.steps[key] = new Date().toISOString();
}

// ============================================================================
// Prompt helpers
// ============================================================================

async function maybeConfirm(message: string, defaultYes: boolean): Promise<boolean> {
  if (NON_INTERACTIVE) { return defaultYes; }
  const result = await tui.confirm({ message, initialValue: defaultYes });
  if (tui.isCancel(result)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  return result;
}

// ============================================================================
// Subprocess helpers
// ============================================================================

function which(binary: string): string | null {
  // POSIX `which` is not present on raw Windows PowerShell / cmd.exe. Git Bash
  // and WSL ship a MSYS port, so most users hit this branch only when running
  // setup from a vanilla Windows shell.
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [binary], { encoding: 'utf8' });
  if (result.status !== 0) { return null; }
  const out = result.stdout.trim();
  // `where` prints one match per line; take the first.
  const first = out.split(/\r?\n/)[0]?.trim() ?? '';
  return first.length > 0 ? first : null;
}

function tryRun(binary: string, args: string[]): { ok: boolean, stdout: string, stderr: string } {
  try {
    const stdout = execFileSync(binary, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  }
  catch (err) {
    const e = err as { stdout?: Buffer | string, stderr?: Buffer | string };
    return {
      ok: false,
      stdout: typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString() ?? '',
      stderr: typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? '',
    };
  }
}

/**
 * Spawn a long-running script with stdio inherited. Used for nested interactive
 * scripts (agents:setup) and for visible output (bun install, pw:install).
 * Returns ok=true iff exit code 0.
 */
function runInherited(binary: string, args: string[], env: NodeJS.ProcessEnv = process.env): { ok: boolean } {
  const result = spawnSync(binary, args, { stdio: 'inherit', env });
  return { ok: result.status === 0 };
}

// ============================================================================
// Phase 1 — DETECTION
// Step 1 (1-repo-verify): repo identity check
// ============================================================================

async function verifyRepoRoot(): Promise<void> {
  const pkgPath = join(REPO_ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    log.error(`No package.json found at ${pkgPath}. Run this from the repo root.`);
    log.dim('  Once you are in the repo root, re-run: bun run setup');
    process.exit(1);
  }
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { name?: string };

  if (pkg.name === REPO_NAME) { return; }

  // Accept projects bootstrapped from this template — they keep a marker
  // file even though their package.json name is the user-chosen name.
  const markerPath = join(REPO_ROOT, '.template', 'installer.lock.json');
  if (existsSync(markerPath)) {
    try {
      const marker = JSON.parse(await readFile(markerPath, 'utf8')) as { template?: string };
      if (marker.template === 'upex-galaxy/agentic-qa-boilerplate') {
        log.info(`Bootstrapped project detected: ${pkg.name ?? '(unknown)'}`);
        return;
      }
    }
    catch {
      // fall through to confirm
    }
  }

  const proceed = await tui.confirm({
    message: `package.json name is "${pkg.name ?? '(unknown)'}" (expected "${REPO_NAME}"). Continue anyway?`,
    initialValue: false,
  });
  if (tui.isCancel(proceed) || !proceed) {
    log.dim('  Aborted. Re-run anytime: bun run setup');
    process.exit(0);
  }
}

// ============================================================================
// Phase 1 — Step 2 (2-gentle-ai-detect): detect gentle-ai
// ============================================================================

function parseGentleAiVersion(output: string): string | undefined {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}.${match[3]}` : undefined;
}

function isCompatible(version: string): boolean {
  const parts = version.split('.').map(n => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const got = parts[i] ?? 0;
    const min = MIN_GENTLE_AI_VERSION[i];
    if (got > min) { return true; }
    if (got < min) { return false; }
  }
  return true;
}

function detectGentleAi(): GentleAiInfo {
  if (SKIP_GENTLE_AI) {
    return { found: false, status: 'skipped' };
  }
  const path = which('gentle-ai');
  if (!path) { return { found: false, status: 'missing' }; }

  const result = tryRun('gentle-ai', ['version']);
  if (!result.ok) { return { found: true, status: 'incompatible' }; }

  const version = parseGentleAiVersion(result.stdout);
  if (!version) { return { found: true, status: 'incompatible' }; }

  const compatible = isCompatible(version);
  return {
    found: true,
    version,
    compatible,
    status: compatible ? 'installed' : 'incompatible',
  };
}

// ============================================================================
// Phase 1 — Step 3 (3-gentle-ai-install): gentle-ai install instructions / skip
// ============================================================================

async function handleMissingGentleAi(): Promise<'show-and-exit' | 'skip'> {
  log.warn('gentle-ai not detected on PATH.');
  log.info('gentle-ai installs engram (persistent memory) into your agent via the minimal preset.');
  log.info('See INSTALLER.md for what gets installed and what stays local.');
  process.stdout.write('\n');

  const choice = await maybeConfirm(
    'Show install commands and exit so you can install it? (No = continue without gentle-ai)',
    true,
  );

  if (choice) {
    log.banner('Install gentle-ai with one of these commands:');
    process.stdout.write('  macOS  : brew install gentle-ai\n');
    process.stdout.write('  Linux  : go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest\n\n');
    log.dim('  Docs: https://github.com/Gentleman-Programming/gentle-ai');
    log.dim('After installing, re-run: bun run setup');
    return 'show-and-exit';
  }

  log.warn('Continuing without gentle-ai. Engram will NOT be installed.');
  log.dim('  To install them later, install gentle-ai (https://github.com/Gentleman-Programming/gentle-ai)');
  log.dim('  and re-run: bun run setup');
  return 'skip';
}

// ============================================================================
// Phase 1 — Step 4 (4-agent-detect): detect agents
// ============================================================================

async function detectAgents(): Promise<AgentDetection> {
  const claudePath = join(homedir(), '.claude');
  const opencodePath = join(homedir(), '.config', 'opencode');

  const [claude, opencode] = await Promise.all([
    stat(claudePath).then(
      s => s.isDirectory(),
      () => false,
    ),
    stat(opencodePath).then(
      s => s.isDirectory(),
      () => false,
    ),
  ]);

  return { claudeCode: claude, opencode };
}

function parseAgentsEnv(): AgentId[] | null {
  const raw = process.env.INSTALL_AGENTS;
  if (!raw) { return null; }
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  const valid: AgentId[] = [];
  for (const p of parts) {
    if (p === 'claude-code' || p === 'opencode') { valid.push(p); }
  }
  return valid;
}

async function promptAgentSelection(detected: AgentDetection): Promise<AgentId[]> {
  if (NON_INTERACTIVE) {
    const fromEnv = parseAgentsEnv();
    if (fromEnv && fromEnv.length > 0) { return fromEnv; }
    // Default to whatever is detected
    const out: AgentId[] = [];
    if (detected.claudeCode) { out.push('claude-code'); }
    if (detected.opencode) { out.push('opencode'); }
    return out;
  }

  if (!detected.claudeCode && !detected.opencode) {
    log.error('No agents detected. Install Claude Code or OpenCode and re-run.');
    log.dim('  Claude Code: https://docs.claude.com/en/docs/claude-code');
    log.dim('  OpenCode:    https://opencode.ai/docs');
    log.dim('  Then re-run: bun run setup');
    process.exit(1);
  }

  if (detected.claudeCode && !detected.opencode) {
    const ok = await tui.confirm({ message: 'Detected Claude Code. Configure for it?', initialValue: true });
    if (tui.isCancel(ok)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
    return ok ? ['claude-code'] : [];
  }

  if (detected.opencode && !detected.claudeCode) {
    const ok = await tui.confirm({ message: 'Detected OpenCode. Configure for it?', initialValue: true });
    if (tui.isCancel(ok)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
    return ok ? ['opencode'] : [];
  }

  const selected = await checkbox<AgentId>({
    message: 'Detected both agents. Which to configure?',
    choices: [
      { name: 'Claude Code', value: 'claude-code', checked: true },
      { name: 'OpenCode', value: 'opencode', checked: true },
    ],
    required: true,
  });
  return selected;
}

// ============================================================================
// Phase 2 — INSTALLATION
// Step 5 (5-deps-install): bun install
// ============================================================================

function nodeModulesLooksReady(): boolean {
  return existsSync(join(REPO_ROOT, 'node_modules', '@playwright', 'test'));
}

// Playwright caches downloaded browsers in a per-OS directory. Detect any of
// the documented locations as a proxy for "browsers installed". This avoids
// spawning `bunx playwright --version` (which only verifies the package, not
// the browsers themselves).
function playwrightBrowsersInstalled(): boolean {
  const overrides = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
  ].filter((p): p is string => Boolean(p) && p !== '0');
  const home = homedir();
  const candidates = [
    ...overrides,
    join(home, '.cache', 'ms-playwright'),
    join(home, 'Library', 'Caches', 'ms-playwright'),
    join(home, 'AppData', 'Local', 'ms-playwright'),
  ];
  return candidates.some(p => existsSync(p));
}

async function runDepsInstall(state: InstallState, forceKeys: Set<string>): Promise<void> {
  const key = '5-deps-install';
  if (SKIP_DEPS) {
    log.dim('  INSTALL_SKIP_DEPS=1, skipping bun install.');
    return;
  }
  if (!shouldRunStep(state, key, forceKeys) && nodeModulesLooksReady()) {
    log.dim('  Dependencies already installed (state + node_modules present). Use --force-step 5-deps-install to re-run.');
    return;
  }
  if (nodeModulesLooksReady() && !shouldRunStep(state, key, forceKeys)) {
    log.dim('  node_modules looks populated; skipping bun install.');
    markStepDone(state, key);
    return;
  }

  const proceed = await maybeConfirm('Run `bun install` now?', true);
  if (!proceed) {
    log.warn('Skipping bun install. Run it manually before using the test scripts.');
    return;
  }

  const s = tui.spinner();
  s.start('Installing dependencies (bun install)…');
  const { ok } = runInherited('bun', ['install']);
  if (ok) {
    markStepDone(state, key);
    s.stop('Dependencies installed.');
  }
  else {
    s.stop('bun install failed. Review the output above and retry.');
  }
}

// ============================================================================
// Phase 2 — Step 6 (6-playwright): Playwright browsers
// ============================================================================

async function runPlaywrightInstall(state: InstallState, forceKeys: Set<string>): Promise<void> {
  const key = '6-playwright';
  if (SKIP_PLAYWRIGHT) {
    log.dim('  INSTALL_SKIP_PLAYWRIGHT=1, skipping playwright install.');
    return;
  }
  if (!shouldRunStep(state, key, forceKeys) && playwrightBrowsersInstalled()) {
    log.dim('  Playwright already installed (state + browsers cached). Use --force-step 6-playwright to re-run.');
    return;
  }

  const proceed = await maybeConfirm(
    'Run `bun run pw:install` to download Chromium (~300 MB)?',
    true,
  );
  if (!proceed) {
    log.warn('Skipping playwright install. Run `bun run pw:install` later when ready.');
    return;
  }

  const s = tui.spinner();
  s.start('Installing Playwright browsers (bun run pw:install)…');
  const { ok } = runInherited('bun', ['run', 'pw:install']);
  if (ok) {
    markStepDone(state, key);
    s.stop('Playwright browsers installed.');
  }
  else {
    s.stop('pw:install failed. Review the output above and retry.');
  }
}

// ============================================================================
// Phase 2 — Step 8 (8-skills-gentle-ai): install skills via gentle-ai
// ============================================================================

function runGentleAiInstall(args: string[]): { ok: boolean, reason?: string } {
  // gentle-ai uses Go's `flag` package with a fixed schema
  // (--agent(s), --component(s), --skill(s), --persona, --preset,
  // --sdd-mode, --dry-run). There is NO --yes flag — passing one
  // yields `flag provided but not defined: -yes`. Internal prompts
  // (e.g. "Add to allowlist? (y/N)") auto-pick their default answer
  // when stdin is not a TTY, so subprocess calls are effectively
  // non-interactive without any extra flag.
  const result = tryRun('gentle-ai', args);
  if (result.ok) { return { ok: true }; }
  return { ok: false, reason: result.stderr.trim() || result.stdout.trim() || 'unknown error' };
}

async function installSkillsViaGentleAi(
  agents: AgentId[],
  state: InstallState,
  forceKeys: Set<string>,
): Promise<void> {
  const key = '8-skills-gentle-ai';
  if (agents.length === 0) {
    log.info('No agents selected, skipping engram install.');
    return;
  }
  if (!shouldRunStep(state, key, forceKeys) && !FORCE_GENTLE_AI) {
    log.dim(`  gentle-ai engram already installed at ${state.steps[key]}.`);
    log.dim('  Set INSTALL_FORCE_GENTLE_AI=1 or --force-step 8-skills-gentle-ai to re-run.');
    return;
  }

  // One batched gentle-ai call per agent: installs the engram component
  // only (minimal preset). gentle-ai snapshots existing config files before
  // overwriting (compressed tar.gz, deduped, last 5 retained), so re-runs
  // are safe and idempotent — they DO re-apply, they don't skip. The
  // `engram::<agent>` state keys stay for the closing summary and doctor
  // script.
  log.info(`This will run ${agents.length} gentle-ai install command(s) — one batched call per agent.`);

  const proceed = await maybeConfirm('Continue with engram installation?', true);
  if (!proceed) {
    log.warn('Skipping engram installation.');
    for (const agent of agents) {
      const k = `${ENGRAM_COMPONENT}::${agent}`;
      if (!state.skills[k]) { state.skills[k] = 'skipped'; }
    }
    return;
  }

  for (const agent of agents) {
    log.banner(`Installing engram for: ${agent}`);

    const s = tui.spinner();
    s.start(`Installing engram (minimal preset) for ${agent}…`);

    const result = runGentleAiInstall([
      'install',
      '--agent',
      agent,
      '--preset',
      'minimal',
    ]);

    const status: InstallStatus = result.ok ? 'installed' : 'failed';
    if (result.ok) {
      s.stop(`Installed: engram (${agent})`);
    }
    else {
      s.stop(`Failed: engram (${agent}) — ${result.reason}`);
    }

    state.skills[`${ENGRAM_COMPONENT}::${agent}`] = status;
  }
  markStepDone(state, key);
}

// ============================================================================
// Phase 2 — Step 9 (9-skills-community): community skills via bunx skills CLI
// ============================================================================

function describeSkill(item: CommunitySkill): string {
  if (!item.skill || item.skill === '*') {
    return item.package.split('/').slice(-2).join('/');
  }
  return item.skill;
}

async function installCommunitySkills(
  agents: AgentId[],
  state: InstallState,
  level: 'project' | 'global',
  forceKeys: Set<string>,
): Promise<void> {
  const list = level === 'project' ? PROJECT_LEVEL_SKILLS : USER_LEVEL_SKILLS;
  const label = level === 'project' ? 'project-level' : 'user-level (global)';
  const key = `9-skills-community-${level}`;

  if (list.length === 0) {
    log.dim(`  No ${label} community skills configured for this repo.`);
    return;
  }
  if (!shouldRunStep(state, key, forceKeys) && !FORCE_COMMUNITY) {
    log.dim(`  ${label} community skills already installed at ${state.steps[key]}.`);
    log.dim('  Set INSTALL_FORCE_COMMUNITY=1 to re-run.');
    return;
  }

  log.banner(`Community skills — ${label}`);
  log.info(`This will run ${list.length} \`bunx skills add\` commands (${label}).`);

  const proceed = await maybeConfirm(`Install ${label} community skills?`, true);
  if (!proceed) {
    log.warn(`Skipping ${label} community skills.`);
    for (const item of list) {
      const slug = describeSkill(item);
      const stateKey = `community:${level}:${slug}`;
      if (!state.skills[stateKey]) {
        state.skills[stateKey] = 'skipped';
      }
    }
    return;
  }

  for (const item of list) {
    const slug = describeSkill(item);
    const stateKey = `community:${level}:${slug}`;
    if (state.skills[stateKey] === 'installed' && !shouldRunStep(state, key, forceKeys) && !FORCE_COMMUNITY) {
      log.dim(`  skipping ${slug} (already installed)`);
      continue;
    }
    // Install into each selected agent's skills directory via `--agent`. Claude
    // Code only discovers skills under `.claude/skills/` (plus ~/.claude/skills/,
    // plugins, and --add-dir) — it NEVER scans `.agents/skills/`. Without an
    // explicit `--agent`, `bunx skills add` writes only to `.agents/skills/` (the
    // agent-agnostic store read by Copilot/OpenCode/Warp), so the skills stay
    // invisible to Claude Code. Passing the selected agents lands each skill where
    // that agent actually loads it.
    const args = ['skills', 'add', item.package];
    if (item.skill && item.skill !== '*') {
      args.push('--skill', item.skill);
    }
    if (level === 'global') {
      args.push('--global');
    }
    for (const agent of agents) {
      args.push('--agent', agent);
    }
    args.push('--yes');

    const s = tui.spinner();
    s.start(`Installing ${slug}…`);
    const result = tryRun('bunx', args);
    if (result.ok) {
      s.stop(`Installed: ${slug}`);
      state.skills[stateKey] = 'installed';
    }
    else {
      s.stop(`Failed: ${slug} — ${(result.stderr || result.stdout).trim().slice(0, 120) || 'unknown error'}`);
      state.skills[stateKey] = 'failed';
    }
  }
  markStepDone(state, key);
}

// ============================================================================
// Phase 3 — CONFIGURATION
// Step 10 (10-mcp-env): Wire .env for MCP servers (+ direnv autoload offer)
// ============================================================================
//
// `.mcp.json` and `opencode.jsonc` are committed with `${VAR}` / `{env:VAR}`
// expansion. The installer no longer rewrites those files — it only ensures
// `.env` contains the required values, then optionally enables direnv.

export function isSecretName(name: string): boolean {
  return SECRET_NAME_HINTS.some(hint => name.endsWith(hint) || name.endsWith(`_${hint}`));
}

function stripJsoncComments(input: string): string {
  // Strip /* … */ block comments + // line comments. Conservative: only strips
  // line comments that start the (trimmed) line, so URLs containing `//`
  // inside JSON string values survive.
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function discoverRequiredEnvVars(agents: AgentId[]): Promise<string[]> {
  const seen = new Set<string>();
  if (agents.includes('claude-code') && existsSync(CLAUDE_MCP_PATH)) {
    const content = await readFile(CLAUDE_MCP_PATH, 'utf8');
    for (const m of content.matchAll(MCP_VAR_PATTERN)) { seen.add(m[1]); }
  }
  if (agents.includes('opencode') && existsSync(OPENCODE_CONFIG_PATH)) {
    const raw = await readFile(OPENCODE_CONFIG_PATH, 'utf8');
    const content = stripJsoncComments(raw);
    for (const m of content.matchAll(OPENCODE_VAR_PATTERN)) { seen.add(m[1]); }
  }
  return [...seen].sort();
}

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) { continue; }
    const eq = line.indexOf('=');
    if (eq <= 0) { continue; }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export async function ensureEnvFileExists(): Promise<void> {
  if (existsSync(ENV_PATH)) { return; }
  if (existsSync(ENV_EXAMPLE_PATH)) {
    const tmpl = await readFile(ENV_EXAMPLE_PATH, 'utf8');
    await writeFile(ENV_PATH, tmpl, 'utf8');
    log.success('Created .env from .env.example (values are empty — fill them below).');
    return;
  }
  await writeFile(ENV_PATH, '', 'utf8');
  log.warn('.env.example missing; created empty .env.');
}

export async function appendVarsToEnv(vars: Record<string, string>): Promise<void> {
  if (Object.keys(vars).length === 0) { return; }
  const existing = await readFile(ENV_PATH, 'utf8');
  // Upsert: replace an existing declaration of KEY in place — whether it is an
  // active `KEY=`, a commented-out `# KEY=`, or an `export KEY=` line — so re-runs
  // and the acli retry loop never accumulate duplicate lines, and a commented
  // placeholder copied from `.env.example` is filled in place (uncommented)
  // instead of a second active copy being appended. Only genuinely-absent keys
  // are appended under the header.
  const lines = existing.split('\n');
  const remaining: Record<string, string> = { ...vars };
  // Optional indent, optional comment marker(s), optional `export`, then an
  // identifier immediately followed by `=`. Prose comments like
  // `# ===== Added by ... =====` never match (no identifier before the `=`).
  const declRe = /^(\s*)(?:#+\s*)?(export\s+)?([A-Za-z_]\w*)\s*=/;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(declRe);
    if (m === null) { continue; }
    const indent = m[1];
    const exportPrefix = m[2] ?? '';
    const key = m[3];
    if (Object.prototype.hasOwnProperty.call(remaining, key)) {
      lines[i] = `${indent}${exportPrefix}${key}=${remaining[key]}`;
      delete remaining[key];
    }
  }
  let next = lines.join('\n');
  const toAppend = Object.entries(remaining);
  if (toAppend.length > 0) {
    const needsNewline = next.length > 0 && !next.endsWith('\n');
    const header = '\n# ===== Added by `bun run setup` =====\n';
    const body = `${toAppend.map(([k, v]) => `${k}=${v}`).join('\n')}\n`;
    next = `${next}${needsNewline ? '\n' : ''}${header}${body}`;
  }
  // .env holds secrets — write 0600 (best effort; mode is a no-op on Windows).
  await writeFile(ENV_PATH, next, { mode: 0o600 });
  try { await chmod(ENV_PATH, 0o600); }
  catch { /* best effort */ }
}

export async function promptForVar(name: string): Promise<string> {
  if (isSecretName(name)) {
    const entered = await password({
      message: `${name} (Enter to skip — fill later in .env):`,
      mask: '*',
    });
    return (entered ?? '').trim();
  }
  const entered = await tui.text({
    message: `${name} (Enter to skip — fill later in .env):`,
  });
  if (tui.isCancel(entered)) { return ''; }
  return (entered ?? '').trim();
}

async function configureMcps(agents: AgentId[], state: InstallState): Promise<void> {
  if (agents.length === 0) {
    log.info('No agents selected, skipping MCP config.');
    return;
  }

  await ensureEnvFileExists();

  const required = await discoverRequiredEnvVars(agents);
  if (required.length === 0) {
    log.warn('No env-var placeholders found in .mcp.json or opencode.jsonc.');
    state.pendingEnvVars = [];
    return;
  }

  log.info(`Required MCP env vars (from committed configs): ${required.join(', ')}`);

  const envValues = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const newValues: Record<string, string> = {};
  const stillPending: string[] = [];

  for (const name of required) {
    const fromEnvFile = envValues[name];
    if (fromEnvFile && fromEnvFile.trim().length > 0) {
      log.dim(`  ${name}: already set in .env`);
      continue;
    }
    const fromProcessEnv = process.env[name];
    if (fromProcessEnv && fromProcessEnv.trim().length > 0) {
      newValues[name] = fromProcessEnv.trim();
      log.dim(`  ${name}: captured from shell environment`);
      continue;
    }
    if (CRITICAL_VAR_NAMES.has(name)) {
      // CRITICAL tool credentials (e.g. TAVILY_API_KEY) are owned by the day-0
      // step, which prompts the whole critical set with the right context. Skip
      // here to avoid double-asking; do NOT mark pending (day-0 collects it).
      log.dim(`  ${name}: collected in the day-0 credentials step.`);
      continue;
    }
    if (INSTALLER_DEFERRED_VARS.has(name)) {
      stillPending.push(name);
      log.dim(`  ${name}: deferred to \`bun run doctor\` (project-bound — needs backend / DB / workspace).`);
      continue;
    }
    if (NON_INTERACTIVE) {
      stillPending.push(name);
      continue;
    }
    const value = await promptForVar(name);
    if (value.length === 0) {
      stillPending.push(name);
    }
    else {
      newValues[name] = value;
    }
  }

  if (Object.keys(newValues).length > 0) {
    await appendVarsToEnv(newValues);
    log.success(`Wrote ${Object.keys(newValues).length} var(s) to .env: ${Object.keys(newValues).join(', ')}`);
  }
  if (stillPending.length > 0) {
    log.warn(`Pending (fill in .env manually): ${stillPending.join(', ')}`);
  }

  state.pendingEnvVars = stillPending;

  // Per-server status — placeholder if any of its required vars are still pending.
  const merged = { ...envValues, ...newValues };
  for (const [server, secrets] of Object.entries(MCP_SERVER_SECRETS)) {
    if (secrets.length === 0) {
      state.mcps[server] = 'configured-no-key';
    }
    else {
      const anyMissing = secrets.some(s => !merged[s] || merged[s].trim().length === 0);
      state.mcps[server] = anyMissing ? 'placeholder' : 'configured-with-key';
    }
  }
}

// ----------------------------------------------------------------------------
// Day-0 credentials (the CRITICAL set — project-INDEPENDENT tool credentials)
// ----------------------------------------------------------------------------
//
// The installer prompts ONLY for the CRITICAL set (manifest `critical: true`),
// identical across both boilerplates:
//   - ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN — Jira/acli tool
//   - RESEND_API_KEY — email-testing tool (also authenticates the resend CLI)
//   - TAVILY_API_KEY — the pre-configured Tavily web-search MCP
// These exist independent of any project-under-test, so a fresh clone can
// provide them on day-0.
//
// Everything else is NON-critical and is NEVER asked here (nor warned about):
//   - TEST_ENV — written to its manifest default ("local") WITHOUT prompting.
//   - LOCAL_USER_* / STAGING_USER_*, XRAY_*, DBHUB_*, API_*, POSTMAN_*, … —
//     project-dependent; surfaced in the closing "Next steps" list, settable
//     later via `bun run setup --variables`.

// Per-critical-var prompt context (grouped note shown before the prompt block).
// Vars without an entry are prompted with just their name.
const CRITICAL_VAR_NOTES: Record<string, { title: string, body: string }> = {
  ATLASSIAN_URL: {
    title: 'Atlassian credentials (Jira / acli)',
    body: 'Used by acli + scripts/sync-jira-*.ts. Get a token at: https://id.atlassian.com/manage-profile/security/api-tokens',
  },
  RESEND_API_KEY: {
    title: 'Resend API key (email testing)',
    body: 'Used for email-flow tests (signup, password reset, magic links). Get a key: https://resend.com/api-keys — Docs: https://resend.com/docs/api-reference/introduction',
  },
  TAVILY_API_KEY: {
    title: 'Tavily API key (web-search MCP)',
    body: 'Powers the pre-configured Tavily MCP for community-fix / troubleshooting research. Get a key: https://app.tavily.com',
  },
};

async function configureDayZeroCredentials(state: InstallState): Promise<void> {
  await ensureEnvFileExists();
  const envValues = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const newValues: Record<string, string> = {};

  // ── TEST_ENV default (NO prompt) ─────────────────────────────────────────
  // Project-dependent; the user reconfigures it manually or via /adapt-framework
  // when wiring the framework to their project-under-test. Write the manifest
  // default only when absent — never clobber an existing value.
  const currentTestEnv = (envValues.TEST_ENV ?? process.env.TEST_ENV ?? '').trim();
  if (currentTestEnv.length === 0) {
    const defaultEnv = nonCriticalVars().find(s => s.name === 'TEST_ENV')?.defaultValue ?? 'local';
    newValues.TEST_ENV = defaultEnv;
    log.dim(`  TEST_ENV: defaulting to "${defaultEnv}" (reconfigure later via /adapt-framework).`);
  }
  else {
    log.dim(`  TEST_ENV: already set to "${currentTestEnv}".`);
  }

  // ── CRITICAL tool credentials (idempotent, project-independent) ──────────
  for (const spec of criticalVars()) {
    const name = spec.name;
    const fromFile = (envValues[name] ?? '').trim();
    const fromProcess = (process.env[name] ?? '').trim();
    if (fromFile.length > 0 || fromProcess.length > 0) {
      log.dim(`  ${name}: already set.`);
      continue;
    }

    if (NON_INTERACTIVE) {
      log.warn(`${name}: missing (non-interactive mode — set later in .env or via \`bun run setup --variables\`).`);
      continue;
    }

    const noteInfo = CRITICAL_VAR_NOTES[name];
    if (noteInfo) {
      tui.note(noteInfo.body, noteInfo.title);
    }
    const value = await promptForVar(name);
    if (value.length > 0) {
      newValues[name] = value;
      process.env[name] = value;
    }
  }

  if (Object.keys(newValues).length > 0) {
    await appendVarsToEnv(newValues);
    reloadDotEnv();
    log.success(`Wrote ${Object.keys(newValues).length} day-0 var(s) to .env: ${Object.keys(newValues).join(', ')}`);
  }

  // Refresh MCP per-server status for any server whose secrets include a
  // critical var we just collected (e.g. tavily ← TAVILY_API_KEY), since
  // configureMcps deferred those to this step.
  const merged = { ...envValues, ...newValues };
  for (const [server, secrets] of Object.entries(MCP_SERVER_SECRETS)) {
    if (secrets.length === 0) { continue; }
    if (!secrets.some(s => CRITICAL_VAR_NAMES.has(s))) { continue; }
    const anyMissing = secrets.some(s => !merged[s] || merged[s].trim().length === 0);
    state.mcps[server] = anyMissing ? 'placeholder' : 'configured-with-key';
  }

  // ── Resend CLI authentication attempt ────────────────────────────────────
  const resendToken = (process.env.RESEND_API_KEY ?? '').trim();
  if (resendToken.length > 0 && !NON_INTERACTIVE) {
    const resendBin = tryRun('resend', ['--version']);
    if (!resendBin.ok) {
      log.dim('  resend CLI not installed — skipping auto-login. Install: npm i -g resend-cli');
    }
    else {
      const loginRes = spawnSync('resend', ['login', '--api-key', resendToken], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000,
      });
      if (loginRes.status === 0) {
        process.stdout.write(`${tui.statusIcon('ok')} resend CLI authenticated.\n`);
      }
      else {
        process.stdout.write(`${tui.statusIcon('warn')} resend CLI auto-login failed (exit ${loginRes.status}). Run manually: resend login\n`);
      }
    }
  }
}

// ----------------------------------------------------------------------------
// direnv autoload sub-step (still part of Step 10 / 10-mcp-env)
// ----------------------------------------------------------------------------

interface DirenvInfo {
  installed: boolean
  version?: string
  supportsDotenvIfExists: boolean
  supportsPwshHook: boolean
  platform: NodeJS.Platform
}

function detectDirenv(): DirenvInfo {
  const platform = process.platform;
  const result = tryRun('direnv', ['version']);
  if (!result.ok) {
    return { installed: false, supportsDotenvIfExists: false, supportsPwshHook: false, platform };
  }
  const version = result.stdout.trim();
  const parts = version.split('.').map(n => Number.parseInt(n, 10));
  const maj = parts[0] ?? 0;
  const min = parts[1] ?? 0;
  const supportsDotenvIfExists = maj > 2 || (maj === 2 && min >= 30);
  const supportsPwshHook = maj > 2 || (maj === 2 && min >= 37);
  return { installed: true, version, supportsDotenvIfExists, supportsPwshHook, platform };
}

function installHintForPlatform(): string {
  if (process.platform === 'win32') {
    return 'winget install direnv  (then restart Git Bash or PowerShell)';
  }
  if (process.platform === 'darwin') {
    return 'brew install direnv';
  }
  return 'sudo apt install direnv  (or: dnf install direnv  /  pacman -S direnv)';
}

function shellHookHint(info: DirenvInfo): string {
  const shell = (process.env.SHELL ?? '').toLowerCase();
  if (process.platform === 'win32' && shell.length === 0) {
    if (info.supportsPwshHook) {
      return 'Invoke-Expression "$(direnv hook pwsh)"  →  add to $PROFILE  (PowerShell)';
    }
    return 'eval "$(direnv hook bash)"  →  add to ~/.bashrc  (Git Bash; PowerShell needs direnv 2.37+)';
  }
  if (shell.endsWith('zsh')) {
    return 'eval "$(direnv hook zsh)"  →  add to ~/.zshrc';
  }
  if (shell.endsWith('fish')) {
    return 'direnv hook fish | source  →  add to ~/.config/fish/config.fish';
  }
  if (shell.endsWith('bash')) {
    return 'eval "$(direnv hook bash)"  →  add to ~/.bashrc';
  }
  return 'eval "$(direnv hook <your-shell>)"  →  see https://direnv.net/docs/hook.html';
}

async function offerDirenvAutoload(): Promise<void> {
  if (SKIP_DIRENV) {
    log.dim('  INSTALL_SKIP_DIRENV=1, skipping direnv setup.');
    return;
  }
  const info = detectDirenv();

  if (!info.installed) {
    log.info('direnv not installed (optional).');
    log.dim('  Launch agents with: bun claude  /  bun opencode  (dotenv-cli loads .env automatically).');
    log.dim(`  Or install direnv for shell autoload: ${installHintForPlatform()}`);
    return;
  }
  log.info(`direnv ${info.version} detected.`);
  if (info.platform === 'win32') {
    log.dim('  Tip: direnv on Windows works best in Git Bash. PowerShell support is experimental and requires direnv 2.37+.');
  }

  const proceed = await maybeConfirm(
    'Run `direnv allow` so the repo\'s .envrc auto-loads .env into your shell?',
    true,
  );
  if (!proceed) {
    log.dim('  Skipped. Launch agents with: bun claude  /  bun opencode.');
    return;
  }
  const result = tryRun('direnv', ['allow', REPO_ROOT]);
  if (result.ok) {
    log.success('direnv allow succeeded — .envrc will auto-load .env on cd.');
    log.dim(`  Reminder: add this to your shell rc if not already done: ${shellHookHint(info)}`);
  }
  else {
    log.warn('direnv allow failed. Launch agents with: bun claude  /  bun opencode.');
    log.dim(`  ${(result.stderr || result.stdout).trim().slice(0, 200)}`);
  }
}

// ============================================================================
// Phase 3 — Step 13 (13-github-repo): GitHub remote (optional)
// Ported from sibling commit 316dc1c + 8f82561 verbatim, adapted for QA repo
// ============================================================================

interface GhStatus {
  found: boolean
  version?: string
  authenticated: boolean
}

export function detectGh(): GhStatus {
  const path = which('gh');
  if (!path) { return { found: false, authenticated: false }; }

  const versionRes = tryRun('gh', ['--version']);
  const versionMatch = versionRes.stdout.match(/gh version (\d+\.\d+\.\d+)/);
  const version = versionMatch ? versionMatch[1] : undefined;

  const authRes = tryRun('gh', ['auth', 'status']);
  const authenticated = authRes.ok;

  return { found: true, version, authenticated };
}

function ghApi(args: string[]): { ok: boolean, stdout: string } {
  const res = tryRun('gh', ['api', ...args]);
  return { ok: res.ok, stdout: res.stdout.trim() };
}

function sanitizeRepoName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// ============================================================================
// Phase 3 — Step 12 (12-api-bootstrap): Optional API auth bootstrap
// ============================================================================

/**
 * Offer to run `bun run api:login` to populate API_TOKEN in .env so the
 * OpenAPI MCP server can authenticate against the target backend. This
 * accelerates MCP-driven API testing and exploration after install.
 */
async function optionalApiBootstrap(state: InstallState, forceKeys: Set<string>): Promise<void> {
  const key = '12-api-bootstrap';
  if (SKIP_API) {
    log.dim('  INSTALL_SKIP_API=1, skipping API bootstrap.');
    return;
  }
  if (!shouldRunStep(state, key, forceKeys)) {
    log.dim(`  ${key} already done; skipping (set INSTALL_FORCE_12_API_BOOTSTRAP=1 to re-run).`);
    return;
  }
  const proceed = await maybeConfirm(
    'Configure API auth now? (Runs `bun run api:login`.)',
    false,
  );
  if (!proceed) {
    return;
  }
  log.info('Running: bun run api:login');
  const { ok } = runInherited('bun', ['run', 'api:login']);
  if (ok) {
    log.success('API auth green.');
    markStepDone(state, key);
  }
  else {
    log.warn('api:login did not pass. Re-run later: bun run api:login');
  }
}

async function setupGithubRemote(state: InstallState, forceKeys: Set<string>): Promise<void> {
  const key = '13-github-repo';
  if (NON_INTERACTIVE) {
    log.dim('Non-interactive mode — skipping GitHub remote creation.');
    return;
  }

  // Idempotency: if a prior run already created a repo and the local `origin`
  // points at the same URL, skip silently. INSTALL_FORCE_GITHUB=1 or
  // --force-step 13-github-repo bypasses this.
  if (state.github && !FORCE_GITHUB && !shouldRunStep(state, key, forceKeys)) {
    const originUrl = tryRun('git', ['remote', 'get-url', 'origin']);
    if (originUrl.ok && originUrl.stdout.trim().includes(`${state.github.account}/${state.github.repo}`)) {
      log.dim(`GitHub remote already configured: ${state.github.url} — skipping. (Force: INSTALL_FORCE_GITHUB=1)`);
      return;
    }
  }

  // Hydrate state.github from an existing `origin` remote when state has no
  // record of it (e.g. user manually ran `gh repo create` between installer
  // runs, or cloned a repo that already had origin set). Parsing the URL
  // populates the closing-summary GitHub block without re-creating the repo.
  if (!state.github) {
    const originUrl = tryRun('git', ['remote', 'get-url', 'origin']);
    if (originUrl.ok) {
      const url = originUrl.stdout.trim();
      // Match SSH (git@github.com:owner/repo.git) and HTTPS (https://github.com/owner/repo[.git]).
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
      if (match) {
        const [, account, repo] = match;
        state.github = {
          account,
          repo,
          visibility: 'unknown',
          url: `https://github.com/${account}/${repo}`,
          createdAt: 'pre-existing',
        };
        log.dim(`Detected existing GitHub remote: ${state.github.url} — hydrating state, skipping create.`);
        markStepDone(state, key);
        return;
      }
    }
  }

  const gh = detectGh();
  if (!gh.found) {
    log.warn('gh CLI not found. Skipping GitHub repository creation.');
    log.dim('  Install: https://cli.github.com  (then run `gh auth login`).');
    log.dim('  To wire a remote later:  gh repo create --source=. --remote=origin --push');
    return;
  }
  if (!gh.authenticated) {
    log.warn(`gh ${gh.version ?? ''} detected but not authenticated.`);
    log.dim('  Run `gh auth login`, then re-run this installer to create the remote.');
    return;
  }
  log.success(`gh ${gh.version ?? ''} detected (authenticated).`);

  const wantRepoRaw = await tui.confirm({
    message: 'Create a GitHub repository for this project now?',
    initialValue: true,
  });
  if (tui.isCancel(wantRepoRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const wantRepo = wantRepoRaw;
  if (!wantRepo) {
    log.dim('Skipped. To wire later:  gh repo create --source=. --remote=origin --push');
    return;
  }

  // Resolve current package name as default repo name.
  const pkgPath = join(REPO_ROOT, 'package.json');
  let defaultRepoName = 'my-project';
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { name?: string };
    if (pkg.name) { defaultRepoName = sanitizeRepoName(pkg.name); }
  }
  catch { /* fall through with default */ }

  // Resolve account choices: personal login + org memberships.
  const userRes = ghApi(['user', '--jq', '.login']);
  if (!userRes.ok || !userRes.stdout) {
    log.error('Could not resolve GitHub user via `gh api user`. Skipping.');
    return;
  }
  const userLogin = userRes.stdout;

  const orgsRes = ghApi(['user/orgs', '--jq', '.[].login']);
  const orgs = orgsRes.ok && orgsRes.stdout.length > 0 ? orgsRes.stdout.split('\n').filter(Boolean) : [];

  const accountChoices = [
    { label: `${userLogin} (personal)`, value: userLogin },
    ...orgs.map(o => ({ label: `${o} (organization)`, value: o })),
  ];

  const accountRaw = await tui.select({
    message: 'Where should the repository live?',
    options: accountChoices,
    initialValue: userLogin,
  });
  if (tui.isCancel(accountRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const account = accountRaw;

  const visibilityRaw = await tui.select<'private' | 'public' | 'internal'>({
    message: 'Repository visibility?',
    options: [
      { label: 'private (default)', value: 'private' as const },
      { label: 'public', value: 'public' as const },
      { label: 'internal (org only)', value: 'internal' as const },
    ],
    initialValue: 'private' as const,
  });
  if (tui.isCancel(visibilityRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const visibility = visibilityRaw;

  const rawNameRaw = await tui.text({
    message: 'Repository name:',
    initialValue: defaultRepoName,
  });
  if (tui.isCancel(rawNameRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
  const rawName = rawNameRaw;
  const repoName = sanitizeRepoName(rawName);
  if (!repoName) {
    log.error('Invalid repository name. Skipping.');
    return;
  }

  log.info(`Creating ${account}/${repoName} (${visibility})…`);
  // Step 1: create remote (no push)
  const createRes = spawnSync('gh', [
    'repo',
    'create',
    `${account}/${repoName}`,
    `--${visibility}`,
    '--source=.',
    '--remote=origin',
  ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

  if (createRes.status !== 0) {
    log.error(`gh repo create failed (exit ${createRes.status}).`);
    if (createRes.stderr) { log.dim(`  ${createRes.stderr.trim()}`); }
    log.dim('  Remote was NOT created. Local files left intact. You can retry later.');
    return;
  }
  log.success(`Remote created: ${account}/${repoName}`);

  // Step 2: push (separate so we can distinguish failure modes)
  const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  const currentBranch = branchRes.status === 0 ? branchRes.stdout.trim() : 'main';
  const pushRes = spawnSync('git', ['push', '-u', 'origin', currentBranch], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (pushRes.status !== 0) {
    log.warn(`Remote was created but local push failed (exit ${pushRes.status}).`);
    if (pushRes.stderr) { log.dim(`  ${pushRes.stderr.trim()}`); }
    log.dim('  This usually means pre-push hooks rejected the push.');
    log.dim('  Fix the hook errors then retry:');
    log.dim(`    git push -u origin ${currentBranch}`);
    return;
  }
  log.success('Initial push succeeded.');

  const url = `https://github.com/${account}/${repoName}`;
  state.github = {
    account,
    repo: repoName,
    visibility,
    url,
    createdAt: new Date().toISOString(),
  };
  markStepDone(state, key);

  // Write template marker so re-runs of verifyRepoRoot() accept the renamed package.json.
  const markerPath = join(REPO_ROOT, '.template', 'installer.lock.json');
  if (!existsSync(markerPath)) {
    try {
      await mkdir(dirname(markerPath), { recursive: true });
      await writeFile(markerPath, `${JSON.stringify({ template: 'upex-galaxy/agentic-qa-boilerplate' }, null, 2)}\n`, 'utf8');
    }
    catch { /* best-effort */ }
  }

  log.success(`Repository created and pushed: ${url}`);
}

// ============================================================================
// Phase 4 — VERIFICATION
// Step 11 (11-verify-clis): verify external CLIs
// ============================================================================

interface CliResult {
  name: string
  status: CliStatus
  purpose: string
  install?: string
  docs: string
}

function installHintForOS(cli: { name: string, install?: string }): string {
  if (cli.install) { return cli.install; }
  if (process.platform === 'win32') { return `winget install ${cli.name}`; }
  if (process.platform === 'darwin') { return `brew install ${cli.name}`; }
  return `apt install ${cli.name}`;
}

function verifyExternalClis(state: InstallState): CliResult[] {
  const results: CliResult[] = EXTERNAL_CLIS.map((cli) => {
    const found = which(cli.name) !== null;
    const status: CliStatus = found ? 'found' : 'missing';
    state.externalClis[cli.name] = status;
    return { name: cli.name, status, purpose: cli.purpose, install: cli.install, docs: cli.docs };
  });

  const rows = results.map(r => [
    r.name,
    r.status === 'found' ? tui.statusIcon('ok') : tui.statusIcon('fail'),
    r.status === 'found' ? '' : installHintForOS(r),
    r.purpose,
  ]);
  process.stdout.write(`${tui.table(['CLI', 'Found', 'Install hint', 'Purpose'], rows)}\n`);

  // Hard-abort when any `required: true` CLI is missing. Escape hatch:
  // `INSTALL_SKIP_JIRA=1` downgrades the requirement (for non-Jira projects).
  if (!SKIP_JIRA) {
    const missingRequired = EXTERNAL_CLIS.filter(
      cli => cli.required === true && state.externalClis[cli.name] !== 'found',
    );
    for (const cli of missingRequired) {
      process.stdout.write(`\n${tui.statusIcon('fail')} ${cli.name} is required for Jira/Confluence integration but was not found on PATH.\n`);
      process.stdout.write(`    Install via: ${cli.docs}\n`);
      process.stdout.write('    Then re-run: bun run setup\n');
    }
    if (missingRequired.length > 0) {
      process.exit(1);
    }
  }

  return results;
}

// ============================================================================
// State persistence
// ============================================================================

async function loadPriorState(): Promise<InstallState | null> {
  if (!existsSync(STATE_PATH)) { return null; }
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as InstallState;
    // Back-fill postInstall for state files written before this field existed.
    parsed.postInstall ??= {
      agentsSetup: 'pending',
      acliAuth: 'pending',
      jiraSyncFields: 'pending',
      jiraSyncWorkflows: 'pending',
      jiraCheck: 'pending',
    };
    parsed.postInstall.acliAuth ??= 'pending';
    parsed.postInstall.jiraSyncWorkflows ??= 'pending';
    return parsed;
  }
  catch {
    log.warn(`Could not parse ${STATE_PATH}, starting fresh.`);
    return null;
  }
}

async function writeInstallState(state: InstallState): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  log.success(`Wrote ${STATE_PATH}`);
}

function buildInitialState(prior: InstallState | null): InstallState {
  if (prior && prior.version === 1) {
    // Ensure all sections exist on older state files (forward-compat).
    prior.steps ??= {};
    prior.postInstall ??= {
      agentsSetup: 'pending',
      acliAuth: 'pending',
      jiraSyncFields: 'pending',
      jiraSyncWorkflows: 'pending',
      jiraCheck: 'pending',
    };
    prior.postInstall.acliAuth ??= 'pending';
    prior.postInstall.jiraSyncWorkflows ??= 'pending';

    // Migrate legacy step booleans into the new steps: Record<string, string> format.
    if (prior.legacySteps) {
      const l = prior.legacySteps;
      if (l.depsInstalled && !prior.steps['5-deps-install']) {
        prior.steps['5-deps-install'] = prior.installedAt;
      }
      if (l.playwrightInstalled && !prior.steps['6-playwright']) {
        prior.steps['6-playwright'] = prior.installedAt;
      }
      if (l.agentsSetupRanAt && !prior.steps['7-agents-setup']) {
        prior.steps['7-agents-setup'] = l.agentsSetupRanAt;
      }
      if (l.gentleAiInstalledAt && !prior.steps['8-skills-gentle-ai']) {
        prior.steps['8-skills-gentle-ai'] = l.gentleAiInstalledAt;
      }
      if (l.communitySkillsInstalledAt) {
        if (!prior.steps['9-skills-community-project']) {
          prior.steps['9-skills-community-project'] = l.communitySkillsInstalledAt;
        }
        if (!prior.steps['9-skills-community-global']) {
          prior.steps['9-skills-community-global'] = l.communitySkillsInstalledAt;
        }
      }
      if (l.githubRemoteWiredAt && !prior.steps['13-github-repo']) {
        prior.steps['13-github-repo'] = l.githubRemoteWiredAt;
      }
    }

    return {
      ...prior,
      steps: prior.steps,
      skills: prior.skills ?? {},
      mcps: prior.mcps ?? {},
      externalClis: prior.externalClis ?? {},
      pendingEnvVars: prior.pendingEnvVars ?? [],
    };
  }
  return {
    version: 1,
    installedAt: new Date().toISOString(),
    agents: [],
    gentleAi: { status: 'missing', checkedAt: new Date().toISOString() },
    steps: {},
    skills: {},
    mcps: {},
    externalClis: {},
    pendingEnvVars: [],
    postInstall: {
      agentsSetup: 'pending',
      acliAuth: 'pending',
      jiraSyncFields: 'pending',
      jiraSyncWorkflows: 'pending',
      jiraCheck: 'pending',
    },
  };
}

// ============================================================================
// Phase 5 — INITIAL CONFIGURATION
// Ported from sibling runPostInstallSteps() — Steps 7, 12.4, 13, 13b, 14
// ============================================================================

/**
 * Reload .env in-process so that values edited by the user during the Jira
 * auth-retry loop are visible without a shell restart.
 */
export function reloadDotEnv(): void {
  try {
    const envPath = resolve(process.cwd(), '.env');
    if (!existsSync(envPath)) { return; }
    const content = readFileSync(envPath, 'utf8');
    for (const raw of content.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) { continue; }
      const eq = line.indexOf('=');
      if (eq < 0) { continue; }
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      // Strip only a *matched* surrounding quote pair — a lone quote is part of
      // the value (e.g. a password) and must not be mangled.
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith('\'') && v.endsWith('\''))) {
        v = v.slice(1, -1);
      }
      // Don't overwrite an already-populated value with an empty one from .env.
      if (k && (v !== '' || !process.env[k])) { process.env[k] = v; }
    }
  }
  catch {
    // best-effort — silently continue
  }
}

/**
 * Interactive loop that checks Atlassian credentials (ATLASSIAN_URL /
 * ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN) and probes /rest/api/3/myself.
 * Up to 5 attempts; lets the user skip at any time.
 */
async function jiraAuthLoop(): Promise<'authenticated' | 'skipped'> {
  const probe = async (): Promise<{ ok: boolean, reason: string }> => {
    const url = process.env.ATLASSIAN_URL;
    const email = process.env.ATLASSIAN_EMAIL;
    const token = process.env.ATLASSIAN_API_TOKEN;
    const missing: string[] = [];
    if (!url) { missing.push('ATLASSIAN_URL'); }
    if (!email) { missing.push('ATLASSIAN_EMAIL'); }
    if (!token) { missing.push('ATLASSIAN_API_TOKEN'); }
    if (missing.length > 0) {
      return { ok: false, reason: `Missing env vars: ${missing.join(', ')}` };
    }
    try {
      const auth = Buffer.from(`${email}:${token}`).toString('base64');
      const res = await fetch(`${url!.replace(/\/$/, '')}/rest/api/3/myself`, {
        method: 'GET',
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) { return { ok: true, reason: 'authenticated' }; }
      return {
        ok: false,
        reason: `HTTP ${res.status} from ${url}/rest/api/3/myself — check ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN`,
      };
    }
    catch (err) {
      return { ok: false, reason: `Network error: ${(err as Error).message}` };
    }
  };

  for (let attempt = 1; attempt <= 5; attempt++) {
    const { ok, reason } = await probe();
    if (ok) {
      process.stdout.write(`${tui.statusIcon('ok')} Jira auth verified.\n`);
      return 'authenticated';
    }
    process.stdout.write(`${tui.statusIcon('fail')} Jira auth failed: ${reason}\n`);

    // Show actionable guidance once on first failure
    if (attempt === 1) {
      tui.note(
        [
          '1. Open .env in your editor.',
          '2. Set the three Atlassian variables:',
          '     ATLASSIAN_URL=https://your-org.atlassian.net',
          '     ATLASSIAN_EMAIL=your-email@example.com',
          '     ATLASSIAN_API_TOKEN=...',
          '     (Get a token at https://id.atlassian.com/manage-profile/security/api-tokens)',
          '3. Save the file. dotenv auto-loads on the next probe — no shell reload needed.',
        ].join('\n'),
        'Fix Atlassian credentials',
      );
    }

    const choice = await tui.select<'retry' | 'skip'>({
      message: `Attempt ${attempt} / 5 — what now?`,
      options: [
        { value: 'retry', label: 'I fixed .env — retry' },
        { value: 'skip', label: 'Skip Jira steps for now (re-run later with bun run jira:sync-fields)' },
      ],
    });
    if (tui.isCancel(choice) || choice === 'skip') { return 'skipped'; }

    // Re-load .env before next probe so edits the user just made are visible
    reloadDotEnv();
  }

  process.stdout.write(`${tui.statusIcon('warn')} Max attempts reached — skipping Jira steps.\n`);
  return 'skipped';
}

/**
 * Stderr marker emitted by `scripts/sync-jira-fields.ts` and
 * `scripts/sync-jira-workflows.ts` when the authenticated Jira user does not
 * have Administer permission. The script exits 0 in that case (lack of admin
 * is not a failure — the user can still use the repo with the boilerplate's
 * bundled JSON), so we rely on this marker to distinguish a true success from
 * a graceful skip.
 */
const JIRA_SKIP_NO_ADMIN_MARKER = '[JIRA_SYNC_SKIPPED_NO_ADMIN]';

/**
 * Run a Jira sync script while teeing its stderr through this process. Looks
 * for the `[JIRA_SYNC_SKIPPED_NO_ADMIN]` marker to detect the no-admin skip
 * path. Returns `'skipped-no-admin'` when the marker appears (exit code is
 * 0 in that case), `'completed'` on plain success, or `'failed'` on non-zero
 * exit without the marker.
 */
function runJiraSyncCapturingMarker(
  args: string[],
): 'completed' | 'failed' | 'skipped-no-admin' {
  const child = spawnSync('bun', args, {
    stdio: ['inherit', 'inherit', 'pipe'],
  });
  const stderrText = child.stderr ? child.stderr.toString('utf8') : '';
  if (stderrText) {
    process.stderr.write(stderrText);
  }
  if (stderrText.includes(JIRA_SKIP_NO_ADMIN_MARKER)) {
    return 'skipped-no-admin';
  }
  if (child.status === 0) {
    return 'completed';
  }
  return 'failed';
}

/**
 * PHASE 5 — INITIAL CONFIGURATION
 *
 * Steps:
 *   7-agents-setup        bun run agents:setup (.agents/project.yaml)
 *   12.4-acli-auth        Atlassian credentials + acli session login
 *   13-jira-sync-fields   jira auth loop + bun run jira:sync-fields
 *   13b-jira-sync-workflows bun run jira:sync-workflows
 *   14-jira-check         bun run jira:check
 *
 * NON_INTERACTIVE skips this entire phase cleanly — each step is marked
 * 'skipped-non-interactive' in state.postInstall.
 */
async function runInitialConfigurationPhase(state: InstallState): Promise<void> {
  // ── Step 7: agents:setup (project.yaml populator) ────────────────────────
  tui.section('Step 7: Project metadata (.agents/project.yaml)');

  if (state.postInstall.agentsSetup === 'completed' && !FORCE_AGENTS_SETUP) {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run. Re-run via: bun run agents:setup\n`);
  }
  else if (SKIP_AGENTS_SETUP) {
    log.dim('  INSTALL_SKIP_AGENTS_SETUP=1, skipping agents:setup.');
    state.postInstall.agentsSetup = 'skipped-non-interactive';
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.agentsSetup = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run agents:setup\n`);
  }
  else {
    const proceed = await maybeConfirm(
      'Run `bun run agents:setup` to populate `.agents/project.yaml` (interactive)?',
      true,
    );
    if (!proceed) {
      log.warn('Skipping agents:setup. Run it later: bun run agents:setup');
      state.postInstall.agentsSetup = 'skipped-non-interactive';
    }
    else {
      const args = ['run', 'agents:setup'];
      if (NON_INTERACTIVE) { args.push('--', '--non-interactive'); }
      log.info(`Running: bun ${args.join(' ')}`);
      const res = spawnSync('bun', args, { stdio: 'inherit' });
      state.postInstall.agentsSetup = res.status === 0 ? 'completed' : 'failed';
      if (res.status === 0) {
        process.stdout.write(`${tui.statusIcon('ok')} agents:setup completed\n`);
      }
      else {
        process.stdout.write(`${tui.statusIcon('fail')} agents:setup exited with ${res.status}. Continuing.\n`);
      }
    }
  }

  // ── Step 12.4: Atlassian credentials & acli authentication ──────────────
  tui.section('Step 12.4: Atlassian credentials & acli authentication');

  const MANUAL_ACLI_LOGIN = 'echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$ATLASSIAN_URL" --email "$ATLASSIAN_EMAIL" --token';

  if (state.postInstall.acliAuth === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} acli already authenticated in a prior run.\n`);
  }
  else if (SKIP_JIRA) {
    state.postInstall.acliAuth = 'skipped-non-interactive';
    log.dim('  INSTALL_SKIP_JIRA=1, skipping acli authentication.');
  }
  else {
    // ATLASSIAN_* credentials were collected during Step 10b (day-0 creds).
    // Here we only verify they're present and run the acli auth.
    const ATLASSIAN_VARS = ['ATLASSIAN_URL', 'ATLASSIAN_EMAIL', 'ATLASSIAN_API_TOKEN'] as const;
    const stillMissing = ATLASSIAN_VARS.filter(v => !(process.env[v] && process.env[v].trim().length > 0));
    if (stillMissing.length > 0) {
      state.postInstall.acliAuth = 'skipped-non-interactive';
      process.stdout.write(`${tui.statusIcon('fail')} Cannot run acli auth — ATLASSIAN_* still missing: ${stillMissing.join(', ')}\n`);
      process.stdout.write('    Set them in .env (re-run setup) or run manually:\n');
      process.stdout.write(`    ${MANUAL_ACLI_LOGIN}\n`);
      await writeInstallState(state);
      process.exit(1);
    }

    // Probe existing session: a read-only Jira search returns exit 0 if a session exists.
    const probe = spawnSync('acli', ['jira', 'workitem', 'search', '--jql', 'created >= -1d', '--limit', '1', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 8000,
    });

    if (probe.status === 0) {
      state.postInstall.acliAuth = 'completed';
      process.stdout.write(`${tui.statusIcon('ok')} acli already authenticated (existing session detected).\n`);
    }
    else {
      // No session — run the login. Pipe the token via spawnSync `input` to
      // avoid shell injection risks (no `echo $TOKEN | ...` expansion).
      const url = process.env.ATLASSIAN_URL;
      const email = process.env.ATLASSIAN_EMAIL;
      let token = process.env.ATLASSIAN_API_TOKEN;

      if (!url || !email || !token) {
        // Non-interactive without all three vars preloaded → hard fail.
        state.postInstall.acliAuth = 'skipped-non-interactive';
        process.stdout.write(`${tui.statusIcon('fail')} Cannot run acli auth login — ATLASSIAN_URL / ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN missing.\n`);
        process.stdout.write(`    Manual auth: ${MANUAL_ACLI_LOGIN}\n`);
        await writeInstallState(state);
        process.exit(1);
      }

      const MAX_ATTEMPTS = 3;
      let success = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const loginRes = spawnSync(
          'acli',
          ['jira', 'auth', 'login', '--site', url, '--email', email, '--token'],
          {
            input: token,
            stdio: ['pipe', 'inherit', 'inherit'],
            timeout: 15000,
          },
        );
        if (loginRes.status === 0) {
          state.postInstall.acliAuth = 'completed';
          process.stdout.write(`${tui.statusIcon('ok')} acli session created. Subsequent acli commands won't need re-auth.\n`);
          success = true;
          break;
        }

        process.stdout.write(`${tui.statusIcon('fail')} acli auth login failed (attempt ${attempt}/${MAX_ATTEMPTS}, exit ${loginRes.status}).\n`);
        if (attempt < MAX_ATTEMPTS) {
          if (AUTO_NON_INTERACTIVE) {
            // Can't re-prompt without a TTY — break out of the retry loop.
            break;
          }
          const retryToken = await promptForVar('ATLASSIAN_API_TOKEN');
          if (retryToken.length === 0) { break; }
          token = retryToken;
          process.env.ATLASSIAN_API_TOKEN = retryToken;
          await appendVarsToEnv({ ATLASSIAN_API_TOKEN: retryToken });
          reloadDotEnv();
        }
      }

      if (!success) {
        state.postInstall.acliAuth = 'failed';
        process.stdout.write(`${tui.statusIcon('fail')} acli auth login failed after ${MAX_ATTEMPTS} attempts.\n`);
        process.stdout.write(`    Manual auth: ${MANUAL_ACLI_LOGIN}\n`);
        await writeInstallState(state);
        process.exit(1);
      }
    }
  }

  // ── Step 13: Jira fields sync (with auth pre-flight loop) ─────────────────
  tui.section('Step 13: Jira fields sync');

  if (SKIP_JIRA) {
    log.dim('  INSTALL_SKIP_JIRA=1, skipping Jira bootstrap.');
    state.postInstall.jiraSyncFields = 'skipped-non-interactive';
  }
  else if (state.postInstall.jiraSyncFields === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.jiraSyncFields = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run jira:sync-fields\n`);
  }
  else {
    const authResult = await jiraAuthLoop();
    if (authResult === 'skipped') {
      state.postInstall.jiraSyncFields = 'skipped-no-auth';
      process.stdout.write(`${tui.statusIcon('warn')} Skipped by user. Re-run via: bun run jira:sync-fields\n`);
    }
    else {
      // We're here only when jiraSyncFields is not 'completed' (early-exit
      // upstream returns when it is). That means this is a first-run pass, so
      // we always force-overwrite the template's stale jira-fields.json. The
      // script's safety check still protects user edits in later sessions
      // because the early-exit guard above short-circuits subsequent runs.
      const syncArgs = ['run', 'jira:sync-fields', '--', '--force'];
      const outcome = runJiraSyncCapturingMarker(syncArgs);
      state.postInstall.jiraSyncFields = outcome;
      if (outcome === 'completed') {
        process.stdout.write(`${tui.statusIcon('ok')} jira:sync-fields completed\n`);
      }
      else if (outcome === 'skipped-no-admin') {
        process.stdout.write(`${tui.statusIcon('warn')} jira:sync-fields skipped — your Jira user is not an Administrator.\n`);
        process.stdout.write('  The boilerplate-bundled .agents/jira-fields.json stays as-is (repo still works).\n');
        process.stdout.write('  Options: ask a Jira admin to run `bun run jira:sync-fields` and commit the result,\n');
        process.stdout.write('           or download the UPEX standard catalog via `bun run jira:sync-fields --upex`.\n');
      }
      else {
        process.stdout.write(`${tui.statusIcon('fail')} jira:sync-fields failed. Continuing.\n`);
      }
    }
  }

  // ── Step 13b: Jira workflows + statuses sync ─────────────────────────────
  tui.section('Step 13b: Jira workflows + statuses sync');

  if (SKIP_JIRA) {
    state.postInstall.jiraSyncWorkflows = 'skipped-non-interactive';
    log.dim('  INSTALL_SKIP_JIRA=1, skipping jira:sync-workflows.');
  }
  else if (state.postInstall.jiraSyncWorkflows === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.jiraSyncWorkflows = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run jira:sync-workflows\n`);
  }
  else if (state.postInstall.jiraSyncFields === 'skipped-no-admin') {
    // Same root cause — admin permission missing. Skip to keep messages consistent.
    state.postInstall.jiraSyncWorkflows = 'skipped-no-admin';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped — jira:sync-fields detected no Administer permission. Same applies here.\n`);
    process.stdout.write('  UPEX-standard alternative: `bun run jira:sync-workflows --upex`.\n');
  }
  else if (state.postInstall.jiraSyncFields !== 'completed') {
    state.postInstall.jiraSyncWorkflows = 'skipped-no-auth';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped — jira:sync-fields did not complete (uses same Atlassian credentials).\n`);
  }
  else {
    const outcome = runJiraSyncCapturingMarker(['run', 'jira:sync-workflows']);
    state.postInstall.jiraSyncWorkflows = outcome;
    if (outcome === 'completed') {
      process.stdout.write(`${tui.statusIcon('ok')} jira:sync-workflows completed\n`);
    }
    else if (outcome === 'skipped-no-admin') {
      process.stdout.write(`${tui.statusIcon('warn')} jira:sync-workflows skipped — your Jira user is not an Administrator.\n`);
      process.stdout.write('  The boilerplate-bundled .agents/jira-workflows.json stays as-is (repo still works).\n');
      process.stdout.write('  UPEX-standard alternative: `bun run jira:sync-workflows --upex`.\n');
    }
    else {
      process.stdout.write(`${tui.statusIcon('fail')} jira:sync-workflows failed. Continuing.\n`);
    }
  }

  // ── Step 14: Jira manifest check ─────────────────────────────────────────
  tui.section('Step 14: Jira manifest check');

  if (SKIP_JIRA) {
    state.postInstall.jiraCheck = 'skipped-non-interactive';
    log.dim('  INSTALL_SKIP_JIRA=1, skipping jira:check.');
  }
  else if (state.postInstall.jiraCheck === 'completed') {
    process.stdout.write(`${tui.statusIcon('ok')} Already completed in a prior run.\n`);
  }
  else if (AUTO_NON_INTERACTIVE) {
    state.postInstall.jiraCheck = 'skipped-non-interactive';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped (no TTY). Re-run via: bun run jira:check\n`);
  }
  else if (
    state.postInstall.jiraSyncFields === 'skipped-no-admin'
    || state.postInstall.jiraSyncWorkflows === 'skipped-no-admin'
  ) {
    state.postInstall.jiraCheck = 'skipped-prereq';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped — Jira sync was no-admin (boilerplate JSON in use). jira:check would compare against the upstream catalog, not yours.\n`);
    process.stdout.write('  After downloading UPEX standard with `--upex`, you can run: bun run jira:check\n');
  }
  else if (state.postInstall.jiraSyncFields !== 'completed' || state.postInstall.jiraSyncWorkflows !== 'completed') {
    state.postInstall.jiraCheck = 'skipped-prereq';
    process.stdout.write(`${tui.statusIcon('warn')} Skipped — Jira sync prerequisites incomplete (need both fields + workflows). Re-run via: bun run jira:check\n`);
  }
  else {
    const res = spawnSync('bun', ['run', 'jira:check'], { stdio: 'inherit' });
    state.postInstall.jiraCheck = res.status === 0 ? 'completed' : 'failed';
    if (res.status === 0) {
      process.stdout.write(`${tui.statusIcon('ok')} jira:check completed\n`);
    }
    else {
      process.stdout.write(`${tui.statusIcon('fail')} jira:check exited with ${res.status}. Continuing.\n`);
    }
  }
}

// ============================================================================
// Helpers — closing summary
// ============================================================================

function recommendedPackageManager(): { label: string, install: string, url: string } {
  if (process.platform === 'win32') {
    return {
      label: 'Scoop',
      install: 'irm get.scoop.sh | iex',
      url: 'https://scoop.sh/',
    };
  }
  return {
    label: 'Homebrew',
    install: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    url: 'https://brew.sh/',
  };
}

function statusFor(found: number, total: number): string {
  if (total === 0) { return `${tui.statusIcon('info')} n/a`; }
  if (found === total) { return `${tui.statusIcon('ok')} complete`; }
  return `${tui.statusIcon('warn')} ${total - found} pending`;
}

// ============================================================================
// Closing summary
// ============================================================================

/**
 * Print the "Next steps — finish later" block: every NON-critical manifest var
 * that is still empty in `.env`, each with its `obtainHint`. These are NEVER
 * asked at install and NEVER warned about — they live here so the user knows
 * where to get them and that `bun run setup --variables` sets them.
 *
 * Excluded: TEST_ENV (carries a default the installer already wrote). DEV-only
 * infra-autogenerated vars (Supabase/Vercel) do not exist in the QA manifest,
 * so nothing further to exclude here.
 */
function printNonCriticalNextSteps(): void {
  let envValues: Record<string, string> = {};
  if (existsSync(ENV_PATH)) {
    try { envValues = parseEnvFile(readFileSync(ENV_PATH, 'utf8')); }
    catch { /* unreadable .env → treat all as empty */ }
  }

  const pending = nonCriticalVars().filter((spec) => {
    if (spec.defaultValue !== undefined) { return false; } // e.g. TEST_ENV
    const value = (envValues[spec.name] ?? '').trim();
    return value.length === 0;
  });

  if (pending.length === 0) { return; }

  tui.section('Next steps — finish later (non-critical vars)');
  process.stdout.write(`  ${COLORS.dim}These are project-dependent — not needed to start. Set them with:${COLORS.reset}\n`);
  process.stdout.write(`      ${COLORS.cyan}bun run setup --variables${COLORS.reset}\n\n`);
  for (const spec of pending) {
    process.stdout.write(`  • ${COLORS.bold}${spec.name}${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}${spec.obtainHint ?? ''}${COLORS.reset}\n`);
  }
  process.stdout.write('\n');
}

function printClosingSummary(state: InstallState): void {
  const allSkillEntries = Object.entries(state.skills);
  const gentleAiSkills = allSkillEntries.filter(([k]) => k.includes('::'));
  const projectCommunity = allSkillEntries.filter(([k]) => k.startsWith('community:project:'));
  const userCommunity = allSkillEntries.filter(([k]) => k.startsWith('community:global:'));

  const gentleAiInstalled = gentleAiSkills.filter(([, s]) => s === 'installed').length;
  const projectInstalled = projectCommunity.filter(([, s]) => s === 'installed').length;
  const userInstalled = userCommunity.filter(([, s]) => s === 'installed').length;

  const mcpConfigured = Object.values(state.mcps).filter(
    s => s === 'configured-with-key' || s === 'configured-no-key',
  ).length;
  const mcpPlaceholder = Object.values(state.mcps).filter(s => s === 'placeholder').length;
  const mcpTotal = CANONICAL_MCPS.length;

  const cliFound = Object.values(state.externalClis).filter(s => s === 'found').length;
  const cliTotal = Object.keys(state.externalClis).length;
  const cliMissing = Object.entries(state.externalClis)
    .filter(([, s]) => s === 'missing')
    .map(([name]) => name);

  // Read project name from package.json for headline box
  let projectName = REPO_NAME;
  try {
    const pkgRaw = readFileSync(join(REPO_ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { name?: string };
    if (pkg.name) { projectName = pkg.name; }
  }
  catch { /* fallback to default */ }

  // Headline success box
  process.stdout.write('\n');
  process.stdout.write(`${tui.successBox([
    `${tui.statusIcon('ok')}  Installer complete.  Project: ${projectName}`,
  ])}\n`);

  // Stats table
  process.stdout.write(tui.table(
    ['Category', 'Installed', 'Total', 'Status'],
    [
      ['gentle-ai skills', `${gentleAiInstalled}`, `${gentleAiSkills.length}`, statusFor(gentleAiInstalled, gentleAiSkills.length)],
      ['Project skills', `${projectInstalled}`, `${projectCommunity.length}`, statusFor(projectInstalled, projectCommunity.length)],
      ['User skills', `${userInstalled}`, `${userCommunity.length}`, statusFor(userInstalled, userCommunity.length)],
      ['MCPs configured', `${mcpConfigured}`, `${mcpTotal}`, `${statusFor(mcpConfigured, mcpTotal)}${mcpPlaceholder > 0 ? ` (${mcpPlaceholder} placeholder)` : ''}`],
      ['External CLIs', `${cliFound}`, `${cliTotal}`, statusFor(cliFound, cliTotal)],
    ],
  ));
  process.stdout.write('\n');

  if (state.pendingEnvVars.length > 0) {
    process.stdout.write(`${COLORS.dim}  Pending env vars: ${state.pendingEnvVars.join(', ')}${COLORS.reset}\n\n`);
  }

  // REQUIRED section
  tui.section('REQUIRED — do these now, in this order');
  const circled = ['⓪', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  let stepNum = 0;

  if (state.pendingEnvVars.length > 0) {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Fill missing env vars${COLORS.reset}  ${COLORS.yellow}(BLOCKS the agent from working with MCPs)${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}Edit .env → set: ${state.pendingEnvVars.join(', ')}${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Without these, MCP servers will 401/403 silently.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.agentsSetup !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Configure project metadata${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run agents:setup${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Writes .agents/project.yaml. Agents read this for every command.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.acliAuth !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Authenticate acli (Atlassian CLI)${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}echo "$ATLASSIAN_API_TOKEN" | acli jira auth login --site "$ATLASSIAN_URL" --email "$ATLASSIAN_EMAIL" --token${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Writes a persistent session to ~/.config/acli/. The /acli skill needs this.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.jiraSyncFields !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Sync Jira custom fields${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run jira:sync-fields${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Caches your Jira workspace's custom field IDs. Required for /acli skill.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.jiraSyncWorkflows !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Sync Jira workflows + statuses${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run jira:sync-workflows${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Caches your Jira workspace's statuses + transitions. Required for /acli + skill prompts.${COLORS.reset}\n\n`);
    stepNum++;
  }

  if (state.postInstall.jiraCheck !== 'completed') {
    process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Validate Jira manifest${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.cyan}bun run jira:check${COLORS.reset}\n`);
    process.stdout.write(`    ${COLORS.dim}Confirms .agents/jira-required.yaml matches your workspace.${COLORS.reset}\n\n`);
    stepNum++;
  }

  process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Open the agent${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}bun claude${COLORS.reset}       ${COLORS.dim}(dotenv-cli loads .env)${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}bun opencode${COLORS.reset}     ${COLORS.dim}(dotenv-cli loads .env)${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.dim}Or just \`claude\` / \`opencode\` if direnv autoload is set up.${COLORS.reset}\n\n`);
  stepNum++;

  process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Tour the stack${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}/agentic-qa-onboard${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.dim}Explains the QA workflow pipeline (sprint-testing → automation → regression).${COLORS.reset}\n\n`);
  stepNum++;

  process.stdout.write(`${circled[stepNum]}  ${COLORS.bold}Map your project${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.cyan}/project-discovery${COLORS.reset}\n`);
  process.stdout.write(`    ${COLORS.dim}Reverse-engineers your target app → generates PRD, SRS, domain glossary.${COLORS.reset}\n\n`);
  stepNum++;

  // GitHub repository block
  process.stdout.write('\n');
  tui.section('GitHub repository');
  if (state.github) {
    process.stdout.write(`  URL        : ${state.github.url}\n`);
    process.stdout.write(`  Visibility : ${state.github.visibility}\n`);
    process.stdout.write('  Remote     : origin (pushed)\n\n');
    process.stdout.write(`${COLORS.bold}GitHub follow-ups (manual):${COLORS.reset}\n`);
    process.stdout.write('  • Push Actions secrets automatically:\n');
    process.stdout.write(`      ${COLORS.cyan}bun run setup --variables --variables-remote${COLORS.reset}  (gated; values via stdin, never printed)\n`);
    process.stdout.write('    Or add manually at:\n');
    process.stdout.write(`      ${state.github.url}/settings/secrets/actions\n`);
    process.stdout.write('    GitHub-bound secrets (derived from the variable manifest):\n');
    // Names sourced from varsFor('github') so this can't drift from the manifest.
    for (const spec of varsFor('github')) {
      process.stdout.write(`      - ${spec.name}\n`);
    }
    process.stdout.write(`  • Move repo to org later:  gh repo transfer ${state.github.account}/${state.github.repo} <org>\n\n`);
  }
  else {
    process.stdout.write('  Not created during install. To wire later:\n');
    process.stdout.write('      gh auth login   # if not authenticated\n');
    process.stdout.write('      gh repo create --source=. --remote=origin --push\n\n');
  }

  // Project metadata follow-ups (QA-specific)
  tui.section('Project metadata follow-ups');
  process.stdout.write('  • Jira project key — edit `.agents/project.yaml` → `project.project_key`\n');
  process.stdout.write('    Then run:  bun run jira:sync-fields && bun run jira:check\n\n');
  process.stdout.write('  • Bootstrap KATA manifest once:  bun run kata:manifest\n');
  process.stdout.write('    Validate:                       bun run kata:manifest:check\n\n');
  process.stdout.write('  • Adapt KATA to your stack:      /adapt-framework\n');
  process.stdout.write('    (removes example tests + business maps; wires fixtures to your stack)\n\n');

  // Next steps — non-critical vars still empty in .env (manifest-driven).
  printNonCriticalNextSteps();

  // QA workflow quick reference
  tui.section('QA workflow quick reference');
  process.stdout.write(`  ${COLORS.bold}/shift-left-testing${COLORS.reset}      Pre-sprint AC refinement on a backlog batch — Stage 0\n`);
  process.stdout.write(`  ${COLORS.bold}/sprint-testing${COLORS.reset}          Manual QA per ticket — Stage 1-3 (Planning → Execution → Reporting)\n`);
  process.stdout.write(`  ${COLORS.bold}/test-documentation${COLORS.reset}      TMS docs + ROI scoring — Stage 4\n`);
  process.stdout.write(`  ${COLORS.bold}/test-automation${COLORS.reset}         Write KATA+Playwright automated tests — Stage 5\n`);
  process.stdout.write(`  ${COLORS.bold}/regression-testing${COLORS.reset}      Regression / GO-NO-GO — Stage 6\n`);
  process.stdout.write(`  ${COLORS.bold}bun xray${COLORS.reset}                 Xray Cloud CLI (bun run xray --help for all commands)\n\n`);

  // Missing CLIs
  if (cliMissing.length > 0) {
    tui.section('Missing CLIs — install when ready');
    for (const name of cliMissing) {
      const cliDef = EXTERNAL_CLIS.find(c => c.name === name);
      const docsUrl = cliDef?.docs ?? '(see upstream docs)';
      process.stdout.write(`  • ${name.padEnd(16)} ${COLORS.cyan}${docsUrl}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');

    const pm = recommendedPackageManager();
    process.stdout.write(`${COLORS.bold}Recommended system package manager:${COLORS.reset} ${pm.label} — ${pm.url}\n`);
    process.stdout.write(`  ${COLORS.dim}Install with:${COLORS.reset} ${pm.install}\n\n`);
  }

  // Optional UX upgrades
  tui.section('OPTIONAL — install when you have time');

  process.stdout.write('→  caveman — token compression skill (recommended)\n');
  process.stdout.write(`   ${COLORS.dim}Cuts ~65-75% output tokens. Levels: lite | full (default) | ultra | wenyan.${COLORS.reset}\n`);
  process.stdout.write(`   ${COLORS.dim}Stop with: "normal mode" / "habla normal".${COLORS.reset}\n`);
  if (process.platform === 'win32') {
    process.stdout.write('   irm https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.ps1 | iex\n');
  }
  else {
    process.stdout.write('   curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash\n');
  }
  process.stdout.write(`   ${COLORS.dim}Docs: https://github.com/JuliusBrussee/caveman${COLORS.reset}\n\n`);

  process.stdout.write('→  ccstatusline — Claude Code statusline TUI configurator (cosmetic)\n');
  process.stdout.write(`   ${COLORS.dim}Customize the bottom statusline (model, tokens, git branch, usage, etc.).${COLORS.reset}\n`);
  process.stdout.write(`   ${COLORS.yellow}Run in a SEPARATE terminal with NO agent active${COLORS.reset} ${COLORS.dim}— concurrent TUIs fight over stdin.${COLORS.reset}\n`);
  process.stdout.write('   bunx -y ccstatusline@latest\n');
  process.stdout.write(`   ${COLORS.dim}Docs: https://github.com/sirmalloc/ccstatusline${COLORS.reset}\n\n`);

  process.stdout.write('→  Warp terminal users — install Claude Code plugin:\n');
  process.stdout.write(`   ${COLORS.cyan}/plugin install warp@claude-code-warp${COLORS.reset}\n`);
  process.stdout.write(`   ${COLORS.dim}Docs: https://docs.warp.dev/agent-platform/cli-agents/claude-code/${COLORS.reset}\n\n`);

  process.stdout.write('→  OpenCode Warp plugin: already wired in opencode.jsonc via the "plugin" field.\n');
  process.stdout.write(`   ${COLORS.dim}Docs: https://docs.warp.dev/agent-platform/cli-agents/opencode/${COLORS.reset}\n\n`);

  // AI personality
  process.stdout.write(`→  Curious who you're talking to? Read ${COLORS.cyan}docs/ai-personality.md${COLORS.reset}\n\n`);

  // Reference
  tui.section('REFERENCE');
  process.stdout.write(`docs   ${COLORS.cyan}README.md${COLORS.reset}   ·   ${COLORS.cyan}INSTALLER.md${COLORS.reset}   ·   ${COLORS.cyan}.agents/README.md${COLORS.reset}\n`);
  if (state.github) {
    process.stdout.write(`GitHub repo: ${COLORS.cyan}${state.github.url}${COLORS.reset} (${state.github.visibility})\n`);
  }
  process.stdout.write('\n');

  // Final tip box
  process.stdout.write(`${tui.successBox([
    'Re-run anytime: bun run setup  (idempotent — completed steps are skipped)',
  ])}\n`);
}

// ============================================================================
// Skill URL validation (--validate-skills)
// ============================================================================
//
// Smoke-test mode: probes every entry in PROJECT_LEVEL_SKILLS + USER_LEVEL_SKILLS
// against the skills.sh registry via a HEAD request. Does NOT install anything.
// Exits 0 if every entry is reachable, 1 otherwise.

function normalizeOwnerRepo(pkg: string): { owner: string, repo: string } | null {
  const ghMatch = pkg.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (ghMatch) { return { owner: ghMatch[1], repo: ghMatch[2] }; }
  const shortMatch = pkg.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (shortMatch) { return { owner: shortMatch[1], repo: shortMatch[2] }; }
  return null;
}

async function probeSkillsRegistry(pkg: string, skill?: string): Promise<{ status: 'ok' | 'fail' | 'skip', detail: string }> {
  const norm = normalizeOwnerRepo(pkg);
  if (!norm) { return { status: 'skip', detail: 'non-github source — not on skills.sh' }; }
  const path = skill && skill !== '*'
    ? `${norm.owner}/${norm.repo}/${skill}`
    : `${norm.owner}/${norm.repo}`;
  const url = `https://skills.sh/${path}`;
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) { return { status: 'ok', detail: `HTTP ${res.status}` }; }
    return { status: 'fail', detail: `HTTP ${res.status} at ${url}` };
  }
  catch (err: unknown) {
    return { status: 'fail', detail: `network error: ${(err as Error).message}` };
  }
}

async function validateSkills(): Promise<number> {
  log.banner('Skill URL validation (smoke test)');
  log.dim('  Probes skills.sh registry for every entry. No install, no side effects.');
  process.stdout.write('\n');

  const all: Array<{ level: 'project' | 'user', item: CommunitySkill }> = [
    ...PROJECT_LEVEL_SKILLS.map(item => ({ level: 'project' as const, item })),
    ...USER_LEVEL_SKILLS.map(item => ({ level: 'user' as const, item })),
  ];

  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failures: string[] = [];

  for (const { level, item } of all) {
    const slug = describeSkill(item);
    const result = await probeSkillsRegistry(item.package, item.skill);
    const tag = `[${level}]`.padEnd(10);
    if (result.status === 'ok') {
      log.success(`  ${tag} ${slug}`);
      okCount++;
    }
    else if (result.status === 'skip') {
      log.dim(`  ${tag} ${slug} — skipped (${result.detail})`);
      skipCount++;
    }
    else {
      log.error(`  ${tag} ${slug} — ${result.detail}`);
      failures.push(`${level}:${slug}`);
      failCount++;
    }
  }

  process.stdout.write('\n');
  log.banner('Validation summary');
  process.stdout.write(`  ${COLORS.green}OK${COLORS.reset}      : ${okCount}\n`);
  process.stdout.write(`  ${COLORS.yellow}SKIPPED${COLORS.reset} : ${skipCount}  ${COLORS.dim}(non-github sources)${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.red}FAILED${COLORS.reset}  : ${failCount}\n`);
  if (failures.length > 0) {
    process.stdout.write('\n');
    process.stdout.write(`${COLORS.bold}Broken entries (fix cli/install.ts before next publish):${COLORS.reset}\n`);
    for (const f of failures) { process.stdout.write(`  - ${f}\n`); }
  }
  process.stdout.write('\n');
  return failCount > 0 ? 1 : 0;
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // --validate-skills: smoke-test mode. Probes skills.sh for every entry and exits.
  if (process.argv.includes('--validate-skills')) {
    const code = await validateSkills();
    process.exit(code);
  }

  // --variables: run ONLY the env-var setup flow (idempotent local upsert +
  // gated GitHub-secret push), then exit — bypassing the normal install
  // pipeline. All logic lives in cli/lib/variables-flow.ts (manifest-driven).
  if (VARIABLES_MODE) {
    let mode: 'local' | 'remote' | 'both' = 'both';
    let explicitMode = true;
    if (process.argv.includes('--variables-local')) { mode = 'local'; }
    else if (process.argv.includes('--variables-remote')) { mode = 'remote'; }
    else if (VARIABLES_MODE_ARG === 'local' || VARIABLES_MODE_ARG === 'remote' || VARIABLES_MODE_ARG === 'both') {
      mode = VARIABLES_MODE_ARG;
    }
    else {
      // No mode flag given → default `both`, but flag this so the flow can show
      // the interactive menu instead (unless --yes/--force forces a scripted run).
      explicitMode = false;
    }
    // Show the menu only for a bare, unflagged, interactive invocation. Any of
    // --variables-local/-remote, an explicit --variables-mode, --yes, or --force
    // means the caller wants the non-interactive scripted path.
    const interactiveMenu = !explicitMode && !YES && !FORCE_ALL && !NON_INTERACTIVE;
    await runVariablesFlow({
      mode,
      force: FORCE_ALL,
      dryRun: DRY_RUN,
      yes: YES,
      nonInteractive: NON_INTERACTIVE,
      interactiveMenu,
    });
    process.exit(0);
  }

  // --sync-skills: standalone repair mode. Re-installs community skills (project +
  // user level) targeting the selected agent(s) and exits — no full install. Fixes
  // projects scaffolded before community installs passed `--agent`, where skills
  // landed only in `.agents/skills/` and Claude Code never discovered them. The
  // SYNC_SKILLS flag forces a community re-run regardless of prior install state.
  if (SYNC_SKILLS) {
    process.stdout.write(`${tui.logo()}\n\n`);
    process.stdout.write(`${tui.headline('agentic-qa-boilerplate — sync community skills')}\n\n`);
    await verifyRepoRoot();
    const detected = await detectAgents();
    log.info(
      `Claude Code: ${detected.claudeCode ? 'found' : 'not found'} | OpenCode: ${detected.opencode ? 'found' : 'not found'}`,
    );
    const agents = await promptAgentSelection(detected);
    if (agents.length === 0) {
      log.warn('No agents selected — nothing to sync.');
      process.exit(0);
    }
    const state = buildInitialState(await loadPriorState());
    state.agents = agents;
    const syncForceKeys = new Set<string>();
    await installCommunitySkills(agents, state, 'project', syncForceKeys);
    await installCommunitySkills(agents, state, 'global', syncForceKeys);
    await writeInstallState(state);
    log.success(`Community skills synced to: ${agents.join(', ')}.`);
    process.exit(0);
  }

  // Build forced-step set for this run
  const forceKeys = new Set<string>();
  if (FORCE_STEP_KEY) { forceKeys.add(FORCE_STEP_KEY); }

  // Logo + headline
  process.stdout.write(`${tui.logo()}\n\n`);
  process.stdout.write(`${tui.headline('agentic-qa-boilerplate — installer')}\n\n`);
  log.dim('See INSTALLER.md for the contract this implements.');
  if (AUTO_NON_INTERACTIVE) {
    log.warn('No TTY detected — running in --non-interactive mode (prompts will use defaults).');
    log.dim('  AI agents: parse pending vars from the closing summary, or run `bun run setup:doctor --json`.');
  }
  if (FORCE_ALL) {
    log.warn('--force flag active: all step timestamps cleared — re-running every step.');
  }
  if (FORCE_STEP_KEY) {
    log.warn(`--force-step "${FORCE_STEP_KEY}" active: that step will re-run even if it already completed.`);
  }

  // ── PHASE 1 — DETECTION ──────────────────────────────────────────────────
  tui.phaseHeader(1, 'DETECTION');

  tui.section('Step 1: Verifying repo root');
  await verifyRepoRoot();

  tui.section('Step 2: Detecting gentle-ai');
  const gentleAi = detectGentleAi();
  if (gentleAi.found && gentleAi.version) {
    if (gentleAi.compatible) {
      log.success(`gentle-ai ${gentleAi.version} detected (>= ${MIN_GENTLE_AI_VERSION.join('.')}).`);
    }
    else {
      log.warn(`gentle-ai ${gentleAi.version} is older than required ${MIN_GENTLE_AI_VERSION.join('.')}. Upgrade with: gentle-ai update`);
    }
  }
  else if (gentleAi.status === 'skipped') {
    log.info('gentle-ai detection skipped via INSTALL_SKIP_GENTLE_AI=1.');
  }
  else {
    log.info('gentle-ai not found.');
  }

  const prior = await loadPriorState();
  const state = buildInitialState(prior);
  // Apply --force: clear all step timestamps
  if (FORCE_ALL) { state.steps = {}; }
  state.installedAt = new Date().toISOString();
  state.gentleAi = {
    status: gentleAi.status,
    version: gentleAi.version,
    checkedAt: new Date().toISOString(),
  };

  tui.section('Step 3: gentle-ai install / skip decision');
  let runSkillInstall = false;
  if (gentleAi.status === 'installed') {
    runSkillInstall = true;
  }
  else if (gentleAi.status === 'incompatible') {
    const contRaw = await tui.confirm({
      message: 'gentle-ai is installed but version is older than required. Try anyway?',
      initialValue: false,
    });
    if (tui.isCancel(contRaw)) { throw Object.assign(new Error('Aborted by user.'), { name: 'ExitPromptError' }); }
    runSkillInstall = contRaw;
  }
  else if (gentleAi.status === 'skipped') {
    log.dim('  Skipped.');
  }
  else {
    if (NON_INTERACTIVE) {
      log.warn('gentle-ai missing in non-interactive mode; treating as skipped.');
      state.gentleAi.status = 'skipped';
    }
    else {
      const decision = await handleMissingGentleAi();
      if (decision === 'show-and-exit') {
        await writeInstallState(state);
        process.exit(0);
      }
      state.gentleAi.status = 'skipped';
    }
    runSkillInstall = false;
  }

  tui.section('Step 4: Detecting agents');
  const detected = await detectAgents();
  log.info(
    `Claude Code: ${detected.claudeCode ? 'found' : 'not found'} | OpenCode: ${detected.opencode ? 'found' : 'not found'}`,
  );
  const agents = await promptAgentSelection(detected);
  state.agents = agents;
  if (agents.length === 0) {
    log.warn('No agents selected, exiting.');
    log.dim('  When you are ready to configure an agent, re-run: bun run setup');
    await writeInstallState(state);
    process.exit(0);
  }

  // ── PHASE 2 — INSTALLATION ───────────────────────────────────────────────
  tui.phaseHeader(2, 'INSTALLATION');

  tui.section('Step 5: Installing dependencies (bun install)');
  await runDepsInstall(state, forceKeys);

  tui.section('Step 6: Installing Playwright browsers');
  await runPlaywrightInstall(state, forceKeys);

  tui.section('Step 8: Installing engram via gentle-ai (minimal preset)');
  if (runSkillInstall) {
    await installSkillsViaGentleAi(agents, state, forceKeys);
  }
  else {
    log.dim('  No compatible gentle-ai — skipping engram install.');
    for (const agent of agents) {
      const k = `${ENGRAM_COMPONENT}::${agent}`;
      if (!state.skills[k]) { state.skills[k] = 'skipped'; }
    }
  }

  tui.section('Step 9: Installing community skills via bunx skills CLI');
  if (SKIP_COMMUNITY) {
    log.dim('  INSTALL_SKIP_COMMUNITY=1, skipping community skills.');
    for (const item of [...PROJECT_LEVEL_SKILLS, ...USER_LEVEL_SKILLS]) {
      const slug = describeSkill(item);
      const level = PROJECT_LEVEL_SKILLS.includes(item) ? 'project' : 'global';
      const k = `community:${level}:${slug}`;
      if (!state.skills[k]) { state.skills[k] = 'skipped'; }
    }
  }
  else {
    await installCommunitySkills(agents, state, 'project', forceKeys);
    await installCommunitySkills(agents, state, 'global', forceKeys);
  }

  // ── PHASE 3 — CONFIGURATION ──────────────────────────────────────────────
  tui.phaseHeader(3, 'CONFIGURATION');

  tui.section('Step 10: Wiring .env for MCP servers');
  await configureMcps(agents, state);
  await offerDirenvAutoload();

  tui.section('Step 10b: Day-0 credentials (Atlassian, Resend, test users)');
  await configureDayZeroCredentials(state);

  tui.section('Step 12: Optional API auth bootstrap');
  await optionalApiBootstrap(state, forceKeys);

  tui.section('Step 7b: GitHub repository (optional)');
  await setupGithubRemote(state, forceKeys);

  // ── PHASE 4 — VERIFICATION ───────────────────────────────────────────────
  tui.phaseHeader(4, 'VERIFICATION');

  tui.section('Step 11: Verifying external CLIs');
  verifyExternalClis(state);

  tui.section('Step 14: Persisting state');
  await writeInstallState(state);

  // ── PHASE 5 — INITIAL CONFIGURATION ─────────────────────────────────────
  tui.phaseHeader(5, 'INITIAL CONFIGURATION');
  await runInitialConfigurationPhase(state);
  await writeInstallState(state);

  // Closing summary
  tui.section('Installation summary');
  printClosingSummary(state);
}

main().catch((err) => {
  // Handle both @inquirer ExitPromptError and our own clack cancel wrappers
  const name = err && typeof err === 'object' && 'name' in err ? (err as { name: string }).name : '';
  if (name === 'ExitPromptError' || (err instanceof Error && err.message === 'Aborted by user.')) {
    tui.log.warn('Aborted by user.');
    process.stdout.write('  To resume, re-run: bun run setup\n');
    process.stdout.write('  (Installer is idempotent — completed steps will skip on re-run.)\n');
    process.exit(130);
  }
  tui.log.error(`Fatal: ${(err as Error).message ?? String(err)}`);
  if (err instanceof Error && err.stack) {
    process.stdout.write(`  ${err.stack}\n`);
  }
  tui.log.warn('Installation interrupted. To resume, re-run: bun run setup');
  process.stdout.write('  (Installer is idempotent — completed steps will skip on re-run.)\n');
  process.exit(1);
});
