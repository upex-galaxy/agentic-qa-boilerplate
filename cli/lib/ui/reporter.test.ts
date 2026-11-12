import type { AskEvent, ReporterOptions, TerminalFallback } from './reporter.ts';

import { describe, expect, test } from 'bun:test';

import { MASK } from './events.ts';
import { ReadonlyAskError, Reporter, validateAnswer } from './reporter.ts';

function reporter(extra: Partial<ReporterOptions> = {}): Reporter {
  return new Reporter({ cmd: 'setup', repo: 'acme', version: '1', mode: 'interactive', lang: 'es', phases: [{ id: 'p', title: 'P' }], ...extra });
}

const sleep = async (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** The error a promise rejects with (fails the test when it resolves). */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try { await p; }
  catch (e) { return e as Error; }
  throw new Error('expected the promise to reject');
}

describe('ask: first answer wins', () => {
  test('the first valid answer settles the promise; a second gets "answered"', async () => {
    const r = reporter();
    const p = r.ask<string>({ id: 'env', kind: 'select', title: 'Env?', spec: { options: [{ value: 'staging', label: 'staging' }, { value: 'local', label: 'local' }] } });
    expect(r.answer('env', 'local', 'page')).toEqual({ ok: true, label: 'local' });
    expect(r.answer('env', 'staging', 'page')).toMatchObject({ ok: false, code: 'answered' });
    expect(await p).toBe('local');
    const answered = r.journal.all().filter(e => e.t === 'answered');
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ id: 'env', label: 'local', by: 'page' });
  });

  test('an invalid answer is refused and the question keeps waiting', async () => {
    const r = reporter();
    const p = r.ask<boolean>({ id: 'go', kind: 'confirm', title: 'Go?' });
    expect(r.answer('go', 'yes', 'page')).toMatchObject({ ok: false, code: 'invalid' });
    expect(r.waiting()).toEqual(['go']);
    r.answer('go', true, 'page');
    expect(await p).toBe(true);
  });

  test('an unknown id is "unknown"; a reused id is refused', async () => {
    const r = reporter();
    expect(r.answer('nope', 1, 'page')).toMatchObject({ ok: false, code: 'unknown' });
    const p = r.ask({ id: 'x', kind: 'confirm', title: 'x' });
    expect((await rejection(r.ask({ id: 'x', kind: 'confirm', title: 'again' }))).message).toContain('already used');
    r.answer('x', false, 'page');
    await p;
  });

  test('a read-only run cannot ask', async () => {
    const r = reporter({ mode: 'readonly' });
    expect(await rejection(r.ask({ kind: 'confirm', title: 'Go?' }))).toBeInstanceOf(ReadonlyAskError);
  });

  test('ending the run rejects the questions still waiting', async () => {
    const r = reporter();
    const p = r.ask({ kind: 'confirm', title: 'Go?' });
    r.end('aborted', 130);
    expect((await rejection(p)).message).toContain('ended');
  });
});

describe('secrets', () => {
  test('the answered label is masked and the value is redacted from everything after it', async () => {
    const r = reporter();
    const p = r.ask<string>({ id: 'tok', kind: 'secret', title: 'Token', spec: { varName: 'ATLASSIAN_API_TOKEN' } });
    expect(r.journal.all().find(e => e.t === 'ask')).toMatchObject({ secret: true });
    const res = r.answer('tok', 'ATATT-very-secret-123', 'page');
    expect(res).toMatchObject({ ok: true });
    expect(await p).toBe('ATATT-very-secret-123');
    const s = r.step({ phase: 'p', title: 'acli login' });
    s.log('logged in with ATATT-very-secret-123');
    s.end('ok', 'token ATATT-very-secret-123 accepted');
    const json = JSON.stringify(r.journal.all());
    expect(json).not.toContain('ATATT-very-secret-123');
    expect(json).toContain(`ATLASSIAN_API_TOKEN guardado (${MASK})`);
  });
});

describe('concurrent steps (owner answer Q2)', () => {
  test('steps overlap and a question is answered while a lane streams', async () => {
    const r = reporter();
    r.start();
    const dl = r.step({ phase: 'install', title: 'bun install', lane: 'descargas' });
    const pw = r.step({ phase: 'install', title: 'chromium', lane: 'descargas' });
    dl.log('12 packages');
    const q = r.ask<string[]>({ id: 'name', kind: 'text', title: 'Name?', phase: 'project', spec: { fields: [{ id: 'n', label: 'Name', required: true }] } });
    pw.log('40%');
    dl.end('ok');
    r.answer('name', ['  Acme  '], 'page');
    pw.log('100%');
    pw.end('ok');
    expect(await q).toEqual(['Acme']);
    const seq = r.journal.all().map(e => `${e.t}${'id' in e ? `:${e.id}` : ''}`);
    expect(seq).toEqual(['run.start', 'step.start:s1', 'step.start:s2', 'step.log:s1', 'ask:name', 'step.log:s2', 'step.end:s1', 'answered:name', 'step.log:s2', 'step.end:s2']);
    expect(r.journal.all().filter(e => e.t === 'step.start').every(e => e.t === 'step.start' && e.lane === 'descargas')).toBe(true);
  });

  test('a step handle ignores log and end after it ended', () => {
    const r = reporter();
    const s = r.step({ phase: 'p', title: 't' });
    s.end('ok');
    s.log('late');
    s.end('failed');
    expect(r.journal.all().map(e => e.t)).toEqual(['step.start', 'step.end']);
  });
});

describe('terminal fallback (owner answer Q6)', () => {
  function fakeTerminal(answerAfterMs: number, value: unknown): TerminalFallback & { asked: string[], aborted: string[] } {
    const t = {
      asked: [] as string[],
      aborted: [] as string[],
      ask: async (q: AskEvent | { id: string }, signal: AbortSignal) => new Promise<unknown>((resolve, reject) => {
        t.asked.push(q.id);
        const timer = setTimeout(resolve, answerAfterMs, value);
        signal.addEventListener('abort', () => { clearTimeout(timer); t.aborted.push(q.id); reject(new Error('aborted')); });
      }),
    };
    return t;
  }

  test('no page connected for the fallback window: the terminal asks and its answer wins', async () => {
    const term = fakeTerminal(5, true);
    const r = reporter({ fallback: term, fallbackAfterMs: 60, pollMs: 10 });
    r.attachClientProbe(() => false);
    const v = await r.ask<boolean>({ id: 'go', kind: 'confirm', title: 'Go?' });
    expect(v).toBe(true);
    expect(term.asked).toEqual(['go']);
    expect(r.journal.all().find(e => e.t === 'answered')).toMatchObject({ by: 'terminal' });
  });

  test('a connected page keeps the terminal quiet', async () => {
    const term = fakeTerminal(5, true);
    const r = reporter({ fallback: term, fallbackAfterMs: 40, pollMs: 10 });
    r.attachClientProbe(() => true);
    const p = r.ask<boolean>({ id: 'go', kind: 'confirm', title: 'Go?' });
    await sleep(120);
    expect(term.asked).toEqual([]);
    r.answer('go', false, 'page');
    expect(await p).toBe(false);
  });

  test('the page answering while the terminal asks aborts the terminal prompt', async () => {
    const term = fakeTerminal(10_000, true);
    const r = reporter({ fallback: term, fallbackAfterMs: 20, pollMs: 5 });
    r.attachClientProbe(() => false);
    const p = r.ask<boolean>({ id: 'go', kind: 'confirm', title: 'Go?' });
    await sleep(80);
    expect(term.asked).toEqual(['go']);
    r.answer('go', false, 'page');
    expect(await p).toBe(false);
    expect(term.aborted).toEqual(['go']);
  });

  test('headless (no page sink at all): the terminal asks at once', async () => {
    const term = fakeTerminal(1, false);
    const r = reporter({ fallback: term, fallbackAfterMs: 10_000 });
    expect(await r.ask<boolean>({ kind: 'confirm', title: 'Go?' })).toBe(false);
  });
});

describe('validateAnswer per kind', () => {
  const ask = (kind: AskEvent['kind'], spec: AskEvent['spec'] = {}): AskEvent => ({ t: 'ask', id: 'q', kind, title: 't', spec, secret: kind === 'secret' });
  const opts = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];

  test('select / divergence', () => {
    expect(validateAnswer(ask('select', { options: opts }), 'b', 'es')).toMatchObject({ ok: true, label: 'Beta' });
    expect(validateAnswer(ask('divergence', { options: opts }), 'zzz', 'es')).toMatchObject({ ok: false });
  });

  test('multi / package-keys with a minimum', () => {
    expect(validateAnswer(ask('multi', { options: opts }), ['a', 'b'], 'en')).toMatchObject({ ok: true, label: 'Alpha, Beta' });
    expect(validateAnswer(ask('multi', { options: opts }), [], 'en')).toMatchObject({ ok: true, label: 'none' });
    expect(validateAnswer(ask('multi', { options: opts, min: 1 }), [], 'es')).toMatchObject({ ok: false });
    expect(validateAnswer(ask('package-keys', { options: opts }), ['a', 'a'], 'es')).toMatchObject({ ok: false });
    expect(validateAnswer(ask('multi', { options: opts }), ['c'], 'es')).toMatchObject({ ok: false });
  });

  test('text: required and pattern', () => {
    const spec = { fields: [{ id: 'k', label: 'Key', short: 'Clave', required: true, pattern: '^[A-Z]{2,10}$' }] };
    expect(validateAnswer(ask('text', spec), ['ACME'], 'es')).toMatchObject({ ok: true, label: 'Clave: ACME' });
    expect(validateAnswer(ask('text', spec), [''], 'es')).toMatchObject({ ok: false });
    expect(validateAnswer(ask('text', spec), ['acme'], 'es')).toMatchObject({ ok: false });
    expect(validateAnswer(ask('text', spec), 'ACME', 'es')).toMatchObject({ ok: false });
  });

  test('files / deletions are subsets of the listed paths', () => {
    const spec = { files: [{ path: 'a.md' }, { path: 'b.md' }] };
    expect(validateAnswer(ask('files', spec), ['a.md'], 'es')).toMatchObject({ ok: true, label: '1 de 2 archivos se actualizan' });
    expect(validateAnswer(ask('deletions', spec), [], 'es')).toMatchObject({ ok: true, label: 'Se conservan los 2 (puedes borrarlos en otra pasada)' });
    expect(validateAnswer(ask('deletions', spec), ['../etc/passwd'], 'es')).toMatchObject({ ok: false });
  });

  test('secondary buttons answer any kind with their fixed value', () => {
    expect(validateAnswer(ask('secret', { varName: 'X', secondary: [{ value: 'later', label: 'Lo haré después' }] }), 'later', 'es')).toMatchObject({ ok: true, label: 'Lo haré después' });
  });

  test('fail: only the offered actions', () => {
    const fail = { t: 'fail' as const, id: 'f', step: 's', title: 't', what: 'w', how: [], actions: [{ value: 'retry', label: 'Reintentar' }] };
    expect(validateAnswer(fail, 'retry', 'es')).toMatchObject({ ok: true, label: 'Reintentar' });
    expect(validateAnswer(fail, 'skip', 'es')).toMatchObject({ ok: false });
  });
});
