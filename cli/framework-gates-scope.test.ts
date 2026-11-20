/**
 * `checks.hooks.scope` in `.husky/framework-gates.sh`: `full` (the default) runs
 * every gate, `staged` runs each always-on gate only when the staged files or the
 * push range touch its inputs. A stub `bun` logs each call.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

const GATES = resolve(import.meta.dir, '..', '.husky', 'framework-gates.sh');
const IS_WINDOWS = process.platform === 'win32';
const ZERO = '0'.repeat(40);
const ID = ['-c', 'user.email=t@example.com', '-c', 'user.name=t'];

const roots: string[] = [];
afterEach(() => {
  while (roots.length > 0) { rmSync(roots.pop()!, { recursive: true, force: true }); }
});

const git = (root: string, ...args: string[]): string => Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' }).stdout.toString().trim();

function scoped(yaml: string) {
  const root = mkdtempSync(join(tmpdir(), 'qa gates staged '));
  roots.push(root);
  const bin = join(root, '.bin');
  mkdirSync(bin);
  const log = join(root, '.calls.log');
  writeFileSync(join(bin, 'bun'), `#!/bin/sh\necho "$*" >> "${log}"\nexit 0\n`);
  chmodSync(join(bin, 'bun'), 0o755);
  writeFileSync(join(root, 'package.json'), `${JSON.stringify({ scripts: { 'docs:check': 'x' } }, null, 2)}\n`);
  mkdirSync(join(root, '.agents'));
  writeFileSync(join(root, '.agents', 'project.yaml'), yaml);
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'a.md'), 'a\n');
  git(root, 'init', '-q');
  git(root, 'add', '-A');
  git(root, ...ID, 'commit', '-qm', 'base');
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
    git(root, 'add', '-A');
  };
  const commit = (rel: string, text: string): string => {
    write(rel, text);
    git(root, ...ID, 'commit', '-qm', rel);
    return git(root, 'rev-parse', 'HEAD');
  };
  const run = (fn: string, stdin?: string): { code: number, calls: string[], out: string } => {
    writeFileSync(log, '');
    const p = Bun.spawnSync(['sh', '-e', '-c', `. "${GATES}"; ${fn}`], {
      cwd: root,
      stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` },
    });
    return { code: p.exitCode ?? 1, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean), out: `${p.stdout.toString()}${p.stderr.toString()}` };
  };
  return { root, write, commit, run, base: git(root, 'rev-parse', 'HEAD') };
}

const STAGED = 'checks:\n  hooks:\n    scope: staged\n';
const FULL_COMMIT = ['run types:check', 'run vars:check', 'run skills:check'];
const FULL_PUSH = ['run format:check', 'run lint:check', 'run vars:env:check', 'run skills:registry:check', 'run kata:manifest:check', 'run agents:compat:check', 'run docs:check', 'run git:policy verify'];

describe('checks.hooks.scope', () => {
  test('absent, full or unknown: every gate; only the unknown value adds a line', () => {
    if (IS_WINDOWS) { return; }
    const absent = scoped('project: {}\n');
    absent.write('docs/a.md', 'b\n');
    const reference = absent.run('framework_gates_pre_commit');
    expect(reference.calls).toEqual(FULL_COMMIT);
    const full = scoped('checks:\n  hooks: { scope: full }\n');
    full.write('docs/a.md', 'b\n');
    expect(full.run('framework_gates_pre_commit')).toEqual(reference);
    expect(full.run('framework_gates_pre_push').calls).toEqual(FULL_PUSH);
    const typo = scoped('checks:\n  hooks:\n    scope: all\n');
    typo.write('docs/a.md', 'b\n');
    const warned = typo.run('framework_gates_pre_commit');
    expect(warned.calls).toEqual(FULL_COMMIT);
    expect(warned.out).toContain('is "all", not full or staged: every gate runs (full).');
  });

  test('staged pre-commit: content skips the trio; a test component runs types, skills (cited paths) and the kata manifest', () => {
    if (IS_WINDOWS) { return; }
    const content = scoped(STAGED);
    content.write('docs/a.md', 'b\n');
    const skipped = content.run('framework_gates_pre_commit');
    expect(skipped.calls).toEqual([]);
    expect(skipped.out).toContain('Skipped (no staged file touches their inputs): types:check, vars:check, skills:check.');
    const kata = scoped(STAGED);
    kata.write('tests/components/a.ts', 'export {};\n');
    expect(kata.run('framework_gates_pre_commit').calls).toEqual(['run types:check', 'run skills:check', 'run kata:manifest:check']);
  });

  test('staged pre-push: a content range runs docs:check and the host policy only; stdin stays readable', () => {
    if (IS_WINDOWS) { return; }
    const repo = scoped(STAGED);
    git(repo.root, 'update-ref', 'refs/remotes/origin/main', repo.base);
    const head = repo.commit('docs/a.md', 'c\n');
    const line = `refs/heads/main ${head} refs/heads/main ${repo.base}`;
    const result = repo.run('framework_gates_pre_push; echo "after: $(cat)"', `${line}\n`);
    expect(result.calls).toEqual(['run docs:check', 'run git:policy verify']);
    expect(result.out).toContain(`after: ${line}`);
    const tooling = scoped(STAGED);
    const top = tooling.commit('scripts/x.ts', 'export {};\n');
    expect(tooling.run('framework_gates_pre_push', `refs/heads/main ${top} refs/heads/main ${ZERO}\n`).calls).toEqual(FULL_PUSH);
    expect(tooling.run('framework_gates_pre_push').calls).toEqual(FULL_PUSH);
  });
});
