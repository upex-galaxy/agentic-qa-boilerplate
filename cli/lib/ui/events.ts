/**
 * @fileoverview The event model of the installer / updater page, and the journal
 * that orders, redacts and replays it.
 *
 * One run (`bun setup` or `bun sync`) emits a sequence of `RunEvent`s. Each
 * one is appended to the `Journal`, which stamps a sequence number and the time
 * since the run started, and redacts every string against the secret values the
 * run has received. The page renders the journal; a reconnecting page replays it
 * from `Last-Event-ID`; the saved summary embeds it. A secret never enters the
 * journal, so it can never reach the page, the log or the summary by accident.
 *
 * Concurrency (owner answer Q2): steps are NOT a stack. Several steps may run at
 * once (a download in the `downloads` lane while a question waits in another
 * phase); every step event names its step by id, so `step.log` and `step.end`
 * always land on the right row however they interleave.
 *
 * Shared file: byte-identical in agentic-qa-boilerplate and agentic-dev-boilerplate.
 * Import-closed (`cli/`): node built-ins only.
 */

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

// ----------------------------------------------------------------------------
// Event shapes
// ----------------------------------------------------------------------------

export type Lang = 'es' | 'en';
/** `up` is the journal id of `bun sync` (its name before 2026-10); recorded journals keep it, the page shows `bun sync`. */
export type RunCmd = 'setup' | 'up';
/** `interactive`: the page answers questions. `readonly`: an explicit `--auto` run shown, nothing to answer. */
export type RunMode = 'interactive' | 'readonly';

export interface PhaseDef {
  id: string
  title: string
  /** One short line under the title in the rail. */
  hint?: string
}

export interface Check {
  group?: string
  label: string
  /** Measured value shown at the right ("bun 1.3.2", "38 GB libres"). */
  value?: string
  state: 'ok' | 'warn' | 'block' | 'info'
  /** Why it matters / how to fix it. Limited markup (see page `safe()`). */
  msg?: string
}

export type AskKind = 'confirm' | 'select' | 'multi' | 'text' | 'secret' | 'files' | 'deletions' | 'divergence' | 'package-keys';

export interface AskOption {
  value: string
  label: string
  desc?: string
  rec?: boolean
  checked?: boolean
}

export interface TextField {
  id: string
  label: string
  short?: string
  placeholder?: string
  hint?: string
  prefix?: string
  value?: string
  required?: boolean
  /** A JavaScript regular expression source the value must match. */
  pattern?: string
  patternMsg?: string
}

export interface FileRow {
  path: string
  add?: number
  del?: number
  kind?: 'new' | 'mod' | 'del'
  kindLabel?: string
  checked?: boolean
  /** Unified diff lines (`+`, `-`, `@@`, context). */
  diff?: string[]
  /** deletions: why upstream removed it. */
  why?: string
}

/** Per-kind payload. Every field is optional so one interface covers every kind. */
export interface AskSpec {
  options?: AskOption[]
  min?: number
  minMsg?: string
  fields?: TextField[]
  files?: FileRow[]
  /** secret: the variable the value is written to. */
  varName?: string
  label?: string
  hint?: string
  note?: string
  yes?: string
  no?: string
  mine?: string[]
  theirs?: string[]
  mineMeta?: string
  theirsMeta?: string
  cta?: string
  /** Extra buttons that answer with a fixed value ("Lo haré después"). */
  secondary?: { value: string, label: string }[]
}

export interface FailAction {
  value: string
  label: string
}

export interface Tile {
  n: string
  label: string
  tone?: 'good' | 'warn' | 'bad' | ''
}

export interface Surface {
  state: 'ok' | 'warn' | 'blocked'
  label: string
  detail: string
}

export interface ParityFinding {
  n: number
  surface: string
  file: string
  now: string
  evidence: string
  suggested: string
  blocking?: boolean
}

export interface NextStep {
  title: string
  text?: string
  cmd?: string
}

export type StepStatus = 'ok' | 'warn' | 'skipped' | 'failed';
export type PhaseStatus = 'done' | 'warn' | 'skipped' | 'failed';
export type EndStatus = 'done' | 'done-with-pending' | 'failed' | 'aborted';

export type RunEvent
  = | { t: 'run.start', cmd: RunCmd, args: string[], repo: string, version: string, mode: RunMode, lang: Lang, phases: PhaseDef[] }
    | { t: 'preflight', checks: Check[], verdict: 'clear' | 'warn' | 'block', text?: string }
    | { t: 'phase.start', id: string, title?: string, why?: string }
    | { t: 'phase.end', id: string, status: PhaseStatus, note?: string }
    | { t: 'step.start', id: string, phase: string, title: string, lane?: string, why?: string, detail?: string }
    | { t: 'step.log', id: string, line: string, stream: 'out' | 'err' }
    | { t: 'step.end', id: string, status: StepStatus, note?: string, ms: number }
    | { t: 'notice', level: 'info' | 'warn' | 'error', text: string, phase?: string }
    | { t: 'ask', id: string, kind: AskKind, phase?: string, kicker?: string, title: string, why?: string, g?: string, spec: AskSpec, secret: boolean, default?: unknown }
    | { t: 'answered', id: string, label: string, by: 'page' | 'terminal' | 'auto' }
    | { t: 'fail', id: string, step: string, title: string, what: string, how: string[], cmd?: string, actions: FailAction[] }
    | { t: 'restart', reason: 'self-update', from: string, to: string }
    | { t: 'report', title?: string, tone?: 'good' | 'warn' | 'bad', tiles: Tile[], surfaces?: Surface[], findings?: ParityFinding[], next: NextStep[], prompt?: string }
    | { t: 'run.end', status: EndStatus, exit: number, summaryPath?: string };

export type EventType = RunEvent['t'];

/** What the journal stores and the SSE stream sends: the event plus its order and time. */
export type JournalEntry = RunEvent & { seq: number, ts: number };

// ----------------------------------------------------------------------------
// Redaction
// ----------------------------------------------------------------------------

export const MASK = '••••••';

/**
 * Masks every secret value the run received. Exact-match replacement on every
 * string, longest value first so a secret that contains another is masked whole.
 * Values shorter than 4 characters are ignored: masking "a" would shred every line
 * and protects nothing (such a value is not a credential).
 */
export class Redactor {
  private values: string[] = [];

  add(value: string): void {
    if (typeof value !== 'string' || value.length < 4 || this.values.includes(value)) { return; }
    this.values.push(value);
    this.values.sort((a, b) => b.length - a.length);
  }

  get size(): number { return this.values.length; }

  text(s: string): string {
    let out = s;
    for (const v of this.values) {
      if (out.includes(v)) { out = out.split(v).join(MASK); }
    }
    return out;
  }

  /** Deep copy with every string redacted (object keys included). */
  deep<T>(value: T): T {
    if (typeof value === 'string') { return this.text(value) as T; }
    if (Array.isArray(value)) { return value.map(v => this.deep(v)) as T; }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) { out[this.text(k)] = this.deep(v); }
      return out as T;
    }
    return value;
  }
}

// ----------------------------------------------------------------------------
// Journal
// ----------------------------------------------------------------------------

export type JournalListener = (entry: JournalEntry) => void;

export interface JournalOptions {
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number
  /** Entries from a previous process (self-update hand-off): the sequence continues after them. */
  resume?: JournalEntry[]
  redactor?: Redactor
}

export class Journal {
  readonly redactor: Redactor;
  private readonly entries: JournalEntry[] = [];
  private readonly listeners = new Set<JournalListener>();
  private readonly now: () => number;
  private readonly t0: number;
  private seq = 0;

  constructor(opts: JournalOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.redactor = opts.redactor ?? new Redactor();
    const resume = opts.resume ?? [];
    for (const e of resume) { this.entries.push(e); }
    this.seq = resume.length ? resume[resume.length - 1].seq : 0;
    // Keep the clock continuous across a hand-off: time already elapsed carries over.
    const lastTs = resume.length ? resume[resume.length - 1].ts : 0;
    this.t0 = this.now() - lastTs;
  }

  /** Append one event: stamped, redacted, then delivered to every listener. */
  append(ev: RunEvent): JournalEntry {
    this.seq += 1;
    const entry = { ...this.redactor.deep(ev), seq: this.seq, ts: Math.max(0, this.now() - this.t0) };
    this.entries.push(entry);
    for (const fn of this.listeners) {
      try { fn(entry); }
      catch { /* a broken listener never stops the run */ }
    }
    return entry;
  }

  /** Append an entry recorded elsewhere, keeping its timestamp (replay of a recorded journal). */
  appendRecorded(entry: JournalEntry): JournalEntry {
    this.seq += 1;
    const { seq: _seq, ts, ...ev } = entry;
    const out = { ...this.redactor.deep(ev), seq: this.seq, ts };
    this.entries.push(out);
    for (const fn of this.listeners) {
      try { fn(out); }
      catch { /* a broken listener never stops the run */ }
    }
    return out;
  }

  /** Every entry with `seq` greater than `after` (0 = everything). */
  since(after = 0): JournalEntry[] {
    return this.entries.filter(e => e.seq > after);
  }

  all(): JournalEntry[] {
    return this.entries.slice();
  }

  get lastSeq(): number { return this.seq; }

  get ended(): boolean {
    return this.entries.some(e => e.t === 'run.end');
  }

  subscribe(fn: JournalListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Self-update hand-off: write the (already redacted) journal to a 600 file. */
  writeFile(path: string): void {
    writeFileSync(path, JSON.stringify(this.entries), { mode: 0o600 });
    chmodSync(path, 0o600);
  }

  static readFile(path: string): JournalEntry[] {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed)) { throw new TypeError(`${path}: not a journal (expected a JSON array)`); }
    return parsed as JournalEntry[];
  }
}

// ----------------------------------------------------------------------------
// Self-update hand-off through the environment (plan §6)
// ----------------------------------------------------------------------------

export const HANDOFF_ENV = {
  port: 'UPEX_UI_PORT',
  token: 'UPEX_UI_TOKEN',
  journal: 'UPEX_UI_JOURNAL',
} as const;

export interface Handoff {
  port: number
  token: string
  journalPath: string
}

export function handoffEnv(h: Handoff): Record<string, string> {
  return { [HANDOFF_ENV.port]: String(h.port), [HANDOFF_ENV.token]: h.token, [HANDOFF_ENV.journal]: h.journalPath };
}

export function readHandoffEnv(env: Record<string, string | undefined>): Handoff | null {
  const port = Number(env[HANDOFF_ENV.port]);
  const token = env[HANDOFF_ENV.token];
  const journalPath = env[HANDOFF_ENV.journal];
  if (!Number.isInteger(port) || port <= 0 || !token || !journalPath) { return null; }
  return { port, token, journalPath };
}
