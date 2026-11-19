/**
 * @fileoverview One `bun sync` run in the page (installer-ui plan §5, §6, §9):
 * decides whether the page opens, serves it, renders the preflight, hands the
 * page over across the self-update re-exec, builds the final report and writes
 * the saved summary.
 *
 *   const ui = await startUpdaterUi({...})   // null = terminal only (--headless, CI, no TTY, agent, SSH)
 *   await ui.preflight(result, recheck)      // 'go' | 'abort'
 *   cfg.hooks.beforeReexec = ui.beforeReexec // the child binds the same port + token, the page survives
 *   ui.report({...}); await ui.finish(status, exit)
 *
 * A `null` return means the caller runs exactly today's terminal flow: nothing
 * of this module touches a headless run (headless parity, plan §12).
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 */

import type { DeltaEntry, PairedDiff, ReportSink } from '../updater-types.ts';
import type { BrowserSink } from './browser-sink.ts';
import type { UiDecision } from './env-detect.ts';
import type { Check, EndStatus, JournalEntry, Lang, NextStep, ParityFinding, Surface, Tile } from './events.ts';
import type { IgnoreGroup, UpdaterPageSink } from './updater-sink.ts';

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startBrowserSink } from './browser-sink.ts';
import { decideUi, parseUiFlags } from './env-detect.ts';
import { handoffEnv, Journal, readHandoffEnv } from './events.ts';
import { openBrowser } from './open-browser.ts';
import { renderPage } from './page.ts';
import { readSecretValues } from './redaction.ts';
import { Reporter } from './reporter.ts';
import { pickLang } from './strings.ts';
import { writeSummary } from './summary.ts';
import { createUpdaterPageSink, updaterPhases } from './updater-sink.ts';

/** Keeps the page server up after `run.end` until Ctrl-C (a demo, a review). */
export const KEEP_ALIVE_ENV = 'UPEX_UI_KEEP_ALIVE';
/** Serves the page without opening a browser (tests, a tunnel opened by hand). The URL is printed either way. */
export const NO_OPEN_ENV = 'UPEX_UI_NO_OPEN';

const COPY = {
  es: {
    open: (url: string): string => `Página de la actualización: ${url}`,
    noClient: 'Ninguna página se conectó en 10 s: las preguntas siguen en esta terminal (la página puede abrirse igual con la URL de arriba).',
    keep: (url: string): string => `La página sigue en ${url} (Ctrl-C para cerrarla).`,
    blockTitle: 'El chequeo previo encontró algo que impide empezar',
    blockWhat: 'La actualización no empieza con un bloqueo abierto, así nada queda a medias.',
    recheck: 'Volver a comprobar',
    abort: 'Cancelar',
    tiles: { applied: 'archivos aplicados', skipped: 'sin aplicar', failed: 'errores', findings: 'diferencias por revisar' },
    titleDry: 'Vista previa: nada se escribió en tu proyecto.',
    titleDone: (sha: string): string => sha ? `Tu proyecto está en ${sha}.` : 'Actualización terminada.',
    titlePending: (sha: string): string => `${sha ? `Tu proyecto está en ${sha}. ` : ''}Quedan decisiones para la próxima pasada.`,
    titleAborted: 'La actualización se detuvo antes de escribir.',
    nowKept: 'tuyo',
    nowOverwritten: 'del boilerplate',
    nextPending: 'Resuelve lo pendiente con una pasada interactiva',
    nextPendingText: (n: number): string => `${n} archivo(s) esperan tu decisión.`,
    nextCommit: 'Haz commit de la actualización',
    nextCommitText: 'Mensaje sugerido según lo que entró.',
    nextPrompt: 'Pásale el reporte a tu IA',
    nextPromptText: (p: string): string => `El prompt con cada diferencia y su evidencia está en <code>${p}</code>.`,
    nextReal: 'Corre la actualización real',
    nextRealText: 'La vista previa no cambió nada.',
    nextFailed: 'Revisa los archivos con error',
  },
  en: {
    open: (url: string): string => `Update page: ${url}`,
    noClient: 'No page connected within 10 s: questions continue in this terminal (the page can still be opened with the URL above).',
    keep: (url: string): string => `The page stays at ${url} (Ctrl-C to close it).`,
    blockTitle: 'The preflight found something that stops the start',
    blockWhat: 'The update does not start with a block open, so nothing is left half done.',
    recheck: 'Check again',
    abort: 'Cancel',
    tiles: { applied: 'files applied', skipped: 'not applied', failed: 'errors', findings: 'differences to review' },
    titleDry: 'Preview: nothing was written to your project.',
    titleDone: (sha: string): string => sha ? `Your project is at ${sha}.` : 'Update finished.',
    titlePending: (sha: string): string => `${sha ? `Your project is at ${sha}. ` : ''}Some decisions are left for the next pass.`,
    titleAborted: 'The update stopped before writing.',
    nowKept: 'yours',
    nowOverwritten: 'boilerplate',
    nextPending: 'Resolve what is pending with an interactive pass',
    nextPendingText: (n: number): string => `${n} file(s) wait for your decision.`,
    nextCommit: 'Commit the update',
    nextCommitText: 'Message suggested from what came in.',
    nextPrompt: 'Hand the report to your AI',
    nextPromptText: (p: string): string => `The prompt with every difference and its evidence is in <code>${p}</code>.`,
    nextReal: 'Run the real update',
    nextRealText: 'The preview changed nothing.',
    nextFailed: 'Check the files that failed',
  },
} as const;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface UpdaterUiOptions {
  argv: string[]
  repoRoot: string
  /** Shown in the page header ("· acme-qa"). */
  repoName: string
  version: string
  /** Today's terminal sink: mirrors the log and answers when no page is connected. */
  terminal: ReportSink
  setTerminalSignal?: (signal: AbortSignal | undefined) => void
  onTerminalCancel?: () => void
  diffFor?: (entry: DeltaEntry) => PairedDiff | null
  groupIgnoreLines?: (lines: string[]) => IgnoreGroup[]
  /** One line in the terminal (the URL, the no-page notice). */
  print: (line: string) => void
  env?: Record<string, string | undefined>
  stdinTTY?: boolean
  stdoutTTY?: boolean
  platform?: string
  /** Opens the page; injectable for tests. Defaults to the system browser / Orca tab. */
  open?: (url: string) => Promise<boolean>
  /** Q6 window, default 10 000 ms. */
  fallbackAfterMs?: number
}

export interface PreflightLike {
  checks: Check[]
  verdict: 'clear' | 'warn' | 'block'
  text: string
}

export interface UpdaterReportFinding {
  id: number
  surface: string
  path: string
  evidence: string
  suggested: string
  blocking: boolean
  side?: 'kept' | 'overwritten'
}

export interface UpdaterReportInput {
  dryRun: boolean
  auto: boolean
  aborted: boolean
  applied: number
  skipped: number
  failed: { path: string, reason: string }[]
  upstreamSha?: string
  surfaces: { state: Surface['state'], label: string, cell: string }[]
  findings: UpdaterReportFinding[]
  prompt?: string
  /** Where the prompt was saved; null on a dry run or with no findings. */
  promptPath?: string | null
  /** The suggested commit message, when there is something to commit. */
  commit?: string | null
  /** Next steps only the caller knows about (an alias to create after the commit, …). */
  extraNext?: NextStep[]
}

export interface UpdaterUi {
  readonly reporter: Reporter
  readonly sink: UpdaterPageSink
  readonly url: string
  readonly lang: Lang
  readonly readonly: boolean
  /** True in the process a self-update re-exec started: the parent already rendered the start. */
  readonly resumed: boolean
  /** Renders the checklist; on a block, waits for "check again" or "cancel" in the page. */
  preflight: (result: PreflightLike, recheck: () => Promise<PreflightLike>) => Promise<'go' | 'abort'>
  notice: (level: 'info' | 'warn' | 'error', text: string) => void
  beforeReexec: (info: { kind: 'self-update' | 'preview', from: string, to: string }) => Promise<Record<string, string>>
  report: (input: UpdaterReportInput) => void
  /** Ends the run, writes the saved summary and returns its repo-relative path. */
  finish: (status: EndStatus, exit: number) => Promise<string | null>
}

/** The decision for this process, or the hand-off of a parent that already opened the page. */
export function decideUpdaterUi(argv: readonly string[], env: Record<string, string | undefined>, tty: { stdin: boolean, stdout: boolean }, platform: string): { decision: UiDecision, handoff: ReturnType<typeof readHandoffEnv> } {
  const handoff = readHandoffEnv(env);
  const decision = decideUi(parseUiFlags(argv), { env, stdinTTY: tty.stdin, stdoutTTY: tty.stdout, platform });
  return { decision, handoff };
}

export async function startUpdaterUi(o: UpdaterUiOptions): Promise<UpdaterUi | null> {
  const env = o.env ?? process.env;
  const { decision, handoff } = decideUpdaterUi(o.argv, env, { stdin: o.stdinTTY ?? Boolean(process.stdin.isTTY), stdout: o.stdoutTTY ?? Boolean(process.stdout.isTTY) }, o.platform ?? process.platform);
  if (!handoff && decision.surface === 'terminal') {
    if (decision.hint) { o.print(decision.hint); }
    return null;
  }

  const lang = pickLang(env);
  const C = COPY[lang];
  const keepAlive = Boolean(env[KEEP_ALIVE_ENV]);

  let resumed: JournalEntry[] = [];
  if (handoff) {
    resumed = Journal.readFile(handoff.journalPath);
    try { rmSync(handoff.journalPath, { force: true }); }
    catch { /* the temp dir is the OS's to clean */ }
  }
  const startEntry = resumed.find(e => e.t === 'run.start');
  const mode = startEntry && startEntry.t === 'run.start' ? startEntry.mode : (decision.readonly ? 'readonly' : 'interactive');
  const auto = mode === 'readonly' || o.argv.includes('--auto') || o.argv.includes('--force');

  const journal = new Journal({ resume: resumed });
  for (const value of readSecretValues(process.cwd())) { journal.redactor.add(value); }
  let pageSink: UpdaterPageSink | null = null;
  const reporter = new Reporter({
    cmd: 'up',
    args: o.argv,
    repo: o.repoName,
    version: o.version,
    mode,
    lang,
    phases: updaterPhases(lang, auto),
    journal,
    fallbackAfterMs: o.fallbackAfterMs,
    fallback: { ask: async (q, signal) => pageSink ? pageSink.fallbackAsk(q, signal) : new Promise(() => {}) },
  });

  const server: BrowserSink = await startBrowserSink({
    journal,
    answer: (id, value) => reporter.answer(id, value, 'page'),
    page: ({ token }) => renderPage({ mode: 'live', lang, token }),
    ...(handoff ? { port: handoff.port, token: handoff.token } : {}),
    stopAfterEndMs: keepAlive ? null : 2_000,
  });
  reporter.attachClientProbe(() => server.hasClient());

  const sink = createUpdaterPageSink({ reporter, terminal: o.terminal, setTerminalSignal: o.setTerminalSignal, onTerminalCancel: o.onTerminalCancel, diffFor: o.diffFor, groupIgnoreLines: o.groupIgnoreLines, auto });
  pageSink = sink;

  if (handoff) {
    // The page reconnects by itself (retry + reload); a port the parent freed
    // and someone took in the gap moves the server, so the new URL is printed.
    if (server.port !== handoff.port) { o.print(C.open(server.url)); }
  }
  else {
    reporter.start();
    o.print(C.open(server.url));
    const opener = o.open ?? (async (url: string) => openBrowser(url, { checkout: o.repoRoot }));
    if (!env[NO_OPEN_ENV]) { void opener(server.url); }
    let seen = false;
    reporter.attachClientProbe(() => { if (server.hasClient()) { seen = true; } return false; });
    const timer = setTimeout(() => { if (!seen && !server.hasClient() && mode === 'interactive') { o.print(C.noClient); } }, o.fallbackAfterMs ?? 10_000);
    timer.unref?.();
  }

  const ui: UpdaterUi = {
    reporter,
    sink,
    get url() { return server.url; },
    lang,
    readonly: mode === 'readonly',
    resumed: Boolean(handoff),

    preflight: async (first, recheck) => {
      let result = first;
      // The child of a self-update already passed the parent's preflight: a clear re-check stays silent.
      if (handoff && result.verdict !== 'block') { return 'go'; }
      sink.enter('pre');
      let round = 0;
      for (;;) {
        reporter.preflight(result.checks, result.verdict, result.text);
        if (result.verdict !== 'block') { return 'go'; }
        if (mode === 'readonly') { return 'abort'; }
        round += 1;
        const id = `pre${process.pid}-${round}`;
        const blocks = result.checks.filter(c => c.state === 'block');
        // Q6: with no page, the terminal has nothing to fix in place, so it cancels.
        sink.onFallback(id, async () => 'abort');
        const action = await reporter.fail({
          id,
          step: 'pre',
          title: C.blockTitle,
          what: C.blockWhat,
          how: blocks.map(c => `${c.label}: ${c.msg ?? c.value ?? ''}`),
          actions: [{ value: 'recheck', label: C.recheck }, { value: 'abort', label: C.abort }],
        });
        if (action !== 'recheck') { return 'abort'; }
        result = await recheck();
      }
    },

    notice: (level, text) => { reporter.notice(level, esc(text), sink.current ?? undefined); },

    beforeReexec: async (info) => {
      reporter.restart(info.from, info.to);
      const dir = mkdtempSync(join(tmpdir(), 'upex-ui-'));
      const journalPath = join(dir, 'journal.json');
      journal.writeFile(journalPath);
      const { port, token } = server;
      await server.stop();
      return handoffEnv({ port, token, journalPath });
    },

    report: (input) => {
      sink.enter('report');
      reporter.report(buildUpdaterReport(input, lang));
    },

    finish: async (status, exit) => {
      sink.closeAll(status === 'failed' || status === 'aborted' ? 'failed' : 'done');
      let path: string | null = null;
      try {
        path = writeSummary({ repoRoot: o.repoRoot, cmd: 'up', lang, journal: journal.all() });
      }
      catch { /* a summary that cannot be written never fails the run */ }
      reporter.end(status, exit, path ?? undefined);
      if (path) {
        // Rewrite with the final entry, so the saved copy shows how the run ended.
        try { writeFileSync(join(o.repoRoot, path), renderPage({ mode: 'saved', note: 'saved', lang, journal: journal.all() })); }
        catch { /* the first copy stays */ }
      }
      if (keepAlive) { o.print(C.keep(server.url)); }
      await server.stopped;
      return path;
    },
  };
  return ui;
}

/** The `report` event of an updater run, from the data the wrapper already has. */
export function buildUpdaterReport(i: UpdaterReportInput, lang: Lang): { title: string, tone: 'good' | 'warn' | 'bad', tiles: Tile[], surfaces: Surface[], findings: ParityFinding[], next: NextStep[], prompt?: string } {
  const C = COPY[lang];
  const blocking = i.findings.some(f => f.blocking);
  const tone: 'good' | 'warn' | 'bad' = i.aborted || i.failed.length > 0 || blocking ? 'bad' : i.findings.length > 0 || (i.auto && i.skipped > 0) ? 'warn' : 'good';
  const sha = i.upstreamSha ? i.upstreamSha.slice(0, 7) : '';
  const title = i.aborted
    ? C.titleAborted
    : i.dryRun ? C.titleDry : (i.auto && i.skipped > 0) ? C.titlePending(sha) : C.titleDone(sha);
  const tiles: Tile[] = [
    { n: String(i.applied), label: C.tiles.applied, tone: i.applied > 0 ? 'good' : '' },
    { n: String(i.skipped), label: C.tiles.skipped, tone: '' },
    { n: String(i.failed.length), label: C.tiles.failed, tone: i.failed.length > 0 ? 'bad' : '' },
    { n: String(i.findings.length), label: C.tiles.findings, tone: i.findings.length > 0 ? 'warn' : '' },
  ];
  const surfaces: Surface[] = i.surfaces.map(s => ({ state: s.state, label: esc(s.label), detail: esc(s.cell) }));
  const findings: ParityFinding[] = i.findings.map(f => ({
    n: f.id,
    surface: f.surface,
    file: f.path,
    now: f.side === 'kept' ? C.nowKept : f.side === 'overwritten' ? C.nowOverwritten : '-',
    evidence: esc(f.evidence),
    suggested: f.suggested,
    blocking: f.blocking,
  }));
  const next: NextStep[] = [];
  if (i.failed.length > 0) {
    next.push({ title: C.nextFailed, text: i.failed.slice(0, 5).map(f => `<code>${esc(f.path)}</code>: ${esc(f.reason)}`).join('<br>') });
  }
  if (i.dryRun) { next.push({ title: C.nextReal, text: C.nextRealText, cmd: 'bun sync' }); }
  if (!i.dryRun && i.auto && i.skipped > 0) { next.push({ title: C.nextPending, text: C.nextPendingText(i.skipped), cmd: 'bun sync' }); }
  if (i.commit) { next.push({ title: C.nextCommit, text: C.nextCommitText, cmd: `git commit -m ${JSON.stringify(i.commit)}` }); }
  if (i.findings.length > 0 && i.promptPath) { next.push({ title: C.nextPrompt, text: C.nextPromptText(esc(i.promptPath)) }); }
  next.push(...(i.extraNext ?? []));
  return { title, tone, tiles, surfaces, findings, next, ...(i.prompt && i.findings.length > 0 ? { prompt: i.prompt } : {}) };
}
