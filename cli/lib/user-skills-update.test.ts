/**
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */
import type { BunxRunner, ListedSkill } from './user-skills-update.ts';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { parseArgs } from '../update-boilerplate.ts';
import { isDevLink, normalizeSource, parseListJson, parseUpdateOutput, planSkillsUpdate, runSkillsUpdate, SKILLS_UPDATE_OPT_OUT_FLAG } from './user-skills-update.ts';

const OURS = 'https://github.com/upex-galaxy/agentic-user-skills';
const row = (name: string, extra: Partial<ListedSkill> = {}): ListedSkill => ({
  name,
  path: `/home/u/.agents/skills/${name}`,
  source: 'upex-galaxy/agentic-user-skills',
  status: 'tracked',
  ...extra,
});

const dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'skills-update-test-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); } });

describe('normalizeSource', () => {
  it('treats a GitHub URL and the lock shorthand as the same source', () => {
    expect(normalizeSource('https://github.com/Upex-Galaxy/agentic-user-skills.git')).toBe('upex-galaxy/agentic-user-skills');
    expect(normalizeSource('upex-galaxy/agentic-user-skills')).toBe('upex-galaxy/agentic-user-skills');
    expect(normalizeSource('supabase/agent-skills/')).toBe('supabase/agent-skills');
  });
});

describe('planSkillsUpdate', () => {
  const never = () => false;

  it('updates only declared skills installed and tracked from the declared source', () => {
    const plan = planSkillsUpdate('global', [
      { package: OURS, skill: 'retro' },
      { package: OURS, skill: 'humanizer' },
      { package: OURS, skill: 'teach' },
      { package: 'https://github.com/vercel-labs/skills', skill: 'find-skills' },
    ], [
      row('retro'),
      row('humanizer', { source: 'blader/humanizer' }),
      row('find-skills', { source: null, status: 'untracked' }),
      row('unrelated'),
    ], never);
    expect(plan.update).toEqual(['retro']);
    expect(plan.otherSource).toEqual(['humanizer']);
    expect(plan.untracked).toEqual(['find-skills']);
    expect(plan.notInstalled).toEqual(['teach']);
  });

  it('resolves a whole-package entry by source', () => {
    const plan = planSkillsUpdate('project', [{ package: 'resend/resend-cli' }], [
      row('resend-cli', { source: 'resend/resend-cli' }),
      row('resend-send', { source: 'https://github.com/resend/resend-cli' }),
      row('other', { source: 'someone/else' }),
    ], never);
    expect(plan.update).toEqual(['resend-cli', 'resend-send']);
    expect(plan.notInstalled).toEqual([]);
  });

  it('reports an untracked development link as a link, never as reinstallable', () => {
    const plan = planSkillsUpdate('global', [{ package: OURS, skill: 'retro' }], [row('retro', { source: null, status: 'untracked' })], () => true);
    expect(plan.devLinks).toEqual(['retro']);
    expect(plan.untracked).toEqual([]);
  });

  it('leaves development links alone', () => {
    const plan = planSkillsUpdate('global', [{ package: OURS, skill: 'mkd' }, { package: OURS, skill: 'retro' }], [row('mkd'), row('retro')], p => p.endsWith('/mkd'));
    expect(plan.devLinks).toEqual(['mkd']);
    expect(plan.update).toEqual(['retro']);
  });

  it('plans nothing when nothing declared is installed', () => {
    const plan = planSkillsUpdate('global', [{ package: OURS, skill: 'retro' }], [], never);
    expect(plan.update).toEqual([]);
  });
});

describe('isDevLink', () => {
  it('is false for a real folder and for a missing path', () => {
    const home = tmp();
    const store = join(home, '.agents', 'skills');
    mkdirSync(join(store, 'retro'), { recursive: true });
    expect(isDevLink(join(store, 'retro'), store)).toBe(false);
    expect(isDevLink(join(store, 'missing'), store)).toBe(false);
  });

  it('is true for a store entry that links out of the store', () => {
    const home = tmp();
    const store = join(home, '.agents', 'skills');
    mkdirSync(store, { recursive: true });
    mkdirSync(join(home, 'repo', 'skills', 'mkd'), { recursive: true });
    symlinkSync(join(home, 'repo', 'skills', 'mkd'), join(store, 'mkd'));
    expect(isDevLink(join(store, 'mkd'), store)).toBe(true);
  });

  it('follows the CLI fan-out link into the store before judging', () => {
    const home = tmp();
    const store = join(home, '.agents', 'skills');
    const claude = join(home, '.claude', 'skills');
    mkdirSync(join(store, 'retro'), { recursive: true });
    mkdirSync(join(home, 'repo', 'mkd'), { recursive: true });
    mkdirSync(claude, { recursive: true });
    symlinkSync('../../.agents/skills/retro', join(claude, 'retro'));
    symlinkSync(join(home, 'repo', 'mkd'), join(store, 'mkd'));
    symlinkSync('../../.agents/skills/mkd', join(claude, 'mkd'));
    expect(isDevLink(join(claude, 'retro'), store)).toBe(false);
    expect(isDevLink(join(claude, 'mkd'), store)).toBe(true);
  });
});

describe('parseUpdateOutput', () => {
  it('reads updated names and failed sources, ignoring ANSI noise', () => {
    const out = '\u001B[?25hUpdating retro…\n  ✓ Updated retro\nUpdating humanizer…\n  ✓ Updated humanizer\n\n✓ Updated 2 skill(s)\n  ✗ Failed to check skills from upex-galaxy/no-such-repo\n';
    expect(parseUpdateOutput(out)).toEqual({ updated: ['retro', 'humanizer'], failed: ['Failed to check skills from upex-galaxy/no-such-repo'] });
  });

  it('reads nothing from an up-to-date run', () => {
    expect(parseUpdateOutput('Checking skills from source: x\n✓ All global skills are up to date\n')).toEqual({ updated: [], failed: [] });
  });
});

describe('parseListJson', () => {
  it('skips any banner before the JSON array', () => {
    expect(parseListJson('note\n[{"name":"retro","path":"/p","source":"a/b","status":"tracked"}]')).toEqual([{ name: 'retro', path: '/p', source: 'a/b', status: 'tracked' }]);
  });
});

describe('runSkillsUpdate', () => {
  function fake(listGlobal: ListedSkill[], listProject: ListedSkill[], updateOut = '  ✓ Updated retro\n'): { run: BunxRunner, calls: string[][] } {
    const calls: string[][] = [];
    const run: BunxRunner = async (args) => {
      calls.push(args);
      if (args[1] === 'ls') { return { code: 0, stdout: JSON.stringify(args.includes('-g') ? listGlobal : listProject), stderr: '' }; }
      return { code: 0, stdout: updateOut, stderr: '' };
    };
    return { run, calls };
  }
  const quiet = { info: () => {}, warn: () => {} };

  it('never calls update with an empty name list', async () => {
    const { run, calls } = fake([], []);
    const home = tmp();
    await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [{ package: OURS, skill: 'retro' }], dryRun: false, run, ...quiet });
    expect(calls.some(c => c[1] === 'update')).toBe(false);
  });

  it('updates the tracked global skill by name with -g -y', async () => {
    const home = tmp();
    const { run, calls } = fake([row('retro', { path: join(home, '.agents', 'skills', 'retro') })], []);
    const res = await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [], dryRun: false, run, ...quiet });
    expect(calls).toContainEqual(['skills', 'update', 'retro', '-g', '-y']);
    expect(res.updated).toEqual(['retro']);
    expect(res.failed).toEqual([]);
  });

  it('plans but runs no update on a dry run', async () => {
    const home = tmp();
    const { run, calls } = fake([row('retro', { path: join(home, '.agents', 'skills', 'retro') })], []);
    const infos: string[] = [];
    await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [], dryRun: true, run, info: m => infos.push(m), warn: () => {} });
    expect(calls.some(c => c[1] === 'update')).toBe(false);
    expect(infos.join('\n')).toContain('bunx skills update retro -g -y');
  });

  it('backs up each project skill before updating it with -p', async () => {
    const cwd = tmp();
    const skill = join(cwd, '.agents', 'skills', 'skill-creator');
    mkdirSync(skill, { recursive: true });
    writeFileSync(join(skill, 'SKILL.md'), 'local patch');
    const { run, calls } = fake([], [row('skill-creator', { path: skill, source: 'anthropics/skills' })], '  ✓ Updated skill-creator\n');
    const res = await runSkillsUpdate({ cwd, home: tmp(), global: [], project: [{ package: 'https://github.com/anthropics/skills', skill: 'skill-creator' }], dryRun: false, run, stamp: 'T', ...quiet });
    expect(calls).toContainEqual(['skills', 'update', 'skill-creator', '-p', '-y']);
    expect(res.backupDir).toBe(join(cwd, '.backups', 'skills-update-T'));
    expect(existsSync(join(cwd, '.backups', 'skills-update-T', 'skill-creator', 'SKILL.md'))).toBe(true);
  });

  it('turns a failed fetch, a failed list and a crash into warnings, never a throw', async () => {
    const home = tmp();
    const warns: string[] = [];
    const run: BunxRunner = async (args) => {
      if (args[1] === 'ls' && args.includes('-g')) { return { code: 0, stdout: JSON.stringify([row('retro', { path: join(home, '.agents', 'skills', 'retro') })]), stderr: '' }; }
      if (args[1] === 'ls') { return { code: 1, stdout: '', stderr: 'offline' }; }
      return { code: 0, stdout: '  ✗ Failed to check skills from upex-galaxy/agentic-user-skills\n', stderr: '' };
    };
    const res = await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [{ package: OURS, skill: 'x' }], dryRun: false, run, info: () => {}, warn: m => warns.push(m) });
    expect(res.failed.length).toBe(2);
    expect(warns.length).toBe(2);
  });
});

describe('opt-out flag', () => {
  it('parses --no-skills-update', () => {
    expect(SKILLS_UPDATE_OPT_OUT_FLAG).toBe('--no-skills-update');
    expect(parseArgs(['--no-skills-update']).noSkillsUpdate).toBe(true);
    expect(parseArgs([]).noSkillsUpdate).toBe(false);
  });
});
