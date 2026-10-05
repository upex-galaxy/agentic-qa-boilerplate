/**
 * @fileoverview Retire the plaintext MCP credential copies the harnesses used to read.
 *
 * WHAT THIS USED TO DO. A harness spawns its MCP servers from a config file
 * before any hook runs (measured on Claude Code 2.1.278: the MCP child starts
 * 43-293 ms before `SessionStart`), and a GUI launch or a natively launched
 * supervised worker has no command line to wrap. So `bun run harness:env`
 * copied each MCP credential out of `.env` into the file each harness reads at
 * startup:
 *
 *   A. `.claude/settings.local.json` -> `env` block (read from the MAIN
 *      checkout's root on macOS/Linux, so every worktree shared one block);
 *   B. `.auth/opencode/<VAR>` value files behind `{file:...}` references in
 *      `opencode.jsonc`.
 *
 * Two more plaintext copies of every MCP secret, both readable by an AI agent
 * and neither covered by "never read .env" (exposure findings X9 and X10).
 *
 * WHAT REPLACED IT. Every MCP server that needs `.env` values now starts
 * through the `.env` loader on all three hosts (`MCP_ENV_LOADER_*` in
 * `agent-compatibility-contracts.ts`): `varlock run --filter <its vars>` reads
 * `.env` (or the secret manager the schema names) at spawn time, from the
 * project root, however the harness was opened, and hands the server only its
 * own variables. Nothing is copied anywhere (ADR-0011).
 *
 * WHAT THIS DOES NOW. It finds the copies an existing machine still holds and
 * retires them, never silently:
 *
 *   - a copy whose value equals `.env` is deleted (`.env` still holds it);
 *   - a copy whose value differs from `.env`, or that `.env` does not declare,
 *     is MOVED to `.auth/harness-env-backup/<VAR>` (0600) and named, because
 *     deleting it could lose the only copy of a working credential;
 *   - a copy a host config STILL reads (a downstream `.mcp.json` that keeps
 *     `${VAR}`, an `opencode.jsonc` that keeps `{file:}`) is KEPT: deleting it
 *     would break that host until the config moves to the loader, and
 *     `agents:compat:check` names that move.
 *
 * The `--placeholders` mode survives for the last case only: a legacy
 * `opencode.jsonc` whose `{file:}` target is missing invalidates OpenCode's
 * WHOLE config, so `bun install` still creates EMPTY targets for it. It never
 * writes a value.
 *
 * NEVER PRINTS A VALUE. Every result carries variable NAMES and verdicts. The
 * comparison with `.env` is a string equality that is never surfaced.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { MCP_SERVER_SECRETS, MCP_VAR_PATTERN, parseEnvFile } from '../install.ts';
import { readHostMcpConfig, stripJsonComments } from './agent-compatibility-contracts.ts';
import { HARNESS_ENV_BACKUP_DIR, OPENCODE_SECRET_DIR as LEGACY_OPENCODE_DIR } from './worktree.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');

const IS_WINDOWS = process.platform === 'win32';

/** Repo-relative paths. POSIX separators. */
export const ENV_FILE = '.env';
export const ENV_EXAMPLE_FILE = '.env.example';
export const CLAUDE_LOCAL_SETTINGS = '.claude/settings.local.json';
export const OPENCODE_CONFIG = 'opencode.jsonc';
export const MCP_CONFIG = '.mcp.json';
export const CODEX_CONFIG = '.codex/config.toml';
export const DBHUB_CONFIG = 'dbhub.toml';

/** Where retired emitter B wrote its value files. Read here only to retire them. */
export const OPENCODE_SECRET_DIR = LEGACY_OPENCODE_DIR;

/**
 * Where a copy that `.env` cannot reproduce is moved instead of deleted. Inside
 * `.auth/`, which is gitignored and on every host's deny list for the AI, and
 * never copied into a new worktree (`scripts/provision-worktree.ts`).
 */
export const BACKUP_DIR = HARNESS_ENV_BACKUP_DIR;

/** Matches a legacy `{file:.auth/opencode/VAR}` reference in `opencode.jsonc`. */
const OPENCODE_FILE_REF_PATTERN = new RegExp(
  `\\{file:${OPENCODE_SECRET_DIR.replace(/\./g, '\\.')}/([A-Z][A-Z0-9_]*)\\}`,
  'g',
);

/**
 * The root whose `.claude/settings.local.json` Claude Code actually READS.
 *
 * MEASURED on Claude Code 2.1.278 / macOS: a session launched inside a linked
 * worktree gave its MCP child the MAIN checkout's env block and ignored the
 * worktree's copy. So the retired emitter A wrote to the main checkout, and the
 * copy to retire lives there. Windows keeps the file per worktree (doc-derived,
 * unverified: no Windows host).
 */
export function claudeSettingsRoot(root = REPO_ROOT): string {
  if (IS_WINDOWS) { return root; }
  const dotGit = join(root, '.git');
  // A worktree's `.git` is a FILE holding a gitdir pointer; a normal checkout's
  // is a directory.
  try {
    if (!existsSync(dotGit) || statSync(dotGit).isDirectory()) { return root; }
  }
  catch { return root; }
  try {
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (common.length === 0) { return root; }
    const mainRoot = dirname(common);
    return existsSync(mainRoot) ? mainRoot : root;
  }
  catch {
    // A wrong path is worse than a local one.
    return root;
  }
}

// ----------------------------------------------------------------------------
// `.env` reading
// ----------------------------------------------------------------------------

/**
 * Strip an inline comment from every UNQUOTED value, the way Bun's autoload
 * does: whitespace + `#` starts a comment, a quoted value is left alone, and
 * `pass#word` keeps its hash. `.env.example` ships `DBHUB_TYPE=   # sqlserver`.
 */
export function stripInlineComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.length === 0 || trimmed.startsWith('#')) { return line; }
      const eq = line.indexOf('=');
      if (eq <= 0) { return line; }
      const value = line.slice(eq + 1);
      const valueTrimmed = value.trimStart();
      if (valueTrimmed.startsWith('"') || valueTrimmed.startsWith('\'')) { return line; }
      const comment = value.search(/\s#/);
      return comment === -1 ? line : line.slice(0, eq + 1) + value.slice(0, comment);
    })
    .join('\n');
}

export interface EnvSnapshot {
  /** true when `.env` exists at all. */
  exists: boolean
  /** Every key `.env` DECLARES, including the ones declared empty. */
  declared: string[]
  /** name -> value. Never logged, never formatted, never returned to a printer. */
  values: Record<string, string>
}

/** Read `.env` from disk, never `process.env`: the comparison is against the file. */
export function readEnvSnapshot(root = REPO_ROOT): EnvSnapshot {
  const path = join(root, ENV_FILE);
  if (!existsSync(path)) { return { exists: false, declared: [], values: {} }; }
  const values = parseEnvFile(stripInlineComments(readFileSync(path, 'utf8')));
  return { exists: true, declared: Object.keys(values).sort(), values };
}

/** A copy `.env` can reproduce: same value, or empty where `.env` has nothing. */
function reproducible(env: EnvSnapshot, name: string, copy: string): boolean {
  return (env.values[name] ?? '') === copy;
}

// ----------------------------------------------------------------------------
// What the host configs still read themselves
// ----------------------------------------------------------------------------

/** Every `pattern` capture inside the strings of a parsed JSON/TOML value. */
function collectFromStrings(value: unknown, pattern: RegExp, seen: Set<string>): void {
  if (typeof value === 'string') {
    for (const m of value.matchAll(pattern)) { if (m[1] !== undefined) { seen.add(m[1]); } }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) { collectFromStrings(entry, pattern, seen); }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const entry of Object.values(value)) { collectFromStrings(entry, pattern, seen); }
  }
}

function dbhubTomlNames(root: string): string[] {
  const path = join(root, DBHUB_CONFIG);
  if (!existsSync(path)) { return []; }
  const seen = new Set<string>();
  try { collectFromStrings(Bun.TOML.parse(readFileSync(path, 'utf8')), MCP_VAR_PATTERN, seen); }
  catch { return []; }
  return [...seen].sort();
}

export interface HostReads {
  /** Names a `.mcp.json` server still takes from Claude's environment (so from the env block). */
  claude: string[]
  /** Names `opencode.jsonc` still reads through a `{file:.auth/opencode/...}` reference. */
  opencode: string[]
  /** Every MCP credential name any config or `MCP_SERVER_SECRETS` knows: what counts as "ours". */
  all: string[]
  /** One line per config that could not be parsed. Names the file, never its contents. */
  errors: string[]
}

/**
 * Which credential names each host still reads WITHOUT the loader. A copy of
 * one of these must stay until that host's config moves to the loader.
 */
export function hostReads(root = REPO_ROOT): HostReads {
  const errors: string[] = [];
  const claude = new Set<string>();
  const all = new Set<string>(Object.values(MCP_SERVER_SECRETS).flat());
  const dbhub = dbhubTomlNames(root);
  for (const host of ['claude', 'opencode', 'codex'] as const) {
    let config: ReturnType<typeof readHostMcpConfig>;
    try { config = readHostMcpConfig(root, host); }
    catch (err) {
      errors.push(`${host}: ${(err as Error).message}`);
      continue;
    }
    for (const server of Object.values(config ?? {})) {
      for (const name of server.dependsOn) { all.add(name); }
      if (host !== 'claude') { continue; }
      for (const name of server.hostRefs ?? []) { claude.add(name); }
      // `dbhub.toml` is expanded by the dbhub child from ITS environment: a
      // Claude dbhub without the loader still needs those names from Claude.
      if (server.envLoader !== true && (server.args ?? []).includes(DBHUB_CONFIG)) {
        for (const name of dbhub) { claude.add(name); }
      }
    }
  }
  const opencode = new Set<string>();
  const opencodePath = join(root, OPENCODE_CONFIG);
  if (existsSync(opencodePath)) {
    try { collectFromStrings(JSON.parse(stripJsonComments(readFileSync(opencodePath, 'utf8'))), OPENCODE_FILE_REF_PATTERN, opencode); }
    catch { /* already reported by readHostMcpConfig */ }
  }
  for (const name of [...claude, ...opencode]) { all.add(name); }
  return { claude: [...claude].sort(), opencode: [...opencode].sort(), all: [...all].sort(), errors };
}

// ----------------------------------------------------------------------------
// Retire
// ----------------------------------------------------------------------------

export interface RetiredSurface {
  /** Absolute path of the file or directory holding the copies. */
  path: string
  /** Deleted: `.env` holds the same value. */
  removed: string[]
  /** Moved to the backup directory: `.env` does not reproduce them. */
  backedUp: string[]
  /** Left in place: a host config still reads them without the loader. */
  kept: string[]
  /** Settings env keys that are not MCP credentials, never touched. */
  preserved: string[]
}

export interface RetireResult {
  /** One per `.claude/settings.local.json` holding an `env` block (main checkout and, in a worktree, its own copy). */
  claude: RetiredSurface[]
  /** `.auth/opencode/` of this checkout, when present. */
  opencode: RetiredSurface | null
  /** Backup directories written (or that would be, on a dry run). Empty when nothing needed one. */
  backupDirs: string[]
  /** Something was (or, on a dry run, would be) changed. */
  changed: boolean
  dryRun: boolean
  /** Config files that could not be parsed: nothing is retired while one is unreadable. */
  errors: string[]
}

export interface RetireOptions {
  dryRun?: boolean
}

function secureWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: IS_WINDOWS ? undefined : 0o700 });
  writeFileSync(path, contents, { encoding: 'utf8', mode: IS_WINDOWS ? undefined : 0o600 });
  // `mode` applies only on create: re-assert it.
  if (!IS_WINDOWS) { chmodSync(path, 0o600); }
}

function backUp(root: string, name: string, value: string, dryRun: boolean): string {
  const dir = join(root, BACKUP_DIR);
  if (!dryRun) { secureWrite(join(dir, name), value); }
  return dir;
}

function emptySurface(path: string): RetiredSurface {
  return { path, removed: [], backedUp: [], kept: [], preserved: [] };
}

function retireClaudeFile(settingsRoot: string, reads: Set<string>, ours: Set<string>, dryRun: boolean, backupDirs: Set<string>): RetiredSurface | null {
  const path = join(settingsRoot, CLAUDE_LOCAL_SETTINGS);
  if (!existsSync(path)) { return null; }
  let settings: Record<string, unknown>;
  try { settings = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>; }
  catch { return null; }
  const env = settings.env;
  if (env === null || typeof env !== 'object' || Array.isArray(env)) { return null; }
  const block = env as Record<string, unknown>;
  const surface = emptySurface(path);
  const snapshot = readEnvSnapshot(settingsRoot);
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(block).sort()) {
    const value = block[key];
    if (!ours.has(key) || typeof value !== 'string') { surface.preserved.push(key); next[key] = value; continue; }
    if (reads.has(key)) { surface.kept.push(key); next[key] = value; continue; }
    if (reproducible(snapshot, key, value)) { surface.removed.push(key); continue; }
    backupDirs.add(backUp(settingsRoot, key, value, dryRun));
    surface.backedUp.push(key);
  }
  if (surface.removed.length + surface.backedUp.length === 0) { return surface; }
  if (!dryRun) {
    if (Object.keys(next).length === 0) { delete settings.env; }
    else { settings.env = next; }
    secureWrite(path, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return surface;
}

function retireOpencodeDir(root: string, reads: Set<string>, dryRun: boolean, backupDirs: Set<string>): RetiredSurface | null {
  const dir = join(root, OPENCODE_SECRET_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) { return null; }
  const surface = emptySurface(dir);
  const snapshot = readEnvSnapshot(root);
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    if (!statSync(file).isFile()) { surface.preserved.push(name); continue; }
    if (reads.has(name)) { surface.kept.push(name); continue; }
    const value = readFileSync(file, 'utf8');
    if (reproducible(snapshot, name, value)) {
      if (!dryRun) { rmSync(file); }
      surface.removed.push(name);
      continue;
    }
    const backupDir = join(root, BACKUP_DIR);
    if (!dryRun) {
      mkdirSync(backupDir, { recursive: true, mode: IS_WINDOWS ? undefined : 0o700 });
      renameSync(file, join(backupDir, name));
      if (!IS_WINDOWS) { chmodSync(join(backupDir, name), 0o600); }
    }
    backupDirs.add(backupDir);
    surface.backedUp.push(name);
  }
  if (!dryRun && readdirSync(dir).length === 0) { rmdirSync(dir); }
  return surface;
}

/**
 * Retire every plaintext MCP credential copy that no host config still reads.
 *
 * In a linked worktree it also handles the MAIN checkout's settings file (the
 * one Claude Code reads), but keeps any name the main checkout's own configs
 * still read without the loader, since every worktree on the machine shares it.
 */
export function retire(root = REPO_ROOT, options: RetireOptions = {}): RetireResult {
  const dryRun = options.dryRun === true;
  const local = hostReads(root);
  const settingsRoot = claudeSettingsRoot(root);
  const main = settingsRoot === root ? local : hostReads(settingsRoot);
  const errors = [...local.errors, ...(settingsRoot === root ? [] : main.errors.map(e => `${relative(root, settingsRoot) || settingsRoot}: ${e}`))];
  const result: RetireResult = { claude: [], opencode: null, backupDirs: [], changed: false, dryRun, errors };
  // An unreadable config might still read a copy: retire nothing until it parses.
  if (errors.length > 0) { return result; }

  const ours = new Set([...local.all, ...main.all]);
  const claudeReads = new Set([...local.claude, ...main.claude]);
  const backupDirs = new Set<string>();
  for (const settings of [...new Set([settingsRoot, root])]) {
    const surface = retireClaudeFile(settings, claudeReads, ours, dryRun, backupDirs);
    if (surface !== null && surface.removed.length + surface.backedUp.length + surface.kept.length > 0) { result.claude.push(surface); }
  }
  result.opencode = retireOpencodeDir(root, new Set(local.opencode), dryRun, backupDirs);
  result.backupDirs = [...backupDirs].sort();
  result.changed = [...result.claude, ...(result.opencode === null ? [] : [result.opencode])]
    .some(s => s.removed.length + s.backedUp.length > 0);
  return result;
}

// ----------------------------------------------------------------------------
// Placeholders (legacy `{file:}` configs only)
// ----------------------------------------------------------------------------

export interface PlaceholderResult {
  /** Variable names whose value file was created EMPTY, because it was missing. */
  created: string[]
  /** Variable names whose value file already existed and was left untouched. */
  kept: string[]
  /** Set when `opencode.jsonc` exists but could not be parsed. Names the file, never its contents. */
  error?: string
}

/**
 * Make sure every `{file:.auth/opencode/<VAR>}` target a LEGACY `opencode.jsonc`
 * points at exists, creating an empty one where it does not. Measured on
 * OpenCode 1.18.30: a MISSING `{file:}` target invalidates the WHOLE config,
 * an EXISTING EMPTY file substitutes "" and loads. A config on the loader has
 * no `{file:}` reference, so this creates nothing. Never reads `.env`, never
 * overwrites a file.
 */
export function ensureOpencodePlaceholders(root = REPO_ROOT): PlaceholderResult {
  const result: PlaceholderResult = { created: [], kept: [] };
  const path = join(root, OPENCODE_CONFIG);
  if (!existsSync(path)) { return result; }
  const refs = new Set<string>();
  try { collectFromStrings(JSON.parse(stripJsonComments(readFileSync(path, 'utf8'))), OPENCODE_FILE_REF_PATTERN, refs); }
  catch (err) {
    result.error = `${OPENCODE_CONFIG}: unparseable JSON: ${(err as Error).message}`;
    return result;
  }
  for (const name of [...refs].sort()) {
    const target = join(root, OPENCODE_SECRET_DIR, name);
    if (existsSync(target)) { result.kept.push(name); continue; }
    secureWrite(target, '');
    result.created.push(name);
  }
  return result;
}

// ----------------------------------------------------------------------------
// Check
// ----------------------------------------------------------------------------

export interface CheckFinding {
  /** Which surface the finding is about. */
  surface: 'claude' | 'opencode' | 'config' | 'backup'
  /** Stable machine tag, so a caller can format without parsing prose. */
  kind: 'stale-copy' | 'legacy-config' | 'backup-present' | 'config-unparseable'
  /** Variable NAMES or file paths. NEVER a value. */
  names: string[]
  /** One line a human can act on. */
  detail: string
  /** false when the finding is informational and must not fail the check. */
  blocking: boolean
}

export interface CheckResult {
  ok: boolean
  findings: CheckFinding[]
  /** The MCP credential names the configs declare, all loaded by the loader or still by a host. */
  allowlist: { all: string[] }
  summary: string
}

/**
 * Report what `retire()` would do, plus what it cannot do yet. Blocking: a
 * stale copy on disk (`bun run harness:env` retires it) or an unreadable
 * config. Informational: a copy a legacy config still reads, a backup waiting
 * for the human.
 */
export function check(root = REPO_ROOT): CheckResult {
  const plan = retire(root, { dryRun: true });
  const reads = hostReads(root);
  const findings: CheckFinding[] = [];
  for (const error of plan.errors) {
    findings.push({
      surface: 'config',
      kind: 'config-unparseable',
      names: [error.split(':')[0]],
      detail: `An MCP config could not be parsed, so no copy is retired until it does (${error}).`,
      blocking: true,
    });
  }
  const surfaces: Array<[RetiredSurface, 'claude' | 'opencode']> = [
    ...plan.claude.map(s => [s, 'claude'] as [RetiredSurface, 'claude']),
    ...(plan.opencode === null ? [] : [[plan.opencode, 'opencode'] as [RetiredSurface, 'opencode']]),
  ];
  for (const [surface, host] of surfaces) {
    const stale = [...surface.removed, ...surface.backedUp];
    if (stale.length > 0) {
      findings.push({
        surface: host,
        kind: 'stale-copy',
        names: stale,
        detail: `${surface.path} still holds a plaintext copy of these MCP credentials. MCP servers now read .env through the loader, so the copy is only a leak surface: \`bun run harness:env\` retires it (deleted when .env holds the same value, backed up to ${BACKUP_DIR}/ otherwise).`,
        blocking: true,
      });
    }
    if (surface.kept.length > 0) {
      findings.push({
        surface: host,
        kind: 'legacy-config',
        names: surface.kept,
        detail: `${host === 'claude' ? `A ${MCP_CONFIG} this file serves (this checkout's, or the main checkout's, which every worktree shares)` : OPENCODE_CONFIG} still reads these without the .env loader, so their copy in ${surface.path} stays. \`bun run agents:compat:check\` names the change that moves each server to the loader; run \`bun run harness:env\` after it.`,
        blocking: false,
      });
    }
  }
  const backups = [...new Set([root, claudeSettingsRoot(root)])]
    .map(r => join(r, BACKUP_DIR))
    .filter(dir => existsSync(dir));
  if (backups.length > 0) {
    findings.push({
      surface: 'backup',
      kind: 'backup-present',
      names: backups,
      detail: `Retired MCP credentials that .env did not reproduce are waiting in ${backups.join(', ')}. Put the right value in .env (or the secret manager) yourself, then delete the directory: it is a plaintext copy too.`,
      blocking: false,
    });
  }
  const stale = findings.filter(f => f.kind === 'stale-copy').flatMap(f => f.names).length;
  const kept = findings.filter(f => f.kind === 'legacy-config').flatMap(f => f.names).length;
  return {
    ok: !findings.some(f => f.blocking),
    findings,
    allowlist: { all: reads.all },
    summary: stale > 0
      ? `${stale} plaintext MCP credential cop${stale === 1 ? 'y' : 'ies'} still on disk`
      : kept > 0
        ? `no retirable copy; ${kept} kept for a host config still on the old shape`
        : 'no plaintext MCP credential copy: every MCP server reads .env through the loader',
  };
}
