/**
 * @fileoverview Generate the per-harness credential surfaces from `.env`.
 *
 * THE PROBLEM. A harness reads its config and spawns its MCP servers BEFORE any
 * hook runs. Measured on Claude Code 2.1.278, three runs out of three: the MCP
 * child is spawned 43-293 ms before `SessionStart` fires, and a variable that
 * hook injects is absent from the child's own `printenv`. So the only thing that
 * can get a credential into an MCP server is a config file the harness reads at
 * startup. Each harness reads a different one, and the `bun run claude` wrapper
 * cannot help a GUI launch or a natively-launched supervised worker, because
 * neither has a command line to wrap.
 *
 * WHAT THIS EMITS. Two surfaces, both derived from `.env`, which stays the one
 * source of truth:
 *
 *   A. `.claude/settings.local.json` -> `env` block. Read from the file at
 *      startup, so it works "no matter how `claude` was launched", it reaches
 *      the MCP child (measured), and it overwrites a stale shell export of the
 *      same name. Gitignored, already copied per worktree at mode 0600 by
 *      `scripts/provision-worktree.ts`, and on macOS/Linux read from the MAIN
 *      checkout's root so worktrees inherit it with no action.
 *
 *   B. `.auth/opencode/<VAR>` value files + `{file:...}` references in
 *      `opencode.jsonc`. OpenCode's `{env:VAR}` resolves from the process
 *      environment only, which a desktop launch does not have; `{file:path}`
 *      substitutes a file's CONTENTS and needs no environment at all.
 *
 * Codex is deliberately NOT emitted. `.codex/config.toml` is project-level and
 * overrides user config, but it is COMMITTED, so a secret cannot go in it, and
 * where its gitignored half should live is an open question. Codex stays on the
 * wrapper and is scanned here for the allowlist only.
 *
 * ALLOWLIST, NEVER THE WHOLE FILE. `.env.example` declares 24 variables and 10
 * are referenced by an MCP config. Emitting all 24 would copy a project's Jira
 * credentials and test users into a harness config that has no use for them,
 * and every copy of a secret is another place it can leak. The allowlist is
 * derived by PARSING the config files, not grepping them, so it cannot go stale
 * the way a hand-written list can: add an MCP that needs a new variable and the
 * next run finds it. Parsing also disposes of the `VAR` / `VAR_NAME` noise that
 * lives in the configs' header comments, because comments are gone before the
 * parse rather than filtered after it.
 *
 * NEVER PRINTS A VALUE. Every result in this module carries variable NAMES and
 * a match verdict. No function here returns, logs or formats a value, and the
 * comparison is done on lengths and string equality, never on printed text.
 */

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
// The two placeholder patterns and the declared server->secret map are REUSED
// from the installer rather than copied: a second copy of that knowledge is
// exactly what goes stale. Both patterns are global regexes, so they are only
// ever consumed through `String.prototype.matchAll`, which constructs its own
// matcher and therefore never shares `lastIndex` across callers.
import { MCP_SERVER_SECRETS, MCP_VAR_PATTERN, OPENCODE_VAR_PATTERN, parseEnvFile } from '../install.ts';
import { stripJsonComments } from './agent-compatibility-contracts.ts';
import { parsePackageJson, stringifyPackageJson } from './updater-package.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');

const IS_WINDOWS = process.platform === 'win32';

/** Repo-relative paths. POSIX separators, because two of these are emitted INTO config files. */
export const ENV_FILE = '.env';
export const ENV_EXAMPLE_FILE = '.env.example';
export const CLAUDE_LOCAL_SETTINGS = '.claude/settings.local.json';
export const OPENCODE_CONFIG = 'opencode.jsonc';
export const MCP_CONFIG = '.mcp.json';
export const CODEX_CONFIG = '.codex/config.toml';
export const DBHUB_CONFIG = 'dbhub.toml';

/**
 * Where emitter B's value files go, and why HERE.
 *
 * `.auth/` is already gitignored (`/.auth/`, root-anchored), already holds
 * credentials (`api:login` writes `tokens.env` / `tokens.json` there), and is
 * already copied per worktree at mode 0600 by `scripts/provision-worktree.ts`.
 * So this directory needs no new ignore rule and no new provisioning wiring.
 *
 * The alternative was a machine-global directory (`~/.agentic-qa/...`), which
 * would hold ONE copy per machine instead of one per worktree. It is rejected
 * for a SECURITY reason, not a tidiness one: `.env` is per-checkout, so a
 * machine-global secrets directory would let one worktree silently read another
 * checkout's credentials, and a credential that arrives from a checkout you are
 * not in is worse than a second copy of one you are. That asymmetry is the bug.
 * A per-worktree copy also adds no NEW exposure: the worktree already has its
 * own `.env` copy, so the secret is already on that disk.
 *
 * The `opencode/` subdirectory keeps these files from ever colliding with
 * `api:login`'s output in the same directory.
 */
export const OPENCODE_SECRET_DIR = '.auth/opencode';

/**
 * Matches the reference emitter B WRITES, e.g. `{file:.auth/opencode/TAVILY_API_KEY}`.
 *
 * This pattern is not decoration. Emitter B replaces every `{env:VAR}` in
 * `opencode.jsonc` with a `{file:...}` reference, which means that after the
 * first run `OPENCODE_VAR_PATTERN` matches NOTHING in that file: the emitter
 * erases its own input. Without this second pattern the scan came back empty on
 * every re-run, the generator concluded that nothing referenced the value files
 * any more, and it DELETED them. Caught by the idempotence test, which is the
 * whole reason that test exists.
 *
 * So the rule is: a variable is referenced by `opencode.jsonc` when the file
 * carries EITHER form. The `{env:}` form is the input; the `{file:}` form is the
 * same declaration after rewriting.
 */
const OPENCODE_FILE_REF_PATTERN = new RegExp(
  `\\{file:${OPENCODE_SECRET_DIR.replace(/\./g, '\\.')}/([A-Z][A-Z0-9_]*)\\}`,
  'g',
);

/**
 * The root whose `.claude/settings.local.json` Claude Code actually READS.
 *
 * MEASURED on Claude Code 2.1.278 / macOS, with a scratch repo holding
 * `PROBE_ORIGIN=MAIN-CHECKOUT` in the main checkout's file and
 * `PROBE_ORIGIN=WORKTREE` in a worktree's: a session launched INSIDE the
 * worktree gave its MCP child `PROBE_ORIGIN=MAIN-CHECKOUT`. The worktree's own
 * copy was ignored.
 *
 * So emitter A has to write to the MAIN checkout even when it is invoked from a
 * worktree. Writing the worktree's copy instead is a silent no-op: the file
 * lands, the check passes, and the credential never reaches a single MCP server
 * — which is precisely the failure mode this whole mechanism exists to kill.
 * This is the inverse of the property the spec cited. "A worktree inherits the
 * main checkout's file" is true and convenient when you READ it; it is a trap
 * when you WRITE it.
 *
 * Windows is excluded because the documentation lists it among the cases where
 * the file stays beside `.claude/settings.json`, i.e. per-worktree. That is
 * doc-derived and UNVERIFIED here: there is no Windows machine on this host.
 *
 * Emitter B is deliberately NOT redirected. Its `{file:...}` paths resolve
 * relative to `opencode.jsonc`'s own directory, which IS the worktree's, so its
 * value files must stay worktree-local. The two emitters disagree about this
 * because the two harnesses resolve their paths differently.
 */
export function claudeSettingsRoot(root = REPO_ROOT): string {
  if (IS_WINDOWS) { return root; }
  const dotGit = join(root, '.git');
  // A worktree's `.git` is a FILE holding a gitdir pointer; a normal checkout's
  // is a directory. Cheapest reliable discriminator, and it avoids shelling out
  // in the common case.
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
    return existsSync(join(mainRoot, '.claude')) || existsSync(mainRoot) ? mainRoot : root;
  }
  catch {
    // No git, or a git that does not understand the flags: fall back to the
    // local root rather than guessing. A wrong path is worse than a local one.
    return root;
  }
}

// ----------------------------------------------------------------------------
// `.env` reading
// ----------------------------------------------------------------------------

/**
 * Strip an inline comment from every UNQUOTED value, matching what the loaders
 * that actually feed the process do.
 *
 * `parseEnvFile` (reused from the installer) does not do this, and `.env.example`
 * ships lines such as `DBHUB_TYPE=          # sqlserver | postgres | ...`. Left
 * alone, the generator would emit that comment text as the credential. Both
 * `dotenv-cli` (the `bun run claude` wrapper) and Bun's own autoload treat
 * whitespace + `#` as the start of a comment on an unquoted value, so stripping
 * here makes the generated surface agree with the launcher instead of disagreeing
 * with it. A quoted value is left entirely alone, and a `#` with no whitespace
 * before it (`pass#word`) is part of the value.
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

/**
 * Read `.env` from disk. Deliberately NOT `process.env`: an inherited value can
 * be stale, and the whole point of the generated surfaces is to make the FILE
 * authoritative (AGENTS.md section 7).
 */
export function readEnvSnapshot(root = REPO_ROOT): EnvSnapshot {
  const path = join(root, ENV_FILE);
  if (!existsSync(path)) { return { exists: false, declared: [], values: {} }; }
  const values = parseEnvFile(stripInlineComments(readFileSync(path, 'utf8')));
  return { exists: true, declared: Object.keys(values).sort(), values };
}

/**
 * The variable names the COMMITTED template declares.
 *
 * This is what decides whether `opencode.jsonc` may carry a `{file:}` reference
 * for a variable, and the reason is that `opencode.jsonc` is itself committed.
 * Keying the decision on the developer's `.env` would make a committed file's
 * SHAPE depend on whose machine last ran the generator, which is a defect and
 * not a tradeoff. `.env.example` is in git, so the rule reads the same on every
 * machine: a variable the project's own template declares is part of the
 * project's contract, so the committed config may point at a file for it.
 */
export function readTemplateDeclarations(root = REPO_ROOT): string[] {
  const path = join(root, ENV_EXAMPLE_FILE);
  if (!existsSync(path)) { return []; }
  return Object.keys(parseEnvFile(stripInlineComments(readFileSync(path, 'utf8')))).sort();
}

/**
 * Allowlisted names whose value differs between this checkout's `.env` and the
 * one at `otherRoot`. Compared, never printed.
 */
function divergentAllowlisted(otherRoot: string, names: readonly string[], env: EnvSnapshot): string[] {
  const other = readEnvSnapshot(otherRoot);
  if (!other.exists || !env.exists) { return []; }
  return names.filter(name => (env.values[name] ?? '') !== (other.values[name] ?? '')).sort();
}

/** A variable has a usable value when `.env` declares it non-empty. */
function hasValue(env: EnvSnapshot, name: string): boolean {
  const v = env.values[name];
  return v !== undefined && v.trim().length > 0;
}

// ----------------------------------------------------------------------------
// The allowlist: derived by PARSING the configs
// ----------------------------------------------------------------------------

/** Walk any parsed JSON/TOML value and collect every `pattern` hit in its strings. */
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

/**
 * Collect the variables Codex reads BY NAME from the environment.
 *
 * Only `bearer_token_env_var` and `env_vars` qualify. A `[mcp_servers.*].env`
 * table is deliberately skipped: it maps a name to a LITERAL value that Codex
 * supplies itself, so it is not a variable the harness needs from `.env`, and
 * putting it in the allowlist would ask `.env` for something nobody reads there.
 */
function collectCodexNames(value: unknown, seen: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) { collectCodexNames(entry, seen); }
    return;
  }
  if (value === null || typeof value !== 'object') { return; }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'bearer_token_env_var' && typeof entry === 'string') { seen.add(entry); }
    else if (key === 'env_vars' && Array.isArray(entry)) {
      for (const name of entry) { if (typeof name === 'string') { seen.add(name); } }
    }
    else if (key !== 'env') { collectCodexNames(entry, seen); }
  }
}

export interface ConfigScan {
  /** Repo-relative path of the scanned config. */
  file: string
  exists: boolean
  /** Variable names the config references, sorted. Empty when the file is absent. */
  vars: string[]
  /** Set when the file exists but could not be parsed. Names the file, never its contents. */
  error?: string
}

function scanJson(root: string, file: string, patterns: readonly RegExp[]): ConfigScan {
  const path = join(root, file);
  if (!existsSync(path)) { return { file, exists: false, vars: [] }; }
  const seen = new Set<string>();
  try {
    const parsed: unknown = JSON.parse(stripJsonComments(readFileSync(path, 'utf8')));
    for (const pattern of patterns) { collectFromStrings(parsed, pattern, seen); }
  }
  catch (err) {
    return { file, exists: true, vars: [], error: `unparseable JSON: ${(err as Error).message}` };
  }
  return { file, exists: true, vars: [...seen].sort() };
}

function scanToml(root: string, file: string, collect: (parsed: unknown, seen: Set<string>) => void): ConfigScan {
  const path = join(root, file);
  if (!existsSync(path)) { return { file, exists: false, vars: [] }; }
  const seen = new Set<string>();
  try {
    collect(Bun.TOML.parse(readFileSync(path, 'utf8')), seen);
  }
  catch (err) {
    return { file, exists: true, vars: [], error: `unparseable TOML: ${(err as Error).message}` };
  }
  return { file, exists: true, vars: [...seen].sort() };
}

export interface Allowlist {
  /** One entry per config file, in scan order. */
  scans: ConfigScan[]
  /** Union of every scan: the full allowlist. */
  all: string[]
  /**
   * What emitter A must place in the Claude harness environment: `.mcp.json`'s
   * own placeholders PLUS `dbhub.toml`'s, because `dbhub` expands that file
   * itself from the environment of the MCP child it was spawned as.
   */
  claude: string[]
  /** What emitter B must turn into `{file:}` references: `opencode.jsonc`'s placeholders. */
  opencode: string[]
  /** Declared in `MCP_SERVER_SECRETS` but referenced by no config: a stale declaration. */
  declaredNotReferenced: string[]
  /** Referenced by a config but absent from `MCP_SERVER_SECRETS`: an undeclared need. */
  referencedNotDeclared: string[]
}

/**
 * Build the allowlist from the config files themselves.
 *
 * `MCP_SERVER_SECRETS` is used only as a CROSS-CHECK. The scan is the source of
 * truth because it cannot go stale; the declared map is what tells a human that
 * the two views have drifted.
 */
export function buildAllowlist(root = REPO_ROOT): Allowlist {
  const scans: ConfigScan[] = [
    scanJson(root, MCP_CONFIG, [MCP_VAR_PATTERN]),
    // Both forms: `{env:VAR}` before this generator has run, `{file:...}` after.
    scanJson(root, OPENCODE_CONFIG, [OPENCODE_VAR_PATTERN, OPENCODE_FILE_REF_PATTERN]),
    scanToml(root, CODEX_CONFIG, collectCodexNames),
    scanToml(root, DBHUB_CONFIG, (parsed, seen) => collectFromStrings(parsed, MCP_VAR_PATTERN, seen)),
  ];
  const by = (file: string): string[] => scans.find(s => s.file === file)?.vars ?? [];
  const all = [...new Set(scans.flatMap(s => s.vars))].sort();
  const claude = [...new Set([...by(MCP_CONFIG), ...by(DBHUB_CONFIG)])].sort();
  const declared = new Set(Object.values(MCP_SERVER_SECRETS).flat());
  const referenced = new Set(all);
  return {
    scans,
    all,
    claude,
    opencode: by(OPENCODE_CONFIG),
    declaredNotReferenced: [...declared].filter(n => !referenced.has(n)).sort(),
    referencedNotDeclared: [...referenced].filter(n => !declared.has(n)).sort(),
  };
}

// ----------------------------------------------------------------------------
// Emitter A — `.claude/settings.local.json` -> `env`
// ----------------------------------------------------------------------------

export interface ClaudePlan {
  /** Repo-relative path written. */
  file: string
  /**
   * The absolute file emitter A actually wrote, which in a worktree is the MAIN
   * checkout's. Surfaced because "I ran the generator and nothing changed here"
   * is otherwise indistinguishable from a bug.
   */
  path: string
  /** true when `path` is outside this checkout, i.e. this is a worktree. */
  redirectedToMainCheckout: boolean
  /**
   * Allowlisted variable NAMES whose value differs between THIS worktree's `.env`
   * and the main checkout's. Never their values.
   *
   * The foot-gun this exists to catch: because every worktree on a machine shares
   * ONE Claude `env` block, editing a worktree's `.env` to point at a different
   * environment and running the generator there silently rewrites that block for
   * the main checkout and every other worktree and session on the machine. It is
   * harmless while the provisioner copies the same `.env` into each worktree, and
   * it stops being harmless the moment someone does not.
   *
   * A WARNING, never a block: this is a real and legitimate thing to do on
   * purpose, and it is a LIMITATION of how Claude Code resolves that file rather
   * than something this generator can fix.
   */
  divergentFromMainCheckout: string[]
  /** Allowlisted names newly added to the `env` block. */
  added: string[]
  /** Allowlisted names whose value changed. */
  updated: string[]
  /** Allowlisted names already correct. */
  unchanged: string[]
  /** Allowlisted names REMOVED because `.env` no longer gives them a value. */
  removed: string[]
  /** Allowlisted names skipped because `.env` declares no value for them. */
  skipped: string[]
  /** `env` keys outside the allowlist, preserved verbatim: the developer's, not ours. */
  preserved: string[]
  /** Other top-level keys preserved verbatim (`permissions`, hooks, anything). */
  preservedKeys: string[]
  /**
   * true when the file on disk differs from what this plan would write.
   *
   * The rendered CONTENTS are deliberately NOT on this object. They contain the
   * credentials, and this object is JSON-serialised by `harness:env --json`; a
   * leak test caught exactly that. The text is returned alongside the plan
   * instead, so the only thing that ever holds it is the code that writes it.
   */
  dirty: boolean
}

/** A plan plus the text that realises it. The text is never part of the plan. */
export interface ClaudePlanned {
  plan: ClaudePlan
  /** File contents to write, or null when the file already agrees. */
  content: string | null
}

/**
 * Plan the merge into `.claude/settings.local.json`.
 *
 * MERGE, NEVER OVERWRITE. The harness writes this same file for permission
 * approvals, so every key this generator did not put there is read and written
 * back untouched, exactly as `cli/lib/updater-settings.ts` does for the allow
 * list. The keys this generator OWNS are precisely the allowlisted ones: that
 * is what lets it remove a stale entry without a state file, and what stops it
 * touching a variable a developer placed there by hand.
 *
 * An allowlisted variable `.env` declares EMPTY is skipped, not written empty.
 * This block overwrites shell exports of the same name, so writing an empty
 * value would clobber a credential a developer legitimately exports some other
 * way. `.env` is authoritative for the values it HAS; it does not assert that a
 * blank line means "no credential anywhere".
 */
export function planClaudeSettings(
  root = REPO_ROOT,
  allowlist = buildAllowlist(root),
  env = readEnvSnapshot(root),
): ClaudePlanned {
  const settingsRoot = claudeSettingsRoot(root);
  const path = join(settingsRoot, CLAUDE_LOCAL_SETTINGS);
  const plan: ClaudePlan = {
    file: CLAUDE_LOCAL_SETTINGS,
    path,
    redirectedToMainCheckout: settingsRoot !== root,
    divergentFromMainCheckout: settingsRoot === root
      ? []
      : divergentAllowlisted(settingsRoot, allowlist.claude, env),
    added: [],
    updated: [],
    unchanged: [],
    removed: [],
    skipped: [],
    preserved: [],
    preservedKeys: [],
    dirty: false,
  };

  let parsed: ReturnType<typeof parsePackageJson>;
  if (existsSync(path)) {
    try { parsed = parsePackageJson(path); }
    catch {
      // Never rewrite a file we cannot read: a hand-broken settings file is the
      // developer's to fix, and a rewrite would destroy their approvals.
      return { plan, content: null };
    }
  }
  else {
    parsed = { data: {}, indent: 2, hasTrailingNewline: true, usesCrlf: false };
  }

  const priorRaw = parsed.data.env;
  const prior: Record<string, string> = {};
  if (priorRaw !== null && typeof priorRaw === 'object' && !Array.isArray(priorRaw)) {
    for (const [k, v] of Object.entries(priorRaw as Record<string, unknown>)) {
      if (typeof v === 'string') { prior[k] = v; }
    }
  }

  const owned = new Set(allowlist.claude);
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(prior)) {
    if (owned.has(k)) { continue; }
    next[k] = v;
    plan.preserved.push(k);
  }
  plan.preserved.sort();
  plan.preservedKeys = Object.keys(parsed.data).filter(k => k !== 'env').sort();

  for (const name of allowlist.claude) {
    if (!hasValue(env, name)) {
      if (name in prior) { plan.removed.push(name); }
      else { plan.skipped.push(name); }
      continue;
    }
    const value = env.values[name];
    next[name] = value;
    if (!(name in prior)) { plan.added.push(name); }
    else if (prior[name] === value) { plan.unchanged.push(name); }
    else { plan.updated.push(name); }
  }

  // Sort the emitted block so a diff of the file is readable and a re-run is
  // byte-stable regardless of the order the keys arrived in.
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(next).sort()) { sorted[k] = next[k]; }

  if (Object.keys(sorted).length === 0) { delete parsed.data.env; }
  else { parsed.data.env = sorted; }

  const rendered = stringifyPackageJson(parsed);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const content = rendered === current ? null : rendered;
  plan.dirty = content !== null;
  return { plan, content };
}

// ----------------------------------------------------------------------------
// Emitter B — `.auth/opencode/<VAR>` + `{file:}` in `opencode.jsonc`
// ----------------------------------------------------------------------------

/** The `{file:...}` reference `opencode.jsonc` must carry for a variable. POSIX, always. */
export function opencodeFileRef(name: string): string {
  return `{file:${OPENCODE_SECRET_DIR}/${name}}`;
}

export interface OpencodePlan {
  /** Value files to create or rewrite, by variable name. */
  write: string[]
  /** Value files already byte-correct. */
  unchanged: string[]
  /**
   * Referenced by `opencode.jsonc` but absent from the COMMITTED `.env.example`.
   *
   * These keep their `{env:VAR}` placeholder and get no value file. A variable
   * the project's own template never declares is not part of its contract, so
   * committing a `{file:}` pointer for it would assert a contract that does not
   * exist. In practice this list is empty; a non-empty one means a config
   * references a variable nobody documented, which is worth seeing.
   */
  undeclared: string[]
  /** Stale value files removed: nothing references them any more. */
  removed: string[]
  /** `{env:VAR}` placeholders rewritten to `{file:...}`. */
  rewritten: string[]
  /** true when `opencode.jsonc` on disk differs from what this plan would write. */
  configDirty: boolean
}

/** A plan plus the text that realises it. Symmetric with `ClaudePlanned`. */
export interface OpencodePlanned {
  plan: OpencodePlan
  /** New `opencode.jsonc` contents, or null when it already agrees. */
  configContent: string | null
}

/**
 * Plan emitter B.
 *
 * A variable `.env` declares EMPTY still gets a file, holding the empty string.
 * That is deliberate and it is the opposite of emitter A's rule, for a reason:
 * a missing `{file:}` target is a HARD error at config load, so skipping the
 * six `DBHUB_*` variables on a project with no database would break every other
 * MCP server in the same config. An empty file reproduces exactly today's
 * `{env:}`-resolves-to-empty behaviour, while a variable `.env` never declared
 * at all still fails loudly, which is the case worth failing on.
 *
 * The value is written with NO trailing newline. `{file:}` substitutes the file's
 * CONTENTS verbatim, so a newline would end up inside an `Authorization: Bearer`
 * header and the credential would be rejected for a reason nothing names.
 */
export function planOpencode(
  root = REPO_ROOT,
  allowlist = buildAllowlist(root),
  env = readEnvSnapshot(root),
  template = readTemplateDeclarations(root),
): OpencodePlanned {
  const plan: OpencodePlan = {
    write: [],
    unchanged: [],
    undeclared: [],
    removed: [],
    rewritten: [],
    configDirty: false,
  };
  const dir = join(root, OPENCODE_SECRET_DIR);
  const inTemplate = new Set(template);
  // The contract set: allowlisted AND declared by the committed template.
  const contract = allowlist.opencode.filter(n => inTemplate.has(n));
  plan.undeclared = allowlist.opencode.filter(n => !inTemplate.has(n));

  // A file is written for EVERY variable in the contract, whether or not `.env`
  // gives it a value. Measured on OpenCode 1.18.30: an empty file substitutes
  // silently to the empty string and exits 0, so an empty file is the safe
  // degraded state — exactly as degraded as today's `{env:}`-resolves-to-empty
  // and no worse. A MISSING file, by contrast, invalidates the whole config.
  // Writing them unconditionally is therefore what guarantees that after any run
  // of this generator OpenCode can never be dead.
  for (const name of contract) {
    const target = join(dir, name);
    const value = env.values[name] ?? '';
    const same = existsSync(target) && readFileSync(target, 'utf8') === value;
    if (same) { plan.unchanged.push(name); }
    else { plan.write.push(name); }
  }

  // Stale value files: present on disk, referenced by nothing.
  if (existsSync(dir)) {
    const keep = new Set(contract);
    for (const entry of readdirSync(dir)) {
      if (!keep.has(entry)) { plan.removed.push(entry); }
    }
    plan.removed.sort();
  }

  // Rewrite the placeholders. Text-level on purpose: `opencode.jsonc` carries
  // comments that document the MCP wiring, and a JSON.parse round trip would
  // silently delete every one of them.
  const rewritable = contract;
  const configPath = join(root, OPENCODE_CONFIG);
  let configContent: string | null = null;
  if (existsSync(configPath)) {
    const before = readFileSync(configPath, 'utf8');
    let after = before;
    for (const name of rewritable) {
      const placeholder = `{env:${name}}`;
      if (!after.includes(placeholder)) { continue; }
      after = after.split(placeholder).join(opencodeFileRef(name));
      plan.rewritten.push(name);
    }
    plan.rewritten.sort();
    configContent = after === before ? null : after;
    plan.configDirty = configContent !== null;
  }
  return { plan, configContent };
}

// ----------------------------------------------------------------------------
// Apply
// ----------------------------------------------------------------------------

/** chmod 0600, skipped on Windows where the permission model is ACLs, not POSIX modes. */
function secureFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: IS_WINDOWS ? undefined : 0o700 });
  writeFileSync(path, contents, { encoding: 'utf8', mode: IS_WINDOWS ? undefined : 0o600 });
  // `writeFileSync`'s `mode` applies only when the file is CREATED, so an
  // existing file keeps whatever mode it had. Re-assert it on every run.
  if (!IS_WINDOWS) { chmodSync(path, 0o600); }
}

export interface GenerateResult {
  claude: ClaudePlan
  opencode: OpencodePlan
  allowlist: Allowlist
  /**
   * The `.env` snapshot WITHOUT its values. Structural, not cosmetic: this
   * object is JSON-serialised by `scripts/harness-env.ts --json`, and a shape
   * that cannot carry a value cannot leak one, where a shape that carries them
   * relies on every future caller remembering to strip them.
   */
  env: Omit<EnvSnapshot, 'values'>
  /** Allowlisted names actually emitted to at least one surface. */
  emitted: string[]
  /**
   * Names `.env.example` declares that NO MCP config references, so they are
   * deliberately never copied into a harness config.
   *
   * Counted against the committed TEMPLATE, not the developer's `.env`, for two
   * reasons. It is the stable universe, so the count means the same thing on
   * every machine and in every report. And it is the only framing whose
   * arithmetic closes: emitted + excluded = declared. Against a local `.env` the
   * two sets overlap and diverge (a variable can be allowlisted and absent from
   * `.env`, or in `.env` and in neither), which produced a first-run summary
   * reading "emitted 10 of 14 ... 10 not referenced", and a summary line that
   * does not add up is a summary line nobody trusts.
   */
  excluded: string[]
  /** What `.env.example` declares: the denominator of the summary. */
  declared: string[]
  /** true when anything was written. */
  changed: boolean
}

/** Read `.env`, build the allowlist, and write both surfaces. */
export function generate(root = REPO_ROOT, opts: { dryRun?: boolean } = {}): GenerateResult {
  const allowlist = buildAllowlist(root);
  const env = readEnvSnapshot(root);
  const template = readTemplateDeclarations(root);
  const { plan: claude, content: claudeContent } = planClaudeSettings(root, allowlist, env);
  const { plan: opencode, configContent } = planOpencode(root, allowlist, env, template);

  if (opts.dryRun !== true) {
    if (claudeContent !== null) { secureFile(claude.path, claudeContent); }
    const dir = join(root, OPENCODE_SECRET_DIR);
    for (const name of opencode.write) { secureFile(join(dir, name), env.values[name] ?? ''); }
    for (const name of opencode.removed) { rmSync(join(dir, name), { force: true }); }
    if (configContent !== null) { writeFileSync(join(root, OPENCODE_CONFIG), configContent, 'utf8'); }
  }

  const referenced = new Set(allowlist.all);
  const emitted = [...new Set([
    ...claude.added,
    ...claude.updated,
    ...claude.unchanged,
    ...opencode.write,
    ...opencode.unchanged,
  ])].sort();
  return {
    claude,
    opencode,
    allowlist,
    env: { exists: env.exists, declared: env.declared },
    emitted,
    excluded: template.filter(n => !referenced.has(n)),
    declared: template,
    changed: claude.dirty || opencode.configDirty
      || opencode.write.length > 0
      || opencode.removed.length > 0,
  };
}

// ----------------------------------------------------------------------------
// Check
// ----------------------------------------------------------------------------

export interface CheckFinding {
  /** Which surface the finding is about. */
  surface: 'claude' | 'opencode' | 'env' | 'allowlist'
  /** Stable machine tag, so a caller can format without parsing prose. */
  kind:
    | 'env-missing'
    | 'config-unparseable'
    | 'claude-missing'
    | 'claude-stale'
    | 'claude-orphan'
    | 'worktree-divergence'
    | 'opencode-file-missing'
    | 'opencode-file-stale'
    | 'opencode-placeholder'
    | 'opencode-orphan'
    | 'undeclared'
    | 'declared-not-referenced'
    | 'referenced-not-declared'
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
  allowlist: Allowlist
  /** `emitted N of M declared; K not referenced by any MCP config` */
  summary: string
}

/**
 * Verify that `.env` and the generated surfaces agree.
 *
 * Reports NAMES and verdicts only. The value comparison is a string equality
 * that is never surfaced: a generator that leaks a credential into a terminal
 * transcript is worse than the problem it solves.
 */
export function check(root = REPO_ROOT): CheckResult {
  const result = generate(root, { dryRun: true });
  const { allowlist, env, claude, opencode } = result;
  const findings: CheckFinding[] = [];

  for (const scan of allowlist.scans) {
    if (scan.error !== undefined) {
      findings.push({
        surface: 'allowlist',
        kind: 'config-unparseable',
        names: [scan.file],
        detail: `${scan.file} could not be parsed, so its variables are missing from the allowlist (${scan.error}).`,
        blocking: true,
      });
    }
  }

  if (!env.exists) {
    findings.push({
      surface: 'env',
      kind: 'env-missing',
      names: [ENV_FILE],
      detail: 'No .env, so nothing can be generated. Create it: cp .env.example .env',
      blocking: true,
    });
    return {
      ok: false,
      findings,
      allowlist,
      summary: 'no .env: 0 variables emitted',
    };
  }

  if (claude.added.length > 0) {
    findings.push({
      surface: 'claude',
      kind: 'claude-missing',
      names: claude.added,
      detail: `${CLAUDE_LOCAL_SETTINGS} is missing the env entry for these; MCP servers will get the literal \${VAR}.`,
      blocking: true,
    });
  }
  if (claude.updated.length > 0) {
    findings.push({
      surface: 'claude',
      kind: 'claude-stale',
      names: claude.updated,
      detail: `${CLAUDE_LOCAL_SETTINGS} holds a different value than .env for these.`,
      blocking: true,
    });
  }
  if (claude.removed.length > 0) {
    findings.push({
      surface: 'claude',
      kind: 'claude-orphan',
      names: claude.removed,
      detail: `${CLAUDE_LOCAL_SETTINGS} still carries these, but .env no longer gives them a value.`,
      blocking: true,
    });
  }

  if (opencode.write.length > 0) {
    const missing = opencode.write.filter(n => !existsSync(join(root, OPENCODE_SECRET_DIR, n)));
    const stale = opencode.write.filter(n => existsSync(join(root, OPENCODE_SECRET_DIR, n)));
    if (missing.length > 0) {
      findings.push({
        surface: 'opencode',
        kind: 'opencode-file-missing',
        names: missing,
        detail: `${OPENCODE_SECRET_DIR}/ has no value file for these; OpenCode fails at config load.`,
        blocking: true,
      });
    }
    if (stale.length > 0) {
      findings.push({
        surface: 'opencode',
        kind: 'opencode-file-stale',
        names: stale,
        detail: `${OPENCODE_SECRET_DIR}/ holds a different value than .env for these.`,
        blocking: true,
      });
    }
  }
  if (opencode.removed.length > 0) {
    findings.push({
      surface: 'opencode',
      kind: 'opencode-orphan',
      names: opencode.removed,
      detail: `${OPENCODE_SECRET_DIR}/ holds value files nothing references any more.`,
      blocking: true,
    });
  }
  if (opencode.rewritten.length > 0) {
    findings.push({
      surface: 'opencode',
      kind: 'opencode-placeholder',
      names: opencode.rewritten,
      detail: `${OPENCODE_CONFIG} still uses {env:VAR} for these; {env:} resolves from the process environment, which a desktop launch does not have.`,
      blocking: true,
    });
  }
  if (opencode.undeclared.length > 0) {
    findings.push({
      surface: 'opencode',
      kind: 'undeclared',
      names: opencode.undeclared,
      // NOT blocking. Their `{env:VAR}` placeholder is left in place, so these
      // behave exactly as they do today and nothing got worse. Blocking here
      // would report "your setup is broken" for a setup that is merely
      // unimproved, and a check that cries wolf is a check people switch off.
      detail: `${OPENCODE_CONFIG} references these and ${ENV_EXAMPLE_FILE} does not declare them, so they keep the {env:} placeholder. Document them in ${ENV_EXAMPLE_FILE} to move them onto {file:}.`,
      blocking: false,
    });
  }

  if (claude.divergentFromMainCheckout.length > 0) {
    findings.push({
      surface: 'claude',
      kind: 'worktree-divergence',
      names: claude.divergentFromMainCheckout,
      detail: 'This worktree\'s .env disagrees with the main checkout\'s for these, and Claude Code reads ONE '
        + `env block for every worktree on this machine (${CLAUDE_LOCAL_SETTINGS} at the main checkout's root). `
        + 'Running the generator here rewrites that block for every other worktree and session too.',
      blocking: false,
    });
  }

  // Cross-checks against the DECLARED map. Informational: the scan is the source
  // of truth, and a declaration that has drifted is worth seeing but is not a
  // reason to fail a developer's setup.
  if (allowlist.declaredNotReferenced.length > 0) {
    findings.push({
      surface: 'allowlist',
      kind: 'declared-not-referenced',
      names: allowlist.declaredNotReferenced,
      detail: 'MCP_SERVER_SECRETS declares these, but no MCP config references them.',
      blocking: false,
    });
  }
  if (allowlist.referencedNotDeclared.length > 0) {
    findings.push({
      surface: 'allowlist',
      kind: 'referenced-not-declared',
      names: allowlist.referencedNotDeclared,
      detail: 'An MCP config references these, but MCP_SERVER_SECRETS does not declare them.',
      blocking: false,
    });
  }

  const skipped = claude.skipped.length;
  return {
    ok: !findings.some(f => f.blocking),
    findings,
    allowlist,
    summary: `emitted ${result.emitted.length} of ${result.declared.length} declared variables; `
      + `${result.excluded.length} not referenced by any MCP config${
        skipped > 0 ? `; ${skipped} referenced but still empty in .env` : ''}`,
  };
}
