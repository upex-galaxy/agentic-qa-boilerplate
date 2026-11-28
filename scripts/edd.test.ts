import type { GitStrategy } from './git-policy.ts';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { join, resolve } from 'node:path';
import { describe, expect, test } from 'bun:test';

import { parse as parseYaml } from 'yaml';

import { eddGateReady, migrationFor } from './git-policy.ts';
import { loadContract, treeReader } from './lib/edd/contract.ts';

const ROOT = resolve(import.meta.dir, '..');

describe('this repo keeps pushing exactly as before', () => {
  test('its explicit allowed reads as allowed in the hook and in the gate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'edd-probe-'));
    const script = join(dir, 'probe.sh');
    writeFileSync(script, `. '${join(ROOT, '.husky', 'framework-gates.sh')}'\n_fg_policy_value < '${join(ROOT, '.agents', 'project.yaml')}'\n`);
    const p = Bun.spawnSync(['sh', script], { cwd: ROOT, stdout: 'pipe' });
    rmSync(dir, { recursive: true, force: true });
    expect(p.stdout.toString().trim()).toBe('allowed');
    expect(loadContract(treeReader(ROOT), 'wt').facts.policy).toBe('allowed');
  });
});

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
