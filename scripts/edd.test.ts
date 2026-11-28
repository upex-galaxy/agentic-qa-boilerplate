import type { GitStrategy } from './git-policy.ts';
import { existsSync, readFileSync } from 'node:fs';

import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { parse as parseYaml } from 'yaml';

import { eddGateReady, migrationFor } from './git-policy.ts';

const ROOT = resolve(import.meta.dir, '..');

describe('git:policy migrate sees the evidence gate of this repo', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const gate = eddGateReady({ hasScript: existsSync(join(ROOT, 'scripts', 'edd.ts')), hasPackageScript: 'edd' in pkg.scripts });

  test('scripts/edd.ts and the edd script exist, so the gate reads as ready', () => {
    expect(pkg.scripts.edd).toBe('bun scripts/edd.ts');
    expect(gate).toEqual({ ready: true, missing: [] });
  });

  test('so this repo\'s declared policy is no longer blocked by a missing gate', () => {
    const gs = (parseYaml(readFileSync(join(ROOT, '.agents', 'project.yaml'), 'utf8')) as { git_strategy: GitStrategy }).git_strategy;
    expect(migrationFor(gs, gate).action).not.toBe('blocked');
    expect(migrationFor({ ...gs, policy: { ...gs.policy, direct_push_to_protected: 'allowed' } }, gate)).toMatchObject({ action: 'rewrite', direct_push_to_protected: 'evidence' });
  });
});
