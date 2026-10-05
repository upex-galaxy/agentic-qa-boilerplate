/* eslint-disable no-template-curly-in-string -- the fixtures below mirror .mcp.json verbatim, `${VAR}` included */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import {
  agentContextLines,
  MISSING_ENV_LINE,
  orcaAvailable,
  proposeSessionTitle,
  resolveWorktree,
  ROUTE_PREFIX,
  routeStatePath,
  sessionLabel,
  UNPROVISIONED_WORKTREE_LINE,
  worktreeUnprovisioned,
} from '../../.agents/hooks/personality-reinject.mjs';
import {
  CLAUDE_HOOK_COMMAND,
  CODEX_HOOK_COMMAND,
  CODEX_HOOK_COMMAND_WINDOWS,
  CODEX_PROJECT_DOC_MAX_BYTES,
  CODEX_STARTUP_TIMEOUT_SEC,
  declaredMcpIds,
  DOC_CONTRACTS_HOOK,
  EXPECTED_MCP,
  HOOK_GROUP_FIX,
  HOOK_IDENTITY_MARKER,
  HOOK_ORCA_MARKER,
  hookScriptPath,
  KNOWN_MCP_IDS,
  LEGACY_CODEX_ENV_LOADER_ARGS,
  MCP_ENV_LOADER_COMMAND,
  MCP_ENV_LOADER_HEAD,
  mcpEnvLoaderArgs,
  stripJsonComments,
  unwrapEnvLoader,
  validateDocContractHooks,
  validateEslintBlockWiring,
  validateHookCompatibility,
  validateInstructionRouterHooks,
  validateMcpParity,
  validateMcpParityFindings,
  validateOpenCodePluginEntrypoints,
} from './agent-compatibility-contracts.ts';
import {
  checkAgentCompatibility,
  CLAUDE_INSTRUCTIONS_SHIM,
  claudeSkillsAliasPlan,
  commandsShadowingSkills,
  COMPATIBILITY_GROUP_LABEL,
  COMPATIBILITY_GROUP_ORDER,
  describeAliasStatus,
  groupCompatibilityErrors,
  isInside,
  normalizeNewlines,
  POSIX_CLAUDE_SKILLS_TARGET,
  removeShadowingCommands,
  repairAgentSurfaces,
  repairClaudeSkillsAlias,
  SHADOWING_COMMANDS_BACKUP_DIR,
  SKILLS_ALIAS_DEFERRED_MARKER,
  SKILLS_ALIAS_MISSING_ERROR,
  validateCanonicalSources,
} from './agent-compatibility.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const temporaryRoots: string[] = [];

/**
 * The OpenCode adapter, imported only where it exists: a project on another
 * harness deletes it (ADR-0012), and a static import would fail `types:check`
 * there on every commit. The tests that read it skip without it.
 */
const OPENCODE_PLUGIN = '.opencode/plugins/personality-reinject.js';
const HAS_OPENCODE = existsSync(join(REPO_ROOT, OPENCODE_PLUGIN));
// eslint-disable-next-line ts/no-explicit-any -- a plain-JS adapter with no type declarations
const opencodePlugin: any = HAS_OPENCODE ? (await import(join(REPO_ROOT, OPENCODE_PLUGIN))).default : null;

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) { rmSync(root, { recursive: true, force: true }); }
  }
});

function temporaryRoot(prefix = 'agent compatibility '): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}

function copyFromRepo(root: string, relativePath: string): void {
  const destination = join(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(REPO_ROOT, relativePath), destination);
}

// ---------------------------------------------------------------------------
// Hook emitter harness. The emitter resolves identity from stdin (the harness
// payload), from the environment and from the home directory, so every run
// gets a sandboxed HOME and a PATH pointing at `<sandbox>/bin` — an `orca`
// file there is what makes the conditional Orca line appear. The environment
// is REPLACED, never inherited: the suite itself runs inside a harness whose
// CLAUDE_* variables would otherwise decide the outcome.
// ---------------------------------------------------------------------------

const NODE_BINARY = Bun.which('node') ?? 'node';
const HOOK_EMITTER = join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs');

interface EmitterRun {
  exitCode: number
  stdout: string
  stderr: string
}

interface EmitterOptions {
  input?: string
  env?: Record<string, string>
  home?: string
}

function runEmitter(options: EmitterOptions = {}): EmitterRun {
  const home = options.home ?? temporaryRoot('agent identity home ');
  const result = Bun.spawnSync({
    cmd: [NODE_BINARY, HOOK_EMITTER],
    cwd: REPO_ROOT,
    stdin: new TextEncoder().encode(options.input ?? ''),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PATH: join(home, 'bin'), HOME: home, USERPROFILE: home, ...options.env },
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

interface HookSpecificOutput {
  hookEventName: string
  additionalContext: string
  sessionTitle?: string
}

function hookSpecificOutput(stdout: string): HookSpecificOutput {
  const parsed = JSON.parse(stdout) as { hookSpecificOutput: HookSpecificOutput };
  return parsed.hookSpecificOutput;
}

const CLAUDE_SESSION_PID = '4242';
const CLAUDE_SESSION_ID = 'c0ffee12-3456-7890-abcd-ef0123456789';

/** `~/.claude/sessions/<CLAUDE_PID>.json` as Claude Code writes it. */
function claudeHome(name: string, nameSource: string): string {
  const home = temporaryRoot('agent identity claude home ');
  write(home, `.claude/sessions/${CLAUDE_SESSION_PID}.json`, `${JSON.stringify({
    pid: Number(CLAUDE_SESSION_PID),
    sessionId: CLAUDE_SESSION_ID,
    name,
    nameSource,
  })}\n`);
  return home;
}

const CLAUDE_ENV = { CLAUDE_PROJECT_DIR: REPO_ROOT, CLAUDE_PID: CLAUDE_SESSION_PID };

function claudePayload(prompt: string): string {
  return JSON.stringify({
    session_id: CLAUDE_SESSION_ID,
    transcript_path: join(REPO_ROOT, 'transcript.jsonl'),
    cwd: REPO_ROOT,
    permission_mode: 'default',
    hook_event_name: 'UserPromptSubmit',
    prompt,
  });
}

/** Codex pipes `turn_id` too, and keeps its thread names in a JSONL index. */
function codexHome(threadName: string, sessionId: string): string {
  const home = temporaryRoot('agent identity codex home ');
  write(home, '.codex/session_index.jsonl', [
    JSON.stringify({ id: 'older-session', thread_name: 'something else', updated_at: 1 }),
    JSON.stringify({ id: sessionId, thread_name: threadName, updated_at: 2 }),
    '',
  ].join('\n'));
  return home;
}

function codexPayload(sessionId: string, prompt: string): string {
  return JSON.stringify({
    session_id: sessionId,
    turn_id: 'turn-1',
    transcript_path: null,
    cwd: REPO_ROOT,
    hook_event_name: 'UserPromptSubmit',
    model: 'gpt-5.1-codex',
    permission_mode: 'default',
    prompt,
  });
}

// ---------------------------------------------------------------------------
// Inline fixtures: the servers this repo ships plus the ones a downstream
// project may keep or add (`supabase`, never known to the contract; `tavily`,
// `postman` and `playwright`, which left the shipped set), spelled per host. Written
// here rather than copied so the tests describe the contract on their own,
// whatever the real repo looks like at the moment they run. Each host file is
// composed from the ids a test declares, so one fixture describes both this
// boilerplate and a downstream project with a different server set.
// ---------------------------------------------------------------------------

/** The set this boilerplate ships (and the strict per-host shapes cover). */
const BOILERPLATE_IDS = ['context7', 'slack-aurora', 'dbhub', 'openapi'];
/**
 * A downstream set: no `dbhub`, no `slack-aurora`, plus servers the contract
 * has no shape for (`tavily` and `postman` left the shipped set with ADR-0005,
 * `playwright` left it when browser automation became `playwright-cli` only;
 * they are now what a project that keeps them looks like; `supabase` never had
 * one).
 */
const PROJECT_IDS = ['context7', 'tavily', 'playwright', 'openapi', 'postman', 'supabase'];

/** Each stdio server that needs `.env` values starts through the `.env` loader (MCP_ENV_LOADER_*). */
const SLACK_VARS = ['SLACK_MCP_XOXP_TOKEN', 'SLACK_MCP_REACTION_TOOL'];
const DBHUB_VARS = ['DBHUB_TYPE', 'DBHUB_HOST', 'DBHUB_PORT', 'DBHUB_DATABASE', 'DBHUB_USER', 'DBHUB_PASSWORD'];
const OPENAPI_VARS = ['API_BASE_URL', 'OPENAPI_SPEC_PATH'];
const SUPABASE_VARS = ['SUPABASE_ACCESS_TOKEN'];
function loader(names: string[]): string[] {
  return mcpEnvLoaderArgs(names);
}
/** A host array literal (JSONC / TOML) for the loader args plus the inner `bunx`. */
function loaderLiteral(names: string[]): string {
  return [...loader(names), 'bunx'].map(arg => JSON.stringify(arg)).join(', ');
}

/**
 * A Codex file from before the loader: each fixture server starts bare and
 * forwards its names through `env_vars`, which a desktop launch leaves empty.
 */
function withoutLoader(text: string): string {
  return [SLACK_VARS, DBHUB_VARS, OPENAPI_VARS, SUPABASE_VARS]
    .reduce((acc, names) => acc.replaceAll(`args = [${loaderLiteral(names)}, `, `env_vars = ${JSON.stringify(names)}\nargs = [`), text);
}

const MCP_SERVERS: Record<string, unknown> = {
  'context7': { command: 'bunx', args: ['-y', '@upstash/context7-mcp@4.0.3'] },
  'tavily': {
    type: 'http',
    url: 'https://mcp.tavily.com/mcp/',
    headers: { Authorization: 'Bearer ${TAVILY_API_KEY}' },
  },
  'playwright': {
    command: 'bunx',
    args: [
      '@playwright/mcp@0.0.79',
      '--caps',
      'vision,pdf,testing,tracing,tabs',
      '--timeout-action',
      '10000',
      '--timeout-navigation',
      '30000',
      '--viewport-size',
      '1920x1080',
    ],
  },
  'slack-aurora': {
    command: 'bunx',
    args: [...loader(SLACK_VARS), 'bunx', '-y', 'slack-mcp-server@latest', '--transport', 'stdio'],
    env: { SLACK_MCP_ADD_MESSAGE_TOOL: 'true' },
  },
  'dbhub': {
    command: 'bunx',
    args: [...loader(DBHUB_VARS), 'bunx', '-y', '@bytebase/dbhub@1.2.1', '--config', 'dbhub.toml'],
  },
  'openapi': {
    command: 'bunx',
    args: [...loader(OPENAPI_VARS), 'bunx', '-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
  },
  'postman': {
    type: 'http',
    url: 'https://mcp.postman.com/mcp',
    headers: { Authorization: 'Bearer ${POSTMAN_API_KEY}' },
  },
  'supabase': {
    command: 'bunx',
    args: [...loader(SUPABASE_VARS), 'bunx', '-y', '@supabase/mcp-server-supabase@latest', '--read-only'],
    env: { LOG_LEVEL: 'error' },
  },
};

// Comments and trailing commas on purpose: this is what Prettier writes.
const OPENCODE_SERVERS: Record<string, string> = {
  'context7': `    "context7": {
      "type": "local",
      "command": ["bunx", "-y", "@upstash/context7-mcp@4.0.3"],
      "enabled": true,
    },`,
  'tavily': `    "tavily": {
      "type": "remote",
      "url": "https://mcp.tavily.com/mcp/",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:TAVILY_API_KEY}",
      },
    },`,
  'playwright': `    "playwright": {
      "type": "local",
      "command": [
        "bunx",
        "@playwright/mcp@0.0.79",
        "--caps",
        "vision,pdf,testing,tracing,tabs",
        "--timeout-action",
        "10000",
        "--timeout-navigation",
        "30000",
        "--viewport-size",
        "1920x1080",
      ],
      "enabled": true,
    },`,
  'slack-aurora': `    "slack-aurora": {
      "type": "local",
      "command": ["bunx", ${loaderLiteral(SLACK_VARS)}, "-y", "slack-mcp-server@latest", "--transport", "stdio"],
      "enabled": true,
      "environment": {
        "SLACK_MCP_ADD_MESSAGE_TOOL": "true",
      },
    },`,
  'dbhub': `    "dbhub": {
      "type": "local",
      "command": ["bunx", ${loaderLiteral(DBHUB_VARS)}, "-y", "@bytebase/dbhub@1.2.1", "--config", "dbhub.toml"],
      "enabled": true,
    },`,
  'openapi': `    // schema-read-only: no token here
    "openapi": {
      "type": "local",
      "command": ["bunx", ${loaderLiteral(OPENAPI_VARS)}, "-y", "@ivotoby/openapi-mcp-server@1.16.1", "--tools", "dynamic"],
      "enabled": true,
    },`,
  'postman': `    "postman": {
      "type": "remote",
      "url": "https://mcp.postman.com/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:POSTMAN_API_KEY}",
      },
    },`,
  'supabase': `    "supabase": {
      "type": "local",
      "command": ["bunx", ${loaderLiteral(SUPABASE_VARS)}, "-y", "@supabase/mcp-server-supabase@latest", "--read-only"],
      "enabled": true,
      "environment": {
        "LOG_LEVEL": "error",
      },
    },`,
};

const CODEX_SERVERS: Record<string, string> = {
  'context7': `[mcp_servers.context7]
command = "bunx"
enabled = true
startup_timeout_sec = 30
args = ["-y", "@upstash/context7-mcp@4.0.3"]
`,
  'tavily': `[mcp_servers.tavily]
url = "https://mcp.tavily.com/mcp/"
bearer_token_env_var = "TAVILY_API_KEY"
enabled = true
`,
  'playwright': `[mcp_servers.playwright]
command = "bunx"
enabled = true
args = ["@playwright/mcp@0.0.79", "--caps", "vision,pdf,testing,tracing,tabs", "--timeout-action", "10000", "--timeout-navigation", "30000", "--viewport-size", "1920x1080"]
`,
  'slack-aurora': `[mcp_servers.slack-aurora]
command = "bunx"
enabled = true
startup_timeout_sec = 30
args = [${loaderLiteral(SLACK_VARS)}, "-y", "slack-mcp-server@latest", "--transport", "stdio"]

[mcp_servers.slack-aurora.env]
SLACK_MCP_ADD_MESSAGE_TOOL = "true"
`,
  'dbhub': `[mcp_servers.dbhub]
command = "bunx"
enabled = true
startup_timeout_sec = 30
args = [${loaderLiteral(DBHUB_VARS)}, "-y", "@bytebase/dbhub@1.2.1", "--config", "dbhub.toml"]
`,
  'openapi': `[mcp_servers.openapi]
command = "bunx"
enabled = true
startup_timeout_sec = 30
args = [${loaderLiteral(OPENAPI_VARS)}, "-y", "@ivotoby/openapi-mcp-server@1.16.1", "--tools", "dynamic"]
`,
  'postman': `[mcp_servers.postman]
url = "https://mcp.postman.com/mcp"
bearer_token_env_var = "POSTMAN_API_KEY"
enabled = true
`,
  'supabase': `[mcp_servers.supabase]
command = "bunx"
enabled = true
args = [${loaderLiteral(SUPABASE_VARS)}, "-y", "@supabase/mcp-server-supabase@latest", "--read-only"]

[mcp_servers.supabase.env]
LOG_LEVEL = "error"
`,
};

function mcpJson(ids: string[]): string {
  const mcpServers = Object.fromEntries(ids.map(id => [id, MCP_SERVERS[id]]));
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

function opencodeJsonc(ids: string[]): string {
  return `{
  // OpenCode shared team config
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@warp-dot-dev/opencode-warp"],
  "mcp": {
${ids.map(id => OPENCODE_SERVERS[id]).join('\n')}
  },
}
`;
}

function codexToml(ids: string[]): string {
  return `[shell_environment_policy]
inherit = "core"

${ids.map(id => CODEX_SERVERS[id]).join('\n')}`;
}

function hookSettings(command: string, windows?: string): string {
  const hook: Record<string, unknown> = { type: 'command', command, timeout: 5 };
  if (windows) { hook.commandWindows = windows; }
  return `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [hook] }] } }, null, 2)}\n`;
}

/** Hook adapters + MCP configs (the same `ids` on every host), nothing else. */
function contractFixture(prefix?: string, ids = BOILERPLATE_IDS): string {
  const root = temporaryRoot(prefix);
  copyFromRepo(root, '.agents/hooks/personality-reinject.mjs');
  if (HAS_OPENCODE) { copyFromRepo(root, OPENCODE_PLUGIN); }
  write(root, '.claude/settings.json', hookSettings(CLAUDE_HOOK_COMMAND));
  write(root, '.codex/hooks.json', hookSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS));
  write(root, '.mcp.json', mcpJson(ids));
  write(root, 'opencode.jsonc', opencodeJsonc(ids));
  write(root, '.codex/config.toml', codexToml(ids));
  return root;
}

const SKILLS = ['project-context', 'sync-ai-context'];

/** Everything `checkAgentCompatibility` wants, except the alias itself. */
function repositoryFixture(): string {
  const root = contractFixture();
  write(root, 'AGENTS.md', '# AI memory\n');
  write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
  for (const skill of SKILLS) {
    write(root, `.agents/skills/${skill}/SKILL.md`, `---\nname: ${skill}\n---\n`);
  }
  return root;
}

describe('shared personality hook', () => {
  test('emits the identity line, not the output contract, and exits successfully', () => {
    const result = runEmitter();

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    // No harness payload, no CLAUDE_*/CODEX_* variables: plain text, no JSON.
    expect(result.stdout).not.toContain('OUTPUT CONTRACT');
    expect(result.stdout).toContain(`${HOOK_IDENTITY_MARKER} worktree=primary session=unknown harness=unknown`);
    expect(result.stdout).not.toContain(HOOK_ORCA_MARKER);
  });

  test.skipIf(!HAS_OPENCODE)('OpenCode 1 (server entrypoint) mutates the system array in place with the same payload', async () => {
    const plugin = await opencodePlugin.server();
    const transform = plugin['experimental.chat.system.transform'];
    const output = { system: ['base system'] };
    const originalArray = output.system;

    await transform({ sessionID: 'test', model: {} }, output);
    const afterFirst = output.system.length;
    await transform({ sessionID: 'test', model: {} }, output);

    expect(output.system).toBe(originalArray);
    expect(output.system.length).toBe(afterFirst);
    expect(output.system[0]).toBe('base system');
    // The label degrades to the raw id: OpenCode exposes no session name.
    expect(output.system[1]).toContain('session=test harness=opencode');
  });

  test.skipIf(!HAS_OPENCODE)('OpenCode 2 (setup entrypoint) registers a context hook that pushes text parts once', async () => {
    const hooks: Record<string, (event: { sessionID: string, system: Array<{ type: string, text: string }> }) => void> = {};
    await opencodePlugin.setup({
      session: { hook: async (name: string, callback: (typeof hooks)[string]) => { hooks[name] = callback; } },
    });
    const event = { sessionID: 'test', system: [{ type: 'text', text: 'base system' }] };
    const originalArray = event.system;

    hooks.context(event);
    const afterFirst = event.system.length;
    hooks.context(event);

    expect(opencodePlugin.id).toBe('agentic-qa.personality-reinject');
    expect(Object.keys(hooks)).toEqual(['context']);
    expect(event.system).toBe(originalArray);
    expect(event.system.length).toBe(afterFirst);
    expect(event.system[1].text).toContain('session=test harness=opencode');
  });
});

describe('agent identity', () => {
  test('Claude Code receives additionalContext and a title derived from the prompt', () => {
    const run = runEmitter({
      home: claudeHome('agentic-qa-boilerplate-7', 'derived'),
      env: CLAUDE_ENV,
      input: claudePayload('sprint-testing UPEX-123 please plan the QA'),
    });

    expect(run.exitCode).toBe(0);
    const output = hookSpecificOutput(run.stdout);
    expect(output.hookEventName).toBe('UserPromptSubmit');
    expect(output.additionalContext).not.toContain('OUTPUT CONTRACT');
    expect(output.additionalContext).toContain(
      `${HOOK_IDENTITY_MARKER} worktree=primary session=agentic-qa-boilerplate-7 (${CLAUDE_SESSION_ID.slice(0, 8)}) harness=claude-code`,
    );
    expect(output.sessionTitle).toBe('UPEX-123-sprint-testing');
  });

  test('a user-set session name is never renamed and is used verbatim', () => {
    const run = runEmitter({
      home: claudeHome('release-audit', 'user'),
      env: CLAUDE_ENV,
      input: claudePayload('sprint-testing UPEX-123 please plan the QA'),
    });

    const output = hookSpecificOutput(run.stdout);
    expect(output.sessionTitle).toBeUndefined();
    expect(output.additionalContext).toContain('session=release-audit harness=claude-code');
  });

  test('a name this hook set is read back verbatim as the session label', () => {
    const run = runEmitter({
      home: claudeHome('worker-naming', 'hook'),
      env: CLAUDE_ENV,
      input: claudePayload('continue with the next stage'),
    });

    const output = hookSpecificOutput(run.stdout);
    expect(output.sessionTitle).toBeUndefined();
    expect(output.additionalContext).toContain('session=worker-naming harness=claude-code');
  });

  test('a prompt with no workflow and issue key leaves the title alone', () => {
    const run = runEmitter({
      home: claudeHome('agentic-qa-boilerplate-7', 'derived'),
      env: CLAUDE_ENV,
      input: claudePayload('what does this repo do?'),
    });

    expect(hookSpecificOutput(run.stdout).sessionTitle).toBeUndefined();
  });

  test('Codex gets the same JSON shape without a session title', () => {
    const sessionId = '019abcde-1111-2222-3333-444455556666';
    const run = runEmitter({
      home: codexHome('BK-77 retest', sessionId),
      input: codexPayload(sessionId, 'sprint-testing BK-77 retest the fix'),
    });

    expect(run.exitCode).toBe(0);
    const output = hookSpecificOutput(run.stdout);
    expect(output.hookEventName).toBe('UserPromptSubmit');
    expect(output.additionalContext).toContain(
      `session=BK-77 retest (${sessionId.slice(0, 8)}) harness=codex`,
    );
    // `sessionTitle` is a Claude Code field; the Codex output wire has no such
    // key, so emitting it there would risk the whole payload being rejected.
    expect(output.sessionTitle).toBeUndefined();
  });

  test('the Orca line appears only when an orca binary sits on PATH', () => {
    const home = temporaryRoot('agent identity orca ');
    write(home, 'bin/orca', '#!/bin/sh\nexit 0\n');
    write(home, 'bin/orca-ide', '#!/bin/sh\nexit 0\n'); // the Linux CLI name

    expect(runEmitter({ home }).stdout).toContain(HOOK_ORCA_MARKER);
    expect(runEmitter().stdout).not.toContain(HOOK_ORCA_MARKER);
  });

  test('ORCA_WORKTREE_ID names the worktree, its absence means primary', () => {
    // A linked worktree's `.git` is a FILE; the primary checkout's is a directory.
    const linked = temporaryRoot('agent identity linked worktree ');
    write(linked, '.git', 'gitdir: /elsewhere/.git/worktrees/BK-123-login\n');
    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::/work/orca/BK-123-login' }, linked)).toBe('BK-123-login');
    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::C:\\work\\orca\\BK-9' }, linked)).toBe('BK-9');
    expect(resolveWorktree({}, linked)).toBe('primary');
    // Orca sets the variable for the primary checkout too: a `.git` directory wins.
    const primary = temporaryRoot('agent identity primary ');
    mkdirSync(join(primary, '.git'));
    expect(resolveWorktree({ ORCA_WORKTREE_ID: 'repo-id::/work/orca/BK-123-login' }, primary)).toBe('primary');
  });

  test('an unprovisioned linked worktree gets one warning line; a primary or a submodule never does', () => {
    const linked = temporaryRoot('agent identity unprovisioned ');
    write(linked, '.git', 'gitdir: /elsewhere/.git/worktrees/wt-a\n');
    expect(worktreeUnprovisioned({ repoRoot: linked })).toBe(true);
    mkdirSync(join(linked, 'node_modules'));
    expect(worktreeUnprovisioned({ repoRoot: linked })).toBe(true);
    mkdirSync(join(linked, '.husky', '_'), { recursive: true });
    expect(worktreeUnprovisioned({ repoRoot: linked })).toBe(false);

    const submodule = temporaryRoot('agent identity submodule ');
    write(submodule, '.git', 'gitdir: ../.git/modules/vendored\n');
    expect(worktreeUnprovisioned({ repoRoot: submodule })).toBe(false);
    const primary = temporaryRoot('agent identity primary checkout ');
    mkdirSync(join(primary, '.git'));
    expect(worktreeUnprovisioned({ repoRoot: primary })).toBe(false);

    const identity = { worktree: 'wt-a', label: 'x', harness: 'claude-code' };
    const lines = agentContextLines({ identity, orca: false, envMissing: false, worktreeUnprovisioned: true });
    expect(lines).toContain(UNPROVISIONED_WORKTREE_LINE);
    // One setup warning at most: a missing `.env` already names the provisioner.
    const both = agentContextLines({ identity, orca: false, envMissing: true, worktreeUnprovisioned: true });
    expect(both).toContain(MISSING_ENV_LINE);
    expect(both).not.toContain(UNPROVISIONED_WORKTREE_LINE);
  });

  test('the session label follows the name-source ladder', () => {
    const sessionId = 'abcdef12-3456';
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'user', sessionId })).toBe('nightly');
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'hook', sessionId })).toBe('nightly');
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'derived', sessionId })).toBe('nightly (abcdef12)');
    expect(sessionLabel({ sessionName: 'nightly', nameSource: 'unknown', sessionId })).toBe('nightly (abcdef12)');
    expect(sessionLabel({ sessionId })).toBe(sessionId);
    expect(sessionLabel({})).toBe('unknown');
  });

  test('an explicit --name hint in the prompt wins over the workflow shape', () => {
    expect(proposeSessionTitle({
      prompt: 'test-automation UPEX-9 --name "fleet worker 2"',
      identity: { nameSource: 'derived' },
    })).toBe('fleet worker 2');
    expect(proposeSessionTitle({
      prompt: 'test-automation UPEX-9',
      identity: { nameSource: 'none' },
    })).toBe('UPEX-9-test-automation');
    expect(proposeSessionTitle({
      prompt: 'test-automation UPEX-9',
      identity: { nameSource: 'unknown' },
    })).toBe('');
  });

  test('the fleet-worker token names the session after the roster label', () => {
    // The worker's prompt opens with `/<skill> <label> fleet worker …`; the label is the name.
    expect(proposeSessionTitle({
      prompt: '/sprint-testing BK-123 fleet worker: run every stage without returning to the prompt.',
      identity: { nameSource: 'none' },
    })).toBe('BK-123');
    expect(proposeSessionTitle({
      prompt: '/sprint-testing BK-123-login fleet worker. Read the brief.',
      identity: { nameSource: 'derived' },
    })).toBe('BK-123-login');
    // A kebab label and a skill outside the workflow list both qualify.
    expect(proposeSessionTitle({
      prompt: '/framework-development volatile-impl fleet worker. Read the brief.',
      identity: { nameSource: 'derived' },
    })).toBe('volatile-impl');
    expect(proposeSessionTitle({
      prompt: '/playwright-cli docs-audit fleet worker. Read the brief.',
      identity: { nameSource: 'derived' },
    })).toBe('docs-audit');
  });

  test('the fleet token is found after the runtime preamble', () => {
    const preamble = 'You are working inside Orca, a multi-agent IDE.\n=== CLI COMMANDS ===\n  orca orchestration send --type worker_done\n=== TASK ===\n';
    expect(proposeSessionTitle({
      prompt: `${preamble}/framework-development worker-naming fleet worker. Read the brief.`,
      identity: { nameSource: 'derived' },
    })).toBe('worker-naming');
  });

  test('extra words between the label and the token leave the title alone', () => {
    expect(proposeSessionTitle({
      prompt: '/framework-development env-scopes SPIKE fleet worker. Read the brief.',
      identity: { nameSource: 'derived' },
    })).toBe('');
  });

  test('a hook-set name is replaced by a new label and never re-emitted unchanged', () => {
    const prompt = '/framework-development context-c fleet worker. Read the brief.';
    expect(proposeSessionTitle({ prompt, identity: { nameSource: 'hook', sessionName: 'context-c' } })).toBe('');
    expect(proposeSessionTitle({ prompt, identity: { nameSource: 'hook', sessionName: 'context-b' } })).toBe('context-c');
    expect(proposeSessionTitle({ prompt, identity: { nameSource: 'user', sessionName: 'mine' } })).toBe('');
  });

  test('orcaAvailable never spawns a process and tolerates an empty PATH', () => {
    const home = temporaryRoot('agent identity path ');
    write(home, 'bin/orca', '');

    expect(orcaAvailable({ PATH: join(home, 'bin') })).toBe(true);
    expect(orcaAvailable({ PATH: join(home, 'missing') })).toBe(false);
    expect(orcaAvailable({})).toBe(false);
  });
});

describe('Codex hook portability', () => {
  test('fails when the current directory has no Git root', () => {
    const root = contractFixture('agent compatibility no git ');
    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).not.toBe(0);
  });

  test('resolves a Git root whose path contains spaces', () => {
    const root = contractFixture('agent compatibility spaced root ');
    const nested = join(root, 'nested directory');
    mkdirSync(nested);
    const init = Bun.spawnSync({ cmd: ['git', 'init', '-q'], cwd: root, stderr: 'pipe' });
    expect(init.exitCode).toBe(0);

    const result = Bun.spawnSync({
      cmd: ['sh', '-c', CODEX_HOOK_COMMAND],
      cwd: nested,
      stdin: new TextEncoder().encode(''),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(HOOK_IDENTITY_MARKER);
  });

  test('renders a Windows command with Git-root and Join-Path resolution', () => {
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('git rev-parse --show-toplevel');
    expect(CODEX_HOOK_COMMAND_WINDOWS).toContain('Join-Path $root \'.agents/hooks/personality-reinject.mjs\'');
    expect(CODEX_HOOK_COMMAND_WINDOWS).not.toContain('/Users/');
  });
});

describe('eslint block wiring', () => {
  const BASE = `export const BASE_ESLINT_OPTIONS = { rules: {} };
export const CLI_IMPORT_CLOSURE = { files: ['cli/**/*.ts'], rules: {} };
export const KATA_IMPORT_ALIASES = { files: ['tests/**/*.ts'], rules: {} };
`;

  test('the real repository wires every block it exports', () => {
    expect(validateEslintBlockWiring(REPO_ROOT)).toEqual([]);
  });

  // The failure this exists for: `eslint.config.base.js` is SYNCED and
  // `eslint.config.js` is never overwritten, so upstream can ship a rule that
  // lands on disk, exports cleanly and enforces nothing.
  test('an unwired block is an error naming it and the fix', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', 'import { BASE_ESLINT_OPTIONS, CLI_IMPORT_CLOSURE } from \'./eslint.config.base.js\';\nexport default antfu({ ...BASE_ESLINT_OPTIONS }, CLI_IMPORT_CLOSURE);\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('KATA_IMPORT_ALIASES');
    expect(errors[0]).toContain('enforces nothing');
  });

  // The hole this check had on the day it was written. `eslint.config.js`'s own
  // JSDoc names `CLI_IMPORT_CLOSURE` in prose, so a raw substring search found
  // it there and passed a consumer that had stopped wiring the block.
  test('a name mentioned only in a comment does NOT count as wiring', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', '/** Extra blocks go after `CLI_IMPORT_CLOSURE`. */\n// KATA_IMPORT_ALIASES lives in the base.\nexport default antfu({});\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toContain('CLI_IMPORT_CLOSURE');
    expect(errors.join(' ')).toContain('KATA_IMPORT_ALIASES');
  });

  // Without a word boundary, wiring the longer name satisfies the shorter one.
  test('a longer block name does not satisfy the shorter one it contains', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', 'export const CLI_IMPORT_CLOSURE = {};\nexport const CLI_IMPORT_CLOSURE_EXTRA = {};\n');
    write(root, 'eslint.config.js', 'import { CLI_IMPORT_CLOSURE_EXTRA } from \'./eslint.config.base.js\';\nexport default antfu({}, CLI_IMPORT_CLOSURE_EXTRA);\n');
    const errors = validateEslintBlockWiring(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('wire CLI_IMPORT_CLOSURE from');
  });

  test('a fully wired consumer is clean', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', BASE);
    write(root, 'eslint.config.js', 'import { BASE_ESLINT_OPTIONS, CLI_IMPORT_CLOSURE, KATA_IMPORT_ALIASES } from \'./eslint.config.base.js\';\nexport default antfu({ ...BASE_ESLINT_OPTIONS }, CLI_IMPORT_CLOSURE, KATA_IMPORT_ALIASES);\n');
    expect(validateEslintBlockWiring(root)).toEqual([]);
  });

  // The options object is spread into antfu's first argument, not passed as a
  // scoped block, so requiring it by name would fire on every correct config.
  test('BASE_ESLINT_OPTIONS is never demanded as a block', () => {
    const root = contractFixture();
    write(root, 'eslint.config.base.js', 'export const BASE_ESLINT_OPTIONS = { rules: {} };\n');
    write(root, 'eslint.config.js', 'export default antfu({});\n');
    expect(validateEslintBlockWiring(root)).toEqual([]);
  });

  test('a repo without the split config is not a finding', () => {
    expect(validateEslintBlockWiring(contractFixture())).toEqual([]);
  });
});

describe.skipIf(!HAS_OPENCODE)('hook adapters', () => {
  test('accepts the three adapters wired to the shared emitter', () => {
    expect(validateHookCompatibility(contractFixture())).toEqual([]);
  });

  test('the real repository wires its adapters to the shared emitter', () => {
    expect(validateHookCompatibility(REPO_ROOT)).toEqual([]);
  });

  test('rejects an absolute personal hook path', () => {
    const root = contractFixture();
    write(root, '.codex/hooks.json', hookSettings(
      'node \'/Users/example/repo/.agents/hooks/personality-reinject.mjs\'',
      CODEX_HOOK_COMMAND_WINDOWS,
    ));

    expect(validateHookCompatibility(root)).toContain('codex hook command contains an absolute personal path.');
  });

  test('rejects the legacy Claude-only hook file next to the shared emitter', () => {
    const root = contractFixture();
    write(root, '.claude/hooks/personality-reinject.js', 'process.stdout.write("dup");\n');

    expect(validateHookCompatibility(root)).toContain('Duplicated personality hook must be removed: .claude/hooks/personality-reinject.js');
  });

  test('rejects an OpenCode adapter that reassigns output.system', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'export const PersonalityReinject = async () => ({',
      '  \'experimental.chat.system.transform\': async (_input, output) => {',
      '    output.system = [...output.system, \'line\'];',
      '  },',
      '});',
      '',
    ].join('\n'));

    expect(validateHookCompatibility(root)).toContain('OpenCode personality adapter must mutate output.system in place.');
  });

  test('rejects a V1-only OpenCode adapter: OpenCode 2 refuses to load it', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'import { agentContextLines } from \'../../.agents/hooks/personality-reinject.mjs\';',
      'export const PersonalityReinject = async () => ({',
      '  \'experimental.chat.system.transform\': async (input, output) => {',
      '    output.system.push(...agentContextLines({ harness: \'opencode\' }));',
      '  },',
      '});',
      '',
    ].join('\n'));

    const errors = validateHookCompatibility(root);
    expect(errors.some(e => e.includes('must default-export one plugin definition'))).toBe(true);
    expect(errors.some(e => e.includes('OpenCode 2 entrypoint'))).toBe(true);
  });

  test('rejects an OpenCode adapter that dropped the V1 entrypoint', () => {
    const root = contractFixture();
    write(root, '.opencode/plugins/personality-reinject.js', [
      'import { agentContextLines } from \'../../.agents/hooks/personality-reinject.mjs\';',
      'export default {',
      '  id: \'agentic-qa.personality-reinject\',',
      '  async setup(ctx) {',
      '    await ctx.session.hook(\'context\', (event) => {',
      '      for (const text of agentContextLines({ harness: \'opencode\' })) { event.system.push({ type: \'text\', text }); }',
      '    });',
      '  },',
      '};',
      '',
    ].join('\n'));

    expect(validateHookCompatibility(root)).toContain('OpenCode personality adapter must keep the OpenCode 1 entrypoint: server() returning experimental.chat.system.transform.');
  });

  test('accepts the shipped dual-entrypoint OpenCode adapter', () => {
    expect(validateOpenCodePluginEntrypoints(readFileSync(join(REPO_ROOT, '.opencode/plugins/personality-reinject.js'), 'utf8'))).toEqual([]);
  });

  test('reads the emitter path out of every adapter form', () => {
    expect(hookScriptPath(CLAUDE_HOOK_COMMAND)).toBe('.agents/hooks/personality-reinject.mjs');
    expect(hookScriptPath(CODEX_HOOK_COMMAND)).toBe('.agents/hooks/personality-reinject.mjs');
    expect(hookScriptPath(CODEX_HOOK_COMMAND_WINDOWS)).toBe('.agents/hooks/personality-reinject.mjs');
    expect(hookScriptPath('node run-something')).toBeNull();
  });

  test('rejects a hook command pointing at a file that does not exist', () => {
    // The shape a rename leaves behind: `.claude/settings.json` is bootstrap-only,
    // so it keeps naming the emitter's old path while the emitter has moved.
    const root = contractFixture();
    write(root, '.claude/settings.json', hookSettings(
      'node "$CLAUDE_PROJECT_DIR/.agents/hooks/personality-reinject-renamed.mjs"',
    ));

    expect(validateHookCompatibility(root)).toContain(
      'claude hook command points at a file that does not exist: .agents/hooks/personality-reinject-renamed.mjs',
    );
  });

  test('rejects a hook command that names no repository-relative script', () => {
    const root = contractFixture();
    write(root, '.claude/settings.json', hookSettings('node --version'));

    expect(validateHookCompatibility(root)).toContain(
      'claude hook command does not name a repository-relative hook script.',
    );
  });
});

describe.skipIf(!HAS_OPENCODE)('instruction router hooks', () => {
  const ROUTER_L0 = '# L0\n<!-- router:start -->\n| When the request involves | Read | Was | Then |\n|---|---|---|---|\n| git | `agent-git.md` | §11 | - |\n<!-- router:end -->\n';

  function rearmSettings(command: string, windows?: string, rearmOn: string[] = ['compact', 'clear']): string {
    const hook: Record<string, unknown> = { type: 'command', command, timeout: 5 };
    if (windows) { hook.commandWindows = windows; }
    const sessionStart = rearmOn.map(matcher => ({ matcher, hooks: [hook] }));
    return `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [hook] }], PostToolUse: [{ hooks: [hook] }], SessionStart: sessionStart } }, null, 2)}\n`;
  }

  function routerFixture(): string {
    const root = contractFixture('agent compatibility router ');
    write(root, 'AGENTS.md', ROUTER_L0);
    write(root, '.claude/settings.json', rearmSettings(CLAUDE_HOOK_COMMAND));
    write(root, '.codex/hooks.json', rearmSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS));
    return root;
  }

  test('the real repository routes on every host it can', () => {
    expect(validateInstructionRouterHooks(REPO_ROOT)).toEqual([]);
  });

  test('binds only once AGENTS.md carries the router', () => {
    const root = contractFixture();
    expect(validateInstructionRouterHooks(root)).toEqual([]);
    write(root, 'AGENTS.md', '# single-file layout\n');
    expect(validateInstructionRouterHooks(root)).toEqual([]);
    write(root, 'AGENTS.md', ROUTER_L0);
    const errors = validateInstructionRouterHooks(root);
    for (const after of ['compaction', '/clear']) {
      expect(errors.some(e => e.startsWith(`claude must re-arm the routes after ${after}`))).toBe(true);
      expect(errors.some(e => e.startsWith(`codex must re-arm the routes after ${after}`))).toBe(true);
    }
    expect(validateHookCompatibility(root)).toEqual(errors);
  });

  test('accepts a compact and a clear SessionStart on both command hosts', () => {
    expect(validateInstructionRouterHooks(routerFixture())).toEqual([]);
  });

  test('rejects a host that re-arms on compaction only', () => {
    const root = routerFixture();
    write(root, '.claude/settings.json', rearmSettings(CLAUDE_HOOK_COMMAND, undefined, ['compact']));
    write(root, '.codex/hooks.json', rearmSettings(CODEX_HOOK_COMMAND, CODEX_HOOK_COMMAND_WINDOWS, ['compact']));
    expect(validateInstructionRouterHooks(root)).toEqual([
      `claude must re-arm the routes after /clear: a SessionStart group with matcher "clear" running ${CLAUDE_HOOK_COMMAND}. Fix: ${HOOK_GROUP_FIX}`,
      `codex must re-arm the routes after /clear: a SessionStart group with matcher "clear" running the Codex hook command (and its Windows variant). Fix: ${HOOK_GROUP_FIX}.`,
    ]);
  });

  test('rejects a Claude Code config that does not re-surface unread routes after a tool call', () => {
    const root = routerFixture();
    const settings = JSON.parse(rearmSettings(CLAUDE_HOOK_COMMAND));
    delete settings.hooks.PostToolUse;
    write(root, '.claude/settings.json', `${JSON.stringify(settings)}\n`);
    expect(validateInstructionRouterHooks(root)).toEqual([
      `claude must re-surface unread routes: a PostToolUse group with no matcher running ${CLAUDE_HOOK_COMMAND}. Fix: ${HOOK_GROUP_FIX}`,
    ]);
  });

  test('names the fix downstream only: the boilerplate itself has no upstream to merge from', () => {
    const root = routerFixture();
    const settings = JSON.parse(rearmSettings(CLAUDE_HOOK_COMMAND));
    delete settings.hooks.PostToolUse;
    write(root, '.claude/settings.json', `${JSON.stringify(settings)}\n`);
    write(root, 'package.json', JSON.stringify({ name: 'agentic-qa-boilerplate' }));
    expect(validateInstructionRouterHooks(root)).toEqual([
      `claude must re-surface unread routes: a PostToolUse group with no matcher running ${CLAUDE_HOOK_COMMAND}`,
    ]);
  });

  test('rejects an OpenCode adapter that stopped classifying the prompt or declaring OpenCode 2', () => {
    const root = routerFixture();
    const plugin = readFileSync(join(REPO_ROOT, '.opencode/plugins/personality-reinject.js'), 'utf8')
      .replace('\'chat.message\'', '\'chat.params\'')
      .replaceAll('ROUTER-ONLY', 'router only');
    write(root, '.opencode/plugins/personality-reinject.js', plugin);
    expect(validateInstructionRouterHooks(root)).toEqual([
      'OpenCode personality adapter must classify the prompt in chat.message with the shared routeLines (OpenCode 1).',
      'OpenCode personality adapter must declare the OpenCode 2 degradation (ROUTER-ONLY: no hook carries the prompt).',
    ]);
  });

  test('rejects an emitter that lost the classifier', () => {
    const root = routerFixture();
    const emitter = readFileSync(join(REPO_ROOT, '.agents/hooks/personality-reinject.mjs'), 'utf8')
      .replace('export function routeLines', 'function routeLines');
    write(root, '.agents/hooks/personality-reinject.mjs', emitter);
    expect(validateInstructionRouterHooks(root)).toEqual(['Shared hook emitter must export routeLines(): the ROUTE: lines have one classifier.']);
  });

  test('rejects an always-on file Codex would cut', () => {
    const root = routerFixture();
    write(root, 'AGENTS.md', `${ROUTER_L0}${'x'.repeat(CODEX_PROJECT_DOC_MAX_BYTES)}\n`);
    expect(validateInstructionRouterHooks(root)[0]).toContain(`Codex cuts the always-on file at ${CODEX_PROJECT_DOC_MAX_BYTES} bytes`);
  });

  test('OpenCode 1 classifies in chat.message, routes through the system transform once, re-arms on compaction', async () => {
    const sessionID = `compat-route-${process.pid}-${Date.now()}`;
    const plugin = await opencodePlugin.server({ worktree: REPO_ROOT });
    const turn = async (text: string) => {
      await plugin['chat.message']({ sessionID }, { message: {}, parts: [{ type: 'text', text }] });
      const output = { system: [] as string[] };
      await plugin['experimental.chat.system.transform']({ sessionID, model: {} }, output);
      return output.system.filter(line => line.startsWith(ROUTE_PREFIX));
    };
    try {
      const gitRoute = expect.stringMatching(/^ROUTE: read \.agents\/instructions\/agent-git\.md \(git, \d+ lines\) before acting on this prompt$/);
      expect(await turn('commit and push')).toEqual([gitRoute]);
      expect(await turn('push again')).toEqual([]);
      await plugin['experimental.session.compacting']({ sessionID });
      expect(await turn('push again')).toEqual([gitRoute]);
    }
    finally {
      rmSync(routeStatePath(REPO_ROOT, sessionID), { force: true });
    }
  });
});

describe('MCP semantic parity', () => {
  test('the contract itself agrees on .env dependencies across hosts', () => {
    for (const id of KNOWN_MCP_IDS) {
      expect(EXPECTED_MCP.opencode[id].dependsOn).toEqual(EXPECTED_MCP.claude[id].dependsOn);
      expect(EXPECTED_MCP.codex[id].dependsOn).toEqual(EXPECTED_MCP.claude[id].dependsOn);
      expect(EXPECTED_MCP.codex[id].literalEnv).toEqual(EXPECTED_MCP.claude[id].literalEnv);
    }
  });

  test('accepts the six boilerplate servers across all harnesses', () => {
    expect(validateMcpParity(contractFixture())).toEqual([]);
  });

  test('the real repository declares the same servers on every host', () => {
    // Asserts the DECLARED set, never the literal boilerplate six: a downstream
    // project with eight servers (or three) must pass this test unchanged.
    const declared = declaredMcpIds(REPO_ROOT);
    expect(declared.length).toBeGreaterThan(0);
    expect(declared).toEqual([...declared].sort());
    expect(validateMcpParity(REPO_ROOT)).toEqual([]);
  });

  test('strips comments without touching string contents', () => {
    expect(JSON.parse(stripJsonComments('{ // c\n "a": "http://x/*y*/" /* b */ }'))).toEqual({ a: 'http://x/*y*/' });
  });

  test('a bearer header on Claude and OpenCode is the same dependency Codex names by variable', () => {
    // `.mcp.json` / `opencode.jsonc` carry `Authorization: Bearer ${VAR}`;
    // Codex carries `bearer_token_env_var = "VAR"`. Same `.env` name, no error.
    const root = contractFixture(undefined, PROJECT_IDS);
    expect(validateMcpParity(root)).toEqual([]);

    const config = readFileSync(join(root, '.codex/config.toml'), 'utf8')
      .replace('bearer_token_env_var = "POSTMAN_API_KEY"', 'bearer_token_env_var = "POSTMAN_TOKEN"');
    writeFileSync(join(root, '.codex/config.toml'), config);

    // `postman` is a project-declared server (no pinned shape), so the generic
    // cross-host env contract is what catches the rename.
    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('MCP postman env contract differs between claude and codex') && error.includes('POSTMAN_TOKEN'))).toBe(true);
  });

  test('reports a missing Tavily server', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    const config = readFileSync(configPath, 'utf8').replace(
      /\n\[mcp_servers\.tavily\][\s\S]*?(?=\n\[mcp_servers\.)/,
      '\n',
    );
    writeFileSync(configPath, config);

    expect(validateMcpParity(root)).toEqual([
      'MCP tavily missing from codex: declared in .mcp.json, absent from .codex/config.toml',
    ]);
  });

  test('reports an MCP ID mismatch on both sides', () => {
    const root = contractFixture();
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.context8 = config.mcpServers.context7;
    delete config.mcpServers.context7;
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const errors = validateMcpParity(root);
    expect(errors).toContain('MCP context8 missing from opencode: declared in .mcp.json, absent from opencode.jsonc');
    expect(errors).toContain('MCP context8 missing from codex: declared in .mcp.json, absent from .codex/config.toml');
    expect(errors).toContain('MCP context7 present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc');
    expect(errors).toContain('MCP context7 present in codex only: declare it in .mcp.json or remove it from .codex/config.toml');
  });

  test('reads OpenCode {file:dir/VAR} as the same dependency as {env:VAR}', () => {
    // `scripts/harness-env.ts` rewrites every credential in `opencode.jsonc` to a
    // `{file:.auth/opencode/<VAR>}` pointer, because `{env:}` resolves only from a
    // process environment a desktop launch does not have. That is the SAME .env
    // dependency by a different route, so parity must still hold.
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, 'opencode.jsonc');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('{env:POSTMAN_API_KEY}', '{file:.auth/opencode/POSTMAN_API_KEY}')
      .replace('{env:TAVILY_API_KEY}', '{file:.auth/opencode/TAVILY_API_KEY}'));

    expect(validateMcpParity(root)).toEqual([]);
  });

  test('a renamed {file:dir/VAR} still fails parity, so the form is checked and not merely tolerated', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, 'opencode.jsonc');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('{env:POSTMAN_API_KEY}', '{file:.auth/opencode/POSTMAN_TOKEN}'));

    expect(validateMcpParity(root).some(error =>
      error.includes('MCP postman env contract differs between claude and opencode') && error.includes('POSTMAN_TOKEN'))).toBe(true);
  });

  test('a {file:} path whose final segment is NOT all-caps stays a literal', () => {
    // The guardrail on the pattern. `{file:certs/ca.pem}` is a file, not a
    // credential named after a variable, and must never be read as a dependency
    // on some variable. Anyone tempted to widen the regex has to break this.
    const root = contractFixture();
    const configPath = join(root, 'opencode.jsonc');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('"--tools", "dynamic"]', '"--tools", "dynamic", "{file:certs/ca.pem}"]'));

    const errors = validateMcpParity(root);
    // Still an error, because the openapi command genuinely changed — but the
    // path is reported as a LITERAL argument, not as a dependency on `pem`.
    expect(errors.some(error => error.includes('opencode MCP openapi mismatch'))).toBe(true);
    expect(errors.some(error => error.includes('certs/ca.pem'))).toBe(true);
    expect(errors.some(error => error.toLowerCase().includes('"pem"'))).toBe(false);
  });

  test('reports an environment-variable mismatch', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, 'opencode.jsonc');
    const config = readFileSync(configPath, 'utf8').replace('{env:POSTMAN_API_KEY}', '{env:POSTMAN_TOKEN}');
    writeFileSync(configPath, config);

    expect(validateMcpParity(root).some(error => error.includes('MCP postman env contract differs between claude and opencode') && error.includes('POSTMAN_TOKEN'))).toBe(true);
  });

  test('reports a forwarded variable that Codex renamed', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('"API_BASE_URL,OPENAPI_SPEC_PATH"', '"API_BASE_URL,OPENAPI_SPEC_URL"'));

    const errors = validateMcpParity(root);
    expect(errors.some(error => error.includes('codex MCP openapi mismatch') && error.includes('OPENAPI_SPEC_URL'))).toBe(true);
    expect(errors.some(error => error.includes('MCP openapi env contract differs between claude and codex'))).toBe(true);
  });

  test('rejects a placeholder inside a Codex env table', () => {
    const root = contractFixture();
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, `${readFileSync(configPath, 'utf8')}\n[mcp_servers.openapi.env]\nAPI_BASE_URL = "\${API_BASE_URL}"\n`);

    expect(validateMcpParity(root)).toEqual([
      '.codex/config.toml openapi.env cannot reference API_BASE_URL: Codex does not expand placeholders. Forward the variable through env_vars instead.',
    ]);
  });
});

describe('project-declared MCP set', () => {
  // A downstream project (no `dbhub`, no `postman`, plus `supabase`) is the
  // canonical set for ITS three configs: `.mcp.json` declares, the other two
  // must match.

  test('accepts a project whose set differs from the boilerplate on every host', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    expect(declaredMcpIds(root)).toEqual([...PROJECT_IDS].sort());
    expect(validateMcpParity(root)).toEqual([]);
  });

  test('reports a declared server that Codex does not carry', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    write(root, '.codex/config.toml', codexToml(PROJECT_IDS.filter(id => id !== 'supabase')));

    expect(validateMcpParity(root)).toEqual([
      'MCP supabase missing from codex: declared in .mcp.json, absent from .codex/config.toml',
    ]);
  });

  test('reports a server that only OpenCode carries', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    write(root, 'opencode.jsonc', opencodeJsonc([...PROJECT_IDS, 'dbhub']));

    expect(validateMcpParity(root)).toEqual([
      'MCP dbhub present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
    ]);
  });

  test('still pins the per-host shape of a known server the project declares', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    // Same .env dependencies, different command shape: only the strict check sees it.
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('"--tools", "dynamic"]', '"--tools", "dynamic", "--read-only"]'));

    const errors = validateMcpParity(root);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith('codex MCP openapi mismatch: expected ');
    expect(errors[0]).toContain('--read-only');
  });

  test('in the boilerplate, requires the .env loader on a Codex server that needs .env values, known or not', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    // Strip the loader from every server: the unknown `supabase` still needs a variable.
    writeFileSync(configPath, withoutLoader(readFileSync(configPath, 'utf8')));

    const errors = validateMcpParity(root, { schemaOwner: true });
    expect(errors.some(e => e.startsWith('codex MCP supabase must launch through the .env loader'))).toBe(true);
    expect(errors.some(e => e.startsWith('codex MCP openapi must launch through the .env loader'))).toBe(true);
    // A server with nothing to load is left alone by the generic rule.
    expect(errors.some(e => e.startsWith('codex MCP context7 must launch'))).toBe(false);
  });

  test('downstream, a missing Codex loader is a warning that names the file and what to add', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, withoutLoader(readFileSync(configPath, 'utf8')));

    const { errors, warnings } = validateMcpParityFindings(root, { schemaOwner: false });
    expect(errors).toEqual([]);
    // The unknown server gets the generic loader warning; a known one gets
    // ONE launch warning, never a second one from the generic rule.
    const supabase = warnings.filter(w => w.startsWith('codex MCP supabase '));
    expect(supabase).toHaveLength(1);
    expect(supabase[0]).toContain('must launch through the .env loader in .codex/config.toml');
    expect(supabase[0]).toContain(`${MCP_ENV_LOADER_COMMAND} ${mcpEnvLoaderArgs(SUPABASE_VARS).join(' ')}`);
    const openapi = warnings.filter(w => w.startsWith('codex MCP openapi '));
    expect(openapi).toHaveLength(1);
    expect(openapi[0]).toStartWith(`codex MCP openapi launch is out of date in .codex/config.toml: launch it as \`${MCP_ENV_LOADER_COMMAND} `);
    // context7 needs no variable and its pinned shape has no loader: nothing to say.
    expect(warnings.some(w => w.startsWith('codex MCP context7'))).toBe(false);
    // The compat error group stays MCP, so the doctor and the updater place it.
    expect(warnings.every(w => /\bMCP\b/.test(w))).toBe(true);
  });

  test('ownership comes from package.json: the boilerplate errors, any other name warns', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, withoutLoader(readFileSync(configPath, 'utf8')));

    expect(validateMcpParity(root)).toEqual([]);
    write(root, 'package.json', JSON.stringify({ name: 'my-qa-project' }));
    expect(validateMcpParity(root)).toEqual([]);
    write(root, 'package.json', JSON.stringify({ name: 'agentic-qa-boilerplate' }));
    expect(validateMcpParity(root).some(e => e.includes('must launch through the .env loader'))).toBe(true);
  });

  test('in the boilerplate, pins the Codex startup budget of a known server', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('[mcp_servers.openapi]\ncommand = "bunx"\nenabled = true\nstartup_timeout_sec = 30\n', '[mcp_servers.openapi]\ncommand = "bunx"\nenabled = true\n'));

    const errors = validateMcpParity(root, { schemaOwner: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toStartWith('codex MCP openapi mismatch: expected ');
    expect(errors[0]).toContain(`"startupTimeoutSec":${CODEX_STARTUP_TIMEOUT_SEC}`);
  });

  test('downstream, a missing Codex startup budget is a warning; any other shape difference still fails', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('[mcp_servers.openapi]\ncommand = "bunx"\nenabled = true\nstartup_timeout_sec = 30\n', '[mcp_servers.openapi]\ncommand = "bunx"\nenabled = true\n'));

    const budget = validateMcpParityFindings(root, { schemaOwner: false });
    expect(budget.errors).toEqual([]);
    expect(budget.warnings).toEqual([
      `codex MCP openapi launch is out of date in .codex/config.toml: set startup_timeout_sec = ${CODEX_STARTUP_TIMEOUT_SEC} (Codex's 10-second default is too short for a bunx-fetched server on a cold cache). Upstream never overwrites this file, so change it by hand.`,
    ]);

    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('"--tools", "dynamic"]', '"--tools", "dynamic", "--read-only"]'));
    const shape = validateMcpParityFindings(root, { schemaOwner: false });
    expect(shape.warnings).toEqual([]);
    expect(shape.errors).toHaveLength(1);
    expect(shape.errors[0]).toStartWith('codex MCP openapi mismatch: expected ');
  });

  test('reads a loader-wrapped command as the server it starts, with its filter', () => {
    expect(unwrapEnvLoader('bunx', [...mcpEnvLoaderArgs(['A_X', 'B_Y']), 'bunx', '-y', 'pkg@1'])).toEqual({ command: 'bunx', args: ['-y', 'pkg@1'], envLoader: true, filter: ['A_X', 'B_Y'] });
    expect(unwrapEnvLoader('bunx', ['-y', 'pkg@1'])).toEqual({ command: 'bunx', args: ['-y', 'pkg@1'], envLoader: false, filter: null });
    // The unfiltered loader Codex used before: still a loader, no filter.
    expect(unwrapEnvLoader('bunx', [...LEGACY_CODEX_ENV_LOADER_ARGS, 'bunx', '-y', 'pkg@1'])).toEqual({ command: 'bunx', args: ['-y', 'pkg@1'], envLoader: true, filter: null });
    // A prefix with nothing after it is not a launch.
    expect(unwrapEnvLoader('bunx', mcpEnvLoaderArgs(['A_X'])).envLoader).toBe(false);
    expect(unwrapEnvLoader('bunx', [...LEGACY_CODEX_ENV_LOADER_ARGS]).envLoader).toBe(false);
  });

  test('a filter must list exact names: a glob cannot be compared across hosts', () => {
    expect(() => unwrapEnvLoader('bunx', [...mcpEnvLoaderArgs(['STRIPE_*']), 'bunx', 'pkg'])).toThrow('exact variable names');
  });

  test('pins the loader to the exact varlock version the repo installs', () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
    expect(MCP_ENV_LOADER_HEAD[1] as string).toBe(`varlock@${pkg.devDependencies.varlock}`);
    expect(LEGACY_CODEX_ENV_LOADER_ARGS[1] as string).toBe(`varlock@${pkg.devDependencies.varlock}`);
    // JSON-RPC on stdio: varlock must not redact (rewrite) the server's output.
    expect(MCP_ENV_LOADER_HEAD).toContain('--no-redact-stdout');
    // Least privilege: only the named variables, and no blob holding them all.
    expect(MCP_ENV_LOADER_HEAD.slice(-3)).toEqual(['--inject', 'vars', '--filter']);
  });

  test('a loader-launched server that also takes a variable from the host fails in the boilerplate, warns downstream', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.supabase.env.SUPABASE_ACCESS_TOKEN = '\${SUPABASE_ACCESS_TOKEN}';
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const owner = validateMcpParity(root, { schemaOwner: true });
    expect(owner.some(e => e.startsWith('claude MCP supabase launches through the .env loader but also takes SUPABASE_ACCESS_TOKEN from the host'))).toBe(true);
    const downstream = validateMcpParityFindings(root, { schemaOwner: false });
    expect(downstream.errors).toEqual([]);
    expect(downstream.warnings.some(w => w.startsWith('claude MCP supabase launches through the .env loader but also takes'))).toBe(true);
  });

  test('downstream, the pre-loader shape of a known server is one warning per host naming the exact launch', () => {
    const root = contractFixture(undefined, BOILERPLATE_IDS);
    const configPath = join(root, '.mcp.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    config.mcpServers.openapi = {
      command: 'bunx',
      args: ['-y', '@ivotoby/openapi-mcp-server@1.16.1', '--tools', 'dynamic'],
      env: { API_BASE_URL: '\${API_BASE_URL}', OPENAPI_SPEC_PATH: '\${OPENAPI_SPEC_PATH}' },
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const { errors, warnings } = validateMcpParityFindings(root, { schemaOwner: false });
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toStartWith('claude MCP openapi launch is out of date in .mcp.json: launch it as `bunx -p varlock@');
    expect(warnings[0]).toContain('--filter API_BASE_URL,OPENAPI_SPEC_PATH');
    expect(warnings[0]).toContain('drop the host-side reference to API_BASE_URL, OPENAPI_SPEC_PATH');
    expect(validateMcpParity(root, { schemaOwner: true }).some(e => e.startsWith('claude MCP openapi mismatch'))).toBe(true);
  });

  test('compares the .env contract of an unknown server across hosts', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('"--filter", "SUPABASE_ACCESS_TOKEN"', '"--filter", "SUPABASE_ACCESS_TOKEN,SUPABASE_PROJECT_REF"'));

    expect(validateMcpParity(root)).toEqual([
      'MCP supabase env contract differs between claude and codex: {"dependsOn":["SUPABASE_ACCESS_TOKEN"],"literalEnv":{"LOG_LEVEL":"error"}} vs {"dependsOn":["SUPABASE_ACCESS_TOKEN","SUPABASE_PROJECT_REF"],"literalEnv":{"LOG_LEVEL":"error"}}',
    ]);
  });

  test('compares the literal settings of an unknown server across hosts', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8').replace('LOG_LEVEL = "error"', 'LOG_LEVEL = "debug"'));

    expect(validateMcpParity(root)).toEqual([
      'MCP supabase env contract differs between claude and codex: {"dependsOn":["SUPABASE_ACCESS_TOKEN"],"literalEnv":{"LOG_LEVEL":"error"}} vs {"dependsOn":["SUPABASE_ACCESS_TOKEN"],"literalEnv":{"LOG_LEVEL":"debug"}}',
    ]);
  });

  test('leaves an unknown server alone when its shape differs but its contract matches', () => {
    const root = contractFixture(undefined, PROJECT_IDS);
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, readFileSync(configPath, 'utf8')
      .replace('args = ["-y", "@supabase/mcp-server-supabase@latest", "--read-only"]', 'args = ["-y", "@supabase/mcp-server-supabase@latest"]'));

    expect(validateMcpParity(root)).toEqual([]);
  });
});

describe('canonical sources', () => {
  test('requires AGENTS.md, the skills store and a byte-exact CLAUDE.md shim', () => {
    const root = temporaryRoot();
    expect(validateCanonicalSources(root)).toEqual(['Canonical instructions missing: AGENTS.md']);

    write(root, 'AGENTS.md', '# memory\n');
    mkdirSync(join(root, '.agents/skills'), { recursive: true });
    expect(validateCanonicalSources(root)).toEqual(['Claude instruction shim missing: CLAUDE.md']);

    write(root, 'CLAUDE.md', '@AGENTS.md\n\nSome operational prose.\n');
    expect(validateCanonicalSources(root)).toEqual(['CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.']);

    write(root, 'CLAUDE.md', CLAUDE_INSTRUCTIONS_SHIM);
    expect(validateCanonicalSources(root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A CRLF checkout — what a downstream project gets under `core.autocrlf=true`
// once `.gitattributes` is deleted. Every generated surface is written with
// pure `\n`, so byte equality against the file git hands back is what breaks:
// the shim comparison threw (killing `agents:compat:check`, `repo:check` and
// the pre-push hook together). `crlf()` is what git's conversion does.
// ---------------------------------------------------------------------------

function crlf(text: string): string {
  return text.replace(/\n/g, '\r\n');
}

describe('CRLF checkout', () => {
  test('normalizeNewlines maps CRLF to LF and leaves LF alone', () => {
    expect(normalizeNewlines('@AGENTS.md\r\n')).toBe(CLAUDE_INSTRUCTIONS_SHIM);
    expect(normalizeNewlines(CLAUDE_INSTRUCTIONS_SHIM)).toBe(CLAUDE_INSTRUCTIONS_SHIM);
  });

  test('accepts a CRLF shim and still rejects a shim that grew prose', () => {
    const root = temporaryRoot();
    write(root, 'AGENTS.md', '# memory\n');
    mkdirSync(join(root, '.agents/skills'), { recursive: true });

    write(root, 'CLAUDE.md', crlf(CLAUDE_INSTRUCTIONS_SHIM));
    expect(validateCanonicalSources(root)).toEqual([]);

    write(root, 'CLAUDE.md', crlf('@AGENTS.md\n\nSome operational prose.\n'));
    expect(validateCanonicalSources(root)).toEqual(['CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.']);
  });
});

describe('Claude skills alias', () => {
  test('constructs portable POSIX and Windows alias plans', () => {
    const root = temporaryRoot();
    expect(claudeSkillsAliasPlan(root, 'linux')).toMatchObject({
      target: POSIX_CLAUDE_SKILLS_TARGET,
      type: 'symlink',
    });
    expect(claudeSkillsAliasPlan(root, 'win32')).toMatchObject({
      target: join(root, '.agents', 'skills'),
      type: 'junction',
    });
  });

  test('isInside survives a separator mismatch and rejects a sibling prefix', () => {
    const root = temporaryRoot();
    expect(isInside(join(root, '.agents/skills/acli'), join(root, '.agents/skills'))).toBe(true);
    expect(isInside(join(root, '.agents/skills'), join(root, '.agents/skills'))).toBe(true);
    expect(isInside(join(root, '.agents/skills-extra/acli'), join(root, '.agents/skills'))).toBe(false);
  });

  test('creates the relative symlink and reports it valid on the second pass', () => {
    const root = repositoryFixture();
    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({ status: 'created', target: POSIX_CLAUDE_SKILLS_TARGET });
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
    expect(readFileSync(join(root, '.claude/skills/project-context/SKILL.md'), 'utf8')).toContain('name: project-context');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test('accepts a junction target that differs only in case', () => {
    // A Windows filesystem is case-insensitive, and `readlinkSync` can return a
    // drive-letter (or any segment) cased differently from `process.cwd()`. A
    // case-sensitive comparison called that an unexpected target and made the
    // repair unlink and recreate a junction that was already correct.
    const root = repositoryFixture();
    const canonical = join(root, '.agents', 'skills');
    mkdirSync(join(root, '.claude'), { recursive: true });
    symlinkSync(canonical.replace('.agents', '.AGENTS'), join(root, '.claude/skills'), 'dir');

    expect(checkAgentCompatibility(root, 'win32').alias.status).toBe('valid');
    expect(repairClaudeSkillsAlias(root, 'win32').status).toBe('valid');
  });

  test('re-points a symlink aimed somewhere else', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'elsewhere'), { recursive: true });
    symlinkSync('../elsewhere', join(root, '.claude/skills'), 'dir');

    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('repaired');
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
  });

  test('refuses to replace a real Claude skills directory', () => {
    const root = repositoryFixture();
    write(root, '.claude/skills/owned.txt', 'preserve me\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/owned.txt'), 'utf8')).toBe('preserve me\n');
  });

  test('reclaims the skills CLI per-skill symlink shim without losing a skill body', () => {
    // `bunx skills add` (project level) writes the body to .agents/skills/<slug>/ and then
    // creates .claude/skills/ as a REAL directory of per-skill symlinks. `bun run setup`
    // installs community skills BEFORE repairing compatibility, so this is what a clean
    // clone actually looks like at repair time. Refusing here aborted the install.
    const root = repositoryFixture();
    write(root, '.agents/skills/playwright-cli/SKILL.md', 'body\n');
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    write(root, '.claude/skills/.DS_Store', '');

    expect(repairClaudeSkillsAlias(root, 'linux')).toMatchObject({
      target: POSIX_CLAUDE_SKILLS_TARGET,
      status: 'repaired',
    });
    expect(readFileSync(join(root, '.agents/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(readFileSync(join(root, '.claude/skills/playwright-cli/SKILL.md'), 'utf8')).toBe('body\n');
    expect(repairClaudeSkillsAlias(root, 'linux').status).toBe('valid');
  });

  test('still refuses a shim directory that also holds real content', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, '.agents/skills/playwright-cli'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/playwright-cli', join(root, '.claude/skills/playwright-cli'), 'dir');
    write(root, '.claude/skills/hand-written.md', 'mine\n');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
    expect(readFileSync(join(root, '.claude/skills/hand-written.md'), 'utf8')).toBe('mine\n');
  });

  test('refuses a symlink shim pointing outside the canonical skills store', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'elsewhere/rogue'), { recursive: true });
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../elsewhere/rogue', join(root, '.claude/skills/rogue'), 'dir');

    expect(() => repairClaudeSkillsAlias(root, 'linux')).toThrow('Refusing to replace');
  });
});

describe('commands shadowing a skill', () => {
  test('finds a command, on either host and in a subdirectory, whose name is a repo skill', () => {
    const root = repositoryFixture();
    write(root, '.claude/commands/project-context.md', '---\ndescription: mine\n---\n\nDo it my way.\n');
    write(root, '.opencode/commands/team/sync-ai-context.md', 'Do it my way.\n');
    write(root, '.claude/commands/deploy.md', 'A project command with its own name.\n');
    write(root, '.opencode/commands/.DS_Store', '');
    // A folder without SKILL.md is not a skill, so its name is free.
    mkdirSync(join(root, '.agents/skills/deploy'), { recursive: true });

    expect(commandsShadowingSkills(root)).toEqual([
      { path: '.claude/commands/project-context.md', skill: 'project-context' },
      { path: '.opencode/commands/team/sync-ai-context.md', skill: 'sync-ai-context' },
    ]);
    expect(checkAgentCompatibility(root, 'linux').errors).toContain(
      `Command shadows skill project-context: .claude/commands/project-context.md; a command with a skill's name hides the skill's instructions (\`bun run agents:compat\` moves it to ${SHADOWING_COMMANDS_BACKUP_DIR}/)`,
    );
  });

  test('moves each one to the backup dir with its path, and leaves every other command alone', () => {
    const root = repositoryFixture();
    write(root, '.claude/commands/project-context.md', 'Do it my way.\n');
    write(root, '.claude/commands/deploy.md', 'Mine.\n');

    expect(removeShadowingCommands(root)).toEqual(['.claude/commands/project-context.md']);
    expect(existsSync(join(root, '.claude/commands/project-context.md'))).toBe(false);
    expect(readFileSync(join(root, SHADOWING_COMMANDS_BACKUP_DIR, '.claude/commands/project-context.md'), 'utf8')).toBe('Do it my way.\n');
    expect(readFileSync(join(root, '.claude/commands/deploy.md'), 'utf8')).toBe('Mine.\n');
    expect(commandsShadowingSkills(root)).toEqual([]);
    expect(removeShadowingCommands(root)).toEqual([]);
  });

  test('without command directories there is nothing to report', () => {
    const root = repositoryFixture();
    expect(commandsShadowingSkills(root)).toEqual([]);
  });
});

describe.skipIf(!HAS_OPENCODE)('checkAgentCompatibility', () => {
  test('passes on a repository with alias, adapters and parity in place', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');

    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, errors: [], warnings: [], alias: { status: 'valid' } });
  });

  test('a downstream Codex launch gap passes with a warning; the boilerplate fails on the same file', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    const configPath = join(root, '.codex/config.toml');
    writeFileSync(configPath, withoutLoader(readFileSync(configPath, 'utf8')));

    const downstream = checkAgentCompatibility(root, 'linux');
    expect(downstream.ok).toBe(true);
    expect(downstream.errors).toEqual([]);
    expect(downstream.warnings.length).toBeGreaterThan(0);
    expect(downstream.warnings.every(w => w.includes('.codex/config.toml'))).toBe(true);

    write(root, 'package.json', JSON.stringify({ name: 'agentic-qa-boilerplate' }));
    const owner = checkAgentCompatibility(root, 'linux');
    expect(owner.ok).toBe(false);
    expect(owner.warnings).toEqual([]);
    expect(owner.errors.some(e => e.includes('must launch through the .env loader'))).toBe(true);
  });

  test('reports the missing alias together with every contract error', () => {
    const root = repositoryFixture();
    rmSync(join(root, '.codex/hooks.json'));

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.ok).toBe(false);
    expect(result.alias.status).toBe('missing');
    expect(result.errors).toContain('Hook compatibility file missing: .codex/hooks.json');
    expect(result.errors).toContain('Claude skills alias missing: .claude/skills');
  });

  test('flags a real directory sitting where the alias should be', () => {
    const root = repositoryFixture();
    write(root, '.claude/skills/owned.txt', 'mine\n');

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.alias.status).toBe('invalid');
    expect(result.errors).toContain('Refusing compatibility state: .claude/skills exists but is not a generated symlink or junction.');
  });
});

describe('one-harness projects (ADR-0012)', () => {
  const OPENCODE_AND_CODEX = ['opencode.jsonc', OPENCODE_PLUGIN, '.codex/config.toml', '.codex/hooks.json'];

  test('a Claude-only project passes with one note per harness it dropped', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    for (const file of OPENCODE_AND_CODEX) { rmSync(join(root, file), { force: true }); }

    const result = checkAgentCompatibility(root, 'linux');
    expect(result).toMatchObject({ ok: true, errors: [], harnesses: ['claude'], alias: { status: 'valid' } });
    expect(result.notes).toEqual(['opencode: none of its files present, skipped', 'codex: none of its files present, skipped']);
  });

  test('one file of a harness still in use is drift, not a choice', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    rmSync(join(root, '.codex/config.toml'));

    expect(checkAgentCompatibility(root, 'linux').errors).toContain('MCP config missing for codex: .codex/config.toml (a harness in use; declare `harnesses:` in .agents/project.yaml to drop it)');
  });

  test.skipIf(!HAS_OPENCODE)('an OpenCode-only project needs no CLAUDE.md, no alias and no .mcp.json', () => {
    const root = repositoryFixture();
    for (const file of ['CLAUDE.md', '.mcp.json', '.claude/settings.json', '.codex/config.toml', '.codex/hooks.json']) { rmSync(join(root, file)); }
    write(root, '.agents/project.yaml', 'harnesses: [opencode]\n');

    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, errors: [], harnesses: ['opencode'], alias: { status: 'not-used' } });
    expect(declaredMcpIds(root)).toEqual([...BOILERPLATE_IDS].sort());
  });

  test('the boilerplate keeps failing on a deleted adapter', () => {
    const root = repositoryFixture();
    repairClaudeSkillsAlias(root, 'linux');
    write(root, 'package.json', JSON.stringify({ name: 'agentic-qa-boilerplate' }));
    for (const file of OPENCODE_AND_CODEX) { rmSync(join(root, file), { force: true }); }

    const result = checkAgentCompatibility(root, 'linux');
    expect(result.ok).toBe(false);
    expect(result.harnesses).toEqual(['claude', 'opencode', 'codex']);
    expect(result.errors).toContain('Hook compatibility file missing: .codex/hooks.json');
    expect(result.errors).toContain('MCP config missing for codex: .codex/config.toml (the boilerplate checks all three harnesses)');
  });

  test('a two-harness project without Claude compares against the first declared harness', () => {
    const root = contractFixture();
    write(root, '.agents/project.yaml', 'harnesses: [codex, opencode]\n');
    rmSync(join(root, '.mcp.json'));
    write(root, 'opencode.jsonc', opencodeJsonc(BOILERPLATE_IDS.filter(id => id !== 'context7')));

    expect(validateMcpParity(root)).toEqual(['MCP context7 missing from opencode: declared in .codex/config.toml, absent from opencode.jsonc']);
  });
});

describe.skipIf(!HAS_OPENCODE)('repairAgentSurfaces', () => {
  test('creates the alias, moves a command that shadows a skill and passes the check', () => {
    const root = repositoryFixture();
    write(root, '.opencode/commands/project-context.md', 'Mine.\n');

    const repair = repairAgentSurfaces(root, {}, 'linux');
    expect(repair.aliasDeferred).toBe(false);
    expect(repair.alias?.status).toBe('created');
    expect(readlinkSync(join(root, '.claude/skills'))).toBe(POSIX_CLAUDE_SKILLS_TARGET);
    expect(repair.shadowingCommandsMoved).toEqual(['.opencode/commands/project-context.md']);
    expect(repair.check).toMatchObject({ ok: true, errors: [] });
  });

  test('with the migration just applied, the alias waits for the commit and the check does not count it', () => {
    const root = repositoryFixture();

    const repair = repairAgentSurfaces(root, { deferSkillsAlias: true }, 'linux');
    expect(repair.aliasDeferred).toBe(true);
    expect(repair.alias).toBeNull();
    expect(existsSync(join(root, '.claude/skills'))).toBe(false);
    expect(existsSync(join(root, SKILLS_ALIAS_DEFERRED_MARKER))).toBe(true);
    expect(repair.check).toMatchObject({ ok: true, errors: [], alias: { status: 'deferred' } });
    // The pre-commit gate runs the same check and must pass on the migration commit.
    expect(checkAgentCompatibility(root, 'linux')).toMatchObject({ ok: true, alias: { status: 'deferred' } });
    // Everything else is still enforced.
    rmSync(join(root, '.codex/hooks.json'));
    const broken = repairAgentSurfaces(root, { deferSkillsAlias: true }, 'linux');
    expect(broken.check.ok).toBe(false);
    expect(broken.check.errors).toEqual(['Hook compatibility file missing: .codex/hooks.json']);
    // And `bun run agents:compat` afterwards creates it as usual and ends the deferral.
    expect(repairAgentSurfaces(root, {}, 'linux').alias?.status).toBe('created');
    expect(existsSync(join(root, SKILLS_ALIAS_DEFERRED_MARKER))).toBe(false);
    // Without the marker, a missing alias is the error it always was.
    rmSync(join(root, '.claude/skills'));
    expect(checkAgentCompatibility(root, 'linux').errors).toContain(SKILLS_ALIAS_MISSING_ERROR);
  });
});

describe('compatibility report grouping', () => {
  // With pre-existing MCP drift, a flat error list hides the "alias deferred"
  // message, so "alias pending commit" and "real drift" become indistinguishable.
  test('errors bucket per surface in a fixed order, empty groups omitted', () => {
    const groups = groupCompatibilityErrors([
      'MCP postman missing from codex: declared in .mcp.json, absent from .codex/config.toml',
      'Command shadows skill x: .claude/commands/x.md; a command with a skill\'s name hides the skill\'s instructions',
      'Claude skills alias missing: .claude/skills',
      'codex hook command must be exactly: node x',
      'CLAUDE.md must contain exactly `@AGENTS.md` followed by one newline.',
      'MCP tavily present in opencode only: declare it in .mcp.json or remove it from opencode.jsonc',
      'eslint.config.js does not wire KATA_IMPORT_ALIASES from eslint.config.base.js: the rule ships but enforces nothing. Add it to the import and to the antfu(...) call.',
    ]);
    expect(groups.map(g => [g.group, g.errors.length])).toEqual([['instructions', 1], ['alias', 1], ['commands', 1], ['hooks', 1], ['mcp', 2], ['lint', 1]]);
    expect(groups.map(g => g.label)).toEqual(COMPATIBILITY_GROUP_ORDER.map(g => COMPATIBILITY_GROUP_LABEL[g]));
    expect(groupCompatibilityErrors([])).toEqual([]);
  });

  test('the alias line reads the same whatever the verdict, and says deferred when the marker is set', () => {
    const alias = { path: '/repo/.claude/skills', target: '../.agents/skills', type: 'symlink' as const };
    expect(describeAliasStatus({ ...alias, status: 'deferred' })).toContain('deferred until the migration commit');
    expect(describeAliasStatus({ ...alias, status: 'created' })).toBe('Claude skills alias created: /repo/.claude/skills -> ../.agents/skills (symlink)');
    expect(describeAliasStatus({ ...alias, status: 'valid' })).toContain('OK');
    expect(describeAliasStatus({ ...alias, status: 'missing' })).toContain('bun run agents:compat');
    expect(describeAliasStatus({ ...alias, status: 'invalid' })).toContain('not the generated symlink');
  });
});

describe('documentation-contract hook (ADR-0016)', () => {
  test('the real repository registers it on both command hosts', () => {
    expect(validateDocContractHooks(REPO_ROOT)).toEqual([]);
  });

  test('binds only in the boilerplate itself', () => {
    const root = contractFixture();
    expect(validateDocContractHooks(root, ['claude', 'codex'], false)).toEqual([]);
    expect(validateDocContractHooks(root, ['claude', 'codex'], true)).toEqual([`Documentation-contract hook missing: ${DOC_CONTRACTS_HOOK}`]);
    copyFromRepo(root, DOC_CONTRACTS_HOOK);
    const errors = validateDocContractHooks(root, ['claude', 'codex'], true);
    expect(errors.some(e => e.startsWith('claude must register the documentation-contract hook'))).toBe(true);
    expect(errors.some(e => e.startsWith('codex must register the documentation-contract hook'))).toBe(true);
    expect(validateDocContractHooks(root, ['opencode'], true)).toEqual([]);
  });
});
