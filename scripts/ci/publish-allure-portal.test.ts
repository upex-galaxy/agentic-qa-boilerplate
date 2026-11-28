import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';

const SCRIPT = path.join(import.meta.dir, 'publish-allure-portal.ts');
const FAKE_PASSWORD = 'zq7-Fake-Value-91';
const dirs: string[] = [];
const servers: { stop: (force: boolean) => void }[] = [];

afterEach(() => {
  for (const s of servers.splice(0)) { s.stop(true); }
  for (const d of dirs.splice(0)) { fs.rmSync(d, { recursive: true, force: true }); }
});

function resultsFixture(): { repo: string, attachment: string, seen: string, synced: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-portal-'));
  dirs.push(repo);
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
  fs.writeFileSync(path.join(repo, 'bin', 'aws'), '#!/bin/sh\necho "$@" > synced.txt\n', { mode: 0o755 });
  return { repo, attachment, seen: path.join(repo, 'seen-by-generate.txt'), synced: path.join(repo, 'synced.txt') };
}

async function publish(repo: string): Promise<{ status: number, requests: string[] }> {
  const requests: string[] = [];
  const portal = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: (request) => {
      requests.push(request.method);
      return request.method === 'GET' ? new Response('', { status: 404 }) : Response.json({});
    },
  });
  servers.push(portal);

  // Async on purpose: a sync spawn would block the fake portal the script calls.
  const child = Bun.spawn([process.execPath, SCRIPT, '--env', 'staging', '--suite', 'smoke', '--run', '1', '--results', 'results'], {
    cwd: repo,
    env: {
      PATH: `${path.join(repo, 'bin')}${path.delimiter}${process.env.PATH}`,
      HOME: repo,
      PORTAL_URL: `http://127.0.0.1:${portal.port}`,
      PORTAL_PROJECT: 'fixture',
      PORTAL_API_KEY: 'fake-portal-key',
      R2_ACCOUNT_ID: 'fake-account',
      R2_ACCESS_KEY_ID: 'fake-key-id',
      R2_SECRET_ACCESS_KEY: 'fake-access-secret',
      R2_BUCKET: 'fake-bucket',
      QA_FAKE_PASSWORD: FAKE_PASSWORD,
    },
    stdout: 'ignore',
    stderr: 'ignore',
  });
  return { status: await child.exited, requests };
}

describe.skipIf(process.platform === 'win32')('publish by hand on a results directory', () => {
  test('the attachments are scrubbed before the report is generated', async () => {
    const { repo, seen, synced } = resultsFixture();

    const { status } = await publish(repo);

    expect(status).toBe(0);
    expect(fs.readFileSync(seen, 'utf8')).toBe('signed in with [redacted]\n');
    expect(fs.existsSync(synced)).toBe(true);
  });

  // Root writes through a read-only mode, so the scrub cannot be made to fail there.
  test.skipIf(process.getuid?.() === 0)('a failing scrub stops the publish before anything is generated or sent', async () => {
    const { repo, attachment, seen, synced } = resultsFixture();
    fs.chmodSync(attachment, 0o444);

    const { status, requests } = await publish(repo);

    expect(status).not.toBe(0);
    expect(requests).toEqual([]);
    expect(fs.existsSync(seen)).toBe(false);
    expect(fs.existsSync(synced)).toBe(false);
  });
});
