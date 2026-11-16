/**
 * clean.ts — what in this repo is generated, who regenerates it, and the
 * guarded delete behind `bun run clean`.
 *
 * The registry below is an explicit ALLOWLIST. "Whatever git ignores" is not
 * the rule: an ignored path can be irreplaceable (`.backups*`, `.allure/`
 * trend history, `.auth/`, the Jira mirror under `.context/PBI/`). Nothing
 * outside `TARGETS` is ever planned, and `isDeletable` refuses a path that
 * escapes the repo, is a symlink, or sits under `PROTECTED`.
 *
 * Levels, cheapest to costliest to get back:
 *   safe      test and report output, playwright-cli logs, `.DS_Store`
 *   profiles  a browser profile left inside the repo (the owner's logins)
 *   history   `.allure/` trend history and `.backups*` Xray exports: only a person decides
 *   sessions  scratch under `.session/`, by age
 *   builds    `node_modules`, `dist`: rebuilt by `bun install` / the build
 *
 * Doctrine: `.agents/skills/agentic-qa-core/references/browser-sessions.md` §8
 * (daemon profiles, which `bun run browser:profiles` owns) and this registry.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { walk } from './browser-profiles.ts';

/** Display form only (cli/ is import-closed, so this is not `scripts/lib/posix-path.ts`). Guards compare in `path.sep`. */
function relativePosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

export type CleanLevel = 'safe' | 'profiles' | 'history' | 'sessions' | 'builds';

export const LEVELS: readonly CleanLevel[] = ['safe', 'profiles', 'history', 'sessions', 'builds'];
export const DEFAULT_SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CleanTarget {
  level: CleanLevel
  /** Repo-relative, `/`-separated. A segment `*` matches each direct child as its own entry; `name*` matches siblings by prefix. */
  path: string
  /** The command that brings it back. */
  regen: string
}

export const TARGETS: readonly CleanTarget[] = [
  { level: 'safe', path: 'test-results', regen: 'bun run test (Playwright outputDir, JSON and JUnit)' },
  { level: 'safe', path: 'playwright-report', regen: 'bun run test (HTML reporter)' },
  { level: 'safe', path: 'blob-report', regen: 'a sharded bun run test' },
  { level: 'safe', path: 'allure-results', regen: 'bun run test (allure-playwright)' },
  { level: 'safe', path: 'allure-report', regen: 'bun run allure:generate' },
  { level: 'safe', path: 'reports', regen: 'the command that wrote the report' },
  { level: 'safe', path: '.playwright/output', regen: 'any playwright-cli run (console and page logs)' },
  { level: 'safe', path: '.playwright-cli', regen: 'a playwright-cli capture with no path' },
  { level: 'safe', path: '.context/reports/.playwright-cli', regen: 'a playwright-cli run started there' },
  { level: 'profiles', path: '.playwright/user-data', regen: 'playwright-cli --persistent (you log in again)' },
  { level: 'profiles', path: '.playwright/profiles', regen: 'playwright-cli --profile with a relative path (you log in again)' },
  { level: 'history', path: '.allure', regen: 'allure trend history: it restarts from the next run (the report loses its trend graph until then)' },
  { level: 'history', path: '.backups*', regen: 'not regenerable: Xray exports and key-mapping CSVs from past migrations (the live data is in Xray)' },
  { level: 'sessions', path: '.session/.archive/*', regen: 'not regenerable: finished plan and progress files, kept only for replay' },
  { level: 'sessions', path: '.session/spikes/*', regen: 'not regenerable: throwaway experiments' },
  { level: 'sessions', path: '.session/orchestration/*', regen: 'not regenerable: finished fleet runs (a run still in progress is recent, so it stays)' },
  { level: 'builds', path: 'node_modules', regen: 'bun install' },
  { level: 'builds', path: '.opencode/node_modules', regen: 'bun install in .opencode' },
  { level: 'builds', path: 'packages/*/node_modules', regen: 'bun install' },
  { level: 'builds', path: 'packages/*/dist', regen: 'the package build' },
];

/** `.DS_Store` anywhere in the repo except these trees. Level `safe`. */
const DS_STORE_SKIP = new Set(['node_modules', '.git', 'worktrees']);

/**
 * Never planned, and refused by `isDeletable` even if a registry row ever
 * pointed at it. Each one is the source of truth for something, or holds a secret.
 */
export const PROTECTED: readonly string[] = [
  '.git',
  '.env',
  '.auth',
  '.context/PBI',
  '.session/decisions',
  '.session/handoffs',
  '.session/framework-development',
];

export interface CleanEntry {
  level: CleanLevel
  /** Repo-relative, `/`-separated. */
  rel: string
  bytes: number
  lastUsedMs: number
  regen: string
  /** `keep: recent` when a sessions entry is younger than the age gate. */
  verdict: 'delete' | 'keep: recent'
}

function isProtected(rel: string): boolean {
  return PROTECTED.some(p => rel === p || rel.startsWith(`${p}/`) || rel.startsWith(`${p}.`) || rel.startsWith(`${p}-`));
}

/**
 * True only for a real (non-symlink) path strictly inside `root`, not under
 * `PROTECTED`. Compares in the platform's own separator (a guard, not a display).
 */
export function isDeletable(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) { return false; }
  if (isProtected(rel.split(path.sep).join('/'))) { return false; }
  try { return !fs.lstatSync(resolved).isSymbolicLink(); }
  catch { return false; }
}

function expand(root: string, pattern: string): string[] {
  const parts = pattern.split('/');
  let bases = [root];
  for (const part of parts) {
    const next: string[] = [];
    for (const base of bases) {
      if (part.includes('*')) {
        let names: fs.Dirent[];
        try { names = fs.readdirSync(base, { withFileTypes: true }); }
        catch { continue; }
        const [head, tail] = part.split('*');
        for (const entry of names) {
          if (entry.name.startsWith(head) && entry.name.endsWith(tail)) { next.push(path.join(base, entry.name)); }
        }
      }
      else { next.push(path.join(base, part)); }
    }
    bases = next;
  }
  return bases.filter((p) => {
    try { fs.lstatSync(p); return true; }
    catch { return false; }
  });
}

function findDsStore(root: string): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        if (!DS_STORE_SKIP.has(entry.name)) { stack.push(path.join(dir, entry.name)); }
      }
      else if (entry.name === '.DS_Store') { found.push(path.join(dir, entry.name)); }
    }
  }
  return found;
}

export interface PlanOptions {
  levels: readonly CleanLevel[]
  olderThanDays: number
  nowMs: number
}

/** What each requested level would delete under `root`. Reads only. */
export function planClean(root: string, options: PlanOptions): CleanEntry[] {
  const entries: CleanEntry[] = [];
  const seen = new Set<string>();
  const add = (level: CleanLevel, full: string, regen: string): void => {
    const rel = relativePosix(root, full);
    if (seen.has(rel) || !isDeletable(root, full)) { return; }
    seen.add(rel);
    const { bytes, newest } = walk(full);
    const young = level === 'sessions' && newest > options.nowMs - options.olderThanDays * DAY_MS;
    entries.push({ level, rel, bytes, lastUsedMs: newest, regen, verdict: young ? 'keep: recent' : 'delete' });
  };
  for (const target of TARGETS) {
    if (!options.levels.includes(target.level)) { continue; }
    for (const full of expand(root, target.path)) { add(target.level, full, target.regen); }
  }
  if (options.levels.includes('safe')) {
    for (const full of findDsStore(root)) { add('safe', full, 'macOS recreates it when Finder opens the folder'); }
  }
  return entries;
}

/** Remove one planned entry after `isDeletable`. Returns the error message, or null on success. */
export function removeEntry(root: string, entry: CleanEntry): string | null {
  const full = path.join(root, ...entry.rel.split('/'));
  if (!isDeletable(root, full)) { return `refused: ${entry.rel} is outside the registry guard`; }
  try {
    fs.rmSync(full, { recursive: true, force: true, maxRetries: 3 });
    return null;
  }
  catch (error) { return (error as Error).message; }
}
