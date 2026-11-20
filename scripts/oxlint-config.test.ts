/**
 * @fileoverview Proves `.oxlintrc.base.json` runs the KATA rules under Oxlint,
 * not just ESLint. Each case lints a planted violation in a scratch project
 * whose config extends the real base, so a plugin that stops loading, an
 * `overrides` glob that stops matching or a pattern Oxlint reads differently
 * fails here instead of in a pre-commit that quietly reports nothing.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';

const ROOT = resolve(import.meta.dir, '..');
const OXLINT = join(ROOT, 'node_modules', '.bin', 'oxlint');
const scratch = mkdtempSync(join(tmpdir(), 'oxlint-config-'));

writeFileSync(join(scratch, '.oxlintrc.json'), JSON.stringify({ extends: [join(ROOT, '.oxlintrc.base.json')] }));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function lint(path: string, code: string): string {
  const file = join(scratch, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, code);
  const result = Bun.spawnSync([OXLINT, '-c', '.oxlintrc.json', '--format=json', path], { cwd: scratch });
  const report = JSON.parse(result.stdout.toString()) as { diagnostics: { code: string }[] };
  if (result.exitCode !== 0 && report.diagnostics.length === 0) { throw new Error(`oxlint exited ${result.exitCode}: ${result.stderr.toString()}`); }
  return report.diagnostics.map(d => d.code).join('\n');
}

describe('oxlint severity follows KATA_ENFORCEMENT_LEVEL', () => {
  it('every KATA severity in .oxlintrc.base.json equals the ESLint constant', async () => {
    const { KATA_ENFORCEMENT_LEVEL } = await import('../eslint.config.base.js');
    const base = JSON.parse(readFileSync(join(ROOT, '.oxlintrc.base.json'), 'utf8')) as { overrides: { rules: Record<string, unknown> }[] };
    const severities = base.overrides.flatMap(o => Object.entries(o.rules))
      .filter(([name]) => /^(?:kata|playwright)\//.test(name) || name === 'max-params' || name === 'max-lines')
      .map(([, value]) => (Array.isArray(value) ? value[0] : value))
      .filter(value => value !== 'off');
    expect(severities.length).toBeGreaterThan(10);
    expect(new Set(severities)).toEqual(new Set([KATA_ENFORCEMENT_LEVEL]));
  });
});

describe('oxlint runs the KATA rules', () => {
  it('kata/layer-imports reports a spec importing test from @playwright/test', () => {
    expect(lint('tests/e2e/a.spec.ts', 'import { test } from \'@playwright/test\';\nexport { test };\n')).toContain('kata(layer-imports)');
  });

  it('kata/no-raw-page-in-spec reports a destructured page', () => {
    expect(lint('tests/e2e/b.spec.ts', 'test(\'x\', async ({ page }) => { await page.title(); });\n')).toContain('kata(no-raw-page-in-spec)');
  });

  it('playwright/missing-playwright-await reports an unawaited matcher', () => {
    expect(lint('tests/e2e/c.spec.ts', 'test(\'x\', async ({ ui }) => { expect(ui).toBeVisible(); });\n')).toContain('playwright(missing-playwright-await)');
  });

  it('no-restricted-imports blocks a relative import under tests/', () => {
    expect(lint('tests/utils/d.ts', 'import { x } from \'../data/DataFactory\';\nexport { x };\n')).toContain('no-restricted-imports');
  });

  it('no-restricted-imports blocks cli/ importing outside cli/', () => {
    expect(lint('cli/e.ts', 'import { x } from \'../scripts/foo\';\nexport { x };\n')).toContain('no-restricted-imports');
  });

  it('max-params reports a third parameter on a domain component', () => {
    expect(lint('tests/components/ui/F.ts', 'export class F { a(p1: number, p2: number, p3: number) { return p1 + p2 + p3; } }\n')).toContain('max-params');
  });

  it('a clean spec is silent', () => {
    expect(lint('tests/e2e/g.spec.ts', 'import { expect, test } from \'@TestFixture\';\ntest(\'x\', async ({ ui }) => { await expect(ui).toBeVisible(); });\n')).toBe('');
  });
});
