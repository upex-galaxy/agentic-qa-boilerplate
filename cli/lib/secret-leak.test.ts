import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { readHostMcpConfig, validateMcpParity } from './agent-compatibility-contracts.ts';
import { hostReads } from './harness-env.ts';
import { renderLocalDiff } from './updater-core.ts';
import { buildParityFileBody, collectParityFindings, diffNoIndex } from './updater-parity.ts';

const ref = (name: string): string => ['$', '{', name, '}'].join('');

const FAKE = {
  slack: 'xoxp-FAKE-1234567890-abcdef',
  slackOther: 'xoxp-FAKE-OTHER-999999',
  n8n: 'sk-FAKE-1234',
  supabase: 'sbp_FAKE0123456789abcdef',
  unshaped: 'FAKE-plain-workspace-77',
  password: 'pw-FAKE-9999',
};

const REPO = resolve(import.meta.dir, '..', '..');

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); }
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'secret-leak-'));
  dirs.push(root);
  spawnSync('git', ['-C', root, 'init', '--quiet']);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function leaks(text: string): string[] {
  return Object.values(FAKE).filter(v => text.includes(v));
}

const MCP = JSON.stringify({ mcpServers: {
  slack: { command: 'npx', args: ['-y', 'slack-mcp-server', '--token', FAKE.slack], env: { SLACK_MCP_XOXP_TOKEN: FAKE.slack, SLACK_TEAM: FAKE.unshaped } },
  n8n: { command: 'npx', args: ['n8n-mcp'], env: { N8N_API_KEY: FAKE.n8n, MCP_MODE: 'stdio' } },
  supabase: { command: 'npx', args: ['-y', '@supabase/mcp-server-supabase', '--access-token', FAKE.supabase] },
  remote: { type: 'http', url: `https://user:${FAKE.password}@example.test/mcp` },
} }, null, 2);

const OPENCODE = JSON.stringify({ mcp: {
  slack: { type: 'local', command: ['npx', '-y', 'slack-mcp-server'], environment: { SLACK_MCP_XOXP_TOKEN: FAKE.slackOther, SLACK_TEAM: FAKE.unshaped } },
  n8n: { type: 'local', command: ['npx', 'n8n-mcp'], environment: { N8N_API_KEY: 'sk-FAKE-OTHER-5678', MCP_MODE: 'stdio' } },
  supabase: { type: 'local', command: ['npx', '-y', '@supabase/mcp-server-supabase'] },
  remote: { type: 'remote', url: 'https://example.test/mcp' },
} }, null, 2);

function fakeApp(): string {
  const root = repo({
    '.agents/project.yaml': 'harnesses: [claude, opencode]\n',
    '.agents/skills/demo/SKILL.md': '---\nname: demo\ndescription: demo\n---\n',
    'AGENTS.md': '# Agents\n',
    'CLAUDE.md': '@AGENTS.md\n',
    '.mcp.json': MCP,
    'opencode.jsonc': OPENCODE,
  });
  mkdirSync(join(root, '.claude'), { recursive: true });
  symlinkSync('../.agents/skills', join(root, '.claude', 'skills'));
  return root;
}

describe('no MCP config value reaches the output', () => {
  test('agents:compat:check, stdout and stderr', () => {
    const root = fakeApp();
    const run = spawnSync('bun', [join(REPO, 'scripts', 'agent-compatibility.ts'), '--check'], { cwd: root, encoding: 'utf8' });
    expect(`${run.stdout}${run.stderr}`).toContain('env contract differs');
    expect(leaks(`${run.stdout}${run.stderr}`)).toEqual([]);
  });

  test('validateMcpParity, which setup:doctor calls directly', () => {
    const errors = validateMcpParity(fakeApp()).join('\n');
    expect(errors).toContain('literal values differ at: SLACK_MCP_XOXP_TOKEN');
    expect(leaks(errors)).toEqual([]);
  });

  test('a config the parser rejects: the quoted token in the parse error is masked', () => {
    const root = repo({ '.codex/config.toml': `[mcp_servers.a]\ncommand = "npx"\nenv = { N8N_API_KEY = ${FAKE.supabase} }\n`, '.mcp.json': `{ "mcpServers": { "a": { "env": { "K": ${FAKE.supabase} } } } }` });
    expect(() => readHostMcpConfig(root, 'codex')).toThrow();
    for (const host of ['codex', 'claude'] as const) {
      let message = '';
      try { readHostMcpConfig(root, host); }
      catch (error) { message = (error as Error).message; }
      expect(leaks(message)).toEqual([]);
    }
    expect(leaks(hostReads(root).errors.join('\n'))).toEqual([]);
  });

  test('a diff of an MCP config, a dotenv file and the parity prompt saved from it', () => {
    const root = fakeApp();
    const upstream = repo({ '.mcp.json': JSON.stringify({ mcpServers: { n8n: { command: 'npx', args: ['n8n-mcp'], env: { N8N_API_KEY: ref('N8N_API_KEY') } } } }, null, 2) });
    const diff = diffNoIndex(join(root, '.mcp.json'), join(upstream, '.mcp.json'));
    expect(diff).toContain('N8N_API_KEY');
    expect(leaks(diff)).toEqual([]);

    const envA = repo({ '.env.local': `SLACK_TEAM=${FAKE.unshaped}\n` });
    const envB = repo({ '.env.local': 'SLACK_TEAM=\n' });
    expect(leaks(diffNoIndex(join(envA, '.env.local'), join(envB, '.env.local')))).toEqual([]);

    const findings = collectParityFindings({
      root,
      upstreamDir: upstream,
      drift: [],
      archivedSkills: [],
      archivedSkillsDir: join(root, 'x'),
      heldBack: [],
      envNewKeys: [],
      compatErrors: [`MCP slack env contract differs between claude and opencode: {"literalEnv":{"SLACK_TEAM":"${FAKE.unshaped}"}} vs {"literalEnv":{"SLACK_TEAM":"${FAKE.slack}"}}`],
    });
    const body = buildParityFileBody(findings, { templateRepo: 'org/repo', upstreamSha: 'a', lockSha: 'b', promptFile: '.agents/prompts/parity-plan.md' });
    expect(body).toContain('.mcp.json');
    expect(leaks(body)).toEqual([]);
    expect(leaks(JSON.stringify(findings))).toEqual([]);
  });

  test('the interactive sync diff of a local MCP config', () => {
    const root = fakeApp();
    spawnSync('git', ['-C', root, 'add', '.mcp.json']);
    const blob = spawnSync('git', ['-C', root, 'hash-object', '-w', '.mcp.json'], { encoding: 'utf8' }).stdout.trim();
    writeFileSync(join(root, '.mcp.json'), MCP.replace(FAKE.n8n, 'sk-FAKE-NEWER-4321'));
    const out = renderLocalDiff({ component: 'mcp', path: '.mcp.json', status: 'M', fromSha: '', toSha: '', added: 1, removed: 1, isBinary: false, templateOldSha: blob, templateNewSha: null, classification: 'framework' } as never, root, root);
    expect(out).toContain('N8N_API_KEY');
    expect(leaks(out)).toEqual([]);
    expect(out).not.toContain('sk-FAKE-NEWER-4321');
  });
});
