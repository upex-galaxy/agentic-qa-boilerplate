import { dirname } from 'node:path';

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export interface GitResult { code: number, out: string, err: string }

export function git(cwd: string, args: string[], input?: string): GitResult {
  const p = Bun.spawnSync(['git', ...args], { cwd, stdin: input === undefined ? 'ignore' : Buffer.from(input), stdout: 'pipe', stderr: 'pipe' });
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() };
}

export function gitOk(cwd: string, args: string[], input?: string): string {
  const r = git(cwd, args, input);
  if (r.code !== 0) { throw new Error(`git ${args.join(' ')} failed: ${r.err.trim() || r.out.trim()}`); }
  return r.out.trim();
}

export function isZeroOid(oid: string): boolean {
  return /^0+$/.test(oid);
}

export function isCommit(cwd: string, ref: string): boolean {
  return git(cwd, ['cat-file', '-e', `${ref}^{commit}`]).code === 0;
}

export function resolveCommit(cwd: string, ref: string): string | null {
  const r = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.code === 0 ? r.out.trim() : null;
}

export function repoRoot(cwd: string): string {
  return gitOk(cwd, ['rev-parse', '--show-toplevel']);
}

export function primaryRoot(cwd: string): string {
  return dirname(gitOk(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
}

export function showFile(cwd: string, ref: string, path: string): string | null {
  const r = git(cwd, ['show', `${ref}:${path}`]);
  return r.code === 0 ? r.out : null;
}

export function treeOf(cwd: string, sha: string): string {
  return gitOk(cwd, ['rev-parse', `${sha}^{tree}`]);
}

export function parentsOf(cwd: string, sha: string): string[] {
  const line = gitOk(cwd, ['rev-list', '--parents', '-n', '1', sha]);
  return line.split(/\s+/).slice(1).filter(Boolean);
}

export function commitMessage(cwd: string, sha: string): string {
  return git(cwd, ['log', '-1', '--format=%B', sha]).out;
}

export function commitTime(cwd: string, sha: string): number {
  return Number(gitOk(cwd, ['log', '-1', '--format=%ct', sha]));
}

export function trailerValues(cwd: string, sha: string, key: string): string[] {
  const out = git(cwd, ['log', '-1', `--format=%(trailers:key=${key},valueonly,separator=%x00)`, sha]).out;
  return out.split('\0').map(s => s.trim()).filter(Boolean);
}

export function mergeBase(cwd: string, a: string, b: string): string | null {
  const r = git(cwd, ['merge-base', a, b]);
  return r.code === 0 ? r.out.trim() : null;
}

export function diffRange(base: string, head: string): string[] {
  return base === EMPTY_TREE ? [EMPTY_TREE, head] : [`${base}...${head}`];
}

export function changedFiles(cwd: string, base: string, head: string): string[] {
  const out = gitOk(cwd, ['diff', '--name-only', '--no-renames', ...diffRange(base, head)]);
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

export function rangeCommits(cwd: string, base: string, head: string): string[] {
  const range = base === EMPTY_TREE ? [head] : [head, '--not', base];
  const out = git(cwd, ['rev-list', ...range]).out;
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}
