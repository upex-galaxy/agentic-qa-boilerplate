import type { ScrubContext } from './scrub.ts';

import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'bun:test';

import { runScrub } from './scrub.ts';

const TEMP: string[] = [];
afterAll(() => {
  for (const dir of TEMP) { rmSync(dir, { recursive: true, force: true }); }
});

const joined = (...parts: string[]): string => parts.join('');
const HELD = joined('held', '-passphrase-', '7781');
const TYPED = joined('typed', 'Unknown', 'Value42');

function fixture(): { root: string, dir: string } {
  const root = mkdtempSync(join(tmpdir(), 'scrub-'));
  TEMP.push(root);
  const dir = join(root, 'allure-results');
  mkdirSync(dir);
  writeFileSync(join(root, '.env'), `STAGING_USER_PASSWORD=${HELD}\n`);
  writeFileSync(join(dir, 'a-attachment.md'), `# Error details\n\nboom\n\n- textbox "Password": ${TYPED}\n- button "Go"\n`);
  writeFileSync(join(dir, 'b-attachment.txt'), `logged in with ${HELD} ok\n`);
  writeFileSync(join(dir, 'c-attachment.zip'), Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.from(HELD)]));
  writeFileSync(join(dir, 'd-result.json'), '{"name":"kept"}');
  writeFileSync(join(root, 'outside.txt'), 'outside');
  symlinkSync(join(root, 'outside.txt'), join(dir, 'e-attachment.txt'));
  return { root, dir };
}

function context(root: string, spawned: string[][] = [], codes: number[] = []): ScrubContext & { lines: string[] } {
  const lines: string[] = [];
  return {
    cwd: root,
    env: {},
    lines,
    log: line => lines.push(line),
    error: line => lines.push(line),
    spawn: (command) => {
      spawned.push(command);
      return codes.shift() ?? 0;
    },
  };
}

const read = (dir: string, name: string): string => readFileSync(join(dir, name), 'latin1');

describe('report:scrub', () => {
  test('cleans text attachments, held and typed values, and keeps the context', () => {
    const { root, dir } = fixture();
    const ctx = context(root);
    expect(runScrub([], ctx)).toBe(0);
    expect(read(dir, 'a-attachment.md')).not.toContain(TYPED);
    expect(read(dir, 'a-attachment.md')).toContain('# Error details');
    expect(read(dir, 'a-attachment.md')).toContain('- button "Go"');
    expect(read(dir, 'b-attachment.txt')).not.toContain(HELD);
    expect(read(dir, 'b-attachment.txt')).toContain('logged in with');
    expect(read(dir, 'c-attachment.zip')).toContain(HELD);
    expect(read(dir, 'd-result.json')).toBe('{"name":"kept"}');
    expect(() => read(dir, 'e-attachment.txt')).toThrow();
    expect(read(root, 'outside.txt')).toBe('outside');
    expect(ctx.lines.join('\n')).not.toContain(HELD);
  });

  test('runs the command first, scrubs, then generates, and returns the command code', () => {
    const { root, dir } = fixture();
    const spawned: string[][] = [];
    expect(runScrub(['--then-generate', '--', 'bunx', '--bun', 'playwright', 'test', '--project=e2e'], context(root, spawned, [1, 0]))).toBe(1);
    expect(spawned).toEqual([['bunx', '--bun', 'playwright', 'test', '--project=e2e'], ['bunx', 'allure', 'generate', dir]]);
    expect(read(dir, 'b-attachment.txt')).not.toContain(HELD);
  });

  test('a missing directory is not an error, a bad argument is', () => {
    const { root } = fixture();
    expect(runScrub(['--results', 'nowhere'], context(root))).toBe(0);
    expect(runScrub(['--nope'], context(root))).toBe(2);
  });
});
