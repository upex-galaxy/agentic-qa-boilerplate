/**
 * Regression tests for `scripts/launch.ts`, the launcher behind
 * `bun run claude|codex|opencode` and the `test*` scripts. What they guard:
 *   1. A different inherited value refuses the launch: nothing is spawned and
 *      the message names the variable with lengths only, never a value. With
 *      `--warn` (the test scripts) the same notice prints and the run goes on.
 *   2. Equal values, no `.env` at all, and a failed varlock load all proceed to
 *      `varlock run -- <bin> [args...]` with the arguments untouched.
 *   3. A missing varlock and a missing binary name stop with a clear exit code.
 */

import type { LaunchDeps } from './launch.ts';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { launch } from './launch.ts';

const STALE = 'stale-secret-canary';
const FRESH = 'fresh-secret-canary-longer';

let root: string;
let printed: string[];
let spawned: Array<[string, string[]]>;

function deps(overrides: Partial<LaunchDeps> = {}): LaunchDeps {
  return {
    root,
    env: { TOKEN: STALE },
    meta: () => ({ overrideKeys: ['TOKEN'], sensitive: new Set(['TOKEN']), declared: new Set(['TOKEN']) }),
    varlock: () => '/repo/node_modules/.bin/varlock',
    spawn: (cmd, args) => { spawned.push([cmd, args]); return 0; },
    err: (line) => { printed.push(line); },
    ...overrides,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'launch-'));
  printed = [];
  spawned = [];
  writeFileSync(join(root, '.env'), `TOKEN=${FRESH}\n`);
});

afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('preflight', () => {
  test('refuses a different inherited value and spawns nothing', () => {
    expect(launch(['claude'], deps())).toBe(1);
    expect(spawned).toEqual([]);
    const all = printed.join('\n');
    expect(all).toContain(`TOKEN: process=${STALE.length} chars, file=${FRESH.length} chars (sensitive)`);
    expect(all).toContain('unset TOKEN');
    expect(all).not.toContain(STALE);
    expect(all).not.toContain(FRESH);
  });

  test('--warn prints the same names and lengths, then runs the binary', () => {
    expect(launch(['--warn', 'playwright', 'test'], deps())).toBe(0);
    expect(spawned).toEqual([['/repo/node_modules/.bin/varlock', ['run', '--', 'playwright', 'test']]]);
    const all = printed.join('\n');
    expect(all).toContain('WARNING');
    expect(all).toContain(`TOKEN: process=${STALE.length} chars, file=${FRESH.length} chars (sensitive)`);
    expect(all).not.toContain(STALE);
    expect(all).not.toContain(FRESH);
  });

  test('passes an equal inherited value', () => {
    expect(launch(['claude'], deps({ env: { TOKEN: FRESH } }))).toBe(0);
    expect(spawned).toHaveLength(1);
  });

  test('skips the comparison when the checkout has no .env / .env.local', () => {
    rmSync(join(root, '.env'));
    expect(launch(['playwright', 'test'], deps())).toBe(0);
    expect(spawned).toHaveLength(1);
  });

  test('defers to varlock run when the load fails', () => {
    expect(launch(['claude'], deps({ meta: () => null }))).toBe(0);
    expect(spawned).toHaveLength(1);
  });
});

describe('spawn', () => {
  test('runs the binary through varlock run with its arguments untouched', () => {
    launch(['playwright', 'test', '--project=e2e', '--grep', '@smoke and @auth'], deps({ env: {} }));
    expect(spawned).toEqual([['/repo/node_modules/.bin/varlock', ['run', '--', 'playwright', 'test', '--project=e2e', '--grep', '@smoke and @auth']]]);
  });

  test('returns the child exit code', () => {
    expect(launch(['claude'], deps({ env: {}, spawn: () => 3 }))).toBe(3);
  });

  test('stops when varlock is not installed or no binary is named', () => {
    expect(launch(['claude'], deps({ varlock: () => null }))).toBe(1);
    expect(printed.join('\n')).toContain('bun install');
    expect(launch([], deps())).toBe(2);
    expect(spawned).toEqual([]);
  });
});
