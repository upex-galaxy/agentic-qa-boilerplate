/**
 * @fileoverview The last step of `bun up` / `bun sync`: refresh the community
 * skills the installer ships, through the skills CLI's own `update` command.
 *
 * Scope is exactly what `cli/install.ts` declares (`USER_LEVEL_SKILLS` with
 * `-g`, `PROJECT_LEVEL_SKILLS` with `-p`), intersected with what the skills CLI
 * reports as installed AND tracked from that same source (`skills ls --json`).
 * A same-named skill from another source is left alone, and so is an empty
 * list: `skills update -g -y` with no names updates every global skill on the
 * machine, which is not this step's business.
 *
 * Measured behaviour of the skills CLI (1.9.0, sandbox HOME, 2026-11-16):
 * - `update` replaces the installed folder with a fresh copy, so a local edit
 *   inside it is lost;
 * - an installed path that is a symlink (a development link into a skills
 *   repo) is REPLACED by a real folder: the link is gone, the linked repo is
 *   untouched. Hence the skip rule in `isDevLink`;
 * - the exit code is 0 even when a source fails to fetch: failure is read from
 *   the `✗` lines of its output;
 * - a name that is not installed prints "No installed skills found matching"
 *   and also exits 0.
 *
 * Project skills are gitignored, so nothing else could restore a patched one:
 * each real folder is copied to `.backups/skills-update-<stamp>/` before the
 * update (the doctor's `communitySkillRefs` note says why no reinstall happens
 * without one).
 *
 * Never blocking: every failure is a warning, the update run keeps its exit
 * code. Opt out with `--no-skills-update` or `UPEX_SKIP_SKILLS_UPDATE=1`.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import { spawn } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/** Env var that turns the step off, for a run that cannot pass the flag. */
export const SKILLS_UPDATE_OPT_OUT_ENV = 'UPEX_SKIP_SKILLS_UPDATE';
/** The updater flag that turns the step off. */
export const SKILLS_UPDATE_OPT_OUT_FLAG = '--no-skills-update';

export type SkillScope = 'global' | 'project';

/** An entry of `USER_LEVEL_SKILLS` / `PROJECT_LEVEL_SKILLS` in `cli/install.ts`. */
export interface DeclaredSkill {
  package: string
  /** Omitted or `*` = every skill of the package. */
  skill?: string
}

/** One row of `skills ls [-g] --json`. */
export interface ListedSkill {
  name: string
  path: string
  source: string | null
  status: string
}

export interface SkillsUpdatePlan {
  scope: SkillScope
  /** Names passed to `skills update`. */
  update: string[]
  /** Installed as a symlink that leaves the skills CLI's store: left alone. */
  devLinks: string[]
  /** Installed under the same name from a different source: left alone. */
  otherSource: string[]
  /** Installed but not tracked by the skills CLI (no lock entry): cannot update. */
  untracked: string[]
  /** Declared by name and not installed (declined, or never installed). */
  notInstalled: string[]
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

/**
 * Runs `bunx <args>` in `cwd`. Asynchronous on purpose: the updater's page is
 * served from the same process and must keep answering while this runs.
 * Injected by tests so they never reach the network.
 */
export type BunxRunner = (args: string[], cwd: string, timeoutMs: number) => Promise<RunResult>;

export const defaultRunner: BunxRunner = async (args, cwd, timeoutMs) => new Promise((done) => {
  let stdout = '';
  let stderr = '';
  const child = spawn('bunx', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  const timer = setTimeout(() => { child.kill(); stderr += `\ntimed out after ${timeoutMs / 1000} s`; }, timeoutMs);
  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
  child.on('error', (err) => { clearTimeout(timer); done({ code: null, stdout, stderr: `${stderr}\n${err.message}` }); });
  child.on('close', (code) => { clearTimeout(timer); done({ code, stdout, stderr }); });
});

/** `https://github.com/Owner/Repo.git` and `owner/repo` compare equal. */
export function normalizeSource(source: string): string {
  const lower = source.trim().toLowerCase();
  return lower.replace(/^https?:\/\/(?:www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

/**
 * A development link: the installed path is a symlink that leads out of the
 * skills CLI's store. A link INTO the store (`~/.claude/skills/x ->
 * ../../.agents/skills/x`) is the CLI's own per-agent fan-out, so the store
 * entry it points at is judged instead.
 */
export function isDevLink(installedPath: string, store: string, depth = 0): boolean {
  let st;
  try { st = lstatSync(installedPath); }
  catch { return false; }
  if (!st.isSymbolicLink()) { return false; }
  const target = resolve(dirname(installedPath), readlinkSync(installedPath));
  if (dirname(target) === resolve(store) && target !== resolve(installedPath) && depth < 4) {
    return isDevLink(target, store, depth + 1);
  }
  return true;
}

/** Pure planner: what to update, and why every other declared skill is skipped. */
export function planSkillsUpdate(
  scope: SkillScope,
  declared: ReadonlyArray<DeclaredSkill>,
  listed: ReadonlyArray<ListedSkill>,
  devLink: (path: string) => boolean,
): SkillsUpdatePlan {
  const plan: SkillsUpdatePlan = { scope, update: [], devLinks: [], otherSource: [], untracked: [], notInstalled: [] };
  const seen = new Set<string>();
  for (const item of declared) {
    const pkg = normalizeSource(item.package);
    const wholePackage = !item.skill || item.skill === '*';
    const rows = wholePackage
      ? listed.filter(r => r.source !== null && normalizeSource(r.source) === pkg)
      : listed.filter(r => r.name === item.skill);
    if (rows.length === 0) {
      if (!wholePackage) { plan.notInstalled.push(item.skill as string); }
      continue;
    }
    for (const row of rows) {
      if (seen.has(row.name)) { continue; }
      seen.add(row.name);
      // A development link first: an untracked one must not be told to reinstall,
      // which would replace the link exactly as an update does.
      if (devLink(row.path)) { plan.devLinks.push(row.name); }
      else if (row.status !== 'tracked' || row.source === null) { plan.untracked.push(row.name); }
      else if (normalizeSource(row.source) !== pkg) { plan.otherSource.push(row.name); }
      else { plan.update.push(row.name); }
    }
  }
  return plan;
}

/** Reads what `skills update` did; its exit code does not say. */
export function parseUpdateOutput(output: string): { updated: string[], failed: string[] } {
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\u001B\[[0-9;?]*[a-z]/gi, '');
  // `✓ Updated 2 skill(s)` is the summary line, not a skill.
  const updated = [...clean.matchAll(/✓ Updated (?!\d+ skill)(\S+)/g)].map(m => m[1]);
  const failed = clean.split('\n').map(l => l.trim()).filter(l => l.startsWith('✗')).map(l => l.replace(/^✗\s*/, ''));
  return { updated, failed };
}

export function parseListJson(stdout: string): ListedSkill[] {
  const start = stdout.indexOf('[');
  if (start === -1) { throw new Error('skills ls printed no JSON'); }
  const rows = JSON.parse(stdout.slice(start)) as Array<Partial<ListedSkill>>;
  return rows
    .filter(r => typeof r.name === 'string' && typeof r.path === 'string')
    .map(r => ({ name: r.name as string, path: r.path as string, source: r.source ?? null, status: r.status ?? 'untracked' }));
}

export interface SkillsUpdateOptions {
  /** Project root: the `-p` scope and where `.backups/` lives. */
  cwd: string
  global: ReadonlyArray<DeclaredSkill>
  project: ReadonlyArray<DeclaredSkill>
  /** Plan and report, run nothing. */
  dryRun: boolean
  info: (message: string) => void
  warn: (message: string) => void
  run?: BunxRunner
  home?: string
  /** Backup folder suffix; tests pass a fixed one. */
  stamp?: string
  /** Language of the messages, the run's own (Spanish when unsure). */
  lang?: 'es' | 'en'
}

export interface SkillsUpdateResult {
  plans: SkillsUpdatePlan[]
  updated: string[]
  failed: string[]
  backupDir: string | null
}

const LIST_TIMEOUT_MS = 120_000;
const UPDATE_TIMEOUT_MS = 300_000;

function describeSkips(plan: SkillsUpdatePlan, t: (es: string, en: string) => string): string[] {
  const where = plan.scope === 'global' ? t('de usuario', 'user') : t('de proyecto', 'project');
  const out: string[] = [];
  if (plan.devLinks.length) { out.push(t(`skills ${where} omitidas por ser un symlink de desarrollo: ${plan.devLinks.join(', ')}`, `${where} skills skipped, development symlink: ${plan.devLinks.join(', ')}`)); }
  if (plan.otherSource.length) { out.push(t(`skills ${where} omitidas, instaladas desde otra fuente: ${plan.otherSource.join(', ')}`, `${where} skills skipped, installed from another source: ${plan.otherSource.join(', ')}`)); }
  if (plan.untracked.length) { out.push(t(`skills ${where} sin registro en el CLI de skills, no se actualizan (reinstálalas con \`bun setup --sync-skills\`): ${plan.untracked.join(', ')}`, `${where} skills not tracked by the skills CLI, so not updated (reinstall them with \`bun setup --sync-skills\`): ${plan.untracked.join(', ')}`)); }
  return out;
}

/** The whole step. Never throws: a failure becomes a warning. */
export async function runSkillsUpdate(opts: SkillsUpdateOptions): Promise<SkillsUpdateResult> {
  const run = opts.run ?? defaultRunner;
  const t = (es: string, en: string): string => (opts.lang === 'en' ? en : es);
  const home = opts.home ?? homedir();
  const result: SkillsUpdateResult = { plans: [], updated: [], failed: [], backupDir: null };
  const scopes: Array<{ scope: SkillScope, declared: ReadonlyArray<DeclaredSkill>, flag: string, store: string }> = [
    { scope: 'global', declared: opts.global, flag: '-g', store: join(home, '.agents', 'skills') },
    { scope: 'project', declared: opts.project, flag: '-p', store: join(opts.cwd, '.agents', 'skills') },
  ];
  for (const s of scopes) {
    if (s.declared.length === 0) { continue; }
    try {
      const listArgs = ['skills', 'ls', ...(s.scope === 'global' ? ['-g'] : []), '--json'];
      const ls = await run(listArgs, opts.cwd, LIST_TIMEOUT_MS);
      if (ls.code !== 0) { throw new Error(`\`bunx ${listArgs.join(' ')}\` exited ${ls.code}`); }
      const plan = planSkillsUpdate(s.scope, s.declared, parseListJson(ls.stdout), p => isDevLink(p, s.store));
      result.plans.push(plan);
      for (const line of describeSkips(plan, t)) { opts.info(line); }
      if (plan.update.length === 0) { continue; }
      const updateArgs = ['skills', 'update', ...plan.update, s.flag, '-y'];
      if (opts.dryRun) { opts.info(t(`correría: bunx ${updateArgs.join(' ')}`, `would run: bunx ${updateArgs.join(' ')}`)); continue; }
      if (s.scope === 'project') {
        const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
        result.backupDir = join(opts.cwd, '.backups', `skills-update-${stamp}`);
        mkdirSync(result.backupDir, { recursive: true });
        for (const name of plan.update) {
          cpSync(join(s.store, name), join(result.backupDir, name), { recursive: true });
        }
      }
      opts.info(`bunx ${updateArgs.join(' ')}`);
      const up = await run(updateArgs, opts.cwd, UPDATE_TIMEOUT_MS);
      const parsed = parseUpdateOutput(`${up.stdout}\n${up.stderr}`);
      result.updated.push(...parsed.updated);
      if (up.code !== 0) { result.failed.push(`\`bunx ${updateArgs.join(' ')}\` exited ${up.code}`); }
      result.failed.push(...parsed.failed);
    }
    catch (err) {
      result.failed.push(`${s.scope} skills: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (opts.dryRun) { return result; }
  if (result.updated.length) { opts.info(t(`skills actualizadas: ${result.updated.join(', ')}`, `skills updated: ${result.updated.join(', ')}`)); }
  else if (result.failed.length === 0) { opts.info(t('skills al día', 'skills already up to date')); }
  if (result.backupDir) { opts.info(t(`copia previa de las skills de proyecto en ${result.backupDir}`, `project skills backed up first to ${result.backupDir}`)); }
  for (const f of result.failed) {
    opts.warn(t(`skills update: ${f} (la actualización del boilerplate no cambia; reintenta con \`bunx skills update <nombre>\`)`, `skills update: ${f} (the boilerplate update is unaffected; retry with \`bunx skills update <name>\`)`));
  }
  return result;
}
