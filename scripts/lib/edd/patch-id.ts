import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanEnv, diffRange, gitOk } from './git.ts';

export const NO_PATCH = 'none';
export const MAX_DIFF_BYTES = 64 * 1024 * 1024;

export class DiffTooLarge extends Error {}

export function patchId(cwd: string, base: string, head: string, maxBytes = MAX_DIFF_BYTES): string {
  const dir = mkdtempSync(join(tmpdir(), 'edd-diff-'));
  try {
    const file = join(dir, 'diff');
    gitOk(cwd, ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--full-index', '--binary', `--output=${file}`, ...diffRange(base, head)]);
    const size = statSync(file).size;
    if (size > maxBytes) { throw new DiffTooLarge(`the diff is ${size} bytes, over the ${maxBytes}-byte cap: split the change`); }
    if (size === 0) { return NO_PATCH; }
    const p = Bun.spawnSync(['git', 'patch-id', '--verbatim'], { cwd, stdin: Bun.file(file), stdout: 'pipe', stderr: 'pipe', env: cleanEnv() });
    const id = p.stdout.toString().trim().split(/\s+/)[0];
    if (p.exitCode !== 0 || !id) { throw new Error(`git patch-id failed: ${p.stderr.toString().trim()}`); }
    return id;
  }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
