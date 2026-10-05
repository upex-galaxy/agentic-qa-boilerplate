/**
 * Regression tests for `scripts/launch.ts`, the launcher behind
 * `bun run claude|codex|opencode` and the `test*` scripts. What they guard:
 *   1. A different inherited value refuses the launch: nothing is spawned and
 *      the message names the variable with lengths only, never a value. With
 *      `--warn` (the test scripts) the same notice prints and the run goes on.
 *   2. Equal values, no `.env` at all, and a failed varlock load all proceed to
 *      `varlock run -- <bin> [args...]` with the arguments untouched.
 *   3. A missing varlock and a missing binary name stop with a clear exit code.
 *   4. With a secret-manager overlay, an EMPTY inherited copy of a key it
 *      resolves is dropped before varlock sees it (CI's unset secrets); every
 *      other variable reaches the child untouched.
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
let spawnedEnv: Array<Record<string, string | undefined>>;

function deps(overrides: Partial<LaunchDeps> = {}): LaunchDeps {
  return {
    root,
    env: { TOKEN: STALE },
    meta: () => ({ overrideKeys: ['TOKEN'], sensitive: new Set(['TOKEN']), declared: new Set(['TOKEN']) }),
    varlock: () => '/repo/node_modules/.bin/varlock',
    spawn: (cmd, args, env) => { spawned.push([cmd, args]); spawnedEnv.push(env); return 0; },
    err: (line) => { printed.push(line); },
    ...overrides,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'launch-'));
  printed = [];
  spawned = [];
  spawnedEnv = [];
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

describe('secret-manager overlay', () => {
  const overlay = [
    '# @plugin(@varlock/1password-plugin@2.0.4)',
    '# ---',
    'OP_SERVICE_ACCOUNT_TOKEN=',
    'XRAY_CLIENT_SECRET=op(op://team-dev/XRAY_CLIENT_SECRET/password)',
    '# STAGING_USER_PASSWORD=op(op://team-dev/STAGING_USER_PASSWORD/password)',
    '',
  ].join('\n');

  test('drops the empty inherited copies of the keys the overlay resolves', () => {
    rmSync(join(root, '.env'));
    writeFileSync(join(root, '.env.provider.schema'), overlay);
    const env = { XRAY_CLIENT_SECRET: '', OP_SERVICE_ACCOUNT_TOKEN: '', STAGING_USER_PASSWORD: '', CI: 'true' };
    expect(launch(['--warn', 'playwright', 'test'], deps({ env }))).toBe(0);
    expect(spawnedEnv[0]).toEqual({ STAGING_USER_PASSWORD: '', CI: 'true' });
  });

  test('keeps a non-empty inherited value, and changes nothing without an overlay', () => {
    rmSync(join(root, '.env'));
    writeFileSync(join(root, '.env.provider.schema'), overlay);
    launch(['claude'], deps({ env: { XRAY_CLIENT_SECRET: 'ci-value' } }));
    expect(spawnedEnv[0]).toEqual({ XRAY_CLIENT_SECRET: 'ci-value' });
    rmSync(join(root, '.env.provider.schema'));
    launch(['claude'], deps({ env: { XRAY_CLIENT_SECRET: '' } }));
    expect(spawnedEnv[1]).toEqual({ XRAY_CLIENT_SECRET: '' });
  });
});
