#!/usr/bin/env bun
/**
 * Setup doctor — read-only health check for the agentic-qa-boilerplate setup.
 *
 * Outputs a structured report (human-readable by default, JSON with --json)
 * describing what's wired correctly and what still needs action. Designed for
 * AI agents driving the setup: parse the JSON, take action on each
 * pending_actions entry, then re-run until status === "ok".
 *
 * Usage:
 *   bun run setup:doctor              # human-readable summary
 *   bun run setup:doctor --json       # machine-readable JSON
 *
 * Exit code:
 *   0 if status === "ok"
 *   1 if status === "needs-action"
 *
 * Side effects: none. This script never edits files or installs anything.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '..');
const ENV_PATH = join(REPO_ROOT, '.env');
const MCP_PATH = join(REPO_ROOT, '.mcp.json');
const OPENCODE_PATH = join(REPO_ROOT, 'opencode.jsonc');
const NODE_MODULES_DOTENV = join(REPO_ROOT, 'node_modules', 'dotenv-cli');
const PW_CACHE = join(homedir(), '.cache', 'ms-playwright');

// Required MCP env vars (mirrors MCP_SERVER_SECRETS in cli/install.ts).
const REQUIRED_VARS = [
  'TAVILY_API_KEY',
  'ATLASSIAN_URL',
  'ATLASSIAN_EMAIL',
  'ATLASSIAN_API_TOKEN',
  'API_BASE_URL',
  'OPENAPI_SPEC_PATH',
  'API_TOKEN',
  'POSTMAN_API_KEY',
] as const;

const VAR_HINTS: Record<string, { hint: string, where: string }> = {
  TAVILY_API_KEY: {
    hint: 'Tavily web-search MCP API key',
    where: 'https://app.tavily.com/  →  account  →  API keys',
  },
  ATLASSIAN_URL: {
    hint: 'Atlassian / Jira workspace URL',
    where: 'e.g. https://yourorg.atlassian.net',
  },
  ATLASSIAN_EMAIL: {
    hint: 'Email used to log in to Atlassian',
    where: 'Your Atlassian account email',
  },
  ATLASSIAN_API_TOKEN: {
    hint: 'Atlassian API token for acli / MCP',
    where: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  },
  API_BASE_URL: {
    hint: 'Backend API base URL for OpenAPI MCP',
    where: 'e.g. https://api.yourapp.com/v1',
  },
  OPENAPI_SPEC_PATH: {
    hint: 'Path or URL to the OpenAPI/Swagger spec',
    where: 'e.g. https://api.yourapp.com/openapi.json (or a local file path)',
  },
  API_TOKEN: {
    hint: 'Bearer token for OpenAPI MCP requests',
    where: 'From your backend admin / API portal',
  },
  POSTMAN_API_KEY: {
    hint: 'Postman API key for Postman MCP',
    where: 'https://postman.com  →  account settings  →  API keys',
  },
};

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

type PendingActionType = 'credential' | 'shell_hook' | 'system_install' | 'shell_command';

interface PendingAction {
  type: PendingActionType
  target: string
  hint: string
  where?: string
}

interface DirenvState {
  installed: boolean
  version?: string
  envrc_allowed?: boolean
  hook_in_rc?: boolean
  rc_file?: string
}

interface DoctorReport {
  status: 'ok' | 'needs-action'
  repo_root: string
  platform: NodeJS.Platform
  shell: string
  is_tty: boolean
  env_file_exists: boolean
  env_vars: Record<string, 'set' | 'missing'>
  mcp_json_exists: boolean
  opencode_jsonc_exists: boolean
  deps_installed: boolean
  playwright_browsers: boolean
  direnv: DirenvState
  pending_actions: PendingAction[]
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function tryRun(binary: string, args: string[]): { ok: boolean, stdout: string } {
  try {
    const stdout = execFileSync(binary, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout };
  }
  catch {
    return { ok: false, stdout: '' };
  }
}

function parseEnvFile(content: string): Record<string, string> {
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

async function detectDirenv(): Promise<DirenvState> {
  const version = tryRun('direnv', ['version']);
  if (!version.ok) { return { installed: false }; }

  const status = tryRun('direnv', ['status']);
  const envrcAllowed = /Found RC allowed true/.test(status.stdout);

  const candidates = ['.bashrc', '.zshrc', '.bash_profile', '.profile'];
  let hookInRc = false;
  let rcFile: string | undefined;
  for (const file of candidates) {
    const path = join(homedir(), file);
    if (!existsSync(path)) { continue; }
    try {
      const content = await readFile(path, 'utf8');
      if (/\bdirenv\s+hook\b/.test(content)) {
        hookInRc = true;
        rcFile = path;
        break;
      }
    }
    catch {
      // skip unreadable files (permissions, broken symlinks)
    }
  }

  return {
    installed: true,
    version: version.stdout.trim(),
    envrc_allowed: envrcAllowed,
    hook_in_rc: hookInRc,
    rc_file: rcFile,
  };
}

function installCommandForPlatform(): string {
  if (process.platform === 'win32') {
    return 'winget install direnv';
  }
  if (process.platform === 'darwin') {
    return 'brew install direnv';
  }
  return 'sudo apt install direnv  (or: dnf install direnv / pacman -S direnv)';
}

function shellHookLine(): { line: string, rc: string } {
  const shell = (process.env.SHELL ?? '').toLowerCase();
  if (shell.endsWith('zsh')) {
    return { line: 'eval "$(direnv hook zsh)"', rc: '~/.zshrc' };
  }
  if (shell.endsWith('fish')) {
    return { line: 'direnv hook fish | source', rc: '~/.config/fish/config.fish' };
  }
  return { line: 'eval "$(direnv hook bash)"', rc: '~/.bashrc' };
}

// ----------------------------------------------------------------------------
// Main check
// ----------------------------------------------------------------------------

async function runDoctor(): Promise<DoctorReport> {
  const report: DoctorReport = {
    status: 'ok',
    repo_root: REPO_ROOT,
    platform: process.platform,
    shell: process.env.SHELL ?? '',
    is_tty: Boolean(process.stdin.isTTY),
    env_file_exists: existsSync(ENV_PATH),
    env_vars: {},
    mcp_json_exists: existsSync(MCP_PATH),
    opencode_jsonc_exists: existsSync(OPENCODE_PATH),
    deps_installed: existsSync(NODE_MODULES_DOTENV),
    playwright_browsers: existsSync(PW_CACHE),
    direnv: { installed: false },
    pending_actions: [],
  };

  // .env presence
  if (!report.env_file_exists) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'cp .env.example .env',
      hint: 'Create .env from the template; then fill in the vars below.',
    });
  }

  // env vars
  const envValues = report.env_file_exists
    ? parseEnvFile(await readFile(ENV_PATH, 'utf8'))
    : {};
  for (const v of REQUIRED_VARS) {
    const value = envValues[v];
    const isSet = value !== undefined && value.trim().length > 0;
    report.env_vars[v] = isSet ? 'set' : 'missing';
    if (!isSet) {
      report.pending_actions.push({
        type: 'credential',
        target: v,
        hint: VAR_HINTS[v]?.hint ?? `Required env var: ${v}`,
        where: VAR_HINTS[v]?.where,
      });
    }
  }

  // node_modules / dotenv-cli
  if (!report.deps_installed) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun install',
      hint: 'Install project dependencies including dotenv-cli (needed for `bun run claude`).',
    });
  }

  // playwright browsers
  if (!report.playwright_browsers) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun run pw:install',
      hint: 'Install Playwright Chromium binary used by /playwright-cli + E2E tests.',
    });
  }

  // direnv (optional — wrapper still works without it)
  report.direnv = await detectDirenv();
  if (!report.direnv.installed) {
    report.pending_actions.push({
      type: 'system_install',
      target: 'direnv',
      hint: 'Optional. Without direnv, launch with `bun run claude` / `bun run opencode` (wrapper). Install if you want `claude` to work directly via shell autoload.',
      where: installCommandForPlatform(),
    });
  }
  else {
    if (!report.direnv.envrc_allowed) {
      report.pending_actions.push({
        type: 'shell_command',
        target: 'direnv allow',
        hint: 'Approve this repo\'s .envrc so direnv auto-loads .env on cd.',
      });
    }
    if (!report.direnv.hook_in_rc) {
      const hook = shellHookLine();
      report.pending_actions.push({
        type: 'shell_hook',
        target: hook.rc,
        hint: `Add the direnv shell hook to ${hook.rc} so 'cd' into this repo auto-loads .env.`,
        where: hook.line,
      });
    }
  }

  // .mcp.json / opencode.jsonc presence
  if (!report.mcp_json_exists) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore .mcp.json',
      hint: '.mcp.json is missing. Restore from git — it is the committed Claude Code config.',
    });
  }
  if (!report.opencode_jsonc_exists) {
    report.pending_actions.push({
      type: 'shell_command',
      target: 'git restore opencode.jsonc',
      hint: 'opencode.jsonc is missing. Restore from git — it is the committed OpenCode config.',
    });
  }

  if (report.pending_actions.length > 0) {
    report.status = 'needs-action';
  }
  return report;
}

// ----------------------------------------------------------------------------
// Output formatters
// ----------------------------------------------------------------------------

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  bold: '\x1B[1m',
};

function printHuman(report: DoctorReport): void {
  const tick = (ok: boolean) => (ok ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`);
  const headerColor = report.status === 'ok' ? COLORS.green : COLORS.yellow;
  const headerLabel = report.status === 'ok' ? '✓ OK' : '⚠ needs action';

  process.stdout.write(`\n${COLORS.bold}Setup doctor — ${headerColor}${headerLabel}${COLORS.reset}\n\n`);
  process.stdout.write(`Platform         ${report.platform}\n`);
  process.stdout.write(`Shell            ${report.shell || '(unset)'}\n`);
  process.stdout.write(`TTY              ${report.is_tty ? 'yes' : 'no (running non-interactive)'}\n`);
  process.stdout.write('\n');
  process.stdout.write(`.env file        ${tick(report.env_file_exists)}\n`);
  process.stdout.write(`.mcp.json        ${tick(report.mcp_json_exists)}\n`);
  process.stdout.write(`opencode.jsonc   ${tick(report.opencode_jsonc_exists)}\n`);
  process.stdout.write(`node_modules     ${tick(report.deps_installed)}\n`);
  process.stdout.write(`Playwright       ${tick(report.playwright_browsers)}\n`);
  process.stdout.write(`direnv binary    ${tick(report.direnv.installed)}${report.direnv.version ? ` (${report.direnv.version})` : ''}\n`);
  if (report.direnv.installed) {
    process.stdout.write(`  .envrc allowed ${tick(Boolean(report.direnv.envrc_allowed))}\n`);
    process.stdout.write(`  shell hook     ${tick(Boolean(report.direnv.hook_in_rc))}${report.direnv.rc_file ? ` (in ${report.direnv.rc_file})` : ''}\n`);
  }

  process.stdout.write('\nEnv vars:\n');
  for (const [k, v] of Object.entries(report.env_vars)) {
    const mark = v === 'set' ? `${COLORS.green}✓ set${COLORS.reset}` : `${COLORS.red}✗ missing${COLORS.reset}`;
    process.stdout.write(`  ${k.padEnd(22)} ${mark}\n`);
  }

  if (report.pending_actions.length > 0) {
    process.stdout.write(`\n${COLORS.bold}Pending actions:${COLORS.reset}\n`);
    for (const action of report.pending_actions) {
      process.stdout.write(`  ${COLORS.yellow}[${action.type}]${COLORS.reset} ${action.target}\n`);
      process.stdout.write(`    ${action.hint}\n`);
      if (action.where) {
        process.stdout.write(`    ${COLORS.dim}→ ${action.where}${COLORS.reset}\n`);
      }
    }
    process.stdout.write(`\n${COLORS.dim}For AI agents: bun run setup:doctor --json  (machine-readable)${COLORS.reset}\n`);
  }
  else {
    process.stdout.write(`\n${COLORS.green}All green.${COLORS.reset} Launch agent: bun run claude  /  bun run opencode\n`);
  }
}

// ----------------------------------------------------------------------------
// Entry
// ----------------------------------------------------------------------------

const asJson = process.argv.includes('--json');

runDoctor().then((report) => {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  else {
    printHuman(report);
  }
  process.exit(report.status === 'ok' ? 0 : 1);
}).catch((err) => {
  process.stderr.write(`Doctor failed: ${(err as Error).message ?? String(err)}\n`);
  process.exit(2);
});
