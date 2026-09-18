/**
 * Regression tests for the `bun run api:login` CLI after the three-file split:
 *   scripts/api-login.ts          thin entry (synced)
 *   scripts/lib/api-login-core.ts generic CLI (synced)
 *   scripts/api-login.project.ts  auth adapter (project-owned)
 *
 * What they guard:
 *   1. The positional-environment footgun: a flag VALUE must never be read as
 *      the environment (`api:login --profile W1` used to die with
 *      `Unknown environment: "W1"`). Same for `--role` and any project flag
 *      declared in `extraFlags` (e.g. `--method`).
 *   2. The default token paths are unchanged (`.auth/tokens.env`,
 *      `.auth/tokens.json`, `.auth/api-state.json`) and `--profile <name>`
 *      isolates the agentic pair under `.auth/profiles/<name>/` without
 *      touching the default one.
 *   3. The adapter seam: loginEndpoint / headers / payload / token extraction
 *      / extraFlags all come from the project adapter.
 *   4. `--help` is accurate and the real entry point resolves both halves.
 *
 * No network: the auth request is a stubbed `fetchImpl`. No writes outside a
 * temp dir: `authDir` + `apiStatePath` are redirected per test.
 */

import type { ApiLoginAdapter } from './lib/api-login-core';

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import * as projectAdapter from './api-login.project';
import { parseApiLoginArgs, renderHelp, runApiLogin, upsertTokenEnvLine, upsertTokenMeta } from './lib/api-login-core';

// Credentials must exist BEFORE config/variables.ts is evaluated (it reads
// process.env at module-evaluation time), and which environment is active
// depends on the developer's own TEST_ENV — so both sets get a fallback and
// every expectation below is derived from the resolved config instead of
// assuming one environment. TEST_ENV itself is never mutated here: the module
// is cached after the first import, so all in-process runs share it.
process.env.LOCAL_USER_EMAIL ||= 'qa-local@example.com';
process.env.LOCAL_USER_PASSWORD ||= 'qa-local-password';
process.env.STAGING_USER_EMAIL ||= 'qa-staging@example.com';
process.env.STAGING_USER_PASSWORD ||= 'qa-staging-password';

const { config, env } = await import('@variables');
const ENV_UPPER = env.current.toUpperCase();
const ENTRY = resolve(import.meta.dir, 'api-login.ts');
const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), 'api-login-'));
  temporaryRoots.push(root);
  return root;
}

interface FetchCall { url: string, body: Record<string, unknown> | null, headers: Record<string, string> }

function stubFetch(calls: FetchCall[], status = 200, payload: Record<string, unknown> = {
  access_token: 'tok-123',
  token_type: 'Bearer',
  expires_in: 3600,
}): typeof fetch {
  return (async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(payload), { status });
  }) as unknown as typeof fetch;
}

describe('parseApiLoginArgs', () => {
  test('a flag value is never read as the environment (the pre-split footgun)', () => {
    const parsed = parseApiLoginArgs(['--profile', 'W1']);
    expect(parsed.error).toBeNull();
    expect(parsed.profile).toBe('W1');
    expect(parsed.environment).toBeNull();
    expect(parsed.role).toBe('user');
  });

  test('flags and the environment compose in any order, with or without =', () => {
    for (const argv of [
      ['staging', '--role', 'admin', '--profile', 'W1'],
      ['--role', 'admin', '--profile', 'W1', 'staging'],
      ['--profile=W1', '--role=admin', 'staging'],
      ['--profile', 'W1', 'staging', '-r', 'admin'],
    ]) {
      const parsed = parseApiLoginArgs(argv);
      expect(parsed.error).toBeNull();
      expect(parsed.environment).toBe('staging');
      expect(parsed.role).toBe('admin');
      expect(parsed.profile).toBe('W1');
    }
  });

  test('a project flag declared in extraFlags keeps its value out of the positional scan', () => {
    const parsed = parseApiLoginArgs(['--method', 'pat', 'staging'], { extraFlags: ['--method'] });
    expect(parsed.error).toBeNull();
    expect(parsed.environment).toBe('staging');
    expect(parsed.flags['--method']).toBe('pat');
  });

  test('an undeclared flag is an error, not an environment guess', () => {
    const parsed = parseApiLoginArgs(['--method', 'pat']);
    expect(parsed.error).toContain('Unknown option: "--method"');
    expect(parsed.environment).toBeNull();
  });

  test('role is lowercased, --help wins, and the adapter owns the environment list', () => {
    expect(parseApiLoginArgs(['--role', 'ADMIN']).role).toBe('admin');
    expect(parseApiLoginArgs(['--help']).help).toBe(true);
    expect(parseApiLoginArgs(['-h', 'nonsense']).help).toBe(true);
    expect(parseApiLoginArgs(['qa']).error).toContain('Unknown environment: "qa"');
    expect(parseApiLoginArgs(['qa'], { environments: ['local', 'qa'] }).error).toBeNull();
  });

  test('invalid values are rejected instead of silently used', () => {
    expect(parseApiLoginArgs(['--profile']).error).toContain('--profile requires a value');
    expect(parseApiLoginArgs(['--role', '--profile', 'W1']).error).toContain('--role requires a value');
    expect(parseApiLoginArgs(['--profile', '../escape']).error).toContain('single path segment');
    expect(parseApiLoginArgs(['local', 'staging']).error).toContain('Unexpected argument');
  });
});

describe('token storage helpers', () => {
  test('a tokens.env line is upserted and siblings are preserved', () => {
    const first = upsertTokenEnvLine('', 'API_TOKEN_USER_LOCAL', 'a');
    expect(first).toBe('export API_TOKEN_USER_LOCAL=\'a\'\n');
    const second = upsertTokenEnvLine(first, 'API_TOKEN_ADMIN_LOCAL', 'b');
    expect(second.split('\n').filter(Boolean)).toHaveLength(2);
    const replaced = upsertTokenEnvLine(second, 'API_TOKEN_USER_LOCAL', 'c');
    expect(replaced).toContain('export API_TOKEN_USER_LOCAL=\'c\'');
    expect(replaced).toContain('export API_TOKEN_ADMIN_LOCAL=\'b\'');
    expect(replaced.split('\n').filter(Boolean)).toHaveLength(2);
  });

  test('a single quote inside a token cannot break out of the shell quoting', () => {
    expect(upsertTokenEnvLine('', 'V', 'a\'b')).toBe('export V=\'a\'\\\'\'b\'\n');
  });

  test('tokens.json keeps other keys and survives a corrupt file', () => {
    const one = upsertTokenMeta('', 'USER_LOCAL', { token: 'a' });
    const two = upsertTokenMeta(one, 'ADMIN_LOCAL', { token: 'b' });
    expect(Object.keys(JSON.parse(two) as object)).toEqual(['USER_LOCAL', 'ADMIN_LOCAL']);
    expect(Object.keys(JSON.parse(upsertTokenMeta('{not json', 'USER_LOCAL', { token: 'a' })) as object)).toEqual(['USER_LOCAL']);
  });
});

describe('runApiLogin', () => {
  async function run(argv: string[], root: string, calls: FetchCall[], overrides: Partial<ApiLoginAdapter> = {}, status = 200, payload?: Record<string, unknown>) {
    return runApiLogin({ ...projectAdapter, ...overrides }, {
      argv,
      authDir: root,
      apiStatePath: join(root, 'api-state.json'),
      fetchImpl: stubFetch(calls, status, payload),
      log: () => {},
    });
  }

  test('the default path writes the three files with the role+env token var', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    expect(await run([], root, calls)).toBe(0);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${config.apiUrl}${config.auth.loginEndpoint}`);
    expect(calls[0]?.body).toEqual({ email: config.testUser.email, password: config.testUser.password });

    expect(readFileSync(join(root, 'tokens.env'), 'utf-8')).toBe(`export API_TOKEN_USER_${ENV_UPPER}='tok-123'\n`);
    const meta = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf-8')) as Record<string, { var: string, profile: string | null, expiresIn: number }>;
    expect(meta[`USER_${ENV_UPPER}`]).toMatchObject({ var: `API_TOKEN_USER_${ENV_UPPER}`, profile: null, expiresIn: 3600 });
    expect(JSON.parse(readFileSync(join(root, 'api-state.json'), 'utf-8')) as { token: string, source: string }).toMatchObject({ token: 'tok-123', source: 'api-login' });
  });

  test('--profile before the environment isolates the pair and leaves the default untouched', async () => {
    const root = scratch();
    expect(await run([], root, [])).toBe(0);
    expect(await run(['--profile', 'W1'], root, [], {}, 200, { access_token: 'tok-w1', token_type: 'Bearer', expires_in: 60 })).toBe(0);

    expect(readFileSync(join(root, 'profiles', 'W1', 'tokens.env'), 'utf-8')).toContain('\'tok-w1\'');
    expect(readFileSync(join(root, 'tokens.env'), 'utf-8')).toContain('\'tok-123\'');
    const meta = JSON.parse(readFileSync(join(root, 'profiles', 'W1', 'tokens.json'), 'utf-8')) as Record<string, { profile: string | null }>;
    expect(meta[`USER_${ENV_UPPER}`]?.profile).toBe('W1');
  });

  test('--role names the token var and coexists with a profile', async () => {
    const root = scratch();
    expect(await run(['--role', 'admin', '--profile', 'W2'], root, [])).toBe(0);
    expect(readFileSync(join(root, 'profiles', 'W2', 'tokens.env'), 'utf-8')).toContain(`export API_TOKEN_ADMIN_${ENV_UPPER}=`);
  });

  test('the adapter owns the endpoint, the headers, the payload and the token shape', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    const code = await run(['--method', 'pat'], root, calls, {
      loginEndpoint: '/oauth/token',
      headers: { 'X-Client': 'qa' },
      extraFlags: ['--method'],
      buildAuthPayload: (email, password, ctx) => ({ username: email, secret: password, grant: ctx.flags['--method'] }),
      extractTokenFromResponse: body => ({
        accessToken: String(body.jwt ?? ''),
        tokenType: 'Token',
        expiresIn: 42,
        refreshToken: null,
      }),
    }, 200, { jwt: 'from-adapter' });

    expect(code).toBe(0);
    expect(calls[0]?.url).toBe(`${config.apiUrl}/oauth/token`);
    expect(calls[0]?.headers['X-Client']).toBe('qa');
    expect(calls[0]?.body).toMatchObject({ username: config.testUser.email, grant: 'pat' });
    expect(readFileSync(join(root, 'tokens.env'), 'utf-8')).toContain('\'from-adapter\'');
    expect((JSON.parse(readFileSync(join(root, 'api-state.json'), 'utf-8')) as { tokenType: string }).tokenType).toBe('Token');
  });

  test('a rejected login exits 1 and writes nothing', async () => {
    const root = scratch();
    expect(await run([], root, [], {}, 401, { message: 'bad credentials' })).toBe(1);
    expect(existsSync(join(root, 'tokens.env'))).toBe(false);
    expect(existsSync(join(root, 'api-state.json'))).toBe(false);
  });

  test('a bad command line exits 1 before any network call', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    expect(await run(['--bogus'], root, calls)).toBe(1);
    expect(calls).toHaveLength(0);
  });

  test('--help returns 0, names both halves and never calls the API', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    const lines: string[] = [];
    const code = await runApiLogin(projectAdapter, { argv: ['--help'], authDir: root, fetchImpl: stubFetch(calls), log: l => lines.push(l) });
    expect(code).toBe(0);
    expect(calls).toHaveLength(0);
    const help = lines.join('\n');
    expect(help).toContain('--profile <name>');
    expect(help).toContain('scripts/api-login.project.ts');
    expect(help).toContain('scripts/lib/api-login-core.ts');
    expect(help).toContain('local, staging');
  });
});

describe('help text and entry point', () => {
  test('renderHelp follows the adapter environments and lists project flags', () => {
    const help = renderHelp({ environments: ['local', 'qa'], extraFlags: ['--method'] });
    expect(help).toContain('local, qa');
    expect(help).toContain('QA_USER_EMAIL, QA_USER_PASSWORD');
    expect(help).toContain('--method');
  });

  test('the real entry point resolves core + adapter and prints the help', () => {
    const p = Bun.spawnSync(['bun', ENTRY, '--help'], { stdout: 'pipe', stderr: 'pipe' });
    const stdout = p.stdout.toString();
    expect(p.exitCode).toBe(0);
    expect(stdout).toContain('API Login');
    expect(stdout).toContain('--profile <name>');
    expect(stdout).not.toContain('Unknown environment');
  });
});
