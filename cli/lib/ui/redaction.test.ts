import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { Journal } from './events.ts';
import { harvestSecretValues, isSecretKey, readSecretValues, redactAll, REDACTED, redactParseError, redactSecretText, redactValue } from './redaction.ts';

const ref = (name: string): string => ['$', '{', name, '}'].join('');

const FAKE = {
  slack: 'xoxp-FAKE-1234567890-abcdef',
  n8n: 'sk-FAKE-1234',
  supabase: 'sbp_FAKE0123456789abcdef',
  unshaped: 'FAKE-plain-workspace-77',
  password: 'pw-FAKE-9999',
};

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) { rmSync(d, { recursive: true, force: true }); }
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'redaction-'));
  dirs.push(root);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

function leaks(text: string): string[] {
  return Object.values(FAKE).filter(v => text.includes(v));
}

describe('isSecretKey', () => {
  test('splits snake, kebab and camel case', () => {
    for (const name of ['SLACK_MCP_XOXP_TOKEN', 'N8N_API_KEY', 'apiKey', 'X-API-Key', 'accessToken', 'Authorization', '--access-token', 'DB_PASSWORD']) {
      expect(isSecretKey(name), name).toBe(true);
    }
    for (const name of ['MCP_MODE', 'command', 'args', 'keywords', 'url', 'LOG_LEVEL']) {
      expect(isSecretKey(name), name).toBe(false);
    }
  });
});

describe('redactSecretText', () => {
  test('masks the value and keeps the key, in JSON, TOML, dotenv and YAML lines', () => {
    expect(redactSecretText(`+    "SLACK_MCP_XOXP_TOKEN": "${FAKE.slack}",`)).toBe(`+    "SLACK_MCP_XOXP_TOKEN": "${REDACTED}",`);
    expect(redactSecretText('env = { N8N_API_KEY = "plainvalue" }')).toBe(`env = { N8N_API_KEY = "${REDACTED}" }`);
    expect(redactSecretText('SUPABASE_ACCESS_TOKEN=plainvalue123')).toBe(`SUPABASE_ACCESS_TOKEN=${REDACTED}`);
    expect(redactSecretText('  token: hunter2hunter2')).toBe(`  token: ${REDACTED}`);
  });

  test('masks a flag value in both array and shell shapes, and URL credentials', () => {
    expect(redactSecretText('"args": ["-y", "server", "--access-token", "plainvalue"]')).toBe(`"args": ["-y", "server", "--access-token", "${REDACTED}"]`);
    expect(redactSecretText('run --api-key=plainvalue --verbose')).toBe(`run --api-key=${REDACTED} --verbose`);
    expect(redactSecretText(`https://user:${FAKE.password}@host.test/mcp?api_key=plainvalue&x=1`)).toBe(`https://user:${REDACTED}@host.test/mcp?api_key=${REDACTED}&x=1`);
  });

  test('masks token-shaped runs anywhere, and strips color codes first', () => {
    expect(leaks(redactSecretText(`found ${FAKE.slack} and ${FAKE.supabase} and Bearer abcDEF123456789xyz`))).toEqual([]);
    expect(redactSecretText('\u001B[32m+"N8N_API_KEY": "zzzzzzzzzz"\u001B[0m')).toBe(`+"N8N_API_KEY": "${REDACTED}"`);
  });

  test('envKeys masks any ALL_CAPS literal, but not plain settings', () => {
    expect(redactSecretText(`"SLACK_TEAM": "${FAKE.unshaped}"`, { envKeys: true })).toBe(`"SLACK_TEAM": "${REDACTED}"`);
    expect(redactSecretText(`"SLACK_TEAM": "${FAKE.unshaped}"`)).toBe(`"SLACK_TEAM": "${FAKE.unshaped}"`);
    expect(redactSecretText('"MCP_MODE": "stdio", "LOG_LEVEL": "error"', { envKeys: true })).toBe('"MCP_MODE": "stdio", "LOG_LEVEL": "error"');
  });

  test('keeps placeholders, variable names, key paths, hashes and prose', () => {
    const kept = [
      `"Authorization": "Bearer ${ref('SLACK_TOKEN')}"`,
      `"SUPABASE_ACCESS_TOKEN": "${ref('SUPABASE_ACCESS_TOKEN')}"`,
      '"N8N_API_KEY": "{env:N8N_API_KEY}"',
      'bearer_token_env_var = "CONTEXT7_API_KEY"',
      'keep project-only key: "mcp_servers.acme"',
      'upstream added 1 key: "required.priority"',
      'sha 3f9a1c2e4b5d6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8',
      '"command": "@supabase/mcp-server-supabase@0.13.0"',
      'the task-runner uses ask-me and desk-top',
      '.agents/skills/project-adoption/SKILL.md',
      '.context/ADR/ADR-0008-browser-session-isolation.md',
    ];
    for (const line of kept) { expect(redactSecretText(line), line).toBe(line); }
  });

  test('redactValue keeps a plain setting and masks the rest', () => {
    expect(redactValue('LOG_LEVEL', 'debug')).toBe('debug');
    expect(redactValue('SLACK_TEAM', FAKE.unshaped)).toBe(REDACTED);
  });
});

describe('redactParseError', () => {
  test('a parser that quotes the offending token never prints it', () => {
    expect(leaks(redactParseError(`JSON Parse error: Unexpected identifier "${FAKE.supabase}"`))).toEqual([]);
    expect(leaks(redactParseError(`TOML Parse error: Strings must be quoted: '${FAKE.unshaped}'`))).toEqual([]);
  });
});

describe('harvestSecretValues', () => {
  test('collects the literal values of an MCP config, never a placeholder', () => {
    const json = JSON.stringify({ mcpServers: {
      slack: { command: 'npx', args: ['server', '--token', FAKE.slack], env: { SLACK_TEAM: FAKE.unshaped, REF: ref('SLACK_REF') } },
      remote: { type: 'http', url: `https://u:${FAKE.password}@h.test/?api_key=${FAKE.n8n}`, headers: { Authorization: `Bearer ${FAKE.supabase}` } },
    } });
    const values = harvestSecretValues(json, '.mcp.json');
    for (const v of [FAKE.slack, FAKE.unshaped, FAKE.password]) { expect(values).toContain(v); }
    expect(values.some(v => v.includes(FAKE.supabase))).toBe(true);
    expect(values.some(v => v.includes(ref('SLACK_REF')))).toBe(false);
  });

  test('reads JSONC, TOML and a malformed file', () => {
    expect(harvestSecretValues(`{ // c\n "mcp": { "a": { "environment": { "SLACK_TEAM": "${FAKE.unshaped}", }, }, }, }`, 'opencode.jsonc')).toContain(FAKE.unshaped);
    expect(harvestSecretValues(`[mcp_servers.a.env]\nSLACK_TEAM = "${FAKE.unshaped}"\n`, '.codex/config.toml')).toContain(FAKE.unshaped);
    expect(harvestSecretValues(`{ "mcpServers": { "a": { "env": { "SLACK_TEAM": "${FAKE.unshaped}" } } `, '.mcp.json')).toContain(FAKE.unshaped);
  });

  test('reads every value of a dotenv file, multi-line ones line by line', () => {
    const values = harvestSecretValues(`A=1\nexport SLACK_TEAM="${FAKE.unshaped}"\nPEM="-----BEGIN KEY-----\nMIIFAKEline0000\n-----END KEY-----"\n`, '.env.local');
    expect(values).toContain(FAKE.unshaped);
    expect(values).toContain('MIIFAKEline0000');
  });
});

describe('readSecretValues', () => {
  test('reads the MCP configs and .env files of a root, never .env.example or a schema', () => {
    const root = repo({
      '.mcp.json': JSON.stringify({ mcpServers: { a: { command: 'x', env: { SLACK_TEAM: FAKE.unshaped } } } }),
      '.env': `N8N_API_KEY=${FAKE.n8n}\n`,
      '.env.example': 'EXAMPLE_ONLY=placeholder-example\n',
      '.env.schema': '# @sensitive\nSCHEMA_ONLY=schema-default-value\n',
    });
    const values = readSecretValues(root);
    expect(values).toContain(FAKE.unshaped);
    expect(values).toContain(FAKE.n8n);
    expect(values).not.toContain('placeholder-example');
    expect(values).not.toContain('schema-default-value');
    expect(redactAll(`x ${FAKE.unshaped} y`, values)).toBe(`x ${REDACTED} y`);
  });
});

describe('Journal', () => {
  test('a seeded or token-shaped value never reaches a stored event', () => {
    const journal = new Journal();
    journal.redactor.add(FAKE.unshaped);
    journal.append({ t: 'phase.start', id: 'p', title: `value ${FAKE.unshaped} and ${FAKE.slack}` });
    expect(leaks(JSON.stringify(journal.all()))).toEqual([]);
  });
});
