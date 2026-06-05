/**
 * @fileoverview `--variables` flow — idempotent local + remote env-var setup.
 *
 * Phase 2+3 of the installer `--variables` feature (handoff
 * `.scratch/handoff-installer-variables-automation.md`, §3.2). All the logic
 * lives here so `cli/install.ts` only grows an arg branch + a couple of
 * `export` keywords — keeping that file's diff surgical.
 *
 * What it does (driven entirely by `VAR_MANIFEST` from `variables-manifest.ts`):
 *   - LOCAL  : idempotent upsert of every `destinations ∋ 'local'` var into
 *              `.env` (reuses install.ts `appendVarsToEnv`; skips already-set
 *              unless `--force`). Backs `.env` up to `.backups/` first (D5).
 *   - REMOTE : pushes every `destinations ∋ 'github'` var (EXCLUDING
 *              GITHUB_TOKEN, which is never in the manifest) to GitHub Actions
 *              repository secrets via `gh secret set` — value piped over STDIN,
 *              NEVER on argv (D3, mirrors the acli-login `spawnSync({input})`
 *              pattern). `gh secret set` is upsert, so no read-before-write.
 *
 * Security (non-negotiable, D3):
 *   - Secret values only ever travel via STDIN.
 *   - Remote writes are gated behind an explicit confirm (or `--yes`); HARD
 *     REFUSED when non-interactive and `--yes` was not passed.
 *   - `--dry-run` prints what WOULD be set (names + scopes, NEVER values).
 *   - No secret value is ever printed.
 *
 * Idempotency (D4): local upsert skips already-set unless `--force`; GitHub is
 * natively upsert. Empty-valued vars are skipped (recorded as `'skipped'`).
 *
 * Remote target for THIS repo (QA) = GitHub Actions secrets. The sibling DEV
 * boilerplate targets Vercel; that backend lives in its own copy of this file.
 */

import type { VarSpec } from './variables-manifest.ts';

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// install.ts owns the canonical `.env` primitives — reuse, never reinvent
// (they are `export`ed for exactly this consumer). `promptForVar` already masks
// secret-named vars internally (via install.ts `isSecretName`), so this flow
// does not import that helper directly.
import {
  appendVarsToEnv,
  detectGh,
  ensureEnvFileExists,
  parseEnvFile,
  promptForVar,
  reloadDotEnv,
} from '../install.ts';
import * as tui from './tui.ts';
import { criticalVars, varsFor } from './variables-manifest.ts';

// ----------------------------------------------------------------------------
// Constants + options
// ----------------------------------------------------------------------------

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const ENV_PATH = join(REPO_ROOT, '.env');
const BACKUPS_DIR = join(REPO_ROOT, '.backups');

/**
 * Options for `runVariablesFlow`.
 *   - `mode`           which halves to run: `local` only, `remote` only, or `both`.
 *   - `force`          re-write `.env` vars that already have a value.
 *   - `dryRun`         print what WOULD happen (names + scopes) without executing.
 *   - `yes`            pre-approve remote writes (skips the confirm prompt).
 *   - `nonInteractive` no TTY / `--auto` — never prompt; hard-refuse remote
 *                      writes unless `yes` is also set.
 *   - `interactiveMenu` no explicit mode flag was given AND we have a TTY → show
 *                      the interactive menu (set/reset critical, push remote,
 *                      everything, leave-as-is) instead of running `mode`
 *                      straight through. Flags (`--variables-local/-remote`,
 *                      `--yes`, `--force`) suppress this for scriptable runs.
 */
export interface VariablesFlowOptions {
  mode: 'local' | 'remote' | 'both'
  force?: boolean
  dryRun?: boolean
  yes?: boolean
  nonInteractive?: boolean
  interactiveMenu?: boolean
}

/** Per-var outcome, mirrors `state.remoteSecrets` shape for observability (D5). */
type VarResult = 'set' | 'skipped' | 'failed';

interface VarReportRow {
  name: string
  local: VarResult | '—'
  remote: VarResult | '—'
  note: string
}

// ----------------------------------------------------------------------------
// COLORS — keep in step with install.ts (no shared export to stay surgical).
// ----------------------------------------------------------------------------

const COLORS = {
  reset: '\x1B[0m',
  dim: '\x1B[2m',
  bold: '\x1B[1m',
  yellow: '\x1B[33m',
};

// ----------------------------------------------------------------------------
// Backup (D5)
// ----------------------------------------------------------------------------

/**
 * Copy `.env` to a timestamped dir under `.backups/` before mutating it.
 * Mirrors the updater's `.backups/` convention (gitignored). Best-effort: a
 * backup failure does not block the flow, but it is surfaced.
 */
async function backupEnv(): Promise<string | null> {
  if (!existsSync(ENV_PATH)) { return null; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(BACKUPS_DIR, `env-${stamp}-${process.pid}`);
  try {
    mkdirSync(dir, { recursive: true });
    const dest = join(dir, '.env');
    await copyFile(ENV_PATH, dest);
    return dest;
  }
  catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// LOCAL half
// ----------------------------------------------------------------------------

/**
 * Idempotent upsert of every `destinations ∋ 'local'` manifest var into `.env`.
 * Skips vars that already hold a value unless `force`. In `nonInteractive`
 * mode it never prompts — already-set vars are kept, missing vars are left
 * missing (recorded as `'skipped'`).
 */
async function runLocal(
  opts: VariablesFlowOptions,
  rows: Map<string, VarReportRow>,
): Promise<void> {
  const localVars = varsFor('local');
  const existing = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const collected: Record<string, string> = {};

  for (const spec of localVars) {
    const row = ensureRow(rows, spec);
    const current = (existing[spec.name] ?? '').trim();
    const alreadySet = current.length > 0;

    if (alreadySet && !opts.force) {
      row.local = 'skipped';
      continue;
    }

    if (opts.dryRun) {
      // Names only — never values. Mark intent without touching `.env`.
      row.local = alreadySet ? 'set' : 'skipped';
      continue;
    }

    if (opts.nonInteractive) {
      // No TTY → cannot prompt. Keep whatever is already there; do not clobber.
      row.local = alreadySet ? 'set' : 'skipped';
      continue;
    }

    // Interactive: prompt (masking secrets via isSecretName, matching install.ts).
    const entered = await promptForVar(spec.name);
    if (entered.length === 0) {
      row.local = alreadySet ? 'set' : 'skipped';
      continue;
    }
    collected[spec.name] = entered;
    row.local = 'set';
  }

  if (!opts.dryRun && Object.keys(collected).length > 0) {
    await appendVarsToEnv(collected);
    reloadDotEnv();
  }
}

// ----------------------------------------------------------------------------
// REMOTE half (GitHub Actions secrets)
// ----------------------------------------------------------------------------

interface RemoteGate {
  ok: boolean
  repo?: string
  reason?: string
}

/**
 * Resolve the `owner/repo` slug `gh secret set --repo` needs. Prefers
 * `gh repo view`, then the git `origin` remote. Returns null if neither yields a
 * usable slug.
 */
function resolveRepoSlug(): string | null {
  const ghView = spawnSync(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
    { encoding: 'utf8' },
  );
  if (ghView.status === 0) {
    const slug = (ghView.stdout ?? '').trim();
    if (slug.length > 0) { return slug; }
  }

  const origin = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (origin.status === 0) {
    const url = (origin.stdout ?? '').trim();
    // git@github.com:owner/repo.git  OR  https://github.com/owner/repo(.git)
    const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (m) { return `${m[1]}/${m[2]}`; }
  }
  return null;
}

/**
 * Decide whether the remote push is allowed to run. Gates on:
 *   1. `gh` found + authenticated (`detectGh`).
 *   2. a resolvable target repo slug.
 *   3. explicit approval — `yes`, or an interactive confirm. HARD-REFUSED when
 *      non-interactive without `yes` (D3: secret mutation has blast radius the
 *      append-only auto policy never assumed).
 */
async function gateRemote(opts: VariablesFlowOptions): Promise<RemoteGate> {
  const gh = detectGh();
  if (!gh.found) {
    return { ok: false, reason: 'gh CLI not found on PATH — install it (https://github.com/cli/cli#installation) then re-run.' };
  }
  if (!gh.authenticated) {
    return { ok: false, reason: 'gh CLI not authenticated — run `gh auth login` then re-run.' };
  }

  const repo = resolveRepoSlug();
  if (!repo) {
    return { ok: false, reason: 'Could not resolve target repo (no `gh repo view` result and no github.com origin remote).' };
  }

  if (opts.nonInteractive && !opts.yes) {
    // HARD REFUSE — never push secrets unattended without an explicit --yes.
    return {
      ok: false,
      repo,
      reason: 'Refusing to push GitHub secrets in non-interactive / CI / --auto mode without an explicit --yes flag (secret mutation is irreversible).',
    };
  }

  if (opts.dryRun) {
    return { ok: true, repo };
  }

  if (!opts.yes) {
    const proceed = await tui.confirm({
      message: `Push GitHub Actions secrets to ${repo}? (Values are read from .env and piped via stdin; never printed.)`,
      initialValue: false,
    });
    if (tui.isCancel(proceed) || !proceed) {
      return { ok: false, repo, reason: 'Remote push declined by user.' };
    }
  }

  return { ok: true, repo };
}

/**
 * Push one secret to GitHub via `gh secret set <NAME> --repo <slug>`, value on
 * STDIN (NEVER argv). `gh secret set` is upsert. Returns `'set'` / `'failed'`.
 */
function pushOneSecret(name: string, value: string, repo: string): VarResult {
  const res = spawnSync(
    'gh',
    ['secret', 'set', name, '--repo', repo],
    {
      input: value,
      stdio: ['pipe', 'ignore', 'inherit'],
      timeout: 20000,
    },
  );
  return res.status === 0 ? 'set' : 'failed';
}

/**
 * Push every `destinations ∋ 'github'` manifest var that has a non-empty value
 * in `.env`. Empty values are skipped (recorded `'skipped'`). On `dryRun`,
 * prints "would set <NAME> (github)" and executes nothing.
 *
 * Returns the set of var names that were actually set (used for the D6 Xray /
 * Atlassian CI-wiring notice).
 */
async function runRemote(
  opts: VariablesFlowOptions,
  rows: Map<string, VarReportRow>,
): Promise<{ blocked?: string, repo?: string, setNames: string[] }> {
  const gate = await gateRemote(opts);
  if (!gate.ok) {
    // Mark every github-bound var skipped so the report explains the no-op.
    for (const spec of varsFor('github')) {
      const row = ensureRow(rows, spec);
      if (row.remote === '—') { row.remote = 'skipped'; }
    }
    return { blocked: gate.reason, repo: gate.repo, setNames: [] };
  }

  const repo = gate.repo as string;
  const githubVars = varsFor('github');
  const existing = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const setNames: string[] = [];

  for (const spec of githubVars) {
    const row = ensureRow(rows, spec);
    const value = (existing[spec.name] ?? '').trim();

    if (value.length === 0) {
      row.remote = 'skipped';
      continue;
    }

    if (opts.dryRun) {
      // Names + scope only — never the value.
      process.stdout.write(`  ${COLORS.dim}would set ${spec.name} (github)${COLORS.reset}\n`);
      row.remote = 'set';
      setNames.push(spec.name);
      continue;
    }

    const result = pushOneSecret(spec.name, value, repo);
    row.remote = result;
    if (result === 'set') { setNames.push(spec.name); }
  }

  return { repo, setNames };
}

// ----------------------------------------------------------------------------
// Reporting
// ----------------------------------------------------------------------------

function ensureRow(rows: Map<string, VarReportRow>, spec: VarSpec): VarReportRow {
  let row = rows.get(spec.name);
  if (!row) {
    row = { name: spec.name, local: '—', remote: '—', note: spec.note };
    rows.set(spec.name, row);
  }
  return row;
}

function fmtResult(value: VarResult | '—'): string {
  switch (value) {
    case 'set': return tui.statusIcon('ok');
    case 'skipped': return tui.statusIcon('warn');
    case 'failed': return tui.statusIcon('fail');
    default: return `${COLORS.dim}—${COLORS.reset}`;
  }
}

function printReport(rows: Map<string, VarReportRow>): void {
  tui.section('Variables — per-var result');
  const tableRows: string[][] = [];
  for (const row of rows.values()) {
    // `note` can be long; clip to keep the table readable. Never contains values.
    const note = row.note.length > 60 ? `${row.note.slice(0, 57)}…` : row.note;
    tableRows.push([
      row.name,
      `${fmtResult(row.local)} ${row.local}`,
      `${fmtResult(row.remote)} ${row.remote}`,
      note,
    ]);
  }
  process.stdout.write(`${tui.table(['Variable', 'Local', 'Remote', 'Note'], tableRows)}\n`);
}

// ----------------------------------------------------------------------------
// D6 — Xray / Atlassian CI wiring notice
// ----------------------------------------------------------------------------

/**
 * If any XRAY_* / ATLASSIAN_* secret was pushed, print a one-line reminder that
 * their `env:` lines in `.github/workflows/regression.yml` are commented out.
 * We do NOT edit the workflow (D6 default = notify only).
 */
function maybeNoticeXrayAtlassian(setNames: string[]): void {
  const touched = setNames.filter(n => n.startsWith('XRAY_') || n.startsWith('ATLASSIAN_'));
  if (touched.length === 0) { return; }
  process.stdout.write(
    `\n${COLORS.yellow}Note:${COLORS.reset} pushed ${touched.join(', ')} as secrets, but their `
    + `${COLORS.bold}env:${COLORS.reset} lines in `
    + `${COLORS.bold}.github/workflows/regression.yml${COLORS.reset} are commented out. `
    + 'Uncomment them if you run AUTO_SYNC in CI.\n',
  );
}

// ----------------------------------------------------------------------------
// CRITICAL-set path (menu option "a") — set / reset the project-independent
// tool credentials. Idempotent: already-set vars are kept unless the user opts
// to overwrite (or `--force` is passed). Local-destination upsert only.
// ----------------------------------------------------------------------------

/**
 * Prompt for each spec in `specs` and upsert non-empty answers into `.env`.
 * Shared engine behind the critical-set path AND the var-by-var walk. For an
 * already-set var, asks whether to overwrite (auto-yes under `force`). Blank
 * input keeps the existing value (idempotent, no clobber). Secrets are masked
 * by `promptForVar`; values are never printed. Records each outcome into `rows`.
 */
async function promptVarsInto(
  specs: VarSpec[],
  opts: VariablesFlowOptions,
  rows: Map<string, VarReportRow>,
): Promise<void> {
  const existing = parseEnvFile(await readFile(ENV_PATH, 'utf8'));
  const collected: Record<string, string> = {};

  for (const spec of specs) {
    const row = ensureRow(rows, spec);
    const current = (existing[spec.name] ?? '').trim();
    const alreadySet = current.length > 0;

    if (alreadySet && !opts.force) {
      const overwrite = await tui.confirm({
        message: `${spec.name} is already set. Overwrite it?`,
        initialValue: false,
      });
      if (tui.isCancel(overwrite) || !overwrite) {
        row.local = 'skipped';
        continue;
      }
    }

    const entered = await promptForVar(spec.name);
    if (entered.length === 0) {
      // Blank input keeps any existing value (idempotent, no clobber).
      row.local = alreadySet ? 'set' : 'skipped';
      continue;
    }
    collected[spec.name] = entered;
    row.local = 'set';
  }

  if (Object.keys(collected).length > 0) {
    await appendVarsToEnv(collected);
    reloadDotEnv();
  }
}

/**
 * Prompt the CRITICAL set (manifest `critical: true`) into `.env`. Thin wrapper
 * over {@link promptVarsInto}.
 */
async function runCriticalSet(
  opts: VariablesFlowOptions,
  rows: Map<string, VarReportRow>,
): Promise<void> {
  await promptVarsInto(criticalVars(), opts, rows);
}

// ----------------------------------------------------------------------------
// Interactive menu (shown when no explicit mode flag was given + a TTY exists)
// ----------------------------------------------------------------------------

type MenuChoice = 'walk' | 'critical' | 'remote' | 'everything' | 'leave';

/**
 * Drive the interactive menu (QA has no Vercel pull, so no infra-pull option):
 *   (a) Walk — set EVERY local var one by one (Enter skips; overwrite-confirm on
 *       already-set). The flag-free human path; `--variables-local` is now purely
 *       a scripting alias.
 *   (b) Set / reset the CRITICAL variables (the 5 project-independent creds).
 *   (c) Push local .env → GitHub Actions secrets.
 *   (d) Everything (critical then push) / leave as-is.
 * Returns the rows map to print, plus the remote outcome for the closing notice.
 */
async function runMenu(opts: VariablesFlowOptions): Promise<void> {
  const rows = new Map<string, VarReportRow>();

  const choice = await tui.select<MenuChoice>({
    message: 'What do you want to do?',
    options: [
      { label: 'Set variables one by one (walk all local vars)', value: 'walk' as const },
      { label: 'Set / reset the critical variables (Atlassian, Resend, Tavily)', value: 'critical' as const },
      { label: 'Push local .env → GitHub Actions secrets', value: 'remote' as const },
      { label: 'Everything (set critical, then push remote)', value: 'everything' as const },
      { label: 'Leave as-is (exit)', value: 'leave' as const },
    ],
    initialValue: 'walk' as const,
  });

  if (tui.isCancel(choice) || choice === 'leave') {
    tui.log.info('No changes made.');
    return;
  }

  // Back up `.env` before any mutation (D5).
  const backup = await backupEnv();
  if (backup) { tui.log.info(`Backed up .env → ${backup}`); }

  if (choice === 'walk') {
    tui.section('Set variables one by one');
    await promptVarsInto(varsFor('local'), opts, rows);
  }

  if (choice === 'critical' || choice === 'everything') {
    tui.section('Set / reset critical variables');
    await runCriticalSet(opts, rows);
  }

  let remoteOutcome: { blocked?: string, repo?: string, setNames: string[] } = { setNames: [] };
  if (choice === 'remote' || choice === 'everything') {
    tui.section('Push GitHub Actions secrets');
    remoteOutcome = await runRemote(opts, rows);
    if (remoteOutcome.blocked) {
      tui.log.warn(`Remote push skipped: ${remoteOutcome.blocked}`);
    }
    else if (remoteOutcome.repo) {
      tui.log.info(`Pushed GitHub secrets to ${remoteOutcome.repo}.`);
    }
  }

  printReport(rows);

  if ((choice === 'remote' || choice === 'everything') && !remoteOutcome.blocked) {
    maybeNoticeXrayAtlassian(remoteOutcome.setNames);
  }
}

// ----------------------------------------------------------------------------
// Entry point
// ----------------------------------------------------------------------------

/**
 * Run the `--variables` flow. Self-contained; the only install.ts coupling is
 * the imported `.env` primitives.
 *
 * When `interactiveMenu` is set (no explicit mode flag + a TTY), shows the
 * menu. Otherwise runs `mode` straight through (scriptable / flag-driven),
 * preserving all existing gating, security, and idempotency exactly as built.
 */
export async function runVariablesFlow(opts: VariablesFlowOptions): Promise<void> {
  // Interactive menu — only when explicitly requested by the caller (no mode
  // flag, TTY present). All flag-driven invocations fall through to the
  // unchanged straight-through path below.
  if (opts.interactiveMenu && !opts.nonInteractive) {
    tui.section('Variables — interactive setup');
    await ensureEnvFileExists();
    await runMenu(opts);
    return;
  }

  const rows = new Map<string, VarReportRow>();

  tui.section(
    `Variables flow — mode=${opts.mode}`
    + `${opts.dryRun ? ' (dry-run)' : ''}`
    + `${opts.force ? ' (force)' : ''}`,
  );

  await ensureEnvFileExists();

  // Back up `.env` before any mutation (D5) — skip on dry-run (no writes).
  if (!opts.dryRun) {
    const backup = await backupEnv();
    if (backup) {
      tui.log.info(`Backed up .env → ${backup}`);
    }
    else if (existsSync(ENV_PATH)) {
      tui.log.warn('Could not back up .env before mutating (continuing — .env will still be upserted, not truncated).');
    }
  }

  const doLocal = opts.mode === 'local' || opts.mode === 'both';
  const doRemote = opts.mode === 'remote' || opts.mode === 'both';

  if (doLocal) {
    await runLocal(opts, rows);
  }

  let remoteOutcome: { blocked?: string, repo?: string, setNames: string[] } = { setNames: [] };
  if (doRemote) {
    remoteOutcome = await runRemote(opts, rows);
    if (remoteOutcome.blocked) {
      tui.log.warn(`Remote push skipped: ${remoteOutcome.blocked}`);
    }
    else if (remoteOutcome.repo) {
      tui.log.info(
        opts.dryRun
          ? `Dry-run: would push to ${remoteOutcome.repo} (no secrets written).`
          : `Pushed GitHub secrets to ${remoteOutcome.repo}.`,
      );
    }
  }

  printReport(rows);

  if (doRemote && !remoteOutcome.blocked) {
    maybeNoticeXrayAtlassian(remoteOutcome.setNames);
  }
}
