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
// no deny config and no approvals. It stops the direct reads and the commands
// Claude Code's deny list names. `cat .env` and other shell variants pass, and
// `pi-subagents` background children are untested.

/** `.env`, `.env.local`, `.env.<x>`: what Rule #1 forbids, minus the committed files. */
function isSecretPath(path) {
  const normalized = String(path ?? '').replace(/\\/g, '/').replace(/^@/, '');
  const segments = normalized.split('/').filter(Boolean);
  const name = segments.at(-1) ?? '';
  if (segments.includes('.auth')) { return true; }
  if (normalized === '.claude/settings.local.json' || normalized.endsWith('/.claude/settings.local.json')) { return true; }
  if (name !== '.env' && !name.startsWith('.env.')) { return false; }
  return name !== '.env.example' && !name.endsWith('.schema');
}

const SECRET_COMMAND = /^(?:(?:bunx\s+)?varlock\s+(?:printenv|reveal)\b|printenv\b|env\s*$)/;

/** One shell line's simple commands, without leading `NAME=value` assignments. */
function simpleCommands(command) {
  return String(command ?? '')
    .split(/&&|\|\||[;|\n]/)
    .map(part => part.trim().replace(/^(?:\w+=\S*\s+)+/, ''));
}

/** Why this call is refused, or '' when it passes. Pure: a throwing `tool_call` handler blocks the tool. */
export function secretBlockReason(toolName, input) {
  const readsSecret = (toolName === 'read' || toolName === 'grep') && isSecretPath(input?.path);
  const printsSecret = toolName === 'bash' && simpleCommands(input?.command).some(part => SECRET_COMMAND.test(part));
  return readsSecret || printsSecret
    ? 'Refused (Critical Rule #1): secrets are used by name, never opened or printed. Presence check: bunx varlock load --agent.'
    : '';
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
    if (event.parentToolCallId) { return undefined; }
    const reminder = pendingRouteReminder({
      sessionId: ctx.sessionManager.getSessionId(),
      repoRoot: ctx.cwd,
      ...emitterToolCall(event.toolName, event.input),
    });
    if (!reminder) { return undefined; }
    return { content: [...event.content, { type: 'text', text: reminder }], structuredContent: event.structuredContent };
  });
}
