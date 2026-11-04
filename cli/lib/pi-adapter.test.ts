/**
 * The Pi adapter against a fake `pi` object: the events it subscribes to, in the
 * order Pi fires them (`input`, `before_agent_start`, `tool_call`, `tool_result`,
 * `session_compact`). Imported only where it exists: a project on another
 * harness deletes it (ADR-0012), and a static import would fail `types:check`
 * there on every commit.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';

const REPO_ROOT = resolve(import.meta.dir, '..', '..');
const ADAPTER = join(REPO_ROOT, '.pi/extensions/agentic-qa.js');
const HAS_ADAPTER = existsSync(ADAPTER);
// eslint-disable-next-line ts/no-explicit-any -- a plain-JS adapter with no type declarations
const adapter: any = HAS_ADAPTER ? await import(ADAPTER) : null;

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

function fakePi(initialName = '') {
  const handlers = new Map<string, Handler>();
  let name = initialName;
  const pi = {
    on: (event: string, handler: Handler) => { handlers.set(event, handler); },
    getSessionName: () => name || undefined,
    setSessionName: (value: string) => { name = value; },
  };
  adapter.default(pi);
  const sessionId = `pi-adapter-test-${crypto.randomUUID()}`;
  const ctx = { cwd: REPO_ROOT, sessionManager: { getSessionId: () => sessionId } };
  // eslint-disable-next-line ts/no-explicit-any -- each event has its own result shape
  const fire = (event: string, payload: Record<string, unknown> = {}): any => handlers.get(event)!(payload, ctx);
  const prompt = (text: string) => {
    fire('input', { text, source: 'interactive' });
    return fire('before_agent_start', { messageType: 'user', prompt: text });
  };
  return { fire, prompt, name: () => name, sessionId };
}

const HANDLE = 'ORCA_TERMINAL_HANDLE';
let savedHandle: string | undefined;
beforeEach(() => {
  savedHandle = process.env[HANDLE];
  delete process.env[HANDLE];
});
afterEach(() => {
  if (savedHandle === undefined) { delete process.env[HANDLE]; }
  else { process.env[HANDLE] = savedHandle; }
});

describe.skipIf(!HAS_ADAPTER)('Pi adapter: prompt lines', () => {
  test('injects the shared lines as a hidden message', () => {
    const { prompt, sessionId } = fakePi();
    const result = prompt('hello');
    expect(result.message.display).toBe(false);
    expect(result.message.customType).toBe('agentic-qa.context');
    expect(result.message.content).toContain(`session=${sessionId} harness=pi`);
  });

  test('classifies the raw input, not the expanded skill body', () => {
    const { fire } = fakePi();
    fire('input', { text: 'hello', source: 'interactive' });
    const result = fire('before_agent_start', { messageType: 'user', prompt: 'commit and push this to the branch' });
    expect(result.message.content).not.toContain('ROUTE: read');
  });

  test('falls back to the event prompt when no input event fired', () => {
    const { fire } = fakePi();
    const result = fire('before_agent_start', { messageType: 'user', prompt: 'commit and push this to the branch' });
    expect(result.message.content).toContain('agent-git.md');
  });

  test('a custom-message run gets nothing and leaves the pending prompt alone', () => {
    const { fire } = fakePi();
    expect(fire('before_agent_start', { messageType: 'custom' })).toBeUndefined();
    fire('input', { text: 'commit and push this to the branch', source: 'interactive' });
    expect(fire('before_agent_start', { messageType: 'custom' })).toBeUndefined();
    const result = fire('before_agent_start', { messageType: 'user', prompt: 'expanded body' });
    expect(result.message.content).toContain('agent-git.md');
  });

  test('a compaction routes the same file again', () => {
    const { prompt, fire } = fakePi();
    expect(prompt('commit and push this to the branch').message.content).toContain('agent-git.md');
    expect(prompt('commit and push this to the branch').message.content).not.toContain('agent-git.md');
    fire('session_compact', { reason: 'manual' });
    expect(prompt('commit and push this to the branch').message.content).toContain('agent-git.md');
  });
});

describe.skipIf(!HAS_ADAPTER)('Pi adapter: session name', () => {
  test('a fleet token names the session and the identity line carries it', () => {
    process.env[HANDLE] = 'term_x';
    const { prompt, name } = fakePi();
    const result = prompt('/framework-development BK-1 fleet worker. Read the brief');
    expect(name()).toBe('BK-1--term_x');
    expect(result.message.content).toContain('session=BK-1--term_x harness=pi');
  });

  test('a name a human set stays', () => {
    const { prompt, name } = fakePi('my session');
    const result = prompt('/framework-development BK-1 fleet worker. Read the brief');
    expect(name()).toBe('my session');
    expect(result.message.content).toContain('session=my session harness=pi');
  });

  test('a name this adapter set moves to the next dispatch', () => {
    const { prompt, name } = fakePi();
    prompt('/framework-development BK-1 fleet worker. Read the brief');
    prompt('/framework-development BK-2 fleet worker. Read the brief');
    expect(name()).toBe('BK-2');
  });
});

describe.skipIf(!HAS_ADAPTER)('Pi adapter: ROUTE-PENDING', () => {
  const result = { toolName: 'bash', input: { command: 'ls' }, content: [{ type: 'text', text: 'out' }], structuredContent: { a: 1 } };

  test('appends the reminder once and keeps the structured content', () => {
    const { prompt, fire } = fakePi();
    prompt('commit and push this to the branch');
    const first = fire('tool_result', result);
    expect(first.content[0].text).toBe('out');
    expect(first.content[1].text).toContain('ROUTE-PENDING:');
    expect(first.structuredContent).toEqual({ a: 1 });
    expect(fire('tool_result', result)).toBeUndefined();
  });

  test('a read of the routed file clears it', () => {
    const { prompt, fire } = fakePi();
    prompt('commit and push this to the branch');
    expect(fire('tool_result', { toolName: 'read', input: { path: '.agents/instructions/agent-git.md' }, content: [] })).toBeUndefined();
    expect(fire('tool_result', result)).toBeUndefined();
  });

  test('a nested call never owes the turn a read', () => {
    const { prompt, fire } = fakePi();
    prompt('commit and push this to the branch');
    expect(fire('tool_result', { ...result, parentToolCallId: 'p' })).toBeUndefined();
  });
});

describe.skipIf(!HAS_ADAPTER)('Pi adapter: secret block', () => {
  const blocked = (toolName: string, input: Record<string, unknown>): boolean => adapter.secretBlockReason(toolName, input) !== '';

  // Parity is derived from Claude Code's deny list, so a secret entry added
  // there fails here until the adapter covers it.
  const deny = (JSON.parse(readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8')) as { permissions: { deny: string[] } }).permissions.deny;
  const readEntries = deny.flatMap(entry => /^Read\((.*)\)$/.exec(entry)?.[1] ?? []);
  const secretCommands = deny.flatMap(entry => /^Bash\(((?:bunx )?(?:varlock |printenv|env\b).*)\)$/.exec(entry)?.[1] ?? []);

  test('the parity source still names both kinds of entry', () => {
    expect(readEntries.length).toBeGreaterThan(0);
    expect(secretCommands.length).toBeGreaterThan(0);
  });

  test.each(readEntries)('refuses a read of Claude\'s deny entry %s', (entry) => {
    const path = entry.replace('**', 'tokens.env').replace('*', 'staging');
    expect(blocked('read', { path })).toBe(true);
    expect(blocked('read', { path: `/some/repo/${path}` })).toBe(true);
    expect(blocked('grep', { path })).toBe(true);
  });

  test.each(secretCommands)('refuses Claude\'s deny entry %s', (entry) => {
    const command = entry.replace('*', '');
    expect(blocked('bash', { command })).toBe(true);
    expect(blocked('bash', { command: `cd x && ${command}` })).toBe(true);
    expect(blocked('bash', { command: `FOO=1 ${command}` })).toBe(true);
  });

  test.each(['.env.staging', '@.env', '.auth/state.json'])('refuses %s, which Rule #1 names beyond the deny list', (path) => {
    expect(blocked('read', { path })).toBe(true);
  });

  test.each(['.env.example', '.env.schema', '.env.core.schema', 'src/env.ts', 'docs/.env-guide.md', '.authors', 'README.md', '.claude/settings.json'])('lets %s through', (path) => {
    expect(blocked('read', { path })).toBe(false);
  });

  test.each(['ls -la', 'env FOO=1 ls', 'git log --grep printenv', 'bunx varlock load --agent', 'bun run test'])('lets the command %s through', (command) => {
    expect(blocked('bash', { command })).toBe(false);
  });

  test.each([
    '.env/.',
    '.env/x/..',
    './.env/.',
    '.env/',
    'a/../.env',
    '.ENV',
    '.Env.Local',
    '.AUTH/state.json',
    '.CLAUDE/settings.local.json',
    '.claude/./settings.local.json',
    '.claude//settings.local.json',
    '.claude/x/../settings.local.json',
    '.auth\\state.json',
  ])('refuses the path variant %s', (path) => {
    expect(blocked('read', { path })).toBe(true);
    expect(blocked('grep', { path })).toBe(true);
  });

  test.each(['.ENV.EXAMPLE', '.Env.Schema', 'other/settings.local.json', '.claude/settings.json'])('still lets %s through', (path) => {
    expect(blocked('read', { path })).toBe(false);
  });

  test.each([
    ['read', {}],
    ['read', { path: 42 }],
    ['read', undefined],
    ['bash', {}],
    ['bash', { command: ['printenv'] }],
    ['grep', { path: {} }],
    ['grep', { glob: ['*'] }],
  ])('fails closed on a malformed %s call: %j', (toolName, input) => {
    expect(blocked(toolName, input as Record<string, unknown>)).toBe(true);
  });

  test('other tools and an omitted grep path pass without throwing', () => {
    expect(blocked('edit', { path: 'a.ts' })).toBe(false);
    expect(blocked('grep', {})).toBe(false);
    expect(blocked('grep', { path: null, glob: null })).toBe(false);
    expect(blocked('mcp__x__y', undefined as unknown as Record<string, unknown>)).toBe(false);
  });

  test.each(['grep -E \'dev|env|prod\' config.yml', 'echo \'x; printenv\'', 'git commit -m "a; printenv docs"', 'ls 2>&1'])('quoted text is not a command: %s', (command) => {
    expect(blocked('bash', { command })).toBe(false);
  });

  test.each(['FOO="a b" printenv', 'true & printenv', 'echo \'ok\'; printenv'])('still refuses %s', (command) => {
    expect(blocked('bash', { command })).toBe(true);
  });

  test.each(['.env', '.env*', '.ENV.local', '**/.env', '.auth/**', '**/settings.local.json'])('refuses the grep glob %s', (glob) => {
    expect(blocked('grep', { glob })).toBe(true);
  });

  test.each(['*', '**', '*.ts', 'src/**', '.env.example', '.env.*.schema', '*.local'])('lets the grep glob %s through to the output filter', (glob) => {
    expect(blocked('grep', { glob })).toBe(false);
  });

  test('the event handler answers with block and a reason', () => {
    const { fire } = fakePi();
    expect(fire('tool_call', { toolName: 'read', input: { path: '.env' } })).toMatchObject({ block: true, reason: expect.stringContaining('Rule #1') });
    expect(fire('tool_call', { toolName: 'read', input: { path: 'README.md' } })).toBeUndefined();
  });
});

// Pi's `grep` runs `rg --no-config --json --line-number --color=never --hidden
// [--glob <g>] -- <pattern> <path>` and prints `<path>:<line>: <text>`. These run
// the same command over throwaway canary files, in a real git repo whose
// `.gitignore` lists them, and hand the result to the adapter through the fake `pi`.
const RG = Bun.which('rg');
const CANARY = 'CANARY_VALUE_NOT_A_SECRET';

describe.skipIf(!HAS_ADAPTER || RG === null)('Pi adapter: grep output against real ripgrep', () => {
  const repo = mkdtempSync(join(tmpdir(), 'pi-grep-canary-'));
  afterAll(() => rmSync(repo, { recursive: true, force: true }));
  const files: Record<string, string> = {
    '.gitignore': '.env\n.env.*\n!.env.example\n.auth/\n.claude/settings.local.json\n',
    '.env': `TOKEN=${CANARY}\n`,
    '.env.local': `TOKEN=${CANARY}\n`,
    '.env.staging': `TOKEN=${CANARY}\n`,
    '.auth/state.json': `{"t":"${CANARY}"}\n`,
    '.claude/settings.local.json': `{"t":"${CANARY}"}\n`,
    '.env.example': `TOKEN=${CANARY}_EXAMPLE\n`,
    'src/app.ts': `// ${CANARY}_APP\n`,
  };
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), body);
  }
  Bun.spawnSync(['git', 'init', '-q'], { cwd: repo });

  /** What Pi's grep tool would hand the model, before the adapter. */
  const piGrep = (glob?: string): string => {
    const args = ['--no-config', '--json', '--line-number', '--color=never', '--hidden', ...(glob ? ['--glob', glob] : []), '--', CANARY, '.'];
    const out = new TextDecoder().decode(Bun.spawnSync([RG!, ...args], { cwd: repo }).stdout);
    return out.split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string, data: { path: { text: string }, line_number: number, lines: { text: string } } }).filter(event => event.type === 'match').map(event => `${event.data.path.text.replace(/^\.\//, '')}:${event.data.line_number}: ${event.data.lines.text.trimEnd()}`).join('\n');
  };

  test.each([undefined, '*', '**', '.*', '*.local', '*.staging', '*.json'])('glob %s: no secret line reaches the model', (glob) => {
    const { fire } = fakePi();
    const content = [{ type: 'text', text: piGrep(glob) }];
    const result = fire('tool_result', { toolName: 'grep', input: { pattern: CANARY, glob }, content, parentToolCallId: 'p' });
    const text = (result?.content ?? content).map((part: { text: string }) => part.text).join('\n');
    expect(text).not.toMatch(new RegExp(`${CANARY}(?!_)`));
  });

  test('the measurement is real: without the filter `*` returns the canaries, and the rest survive it', () => {
    const raw = piGrep('*');
    expect(raw).toMatch(new RegExp(`\\.env:1: TOKEN=${CANARY}$`, 'm'));
    expect(raw).toMatch(new RegExp(`\\.auth/state\\.json:1: .*${CANARY}`));

    const { fire } = fakePi();
    const result = fire('tool_result', { toolName: 'grep', input: {}, content: [{ type: 'text', text: raw }], parentToolCallId: 'p' });
    const text = result.content.map((part: { text: string }) => part.text).join('\n');
    expect(text).toContain(`${CANARY}_APP`);
    expect(text).toContain(`${CANARY}_EXAMPLE`);
    expect(text).toContain('withheld (Critical Rule #1)');
  });

  test('context lines are withheld too, and a look-alike line of an ordinary file stays', () => {
    const filtered = adapter.withholdSecretLines([{ type: 'text', text: `.env-1- TOKEN=${CANARY}\n.env-2- A:3: x\nsrc/a.ts-3- .env\nsrc/a.ts:4: see .env:1: there` }]);
    expect(filtered[0].text).toBe('src/a.ts-3- .env\nsrc/a.ts:4: see .env:1: there');
  });

  test('a result with no secret line stays untouched, and other tools are not filtered', () => {
    expect(adapter.withholdSecretLines([{ type: 'text', text: 'src/a.ts:4: fine' }])).toBeNull();
    const { fire } = fakePi();
    expect(fire('tool_result', { toolName: 'read', input: { path: 'x' }, content: [{ type: 'text', text: `.env:1: ${CANARY}` }], parentToolCallId: 'p' })).toBeUndefined();
  });
});
