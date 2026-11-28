#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

import { contractsEnforced } from './lib/doc-contracts.ts';

export function installerManifestCheck(root: string): { code: number, stdout: string, stderr: string } {
  // A project gets this script and its package.json key but never packages/: the scaffold prunes it.
  if (!contractsEnforced(root)) {
    return { code: 0, stdout: 'installer:manifest:check: inert outside the boilerplate\'s own checkout (contractsEnforced).\n', stderr: '' };
  }
  const r = spawnSync(process.execPath, ['run', 'check:manifest'], { cwd: join(root, 'packages', 'create-agentic-qa'), encoding: 'utf8' });
  if (r.error) {
    return { code: 1, stdout: '', stderr: `installer:manifest:check: could not run check:manifest in packages/create-agentic-qa: ${r.error.message}\n` };
  }
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

if (import.meta.main) {
  const { code, stdout, stderr } = installerManifestCheck(resolve(import.meta.dir, '..'));
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  process.exit(code);
}
