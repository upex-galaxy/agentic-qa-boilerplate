/**
 * @fileoverview Tests for the retirement of the plaintext MCP credential copies.
 *
 * Every test runs against a throwaway repo root under `os.tmpdir()`, so nothing
 * here reads or writes this checkout's real `.env`, settings or `.auth/`.
 *
 * The credential-shaped strings below are literals invented for the test. They
 * are not secrets and they never touch the repo.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { mcpEnvLoaderArgs } from './agent-compatibility-contracts.ts';
import {
  BACKUP_DIR,
  check,
  CLAUDE_LOCAL_SETTINGS,
  claudeSettingsRoot,
  ensureOpencodePlaceholders,
  hostReads,
  OPENCODE_SECRET_DIR,
  readEnvSnapshot,
  retire,
  stripInlineComments,
} from './harness-env.ts';

const roots: string[] = [];

function makeRoot(): string {
  // realpath, because macOS resolves /var to /private/var and `git rev-parse
  // --path-format=absolute` returns the resolved form.
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'harness-env-')));
  roots.push(root);
  return root;
}

/** A literal `${VAR}` placeholder, the form a legacy `.mcp.json` carries. */
function dollarVar(name: string): string {
  return `\${${name}}`;
}

function write(root: string, rel: string, contents: string): void {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

function readJson(root: string, rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, rel), 'utf8')) as Record<string, unknown>;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) { rmSync(root, { recursive: true, force: true }); }
  }
});

const SERVER = ['bunx', '-y', 'some-mcp@1'];

/** The three MCP configs on the loader shape: one server reading TOKEN_A and HOST_B through `--filter`. */
function loaderConfigs(root: string): void {
  const args = [...mcpEnvLoaderArgs(['TOKEN_A', 'HOST_B']), ...SERVER];
  write(root, '.mcp.json', JSON.stringify({ mcpServers: { srv: { command: 'bunx', args } } }));
  write(root, 'opencode.jsonc', JSON.stringify({ mcp: { srv: { type: 'local', command: ['bunx', ...args], enabled: true } } }));
  write(root, '.codex/config.toml', `[mcp_servers.srv]\ncommand = "bunx"\nargs = [${args.map(a => JSON.stringify(a)).join(', ')}]\n`);
}

/** The pre-loader shape: `${VAR}` in `.mcp.json`, `{file:}` in `opencode.jsonc`. */
function legacyConfigs(root: string): void {
  write(root, '.mcp.json', JSON.stringify({ mcpServers: { srv: { command: 'bunx', args: SERVER.slice(1), env: { TOKEN_A: dollarVar('TOKEN_A'), HOST_B: dollarVar('HOST_B') } } } }));
  write(root, 'opencode.jsonc', JSON.stringify({ mcp: { srv: { type: 'local', command: SERVER, environment: {
    TOKEN_A: `{file:${OPENCODE_SECRET_DIR}/TOKEN_A}`,
    HOST_B: `{file:${OPENCODE_SECRET_DIR}/HOST_B}`,
  } } } }));
  write(root, '.codex/config.toml', '[mcp_servers.srv]\ncommand = "bunx"\nargs = ["-y", "some-mcp@1"]\nenv_vars = ["TOKEN_A", "HOST_B"]\n');
}

/** The copies the retired generator left behind. */
function oldCopies(root: string, values: Record<string, string>, extraEnv: Record<string, string> = {}): void {
  write(root, CLAUDE_LOCAL_SETTINGS, JSON.stringify({ permissions: { allow: ['Bash(ls)'] }, env: { ...values, ...extraEnv } }, null, 2));
  for (const [name, value] of Object.entries(values)) { write(root, `${OPENCODE_SECRET_DIR}/${name}`, value); }
}

describe('stripInlineComments', () => {
  test('strips a comment after an unquoted value', () => {
    expect(readEnvSnapshotFrom('DBHUB_TYPE=          # sqlserver | postgres\n').DBHUB_TYPE).toBe('');
  });

  test('keeps a quoted value whole, comment marker and all', () => {
    expect(readEnvSnapshotFrom('A="keep # this"\n').A).toBe('keep # this');
  });

  test('keeps a hash with no whitespace before it', () => {
    expect(readEnvSnapshotFrom('B=pass#word\n').B).toBe('pass#word');
  });

  test('leaves a full-line comment alone', () => {
    expect(stripInlineComments('# just a comment\nC=v\n')).toBe('# just a comment\nC=v\n');
  });

  function readEnvSnapshotFrom(content: string): Record<string, string> {
    const root = makeRoot();
    write(root, '.env', content);
    return readEnvSnapshot(root).values;
  }
});

describe('hostReads', () => {
  test('a loader-shaped config leaves nothing for a host to read', () => {
    const root = makeRoot();
    loaderConfigs(root);
    const reads = hostReads(root);
    expect(reads.claude).toEqual([]);
    expect(reads.opencode).toEqual([]);
    expect(reads.all).toEqual(expect.arrayContaining(['HOST_B', 'TOKEN_A']));
  });

  test('a legacy config still reads its names through the host', () => {
    const root = makeRoot();
    legacyConfigs(root);
    const reads = hostReads(root);
    expect(reads.claude).toEqual(['HOST_B', 'TOKEN_A']);
    expect(reads.opencode).toEqual(['HOST_B', 'TOKEN_A']);
  });

  test('a Claude dbhub without the loader still reads what dbhub.toml interpolates', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.mcp.json', JSON.stringify({ mcpServers: { dbhub: { command: 'bunx', args: ['-y', '@bytebase/dbhub@1', '--config', 'dbhub.toml'] } } }));
    write(root, 'dbhub.toml', `[[sources]]\nhost = "${dollarVar('DB_HOST_X')}"\n`);
    expect(hostReads(root).claude).toEqual(['DB_HOST_X']);
  });
});

describe('retire', () => {
  test('deletes copies .env reproduces, drops the env block, keeps every other setting', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.env', 'TOKEN_A=tok-literal\nHOST_B=host.invalid\n');
    oldCopies(root, { TOKEN_A: 'tok-literal', HOST_B: 'host.invalid' });

    const result = retire(root);
    expect(result.changed).toBe(true);
    expect(result.claude[0].removed).toEqual(['HOST_B', 'TOKEN_A']);
    expect(result.opencode?.removed).toEqual(['HOST_B', 'TOKEN_A']);
    expect(result.backupDirs).toEqual([]);
    const settings = readJson(root, CLAUDE_LOCAL_SETTINGS);
    expect(settings.env).toBeUndefined();
    expect(settings.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(existsSync(join(root, OPENCODE_SECRET_DIR))).toBe(false);
    expect(existsSync(join(root, BACKUP_DIR))).toBe(false);
  });

  test('an empty copy of a variable .env does not declare is reproducible', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.env', 'TOKEN_A=tok-literal\n');
    oldCopies(root, { TOKEN_A: 'tok-literal', HOST_B: '' });
    expect(retire(root).opencode?.removed).toEqual(['HOST_B', 'TOKEN_A']);
  });

  test('backs up, at 0600, a copy .env does not reproduce, and never returns its value', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.env', 'TOKEN_A=new-literal\nHOST_B=host.invalid\n');
    oldCopies(root, { TOKEN_A: 'old-literal', HOST_B: 'host.invalid' });

    const result = retire(root);
    expect(result.claude[0].backedUp).toEqual(['TOKEN_A']);
    expect(result.opencode?.backedUp).toEqual(['TOKEN_A']);
    expect(result.backupDirs).toEqual([join(root, BACKUP_DIR)]);
    const backup = join(root, BACKUP_DIR, 'TOKEN_A');
    expect(readFileSync(backup, 'utf8')).toBe('old-literal');
    if (process.platform !== 'win32') { expect(statSync(backup).mode & 0o777).toBe(0o600); }
    expect(readJson(root, CLAUDE_LOCAL_SETTINGS).env).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('old-literal');
    expect(JSON.stringify(result)).not.toContain('new-literal');
  });

  test('keeps a key that is not an MCP credential', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.env', 'TOKEN_A=t\nHOST_B=h\n');
    oldCopies(root, { TOKEN_A: 't', HOST_B: 'h' }, { MY_OWN_FLAG: '1' });
    const result = retire(root);
    expect(result.claude[0].preserved).toEqual(['MY_OWN_FLAG']);
    expect(readJson(root, CLAUDE_LOCAL_SETTINGS).env).toEqual({ MY_OWN_FLAG: '1' });
  });

  test('keeps every copy a legacy config still reads, so that host keeps working', () => {
    const root = makeRoot();
    legacyConfigs(root);
    write(root, '.env', 'TOKEN_A=t\nHOST_B=h\n');
    oldCopies(root, { TOKEN_A: 't', HOST_B: 'h' });
    const result = retire(root);
    expect(result.changed).toBe(false);
    expect(result.claude[0].kept).toEqual(['HOST_B', 'TOKEN_A']);
    expect(result.opencode?.kept).toEqual(['HOST_B', 'TOKEN_A']);
    expect(readJson(root, CLAUDE_LOCAL_SETTINGS).env).toEqual({ TOKEN_A: 't', HOST_B: 'h' });
    expect(existsSync(join(root, OPENCODE_SECRET_DIR, 'TOKEN_A'))).toBe(true);
  });

  test('a dry run changes nothing', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.env', 'TOKEN_A=t\n');
    oldCopies(root, { TOKEN_A: 'other', HOST_B: '' });
    const before = readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8');
    const result = retire(root, { dryRun: true });
    expect(result.changed).toBe(true);
    expect(result.backupDirs).toEqual([join(root, BACKUP_DIR)]);
    expect(readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8')).toBe(before);
    expect(existsSync(join(root, OPENCODE_SECRET_DIR, 'TOKEN_A'))).toBe(true);
    expect(existsSync(join(root, BACKUP_DIR))).toBe(false);
  });

  test('refuses to retire anything while an MCP config does not parse', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.mcp.json', '{ not json');
    write(root, '.env', 'TOKEN_A=t\n');
    oldCopies(root, { TOKEN_A: 't' });
    const result = retire(root);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.changed).toBe(false);
    expect(existsSync(join(root, OPENCODE_SECRET_DIR, 'TOKEN_A'))).toBe(true);
  });

  test('nothing on disk: nothing to do', () => {
    const root = makeRoot();
    loaderConfigs(root);
    const result = retire(root);
    expect(result).toMatchObject({ claude: [], opencode: null, changed: false, errors: [] });
  });
});

describe('worktree', () => {
  test('retires the MAIN checkout\'s env block, the one Claude Code reads, from a worktree', () => {
    if (process.platform === 'win32') { return; }
    const parent = makeRoot();
    const main = join(parent, 'main');
    mkdirSync(main, { recursive: true });
    run(main, ['init', '-q']);
    run(main, ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
    const wt = join(parent, 'wt');
    run(main, ['worktree', 'add', '-q', wt, '-b', 'probe']);
    for (const root of [main, wt]) {
      loaderConfigs(root);
      write(root, '.env', 'TOKEN_A=t\nHOST_B=h\n');
    }
    write(main, CLAUDE_LOCAL_SETTINGS, JSON.stringify({ env: { TOKEN_A: 't', HOST_B: 'h' } }));

    expect(claudeSettingsRoot(wt)).toBe(main);
    const result = retire(wt);
    expect(result.claude.map(s => s.path)).toEqual([join(main, CLAUDE_LOCAL_SETTINGS)]);
    expect(readJson(main, CLAUDE_LOCAL_SETTINGS).env).toBeUndefined();
  });

  test('keeps the main env block while the MAIN checkout\'s own .mcp.json is still legacy', () => {
    if (process.platform === 'win32') { return; }
    const parent = makeRoot();
    const main = join(parent, 'main');
    mkdirSync(main, { recursive: true });
    run(main, ['init', '-q']);
    run(main, ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
    const wt = join(parent, 'wt');
    run(main, ['worktree', 'add', '-q', wt, '-b', 'probe']);
    legacyConfigs(main);
    loaderConfigs(wt);
    write(main, '.env', 'TOKEN_A=t\nHOST_B=h\n');
    write(main, CLAUDE_LOCAL_SETTINGS, JSON.stringify({ env: { TOKEN_A: 't', HOST_B: 'h' } }));

    const result = retire(wt);
    expect(result.claude[0].kept).toEqual(['HOST_B', 'TOKEN_A']);
    expect(readJson(main, CLAUDE_LOCAL_SETTINGS).env).toEqual({ TOKEN_A: 't', HOST_B: 'h' });
  });

  function run(cwd: string, args: string[]): void {
    execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
  }
});

describe('ensureOpencodePlaceholders', () => {
  test('a loader-shaped opencode.jsonc needs no placeholder', () => {
    const root = makeRoot();
    loaderConfigs(root);
    expect(ensureOpencodePlaceholders(root)).toEqual({ created: [], kept: [] });
    expect(existsSync(join(root, OPENCODE_SECRET_DIR))).toBe(false);
  });

  test('a legacy {file:} target gets an EMPTY file, and an existing one is never overwritten', () => {
    const root = makeRoot();
    legacyConfigs(root);
    write(root, `${OPENCODE_SECRET_DIR}/TOKEN_A`, 'real-literal');
    const result = ensureOpencodePlaceholders(root);
    expect(result).toEqual({ created: ['HOST_B'], kept: ['TOKEN_A'] });
    expect(readFileSync(join(root, OPENCODE_SECRET_DIR, 'HOST_B'), 'utf8')).toBe('');
    expect(readFileSync(join(root, OPENCODE_SECRET_DIR, 'TOKEN_A'), 'utf8')).toBe('real-literal');
  });
});

describe('check', () => {
  test('ok with no copy on disk', () => {
    const root = makeRoot();
    loaderConfigs(root);
    const result = check(root);
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.summary).toContain('no plaintext MCP credential copy');
  });

  test('a stale copy blocks, by NAME only', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, '.env', 'TOKEN_A=t-literal\n');
    oldCopies(root, { TOKEN_A: 't-literal' });
    const result = check(root);
    expect(result.ok).toBe(false);
    const stale = result.findings.filter(f => f.kind === 'stale-copy');
    expect(stale.map(f => f.surface).sort()).toEqual(['claude', 'opencode']);
    expect(stale.every(f => f.blocking && f.names.includes('TOKEN_A'))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('t-literal');
  });

  test('a copy a legacy config reads, and a waiting backup, are informational', () => {
    const root = makeRoot();
    legacyConfigs(root);
    write(root, '.env', 'TOKEN_A=t\nHOST_B=h\n');
    oldCopies(root, { TOKEN_A: 't', HOST_B: 'h' });
    write(root, `${BACKUP_DIR}/OLD`, 'x');
    const result = check(root);
    expect(result.ok).toBe(true);
    expect(result.findings.map(f => f.kind).sort()).toEqual(['backup-present', 'legacy-config', 'legacy-config']);
  });

  test('an unparseable config blocks', () => {
    const root = makeRoot();
    loaderConfigs(root);
    write(root, 'opencode.jsonc', '{ nope');
    const result = check(root);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.kind === 'config-unparseable' && f.blocking)).toBe(true);
  });
});
