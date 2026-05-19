import { spawnSync } from 'node:child_process';

import pc from 'picocolors';

import manifest from './installer-manifest.json' with { type: 'json' };
import * as tui from './tui.ts';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function hasBinary(name: string): boolean {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return probe.status === 0;
}

function dim(s: string): string { return pc.dim(s); }
function bold(s: string): string { return pc.bold(s); }
function cyan(s: string): string { return pc.cyan(s); }

// ---------------------------------------------------------------------------
// Inspect runner
// ---------------------------------------------------------------------------

export async function runInspect(): Promise<void> {
  tui.section('What will this install?');
  process.stdout.write(`${dim(`Source: agentic-qa-boilerplate@${manifest.sourceRef}`)} • ${dim(`Manifest v${manifest.version}`)}\n`);
  tui.breathe();

  // -------------------------------------------------------------------------
  // 1. PREREQUISITES (with live check side-by-side)
  // -------------------------------------------------------------------------
  tui.section('1. Prerequisites — install BEFORE running the scaffolder');

  const prereqRows = manifest.prerequisites.map((p) => {
    const binaryName = (p as { binaryName?: string }).binaryName;
    const present = binaryName != null ? hasBinary(binaryName) : null;
    let status: string;
    if (present === null) {
      status = `${tui.statusIcon('info')} n/a`;
    }
    else if (present) {
      status = `${tui.statusIcon('ok')} present`;
    }
    else if (p.required) {
      status = `${tui.statusIcon('fail')} MISSING`;
    }
    else {
      status = `${tui.statusIcon('warn')} missing (optional)`;
    }
    return [p.name, p.required ? 'required' : 'optional', status, p.purpose];
  });
  process.stdout.write(`${tui.table(['Tool', 'Type', 'Status', 'Why'], prereqRows)}\n`);
  tui.breathe();

  // -------------------------------------------------------------------------
  // 2. WILL INSTALL (counts + first 5 + 'and N more')
  // -------------------------------------------------------------------------
  tui.section('2. The installer will install');

  const wi = manifest.willInstall;

  function summarize(label: string, group: { count: number, items: Array<{ name: string, purpose: string }> }): void {
    const first = group.items.slice(0, 5).map(it => `   • ${cyan(it.name)}  ${dim(`— ${it.purpose}`)}`).join('\n');
    const remaining = group.count > 5 ? `\n   ${dim(`...and ${group.count - 5} more`)}` : '';
    process.stdout.write(`${bold(label)}  ${dim(`(${group.count})`)}\n${first}${remaining}\n\n`);
  }

  summarize('gentle-ai skills', wi.gentleAiSkills);
  summarize('Community skills — project-level', wi.communityProjectSkills);
  summarize('Community skills — user-level', wi.communityUserSkills);

  // -------------------------------------------------------------------------
  // 3. WILL CONFIGURE
  // -------------------------------------------------------------------------
  tui.section('3. The installer will configure');

  process.stdout.write(`${bold('MCP servers')}  ${dim(`(${manifest.willConfigure.mcps.length})`)}\n`);
  for (const m of manifest.willConfigure.mcps) {
    process.stdout.write(`   • ${cyan(m.name)}  ${dim(`— ${m.purpose}`)}\n`);
    const envList = m.envVars.length > 0 ? m.envVars.join(', ') : '(none)';
    process.stdout.write(`     ${dim(`Reads env: ${envList}`)}\n`);
  }
  tui.breathe();

  process.stdout.write(`${bold('Files written / updated')}\n`);
  for (const f of manifest.willConfigure.envFiles) {
    process.stdout.write(`   • ${cyan(f.path)}  ${dim(`— ${f.what}`)}\n`);
  }
  tui.breathe();

  process.stdout.write(`${bold('Authentication')}\n`);
  for (const a of manifest.willConfigure.auth) {
    process.stdout.write(`   • ${cyan(a.service)}  ${dim(`— ${a.method}`)}\n`);
    process.stdout.write(`     ${dim(`Reads env: ${a.credsFrom.join(', ')}`)}\n`);
  }
  tui.breathe();

  process.stdout.write(`${bold('PHASE 5 post-install steps')}\n`);
  for (const s of manifest.willConfigure.postInstallSteps) {
    const tag = s.interactive ? dim('[interactive]') : dim('[non-interactive]');
    process.stdout.write(`   • ${cyan(s.step)} ${tag}  ${dim(`— ${s.what}`)}\n`);
  }
  tui.breathe();

  // -------------------------------------------------------------------------
  // 4. WILL NOT INSTALL
  // -------------------------------------------------------------------------
  tui.section('4. Will NOT auto-install — you handle these');

  for (const e of manifest.willNotInstall) {
    process.stdout.write(`   • ${cyan(e.name)}  ${dim(`— ${e.reason}`)}\n`);
    process.stdout.write(`     ${dim(`Docs: ${e.installHint}`)}\n`);
  }
  tui.breathe();

  // -------------------------------------------------------------------------
  // 5. DRILL-DOWN PROMPT
  // -------------------------------------------------------------------------
  const drillChoice = await tui.select<'gentle' | 'project' | 'user' | 'back'>({
    message: 'Want to see the full skill list for a category?',
    options: [
      { value: 'back', label: 'Back to menu' },
      { value: 'gentle', label: `Expand gentle-ai skills (${wi.gentleAiSkills.count})` },
      { value: 'project', label: `Expand community project skills (${wi.communityProjectSkills.count})` },
      { value: 'user', label: `Expand community user skills (${wi.communityUserSkills.count})` },
    ],
  });

  if (tui.isCancel(drillChoice) || drillChoice === 'back') {
    return;
  }

  const target
    = drillChoice === 'gentle'
      ? wi.gentleAiSkills
      : drillChoice === 'project'
        ? wi.communityProjectSkills
        : wi.communityUserSkills;

  const categoryLabel
    = drillChoice === 'gentle'
      ? 'gentle-ai'
      : drillChoice === 'project'
        ? 'community project'
        : 'community user';

  tui.section(`Full list — ${categoryLabel} (${target.count})`);
  for (const it of target.items) {
    process.stdout.write(`   • ${cyan(it.name)}  ${dim(`— ${it.purpose}`)}\n`);
  }
  tui.breathe();

  // Loop back: show drill-down prompt again
  await runInspect();
}
