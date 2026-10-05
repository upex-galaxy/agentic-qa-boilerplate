/**
 * @fileoverview Recall audit of the instruction router, from local transcripts.
 *
 * The router eval (`scripts/lib/router-eval.ts`) proves the hook NAMES the
 * right section. It cannot prove the agent then READ it. This module measures
 * that half: for every `ROUTE: read .agents/instructions/<file>` line the hook
 * injected in a Claude Code session, did the agent read the file before the
 * next user prompt?
 *
 * Transcript shape (Claude Code JSONL, one file per session under
 * `<config dir>/projects/<slug>/`):
 *   - a user prompt is an entry `type: user` whose content is a string, or a
 *     list holding a `text` item and no `tool_result`; `isMeta` entries are
 *     harness-injected and do not open a turn;
 *   - the hook's text arrives as `type: attachment` with
 *     `attachment.type: hook_additional_context`, content a list of strings;
 *   - a read is an assistant `tool_use` named `Read` (`input.file_path`), or
 *     `Bash` whose `input.command` names the file with a read verb.
 * A file read earlier in the same context (before the route, after the last
 * compaction) counts as satisfied: the LOAD PROTOCOL forbids re-reading it.
 * A `ROUTE-PENDING:` line (the Claude Code `PostToolUse` re-surface, ADR-0017)
 * arrives the same way; it is counted, and so is every routed file read after
 * one in the same turn, which is what the reminder bought. `ROUTE-OPTIONAL:`
 * lines bind nothing and are counted apart, never as routes.
 * Routes in the last turn are `open` and kept out of the ratio while the
 * session may still be running; the caller closes that turn (`closeAtEnd`)
 * once the transcript has gone quiet, because a dispatched worker's whole
 * session is one turn that no later prompt ever closes. Import routes (`package.json`, `.agents/project.yaml`) are counted
 * apart: Claude Code expands those `@` imports at launch.
 *
 * Transcripts can hold secrets. This module keeps no text from them: it
 * returns counts keyed by section path, nothing else.
 */

export const SECTIONS_PREFIX = '.agents/instructions/';
const ROUTE_LINE = /^ROUTE: read (\S+)/;
const PENDING_LINE = /^ROUTE-PENDING:/;
const OPTIONAL_LINE = /^ROUTE-OPTIONAL:/;
const SECTION_IN_TEXT = /(?:\.agents\/instructions\/)?\b(agent-[\w-]+\.md)\b/g;
const READ_VERB = /\b(?:cat|head|tail|sed|less|more|bat|awk|nl|grep|rg|diff|show)\b/;

export interface SectionTally {
  routed: number
  /** Read after the route, before the next user prompt. */
  readInTurn: number
  /** Already read in this context before the route arrived. */
  readBefore: number
  missed: number
  /** Route in the last turn of a transcript that may still be running. */
  open: number
}

export interface AuditResult {
  transcripts: number
  /** Transcripts that carried at least one section route. */
  routedSessions: number
  importRoutes: number
  /** `ROUTE-OPTIONAL:` lines: offered, binding nothing. */
  optionalLines: number
  /** `ROUTE-PENDING:` reminders the re-surface hook injected. */
  reminders: number
  /** Routed files read in turn after a reminder named them. */
  readAfterReminder: number
  sections: Map<string, SectionTally>
}

export function emptyAudit(): AuditResult {
  return { transcripts: 0, routedSessions: 0, importRoutes: 0, optionalLines: 0, reminders: 0, readAfterReminder: 0, sections: new Map() };
}

function tally(result: AuditResult, path: string): SectionTally {
  let entry = result.sections.get(path);
  if (!entry) {
    entry = { routed: 0, readInTurn: 0, readBefore: 0, missed: 0, open: 0 };
    result.sections.set(path, entry);
  }
  return entry;
}

interface Entry {
  type?: string
  isMeta?: boolean
  isCompactSummary?: boolean
  isSidechain?: boolean
  subtype?: string
  message?: { content?: unknown }
  attachment?: { type?: string, content?: unknown }
}

function isUserPrompt(entry: Entry): boolean {
  if (entry.type !== 'user' || entry.isMeta || entry.isCompactSummary || entry.isSidechain) { return false; }
  const content = entry.message?.content;
  if (typeof content === 'string') { return true; }
  if (!Array.isArray(content)) { return false; }
  const types = content.map(item => (item as { type?: string })?.type);
  return types.includes('text') && !types.includes('tool_result');
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') { return [value]; }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/** Section paths a tool call reads (Read by path, Bash by a read verb plus the file name). */
function sectionsRead(item: { name?: string, input?: Record<string, unknown> }): string[] {
  const text = item.name === 'Read'
    ? String(item.input?.file_path ?? '')
    : item.name === 'Bash' && READ_VERB.test(String(item.input?.command ?? ''))
      ? String(item.input?.command ?? '')
      : '';
  return [...text.matchAll(SECTION_IN_TEXT)].map(m => `${SECTIONS_PREFIX}${m[1]}`);
}

/**
 * Fold one transcript (its JSONL lines) into `result`. Unparseable lines are
 * skipped. `closeAtEnd` counts routes still pending at the end as missed
 * (the session is over) instead of open.
 */
export function auditTranscript(lines: Iterable<string>, result: AuditResult, closeAtEnd = false): void {
  result.transcripts += 1;
  const inContext = new Set<string>();
  const pending = new Set<string>();
  let reminded = false;
  let routedHere = false;
  for (const line of lines) {
    if (!line.includes('"type"')) { continue; }
    let entry: Entry;
    try { entry = JSON.parse(line) as Entry; }
    catch { continue; }
    if (isUserPrompt(entry)) {
      for (const path of pending) { tally(result, path).missed += 1; }
      pending.clear();
      reminded = false;
      continue;
    }
    if (entry.isCompactSummary || entry.subtype === 'compact_boundary') {
      inContext.clear();
      continue;
    }
    if (entry.type === 'attachment' && entry.attachment?.type === 'hook_additional_context') {
      for (const route of strings(entry.attachment.content).flatMap(text => text.split('\n'))) {
        if (PENDING_LINE.test(route.trim())) {
          result.reminders += 1;
          reminded = true;
          continue;
        }
        if (OPTIONAL_LINE.test(route.trim())) {
          result.optionalLines += 1;
          continue;
        }
        const m = ROUTE_LINE.exec(route.trim());
        if (!m) { continue; }
        if (!m[1].startsWith(SECTIONS_PREFIX)) {
          result.importRoutes += 1;
          continue;
        }
        routedHere = true;
        const entryTally = tally(result, m[1]);
        entryTally.routed += 1;
        if (inContext.has(m[1])) { entryTally.readBefore += 1; }
        else { pending.add(m[1]); }
      }
      continue;
    }
    if (entry.type === 'assistant' && !entry.isSidechain && Array.isArray(entry.message?.content)) {
      for (const item of entry.message.content as Array<{ type?: string, name?: string, input?: Record<string, unknown> }>) {
        if (item?.type !== 'tool_use') { continue; }
        for (const path of sectionsRead(item)) {
          inContext.add(path);
          if (pending.delete(path)) {
            tally(result, path).readInTurn += 1;
            if (reminded) { result.readAfterReminder += 1; }
          }
        }
      }
    }
  }
  for (const path of pending) {
    if (closeAtEnd) { tally(result, path).missed += 1; }
    else { tally(result, path).open += 1; }
  }
  if (routedHere) { result.routedSessions += 1; }
}

/** Recall over closed turns: (read in turn + already read) / (that + missed). Null when nothing closed. */
export function recallOf(t: Pick<SectionTally, 'readInTurn' | 'readBefore' | 'missed'>): number | null {
  const hits = t.readInTurn + t.readBefore;
  return hits + t.missed === 0 ? null : hits / (hits + t.missed);
}

export function totals(result: AuditResult): SectionTally {
  const sum: SectionTally = { routed: 0, readInTurn: 0, readBefore: 0, missed: 0, open: 0 };
  for (const t of result.sections.values()) {
    sum.routed += t.routed;
    sum.readInTurn += t.readInTurn;
    sum.readBefore += t.readBefore;
    sum.missed += t.missed;
    sum.open += t.open;
  }
  return sum;
}

/** Claude Code's transcript folder name for a checkout path: every non-alphanumeric character becomes `-`. */
export function claudeProjectSlug(absolutePath: string): string {
  return absolutePath.replace(/[^a-z0-9]/gi, '-');
}
