import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import { gitAuthEnv } from './publish-allure-pages';

const KEY = 'http.https://github.com/.extraheader';
const SCRIPT = path.join(import.meta.dir, 'publish-allure-pages.ts');
const FAKE_PASSWORD = 'zq7-Fake-Value-91';
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

function resultsFixture(): { repo: string, attachment: string, seen: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-pages-'));
  dirs.push(repo);
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  spawnSync('git', ['remote', 'add', 'origin', repo], { cwd: repo });
  fs.mkdirSync(path.join(repo, 'results'));
  fs.mkdirSync(path.join(repo, 'bin'));
  const attachment = path.join(repo, 'results', 'a1-attachment.txt');
  fs.writeFileSync(attachment, `signed in with ${FAKE_PASSWORD}\n`);
  // The fake generator keeps a copy of the attachment as it found it.
  fs.writeFileSync(path.join(repo, 'bin', 'bunx'), [
    '#!/bin/sh',
    'cp "$3/a1-attachment.txt" seen-by-generate.txt',
    'mkdir -p allure-report',
    'echo report > allure-report/index.html',
    '',
  ].join('\n'), { mode: 0o755 });
  return { repo, attachment, seen: path.join(repo, 'seen-by-generate.txt') };
}

function publish(repo: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SCRIPT, '--env', 'staging', '--suite', 'smoke', '--run', '1', '--results', 'results', '--pages', 'gh-pages', '--no-push'], {
    cwd: repo,
    env: {
      PATH: `${path.join(repo, 'bin')}${path.delimiter}${process.env.PATH}`,
      HOME: repo,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      QA_FAKE_PASSWORD: FAKE_PASSWORD,
    },
    encoding: 'utf8',
  });
}

describe.skipIf(process.platform === 'win32')('publish by hand on a results directory', () => {
  test('the attachments are scrubbed before the report is generated', () => {
    const { repo, seen } = resultsFixture();

    const res = publish(repo);

    expect(res.status).toBe(0);
    expect(fs.readFileSync(seen, 'utf8')).toBe('signed in with [redacted]\n');
  });

  // Root writes through a read-only mode, so the scrub cannot be made to fail there.
  test.skipIf(process.getuid?.() === 0)('a failing scrub stops the publish before anything is generated', () => {
    const { repo, attachment, seen } = resultsFixture();
    fs.chmodSync(attachment, 0o444);

    const res = publish(repo);

    expect(res.status).not.toBe(0);
    expect(fs.existsSync(seen)).toBe(false);
    expect(fs.existsSync(path.join(repo, 'gh-pages'))).toBe(false);
  });
});
