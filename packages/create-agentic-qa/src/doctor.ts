import { spawnSync } from 'node:child_process';
import { statfsSync } from 'node:fs';

import figuresModule from 'figures';
import pc from 'picocolors';

import * as tui from './tui.ts';

const figures = figuresModule as unknown as Record<string, string>;

export interface DoctorRow {
  name: string
  status: 'ok' | 'warn' | 'fail'
  hint: string
  required: boolean
}

function hasBinary(name: string): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return probe.status === 0;
}

async function checkInternet(): Promise<boolean> {
  try {
    await fetch('https://api.github.com', {
      method: 'HEAD',
      signal: AbortSignal.timeout(2000),
    });
    return true;
  }
  catch {
    return false;
  }
}

function checkDiskSpace(cwd: string): { ok: boolean, hint: string } {
  try {
    const stats = statfsSync(cwd);
    const freeMB = (stats.bavail * stats.bsize) / (1024 * 1024);
    if (freeMB < 200) {
      return { ok: false, hint: `Only ${Math.round(freeMB)} MB free — need at least 200 MB` };
    }
    return { ok: true, hint: `${Math.round(freeMB)} MB free` };
  }
  catch {
    return { ok: false, hint: 'Could not check disk space' };
  }
}

function checkNodeVersion(): { ok: boolean, hint: string } {
  const raw = process.versions.node;
  const major = Number.parseInt(raw.split('.')[0] ?? '0', 10);
  if (major < 18) {
    return { ok: false, hint: `node ${raw} — upgrade to node >= 18` };
  }
  return { ok: true, hint: `node ${raw}` };
}

export async function runDoctor(): Promise<{ allPassed: boolean, rows: DoctorRow[] }> {
  const rows: DoctorRow[] = [];

  // 1. bun
  const bunOk = hasBinary('bun');
  rows.push({
    name: 'bun',
    status: bunOk ? 'ok' : 'fail',
    hint: bunOk ? 'found' : 'Install: curl -fsSL https://bun.sh/install | bash',
    required: true,
  });

  // 2. git
  const gitOk = hasBinary('git');
  rows.push({
    name: 'git',
    status: gitOk ? 'ok' : 'fail',
    hint: gitOk ? 'found' : 'Install: https://git-scm.com/downloads',
    required: true,
  });

  // 3. node >= 18
  const nodeCheck = checkNodeVersion();
  rows.push({
    name: 'node >= 18',
    status: nodeCheck.ok ? 'ok' : 'fail',
    hint: nodeCheck.hint,
    required: true,
  });

  // 4. gh (optional)
  const ghOk = hasBinary('gh');
  rows.push({
    name: 'gh (GitHub CLI)',
    status: ghOk ? 'ok' : 'warn',
    hint: ghOk ? 'found' : 'Optional — needed for --github-create. Install: https://cli.github.com',
    required: false,
  });

  // 5. internet
  const internetOk = await checkInternet();
  rows.push({
    name: 'internet',
    status: internetOk ? 'ok' : 'fail',
    hint: internetOk ? 'reachable (api.github.com)' : 'Cannot reach api.github.com — check connection',
    required: true,
  });

  // 6. disk space (optional check)
  const disk = checkDiskSpace(process.cwd());
  rows.push({
    name: 'disk space',
    status: disk.ok ? 'ok' : 'warn',
    hint: disk.hint,
    required: false,
  });

  // Render table
  const tableRows = rows.map(r => [
    r.name,
    tui.statusIcon(r.status),
    r.hint,
  ]);
  process.stdout.write(`${tui.table(['Check', 'Status', 'Hint'], tableRows)}\n`);

  // Footer
  const failed = rows.filter(r => r.required && r.status === 'fail');
  const allPassed = failed.length === 0;
  if (allPassed) {
    process.stdout.write(pc.green(`${figures.tick ?? '✔'}  All system prerequisites OK\n`));
  }
  else {
    process.stdout.write(
      pc.red(`${figures.cross ?? '✘'}  ${failed.length} required check(s) failed\n`),
    );
  }

  return { allPassed, rows };
}
