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
 *   5. The `authenticate` escape hatch: an adapter that exports it makes ZERO
 *      calls to the core's own POST path, and the core keeps owning everything
 *      around it (the empty-token check, the three files, the exit code).
 *   6. The next-step hint is usable in the shell the operator is actually in.
 *
 * No network: the auth request is a stubbed `fetchImpl`. No writes outside a
 * temp dir: `authDir` + `apiStatePath` are redirected per test.
 */

import type { ApiLoginAdapter, ApiLoginContext } from './lib/api-login-core';

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import * as projectAdapter from './api-login.project';
import { parseApiLoginArgs, renderHelp, renderTokenUsage, runApiLogin, upsertTokenEnvLine, upsertTokenMeta } from './lib/api-login-core';

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

describe('the authenticate escape hatch', () => {
  /** Counts every hook the core would have driven itself, so a skip is measurable. */
  function spyAdapter(overrides: Partial<ApiLoginAdapter> = {}) {
    const seen = { payload: 0, extract: 0 };
    const adapter: Partial<ApiLoginAdapter> = {
      buildAuthPayload: (email, password, context) => {
        seen.payload++;
        return projectAdapter.buildAuthPayload(email, password, context);
      },
      extractTokenFromResponse: (body, context) => {
        seen.extract++;
        return projectAdapter.extractTokenFromResponse(body, context);
      },
      ...overrides,
    };
    return { adapter, seen };
  }

  async function runWith(argv: string[], root: string, calls: FetchCall[], adapter: Partial<ApiLoginAdapter>) {
    return runApiLogin({ ...projectAdapter, ...adapter } as ApiLoginAdapter, {
      argv,
      authDir: root,
      apiStatePath: join(root, 'api-state.json'),
      fetchImpl: stubFetch(calls),
      log: () => {},
    });
  }

  test('an adapter exporting authenticate causes ZERO calls to the core POST path', async () => {
    // The condition the decision was approved on. Without this count the hook
    // would inherit the defect fixed in 6672c80: a gate that passes whether or
    // not the wiring exists. Stub the one fetch seam and count.
    const root = scratch();
    const calls: FetchCall[] = [];
    const { adapter, seen } = spyAdapter({
      authenticate: async () => ({ accessToken: 'tok-hatch', tokenType: 'Hatch', expiresIn: 99, refreshToken: 'r-1' }),
    });

    expect(await runWith([], root, calls, adapter)).toBe(0);

    // Zero requests, and neither hook the core would have driven itself ran.
    expect(calls).toHaveLength(0);
    expect(seen.payload).toBe(0);
    expect(seen.extract).toBe(0);

    // Everything AROUND the request is still the core's: all three files.
    expect(readFileSync(join(root, 'tokens.env'), 'utf-8')).toBe(`export API_TOKEN_USER_${ENV_UPPER}='tok-hatch'\n`);
    const meta = JSON.parse(readFileSync(join(root, 'tokens.json'), 'utf-8')) as Record<string, { var: string, expiresIn: number }>;
    expect(meta[`USER_${ENV_UPPER}`]).toMatchObject({ var: `API_TOKEN_USER_${ENV_UPPER}`, expiresIn: 99 });
    expect(JSON.parse(readFileSync(join(root, 'api-state.json'), 'utf-8')) as { tokenType: string, refreshToken: string }).toMatchObject({ tokenType: 'Hatch', refreshToken: 'r-1' });
  });

  test('authenticate receives the credentials, the parsed context and the core own fetch seam', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    // One capture object: assignments happen inside a callback, which TS does
    // not narrow through, so separate `let x = null` would each collapse to `never`.
    const captured: { credentials?: { email: string, password: string }, context?: ApiLoginContext, apiUrl?: string } = {};

    const { adapter } = spyAdapter({
      extraFlags: ['--method'],
      authenticate: async (creds, ctx, seam) => {
        captured.credentials = creds;
        captured.context = ctx;
        captured.apiUrl = seam.apiUrl;
        // The adapter drives its OWN requests through the seam the core lent it,
        // which is exactly the stub this test installed.
        await seam.fetch(`${seam.apiUrl}/magic-link`, { method: 'POST', body: JSON.stringify({ step: 1 }) });
        seam.log('minted out of band', 'success');
        return { accessToken: 'tok-two-step', tokenType: 'Bearer', expiresIn: 60, refreshToken: null };
      },
    });

    expect(await runWith(['--role', 'admin', '--profile', 'W4', '--method', 'magic'], root, calls, adapter)).toBe(0);

    expect(captured.credentials).toEqual({ email: config.testUser.email, password: config.testUser.password });
    expect(captured.context).toMatchObject({ role: 'admin', profile: 'W4', flags: { '--method': 'magic' } });
    expect(captured.apiUrl).toBe(config.apiUrl);

    // The only request made is the adapter's own, on its own path.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${config.apiUrl}/magic-link`);
    expect(readFileSync(join(root, 'profiles', 'W4', 'tokens.env'), 'utf-8')).toContain(`export API_TOKEN_ADMIN_${ENV_UPPER}='tok-two-step'`);
  });

  test('authenticate returning null exits 1 and writes nothing', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    const { adapter } = spyAdapter({ authenticate: async () => null });

    expect(await runWith([], root, calls, adapter)).toBe(1);
    expect(calls).toHaveLength(0);
    expect(existsSync(join(root, 'tokens.env'))).toBe(false);
    expect(existsSync(join(root, 'api-state.json'))).toBe(false);
  });

  test('the empty-token check still guards the hatch', async () => {
    const root = scratch();
    const calls: FetchCall[] = [];
    const { adapter } = spyAdapter({
      authenticate: async () => ({ accessToken: '', tokenType: 'Bearer', expiresIn: 1, refreshToken: null }),
    });

    expect(await runWith([], root, calls, adapter)).toBe(1);
    expect(existsSync(join(root, 'tokens.env'))).toBe(false);
  });

  test('--help and a bad command line still short-circuit before the adapter runs', async () => {
    const root = scratch();
    let ran = 0;
    const { adapter } = spyAdapter({ authenticate: async () => { ran++; return null; } });

    expect(await runWith(['--help'], root, [], adapter)).toBe(0);
    expect(await runWith(['--bogus'], root, [], adapter)).toBe(1);
    expect(ran).toBe(0);
  });
});

describe('the next-step hint follows the operator shell', () => {
  const realPlatform = process.platform;
  function withPlatform<T>(value: string, body: () => T): T {
    Object.defineProperty(process, 'platform', { value, configurable: true });
    try { return body(); }
    finally { Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true }); }
  }

  test('POSIX sources tokens.env; Windows reads tokens.json with curl.exe', () => {
    const paths = { tokensEnv: '.auth/tokens.env', tokensJson: '.auth/tokens.json' };
    const names = { tokenVar: 'API_TOKEN_USER_LOCAL', tokenKey: 'USER_LOCAL' };

    const posix = withPlatform('darwin', () => renderTokenUsage(paths, names));
    expect(posix[0]).toBe('source .auth/tokens.env && \\');
    expect(posix[1]).toContain('Bearer $API_TOKEN_USER_LOCAL');

    // `source` is a POSIX builtin and tokens.env is `export VAR='...'`, so
    // PowerShell has to go through tokens.json; and a bare `curl` there is an
    // alias for Invoke-WebRequest, which does not understand -H.
    const win = withPlatform('win32', () => renderTokenUsage(paths, names));
    expect(win.join('\n')).not.toContain('source ');
    expect(win[0]).toContain('Get-Content .auth/tokens.json');
    expect(win[0]).toContain('.USER_LOCAL.token');
    expect(win[1]).toContain('curl.exe -s -H "Authorization: Bearer $t"');
    expect(win[1]).toContain('$env:API_BASE_URL');
  });

  test('the --help screen carries the hint for the host it is printed on', () => {
    expect(withPlatform('win32', () => renderHelp())).toContain('curl.exe');
    expect(withPlatform('linux', () => renderHelp())).toContain('source .auth/tokens.env');
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

  test('the entry file is wired to the split, not a pre-split copy that only prints the same banner', () => {
    // A gate that cannot fail is worse than no gate, because it converts a warning
    // into a false all-clear: a pre-split 510-line copy could reprint this exact
    // --help banner without ever importing either half. Assert the wiring itself.
    const source = readFileSync(ENTRY, 'utf-8');
    expect(source).toContain('from \'./lib/api-login-core\'');
    expect(source).toContain('from \'./api-login.project\'');
  });
});
