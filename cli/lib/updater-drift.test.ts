import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  detectProtectedDrift,
  mergeProtectedWatchlist,
  persistMarkers,
  PROJECT_PROTECTED_REASON,
  projectProtectedPaths,
  readProjectProtectedPaths,
  resolveMarkerPath,
  splitFirstProjectAdvice,
} from './updater-drift.ts';

const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'drift '));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, contents: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function git(root: string, args: string[]): string {
  const res = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (res.status !== 0) { throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`); }
  return res.stdout;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

describe('updater.protected_paths (.agents/project.yaml)', () => {
  test('valid repo-relative file paths are kept in order, normalized and deduplicated', () => {
    const yaml = 'project:\n  project_name: acme\nupdater:\n  protected_paths:\n    - .husky/pre-push\n    - ./scripts/lint-vars.ts\n    - .agents\\skills\\acli\\SKILL.md\n    - scripts/lint-vars.ts\n';
    expect(projectProtectedPaths(yaml)).toEqual({ paths: ['.husky/pre-push', 'scripts/lint-vars.ts', '.agents/skills/acli/SKILL.md'], rejected: [] });
  });

  test('a missing block, an empty list or an absent file yields nothing', () => {
    expect(projectProtectedPaths(null)).toEqual({ paths: [], rejected: [] });
    expect(projectProtectedPaths('project:\n  project_name: acme\n')).toEqual({ paths: [], rejected: [] });
    expect(projectProtectedPaths('updater:\n  protected_paths: []\n')).toEqual({ paths: [], rejected: [] });
    expect(projectProtectedPaths('updater:\n  protected_paths:\n')).toEqual({ paths: [], rejected: [] });
    expect(readProjectProtectedPaths(temporaryRoot())).toEqual({ paths: [], rejected: [] });
  });

  test('paths outside the repo, under .git, directories and non-strings are rejected with a reason, never fatal', () => {
    const yaml = [
      'updater:',
      '  protected_paths:',
      '    - /etc/passwd',
      '    - C:\\Users\\x\\file',
      '    - ../sibling/file',
      '    - scripts/../../x',
      '    - .git/hooks/pre-push',
      '    - .husky/',
      '    - 42',
      '    - ""',
      '    - .husky/pre-push',
      '',
    ].join('\n');
    const out = projectProtectedPaths(yaml);
    expect(out.paths).toEqual(['.husky/pre-push']);
    expect(out.rejected).toEqual([
      { value: '/etc/passwd', reason: 'outside the repo (absolute path)' },
      { value: 'C:\\Users\\x\\file', reason: 'outside the repo (absolute path)' },
      { value: '../sibling/file', reason: 'outside the repo (`..` segment)' },
      { value: 'scripts/../../x', reason: 'outside the repo (`..` segment)' },
      { value: '.git/hooks/pre-push', reason: 'under .git' },
      { value: '.husky/', reason: 'a directory (list each file)' },
      { value: '42', reason: 'not a path (expected a non-empty string)' },
      { value: '', reason: 'not a path (expected a non-empty string)' },
    ]);
  });

  test('a block of the wrong shape is one rejected entry; unparsable YAML too', () => {
    expect(projectProtectedPaths('updater: nope\n').rejected).toEqual([{ value: 'updater', reason: 'must be a mapping with a protected_paths list' }]);
    expect(projectProtectedPaths('updater:\n  protected_paths: .husky/pre-push\n').rejected).toEqual([{ value: 'updater.protected_paths', reason: 'must be a list of repo-relative file paths' }]);
    const broken = projectProtectedPaths('updater:\n  protected_paths: [\n');
    expect(broken.paths).toEqual([]);
    expect(broken.rejected[0].value).toBe('updater.protected_paths');
    expect(broken.rejected[0].reason).toStartWith('cannot parse .agents/project.yaml');
  });

  test('the file is read from <root>/.agents/project.yaml', () => {
    const root = temporaryRoot();
    write(root, '.agents/project.yaml', 'updater:\n  protected_paths:\n    - docs/conventions.md\n');
    expect(readProjectProtectedPaths(root).paths).toEqual(['docs/conventions.md']);
  });

  test('merging into the upstream list adds only new paths, each with the project reason and source', () => {
    const upstream = [{ path: 'AGENTS.md', reason: 'memory' }, { path: '.husky/pre-push', reason: 'project gates live here', structural: false }];
    const merged = mergeProtectedWatchlist(upstream, ['.husky/pre-push', 'scripts/x.ts', 'scripts/x.ts']);
    expect(merged).toEqual([
      { path: 'AGENTS.md', reason: 'memory', source: 'upstream' },
      { path: '.husky/pre-push', reason: 'project gates live here', structural: false, source: 'upstream' },
      { path: 'scripts/x.ts', reason: PROJECT_PROTECTED_REASON, source: 'project' },
    ]);
  });
});

describe('detectProtectedDrift over a project-declared entry', () => {
  test('fires once per upstream change (marker), same as an upstream entry; identical copies never fire', () => {
    const upstream = temporaryRoot();
    const project = temporaryRoot();
    write(upstream, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\n');
    write(project, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\nbun run e2e\n');
    write(upstream, 'scripts/x.ts', 'a\n');
    write(project, 'scripts/x.ts', 'a\n');
    const watchlist = mergeProtectedWatchlist([{ path: '.husky/pre-push', reason: 'project gates live here' }], ['scripts/x.ts', 'docs/absent.md']);

    const first = detectProtectedDrift(watchlist, upstream, project);
    expect(first.map(d => [d.path, d.firstAdvice])).toEqual([['.husky/pre-push', true]]);
    persistMarkers(first, project);
    expect(readFileSync(resolveMarkerPath(first[0], project), 'utf8').trim()).toBe(first[0].upstreamSha);
    // Same upstream content: nothing new to say, the project edit stays.
    expect(detectProtectedDrift(watchlist, upstream, project)).toEqual([]);
    // Upstream changed: one more nudge.
    write(upstream, '.husky/pre-push', '#!/bin/sh\nbun run repo:check\nbun run new:gate\n');
    expect(detectProtectedDrift(watchlist, upstream, project).map(d => [d.path, d.firstAdvice])).toEqual([['.husky/pre-push', false]]);
  });
});

describe('a freshly protected path gets its marker seeded, not a row', () => {
  // Live finding (Bunkai, third run): `scripts/lint-skills.ts` was merged by
  // hand, declared in `updater.protected_paths` and left uncommitted; the
  // dry-run and the re-run both showed one residual "content differs" row
  // for it until a real run had persisted the marker.
  test('project-declared first advice is seeded; upstream first advice and later upstream changes are advised', () => {
    const upstream = temporaryRoot();
    const project = temporaryRoot();
    write(upstream, 'AGENTS.md', '# upstream memory\n');
    write(project, 'AGENTS.md', '# project memory\n');
    write(upstream, 'scripts/lint-skills.ts', 'upstream\n');
    write(project, 'scripts/lint-skills.ts', 'project merge, uncommitted\n');
    const watchlist = mergeProtectedWatchlist([{ path: 'AGENTS.md', reason: 'memory' }], ['scripts/lint-skills.ts']);

    const first = splitFirstProjectAdvice(detectProtectedDrift(watchlist, upstream, project));
    expect(first.advised.map(d => d.path)).toEqual(['AGENTS.md']);
    expect(first.seeded.map(d => [d.path, d.firstAdvice])).toEqual([['scripts/lint-skills.ts', true]]);
    // The wrapper persists both: the seeded marker holds the current upstream sha.
    persistMarkers([...first.advised, ...first.seeded], project);
    expect(readFileSync(resolveMarkerPath(first.seeded[0], project), 'utf8').trim()).toBe(first.seeded[0].upstreamSha);
    // Same upstream, still uncommitted locally: nothing at all.
    expect(detectProtectedDrift(watchlist, upstream, project)).toEqual([]);
    // Upstream changed the protected file: now the row is due, as second advice.
    write(upstream, 'scripts/lint-skills.ts', 'upstream v2\n');
    const second = splitFirstProjectAdvice(detectProtectedDrift(watchlist, upstream, project));
    expect(second.seeded).toEqual([]);
    expect(second.advised.map(d => [d.path, d.firstAdvice])).toEqual([['scripts/lint-skills.ts', false]]);
  });
});

describe('a first-advice entry with no upstream change since the lock cursor gets no row either', () => {
  // Live finding: a migrated repo (or one running the per-file marker
  // tracking for the first time) has no marker on ANY watched file yet, so
  // every one of them reads as first advice even when upstream genuinely
  // never touched it since the project's own lock cursor — noise, not a new
  // upstream change to review.
  function upstreamRepoAtCursor(): { dir: string, cursor: string } {
    const dir = temporaryRoot();
    git(dir, ['init', '--quiet', '--initial-branch=main']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'test']);
    write(dir, 'AGENTS.md', '# memory v1\n');
    write(dir, 'docs/conventions.md', '# conventions v1\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'cursor']);
    const cursor = git(dir, ['rev-parse', 'HEAD']).trim();
    // Upstream moves one watched file after the cursor, leaves the other alone.
    write(dir, 'docs/conventions.md', '# conventions v2\n');
    git(dir, ['add', '-A']);
    git(dir, ['commit', '--quiet', '-m', 'later']);
    return { dir, cursor };
  }

  test('seeded silently when unchanged since the cursor; advised when it changed, the cursor is unknown, or no check is given at all', () => {
    const { dir: upstream, cursor } = upstreamRepoAtCursor();
    const project = temporaryRoot();
    // A migrated repo: both files were customized long before markers existed.
    write(project, 'AGENTS.md', '# project memory, predates markers\n');
    write(project, 'docs/conventions.md', '# project conventions, predates markers\n');
    const watchlist = mergeProtectedWatchlist(
      [{ path: 'AGENTS.md', reason: 'memory' }, { path: 'docs/conventions.md', reason: 'conventions' }],
      [],
    );
    const drifted = detectProtectedDrift(watchlist, upstream, project);
    expect(drifted.map(d => [d.path, d.firstAdvice]).sort()).toEqual([['AGENTS.md', true], ['docs/conventions.md', true]]);

    const withCursor = splitFirstProjectAdvice(drifted, { tempDir: upstream, lockCursor: cursor });
    expect(withCursor.seededNoUpstreamChange.map(d => d.path)).toEqual(['AGENTS.md']);
    expect(withCursor.advised.map(d => d.path)).toEqual(['docs/conventions.md']);
    expect(withCursor.seeded).toEqual([]);
    // The wrapper persists all three buckets: the seeded marker holds the current upstream sha.
    persistMarkers([...withCursor.advised, ...withCursor.seeded, ...withCursor.seededNoUpstreamChange], project);
    expect(readFileSync(resolveMarkerPath(withCursor.seededNoUpstreamChange[0], project), 'utf8').trim()).toBe(withCursor.seededNoUpstreamChange[0].upstreamSha);

    // Unknown cursor (no lock yet): today's first advice is kept for both.
    const unknownCursor = splitFirstProjectAdvice(drifted, { tempDir: upstream, lockCursor: null });
    expect(unknownCursor.advised.map(d => d.path).sort()).toEqual(['AGENTS.md', 'docs/conventions.md']);
    expect(unknownCursor.seededNoUpstreamChange).toEqual([]);

    // No cursor check passed at all: same as before this feature existed.
    const noCheck = splitFirstProjectAdvice(drifted);
    expect(noCheck.advised.map(d => d.path).sort()).toEqual(['AGENTS.md', 'docs/conventions.md']);
    expect(noCheck.seededNoUpstreamChange).toEqual([]);
  });

  test('a project-declared entry keeps its own unconditional seed rule, even when upstream did move since the cursor', () => {
    const { dir: upstream, cursor } = upstreamRepoAtCursor();
    const project = temporaryRoot();
    write(project, 'docs/conventions.md', 'project merge, uncommitted\n');
    const watchlist = mergeProtectedWatchlist([], ['docs/conventions.md']);
    const drifted = detectProtectedDrift(watchlist, upstream, project);
    const split = splitFirstProjectAdvice(drifted, { tempDir: upstream, lockCursor: cursor });
    expect(split.seeded.map(d => d.path)).toEqual(['docs/conventions.md']);
    expect(split.advised).toEqual([]);
    expect(split.seededNoUpstreamChange).toEqual([]);
  });

  test('a non-git tempDir (or an unreachable cursor) falls back to advised, never silently drops the row', () => {
    const upstream = temporaryRoot(); // plain directory, no git init
    write(upstream, 'AGENTS.md', '# memory\n');
    const project = temporaryRoot();
    write(project, 'AGENTS.md', '# project memory\n');
    const watchlist = mergeProtectedWatchlist([{ path: 'AGENTS.md', reason: 'memory' }], []);
    const drifted = detectProtectedDrift(watchlist, upstream, project);
    const split = splitFirstProjectAdvice(drifted, { tempDir: upstream, lockCursor: 'deadbeef'.repeat(5) });
    expect(split.advised.map(d => d.path)).toEqual(['AGENTS.md']);
    expect(split.seededNoUpstreamChange).toEqual([]);
  });
});
