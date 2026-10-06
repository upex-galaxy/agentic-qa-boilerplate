/**
 * Regression tests for `scripts/launch.ts`, the launcher behind the `test*`
 * scripts. What they guard:
 *   1. The `test*` and `allure:*` scripts still load `.env`: every
 *      `package.json` script that runs the Playwright suite goes through this
 *      launcher, which starts the binary under `varlock run`.
 *   2. An AI harness (`claude`, `codex`, `opencode`, by name or path) is never
 *      started, and no `package.json` script launches one (ADR-0014).
 *   3. A different inherited value prints a notice naming the variable with
 *      lengths only, never a value, and the run goes on, `--warn` or not.
 *   4. Equal values, no `.env` at all, and a failed varlock load all proceed to
 *      `varlock run -- <bin> [args...]` with the arguments untouched.
 *   5. A missing varlock and a missing binary name stop with a clear exit code.
 *   6. With a secret-manager overlay, an EMPTY inherited copy of a key it
 *      resolves is dropped before varlock sees it (CI's unset secrets); every
 *      other variable reaches the child untouched.
 */

import type { LaunchDeps } from './launch.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { HARNESS_BINARIES, launch } from './launch.ts';

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

describe('package.json', () => {
  const scripts = (JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts;

  test('every test and Allure run script loads .env through this launcher', () => {
    const testScripts = Object.entries(scripts).filter(([name, cmd]) => /^(?:test|allure)(?::|$)/.test(name) && /playwright test|validateTestEnv|jiraSync/.test(cmd));
    expect(testScripts.map(([name]) => name)).toContain('allure:run');
    for (const [, cmd] of testScripts) {
      expect(cmd).toStartWith('bun --no-env-file scripts/launch.ts ');
    }
  });

  test('no script starts an AI harness', () => {
    for (const name of HARNESS_BINARIES) { expect(scripts[name]).toBeUndefined(); }
    for (const cmd of Object.values(scripts)) {
      for (const bin of HARNESS_BINARIES) {
        expect(cmd).not.toMatch(new RegExp(`launch\\.ts (--warn )?${bin}\\b`));
      }
    }
  });
});

describe('harness binaries', () => {
  test('refuses claude, codex and opencode, by name or by path, and spawns nothing', () => {
    for (const bin of [...HARNESS_BINARIES, '/usr/local/bin/claude']) {
      expect(launch([bin], deps({ env: {} }))).toBe(2);
      expect(launch(['--warn', bin, '--version'], deps({ env: {} }))).toBe(2);
    }
    expect(spawned).toEqual([]);
    expect(printed.join('\n')).toContain('Open it directly');
  });
});

describe('drift notice', () => {
  test('a different inherited value prints names and lengths, then runs the binary', () => {
    for (const argv of [['--warn', 'playwright', 'test'], ['playwright', 'test']]) {
      printed = [];
      spawned = [];
      expect(launch(argv, deps())).toBe(0);
      expect(spawned).toEqual([['/repo/node_modules/.bin/varlock', ['run', '--', 'playwright', 'test']]]);
      const all = printed.join('\n');
      expect(all).toContain('WARNING');
      expect(all).toContain(`TOKEN: process=${STALE.length} chars, file=${FRESH.length} chars (sensitive)`);
      expect(all).toContain('unset TOKEN');
      expect(all).not.toContain(STALE);
      expect(all).not.toContain(FRESH);
    }
  });

  test('passes an equal inherited value in silence', () => {
    expect(launch(['playwright', 'test'], deps({ env: { TOKEN: FRESH } }))).toBe(0);
    expect(spawned).toHaveLength(1);
    expect(printed).toEqual([]);
  });

  test('skips the comparison when the checkout has no .env / .env.local', () => {
    rmSync(join(root, '.env'));
    expect(launch(['playwright', 'test'], deps())).toBe(0);
    expect(spawned).toHaveLength(1);
  });

  test('defers to varlock run when the load fails', () => {
    expect(launch(['playwright', 'test'], deps({ meta: () => null }))).toBe(0);
    expect(spawned).toHaveLength(1);
  });
});

describe('spawn', () => {
  test('runs the binary through varlock run with its arguments untouched', () => {
    launch(['playwright', 'test', '--project=e2e', '--grep', '@smoke and @auth'], deps({ env: {} }));
    expect(spawned).toEqual([['/repo/node_modules/.bin/varlock', ['run', '--', 'playwright', 'test', '--project=e2e', '--grep', '@smoke and @auth']]]);
  });

  test('returns the child exit code', () => {
    expect(launch(['playwright', 'test'], deps({ env: {}, spawn: () => 3 }))).toBe(3);
  });

  test('stops when varlock is not installed or no binary is named', () => {
    expect(launch(['playwright', 'test'], deps({ varlock: () => null }))).toBe(1);
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
    launch(['--warn', 'playwright', 'test'], deps({ env: { XRAY_CLIENT_SECRET: 'ci-value' } }));
    expect(spawnedEnv[0]).toEqual({ XRAY_CLIENT_SECRET: 'ci-value' });
    rmSync(join(root, '.env.provider.schema'));
    launch(['--warn', 'playwright', 'test'], deps({ env: { XRAY_CLIENT_SECRET: '' } }));
    expect(spawnedEnv[1]).toEqual({ XRAY_CLIENT_SECRET: '' });
  });
});
