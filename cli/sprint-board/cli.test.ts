/**
 * The CLI end to end, against a throwaway SPRINT_BOARD_DIR. Every case is a
 * finding from a review of the source board.
 */
import type { BoardEvent, Sprint } from './model.ts';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { takeOverStaleLock } from './store.ts';

const CLI = join(import.meta.dir, 'index.ts');
/** The demo project's `board:` block (key DEMO-n), so the cases never depend on this checkout's config. */
const DEMO_CONFIG = join(import.meta.dir, 'demo', 'project.yaml');
const TK = 'DEMO-999991';
let dir: string;

function run(...args: string[]): { code: number, out: string } {
  const r = Bun.spawnSync(['bun', CLI, ...args], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG } });
  return { code: r.exitCode ?? 1, out: `${r.stdout.toString()}${r.stderr.toString()}` };
}
const ok = (...args: string[]) => {
  const r = run(...args);
  if (r.code !== 0) { throw new Error(`${args.join(' ')} failed: ${r.out}`); }
  return r.out;
};
const sprintJson = (): Sprint => JSON.parse(readFileSync(join(dir, 'sprints', 'sprint-1', 'sprint.json'), 'utf8'));
const events = (): BoardEvent[] => readFileSync(join(dir, 'sprints', 'sprint-1', 'events.ndjson'), 'utf8').trim().split('\n').map(l => JSON.parse(l));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprint-board-cli-'));
  ok('new', '--sprint', '1', '--goal', 'original goal', '--started', '2026-10-01T00:00:00Z');
  ok('add', TK);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('new --reuse', () => {
  test('keeps the existing sprint and appends no second opening', () => {
    ok('sprint', '--person', 'Kim Carter=Product,en,Kim');
    ok('release', 'v1', '--at', '2026-10-02T00:00:00Z');
    const before = sprintJson();
    const count = events().length;

    ok('new', '--sprint', '1', '--reuse', '--goal', 'other goal');

    expect(sprintJson()).toEqual(before);
    expect(events().length).toBe(count);
    expect(readFileSync(join(dir, 'CURRENT'), 'utf8').trim()).toBe('sprint-1');
  });
});

describe('--at', () => {
  test('is stored as ISO', () => {
    ok('log', 'a note', '--at', '2026-10-05 10:00Z');
    expect(events().at(-1)?.at).toBe('2026-10-05T10:00:00.000Z');
  });

  test('an unparseable value is refused', () => {
    const r = run('log', 'a note', '--at', 'yesterday-ish');
    expect(r.code).toBe(1);
    expect(r.out).toContain('is not a date/time');
  });
});

describe('boolean flags', () => {
  test('say --ask "text" keeps the text', () => {
    ok('say', '--ask', 'Create board 2?');
    const e = events().at(-1)!;
    expect(e.data?.text).toBe('Create board 2?');
    expect(e.data?.ask).toBe(true);
  });
});

describe('answer and resolve target a real open need', () => {
  const needIds = () => events().filter(e => e.kind === 'need.open').map(e => String(e.data?.id));

  test('answer --id with a typo is refused', () => {
    ok('needs-you', TK, 'a or b?');
    const r = run('answer', TK, 'a', '--id', 'need-typo');
    expect(r.code).toBe(1);
    expect(r.out).toContain('need-typo is not an open question');
  });

  test('resolve --id for a need that does not exist is refused', () => {
    ok('needs-you', TK, 'a or b?');
    const r = run('resolve', TK, '--id', 'need-x');
    expect(r.code).toBe(1);
    expect(r.out).toContain('need-x is not an open question');
  });

  test('a bare resolve with two open needs is refused and names both', async () => {
    ok('needs-you', TK, 'first?');
    await Bun.sleep(5);
    ok('needs-you', TK, 'second?');
    const [a, b] = needIds();
    const r = run('resolve', TK);
    expect(r.code).toBe(1);
    expect(r.out).toContain(a);
    expect(r.out).toContain(b);
  });

  test('a bare resolve with one open need closes that one by id', () => {
    ok('needs-you', TK, 'only?');
    ok('resolve', TK);
    expect(events().at(-1)?.data?.id).toBe(needIds()[0]);
  });
});

describe('verdict', () => {
  test('PENDING is refused and points at BLOCKED plus hold', () => {
    const r = run('verdict', TK, 'PENDING');
    expect(r.code).toBe(1);
    expect(r.out).toContain('BLOCKED --note');
    expect(r.out).toContain(`hold ${TK} --reason no-data|other --on <who>`);
  });
});

describe('ask and ask-state', () => {
  const askId = () => String(events().filter(e => e.kind === 'ask.create').at(-1)!.data!.id);
  const states = () => events().filter(e => e.kind === 'ask.state');
  const ask = (...extra: string[]) => {
    ok('sprint', '--person', 'Kim Carter=Dev,en,Kim');
    ok('ask', '--to', 'Kim', '--ticket', TK, '--text', 'private words for Kim only', ...extra);
    return askId();
  };

  test('a reply is expected by kind, and either flag overrides it', () => {
    ask('--kind', 'bug');
    expect(events().at(-1)?.data?.twoWay).toBe(true);
    ask('--kind', 'fyi');
    expect(events().at(-1)?.data?.twoWay).toBe(false);
    ask('--kind', 'fyi', '--two-way');
    expect(events().at(-1)?.data?.twoWay).toBe(true);
    ask('--kind', 'bug', '--one-way');
    expect(events().at(-1)?.data?.twoWay).toBe(false);
    expect(run('ask', '--to', 'Kim', '--text', 'x', '--one-way', '--two-way').out).toContain('not both');
    expect(run('ask', '--to', 'Kim', '--text', 'x', '--by', 'claude').out).toContain('--by must be one of');
    expect(run('ask', '--to', 'Kim', '--text', 'x', '--by', 'owner').out).toContain('--by owner is refused');
  });

  test('ask-state needs an author, and the CLI can never be the owner', () => {
    const id = ask();
    const bare = run('ask-state', id, 'sent');
    expect(bare.code).toBe(1);
    expect(bare.out).toContain('missing --by conductor|sentinel|worker');
    for (const spelling of [['--by', 'owner'], ['--by', 'Owner'], ['--by', ' OWNER '], ['--by=owner'], ['--by', 'conductor', '--by', 'owner']]) {
      const r = run('ask-state', id, 'sent', ...spelling);
      expect(r.code).toBe(1);
      expect(r.out).toContain('--by owner is refused');
    }
    expect(run('ask-state', id, 'sent', '--by').out).toContain('--by must be one of');
    expect(states()).toHaveLength(0);
  });

  test('moves along the table, repeats write nothing, and a refusal says where the ask is now', () => {
    const id = ask();
    expect(ok('ask-state', id, 'sent', '--by', 'sentinel')).toContain(`${id} -> sent`);
    expect(ok('ask-state', id, 'sent', '--by', 'conductor')).toContain(`${id} already sent (by sentinel at `);
    ok('ask-state', id, 'answered', '--reply', 'tomorrow', '--reply-at', '2026-10-05 10:00Z', '--by', 'conductor');
    expect(states().at(-1)).toMatchObject({ by: 'conductor', data: { state: 'answered', reply: 'tomorrow', replyAt: '2026-10-05T10:00:00.000Z' } });
    const jump = run('ask-state', id, 'draft', '--by', 'conductor');
    expect(jump.code).toBe(1);
    expect(jump.out).toContain('cannot go from answered to draft (now answered, by conductor at ');
    const stale = run('ask-state', id, 'closed', '--expect', 'sent', '--by', 'conductor');
    expect(stale.out).toContain('is answered now, not sent');
    ok('ask-state', id, 'closed', '--by', 'worker');
    expect(states().map(e => `${String(e.data?.state)}:${e.by}`)).toEqual(['sent:sentinel', 'answered:conductor', 'closed:worker']);
  });

  test('an unknown id, an unknown actor and a flag of another state are refused', () => {
    const id = ask();
    const as = (...args: string[]) => run('ask-state', ...args, '--by', 'conductor').out;
    expect(as('ask-nope', 'sent')).toContain('no ask ask-nope');
    expect(run('ask-state', id, 'sent', '--by', `worker:${TK}`).out).toContain('--by must be one of');
    expect(as(id, 'sent', '--reply', 'x')).toContain('--reply goes with the answered state');
    expect(as(id, 'sent', '--link', 'https://chat.example/d')).toContain('--link goes with the drafted state');
    expect(as(id, 'drafted', '--link', 'file:///tmp/x')).toContain('--link must be an https URL');
    expect(states()).toHaveLength(0);
  });

  test('a blank or valueless reply, link or error is refused and keeps what was recorded', () => {
    const id = ask();
    ok('ask-state', id, 'sent', '--by', 'conductor');
    ok('ask-state', id, 'answered', '--reply', 'tomorrow', '--by', 'conductor');
    const refused = [
      ['answered', '--reply'],
      ['answered', '--reply='],
      ['answered', '--reply', '   '],
      ['answered', '--reply-at'],
      ['drafted', '--link'],
      ['draft-failed', '--error'],
      ['draft-failed', '--error', ''],
    ];
    for (const args of refused) {
      const r = run('ask-state', id, ...args, '--by', 'conductor');
      expect([args, r.code]).toEqual([args, 1]);
      expect(r.out).toContain(`${args[1].replace('=', '')} needs a value`);
    }
    expect(states().flatMap(e => e.data?.reply ?? [])).toEqual(['tomorrow']);
  });

  test('a long reply is recorded cut, and an oversized proposal does not point at a flag it cannot use', () => {
    const id = ask();
    ok('ask-state', id, 'sent', '--by', 'conductor');
    ok('ask-state', id, 'answered', '--reply', '漢'.repeat(1500), '--by', 'conductor');
    expect(String(states().at(-1)?.data?.reply)).toBe('漢'.repeat(800));
    const big = run('ask', '--to', 'Kim', '--text', 'x'.repeat(5000));
    expect(big.out).toContain('shorten the text');
    expect(big.out).not.toContain('--file');
  });

  test('a proposal dated in the future is refused', () => {
    ask();
    const r = run('ask', '--to', 'Kim', '--text', 'later', '--at', '2099-01-01');
    expect(r.code).toBe(1);
    expect(r.out).toContain('is in the future');
    expect(events().filter(e => e.kind === 'ask.create')).toHaveLength(1);
  });

  test('with no messenger, approving and drafting are refused', () => {
    const id = ask();
    for (const args of [['approved'], ['drafted', '--link', 'https://chat.example/d'], ['draft-failed', '--error', 'no']]) {
      const r = run('ask-state', id, ...args, '--by', 'conductor');
      expect(r.code).toBe(1);
      expect(r.out).toContain('no messenger is configured');
    }
    expect(states()).toHaveLength(0);
  });

  test('the share and report copies carry nothing of an ask', () => {
    const id = ask();
    ok('ask-state', id, 'sent', '--by', 'conductor');
    ok('ask-state', id, 'answered', '--reply', 'private answer from Kim', '--by', 'conductor');
    for (const mode of ['share', 'report']) {
      const out = join(dir, `${mode}.html`);
      ok('snapshot', '--mode', mode, '--out', out);
      const html = readFileSync(out, 'utf8');
      expect(html).not.toContain('private words for Kim only');
      expect(html).not.toContain('private answer from Kim');
      expect(html).not.toContain(id);
    }
  });
});

describe('tc DEFERRED', () => {
  test('is refused with neither --reason nor --approval, and the message names --reason', () => {
    const r = run('tc', TK, 'TC-1', 'DEFERRED');
    expect(r.code).toBe(1);
    expect(r.out).toContain('--reason "QA decision');
  });

  test('a QA reason alone is accepted and stored on the event', () => {
    ok('tc', TK, 'TC-1', 'DEFERRED', '--reason', 'QA decision 2026-10-16: only the payment provider produces this data');
    expect(events().at(-1)?.data).toMatchObject({ tc: 'TC-1', status: 'DEFERRED', reason: 'QA decision 2026-10-16: only the payment provider produces this data' });
  });

  test('--approval alone still works for an owner decision', () => {
    ok('tc', TK, 'TC-1', 'DEFERRED', '--approval', 'Rowan, chat 2026-10-16');
    expect(events().at(-1)?.data).toMatchObject({ status: 'DEFERRED', approval: 'Rowan, chat 2026-10-16' });
  });
});

describe('withSourceLock wait', () => {
  test('takes the lock as soon as the holder releases it', () => {
    const store = join(import.meta.dir, 'store.ts');
    const lock = join(dir, 'sprints', 'sprint-1', 'source.json.lock');
    writeFileSync(lock, '4242 2026-10-16T09:06:00Z\n');
    const script = `
      import { rmSync } from 'node:fs';
      import { withSourceLock } from ${JSON.stringify(store)};
      setTimeout(() => rmSync(${JSON.stringify(lock)}), 300);
      let waits = 0;
      const got = await withSourceLock('sprint-1', async () => 'ran', { waitMs: 5000, pollMs: 50, onWait: () => waits++ });
      console.log(got, waits);`;
    const r = Bun.spawnSync(['bun', '-e', script], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG } });
    expect(`${r.stdout.toString()}${r.stderr.toString()}`.trim()).toBe('ran 1');
    expect(existsSync(lock)).toBe(false);
  }, 15_000);

  test('an unreadable lock (not ENOENT) is an error, not a spin', () => {
    const store = join(import.meta.dir, 'store.ts');
    mkdirSync(join(dir, 'sprints', 'sprint-1', 'source.json.lock'));
    const script = `
      import { withSourceLock } from ${JSON.stringify(store)};
      try { await withSourceLock('sprint-1', async () => 'ran', { waitMs: 0 }); console.log('ran'); }
      catch (err) { console.log('threw', err.code ?? err.message); }`;
    const r = Bun.spawnSync(['bun', '-e', script], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG }, timeout: 10_000 });
    expect(`${r.stdout.toString()}${r.stderr.toString()}`.trim()).toBe('threw EISDIR');
  }, 15_000);

  test('a stale lock is taken over and leaves no tombstone behind', () => {
    const store = join(import.meta.dir, 'store.ts');
    const lock = join(dir, 'sprints', 'sprint-1', 'source.json.lock');
    writeFileSync(lock, '4242 2026-10-16T08:00:00Z\n');
    const old = new Date(Date.now() - 20 * 60_000);
    utimesSync(lock, old, old);
    const script = `
      import { withSourceLock } from ${JSON.stringify(store)};
      console.log(await withSourceLock('sprint-1', async () => 'ran', { waitMs: 0 }));`;
    const r = Bun.spawnSync(['bun', '-e', script], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG }, timeout: 10_000 });
    expect(`${r.stdout.toString()}${r.stderr.toString()}`.trim()).toBe('ran');
    expect(readdirSync(join(dir, 'sprints', 'sprint-1')).filter(n => n.includes('.lock'))).toEqual([]);
  }, 15_000);
});

describe('takeOverStaleLock', () => {
  test('puts back a fresh lock another waiter took after the stale one was judged', () => {
    const lock = join(dir, 'race.lock');
    writeFileSync(lock, 'stale\n');
    const seen = statSync(lock);
    // Another waiter already replaced it: a new inode in the same place.
    writeFileSync(`${lock}.new`, 'fresh\n');
    renameSync(`${lock}.new`, lock);

    expect(takeOverStaleLock(lock, seen)).toBe(false);
    expect(readFileSync(lock, 'utf8')).toBe('fresh\n');
    expect(readdirSync(dir).filter(n => n.includes('.stale.'))).toEqual([]);
  });

  test('removes the lock it judged stale, and a second waiter finds nothing to move', () => {
    const lock = join(dir, 'race.lock');
    writeFileSync(lock, 'stale\n');
    const seen = statSync(lock);

    expect(takeOverStaleLock(lock, seen)).toBe(true);
    expect(takeOverStaleLock(lock, seen)).toBe(false);
    expect(existsSync(lock)).toBe(false);
    expect(readdirSync(dir).filter(n => n.includes('.stale.'))).toEqual([]);
  });
});

describe('arrivals: sprint tickets in test off the board', () => {
  const trackerJson = (extra: Record<string, unknown>) => writeFileSync(join(dir, 'sprints', 'sprint-1', 'source.json'), JSON.stringify({
    v: 1,
    syncedAt: '2026-10-16T09:00:00Z',
    searched: { tickets: 1, tcs: 0, bugs: 0 },
    tickets: { [TK]: { status: 'In Progress', bucket: 'not_ready', tcs: [] } },
    bugs: {},
    ...extra,
  }));

  test('prints one UNTRACKED line per row with its QA, and the denominator searched', () => {
    trackerJson({ discover: { at: '2026-10-16T09:00:00Z', sprintRows: 41, untracked: [
      { id: 'DEMO-7360', status: 'Ready for QA', bucket: 'in_test', title: 'Blank QA ticket' },
      { id: 'DEMO-7440', status: 'Ready for QA', bucket: 'in_test', qa: 'Other QA', title: 'Someone else' },
    ] } });
    const out = ok('arrivals');
    expect(out).toContain('untracked: 2 of 41 sprint rows in staging but not on the board');
    expect(out).toContain('UNTRACKED DEMO-7360  Ready for QA  QA:blank  Blank QA ticket');
    expect(out).toContain('UNTRACKED DEMO-7440  Ready for QA  QA:Other QA  Someone else');
  });

  test('a ticket added since the discover is no longer listed, and the count says so', () => {
    trackerJson({ discover: { at: '2026-10-16T09:00:00Z', sprintRows: 41, untracked: [
      { id: 'DEMO-7360', status: 'Ready for QA', bucket: 'in_test', title: 'Blank QA ticket' },
      { id: 'DEMO-7440', status: 'Ready for QA', bucket: 'in_test', qa: 'Other QA', title: 'Someone else' },
    ] } });
    ok('add', 'demo-7360');
    const out = ok('arrivals');
    expect(out).toContain('untracked: 1 of 41 sprint rows in staging but not on the board');
    expect(out).toContain('1 more listed then are on the board now');
    expect(out).not.toContain('UNTRACKED DEMO-7360');
    expect(out).toContain('UNTRACKED DEMO-7440');
  });

  test('says it did not check when no discover ever ran', () => {
    trackerJson({});
    expect(ok('arrivals')).toContain('untracked: not checked');
  });
});

describe('closed boards', () => {
  test('sync refuses a closed sprint before reaching tracker', () => {
    ok('sprint', '--closed', '2026-10-10T00:00:00Z');
    const r = run('sync');
    expect(r.code).toBe(1);
    expect(r.out).toContain('is closed');
  });

  test('a board closed while sync waited for the lock is refused once the lock is free', async () => {
    const lock = join(dir, 'sprints', 'sprint-1', 'source.json.lock');
    writeFileSync(lock, '4242 2026-10-16T09:06:00Z\n');
    const p = Bun.spawn(['bun', CLI, 'sync', '--lock-wait', '20'], { env: { ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG }, stdout: 'pipe', stderr: 'pipe' });
    const reader = p.stdout.getReader();
    let out = '';
    while (!out.includes('waiting for the tracker sync lock')) {
      const { value, done } = await reader.read();
      if (done) { break; }
      out += new TextDecoder().decode(value);
    }
    ok('sprint', '--closed', '2026-10-16T10:00:00Z');
    rmSync(lock);
    expect(await p.exited).toBe(1);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { break; }
      out += new TextDecoder().decode(value);
    }
    out += await new Response(p.stderr).text();
    expect(out).toContain('was closed');
    expect(out).toContain('while this sync waited for the lock');
  }, 30_000);

  test('a fresh source.json.lock with --lock-wait 0 refuses at once, and the lock is left to its owner', () => {
    const lock = join(dir, 'sprints', 'sprint-1', 'source.json.lock');
    writeFileSync(lock, '1 2026-10-15T00:00:00Z\n');
    const r = run('sync', '--lock-wait', '0');
    expect(r.code).toBe(1);
    expect(r.out).toContain('another tracker sync is running');
    expect(existsSync(lock)).toBe(true);
  });

  test('a CLI sync waits for a held lock, says so once, and gives up after --lock-wait', () => {
    const lock = join(dir, 'sprints', 'sprint-1', 'source.json.lock');
    writeFileSync(lock, '4242 2026-10-16T09:06:00Z\n');
    const r = run('arrivals', '--sync', '--lock-wait', '1');
    expect(r.code).toBe(1);
    expect(r.out.match(/waiting for the tracker sync lock/g)?.length).toBe(1);
    expect(r.out).toContain('held by 4242');
    expect(r.out).toContain('still holds');
    expect(existsSync(lock)).toBe(true);
  }, 15_000);

  test('archive records the close it was rendered with', () => {
    ok('archive');
    const state = JSON.parse(readFileSync(join(dir, 'archive', 'sprint-1.state.json'), 'utf8')) as { sprint: Sprint };
    expect(sprintJson().closedAt).toBeTruthy();
    expect(state.sprint.closedAt).toBe(sprintJson().closedAt);
  }, 30_000);
});

describe('evidence-artifact', () => {
  const URL1 = 'https://claude.ai/artifact/abc123';
  const URL2 = 'https://claude.ai/code/artifact/0f8fad5b-d9cb-469f-a165-70867728950e';

  test('records the page; a second one replaces it on the page and says so', () => {
    expect(ok('evidence-artifact', TK, URL1, '--by', 'worker', '--title', 'v1')).toContain(`${TK} evidence page ${URL1}`);
    const out = ok('evidence-artifact', TK, `${URL2}/`, '--by', 'conductor');
    expect(out).toContain('replaces the page recorded');
    const pages = events().filter(e => e.kind === 'evidence.artifact');
    expect(pages.map(e => e.data?.url)).toEqual([URL1, URL2]);
    expect(pages[1].by).toBe('conductor');
  });

  test('refuses a URL that is not a claude.ai artifact, and a missing or unknown --by', () => {
    expect(run('evidence-artifact', TK, 'https://example.com/artifact/abc', '--by', 'worker').out).toContain('is not in board.evidence.allowed_hosts');
    expect(run('evidence-artifact', TK, URL1).out).toContain('missing --by');
    expect(run('evidence-artifact', TK, URL1, '--by', 'someone').out).toContain('--by must be one of');
    expect(events().some(e => e.kind === 'evidence.artifact')).toBe(false);
  });

  test('--bug must be a bug the board knows; once linked it is accepted', () => {
    const r = run('evidence-artifact', TK, URL1, '--bug', 'DEMO-999992', '--by', 'worker');
    expect(r.code).toBe(1);
    expect(r.out).toContain('is not a bug on the sprint-1 board (0 bugs searched');
    ok('bug', TK, 'DEMO-999992', '--title', 'a bug', '--severity', 'Low', '--evidence-embedded');
    expect(ok('evidence-artifact', TK, URL1, '--bug', 'DEMO-999992', '--by', 'worker')).toContain(`DEMO-999992 (bug on ${TK}) evidence page`);
    expect(events().at(-1)?.data?.bug).toBe('DEMO-999992');
  });

  test('the old name evidence-page still records the link, as evidence.artifact', () => {
    expect(ok('evidence-page', TK, URL1, '--by', 'worker')).toContain(`${TK} evidence page ${URL1}`);
    expect(events().at(-1)?.kind).toBe('evidence.artifact');
  });
});

describe('snapshot', () => {
  test('inlines the stylesheet (index.html writes the link self-closed)', () => {
    ok('snapshot');
    const html = readFileSync(join(dir, 'sprints', 'sprint-1', 'sprint-1-full.html'), 'utf8');
    expect(html).toContain('<style>');
    expect(html).not.toContain('href="/app.css"');
  });

  test('--mode report writes the report page; --fragment drops the skeleton; bad --mode and --stp-url stop', () => {
    ok('snapshot', '--mode', 'report', '--fragment', '--stp-url', 'https://claude.ai/artifact/stp1');
    const html = readFileSync(join(dir, 'sprints', 'sprint-1', 'sprint-1-report-fragment.html'), 'utf8');
    expect(html).toContain('<title>Sprint 1 QA Report</title>');
    expect(html).toContain('"mode":"report"');
    expect(html).not.toMatch(/<!doctype|<meta charset/i);
    expect(run('snapshot', '--mode', 'bogus').out).toContain('--mode must be one of: full, share, report');
    expect(run('snapshot', '--mode', 'share', '--stp-url', 'https://tracker.io/d/x').out).toContain('--stp-url only applies to --mode report');
    expect(run('snapshot', '--mode', 'report', '--stp-url', 'javascript:alert(1)').out).toContain('must be an https link');
  });
});
