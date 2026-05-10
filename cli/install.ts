#!/usr/bin/env bun
/**
 * Project installer for agentic-qa-boilerplate.
 *
 * Drives the end-to-end onboarding for a freshly-cloned QA boilerplate:
 *   1.  Verify repo root (package.json name)
 *   2.  Detect gentle-ai (presence + version)
 *   3.  Decide gentle-ai install / skip
 *   4.  Detect agents (Claude Code / OpenCode) and prompt selection
 *   5.  Install dependencies (`bun install`)
 *   6.  Install Playwright browsers (`bun run pw:install`)
 *   7.  Run agents:setup (interactive `.agents/project.yaml` populator)
 *   8.  Install 14 skills + engram via gentle-ai (or skip)
 *   9.  Install community skills via `npx skills add` (project-level + user-level)
 *  10.  Configure MCPs from templates (write `.mcp.json` / `opencode.json`)
 *  11.  Verify external CLIs (bun, gh, acli, playwright, allure, jq)
 *  12.  Optional bootstraps: Jira credentials check, API auth login
 *  13.  Persist `.agents/install-state.json` + closing summary
 *
 * Usage:
 *   bun run setup
 *   bun run setup --non-interactive
 *
 * Non-interactive env vars:
 *   INSTALL_AGENTS=claude-code,opencode   Comma-list of agents to configure
 *   INSTALL_SKIP_GENTLE_AI=1              Treat gentle-ai as skipped
 *   INSTALL_SKIP_DEPS=1                   Skip `bun install`
 *   INSTALL_SKIP_PLAYWRIGHT=1             Skip `bun run pw:install`
 *   INSTALL_SKIP_AGENTS_SETUP=1           Skip `bun run agents:setup`
 *   INSTALL_SKIP_COMMUNITY=1              Skip `npx skills add` step
 *   INSTALL_SKIP_JIRA=1                   Skip optional Jira bootstrap
 *   INSTALL_SKIP_API=1                    Skip optional API auth bootstrap
 *
 * Plus any MCP secret env vars (e.g. TAVILY_API_KEY, JIRA_API_TOKEN, POSTMAN_API_KEY).
 * Missing secrets in non-interactive mode become {{VAR}} placeholders in .mcp.json.
 *
 * State file: .agents/install-state.json (gitignored). Re-runs are idempotent —
 * already-installed skills are skipped, existing MCP files prompt before overwrite.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { checkbox, confirm, input, password } from '@inquirer/prompts';

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

interface InstallState {
  version: 1
  installedAt: string
  agents: AgentId[]
  gentleAi: {
    status: GentleAiInfo['status']
    version?: string
    checkedAt: string
  }
  steps: {
    depsInstalled?: boolean
    playwrightInstalled?: boolean
    agentsSetupRanAt?: string
    jiraBootstrap?: OptionalBootstrapStatus
    apiBootstrap?: OptionalBootstrapStatus
  }
  skills: Record<string, InstallStatus>
  mcps: Record<string, McpStatus>
  externalClis: Record<string, CliStatus>
  pendingEnvVars: string[]
}

// ============================================================================
// Constants
// ============================================================================

const REPO_ROOT = resolve(import.meta.dir, '..');
const STATE_PATH = join(REPO_ROOT, '.agents', 'install-state.json');
const CLAUDE_TEMPLATE_PATH = join(REPO_ROOT, 'templates', 'mcp', 'claude.template.json');
const OPENCODE_TEMPLATE_PATH = join(REPO_ROOT, 'templates', 'mcp', 'opencode.template.json');
const CLAUDE_MCP_OUTPUT = join(REPO_ROOT, '.mcp.json');
const OPENCODE_MCP_OUTPUT = join(REPO_ROOT, 'opencode.json');

const REPO_NAME = 'agentic-qa-boilerplate';
const TOTAL_STEPS = 13;

const MIN_GENTLE_AI_VERSION = [1, 26, 5] as const;

const ENGRAM_COMPONENT = 'engram';

/**
 * Universal skills installed via gentle-ai (engram + 11 SDD-* + 2 helpers + skill-registry).
 * Dev-side ships cognitive-doc-design and comment-writer too; we skip those — QA reporting
 * tone lives in /sprint-testing and /regression-testing, no need for the dev-writing pair.
 */
const SKILL_SLUGS = [
  'sdd-init',
  'sdd-explore',
  'sdd-propose',
  'sdd-spec',
  'sdd-design',
  'sdd-tasks',
  'sdd-apply',
  'sdd-verify',
  'sdd-archive',
  'sdd-onboard',
  'skill-registry',
  'judgment-day',
  'issue-creation',
] as const;

const CANONICAL_MCPS = [
  'context7',
  'tavily',
  'playwright',
  'atlassian',
  'dbhub',
  'openapi',
  'postman',
] as const;

const EXTERNAL_CLIS: ReadonlyArray<{ name: string, install: string }> = [
  { name: 'bun', install: 'curl -fsSL https://bun.sh/install | bash' },
  { name: 'gh', install: 'brew install gh  (or: https://cli.github.com/)' },
  { name: 'acli', install: 'brew install --cask atlassian-cli' },
  { name: 'playwright', install: 'bun add -D @playwright/test  (already a devDependency here)' },
  { name: 'allure', install: 'brew install allure  (or: scoop install allure)' },
  { name: 'jq', install: 'brew install jq  (or: apt-get install jq)' },
];

interface CommunitySkill {
  package: string // git URL or shorthand 'owner/repo'
  skill?: string // omit or '*' to install all skills from the package
}

/**
 * Community skills installed at PROJECT level (`npx skills add`).
 * Empty for QA: every project-specific skill in this repo (sprint-testing,
 * test-automation, agentic-qa-core, etc.) is authored by us and committed under
 * .claude/skills/. Add stack-specific community skills here when needed (e.g., a
 * Cypress skill for a Cypress fork, or stack-detection skills via npx autoskills).
 */
const PROJECT_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [];

/**
 * Community skills installed at USER (global) level (`npx skills add --global`).
 * Useful across most projects regardless of stack. Mirrors the dev-side list —
 * we intentionally keep the QA repo aligned with dev to share the universal layer.
 * playwright-cli also lives locally in .claude/skills/playwright-cli (project-level
 * gain over user-level) — both are kept on purpose for redundancy.
 */
const USER_LEVEL_SKILLS: ReadonlyArray<CommunitySkill> = [
  { package: 'https://github.com/anthropics/skills', skill: 'skill-creator' },
  { package: 'https://github.com/vercel-labs/skills', skill: 'find-skills' },
  { package: 'https://github.com/github/awesome-copilot', skill: 'gh-cli' },
  { package: 'https://github.com/xixu-me/skills', skill: 'github-actions-docs' },
  { package: 'https://github.com/microsoft/playwright-cli', skill: 'playwright-cli' },
  { package: 'czlonkowski/n8n-skills' }, // whole repo (n8n MCP toolkit)
  { package: 'https://github.com/emilkowalski/skill', skill: 'emil-design-eng' },
  { package: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', skill: 'ui-ux-pro-max' },
  { package: 'https://github.com/obra/superpowers', skill: 'brainstorming' },
];

const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const SECRET_NAME_HINTS = ['TOKEN', 'KEY', 'SECRET', 'PASSWORD'];

// ============================================================================
// CLI flags
// ============================================================================

const NON_INTERACTIVE = process.argv.includes('--non-interactive');
const SKIP_GENTLE_AI = process.env.INSTALL_SKIP_GENTLE_AI === '1';
const SKIP_DEPS = process.env.INSTALL_SKIP_DEPS === '1';
const SKIP_PLAYWRIGHT = process.env.INSTALL_SKIP_PLAYWRIGHT === '1';
const SKIP_AGENTS_SETUP = process.env.INSTALL_SKIP_AGENTS_SETUP === '1';
const SKIP_JIRA = process.env.INSTALL_SKIP_JIRA === '1';
const SKIP_API = process.env.INSTALL_SKIP_API === '1';
const SKIP_COMMUNITY = process.env.INSTALL_SKIP_COMMUNITY === '1';

// ============================================================================
// Logger
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
  info: (msg: string) => process.stdout.write(`${COLORS.cyan}ℹ${COLORS.reset} ${msg}\n`),
  success: (msg: string) => process.stdout.write(`${COLORS.green}✓${COLORS.reset} ${msg}\n`),
  warn: (msg: string) => process.stdout.write(`${COLORS.yellow}⚠${COLORS.reset} ${msg}\n`),
  error: (msg: string) => process.stderr.write(`${COLORS.red}✗${COLORS.reset} ${msg}\n`),
  banner: (msg: string) => process.stdout.write(`\n${COLORS.bold}${COLORS.cyan}${msg}${COLORS.reset}\n\n`),
  step: (n: number, total: number, title: string) =>
    process.stdout.write(`\n${COLORS.bold}[${n}/${total}] ${title}${COLORS.reset}\n`),
  dim: (msg: string) => process.stdout.write(`${COLORS.dim}${msg}${COLORS.reset}\n`),
};

// ============================================================================
// Subprocess helpers
// ============================================================================

function which(binary: string): string | null {
  const result = spawnSync('which', [binary], { encoding: 'utf8' });
  if (result.status !== 0) { return null; }
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
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

async function maybeConfirm(message: string, defaultYes: boolean): Promise<boolean> {
  if (NON_INTERACTIVE) { return defaultYes; }
  return confirm({ message, default: defaultYes });
}

// ============================================================================
// Step 1 — repo identity check
// ============================================================================

async function verifyRepoRoot(): Promise<void> {
  const pkgPath = join(REPO_ROOT, 'package.json');
  if (!existsSync(pkgPath)) {
    log.error(`No package.json found at ${pkgPath}. Run this from the repo root.`);
    process.exit(1);
  }
  const raw = await readFile(pkgPath, 'utf8');
  const pkg = JSON.parse(raw) as { name?: string };
  if (pkg.name !== REPO_NAME) {
    const proceed = await maybeConfirm(
      `package.json name is "${pkg.name ?? '(unknown)'}" (expected "${REPO_NAME}"). Continue anyway?`,
      false,
    );
    if (!proceed) { process.exit(0); }
  }
}

// ============================================================================
// Step 2 — detect gentle-ai
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
// Step 3 — gentle-ai install instructions / skip
// ============================================================================

async function handleMissingGentleAi(): Promise<'show-and-exit' | 'skip'> {
  log.warn('gentle-ai not detected on PATH.');
  log.info(`gentle-ai installs ${SKILL_SLUGS.length} universal skills + engram into your agent.`);
  log.info('See docs/setup/integrating-gentle-ai.md for what gets installed and what stays local.');
  process.stdout.write('\n');

  const choice = await maybeConfirm(
    'Show install commands and exit so you can install it? (No = continue without gentle-ai)',
    true,
  );

  if (choice) {
    log.banner('Install gentle-ai with one of these commands:');
    process.stdout.write('  macOS  : brew install gentle-ai\n');
    process.stdout.write('  Linux  : go install github.com/Gentleman-Programming/gentle-ai/cmd/gentle-ai@latest\n\n');
    log.dim('After installing, re-run: bun run setup');
    return 'show-and-exit';
  }

  log.warn('Continuing without gentle-ai. Skills + engram will NOT be installed.');
  return 'skip';
}

// ============================================================================
// Step 4 — detect agents
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
    log.error('No agents detected. Install Claude Code (~/.claude/) or OpenCode (~/.config/opencode/) and rerun.');
    process.exit(1);
  }

  if (detected.claudeCode && !detected.opencode) {
    const ok = await confirm({ message: 'Detected Claude Code. Configure for it?', default: true });
    return ok ? ['claude-code'] : [];
  }

  if (detected.opencode && !detected.claudeCode) {
    const ok = await confirm({ message: 'Detected OpenCode. Configure for it?', default: true });
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
// Step 5 — bun install
// ============================================================================

function nodeModulesLooksReady(): boolean {
  return existsSync(join(REPO_ROOT, 'node_modules', '@playwright', 'test'));
}

async function runDepsInstall(state: InstallState): Promise<void> {
  if (SKIP_DEPS) {
    log.dim('  INSTALL_SKIP_DEPS=1, skipping bun install.');
    return;
  }
  if (state.steps.depsInstalled && nodeModulesLooksReady()) {
    log.dim('  Dependencies already installed (state + node_modules present).');
    return;
  }
  if (nodeModulesLooksReady()) {
    log.dim('  node_modules looks populated; skipping bun install.');
    state.steps.depsInstalled = true;
    return;
  }

  const proceed = await maybeConfirm('Run `bun install` now?', true);
  if (!proceed) {
    log.warn('Skipping bun install. Run it manually before using the test scripts.');
    return;
  }
  log.info('Running: bun install');
  const { ok } = runInherited('bun', ['install']);
  if (ok) {
    state.steps.depsInstalled = true;
    log.success('Dependencies installed.');
  }
  else {
    log.error('bun install failed. Review the output above and retry.');
  }
}

// ============================================================================
// Step 6 — Playwright browsers
// ============================================================================

async function runPlaywrightInstall(state: InstallState): Promise<void> {
  if (SKIP_PLAYWRIGHT) {
    log.dim('  INSTALL_SKIP_PLAYWRIGHT=1, skipping playwright install.');
    return;
  }
  if (state.steps.playwrightInstalled && which('playwright')) {
    log.dim('  Playwright already installed (state + playwright on PATH).');
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
  log.info('Running: bun run pw:install');
  const { ok } = runInherited('bun', ['run', 'pw:install']);
  if (ok) {
    state.steps.playwrightInstalled = true;
    log.success('Playwright browsers installed.');
  }
  else {
    log.error('pw:install failed. Review the output above and retry.');
  }
}

// ============================================================================
// Step 7 — agents:setup (project.yaml populator)
// ============================================================================

async function runAgentsSetup(state: InstallState): Promise<void> {
  if (SKIP_AGENTS_SETUP) {
    log.dim('  INSTALL_SKIP_AGENTS_SETUP=1, skipping agents:setup.');
    return;
  }

  const proceed = await maybeConfirm(
    'Run `bun run agents:setup` to populate `.agents/project.yaml` (interactive)?',
    true,
  );
  if (!proceed) {
    log.warn('Skipping agents:setup. Run it later: bun run agents:setup');
    return;
  }

  const args = ['run', 'agents:setup'];
  if (NON_INTERACTIVE) { args.push('--', '--non-interactive'); }
  log.info(`Running: bun ${args.join(' ')}`);
  const { ok } = runInherited('bun', args);
  if (ok) {
    state.steps.agentsSetupRanAt = new Date().toISOString();
    log.success('agents:setup complete.');
  }
  else {
    log.warn('agents:setup did not exit cleanly. You can re-run it later: bun run agents:setup');
  }
}

// ============================================================================
// Step 8 — install skills via gentle-ai
// ============================================================================

function runGentleAiInstall(args: string[]): { ok: boolean, reason?: string } {
  // Try with --yes first; fall back without it if gentle-ai rejects the flag.
  const withYes = tryRun('gentle-ai', [...args, '--yes']);
  if (withYes.ok) { return { ok: true }; }

  const stderrLower = withYes.stderr.toLowerCase();
  const flagUnknown
    = stderrLower.includes('unknown flag')
      || stderrLower.includes('unknown option')
      || stderrLower.includes('invalid flag');

  if (flagUnknown) {
    const retry = tryRun('gentle-ai', args);
    if (retry.ok) { return { ok: true }; }
    return { ok: false, reason: retry.stderr.trim() || retry.stdout.trim() || 'unknown error' };
  }

  return { ok: false, reason: withYes.stderr.trim() || withYes.stdout.trim() || 'unknown error' };
}

async function installSkillsViaGentleAi(
  agents: AgentId[],
  state: InstallState,
): Promise<void> {
  if (agents.length === 0) {
    log.info('No agents selected, skipping skill install.');
    return;
  }

  const totalCalls = agents.length * (1 + SKILL_SLUGS.length);
  log.info(`This will run ${totalCalls} gentle-ai install commands (${1 + SKILL_SLUGS.length} per agent × ${agents.length}).`);

  const proceed = await maybeConfirm('Continue with skill installation?', true);
  if (!proceed) {
    log.warn('Skipping skill installation.');
    for (const slug of [ENGRAM_COMPONENT, ...SKILL_SLUGS]) {
      for (const agent of agents) {
        const key = `${slug}::${agent}`;
        if (!state.skills[key]) { state.skills[key] = 'skipped'; }
      }
    }
    return;
  }

  for (const agent of agents) {
    log.banner(`Installing skills for: ${agent}`);

    const engramKey = `${ENGRAM_COMPONENT}::${agent}`;
    if (state.skills[engramKey] === 'installed') {
      log.dim(`  skipping ${ENGRAM_COMPONENT} (already installed for ${agent})`);
    }
    else {
      const result = runGentleAiInstall(['install', '--component', ENGRAM_COMPONENT, '--agent', agent]);
      if (result.ok) {
        log.success(`  installed: engram (${agent})`);
        state.skills[engramKey] = 'installed';
      }
      else {
        log.error(`  failed: engram (${agent}) — ${result.reason}`);
        state.skills[engramKey] = 'failed';
      }
    }

    for (const slug of SKILL_SLUGS) {
      const key = `${slug}::${agent}`;
      if (state.skills[key] === 'installed') {
        log.dim(`  skipping ${slug} (already installed for ${agent})`);
        continue;
      }
      const result = runGentleAiInstall(['install', '--skill', slug, '--agent', agent]);
      if (result.ok) {
        log.success(`  installed: ${slug} (${agent})`);
        state.skills[key] = 'installed';
      }
      else {
        log.error(`  failed: ${slug} (${agent}) — ${result.reason}`);
        state.skills[key] = 'failed';
      }
    }
  }
}

// ============================================================================
// Step 9 — community skills via npx skills CLI (independent of gentle-ai)
// ============================================================================

function describeSkill(item: CommunitySkill): string {
  if (!item.skill || item.skill === '*') {
    return item.package.split('/').slice(-2).join('/');
  }
  return item.skill;
}

async function installCommunitySkills(
  state: InstallState,
  level: 'project' | 'global',
): Promise<void> {
  const list = level === 'project' ? PROJECT_LEVEL_SKILLS : USER_LEVEL_SKILLS;
  const label = level === 'project' ? 'project-level' : 'user-level (global)';

  if (list.length === 0) {
    log.dim(`  No ${label} community skills configured for this repo (${level === 'project' ? 'PROJECT_LEVEL_SKILLS' : 'USER_LEVEL_SKILLS'} is empty).`);
    return;
  }

  log.banner(`Community skills — ${label}`);
  log.info(`This will run ${list.length} \`npx skills add\` commands (${label}).`);

  const proceed = await maybeConfirm(`Install ${label} community skills?`, true);
  if (!proceed) {
    log.warn(`Skipping ${label} community skills.`);
    for (const item of list) {
      const slug = describeSkill(item);
      const key = `community:${level}:${slug}`;
      if (!state.skills[key]) {
        state.skills[key] = 'skipped';
      }
    }
    return;
  }

  for (const item of list) {
    const slug = describeSkill(item);
    const key = `community:${level}:${slug}`;
    if (state.skills[key] === 'installed') {
      log.dim(`  skipping ${slug} (already installed)`);
      continue;
    }
    const args = ['skills', 'add', item.package];
    if (item.skill && item.skill !== '*') {
      args.push('--skill', item.skill);
    }
    if (level === 'global') {
      args.push('--global');
    }
    args.push('--yes');
    const result = tryRun('npx', args);
    if (result.ok) {
      log.success(`  installed: ${slug}`);
      state.skills[key] = 'installed';
    }
    else {
      log.error(`  failed: ${slug} — ${(result.stderr || result.stdout).trim().slice(0, 120) || 'unknown error'}`);
      state.skills[key] = 'failed';
    }
  }
}

// ============================================================================
// Step 10 — MCP configuration
// ============================================================================

function isSecretName(name: string): boolean {
  return SECRET_NAME_HINTS.some(hint => name.endsWith(hint) || name.endsWith(`_${hint}`));
}

function discoverPlaceholders(content: string): string[] {
  const seen = new Set<string>();
  for (const m of content.matchAll(PLACEHOLDER_PATTERN)) {
    seen.add(m[1]);
  }
  return [...seen];
}

interface ResolvedSecret {
  value: string
  source: 'env' | 'prompt' | 'placeholder'
}

async function resolveSecret(varName: string): Promise<ResolvedSecret> {
  const fromEnv = process.env[varName];
  if (fromEnv && fromEnv.trim().length > 0) {
    log.dim(`  using ${varName} from environment`);
    return { value: fromEnv.trim(), source: 'env' };
  }
  if (NON_INTERACTIVE) {
    return { value: `{{${varName}}}`, source: 'placeholder' };
  }
  const prompt = isSecretName(varName) ? password : input;
  const entered = await prompt({
    message: `${varName} (Enter to keep placeholder):`,
    ...(isSecretName(varName) ? { mask: '*' } : {}),
  } as Parameters<typeof password>[0]);
  const trimmed = (entered ?? '').trim();
  if (trimmed.length === 0) {
    return { value: `{{${varName}}}`, source: 'placeholder' };
  }
  return { value: trimmed, source: 'prompt' };
}

function replacePlaceholders(input: unknown, replacements: Record<string, string>): unknown {
  if (typeof input === 'string') {
    let out = input;
    for (const [key, value] of Object.entries(replacements)) {
      out = out.split(`{{${key}}}`).join(value);
    }
    return out;
  }
  if (Array.isArray(input)) { return input.map(item => replacePlaceholders(item, replacements)); }
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) { result[k] = replacePlaceholders(v, replacements); }
    return result;
  }
  return input;
}

async function writeMcpFile(target: string, content: unknown): Promise<boolean> {
  if (existsSync(target)) {
    const overwrite = await maybeConfirm(`${target} already exists. Overwrite?`, false);
    if (!overwrite) {
      log.warn(`Keeping existing ${target}.`);
      return false;
    }
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  return true;
}

async function configureMcpForAgent(
  agent: AgentId,
  state: InstallState,
  pendingEnvVars: Set<string>,
): Promise<void> {
  const templatePath = agent === 'claude-code' ? CLAUDE_TEMPLATE_PATH : OPENCODE_TEMPLATE_PATH;
  const outputPath = agent === 'claude-code' ? CLAUDE_MCP_OUTPUT : OPENCODE_MCP_OUTPUT;
  const label = agent === 'claude-code' ? 'Claude Code (.mcp.json)' : 'OpenCode (opencode.json)';

  log.banner(`Configuring MCPs for ${label}`);

  const templateRaw = await readFile(templatePath, 'utf8');
  const placeholders = discoverPlaceholders(templateRaw);

  const replacements: Record<string, string> = {};
  for (const name of placeholders) {
    const r = await resolveSecret(name);
    replacements[name] = r.value;
    if (r.source === 'placeholder') { pendingEnvVars.add(name); }
  }

  const template = JSON.parse(templateRaw) as unknown;
  const replaced = replacePlaceholders(template, replacements);
  const wrote = await writeMcpFile(outputPath, replaced);
  if (wrote) {
    log.success(`Wrote ${outputPath}`);
  }

  // Per-server status — placeholder if any of its secrets are placeholders, else
  // configured-with-key (for servers that have secrets) or configured-no-key.
  const serverSecrets: Record<string, string[]> = {
    context7: [],
    tavily: ['TAVILY_API_KEY'],
    playwright: [],
    atlassian: ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'CONFLUENCE_URL', 'CONFLUENCE_EMAIL', 'CONFLUENCE_API_TOKEN'],
    dbhub: [],
    openapi: ['API_BASE_URL', 'OPENAPI_SPEC_PATH', 'API_TOKEN'],
    postman: ['POSTMAN_API_KEY'],
  };

  for (const [server, secrets] of Object.entries(serverSecrets)) {
    if (secrets.length === 0) {
      state.mcps[server] = 'configured-no-key';
    }
    else {
      const anyPlaceholder = secrets.some(s => replacements[s]?.startsWith('{{'));
      state.mcps[server] = anyPlaceholder ? 'placeholder' : 'configured-with-key';
    }
  }
}

async function configureMcps(agents: AgentId[], state: InstallState): Promise<void> {
  if (agents.length === 0) {
    log.info('No agents selected, skipping MCP config.');
    return;
  }
  const pending = new Set<string>();
  for (const agent of agents) {
    await configureMcpForAgent(agent, state, pending);
  }
  state.pendingEnvVars = [...pending].sort();
}

// ============================================================================
// Step 10 — verify external CLIs
// ============================================================================

interface CliResult {
  name: string
  status: CliStatus
  install: string
}

function verifyExternalClis(state: InstallState): CliResult[] {
  const results = EXTERNAL_CLIS.map((cli) => {
    const found = which(cli.name) !== null;
    const status: CliStatus = found ? 'found' : 'missing';
    state.externalClis[cli.name] = status;
    return { name: cli.name, status, install: cli.install };
  });

  process.stdout.write('\n');
  process.stdout.write(`${COLORS.bold}CLI            Status      Install (if missing)${COLORS.reset}\n`);
  process.stdout.write(`${'─'.repeat(72)}\n`);
  for (const r of results) {
    const padName = r.name.padEnd(14);
    const padStatus = r.status === 'found' ? 'found     ' : 'missing   ';
    const statusColor = r.status === 'found' ? COLORS.green : COLORS.yellow;
    const installCol = r.status === 'found' ? '(skip)' : r.install;
    process.stdout.write(`${padName} ${statusColor}${padStatus}${COLORS.reset} ${installCol}\n`);
  }
  return results;
}

// ============================================================================
// Step 11 — optional bootstraps (Jira, API)
// ============================================================================

async function optionalJiraBootstrap(state: InstallState): Promise<void> {
  if (SKIP_JIRA) {
    log.dim('  INSTALL_SKIP_JIRA=1, skipping Jira bootstrap.');
    return;
  }
  const proceed = await maybeConfirm(
    'Configure Jira credentials now? (Runs `bun run jira:check`; if it fails, you will be pointed at `bun run jira:sync-fields`.)',
    true,
  );
  if (!proceed) {
    state.steps.jiraBootstrap = { ran: false };
    return;
  }
  log.info('Running: bun run jira:check');
  const { ok } = runInherited('bun', ['run', 'jira:check']);
  state.steps.jiraBootstrap = { ran: true, ok };
  if (ok) {
    log.success('Jira bootstrap green.');
  }
  else {
    log.warn('jira:check did not pass. Once you have Jira credentials in `.env`, run:');
    log.dim('  bun run jira:sync-fields');
    log.dim('  bun run jira:sync-workflows');
    log.dim('  bun run jira:check');
  }
}

async function optionalApiBootstrap(state: InstallState): Promise<void> {
  if (SKIP_API) {
    log.dim('  INSTALL_SKIP_API=1, skipping API bootstrap.');
    return;
  }
  const proceed = await maybeConfirm(
    'Configure API auth now? (Runs `bun run api:login`.)',
    false,
  );
  if (!proceed) {
    state.steps.apiBootstrap = { ran: false };
    return;
  }
  log.info('Running: bun run api:login');
  const { ok } = runInherited('bun', ['run', 'api:login']);
  state.steps.apiBootstrap = { ran: true, ok };
  if (ok) {
    log.success('API auth green.');
  }
  else {
    log.warn('api:login did not pass. Re-run later: bun run api:login');
  }
}

// ============================================================================
// State persistence
// ============================================================================

async function loadPriorState(): Promise<InstallState | null> {
  if (!existsSync(STATE_PATH)) { return null; }
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    return JSON.parse(raw) as InstallState;
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
    return {
      ...prior,
      steps: prior.steps ?? {},
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
  };
}

// ============================================================================
// Step 13 — closing summary
// ============================================================================

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

  log.banner('Installer complete.');
  process.stdout.write(`gentle-ai skills   : ${gentleAiInstalled}/${gentleAiSkills.length}\n`);
  process.stdout.write(`Community (project): ${projectInstalled}/${projectCommunity.length}\n`);
  process.stdout.write(`Community (user)   : ${userInstalled}/${userCommunity.length}\n`);
  process.stdout.write(`MCPs configured    : ${mcpConfigured}/${mcpTotal} fully wired`);
  if (mcpPlaceholder > 0) { process.stdout.write(` (${mcpPlaceholder} with placeholders)`); }
  process.stdout.write('\n');
  process.stdout.write(`External CLIs      : ${cliFound}/${cliTotal} found`);
  if (cliMissing.length > 0) { process.stdout.write(` (missing: ${cliMissing.join(', ')})`); }
  process.stdout.write('\n');
  if (state.pendingEnvVars.length > 0) {
    process.stdout.write(`Pending env vars   : ${state.pendingEnvVars.join(', ')}\n`);
  }
  else {
    process.stdout.write('Pending env vars   : (none)\n');
  }

  process.stdout.write('\n');
  process.stdout.write(`${COLORS.bold}Next steps:${COLORS.reset}\n`);
  process.stdout.write('  1. Resolve pending env vars (replace {{VAR}} in .mcp.json with real values, or re-run setup)\n');
  process.stdout.write('  2. Install missing CLIs (see table above)\n');
  process.stdout.write('  3. Run: bun run lint:agents (validate config)\n');
  if (!state.steps.jiraBootstrap?.ok) {
    process.stdout.write('  4. Configure Jira when credentials are ready: bun run jira:sync-fields && bun run jira:check\n');
  }
  process.stdout.write('  5. In your agent: /agentic-qa-onboard (first-time orientation tour)\n');
  process.stdout.write('  6. Read your first ticket: /sprint-testing <UPEX-XXX>\n');
  process.stdout.write('\n');
  log.dim('Full docs: docs/setup/integrating-gentle-ai.md');
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  log.banner(`${REPO_NAME} — installer`);
  log.dim('See docs/setup/integrating-gentle-ai.md for the contract this implements.');

  // Step 1
  log.step(1, TOTAL_STEPS, 'Verifying repo root');
  await verifyRepoRoot();

  // Step 2
  log.step(2, TOTAL_STEPS, 'Detecting gentle-ai');
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
  state.installedAt = new Date().toISOString();
  state.gentleAi = {
    status: gentleAi.status,
    version: gentleAi.version,
    checkedAt: new Date().toISOString(),
  };

  // Step 3
  log.step(3, TOTAL_STEPS, 'gentle-ai install / skip decision');
  let runSkillInstall = false;
  if (gentleAi.status === 'installed') {
    runSkillInstall = true;
  }
  else if (gentleAi.status === 'incompatible') {
    const cont = await maybeConfirm(
      'gentle-ai is installed but version is older than required. Try anyway?',
      false,
    );
    runSkillInstall = cont;
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

  // Step 4
  log.step(4, TOTAL_STEPS, 'Detecting agents');
  const detected = await detectAgents();
  log.info(
    `Claude Code: ${detected.claudeCode ? 'found' : 'not found'} | OpenCode: ${detected.opencode ? 'found' : 'not found'}`,
  );
  const agents = await promptAgentSelection(detected);
  state.agents = agents;
  if (agents.length === 0) {
    log.warn('No agents selected, exiting.');
    await writeInstallState(state);
    process.exit(0);
  }

  // Step 5
  log.step(5, TOTAL_STEPS, 'Installing dependencies (bun install)');
  await runDepsInstall(state);

  // Step 6
  log.step(6, TOTAL_STEPS, 'Installing Playwright browsers');
  await runPlaywrightInstall(state);

  // Step 7
  log.step(7, TOTAL_STEPS, 'Populating .agents/project.yaml (agents:setup)');
  await runAgentsSetup(state);

  // Step 8
  if (runSkillInstall) {
    log.step(8, TOTAL_STEPS, 'Installing skills via gentle-ai');
    await installSkillsViaGentleAi(agents, state);
  }
  else {
    log.step(8, TOTAL_STEPS, 'Skipping skill install (no compatible gentle-ai)');
    for (const slug of [ENGRAM_COMPONENT, ...SKILL_SLUGS]) {
      for (const agent of agents) {
        const key = `${slug}::${agent}`;
        if (!state.skills[key]) { state.skills[key] = 'skipped'; }
      }
    }
  }

  // Step 9 — community skills via npx skills CLI (independent of gentle-ai)
  log.step(9, TOTAL_STEPS, 'Installing community skills via npx skills CLI');
  if (SKIP_COMMUNITY) {
    log.dim('  INSTALL_SKIP_COMMUNITY=1, skipping community skills.');
    for (const item of [...PROJECT_LEVEL_SKILLS, ...USER_LEVEL_SKILLS]) {
      const slug = describeSkill(item);
      const level = PROJECT_LEVEL_SKILLS.includes(item) ? 'project' : 'global';
      const key = `community:${level}:${slug}`;
      if (!state.skills[key]) { state.skills[key] = 'skipped'; }
    }
  }
  else {
    await installCommunitySkills(state, 'project');
    await installCommunitySkills(state, 'global');
  }

  // Step 10
  log.step(10, TOTAL_STEPS, 'Configuring MCPs');
  await configureMcps(agents, state);

  // Step 11
  log.step(11, TOTAL_STEPS, 'Verifying external CLIs');
  verifyExternalClis(state);

  // Step 12
  log.step(12, TOTAL_STEPS, 'Optional bootstraps (Jira / API)');
  await optionalJiraBootstrap(state);
  await optionalApiBootstrap(state);

  // Step 13
  log.step(13, TOTAL_STEPS, 'Persisting state and summary');
  await writeInstallState(state);
  printClosingSummary(state);
}

main().catch((err) => {
  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ExitPromptError') {
    log.warn('Aborted by user.');
    process.exit(130);
  }
  log.error(`Fatal: ${(err as Error).message ?? String(err)}`);
  if (err instanceof Error && err.stack) { log.dim(err.stack); }
  process.exit(1);
});
