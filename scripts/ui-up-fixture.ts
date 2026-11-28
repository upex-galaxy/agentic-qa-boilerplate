#!/usr/bin/env bun
/**
 * @fileoverview A throwaway upstream + consumer pair to run `bun sync` against
 * (installer-ui delivery 2: the page, `--headless` and `--auto` end to end),
 * never a real project.
 *
 *   bun scripts/ui-up-fixture.ts --out <dir> [--back <n>] [--self-update]
 *
 * <dir>/upstream  a clone of this repo at HEAD (committed work only). With
 *                 `--self-update` it gets one more commit that touches `cli/`,
 *                 so the consumer's updater re-execs itself mid-run.
 * <dir>/consumer  the same repo, its synced folders rolled back `--back`
 *                 commits (default 30) and its lock pointing there, so the run
 *                 has files to bring; one synced file edited on both sides,
 *                 so it has a divergence to ask about.
 *
 * Prints the command to run. `UPEX_TEMPLATE_REPO` points at the local upstream,
 * so no gh session and no network are involved.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { COMPONENTS } from '../cli/update-boilerplate.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', ['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', '-C', cwd, ...args], { encoding: 'utf8' });
  if (r.status !== 0) { throw new Error(`git ${args.join(' ')} (${cwd}): ${r.stderr}`); }
  return r.stdout.trim();
}

export interface UpFixture {
  upstream: string
  consumer: string
  /** The synced file edited on both sides, when the range has one. */
  edited: string | null
}

/** Builds the pair under `root` (wiped first). */
export function buildUpFixture(root: string, opts: { back?: number, selfUpdate?: boolean } = {}): UpFixture {
  const back = opts.back ?? 30;
  const repo = resolve(import.meta.dir, '..');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });

  const upstream = join(root, 'upstream');
  const consumer = join(root, 'consumer');
  git(root, 'clone', '-q', '--no-hardlinks', repo, upstream);
  const head = git(upstream, 'rev-parse', 'HEAD');
  const base = git(upstream, 'rev-parse', `HEAD~${back}`);

  git(root, 'clone', '-q', '--no-hardlinks', repo, consumer);
  // Synced content rolled back to `base`: the run brings those files forward.
  const rolled = ['.agents/skills', 'docs', 'scripts'].filter(p => existsSync(join(consumer, p)));
  git(consumer, 'checkout', base, '--', ...rolled);
  // One synced file edited by the project too: upstream changed it since `base`.
  const edited = git(upstream, 'diff', '--name-only', '--diff-filter=M', base, head, '--', '.agents/skills').split('\n').find(p => p.endsWith('/SKILL.md')) ?? null;
  if (edited) { appendFileSync(join(consumer, edited), '\n<!-- project note: kept by the team -->\n'); }

  mkdirSync(join(consumer, '.template'), { recursive: true });
  const lock = { schemaVersion: 7, templateRepo: upstream, templateCommit: base, perComponentCommit: Object.fromEntries(COMPONENTS.map(c => [c.name, base])), syncedComponents: COMPONENTS.map(c => c.name), ignoreFileSync: {}, packageJsonSync: {}, cliVersion: 'fixture', lastSyncedAt: new Date(0).toISOString(), variableSystemVersion: 1 };
  writeFileSync(join(consumer, '.template', 'boilerplate.lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
  git(consumer, 'add', '-A');
  git(consumer, 'commit', '-q', '-m', 'fixture: consumer behind upstream');

  if (opts.selfUpdate) {
    appendFileSync(join(upstream, 'cli', 'lib', 'tui.ts'), '\n// fixture: a newer updater release\n');
    git(upstream, 'commit', '-q', '-am', 'fixture: newer cli');
  }
  // The consumer resolves the updater's dependencies from this checkout.
  if (existsSync(join(repo, 'node_modules'))) { symlinkSync(join(repo, 'node_modules'), join(consumer, 'node_modules'), 'dir'); }
  return { upstream, consumer, edited };
}

if (import.meta.main) {
  const out = arg('--out');
  if (!out) {
    process.stderr.write('usage: bun scripts/ui-up-fixture.ts --out <dir> [--back <n>] [--self-update]\n');
    process.exit(2);
  }
  const f = buildUpFixture(resolve(out), { back: Number(arg('--back') ?? 30), selfUpdate: process.argv.includes('--self-update') });
  process.stdout.write(`upstream: ${f.upstream}\nconsumer: ${f.consumer}${f.edited ? ` (edited on both sides: ${f.edited})` : ''}\n\n`
    + `  cd ${f.consumer} && UPEX_TEMPLATE_REPO=${f.upstream} bun cli/update-boilerplate.ts [--headless|--auto|--dry-run|--ui]\n`);
}
