import type { Messenger } from './messenger.ts';
import type { Ask, AskAction, AskState } from './model.ts';
import { NO_MESSENGER, resolveMessenger } from './messenger.ts';
import { ASK_ACTORS, askActionState, askStep, foldAsks, isAskActor, isDraftingState } from './model.ts';
import { appendEvent, isoAt, readEvents, withAskLock } from './store.ts';

export class AskError extends Error {
  constructor(message: string, readonly status: number, readonly current?: { state: AskState, by?: string, at?: string }) { super(message); }
}

export type AskRequest = ({ action: AskAction, state?: never } | { state: AskState, action?: never }) & {
  id: string
  expect?: AskState
  at?: string
  reply?: string
  replyAt?: string
  link?: string
  ref?: string
  error?: string
  guard?: (cur: Ask, to: AskState) => string | null
};

export type AgentAskRequest = AskRequest & { by: string };

export interface AskResult { ok: true, noop: boolean, from: AskState, state: AskState, by?: string, at?: string }

const AGENTS = ASK_ACTORS.filter(a => a !== 'owner').join(', ');
const AT_SKEW_MS = 5 * 60_000;
// Measured as the log encodes them, because the line limit counts those bytes and not characters.
const REPLY_BYTES = 2400;
const ERROR_BYTES = 600;

export function futureRefusal(at: string | undefined): string | null {
  const iso = isoAt(at);
  return iso !== undefined && Date.parse(iso) > Date.now() + AT_SKEW_MS
    ? `--at ${iso} is in the future: give the time the move happened, or leave --at out`
    : null;
}

function clip(value: string | undefined, max: number): string | undefined {
  if (value === undefined) { return undefined; }
  let out = '';
  let size = 0;
  for (const char of value) {
    size += Buffer.byteLength(JSON.stringify(char)) - 2;
    if (size > max) { break; }
    out += char;
  }
  return out;
}

export function agentRefusal(by: string): string | null {
  if (by.trim().toLowerCase() === 'owner') { return `--by owner is refused: only the page writes the owner's moves. Pass --by with one of: ${AGENTS}`; }
  return isAskActor(by) ? null : `--by must be one of: ${AGENTS} (got "${by}")`;
}

const actionRefusal = (action: AskAction | undefined, cur: Ask): string | null => {
  if (action === 'retry' && cur.state !== 'draft-failed' && cur.state !== 'approved') { return `${cur.id} did not fail; nothing to retry`; }
  if (action === 'reopen' && cur.state !== 'closed' && cur.state !== 'sent' && cur.state !== 'answered') { return `${cur.id} is not closed; nothing to reopen`; }
  return null;
};

export async function applyAskTransition(slug: string, req: AgentAskRequest, messenger: Messenger | null = resolveMessenger()): Promise<AskResult> {
  const refused = agentRefusal(req.by);
  if (refused) { throw new AskError(refused, 400); }
  return writeTransition(slug, req, req.by, messenger);
}

// A conductor opens gates on the owner's moves, so the page's route is the only caller allowed.
export async function applyPageTransition(slug: string, req: AskRequest, messenger: Messenger | null = resolveMessenger()): Promise<AskResult> {
  return writeTransition(slug, req, 'owner', messenger);
}

async function writeTransition(slug: string, req: AskRequest, by: string, messenger: Messenger | null): Promise<AskResult> {
  const blank = (['reply', 'link', 'error'] as const).find(k => req[k] !== undefined && !req[k].trim());
  const invalid = blank ? `a blank ${blank} would overwrite the recorded one: give it a value or leave it out` : futureRefusal(req.at);
  if (invalid) { throw new AskError(invalid, 400); }
  const reply = clip(req.reply, REPLY_BYTES);
  const error = clip(req.error, ERROR_BYTES);
  return withAskLock(slug, async (held) => {
    const asks = foldAsks(readEvents(slug).events);
    const cur = asks.find(a => a.id === req.id);
    if (!cur) { throw new AskError(`no ask ${req.id} on the ${slug} board (${asks.length} asks searched)`, 400); }
    const here = { state: cur.state, by: cur.by, at: cur.stateAt };
    const to = req.action ? askActionState(req.action, cur) : req.state;
    const step = askStep(cur, to, reply);
    // Ahead of `expect`: a double click asks for the state the first click reached, which is no conflict.
    if (step.kind === 'noop') { return { ok: true, noop: true, from: cur.state, ...here }; }
    if (req.expect && req.expect !== cur.state) { throw new AskError(`${req.id} is ${cur.state} now, not ${req.expect}`, 409, here); }
    const refused = (isDraftingState(to) && !messenger ? NO_MESSENGER : null) ?? actionRefusal(req.action, cur) ?? req.guard?.(cur, to);
    if (refused) { throw new AskError(refused, 400, here); }
    if (step.kind === 'refuse') { throw new AskError(`${req.id}: ${step.why}`, 409, here); }
    // A time the writer picks never sorts before the current state, so an ask stamped ahead of the clock still moves.
    const after = Date.parse(cur.stateAt ?? '') + 1;
    const at = isoAt(req.at) ?? new Date(after > Date.now() ? after : Date.now()).toISOString();
    if (cur.stateAt && Date.parse(at) < Date.parse(cur.stateAt)) {
      throw new AskError(`${req.id}: ${at} is earlier than its current state (${cur.stateAt}), so the board would ignore it`, 409, here);
    }
    const { replyAt, link, ref, action } = req;
    if (!held()) { throw new AskError(`${req.id}: another writer took asks.lock before this one wrote. Nothing was written, send it again`, 409, here); }
    appendEvent(slug, {
      kind: 'ask.state',
      by,
      at,
      text: `Draft ${req.id} marked ${to}${action ? ` (${action})` : ''}${error ? `: ${error}` : ''}`,
      data: { id: req.id, state: to, action, reply, replyAt, link, ref, error },
    });
    return { ok: true, noop: false, from: cur.state, state: to, by, at };
  });
}

// Only the write that approved the ask answers true, so a double click drafts once.
export const owesDraft = (r: AskResult): boolean => !r.noop && r.state === 'approved';

export async function draftApproved(slug: string, id: string, messenger: Messenger): Promise<AskResult> {
  const ask = foldAsks(readEvents(slug).events).find(a => a.id === id);
  if (!ask) { throw new AskError(`no ask ${id} on the ${slug} board`, 400); }
  const { to, lang, text, tickets, attach } = ask;
  const made = await messenger.createDraft({ id, to, lang, text, tickets, attach })
    .catch((err: Error) => ({ ok: false as const, error: err.message }));
  const outcome = made.ok
    ? { state: 'drafted' as const, link: made.link?.trim() || undefined, ref: made.ref }
    : { state: 'draft-failed' as const, error: made.error.trim() || 'unknown error' };
  return applyAskTransition(slug, { id, by: 'conductor', expect: 'approved', ...outcome }, messenger);
}
