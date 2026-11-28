import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WATCH = join(import.meta.dir, 'pr-watch.sh');
const FIXTURES = join(import.meta.dir, 'fixtures');
const root = mkdtempSync(join(tmpdir(), 'edd-watch-'));
const bin = join(root, 'bin');
const ghState = join(root, 'gh');
const home = join(root, 'home');
const started: string[] = [];

mkdirSync(bin);
mkdirSync(ghState);
writeFileSync(join(bin, 'gh'), [
  '#!/usr/bin/env bash',
  'case "$1 $2" in',
  '  "api user") echo me ;;',
  '  "pr view") cat "$FAKE_GH/pr.json" ;;',
  '  "api "*/issues/*/comments) cat "$FAKE_GH/plain.json" ;;',
  '  "api "*/pulls/*/comments) cat "$FAKE_GH/inline.json" ;;',
  '  *) echo "fake gh: unexpected $*" >&2; exit 1 ;;',
  'esac',
  '',
].join('\n'));
chmodSync(join(bin, 'gh'), 0o755);

const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_GH: ghState, EDD_WATCH_HOME: home };

function runWith(extra: Record<string, string>, ...args: string[]) {
  const r = Bun.spawnSync(['bash', WATCH, ...args], { env: { ...env, ...extra }, stdout: 'pipe', stderr: 'pipe' });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

const run = (...args: string[]) => runWith({}, ...args);

function serve(pr: string | object, plain: object[] = [], inline: object[] = []) {
  if (typeof pr === 'string') {
    copyFileSync(join(FIXTURES, pr), join(ghState, 'pr.json'));
  }
  else {
    writeFileSync(join(ghState, 'pr.json'), JSON.stringify(pr));
  }
  writeFileSync(join(ghState, 'plain.json'), JSON.stringify(plain));
  writeFileSync(join(ghState, 'inline.json'), JSON.stringify(inline));
}

function start(name: string, ...extra: string[]) {
  started.push(name);
  return run('start', 'pr-delivery', name, 'REPO=owner/name', 'PR=7', 'INTERVAL=1', ...extra);
}

const instance = (name: string, f: string) => join(home, 'instances', name, f);

async function until(check: () => boolean, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) {
      return;
    }
    await Bun.sleep(200);
  }
  throw new Error('condition not met in time');
}

const events = (name: string) => existsSync(instance(name, 'events.log')) ? readFileSync(instance(name, 'events.log'), 'utf8') : '';
const fixture = (f: string) => JSON.parse(readFileSync(join(FIXTURES, f), 'utf8'));

function stubDir(dir: string, tool: string, lines: string[]) {
  const path = join(root, dir);
  mkdirSync(path);
  writeFileSync(join(path, tool), ['#!/usr/bin/env bash', ...lines, ''].join('\n'));
  chmodSync(join(path, tool), 0o755);
  return path;
}

// The test runner's own pid stands in for the watcher: alive to the script, with a heartbeat of any age.
function idleWatch(name: string, age: number) {
  mkdirSync(join(home, 'instances', name), { recursive: true });
  writeFileSync(instance(name, 'meta.env'), 'PRESET=pr-delivery\n');
  writeFileSync(instance(name, 'events.log'), '');
  writeFileSync(instance(name, 'pid'), `${process.pid}\n`);
  writeFileSync(instance(name, 'heartbeat'), '');
  const beat = Math.floor(Date.now() / 1000) - age;
  utimesSync(instance(name, 'heartbeat'), beat, beat);
  return beat;
}

afterAll(() => {
  for (const name of started) {
    run('stop', name);
  }
  rmSync(root, { recursive: true, force: true });
});

describe('pr-delivery watch', () => {
  test('reports a finished check and a review, then ends on MERGED with one last event', async () => {
    serve('pr-open.json');
    expect(start('merged', 'IGNORE=me').code).toBe(0);
    const failing = fixture('pr-open.json');
    failing.statusCheckRollup[1] = { ...failing.statusCheckRollup[1], status: 'COMPLETED', conclusion: 'FAILURE' };
    failing.reviews = [{ id: 'PRR_1', state: 'CHANGES_REQUESTED', author: { login: 'lead' }, body: 'fix the flow' }];
    serve(failing, [{ id: 11, user: { login: 'me' }, updated_at: 't1', body: 'own note' }]);
    await until(() => events('merged').includes('REVIEW lead'));
    serve('pr-merged.json');
    await until(() => existsSync(instance('merged', 'ended')));

    const woke = run('wake', 'merged');
    expect(woke.code).toBe(0);
    const lines = woke.out.trim().split('\n');
    expect(lines.some(l => l.includes(`CHECK EDD/edd/evidence FAILURE on ${'a'.repeat(7)}`))).toBe(true);
    expect(lines.some(l => l.includes('REVIEW lead CHANGES_REQUESTED | fix the flow'))).toBe(true);
    expect(woke.out).not.toContain('own note');
    expect(woke.out).not.toContain('PR now: MERGED');
    expect(lines.filter(l => l.includes('WATCH ENDED'))).toHaveLength(1);
    expect(lines.at(-1)).toContain(`WATCH ENDED: PR #7 in owner/name is MERGED, merge commit ${'b'.repeat(40)}`);
    expect(existsSync(instance('merged', 'pid'))).toBe(false);

    const again = run('wake', 'merged');
    expect(again.code).toBe(3);
    expect(again.out).toContain('Nothing left to wake on');
  }, 30000);

  test('ends on CLOSED without a merge', async () => {
    serve('pr-open.json');
    expect(start('closed').code).toBe(0);
    serve('pr-closed.json');
    await until(() => existsSync(instance('closed', 'ended')));
    const woke = run('wake', 'closed');
    expect(woke.code).toBe(0);
    expect(woke.out.trim().split('\n').at(-1)).toContain('is CLOSED without a merge');
    expect(run('status', 'closed').out).toContain('closed: ENDED');
  }, 30000);

  test('a PR already merged at start ends on the first poll and refuses a restart', async () => {
    serve('pr-merged.json');
    expect(start('late').code).toBe(0);
    await until(() => existsSync(instance('late', 'ended')));
    const woke = run('wake', 'late');
    expect(woke.code).toBe(0);
    expect(woke.out.trim().split('\n').filter(l => l.includes('WATCH ENDED'))).toHaveLength(1);
    const restart = start('late');
    expect(restart.code).toBe(1);
    expect(restart.err).toContain('already ended');
  }, 30000);

  test('an open PR keeps its watcher alive', async () => {
    serve('pr-open.json');
    expect(start('open').code).toBe(0);
    await Bun.sleep(2500);
    expect(existsSync(instance('open', 'ended'))).toBe(false);
    expect(run('status', 'open').out).toContain('open: ALIVE');
    expect(run('stop', 'open').out).toContain('stopped');
    expect(run('wake', 'open').code).toBe(0);
    const after = run('wake', 'open');
    expect(after.code).toBe(3);
    expect(after.out).toContain('stopped on request');
  }, 30000);

  test('a name already used for another PR is refused', async () => {
    serve('pr-open.json');
    expect(start('taken').code).toBe(0);
    const other = run('start', 'pr-delivery', 'taken', 'REPO=other/repo', 'PR=7');
    expect(other.code).toBe(64);
    expect(other.err).toContain('REPO set differently');
    expect(start('taken').out).toContain('already running');
  }, 30000);

  test('the own login is reported unless IGNORE names it', async () => {
    serve('pr-open.json');
    expect(start('mine').code).toBe(0);
    serve('pr-open.json', [{ id: 21, user: { login: 'me' }, updated_at: 't1', body: 'agent reply' }]);
    await until(() => events('mine').includes('PR COMMENT me | agent reply'));
  }, 30000);
});

describe('heartbeat age', () => {
  const noWait = stubDir('no-wait', 'sleep', [
    '[ "$1" = 10 ] && echo "test end" > "$FAKE_ENDED"',
    'exit 0',
  ]);
  // GNU stat reads -f as "file system status": it prints that on stdout, then fails on the missing file "%m".
  const gnuStat = stubDir('gnu-stat', 'stat', [
    'if [ "$1 $2" = "-c %Y" ]; then echo "$FAKE_MTIME"; exit 0; fi',
    'if [ "$1" = -f ]; then printf \'  File: "%s"\\n    ID: 0 Namelen: 255 Type: ext2/ext3\\n\' "$3"; fi',
    'exit 1',
  ]);

  test.each([
    ['the platform stat', 'real', []],
    ['a GNU-like stat', 'gnu', [gnuStat]],
  ])('tells a fresh heartbeat from a stale one through %s', (_label, id, stubs) => {
    for (const { state, age, code } of [{ state: 'fresh', age: 0, code: 3 }, { state: 'stale', age: 1000, code: 2 }]) {
      const name = `${state}-${id}`;
      const beat = idleWatch(name, age);
      const extra = { PATH: [...stubs, noWait, env.PATH].join(':'), FAKE_MTIME: String(beat), FAKE_ENDED: instance(name, 'ended') };
      const shown = Number(/last poll (\d+)s ago/.exec(runWith(extra, 'status', name).out)?.[1]);
      expect(shown).toBeGreaterThanOrEqual(age);
      expect(shown).toBeLessThan(age + 60);
      const woke = runWith(extra, 'wake', name);
      expect(woke.code).toBe(code);
      expect(woke.out.includes('WATCH STALE')).toBe(state === 'stale');
    }
  }, 30000);
});
