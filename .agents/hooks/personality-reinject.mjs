/**
 * @fileoverview ONE prompt-time emitter for the three harnesses.
 *
 * Claude Code and Codex run this file as a `UserPromptSubmit` command hook and
 * read its stdout; OpenCode imports the same exports from its plugin adapter
 * (`.opencode/plugins/personality-reinject.js`). The emitter carries three
 * payloads, in this order:
 *
 *   1. `PERSONALITY_CONTRACT` — the AGENTS.md §2 output contract, re-injected
 *      every turn so PM Voice and Butler do not dilute in a long session.
 *   2. The `AGENT IDENTITY:` line — worktree, session label, harness. It is
 *      forensic metadata: `git-flow-master` copies it into the `Worktree:` /
 *      `Session:` commit trailers, which are NOT attribution.
 *   3. The `ORCA:` line — emitted only when an `orca` binary is on PATH, so a
 *      machine without Orca never hears about it (silence rule).
 *
 * Verified sources only. Claude Code: the hook input carries `session_id`,
 * `prompt` and an optional `session_title`, and the JSON output supports
 * `hookSpecificOutput.additionalContext` plus `hookSpecificOutput.sessionTitle`
 * (code.claude.com/docs/en/hooks). Codex: `UserPromptSubmitCommandInput` is
 * piped on stdin with `session_id` / `turn_id` / `cwd` / `model` /
 * `permission_mode` / `prompt`, and its output wire accepts the same
 * `hookSpecificOutput.additionalContext` (no `sessionTitle`) — so Codex gets
 * JSON too, without the title field. OpenCode exposes no session id to a
 * command hook, so its adapter passes what the plugin API hands it.
 *
 * Node built-ins only, no dependency, no network, no `orca` invocation: the
 * hook must finish well inside its 5 s budget on every prompt.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PERSONALITY_CONTRACT = [
  'OUTPUT CONTRACT (AGENTS.md §2 plus the active user-level AGENTS.md output style):',
  'PM Voice headline = value, never a punch phrase.',
  'Render markdown: headings when 2+ sections, one bold anchor per block, `backticks` for paths/commands/identifiers, tables for comparisons, blank lines between blocks.',
  'Butler bullets as `topic: fragment`.',
  'No em dash. Vary sentence length. No closing recap.',
].join(' ');

/** Prefix of the forensic identity line. Consumed by `git-flow-master`. */
export const IDENTITY_PREFIX = 'AGENT IDENTITY:';

/** Second line, emitted only when the `orca` binary is present. */
export const ORCA_CONTEXT_LINE = [
  'ORCA: available.',
  'Multi-session orchestration -> /orca-orchestration.',
  'Dispatched worker: follow your preamble;',
  'channel = orca orchestration, never SendMessage/AskUserQuestion.',
].join(' ');

/**
 * A workflow skill plus an issue key in the first prompt names the session.
 * Matches unanchored, so it also accepts the native-path fleet-worker shape
 * (`/sprint-testing BK-123 fleet worker: …`): the workflow name and the key
 * still appear adjacent, only trailed by more prompt text.
 */
export const WORKFLOW_PROMPT_PATTERN
  = /(sprint-testing|test-automation|shift-left-testing|regression-testing|framework-development)\s+([A-Z][A-Z0-9]+-\d+)/;

const EXPLICIT_NAME_PATTERN = /--name[\s=]+(?:"([^"\n]{1,60})"|([^\s"]{1,60}))/;

/** Codex session index: skip a pathological file rather than stall the prompt. */
const SESSION_INDEX_LIMIT = 2 * 1024 * 1024;

function readJson(path) {
  try {
    if (!existsSync(path)) { return null; }
    return JSON.parse(readFileSync(path, 'utf8'));
  }
  catch {
    return null;
  }
}

function text(value) {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

/**
 * The hook payload both Claude Code and Codex pipe on stdin. A TTY means a
 * human ran the file by hand: never block waiting for input.
 */
export function readHookInput(descriptor = 0) {
  try {
    if (process.stdin.isTTY) { return {}; }
    const raw = readFileSync(descriptor, 'utf8').trim();
    if (raw.length === 0) { return {}; }
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  }
  catch {
    return {};
  }
}

/**
 * `turn_id` is a Codex extension of the shared payload, so it identifies the
 * host before any environment variable does — Codex scrubs the hook
 * environment down to a session snapshot. Claude Code, in contrast, always
 * exports `CLAUDE_PROJECT_DIR` to its hooks.
 */
export function detectHarness({ env = process.env, hookInput = {} } = {}) {
  if (text(hookInput.turn_id)) { return 'codex'; }
  if (text(env.CLAUDE_PROJECT_DIR) || text(env.CLAUDE_CODE_SESSION_ID) || text(env.CLAUDE_PID)) {
    return 'claude-code';
  }
  if (text(env.CODEX_HOME)) { return 'codex'; }
  if (text(env.OPENCODE_TERMINAL)) { return 'opencode'; }
  return 'unknown';
}

/**
 * `ORCA_WORKTREE_ID` is `<repoId>::<absolute path>`; the worktree name is the
 * last path segment. Orca sets this variable for the PRIMARY checkout too, so
 * its mere presence never distinguishes primary from a linked worktree: a
 * linked worktree's `.git` is a FILE (`gitdir: <path>`), the primary
 * checkout's `.git` is a DIRECTORY, and that check is what actually decides
 * `primary` here. No Orca variable at all also means the primary checkout.
 *
 * The `env` parameter is typed as a plain string map rather than
 * `NodeJS.ProcessEnv` on purpose: a host that augments `ProcessEnv` with
 * required keys (Next.js adds `NODE_ENV`) would otherwise reject every
 * literal a caller passes, and `cli/updater-host-types.test.ts` guards
 * exactly that.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [cwd]
 */
export function resolveWorktree(env = process.env, cwd = process.cwd()) {
  const raw = text(env.ORCA_WORKTREE_ID);
  if (!raw) { return 'primary'; }
  try {
    if (statSync(join(cwd, '.git')).isDirectory()) { return 'primary'; }
  }
  catch {
    // No readable `.git` at cwd: fall through to the ORCA_WORKTREE_ID name.
  }
  const separator = raw.indexOf('::');
  const path = separator === -1 ? raw : raw.slice(separator + 2);
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : 'primary';
}

/** `~/.claude/sessions/<CLAUDE_PID>.json` → `{ sessionId, name, nameSource }`. */
function claudeSessionRecord(env, home) {
  const pid = text(env.CLAUDE_PID);
  if (!pid) { return null; }
  return readJson(join(home, '.claude', 'sessions', `${pid}.json`));
}

/** `$CODEX_HOME/session_index.jsonl` → the newest `thread_name` for this id. */
function codexThreadName(sessionId, env, home) {
  if (!sessionId) { return ''; }
  const path = join(text(env.CODEX_HOME) || join(home, '.codex'), 'session_index.jsonl');
  try {
    if (!existsSync(path) || statSync(path).size > SESSION_INDEX_LIMIT) { return ''; }
    const lines = readFileSync(path, 'utf8').split('\n');
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index].trim();
      if (line.length === 0 || !line.includes(sessionId)) { continue; }
      try {
        const entry = JSON.parse(line);
        if (entry.id === sessionId && text(entry.thread_name)) { return entry.thread_name; }
      }
      catch {
        continue;
      }
    }
  }
  catch {
    return '';
  }
  return '';
}

/**
 * User-set name → the name verbatim. Derived (or a name whose origin we cannot
 * establish) → `<name> (<id8>)`, so two auto-named sessions stay distinct. Only
 * an id → the full id. Nothing → `unknown`.
 */
export function sessionLabel({ sessionName = '', nameSource = 'none', sessionId = '' } = {}) {
  if (sessionName && nameSource === 'user') { return sessionName; }
  if (sessionName && sessionId) { return `${sessionName} (${sessionId.slice(0, 8)})`; }
  if (sessionName) { return sessionName; }
  if (sessionId) { return sessionId; }
  return 'unknown';
}

/**
 * One resolution per prompt: harness, session id, session name and its origin,
 * the label the commit trailers use, and the worktree.
 *
 * `nameSource` is `user` | `derived` | `unknown` | `none`. `unknown` means a
 * name exists but nothing tells us who set it (Claude Code's `session_title`
 * hook field, Codex's `thread_name`), which is exactly the case where the hook
 * must NOT overwrite the title.
 */
export function resolveAgentIdentity(options = {}) {
  const { env = process.env, hookInput = {}, home = homedir() } = options;
  const harness = text(options.harness) || detectHarness({ env, hookInput });
  let sessionId = text(options.sessionId) || text(hookInput.session_id) || text(hookInput.sessionID);
  let sessionName = '';
  let nameSource = 'none';

  if (harness === 'claude-code') {
    sessionId = sessionId || text(env.CLAUDE_CODE_SESSION_ID);
    const record = claudeSessionRecord(env, home);
    if (record) {
      sessionId = sessionId || text(record.sessionId);
      if (text(record.name)) {
        sessionName = record.name;
        nameSource = record.nameSource === 'user' ? 'user' : 'derived';
      }
    }
    if (!sessionName && text(hookInput.session_title)) {
      sessionName = hookInput.session_title;
      nameSource = 'unknown';
    }
  }
  else if (harness === 'codex') {
    const threadName = codexThreadName(sessionId, env, home);
    if (threadName) {
      sessionName = threadName;
      nameSource = 'unknown';
    }
  }

  return {
    harness,
    sessionId,
    sessionName,
    nameSource,
    label: sessionLabel({ sessionName, nameSource, sessionId }),
    worktree: resolveWorktree(env),
  };
}

/**
 * `command -v orca` without spawning a process: scan PATH. An `orca` shell
 * alias is invisible this way, which is the safe direction — the skill's own
 * gate re-checks the binary and the runtime.
 *
 * Platform rule (from the vendor `orca-cli` guide): inside an Orca-managed
 * terminal `orca` always resolves to the Orca CLI, and Orca exports
 * `ORCA_APP_VERSION` / `ORCA_TERMINAL_HANDLE` there, so those variables are
 * the first signal. Outside an Orca terminal on Linux the CLI registers as
 * `orca-ide`, because bare `/usr/bin/orca` is the GNOME Orca screen reader;
 * probing `orca` on Linux would therefore be wrong in both directions, so the
 * Linux probe name is `orca-ide`. macOS and Windows probe `orca`.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function orcaAvailable(env = process.env) {
  if (text(env.ORCA_APP_VERSION) || text(env.ORCA_TERMINAL_HANDLE)) { return true; }
  const path = text(env.PATH) || text(env.Path);
  if (!path) { return false; }
  const names = [process.platform === 'linux' ? 'orca-ide' : 'orca'];
  if (process.platform === 'win32') {
    const extensions = (text(env.PATHEXT) || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
    for (const extension of extensions) {
      names.push(`orca${extension.toLowerCase()}`);
    }
  }
  for (const directory of path.split(delimiter)) {
    if (!directory) { continue; }
    for (const name of names) {
      try {
        if (existsSync(join(directory, name))) { return true; }
      }
      catch {
        continue;
      }
    }
  }
  return false;
}

export function identityLine(identity) {
  return `${IDENTITY_PREFIX} worktree=${identity.worktree} session=${identity.label} harness=${identity.harness}`;
}

/** The lines every harness injects, in order. OpenCode pushes them as-is. */
export function agentContextLines(options = {}) {
  const { env = process.env } = options;
  const identity = options.identity ?? resolveAgentIdentity(options);
  const orca = options.orca ?? orcaAvailable(env);
  const lines = [PERSONALITY_CONTRACT, identityLine(identity)];
  if (orca) { lines.push(ORCA_CONTEXT_LINE); }
  return lines;
}

/** A title is a single line: control characters collapse into spaces. */
function sanitizeTitle(value) {
  const printable = [...value]
    .map(character => (character.codePointAt(0) < 0x20 || character.codePointAt(0) === 0x7F ? ' ' : character))
    .join('');
  return printable.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * A title only when no human named the session: `nameSource` `user` (a `/rename`
 * or `--name`) and `unknown` (a name of unverifiable origin) are both left
 * alone. An explicit `--name <value>` wins first, then the workflow +
 * issue-key shape, which yields `<KEY>-<workflow>`.
 */
export function proposeSessionTitle({ prompt = '', identity = {} } = {}) {
  if (identity.nameSource === 'user' || identity.nameSource === 'unknown') { return ''; }
  const explicit = EXPLICIT_NAME_PATTERN.exec(prompt);
  if (explicit) { return sanitizeTitle(explicit[1] ?? explicit[2] ?? ''); }
  const workflow = WORKFLOW_PROMPT_PATTERN.exec(prompt);
  return workflow ? sanitizeTitle(`${workflow[2]}-${workflow[1]}`) : '';
}

/**
 * Claude Code and Codex both read `hookSpecificOutput.additionalContext` from
 * stdout JSON; only Claude Code documents `sessionTitle`, so only Claude Code
 * receives it. Any other caller gets the plain lines.
 */
export function renderHookOutput(options = {}) {
  const { env = process.env, hookInput = {}, home = homedir() } = options;
  const identity = resolveAgentIdentity({ env, hookInput, home });
  const context = agentContextLines({ env, hookInput, home, identity }).join('\n');
  if (identity.harness !== 'claude-code' && identity.harness !== 'codex') {
    return context;
  }
  const event = text(hookInput.hook_event_name) || 'UserPromptSubmit';
  const hookSpecificOutput = { hookEventName: event, additionalContext: context };
  if (identity.harness === 'claude-code' && event === 'UserPromptSubmit') {
    const title = proposeSessionTitle({ prompt: text(hookInput.prompt), identity });
    if (title) { hookSpecificOutput.sessionTitle = title; }
  }
  return `${JSON.stringify({ hookSpecificOutput })}\n`;
}

export function emitHookOutput(stream = process.stdout, options = {}) {
  const hookInput = options.hookInput ?? readHookInput();
  stream.write(renderHookOutput({ ...options, hookInput }));
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  emitHookOutput();
}
