import type { BoardEvent } from './model.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

const CLI = join(import.meta.dir, 'index.ts');
const DEMO_CONFIG = join(import.meta.dir, 'demo', 'project.yaml');
const SERVER = JSON.stringify(join(import.meta.dir, 'server.ts'));

interface Reply { status: number, json: Record<string, unknown> }
interface Board { dir: string, port: number, stop: () => void }

const env = (dir: string) => ({ ...process.env, SPRINT_BOARD_DIR: dir, SPRINT_BOARD_PROJECT_YAML: DEMO_CONFIG });
const events = (b: Board): BoardEvent[] => readFileSync(join(b.dir, 'sprints', 'sprint-1', 'events.ndjson'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const writes = (b: Board, id: string) => events(b).filter(e => e.kind === 'ask.state' && e.data?.id === id);

function cli(b: Board, ...args: string[]): void {
  const r = Bun.spawnSync(['bun', CLI, ...args], { env: env(b.dir) });
  if (r.exitCode !== 0) { throw new Error(`${args.join(' ')} failed: ${r.stdout.toString()}${r.stderr.toString()}`); }
}
function newAsk(b: Board, text: string): string {
  cli(b, 'ask', '--to', 'Kim', '--ticket', 'DEMO-1', '--kind', 'bug', '--text', text);
  return String(events(b).filter(e => e.kind === 'ask.create').at(-1)!.data!.id);
}
async function post(b: Board, body: Record<string, unknown>): Promise<Reply> {
  const r = await fetch(`http://127.0.0.1:${b.port}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sprint-board': '1' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
}

async function startBoard(command: (port: number) => string[]): Promise<Board> {
  const dir = mkdtempSync(join(tmpdir(), 'sprint-board-server-'));
  const probe = Bun.serve({ port: 0, fetch: () => new Response('') });
  const port = probe.port!;
  await probe.stop(true);
  const board: Board = { dir, port, stop: () => {} };
  cli(board, 'new', '--sprint', '1', '--started', '2026-10-01T00:00:00Z');
  cli(board, 'add', 'DEMO-1');
  cli(board, 'sprint', '--person', 'Kim Carter=Dev,en,Kim');
  const server = Bun.spawn(command(port), { env: env(dir), stdout: 'ignore', stderr: 'ignore' });
  board.stop = () => { server.kill(); rmSync(dir, { recursive: true, force: true }); };
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/sprints`)).ok) { return board; } }
    catch { /* not up yet */ }
    await Bun.sleep(100);
  }
  board.stop();
  throw new Error('the board server did not start');
}

describe('POST /api/ask', () => {
  let board: Board;
  // --merge-every 0: the Merge Line collector writes into the repo's .session, never from a test.
  beforeAll(async () => { board = await startBoard(port => ['bun', CLI, 'serve', '--port', String(port), '--merge-every', '0']); });
  afterAll(() => { board.stop(); });

  for (const count of [2, 8]) {
    test(`${count} concurrent identical requests append one event; the others are successful no-ops`, async () => {
      const id = newAsk(board, `${count} clicks`);
      const all = await Promise.all(Array.from({ length: count }, async () => post(board, { id, action: 'sent', expect: 'draft' })));
      expect(all.map(r => r.status)).toEqual(Array.from<number>({ length: count }).fill(200));
      const wrote = all.filter(r => r.json.noop === false);
      expect(wrote).toHaveLength(1);
      expect(wrote[0].json).toMatchObject({ ok: true, from: 'draft', state: 'sent', by: 'owner' });
      expect(writes(board, id)).toHaveLength(1);
      expect(writes(board, id)[0]).toMatchObject({ by: 'owner', data: { state: 'sent', action: 'sent' } });
    });
  }

  test('a CLI transition and a page click wait on the same lock and write once', async () => {
    const id = newAsk(board, 'cli and page');
    const lock = join(board.dir, 'sprints', 'sprint-1', 'asks.lock');
    writeFileSync(lock, `${process.pid} ${new Date().toISOString()}\n`);
    const viaCli = Bun.spawn(['bun', CLI, 'ask-state', id, 'sent', '--by', 'conductor'], { env: env(board.dir), stdout: 'pipe', stderr: 'pipe' });
    const viaPage = post(board, { id, action: 'sent', expect: 'draft' });
    await Bun.sleep(1000);
    expect(writes(board, id)).toHaveLength(0);
    rmSync(lock);
    const [page, code] = await Promise.all([viaPage, viaCli.exited]);
    expect([page.status, code]).toEqual([200, 0]);
    expect(writes(board, id)).toHaveLength(1);
    expect(page.json.noop === true).toBe((await new Response(viaCli.stdout).text()).includes(`${id} -> sent`));
  }, 20_000);

  test('a page write is recorded as the owner whatever the request claims, and listen reports only those', async () => {
    const id = newAsk(board, 'who spoke');
    const since = new Date().toISOString();
    await Bun.sleep(5);
    cli(board, 'ask-state', id, 'sent', '--by', 'conductor');
    cli(board, 'ask-state', id, 'answered', '--reply', 'from an agent', '--by', 'worker');
    expect((await post(board, { id, action: 'close', by: 'conductor' })).json).toMatchObject({ noop: false, by: 'owner' });
    expect(writes(board, id).map(e => e.by)).toEqual(['conductor', 'worker', 'owner']);

    const listener = Bun.spawn(['bun', CLI, 'listen', '--since', since], { env: env(board.dir), stdout: 'pipe', stderr: 'pipe' });
    try {
      const reader = listener.stdout.getReader();
      let out = '';
      while (!out.includes('replayed ')) {
        const next = await reader.read();
        if (next.done) { break; }
        out += new TextDecoder().decode(next.value);
      }
      const mine = out.split('\n').filter(l => l.includes(id));
      expect(mine).toHaveLength(1);
      expect(mine[0]).toContain(`Draft ${id} marked closed (close)`);
    }
    finally { listener.kill(); }
  }, 20_000);

  test('a request made from a stale view gets 409 with the current state and writes nothing', async () => {
    const id = newAsk(board, 'stale view');
    expect((await post(board, { id, action: 'sent', expect: 'draft' })).status).toBe(200);
    const stale = await post(board, { id, action: 'drop', expect: 'draft' });
    expect(stale.status).toBe(409);
    expect(stale.json).toMatchObject({ state: 'sent', by: 'owner', error: `${id} is sent now, not draft` });
    expect(writes(board, id)).toHaveLength(1);
  });

  test('an unknown ask, a bad id and a bad action are 400; an illegal jump is 409', async () => {
    const id = newAsk(board, 'rules');
    expect((await post(board, { id: 'ask-zzzzzz', action: 'sent' })).status).toBe(400);
    expect((await post(board, { id: 'nope', action: 'sent' })).status).toBe(400);
    expect((await post(board, { id, action: 'explode' })).status).toBe(400);
    expect((await post(board, { id, state: 'gone' })).status).toBe(400);
    const jump = await post(board, { id, action: 'close' });
    expect(jump.status).toBe(409);
    expect(jump.json).toMatchObject({ state: 'draft', error: `${id}: cannot go from draft to closed` });
    expect(writes(board, id)).toHaveLength(0);
  });

  test('with no messenger the page cannot approve or retry, and says why; the state carries no messenger', async () => {
    const id = newAsk(board, 'no provider');
    for (const body of [{ action: 'approve' }, { action: 'retry' }, { state: 'approved' }]) {
      const r = await post(board, { id, ...body });
      expect(r.status).toBe(400);
      expect(String(r.json.error)).toContain('no messenger is configured');
    }
    expect(writes(board, id)).toHaveLength(0);
    const state = await (await fetch(`http://127.0.0.1:${board.port}/api/state`)).json() as Record<string, unknown>;
    expect(state.messenger).toBeUndefined();
  });

  test('close and reopen, and the Undo of a close', async () => {
    const id = newAsk(board, 'to close');
    cli(board, 'ask-state', id, 'sent', '--by', 'conductor');
    cli(board, 'ask-state', id, 'answered', '--reply', 'done', '--by', 'conductor');
    expect((await post(board, { id, action: 'close', expect: 'answered' })).json).toMatchObject({ from: 'answered', state: 'closed' });
    expect((await post(board, { id, action: 'close' })).json).toMatchObject({ noop: true, state: 'closed' });
    expect((await post(board, { id, action: 'reopen' })).json).toMatchObject({ from: 'closed', state: 'answered' });
    await post(board, { id, action: 'close' });
    expect((await post(board, { id, state: 'answered', expect: 'closed' })).json).toMatchObject({ noop: false, state: 'answered' });
    expect(writes(board, id).map(e => e.data?.state)).toEqual(['sent', 'answered', 'closed', 'answered', 'closed', 'answered']);
  });
});

describe('POST /api/ask with an injected messenger', () => {
  let board: Board;
  beforeAll(async () => {
    board = await startBoard(port => ['bun', '-e', `import { serve } from ${SERVER}; import { appendFileSync } from 'node:fs';
      const calls = process.env.SPRINT_BOARD_DIR + '/calls';
      const fake = { id: 'fake', createDraft: async (r) => { appendFileSync(calls, r.id + '\\n'); return { ok: true, link: 'https://chat.example/d/' + r.id }; } };
      await serve({ port: ${port}, open: false, syncMinutes: 0, mergeEvery: 0, messenger: fake });`]);
  });
  afterAll(() => { board.stop(); });

  test('a burst of approvals drafts the message once, as the conductor', async () => {
    const id = newAsk(board, 'draft me');
    const all = await Promise.all(Array.from({ length: 8 }, async () => post(board, { id, action: 'approve' })));
    expect(all.filter(r => r.json.noop === false)).toHaveLength(1);
    for (let i = 0; i < 100 && writes(board, id).length < 2; i++) { await Bun.sleep(50); }
    expect(writes(board, id).map(e => `${String(e.data?.state)}:${e.by}`)).toEqual(['approved:owner', 'drafted:conductor']);
    expect(readFileSync(join(board.dir, 'calls'), 'utf8')).toBe(`${id}\n`);
    const state = await (await fetch(`http://127.0.0.1:${board.port}/api/state`)).json() as { messenger: string, asks: { id: string, link?: string }[] };
    expect(state.messenger).toBe('fake');
    expect(state.asks.find(a => a.id === id)?.link).toBe(`https://chat.example/d/${id}`);
  });

  test('the page cannot report a drafting result, but may put a recorded draft back', async () => {
    const id = newAsk(board, 'page results');
    expect((await post(board, { id, state: 'drafted' })).status).toBe(400);
    expect((await post(board, { id, state: 'draft-failed' })).status).toBe(400);
    await post(board, { id, action: 'approve' });
    for (let i = 0; i < 100 && writes(board, id).length < 2; i++) { await Bun.sleep(50); }
    await post(board, { id, action: 'sent' });
    expect((await post(board, { id, state: 'drafted', expect: 'sent' })).json).toMatchObject({ noop: false, state: 'drafted' });
  });
});
