import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { validateMcpParityFindings } from './agent-compatibility-contracts.ts';

const FAKE = {
  slack: ['xoxp', '1111111111', 'fakefakefake'].join('-'),
  supabase: ['sbp', 'f4k3f4k3f4k3f4k3f4k3f4k3f4k3f4k3'].join('_'),
  n8n: 'n8n-fake-api-key-0000',
  bearer: 'Bearer fakebearer000',
  youtube: 'yt-fake-secret-0000',
};

const roots: string[] = [];
const outputs: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

const RELAYED = ['context7', 'shadcn', 'supabase', 'n8n-mcp', 'slack-aurora', 'youtube', 'yt-dlp'];

function canonical(): Record<string, unknown> {
  return {
    'shadcn': { command: 'npx', args: ['shadcn@latest', 'mcp'] },
    'context7': { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    'slack-aurora': { command: 'npx', args: ['-y', 'slack-mcp-server@latest', '--transport', 'stdio'], env: { SLACK_MCP_ADD_MESSAGE_TOOL: 'true', SLACK_MCP_XOXP_TOKEN: FAKE.slack } },
    'supabase': { command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@latest'], env: { SUPABASE_ACCESS_TOKEN: FAKE.supabase } },
    'n8n-mcp': { command: 'npx', args: ['n8n-mcp'], env: { DISABLE_CONSOLE_OUTPUT: 'true', LOG_LEVEL: 'error', MCP_MODE: 'stdio', N8N_API_KEY: FAKE.n8n, N8N_API_URL: 'https://fake.example' } },
    'instance-n8n-mcp': { type: 'http', url: 'https://fake.example/mcp', headers: { Authorization: FAKE.bearer } },
    'yt-dlp': { type: 'stdio', command: 'npx', args: ['-y', '@kevinwatt/yt-dlp-mcp@0.10.0'], env: { YTDLP_DOWNLOADS_DIR: '/tmp/fake' } },
    'youtube': { command: '/fake/bin/youtube-studio-mcp', args: [], env: { YOUTUBE_MCP_CLIENT_SECRET: FAKE.youtube } },
  };
}

function relayEntries(): Record<string, unknown> {
  return Object.fromEntries(RELAYED.map(id => [id, { command: 'bun', args: ['scripts/mcp-launch.ts', id] }]));
}

interface Shape {
  checks?: string
  mcp?: Record<string, unknown> | null
  pi?: Record<string, unknown>
  gitignore?: string
  trackMcp?: boolean
  trackLauncher?: boolean
}

function git(root: string, args: string[]): void {
  Bun.spawnSync(['git', '-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', ...args], { cwd: root, stdout: 'ignore', stderr: 'ignore' });
}

function fixture(shape: Shape = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-parity-scope-'));
  roots.push(root);
  const write = (rel: string, text: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  write('package.json', '{"name":"fake-app"}\n');
  write('.gitignore', shape.gitignore ?? '.mcp.json\n');
  write('scripts/mcp-launch.ts', 'export {};\n');
  write('.pi/mcp.json', `${JSON.stringify({ mcpServers: shape.pi ?? relayEntries() }, null, 2)}\n`);
  if (shape.mcp !== null) { write('.mcp.json', `${JSON.stringify({ mcpServers: shape.mcp ?? canonical() }, null, 2)}\n`); }
  if (shape.checks !== undefined) { write('.agents/project.yaml', shape.checks); }
  git(root, ['init', '-q']);
  git(root, ['add', '.gitignore', 'package.json', '.pi', ...(shape.checks !== undefined ? ['.agents'] : []), ...(shape.trackLauncher === false ? [] : ['scripts'])]);
  if (shape.trackMcp === true) { git(root, ['add', '-f', '.mcp.json']); }
  git(root, ['commit', '-q', '-m', 'fixture']);
  return root;
}

function parity(root: string, schemaOwner = false): { errors: string[], warnings: string[] } {
  const found = validateMcpParityFindings(root, { harnesses: ['claude', 'pi'], schemaOwner });
  outputs.push(...found.errors, ...found.warnings);
  return found;
}

const GALAXY = 'checks:\n  mcp_parity:\n    mode: local-only\n    relay:\n      pi: [bun, scripts/mcp-launch.ts]\n';
const HTTP_GAP = 'MCP instance-n8n-mcp missing from pi: declared in .mcp.json, absent from .pi/mcp.json (the relay carries stdio only: connect this server at user level, ADR-0005, or declare it in the relay host directly)';

const GOLDEN = [
  'MCP instance-n8n-mcp missing from pi: declared in .mcp.json, absent from .pi/mcp.json',
  'claude MCP context7 mismatch: expected {"transport":"stdio","command":"bunx","args":["-y","@upstash/context7-mcp@4.0.3"],"dependsOn":[],"literalEnv":{},"enabled":true,"envLoader":false,"hostRefs":[]}, found {"transport":"stdio","command":"npx","args":["-y","@upstash/context7-mcp"],"dependsOn":[],"literalEnv":{},"enabled":true,"envLoader":false,"hostRefs":[]}',
  'claude MCP slack-aurora mismatch: expected {"transport":"stdio","command":"bunx","args":["-y","slack-mcp-server@latest","--transport","stdio"],"dependsOn":["SLACK_MCP_REACTION_TOOL","SLACK_MCP_XOXP_TOKEN"],"literalEnv":{"SLACK_MCP_ADD_MESSAGE_TOOL":"true"},"enabled":true,"envLoader":true,"hostRefs":[]}, found {"transport":"stdio","command":"npx","args":["-y","slack-mcp-server@latest","--transport","stdio"],"dependsOn":[],"literalEnv":{"SLACK_MCP_ADD_MESSAGE_TOOL":"true","SLACK_MCP_XOXP_TOKEN":"<redacted>"},"enabled":true,"envLoader":false,"hostRefs":[]}',
  'pi MCP context7 mismatch: expected {"transport":"stdio","command":"bunx","args":["-y","@upstash/context7-mcp@4.0.3"],"dependsOn":[],"literalEnv":{},"enabled":true,"envLoader":false,"hostRefs":[]}, found {"transport":"stdio","command":"bun","args":["scripts/mcp-launch.ts","context7"],"dependsOn":[],"literalEnv":{},"enabled":true,"envLoader":false,"hostRefs":[]}',
  'pi MCP slack-aurora mismatch: expected {"transport":"stdio","command":"bunx","args":["-y","slack-mcp-server@latest","--transport","stdio"],"dependsOn":["SLACK_MCP_REACTION_TOOL","SLACK_MCP_XOXP_TOKEN"],"literalEnv":{"SLACK_MCP_ADD_MESSAGE_TOOL":"true"},"enabled":true,"envLoader":true,"hostRefs":[]}, found {"transport":"stdio","command":"bun","args":["scripts/mcp-launch.ts","slack-aurora"],"dependsOn":[],"literalEnv":{},"enabled":true,"envLoader":false,"hostRefs":[]}',
  'MCP n8n-mcp env contract differs between claude and pi: {"dependsOn":[],"literalEnv":{"DISABLE_CONSOLE_OUTPUT":"true","LOG_LEVEL":"error","MCP_MODE":"stdio","N8N_API_KEY":"<redacted>","N8N_API_URL":"https://fake.example"}} vs {"dependsOn":[],"literalEnv":{}}',
  'MCP slack-aurora env contract differs between claude and pi: {"dependsOn":[],"literalEnv":{"SLACK_MCP_ADD_MESSAGE_TOOL":"true","SLACK_MCP_XOXP_TOKEN":"<redacted>"}} vs {"dependsOn":[],"literalEnv":{}}',
  'MCP supabase env contract differs between claude and pi: {"dependsOn":[],"literalEnv":{"SUPABASE_ACCESS_TOKEN":"<redacted>"}} vs {"dependsOn":[],"literalEnv":{}}',
  'MCP youtube env contract differs between claude and pi: {"dependsOn":[],"literalEnv":{"YOUTUBE_MCP_CLIENT_SECRET":"<redacted>"}} vs {"dependsOn":[],"literalEnv":{}}',
  'MCP yt-dlp env contract differs between claude and pi: {"dependsOn":[],"literalEnv":{"YTDLP_DOWNLOADS_DIR":"<redacted>"}} vs {"dependsOn":[],"literalEnv":{}}',
];

describe('checks.mcp_parity', () => {
  test('without the key, and with the shipped default block, the findings are byte for byte the ones before the key existed', () => {
    expect(parity(fixture())).toEqual({ errors: GOLDEN, warnings: [] });
    expect(parity(fixture({ checks: 'checks:\n  mcp_parity:\n    mode: strict\n    relay: {}\n' }))).toEqual({ errors: GOLDEN, warnings: [] });
  });

  test('local-only plus a pi relay leaves only the HTTP server the relay cannot carry', () => {
    expect(parity(fixture({ checks: GALAXY }))).toEqual({ errors: [HTTP_GAP], warnings: [] });
  });

  test('the relay alone clears the relayed entries; the local runner differences stay errors under strict', () => {
    const { errors } = parity(fixture({ checks: 'checks:\n  mcp_parity:\n    relay:\n      pi: [bun, scripts/mcp-launch.ts]\n' }));
    expect(errors).toEqual([HTTP_GAP, ...GOLDEN.filter(error => error.startsWith('claude MCP'))]);
  });

  test('local-only alone keeps every pi relay finding', () => {
    const { errors } = parity(fixture({ checks: 'checks:\n  mcp_parity:\n    mode: local-only\n' }));
    expect(errors).toEqual(GOLDEN.filter(error => !error.startsWith('claude MCP')));
  });

  test('an absent local file skips the set and the contract with a warning, and still checks the committed hosts', () => {
    expect(parity(fixture({ checks: GALAXY, mcp: null }))).toEqual({
      errors: [],
      warnings: ['MCP parity unverified: .mcp.json is absent (checks.mcp_parity.mode: local-only), so the server set and the env contract are not compared; the committed hosts are checked on their own.'],
    });
    const pi = { ...relayEntries(), extra: { command: 'bunx', args: ['extra-mcp'], env: { EXTRA_API_TOKEN: FAKE.n8n } } };
    expect(parity(fixture({ checks: GALAXY, mcp: null, pi })).errors).toEqual([
      'pi MCP extra holds a literal EXTRA_API_TOKEN in .pi/mcp.json: with checks.mcp_parity.mode: local-only, literal values live only in the local .mcp.json; reference the variable by name or relay the server',
    ]);
  });

  test('a local file that is tracked, or ignored only on this machine, fails closed', () => {
    expect(parity(fixture({ checks: GALAXY, trackMcp: true })).errors).toEqual([
      'MCP .mcp.json is tracked by git, but checks.mcp_parity.mode is local-only, so .mcp.json holds literal values: untrack it and ignore it in the committed .gitignore',
    ]);
    const root = fixture({ checks: GALAXY, gitignore: 'node_modules\n' });
    writeFileSync(join(root, '.git', 'info', 'exclude'), '.mcp.json\n');
    expect(parity(root).errors).toEqual([
      'MCP .mcp.json is ignored by .git/info/exclude, a per-machine rule, but checks.mcp_parity.mode is local-only, so .mcp.json holds literal values: ignore it in the committed .gitignore so every clone ignores it',
    ]);
    expect(parity(fixture({ checks: GALAXY, gitignore: 'node_modules\n' })).errors).toEqual([
      'MCP .mcp.json is not git-ignored, but checks.mcp_parity.mode is local-only, so .mcp.json holds literal values: ignore it in the committed .gitignore',
    ]);
  });

  test('a relay entry must be exactly the prefix plus its own id, and nothing else', () => {
    const pi = {
      ...relayEntries(),
      'context7': { command: 'bun', args: ['scripts/mcp-launch.ts', 'supabase'] },
      'shadcn': { command: 'bun', args: ['scripts/mcp-launch.ts', 'shadcn'], env: { SHADCN_TOKEN: FAKE.n8n } },
      'yt-dlp': { command: 'bun', args: ['scripts/mcp-launch.ts', 'yt-dlp', '--debug'] },
    };
    expect(parity(fixture({ checks: GALAXY, pi })).errors).toEqual([
      'pi MCP context7 relay in .pi/mcp.json: relays supabase but is declared as context7; the launch must be exactly [bun, scripts/mcp-launch.ts, context7]',
      'pi MCP shadcn relay in .pi/mcp.json: carries env; a relay entry holds only command and args, because the launcher delivers the canonical entry\'s own values',
      'pi MCP yt-dlp relay in .pi/mcp.json: the launch must be exactly [bun, scripts/mcp-launch.ts, yt-dlp]',
      HTTP_GAP,
      'pi MCP shadcn holds a literal SHADCN_TOKEN in .pi/mcp.json: with checks.mcp_parity.mode: local-only, literal values live only in the local .mcp.json; reference the variable by name or relay the server',
    ]);
  });

  test('a canonical entry the launcher cannot start is not relayable', () => {
    const mcp = { ...canonical(), supabase: { command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@latest'], env: { SUPABASE_ACCESS_TOKEN: ['$', '{SUPABASE_ACCESS_TOKEN}'].join('') } } };
    expect(parity(fixture({ checks: GALAXY, mcp })).errors).toContain(
      'pi MCP supabase cannot be relayed: its .mcp.json entry takes SUPABASE_ACCESS_TOKEN from the host, which the launcher does not expand; the launcher starts an enabled stdio entry with literal values only',
    );
  });

  test('the relay host and its launcher are validated before anything else', () => {
    expect(parity(fixture({ checks: GALAXY, trackLauncher: false })).errors).toEqual([
      'checks.mcp_parity.relay.pi launcher scripts/mcp-launch.ts: not tracked by git; a relay launcher is reviewed like any committed code',
    ]);
    expect(parity(fixture({ checks: 'checks:\n  mcp_parity:\n    relay:\n      pi: [bun, scripts/gone.ts]\n      codex: [bun, scripts/mcp-launch.ts]\n' })).errors).toEqual([
      'checks.mcp_parity.relay.pi launcher scripts/gone.ts: not found',
      'checks.mcp_parity.relay.codex: only pi is supported as a relay host',
    ]);
    expect(parity(fixture({ checks: 'checks:\n  mcp_parity:\n    mode: loose\n' })).errors).toEqual([
      'checks.mcp_parity.mode: must be one of strict, local-only (got "loose")',
    ]);
  });

  test('the boilerplate itself keeps strict parity', () => {
    expect(parity(fixture({ checks: GALAXY }), true).errors).toEqual([
      'checks.mcp_parity: the boilerplate checks strict parity; keep mode: strict and relay: {}',
    ]);
  });

  test('no fake secret value reaches any finding', () => {
    const text = outputs.join('\n');
    for (const value of Object.values(FAKE)) { expect(text).not.toContain(value); }
    expect(outputs.length).toBeGreaterThan(20);
  });
});
