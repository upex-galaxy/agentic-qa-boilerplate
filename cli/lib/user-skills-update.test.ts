/**
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */
import type { BunxRunner, ListedSkill } from './user-skills-update.ts';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { parseArgs } from '../update-boilerplate.ts';
import { devLinkedDestinations, isDevLink, normalizeSource, parseListJson, parseUpdateOutput, planSkillsUpdate, runSkillsUpdate, SKILLS_UPDATE_OPT_OUT_FLAG } from './user-skills-update.ts';

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

describe('devLinkedDestinations', () => {
  function layout(): { base: string, store: string, claude: string, checkout: string, folder: (path: string) => string, link: (target: string, path: string) => void } {
    const base = tmp();
    const folder = (path: string): string => { mkdirSync(path, { recursive: true }); return path; };
    const link = (target: string, path: string): void => { folder(dirname(path)); symlinkSync(target, path); };
    const checkout = join(tmp(), 'repo', 'skills');
    folder(join(checkout, 'mkd'));
    return { base, store: join(base, '.agents', 'skills'), claude: join(base, '.claude', 'skills'), checkout, folder, link };
  }

  it('a skill declared with no name is judged only against its own package, never an unrelated link', () => {
    const { base, store, checkout, folder, link } = layout();
    link(join(checkout, 'mkd'), join(store, 'mkd'));
    expect(devLinkedDestinations(undefined, 'project', base, {}, 'https://github.com/resend/resend-cli')).toEqual([]);
    expect(devLinkedDestinations(undefined, 'project', base, {})).toEqual([]);
    folder(join(checkout, 'resend-cli'));
    link(join(checkout, 'resend-cli'), join(store, 'resend-cli'));
    expect(devLinkedDestinations(undefined, 'project', base, {}, 'resend/resend-cli')).toEqual([join(store, 'resend-cli')]);
  });

  it('a nameless package also covers the skills its lock entry recorded under other names', () => {
    const { base, store, checkout, folder, link } = layout();
    folder(join(checkout, 'mailer'));
    link(join(checkout, 'mailer'), join(store, 'mailer'));
    writeFileSync(join(base, 'skills-lock.json'), JSON.stringify({ skills: { mailer: { source: 'resend/resend-skills' } } }));
    expect(devLinkedDestinations(undefined, 'project', base, {}, 'https://github.com/resend/resend-skills')).toEqual([join(store, 'mailer')]);
  });

  it('finds nothing in real folders and the CLI fan-out', () => {
    const { base, store, claude, folder, link } = layout();
    folder(join(store, 'mkd'));
    link('../../.agents/skills/mkd', join(claude, 'mkd'));
    expect(devLinkedDestinations('mkd', 'global', base, {})).toEqual([]);
    expect(devLinkedDestinations('absent', 'global', base, {})).toEqual([]);
  });

  it('accepts a harness directory aliased to the store, and reports only a linked store entry through it', () => {
    const { base, store, claude, checkout, folder, link } = layout();
    folder(join(store, 'retro'));
    link(join(checkout, 'mkd'), join(store, 'mkd'));
    link('../.agents/skills', claude);
    expect(devLinkedDestinations('retro', 'project', base, {})).toEqual([]);
    expect(devLinkedDestinations('mkd', 'project', base, {})).toEqual([join(store, 'mkd')]);
  });

  it('reports a harness entry linked to a checkout while the store entry is a real folder', () => {
    const { base, store, claude, checkout, folder, link } = layout();
    folder(join(store, 'mkd'));
    link(join(checkout, 'mkd'), join(claude, 'mkd'));
    expect(devLinkedDestinations('mkd', 'global', base, {})).toEqual([join(claude, 'mkd')]);
  });

  for (const scope of ['global', 'project'] as const) {
    it(`reports an entry inside a harness directory that is a link into a checkout (${scope})`, () => {
      const { base, claude, checkout, link } = layout();
      link(checkout, claude);
      expect(devLinkedDestinations('mkd', scope, base, {})).toEqual([join(claude, 'mkd')]);
      expect(devLinkedDestinations('retro', scope, base, {})).toEqual([]);
    });

    it(`reports an entry inside a store that is a link into a checkout, not its fan-out (${scope})`, () => {
      const { base, store, claude, checkout, link } = layout();
      link(checkout, store);
      link('../../.agents/skills/mkd', join(claude, 'mkd'));
      expect(devLinkedDestinations('mkd', scope, base, {})).toEqual([join(store, 'mkd')]);
    });
  }

  it('reports an entry below a linked parent of the store', () => {
    const { base, store, folder, link } = layout();
    const dotfiles = tmp();
    folder(join(dotfiles, 'skills', 'mkd'));
    link(dotfiles, join(base, '.agents'));
    expect(devLinkedDestinations('mkd', 'global', base, {})).toEqual([join(store, 'mkd')]);
  });

  it('does not count a link above the home directory', () => {
    const { base, store, folder, link } = layout();
    folder(join(store, 'mkd'));
    const alias = join(tmp(), 'home');
    link(base, alias);
    expect(devLinkedDestinations('mkd', 'global', alias, {})).toEqual([]);
  });

  it('reads the user-level Claude directory from CLAUDE_CONFIG_DIR', () => {
    const { base, checkout, link } = layout();
    const config = tmp();
    link(join(checkout, 'mkd'), join(config, 'skills', 'mkd'));
    expect(devLinkedDestinations('mkd', 'global', base, { CLAUDE_CONFIG_DIR: config })).toEqual([join(config, 'skills', 'mkd')]);
    expect(devLinkedDestinations('mkd', 'project', base, { CLAUDE_CONFIG_DIR: config })).toEqual([]);
  });

  it('reports a windsurf entry linked to a checkout, at both scopes', () => {
    const { base, store, checkout, folder, link } = layout();
    folder(join(store, 'mkd'));
    const global = join(base, '.codeium', 'windsurf', 'skills', 'mkd');
    const project = join(base, '.windsurf', 'skills', 'mkd');
    for (const entry of [global, project]) { link(join(checkout, 'mkd'), entry); }
    for (const scope of ['global', 'project'] as const) {
      expect(devLinkedDestinations('mkd', scope, base, {}).sort()).toEqual([global, project]);
    }
  });

  it('finds nothing in a multi-agent fan-out of links and copies', () => {
    const { base, store, folder, link } = layout();
    folder(join(store, 'mkd'));
    for (const dir of ['.claude', '.windsurf', '.codeium/windsurf', '.config/goose', '.pi/agent']) {
      const entry = join(base, dir, 'skills', 'mkd');
      link(relative(dirname(entry), join(store, 'mkd')), entry);
    }
    folder(join(base, '.continue', 'skills', 'mkd'));
    link('../.agents/skills', join(base, '.roo', 'skills'));
    writeFileSync(join(base, '.profile'), '');
    for (const scope of ['global', 'project'] as const) {
      expect(devLinkedDestinations('mkd', scope, base, {})).toEqual([]);
    }
  });

  it('treats either canonical folder resolving to the other as the store', () => {
    for (const [real, alias] of [['.claude', '.agents'], ['.agents', '.claude']]) {
      const { base, folder, link } = layout();
      folder(join(base, real, 'skills', 'mkd'));
      link(`../${real}/skills`, join(base, alias, 'skills'));
      for (const scope of ['global', 'project'] as const) {
        expect(devLinkedDestinations('mkd', scope, base, {})).toEqual([]);
      }
    }
  });

  it('checks the agent folders that are not a hidden skills folder', () => {
    for (const [scope, dir] of [['project', 'skills'], ['project', 'data/skills'], ['project', 'agent/skills'], ['project', 'agent/subagents/helper/skills'], ['global', '.config/kimchi/harness/skills']] as const) {
      const { base, checkout, link } = layout();
      const entry = join(base, dir, 'mkd');
      link(join(checkout, 'mkd'), entry);
      expect(devLinkedDestinations('mkd', scope, base, {})).toEqual([entry]);
    }
  });

  it('follows the variables that move an agent folder, at user level only', () => {
    for (const [name, dir] of [['XDG_CONFIG_HOME', 'goose/skills'], ['VIBE_HOME', 'skills'], ['HERMES_HOME', 'skills'], ['AUTOHAND_HOME', 'skills'], ['GROK_HOME', 'skills'], ['REASONIX_HOME', 'skills'], ['APPDATA', 'reasonix/skills']]) {
      const { base, checkout, link } = layout();
      const moved = tmp();
      const entry = join(moved, dir, 'mkd');
      link(join(checkout, 'mkd'), entry);
      expect(devLinkedDestinations('mkd', 'global', base, { [name]: moved })).toEqual([entry]);
      expect(devLinkedDestinations('mkd', 'project', base, { [name]: moved })).toEqual([]);
    }
  });

  it('judges a package declared without a skill name by its own names, for undefined and *', () => {
    const { base, store, checkout, folder, link } = layout();
    folder(join(store, 'retro'));
    link(join(checkout, 'mkd'), join(store, 'mkd'));
    for (const name of [undefined, '*']) {
      expect(devLinkedDestinations(name, 'global', base, {}, 'upex-galaxy/retro')).toEqual([]);
      expect(devLinkedDestinations(name, 'global', base, {}, 'someone/mkd')).toEqual([join(store, 'mkd')]);
    }
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
  const quiet = { info: () => {}, warn: () => {}, env: {} };

  it('skips a skill whose only development link is in a harness directory', async () => {
    const home = tmp();
    mkdirSync(join(home, '.agents', 'skills', 'retro'), { recursive: true });
    mkdirSync(join(home, '.claude', 'skills'), { recursive: true });
    symlinkSync(tmp(), join(home, '.claude', 'skills', 'retro'));
    const { run, calls } = fake([row('retro', { path: join(home, '.agents', 'skills', 'retro') })], []);
    const res = await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [], dryRun: false, run, ...quiet });
    expect(res.plans[0].devLinks).toEqual(['retro']);
    expect(calls.some(c => c[1] === 'update')).toBe(false);
  });

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

  it('reports declared skills that are not installed, minus the declined ones', async () => {
    const { run } = fake([], []);
    const infos: string[] = [];
    await runSkillsUpdate({ cwd: tmp(), home: tmp(), global: [{ package: OURS, skill: 'teach' }, { package: OURS, skill: 'nope' }], project: [], declined: ['nope'], dryRun: false, run, info: m => infos.push(m), warn: () => {}, lang: 'en' });
    const out = infos.join('\n');
    expect(out).toContain('bun setup --sync-skills');
    expect(out).toContain('teach');
    expect(out).not.toContain('nope');
  });

  it('plans but runs no update on a dry run', async () => {
    const home = tmp();
    const { run, calls } = fake([row('retro', { path: join(home, '.agents', 'skills', 'retro') })], []);
    const infos: string[] = [];
    await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [], dryRun: true, run, info: m => infos.push(m), warn: () => {}, env: {} });
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
    const res = await runSkillsUpdate({ cwd: tmp(), home, global: [{ package: OURS, skill: 'retro' }], project: [{ package: OURS, skill: 'x' }], dryRun: false, run, info: () => {}, warn: m => warns.push(m), env: {} });
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
