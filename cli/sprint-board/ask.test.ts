import type { BoardEvent } from './model.ts';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

const CLI = join(import.meta.dir, 'index.ts');
const DEMO_CONFIG = join(import.meta.dir, 'demo', 'project.yaml');
const WRITER = JSON.stringify(join(import.meta.dir, 'ask-transition.ts'));
const STORE = JSON.stringify(join(import.meta.dir, 'store.ts'));
const FAKE = 'let calls = 0; const fake = { id: \'fake\', createDraft: async (r) => { calls++; return { ok: true, link: \'https://chat.example/d/\' + r.id, ref: \'ref-\' + calls }; } };';
let dir: string;

const env = () => ({ ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG });
const file = (name: string) => join(dir, 'sprints', 'sprint-1', name);
const events = (): BoardEvent[] => readFileSync(file('events.ndjson'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const writes = (id: string) => events().filter(e => e.kind === 'ask.state' && e.data?.id === id);

function cli(...args: string[]): string {
  const r = Bun.spawnSync(['bun', CLI, ...args], { env: env() });
  if (r.exitCode !== 0) { throw new Error(`${args.join(' ')} failed: ${r.stdout.toString()}${r.stderr.toString()}`); }
  return r.stdout.toString();
}
function newAsk(text = 'words for Kim'): string {
  cli('ask', '--to', 'Kim', '--ticket', 'DEMO-1', '--kind', 'bug', '--text', text);
  return String(events().filter(e => e.kind === 'ask.create').at(-1)!.data!.id);
}

function run(body: string): unknown {
  const script = `import { applyAskTransition, applyPageTransition, draftApproved, owesDraft } from ${WRITER}; import { withAskLock } from ${STORE};
    const shown = (p) => p.then(r => r, e => ({ status: e.status, error: e.message, current: e.current }));
    const go = (req, messenger) => shown(applyAskTransition('sprint-1', { by: 'conductor', ...req }, messenger));
    const page = (req, messenger) => shown(applyPageTransition('sprint-1', req, messenger));
    ${body}`;
  const r = Bun.spawnSync(['bun', '-e', script], { env: env() });
  if (r.exitCode !== 0) { throw new Error(r.stderr.toString()); }
  return JSON.parse(r.stdout.toString().trim().split('\n').at(-1)!);
}

async function race(count: number, request: Record<string, unknown>): Promise<{ noop?: boolean, error?: string }[]> {
  const gate = join(dir, 'go');
  const script = `import { applyAskTransition } from ${WRITER}; import { existsSync } from 'node:fs';
    console.log('ready');
    while (!existsSync(${JSON.stringify(gate)})) { await Bun.sleep(1); }
    console.log(JSON.stringify(await applyAskTransition('sprint-1', ${JSON.stringify(request)}).catch(e => ({ error: e.message }))));`;
  const children = Array.from({ length: count }, () => Bun.spawn(['bun', '-e', script], { env: env(), stdout: 'pipe', stderr: 'pipe' }));
  const outputs = await Promise.all(children.map(async (child) => {
    const reader = child.stdout.getReader();
    const first = await reader.read();
    return { child, reader, seen: new TextDecoder().decode(first.value) };
  }));
  writeFileSync(gate, '');
  return Promise.all(outputs.map(async ({ child, reader, seen }) => {
    let out = seen;
    for (;;) {
      const next = await reader.read();
      if (next.done) { break; }
      out += new TextDecoder().decode(next.value);
    }
    expect(await child.exited).toBe(0);
    return JSON.parse(out.trim().split('\n').at(-1)!);
  }));
}

// Reading a log this large takes far longer than the gap between two racing processes: without the lock they collide.
function padLog(): void {
  const line = (i: number) => JSON.stringify({ v: 1, id: `pad${i}`, at: '2026-10-01T00:00:00.000Z', kind: 'note', text: 'x'.repeat(200) });
  appendFileSync(file('events.ndjson'), `${Array.from({ length: 60_000 }, (_, i) => line(i)).join('\n')}\n`);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sprint-board-ask-'));
  cli('new', '--sprint', '1', '--started', '2026-10-01T00:00:00Z');
  cli('add', 'DEMO-1');
  cli('sprint', '--person', 'Kim Carter=Dev,en,Kim');
});

afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('the ask writer', () => {
  test('unknown id and unknown actor are 400, a stale expect and an illegal jump are 409, and none of them writes', () => {
    const id = newAsk();
    const [unknown, actor, stale, jump] = run(`console.log(JSON.stringify([
      await go({ id: 'ask-zzzzzz', state: 'sent' }),
      await go({ id: '${id}', state: 'sent', by: 'claude' }),
      await go({ id: '${id}', state: 'sent', expect: 'answered' }),
      await go({ id: '${id}', state: 'answered' }),
    ]))`) as Record<string, unknown>[];
    expect(unknown).toMatchObject({ status: 400, error: 'no ask ask-zzzzzz on the sprint-1 board (1 asks searched)' });
    expect(actor).toMatchObject({ status: 400 });
    expect(stale).toMatchObject({ status: 409, current: { state: 'draft' } });
    expect(String(stale.error)).toContain('is draft now, not answered');
    expect(jump).toMatchObject({ status: 409, error: `${id}: cannot go from draft to answered` });
    expect(writes(id)).toHaveLength(0);
  });

  test('the current state writes nothing, a new reply writes again, and a time before the current state is refused', () => {
    const id = newAsk();
    const results = run(`console.log(JSON.stringify([
      await page({ id: '${id}', state: 'sent' }),
      await go({ id: '${id}', state: 'sent' }),
      await go({ id: '${id}', state: 'answered', reply: 'first' }),
      await go({ id: '${id}', state: 'answered', reply: 'first' }),
      await go({ id: '${id}', state: 'answered', reply: 'second' }),
      await go({ id: '${id}', state: 'closed', at: '2026-10-01T00:00:00Z' }),
    ]))`) as Record<string, unknown>[];
    expect(results.map(r => r.noop ?? r.status)).toEqual([false, true, false, true, false, 409]);
    expect(results[1]).toMatchObject({ state: 'sent', by: 'owner' });
    expect(writes(id).map(e => e.data?.reply ?? e.data?.state)).toEqual(['sent', 'first', 'second']);
  });

  test('only the page writes as owner, whatever a caller names itself', () => {
    const id = newAsk();
    const results = run(`console.log(JSON.stringify([
      await go({ id: '${id}', state: 'sent', by: 'owner' }),
      await go({ id: '${id}', state: 'sent', by: ' Owner ' }),
      await go({ id: '${id}', state: 'sent', by: 'OWNER' }),
      await page({ id: '${id}', state: 'sent', by: 'conductor' }),
    ]))`) as Record<string, unknown>[];
    for (const r of results.slice(0, 3)) {
      expect(r).toMatchObject({ status: 400 });
      expect(String(r.error)).toContain('only the page writes');
    }
    expect(results[3]).toMatchObject({ noop: false, by: 'owner' });
    expect(writes(id).map(e => e.by)).toEqual(['owner']);
  });

  test('close from sent and from answered, and reopen returns to each', () => {
    const waiting = newAsk('waiting one');
    const replied = newAsk('replied one');
    const results = run(`console.log(JSON.stringify([
      await go({ id: '${waiting}', action: 'close' }),
      await go({ id: '${waiting}', action: 'reopen' }),
      await go({ id: '${waiting}', action: 'sent' }),
      await go({ id: '${waiting}', action: 'close' }),
      await go({ id: '${waiting}', action: 'reopen' }),
      await go({ id: '${replied}', action: 'sent' }),
      await go({ id: '${replied}', action: 'answered' }),
      await go({ id: '${replied}', action: 'close' }),
      await go({ id: '${replied}', action: 'reopen' }),
      await go({ id: '${replied}', action: 'reopen' }),
    ]))`) as Record<string, unknown>[];
    expect(results[0]).toMatchObject({ status: 409 });
    expect(results[1]).toMatchObject({ status: 400, error: `${waiting} is not closed; nothing to reopen` });
    expect(results[4]).toMatchObject({ from: 'closed', state: 'sent' });
    expect(results[8]).toMatchObject({ from: 'closed', state: 'answered' });
    expect(results[9]).toMatchObject({ noop: true, state: 'answered' });
  });

  test('a double click is a no-op even from the view before the first click, another target is still a 409', () => {
    const id = newAsk();
    const results = run(`console.log(JSON.stringify([
      await page({ id: '${id}', action: 'sent', expect: 'draft' }),
      await page({ id: '${id}', action: 'sent', expect: 'draft' }),
      await page({ id: '${id}', action: 'drop', expect: 'draft' }),
    ]))`) as Record<string, unknown>[];
    expect(results.map(r => r.noop ?? r.status)).toEqual([false, true, 409]);
    expect(writes(id)).toHaveLength(1);
  });

  test('a time in the future is refused, a small clock difference is not', () => {
    const id = newAsk();
    const soon = new Date(Date.now() + 60_000).toISOString();
    const results = run(`console.log(JSON.stringify([
      await go({ id: '${id}', state: 'sent', at: '2099-01-01' }),
      await go({ id: '${id}', state: 'sent', at: '${soon}' }),
      await page({ id: '${id}', action: 'answered' }),
    ]))`) as Record<string, unknown>[];
    expect(results[0]).toMatchObject({ status: 400 });
    expect(String(results[0].error)).toContain('is in the future');
    expect(results.slice(1).map(r => r.noop)).toEqual([false, false]);
    expect(writes(id)).toHaveLength(2);
  });

  test('an ask already stamped ahead of the clock still moves from the page, and the fold shows the move', () => {
    const id = newAsk();
    appendFileSync(file('events.ndjson'), `${JSON.stringify({ v: 1, id: 'ahead', at: '2099-01-01T00:00:00Z', kind: 'ask.state', by: 'conductor', text: 'ahead', data: { id, state: 'sent' } })}\n`);
    const results = run(`console.log(JSON.stringify([
      await page({ id: '${id}', action: 'answered', expect: 'sent' }),
      await page({ id: '${id}', action: 'close', expect: 'answered' }),
    ]))`) as Record<string, unknown>[];
    expect(results.map(r => r.state)).toEqual(['answered', 'closed']);
    expect(writes(id).map(e => e.at)).toEqual(['2099-01-01T00:00:00Z', '2099-01-01T00:00:00.001Z', '2099-01-01T00:00:00.002Z']);
  });

  test('a blank value never overwrites a recorded one', () => {
    const id = newAsk();
    const results = run(`console.log(JSON.stringify([
      await go({ id: '${id}', state: 'sent' }),
      await go({ id: '${id}', state: 'answered', reply: 'yes' }),
      await go({ id: '${id}', state: 'answered', reply: '' }),
      await go({ id: '${id}', state: 'answered', reply: '  ' }),
    ]))`) as Record<string, unknown>[];
    expect(results.slice(2).map(r => r.status)).toEqual([400, 400]);
    expect(writes(id).flatMap(e => e.data?.reply ?? [])).toEqual(['yes']);
  });

  test('a long reply or failure is cut to the bytes an event can hold, and sending it again writes nothing', () => {
    const replied = newAsk('long reply');
    const failed = newAsk('long failure');
    const out = run(`
      const long = '漢'.repeat(1500);
      await go({ id: '${replied}', state: 'sent' });
      const first = await go({ id: '${replied}', state: 'answered', reply: long });
      const again = await go({ id: '${replied}', state: 'answered', reply: long });
      const noisy = { id: 'noisy', createDraft: async () => ({ ok: false, error: '"\\n😀'.repeat(900) }) };
      await go({ id: '${failed}', action: 'approve' }, noisy);
      const made = await draftApproved('sprint-1', '${failed}', noisy);
      console.log(JSON.stringify({ first, again, made }))`);
    expect(out).toMatchObject({ first: { noop: false }, again: { noop: true }, made: { state: 'draft-failed' } });
    const reply = String(writes(replied).at(-1)?.data?.reply);
    expect(Buffer.byteLength(reply)).toBe(2400);
    expect(reply).toBe('漢'.repeat(800));
    for (const line of readFileSync(file('events.ndjson'), 'utf8').trim().split('\n')) { expect(Buffer.byteLength(line)).toBeLessThan(3800); }
  });

  test('a provider that fails without saying why is still recorded', () => {
    const id = newAsk();
    const out = run(`
      const mute = { id: 'mute', createDraft: async () => ({ ok: false, error: '' }) };
      await go({ id: '${id}', action: 'approve' }, mute);
      console.log(JSON.stringify(await draftApproved('sprint-1', '${id}', mute).catch(e => e.message)))`);
    expect(out).toMatchObject({ state: 'draft-failed' });
    expect(writes(id).at(-1)?.data?.error).toBe('unknown error');
  });

  test('with no messenger, approve, retry and every drafting state are refused with the reason', () => {
    const id = newAsk();
    const results = run(`console.log(JSON.stringify([
      await go({ id: '${id}', action: 'approve' }),
      await go({ id: '${id}', action: 'retry' }),
      await go({ id: '${id}', state: 'approved' }),
      await go({ id: '${id}', state: 'drafted' }),
      await go({ id: '${id}', state: 'draft-failed' }),
    ]))`) as Record<string, unknown>[];
    for (const r of results) {
      expect(r).toMatchObject({ status: 400 });
      expect(String(r.error)).toContain('no messenger is configured');
    }
    expect(writes(id)).toHaveLength(0);
  });

  test('with an injected messenger, an approval is drafted once and the link and reference are recorded', () => {
    const id = newAsk();
    const out = run(`${FAKE}
      const first = await go({ id: '${id}', action: 'approve' }, fake);
      const again = await go({ id: '${id}', action: 'approve' }, fake);
      const owed = [owesDraft(first), owesDraft(again)];
      const made = await draftApproved('sprint-1', '${id}', fake);
      console.log(JSON.stringify({ owed, made, calls }))`);
    expect(out).toMatchObject({ owed: [true, false], made: { from: 'approved', state: 'drafted', by: 'conductor' }, calls: 1 });
    expect(writes(id).at(-1)?.data).toEqual({ id, state: 'drafted', link: `https://chat.example/d/${id}`, ref: 'ref-1' });
  });

  test('a refused or broken draft is recorded as failed, retry drafts it, and a retry of nothing is refused', () => {
    const id = newAsk();
    const out = run(`
      let n = 0;
      const flaky = { id: 'flaky', createDraft: async () => { n++; if (n === 1) { return { ok: false, error: 'a draft already exists' }; } if (n === 2) { throw new Error('the provider is down'); } return { ok: true }; } };
      const early = await go({ id: '${id}', action: 'retry' }, flaky);
      const seen = [];
      for (const action of ['approve', 'retry', 'retry']) {
        await go({ id: '${id}', action }, flaky);
        seen.push((await draftApproved('sprint-1', '${id}', flaky)).state);
      }
      console.log(JSON.stringify({ early, seen }))`);
    expect(out).toMatchObject({ early: { status: 400 }, seen: ['draft-failed', 'draft-failed', 'drafted'] });
    expect(writes(id).flatMap(e => e.data?.error ?? [])).toEqual(['a draft already exists', 'the provider is down']);
  });
});

describe('asks.lock', () => {
  for (const count of [2, 8]) {
    test(`${count} processes sending the same transition append exactly one event`, async () => {
      const id = newAsk();
      padLog();
      const results = await race(count, { id, state: 'sent', by: 'conductor' });
      expect(results.filter(r => r.noop === false)).toHaveLength(1);
      expect(results.filter(r => r.noop === true)).toHaveLength(count - 1);
      expect(writes(id)).toHaveLength(1);
      expect(existsSync(file('asks.lock'))).toBe(false);
    }, 60_000);
  }

  test('a writer waits while another holds the lock, then writes', async () => {
    const id = newAsk();
    writeFileSync(file('asks.lock'), `${process.pid} ${new Date().toISOString()}\n`);
    const racing = race(1, { id, state: 'sent', by: 'conductor' });
    await Bun.sleep(1000);
    expect(writes(id)).toHaveLength(0);
    rmSync(file('asks.lock'));
    expect((await racing)[0].noop).toBe(false);
    expect(writes(id)).toHaveLength(1);
  }, 20_000);

  test('a lock left by a crashed writer is taken over', () => {
    const id = newAsk();
    writeFileSync(file('asks.lock'), '999999 2026-01-01T00:00:00Z\n');
    const old = new Date(Date.now() - 31_000);
    utimesSync(file('asks.lock'), old, old);
    cli('ask-state', id, 'sent', '--by', 'conductor');
    expect(writes(id)).toHaveLength(1);
    expect(existsSync(file('asks.lock'))).toBe(false);
  });

  const attempt = (waitMs: number) => run(`console.log(JSON.stringify(await withAskLock('sprint-1', async () => 'ran', { waitMs: ${waitMs} }).catch(e => e.message)))`);
  const holdAs = (name: string, pid: number, ageMs = 0) => {
    writeFileSync(file(name), `${pid} ${new Date(Date.now() - ageMs).toISOString()}\n`);
    const then = new Date(Date.now() - ageMs);
    utimesSync(file(name), then, then);
  };

  test('a fresh lock of a live holder is not taken: the writer gives up after its wait and names the holder', () => {
    holdAs('asks.lock', process.pid);
    const out = attempt(100);
    expect(out).toContain('another ask transition still holds');
    expect(out).toContain(`holder: ${process.pid}`);
    expect(readFileSync(file('asks.lock'), 'utf8')).toStartWith(`${process.pid} `);
  });

  test('a lock whose holder process is gone is taken at once, however fresh', async () => {
    const gone = Bun.spawn(['true']);
    await gone.exited;
    holdAs('asks.lock', gone.pid);
    expect(attempt(300)).toBe('ran');
    expect(existsSync(file('asks.lock'))).toBe(false);
  });

  test('a stale lock waits while another waiter has the turn to take it over', () => {
    holdAs('asks.lock', process.pid, 31_000);
    holdAs('asks.lock.takeover', process.pid);
    const before = readFileSync(file('asks.lock'), 'utf8');
    expect(attempt(200)).toContain('another ask transition still holds');
    expect(readFileSync(file('asks.lock'), 'utf8')).toBe(before);
  });

  test('a turn left by a crashed waiter is cleared and the stale lock is taken', () => {
    holdAs('asks.lock', process.pid, 31_000);
    holdAs('asks.lock.takeover', process.pid, 6000);
    expect(attempt(1000)).toBe('ran');
    expect(existsSync(file('asks.lock'))).toBe(false);
    expect(existsSync(file('asks.lock.takeover'))).toBe(false);
  });

  test('a lock moved right after it was taken is no error, and the holder knows it lost it', () => {
    const out = run(`import { renameSync } from 'node:fs';
      const lock = ${JSON.stringify(file('asks.lock'))};
      console.log(JSON.stringify(await withAskLock('sprint-1', async held => ({ held: held() }), { onTaken: () => renameSync(lock, lock + '.moved') }).catch(e => ({ error: e.message }))))`);
    expect(out).toEqual({ held: false });
    expect(existsSync(file('asks.lock'))).toBe(false);
  });

  test('a writer that lost the lock before appending writes nothing', () => {
    const id = newAsk();
    const out = run(`import { renameSync, writeFileSync } from 'node:fs';
      const lock = ${JSON.stringify(file('asks.lock'))};
      const steal = () => { writeFileSync(lock + '.next', 'another writer\\n'); renameSync(lock + '.next', lock); return null; };
      console.log(JSON.stringify(await go({ id: '${id}', state: 'sent', guard: steal })))`);
    expect(out).toMatchObject({ status: 409 });
    expect(String((out as { error: string }).error)).toContain('Nothing was written');
    expect(writes(id)).toHaveLength(0);
  });

  test('a writer releases only its own lock', () => {
    const out = run(`import { rmSync, writeFileSync, readFileSync, renameSync } from 'node:fs';
      const lock = ${JSON.stringify(file('asks.lock'))};
      let held = '';
      await withAskLock('sprint-1', async () => { held = readFileSync(lock, 'utf8'); writeFileSync(lock + '.next', '7 taken over\\n'); renameSync(lock + '.next', lock); });
      console.log(JSON.stringify({ held, after: readFileSync(lock, 'utf8') }))`) as { held: string, after: string };
    expect(out.held).toMatch(/^\d+ \d{4}-\d{2}-\d{2}T[\d:.]+Z\n$/);
    expect(out.after).toBe('7 taken over\n');
  });
});
