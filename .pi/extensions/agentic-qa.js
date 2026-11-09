import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

import { agentContextLines, pendingRouteReminder, proposeSessionTitle, rearmRoutes, resolveWorktree, sessionLabel } from '../../.agents/hooks/personality-reinject.mjs';

// Pi adapter: one thin extension over the shared emitter, same lines the other
// harnesses get (`AGENT IDENTITY:`, `ORCA:`, setup warnings, `ROUTE:`).
//
// - `input` carries the raw prompt. `before_agent_start` sees `/skill:<name>`
//   already expanded, and classifying that would route on the whole skill body.
// - Only a run a user message started gets the lines. A custom message
//   (`pi-subagents` results, `pi-loop` ticks) is not a prompt.
// - `session_compact` re-arms the routes; `/new` starts a new session id.
// - `tool_result` carries `ROUTE-PENDING:`, mapped to the names the emitter reads.
// - The name is set through `pi.setSessionName`. A name this adapter did not
//   set is a human's (`/name`, `--name`) and stays.
// - Plain JS and no Pi import, so `types:check` needs no Pi SDK. No `question`
//   tool: a second registration stops Pi from starting when a package has one.
//
// The block below is a SEATBELT over Critical Rule #1, not a boundary: Pi has
// no deny config and no approvals. It stops the direct reads, the commands
// Claude Code's deny list names, and `grep` output from secret files. `cat .env`
// and other shell variants pass, `pi-subagents` background children are
// untested, and it exists only where this adapter loads: an untrusted session,
// or a print or RPC session under `ask`, has no block at all.

/** Pi's own path handling before the checks: `@` stripped, a `file://` URL decoded. Null when it cannot be decoded. */
function fsPath(path) {
  const raw = String(path ?? '').replace(/\\/g, '/').replace(/^@/, '');
  if (!/^file:\/\//.test(raw)) { return raw; }
  try { return fileURLToPath(raw); }
  catch { return null; }
}

/** `.env`, `.env.local`, `.env.<x>`: what Rule #1 forbids, minus the committed files. */
function isSecretPath(path) {
  // Pi resolves paths and a Mac disk folds case, so `.env/.` and `.ENV` open the same file.
  const resolved = fsPath(path);
  if (resolved === null) { return true; }
  const normalized = posix.normalize(resolved).toLowerCase();
  const segments = normalized.split('/').filter(segment => segment !== '' && segment !== '.');
  const name = segments.at(-1) ?? '';
  if (segments.includes('.auth')) { return true; }
  if (name === 'settings.local.json' && segments.at(-2) === '.claude') { return true; }
  if (name !== '.env' && !name.startsWith('.env.')) { return false; }
  return name !== '.env.example' && !name.endsWith('.schema');
}

/** A `grep` glob that names a secret file. A wildcard that merely reaches one is `withholdSecretLines`' job. */
function globNamesSecret(glob) {
  const value = String(glob).toLowerCase();
  return /(?:^|\/)\.auth(?:\/|$)|settings\.local|\.env/.test(value) && !/\.env\.example$|\.schema$/.test(value);
}

const SECRET_COMMAND = /^(?:(?:bunx\s+)?varlock\s+(?:printenv|reveal)\b|printenv\b|env(?:\s+-0)*\s*(?:\d*[<>].*)?$)/;

/** One shell line's simple commands: quoted text blanked, leading `NAME=value` assignments dropped. */
function simpleCommands(command) {
  return command
    .replace(/'[^']*'|"[^"]*"/g, '\'\'')
    .split(/&&|\|\||[;|&\n]/)
    .map(part => part.trim().replace(/^(?:\w+=\S*\s+)+/, ''));
}

const isText = value => typeof value === 'string';
const isOptionalText = value => value === undefined || value === null || isText(value);

/** Why this call is refused, or '' when it passes. Pure: a throwing `tool_call` handler blocks the tool. */
export function secretBlockReason(toolName, input) {
  const malformed = (toolName === 'read' && !isText(input?.path))
    || (toolName === 'bash' && !isText(input?.command))
    || (toolName === 'grep' && !(isOptionalText(input?.path) && isOptionalText(input?.glob)));
  if (malformed) { return `Refused: a ${toolName} call with a malformed path, glob or command cannot be checked against Critical Rule #1.`; }

  const readsSecret = (toolName === 'read' || toolName === 'grep') && isSecretPath(input?.path);
  const globsSecret = toolName === 'grep' && Boolean(input?.glob) && globNamesSecret(input.glob);
  const printsSecret = toolName === 'bash' && simpleCommands(input.command).some(part => SECRET_COMMAND.test(part));
  return readsSecret || globsSecret || printsSecret
    ? 'Refused (Critical Rule #1): secrets are used by name, never opened or printed. Presence check: bunx varlock load --agent.'
    : '';
}

/**
 * `grep` passes one `--glob` to ripgrep, which overrides `.gitignore`, so `*`
 * reaches `.env`, and `--no-config` leaves no way to force an exclusion. The
 * output is filtered instead: Pi prints `<path>:<line>: <text>` and, for context,
 * `<path>-<line>- <text>`, each path relative to the search directory. A line is
 * checked under both shapes, because a line of text can look like the other one.
 */
function isSecretOutputLine(line, searchPath) {
  const base = isText(searchPath) ? fsPath(searchPath) ?? '' : '';
  const match = /^(.+?):\d+: /.exec(line)?.[1];
  const context = /^(.+?)-\d+- /.exec(line)?.[1];
  return [match, context].some(path => path !== undefined && isSecretPath(posix.join(base, path)));
}

/** The same `grep` result without lines from secret files, or null when it has none. */
export function withholdSecretLines(content, searchPath) {
  let withheld = 0;
  const filtered = content.map((part) => {
    if (part?.type !== 'text' || !isText(part.text)) { return part; }
    const lines = part.text.split('\n');
    const kept = lines.filter(line => !isSecretOutputLine(line, searchPath));
    withheld += lines.length - kept.length;
    return { ...part, text: kept.join('\n') };
  });
  if (withheld === 0) { return null; }
  return [...filtered, { type: 'text', text: `[${withheld} line(s) from secret files withheld (Critical Rule #1).]` }];
}

/** A long `grep` keeps its whole retained text in `details.truncation.content`, which reaches the session file. */
function withoutRetainedText(details) {
  return details?.truncation ? { ...details, truncation: { ...details.truncation, content: '' } } : details;
}

/** Pi's tool names and arguments, as the emitter's `sectionsReadBy` reads them. */
function emitterToolCall(toolName, input) {
  if (toolName === 'read') { return { toolName: 'Read', toolInput: { file_path: input?.path } }; }
  if (toolName === 'bash') { return { toolName: 'Bash', toolInput: { command: input?.command } }; }
  return { toolName, toolInput: input };
}

export default function agenticQa(pi) {
  let rawPrompt = null;
  let ownName = '';

  pi.on('input', (event) => {
    rawPrompt = event.text;
  });

  pi.on('session_compact', (_event, ctx) => {
    rearmRoutes({ sessionId: ctx.sessionManager.getSessionId(), repoRoot: ctx.cwd });
  });

  pi.on('before_agent_start', (event, ctx) => {
    if (event.messageType !== 'user') { return undefined; }
    const prompt = rawPrompt ?? event.prompt ?? '';
    rawPrompt = null;

    const sessionId = ctx.sessionManager.getSessionId();
    const current = pi.getSessionName() ?? '';
    const currentSource = !current ? 'none' : current === ownName ? 'hook' : 'user';
    const title = proposeSessionTitle({
      prompt,
      identity: { sessionName: current, nameSource: currentSource },
      handle: process.env.ORCA_TERMINAL_HANDLE ?? '',
    });
    if (title) {
      pi.setSessionName(title);
      ownName = title;
    }
    const sessionName = title || current;
    const nameSource = title ? 'hook' : currentSource;
    const identity = {
      harness: 'pi',
      sessionId,
      sessionName,
      nameSource,
      label: sessionLabel({ sessionName, nameSource, sessionId }),
      worktree: resolveWorktree(process.env, ctx.cwd),
    };

    const lines = agentContextLines({ harness: 'pi', sessionId, repoRoot: ctx.cwd, prompt, identity });
    return { message: { customType: 'agentic-qa.context', content: lines.join('\n'), display: false } };
  });

  pi.on('tool_call', (event) => {
    const reason = secretBlockReason(event.toolName, event.input);
    return reason ? { block: true, reason } : undefined;
  });

  pi.on('tool_result', (event, ctx) => {
    // Before the nested-call return: a codemode script's `grep` reaches the model too.
    const withheld = event.toolName === 'grep' ? withholdSecretLines(event.content, event.input?.path) : null;
    const content = withheld ?? event.content;
    const changed = withheld ? { content, structuredContent: event.structuredContent, details: withoutRetainedText(event.details) } : undefined;
    if (event.parentToolCallId) { return changed; }
    const reminder = pendingRouteReminder({
      sessionId: ctx.sessionManager.getSessionId(),
      repoRoot: ctx.cwd,
      ...emitterToolCall(event.toolName, event.input),
    });
    if (!reminder) { return changed; }
    return { ...changed, content: [...content, { type: 'text', text: reminder }], structuredContent: event.structuredContent };
  });
}
