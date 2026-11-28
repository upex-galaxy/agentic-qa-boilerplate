import type { BoardState, TrackerSnapshot, WatcherView } from './model.ts';
import type { Signature } from './sentinel.ts';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { SCHEMA, WATCHER_GRACE_MIN, watchersDown } from './model.ts';
import { signatureOf, toBaselineFile } from './sentinel.ts';
import { bucketed } from './test-fixtures.ts';

const CLI = join(import.meta.dir, 'index.ts');
const DEMO_CONFIG = join(import.meta.dir, 'demo', 'project.yaml');
const ALWAYS_IN_HOURS = ['--hours', '0-24', '--days', '0-6', '--stop-at', '24:00'];
let dir: string;
let procs: Bun.Subprocess[] = [];

const env = (extra: Record<string, string> = {}) => ({ ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG, MERGE_STATE_DIR: join(dir, 'merge'), ...extra });
const spawn = (cmd: string[]) => {
  const p = Bun.spawn(cmd, { env: env(), stdout: 'pipe', stderr: 'pipe' });
  procs.push(p);
  return p;
};
const sleeper = () => spawn(['sleep', '60']);
const kill = async (p: Bun.Subprocess) => {
  p.kill('SIGKILL');
  await p.exited;
};

function run(...args: string[]): { code: number, out: string } {
  const r = Bun.spawnSync(['bun', CLI, ...args], { env: env() });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}${r.stderr.toString()}` };
}
const ok = (...args: string[]) => {
  const r = run(...args);
  if (r.code !== 0) { throw new Error(`${args.join(' ')} failed: ${r.out}`); }
  return r.out;
};

// A fresh process per call: store.ts binds the board folder at import, and this one may already hold another.
function inBoard<T>(body: string, extra: Record<string, string> = {}): T {
  const code = `const W = await import(${JSON.stringify(join(import.meta.dir, 'watchers.ts'))});
    console.log(JSON.stringify(await (async () => { ${body} })()));`;
  const r = Bun.spawnSync([process.execPath, '-e', code], { env: env(extra) });
  if (r.exitCode !== 0) { throw new Error(`${r.stdout.toString()}${r.stderr.toString()}`); }
  return JSON.parse(r.stdout.toString().trim().split('\n').at(-1)!) as T;
}

const views = () => inBoard<WatcherView[]>('return W.watcherViews(\'sprint-1\');');
const down = () => watchersDown(views(), new Date()).map(w => w.name);
const sprintFile = (name: string) => join(dir, 'sprints', 'sprint-1', name);
const watchersFolder = () => sprintFile('watchers');
const recordOf = (name: string) => JSON.parse(readFileSync(join(watchersFolder(), `${name}.json`), 'utf8')) as WatcherView;

async function until<T>(read: () => T | undefined, what: string): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const v = read();
    if (v !== undefined) { return v; }
    await Bun.sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprint-board-watchers-'));
  ok('new', '--sprint', '1', '--started', '2026-10-01T00:00:00Z');
});

afterEach(async () => {
  await Promise.all(procs.map(kill));
  procs = [];
  rmSync(dir, { recursive: true, force: true });
});

describe('registered watchers', () => {
  test('a killed pid is flagged', async () => {
    const p = sleeper();
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid), '--match', 'sleep');
    expect(down()).toEqual([]);
    expect(ok('status')).not.toContain('not running');

    await kill(p);

    expect(down()).toEqual(['inbox']);
    expect(ok('status')).toContain(`! inbox not running (pid ${p.pid}, no clean exit)`);
    expect(ok('watcher', 'list')).toContain(`inbox  pid ${p.pid}  NOT running`);
  });

  test('a recycled pid (command line without the match) is flagged', () => {
    const p = sleeper();
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid), '--match', 'some-other-command');
    expect(down()).toEqual(['inbox']);
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid));
    expect(down()).toEqual([]);
  });

  test('a zombie is down; a ps that is missing or fails leaves the signal check as the answer', () => {
    const p = sleeper();
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid), '--match', 'sleep');
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    symlinkSync(Bun.which('git')!, join(bin, 'git'));
    const alive = (path: string) => inBoard<boolean>('return W.watcherViews(\'sprint-1\')[0].alive;', { PATH: path });
    const fakePs = (script: string) => {
      writeFileSync(join(bin, 'ps'), `#!/bin/sh\n${script}\n`);
      chmodSync(join(bin, 'ps'), 0o755);
      return alive(`${bin}${delimiter}${process.env.PATH}`);
    };

    expect(alive(bin)).toBe(true);
    expect(fakePs('exit 2')).toBe(true);
    expect(fakePs('echo "Z    sleep <defunct>"')).toBe(false);
  });

  test('a clean exit is quiet, then flagged after the grace period', async () => {
    const p = sleeper();
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid));
    inBoard(`W.markWatcherExit('sprint-1', 'inbox', ${p.pid}); return null;`);
    await kill(p);

    const list = views();
    const exited = Date.parse(list[0].exitedAt!);
    expect(watchersDown(list, new Date(exited + WATCHER_GRACE_MIN * 60_000))).toEqual([]);
    expect(watchersDown(list, new Date(exited + WATCHER_GRACE_MIN * 60_000 + 1)).map(w => w.name)).toEqual(['inbox']);
    expect(ok('watcher', 'list')).toContain('(exited ');

    const past = new Date(Date.now() - (WATCHER_GRACE_MIN + 1) * 60_000).toISOString();
    writeFileSync(join(watchersFolder(), 'inbox.json'), JSON.stringify({ ...recordOf('inbox'), exitedAt: past }));
    expect(ok('status')).toMatch(new RegExp(`! inbox not running \\(pid ${p.pid}, exited cleanly \\d{2}:\\d{2}\\)`));
  });

  test('a stale pid cannot mark a newer record exited', () => {
    const older = sleeper();
    const newer = sleeper();
    ok('watcher', 'register', 'sentinel', '--pid', String(older.pid));
    ok('watcher', 'register', 'sentinel', '--pid', String(newer.pid));

    inBoard(`W.markWatcherExit('sprint-1', 'sentinel', ${older.pid}); return null;`);
    expect(recordOf('sentinel')).toMatchObject({ pid: newer.pid });
    expect(recordOf('sentinel').exitedAt).toBeUndefined();

    inBoard(`W.markWatcherExit('sprint-1', 'sentinel', ${newer.pid}); return null;`);
    expect(recordOf('sentinel').exitedAt).toBeDefined();
  });

  test('nothing registered is quiet, and clear forgets a dead watcher', async () => {
    expect(down()).toEqual([]);
    expect(ok('status')).not.toContain('not running');
    expect(ok('watcher', 'list')).toContain('0 watcher(s) registered on sprint-1');

    const p = sleeper();
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid));
    await kill(p);
    expect(ok('watcher', 'clear', 'inbox')).toContain('cleared');
    expect(down()).toEqual([]);
    expect(ok('watcher', 'clear', 'inbox')).toContain('no watcher named inbox');
  });

  test('a bad name or pid is refused and writes nothing', () => {
    for (const name of ['../x', 'Inbox', '1st', 'a'.repeat(32)]) {
      expect(run('watcher', 'register', name, '--pid', '1').out).toContain('watcher name must match');
    }
    expect(run('watcher', 'clear', '../sprint').out).toContain('watcher name must match');
    for (const pid of ['0', '-4', '1.5', 'abc']) {
      const r = run('watcher', 'register', 'inbox', `--pid=${pid}`);
      expect(r.code).toBe(1);
      expect(r.out).toContain('pid must be a whole number above 0');
    }
    expect(run('watcher', 'register', 'inbox').out).toContain('missing --pid');
    expect(run('watcher', 'stop', 'inbox').code).toBe(1);
    expect(run('watcher', 'register', 'inbox', '--pid', '1', '--sprint-slug', 'sprint-9').code).toBe(1);
    expect(existsSync(watchersFolder())).toBe(false);
    expect(existsSync(join(dir, 'sprints', 'sprint-9'))).toBe(false);
  });

  test('a --match that starts with "--" or is bare is refused, and the = form stores it', () => {
    const p = spawn(['sleep', '--', '60']);
    for (const match of [['--match', '--'], ['--match'], ['--match=']]) {
      const r = run('watcher', 'register', 'inbox', '--pid', String(p.pid), ...match);
      expect(r.code).toBe(1);
      expect(r.out).toContain('--match=<text>');
    }
    expect(existsSync(watchersFolder())).toBe(false);

    ok('watcher', 'register', 'inbox', '--pid', String(p.pid), '--match=-- 60');
    expect(recordOf('inbox')).toMatchObject({ match: '-- 60' });
    expect(down()).toEqual([]);
  });

  test('a record with a wrongly typed field is not a registration', () => {
    ok('watcher', 'register', 'inbox', '--pid', String(sleeper().pid));
    const good = recordOf('inbox');
    const bad: Record<string, unknown> = { list: ['list'], numeric: 5, nomatch: { name: 'nomatch', match: 5 }, noexit: { name: 'noexit', exitedAt: 4102444800000 }, nostart: { name: 'nostart', startedAt: null }, textpid: { name: 'textpid', pid: '1' } };
    for (const [file, over] of Object.entries(bad)) {
      const record = Array.isArray(over) || typeof over !== 'object' ? { ...good, name: over } : { ...good, ...over };
      writeFileSync(join(watchersFolder(), `${Array.isArray(over) || typeof over !== 'object' ? String(over) : file}.json`), JSON.stringify(record));
    }
    writeFileSync(join(watchersFolder(), 'empty.json'), 'null');

    expect(ok('watcher', 'list')).toContain('1 watcher(s) registered on sprint-1');
    expect(views().map(w => w.name)).toEqual(['inbox']);
  });

  test('full, share and report snapshots and the archive carry no watchers', () => {
    ok('watcher', 'register', 'inbox', '--pid', String(sleeper().pid));
    const embedded = (file: string) => JSON.parse(/<script id="board-data" type="application\/json">(.*?)<\/script>/s.exec(readFileSync(file, 'utf8'))![1]) as BoardState;

    for (const mode of ['full', 'share', 'report']) {
      ok('snapshot', '--mode', mode);
      expect(embedded(sprintFile(`sprint-1-${mode}.html`))).not.toHaveProperty('watchers');
    }
    ok('archive');
    const archive = join(dir, 'archive');
    expect(embedded(join(archive, 'sprint-1.html'))).not.toHaveProperty('watchers');
    expect(JSON.parse(readFileSync(join(archive, 'sprint-1.state.json'), 'utf8'))).not.toHaveProperty('watchers');
    expect(run('watcher', 'register', 'late', '--pid', '1').out).toContain('is closed');
  }, 30_000);
});

describe('the sentinel registration', () => {
  const tracker = (): TrackerSnapshot => bucketed({
    v: SCHEMA,
    syncedAt: new Date().toISOString(),
    searched: { tickets: 1, tcs: 0, bugs: 0 },
    tickets: { 'DEMO-5': { status: 'Ready for QA', title: 'DEMO-5 title', tcs: [] } },
    bugs: {},
  });
  const seed = () => writeFileSync(sprintFile('source.json'), JSON.stringify(tracker()));
  // A baseline with nothing in it makes the first cycle wake; the current signature keeps it quiet.
  const baseline = (signature: Signature) => {
    const file = join(dir, 'baseline.json');
    writeFileSync(file, JSON.stringify(toBaselineFile({ baseline: signature, sweptAt: Date.now(), failures: 0, startFailures: 0 }, 'sprint-1', new Date())));
    return file;
  };
  // Without a listener on its port the sentinel would start a real board server.
  const withPort = async (fn: (port: string) => Promise<void>) => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('ok') });
    try { await fn(String(server.port)); }
    finally { await server.stop(true); }
  };
  const sentinel = (file: string, port: string, ...extra: string[]) => spawn([process.execPath, CLI, 'sentinel', '--baseline', file, '--port', port, ...ALWAYS_IN_HOURS, ...extra]);

  test('--once and --dry-run register nothing', async () => withPort(async (port) => {
    seed();
    ok('sentinel', '--once', '--port', port);
    const dry = sentinel(baseline(signatureOf([], bucketed({ ...tracker(), tickets: {} }))), port, '--dry-run');
    expect(await new Response(dry.stdout).text()).toContain('SENTINEL WAKE change');
    expect(await dry.exited).toBe(0);
    expect(existsSync(watchersFolder())).toBe(false);
  }), 20_000);

  test('a wake leaves its registration marked as a clean exit', async () => withPort(async (port) => {
    seed();
    const proc = sentinel(baseline(signatureOf([], bucketed({ ...tracker(), tickets: {} }))), port);
    expect(await new Response(proc.stdout).text()).toContain('SENTINEL WAKE change');
    expect(await proc.exited).toBe(0);
    expect(readdirSync(watchersFolder())).toEqual(['sentinel.json']);
    expect(recordOf('sentinel')).toMatchObject({ pid: proc.pid });
    expect(recordOf('sentinel').exitedAt).toBeDefined();
    expect(down()).toEqual([]);
  }), 20_000);

  test('a quiet sentinel counts as running, and is flagged once killed', async () => withPort(async (port) => {
    seed();
    const proc = sentinel(baseline(signatureOf([], tracker())), port);
    await until(() => (existsSync(join(watchersFolder(), 'sentinel.json')) ? true : undefined), 'the sentinel registration');
    expect(views()).toMatchObject([{ name: 'sentinel', pid: proc.pid, alive: true }]);

    await kill(proc);

    expect(down()).toEqual(['sentinel']);
  }), 20_000);
});

describe('the live server', () => {
  const serve = async () => {
    const server = spawn([process.execPath, CLI, 'serve', '--port', '0', '--merge-every', '0']);
    const out = (server.stdout as ReadableStream<Uint8Array>).getReader();
    const url = /http:\/\/127\.0\.0\.1:\d+/.exec(new TextDecoder().decode((await out.read()).value))![0];
    return { server, url };
  };

  test('stays up when the watchers cannot be read', async () => {
    writeFileSync(watchersFolder(), 'a file where the folder goes');
    const { server, url } = await serve();
    await Bun.sleep(2500);
    expect(server.exitCode).toBeNull();
    const state = await fetch(`${url}/api/state`);
    expect(state.status).toBe(200);
    expect((await state.json() as BoardState).warnings.join()).toContain('watchers could not be read');
  }, 20_000);

  test('attaches the watchers to an open board and tells the page when one dies', async () => {
    const p = sleeper();
    ok('watcher', 'register', 'inbox', '--pid', String(p.pid));
    const { url } = await serve();
    const state = async () => await (await fetch(`${url}/api/state`)).json() as BoardState;
    expect((await state()).watchers).toMatchObject([{ name: 'inbox', pid: p.pid, alive: true }]);

    // Past the first signature check, which always reports a change.
    await Bun.sleep(2000);
    const abort = new AbortController();
    const events = (await fetch(`${url}/events`, { signal: abort.signal })).body!.getReader();
    await kill(p);
    let seen = '';
    while (!seen.includes('event: changed')) { seen += new TextDecoder().decode((await events.read()).value); }
    abort.abort();

    expect((await state()).watchers).toMatchObject([{ name: 'inbox', alive: false }]);
    ok('sprint', '--closed');
    expect(await state()).not.toHaveProperty('watchers');
  }, 30_000);
});
