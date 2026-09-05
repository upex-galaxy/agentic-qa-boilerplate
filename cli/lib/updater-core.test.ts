import type { Component, SyncStateV6, SyncStateV7 } from './updater-types.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import {
  classifyFile,
  componentOwnedPaths,
  computeComponentAdvancement,
  computeDelta,
  detectLocalEdits,
  dirtyTreeExemptions,
  foreignDirtyPaths,
  isBootstrapOnlyFile,
  isLocalTemplateSource,
  isRepoOnlyPath,
  isWithinWriteSurface,
  LAST_APPLY_FILE,
  parsePorcelainPaths,
  prefetchedUpstreamDir,
  readLastApply,
  reconcileComponentsByContent,
  selfUpdateComponentByContent,
  selfUpdatedComponents,
  splitByLastApply,
  syncStateWriteNeeded,
  UPDATER_OWNED_PATHS_ENV,
  UPDATER_SELF_UPDATED_ENV,
  UPDATER_UPSTREAM_DIR_ENV,
  writeLastApply,
} from './updater-core.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'updater core '));
  temporaryRoots.push(root);
  return root;
}

function git(root: string, args: string[]): string {
  const res = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (res.status !== 0) { throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`); }
  return res.stdout;
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

/**
 * An env object for the pure helpers. Cast through `unknown`, never straight
 * to `NodeJS.ProcessEnv`: this file is synced into downstream projects, and a
 * Next.js host augments `ProcessEnv` with a REQUIRED `NODE_ENV`, under which a
 * direct `{ X: '1' } as NodeJS.ProcessEnv` fails `tsc` with TS2352 (seen on
 * the first live sync). `cli/updater-host-types.test.ts` guards this.
 */
function fakeEnv(vars: Record<string, string> = {}): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

/** A committed consumer repo: the CLI, the memory file, the lock, a `.backups/` ignore rule. */
function committedConsumer(): string {
  const root = temporaryRoot();
  git(root, ['init', '--quiet', '--initial-branch=main']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  write(root, 'cli/update-boilerplate.ts', 'old cli\n');
  write(root, 'cli/lib/updater-core.ts', 'old core\n');
  write(root, 'AGENTS.md', '# memory\n');
  write(root, '.template/boilerplate.lock.json', '{}\n');
  write(root, '.gitignore', '.backups/\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '--quiet', '-m', 'baseline']);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

const CLI: Component = { name: 'cli', type: 'directory', paths: ['cli'] };
const CFG = { components: [CLI], selfUpdateComponent: 'cli', versionFile: '.template/boilerplate.lock.json' };

describe('dirty-tree guard: self-update re-exec', () => {
  // Bunkai PR #234: `bun run up --auto` ran the migration preflight, the parent
  // refreshed `cli/` and re-exec'd, and the CHILD aborted on the dirty tree the
  // parent had just produced; `--force` was the only way through.

  test('the re-exec child ignores the CLI files its parent rewrote, and still refuses user work', () => {
    const root = committedConsumer();
    // What the parent does before re-exec: overwrite the self-update component, write a backup.
    write(root, 'cli/update-boilerplate.ts', 'new cli\n');
    write(root, 'cli/lib/updater-parity.ts', 'new file\n');
    write(root, '.backups/update-1/cli/update-boilerplate.ts', 'old cli\n');

    const porcelain = git(root, ['status', '--porcelain']);
    expect(porcelain).toContain('cli/update-boilerplate.ts');

    const child = fakeEnv({ UPEX_UPDATER_REEXEC: '1' });
    expect(foreignDirtyPaths(porcelain, dirtyTreeExemptions(CFG, {}, child))).toEqual([]);

    // A parent process (no REEXEC) has no such exemption: that dirt is foreign to it.
    expect(foreignDirtyPaths(porcelain, dirtyTreeExemptions(CFG, {}, fakeEnv())).sort())
      .toEqual(['cli/lib/updater-parity.ts', 'cli/update-boilerplate.ts']);

    // Genuine uncommitted work next to the self-update still aborts the child.
    write(root, 'AGENTS.md', '# memory, edited and never committed\n');
    expect(foreignDirtyPaths(git(root, ['status', '--porcelain']), dirtyTreeExemptions(CFG, {}, child))).toEqual(['AGENTS.md']);
  });

  test('the lock file and .backups/ are updater-owned in the parent as well as the child', () => {
    const root = committedConsumer();
    // A previous run rewrote the lock and left a backup; the user committed neither.
    write(root, '.template/boilerplate.lock.json', '{"schemaVersion":7}\n');
    write(root, '.backups/update-1/AGENTS.md', '# memory\n');
    const porcelain = git(root, ['status', '--porcelain', '--untracked-files=all']);
    expect(porcelain).toContain('.template/boilerplate.lock.json');

    const parent = fakeEnv();
    expect(foreignDirtyPaths(porcelain, dirtyTreeExemptions(CFG, {}, parent))).toEqual([]);
    // Ignored by git anyway (.gitignore has .backups/), but exempt even when it is not.
    expect(foreignDirtyPaths('?? .backups/update-2/x.ts\n M .template/boilerplate.lock.json', dirtyTreeExemptions(CFG, {}, parent))).toEqual([]);
    // User work next to them still aborts.
    write(root, 'AGENTS.md', '# edited\n');
    expect(foreignDirtyPaths(git(root, ['status', '--porcelain']), dirtyTreeExemptions(CFG, {}, parent))).toEqual(['AGENTS.md']);
  });

  test('preflight output handed down through the env is exempt in the child too', () => {
    const root = committedConsumer();
    // The cross-harness migration promoted CLAUDE.md, appended .gitignore and unindexed skills.
    write(root, 'CLAUDE.md', '@AGENTS.md\n');
    write(root, '.gitignore', '.backups/\n.claude/skills\n');
    git(root, ['add', '.gitignore']);
    const porcelain = git(root, ['status', '--porcelain']);

    const owned = ['CLAUDE.md', '.gitignore', '.claude/skills'];
    // Parent: the wrapper passes what the migration touched.
    expect(foreignDirtyPaths(porcelain, dirtyTreeExemptions(CFG, { updaterOwnedPaths: owned }, fakeEnv()))).toEqual([]);
    // Child: same list arrives through the env var the parent set on spawn.
    const env = fakeEnv({ UPEX_UPDATER_REEXEC: '1', [UPDATER_OWNED_PATHS_ENV]: owned.join('\n') });
    expect(foreignDirtyPaths(porcelain, dirtyTreeExemptions(CFG, {}, env))).toEqual([]);
    // Without either, the same dirt is refused.
    expect(foreignDirtyPaths(porcelain, dirtyTreeExemptions(CFG, {}, fakeEnv())).sort()).toEqual(['.gitignore', 'CLAUDE.md']);
  });

  test('porcelain parsing handles renames, quoted paths and both status columns', () => {
    const porcelain = [
      ' M cli/a.ts',
      'A  cli/b.ts',
      '?? AGENTS.md',
      'R  old/name.ts -> new/name.ts',
      '?? "dir with space/file.md"',
      // A caller that `.trim()`ed the output loses the first line's leading column.
      'D .claude/hooks/personality-reinject.js',
    ].join('\n');
    expect(parsePorcelainPaths(porcelain)).toEqual([
      'cli/a.ts',
      'cli/b.ts',
      'AGENTS.md',
      'old/name.ts',
      'new/name.ts',
      'dir with space/file.md',
      '.claude/hooks/personality-reinject.js',
    ]);
    // The real guard lists untracked files one by one (-uall), so a directory the
    // migration created matches its per-skill exemption file by file.
    expect(foreignDirtyPaths('?? .agents/skills/acli/SKILL.md\n?? .agents/skills/acli/references/x.md', ['.agents/skills/acli'])).toEqual([]);
    // Segment-aware: `cli` never swallows `cli-tools`.
    expect(foreignDirtyPaths(' M cli-tools/x.ts\n M cli/y.ts', ['cli'])).toEqual(['cli-tools/x.ts']);
  });

  test('component claims cover directory trees and file-list literals', () => {
    expect(componentOwnedPaths(CLI)).toEqual(['cli']);
    expect(componentOwnedPaths({ name: 'tooling', type: 'file-list', paths: ['.'], files: ['.editorconfig'] })).toEqual(['.editorconfig']);
    expect(componentOwnedPaths({ name: 'agents', type: 'file-list', paths: ['.agents'], files: ['project.yaml'] })).toEqual(['.agents/project.yaml']);
  });
});

describe('syncStateWriteNeeded', () => {
  const state: SyncStateV7 = {
    schemaVersion: 7,
    templateRepo: 'upex-galaxy/agentic-qa-boilerplate',
    templateCommit: 'abc',
    perComponentCommit: { cli: 'abc', docs: 'abc' },
    syncedComponents: ['cli', 'docs'],
    ignoreFileSync: {},
    packageJsonSync: {},
    cliVersion: '8.0',
    lastSyncedAt: '2026-09-04T10:00:00.000Z',
    variableSystemVersion: 1,
  };

  test('a run that changed nothing but the timestamp leaves the lock alone, whatever the key order', () => {
    const onDisk = `${JSON.stringify(state, null, 2)}\n`;
    expect(syncStateWriteNeeded(onDisk, { ...state, lastSyncedAt: '2026-09-05T00:00:00.000Z' })).toBe(false);
    const { perComponentCommit: _cursors, lastSyncedAt: _stamp, ...rest } = state;
    const reordered = JSON.stringify({ lastSyncedAt: 'x', perComponentCommit: { docs: 'abc', cli: 'abc' }, ...rest });
    expect(syncStateWriteNeeded(reordered, state)).toBe(false);
  });

  test('any real change, a missing lock or an unreadable one still writes', () => {
    const onDisk = JSON.stringify(state);
    expect(syncStateWriteNeeded(onDisk, { ...state, perComponentCommit: { ...state.perComponentCommit, cli: 'def' } })).toBe(true);
    expect(syncStateWriteNeeded(onDisk, { ...state, cliVersion: '9.0' })).toBe(true);
    expect(syncStateWriteNeeded(onDisk, { ...state, ignoreFileSync: { '.gitignore': { lastSyncedSha: 'x', appendedLines: [] } } })).toBe(true);
    expect(syncStateWriteNeeded(null, state)).toBe(true);
    expect(syncStateWriteNeeded('{not json', state)).toBe(true);
  });
});

describe('.claude/settings.json is delivered once, then project-owned', () => {
  const rootConfig: Component = { name: 'agent-root-config', type: 'file-list', paths: ['.claude'], files: ['settings.json'], bootstrapOnly: true };

  function template(): string {
    const dir = temporaryRoot();
    git(dir, ['init', '--quiet', '--initial-branch=main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'test']);
    write(dir, '.claude/settings.json', '{"permissions":{"allow":[]},"hooks":{}}\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'upstream']);
    return dir;
  }

  test('a project without the file receives upstream\'s copy', () => {
    const upstream = template();
    const project = temporaryRoot();
    const entries = reconcileComponentsByContent(upstream, [rootConfig], project, []);
    expect(entries.map(e => [e.path, e.classification])).toEqual([['.claude/settings.json', 'new-upstream']]);
    expect(classifyFile({ component: 'agent-root-config', path: '.claude/settings.json', status: 'A', fromSha: '', toSha: 'x', added: 1, removed: 0, isBinary: false, templateOldSha: null, templateNewSha: 'x' }, upstream, project, [rootConfig], [])).toBe('new-upstream');
  });

  test('a bootstrapped component with nothing to deliver still gets its lock cursor', () => {
    // Otherwise the lock never learns the component and every later run
    // repeats "bootstrap parcial" for it.
    const entry = { component: 'docs', path: 'docs/a.md', status: 'A' as const, fromSha: '', toSha: 'x', added: 1, removed: 0, isBinary: false, templateOldSha: null, templateNewSha: 'x', classification: 'new-upstream' as const };
    const advancement = computeComponentAdvancement({ applied: [{ entry, resolution: 'theirs' }], skipped: [], failed: [] }, [], ['agent-root-config', 'docs']);
    expect(advancement.componentsAdvanced.sort()).toEqual(['agent-root-config', 'docs']);
    expect(advancement.componentsHeldBack).toEqual([]);
    // A bootstrapped component that DID skip something is still held back.
    const held = computeComponentAdvancement({ applied: [], skipped: [entry], failed: [] }, [], ['docs']);
    expect(held).toEqual({ componentsAdvanced: [], componentsHeldBack: ['docs'] });
  });

  test('an existing file is never offered as diverged, however different it is', () => {
    const upstream = template();
    const project = temporaryRoot();
    write(project, '.claude/settings.json', '{"permissions":{"allow":["Bash(bun *)"]},"hooks":{}}\n');
    expect(reconcileComponentsByContent(upstream, [rootConfig], project, [])).toEqual([]);
    expect(classifyFile({ component: 'agent-root-config', path: '.claude/settings.json', status: 'M', fromSha: '', toSha: 'x', added: 1, removed: 1, isBinary: false, templateOldSha: 'y', templateNewSha: 'x' }, upstream, project, [rootConfig], [])).toBe('unchanged');
    expect(isBootstrapOnlyFile('.claude/settings.json', rootConfig, [])).toBe(true);
  });
});

describe('isLocalTemplateSource', () => {
  test('GitHub handles go through gh; paths and file URLs are local', () => {
    expect(isLocalTemplateSource('upex-galaxy/agentic-qa-boilerplate')).toBe(false);
    expect(isLocalTemplateSource('/tmp/upstream')).toBe(true);
    expect(isLocalTemplateSource('./upstream')).toBe(true);
    expect(isLocalTemplateSource('../upstream')).toBe(true);
    expect(isLocalTemplateSource('file:///tmp/upstream')).toBe(true);
    expect(isLocalTemplateSource('C:\\upstream')).toBe(true);
  });
});

describe('isBootstrapOnlyFile', () => {
  const agents: Component = { name: 'agents', type: 'file-list', paths: ['.agents'], files: ['README.md', 'project.yaml'] };
  const compat: Component = { name: 'agent-compatibility', type: 'directory', paths: ['.agents/skills', '.agents/compatibility'] };
  const paths = ['.agents/project.yaml', '.agents/compatibility/command-aliases.project.json'];

  test('an exact listed path binds for ANY component, not only `agents`', () => {
    expect(isBootstrapOnlyFile('.agents/compatibility/command-aliases.project.json', compat, paths)).toBe(true);
    expect(isBootstrapOnlyFile('.agents/compatibility/command-aliases.json', compat, paths)).toBe(false);
    expect(isBootstrapOnlyFile('.agents\\compatibility\\command-aliases.project.json', compat, paths)).toBe(true);
  });

  test('the legacy agents basename contract and its framework-file override still hold', () => {
    expect(isBootstrapOnlyFile('.agents/project.yaml', agents, paths)).toBe(true);
    expect(isBootstrapOnlyFile('.agents/project.yaml', agents, ['project.yaml'])).toBe(true);
    expect(isBootstrapOnlyFile('.agents/README.md', agents, paths, ['README.md'])).toBe(false);
    // A basename is NOT enough outside `agents`.
    expect(isBootstrapOnlyFile('docs/project.yaml', { name: 'docs', type: 'directory', paths: ['docs'] }, ['project.yaml'])).toBe(false);
  });

  test('a bootstrapOnly component is bootstrap-only regardless of the list, minus its framework files', () => {
    expect(isBootstrapOnlyFile('.codex/config.toml', { name: 'codex-config', type: 'directory', paths: ['.codex'], bootstrapOnly: true }, [])).toBe(true);
    // The fresh-install walk used to ignore `frameworkFiles`, so a legacy repo's
    // README scaffolds stayed stale until the NEXT (delta) run re-applied them.
    const context: Component = { name: 'context', type: 'directory', paths: ['.context'], bootstrapOnly: true, frameworkFiles: ['README.md'], frameworkFilesExcept: ['.context/ADR/README.md'] };
    expect(isBootstrapOnlyFile('.context/PRD/README.md', context, [])).toBe(false);
    expect(isBootstrapOnlyFile('.context/ADR/README.md', context, [])).toBe(true);
    expect(isBootstrapOnlyFile('.context/PRD/prd.md', context, [])).toBe(true);
  });
});

describe('re-run over an uncommitted sync (last-apply record)', () => {
  // Live finding (Bunkai): the first `--auto` left 283 files uncommitted by
  // design (the parity prompt is reviewed first) and the second `--auto`
  // aborted on them as a dirty tree. The record makes the guard tell the
  // updater's own output from the user's work by hash.

  test('recorded paths stay exempt while their hash holds; an edited or unrelated path is still the user\'s', () => {
    const root = committedConsumer();
    write(root, 'cli/update-boilerplate.ts', 'new cli\n');
    write(root, 'docs/new.md', 'delivered by the sync\n');
    const record = writeLastApply(root, ['cli/update-boilerplate.ts', 'docs/new.md'], {
      upstreamSha: 'abcdef1234567',
      suggestedCommit: 'chore(boilerplate): sync to abcdef1',
      promptFile: '.agents/prompts/parity-plan.md',
    });
    expect(record).not.toBeNull();
    expect(existsSync(join(root, LAST_APPLY_FILE))).toBe(true);
    expect(readLastApply(root)).toEqual(record);
    expect(Object.keys(record!.files).sort()).toEqual(['cli/update-boilerplate.ts', 'docs/new.md']);

    const foreignOf = (): string[] => foreignDirtyPaths(git(root, ['status', '--porcelain', '--untracked-files=all']), dirtyTreeExemptions(CFG, {}, fakeEnv()));
    // Same content as recorded: the updater's, not the user's.
    expect(splitByLastApply(foreignOf(), readLastApply(root), root)).toEqual({ recorded: ['cli/update-boilerplate.ts', 'docs/new.md'], userOwned: [] });
    // Without a record, the plain guard applies.
    expect(splitByLastApply(foreignOf(), null, root)).toEqual({ recorded: [], userOwned: ['cli/update-boilerplate.ts', 'docs/new.md'] });

    // The user edits one synced file and adds an unrelated one.
    write(root, 'docs/new.md', 'edited by hand after the sync\n');
    write(root, 'README.md', 'unrelated work\n');
    const split = splitByLastApply(foreignOf(), readLastApply(root), root);
    expect(split.recorded).toEqual(['cli/update-boilerplate.ts']);
    expect(split.userOwned.sort()).toEqual(['README.md', 'docs/new.md']);
  });

  test('a path the sync deleted or unindexed is recorded as null and stays exempt while absent', () => {
    const root = committedConsumer();
    git(root, ['rm', '--quiet', 'AGENTS.md']);
    const record = writeLastApply(root, ['AGENTS.md'], { upstreamSha: 'a', suggestedCommit: 'c', promptFile: null });
    expect(record?.files).toEqual({ 'AGENTS.md': null });
    const foreign = foreignDirtyPaths(git(root, ['status', '--porcelain', '--untracked-files=all']), dirtyTreeExemptions(CFG, {}, fakeEnv()));
    expect(foreign).toEqual(['AGENTS.md']);
    expect(splitByLastApply(foreign, record, root)).toEqual({ recorded: ['AGENTS.md'], userOwned: [] });
    // Recreated by the user: no longer what was recorded.
    write(root, 'AGENTS.md', '# back\n');
    expect(splitByLastApply(['AGENTS.md'], record, root).userOwned).toEqual(['AGENTS.md']);
  });

  test('a malformed record is ignored', () => {
    const root = committedConsumer();
    write(root, LAST_APPLY_FILE, '{not json');
    expect(readLastApply(root)).toBeNull();
    write(root, LAST_APPLY_FILE, '{"files": "nope"}');
    expect(readLastApply(root)).toBeNull();
  });
});

describe('prefetched upstream (dry-run preview through the fetched updater)', () => {
  test('only a directory holding a git clone counts', () => {
    const clone = temporaryRoot();
    expect(prefetchedUpstreamDir(fakeEnv())).toBeNull();
    expect(prefetchedUpstreamDir(fakeEnv({ [UPDATER_UPSTREAM_DIR_ENV]: clone }))).toBeNull();
    git(clone, ['init', '--quiet']);
    expect(prefetchedUpstreamDir(fakeEnv({ [UPDATER_UPSTREAM_DIR_ENV]: clone }))).toBe(clone);
    expect(prefetchedUpstreamDir(fakeEnv({ [UPDATER_UPSTREAM_DIR_ENV]: join(clone, 'missing') }))).toBeNull();
  });
});

describe('detectLocalEdits (3-way: local vs the upstream copy at the lock cursor)', () => {
  const SKILLS: Component = { name: 'agent-compatibility', type: 'directory', paths: ['.agents/skills'] };

  /** Template repo with two commits: the lock cursor, then HEAD. */
  function templateRepo(): { template: string, lock: string } {
    const template = temporaryRoot();
    git(template, ['init', '--quiet', '--initial-branch=main']);
    git(template, ['config', 'user.email', 'test@example.com']);
    git(template, ['config', 'user.name', 'test']);
    write(template, '.agents/skills/a/SKILL.md', 'a v1\n');
    write(template, '.agents/skills/b/SKILL.md', 'b v1\n');
    write(template, '.agents/skills/c/SKILL.md', 'c v1\n');
    git(template, ['add', '-A']);
    git(template, ['commit', '--quiet', '-m', 'lock']);
    const lock = git(template, ['rev-parse', 'HEAD']).trim();
    write(template, '.agents/skills/a/SKILL.md', 'a v2\n');
    write(template, '.agents/skills/c/SKILL.md', 'c v2\n');
    write(template, '.agents/skills/d/SKILL.md', 'd, added upstream after the lock\n');
    git(template, ['add', '-A']);
    git(template, ['commit', '--quiet', '-m', 'head']);
    return { template, lock };
  }

  function stateAt(lock: string): SyncStateV6 {
    return { schemaVersion: 6, lastSync: '', templateCommit: lock, cliVersion: '8.1', syncedComponents: [], variableSystemVersion: 1, perComponentCommit: { 'agent-compatibility': lock } };
  }

  test('a skill the project edited is an edit; one that merely lags upstream is not', () => {
    const { template, lock } = templateRepo();
    const local = temporaryRoot();
    write(local, '.agents/skills/a/SKILL.md', 'a v1\n'); // lags upstream: fast-forward
    write(local, '.agents/skills/b/SKILL.md', 'b v1, project edit\n'); // upstream unchanged since the lock
    write(local, '.agents/skills/c/SKILL.md', 'c v1, project edit\n'); // upstream changed AND the project edited
    // No base copy at the lock: the migration moved it here from `.claude/skills/`.
    write(local, '.agents/skills/d/SKILL.md', 'd, older copy the preflight moved\n');

    const reconciled = reconcileComponentsByContent(template, [SKILLS], local, []);
    expect(reconciled.map(e => e.path).sort()).toEqual(['.agents/skills/a/SKILL.md', '.agents/skills/b/SKILL.md', '.agents/skills/c/SKILL.md', '.agents/skills/d/SKILL.md']);
    expect(reconciled.every(e => e.classification === 'locally-diverged')).toBe(true);
    const delta = computeDelta(template, [SKILLS], stateAt(lock), local, []);

    const edits = detectLocalEdits(template, [SKILLS], stateAt(lock).perComponentCommit, delta, reconciled, local);
    expect([...edits].sort()).toEqual(['.agents/skills/b/SKILL.md', '.agents/skills/c/SKILL.md']);
  });

  test('an unreachable cursor or a component without one reports nothing (unknown is never an edit)', () => {
    const { template } = templateRepo();
    const local = temporaryRoot();
    write(local, '.agents/skills/b/SKILL.md', 'b edited\n');
    const reconciled = reconcileComponentsByContent(template, [SKILLS], local, []);
    expect(detectLocalEdits(template, [SKILLS], { 'agent-compatibility': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef' }, [], reconciled, local).size).toBe(0);
    expect(detectLocalEdits(template, [SKILLS], {}, [], reconciled, local).size).toBe(0);
  });
});

describe('watched files inside a synced component (.husky hooks, updater.protected_paths)', () => {
  // Live finding (Bunkai, second run): `.husky/pre-push` carried a committed
  // project merge and every `--auto` force-applied upstream's copy over it,
  // then re-raised the same "project edit overwritten" row. A watched path is
  // fed into `bootstrapOnlyPaths`: delivered once when missing, never
  // overwritten; the rest of the component keeps syncing.
  const husky: Component = { name: 'husky', type: 'directory', paths: ['.husky'] };
  const scripts: Component = { name: 'scripts', type: 'directory', paths: ['scripts'] };
  const protectedPaths = ['.husky/pre-commit', '.husky/pre-push', 'scripts/lint-vars.ts'];

  function template(): string {
    const dir = temporaryRoot();
    git(dir, ['init', '--quiet', '--initial-branch=main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'test']);
    write(dir, '.husky/pre-commit', '#!/bin/sh\nbunx lint-staged\n');
    write(dir, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\n');
    write(dir, '.husky/_/husky.sh', 'helper v2\n');
    write(dir, 'scripts/lint-vars.ts', 'upstream lint-vars\n');
    write(dir, 'scripts/other.ts', 'upstream other\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'upstream']);
    return dir;
  }

  test('a project edit on a watched hook is never offered as diverged; the helper next to it still syncs', () => {
    const upstream = template();
    const project = temporaryRoot();
    write(project, '.husky/pre-commit', '#!/bin/sh\nbunx lint-staged\n');
    write(project, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\nbun run e2e\n'); // project gate
    write(project, '.husky/_/husky.sh', 'helper v1\n'); // lags upstream
    const entries = reconcileComponentsByContent(upstream, [husky], project, protectedPaths);
    expect(entries.map(e => [e.path, e.classification])).toEqual([['.husky/_/husky.sh', 'locally-diverged']]);
    expect(isBootstrapOnlyFile('.husky/pre-push', husky, protectedPaths)).toBe(true);
    expect(isBootstrapOnlyFile('.husky/_/husky.sh', husky, protectedPaths)).toBe(false);
    // Without the watchlist the same edit would be overwritten ('theirs').
    expect(reconcileComponentsByContent(upstream, [husky], project, []).map(e => e.path).sort()).toEqual(['.husky/_/husky.sh', '.husky/pre-push']);
  });

  test('a synced file the project listed in updater.protected_paths behaves the same', () => {
    const upstream = template();
    const project = temporaryRoot();
    write(project, 'scripts/lint-vars.ts', 'project merge of lint-vars\n');
    write(project, 'scripts/other.ts', 'upstream other\n');
    expect(reconcileComponentsByContent(upstream, [scripts], project, protectedPaths)).toEqual([]);
    write(project, 'scripts/other.ts', 'stale other\n');
    expect(reconcileComponentsByContent(upstream, [scripts], project, protectedPaths).map(e => [e.path, e.classification])).toEqual([['scripts/other.ts', 'locally-diverged']]);
  });

  test('a watched path absent locally is delivered once from upstream', () => {
    const upstream = template();
    const project = temporaryRoot();
    write(project, '.husky/_/husky.sh', 'helper v2\n');
    const entries = reconcileComponentsByContent(upstream, [husky], project, protectedPaths);
    expect(entries.map(e => [e.path, e.classification]).sort()).toEqual([['.husky/pre-commit', 'new-upstream'], ['.husky/pre-push', 'new-upstream']]);
    expect(classifyFile({ component: 'husky', path: '.husky/pre-push', status: 'A', fromSha: '', toSha: 'x', added: 1, removed: 0, isBinary: false, templateOldSha: null, templateNewSha: 'x' }, upstream, project, [husky], protectedPaths)).toBe('new-upstream');
    // Once present, a later upstream change never reaches it.
    write(project, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\n');
    expect(classifyFile({ component: 'husky', path: '.husky/pre-push', status: 'M', fromSha: '', toSha: 'y', added: 1, removed: 0, isBinary: false, templateOldSha: 'x', templateNewSha: 'y' }, upstream, project, [husky], protectedPaths)).toBe('unchanged');
  });
});

describe('isWithinWriteSurface (the dirty-tree guard blocks only on paths the sync writes)', () => {
  // QA keeps the scoped gate from 7.x: uncommitted work in tests/ or project
  // code is never overwritten by the sync, so it must never abort the run.
  const cfg: Parameters<typeof isWithinWriteSurface>[0] = {
    components: [
      { name: 'skills', type: 'directory', paths: ['.agents/skills'] },
      { name: 'husky', type: 'directory', paths: ['.husky'] },
      { name: 'codex-config', type: 'directory', paths: ['.codex'], bootstrapOnly: true },
      { name: 'tooling', type: 'file-list', paths: ['.'], files: ['.editorconfig'] },
    ],
    ignoreFiles: [{ path: '.gitignore', sentinel: '#' }],
    packageJsonSpecs: [{ path: 'package.json', sections: ['scripts'] }],
    deprecatedFiles: [],
    excludePaths: ['.agents/skills/REGISTRY.md'],
    repoOnlyPaths: ['docs/qa-standard'],
    bootstrapOnlyPaths: ['.husky/pre-push', '.agents/project.yaml', 'scripts/lint-skills.ts'],
  };

  test('synced component files, ignore files and package.json are inside', () => {
    expect(isWithinWriteSurface(cfg, '.agents/skills/acli/SKILL.md')).toBe(true);
    expect(isWithinWriteSurface(cfg, '.husky/_/husky.sh')).toBe(true);
    expect(isWithinWriteSurface(cfg, '.editorconfig')).toBe(true);
    expect(isWithinWriteSurface(cfg, '.gitignore')).toBe(true);
    expect(isWithinWriteSurface(cfg, 'package.json')).toBe(true);
    expect(isWithinWriteSurface(cfg, '.agents\\skills\\acli\\SKILL.md')).toBe(true);
  });

  test('project code, protected paths, bootstrap-only components, excluded and repo-only paths are outside', () => {
    expect(isWithinWriteSurface(cfg, 'tests/e2e/login.spec.ts')).toBe(false);
    expect(isWithinWriteSurface(cfg, 'tests/components/pages/login.page.ts')).toBe(false);
    expect(isWithinWriteSurface(cfg, 'AGENTS.md')).toBe(false);
    expect(isWithinWriteSurface(cfg, '.husky/pre-push')).toBe(false);
    expect(isWithinWriteSurface(cfg, 'scripts/lint-skills.ts')).toBe(false);
    expect(isWithinWriteSurface(cfg, '.agents/project.yaml')).toBe(false);
    expect(isWithinWriteSurface(cfg, '.codex/config.toml')).toBe(false);
    expect(isWithinWriteSurface(cfg, '.agents/skills/REGISTRY.md')).toBe(false);
    expect(isWithinWriteSurface(cfg, 'docs/qa-standard/x.md')).toBe(false);
    // Segment-aware: `.husky` never swallows `.husky-old`.
    expect(isWithinWriteSurface(cfg, '.husky-old/pre-push')).toBe(false);
  });
});

describe('cli lock cursor after a self-update', () => {
  // Live finding: the re-exec child found `cli/` identical to upstream (the
  // parent had just written it), walked no entry for the component and never
  // advanced its cursor, so the lock kept `cli@<scaffold sha>` forever.
  const cfg = { selfUpdateComponent: 'cli' };
  const head = 'a'.repeat(40);

  test('the component the parent refreshed to this very sha is settled without an entry', () => {
    expect(selfUpdatedComponents(cfg, head, fakeEnv({ [UPDATER_SELF_UPDATED_ENV]: head }))).toEqual(['cli']);
    // No self-update, an upstream that moved since the parent's fetch, or no self-update component: nothing.
    expect(selfUpdatedComponents(cfg, head, fakeEnv())).toEqual([]);
    expect(selfUpdatedComponents(cfg, head, fakeEnv({ [UPDATER_SELF_UPDATED_ENV]: 'b'.repeat(40) }))).toEqual([]);
    expect(selfUpdatedComponents({}, head, fakeEnv({ [UPDATER_SELF_UPDATED_ENV]: head }))).toEqual([]);
  });

  test('a settled component advances next to the ones with entries; one with a skipped entry is still held back', () => {
    const entry = { component: 'docs', path: 'docs/a.md', status: 'M' as const, fromSha: '', toSha: 'x', added: 1, removed: 0, isBinary: false, templateOldSha: 'y', templateNewSha: 'x', classification: 'clean-fastforward' as const };
    const advanced = computeComponentAdvancement({ applied: [{ entry, resolution: 'theirs' }], skipped: [], failed: [] }, [], ['cli']);
    expect(advanced.componentsAdvanced.sort()).toEqual(['cli', 'docs']);
    expect(advanced.componentsHeldBack).toEqual([]);
    // Settled alone (a no-op run after the self-update): the cursor still moves.
    expect(computeComponentAdvancement({ applied: [], skipped: [], failed: [] }, [], ['cli'])).toEqual({ componentsAdvanced: ['cli'], componentsHeldBack: [] });
    // A component with a skipped entry of its own is never settled by the list.
    const cliEntry = { ...entry, component: 'cli', path: 'cli/x.ts' };
    expect(computeComponentAdvancement({ applied: [], skipped: [cliEntry], failed: [] }, [], ['cli'])).toEqual({ componentsAdvanced: [], componentsHeldBack: ['cli'] });
  });

  // Live finding: a pre-8.1 (7.x) parent predates UPDATER_SELF_UPDATED_ENV, so
  // it re-execs on UPEX_UPDATER_REEXEC=1 alone. The child must detect the same
  // settle-worthy fact by content instead of the missing env signal.
  describe('the content fallback for a pre-8.1 parent', () => {
    const cliComponent: Component = { name: 'cli', type: 'directory', paths: ['cli'] };
    const cfg = { components: [cliComponent], selfUpdateComponent: 'cli' };
    const scaffoldSha = 'a'.repeat(40);

    function upstreamAtHead(): { dir: string, sha: string } {
      const dir = temporaryRoot();
      git(dir, ['init', '--quiet', '--initial-branch=main']);
      git(dir, ['config', 'user.email', 'test@example.com']);
      git(dir, ['config', 'user.name', 'test']);
      write(dir, 'cli/update-boilerplate.ts', 'new code\n');
      write(dir, 'cli/lib/updater-core.ts', 'new core\n');
      git(dir, ['add', '-A']);
      git(dir, ['commit', '--quiet', '-m', 'upstream']);
      return { dir, sha: git(dir, ['rev-parse', 'HEAD']).trim() };
    }

    test('every cli/ file already matching upstream settles the component in the re-exec child', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      // The 7.x parent already overwrote cli/ with upstream's content before re-exec'ing.
      write(project, 'cli/update-boilerplate.ts', 'new code\n');
      write(project, 'cli/lib/updater-core.ts', 'new core\n');
      const reexecEnv = fakeEnv({ UPEX_UPDATER_REEXEC: '1' }); // no UPEX_UPDATER_SELF_UPDATED

      expect(selfUpdateComponentByContent(cfg, upstream, project, head, scaffoldSha, reexecEnv)).toEqual(['cli']);
    });

    test('not the re-exec child: no signal to act on', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      write(project, 'cli/update-boilerplate.ts', 'new code\n');
      write(project, 'cli/lib/updater-core.ts', 'new core\n');
      expect(selfUpdateComponentByContent(cfg, upstream, project, head, scaffoldSha, fakeEnv())).toEqual([]);
    });

    test('cursor already at HEAD: nothing left to settle', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      write(project, 'cli/update-boilerplate.ts', 'new code\n');
      write(project, 'cli/lib/updater-core.ts', 'new core\n');
      const reexecEnv = fakeEnv({ UPEX_UPDATER_REEXEC: '1' });
      expect(selfUpdateComponentByContent(cfg, upstream, project, head, head, reexecEnv)).toEqual([]);
    });

    test('no prior cursor at all (fresh install): nothing to settle, bootstrap handles it', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      write(project, 'cli/update-boilerplate.ts', 'new code\n');
      write(project, 'cli/lib/updater-core.ts', 'new core\n');
      const reexecEnv = fakeEnv({ UPEX_UPDATER_REEXEC: '1' });
      expect(selfUpdateComponentByContent(cfg, upstream, project, head, undefined, reexecEnv)).toEqual([]);
    });

    test('upstream moved again since the parent fetched: files differ again, syncs as usual', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      write(project, 'cli/update-boilerplate.ts', 'new code\n');
      write(project, 'cli/lib/updater-core.ts', 'stale core\n');
      const reexecEnv = fakeEnv({ UPEX_UPDATER_REEXEC: '1' });
      expect(selfUpdateComponentByContent(cfg, upstream, project, head, scaffoldSha, reexecEnv)).toEqual([]);
    });

    // Live shape: the --dry-run preview's re-exec (UPEX_UPDATER_REEXEC=1, no
    // UPEX_UPDATER_SELF_UPDATED) runs the fetched updater from the upstream
    // clone WITHOUT ever writing cli/ in the project (see the SELF-UPDATE
    // block's opts.dryRun branch). Local content is untouched and still
    // differs from upstream, so nothing settles: a preview must never move
    // the lock cursor.
    test('dry-run preview re-exec: cli/ was never written, content still differs, nothing settles', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      // The preview never wrote cli/: the project keeps its pre-existing (stale) copy.
      write(project, 'cli/update-boilerplate.ts', 'old code\n');
      write(project, 'cli/lib/updater-core.ts', 'old core\n');
      const reexecEnv = fakeEnv({ UPEX_UPDATER_REEXEC: '1' }); // no UPEX_UPDATER_SELF_UPDATED
      expect(selfUpdateComponentByContent(cfg, upstream, project, head, scaffoldSha, reexecEnv)).toEqual([]);
    });

    test('guard branches all short-circuit to []: no self-update component, component not declared, no files to walk', () => {
      const { dir: upstream, sha: head } = upstreamAtHead();
      const project = temporaryRoot();
      write(project, 'cli/update-boilerplate.ts', 'new code\n');
      write(project, 'cli/lib/updater-core.ts', 'new core\n');
      const reexecEnv = fakeEnv({ UPEX_UPDATER_REEXEC: '1' });

      // !cfg.selfUpdateComponent
      expect(selfUpdateComponentByContent({ components: [cliComponent] }, upstream, project, head, scaffoldSha, reexecEnv)).toEqual([]);
      // component not found among cfg.components
      expect(selfUpdateComponentByContent({ components: [], selfUpdateComponent: 'cli' }, upstream, project, head, scaffoldSha, reexecEnv)).toEqual([]);
      // no relPaths: the declared component's path does not exist in the upstream clone
      const missingPathComp: Component = { name: 'cli', type: 'directory', paths: ['does-not-exist'] };
      expect(selfUpdateComponentByContent({ components: [missingPathComp], selfUpdateComponent: 'cli' }, upstream, project, head, scaffoldSha, reexecEnv)).toEqual([]);
    });
  });
});

describe('isRepoOnlyPath', () => {
  const prefixes = ['docs/qa-standard'];

  test('matches the prefix itself', () => {
    expect(isRepoOnlyPath('docs/qa-standard', prefixes)).toBe(true);
  });

  test('matches anything beneath the prefix', () => {
    expect(isRepoOnlyPath('docs/qa-standard/planning-ladder-proposal.md', prefixes)).toBe(true);
    expect(isRepoOnlyPath('docs/qa-standard/nested/deep.md', prefixes)).toBe(true);
  });

  test('leaves siblings alone', () => {
    // The bug this guards: a naive startsWith would swallow all three.
    expect(isRepoOnlyPath('docs/qa-standards/x.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('docs/qa-standard-archive/x.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('docs/qa-standardish.md', prefixes)).toBe(false);
  });

  test('leaves unrelated paths alone', () => {
    expect(isRepoOnlyPath('docs/methodology/kata-fundamentals.md', prefixes)).toBe(false);
    expect(isRepoOnlyPath('.agents/skills/acli/SKILL.md', prefixes)).toBe(false);
  });

  test('does not match a parent of the prefix', () => {
    expect(isRepoOnlyPath('docs', prefixes)).toBe(false);
  });

  test('normalizes backslashes on both sides', () => {
    expect(isRepoOnlyPath('docs\\qa-standard\\x.md', prefixes)).toBe(true);
    expect(isRepoOnlyPath('docs/qa-standard/x.md', ['docs\\qa-standard'])).toBe(true);
  });

  test('tolerates a trailing slash in the configured prefix', () => {
    expect(isRepoOnlyPath('docs/qa-standard/x.md', ['docs/qa-standard/'])).toBe(true);
  });

  test('an empty prefix never matches, so a stray entry cannot blank the sync', () => {
    expect(isRepoOnlyPath('docs/anything.md', [''])).toBe(false);
    expect(isRepoOnlyPath('docs/anything.md', ['/'])).toBe(false);
  });

  test('no prefixes configured means nothing is filtered', () => {
    expect(isRepoOnlyPath('docs/qa-standard/x.md', [])).toBe(false);
  });
});
