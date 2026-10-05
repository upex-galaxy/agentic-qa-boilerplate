/**
 * @fileoverview ONE prompt-time emitter for the three harnesses.
 *
 * Claude Code and Codex run this file as a `UserPromptSubmit` command hook and
 * read its stdout, and run it again on `SessionStart` to re-arm the routes
 * (see "Re-arm sources" below); OpenCode imports the same exports from its
 * plugin adapter (`.opencode/plugins/personality-reinject.js`): OpenCode 1
 * also routes from `chat.message`, OpenCode 2 is router-only. The emitter
 * carries four payloads, in this order (the AGENTS.md §2 output contract is
 * not one of them: the harness loads it once per session):
 *
 *   1. The `AGENT IDENTITY:` line — worktree, session label, harness. It is
 *      forensic metadata: `git-flow-master` copies it into the `Worktree:` /
 *      `Session:` commit trailers, which are NOT attribution.
 *   2. The `ORCA:` line — emitted only when an `orca` binary is on PATH, so a
 *      machine without Orca never hears about it (silence rule).
 *   3. At most ONE setup warning: `MISSING_ENV_LINE` when the checkout has no
 *      `.env`, else `UNPROVISIONED_WORKTREE_LINE` when it is a linked worktree
 *      that never ran `bun run worktree:provision`.
 *   4. `ROUTE: read <file>` lines: the instruction files the prompt needs and
 *      this session has not been routed to yet, classified with the router of
 *      `AGENTS.md` and each section's frontmatter (see `routeLines`), capped,
 *      plus at most one `ROUTE-OPTIONAL:` line. 0 bytes when nothing new
 *      matches. A re-arm (below) clears them and prints nothing.
 *
 * Claude Code also runs it on `PostToolUse` (`.claude/settings.json`, no
 * matcher): it prints nothing but, at most once per prompt, a `ROUTE-PENDING:`
 * line when a routed section is still unread (see `pendingRouteReminder`).
 * Any other event prints nothing.
 *
 * Re-arm sources, exactly what each host config registers:
 *   - Claude Code, `.claude/settings.json`: `SessionStart` groups with matcher
 *     `compact` and matcher `clear`.
 *   - Codex, `.codex/hooks.json`: the same two `SessionStart` groups (Codex
 *     emits `startup | resume | clear | compact | fork`; only these two drop
 *     the routed files from the context).
 *   - OpenCode 1, `.opencode/plugins/personality-reinject.js`: the
 *     `experimental.session.compacting` event only; OpenCode 2 is router-only
 *     and keeps no state to re-arm.
 *   `bun run agents:compat:check` asserts the two command-host lists
 *   (`REARM_SESSION_START_SOURCES` in `cli/lib/agent-compatibility-contracts.ts`).
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

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Prefix of the forensic identity line. Consumed by `git-flow-master`. */
export const IDENTITY_PREFIX = 'AGENT IDENTITY:';

/** Second line, emitted only when the `orca` binary is present. */
/**
 * Emitted when this checkout has no `.env`. It is the ONE failure this repo
 * cannot detect any other way in time.
 *
 * A harness reads its MCP config and spawns every MCP server BEFORE any hook
 * runs (measured on all three harnesses). So by the time you read this line those servers are
 * already alive, already holding whatever credential they were given, and a
 * missing one shows up much later as an auth error that reads like a broken
 * tool. We cannot fix that session. We CAN stop the human from spending an hour
 * on it, and make the next session correct.
 *
 * Why it fires most often in a worktree: `git worktree add`, a harness-created
 * worktree and `orca worktree create` all copy TRACKED files only, and `.env`
 * is gitignored by design. `bun run worktree:provision <path>` is what carries
 * it across, and nothing runs that automatically.
 */
export const MISSING_ENV_LINE = [
  'CREDENTIALS: no `.env` in this checkout, so every MCP server in this session',
  'started without one. They are already running; this session cannot be repaired.',
  'Fix and restart: in a worktree run `bun run worktree:provision <this path>` from',
  'the main checkout; in a fresh clone run `bun run setup`.',
].join(' ');

/**
 * Emitted in a linked worktree that has no `node_modules/` or no `.husky/_/`.
 *
 * The worktrees Claude Code and the Codex app create copy `.worktreeinclude`
 * and nothing else: no dependencies, no hook shims, no `.claude/skills` alias.
 * `core.hooksPath` is shared with the primary and points at `.husky/_`, so with
 * that directory missing every commit in the worktree skips every gate and
 * succeeds. Nothing else says so.
 */
export const UNPROVISIONED_WORKTREE_LINE = [
  'WORKTREE: this linked worktree is not provisioned (no node_modules/ or .husky/_),',
  'so git hooks do not run here, repo scripts may fail and Claude Code may not see the repo skills.',
  'Run `bun run worktree:provision` in it, then restart the session.',
].join(' ');

export const ORCA_CONTEXT_LINE = [
  'ORCA: available.',
  'Multi-session orchestration -> /orca-orchestration.',
  'Dispatched worker: follow your preamble;',
  'channel = orca orchestration, never SendMessage/AskUserQuestion.',
].join(' ');

/**
 * The fleet-worker token names the session after the roster label:
 * `/<skill> <label> fleet worker` → `<label>`. Any skill slug qualifies (a
 * fleet is not limited to the workflow skills) and the label is whatever the
 * conductor wrote: a ticket key, `<KEY>-<slug>`, or a kebab slug. Unanchored,
 * because on the supervised path the runtime prepends its own preamble to the
 * prompt that carries the token.
 */
export const FLEET_PROMPT_PATTERN
  = /(?:^|\s)\/([a-z][a-z0-9-]*)\s+([A-Za-z0-9][\w.-]{0,59})\s+fleet worker\b/;

/**
 * Outside a fleet, a workflow skill plus an issue key in the first prompt
 * names the session `<KEY>-<workflow>`.
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
 * User-set name, or one this hook set from a prompt token → the name verbatim.
 * Derived (or a name whose origin we cannot establish) → `<name> (<id8>)`, so
 * two auto-named sessions stay distinct. Only an id → the full id. Nothing →
 * `unknown`.
 */
export function sessionLabel({ sessionName = '', nameSource = 'none', sessionId = '' } = {}) {
  if (sessionName && (nameSource === 'user' || nameSource === 'hook')) { return sessionName; }
  if (sessionName && sessionId) { return `${sessionName} (${sessionId.slice(0, 8)})`; }
  if (sessionName) { return sessionName; }
  if (sessionId) { return sessionId; }
  return 'unknown';
}

/**
 * One resolution per prompt: harness, session id, session name and its origin,
 * the label the commit trailers use, and the worktree.
 *
 * `nameSource` is `user` | `hook` | `derived` | `unknown` | `none`. `hook` is
 * Claude Code's record of a title this emitter set. `unknown` means a
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
        nameSource = record.nameSource === 'user' || record.nameSource === 'hook' ? record.nameSource : 'derived';
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

/**
 * Is there a `.env` where the harness would look for one?
 *
 * Deliberately a single `existsSync` on a path we already know: this runs on
 * EVERY prompt, so it must cost nothing. It checks existence and not contents,
 * because a `.env` that exists but lacks a specific key is `harness:env:check`'s
 * job, which runs in `setup:doctor` and can afford to read files.
 */
export function envFileMissing(options = {}) {
  const { env = process.env, existsSync: exists = existsSync } = options;
  const root = options.repoRoot ?? env.CLAUDE_PROJECT_DIR ?? env.CODEX_PROJECT_DIR ?? process.cwd();
  if (!root) { return false; }
  try { return !exists(join(root, '.env')); }
  catch { return false; }
}

/**
 * Is the checkout a LINKED worktree missing what provisioning adds?
 *
 * A worktree's `.git` is a file `gitdir: <common>/worktrees/<name>`; a
 * submodule's is a file too, but its gitdir sits under `modules/`, so the
 * pointer is read rather than trusting the file type. Three cheap stats and one
 * tiny read: this runs on every prompt.
 */
export function worktreeUnprovisioned(options = {}) {
  const { env = process.env, existsSync: exists = existsSync, readFileSync: read = readFileSync } = options;
  const root = options.repoRoot ?? env.CLAUDE_PROJECT_DIR ?? env.CODEX_PROJECT_DIR ?? process.cwd();
  if (!root) { return false; }
  try {
    const pointer = String(read(join(root, '.git'), 'utf8'));
    if (!/^gitdir:.*[\\/]worktrees[\\/][^\\/\s]+\s*$/m.test(pointer)) { return false; }
    return !exists(join(root, 'node_modules')) || !exists(join(root, '.husky', '_'));
  }
  catch {
    // `.git` is a directory (primary checkout) or absent: not a linked worktree.
    return false;
  }
}

/**
 * Instruction router: `ROUTE:` lines (progressive disclosure, recall rank 1).
 *
 * `AGENTS.md` (L0) carries a fixed router table between the two markers below;
 * each row names the files to load for one KIND of request. The section files
 * under `.agents/instructions/` carry their own `triggers:` (case-insensitive
 * regexes over the prompt) and `paths:` (repo-relative prefixes a prompt may
 * name) in their frontmatter. Both are read HERE at runtime, never copied
 * into this file, so the table the model reads and the table the classifier
 * runs cannot drift.
 *
 * A row fires when the prompt matches its ANCHOR, the first file of its Read
 * cell (the section files it names in backticks come before its `@` imports);
 * every file of a fired row is routed. Anchoring keeps a file shared by two rows from dragging the
 * other row's files in: `agent-project-variables.md` opens the variables row and
 * rides along in the tracker row, so a prompt about environments loads the
 * variables, not the PBI cache. A target outside the sections folder (the
 * Claude Code imports `@package.json`, `@.agents/project.yaml`) has no
 * frontmatter: it is routed with its row, or by `IMPORT_ROW_TRIGGERS` when it
 * anchors the row alone.
 *
 * One line per newly routed file. The per-session state (keyed by session id)
 * remembers what was routed, so a prompt that needs nothing new costs 0 bytes;
 * a `SessionStart` with source `compact` or `clear` re-arms it, because the
 * routed files left the context with the compacted or cleared messages.
 *
 * Adherence (ADR-0017). Measured on real transcripts, an agent reads about
 * half of a lone route and almost none of six, so the hook routes few files
 * and says so plainly:
 *   - SCOPE. A `ROUTE-SCOPE:` line in the prompt replaces the prompt for
 *     classification: its comma-separated items are section ids (routed
 *     directly) or words (classified), `none` routes nothing. Without one, a
 *     prompt carrying an orchestrator preamble is classified on the task block
 *     after its marker (`TASK_BLOCK_MARKERS`), because the preamble is vendor
 *     text identical for every worker.
 *   - RANK AND CAP. Fired rows are ranked by their anchor's strength (an id
 *     named in the scope, then path hits, then distinct trigger hits, then the
 *     earliest match); at most `MAX_ROUTED_SECTIONS` new section files get a
 *     binding `ROUTE:` line, the rest collapse into one `ROUTE-OPTIONAL:` line
 *     that is offered once and never recorded as routed, so a later prompt
 *     about that topic still routes it. Imports never count against the
 *     cap: Claude Code expands them at launch.
 *   - CUE. Each binding line names the file's size and says when to read it.
 *   - RE-SURFACE (Claude Code, `PostToolUse`). The first tool call after the
 *     prompt that reads none of the routed sections, while some are unread,
 *     gets ONE `ROUTE-PENDING:` line naming them. Never repeated in the turn.
 */
export const ROUTE_PREFIX = 'ROUTE: read';
export const ROUTE_OPTIONAL_PREFIX = 'ROUTE-OPTIONAL:';
export const ROUTE_PENDING_PREFIX = 'ROUTE-PENDING:';
export const ROUTE_SCOPE_PREFIX = 'ROUTE-SCOPE:';
export const MAX_ROUTED_SECTIONS = 3;
/**
 * Where an orchestrator's injected preamble ends and the task begins. The
 * Orca supervised preamble closes with this line; the text after it is what
 * the conductor wrote.
 */
export const TASK_BLOCK_MARKERS = ['=== TASK ==='];
export const ROUTER_START = '<!-- router:start -->';
export const ROUTER_END = '<!-- router:end -->';
export const L0_FILE = 'AGENTS.md';
export const SECTIONS_DIR = '.agents/instructions';

/**
 * Triggers for a router row whose only target is an import with no
 * frontmatter to carry them: the scripts row (`@package.json`). Generic on
 * purpose, identical in every repo that ships this emitter: every one of them
 * has `package.json` scripts. Every other trigger lives in a section file.
 */
export const IMPORT_ROW_TRIGGERS = {
  'package.json': [
    'package\\.json',
    '\\b(?:bun|npm|pnpm|yarn)\\s+(?:run|test)\\b',
    '\\bbunx?\\s+[a-z]',
    '\\bscripts?\\b',
    '\\b[a-z]+:(?:check|fix)\\b',
    '\\b(?:typecheck|type-check|tsc)\\b',
    '\\bhow (?:do|can) (?:i|we|you) (?:run|build|test|lint|start|install)\\b',
    '\\b(?:run|rerun|re-run)\\s+(?:the\\s+|all\\s+)?(?:\\w+\\s+)?(?:tests?|lint|linter|build|gates?|checks?|type ?checks?|suite)\\b',
    '\\b(?:corr[aeé]|correr|ejecut[aeá]|ejecutar|lanz[aeá])\\s+(?:el\\s+|la\\s+|los\\s+|las\\s+|todos\\s+los\\s+)?(?:\\w+\\s+)?(?:tests?|lint|linter|build|gates?|checks?|chequeos?|suite|regresi[oó]n)\\b',
    'c[oó]mo (?:se )?(?:corro|corre|ejecuto|ejecuta|compilo|compila|buildeo|levanto|levanta|instalo|testeo)\\b',
    '\\bcomandos?\\b',
  ],
};

/** A YAML scalar as the frontmatter writes it: double-quoted (JSON escapes), single-quoted, or bare. */
function yamlScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    try { return JSON.parse(value); }
    catch { return value.slice(1, -1); }
  }
  if (value.startsWith('\'')) { return value.slice(1, -1).replace(/''/g, '\''); }
  return value.replace(/\s+#.*$/, '');
}

/** `[a, "b", 'c']` → items, quotes and commas inside a quoted item respected. */
function yamlFlowList(raw) {
  const body = raw.trim().replace(/^\[/, '').replace(/\]\s*(?:#.*)?$/, '');
  const items = [];
  let current = '';
  let quote = '';
  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (quote === '"' && character === '\\') {
      current += character + (body[index + 1] ?? '');
      index++;
      continue;
    }
    if (quote === '\'' && character === '\'' && body[index + 1] === '\'') {
      current += '\'\'';
      index++;
      continue;
    }
    if (quote) {
      if (character === quote) { quote = ''; }
      current += character;
      continue;
    }
    if (character === '"' || character === '\'') { quote = character; }
    if (character === ',') {
      if (current.trim()) { items.push(yamlScalar(current)); }
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim()) { items.push(yamlScalar(current)); }
  return items;
}

/**
 * The subset of YAML a section frontmatter uses: `key: scalar`, `key: [flow,
 * list]` and `key:` followed by `- item` lines. No dependency, because this
 * runs on every prompt; `cli/lib/instruction-router.test.ts` pins it to the
 * `yaml` parser over every real section file.
 */
export function parseSectionFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) { return null; }
  const data = {};
  let listKey = '';
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s*-\s(.*)$/.exec(line);
    if (listKey && item) {
      data[listKey].push(yamlScalar(item[1]));
      continue;
    }
    const pair = /^([a-z_][\w-]*):(.*)$/i.exec(line);
    if (!pair) { continue; }
    const [, key, raw = ''] = pair;
    listKey = '';
    if (raw.trim() === '' || raw.trim().startsWith('#')) {
      data[key] = [];
      listKey = key;
    }
    else {
      data[key] = raw.trim().startsWith('[') ? yamlFlowList(raw) : yamlScalar(raw);
    }
  }
  return data;
}

/**
 * Router rows between the markers: `{ kind, targets }`, or null without
 * markers. Same grammar as `scripts/lib/instructions.ts` (`routerRows`,
 * `sectionRefs`, `importRefs`): the first table row is the header, a section
 * is named in backticks by its file name and resolved under the sections
 * folder, an import is a plain-text `@path` outside any code span.
 */
export function parseRouterRows(l0) {
  const lines = l0.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === ROUTER_START);
  const end = lines.findIndex(line => line.trim() === ROUTER_END);
  if (start === -1 || end === -1 || end < start) { return null; }
  const rows = [];
  let seenHeader = false;
  for (const raw of lines.slice(start + 1, end)) {
    const line = raw.trim();
    if (!line.startsWith('|') || /^\|[\s:|-]+\|$/.test(line)) { continue; }
    if (!seenHeader) {
      seenHeader = true;
      continue;
    }
    const cells = line.slice(1, -1).split('|').map(cell => cell.trim());
    const read = cells[1] ?? '';
    const targets = [
      ...[...read.matchAll(/`([\w.-]+\.md)`/g)].map(found => `${SECTIONS_DIR}/${found[1]}`),
      ...[...read.replace(/`[^`]*`/g, '').matchAll(/(?:^|\s)@([\w./-]*[\w-])/g)].map(found => found[1]),
    ];
    rows.push({ kind: cells[0] ?? '', targets });
  }
  return rows;
}

function compileTriggers(sources) {
  const compiled = [];
  for (const source of Array.isArray(sources) ? sources : []) {
    if (typeof source !== 'string' || source.length === 0) { continue; }
    try { compiled.push(new RegExp(source, 'i')); }
    catch { continue; }
  }
  return compiled;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pathPrefixes(prefixes) {
  return (Array.isArray(prefixes) ? prefixes : []).filter(prefix => typeof prefix === 'string' && prefix.length > 0);
}

/**
 * A `paths:` prefix named in the prompt as a path (not as the tail of a
 * longer one). The longest prefix wins: `.context/` does not fire on
 * `.context/PBI/...` when another file owns `.context/PBI/`.
 */
function compilePath(prefix, allPrefixes) {
  const longer = allPrefixes
    .filter(other => other.length > prefix.length && other.toLowerCase().startsWith(prefix.toLowerCase()))
    .map(other => escapeRegExp(other.slice(prefix.length)));
  const exclusion = longer.length > 0 ? `(?!${longer.join('|')})` : '';
  return new RegExp(`(?<![\\w./-])(?:\\./)?${escapeRegExp(prefix)}${exclusion}`, 'i');
}

/**
 * Read the router from the checkout: L0 rows plus, for each target, the
 * matchers it brings. Null when `AGENTS.md` or its router markers are absent:
 * a repo without progressive disclosure routes nothing.
 */
export function loadInstructionRouter(root, read = readFileSync) {
  let l0;
  try { l0 = String(read(join(root, L0_FILE), 'utf8')); }
  catch { return null; }
  const rows = parseRouterRows(l0);
  if (!rows) { return null; }
  const metas = new Map();
  const sizes = new Map();
  for (const row of rows) {
    for (const path of row.targets) {
      if (metas.has(path)) { continue; }
      let meta = {};
      let content = null;
      try { content = String(read(join(root, path), 'utf8')); }
      catch { /* an unreadable target routes with its row only, with no size */ }
      if (path.startsWith(`${SECTIONS_DIR}/`) && path.endsWith('.md')) {
        meta = (content === null ? null : parseSectionFrontmatter(content)) ?? {};
      }
      else if (row.targets[0] === path && Object.hasOwn(IMPORT_ROW_TRIGGERS, path)) {
        meta = { triggers: IMPORT_ROW_TRIGGERS[path] };
      }
      metas.set(path, meta);
      sizes.set(path, content === null ? 0 : content.replace(/\r?\n$/, '').split(/\r?\n/).length);
    }
  }
  const allPrefixes = [...metas.values()].flatMap(meta => pathPrefixes(meta.paths));
  const targets = new Map();
  for (const [path, meta] of metas) {
    targets.set(path, {
      path,
      id: typeof meta.id === 'string' ? meta.id : '',
      lines: sizes.get(path) ?? 0,
      triggers: compileTriggers(meta.triggers),
      paths: pathPrefixes(meta.paths).map(prefix => compilePath(prefix, allPrefixes)),
    });
  }
  return { root: resolve(root), rows, targets };
}

/**
 * An absolute path is a location, not an intent: a path into this checkout
 * becomes repo-relative (so `paths:` can match it) and any other one is
 * blanked, so `.../agentic-qa-boilerplate/...` never fires a `QA` trigger. A
 * slash command (`/skill`, one segment) is not a path.
 */
export function neutralizePaths(text, root = '') {
  const local = root ? text.split(`${root}/`).join('') : text;
  return local.replace(/(?<![\w.~/-])(?:~|\/[\w.@~-]+)\/[^\s`'"()<>[\]]*/g, ' ');
}

/**
 * The text the router classifies, and the section ids it names outright.
 * A `ROUTE-SCOPE:` line wins (all of them, joined; it opens a line or follows
 * a sentence, so a prompt that merely mentions it in backticks is not
 * scoped); else the task block after the last orchestrator preamble marker;
 * else the whole prompt. Absolute paths are neutralized in all three.
 */
export function routeScope(router, prompt) {
  const scope = scopeOf(router, prompt);
  return { text: neutralizePaths(scope.text, router?.root ?? ''), ids: scope.ids };
}

function scopeOf(router, prompt) {
  const scoped = [...prompt.matchAll(/(?:^|[.!?])[ \t>*-]*ROUTE-SCOPE:([^\n]*)/gim)].map(found => found[1]);
  if (scoped.length > 0) {
    const ids = new Set();
    const words = [];
    const known = new Map([...(router?.targets.values() ?? [])].filter(target => target.id).map(target => [target.id.toLowerCase(), target.id]));
    for (const item of scoped.join(',').split(',').map(part => part.trim().replace(/[.;]+$/, '')).filter(Boolean)) {
      const id = known.get(item.toLowerCase());
      if (id) { ids.add(id); }
      else if (item.toLowerCase() !== 'none') { words.push(item); }
    }
    return { text: words.join('\n'), ids };
  }
  for (const marker of TASK_BLOCK_MARKERS) {
    const at = prompt.lastIndexOf(marker);
    if (at !== -1) { return { text: prompt.slice(at + marker.length), ids: new Set() }; }
  }
  return { text: prompt, ids: new Set() };
}

/**
 * How strongly the prompt calls for one target: an id named in the scope
 * beats any match; then each `paths:` hit counts double a distinct trigger
 * hit. `first` is the earliest match offset. Null when nothing matches.
 */
function targetStrength(target, text, ids) {
  if (target.id && ids.has(target.id)) { return { score: Number.MAX_SAFE_INTEGER, first: -1 }; }
  let score = 0;
  let first = Number.POSITIVE_INFINITY;
  for (const matcher of target.triggers) {
    const found = matcher.exec(text);
    if (found) {
      score += 1;
      first = Math.min(first, found.index);
    }
  }
  for (const matcher of target.paths) {
    const found = matcher.exec(text);
    if (found) {
      score += 2;
      first = Math.min(first, found.index);
    }
  }
  return score > 0 ? { score, first } : null;
}

/**
 * Every target of every row whose anchor the scoped prompt matches, each
 * once: the anchors first, strongest row first (ties: earliest match, then
 * router order), then the companions those rows bring, in the same order. An
 * anchor is what the prompt asked for; a companion only rides along, so it is
 * the first to fall past the cap.
 */
export function classifyPrompt(router, prompt) {
  if (!router || typeof prompt !== 'string' || prompt.trim().length === 0) { return []; }
  const { text, ids } = routeScope(router, prompt);
  const strength = new Map();
  for (const target of router.targets.values()) {
    const found = targetStrength(target, text, ids);
    if (found) { strength.set(target.path, found); }
  }
  const fired = router.rows
    .map((row, order) => ({ row, order, anchor: strength.get(row.targets[0]) }))
    .filter(entry => entry.anchor)
    .sort((a, b) => b.anchor.score - a.anchor.score || a.anchor.first - b.anchor.first || a.order - b.order);
  const routed = [];
  for (const path of [...fired.map(({ row }) => row.targets[0]), ...fired.flatMap(({ row }) => row.targets.slice(1))]) {
    if (!routed.includes(path)) { routed.push(path); }
  }
  return routed;
}

function isSection(path) {
  return path.startsWith(`${SECTIONS_DIR}/`);
}

/**
 * Split ranked paths into the binding ones (at most `MAX_ROUTED_SECTIONS`
 * section files, plus every import: Claude Code expands those at launch, so
 * they never count against the cap) and the optional rest.
 */
export function capRoutes(paths, max = MAX_ROUTED_SECTIONS) {
  const binding = [];
  const optional = [];
  let sections = 0;
  for (const path of paths) {
    if (!isSection(path)) {
      binding.push(path);
    }
    else if (sections < max) {
      binding.push(path);
      sections += 1;
    }
    else {
      optional.push(path);
    }
  }
  return { binding, optional };
}

/** The binding routes of one prompt with no session state: what the eval scores. */
export function bindingRoutes(router, prompt) {
  return capRoutes(classifyPrompt(router, prompt)).binding;
}

function describeTarget(router, path) {
  const target = router?.targets.get(path);
  const size = target?.lines ? `${target.lines} lines` : '';
  return [target?.id ?? '', size].filter(Boolean).join(', ');
}

export function routeLine(router, path) {
  const detail = describeTarget(router, path);
  return `${ROUTE_PREFIX} ${path}${detail ? ` (${detail})` : ''} before acting on this prompt`;
}

export function optionalRouteLine(router, paths) {
  const named = paths.map((path) => {
    const id = router?.targets.get(path)?.id;
    return id ? `${path} (${id})` : path;
  });
  return `${ROUTE_OPTIONAL_PREFIX} the prompt also touches ${named.join(', ')}; read one only if the task needs it.`;
}

/**
 * Where the routed set of one session lives: the OS temp dir, one file per
 * (checkout, session). Never in the repo: it is per-session runtime state.
 */
export function routeStatePath(root, sessionId, temp = tmpdir()) {
  const checkout = createHash('sha1').update(resolve(root)).digest('hex').slice(0, 12);
  const session = String(sessionId).replace(/[^\w.-]/g, '_').slice(0, 120);
  return join(temp, 'agentic-instruction-routes', `${checkout}-${session}.json`);
}

/** The per-session record, normalized: whatever a missing or older file holds reads as empty. */
export function normalizeRouteRecord(stored) {
  const list = value => (Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : []);
  return {
    routed: list(stored?.routed),
    offered: list(stored?.offered),
    pending: list(stored?.pending),
    reminded: stored?.reminded === true,
  };
}

/**
 * File-backed session record, or null without a session id (no dedupe: each
 * prompt routes what it matches). `routed`: files with a binding line this
 * session. `offered`: files already named in a `ROUTE-OPTIONAL:` line.
 * `pending` + `reminded`: the latest prompt's binding sections not read yet,
 * and whether `ROUTE-PENDING:` already fired for them.
 */
export function fileRouteState(root, sessionId, temp = tmpdir()) {
  if (!text(sessionId)) { return null; }
  const path = routeStatePath(root, sessionId, temp);
  return {
    read() {
      return normalizeRouteRecord(readJson(path));
    },
    write(record) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify(normalizeRouteRecord(record))}\n`);
      }
      catch { /* a read-only temp dir costs dedupe, never the prompt */ }
    },
    clear() {
      try { rmSync(path, { force: true }); }
      catch { /* nothing to re-arm */ }
    },
  };
}

/** Walk up from `start` to the checkout root: the nearest directory holding `.git`. */
function checkoutRootOf(start) {
  let dir = start;
  for (let depth = 0; depth < 64 && dir; depth++) {
    if (existsSync(join(dir, '.git'))) { return dir; }
    const parent = dirname(dir);
    if (parent === dir) { return ''; }
    dir = parent;
  }
  return '';
}

/** The checkout whose `AGENTS.md` the session loaded: the nearest `.git` above the session directory. */
function routerRoot(options) {
  if (options.repoRoot) { return options.repoRoot; }
  const { env = process.env, hookInput = {} } = options;
  const directory = text(env.CLAUDE_PROJECT_DIR) || text(env.CODEX_PROJECT_DIR) || text(hookInput.cwd) || process.cwd();
  return checkoutRootOf(directory) || directory;
}

/**
 * The routing lines for this prompt: one binding `ROUTE:` line per new file
 * up to the cap, then at most one `ROUTE-OPTIONAL:` line for the new matches
 * past it that were never offered. Empty (0 bytes) when nothing new matches.
 * Every prompt resets the pending set the `PostToolUse` re-surface checks.
 */
export function routeLines(options = {}) {
  const root = routerRoot(options);
  const router = options.router ?? loadInstructionRouter(root);
  const matched = classifyPrompt(router, options.prompt ?? '');
  const state = options.routeState === undefined
    ? fileRouteState(root, options.sessionId ?? options.identity?.sessionId ?? '')
    : options.routeState;
  const record = normalizeRouteRecord(state ? state.read() : {});
  const seen = new Set(record.routed);
  // The cap ranks the whole prompt, already-routed files included: a file
  // only offered before turns binding when a prompt puts it among its top
  // sections, not because the stronger ones were routed earlier.
  const capped = capRoutes(matched);
  const binding = capped.binding.filter(path => !seen.has(path));
  const offer = capped.optional.filter(path => !seen.has(path) && !record.offered.includes(path));
  const pending = binding.filter(isSection);
  if (state && (binding.length > 0 || offer.length > 0 || record.pending.length > 0)) {
    state.write({ routed: [...record.routed, ...binding], offered: [...record.offered, ...offer], pending, reminded: false });
  }
  const lines = binding.map(path => routeLine(router, path));
  if (offer.length > 0) { lines.push(optionalRouteLine(router, offer)); }
  return lines;
}

/** Section files one tool call reads: `Read` by path, or a shell read verb naming the file. */
export function sectionsReadBy(toolName, toolInput = {}) {
  const command = text(toolInput?.command);
  const source = toolName === 'Read'
    ? text(toolInput?.file_path)
    : toolName === 'Bash' && /\b(?:cat|head|tail|sed|less|more|bat|awk|nl|grep|rg)\b/.test(command) ? command : '';
  return [...source.matchAll(/(?:\.agents\/instructions\/)?\b([\w-]+\.md)\b/g)].map(found => `${SECTIONS_DIR}/${found[1]}`);
}

/**
 * `PostToolUse` re-surface: drop what this tool call read from the pending
 * set; if routed sections are still unread, this call read none of them and
 * no reminder fired yet this turn, return ONE `ROUTE-PENDING:` line. Else ''.
 * Reads only the session record: no router, no prompt.
 */
export function pendingRouteReminder(options = {}) {
  const state = options.routeState === undefined
    ? fileRouteState(routerRoot(options), options.sessionId ?? '')
    : options.routeState;
  if (!state) { return ''; }
  const record = normalizeRouteRecord(state.read());
  if (record.pending.length === 0) { return ''; }
  // Only a routed file counts as a read: `cat NOTES.md` reads no section.
  const read = new Set(sectionsReadBy(options.toolName, options.toolInput).filter(path => record.pending.includes(path)));
  const pending = record.pending.filter(path => !read.has(path));
  const remind = pending.length > 0 && read.size === 0 && !record.reminded;
  if (pending.length !== record.pending.length || remind) {
    state.write({ ...record, pending, reminded: record.reminded || remind });
  }
  if (!remind) { return ''; }
  return `${ROUTE_PENDING_PREFIX} routed for this prompt and still unread: ${pending.join(', ')}. Read ${pending.length === 1 ? 'it' : 'them'} before the next step (AGENTS.md LOAD PROTOCOL); this reminder is not repeated.`;
}

/** After a compaction (or `/clear`) the routed files left the context: route them again on demand. */
export function rearmRoutes(options = {}) {
  const state = options.routeState === undefined
    ? fileRouteState(routerRoot(options), options.sessionId ?? '')
    : options.routeState;
  if (state) { state.clear(); }
}

export function identityLine(identity) {
  return `${IDENTITY_PREFIX} worktree=${identity.worktree} session=${identity.label} harness=${identity.harness}`;
}

/**
 * The lines every harness injects, in order. OpenCode pushes them as-is. The
 * `ROUTE:` lines come last and only when a `prompt` is passed: the OpenCode
 * system transform has no prompt, so its adapter routes in `chat.message`.
 */
export function agentContextLines(options = {}) {
  const { env = process.env } = options;
  const identity = options.identity ?? resolveAgentIdentity(options);
  const orca = options.orca ?? orcaAvailable(env);
  const lines = [identityLine(identity)];
  if (orca) { lines.push(ORCA_CONTEXT_LINE); }
  if (options.envMissing ?? envFileMissing({ env })) { lines.push(MISSING_ENV_LINE); }
  else if (options.worktreeUnprovisioned ?? worktreeUnprovisioned({ env })) { lines.push(UNPROVISIONED_WORKTREE_LINE); }
  if (typeof options.prompt === 'string') {
    lines.push(...routeLines({ ...options, sessionId: options.sessionId ?? identity.sessionId }));
  }
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
 * alone. A name this hook set earlier (`hook`) may be replaced, because a
 * re-engaged fleet terminal receives a new task with a new label. The
 * fleet-worker token wins first and yields the label, then an explicit
 * `--name <value>`, then the workflow + issue-key shape, `<KEY>-<workflow>`.
 * A title equal to the current name is not re-emitted.
 */
export function proposeSessionTitle({ prompt = '', identity = {} } = {}) {
  if (identity.nameSource === 'user' || identity.nameSource === 'unknown') { return ''; }
  const title = titleFromPrompt(prompt);
  return title === identity.sessionName ? '' : title;
}

function titleFromPrompt(prompt) {
  const fleet = FLEET_PROMPT_PATTERN.exec(prompt);
  if (fleet) { return sanitizeTitle(fleet[2]); }
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
  const event = text(hookInput.hook_event_name) || 'UserPromptSubmit';
  if (event === 'SessionStart') {
    // Wired with the `compact` and `clear` matchers: re-arm the routes, add nothing.
    if (text(hookInput.source) === 'compact' || text(hookInput.source) === 'clear') {
      rearmRoutes({ ...options, env, hookInput, sessionId: text(hookInput.session_id) });
    }
    return '';
  }
  if (event === 'PostToolUse') {
    // A subagent's read never reaches the main context, and its calls never owe the main turn a read.
    if (text(hookInput.agent_id)) { return ''; }
    const reminder = pendingRouteReminder({ ...options, env, hookInput, sessionId: text(hookInput.session_id), toolName: text(hookInput.tool_name), toolInput: hookInput.tool_input });
    return reminder ? `${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: reminder } })}\n` : '';
  }
  // Any other event a host config wires to this file by mistake prints nothing:
  // identity and routes belong to the prompt.
  if (event !== 'UserPromptSubmit') { return ''; }
  const identity = resolveAgentIdentity({ env, hookInput, home });
  const prompt = options.prompt ?? (event === 'UserPromptSubmit' ? text(hookInput.prompt) : undefined);
  const context = agentContextLines({ ...options, env, hookInput, home, identity, prompt }).join('\n');
  if (identity.harness !== 'claude-code' && identity.harness !== 'codex') {
    return context;
  }
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
