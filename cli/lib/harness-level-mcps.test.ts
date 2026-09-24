/**
 * @fileoverview The harness-level MCP detector: reads user-level configs of the
 * three harnesses over a fake HOME, never a value, and classifies the moved
 * servers as "provided elsewhere" or "not detectable" (never "missing").
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

import {
  classifyHarnessLevelMcp,
  HARNESS_LEVEL_MCPS,
  harnessLevelMcpReport,
  readUserLevelMcpServers,
  userLevelConfigPaths,
} from './harness-level-mcps.ts';

const homes: string[] = [];
function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'harness-level-home-'));
  homes.push(home);
  return home;
}
afterEach(() => { for (const home of homes.splice(0)) { rmSync(home, { recursive: true, force: true }); } });

const ENV: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

describe('userLevelConfigPaths', () => {
  test('honours XDG_CONFIG_HOME for OpenCode and keeps the other two under HOME', () => {
    const paths = userLevelConfigPaths('/h', { NODE_ENV: 'test', XDG_CONFIG_HOME: '/xdg' });
    expect(paths.opencode[0]).toBe(join('/xdg', 'opencode', 'opencode.json'));
    expect(paths.claude[0]).toBe(join('/h', '.claude.json'));
    expect(paths.codex[0]).toBe(join('/h', '.codex', 'config.toml'));
  });
});

describe('readUserLevelMcpServers', () => {
  test('reads ids and url hosts from all three harnesses, never a header value', () => {
    const home = fakeHome();
    writeFileSync(join(home, '.claude.json'), JSON.stringify({
      mcpServers: { 'Tavily-Search': { type: 'http', url: 'https://mcp.tavily.com/mcp/', headers: { Authorization: 'Bearer super-secret' } } },
      projects: { '/some/repo': { mcpServers: { local_only: { command: 'x' } } } },
    }));
    mkdirSync(join(home, '.config', 'opencode'), { recursive: true });
    writeFileSync(join(home, '.config', 'opencode', 'opencode.json'), '{\n  // global\n  "mcp": { "postman": { "type": "remote", "url": "https://mcp.postman.com/mcp" }, }\n}\n');
    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(join(home, '.codex', 'config.toml'), '[mcp_servers.docs]\nurl = "https://developers.example.test/mcp"\n');

    const servers = readUserLevelMcpServers(home, ENV);
    expect(servers.claude).toEqual(['local_only', 'mcp.tavily.com', 'tavily-search']);
    expect(servers.opencode).toEqual(['mcp.postman.com', 'postman']);
    expect(servers.codex).toEqual(['developers.example.test', 'docs']);
    expect(JSON.stringify(servers)).not.toContain('super-secret');
    expect(servers.sources).toHaveLength(3);
  });

  test('an absent or unparseable file contributes nothing and never throws', () => {
    const home = fakeHome();
    writeFileSync(join(home, '.claude.json'), '{ not json');
    const servers = readUserLevelMcpServers(home, ENV);
    expect(servers).toEqual({ claude: [], opencode: [], codex: [], sources: [] });
  });
});

describe('classifyHarnessLevelMcp', () => {
  const tavily = HARNESS_LEVEL_MCPS.find(m => m.id === 'tavily')!;

  test('a hit by id or by url host is "provided elsewhere" naming the harness', () => {
    const byId = classifyHarnessLevelMcp(tavily, { claude: ['tavily'], opencode: [], codex: [] });
    expect(byId.state).toBe('provided elsewhere');
    expect(byId.hosts).toEqual(['claude']);
    const byHost = classifyHarnessLevelMcp(tavily, { claude: [], opencode: [], codex: ['mcp.tavily.com', 'websearch'] });
    expect(byHost.hosts).toEqual(['codex']);
  });

  test('no hit is "not detectable", never "missing", and says how to connect it per host', () => {
    const verdict = classifyHarnessLevelMcp(tavily, { claude: [], opencode: [], codex: [] });
    expect(verdict.state).toBe('not detectable');
    expect(verdict.hosts).toEqual([]);
    expect(verdict.detail).toContain('claude.ai connector');
    expect(verdict.detail).toContain('~/.codex/config.toml');
    expect(verdict.detail).not.toContain('missing');
  });
});

describe('harnessLevelMcpReport', () => {
  test('classifies every moved server against a fake home', () => {
    const home = fakeHome();
    const report = harnessLevelMcpReport(home, ENV);
    expect(report.verdicts.map(v => v.id)).toEqual(HARNESS_LEVEL_MCPS.map(m => m.id));
    expect(report.verdicts.every(v => v.state === 'not detectable')).toBe(true);
  });
});
