/**
 * `cli/**` is synced wholesale into downstream projects and must type-check
 * under THEIR `tsconfig`, not only ours. The live sync into a Next.js host
 * failed `types:check` because `next/types/global.d.ts` augments
 * `NodeJS.ProcessEnv` with a required `NODE_ENV`, and two test files cast
 * plain objects straight to `ProcessEnv` (TS2352, five places).
 *
 * This test compiles `cli/**` with that augmentation in scope, from a scratch
 * tsconfig outside the repo, so the regression cannot come back unnoticed.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

const REPO_ROOT = resolve(import.meta.dir, '..');
const TSC = join(REPO_ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const scratch = mkdtempSync(join(tmpdir(), 'host-types '));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('cli/** under a host that requires NODE_ENV on ProcessEnv (Next.js)', () => {
  test.skipIf(!existsSync(TSC))('every cli/**/*.ts compiles with the augmentation in scope', () => {
    const posix = (p: string): string => p.replace(/\\/g, '/');
    // Ambient augmentation, verbatim from next/types/global.d.ts.
    writeFileSync(join(scratch, 'next-env.d.ts'), 'declare namespace NodeJS { interface ProcessEnv { NODE_ENV: \'development\' | \'production\' | \'test\' } }\n');
    mkdirSync(join(scratch, 'out'), { recursive: true });
    writeFileSync(join(scratch, 'tsconfig.json'), JSON.stringify({
      extends: posix(join(REPO_ROOT, 'tsconfig.json')),
      compilerOptions: {
        // Type roots resolve relative to THIS file: point them back at the repo.
        typeRoots: [posix(join(REPO_ROOT, 'node_modules', '@types')), posix(join(REPO_ROOT, 'node_modules'))],
        types: ['bun-types', 'node'],
      },
      include: [posix(join(REPO_ROOT, 'cli', '**', '*.ts')), posix(join(scratch, 'next-env.d.ts'))],
      exclude: [],
    }, null, 2));

    const res = spawnSync(TSC, ['--noEmit', '-p', join(scratch, 'tsconfig.json')], { cwd: scratch, encoding: 'utf8' });
    const output = `${res.stdout}${res.stderr}`;
    expect(output).not.toContain('TS2352');
    expect(output).not.toContain('NODE_ENV');
    expect(res.status).toBe(0);
  }, 120_000);
});
