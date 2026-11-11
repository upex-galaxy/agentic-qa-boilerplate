#!/usr/bin/env bun
/**
 * @fileoverview One leg of the consumer matrix: a throwaway downstream project
 * synced from this checkout, then held to the gates a project runs.
 *
 *   bun packages/consumer-fixture/run-leg.ts --leg <name> --out <dir>
 *
 * Legs (LEGS below): `all` (every harness), `claude-only`, `codex-only`, and
 * `no-pi-legacy` (three harnesses, no `.pi/`: the shape of a project made
 * before Pi existed, which a fresh install would never reproduce).
 *
 * Per leg: `buildUpFixture` (scripts/ui-up-fixture.ts) makes an upstream clone
 * of HEAD and a consumer rolled back 30 commits with its lock there. The
 * consumer is then shaped into a downstream project (package renamed, the
 * maintainer sentinel line deleted, `harnesses:` set, the undeclared harness
 * files and `packages/` deleted) and must stop being the boilerplate
 * (`contractsEnforced` false). Then `bun sync --auto --no-gates` against the
 * local upstream, and the checks: exit 0, no boilerplate-only file left, no
 * undeclared harness file delivered, the project gates, a bare `bun test`.
 *
 * Lives under `packages/`, which the scaffold prunes and no sync delivers: it
 * is the boilerplate's own CI tooling (`.github/workflows/unit-tests.yml`,
 * job ConsumerMatrix). Exit 0 only when every check passed.
 */

import type { Harness } from '../../cli/lib/harness-selection.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { HARNESS_FILES, HARNESSES } from '../../cli/lib/harness-selection.ts';
import { isRepoOnlyForRun } from '../../cli/lib/updater-core.ts';
import { BOILERPLATE_TEST_PATHS, BOILERPLATE_TEST_PATTERNS } from '../../cli/update-boilerplate.ts';
import { contractsEnforced } from '../../scripts/lib/doc-contracts.ts';
import { buildUpFixture } from '../../scripts/ui-up-fixture.ts';

export interface Leg {
  harnesses: Harness[]
  /** Also delete `.pi/` as a whole (a project from before Pi). */
  noPiDir?: boolean
}

export const LEGS: Record<string, Leg> = {
  'all': { harnesses: ['claude', 'opencode', 'codex', 'pi'] },
  'claude-only': { harnesses: ['claude'] },
  'no-pi-legacy': { harnesses: ['claude', 'opencode', 'codex'], noPiDir: true },
  'codex-only': { harnesses: ['codex'] },
};

/** The gates a consumer runs (its `repo:check` minus format and `git:policy`, which need a host session). */
export const CONSUMER_GATES = ['types:check', 'lint:check', 'skills:check', 'instructions:check', 'docs:check', 'vars:check', 'board:check', 'shared:check', 'kata:manifest:check', 'agents:compat:check'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function run(cwd: string, cmd: string[], env: Record<string, string> = {}): { status: number, out: string } {
  const r = spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8', env: { ...process.env, ...env, CI: 'true' }, maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function git(cwd: string, ...args: string[]): void {
  const r = run(cwd, ['git', '-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', ...args]);
  if (r.status !== 0) { throw new Error(`git ${args.join(' ')}: ${r.out}`); }
}

function filesUnder(root: string, rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) { return []; }
  if (statSync(abs).isFile()) { return [rel]; }
  return readdirSync(abs).filter(n => n !== 'node_modules').flatMap(n => filesUnder(root, `${rel}/${n}`));
}

/** Turns the fixture consumer (a clone of this repo) into a downstream project of `leg`'s shape. */
export function shapeConsumer(consumer: string, leg: Leg): void {
  const pkgPath = join(consumer, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  pkg.name = 'consumer-fixture-project';
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  // The WHOLE sentinel line, and the blank line after it: a blank first line fails lint:check.
  const yamlPath = join(consumer, '.agents', 'project.yaml');
  const yaml = readFileSync(yamlPath, 'utf8').split('\n').filter(line => !line.startsWith('# MAINTAINER COPY:')).join('\n').replace(/^\n+/, '');
  writeFileSync(yamlPath, yaml.replace(/^harnesses:.*$/m, `harnesses: [${leg.harnesses.join(', ')}]`));
  for (const harness of HARNESSES.filter(h => !leg.harnesses.includes(h))) {
    for (const f of HARNESS_FILES[harness]) { rmSync(join(consumer, f), { force: true }); }
  }
  if (!leg.harnesses.includes('claude')) { rmSync(join(consumer, '.claude'), { recursive: true, force: true }); }
  if (!leg.harnesses.includes('opencode')) { rmSync(join(consumer, '.opencode'), { recursive: true, force: true }); }
  if (!leg.harnesses.includes('codex')) { rmSync(join(consumer, '.codex'), { recursive: true, force: true }); }
  if (leg.noPiDir || !leg.harnesses.includes('pi')) { rmSync(join(consumer, '.pi'), { recursive: true, force: true }); }
  // The scaffold prunes packages/ (TEMPLATE_EXCLUDES); a project never has it.
  rmSync(join(consumer, 'packages'), { recursive: true, force: true });
  git(consumer, 'add', '-A');
  git(consumer, 'commit', '-q', '-m', 'fixture: shaped as a downstream project');
}

export interface LegResult { name: string, checks: { check: string, ok: boolean, detail: string }[] }

export function runLeg(name: string, out: string): LegResult {
  const leg = LEGS[name];
  if (!leg) { throw new Error(`unknown leg "${name}" (one of: ${Object.keys(LEGS).join(', ')})`); }
  const result: LegResult = { name, checks: [] };
  const check = (label: string, ok: boolean, detail = ''): void => { result.checks.push({ check: label, ok, detail }); };

  const { upstream, consumer } = buildUpFixture(resolve(out), { back: 30 });
  shapeConsumer(consumer, leg);
  check('consumer is not the boilerplate (contractsEnforced false)', !contractsEnforced(consumer));

  const sync = run(consumer, ['bun', 'cli/update-boilerplate.ts', '--auto', '--no-gates'], { UPEX_TEMPLATE_REPO: upstream });
  check('bun sync --auto exits 0', sync.status === 0, sync.status === 0 ? '' : sync.out.split('\n').slice(-15).join('\n'));

  const lists = { repoOnlyPaths: BOILERPLATE_TEST_PATHS, repoOnlyPatterns: BOILERPLATE_TEST_PATTERNS };
  const left = [...filesUnder(consumer, 'cli'), ...filesUnder(consumer, 'scripts')].filter(f => isRepoOnlyForRun(lists, f));
  check('no boilerplate-only file left in cli/ or scripts/', left.length === 0, left.slice(0, 10).join(', '));

  const undeclared = HARNESSES.filter(h => !leg.harnesses.includes(h)).flatMap(h => HARNESS_FILES[h].filter(f => existsSync(join(consumer, f))));
  check('no file of an undeclared harness delivered', undeclared.length === 0, undeclared.join(', '));

  for (const gate of CONSUMER_GATES) {
    const r = run(consumer, ['bun', 'run', gate]);
    check(`bun run ${gate}`, r.status === 0, r.status === 0 ? '' : r.out.split('\n').slice(-12).join('\n'));
  }
  const tests = run(consumer, ['bun', 'test']);
  const ranBoilerplateTest = /^(?:cli|scripts)\/(?!api-login\.test\.ts:).*\.test\.[cm]?[jt]s:$/m.test(tests.out);
  check('bare bun test exits 0', tests.status === 0, tests.status === 0 ? '' : tests.out.split('\n').filter(l => /^\(fail\)|^ *\d+ (?:pass|fail)/.test(l)).slice(0, 15).join('\n'));
  check('bare bun test ran no boilerplate test', !ranBoilerplateTest);
  return result;
}

if (import.meta.main) {
  const name = arg('--leg');
  const out = arg('--out');
  if (!name || !out) {
    process.stderr.write(`usage: bun packages/consumer-fixture/run-leg.ts --leg <${Object.keys(LEGS).join('|')}> --out <dir>\n`);
    process.exit(2);
  }
  const result = runLeg(name, out);
  for (const c of result.checks) {
    process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'}  ${c.check}\n`);
    if (!c.ok && c.detail) { process.stdout.write(`${c.detail.split('\n').map(l => `      ${l}`).join('\n')}\n`); }
  }
  const failed = result.checks.filter(c => !c.ok).length;
  process.stdout.write(`\nleg ${name}: ${result.checks.length - failed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}
