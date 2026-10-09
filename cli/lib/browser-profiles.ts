/**
 * browser-profiles.ts — the Chrome profiles the Playwright CLI daemon leaves
 * on disk, and which of them are safe to delete.
 *
 * `playwright-cli open --persistent` (or a config with `isolated: false`) gives
 * every session name its own full profile, `ud-<session>-<browser>`, under
 * `<daemon dir>/<workspace hash>/`, and `close` never deletes it. In-memory
 * sessions (the shipped config) leave nothing. Doctrine:
 * `.agents/skills/agentic-qa-core/references/browser-sessions.md` §8.
 *
 * Every path below was read from the CLI source (playwright-core
 * `src/tools/cli-client/registry.ts`: `baseDaemonDir`, `daemonProfilesDir`;
 * `resolveCLIConfigForCLI` names the `ud-` dir), not guessed. Pure functions
 * except `scanDaemonProfiles` (reads) and `deleteProfile` (removes one dir,
 * guarded); `scripts/browser-profiles.ts` is the command.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const DEFAULT_OLDER_THAN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The daemon dir exactly as the CLI computes it: `PWTEST_DAEMON_SESSION_DIR`
 * when set, else `<local cache>/ms-playwright/daemon`, where the local cache is
 * `$XDG_CACHE_HOME` or `~/.cache` (Linux), `~/Library/Caches` (macOS),
 * `%LOCALAPPDATA%` or `~/AppData/Local` (Windows).
 */
export function daemonBaseDir(platform: NodeJS.Platform = process.platform, env: Readonly<Record<string, string | undefined>> = process.env, home: string = os.homedir()): string {
  if (env.PWTEST_DAEMON_SESSION_DIR) { return env.PWTEST_DAEMON_SESSION_DIR; }
  const join = (...parts: string[]): string => (platform === 'win32' ? path.win32.join(...parts) : path.posix.join(...parts));
  let cache: string;
  if (platform === 'linux') { cache = env.XDG_CACHE_HOME || join(home, '.cache'); }
  else if (platform === 'darwin') { cache = join(home, 'Library', 'Caches'); }
  else if (platform === 'win32') { cache = env.LOCALAPPDATA || join(home, 'AppData', 'Local'); }
  else { throw new Error(`Unsupported platform: ${platform}`); }
  return join(cache, 'ms-playwright', 'daemon');
}

export interface DaemonProfile {
  /** Absolute path of the `ud-*` dir. */
  path: string
  /** The `<workspace hash>` dir it sits in (sha1 of the workspace dir, 16 hex). */
  workspaceHash: string
  /** The workspace that hash belongs to, when a `.session` file beside it names it. */
  workspaceDir: string | null
  /** `ud-<session>-<browser>`. */
  name: string
  /** Disk usage (allocated blocks), symlinks not followed. */
  bytes: number
  /** Newest mtime anywhere in the tree: when a browser last wrote to it. */
  lastUsedMs: number
}

function walk(dir: string): { bytes: number, newest: number } {
  let bytes = 0;
  let newest = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let stat: fs.Stats;
    try { stat = fs.lstatSync(current); }
    catch { continue; }
    bytes += typeof stat.blocks === 'number' && stat.blocks > 0 ? stat.blocks * 512 : stat.size;
    newest = Math.max(newest, stat.mtimeMs);
    if (!stat.isDirectory()) { continue; }
    let entries: string[];
    try { entries = fs.readdirSync(current); }
    catch { continue; }
    for (const entry of entries) { stack.push(path.join(current, entry)); }
  }
  return { bytes, newest };
}

function workspaceOf(hashDir: string): string | null {
  let files: string[];
  try { files = fs.readdirSync(hashDir).filter(f => f.endsWith('.session')); }
  catch { return null; }
  for (const file of files) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(hashDir, file), 'utf8')) as { workspaceDir?: unknown };
      if (typeof config.workspaceDir === 'string' && config.workspaceDir) { return config.workspaceDir; }
    }
    catch { /* a broken session file names nothing */ }
  }
  return null;
}

/** Every real `ud-*` directory one level under each workspace hash dir. Symlinks are never followed. */
export function scanDaemonProfiles(base: string): DaemonProfile[] {
  const profiles: DaemonProfile[] = [];
  let hashes: fs.Dirent[];
  try { hashes = fs.readdirSync(base, { withFileTypes: true }); }
  catch { return []; }
  for (const hash of hashes) {
    if (!hash.isDirectory()) { continue; }
    const hashDir = path.join(base, hash.name);
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(hashDir, { withFileTypes: true }); }
    catch { continue; }
    const uds = entries.filter(e => e.isDirectory() && e.name.startsWith('ud-'));
    if (uds.length === 0) { continue; }
    const workspaceDir = workspaceOf(hashDir);
    for (const ud of uds) {
      const full = path.join(hashDir, ud.name);
      const { bytes, newest } = walk(full);
      profiles.push({ path: full, workspaceHash: hash.name, workspaceDir, name: ud.name, bytes, lastUsedMs: newest });
    }
  }
  return profiles;
}

export interface LiveSession {
  name: string
  /** `null` for an in-memory session. */
  userDataDir: string | null
}

/**
 * The sessions `playwright-cli list --all` prints. It lists only sessions the
 * CLI can connect to (`collectList`), one block each:
 * `- <name>:` then `  - status: open` and `  - user-data-dir: <path|<in-memory>>`.
 * Workspace headers (`<dir>:`) and the attach/CDP sections carry no `status:`
 * line and are skipped.
 */
export function parseListAll(output: string): LiveSession[] {
  const live: LiveSession[] = [];
  let current: { name: string, open: boolean, userDataDir: string | null } | null = null;
  const flush = (): void => {
    if (current?.open) { live.push({ name: current.name, userDataDir: current.userDataDir }); }
    current = null;
  };
  for (const raw of output.split(/\r?\n/)) {
    if (raw.startsWith('### ')) { flush(); continue; }
    const block = /^- (?!browser ")(.+):$/.exec(raw);
    if (block) { flush(); current = { name: block[1], open: false, userDataDir: null }; continue; }
    if (!current) { continue; }
    const status = /^ {2}- status: (\S+)/.exec(raw);
    if (status) { current.open = status[1] === 'open'; continue; }
    const dir = /^ {2}- user-data-dir: (.+)$/.exec(raw);
    if (dir) { current.userDataDir = dir[1] === '<in-memory>' ? null : dir[1].trim(); }
  }
  flush();
  return live;
}

export type ProfileVerdict = 'delete' | 'keep: live session' | 'keep: recent';

export interface ProfileDecision {
  profile: DaemonProfile
  verdict: ProfileVerdict
}

/**
 * Which profiles `--apply` may delete: older than `olderThanDays` AND held by no
 * live session. A live session holds a dir when it names that exact
 * user-data-dir, or when the dir starts with `ud-<its name>-` (the prefix the
 * CLI's own `delete-data` matches). Over-protective by design: a shared prefix
 * keeps a dir rather than risk the one in use.
 */
export function selectStale(profiles: readonly DaemonProfile[], live: readonly LiveSession[], olderThanDays: number, nowMs: number): ProfileDecision[] {
  const liveDirs = new Set(live.flatMap(s => (s.userDataDir ? [path.resolve(s.userDataDir)] : [])));
  const cutoff = nowMs - olderThanDays * DAY_MS;
  return profiles.map((profile) => {
    const held = liveDirs.has(path.resolve(profile.path)) || live.some(s => profile.name.startsWith(`ud-${s.name}-`));
    if (held) { return { profile, verdict: 'keep: live session' }; }
    if (profile.lastUsedMs > cutoff) { return { profile, verdict: 'keep: recent' }; }
    return { profile, verdict: 'delete' };
  });
}

/**
 * True only for a `ud-*` dir that sits exactly two levels under `base`
 * (`<base>/<hash>/ud-*`) and is not a symlink. Anything else (an owner profile
 * under `~/.agentic-qa/playwright-profiles/`, a custom `--profile` dir, a path
 * that escaped through `..`) is refused.
 */
export function isDeletableProfile(target: string, base: string): boolean {
  const resolved = path.resolve(target);
  const rel = path.relative(path.resolve(base), resolved);
  const parts = rel.split(path.sep);
  if (rel.startsWith('..') || path.isAbsolute(rel) || parts.length !== 2 || !parts[1].startsWith('ud-')) { return false; }
  if (resolved.split(path.sep).includes('.agentic-qa')) { return false; }
  try { return fs.lstatSync(resolved).isDirectory(); }
  catch { return false; }
}

/** Remove one profile after `isDeletableProfile`. Returns the error message, or null on success. */
export function deleteProfile(target: string, base: string): string | null {
  if (!isDeletableProfile(target, base)) { return `refused: ${target} is not a ud-* dir under ${base}`; }
  try {
    fs.rmSync(target, { recursive: true, maxRetries: 3 });
    return null;
  }
  catch (error) { return (error as Error).message; }
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) { return `${(bytes / 1024 ** 3).toFixed(1)} GB`; }
  if (bytes >= 1024 ** 2) { return `${(bytes / 1024 ** 2).toFixed(0)} MB`; }
  return `${Math.round(bytes / 1024)} KB`;
}

export function ageDays(lastUsedMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - lastUsedMs) / DAY_MS));
}
