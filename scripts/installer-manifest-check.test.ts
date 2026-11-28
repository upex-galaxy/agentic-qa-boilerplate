import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { installerManifestCheck } from './installer-manifest-check.ts';
import { contractsEnforced } from './lib/doc-contracts.ts';

interface Generator {
  MANIFEST_PATH: string
  readSources: () => unknown
  buildManifest: (sources: unknown) => { flags: string[] }
}

const REPO = resolve(import.meta.dir, '..');
const GENERATOR = 'packages/create-agentic-qa/scripts/gen-install-manifest.ts';
const CHECK_INPUTS = [
  'package.json',
  '.agents/project.yaml',
  'cli/install.ts',
  'cli/lib/ui/installer-run.ts',
  'cli/preflight.ts',
  'packages/create-agentic-qa/package.json',
  'packages/create-agentic-qa/src/installer-manifest.json',
  GENERATOR,
];

const roots: string[] = [];

function tempRoot(files: string[]): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'installer-check-')));
  roots.push(root);
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(REPO, file), join(root, file));
  }
  return root;
}

afterAll(() => {
  for (const root of roots) { rmSync(root, { recursive: true, force: true }); }
});

describe('installer:manifest:check', () => {
  test.skipIf(!contractsEnforced(REPO))('passes on a copy of the committed manifest and fails once that copy is stale', async () => {
    const root = tempRoot(CHECK_INPUTS);
    const fresh = installerManifestCheck(root);
    expect(fresh.stderr).not.toContain('DRIFT');
    expect(fresh.code).toBe(0);

    const generator = await import(join(root, GENERATOR)) as Generator;
    expect(generator.MANIFEST_PATH.startsWith(root)).toBe(true);
    const manifest = generator.buildManifest(generator.readSources());
    writeFileSync(generator.MANIFEST_PATH, JSON.stringify({ ...manifest, flags: manifest.flags.slice(1) }));

    const stale = installerManifestCheck(root);
    expect(stale.code).toBe(1);
    expect(stale.stderr).toContain('DRIFT');
  });

  test.skipIf(!contractsEnforced(REPO))('fails in the boilerplate when the scaffolder package is missing', () => {
    const root = tempRoot(['package.json', '.agents/project.yaml']);
    expect(installerManifestCheck(root).code).toBe(1);
  });

  test('exits 0 with a one-line note in a project, which has no packages/', () => {
    const root = tempRoot([]);
    writeFileSync(join(root, 'package.json'), '{"name":"downstream-project"}');
    const result = installerManifestCheck(root);
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
    expect(result.stdout).toContain('inert outside');
  });
});
