#!/usr/bin/env bun
import type { BoardConfig } from '../lib/sprint-source/index.ts';
import type { BoardEvent, Sprint } from './model.ts';
/**
 * Sprint Board CLI. Every write appends one fact to the sprint's events.ndjson;
 * `serve` folds the log + the tracker (source.json) + the workers' own files into the live page.
 * Everything it writes is local and gitignored. Full usage: README.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { evidenceUrlError } from '../lib/evidence-page/hosts.ts';
import { AGENT_ACTORS, agentRefusal, applyAskTransition, AskError, draftApproved, futureRefusal, owesDraft, ownerRefusal } from './ask-transition.ts';
import { resolveMessenger } from './messenger.ts';
import {
  ARRIVAL_ACTIONS,
  arrivals,
  ASK_KINDS,
  ASK_STATES,
  BLOCKERS,
  boardTicketIds,
  bugEvidenceReminder,
  decisionOptions,
  defaultTwoWay,
  EVIDENCE_ARTIFACT_BY,
  EVIDENCE_OUTCOMES,
  evidenceArtifactUrl,
  HOLD_REASONS,
  listenLine,
  listFixtures,
  localHhmm,
  needTarget,
  oneOf,
  ownerActionsSince,
  printable,
  printableJson,
  resolvePerson,
  SCHEMA,
  SEVERITIES,
  sinceCutoff,
  TC_STATUSES,
  trackerName,
  untrackedInTest,
  VERDICTS,
  WATCH_STALE_MIN,
  watchersDown,
  watchLiveness,
  WORKER_STAGES,
  WORKER_STATES,
} from './model.ts';
import { buildState, readLive } from './sources.ts';
import {
  appendEvent,
  BOARD_DIR,
  currentSlug,
  isoAt,
  listSprints,
  readEvents,
  readSprint,
  readTracker,
  REPO_ROOT,
  setCurrent,
  SOURCE_LOCK_WAIT_MS,
  sprintDir,
  writeSprint,
} from './store.ts';
import { boardConfig } from './sync.ts';
import { checkWatcherName, clearWatcher, registerWatcher, watcherViews } from './watchers.ts';

interface Args { _: string[], flags: Record<string, string[]>, bare: Set<string> }

/** Flags that never take a value: `say --ask "text"` must not swallow the text. */
const BOOLEAN_FLAGS = new Set(['all', 'ask', 'discover', 'dry-run', 'embed-evidence', 'evidence-embedded', 'fragment', 'json', 'once', 'one-way', 'open', 'out-of-scope', 'reuse', 'sync', 'two-way']);

function parse(argv: string[]): Args {
  const out: Args = { _: [], flags: {}, bare: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = eq > 0 ? a.slice(2, eq) : a.slice(2);
      const next = argv[i + 1];
      // `--match` is searched in a command line: left bare it must read as empty, never as the text "true".
      const bare = k === 'match' ? '' : 'true';
      const valued = eq <= 0 && !BOOLEAN_FLAGS.has(k) && next !== undefined && !next.startsWith('--');
      if (eq <= 0 && !valued) { out.bare.add(k); }
      const v = eq > 0 ? a.slice(eq + 1) : valued ? (i++, next) : bare;
      (out.flags[k] ??= []).push(v);
    }
    else { out._.push(a); }
  }
  return out;
}

const print = (line = '') => console.log(printable(line));

const flag = (a: Args, k: string) => a.flags[k]?.at(-1);
const flags = (a: Args, k: string) => (a.flags[k] ?? []).flatMap(x => x.split(',')).map(x => x.trim()).filter(Boolean);
const rest = (a: Args, from: number) => a._.slice(from).join(' ').trim();

function need(v: string | undefined, what: string): string {
  if (!v) { throw new Error(`missing ${what}`); }
  return v;
}

/**
 * The board's config (`.agents/project.yaml` `board:`), loaded once. A command that only appends to
 * the log still works on an unconfigured board: it falls back to the generic key shape, and `sync`
 * is the command that refuses with the reason.
 */
let configMemo: BoardConfig | null | undefined;
function config(): BoardConfig | null {
  if (configMemo !== undefined) { return configMemo; }
  try { configMemo = boardConfig(); }
  catch { configMemo = null; }
  return configMemo;
}
/** `board.ticket_key_pattern` (derived `^<project_key>-\d+$`), case-insensitive like the client's TK check. */
const TK = { test: (id: string): boolean => new RegExp((config()?.ticketKeyPattern ?? /^[A-Z][A-Z0-9]+-\d+$/).source, 'i').test(id) };
const keyExample = () => `${config()?.projectKey ?? 'PROJ'}-7123`;
/** Where `--stp-url` may point: the tracker's host (`issue_tracker.atlassian_url`) or an evidence host (a published plan page). */
function stpHosts(): string[] {
  const c = config();
  let jira: string[] = [];
  try { jira = c?.jiraHost ? [new URL(c.jiraHost).hostname] : []; }
  catch { /* a malformed host is board:check's to report */ }
  return [...new Set([...jira, ...(c?.evidenceHosts ?? [])])];
}
/** A test case id: a tracker key (`PROJ-7045`) or a file's own id (`DEMO-7101-T1`, `TC-7012`). */
const TC_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/i;
const slugOf = (a: Args) => flag(a, 'sprint-slug') ?? currentSlug();
const by = (a: Args) => flag(a, 'by');

// An event that states what someone said or decided must name its author, or readers take it as someone else's word.
function writer(a: Args): string {
  const who = need(by(a), `--by ${AGENT_ACTORS.join('|')}: say who is writing (the owner writes from the page)`);
  const refused = agentRefusal(who);
  if (refused) { throw new Error(refused); }
  return who;
}

function authorRefusal(a: Args): string | null {
  const given = a.flags.by ?? [];
  if (a.bare.has('by') || given.some(who => !who.trim())) { return '--by needs a value: say who is writing'; }
  return given.map(ownerRefusal).find(Boolean) ?? null;
}

const ASK_STATE_FLAGS = { 'reply': 'answered', 'reply-at': 'answered', 'link': 'drafted', 'error': 'draft-failed' } as const;

/** Fail loudly: only tickets already on this board, unless the command is `add`. */
function knownTicket(slug: string, raw: string | undefined): string {
  const id = need(raw, `ticket id (${keyExample()})`).toUpperCase();
  if (!TK.test(id)) { throw new Error(`"${raw}" is not a ticket id like ${keyExample()}`); }
  const { events } = readEvents(slug);
  const known = new Set([...events.map(e => e.ticket), ...Object.keys(readTracker(slug)?.tickets ?? {})]);
  if (!known.has(id)) { throw new Error(`${id} is not on the ${slug} board (${known.size} tickets searched). Add it first: add ${id}`); }
  return id;
}

function repoPath(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  if (!existsSync(abs)) { throw new Error(`file not found: ${p}`); }
  const rel = relative(REPO_ROOT, abs);
  if (rel.startsWith('..')) { throw new Error(`evidence must live inside the repo (got ${abs})`); }
  return rel;
}

/** `--lock-wait <seconds>` for a CLI sync; default 240 s, so a pass that meets the server's sync waits instead of failing. */
function lockWait(a: Args): number {
  const raw = flag(a, 'lock-wait');
  if (raw === undefined) { return SOURCE_LOCK_WAIT_MS; }
  const s = Number(raw);
  if (!Number.isFinite(s) || s < 0) { throw new Error(`--lock-wait must be a number of seconds >= 0 (got "${raw}")`); }
  return s * 1000;
}

/** One small `watch.pass` event per test-environment watch pass (liveness). */
function recordPass(slug: string, note?: string, counts?: Record<string, number>): BoardEvent {
  return appendEvent(slug, { kind: 'watch.pass', by: 'conductor', text: `Watch pass${note ? `: ${note}` : ''}`, data: counts });
}

const commands: Record<string, (a: Args) => void | Promise<void>> = {
  new(a) {
    const n = Number(need(flag(a, 'sprint'), '--sprint <n>'));
    if (!Number.isInteger(n) || n <= 0) { throw new Error('--sprint must be a positive integer'); }
    const slug = `sprint-${n}`;
    if (existsSync(sprintDir(slug)) && flag(a, 'reuse') !== 'true') {
      throw new Error(`${slug} already exists. Switch with "use ${slug}", or pass --reuse.`);
    }
    // --reuse keeps the board as it is (people, releases, closedAt, goal, stp,
    // startedAt) and only makes it CURRENT; it is not a second opening.
    if (existsSync(join(sprintDir(slug), 'sprint.json'))) {
      readSprint(slug);
      setCurrent(slug);
      print(`Board reused: ${sprintDir(slug)} (now CURRENT, nothing rewritten)`);
      return;
    }
    const s: Sprint = {
      v: SCHEMA,
      slug,
      number: n,
      name: flag(a, 'name') ?? `Sprint ${n}`,
      env: flag(a, 'env') ?? config()?.environment ?? undefined,
      goal: flag(a, 'goal'),
      stp: flag(a, 'stp'),
      qa: flag(a, 'qa') ?? config()?.people.find(p => p.role?.toLowerCase() === 'qa')?.name,
      startedAt: isoAt(flag(a, 'started')) ?? new Date().toISOString(),
      // board.people seeds the sprint's people (its `jira` name becomes an alias); `sprint --person` adds more.
      people: config()?.people.map(p => ({ name: p.name, role: p.role ?? undefined, lang: p.language === 'es' ? 'es' as const : 'en' as const, aliases: p.jira && p.jira !== p.name ? [p.jira] : undefined })),
      evidenceHosts: config() ? [...config()!.evidenceHosts] : undefined,
    };
    writeSprint(s);
    setCurrent(slug);
    appendEvent(slug, { kind: 'sprint', text: `${s.name} board opened`, at: s.startedAt });
    print(`Board ready: ${sprintDir(slug)} (now CURRENT)`);
  },

  use(a) {
    const slug = need(a._[0], 'sprint slug, e.g. sprint-22');
    readSprint(slug);
    setCurrent(slug);
    print(`CURRENT -> ${slug}`);
  },

  sprint(a) {
    const slug = slugOf(a);
    const s = readSprint(slug);
    for (const k of ['name', 'env', 'goal', 'stp', 'qa'] as const) { const v = flag(a, k); if (v) { s[k] = v; } }
    const closed = flag(a, 'closed');
    if (closed) { s.closedAt = closed === 'true' ? new Date().toISOString() : isoAt(closed); }
    for (const p of a.flags.person ?? []) {
      // --person "Dana Dev=Product Owner,en,Dana;D. Dev"
      const [rawName, meta = ''] = p.split('=');
      const name = rawName.trim();
      const [role, lang, aliases] = meta.split(',');
      const people = (s.people ?? []).filter(x => x.name !== name);
      people.push({ name, role: role?.trim() || undefined, lang: lang?.trim() === 'es' ? 'es' : 'en', aliases: aliases?.split(';').map(x => x.trim()).filter(Boolean) });
      s.people = people;
    }
    writeSprint(s);
    print(`${slug} updated`);
  },

  add(a) {
    const slug = slugOf(a);
    const ids = a._.flatMap(x => x.split(',')).map(x => x.trim().toUpperCase()).filter(Boolean);
    if (!ids.length) { throw new Error(`add needs at least one ticket id like ${keyExample()}`); }
    for (const id of ids) {
      if (!TK.test(id)) { throw new Error(`"${id}" is not a ticket id`); }
      appendEvent(slug, { kind: 'scope.add', ticket: id, text: `${id} joined the sprint board`, by: by(a), at: flag(a, 'at'), data: { title: flag(a, 'title'), inScope: flag(a, 'out-of-scope') !== 'true' } });
    }
    print(`added ${ids.join(', ')} to ${slug}`);
  },

  remove(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    appendEvent(slug, { kind: 'scope.remove', ticket: id, text: `${id} left QA scope${rest(a, 1) ? `: ${rest(a, 1)}` : ''}`, by: by(a) });
    print(`${id} marked out of scope (kept on record)`);
  },

  meta(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const data: Record<string, string> = {};
    for (const k of ['title', 'type', 'dev', 'priority', 'module', 'next']) { const v = flag(a, k); if (v) { data[k] = v; } }
    if (!Object.keys(data).length) { throw new Error('meta needs at least one of --title --type --dev --priority --module --next'); }
    appendEvent(slug, { kind: 'meta', ticket: id, text: data.next ? `Next on ${id}: ${data.next}` : `${id} details updated`, by: by(a), at: flag(a, 'at'), data });
    print(`${id} updated`);
  },

  start(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const retest = readEvents(slug).events.some(e => e.ticket === id && e.kind === 'verdict');
    if (retest) { appendEvent(slug, { kind: 'attempt', ticket: id, text: `${id} retest started`, by: by(a), at: flag(a, 'at') }); }
    appendEvent(slug, { kind: 'worker', ticket: id, text: `${id} worker started${flag(a, 'worker') ? ` (${flag(a, 'worker')})` : ''}`, by: by(a), at: flag(a, 'at'), data: { state: 'running', stage: 'plan', name: flag(a, 'worker') } });
    print(`${id} running${retest ? ' (new attempt)' : ''}`);
  },

  worker(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const data: Record<string, string> = {};
    if (flag(a, 'state')) { data.state = oneOf(WORKER_STATES, flag(a, 'state')!, '--state'); }
    if (flag(a, 'stage')) { data.stage = oneOf(WORKER_STAGES, flag(a, 'stage')!, '--stage'); }
    if (flag(a, 'name')) { data.name = flag(a, 'name')!; }
    if (!Object.keys(data).length) { throw new Error('worker needs --state, --stage or --name'); }
    appendEvent(slug, { kind: 'worker', ticket: id, text: `${id} worker ${data.stage ? `at ${data.stage}` : data.state ?? 'renamed'}`, by: by(a), at: flag(a, 'at'), data });
    print(`${id} worker updated`);
  },

  tc(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const tc = need(a._[1], 'TC id').toUpperCase();
    if (!TC_ID.test(tc)) { throw new Error(`"${a._[1]}" is not a TC id like ${keyExample()} or TC-7012`); }
    const status = oneOf(TC_STATUSES, need(rest(a, 2) || undefined, 'TC status'), 'TC status');
    const approval = flag(a, 'approval');
    const reason = flag(a, 'reason');
    if (status === 'DEFERRED' && !reason && !approval) { throw new Error('DEFERRED needs --reason "QA decision <date>: <the external cause>", and only after the unblock preflight ran and its record says DEFER: every attempt carries its evidence, and with no evidence the cause is not external and the case stays BLOCKED. --approval "<who>, <where>" records who agreed to defer this case; it is not the owner\'s OK for the Story to move. Rules: sprint-testing/references/preflight-gate.md §3, agentic-qa-core/references/discovery-driven-doctrine.md §5 (DEFERRED (execution))'); }
    const who = status === 'DEFERRED' || approval !== undefined ? writer(a) : by(a);
    appendEvent(slug, { kind: 'tc', ticket: id, text: `${tc} ${status}${flag(a, 'name') ? `: ${flag(a, 'name')}` : ''}`, by: who, at: flag(a, 'at'), data: { tc, status, name: flag(a, 'name'), approval, reason } });
    print(`${id} ${tc} -> ${status}`);
  },

  verdict(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const v = oneOf(VERDICTS, need(a._[1], 'verdict'), 'verdict');
    // PENDING is the board's own "no verdict yet" state; recording it reads as a worker that
    // stopped without a verdict (measured on the source board). An owner or developer wait is BLOCKED + hold.
    if (v === 'PENDING') { throw new Error(`verdict PENDING means "no verdict yet". For a ticket waiting on an owner or developer decision record \`verdict ${id} BLOCKED --note "<why>" --by ${AGENT_ACTORS.join('|')}\` and \`hold ${id} --reason no-data|other --on <who> "<what>"\`.`); }
    const note = flag(a, 'note');
    appendEvent(slug, { kind: 'verdict', ticket: id, text: `${id} ${v}${note ? `. ${note}` : ''}`, by: writer(a), at: flag(a, 'at'), data: { verdict: v, note } });
    print(`${id} verdict ${v}`);
  },

  ask(a) {
    const slug = slugOf(a);
    const person = resolvePerson(buildState(slug).people, need(flag(a, 'to'), '--to <person>'));
    const file = flag(a, 'file');
    const text = file ? readFileSync(file, 'utf8').trim() : need(flag(a, 'text'), '--text or --file');
    const tickets = flags(a, 'ticket').map(t => knownTicket(slug, t));
    const kind = oneOf(ASK_KINDS, flag(a, 'kind') ?? 'blocker', '--kind');
    if (flag(a, 'one-way') && flag(a, 'two-way')) { throw new Error('pass --one-way or --two-way, not both'); }
    const twoWay = flag(a, 'two-way') ? true : flag(a, 'one-way') ? false : defaultTwoWay(kind);
    const who = writer(a);
    const refused = futureRefusal(flag(a, 'at'));
    if (refused) { throw new Error(refused); }
    const id = `ask-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    appendEvent(slug, {
      kind: 'ask.create',
      ticket: tickets[0],
      text: `Draft for ${person.name} ready`,
      by: who,
      at: flag(a, 'at'),
      data: {
        id,
        to: person.name,
        lang: flag(a, 'lang') ?? person.lang,
        kind,
        tickets,
        text,
        attach: flags(a, 'attach').map(repoPath),
        twoWay,
      },
    });
    print(`draft ${id} for ${person.name} (${twoWay ? 'two-way' : 'one-way'})`);
  },

  'ask-state': async function (a) {
    const slug = slugOf(a);
    const id = need(a._[0], 'ask id');
    const state = oneOf(ASK_STATES, need(a._[1], 'state'), 'ask state');
    const who = writer(a);
    const expect = flag(a, 'expect') === undefined ? undefined : oneOf(ASK_STATES, flag(a, 'expect')!, '--expect');
    for (const [name, only] of Object.entries(ASK_STATE_FLAGS)) {
      const value = flag(a, name);
      if (value === undefined) { continue; }
      if (state !== only) { throw new Error(`--${name} goes with the ${only} state (got ${state})`); }
      if (a.bare.has(name) || !value.trim()) { throw new Error(`--${name} needs a value`); }
    }
    const link = flag(a, 'link');
    if (link !== undefined && !/^https:\/\/[^\s"'<>]+$/i.test(link)) { throw new Error(`--link must be an https URL (got "${link}")`); }
    const error = flag(a, 'error');
    const messenger = resolveMessenger();
    try {
      const r = await applyAskTransition(slug, {
        id,
        state,
        expect,
        by: who,
        at: flag(a, 'at'),
        reply: flag(a, 'reply')?.trim(),
        replyAt: isoAt(flag(a, 'reply-at')),
        link,
        error,
        guard: () => {
          if (state === 'drafted' && !link) { return 'missing --link <url of the draft>'; }
          return state === 'draft-failed' && !error ? 'missing --error "<why the draft failed>"' : null;
        },
      }, messenger);
      print(r.noop ? `${id} already ${r.state} (by ${r.by ?? '?'} at ${r.at ?? '?'}); nothing written` : `${id} -> ${r.state}`);
      if (messenger && owesDraft(r)) { print(`${id} -> ${(await draftApproved(slug, id, messenger)).state}`); }
    }
    catch (err) {
      // A refusal says what the ask is now, so the caller need not read the board to learn it.
      if (!(err instanceof AskError) || !err.current) { throw err; }
      throw new Error(`${err.message} (now ${err.current.state}, by ${err.current.by ?? '?'} at ${err.current.at ?? '?'})`);
    }
  },

  /**
   * A question for the owner. The decision-card flags are optional: --blocked "<what cannot run>",
   * --why "<plain reason>", --option "a: <action> | cost: <...>" (repeatable), --recommend <key>,
   * --decider "<person>". Without them the page shows a plain question, as before.
   */
  'needs-you': function (a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const question = need(rest(a, 1) || undefined, 'the question for the owner');
    const blocker = oneOf(BLOCKERS, flag(a, 'blocker') ?? 'decision', '--blocker');
    const options = a.flags.option ?? [];
    const { recommend } = decisionOptions(options, flag(a, 'recommend'));
    const decider = flag(a, 'decider') ? resolvePerson(buildState(slug).people, flag(a, 'decider')!).name : undefined;
    const nid = `need-${Date.now().toString(36)}`;
    appendEvent(slug, { kind: 'need.open', ticket: id, text: `${id} needs you: ${question}`, by: writer(a), at: flag(a, 'at'), data: { id: nid, question, blocker, options, blocked: flag(a, 'blocked'), why: flag(a, 'why'), recommend, decider } });
    print(`${id} -> Needs you (${nid})${recommend ? `, QA recommends ${recommend}` : ''}${decider ? `, ${decider} decides` : ''}`);
  },

  /** An agent records an answer given outside the page, under its own name; with no text it prints the answers given and by whom. */
  answer(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const text = rest(a, 1);
    if (!text) {
      const t = buildState(slug).tickets.find(x => x.id === id);
      const answered = t?.needs.filter(n => n.answer) ?? [];
      if (!answered.length) { print('(no answer yet)'); }
      for (const n of answered) {
        print(`${n.id} asked by ${n.openedBy ?? '?'}: ${n.question}`);
        print(`${n.id} answered by ${n.answeredBy ?? '?'}: ${n.answer}`);
      }
      return;
    }
    const who = writer(a);
    const needId = needTarget(buildState(slug).tickets.find(x => x.id === id)?.needs ?? [], 'answer', id, flag(a, 'id'));
    appendEvent(slug, { kind: 'need.answer', ticket: id, text: `${who} answered on ${id}: ${text}`, by: who, at: flag(a, 'at'), data: { id: needId, text } });
    print(`${id} answered`);
  },

  resolve(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const needId = needTarget(buildState(slug).tickets.find(x => x.id === id)?.needs ?? [], 'resolve', id, flag(a, 'id'));
    appendEvent(slug, { kind: 'need.close', ticket: id, text: `${id} question closed${rest(a, 1) ? `: ${rest(a, 1)}` : ''}`, by: writer(a), at: flag(a, 'at'), data: { id: needId } });
    print(`${id} question ${needId} closed`);
  },

  hold(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const reason = oneOf(HOLD_REASONS, need(flag(a, 'reason'), '--reason'), '--reason');
    const note = need(rest(a, 1) || undefined, 'what it is waiting for');
    appendEvent(slug, { kind: 'hold.set', ticket: id, text: `${id} held: ${note}`, by: by(a), at: flag(a, 'at'), data: { reason, note, on: flag(a, 'on') } });
    print(`${id} -> Held`);
  },

  unhold(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    appendEvent(slug, { kind: 'hold.clear', ticket: id, text: `${id} released from hold${rest(a, 1) ? `: ${rest(a, 1)}` : ''}`, by: by(a), at: flag(a, 'at') });
    print(`${id} hold cleared`);
  },

  wait(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const person = resolvePerson(buildState(slug).people, need(flag(a, 'on'), '--on <person>')).name;
    const what = need(flag(a, 'what'), '--what "<what you need from them>"');
    appendEvent(slug, { kind: 'wait.open', ticket: id, text: `Waiting on ${person}: ${what}`, by: by(a), at: flag(a, 'at'), data: { id: `wait-${Date.now().toString(36)}`, person, what } });
    print(`${id} waiting on ${person}`);
  },

  unwait(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const person = resolvePerson(buildState(slug).people, need(flag(a, 'on'), '--on <person>')).name;
    appendEvent(slug, { kind: 'wait.close', ticket: id, text: `${person} answered on ${id}${rest(a, 1) ? `: ${rest(a, 1)}` : ''}`, by: writer(a), at: flag(a, 'at'), data: { person } });
    print(`${id} no longer waiting on ${person}`);
  },

  bug(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const bug = need(a._[1], 'bug id').toUpperCase();
    if (!TK.test(bug)) { throw new Error(`"${a._[1]}" is not a ticket id`); }
    const severity = flag(a, 'severity') ? oneOf(SEVERITIES, flag(a, 'severity')!, '--severity') : undefined;
    appendEvent(slug, { kind: 'bug.link', ticket: id, text: `${bug} filed against ${id}${flag(a, 'title') ? `: ${flag(a, 'title')}` : ''}`, by: by(a), at: flag(a, 'at'), data: { bug, title: flag(a, 'title'), severity } });
    print(`${id} <- bug ${bug}`);
    // A reminder, never a failure: the link is already recorded above.
    try {
      const live = readLive([id, bug]);
      const images = [...new Set([...(live[id]?.evidence ?? []), ...(live[bug]?.evidence ?? [])])];
      const note = bugEvidenceReminder({ ticket: id, bug, images, embedded: flag(a, 'evidence-embedded') === 'true' });
      if (note) { print(note); }
    }
    catch { /* the evidence check must never stop a bug link */ }
  },

  evidence(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const path = repoPath(need(a._[1], 'image path'));
    const tc = flag(a, 'tc')?.toUpperCase();
    if (tc && !TC_ID.test(tc)) { throw new Error(`--tc "${flag(a, 'tc')}" is not a TC id like ${keyExample()} or TC-7012`); }
    const outcome = flag(a, 'outcome') ? oneOf(EVIDENCE_OUTCOMES, flag(a, 'outcome')!, '--outcome') : undefined;
    appendEvent(slug, { kind: 'evidence', ticket: id, text: `Evidence on ${id}${tc ? ` ${tc}` : ''}: ${flag(a, 'caption') ?? path}`, by: by(a), at: flag(a, 'at'), data: { path, caption: flag(a, 'caption'), tc, outcome } });
    print(`${id} evidence ${path}${tc ? ` (${tc}${outcome ? `, ${outcome}` : ''})` : outcome ? ` (${outcome})` : ''}`);
    // A note, never a failure: the TC may reach the tracker after the screenshot does.
    if (tc && !buildState(slug).tickets.find(t => t.id === id)?.tcs.some(x => x.id === tc)) { print(`note: ${tc} is not on ${id} yet; the image is grouped under it anyway`); }
  },

  /**
   * The page published as a ticket's (or, with --bug, one bug's) evidence page (a claude.ai artifact
   * by default, `bun run evidence`; the host must be in `board.evidence.allowed_hosts`). The newest per ticket or bug wins on the page; older ones stay in
   * the log and the history. `evidence-page` is the older name, kept as an alias below.
   */
  'evidence-artifact': function (a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const raw = need(a._[1], 'the evidence page URL (https://claude.ai/artifact/<id> or https://claude.ai/code/artifact/<uuid>)');
    const hosts = config()?.evidenceHosts ?? readSprint(slug).evidenceHosts ?? ['claude.ai'];
    const refused = evidenceUrlError(String(raw).trim().replace(/\/$/, ''), hosts);
    if (refused) { throw new Error(`"${raw}" cannot be recorded: ${refused}`); }
    const url = evidenceArtifactUrl(raw, hosts);
    const who = oneOf(EVIDENCE_ARTIFACT_BY, need(by(a), `--by ${EVIDENCE_ARTIFACT_BY.join('|')}`), '--by');
    const title = flag(a, 'title');
    const state = buildState(slug);
    const bug = flag(a, 'bug')?.toUpperCase();
    if (bug !== undefined) {
      if (!TK.test(bug)) { throw new Error(`--bug "${flag(a, 'bug')}" is not a ticket id like ${keyExample()}`); }
      // Fail loudly: the bug must be one the Bugs view knows, so the link lands on a row someone sees.
      const known = state.bugs ?? [];
      if (!known.some(b => b.id === bug)) {
        throw new Error(`${bug} is not a bug on the ${slug} board (${known.length} bugs searched: linked with \`bug\`, plus bugs the tracker links to tracked tickets). Link it first: bug ${id} ${bug} --title "..." --severity <...>`);
      }
    }
    const prev = bug ? state.bugs?.find(b => b.id === bug)?.page : state.tickets.find(t => t.id === id)?.evidenceArtifact;
    appendEvent(slug, { kind: 'evidence.artifact', ticket: id, text: `Evidence page for ${bug ?? id}${bug ? ` (bug on ${id})` : ''}${title ? `: ${title}` : ''}`, by: who, at: flag(a, 'at'), data: { url, bug, title } });
    print(`${bug ? `${bug} (bug on ${id})` : id} evidence page ${url}${prev ? `; replaces the page recorded ${prev.at.slice(0, 16).replace('T', ' ')}Z (kept in history)` : ''}`);
  },

  /** The older name of `evidence-artifact`, kept so a session briefed with the old name still records its link. */
  'evidence-page': async function (a) {
    await commands['evidence-artifact'](a);
  },

  /** Reusable test data a worker found, for the conductor's next seeds. */
  fixture(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const text = need(rest(a, 1) || undefined, 'the test data found, e.g. "store 42 has no orders in the last 7 days"');
    let module = flag(a, 'module')?.trim();
    if (module) {
      // Fail loudly: a module is one a ticket on this board carries (its tracker module / component).
      const known = [...new Set(buildState(slug).tickets.map(t => t.module).filter((m): m is string => Boolean(m)))];
      const hit = known.find(k => k.toLowerCase() === module!.toLowerCase());
      if (!hit) { throw new Error(`--module "${module}" is not a known module (${known.length} searched: the modules of this board's tickets)${known.length ? `. Known: ${known.join(', ')}` : '. Run sync first: the modules come from the tracker'}`); }
      module = hit;
    }
    const fid = `fx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    appendEvent(slug, { kind: 'fixture', ticket: id, text: `Test data on ${id}: ${text}`, by: by(a), at: flag(a, 'at'), data: { id: fid, text, module } });
    print(`${id} fixture ${fid}${module ? ` (${module})` : ''}`);
  },

  /** Lists recorded test data, newest first: ticket, module, text, time. */
  fixtures(a) {
    const slug = slugOf(a);
    const all = buildState(slug).fixtures;
    const module = flag(a, 'module');
    const list = listFixtures(all, module);
    if (flag(a, 'json') === 'true') { console.log(printableJson({ slug, module, searched: all.length, fixtures: list })); return; }
    print(`fixtures on ${slug}: ${list.length} shown, ${all.length} recorded${module ? ` (module ${module})` : ''}`);
    for (const f of list) { print(`${f.at.slice(0, 16).replace('T', ' ')}Z  ${f.ticket}  ${f.module ?? 'no module'}  by ${f.by ?? '?'}: ${f.text}`); }
  },

  'accept-risk': function (a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const who = need(flag(a, 'by'), '--by "<who accepted, where>"');
    appendEvent(slug, { kind: 'accept-risk', ticket: id, text: `${who} accepted ${id} as shipped${rest(a, 1) ? `: ${rest(a, 1)}` : ''}`, by: who, at: flag(a, 'at'), data: { by: who, note: rest(a, 1) || undefined } });
    print(`${id} risk accepted by ${who}`);
  },

  /** Claude writes in the inbox: a question (--option or --ask), an update, or a reply (--reply <msg-id>). */
  say(a) {
    const slug = slugOf(a);
    const text = need(rest(a, 0) || undefined, 'the message text');
    const replyTo = flag(a, 'reply');
    if (replyTo && !buildState(slug).inbox.some(t => t.id === replyTo || t.replies.some(r => r.id === replyTo))) {
      throw new Error(`no inbox message ${replyTo} on ${slug}. List them with: inbox --all`);
    }
    const ticket = flag(a, 'ticket') ? knownTicket(slug, flag(a, 'ticket')) : undefined;
    const options = a.flags.option ?? [];
    const id = `msg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    appendEvent(slug, { kind: 'msg', ticket, text: `Claude: ${text}`, by: 'claude', at: flag(a, 'at'), data: { id, from: 'claude', text, replyTo, options, ask: flag(a, 'ask') === 'true' || options.length > 0 } });
    print(`${id} posted to the ${slug} inbox`);
  },

  /** What the owner wrote that Claude has not answered yet (--all: every thread). */
  inbox(a) {
    const slugs = flag(a, 'sprint-slug') ? [flag(a, 'sprint-slug')!] : listSprints().filter(x => !readSprint(x).closedAt);
    let shown = 0; let searched = 0;
    for (const slug of slugs) {
      const threads = buildState(slug).inbox;
      searched += threads.length;
      for (const t of threads.filter(x => flag(a, 'all') === 'true' || x.state !== 'done')) {
        shown++;
        print();
        print(`[${slug}] ${t.id}  ${t.state}${t.ticket ? `  ${t.ticket}` : ''}`);
        for (const m of [t, ...t.replies]) { print(`  ${m.at.slice(0, 16).replace('T', ' ')}Z ${m.from} (${m.id}): ${m.text}${m.options.length ? `  [${m.options.join(' | ')}]` : ''}`); }
      }
    }
    if (!shown) { print(`Nothing open in the inbox (${searched} threads searched on ${slugs.join(', ') || 'no open board'}).`); }
  },

  /**
   * Prints one line per owner action, as it happens, on every open board: the
   * stream a Claude session watches with Monitor. Starts at the end of the log;
   * --since <iso|id> first replays what the owner did after that point.
   */
  async listen(a) {
    const open = () => listSprints().filter(x => !readSprint(x).closedAt);
    const since = flag(a, 'since');
    if (since) {
      const boards = open().map(slug => ({ slug, events: readEvents(slug).events }));
      const cutoff = sinceCutoff(since, boards.map(b => b.events));
      const total = boards.reduce((n, b) => n + b.events.length, 0);
      if (!cutoff) { throw new Error(`--since "${since}" is neither an ISO time nor an id on an open board (${total} events searched on ${boards.map(b => b.slug).join(', ') || 'no open board'})`); }
      const replay = boards.flatMap(b => ownerActionsSince(b.events, cutoff).map(e => ({ slug: b.slug, e })));
      replay.sort((x, y) => x.e.at.localeCompare(y.e.at));
      for (const { slug, e } of replay) { print(listenLine(slug, e)); }
      print(`replayed ${replay.length} owner action(s) since ${cutoff} (${total} events searched on ${boards.length} open board(s))`);
    }
    const seen = new Map<string, number>();
    const scan = (announce: boolean) => {
      for (const slug of open()) {
        const { events } = readEvents(slug);
        const from = seen.get(slug) ?? (announce ? 0 : events.length);
        for (const e of events.slice(from)) { if (e.by === 'owner') { print(listenLine(slug, e)); } }
        seen.set(slug, events.length);
      }
    };
    scan(false);
    print(`listening for owner actions on: ${[...seen.keys()].join(', ') || '(no open board)'}`);
    setInterval(() => {
      try { scan(true); }
      catch (err) { print(`listen error: ${(err as Error).message}`); }
    }, 2000);
    await new Promise(() => {});
  },

  log(a) {
    const slug = slugOf(a);
    const first = a._[0];
    const ticket = first && TK.test(first) ? knownTicket(slug, first) : undefined;
    const text = need((ticket ? rest(a, 1) : rest(a, 0)) || undefined, 'text');
    appendEvent(slug, { kind: 'note', ticket, text, by: by(a), at: flag(a, 'at') });
    print('logged');
  },

  release(a) {
    const slug = slugOf(a);
    const s = readSprint(slug);
    const label = need(rest(a, 0) || undefined, 'release label');
    const at = isoAt(flag(a, 'at')) ?? new Date().toISOString();
    (s.releases ??= []).push({ label, at, ref: flag(a, 'ref') });
    writeSprint(s);
    appendEvent(slug, { kind: 'release', text: label, at });
    print('release recorded');
  },

  async sync(a) {
    const { syncFromSource } = await import('./sync.ts');
    await syncFromSource(slugOf(a), { discover: flag(a, 'discover') === 'true', only: flags(a, 'ticket'), lockWaitMs: lockWait(a), source: flag(a, 'source') as never, ticketsFile: flag(a, 'tickets') });
  },

  /** Test-environment watch: tickets that reached it (bucket `in_test`) and still need a conductor decision. */
  async arrivals(a) {
    const slug = slugOf(a);
    if (flag(a, 'sync') === 'true') {
      const { syncFromSource } = await import('./sync.ts');
      await syncFromSource(slug, { discover: true, lockWaitMs: lockWait(a), source: flag(a, 'source') as never, ticketsFile: flag(a, 'tickets') });
    }
    const tracker = readTracker(slug);
    const { events } = readEvents(slug);
    const r = arrivals(events, tracker);
    const fresh = r.list.filter(x => x.state === 'new');
    const env = readSprint(slug).env ?? 'the test environment';
    // Sprint tickets in test that are not on the board, from the last --discover (Fail loudly: with its denominator).
    // Filtered again against the board as it is NOW: a ticket `add`ed since that discover is tracked.
    const discovered = tracker?.discover?.untracked ?? [];
    const untracked = untrackedInTest(discovered, boardTicketIds(events, tracker));
    const nowTracked = discovered.length - untracked.length;
    // A synced run IS the scheduled pass: record that it ran, so the board can show the watch is alive.
    if (flag(a, 'sync') === 'true') { recordPass(slug, `${fresh.length} new, ${r.list.length - fresh.length} recheck, ${untracked.length} untracked`, { new: fresh.length, recheck: r.list.length - fresh.length, inTest: r.inTest, untracked: untracked.length }); }
    if (flag(a, 'json') === 'true') { console.log(printableJson({ slug, syncedAt: tracker?.syncedAt, ...r, untracked, discover: tracker?.discover ? { at: tracker.discover.at, sprintRows: tracker.discover.sprintRows } : null })); return; }
    print(`arrivals on ${slug}: ${r.searched} tickets searched, ${r.inTest} in ${env}, ${fresh.length} new, ${r.list.length - fresh.length} to recheck (${trackerName(tracker?.source)} synced ${tracker?.syncedAt ?? 'never'})`);
    print(tracker?.discover
      ? `untracked: ${untracked.length} of ${tracker.discover.sprintRows} sprint rows in ${env} but not on the board (discovered ${tracker.discover.at}${nowTracked ? `; ${nowTracked} more listed then are on the board now` : ''})`
      : 'untracked: not checked, no sync --discover on this board yet (run arrivals --sync)');
    for (const x of r.list) {
      print(`${x.state === 'new' ? 'NEW    ' : 'RECHECK'} ${x.id}  ${x.priority ?? '-'}  ${x.dev ?? 'no dev'}  ${x.module ?? 'no module'}  ${x.title ?? ''}`);
      if (x.note) { print(`        last note by ${x.noteBy ?? '?'}: ${x.note}`); }
    }
    for (const x of untracked) { print(`UNTRACKED ${x.id}  ${x.status ?? '?'}  QA:${x.qa ?? 'blank'}  ${x.title ?? ''}`); }
    for (const x of tracker?.discover?.unclassified ?? []) { print(`UNCLASSIFIED ${x.id}  ${x.status}  (a status board.statuses does not list; add it to a bucket)`); }
  },

  /** Records what the conductor did with an arrival: launched, held (rechecked every pass) or skipped. */
  arrival(a) {
    const slug = slugOf(a);
    const id = knownTicket(slug, a._[0]);
    const action = oneOf(ARRIVAL_ACTIONS, need(a._[1], 'action (launched|held|skipped)'), 'action');
    const note = rest(a, 2);
    appendEvent(slug, { kind: 'arrival', ticket: id, by: writer(a), text: `${id} arrival ${action}${note ? `: ${note}` : ''}`, data: { action, note: note || undefined } });
    print(`${id} arrival ${action}`);
  },

  /** Records a watch pass that did not go through `arrivals --sync`. */
  'watch-pass': function (a) {
    const slug = slugOf(a);
    recordPass(slug, rest(a, 0) || undefined);
    print(`watch pass recorded on ${slug}`);
  },

  status(a) {
    const slug = slugOf(a);
    const s = buildState(slug);
    const lanes = new Map<string, string[]>();
    for (const t of s.tickets.filter(x => x.inScope)) { lanes.set(t.lane, [...(lanes.get(t.lane) ?? []), `${t.id}  ${t.title}${t.atRisk ? '  [shipped at risk]' : ''}`]); }
    print(`${s.sprint.name}: ${s.tickets.filter(t => t.inScope).length} tickets in scope`);
    for (const [lane, list] of lanes) {
      print();
      print(`${lane} (${list.length})`);
      for (const line of list) { print(`  ${line}`); }
    }
    for (const w of s.warnings) {
      print();
      print(`! ${w}`);
    }
    const wl = watchLiveness(s.watch?.lastPassAt, new Date());
    if (wl.lastPassAt) {
      const label = { 'ok': '', 'stale': `  STALE: none in the last ${WATCH_STALE_MIN} min of working hours`, 'off-hours': '  (outside working hours)', 'never': '' }[wl.state];
      print();
      print(`Last watch pass ${localHhmm(wl.lastPassAt)} (${wl.ageMin} min ago, ${s.watch?.passes ?? 0} pass(es))${label}`);
    }
    else {
      print();
      print('No watch pass recorded on this board');
    }
    if (!s.sprint.closedAt) {
      for (const w of watchersDown(watcherViews(slug), new Date())) { print(`! ${w.name} not running (pid ${w.pid}, ${w.exitedAt ? `exited cleanly ${localHhmm(w.exitedAt)}` : 'no clean exit'})`); }
    }
  },

  watcher(a) {
    const slug = slugOf(a);
    const action = oneOf(['register', 'clear', 'list'] as const, need(a._[0], 'action (register|clear|list)'), 'action');
    const { closedAt } = readSprint(slug);
    if (action === 'list') {
      const all = watcherViews(slug);
      for (const w of all) { print(`${w.name}  pid ${w.pid}  ${w.alive ? 'running' : 'NOT running'}${w.exitedAt ? `  (exited ${localHhmm(w.exitedAt)})` : ''}`); }
      print(`${all.length} watcher(s) registered on ${slug}`);
      return;
    }
    const name = checkWatcherName(need(a._[1], 'watcher name'));
    if (action === 'clear') {
      print(clearWatcher(slug, name) ? `watcher ${name} cleared on ${slug}` : `no watcher named ${name} on ${slug}`);
      return;
    }
    if (closedAt) { throw new Error(`${slug} is closed (${closedAt}); the board checks watchers on an open board only`); }
    const match = flag(a, 'match');
    if (match === '') { throw new Error('--match needs a text; write --match=<text> when the text starts with "--"'); }
    registerWatcher(slug, { name, pid: Number(need(flag(a, 'pid'), '--pid <n>')), match });
    print(`watcher ${name} registered on ${slug}`);
  },

  async serve(a) {
    const { serve } = await import('./server.ts');
    await serve({ port: Number(flag(a, 'port') ?? 4477), open: flag(a, 'open') === 'true', syncMinutes: Number(flag(a, 'sync-every') ?? 0), discover: flag(a, 'discover') === 'true', mergeEvery: Number(flag(a, 'merge-every') ?? 90) });
  },

  /** The conductor's zero-token watch trigger: exits (= wakes the conductor) only on a change. */
  async sentinel(a) {
    const { runSentinel } = await import('./sentinel-run.ts');
    await runSentinel(slugOf(a), {
      every: flag(a, 'every'),
      hours: flag(a, 'hours'),
      days: flag(a, 'days'),
      stopAt: flag(a, 'stop-at'),
      recheckEvery: flag(a, 'recheck-every'),
      staleAfter: flag(a, 'stale-after'),
      port: flag(a, 'port'),
      baseline: flag(a, 'baseline'),
      once: flag(a, 'once') === 'true',
      dryRun: flag(a, 'dry-run') === 'true',
      argv: process.argv.slice(3),
    });
  },

  async snapshot(a) {
    const { snapshot, SNAPSHOT_MODES } = await import('./snapshot.ts');
    const mode = oneOf(SNAPSHOT_MODES, flag(a, 'mode') ?? 'full', '--mode');
    const out = await snapshot(slugOf(a), { mode, out: flag(a, 'out'), embedEvidence: flag(a, 'embed-evidence') === 'true', fragment: flag(a, 'fragment') === 'true', stpUrl: flag(a, 'stp-url'), stpHosts: stpHosts() });
    print(`snapshot written: ${out}`);
  },

  async archive(a) {
    const { snapshot } = await import('./snapshot.ts');
    const slug = slugOf(a);
    const s = readSprint(slug);
    // Snapshot BEFORE recording the close: a closed board no longer reads the
    // workers' evidence and Live Progress, and the archive must keep both.
    const closingAt = s.closedAt ? undefined : new Date().toISOString();
    const out = await snapshot(slug, { mode: 'full', archive: true, embedEvidence: true, closingAt });
    if (closingAt) { s.closedAt = closingAt; writeSprint(s); }
    print(`archived ${slug} -> ${out}`);
    print(`The live folder stays at ${sprintDir(slug)}; nothing was deleted.`);
  },

  sprints() {
    let cur = '';
    try { cur = currentSlug(); }
    catch { /* none yet */ }
    for (const s of listSprints()) { print(`${s === cur ? '*' : ' '} ${s}`); }
    print();
    print(`Data: ${BOARD_DIR}`);
  },

  help() {
    const readme = readFileSync(resolve(import.meta.dir, 'README.md'), 'utf8');
    console.log(readme.split('## Commands')[1]?.split('\n## ')[0]?.trim() ?? 'See cli/sprint-board/README.md');
  },
};

const args = parse(process.argv.slice(2));
const cmd = args._.shift() ?? 'help';
const run = commands[cmd];
if (!run) {
  console.error(printable(`unknown command "${cmd}". Commands: ${Object.keys(commands).join(', ')}`));
  process.exit(2);
}
try {
  const refused = authorRefusal(args);
  if (refused) { throw new Error(refused); }
  await run(args);
}
catch (err) {
  console.error(printable(`sprint-board ${cmd}: ${(err as Error).message}`));
  process.exit(1);
}
