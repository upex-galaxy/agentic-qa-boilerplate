#!/usr/bin/env bun
/**
 * launch.ts — starts a harness or a test run with the repo's environment.
 *
 *   bun --no-env-file scripts/launch.ts [--warn] <bin> [args...]
 *
 * Behind `bun run claude|codex|opencode` and the `test*` scripts. Two steps,
 * after one quiet clean-up: when a secret-manager overlay exists
 * (`.env.provider.schema`), the EMPTY inherited copies of the keys it resolves
 * are dropped, because an empty variable would win over the vault and CI turns
 * every unset secret into one (`withoutEmptyProviderShadows`).
 *
 *   1. PREFLIGHT. varlock lets an inherited process variable win over `.env`
 *      (no flag inverts it), so a stale value from the parent shell would make a
 *      corrected `.env` a no-op. `cli/lib/env-drift.ts` asks varlock which
 *      schema items the process overrides and compares each against
 *      `.env.local` over `.env`. A DIFFERENT value refuses the launch, naming the
 *      variables with their lengths only. Equal values, and keys the files leave
 *      empty, pass. No `.env` / `.env.local` (CI, fresh clone) -> nothing to
 *      compare, the preflight passes.
 *      `--warn` (the test scripts) prints the same notice and continues: there an
 *      inline override such as `AUTO_SYNC=true bun run test` is deliberate, and
 *      the inherited value winning is the point. A harness session lives for
 *      hours on whatever it inherited, so the harness scripts keep refusing.
 *   2. `varlock run -- <bin> [args...]`: varlock resolves and validates the
 *      schema, then starts the binary with the values in its environment. An
 *      interactive terminal keeps raw TTY pass-through; piped output is redacted.
 *
 * `--no-env-file` matters: `bun <file>` autoloads `.env` into this process, and
 * every file key would then look like an inherited override equal to itself.
 *
 * NEVER PRINTS A VALUE. Exit code: the child's, or 1 when the preflight refuses
 * or varlock is not installed, 2 on a usage error.
 */

import type { DriftHit, EnvMap, VarlockOverrides } from '../cli/lib/env-drift.ts';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { fileValues, findDrift, hasEnvFiles, loadVarlockMetadata, varlockBin, withoutEmptyProviderShadows } from '../cli/lib/env-drift.ts';

const REPO_ROOT = join(import.meta.dir, '..');

/** The drift notice: names and lengths, the reason, the remedy. */
export function driftMessage(bin: string, hits: DriftHit[], warnOnly: boolean): string[] {
  const names = hits.map(h => h.name).join(' ');
  return [
    warnOnly
      ? `launch: WARNING, ${hits.length} variable(s) inherited from this shell differ from .env / .env.local; the inherited value wins for this run of ${bin}:`
      : `launch: refusing to start ${bin}. ${hits.length} variable(s) inherited from this shell differ from .env / .env.local,`,
    ...(warnOnly ? [] : ['and varlock lets the inherited value win, so the file would be ignored in silence:']),
    ...hits.map(h => `  - ${h.name}: process=${h.processValue.length} chars, file=${h.fileValue.length} chars${h.sensitive ? ' (sensitive)' : ''}`),
    warnOnly
      ? `Fine when you set it on purpose for this run. If not: unset ${names} (or open a clean terminal).`
      : `Fix: unset ${names} (or open a clean terminal), then relaunch.`,
    'Find who exported it: ps eww -p $PPID, walking up the ancestry.',
  ];
}

export interface LaunchDeps {
  root: string
  env: EnvMap
  meta: (root: string, env: EnvMap) => VarlockOverrides | null
  varlock: (root: string, env: EnvMap) => string | null
  spawn: (cmd: string, args: string[], env: EnvMap) => number
  err: (line: string) => void
}

/** Runs the preflight, then the binary through varlock. Returns the exit code. */
export function launch(argv: string[], deps: LaunchDeps): number {
  const warnOnly = argv[0] === '--warn';
  const [bin, ...args] = warnOnly ? argv.slice(1) : argv;
  if (!bin) {
    deps.err('usage: bun --no-env-file scripts/launch.ts [--warn] <bin> [args...]');
    return 2;
  }

  const varlock = deps.varlock(deps.root, deps.env);
  if (varlock === null) {
    deps.err('launch: varlock is not installed in this checkout. Run `bun install`, then relaunch.');
    return 1;
  }

  const { env } = withoutEmptyProviderShadows(deps.root, deps.env);

  if (hasEnvFiles(deps.root)) {
    // No usable metadata (a schema that does not parse) skips the comparison:
    // `varlock run` below reports that failure itself.
    const meta = deps.meta(deps.root, env);
    const hits = meta ? findDrift(meta, env, fileValues(deps.root)) : [];
    if (hits.length > 0) {
      for (const line of driftMessage(bin, hits, warnOnly)) { deps.err(line); }
      if (!warnOnly) { return 1; }
    }
  }

  return deps.spawn(varlock, ['run', '--', bin, ...args], env);
}

if (import.meta.main) {
  // The child owns Ctrl-C (it shares the terminal's process group); this
  // process only waits for it and hands back its exit code.
  process.on('SIGINT', () => {});
  process.exit(launch(process.argv.slice(2), {
    root: REPO_ROOT,
    env: process.env,
    meta: loadVarlockMetadata,
    varlock: varlockBin,
    spawn: (cmd, args, env) => spawnSync(cmd, args, { stdio: 'inherit', cwd: REPO_ROOT, env: env as NodeJS.ProcessEnv }).status ?? 1,
    err: line => console.error(line),
  }));
}
