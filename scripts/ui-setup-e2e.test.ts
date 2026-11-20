/**
 * `bun setup` end to end on a throwaway copy of this repo (installer-ui
 * delivery 3, plan §12): the page answered over its real HTTP contract, and
 * `--headless` with nobody to answer. Network and user-level steps are switched
 * off (`fixtureEnv`), so the run touches nothing outside its temp directory.
 * Runs only in CI or with `HEAVY_E2E=1`.
 */

import type { JournalEntry } from '../cli/lib/ui/events.ts';
import type { SetupFixture } from './ui-setup-fixture.ts';

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { HEAVY_E2E } from './lib/heavy-e2e.ts';
import { buildSetupFixture, fixtureEnv } from './ui-setup-fixture.ts';

const SECRET = 'atl-fixture-token-7c1e-not-real';

interface Run { exit: number, out: string, events: JournalEntry[] }

/** `bun setup <args>` in the fixture, stdin closed, the page served and never opened. */
async function runSetup(f: SetupFixture, args: string[], answer?: (e: JournalEntry) => unknown): Promise<Run> {
  const child = spawn(process.execPath, ['run', 'setup', ...args], { cwd: f.project, env: fixtureEnv(f), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  const events: JournalEntry[] = [];
  let following = false;
  const follow = async (url: string): Promise<void> => {
    const host = new URL(url).host;
    const token = url.split('/r/')[1].replace(/\/$/, '');
    const answered = new Set<string>();
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const res = await fetch(`${url}events?last=${events.at(-1)?.seq ?? 0}`, { headers: { host } });
        const reader = res.body!.getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) { break; }
          buf += new TextDecoder().decode(value);
          for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
            const data = buf.slice(0, i).split('\n').find(l => l.startsWith('data: '));
            buf = buf.slice(i + 2);
            if (!data) { continue; }
            const e = JSON.parse(data.slice(6)) as JournalEntry;
            events.push(e);
            if ((e.t === 'ask' || e.t === 'fail') && answer && !answered.has(e.id)) {
              answered.add(e.id);
              await fetch(`${url}answer`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-run-token': token, 'origin': `http://${host}`, host }, body: JSON.stringify({ id: e.id, value: answer(e) }) });
            }
            if (e.t === 'run.end') { await reader.cancel(); return; }
          }
        }
      }
      catch { /* not up yet: retry */ }
      await Bun.sleep(150);
    }
  };
  const onData = (d: Buffer): void => {
    out += d.toString();
    const m = /(http:\/\/127\.0\.0\.1:\d+\/r\/[\w-]+\/)/.exec(out);
    if (m && !following) { following = true; void follow(m[1]); }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const exit = await new Promise<number>(ok => child.on('close', code => ok(code ?? 1)));
  return { exit, out, events };
}

/** The default of every question, the way a person pressing Enter would answer it. */
function defaults(e: JournalEntry): unknown {
  if (e.t === 'fail') { return e.actions.at(-1)!.value; }
  if (e.t !== 'ask') { return null; }
  if (e.kind === 'secret') { return e.spec.secondary?.[0]?.value; }
  if (e.default !== undefined) { return e.default; }
  if (e.kind === 'multi') { return (e.spec.options ?? []).filter(o => o.checked).map(o => o.value); }
  if (e.kind === 'text') { return (e.spec.fields ?? []).map(x => x.value ?? ''); }
  return e.spec.options?.[0]?.value;
}

const ANSWERS: Record<string, unknown> = {
  'agents': ['codex'],
  'project-identity': ['Acme Shop', 'acme', 'acme.shop'],
  'project-envs': ['localhost:3000', 'staging.acme.shop'],
  'project-default-env': 'staging',
  'secrets-provider': 'local',
  'day0': ['acme.atlassian.net', 'qa@acme.dev'],
  'var-ATLASSIAN_API_TOKEN': SECRET,
  'gh-create': false,
};

// Every fixture of this file sits under one temp root, removed in afterAll
// (it fires whether the tests passed or failed): left behind, each run kept
// tens of MB in the temp dir.
const root = HEAVY_E2E ? mkdtempSync(join(tmpdir(), 'ui-setup-e2e-')) : '';

describe.if(HEAVY_E2E)('bun setup on a throwaway project', () => {
  afterAll(() => { rmSync(root, { recursive: true, force: true }); });

  test('the page: every question answered in it, phases in order, yaml and .env written, no secret anywhere but .env', async () => {
    const f = buildSetupFixture(join(root, 'page'));
    const run = await runSetup(f, ['--ui'], e => (e.t === 'ask' && e.id in ANSWERS ? ANSWERS[e.id] : defaults(e)));
    expect(run.exit).toBe(0);
    expect(run.events[0]).toMatchObject({ t: 'run.start', cmd: 'setup', mode: 'interactive' });
    expect(run.events.at(-1)).toMatchObject({ t: 'run.end', status: 'done', exit: 0 });

    // The phase order of plan §3, every phase started once.
    const phases = run.events.filter(e => e.t === 'phase.start').map(e => e.t === 'phase.start' && e.id);
    expect(phases).toEqual(['pre', 'team', 'install', 'project', 'creds', 'jira', 'github', 'verify', 'done']);
    // Q4: the start is confirmed once, after the checklist.
    const pre = run.events.findIndex(e => e.t === 'preflight');
    const start = run.events.findIndex(e => e.t === 'ask' && e.id === 'start');
    expect(pre).toBeGreaterThan(0);
    expect(start).toBeGreaterThan(pre);
    // Q2: the install steps run in the background lane.
    const lane = run.events.filter(e => e.t === 'step.start' && e.phase === 'install');
    expect(lane.length).toBeGreaterThan(3);
    expect(lane.every(e => e.t === 'step.start' && e.lane)).toBe(true);
    // Every answer came from the page.
    expect(run.events.filter(e => e.t === 'answered').every(e => e.t === 'answered' && e.by === 'page')).toBe(true);

    const yaml = readFileSync(join(f.project, '.agents', 'project.yaml'), 'utf8');
    expect(yaml).toMatch(/project_name: Acme Shop/);
    expect(yaml).toMatch(/project_key: ACME/);
    expect(yaml).toMatch(/web_url: "?https:\/\/staging\.acme\.shop/);
    expect(yaml).toMatch(/default_env: staging/);
    expect(yaml).toMatch(/atlassian_url: "?https:\/\/acme\.atlassian\.net/);
    expect(yaml).toMatch(/^harnesses: \[codex\]/m);
    expect(yaml).not.toContain('# MAINTAINER COPY:');

    const env = readFileSync(join(f.project, '.env'), 'utf8');
    expect(env).toContain(`ATLASSIAN_API_TOKEN=${SECRET}`);
    expect(env).toContain('ATLASSIAN_EMAIL=qa@acme.dev');
    expect(statSync(join(f.project, '.env')).mode & 0o077).toBe(0);

    const state = JSON.parse(readFileSync(join(f.project, '.template', 'installer.state.json'), 'utf8')) as { agents: string[], postInstall: { agentsSetup: string }, steps: Record<string, string> };
    expect(state.agents).toEqual(['codex']);
    expect(state.postInstall.agentsSetup).toBe('completed');
    expect(state.steps['7-agents-setup']).toBeDefined();

    const runs = readdirSync(join(f.project, '.session', 'runs'));
    expect(runs).toHaveLength(1);
    const summary = readFileSync(join(f.project, '.session', 'runs', runs[0]), 'utf8');
    expect(summary).toContain('"t":"report"');
    // The secret: in .env only. Never in the stream, the journal, the summary or the terminal.
    expect(summary).not.toContain(SECRET);
    expect(JSON.stringify(run.events)).not.toContain(SECRET);
    expect(run.out).not.toContain(SECRET);
  }, 180_000);

  test('--headless with nobody to answer: terminal only, every question takes its default, the run finishes', async () => {
    const f = buildSetupFixture(join(root, 'headless'));
    const run = await runSetup(f, ['--headless']);
    expect(run.exit).toBe(0);
    expect(run.out).not.toContain('127.0.0.1');
    expect(existsSync(join(f.project, '.session', 'runs'))).toBe(false);
    // The same printer as the page run: phase headers, preflight rows, the report.
    expect(run.out).toContain('◆ Chequeo previo');
    expect(run.out).toContain('◆ Listo');
    expect(run.out).toMatch(/Instalación terminada/);
    const state = JSON.parse(readFileSync(join(f.project, '.template', 'installer.state.json'), 'utf8')) as { postInstall: { agentsSetup: string } };
    expect(state.postInstall.agentsSetup).toBe('skipped-non-interactive');
  }, 180_000);

  test('an unknown flag is refused before anything runs', async () => {
    const f = buildSetupFixture(join(root, 'flag'));
    const run = await runSetup(f, ['--dryrun']);
    expect(run.exit).toBe(2);
    expect(run.out).toContain('unknown option --dryrun');
    expect(existsSync(join(f.project, '.template', 'installer.state.json'))).toBe(false);
  }, 60_000);
});

// Declared after the describe on purpose: it runs once that afterAll has fired.
test.if(HEAVY_E2E)('the fixture projects leave nothing behind in the temp dir', () => {
  expect(existsSync(root)).toBe(false);
});
