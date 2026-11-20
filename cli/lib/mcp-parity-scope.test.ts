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
const HTTP_GAP = 'MCP instance-n8n-mcp missing from pi: declared in .mcp.json, absent from .pi/mcp.json (the relay carries stdio only: connect this server at user level, ADR-0005, declare it in the relay host directly, or record it in checks.mcp_parity.unrelayed.pi)';

const UNRELAYED = `${GALAXY}    unrelayed:\n      pi: [instance-n8n-mcp]\n`;
const NOT_CARRIED = 'MCP instance-n8n-mcp is not carried by pi: its .mcp.json entry is an http server, and the relay carries stdio only (checks.mcp_parity.unrelayed.pi); pi sessions run without it unless it is connected at user level (ADR-0005)';
const LOCAL_ONLY_TAIL = 'in .pi/mcp.json: with checks.mcp_parity.mode: local-only, literal values live only in the local .mcp.json; reference the variable by name or relay the server';

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
    expect(parity(fixture({ checks: 'checks:\n  mcp_parity:\n    mode: strict\n    relay: {}\n    unrelayed: {}\n' }))).toEqual({ errors: GOLDEN, warnings: [] });
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
      'pi MCP supabase cannot be relayed: its .mcp.json entry takes SUPABASE_ACCESS_TOKEN from the host, which the launcher does not expand; the launcher starts an enabled stdio entry with literal values only (drop the pi entry and list it in checks.mcp_parity.unrelayed.pi)',
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

  test('a relay entry may carry enabled; false passes with a warning, and an id absent from the canonical set still fails', () => {
    const pi = { ...relayEntries(), 'yt-dlp': { command: 'bun', args: ['scripts/mcp-launch.ts', 'yt-dlp'], enabled: false }, 'shadcn': { command: 'bun', args: ['scripts/mcp-launch.ts', 'shadcn'], enabled: true } };
    expect(parity(fixture({ checks: GALAXY, pi }))).toEqual({
      errors: [HTTP_GAP],
      warnings: ['pi MCP yt-dlp relay is disabled in .pi/mcp.json (enabled: false): pi sessions run without it'],
    });
    const extra = { ...relayEntries(), extra: { command: 'bun', args: ['scripts/mcp-launch.ts', 'extra'], enabled: true } };
    expect(parity(fixture({ checks: GALAXY, pi: extra })).errors).toEqual([
      HTTP_GAP,
      'MCP extra present in pi only: declare it in .mcp.json or remove it from .pi/mcp.json',
    ]);
    const typo = { ...relayEntries(), shadcn: { command: 'bun', args: ['scripts/mcp-launch.ts', 'shadcn'], enabled: 'no' } };
    expect(parity(fixture({ checks: GALAXY, pi: typo })).errors).toEqual([
      'pi MCP shadcn relay in .pi/mcp.json: enabled must be true or false',
      HTTP_GAP,
    ]);
  });

  test('unrelayed records the http server the relay cannot carry: no error, one warning naming it', () => {
    expect(parity(fixture({ checks: UNRELAYED }))).toEqual({ errors: [], warnings: [NOT_CARRIED] });
    const mcp = { ...canonical(), 'off-mcp': { command: 'npx', args: ['off-mcp'], enabled: false } };
    expect(parity(fixture({ checks: `${GALAXY}    unrelayed:\n      pi: [instance-n8n-mcp, off-mcp]\n`, mcp })).warnings).toEqual([
      NOT_CARRIED,
      'MCP off-mcp is not carried by pi: its .mcp.json entry is disabled (checks.mcp_parity.unrelayed.pi); pi sessions run without it unless it is connected at user level (ADR-0005)',
    ]);
  });

  test('unrelayed fails closed: unknown id, a carried id, a relayable server, a host without a relay', () => {
    const pi = { ...relayEntries(), 'instance-n8n-mcp': { type: 'http', url: 'https://fake.example/mcp' } };
    expect(parity(fixture({ checks: `${GALAXY}    unrelayed:\n      pi: [instance-n8n-mcp, ghost-mcp, shadcn]\n`, pi })).errors).toEqual([
      'checks.mcp_parity.unrelayed.pi: ghost-mcp is not declared in .mcp.json',
      'checks.mcp_parity.unrelayed.pi: instance-n8n-mcp is declared in .pi/mcp.json, so pi carries it; drop it from the list',
      'checks.mcp_parity.unrelayed.pi: shadcn is declared in .pi/mcp.json, so pi carries it; drop it from the list',
    ]);
    expect(parity(fixture({ checks: `${GALAXY}    unrelayed:\n      pi: [instance-n8n-mcp, shadcn]\n`, pi: Object.fromEntries(Object.entries(relayEntries()).filter(([id]) => id !== 'shadcn')) })).errors).toEqual([
      'checks.mcp_parity.unrelayed.pi: shadcn is an enabled stdio server, which the relay can carry: relay it, or declare it in .pi/mcp.json directly',
      'MCP shadcn missing from pi: declared in .mcp.json, absent from .pi/mcp.json',
    ]);
    expect(parity(fixture({ checks: 'checks:\n  mcp_parity:\n    mode: local-only\n    unrelayed:\n      pi: [instance-n8n-mcp]\n' })).errors).toEqual([
      'checks.mcp_parity.unrelayed.pi: pi has no relay (checks.mcp_parity.relay.pi); the list records only servers a relay host cannot carry, and a host without a relay declares every server itself',
    ]);
    expect(parity(fixture({ checks: UNRELAYED }), true).errors).toEqual([
      'checks.mcp_parity: the boilerplate checks strict parity; keep mode: strict and relay: {} and unrelayed: {}',
    ]);
  });

  test('with the canonical file absent, each unrelayed id is still warned by name, as unverified', () => {
    expect(parity(fixture({ checks: UNRELAYED, mcp: null })).warnings).toEqual([
      'MCP parity unverified: .mcp.json is absent (checks.mcp_parity.mode: local-only), so the server set and the env contract are not compared; the committed hosts are checked on their own.',
      'MCP instance-n8n-mcp is not carried by pi (checks.mcp_parity.unrelayed.pi): unverified, because .mcp.json is absent',
    ]);
  });

  test('local-only scans committed headers, urls, args and other secret-named keys, by name only', () => {
    const pi = {
      ...relayEntries(),
      hdr: { type: 'http', url: 'https://fake.example/mcp', headers: { 'Authorization': FAKE.bearer, 'X-N8N-API-KEY': 'a1b2c3.d4e5f6', 'X-Custom': `${'a'.repeat(8)}0123456789abcdef0123456789abcdef`, 'X-Auth-Mode': 'none', 'X-Ref': ['Bearer ', '$', '{FAKE_TOKEN}'].join('') } },
      qry: { type: 'http', url: `https://user:${FAKE.youtube}@fake.example/mcp/0123456789abcdef0123456789abcdef?access_token=${FAKE.n8n}&sig=abc12345&mode=fast#jwt=${FAKE.youtube}` },
      arg: { command: 'bunx', args: ['arg-mcp', '--access-token', FAKE.n8n, `--api-key=${FAKE.n8n}`, '--verbose'], env: { CALLBACK_URL: `https://u:${FAKE.youtube}@fake.example`, HOST_HINT: FAKE.slack } },
      oauth: { type: 'http', url: 'https://fake.example/mcp', oauth: { clientId: 'fake-client', clientSecret: FAKE.youtube } },
      clean: { type: 'http', url: ['https://fake.example/mcp?token=', '$', '{FAKE_TOKEN}'].join(''), headers: { 'X-Session-Affinity': 'sticky', 'Authorization': ['Bearer ', '$', '{FAKE_TOKEN}'].join('') } },
    };
    const mcp = { ...canonical(), hdr: { type: 'http', url: 'https://fake.example/mcp' }, qry: { type: 'http', url: 'https://fake.example/mcp' }, arg: { command: 'bunx', args: ['arg-mcp'] }, oauth: { type: 'http', url: 'https://fake.example/mcp' }, clean: { type: 'http', url: 'https://fake.example/mcp' } };
    const errors = parity(fixture({ checks: UNRELAYED, mcp, pi })).errors.filter(error => error.includes(LOCAL_ONLY_TAIL));
    expect(errors).toEqual([
      `pi MCP arg holds a literal argument \`--access-token\`, argument \`--api-key\`, CALLBACK_URL url credentials, HOST_HINT ${LOCAL_ONLY_TAIL}`,
      `pi MCP hdr holds a literal header \`Authorization\`, header \`X-N8N-API-KEY\`, header \`X-Custom\` ${LOCAL_ONLY_TAIL}`,
      `pi MCP oauth holds a literal \`oauth.clientSecret\` ${LOCAL_ONLY_TAIL}`,
      `pi MCP qry holds a literal url credentials, url path, url parameter \`access_token\`, url parameter \`sig\`, url fragment parameter \`jwt\` ${LOCAL_ONLY_TAIL}`,
    ]);
  });

  test('the scan reads OpenCode headers and oauth and Codex http_headers, and skips Codex by-name keys', () => {
    const root = fixture({ checks: 'checks:\n  mcp_parity:\n    mode: local-only\n' });
    writeFileSync(join(root, 'opencode.jsonc'), `${JSON.stringify({ mcp: { remote: { type: 'remote', url: 'https://fake.example/mcp', headers: { 'X-Api-Key': FAKE.n8n }, oauth: { clientSecret: FAKE.youtube } } } }, null, 2)}\n`);
    mkdirSync(join(root, '.codex'), { recursive: true });
    writeFileSync(join(root, '.codex', 'config.toml'), `[mcp_servers.remote]\nurl = "https://fake.example/mcp"\nbearer_token_env_var = "FAKE_MCP_TOKEN"\nenv_http_headers = { "X-Api-Key" = "FAKE_MCP_KEY" }\nhttp_headers = { "Authorization" = "${FAKE.bearer}" }\n`);
    const found = validateMcpParityFindings(root, { harnesses: ['claude', 'opencode', 'codex'], schemaOwner: false });
    outputs.push(...found.errors, ...found.warnings);
    expect(found.errors.filter(error => error.includes('holds a literal'))).toEqual([
      'opencode MCP remote holds a literal header `X-Api-Key`, `oauth.clientSecret` in opencode.jsonc: with checks.mcp_parity.mode: local-only, literal values live only in the local .mcp.json; reference the variable by name or relay the server',
      'codex MCP remote holds a literal header `Authorization` in .codex/config.toml: with checks.mcp_parity.mode: local-only, literal values live only in the local .mcp.json; reference the variable by name or relay the server',
    ]);
  });

  test('the scan reads a url whose host is a variable and a header passed in args', () => {
    const pi = {
      ...relayEntries(),
      varhost: { type: 'http', url: ['$', '{N8N_HOST}/mcp?api_key=', FAKE.n8n].join('') },
      inhost: { type: 'http', url: ['https://', '$', '{N8N_HOST}/mcp?token=', FAKE.youtube].join('') },
      remote: { command: 'npx', args: ['mcp-remote', 'https://fake.example/mcp', '--header', `Authorization: Basic ${FAKE.youtube}`, `--header=X-API-Key:${FAKE.n8n}`] },
    };
    const mcp = { ...canonical(), varhost: { type: 'http', url: 'https://fake.example/mcp' }, inhost: { type: 'http', url: 'https://fake.example/mcp' }, remote: { command: 'npx', args: ['mcp-remote'] } };
    expect(parity(fixture({ checks: UNRELAYED, mcp, pi })).errors.filter(error => error.includes(LOCAL_ONLY_TAIL))).toEqual([
      `pi MCP inhost holds a literal url parameter \`token\` ${LOCAL_ONLY_TAIL}`,
      `pi MCP remote holds a literal argument header \`Authorization\`, argument header \`X-API-Key\` ${LOCAL_ONLY_TAIL}`,
      `pi MCP varhost holds a literal url parameter \`api_key\` ${LOCAL_ONLY_TAIL}`,
    ]);
  });

  test('ids, slugs, a bare url user and referenced values are not credentials', () => {
    const ref = (name: string): string => ['$', `{${name}}`].join('');
    const pi = {
      ...relayEntries(),
      ids: { type: 'http', url: 'https://git@fake.example/supabase-management-endpoint-v1-mcp/sse?project=123e4567-e89b-12d3-a456-426614174000', headers: { 'X-Project-Id': '123e4567-e89b-12d3-a456-426614174000' } },
      refs: { type: 'http', url: `${ref('N8N_HOST')}/mcp?token=${ref('FAKE_TOKEN')}`, headers: { Authorization: `Bearer ${ref('FAKE_TOKEN')}` } },
      remote: { command: 'npx', args: ['mcp-remote', `${ref('N8N_HOST')}/mcp`, '--header', `Authorization: Bearer ${ref('FAKE_TOKEN')}`, '--header', 'Accept: application/json'] },
    };
    const mcp = { ...canonical(), ids: { type: 'http', url: 'https://fake.example/mcp' }, refs: { type: 'http', url: 'https://fake.example/mcp' }, remote: { command: 'npx', args: ['mcp-remote'] } };
    expect(parity(fixture({ checks: UNRELAYED, mcp, pi })).errors.filter(error => error.includes('holds a literal'))).toEqual([]);
  });

  test('unrelayed accepts a stdio server that takes a value from the host, which the launcher does not expand', () => {
    const mcp = { ...canonical(), 'host-mcp': { command: 'npx', args: ['host-mcp'], env: { HOST_MCP_TOKEN: ['$', '{HOST_MCP_TOKEN}'].join('') } } };
    const found = parity(fixture({ checks: `${GALAXY}    unrelayed:\n      pi: [host-mcp, instance-n8n-mcp]\n`, mcp }));
    expect(found.errors).toEqual([]);
    expect(found.warnings.filter(warning => warning.includes('is not carried by pi'))).toEqual([
      'MCP host-mcp is not carried by pi: its .mcp.json entry takes HOST_MCP_TOKEN from the host, which the launcher does not expand (checks.mcp_parity.unrelayed.pi); pi sessions run without it unless it is connected at user level (ADR-0005)',
      NOT_CARRIED,
    ]);
  });

  test('the header and url scan stays off under strict', () => {
    const pi = { ...relayEntries(), hdr: { type: 'http', url: `https://fake.example/mcp?access_token=${FAKE.n8n}`, headers: { Authorization: FAKE.bearer } } };
    const mcp = { ...canonical(), hdr: { type: 'http', url: 'https://fake.example/mcp' } };
    const errors = parity(fixture({ checks: 'checks:\n  mcp_parity:\n    relay:\n      pi: [bun, scripts/mcp-launch.ts]\n', mcp, pi })).errors;
    expect(errors.some(error => error.includes('holds a literal'))).toBe(false);
  });

  test('no fake secret value reaches any finding', () => {
    const text = outputs.join('\n');
    for (const value of Object.values(FAKE)) { expect(text).not.toContain(value); }
    expect(outputs.length).toBeGreaterThan(20);
  });
});
