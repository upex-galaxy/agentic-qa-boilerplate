/**
 * @fileoverview What a linked git worktree of this repo holds that git does
 * not, and where each of those paths belongs.
 *
 * One module, three consumers, so the lists cannot drift apart:
 *   - `scripts/provision-worktree.ts` copies `PROVISION_COPIES` into a fresh
 *     worktree (the committed `.worktreeinclude` names the same paths for the
 *     worktrees Claude Code and the Codex app create; a test keeps them equal).
 *   - `scripts/worktree-audit.ts` classifies every gitignored path a worktree
 *     still holds through `AUDIT_RULES` before it is removed, and rescues the
 *     STATE class into the primary checkout.
 *   - `cli/doctor.ts`, `cli/update-boilerplate.ts` and `scripts/tests-map.ts`
 *     ask `checkoutRoots` whether they run in a linked worktree.
 *
 * Why it matters: removing a worktree (`git worktree remove` without `--force`,
 * a harness's own cleanup, Orca's delete) deletes every gitignored file inside
 * it and exits 0. Durable state written there is gone with no warning.
 *
 * Lives under `cli/lib/` because `cli/` is import-closed (AGENTS.md §4.5): a
 * `scripts/` file imports FROM here, never the other way. Node built-ins only,
 * so `provision-worktree.ts` can import it statically before `bun install` has
 * run in the worktree it is provisioning.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ----------------------------------------------------------------------------
// Checkout roots
// ----------------------------------------------------------------------------

export interface CheckoutRoots {
  /** `git rev-parse --show-toplevel`: this checkout, the worktree when there is one. */
  repoRoot: string
  /** dirname of the shared git dir: the primary checkout, from anywhere. */
  primaryRoot: string
  /** true in a LINKED worktree; false in the primary checkout, a plain clone or a submodule. */
  linked: boolean
}

function gitLine(cwd: string, args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function real(path: string): string {
  try { return realpathSync(path); }
  catch { return path; }
}

/**
 * Resolve `<<REPO_ROOT>>` and `<<PRIMARY_ROOT>>` (`.agents/README.md`
 * §"Checkout roots") for `cwd`. null when `cwd` is not inside a git checkout.
 *
 * Linked is decided by comparing `--git-dir` with `--git-common-dir`, not by
 * `.git` being a file: a submodule's `.git` is a file too, and a submodule is
 * not a worktree of anything.
 */
export function checkoutRoots(cwd = process.cwd()): CheckoutRoots | null {
  try {
    const repoRoot = gitLine(cwd, ['rev-parse', '--show-toplevel']);
    const gitDir = gitLine(cwd, ['rev-parse', '--path-format=absolute', '--git-dir']);
    const commonDir = gitLine(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (repoRoot === '' || commonDir === '') { return null; }
    const linked = real(gitDir) !== real(commonDir);
    return { repoRoot: real(repoRoot), primaryRoot: linked ? real(dirname(commonDir)) : real(repoRoot), linked };
  }
  catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Provisioning: what a fresh worktree copies from the primary
// ----------------------------------------------------------------------------

export interface ProvisionCopy {
  /** Repo-relative POSIX path, as `.worktreeinclude` spells it (dirs without the trailing `/**`). */
  path: string
  kind: 'file' | 'dir'
  /** Copied at mode 0600 (dirs 0700); never printed. */
  secret: boolean
  /** Why a worktree needs it. */
  why: string
}

/**
 * Every gitignored path a fresh worktree cannot rebuild by itself. Each one is
 * optional: absent in the primary means skipped, never an error.
 *
 * `.worktreeinclude` must name each of these (a test enforces it), because the
 * worktrees Claude Code and the Codex app create never run the provisioner.
 */
/**
 * `.auth/` children left by the retired `harness:env` generator. Declared here,
 * Node built-ins only, because `scripts/provision-worktree.ts` needs them
 * before `bun install` has run; `cli/lib/harness-env.ts` re-exports them.
 */
export const OPENCODE_SECRET_DIR = '.auth/opencode';
export const HARNESS_ENV_BACKUP_DIR = '.auth/harness-env-backup';

export const PROVISION_COPIES: readonly ProvisionCopy[] = [
  { path: '.env', kind: 'file', secret: true, why: 'values every harness launch and every MCP loader read' },
  { path: '.env.local', kind: 'file', secret: true, why: 'per-developer override varlock loads after .env' },
  { path: '.claude/settings.local.json', kind: 'file', secret: true, why: 'per-developer Claude Code settings (permissions, approved MCP servers)' },
  { path: '.auth', kind: 'dir', secret: true, why: 'the curl token and browser state from `bun run api:login`' },
  { path: 'api/.openapi-config.json', kind: 'file', secret: true, why: 'without it `bun run api:sync -c` falls into interactive prompts' },
  { path: 'api/openapi.json', kind: 'file', secret: false, why: 'the OpenAPI MCP exits at start when OPENAPI_SPEC_PATH names a missing file' },
  { path: '.mcp.local.json', kind: 'file', secret: true, why: 'per-developer MCP override' },
  { path: 'opencode.local.jsonc', kind: 'file', secret: true, why: 'per-developer OpenCode override' },
  { path: 'dbhub.local.toml', kind: 'file', secret: true, why: 'per-developer DBHub override' },
  { path: '.template/installer.state.json', kind: 'file', secret: false, why: 'without it `setup:doctor` reports every community skill untracked' },
];

/** The `.worktreeinclude` spelling of one provision entry. */
export function worktreeIncludeLine(copy: ProvisionCopy): string {
  return copy.kind === 'dir' ? `${copy.path}/**` : copy.path;
}

// ----------------------------------------------------------------------------
// Audit: classify what a worktree still holds
// ----------------------------------------------------------------------------

/**
 * - `state`: durable output that belongs in the primary checkout. Exit 1 until
 *   rescued; `--rescue` copies it to the same path under `<<PRIMARY_ROOT>>`.
 * - `cache`: rebuilt by a command (named in `regenerate`). Safe to lose.
 * - `disposable`: run output and editor litter. Safe to lose, including the
 *   test-run outputs the owner accepted losing (Allure history, TMS results,
 *   refreshed tokens: decision D7 of the worktree audit).
 * - `unknown`: matched no rule. Exit 1, never rescued: review it by hand, then
 *   add a rule here.
 */
export type AuditClass = 'state' | 'cache' | 'disposable' | 'unknown';

export interface AuditRule {
  pattern: RegExp
  class: Exclude<AuditClass, 'unknown'>
  /** What it is; for `cache`, how it comes back. */
  note: string
}

/** Exactly the provisioned FILES (`.auth/` has its own rule above them). */
const PROVISIONED_FILES = new RegExp(`^(${PROVISION_COPIES
  .filter(c => c.kind === 'file')
  .map(c => c.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')})$`);

/**
 * First match wins, so the specific rules sit above the broad ones. Patterns
 * run against a repo-relative POSIX path; a collapsed directory ends in `/`.
 */
export const AUDIT_RULES: readonly AuditRule[] = [
  // STATE: written by skills, the updater and the human; never regenerated.
  { pattern: /^\.session(\/|$)/, class: 'state', note: 'session plans, progress, handoffs, refinements' },
  { pattern: /^\.scratch(\/|$)/, class: 'state', note: 'planning notes' },
  { pattern: /^\.context\/reports(\/|$)/, class: 'state', note: 'generated reports a human reads' },
  { pattern: /^\.context\/PBI\/(.*\/)?evidence(\/|$)/, class: 'state', note: 'captured test evidence' },
  { pattern: /^\.context\/PBI\/(.*\/)?(context|shift-left-refinement)\.md$/, class: 'state', note: 'PBI [LOCAL] notes' },
  { pattern: /^\.template\/(last-apply\.json|upstream-sha|doctrine-ledger\.json|claude-md\.upstream\.sha|pre-agents-migration)(\/|$)/, class: 'state', note: 'updater markers and safety copies' },
  { pattern: /^\.backups[^/]*(\/|$)/, class: 'state', note: 'updater rollback backups' },
  { pattern: /^\.agents\/prompts(\/|$)/, class: 'state', note: 'updater single-use prompts' },

  // DISPOSABLE by owner decision (D7): losing these is accepted.
  { pattern: /^\.allure(\/|$)/, class: 'disposable', note: 'Allure history (accepted loss, D7)' },
  { pattern: /^reports(\/|$)/, class: 'disposable', note: 'TMS sync input (accepted loss, D7)' },
  { pattern: /^\.auth(\/|$)/, class: 'disposable', note: 'tokens and OpenCode values; re-mint with `bun run api:login` (accepted loss, D7)' },

  // CACHE: a command brings it back.
  { pattern: /(^|\/)node_modules(\/|$)/, class: 'cache', note: '`bun install`' },
  { pattern: /^\.husky\/_(\/|$)/, class: 'cache', note: '`bun install` (husky prepare)' },
  { pattern: /^\.claude\/skills\/?$/, class: 'cache', note: '`bun run agents:compat`' },
  { pattern: /^\.agents\/skills\/[^/]+(\/|$)/, class: 'cache', note: 'community skill or skill-creator workspace; `bun run worktree:provision` / `bun run setup`' },
  { pattern: /^\.context\/PBI(\/|$)/, class: 'cache', note: '`bun run context:hydrate`' },
  { pattern: /^\.context\/_framework(\/|$)/, class: 'cache', note: 'its generating script' },
  { pattern: /^\.opencode\//, class: 'cache', note: 'OpenCode installs it' },
  { pattern: /^env\.d\.ts$/, class: 'cache', note: '`bunx varlock load`' },
  { pattern: /^docs\/manifest\.json$/, class: 'cache', note: '`bun run docs:build`' },
  { pattern: /^\.direnv(\/|$)/, class: 'cache', note: 'direnv' },
  { pattern: /(^|\/)(dist|build)(\/|$)/, class: 'cache', note: 'package build' },
  { pattern: /\.tsbuildinfo$/, class: 'cache', note: '`tsc`' },
  { pattern: /^api\/openapi\.json$/, class: 'cache', note: '`bun run api:sync`' },
  { pattern: PROVISIONED_FILES, class: 'cache', note: '`bun run worktree:provision` (copied from the primary)' },

  // DISPOSABLE: run output and editor litter.
  { pattern: /^(test-results|playwright-report|blob-report|allure-results|allure-report)(\/|$)/, class: 'disposable', note: 'test run output' },
  { pattern: /^\.playwright(\/|$)|^\.playwright-mcp(\/|$)|(^|\/)storage-state-[^/]*\.json$/, class: 'disposable', note: 'browser output and sessions' },
  { pattern: /^tests\/data\/downloads\//, class: 'disposable', note: 'test downloads' },
  { pattern: /(^|\/)(\.DS_Store|Thumbs\.db)$|(^|\/)(\.idea|\.cursor|\.windsurf|\.serena|\.gemini|\.atl)(\/|$)|\.code-workspace$|\.swp$|\.json\.bak$/, class: 'disposable', note: 'OS and editor litter' },
  { pattern: /^\.claude\/scheduled_tasks\.lock$|^\.refcheckrc\.toml$/, class: 'disposable', note: 'local tool state' },
];

/** The first rule that matches `relPath` decides its class. */
export function classify(relPath: string): { class: AuditClass, note: string } {
  const p = relPath.replace(/\\/g, '/');
  const rule = AUDIT_RULES.find(r => r.pattern.test(p));
  if (rule !== undefined) { return { class: rule.class, note: rule.note }; }
  return { class: 'unknown', note: 'no rule matches; review it by hand' };
}

export interface AuditEntry {
  /** Repo-relative POSIX path; a whole directory ends in `/`. */
  path: string
  class: AuditClass
  note: string
}

/**
 * Directories git collapses (`--directory`) but whose files fall into more than
 * one class: walked file by file instead of classified whole.
 */
const MIXED_PREFIXES = ['.context/PBI/'];

function isMixed(dir: string): boolean {
  return MIXED_PREFIXES.some(prefix => dir.startsWith(prefix) || prefix.startsWith(dir));
}

function walkFiles(root: string, rel: string, out: string[]): void {
  const abs = join(root, rel);
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const child = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) { walkFiles(root, child, out); }
    else { out.push(child); }
  }
}

/** Every gitignored path under `worktree`, classified. Read-only. */
export function auditWorktree(worktree: string): AuditEntry[] {
  const listed = execFileSync('git', ['-C', worktree, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  }).split('\0').filter(Boolean);

  const paths: string[] = [];
  for (const entry of listed) {
    if (entry.endsWith('/') && isMixed(entry)) {
      const files: string[] = [];
      walkFiles(worktree, entry.slice(0, -1), files);
      paths.push(...files);
    }
    else {
      paths.push(entry);
    }
  }
  return paths.sort().map(path => ({ path, ...classify(path) }));
}

// ----------------------------------------------------------------------------
// Rescue: copy STATE to the primary, never overwriting
// ----------------------------------------------------------------------------

export interface RescueResult {
  /** Copied into the primary (did not exist there). */
  copied: string[]
  /** Already in the primary with identical bytes. */
  identical: string[]
  /** Already in the primary with DIFFERENT bytes: kept the primary's, left for a human. */
  conflicts: string[]
  /** Symlinks and other non-regular files: never followed, never copied. */
  skipped: string[]
}

function sameBytes(a: string, b: string): boolean {
  try { return readFileSync(a).equals(readFileSync(b)); }
  catch { return false; }
}

/**
 * Copy every `state` entry to the same relative path under `primary`. A file
 * that already exists there is NEVER overwritten: identical bytes count as
 * rescued, different bytes are a conflict a human resolves.
 */
export function rescueState(worktree: string, primary: string, entries: AuditEntry[], opts: { dryRun?: boolean } = {}): RescueResult {
  const result: RescueResult = { copied: [], identical: [], conflicts: [], skipped: [] };
  const files: string[] = [];
  for (const entry of entries.filter(e => e.class === 'state')) {
    const rel = entry.path.replace(/\/$/, '');
    const abs = join(worktree, rel);
    const stat = lstatSync(abs);
    if (stat.isDirectory()) { walkFiles(worktree, rel, files); }
    else { files.push(rel); }
  }
  for (const rel of files) {
    const src = join(worktree, rel);
    const dest = join(primary, rel);
    if (!lstatSync(src).isFile()) { result.skipped.push(rel); continue; }
    if (existsSync(dest)) {
      (sameBytes(src, dest) ? result.identical : result.conflicts).push(rel);
      continue;
    }
    if (opts.dryRun !== true) {
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
    result.copied.push(rel);
  }
  return result;
}
