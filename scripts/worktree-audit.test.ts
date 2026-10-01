/**
 * Regression tests for `scripts/worktree-audit.ts` and the table behind it
 * (`cli/lib/worktree.ts`), against a real temp repo + `git worktree add`.
 * What they guard:
 *   1. Every class lands where the table says (state / cache / disposable /
 *      unknown), including PBI files git collapses into one directory.
 *   2. Exit 1 while STATE or UNKNOWN is only in the worktree; 0 when nothing
 *      durable is left; 2 on the primary checkout.
 *   3. `--rescue` copies STATE to the same path in the primary, never
 *      overwrites (identical bytes = rescued, different bytes = conflict), and
 *      leaves the worktree untouched. `--dry-run` writes nothing.
 *   4. Test-run outputs the owner accepted losing are DISPOSABLE (decision D7).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { auditWorktree, checkoutRoots, classify } from '../cli/lib/worktree.ts';

const SCRIPT = resolve(import.meta.dir, 'worktree-audit.ts');
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function git(cwd: string, ...args: string[]): void {
  const p = Bun.spawnSync(['git', '-C', cwd, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) { throw new Error(`git ${args.join(' ')}: ${p.stderr.toString()}`); }
}

function put(root: string, rel: string, body = 'x\n'): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), body);
}

/** A primary with this repo's ignore shape, and one worktree of it. */
function fixture(): { primary: string, wt: string } {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'worktree-audit-')));
  roots.push(base);
  const primary = join(base, 'primary');
  mkdirSync(primary);
  git(primary, 'init', '-q', '-b', 'main');
  put(primary, '.gitignore', [
    'node_modules/',
    '.env',
    '.auth/',
    '.session/',
    '.scratch/',
    '.allure/',
    'reports/',
    'test-results/',
    '.context/*',
    '!.context/PBI/',
    '.context/PBI/*',
    '!.context/PBI/README.md',
    'mystery.bin',
    '',
  ].join('\n'));
  put(primary, '.context/PBI/README.md', '# PBI\n');
  git(primary, 'add', '.');
  git(primary, '-c', 'user.email=t@t.invalid', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
  const wt = join(base, 'wt');
  git(primary, 'worktree', 'add', '-q', '-b', 'probe', wt);
  return { primary, wt };
}

function run(args: string[]): { code: number, out: string } {
  const p = Bun.spawnSync(['bun', SCRIPT, ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}` };
}

describe('classify', () => {
  test('one class per path, first rule wins', () => {
    expect(classify('.session/').class).toBe('state');
    expect(classify('.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/evidence/shot.png').class).toBe('state');
    expect(classify('.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/context.md').class).toBe('state');
    expect(classify('.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/story.md').class).toBe('cache');
    expect(classify('.backups/2026-01-01/').class).toBe('state');
    expect(classify('node_modules/').class).toBe('cache');
    expect(classify('.env').class).toBe('cache');
    expect(classify('.env.example').class).toBe('unknown');
    expect(classify('test-results/').class).toBe('disposable');
    expect(classify('something-new.txt').class).toBe('unknown');
  });

  test('test-run outputs are disposable by owner decision', () => {
    for (const path of ['.allure/', 'reports/', '.auth/']) {
      expect(classify(path).class).toBe('disposable');
    }
  });
});

describe('worktree-audit', () => {
  test('resolves both roots and tells a worktree from the primary', () => {
    const { primary, wt } = fixture();
    expect(checkoutRoots(wt)).toEqual({ repoRoot: wt, primaryRoot: primary, linked: true });
    expect(checkoutRoots(primary)).toEqual({ repoRoot: primary, primaryRoot: primary, linked: false });
    expect(run([primary]).code).toBe(2);
  });

  test('a worktree holding only cache and disposable files exits 0', () => {
    const { wt } = fixture();
    put(wt, 'node_modules/pkg/index.js');
    put(wt, '.env', 'SECRET=never-printed\n');
    put(wt, 'test-results/run.txt');
    put(wt, '.allure/history.jsonl');
    const result = run([wt]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('removing this worktree loses no state');
    expect(result.out).not.toContain('never-printed');
  });

  test('state and unknown exit 1; PBI is walked file by file', () => {
    const { wt } = fixture();
    put(wt, '.session/fd/plan.md');
    put(wt, '.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/story.md');
    put(wt, '.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/evidence/shot.png');
    put(wt, 'mystery.bin');
    const entries = auditWorktree(wt);
    const of = (p: string) => entries.find(e => e.path === p)?.class;
    expect(of('.session/')).toBe('state');
    expect(of('.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/evidence/shot.png')).toBe('state');
    expect(of('.context/PBI/epics/EPIC-1-a/stories/STORY-2-b/story.md')).toBe('cache');
    expect(of('mystery.bin')).toBe('unknown');
    expect(run([wt]).code).toBe(1);
  });

  test('--rescue copies state into the primary and never overwrites', () => {
    const { primary, wt } = fixture();
    put(wt, '.session/fd/plan.md', 'from the worktree\n');
    put(wt, '.session/fd/progress.md', 'same\n');
    put(wt, '.scratch/note.md', 'worktree note\n');
    put(primary, '.session/fd/progress.md', 'same\n');
    put(primary, '.scratch/note.md', 'primary note\n');

    const dry = run([wt, '--rescue', '--dry-run']);
    expect(dry.out).toContain('would copy');
    expect(existsSync(join(primary, '.session/fd/plan.md'))).toBe(false);

    const result = run([wt, '--rescue']);
    expect(readFileSync(join(primary, '.session/fd/plan.md'), 'utf8')).toBe('from the worktree\n');
    expect(readFileSync(join(primary, '.scratch/note.md'), 'utf8')).toBe('primary note\n');
    expect(result.out).toContain('identical  .session/fd/progress.md');
    expect(result.out).toContain('CONFLICT   .scratch/note.md');
    expect(result.code).toBe(1);
    // Read-only on the worktree.
    expect(readFileSync(join(wt, '.scratch/note.md'), 'utf8')).toBe('worktree note\n');

    // Resolve the conflict by hand: the next rescue is clean.
    put(primary, '.scratch/note.md', 'worktree note\n');
    expect(run([wt, '--rescue']).code).toBe(0);
  });
});
