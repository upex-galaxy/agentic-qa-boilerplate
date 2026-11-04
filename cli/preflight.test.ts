import type { CmdResult } from './lib/probes.ts';

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { BRAND } from './lib/ui/brand.ts';

import { exitCodeOf, plainMsg, preflightJson, pythonCheck, readYamlScalars, runSetupGate, runSetupPreflight, runUpPreflight, verdictOf } from './preflight.ts';

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'preflight-'));
  spawnSync('git', ['init', '-q', root]);
  spawnSync('git', ['-C', root, '-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  return root;
}

/** A local template source: no gh session and no network probe (preflight.md §3). */
const LOCAL = '/tmp/some-local-boilerplate-clone';

describe('verdict', () => {
  test('any block blocks, else any warn warns, else clear; exit codes 2 / 1 / 0', () => {
    expect(verdictOf([{ label: 'a', state: 'ok' }, { label: 'b', state: 'info' }])).toBe('clear');
    expect(verdictOf([{ label: 'a', state: 'warn' }, { label: 'b', state: 'ok' }])).toBe('warn');
    expect(verdictOf([{ label: 'a', state: 'warn' }, { label: 'b', state: 'block' }])).toBe('block');
    expect([exitCodeOf('clear'), exitCodeOf('warn'), exitCodeOf('block')]).toEqual([0, 1, 2]);
  });
});

describe('checks for bun sync', () => {
  test('a healthy checkout with a local source is clear, and gh is not needed', async () => {
    const r = await runUpPreflight({ cwd: repo(), templateRepo: LOCAL, lockFile: '.template/boilerplate.lock.json', lang: 'en', minFreeBytes: 1 });
    const ids = r.checks.map(c => c.id);
    expect(ids).toEqual(['bun', 'node', 'git-version', 'gh-auth', 'worktree', 'lock', 'disk']);
    expect(r.checks.find(c => c.id === 'gh-auth')).toMatchObject({ state: 'info' });
    expect(r.checks.find(c => c.id === 'lock')).toMatchObject({ state: 'info', value: 'first update' });
    expect(r.checks.some(c => c.id === 'net-github')).toBe(false);
    expect(['clear', 'warn']).toContain(r.verdict);
  });

  test('a damaged lock blocks with the restore command; an old schema only informs', async () => {
    const root = repo();
    mkdirSync(join(root, '.template'));
    writeFileSync(join(root, '.template', 'boilerplate.lock.json'), '{ not json');
    const bad = await runUpPreflight({ cwd: root, templateRepo: LOCAL, lockFile: '.template/boilerplate.lock.json', lang: 'es', minFreeBytes: 1 });
    expect(bad.verdict).toBe('block');
    expect(bad.checks.find(c => c.id === 'lock')).toMatchObject({ state: 'block', fix: 'git checkout -- .template/boilerplate.lock.json' });

    writeFileSync(join(root, '.template', 'boilerplate.lock.json'), JSON.stringify({ schemaVersion: 6 }));
    const old = await runUpPreflight({ cwd: root, templateRepo: LOCAL, lockFile: '.template/boilerplate.lock.json', lang: 'es', minFreeBytes: 1 });
    expect(old.checks.find(c => c.id === 'lock')).toMatchObject({ state: 'info', value: 'v6' });
  });

  test('a linked worktree blocks and names the main checkout', async () => {
    const root = repo();
    const wt = join(mkdtempSync(join(tmpdir(), 'preflight-wt-')), 'wt');
    spawnSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'probe', wt]);
    const r = await runUpPreflight({ cwd: wt, templateRepo: LOCAL, lockFile: '.template/boilerplate.lock.json', lang: 'en', minFreeBytes: 1 });
    const row = r.checks.find(c => c.id === 'worktree')!;
    expect(row.state).toBe('block');
    expect(plainMsg(row.msg!)).toContain('main checkout');
  });

  test('low disk warns; the caller\'s extra rows join the checklist', async () => {
    const r = await runUpPreflight({ cwd: repo(), templateRepo: LOCAL, lockFile: 'x.json', lang: 'es', minFreeBytes: Number.MAX_SAFE_INTEGER, extra: [{ id: 'harness-migration', label: 'Migración', state: 'info', neededBy: 'fetch' }] });
    expect(r.checks.find(c => c.id === 'disk')).toMatchObject({ state: 'warn' });
    expect(r.checks[r.checks.length - 1].id).toBe('harness-migration');
  });
});

describe('--json', () => {
  test('one object per row with id, verdict, needed_by and the fix; names, never values', async () => {
    const r = await runUpPreflight({ cwd: repo(), templateRepo: LOCAL, lockFile: 'x.json', lang: 'en', minFreeBytes: 1 });
    const j = preflightJson(r);
    expect(j.verdict).toBe(r.verdict);
    expect(j.checks[0]).toEqual({ id: 'bun', group: 'Tools', verdict: 'ok', observed: process.versions.bun, needed_by: 'fetch', fix: null, message: null });
  });

  test('the CLI prints the JSON and exits with the verdict code', () => {
    const r = spawnSync(process.execPath, [join(import.meta.dir, 'preflight.ts'), '--for', 'up', '--json'], { cwd: repo(), encoding: 'utf8', env: { ...process.env, UPEX_TEMPLATE_REPO: LOCAL } });
    const parsed = JSON.parse(r.stdout) as { verdict: string };
    expect(r.status).toBe(exitCodeOf(parsed.verdict as 'clear'));
  });
});

// ----------------------------------------------------------------------------
// bun setup (delivery 3): injected command and network probes, no real machine state
// ----------------------------------------------------------------------------

const OK = (stdout = ''): CmdResult => ({ ok: true, missing: false, stdout, stderr: '', timedOut: false });
const MISSING: CmdResult = { ok: false, missing: true, stdout: '', stderr: '', timedOut: false };
const FAIL: CmdResult = { ok: false, missing: false, stdout: '', stderr: 'no', timedOut: false };

/** The argv tail every Python candidate is probed with. */
const PY_PROBE = '-c import sys; print("%d.%d" % sys.version_info[:2]); import PIL';

/** A machine with every tool, minus the ones named in `without`. */
function machine(without: string[] = [], overrides: Record<string, CmdResult> = {}): (cmd: string, args: string[]) => CmdResult {
  const table: Record<string, CmdResult> = {
    'node --version': OK('v22.11.0'),
    'git --version': OK('git version 2.46.0'),
    'git config user.email': OK('qa@acme.dev'),
    'git config user.name': OK('QA'),
    'acli --version': OK('acli version 1.3.4'),
    'engram version': OK('engram 3.1.0'),
    'gh auth status': OK(),
    'gh --version': OK('gh version 2.63.0'),
    'git remote get-url origin': FAIL,
    [`python3 ${PY_PROBE}`]: OK('3.12'),
    ...overrides,
  };
  return (cmd, args) => {
    if (cmd === 'which' || cmd === 'where') { return without.includes(args[0]) ? FAIL : OK(`/usr/local/bin/${args[0]}`); }
    if (without.includes(cmd)) { return MISSING; }
    return table[`${cmd} ${args.join(' ')}`] ?? FAIL;
  };
}

const reachAll = async (): Promise<{ ok: boolean, ms: number }> => ({ ok: true, ms: 12 });
const reachNone = async (): Promise<{ ok: boolean, ms: number }> => ({ ok: false, ms: 3000 });
const BIG = { block: 1, warn: 2 };
const CHROMIUM = BRAND.setupDownloads.includes('chromium');
const PYTHON = BRAND.prereqs?.includes('python') === true;

function project(opts: { yaml?: string, steps?: Record<string, string>, env?: string } = {}): string {
  const root = repo();
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'acme-qa' }));
  mkdirSync(join(root, 'cli'), { recursive: true });
  writeFileSync(join(root, 'cli', 'install.ts'), '');
  mkdirSync(join(root, '.agents'), { recursive: true });
  writeFileSync(join(root, '.agents', 'project.yaml'), opts.yaml ?? 'project:\n  project_name: null\n');
  if (opts.steps) {
    mkdirSync(join(root, '.template'), { recursive: true });
    writeFileSync(join(root, '.template', 'installer.state.json'), JSON.stringify({ steps: opts.steps }));
  }
  if (opts.env !== undefined) { writeFileSync(join(root, '.env'), opts.env, { mode: 0o644 }); chmodSync(join(root, '.env'), 0o644); }
  return root;
}

describe('checks for bun setup', () => {
  test('a ready machine is clear, every group present, the downloads reachable', async () => {
    const r = await runSetupPreflight({ cwd: project(), lang: 'en', run: machine(), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: BIG });
    // Chromium is a row only for a product that downloads it (BRAND.setupDownloads).
    expect(r.checks.map(c => c.id)).toEqual(['bun', 'node', 'git', 'acli', 'engram', 'gh', ...(PYTHON ? ['python'] : []), 'agent-claude', 'agent-codex', 'agent-opencode', 'agent-pi', 'repo', 'disk', 'net-npm', 'net-github', ...(CHROMIUM ? ['net-playwright'] : [])]);
    expect(r.verdict).toBe('clear');
    expect(new Set(r.checks.map(c => c.group))).toEqual(new Set(['Tools', 'AI agents', 'This machine', 'Network']));
  });

  // Python with Pillow serves only the evidence pages: never a warning, never a block.
  test('a missing Python, an old one or a missing Pillow is information, with the fix', () => {
    const none = pythonCheck(machine(['python3', 'python']), 'darwin', 'en');
    expect(none).toMatchObject({ id: 'python', state: 'info', neededBy: 'evidence', fix: 'python3 -m pip install pillow' });
    expect(none.msg).toContain('Homebrew Python: brew install pillow');
    const old = pythonCheck(machine([], { [`python3 ${PY_PROBE}`]: OK('3.8') }), 'linux', 'en');
    expect(old).toMatchObject({ state: 'info', value: '3.8' });
    const noPillow = pythonCheck(machine([], { [`python3 ${PY_PROBE}`]: { ...FAIL, stdout: '3.12' } }), 'linux', 'en');
    expect(noPillow).toMatchObject({ state: 'info', value: '3.12, no Pillow', fix: 'python3 -m pip install pillow' });
    expect(pythonCheck(machine(), 'linux', 'en')).toMatchObject({ state: 'ok', value: '3.12' });
  });

  test('on Windows the py launcher is tried first, and python3 is not required', () => {
    const r = pythonCheck(machine(['python3'], { [`py -3 ${PY_PROBE}`]: OK('3.11') }), 'win32', 'es');
    expect(r).toMatchObject({ state: 'ok', value: '3.11' });
    expect(pythonCheck(machine(['python3', 'python', 'py']), 'win32', 'en')).toMatchObject({ state: 'info', fix: 'py -m pip install pillow' });
  });

  test('no AI agent and no Node block; nothing starts', async () => {
    const r = await runSetupPreflight({ cwd: project(), lang: 'es', run: machine(['claude', 'codex', 'opencode', 'pi', 'node']), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: BIG });
    expect(r.verdict).toBe('block');
    expect(r.checks.find(c => c.id === 'harness')).toMatchObject({ state: 'block' });
    expect(r.checks.find(c => c.id === 'node')).toMatchObject({ state: 'block' });
    expect(exitCodeOf(r.verdict)).toBe(2);
  });

  test('analysis §8 #1 and #5: a missing acli or Engram warns at once instead of stopping the run later', async () => {
    const r = await runSetupPreflight({ cwd: project(), lang: 'en', run: machine(['acli', 'engram']), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: BIG });
    expect(r.verdict).toBe('warn');
    expect(r.checks.find(c => c.id === 'acli')).toMatchObject({ state: 'warn', neededBy: 'jira', fix: 'brew tap atlassian/homebrew-acli && brew install acli' });
    expect(r.checks.find(c => c.id === 'engram')).toMatchObject({ state: 'warn', neededBy: 'install' });
    const skip = await runSetupPreflight({ cwd: project(), lang: 'en', run: machine(['acli']), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1', INSTALL_SKIP_JIRA: '1' }, disk: BIG });
    expect(skip.checks.find(c => c.id === 'acli')).toMatchObject({ state: 'info' });
  });

  test('Q2: offline with the downloads still to do blocks; with them done it only warns', async () => {
    const pending = await runSetupPreflight({ cwd: project(), lang: 'en', run: machine(), reach: reachNone, env: { HOME: '/nowhere', PLAYWRIGHT_BROWSERS_PATH: '/definitely/not/here' }, disk: BIG });
    expect(pending.checks.filter(c => c.state === 'block').map(c => c.id).sort()).toEqual(['net-github', 'net-npm', ...(CHROMIUM ? ['net-playwright'] : [])]);
    const done = await runSetupPreflight({ cwd: project({ steps: { '9-skills-community-project': 'x' } }), lang: 'en', run: machine(), reach: reachNone, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: BIG });
    expect(done.checks.filter(c => c.state === 'block')).toEqual([]);
    expect(done.checks.find(c => c.id === 'net-github')).toMatchObject({ state: 'warn', neededBy: 'github' });
  });

  test('disk: block under the floor, warn under the comfortable size', async () => {
    const low = await runSetupPreflight({ cwd: project(), lang: 'es', run: machine(), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: { block: Number.MAX_SAFE_INTEGER, warn: Number.MAX_SAFE_INTEGER } });
    expect(low.checks.find(c => c.id === 'disk')).toMatchObject({ state: 'block' });
    const tight = await runSetupPreflight({ cwd: project(), lang: 'es', run: machine(), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: { block: 1, warn: Number.MAX_SAFE_INTEGER } });
    expect(tight.checks.find(c => c.id === 'disk')).toMatchObject({ state: 'warn' });
  });

  test('analysis §8 #6: the maintainers\' yaml in someone else\'s repo is flagged before anything is asked', async () => {
    const r = await runSetupPreflight({ cwd: project({ yaml: '# MAINTAINER COPY: x\nproject:\n  project_name: Bunkai\n' }), lang: 'en', run: machine(), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: BIG });
    expect(r.checks.find(c => c.id === 'template-copy')).toMatchObject({ state: 'info', neededBy: 'team' });
  });

  test('a world-readable .env is fixed to 600 and reported; its values are never read into the checklist', async () => {
    const root = project({ env: 'ATLASSIAN_API_TOKEN=do-not-print-me\n' });
    const r = await runSetupPreflight({ cwd: root, lang: 'en', run: machine(), reach: reachAll, env: { HOME: '/nowhere', INSTALL_SKIP_PLAYWRIGHT: '1' }, disk: BIG });
    expect(statSync(join(root, '.env')).mode & 0o077).toBe(0);
    expect(r.checks.find(c => c.id === 'env-perms')).toMatchObject({ state: 'info' });
    expect(JSON.stringify(r)).not.toContain('do-not-print-me');
  });

  test('the yaml scalars the checklist needs are read without a yaml parser', () => {
    expect(readYamlScalars('issue_tracker:\n  atlassian_url: https://acme.atlassian.net # site\nsecrets:\n  provider: 1password\n')).toEqual({ atlassianUrl: 'https://acme.atlassian.net', secretsProvider: '1password' });
    expect(readYamlScalars('issue_tracker:\n  atlassian_url: null # TODO\n')).toEqual({ atlassianUrl: null, secretsProvider: null });
  });
});

describe('the setup gate (analysis §8 #3 and #4)', () => {
  test('dependencies present: nothing to install, exit 0', async () => {
    let installs = 0;
    expect(await runSetupGate({ cwd: join(import.meta.dir, '..'), lang: 'en', write: () => {}, install: () => { installs += 1; return 0; } })).toBe(0);
    expect(installs).toBe(0);
  });

  test('dependencies missing: the gate runs bun install itself; a failed install stops with a next step', async () => {
    const root = repo();
    let out = '';
    expect(await runSetupGate({ cwd: root, lang: 'en', write: (s) => { out += s; }, install: () => 1 })).toBe(2);
    expect(out).toContain('running bun install');
    expect(out).toContain('run again: bun setup');
  });
});
