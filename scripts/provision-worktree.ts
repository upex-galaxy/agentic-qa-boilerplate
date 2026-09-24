#!/usr/bin/env bun
/**
 * provision-worktree.ts — wires a FRESH git worktree of this repo so an agent
 * session inside it has what a plain `git worktree add` leaves out. A fresh
 * worktree shares every TRACKED file with the primary checkout (same repo,
 * different branch) but starts with none of the gitignored state a session
 * needs: `.env`, the `.claude/skills` alias, gitignored T3 community skills,
 * `node_modules/`, and `.auth/`. See the gap table in
 * `.agents/skills/orca-orchestration/references/provisioning.md` for the full
 * rationale per item.
 *
 * Usage:
 *   bun scripts/provision-worktree.ts              # target = $PWD
 *   bun scripts/provision-worktree.ts <path>        # explicit target
 *   bun scripts/provision-worktree.ts --dry-run [<path>]
 *
 * The no-argument form (target = $PWD) is what makes this script usable
 * verbatim as an Orca repo setup hook (Settings → Repo → Setup, run from the
 * worktree Orca just created) — see `orca-orchestration/references/provisioning.md`
 * for how to wire it in.
 *
 * Deliberately NEVER copies `.session/` — a worker inside the fresh worktree
 * reaches conductor/roster/brief files by an ABSOLUTE path back to the primary
 * checkout instead (state written inside a worktree dies with it on removal).
 *
 * Exit code: 0 on success (including a clean --dry-run), 1 on any hard
 * failure (not a git repo, target IS the primary checkout, `bun install`
 * fails, `bun run agents:compat` fails).
 */

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const PREFIX = '[provision-worktree]';

function log(msg: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
  const icons = { info: 'ℹ', success: '✓', warn: '⚠', error: '✗' };
  const colors = { info: '\x1B[36m', success: '\x1B[32m', warn: '\x1B[33m', error: '\x1B[31m' };
  console.log(`${colors[type]}${icons[type]}\x1B[0m ${PREFIX} ${msg}`);
}

function showHelp(): void {
  console.log(`
\x1B[1mprovision-worktree\x1B[0m - wire a fresh git worktree with gitignored session state

\x1B[1mUSAGE\x1B[0m
  bun scripts/provision-worktree.ts [path] [--dry-run]

\x1B[1mARGUMENTS\x1B[0m
  path         Target worktree directory (default: $PWD)

\x1B[1mOPTIONS\x1B[0m
  --dry-run    Print what would be copied/run without touching anything
  -h, --help   Show this help

\x1B[1mWHAT IT DOES\x1B[0m
  1. Refuses to run if [path] resolves to the PRIMARY checkout.
  2. Copies .env, .claude/settings.local.json, .auth/ (mode 0600; chmod
     skipped on Windows).
  3. Runs \`bun install --frozen-lockfile\` inside the target.
  4. Runs \`bun run agents:compat\` inside the target (creates the
     .claude/skills alias).
  5. Copies gitignored T3 skill directories under .agents/skills/.
  6. Creates an EMPTY .auth/opencode/<VAR> placeholder for every {file:}
     reference in opencode.jsonc that the .auth/ copy did not supply (a
     missing target breaks OpenCode's whole config; an empty file does not).
  7. Runs \`direnv allow <worktree>\` ONLY when direnv is installed AND the
     primary checkout's .envrc is already allowed; otherwise says why not.
  8. Prints a summary + a hint to run \`bun run context:hydrate\` for the
     .context/PBI/ cache (not copied — it is per-session Jira state).

  Never copies .session/ — see the file header for why.
`);
}

// ============================================
// CLI argument parsing
// ============================================

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  showHelp();
  process.exit(0);
}
const dryRun = args.includes('--dry-run');
const positional = args.filter(a => !a.startsWith('-'));
const TARGET = resolve(positional[0] ?? process.cwd());

// ============================================
// Resolve the primary checkout and refuse to run on it
// ============================================

/**
 * Resolve THIS checkout's primary worktree root via its shared git dir.
 * `--git-common-dir` returns `<primary>/.git` for BOTH the primary checkout
 * and any of its worktrees (a worktree keeps its own tiny `.git` FILE that
 * points back at the shared directory), so `dirname()` of it is always the
 * primary checkout root.
 */
function resolvePrimaryRoot(cwd: string): string {
  const p = Bun.spawnSync(['git', '-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (p.exitCode !== 0) {
    log(`Not a git repository (or git not found on PATH): ${cwd}`, 'error');
    log(p.stderr.toString().trim(), 'error');
    process.exit(1);
  }
  const commonDir = p.stdout.toString().trim();
  return dirname(commonDir);
}

if (!existsSync(TARGET)) {
  log(`Target does not exist: ${TARGET}`, 'error');
  process.exit(1);
}

const PRIMARY = resolvePrimaryRoot(TARGET);

// Compare REAL paths, not merely resolved ones: on macOS $TMPDIR (and some
// home-directory setups) sits behind a symlink git itself resolves
// (`/var/folders/...` -> `/private/var/folders/...`), so a plain
// `resolve()` comparison silently fails to catch "target IS the primary".
if (realpathSync(TARGET) === realpathSync(PRIMARY)) {
  log('Refusing to provision the PRIMARY checkout — this script is for fresh worktrees only.', 'error');
  log(`Target resolved to the primary checkout itself: ${PRIMARY}`, 'error');
  process.exit(1);
}

// The target must be the worktree ROOT, not a subdirectory of one: every copy
// below lands relative to TARGET, so a subdirectory argument would silently
// provision the wrong place.
{
  const top = Bun.spawnSync(['git', '-C', TARGET, 'rev-parse', '--show-toplevel'], { stdout: 'pipe', stderr: 'pipe' });
  const toplevel = top.exitCode === 0 ? top.stdout.toString().trim() : '';
  if (!toplevel || realpathSync(toplevel) !== realpathSync(TARGET)) {
    log(`Target must be the root of a git worktree (got ${TARGET}${toplevel ? `, root is ${toplevel}` : ''}).`, 'error');
    process.exit(1);
  }
}

log(`Primary checkout: ${PRIMARY}`);
log(`Target worktree:  ${TARGET}${dryRun ? ' (dry run — nothing will be written)' : ''}`);

// ============================================
// Secure copies: .env, .claude/settings.local.json, .auth/ — mode 0600
// ============================================

const IS_WINDOWS = platform() === 'win32';
const copied: string[] = [];
const skipped: string[] = [];

/** chmod 0600 for files / 0700 for dirs, recursively. No-op on Windows (ACLs, not POSIX modes). */
function secureChmodRecursive(target: string): void {
  if (IS_WINDOWS) { return; }
  const stat = statSync(target);
  if (stat.isDirectory()) {
    chmodSync(target, 0o700);
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      secureChmodRecursive(join(target, entry.name));
    }
  }
  else {
    chmodSync(target, 0o600);
  }
}

function secureCopyFile(relPath: string): void {
  const src = join(PRIMARY, relPath);
  if (!existsSync(src)) {
    log(`Skipping ${relPath} (not present in primary checkout)`, 'warn');
    skipped.push(relPath);
    return;
  }
  if (dryRun) {
    log(`Would copy ${relPath} (mode 0600)`, 'info');
    return;
  }
  const dest = join(TARGET, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  if (!IS_WINDOWS) { chmodSync(dest, 0o600); }
  log(`Copied ${relPath}`, 'success');
  copied.push(relPath);
}

function secureCopyDir(relPath: string): void {
  const src = join(PRIMARY, relPath);
  if (!existsSync(src)) {
    log(`Skipping ${relPath}/ (not present in primary checkout)`, 'warn');
    skipped.push(`${relPath}/`);
    return;
  }
  if (dryRun) {
    log(`Would copy ${relPath}/ (mode 0600/0700)`, 'info');
    return;
  }
  const dest = join(TARGET, relPath);
  cpSync(src, dest, { recursive: true });
  secureChmodRecursive(dest);
  log(`Copied ${relPath}/`, 'success');
  copied.push(`${relPath}/`);
}

secureCopyFile('.env');
secureCopyFile('.claude/settings.local.json');
secureCopyDir('.auth');

// ============================================
// bun install --frozen-lockfile + bun run agents:compat, inside TARGET
// ============================================

function runInTarget(cmd: string[], label: string): void {
  if (dryRun) {
    log(`Would run: ${cmd.join(' ')} (cwd: ${TARGET})`, 'info');
    return;
  }
  log(`Running: ${cmd.join(' ')}`);
  const p = Bun.spawnSync(cmd, { cwd: TARGET, stdout: 'inherit', stderr: 'inherit' });
  if (p.exitCode !== 0) {
    log(`${label} failed (exit ${p.exitCode}) — aborting.`, 'error');
    process.exit(1);
  }
  log(`${label} done`, 'success');
}

runInTarget(['bun', 'install', '--frozen-lockfile'], 'bun install');
// Creates the .claude/skills alias (junction on Windows) among other checks;
// see cli/lib/agent-compatibility.ts. Safe to re-run.
runInTarget(['bun', 'run', 'agents:compat'], 'bun run agents:compat');

// ============================================
// T3 community skills: any dir under .agents/skills/ that git ignores
// ============================================

function listGitignoredSkillDirs(): string[] {
  const skillsRoot = join(PRIMARY, '.agents', 'skills');
  if (!existsSync(skillsRoot)) { return []; }
  const names = readdirSync(skillsRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name);
  const ignored: string[] = [];
  for (const name of names) {
    const relPath = `.agents/skills/${name}`;
    const p = Bun.spawnSync(['git', '-C', PRIMARY, 'check-ignore', '-q', relPath], {
      stdout: 'ignore',
      stderr: 'ignore',
    });
    if (p.exitCode === 0) { ignored.push(name); }
  }
  return ignored;
}

const t3SkillDirs = listGitignoredSkillDirs();
if (t3SkillDirs.length === 0) {
  log('No gitignored T3 skill directories found under .agents/skills/', 'info');
}
for (const name of t3SkillDirs) {
  const relPath = `.agents/skills/${name}`;
  if (dryRun) {
    log(`Would copy ${relPath}/ (T3 community skill)`, 'info');
    continue;
  }
  const dest = join(TARGET, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(PRIMARY, relPath), dest, { recursive: true });
  log(`Copied ${relPath}/ (T3 community skill)`, 'success');
  copied.push(`${relPath}/`);
}

// ============================================
// OpenCode placeholders: every {file:} target must EXIST, even empty
// ============================================

// Covers a primary that never ran `bun run setup`: its `.auth/` copy (or its
// absence) supplies nothing, and OpenCode then throws `bad file reference …
// does not exist` on the whole config. Existing files are never touched.
//
// Dynamic import, placed AFTER `bun install`: `cli/lib/harness-env.ts` imports
// `cli/install.ts`, which needs third-party packages. As an Orca setup hook
// this script runs FROM the fresh worktree, whose node_modules do not exist
// until step 3 above, so a static import would crash at module load.
if (dryRun) {
  log('Would create empty .auth/opencode/<VAR> placeholders for any {file:} reference in opencode.jsonc that .auth/ did not supply', 'info');
}
else {
  const { ensureOpencodePlaceholders } = await import('../cli/lib/harness-env.ts');
  const placeholders = ensureOpencodePlaceholders(TARGET);
  if (placeholders.error) { log(`opencode.jsonc could not be scanned for {file:} references: ${placeholders.error}`, 'warn'); }
  log(`OpenCode placeholders: ${placeholders.created.length} created empty (${placeholders.created.join(', ') || 'none'}), ${placeholders.kept.length} kept from .auth/`, placeholders.created.length > 0 ? 'success' : 'info');
}

// ============================================
// direnv: allow the worktree's .envrc ONLY if the primary's already is
// ============================================

/**
 * `direnv status` with `cwd` set to the checkout to ask about. direnv 2.37.1
 * (measured) prints `Found RC allowed 0` for an allowed .envrc and `1` for one
 * that is not; older builds printed `true`/`false`. The `Loaded RC` lines above
 * it describe whatever the CALLING shell has loaded, so only the `Found RC`
 * line answers the question. No `Found RC` line = direnv sees no .envrc there.
 */
function direnvAllowedIn(cwd: string): boolean | 'no-envrc' | 'not-installed' {
  let out: string;
  try {
    const status = Bun.spawnSync(['direnv', 'status'], { cwd, stdout: 'pipe', stderr: 'pipe' });
    if (status.exitCode !== 0) { return 'not-installed'; }
    out = status.stdout.toString();
  }
  catch {
    return 'not-installed'; // ENOENT: no direnv on PATH
  }
  const match = out.match(/Found RC allowed (\d+|true|false)/);
  if (match === null) { return 'no-envrc'; }
  return match[1] === '0' || match[1] === 'true';
}

// The allow path is not unit-testable without a real direnv on PATH and a
// primary whose .envrc the machine's owner approved; the test suite covers the
// "not installed" skip. Never approves on a machine that never approved the
// primary: `direnv allow` grants execution of the file on every `cd`.
{
  const primaryAllowed = direnvAllowedIn(PRIMARY);
  if (primaryAllowed === 'not-installed') {
    log('direnv: skipped (not installed); nothing to allow. Launch with `bun run claude` / `bun run opencode` / `bun run codex`.', 'info');
  }
  else if (primaryAllowed === 'no-envrc') {
    log('direnv: skipped (direnv finds no .envrc in the primary checkout).', 'info');
  }
  else if (!primaryAllowed) {
    log('direnv: skipped (the primary checkout\'s .envrc is not allowed on this machine; run `direnv allow` there first if you want shell autoload). Never approving a worktree the owner never approved.', 'warn');
  }
  else if (dryRun) {
    log(`Would run: direnv allow ${TARGET} (the primary checkout's .envrc is already allowed)`, 'info');
  }
  else {
    const allow = Bun.spawnSync(['direnv', 'allow', TARGET], { stdout: 'pipe', stderr: 'pipe' });
    if (allow.exitCode === 0) {
      log(`direnv: allowed ${TARGET}/.envrc (the primary checkout's .envrc is already allowed).`, 'success');
    }
    else {
      log(`direnv: \`direnv allow ${TARGET}\` failed (exit ${allow.exitCode}); run it yourself in the worktree. ${allow.stderr.toString().trim().slice(0, 200)}`, 'warn');
    }
  }
}

// ============================================
// Summary
// ============================================

console.log('');
if (dryRun) {
  log('Dry run complete — nothing was written.', 'success');
}
else {
  log(`Provisioning complete: ${copied.length} item(s) copied, ${skipped.length} skipped (not present in primary).`, 'success');
}
log('Hint: .context/PBI/ (the Jira cache) was NOT copied — run `bun run context:hydrate` in the worktree if the session needs synced tickets.', 'info');
log('Hint: .session/ was NOT copied on purpose — reach conductor/roster/brief files by an absolute path back to the primary checkout.', 'info');
