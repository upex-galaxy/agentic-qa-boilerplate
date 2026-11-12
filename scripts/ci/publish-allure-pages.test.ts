import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { gitAuthEnv } from './publish-allure-pages';

const KEY = 'http.https://github.com/.extraheader';
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) { fs.rmSync(d, { recursive: true, force: true }); }
});

describe('gitAuthEnv', () => {
  test('fails loudly, naming the variable, when the token is missing', () => {
    expect(() => gitAuthEnv(undefined)).toThrow(/GITHUB_TOKEN is not set/);
    expect(() => gitAuthEnv('')).toThrow(/GITHUB_TOKEN is not set/);
  });

  test('git reads the auth header from the environment and nothing is written to .git/config', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-pages-'));
    dirs.push(repo);
    spawnSync('git', ['init', '-q', '-b', 'gh-pages'], { cwd: repo });

    const env = gitAuthEnv('fake-token');
    const res = spawnSync('git', ['config', '--get', KEY], {
      cwd: repo,
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });

    const expected = `AUTHORIZATION: basic ${Buffer.from('x-access-token:fake-token').toString('base64')}`;
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe(expected);
    expect(fs.readFileSync(path.join(repo, '.git', 'config'), 'utf8')).not.toContain('extraheader');
  });
});
