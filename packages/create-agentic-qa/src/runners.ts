import type { SpawnSyncReturns } from 'node:child_process';

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { CliError } from './errors.ts';
import { log } from './log.ts';

const IS_WIN = process.platform === 'win32';

/**
 * Install instructions for bun, per platform. The PowerShell installer drops a
 * real `bun.exe` on PATH; the `npm i -g bun` route only writes a `bun.cmd`
 * shim, which is exactly the case `spawnBun` has to shell out for.
 */
const BUN_INSTALL_HINT = IS_WIN
  ? 'Install: powershell -c "irm bun.sh/install.ps1 | iex"  (or https://bun.sh/docs/installation)'
  : 'Install: curl -fsSL https://bun.sh/install | bash  (or https://bun.sh/docs/installation)';

function hasBinary(name: string): boolean {
  const probe = spawnSync(IS_WIN ? 'where' : 'which', [name], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return probe.status === 0;
}

/**
 * Spawn bun with the argv given.
 *
 * On Windows `shell: true` is required, not optional: `npm i -g bun` (a route
 * bun.sh documents) installs `bun.cmd` + `bun.ps1` and no `bun.exe`, and libuv
 * only ever appends `.com`/`.exe` when resolving a bare command name — so a
 * shim-only install fails with ENOENT unless cmd.exe does the lookup. `where`
 * does honour PATHEXT, so `hasBinary('bun')` finds the shim and the preflight
 * passes green; without the shell the failure would surface much later.
 *
 * Safe to shell out here: every argv element below is a compile-time literal,
 * and the project directory travels through the `cwd` option rather than the
 * command line, so nothing user-controlled reaches cmd.exe.
 */
function spawnBun(args: string[], opts: { cwd: string, env?: NodeJS.ProcessEnv }): SpawnSyncReturns<Buffer> {
  return spawnSync('bun', args, {
    cwd: opts.cwd,
    stdio: 'inherit',
    shell: IS_WIN,
    ...(opts.env ? { env: opts.env } : {}),
  });
}

/**
 * Turn a spawn that never launched into a clear error.
 *
 * `spawnSync` reports a launch failure as `status: null` + a populated `error`,
 * which `status !== 0` would otherwise misread as "the command ran and failed".
 */
function assertLaunched(res: SpawnSyncReturns<Buffer>, what: string): void {
  if (res.error) {
    throw new CliError(
      'ENVIRONMENT',
      `Could not run ${what}: ${res.error.message}`,
      `bun was found on PATH but could not be started. ${BUN_INSTALL_HINT}`,
    );
  }
}

export function ensureBunAvailable(): void {
  if (!hasBinary('bun')) {
    throw new CliError('ENVIRONMENT', 'Bun is required but not found on PATH.', BUN_INSTALL_HINT);
  }
}

export function ensureGitAvailable(): void {
  if (!hasBinary('git')) {
    throw new CliError(
      'ENVIRONMENT',
      'git is required but not found on PATH.',
      'Install: https://git-scm.com/downloads',
    );
  }
}

export function runBunInstall(cwd: string): void {
  log.info('Installing dependencies (bun install)…');
  let res = spawnBun(['install'], { cwd });
  assertLaunched(res, 'bun install');

  if (res.status !== 0) {
    // Bun ran and reported failure. One known cause is a half-written
    // node_modules whose bin shims it can no longer remap ("could not open bin
    // metadata file"); Bun's own remedy for that is a forced re-install. Retry
    // once rather than abandoning an otherwise complete scaffold.
    //
    // Gated on a real exit code: a spawn that never launched is caught above,
    // so this never wipes a populated node_modules over a launch failure.
    log.warn(`bun install exited ${res.status} — wiping node_modules and retrying with --force…`);
    rmSync(join(cwd, 'node_modules'), { recursive: true, force: true });
    res = spawnBun(['install', '--force'], { cwd });
    assertLaunched(res, 'bun install --force');
  }

  if (res.status !== 0) {
    throw new CliError(
      'INSTALL',
      `bun install failed (exit ${res.status}).`,
      'The project itself is already scaffolded — only dependency install failed.\n'
      + `Recover with:\n  cd ${cwd}\n  bun install --force\n  bun run setup\n`
      + 'On WSL: make sure the project lives under the Linux filesystem (e.g. ~/projects), '
      + 'not under /mnt/c — Bun cannot create its bin shims on the Windows drive mount.',
    );
  }
}

export function runBunSetup(cwd: string, opts: { nonInteractive: boolean }): void {
  log.info('Handing off to the boilerplate installer (bun run setup)…');
  const args = ['run', 'setup'];
  if (opts.nonInteractive) { args.push('--', '--non-interactive'); }

  const res = spawnBun(args, {
    cwd,
    env: {
      ...process.env,
      ...(opts.nonInteractive ? { NON_INTERACTIVE: '1' } : {}),
    },
  });
  assertLaunched(res, 'bun run setup');

  if (res.status !== 0) {
    throw new CliError(
      'SETUP',
      `bun run setup failed (exit ${res.status}).`,
      `The project is scaffolded and its dependencies are installed. Re-run the installer with:\n  cd ${cwd}\n  bun run setup`,
    );
  }
}
