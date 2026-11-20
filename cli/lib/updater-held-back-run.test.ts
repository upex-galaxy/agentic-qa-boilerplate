/**
 * `runUpdate` end to end over a component held back by an upstream deletion,
 * against a LOCAL template repo. Live finding (2026-11-20, a downstream sync):
 * the lock's `templateCommit` never advanced, components nobody touched kept
 * their old cursor, and every sync reported the files a held-back component
 * had already received as "project edit overwritten".
 */

import type { Component, ReportSink, RunSummary, SyncStateV7, UpdaterConfig } from './updater-types';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { componentsWalked, computeDelta, runUpdate } from './updater-core.ts';

const roots: string[] = [];
const startCwd = process.cwd();
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater held back run '));
  roots.push(root);
  return root;
}
afterEach(() => {
  process.chdir(startCwd);
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

function git(root: string, args: string[]): string {
  const res = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (res.status !== 0) { throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`); }
  return res.stdout;
}
function write(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
function commit(root: string, files: Record<string, string | null>, message: string): string {
  for (const [rel, text] of Object.entries(files)) {
    if (text === null) { rmSync(join(root, rel), { force: true }); }
    else { write(root, rel, text); }
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '--allow-empty', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}
function initRepo(root: string): void {
  git(root, ['init', '--quiet', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
}

const SKILLS: Component = { name: 'agent-compatibility', type: 'directory', paths: ['.agents/skills'] };
const VSCODE: Component = { name: 'vscode', type: 'directory', paths: ['.vscode'] };
const COMPONENTS = [SKILLS, VSCODE];
const VERSION_FILE = '.template/boilerplate.lock.json';
const KEPT = '.agents/skills/a/SKILL.md';
const GONE = '.agents/skills/old/SKILL.md';
const SETTINGS = '.vscode/settings.json';

function sink(keepOnDelete = true): ReportSink {
  return {
    phase: () => {},
    subphase: () => {},
    step: () => {},
    warn: () => {},
    error: () => {},
    spinner: () => ({ start: () => {}, stop: () => {} }),
    confirm: async () => false,
    pickScopes: async scopes => scopes.map(s => s.name),
    pickFiles: async (_scope, files) => files.map(f => f.entry),
    pickIgnoreLines: async (_file, lines) => lines.map(l => l.value),
    resolveDiverged: async () => 'theirs',
    confirmDelete: async () => !keepOnDelete,
  };
}

function config(template: string): UpdaterConfig {
  return {
    templateRepo: template,
    cliVersion: 'test',
    tempDir: join(tempRoot(), 'upstream'),
    versionFile: VERSION_FILE,
    components: COMPONENTS,
    ignoreFiles: [],
    deprecatedFiles: [],
    bootstrapOnlyPaths: [],
    excludePaths: [],
    repoOnlyPaths: [],
  };
}

function lockAt(template: string, sha: string): string {
  const state: SyncStateV7 = {
    schemaVersion: 7,
    templateRepo: template,
    templateCommit: sha,
    perComponentCommit: { 'agent-compatibility': sha, 'vscode': sha },
    syncedComponents: ['agent-compatibility', 'vscode'],
    ignoreFileSync: {},
    cliVersion: 'test',
    lastSyncedAt: '2026-10-01T00:00:00.000Z',
    variableSystemVersion: 1,
  };
  return `${JSON.stringify(state, null, 2)}\n`;
}
const readLock = (app: string): SyncStateV7 => JSON.parse(readFileSync(join(app, VERSION_FILE), 'utf8')) as SyncStateV7;

/**
 * Upstream: r1 ships `a` v1, `old` and the settings; r2 changes `a` and deletes
 * `old`; r3 changes `a` again. `.vscode` never changes after r1. The project is
 * scaffolded at r1, with `old` as given.
 */
function setup(oldCopy = 'old v1\n'): { template: string, app: string, r1: string, advance: (files: Record<string, string | null>) => string } {
  const template = tempRoot();
  initRepo(template);
  const r1 = commit(template, { [KEPT]: 'a v1\n', [GONE]: 'old v1\n', [SETTINGS]: '{}\n' }, 'r1');
  const app = tempRoot();
  initRepo(app);
  commit(app, { [KEPT]: 'a v1\n', [GONE]: oldCopy, [SETTINGS]: '{}\n', [VERSION_FILE]: lockAt(template, r1) }, 'scaffold r1');
  return { template, app, r1, advance: files => commit(template, files, 'release') };
}

async function sync(template: string, app: string, auto = true, keepOnDelete = true): Promise<RunSummary> {
  process.chdir(app);
  const summary = await runUpdate(config(template), sink(keepOnDelete), { auto, dryRun: false, rollback: false });
  expect(summary.aborted).not.toBe(true);
  commit(app, {}, 'sync');
  return summary;
}

describe('a component held back by an unconfirmed upstream deletion', () => {
  test('its received files are never reported as project edits, and the untouched component advances', async () => {
    const { template, app, r1, advance } = setup();
    const r2 = advance({ [KEPT]: 'a v2\n', [GONE]: null });

    const first = await sync(template, app);
    expect(first.skipped.map(e => e.path)).toEqual([GONE]);
    expect(first.componentsHeldBack).toEqual(['agent-compatibility']);
    expect(readFileSync(join(app, KEPT), 'utf8')).toBe('a v2\n');
    expect(readLock(app).perComponentCommit).toEqual({ 'agent-compatibility': r1, 'vscode': r2 });
    expect(readLock(app).templateCommit).toBe(r1);

    const r3 = advance({ [KEPT]: 'a v3\n' });
    const second = await sync(template, app);
    // `a` v2 is upstream's r2 copy, not an edit, although the cursor is still r1.
    expect(second.localEditsOverwritten ?? []).toEqual([]);
    expect(second.componentsHeldBack).toEqual(['agent-compatibility']);
    expect(readLock(app).perComponentCommit).toEqual({ 'agent-compatibility': r1, 'vscode': r3 });
    expect(readLock(app).templateCommit).toBe(r1);
  });

  test('once the deletion is settled every cursor and templateCommit reach upstream HEAD', async () => {
    const { template, app, advance } = setup();
    advance({ [KEPT]: 'a v2\n', [GONE]: null });
    await sync(template, app);
    const r3 = advance({ [KEPT]: 'a v3\n' });

    commit(app, { [GONE]: null }, 'drop the file upstream deleted');
    const summary = await sync(template, app);
    expect(summary.componentsHeldBack).toEqual([]);
    expect(readLock(app).perComponentCommit).toEqual({ 'agent-compatibility': r3, 'vscode': r3 });
    expect(readLock(app).templateCommit).toBe(r3);
  });

  test('answering "keep" in an interactive run settles it: the file stays and is never offered again', async () => {
    const { template, app, advance } = setup();
    const r2 = advance({ [KEPT]: 'a v2\n', [GONE]: null });

    const summary = await sync(template, app, false, true);
    expect(summary.keptDeletions).toEqual([{ path: GONE, component: 'agent-compatibility', reason: 'answered' }]);
    expect(summary.componentsHeldBack).toEqual([]);
    expect(readFileSync(join(app, GONE), 'utf8')).toBe('old v1\n');
    expect(readLock(app).templateCommit).toBe(r2);

    const again = await sync(template, app, false, true);
    expect(again.keptDeletions ?? []).toEqual([]);
  });

  test('--auto keeps a deletion of the project\'s own content and advances; an unedited copy waits', async () => {
    const edited = setup('old v1, project notes\n');
    const r2 = edited.advance({ [KEPT]: 'a v2\n', [GONE]: null });
    const summary = await sync(edited.template, edited.app);
    expect(summary.keptDeletions).toEqual([{ path: GONE, component: 'agent-compatibility', reason: 'edited' }]);
    expect(summary.skipped).toEqual([]);
    expect(readFileSync(join(edited.app, GONE), 'utf8')).toBe('old v1, project notes\n');
    expect(readLock(edited.app).templateCommit).toBe(r2);

    const unedited = setup();
    unedited.advance({ [KEPT]: 'a v2\n', [GONE]: null });
    const held = await sync(unedited.template, unedited.app);
    expect(held.keptDeletions ?? []).toEqual([]);
    expect(held.componentsHeldBack).toEqual(['agent-compatibility']);
  });

  test('a stale cursor heals on a run with nothing to apply, and the next such run is byte-identical', async () => {
    const { template, app, advance } = setup();
    const r2 = advance({ [KEPT]: 'a v2\n', [GONE]: null });
    commit(app, { [GONE]: null }, 'drop the file upstream deleted');
    await sync(template, app);
    expect(readLock(app).templateCommit).toBe(r2);
    const r3 = advance({ 'README.md': 'outside every component\n' });

    await sync(template, app);
    expect(readLock(app).perComponentCommit).toEqual({ 'agent-compatibility': r3, 'vscode': r3 });
    expect(readLock(app).templateCommit).toBe(r3);
    const healed = readFileSync(join(app, VERSION_FILE), 'utf8');
    process.chdir(app);
    await runUpdate(config(template), sink(), { auto: true, dryRun: false, rollback: false });
    expect(readFileSync(join(app, VERSION_FILE), 'utf8')).toBe(healed);
  });
});

describe('componentsWalked', () => {
  test('a cursor that is no ancestor of HEAD, or a component computeDelta could not walk, never settles', () => {
    const { template, r1, advance } = setup();
    const head = advance({ 'README.md': 'x\n' });
    const all = new Set(['agent-compatibility', 'vscode']);
    expect(componentsWalked(template, COMPONENTS, { 'agent-compatibility': r1, 'vscode': r1 }, all).map(c => c.name)).toEqual(['agent-compatibility', 'vscode']);
    expect(componentsWalked(template, COMPONENTS, { 'agent-compatibility': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'vscode': head }, all).map(c => c.name)).toEqual(['vscode']);
    expect(componentsWalked(template, COMPONENTS, { 'agent-compatibility': r1, 'vscode': r1 }, new Set(['vscode'])).map(c => c.name)).toEqual(['vscode']);

    const computed = new Set<string>();
    const state = { schemaVersion: 6 as const, lastSync: '', templateCommit: r1, cliVersion: 'test', syncedComponents: [], variableSystemVersion: 1, perComponentCommit: { 'agent-compatibility': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'vscode': r1 } };
    computeDelta(template, COMPONENTS, state, template, [], undefined, computed);
    expect([...computed]).toEqual(['vscode']);
  });
});
