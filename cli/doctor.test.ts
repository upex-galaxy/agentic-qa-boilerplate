/**
 * @fileoverview The doctor's pure env-var classifier (ADR-0005): which verdict
 * a variable gets from its scope, its feature gate and the machine's switches.
 * The exit-code policy hangs off it: only `missing-required` may block, and no
 * manifest entry reaches it today.
 */

import type { GitRunner, SkillDriftOptions, SkillDriftRow } from './doctor.ts';
import type { GateContext, VarSpec } from './lib/variables-manifest.ts';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { checkoutSetupActions, codexTrustStatus, envVarVerdict, jqInstalled, jqWarning, oneLsRemotePerSource, orchestratorCli, orchestratorState, piTrustStatus, probeOpenApiSpec, readOnlyGit, skillDrift, userSkillInstalled } from './doctor.ts';
import { VAR_MANIFEST, varsFor } from './lib/variables-manifest.ts';

function spec(overrides: Partial<VarSpec> & { name: string }): VarSpec {
  return {
    destinations: ['local'],
    secret: false,
    scope: 'core',
    usedBy: 'a consumer',
    required: false,
    critical: false,
    obtainHint: 'somewhere',
    note: 'a note',
    ...overrides,
  };
}

const off: GateContext = { env: {}, atlassianHostSet: false };

describe('envVarVerdict', () => {
  test('a set value is set, whatever the scope', () => {
    expect(envVarVerdict(spec({ name: 'A', scope: 'project' }), true, off)).toBe('set');
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: true }), true, off)).toBe('set');
  });

  test('a project or tooling var is never more than missing-optional', () => {
    expect(envVarVerdict(spec({ name: 'A', scope: 'project' }), false, off)).toBe('missing-optional');
    expect(envVarVerdict(spec({ name: 'A', scope: 'tooling', featureGate: 'portal-url' }), false, { env: { PORTAL_URL: 'https://x' } })).toBe('missing-optional');
  });

  test('a core var behind a gate is a warning only while the gate is on', () => {
    const atlassian = spec({ name: 'ATLASSIAN_API_TOKEN', scope: 'core', featureGate: 'atlassian-url', required: true });
    expect(envVarVerdict(atlassian, false, off)).toBe('missing-optional');
    expect(envVarVerdict(atlassian, false, { env: {}, atlassianHostSet: true })).toBe('missing-gated');
    const xray = spec({ name: 'XRAY_CLIENT_ID', scope: 'core', featureGate: 'tms-xray' });
    expect(envVarVerdict(xray, false, { env: { AUTO_SYNC: 'true', TMS_PROVIDER: 'jira' } })).toBe('missing-optional');
    expect(envVarVerdict(xray, false, { env: { AUTO_SYNC: 'true' } })).toBe('missing-gated');
  });

  test('only an ungated, required core var with no default can block', () => {
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: true }), false, off)).toBe('missing-required');
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: true, defaultValue: 'x' }), false, off)).toBe('missing-optional');
    expect(envVarVerdict(spec({ name: 'A', scope: 'core', required: false }), false, off)).toBe('missing-optional');
  });

  test('the real manifest has no var that could block the doctor, even with every switch on', () => {
    const allOn: GateContext = { env: { AUTO_SYNC: 'true', TMS_PROVIDER: 'xray', PORTAL_URL: 'https://x' }, atlassianHostSet: true };
    const blocking = varsFor('local').filter(s => envVarVerdict(s, false, allOn) === 'missing-required').map(s => s.name);
    expect(blocking).toEqual([]);
    // And the manifest as a whole declares every scope the doctor prints.
    expect(new Set(VAR_MANIFEST.map(s => s.scope))).toEqual(new Set(['core', 'tooling', 'project']));
  });
});

describe('probeOpenApiSpec', () => {
  const root = mkdtempSync(join(tmpdir(), 'doctor-openapi-'));
  mkdirSync(join(root, 'api'), { recursive: true });
  writeFileSync(join(root, 'api', 'openapi.json'), '{}');
  const answering = (status: number) => async () => new Response('{}', { status });
  const silent = async () => { throw new Error('ECONNREFUSED'); };

  test('says nothing when the variable is empty: the env row already covers it', async () => {
    expect(await probeOpenApiSpec(undefined, root, silent)).toBeNull();
    expect(await probeOpenApiSpec('  ', root, silent)).toBeNull();
  });

  test('a file path resolves against the repo root', async () => {
    expect(await probeOpenApiSpec('./api/openapi.json', root, silent)).toBeNull();
    const missing = await probeOpenApiSpec('./api/missing.json', root, silent);
    expect(missing?.target).toBe('bun run api:sync');
    expect(missing?.hint).toContain('./api/missing.json');
    expect(missing?.hint).not.toContain('API route');
  });

  test('a value that starts with / and is no file reads as the API route alone', async () => {
    const route = await probeOpenApiSpec('/api/openapi', root, silent);
    expect(route?.target).toBe('bun run api:sync');
    expect(route?.hint).toContain('/api/openapi');
    expect(route?.hint).toContain('looks like an API route');
    expect(route?.hint).toContain('origin of API_BASE_URL');
    expect(route?.hint).toContain('relative to the repo root');
    expect(await probeOpenApiSpec(join(root, 'api', 'openapi.json'), root, silent)).toBeNull();
  });

  test('a URL must answer 2xx, and the message names the host, never the full value', async () => {
    expect(await probeOpenApiSpec('https://api.example.test/openapi.json?token=x', root, answering(200))).toBeNull();
    const notFound = await probeOpenApiSpec('https://api.example.test/openapi.json?token=x', root, answering(404));
    expect(notFound?.hint).toContain('api.example.test that answered 404');
    expect(notFound?.hint).not.toContain('token=x');
    const down = await probeOpenApiSpec('http://127.0.0.1:9/openapi.json', root, silent);
    expect(down?.hint).toContain('127.0.0.1:9 that did not answer');
  });
});

describe('checkoutSetupActions', () => {
  const ready = { linked: false, envFile: true, deps: true, gitHooks: true };

  test('a ready checkout needs nothing', () => {
    expect(checkoutSetupActions(ready).actions).toEqual([]);
    expect(checkoutSetupActions({ ...ready, linked: true }).actions).toEqual([]);
  });

  test('an unprovisioned worktree gets ONE provision command, never the template copy', () => {
    const { actions, replaces } = checkoutSetupActions({ linked: true, envFile: false, deps: false, gitHooks: false });
    expect(actions.map(a => a.target)).toEqual(['bun run worktree:provision']);
    expect(actions[0].hint).toContain('.husky/_');
    // The generic `cp .env.example .env` and `bun run harness:env` are exactly what empties
    // the main checkout's env block from a worktree, so both are suppressed.
    expect(replaces).toEqual({ envFile: true, deps: true, harnessEnv: true });
  });

  test('a worktree with .env but no hooks keeps the harness:env advice', () => {
    const { actions, replaces } = checkoutSetupActions({ linked: true, envFile: true, deps: true, gitHooks: false });
    expect(actions.map(a => a.target)).toEqual(['bun run worktree:provision']);
    expect(replaces.harnessEnv).toBe(false);
  });

  test('a primary checkout with dependencies but no hook shims is told to reinstall', () => {
    const { actions } = checkoutSetupActions({ ...ready, gitHooks: false });
    expect(actions.map(a => a.target)).toEqual(['bun install']);
  });
});

describe('codexTrustStatus', () => {
  const HOOKS = { hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'x' }] }], SessionStart: [{ matcher: 'compact', hooks: [{ type: 'command', command: 'x' }] }] } };
  const workspace = (config?: (project: string) => string): { project: string, env: Record<string, string> } => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'codex-trust-')));
    const project = join(base, 'repo');
    mkdirSync(join(project, '.codex'), { recursive: true });
    writeFileSync(join(project, '.codex', 'hooks.json'), JSON.stringify(HOOKS));
    mkdirSync(join(base, 'codex-home'));
    if (config) { writeFileSync(join(base, 'codex-home', 'config.toml'), config(project)); }
    return { project, env: { CODEX_HOME: join(base, 'codex-home') } };
  };
  const trustedProject = (project: string): string => `[projects."${project}"]\ntrust_level = "trusted"\n`;
  const hookState = (project: string, key: string, body = 'enabled = true\ntrusted_hash = "sha256:x"'): string => `[hooks.state."${join(project, '.codex', 'hooks.json')}:${key}"]\n${body}\n`;

  test('no Codex config is unknown, an untrusted project says so before its hooks', () => {
    const none = workspace();
    expect(codexTrustStatus(none.project, none.env, '/nowhere', none.project)).toBe('unknown');
    const untrusted = workspace(() => '');
    expect(codexTrustStatus(untrusted.project, untrusted.env, '/nowhere', untrusted.project)).toBe('project-untrusted');
  });

  test('a trusted project whose hooks were never reviewed is hooks-untrusted', () => {
    const fresh = workspace(trustedProject);
    expect(codexTrustStatus(fresh.project, fresh.env, '/nowhere', fresh.project)).toBe('hooks-untrusted');
    const partial = workspace(project => `${trustedProject(project)}${hookState(project, 'user_prompt_submit:0:0')}`);
    expect(codexTrustStatus(partial.project, partial.env, '/nowhere', partial.project)).toBe('hooks-untrusted');
    const disabled = workspace(project => `${trustedProject(project)}${hookState(project, 'user_prompt_submit:0:0')}${hookState(project, 'session_start:0:0', 'enabled = false\ntrusted_hash = "sha256:x"')}`);
    expect(codexTrustStatus(disabled.project, disabled.env, '/nowhere', disabled.project)).toBe('hooks-untrusted');
  });

  test('every hook reviewed is trusted, looked up in the primary checkout a linked worktree runs', () => {
    const primary = workspace(project => `${trustedProject(project)}${hookState(project, 'user_prompt_submit:0:0')}${hookState(project, 'session_start:0:0')}`);
    expect(codexTrustStatus(primary.project, primary.env, '/nowhere', primary.project)).toBe('trusted');
    const linked = join(primary.project, '..', 'linked');
    mkdirSync(linked);
    expect(codexTrustStatus(linked, primary.env, '/nowhere', primary.project)).toBe('trusted');
    expect(codexTrustStatus(linked, primary.env, '/nowhere', null)).toBe('project-untrusted');
  });
});

describe('piTrustStatus', () => {
  const workspace = (trust?: unknown, settings?: unknown): { root: string, env: Record<string, string> } => {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'pi-trust-')));
    const root = join(base, 'group', 'repo');
    const agentDir = join(base, 'agent');
    mkdirSync(root, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    if (trust !== undefined) { writeFileSync(join(agentDir, 'trust.json'), JSON.stringify(typeof trust === 'function' ? trust(base) : trust)); }
    if (settings !== undefined) { writeFileSync(join(agentDir, 'settings.json'), JSON.stringify(settings)); }
    return { root, env: { PI_CODING_AGENT_DIR: agentDir } };
  };

  test('the default on a fresh machine is to ask', () => {
    const { root, env } = workspace();
    expect(piTrustStatus(root, env)).toBe('ask');
  });

  test('defaultProjectTrust decides when nothing is saved', () => {
    const always = workspace(undefined, { defaultProjectTrust: 'always' });
    expect(piTrustStatus(always.root, always.env)).toBe('trusted');
    const never = workspace(undefined, { defaultProjectTrust: 'never' });
    expect(piTrustStatus(never.root, never.env)).toBe('declined');
  });

  test('the closest saved decision wins, a parent counts, and it beats the default', () => {
    const parent = workspace((base: string) => ({ [join(base, 'group')]: true }));
    expect(piTrustStatus(parent.root, parent.env)).toBe('trusted');
    const closer = workspace((base: string) => ({ [join(base, 'group')]: true, [join(base, 'group', 'repo')]: false }), { defaultProjectTrust: 'always' });
    expect(piTrustStatus(closer.root, closer.env)).toBe('declined');
  });

  test('no agent directory at all is unknown', () => {
    const { root } = workspace();
    expect(piTrustStatus(root, { PI_CODING_AGENT_DIR: join(root, 'nowhere') })).toBe('unknown');
  });
});

describe('the Orca row (info only, /sprint-conductor needs it)', () => {
  const yaml = 'orchestration:\n  orchestrator_cli: orca # the binary on PATH\n';

  test('the CLI comes from orchestration.orchestrator_cli; orca-ide on Linux outside an Orca terminal', () => {
    expect(orchestratorCli(yaml, 'darwin', {})).toBe('orca');
    expect(orchestratorCli(yaml, 'linux', {})).toBe('orca-ide');
    expect(orchestratorCli(yaml, 'linux', { ORCA_TERMINAL_HANDLE: 'term_x' })).toBe('orca');
    expect(orchestratorCli('orchestration:\n  orchestrator_cli: \'\'\n', 'darwin', {})).toBeNull();
    expect(orchestratorCli('project:\n  project_name: x\n', 'darwin', {})).toBeNull();
  });

  test('the agent-orchestration skill counts as installed in the skills CLI store or the Claude Code one', () => {
    const at = (present: string) => (path: string) => path === present;
    expect(userSkillInstalled('/h', 'agent-orchestration', at(join('/h', '.agents', 'skills', 'agent-orchestration', 'SKILL.md')))).toBe(true);
    expect(userSkillInstalled('/h', 'agent-orchestration', at(join('/h', '.claude', 'skills', 'agent-orchestration', 'SKILL.md')))).toBe(true);
    expect(userSkillInstalled('/h', 'agent-orchestration', at(join('/h', '.agents', 'skills', 'mkd', 'SKILL.md')))).toBe(false);
  });

  const fake = (r: { error?: { code: string }, stdout?: string }) => (() => r) as unknown as Parameters<typeof orchestratorState>[1];

  test('the gate reads the NESTED reachable flag, and tells a missing binary from a closed app', () => {
    expect(orchestratorState(null)).toBe('not-configured');
    expect(orchestratorState('orca', fake({ error: { code: 'ENOENT' } }))).toBe('not-installed');
    expect(orchestratorState('orca', fake({ stdout: '{"result":{"runtime":{"reachable":true}}}' }))).toBe('ready');
    expect(orchestratorState('orca', fake({ stdout: '{"result":{"runtime":{"reachable":false}}}' }))).toBe('unreachable');
    expect(orchestratorState('orca', fake({ stdout: '{"reachable":true}' }))).toBe('unreachable');
    expect(orchestratorState('orca', fake({ stdout: 'not json' }))).toBe('unreachable');
  });
});

describe('jqWarning', () => {
  test('a missing jq yields one optional shell_command with the platform install line', () => {
    expect(jqWarning(false, 'darwin')?.target).toBe('brew install jq');
    expect(jqWarning(false, 'win32')?.target).toBe('winget install jqlang.jq');
    expect(jqWarning(false, 'linux')?.target).toBe('sudo apt install jq');
    expect(jqWarning(false, 'darwin')?.type).toBe('shell_command');
  });

  test('a present jq yields no warning', () => {
    expect(jqWarning(true, 'darwin')).toBeNull();
  });

  test('the probe reads the spawn result', () => {
    const fake = (r: object) => (() => r) as unknown as typeof import('node:child_process').spawnSync;
    expect(jqInstalled(fake({ status: 0 }))).toBe(true);
    expect(jqInstalled(fake({ status: null, error: new Error('ENOENT') }))).toBe(false);
  });
});

describe('skill drift', () => {
  const OLD = 'a'.repeat(40);
  const NEW = 'b'.repeat(40);
  const PKG = 'https://github.com/owner/repo';

  function setup(): { home: string, root: string, store: string, projectStore: string, skill: (dir: string, name: string) => string, lock: (path: string, skills: Record<string, object>) => void } {
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'doctor-drift-')));
    const home = join(base, 'home');
    const root = join(base, 'project');
    const skill = (dir: string, name: string): string => {
      mkdirSync(join(dir, name), { recursive: true });
      writeFileSync(join(dir, name, 'SKILL.md'), name);
      return join(dir, name);
    };
    const lock = (path: string, skills: Record<string, object>): void => {
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, JSON.stringify({ version: 3, skills }));
    };
    mkdirSync(root, { recursive: true });
    return { home, root, store: join(home, '.agents', 'skills'), projectStore: join(root, '.agents', 'skills'), skill, lock };
  }

  const remote = (head: string | null): GitRunner => args => (args[0] === 'ls-remote' && head !== null ? { ok: true, stdout: `${head}\tHEAD\n` } : { ok: false, stdout: '' });
  const listing = (rows: object[] = []): SkillDriftOptions['bunx'] => async () => ({ code: 0, stdout: JSON.stringify(rows), stderr: '' });
  const run = async (at: { home: string, root: string }, over: Partial<SkillDriftOptions>): Promise<SkillDriftRow[]> =>
    skillDrift({ ...at, env: {}, global: [], project: [], installRefs: {}, git: remote(NEW), bunx: listing(), ...over });
  const declared = (...names: string[]) => names.map(skill => ({ package: PKG, skill }));

  test('compares the lock commit with the source HEAD and never defaults to matches', async () => {
    const s = setup();
    for (const name of ['same', 'moved', 'nocommit', 'nolock', 'foreign']) { s.skill(s.store, name); }
    s.lock(join(s.home, '.agents', '.skill-lock.json'), {
      same: { source: 'owner/repo', commit: NEW },
      moved: { source: 'owner/repo', commit: OLD },
      nocommit: { source: 'owner/repo' },
      foreign: { source: 'someone/else', commit: NEW },
    });
    const rows = await run(s, { global: declared('same', 'moved', 'nocommit', 'nolock', 'foreign', 'absent') });
    expect(rows.map(r => [r.skill, r.state])).toEqual([
      ['same', 'matches'],
      ['moved', 'source-moved'],
      ['nocommit', 'unknown'],
      ['nolock', 'unknown'],
      ['foreign', 'unknown'],
      ['absent', 'not-installed'],
    ]);
    expect(rows[1].detail).toContain('not necessarily this skill\'s folder');
    expect(rows[4].detail).toContain('someone/else');
  });

  test('an unreachable source or an unreadable lock is unknown, with the reason', async () => {
    const s = setup();
    s.skill(s.store, 'same');
    const path = join(s.home, '.agents', '.skill-lock.json');
    s.lock(path, { same: { source: 'owner/repo', commit: NEW } });
    const offline = await run(s, { global: declared('same'), git: remote(null) });
    expect(offline[0]).toMatchObject({ state: 'unknown' });
    expect(offline[0].detail).toContain('source unreachable');
    writeFileSync(path, '{');
    const broken = await run(s, { global: declared('same') });
    expect(broken.map(r => r.state)).toEqual(['unknown', 'unknown']);
    expect(broken[0].detail).toContain('lock file unreadable');
  });

  test('reads the user lock below XDG_STATE_HOME when it is set', async () => {
    const s = setup();
    s.skill(s.store, 'same');
    const state = join(s.home, 'state');
    s.lock(join(state, 'skills', '.skill-lock.json'), { same: { source: 'owner/repo', commit: NEW } });
    const rows = await run(s, { global: declared('same'), env: { XDG_STATE_HOME: state } });
    expect(rows[0].state).toBe('matches');
  });

  test('a project copy falls back to the installer state ref and flags a local edit', async () => {
    const s = setup();
    s.skill(s.projectStore, 'kept');
    s.skill(s.projectStore, 'edited');
    const installRefs = { kept: { ref: NEW }, edited: { ref: NEW } };
    const rows = await run(s, { project: declared('kept', 'edited'), installRefs, bunx: listing([{ name: 'edited', path: 'x', status: 'modified' }]) });
    expect(rows.map(r => r.state)).toEqual(['matches', 'modified']);
    const unasked = await run(s, { project: declared('kept'), installRefs, bunx: async () => ({ code: 1, stdout: '', stderr: 'offline' }) });
    expect(unasked[0].detail).toContain('local edits not checked');
  });

  test('a development link shows its target, branch and unpushed commits', async () => {
    const s = setup();
    const checkout = s.skill(join(s.home, 'repo'), 'linked');
    mkdirSync(s.store, { recursive: true });
    symlinkSync(checkout, join(s.store, 'linked'), 'dir');
    const git = (upstream: boolean): GitRunner => (args) => {
      if (args.includes('--abbrev-ref')) { return { ok: true, stdout: 'feat/x\n' }; }
      return upstream ? { ok: true, stdout: '2\n' } : { ok: false, stdout: '' };
    };
    const [ahead] = await run(s, { global: declared('linked'), git: git(true) });
    expect(ahead.state).toBe('dev-link');
    expect(ahead.detail).toBe(`${join(s.store, 'linked')} -> ${checkout} (branch feat/x, 2 unpushed commit(s))`);
    const [local] = await run(s, { global: declared('linked'), git: git(false) });
    expect(local.detail).toContain('no upstream');
    const [plain] = await run(s, { global: declared('linked'), git: remote(null) });
    expect(plain.detail).toContain('not a git checkout');
  });

  test('lists user-level skills with no declared source and no lock entry', async () => {
    const s = setup();
    for (const name of ['mine', 'locked', 'declared']) { s.skill(s.store, name); }
    s.skill(join(s.home, '.claude', 'skills'), 'claude-only');
    s.lock(join(s.home, '.agents', '.skill-lock.json'), { locked: { source: 'owner/repo' } });
    const rows = await run(s, { global: declared('declared') });
    expect(rows.filter(r => r.state === 'no-source').map(r => r.skill)).toEqual(['mine', 'claude-only']);
  });

  test('matches lock keys and declared names against folder names as the skills CLI writes them', async () => {
    const s = setup();
    for (const name of ['react-best-practices', 'c-guide', 'mine']) { s.skill(s.store, name); }
    s.lock(join(s.home, '.agents', '.skill-lock.json'), { 'React Best Practices': { source: 'someone/else' } });
    const rows = await run(s, { global: declared('.C++ Guide') });
    expect(rows.filter(r => r.state === 'no-source').map(r => r.skill)).toEqual(['mine']);
  });

  test('asks each source for its HEAD once', () => {
    const calls: string[] = [];
    const git = oneLsRemotePerSource((args) => { calls.push(args.join(' ')); return { ok: true, stdout: '' }; });
    for (const args of [['ls-remote', PKG, 'HEAD'], ['ls-remote', PKG, 'HEAD'], ['status'], ['status']]) { git(args); }
    expect(calls).toEqual([`ls-remote ${PKG} HEAD`, 'status', 'status']);
  });

  test('git calls ignore an inherited GIT_DIR', () => {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
    const repo = mkdtempSync(join(tmpdir(), 'doctor-git-'));
    spawnSync('git', ['init', '--quiet', '--initial-branch=probe', repo], { env: clean as NodeJS.ProcessEnv });
    const result = readOnlyGit(['-C', repo, 'symbolic-ref', '--short', 'HEAD'], { ...clean, GIT_DIR: join(repo, 'nowhere') });
    expect(result).toEqual({ ok: true, stdout: 'probe\n' });
  });
});
