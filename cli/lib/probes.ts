/**
 * @fileoverview Probes shared by the preflight (`cli/preflight.ts`) and, later,
 * `setup:doctor` (installer-ui `preflight.md` §1).
 *
 * Built-ins only: the preflight must run on a fresh clone with no
 * `node_modules`, so this file and everything it imports are `node:*` modules
 * (proven by `cli/lib/ui/imports.test.ts`). Every probe has a timeout and never
 * throws: a failure is a value the checklist turns into a row.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

export interface CmdResult {
  ok: boolean
  /** The binary is not on PATH. */
  missing: boolean
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Runs a command with a timeout; never throws. */
export function runCmd(cmd: string, args: string[], opts: { timeoutMs?: number, cwd?: string } = {}): CmdResult {
  const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: 'utf8', timeout: opts.timeoutMs ?? 3000, stdio: ['ignore', 'pipe', 'pipe'] });
  const err = r.error as NodeJS.ErrnoException | undefined;
  return {
    ok: !err && r.status === 0,
    missing: err?.code === 'ENOENT',
    stdout: (r.stdout ?? '').toString().trim(),
    stderr: (r.stderr ?? '').toString().trim(),
    timedOut: err?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM',
  };
}

/** `[major, minor, patch]` out of any version-looking string, or null. */
export function parseVersion(s: string): [number, number, number] | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

export function versionAtLeast(v: [number, number, number] | null, min: [number, number, number]): boolean {
  if (!v) { return false; }
  for (let i = 0; i < 3; i++) {
    if (v[i] !== min[i]) { return v[i] > min[i]; }
  }
  return true;
}

/** HEAD request with a timeout. Any HTTP answer counts as reachable; only a network failure does not. */
export async function reachable(url: string, timeoutMs = 3000): Promise<{ ok: boolean, ms: number }> {
  const t0 = Date.now();
  try {
    await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    return { ok: true, ms: Date.now() - t0 };
  }
  catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

/** Free bytes on the filesystem holding `path`, or null when it cannot be read. */
export function freeBytes(path: string): number | null {
  try {
    const s = statfsSync(path);
    return Number(s.bavail) * Number(s.bsize);
  }
  catch {
    return null;
  }
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) { return `${(n / 1024 ** 3).toFixed(1)} GB`; }
  return `${Math.round(n / 1024 ** 2)} MB`;
}

export interface WorktreeInfo {
  linked: boolean
  primaryRoot: string | null
}

/** Whether `cwd` is a linked git worktree, and where its primary checkout is. Null outside a git repo. */
export function worktreeInfo(cwd: string): WorktreeInfo | null {
  const r = runCmd('git', ['rev-parse', '--git-dir', '--git-common-dir'], { cwd, timeoutMs: 2000 });
  if (!r.ok) { return null; }
  const [gitDir, commonDir] = r.stdout.split('\n').map(l => resolve(cwd, l.trim()));
  if (!gitDir || !commonDir) { return null; }
  const linked = gitDir !== commonDir;
  // The common dir of a normal checkout is `<root>/.git`.
  const primaryRoot = commonDir.endsWith('/.git') || commonDir.endsWith('\\.git') ? resolve(commonDir, '..') : null;
  return { linked, primaryRoot };
}

/** A local template source (absolute path or file:// URL) is cloned with plain git, with no gh session. */
export function isLocalSource(templateRepo: string): boolean {
  return templateRepo.startsWith('file://') || isAbsolute(templateRepo);
}

export type JsonRead = { state: 'missing' } | { state: 'corrupt', error: string } | { state: 'ok', value: unknown };

export function readJson(path: string): JsonRead {
  if (!existsSync(path)) { return { state: 'missing' }; }
  try {
    return { state: 'ok', value: JSON.parse(readFileSync(path, 'utf8')) };
  }
  catch (e) {
    return { state: 'corrupt', error: e instanceof Error ? e.message : String(e) };
  }
}
