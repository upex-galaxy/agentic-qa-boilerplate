import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { gitOk } from './git.ts';

export interface Repo { dir: string, git: (...args: string[]) => string, write: (path: string, text: string) => void, commit: (msg: string, files?: Record<string, string>) => string, cleanup: () => void }

export function makeRepo(prefix = 'edd-repo-'): Repo {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const dir = join(root, 'repo');
  mkdirSync(dir);
  const hooks = join(root, 'no-hooks');
  mkdirSync(hooks);
  const run = (...args: string[]): string => gitOk(dir, args);
  run('init', '-q', '-b', 'main');
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false'], ['core.hooksPath', hooks], ['tag.gpgsign', 'false']]) { run('config', k, v); }
  const write = (path: string, text: string): void => {
    const p = join(dir, path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  const commit = (msg: string, files: Record<string, string> = {}): string => {
    for (const [p, t] of Object.entries(files)) { write(p, t); }
    run('add', '-A');
    run('commit', '-q', '--allow-empty', '-m', msg);
    return run('rev-parse', 'HEAD');
  };
  return { dir, git: run, write, commit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function fakeKey(seed: string): string {
  const type = Buffer.from('ssh-ed25519');
  const len = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const point = createHash('sha256').update(seed).digest();
  return `ssh-ed25519 ${Buffer.concat([len(type.length), type, len(point.length), point]).toString('base64')}`;
}

export function projectYaml(evidence: string, policy = 'evidence'): string {
  return [
    'git_strategy:',
    '  strategy: solo-main',
    '  branches:',
    '    production: main',
    '  protected: [main]',
    '  policy:',
    `    direct_push_to_protected: ${policy}`,
    'environments:',
    '  local:',
    '    web_url: http://localhost:3000',
    '  staging:',
    '    web_url: https://staging.example.com',
    evidence,
    '',
  ].join('\n');
}
