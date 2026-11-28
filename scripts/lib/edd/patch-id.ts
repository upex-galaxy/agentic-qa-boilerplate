import { diffRange, git, gitOk } from './git.ts';

export const NO_PATCH = 'none';

export function patchId(cwd: string, base: string, head: string): string {
  const diff = gitOk(cwd, ['diff', '--no-color', '--no-ext-diff', '--full-index', '--binary', ...diffRange(base, head)]);
  if (diff.length === 0) { return NO_PATCH; }
  const r = git(cwd, ['patch-id', '--verbatim'], `${diff}\n`);
  const id = r.out.trim().split(/\s+/)[0];
  if (r.code !== 0 || !id) { throw new Error(`git patch-id failed: ${r.err.trim()}`); }
  return id;
}
