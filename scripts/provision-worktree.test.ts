/**
 * Regression tests for `scripts/provision-worktree.ts`, run against a real
 * temp git repo + a real `git worktree add`. What they guard:
 *   1. The refusal to run on the PRIMARY checkout (the whole point of the
 *      script is to provision a FRESH worktree, never the checkout it was
 *      launched from).
 *   2. That gitignored session state (.env, .auth/, a T3 skill dir) actually
 *      lands in the worktree.
 *   3. That .session/ is deliberately never copied, even when present in the
 *      primary checkout — a worker reaches it by an absolute path instead.
 *   4. --dry-run reports intent without writing anything.
 *
 * The fixture's package.json declares a trivial `agents:compat` script (`bun
 * -e "process.exit(0)"`) so the test never depends on this repo's real
 * `cli/lib/agent-compatibility.ts` — only the CONTRACT ("the script runs
 * `bun run agents:compat` inside the target and aborts on failure") is under
 * test here, not that script's own behaviour.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const SCRIPT = resolve(import.meta.dir, 'provision-worktree.ts');
const IS_WINDOWS = platform() === 'win32';

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function git(cwd: string, ...cmd: string[]): void {
  const p = Bun.spawnSync(['git', '-C', cwd, ...cmd], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) {
    throw new Error(`git ${cmd.join(' ')} failed:\n${p.stderr.toString()}`);
  }
}

/**
 * A temp primary checkout with: a trivial package.json + committed lockfile
 * (so `bun install --frozen-lockfile` succeeds against it), a gitignored
 * `.env` / `.auth/tokens.env` / `.session/probe.md` / one T3 skill dir under
 * `.agents/skills/`, and one worktree branched off it.
 */
function fixture(): { primary: string, worktree: string } {
  const root = mkdtempSync(join(tmpdir(), 'provision-worktree-'));
  temporaryRoots.push(root);
  const primary = join(root, 'primary');
  mkdirSync(primary, { recursive: true });

  git(primary, 'init', '-q', '-b', 'main');
  git(primary, 'config', 'user.email', 'test@example.com');
  git(primary, 'config', 'user.name', 'Test');

  writeFileSync(join(primary, 'package.json'), `${JSON.stringify({
    name: 'fixture',
    private: true,
    scripts: { 'agents:compat': 'bun -e "process.exit(0)"' },
  }, null, 2)}\n`);
  writeFileSync(join(primary, '.gitignore'), [
    'node_modules/',
    '.env',
    '.auth/',
    '.session/',
    '.agents/skills/community-skill/',
    '',
  ].join('\n'));
  git(primary, 'add', 'package.json', '.gitignore');
  git(primary, 'commit', '-q', '-m', 'init');

  // Real lockfile, so the script's `bun install --frozen-lockfile` succeeds later.
  const install = Bun.spawnSync(['bun', 'install'], { cwd: primary, stdout: 'pipe', stderr: 'pipe' });
  if (install.exitCode !== 0) {
    throw new Error(`bun install (fixture setup) failed:\n${install.stderr.toString()}`);
  }
  git(primary, 'add', '-A');
  git(primary, 'commit', '-q', '-m', 'lockfile', '--allow-empty');

  // Gitignored state present in the primary, never committed.
  writeFileSync(join(primary, '.env'), 'LOCAL_USER_EMAIL=test@example.com\n');
  mkdirSync(join(primary, '.auth'), { recursive: true });
  writeFileSync(join(primary, '.auth', 'tokens.env'), 'export API_TOKEN_USER_LOCAL=\'x\'\n');
  mkdirSync(join(primary, '.session'), { recursive: true });
  writeFileSync(join(primary, '.session', 'probe.md'), 'must never be copied\n');
  mkdirSync(join(primary, '.agents', 'skills', 'community-skill'), { recursive: true });
  writeFileSync(join(primary, '.agents', 'skills', 'community-skill', 'SKILL.md'), '# stub\n');

  const worktree = join(root, 'wt');
  git(primary, 'worktree', 'add', '-b', 'wt-branch', worktree, 'main');

  return { primary, worktree };
}

function run(cwdArgs: string[]): { code: number, out: string } {
  const p = Bun.spawnSync({ cmd: ['bun', SCRIPT, ...cwdArgs], stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

describe('provision-worktree', () => {
  test('refuses to run on the primary checkout', () => {
    const { primary } = fixture();
    const result = run([primary, '--dry-run']);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('Refusing to provision the PRIMARY checkout');
  });

  test('refuses when the target path IS the primary, even without --dry-run', () => {
    const { primary } = fixture();
    const result = run([primary]);
    expect(result.code).not.toBe(0);
    expect(result.out).toContain('Refusing to provision the PRIMARY checkout');
  });

  test('copies gitignored session state into a fresh worktree and never copies .session/', () => {
    const { worktree } = fixture();
    const result = run([worktree]);
    expect(result.code).toBe(0);

    expect(existsSync(join(worktree, '.env'))).toBe(true);
    expect(readFileSync(join(worktree, '.env'), 'utf8')).toContain('LOCAL_USER_EMAIL');

    expect(existsSync(join(worktree, '.auth', 'tokens.env'))).toBe(true);
    expect(readFileSync(join(worktree, '.auth', 'tokens.env'), 'utf8')).toContain('API_TOKEN_USER_LOCAL');

    expect(existsSync(join(worktree, '.agents', 'skills', 'community-skill', 'SKILL.md'))).toBe(true);

    // .session/ exists in the primary but must NEVER be copied.
    expect(existsSync(join(worktree, '.session'))).toBe(false);
  });

  test('copied secrets are mode 0600 (files) / 0700 (dirs) on POSIX', () => {
    if (IS_WINDOWS) { return; } // chmod is a no-op by design on win32 — nothing to assert.
    const { worktree } = fixture();
    const result = run([worktree]);
    expect(result.code).toBe(0);

    const envMode = statSync(join(worktree, '.env')).mode & 0o777;
    expect(envMode).toBe(0o600);
    const authDirMode = statSync(join(worktree, '.auth')).mode & 0o777;
    expect(authDirMode).toBe(0o700);
    const tokenMode = statSync(join(worktree, '.auth', 'tokens.env')).mode & 0o777;
    expect(tokenMode).toBe(0o600);
  });

  test('--dry-run reports intent without writing anything', () => {
    const { worktree } = fixture();
    const result = run([worktree, '--dry-run']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Would copy .env');
    expect(result.out).toContain('Would copy .auth/');
    expect(existsSync(join(worktree, '.env'))).toBe(false);
    expect(existsSync(join(worktree, '.auth'))).toBe(false);
  });
});
