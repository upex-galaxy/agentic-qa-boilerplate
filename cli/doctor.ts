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
 *   bun run setup:doctor --preflight  # blocker-only gate for `bun run setup`
 *
 * --preflight mode: minimal pre-install gate. Checks only the things that
 * would crash `cli/install.ts` at module-load time (Bun runtime present and
 * recent enough, `node_modules/@inquirer/prompts` resolvable). Skips env
 * vars, MCPs, direnv, external CLIs — those are install.ts's job. Uses only
 * node built-ins so it runs safely before `bun install`. Wired into the
 * `setup` npm script as `bun cli/doctor.ts --preflight && bun cli/install.ts`.
 *
 * Exit code:
 *   0 if status === "ok"     (full mode) or preflight passes
 *   1 if status === "needs-action"  or preflight blocker hit
 *
 * Side effects: none. This script never edits files or installs anything.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  formatInstanceMismatchWarning,
  resolveAtlassianInstance,
} from './lib/atlassian-instance.ts';
// Canonical variable manifest (source of truth — D1). Imports only `node:fs`,
// so it is safe to load statically here without breaking the dependency-free
// `--preflight` contract (no third-party deps pulled in).
import { playwrightBrowsersInstalled } from './lib/playwright-cache.ts';
import { requiredNow, varsFor } from './lib/variables-manifest.ts';

// `tui` pulls third-party deps (boxen/cli-table3/figures/picocolors). It is
// imported lazily inside main() so `--preflight` loads only node built-ins and
// runs safely on a fresh clone before `bun install`.
let tui!: typeof import('./lib/tui.ts');

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '..');
const ENV_PATH = join(REPO_ROOT, '.env');
const MCP_PATH = join(REPO_ROOT, '.mcp.json');
const OPENCODE_PATH = join(REPO_ROOT, 'opencode.jsonc');
const NODE_MODULES_DOTENV = join(REPO_ROOT, 'node_modules', 'dotenv-cli');
// --preflight mode resolves install.ts's only third-party import.
const INQUIRER_MARKER = join(REPO_ROOT, 'node_modules', '@inquirer', 'prompts', 'package.json');

// Minimum Bun version that install.ts is known to work with.
const MIN_BUN: readonly [number, number, number] = [1, 0, 0];

// Env vars surfaced by doctor.
//
// Source of truth = `VAR_MANIFEST` (D1) via `varsFor('local')` — resolved at the
// point of use in `runDoctor` rather than a separate hand-maintained list (which
// used to drift from the installer). DBHub vars live in the manifest but are
// surfaced separately/manually (edit `dbhub.toml`), so they are filtered out at
// the call site; `VAR_HINTS` provides the per-var help text for reported vars.
//
// `requiredNow(spec, env)` decides required-vs-optional given the current
// TEST_ENV (e.g. STAGING_USER_* is required only when TEST_ENV=staging). Vars
// that are not required-now are still reported (set/missing) but do NOT block.

const VAR_HINTS: Record<string, { hint: string, where: string }> = {
  TEST_ENV: {
    hint: 'Default test environment for the runner',
    where: 'Valid: local | staging',
  },
  LOCAL_USER_EMAIL: {
    hint: 'Email for the local test user',
    where: 'A test account in your local dev environment',
  },
  LOCAL_USER_PASSWORD: {
    hint: 'Password for the local test user',
    where: 'A test account in your local dev environment',
  },
  STAGING_USER_EMAIL: {
    hint: 'Email for the staging test user',
    where: 'A test account in your staging environment',
  },
  STAGING_USER_PASSWORD: {
    hint: 'Password for the staging test user',
    where: 'A test account in your staging environment',
  },
  TAVILY_API_KEY: {
    hint: 'Tavily web-search MCP API key',
    where: 'https://app.tavily.com/  →  account  →  API keys',
  },
  RESEND_API_KEY: {
    hint: 'Resend API key (email-flow tests + resend CLI auth)',
    where: 'https://resend.com/api-keys  (docs: https://resend.com/docs/api-reference/introduction)',
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
    hint: 'Backend API base URL for OpenAPI MCP (project-bound — fill once the target backend is reachable)',
    where: 'e.g. https://api.yourapp.com/v1',
  },
  OPENAPI_SPEC_PATH: {
    hint: 'Path or URL to the OpenAPI/Swagger spec (project-bound)',
    where: 'e.g. https://api.yourapp.com/openapi.json (or a local file path)',
  },
  API_TOKEN: {
    hint: 'Legacy/optional — the OpenAPI MCP is now schema-read-only and does NOT use this. `bun run api:login` writes the curl token to .auth/tokens.env instead',
    where: 'Not required; run `bun run api:login` to mint a token for curl-based API testing',
  },
  POSTMAN_API_KEY: {
    hint: 'Postman API key for Postman MCP (project-bound — only needed if you use Postman collections)',
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
  /**
   * The Atlassian site host, resolved from `.agents/project.yaml`. Reported
   * apart from `env_vars` because it is NOT an env var — listing it there would
   * report `missing` forever on a correctly configured repo.
   */
  atlassian_host: { status: 'set' | 'missing', value?: string, source?: 'project.yaml' | 'env' }
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
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
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
  // Modern direnv prints `Found RC allowed 0` (0 = Allow); older variants used
  // `true`. Match the numeric enum and treat 0 (or legacy true) as allowed.
  const allowMatch = status.stdout.match(/Found RC allowed (\d+|true)/);
  const envrcAllowed = allowMatch !== null && (allowMatch[1] === '0' || allowMatch[1] === 'true');

  // Every file `shellHookLine()` may have told the user to edit. The PowerShell
  // profiles matter on native Windows, where none of the POSIX rc files exist —
  // without them a user who followed the pwsh instruction to the letter would
  // still be reported as "hook missing" on every re-run.
  const candidates = [
    join(homedir(), '.bashrc'),
    join(homedir(), '.zshrc'),
    join(homedir(), '.bash_profile'),
    join(homedir(), '.profile'),
    join(homedir(), '.config', 'fish', 'config.fish'),
    join(homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    join(homedir(), 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
  ];
  let hookInRc = false;
  let rcFile: string | undefined;
  for (const path of candidates) {
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
  if (shell.endsWith('bash')) {
    return { line: 'eval "$(direnv hook bash)"', rc: '~/.bashrc' };
  }
  // No POSIX $SHELL (typical on native Windows PowerShell) — advise the pwsh hook
  // instead of mis-instructing the user to edit ~/.bashrc.
  if (process.platform === 'win32') {
    return { line: 'Invoke-Expression "$(direnv hook pwsh)"', rc: '$PROFILE' };
  }
  return { line: 'eval "$(direnv hook bash)"', rc: '~/.bashrc' };
}

function parseBunVersion(v: string): [number, number, number] | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) { return null; }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersion(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) { return a[i] - b[i]; }
  }
  return 0;
}

// ----------------------------------------------------------------------------
// Preflight (blocker-only gate for `bun run setup`)
// ----------------------------------------------------------------------------

function preflightFail(msg: string, fix: string): never {
  // Dependency-free output — preflight may run before `bun install`, so no TUI.
  process.stderr.write(`Preflight failed: ${msg}\n`);
  process.stderr.write(`  Fix: ${fix}\n`);
  process.exit(1);
}

function runPreflight(): never {
  // Dependency-free header — preflight loads no TUI (third-party) modules.
  process.stdout.write('\nPreflight check\n');

  const bunVersion = process.versions.bun;
  if (!bunVersion) {
    preflightFail(
      'Bun runtime not detected (process.versions.bun is undefined).',
      'Install Bun from https://bun.sh, then re-run `bun run setup`.',
    );
  }
  const parsed = parseBunVersion(bunVersion);
  if (!parsed || compareVersion(parsed, MIN_BUN) < 0) {
    preflightFail(
      `Bun ${bunVersion} is older than required ${MIN_BUN.join('.')}.`,
      'Upgrade Bun: `bun upgrade` (or reinstall from https://bun.sh).',
    );
  }
  if (!existsSync(INQUIRER_MARKER)) {
    preflightFail(
      'Project dependencies not installed (node_modules/@inquirer/prompts missing).',
      'Run `bun install` first, then re-run `bun run setup`.',
    );
  }
  process.stdout.write(`Preflight OK (Bun ${bunVersion}, deps installed)\n`);
  process.exit(0);
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
    atlassian_host: { status: 'missing' },
    mcp_json_exists: existsSync(MCP_PATH),
    opencode_jsonc_exists: existsSync(OPENCODE_PATH),
    deps_installed: existsSync(NODE_MODULES_DOTENV),
    playwright_browsers: playwrightBrowsersInstalled(),
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

  // env vars — manifest-driven (D1). Every reported var is set/missing; only
  // vars that are required GIVEN the current env (`requiredNow` resolves the
  // `{ ifEnv: 'TEST_ENV=staging' }` clauses) push a blocking credential action.
  const envValues = report.env_file_exists
    ? parseEnvFile(await readFile(ENV_PATH, 'utf8'))
    : {};
  const localSpecs = varsFor('local').filter(spec => !spec.name.startsWith('DBHUB_'));
  for (const spec of localSpecs) {
    const v = spec.name;
    const value = envValues[v];
    const isSet = value !== undefined && value.trim().length > 0;
    report.env_vars[v] = isSet ? 'set' : 'missing';
    if (!isSet && requiredNow(spec, envValues)) {
      report.pending_actions.push({
        type: 'credential',
        target: v,
        hint: VAR_HINTS[v]?.hint ?? `Required env var: ${v}`,
        where: VAR_HINTS[v]?.where,
      });
    }
  }

  // Atlassian host — a yaml field, NOT an env var. Checking `process.env` here
  // would be worse than useless: the variable's absence is the desired state,
  // and its PRESENCE is the bug (a stale copy inherited from the parent shell is
  // exactly what pointed the sync scripts and the TMS provider at a dead site).
  try {
    const instance = resolveAtlassianInstance();
    report.atlassian_host = { status: 'set', value: instance.baseUrl, source: instance.source };
    const warning = formatInstanceMismatchWarning(instance);
    if (warning !== null) {
      report.pending_actions.push({
        type: 'shell_command',
        target: 'unset ATLASSIAN_URL',
        hint: warning,
      });
    }
    else if (instance.source === 'env') {
      report.pending_actions.push({
        type: 'shell_command',
        target: 'bun run agents:setup',
        hint: 'Atlassian host is coming from an ATLASSIAN_URL env var, not from '
          + '.agents/project.yaml. That fallback exists for a repo that has not been set up '
          + 'yet; write the host to the yaml so it is versioned and cannot go stale.',
      });
    }
  }
  catch {
    report.atlassian_host = { status: 'missing' };
    report.pending_actions.push({
      type: 'shell_command',
      target: 'bun run agents:setup',
      hint: 'Atlassian host not set. Fill `issue_tracker.atlassian_url` in '
        + '.agents/project.yaml — it is the source of truth for every jira:sync-* script, for '
        + '`acli --site`, and for the Jira-Direct TMS provider that writes results back to '
        + 'issues. Read it back with `bun run --silent jira:url`.',
    });
  }

  // Warn about legacy JIRA_* credential keys that no longer have any effect.
  // The repo collapsed all Atlassian credentials onto the ATLASSIAN_* family;
  // these names are no longer read by any consumer. acli and
  // scripts/sync-jira-*.ts read ATLASSIAN_* directly; the Atlassian MCP server
  // is opt-in via docs/mcp/.
  const LEGACY_JIRA_CRED_KEYS = ['JIRA_URL', 'JIRA_USER', 'JIRA_API_TOKEN', 'JIRA_BASE_URL', 'JIRA_EMAIL'] as const;
  const legacyPresent = LEGACY_JIRA_CRED_KEYS.filter(
    k => envValues[k] !== undefined && envValues[k].trim().length > 0,
  );
  if (legacyPresent.length > 0) {
    tui.log.warn(
      `Found legacy credential keys in .env that are no longer used: ${legacyPresent.join(', ')}.\n`
      + '       Atlassian credentials now come from ATLASSIAN_EMAIL / ATLASSIAN_API_TOKEN; the site\n'
      + '       host lives in .agents/project.yaml -> issue_tracker.atlassian_url.\n'
      + '       Move any unique value into the ATLASSIAN_* counterpart and delete the legacy line.',
    );
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

function printHuman(report: DoctorReport): void {
  const statusLabel = report.status === 'ok' ? 'OK' : 'needs action';

  tui.section(`Setup doctor — ${statusLabel}`);

  tui.kv([
    { k: 'Platform', v: report.platform },
    { k: 'Shell', v: report.shell || '(unset)' },
    { k: 'TTY', v: report.is_tty ? 'yes' : 'no (running non-interactive)' },
  ]);

  process.stdout.write('\n');

  // File + dep checks as a table
  const checks: string[][] = [
    ['.env file', report.env_file_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['.mcp.json', report.mcp_json_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['opencode.jsonc', report.opencode_jsonc_exists ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['node_modules', report.deps_installed ? tui.statusIcon('ok') : tui.statusIcon('fail')],
    ['Playwright browsers', report.playwright_browsers ? tui.statusIcon('ok') : tui.statusIcon('warn')],
    [`direnv binary${report.direnv.version ? ` (${report.direnv.version})` : ''}`, report.direnv.installed ? tui.statusIcon('ok') : tui.statusIcon('warn')],
  ];
  if (report.direnv.installed) {
    checks.push(['  .envrc allowed', report.direnv.envrc_allowed ? tui.statusIcon('ok') : tui.statusIcon('fail')]);
    checks.push([`  shell hook${report.direnv.rc_file ? ` (in ${report.direnv.rc_file})` : ''}`, report.direnv.hook_in_rc ? tui.statusIcon('ok') : tui.statusIcon('warn')]);
  }
  // The host is shown by VALUE, not as a set/missing tick. Reading which site
  // the repo is about to write to is the entire point — a green check that says
  // "configured" is exactly what let a dead instance go unnoticed.
  const hostRow = ((): string => {
    const host = report.atlassian_host;
    if (host.status !== 'set') { return tui.statusIcon('fail'); }
    const fromYaml = host.source === 'project.yaml';
    const icon = tui.statusIcon(fromYaml ? 'ok' : 'warn');
    const note = fromYaml ? '' : ' (from ATLASSIAN_URL env — not versioned)';
    return `${icon} ${host.value}${note}`;
  })();
  checks.push(['Atlassian host (.agents/project.yaml)', hostRow]);
  process.stdout.write(`${tui.table(['Check', 'Status'], checks)}\n`);

  // Env vars as a table
  tui.section('Env vars');
  const envRows = Object.entries(report.env_vars).map(([k, v]) => [
    k,
    v === 'set' ? tui.statusIcon('ok') : tui.statusIcon('fail'),
    v === 'set' ? 'set' : 'missing',
  ]);
  process.stdout.write(`${tui.table(['Variable', 'Status', 'Value'], envRows)}\n`);

  if (report.pending_actions.length > 0) {
    tui.section('Pending actions');
    for (const action of report.pending_actions) {
      process.stdout.write(`  ${tui.statusIcon('warn')} [${action.type}] ${action.target}\n`);
      process.stdout.write(`    ${action.hint}\n`);
      if (action.where) {
        process.stdout.write(`    -> ${action.where}\n`);
      }
    }
    process.stdout.write('\nFor AI agents: bun run setup:doctor --json  (machine-readable)\n');
  }
  else {
    process.stdout.write('\n');
    process.stdout.write(`${tui.successBox(['All green. Launch agent: bun run claude  /  bun run opencode'])}\n`);
  }
}

// ----------------------------------------------------------------------------
// Entry
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes('--preflight')) {
    runPreflight(); // never returns
    return;
  }

  // Full mode needs the TUI (boxen/cli-table3/figures/picocolors). Load it lazily
  // here — NOT at module top — so `--preflight` stays dependency-free and runs on
  // a fresh clone before `bun install`.
  tui = await import('./lib/tui.ts');

  const asJson = process.argv.includes('--json');
  try {
    const report = await runDoctor();
    if (asJson) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
    else {
      printHuman(report);
    }
    process.exit(report.status === 'ok' ? 0 : 1);
  }
  catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Exit 2 = doctor internal error (distinct from 1 = needs-action). In --json
    // mode emit a JSON envelope so agent consumers don't choke on a bare string.
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ status: 'error', error: msg }, null, 2)}\n`);
    }
    else {
      process.stderr.write(`Doctor failed: ${msg}\n`);
    }
    process.exit(2);
  }
}

void main();
