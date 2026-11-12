import type { Prompts } from './install-terminal.ts';
import type { JournalEntry } from './ui/events.ts';
import type { AskEvent } from './ui/reporter.ts';

import { describe, expect, test } from 'bun:test';

import { createInstallerTerminal, plainText, PromptCancelled } from './install-terminal.ts';
import { installerPhases } from './ui/installer-run.ts';

const CANCEL = Symbol('cancel');

/** Prompts that answer from a queue; a queued CANCEL is a Ctrl-C. */
function fakePrompts(queue: unknown[]): Partial<Prompts> {
  const next = async (): Promise<never> => queue.shift() as never;
  return {
    confirm: next,
    select: next,
    multiselect: next,
    text: next,
    password: next,
    isCancel: ((v: unknown) => v === CANCEL) as unknown as Prompts['isCancel'],
  };
}

let seq = 0;
const e = (ev: Record<string, unknown>): JournalEntry => ({ ...ev, seq: ++seq, ts: 0 }) as unknown as JournalEntry;

/** One scripted installer run, as journal entries. */
function journal(): JournalEntry[] {
  seq = 0;
  return [
    e({ t: 'run.start', cmd: 'setup', args: [], repo: 'acme-qa', version: '1', mode: 'interactive', lang: 'es', phases: installerPhases('es') }),
    e({ t: 'phase.start', id: 'pre', why: 'Revisamos <b>todo</b>. [[preflight|Qué es esto?]]' }),
    e({ t: 'preflight', checks: [{ label: 'Bun', value: '1.3.14', state: 'ok' }, { label: 'Engram', value: '-', state: 'warn', msg: 'Opcional: <code>brew install engram</code>' }], verdict: 'warn', text: '<b>Nada bloquea.</b> 1 aviso.' }),
    e({ t: 'ask', id: 'start', kind: 'confirm', title: 'Empezamos la instalación?', spec: {}, secret: false, default: true }),
    e({ t: 'answered', id: 'start', label: 'Empezar', by: 'page' }),
    e({ t: 'phase.end', id: 'pre', status: 'warn', note: '1 aviso' }),
    e({ t: 'phase.start', id: 'install' }),
    e({ t: 'step.start', id: 'chromium', phase: 'install', title: 'Navegador para los tests (Chromium)', lane: 'descargas' }),
    e({ t: 'step.log', id: 'chromium', line: 'Downloading Chromium 140.0', stream: 'out' }),
    e({ t: 'step.end', id: 'chromium', status: 'ok', note: 'una sola vez por máquina', ms: 3200 }),
    e({ t: 'step.start', id: 'engram', phase: 'install', title: 'Memoria entre sesiones (Engram)', lane: 'descargas' }),
    e({ t: 'step.end', id: 'engram', status: 'skipped', note: 'Engram no está instalado', ms: 0 }),
    e({ t: 'notice', level: 'warn', text: 'sin <code>acli</code>: Jira se salta' }),
    e({ t: 'fail', id: 'f1', step: 'jira', title: 'Atlassian rechazó las credenciales', what: 'El sitio respondió <code>401</code>.', how: ['Crea un token nuevo.'], actions: [{ value: 'retry', label: 'Reintentar' }, { value: 'skip', label: 'Saltar' }] }),
    e({ t: 'answered', id: 'f1', label: 'Saltar', by: 'page' }),
    e({ t: 'report', title: 'acme-qa está listo.', tone: 'good', tiles: [{ n: '12', label: 'pasos completos' }], next: [{ title: 'Abre tu agente', cmd: 'claude' }] }),
    e({ t: 'run.end', status: 'done', exit: 0, summaryPath: '.session/runs/setup-20261011-1200.html' }),
  ];
}

function printed(page: boolean, entries: JournalEntry[]): string {
  let out = '';
  const t = createInstallerTerminal({ lang: 'es', write: (s) => { out += s; } });
  for (const entry of entries) {
    const asTerminal = !page && entry.t === 'answered' ? { ...entry, by: 'terminal' as const } : entry;
    t.print(asTerminal, { page });
  }
  return out;
}

describe('the printer', () => {
  test('headless parity: the same journal prints the same log; a page run adds only the "answer it in the browser" lines and the answers', () => {
    const page = printed(true, journal());
    const headless = printed(false, journal());
    const pageOnly = page.split('\n').filter(l => !headless.split('\n').includes(l));
    expect(pageOnly).toEqual([
      '  ? Empezamos la instalación?  (respóndelo en el navegador)',
      '    → Empezar',
      '    → Saltar',
    ]);
    expect(headless).toMatchSnapshot();
  });

  test('phase headers come from run.start, markup is plain text, durations are seconds', () => {
    const out = printed(false, journal());
    expect(out).toContain('◆ Chequeo previo\n  Revisamos todo. Qué es esto?');
    expect(out).toContain('  ▲ Engram  -\n      Opcional: brew install engram');
    expect(out).toContain('  ✔ Navegador para los tests (Chromium)  una sola vez por máquina  (3.2 s)');
    expect(out).toContain('  – Memoria entre sesiones (Engram)  Engram no está instalado\n');
    expect(out).not.toMatch(/<code>|<b>|\[\[/);
  });

  test('plainText drops the page markup and keeps the words', () => {
    expect(plainText('a <b>b</b> `c` [[g|d]] &lt;e&gt;<br>f')).toBe('a b c d <e> f');
  });
});

describe('questions in the terminal', () => {
  const ask = (over: Partial<AskEvent>): AskEvent => ({ t: 'ask', id: 'q', kind: 'confirm', title: 'Q', spec: {}, secret: false, ...over });

  test('a background line that arrives while a prompt is open waits for the prompt to close', async () => {
    let out = '';
    let release!: (v: unknown) => void;
    const t = createInstallerTerminal({ lang: 'es', write: (s) => { out += s; }, prompts: { ...fakePrompts([]), confirm: (async () => new Promise((r) => { release = r; })) as unknown as Prompts['confirm'] } });
    const pending = t.ask(ask({}), new AbortController().signal);
    t.print(e({ t: 'step.log', id: 's', line: 'Downloading 47%', stream: 'out' }), { page: false });
    expect(out).not.toContain('Downloading');
    release(true);
    expect(await pending).toBe(true);
    expect(out).toContain('Downloading 47%');
  });

  test('every kind returns a value the reporter accepts', async () => {
    const t = createInstallerTerminal({ lang: 'es', write: () => {}, prompts: fakePrompts(['b', ['x'], 'Acme', 'ACME', '', 'retry']) });
    const sig = new AbortController().signal;
    expect(await t.ask(ask({ kind: 'select', spec: { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } }), sig)).toBe('b');
    expect(await t.ask(ask({ kind: 'multi', spec: { options: [{ value: 'x', label: 'X' }] } }), sig)).toEqual(['x']);
    expect(await t.ask(ask({ kind: 'text', spec: { fields: [{ id: 'n', label: 'Nombre' }, { id: 'k', label: 'Clave' }] } }), sig)).toEqual(['Acme', 'ACME']);
    // An empty secret is the "later" button.
    expect(await t.ask(ask({ kind: 'secret', spec: { varName: 'TOKEN', secondary: [{ value: 'later', label: 'Después' }] } }), sig)).toBe('later');
    expect(await t.ask({ t: 'fail', id: 'f', step: 's', title: 'T', what: 'w', how: [], actions: [{ value: 'retry', label: 'R' }] }, sig)).toBe('retry');
  });

  test('Ctrl-C cancels the run; a prompt the page answered first is not a cancel', async () => {
    let cancels = 0;
    const t = createInstallerTerminal({ lang: 'es', write: () => {}, prompts: fakePrompts([CANCEL, CANCEL]), onCancel: () => { cancels += 1; } });
    const first = await t.ask(ask({}), new AbortController().signal).catch((err: unknown) => err);
    expect(first).toBeInstanceOf(PromptCancelled);
    expect(cancels).toBe(1);
    const aborted = new AbortController();
    aborted.abort();
    const second = await t.ask(ask({}), aborted.signal).catch((err: unknown) => err);
    expect(second).toBeInstanceOf(PromptCancelled);
    expect(cancels).toBe(1);
  });
});
