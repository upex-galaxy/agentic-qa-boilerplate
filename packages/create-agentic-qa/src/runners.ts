import { spawnSync } from 'node:child_process';

import { CliError } from './errors.ts';
import { log } from './log.ts';

function hasBinary(name: string): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return probe.status === 0;
}

export function ensureBunAvailable(): void {
  if (!hasBinary('bun')) {
    throw new CliError(
      'ENVIRONMENT',
      'Bun is required but not found on PATH.',
      'Install: curl -fsSL https://bun.sh/install | bash  (or https://bun.sh/docs/installation)',
    );
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
  const res = spawnSync('bun', ['install'], { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new CliError('INSTALL', `bun install failed (exit ${res.status}).`);
  }
}

export function runBunSetup(cwd: string, opts: { nonInteractive: boolean }): void {
  log.info('Handing off to the boilerplate installer (bun run setup)…');
  const args = ['run', 'setup'];
  if (opts.nonInteractive) { args.push('--', '--non-interactive'); }

  const res = spawnSync('bun', args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(opts.nonInteractive ? { NON_INTERACTIVE: '1' } : {}),
    },
  });
  if (res.status !== 0) {
    throw new CliError('SETUP', `bun run setup failed (exit ${res.status}).`);
  }
}
