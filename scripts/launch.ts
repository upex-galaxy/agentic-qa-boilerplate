#!/usr/bin/env bun
/**
 * launch.ts — starts a test or tooling run with the repo's environment.
 *
 *   bun --no-env-file scripts/launch.ts [--warn] <bin> [args...]
 *
 * Behind the `test*` scripts, `allure:run` and `allure:agent`. It never starts an AI harness:
 * `claude`, `codex` and `opencode` are refused (`HARNESS_BINARIES`), because
 * `varlock run -- <harness>` would export every `.env` value into the AI's own
 * process, where any command it runs can read them (ADR-0014). A harness opens
 * bare; every MCP server loads `.env` itself through its loader (ADR-0011).
 *
 * Two steps, after one quiet clean-up: when a secret-manager overlay exists
 * (`.env.provider.schema`), the EMPTY inherited copies of the keys it resolves
 * are dropped, because an empty variable would win over the vault and CI turns
 * every unset secret into one (`withoutEmptyProviderShadows`).
 *
 *   1. DRIFT NOTICE. varlock lets an inherited process variable win over `.env`
 *      (no flag inverts it), so a stale value from the parent shell would make a
 *      corrected `.env` a no-op. `cli/lib/env-drift.ts` asks varlock which
 *      schema items the process overrides and compares each against
 *      `.env.local` over `.env`. A DIFFERENT value prints a warning naming the
 *      variables with their lengths only, then the run goes on: an inline
 *      override such as `AUTO_SYNC=true bun run test` is deliberate, and the
 *      inherited value winning is the point. Equal values, and keys the files
 *      leave empty, pass silently. No `.env` / `.env.local` (CI, fresh clone)
 *      -> nothing to compare. `--warn` is accepted and changes nothing: every
 *      script still passes it from when the harness launch refused instead.
 *   2. `varlock run -- <bin> [args...]`: varlock resolves and validates the
 *      schema, then starts the binary with the values in its environment. An
 *      interactive terminal keeps raw TTY pass-through; piped output is redacted.
 *
 * `--no-env-file` matters: `bun <file>` autoloads `.env` into this process, and
 * every file key would then look like an inherited override equal to itself.
 *
 * NEVER PRINTS A VALUE. Exit code: the child's, 1 when varlock is not
 * installed, 2 on a usage error or a harness binary.
 */

import type { DriftHit, EnvMap, VarlockOverrides } from '../cli/lib/env-drift.ts';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';

import { fileValues, findDrift, hasEnvFiles, loadVarlockMetadata, varlockBin, withoutEmptyProviderShadows } from '../cli/lib/env-drift.ts';

const REPO_ROOT = join(import.meta.dir, '..');

/** The AI harnesses this launcher refuses to start (ADR-0014). */
export const HARNESS_BINARIES: readonly string[] = ['claude', 'codex', 'opencode'];

/** The drift notice: names and lengths, the reason, the remedy. */
export function driftMessage(bin: string, hits: DriftHit[]): string[] {
  const names = hits.map(h => h.name).join(' ');
  return [
    `launch: WARNING, ${hits.length} variable(s) inherited from this shell differ from .env / .env.local; the inherited value wins for this run of ${bin}:`,
    ...hits.map(h => `  - ${h.name}: process=${h.processValue.length} chars, file=${h.fileValue.length} chars${h.sensitive ? ' (sensitive)' : ''}`),
    `Fine when you set it on purpose for this run. If not: unset ${names} (or open a clean terminal).`,
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

/** Prints the drift notice, then runs the binary through varlock. Returns the exit code. */
export function launch(argv: string[], deps: LaunchDeps): number {
  const [bin, ...args] = argv[0] === '--warn' ? argv.slice(1) : argv;
  if (!bin) {
    deps.err('usage: bun --no-env-file scripts/launch.ts [--warn] <bin> [args...]');
    return 2;
  }
  if (HARNESS_BINARIES.includes(basename(bin))) {
    deps.err(`launch: refusing to start ${bin}. This launcher would export every .env value into the AI's own process.`);
    deps.err(`Open it directly instead (\`${bin}\` in the repo folder, or the desktop app): every MCP server loads .env itself.`);
    deps.err('A `claude` / `codex` / `opencode` script in package.json that runs this launcher is retired upstream: delete it.');
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
      for (const line of driftMessage(bin, hits)) { deps.err(line); }
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
