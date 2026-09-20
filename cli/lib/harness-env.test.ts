/**
 * @fileoverview Tests for the per-harness credential generator.
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
import {
  buildAllowlist,
  check,
  CLAUDE_LOCAL_SETTINGS,
  claudeSettingsRoot,
  generate,
  OPENCODE_CONFIG,
  OPENCODE_SECRET_DIR,
  opencodeFileRef,
  planClaudeSettings,
  readEnvSnapshot,
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

/**
 * A literal `${VAR}` placeholder, the form `.mcp.json` and `dbhub.toml` carry.
 *
 * Built here rather than written inline because a plain string containing
 * `${...}` trips `no-template-curly-in-string`, and that rule is right in
 * general: it catches a template literal someone forgot to backtick. A template
 * literal with an escaped `$` is exempt and says what it means.
 */
function dollarVar(name: string): string {
  return `\${${name}}`;
}

function write(root: string, rel: string, contents: string): void {
  const target = join(root, rel);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents, 'utf8');
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) { rmSync(root, { recursive: true, force: true }); }
  }
});

/**
 * A minimal repo: one HTTP MCP with a bearer token, one local MCP with a
 * dbhub-style env block.
 *
 * `template` is the COMMITTED `.env.example`, which is what decides whether
 * `opencode.jsonc` may carry a `{file:}` reference for a variable. It defaults
 * to declaring both variables, empty, which is the shape a real template has.
 */
function scaffold(root: string, env: string, template = 'TAVILY_API_KEY=\nDBHUB_HOST=\n'): void {
  write(root, '.env.example', template);
  write(root, '.mcp.json', JSON.stringify({
    mcpServers: {
      tavily: { type: 'http', url: 'https://example.invalid/mcp', headers: { Authorization: `Bearer ${dollarVar('TAVILY_API_KEY')}` } },
      dbhub: { command: 'bunx', args: ['dbhub', '--config', 'dbhub.toml'], env: { DBHUB_HOST: dollarVar('DBHUB_HOST') } },
    },
  }, null, 2));
  write(root, OPENCODE_CONFIG, [
    '{',
    '  // Docs comment mentioning {env:VAR} and {env:VAR_NAME} — noise, not variables.',
    '  "mcp": {',
    '    "tavily": { "headers": { "Authorization": "Bearer {env:TAVILY_API_KEY}" } },',
    '    "dbhub": { "environment": { "DBHUB_HOST": "{env:DBHUB_HOST}" } }',
    '  }',
    '}',
    '',
  ].join('\n'));
  write(root, '.codex/config.toml', [
    `# Header comment naming ${dollarVar('VAR')} — noise.`,
    '[mcp_servers.tavily]',
    'bearer_token_env_var = "TAVILY_API_KEY"',
    '',
    '[mcp_servers.dbhub]',
    'env_vars = ["DBHUB_HOST"]',
    'env = { CODEX_LITERAL = "not-from-dotenv" }',
    '',
  ].join('\n'));
  write(root, 'dbhub.toml', [
    `# Credentials resolved via ${dollarVar('VAR')} interpolation — the word VAR here is noise.`,
    '[[sources]]',
    `host = "${dollarVar('DBHUB_HOST')}"`,
    '',
  ].join('\n'));
  write(root, '.env', env);
}

describe('stripInlineComments', () => {
  test('strips a comment after an unquoted value', () => {
    const out = readEnvSnapshotFrom('DBHUB_TYPE=          # sqlserver | postgres\n');
    expect(out.DBHUB_TYPE).toBe('');
  });

  test('keeps a quoted value whole, comment marker and all', () => {
    const out = readEnvSnapshotFrom('A="keep # this"\n');
    expect(out.A).toBe('keep # this');
  });

  test('keeps a hash with no whitespace before it', () => {
    const out = readEnvSnapshotFrom('B=pass#word\n');
    expect(out.B).toBe('pass#word');
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

describe('buildAllowlist', () => {
  test('parses every config and never picks up the comment noise', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    const list = buildAllowlist(root);
    expect(list.all).toEqual(['DBHUB_HOST', 'TAVILY_API_KEY']);
    expect(list.all).not.toContain('VAR');
    expect(list.all).not.toContain('VAR_NAME');
  });

  test('skips a Codex [mcp_servers.*].env table, whose values Codex supplies itself', () => {
    const root = makeRoot();
    scaffold(root, '');
    expect(buildAllowlist(root).all).not.toContain('CODEX_LITERAL');
  });

  test('scopes emitter A to .mcp.json plus dbhub.toml, and emitter B to opencode.jsonc', () => {
    const root = makeRoot();
    scaffold(root, '');
    write(root, 'dbhub.toml', `[[sources]]\nport = "${dollarVar('DBHUB_PORT')}"\n`);
    const list = buildAllowlist(root);
    expect(list.claude).toEqual(['DBHUB_HOST', 'DBHUB_PORT', 'TAVILY_API_KEY']);
    expect(list.opencode).toEqual(['DBHUB_HOST', 'TAVILY_API_KEY']);
  });

  test('reports an unparseable config instead of silently emitting a short allowlist', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    write(root, '.mcp.json', '{ not json');
    const result = check(root);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.kind === 'config-unparseable' && f.names.includes('.mcp.json'))).toBe(true);
  });

  test('cross-checks the declared MCP_SERVER_SECRETS map without failing on drift', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    const findings = check(root).findings.filter(f => f.surface === 'allowlist' && f.kind !== 'config-unparseable');
    expect(findings.every(f => f.blocking === false)).toBe(true);
  });
});

describe('emitter A — .claude/settings.local.json', () => {
  test('creates the env block with only the allowlisted variables', () => {
    const root = makeRoot();
    scaffold(
      root,
      'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\nATLASSIAN_API_TOKEN=nope\nLOCAL_USER_PASSWORD=nope\n',
      'TAVILY_API_KEY=\nDBHUB_HOST=\nATLASSIAN_API_TOKEN=\nLOCAL_USER_PASSWORD=\n',
    );
    const result = generate(root);
    const data = JSON.parse(readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8')) as { env: Record<string, string> };
    expect(Object.keys(data.env).sort()).toEqual(['DBHUB_HOST', 'TAVILY_API_KEY']);
    // Jira credentials and test users are declared by the template and used by
    // no MCP, so they are never copied into a harness config.
    expect(result.excluded).toEqual(['ATLASSIAN_API_TOKEN', 'LOCAL_USER_PASSWORD']);
    expect(result.declared).toHaveLength(4);
  });

  test('the summary arithmetic closes: emitted plus excluded equals declared', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n', 'TAVILY_API_KEY=\nDBHUB_HOST=\nATLASSIAN_API_TOKEN=\n');
    const result = generate(root);
    expect(result.emitted.length + result.excluded.length).toBe(result.declared.length);
    expect(check(root).summary).toContain('emitted 2 of 3 declared variables; 1 not referenced');
  });

  test('MERGES: every key it did not put there survives', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    write(root, CLAUDE_LOCAL_SETTINGS, JSON.stringify({
      permissions: { allow: ['Bash(git status)'], deny: ['Bash(rm -rf *)'] },
      hooks: { UserPromptSubmit: [] },
      env: { CLAUDE_CODE_SOMETHING: 'hand-placed' },
    }, null, 2));
    generate(root);
    const data = JSON.parse(readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8')) as Record<string, unknown>;
    expect(data.permissions).toEqual({ allow: ['Bash(git status)'], deny: ['Bash(rm -rf *)'] });
    expect(data.hooks).toEqual({ UserPromptSubmit: [] });
    expect((data.env as Record<string, string>).CLAUDE_CODE_SOMETHING).toBe('hand-placed');
    expect(Object.keys(data.env as object).sort()).toEqual(['CLAUDE_CODE_SOMETHING', 'DBHUB_HOST', 'TAVILY_API_KEY']);
  });

  test('skips an allowlisted variable .env declares empty rather than writing an empty override', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=\n');
    const result = generate(root);
    expect(result.claude.skipped).toEqual(['DBHUB_HOST']);
    const data = JSON.parse(readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8')) as { env: Record<string, string> };
    expect('DBHUB_HOST' in data.env).toBe(false);
  });

  test('removes an entry it owns once .env stops giving it a value', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    write(root, '.env', 'TAVILY_API_KEY=tk\nDBHUB_HOST=\n');
    const result = generate(root);
    expect(result.claude.removed).toEqual(['DBHUB_HOST']);
    const data = JSON.parse(readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8')) as { env: Record<string, string> };
    expect('DBHUB_HOST' in data.env).toBe(false);
  });

  test('refuses to rewrite a settings file it cannot parse', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    write(root, CLAUDE_LOCAL_SETTINGS, '{ broken');
    const { plan, content } = planClaudeSettings(root);
    expect(content).toBeNull();
    expect(plan.dirty).toBe(false);
    expect(readFileSync(join(root, CLAUDE_LOCAL_SETTINGS), 'utf8')).toBe('{ broken');
  });

  test('is idempotent: a second run writes nothing', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    expect(generate(root).changed).toBe(false);
  });

  test('writes at mode 0600', () => {
    if (process.platform === 'win32') { return; }
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    generate(root);
    expect(statSync(join(root, CLAUDE_LOCAL_SETTINGS)).mode & 0o777).toBe(0o600);
  });
});

describe('emitter B — .auth/opencode + opencode.jsonc', () => {
  test('writes one value file per referenced variable and rewrites the placeholders', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    const result = generate(root);
    expect(result.opencode.rewritten).toEqual(['DBHUB_HOST', 'TAVILY_API_KEY']);
    const config = readFileSync(join(root, OPENCODE_CONFIG), 'utf8');
    expect(config).toContain(opencodeFileRef('TAVILY_API_KEY'));
    expect(config).toContain(opencodeFileRef('DBHUB_HOST'));
    expect(config).not.toContain('{env:TAVILY_API_KEY}');
    expect(readFileSync(join(root, OPENCODE_SECRET_DIR, 'TAVILY_API_KEY'), 'utf8')).toBe('tk');
  });

  test('writes NO trailing newline, because {file:} substitutes contents verbatim', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    generate(root);
    const raw = readFileSync(join(root, OPENCODE_SECRET_DIR, 'TAVILY_API_KEY'), 'utf8');
    expect(raw.endsWith('\n')).toBe(false);
    expect(raw).toBe('tk');
  });

  test('keeps the config comments that document the MCP wiring', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    generate(root);
    expect(readFileSync(join(root, OPENCODE_CONFIG), 'utf8')).toContain('Docs comment mentioning');
  });

  test('writes an EMPTY file rather than none, because a MISSING target invalidates the WHOLE OpenCode config', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=\n');
    generate(root);
    const target = join(root, OPENCODE_SECRET_DIR, 'DBHUB_HOST');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('');
  });

  test('writes a file, and rewrites, for a variable the TEMPLATE declares even when .env omits it', () => {
    const root = makeRoot();
    // The fresh-clone guarantee: `.env` knows nothing about DBHUB_HOST, but
    // `.env.example` does, so the committed config's shape does not depend on
    // this developer's `.env` and the {file:} target still exists.
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    const result = generate(root);
    expect(result.opencode.write).toEqual(['DBHUB_HOST', 'TAVILY_API_KEY']);
    expect(result.opencode.undeclared).toEqual([]);
    expect(readFileSync(join(root, OPENCODE_SECRET_DIR, 'DBHUB_HOST'), 'utf8')).toBe('');
    expect(readFileSync(join(root, OPENCODE_CONFIG), 'utf8')).toContain(opencodeFileRef('DBHUB_HOST'));
  });

  test('leaves {env:} alone for a variable the TEMPLATE never declares, rather than asserting a contract that does not exist', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n', 'TAVILY_API_KEY=\n');
    const result = generate(root);
    expect(result.opencode.undeclared).toEqual(['DBHUB_HOST']);
    expect(existsSync(join(root, OPENCODE_SECRET_DIR, 'DBHUB_HOST'))).toBe(false);
    const config = readFileSync(join(root, OPENCODE_CONFIG), 'utf8');
    expect(config).toContain('{env:DBHUB_HOST}');
    expect(config).toContain(opencodeFileRef('TAVILY_API_KEY'));
  });

  test('an undocumented variable is reported but does not fail the check, because nothing got worse', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n', 'TAVILY_API_KEY=\n');
    generate(root);
    const result = check(root);
    expect(result.ok).toBe(true);
    const finding = result.findings.find(f => f.kind === 'undeclared');
    expect(finding?.names).toEqual(['DBHUB_HOST']);
    expect(finding?.blocking).toBe(false);
  });

  test('picks the variable up once the template declares it', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n', 'TAVILY_API_KEY=\n');
    generate(root);
    write(root, '.env.example', 'TAVILY_API_KEY=\nDBHUB_HOST=\n');
    const result = generate(root);
    expect(result.opencode.rewritten).toEqual(['DBHUB_HOST']);
    expect(readFileSync(join(root, OPENCODE_CONFIG), 'utf8')).toContain(opencodeFileRef('DBHUB_HOST'));
    expect(check(root).ok).toBe(true);
  });

  test('removes a stale value file nothing references any more', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    write(root, `${OPENCODE_SECRET_DIR}/GONE_API_KEY`, 'leftover');
    const result = generate(root);
    expect(result.opencode.removed).toEqual(['GONE_API_KEY']);
    expect(existsSync(join(root, OPENCODE_SECRET_DIR, 'GONE_API_KEY'))).toBe(false);
  });

  test('writes value files at mode 0600 in a 0700 directory', () => {
    if (process.platform === 'win32') { return; }
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    expect(statSync(join(root, OPENCODE_SECRET_DIR, 'TAVILY_API_KEY')).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, OPENCODE_SECRET_DIR)).mode & 0o777).toBe(0o700);
  });

  test('emits a POSIX reference path on every platform', () => {
    expect(opencodeFileRef('TAVILY_API_KEY')).toBe('{file:.auth/opencode/TAVILY_API_KEY}');
  });

  test('still recognises the variables after the rewrite has erased every {env:} form', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    const config = readFileSync(join(root, OPENCODE_CONFIG), 'utf8');
    expect(config).not.toContain('{env:TAVILY_API_KEY}');
    expect(config).not.toContain('{env:DBHUB_HOST}');
    // The comment's {env:VAR} prose survives, because the rewrite is driven by
    // the PARSED allowlist and `VAR` is not in it.
    expect(config).toContain('{env:VAR}');
    // The emitter erased its own input. The {file:} form must count as the same
    // declaration, or the next run deletes the value files it just wrote.
    expect(buildAllowlist(root).opencode).toEqual(['DBHUB_HOST', 'TAVILY_API_KEY']);
    expect(generate(root).opencode.removed).toEqual([]);
  });
});

describe('worktree redirection', () => {
  test('emitter A writes the MAIN checkout, because that is the file Claude Code reads', () => {
    if (process.platform === 'win32') { return; }
    const parent = makeRoot();
    const main = join(parent, 'main');
    mkdirSync(main, { recursive: true });
    run(main, ['init', '-q']);
    run(main, ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
    scaffold(main, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    const wt = join(parent, 'wt');
    run(main, ['worktree', 'add', '-q', wt, '-b', 'probe']);
    scaffold(wt, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');

    expect(claudeSettingsRoot(wt)).toBe(main);
    const result = generate(wt);
    expect(result.claude.redirectedToMainCheckout).toBe(true);
    // The credential lands where the harness looks...
    expect(existsSync(join(main, CLAUDE_LOCAL_SETTINGS))).toBe(true);
    // ...and NOT only in the worktree, where it would be a silent no-op.
    expect(existsSync(join(wt, CLAUDE_LOCAL_SETTINGS))).toBe(false);
    // Emitter B stays worktree-local: its {file:} paths resolve against the
    // worktree's own opencode.jsonc.
    expect(existsSync(join(wt, OPENCODE_SECRET_DIR, 'TAVILY_API_KEY'))).toBe(true);
    expect(existsSync(join(main, OPENCODE_SECRET_DIR, 'TAVILY_API_KEY'))).toBe(false);
  });

  test('warns, by NAME only, when the worktree .env disagrees with the main checkout', () => {
    if (process.platform === 'win32') { return; }
    const parent = makeRoot();
    const main = join(parent, 'main');
    mkdirSync(main, { recursive: true });
    run(main, ['init', '-q']);
    run(main, ['-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
    scaffold(main, 'TAVILY_API_KEY=main-value\nDBHUB_HOST=same\n');
    const wt = join(parent, 'wt');
    run(main, ['worktree', 'add', '-q', wt, '-b', 'probe']);
    scaffold(wt, 'TAVILY_API_KEY=worktree-value\nDBHUB_HOST=same\n');

    const result = generate(wt);
    expect(result.claude.divergentFromMainCheckout).toEqual(['TAVILY_API_KEY']);
    const finding = check(wt).findings.find(f => f.kind === 'worktree-divergence');
    expect(finding?.blocking).toBe(false);
    // A warning, never a block: diverging on purpose is legitimate, and this is a
    // limitation of how Claude Code resolves that file, not a broken setup.
    expect(check(wt).ok).toBe(true);
    const serialised = JSON.stringify(check(wt));
    expect(serialised).not.toContain('worktree-value');
    expect(serialised).not.toContain('main-value');
  });

  test('a plain checkout is never redirected', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\n');
    expect(claudeSettingsRoot(root)).toBe(root);
    expect(generate(root).claude.redirectedToMainCheckout).toBe(false);
  });

  function run(cwd: string, args: string[]): void {
    execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'ignore'] });
  }
});

describe('check', () => {
  test('passes right after a generate', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    const result = check(root);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('emitted 2 of 2 declared variables');
  });

  test('fails when .env gains a value the surfaces do not have', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root);
    write(root, '.env', 'TAVILY_API_KEY=rotated\nDBHUB_HOST=db.invalid\n');
    const result = check(root);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.kind === 'claude-stale' && f.names.includes('TAVILY_API_KEY'))).toBe(true);
    expect(result.findings.some(f => f.kind === 'opencode-file-stale' && f.names.includes('TAVILY_API_KEY'))).toBe(true);
  });

  test('fails when a new MCP variable appears in a config', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\nNEW_API_KEY=nk\n');
    generate(root);
    write(root, '.mcp.json', JSON.stringify({
      mcpServers: { extra: { type: 'http', url: 'https://example.invalid', headers: { Authorization: `Bearer ${dollarVar('NEW_API_KEY')}` } } },
    }, null, 2));
    const result = check(root);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.kind === 'claude-missing' && f.names.includes('NEW_API_KEY'))).toBe(true);
  });

  test('fails when opencode.jsonc still carries an {env:} placeholder', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    const result = check(root);
    expect(result.ok).toBe(false);
    expect(result.findings.some(f => f.kind === 'opencode-placeholder')).toBe(true);
  });

  test('fails, and says so, when there is no .env at all', () => {
    const root = makeRoot();
    scaffold(root, '');
    rmSync(join(root, '.env'));
    const result = check(root);
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.kind).toBe('env-missing');
  });

  test('never carries a value in any finding', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=super-secret-literal\nDBHUB_HOST=db.invalid\n');
    const serialised = JSON.stringify(check(root));
    expect(serialised).not.toContain('super-secret-literal');
    expect(serialised).not.toContain('db.invalid');
  });

  test('the generate result is serialisable without carrying a value', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=super-secret-literal\nDBHUB_HOST=db.invalid\n');
    const serialised = JSON.stringify(generate(root, { dryRun: true }));
    expect(serialised).not.toContain('super-secret-literal');
    expect(serialised).not.toContain('db.invalid');
  });

  test('a dry run writes nothing', () => {
    const root = makeRoot();
    scaffold(root, 'TAVILY_API_KEY=tk\nDBHUB_HOST=db.invalid\n');
    generate(root, { dryRun: true });
    expect(existsSync(join(root, CLAUDE_LOCAL_SETTINGS))).toBe(false);
    expect(existsSync(join(root, OPENCODE_SECRET_DIR))).toBe(false);
    expect(readFileSync(join(root, OPENCODE_CONFIG), 'utf8')).toContain('{env:TAVILY_API_KEY}');
  });
});
