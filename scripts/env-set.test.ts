/**
 * Regression tests for `scripts/env-set.ts`, the only write path into `.env`
 * an agent may use (Critical Rule #1). What they guard:
 *   1. Every refusal path: a key the schema marks `@sensitive`, a key whose
 *      name reads as a secret, a key the schema does not declare, a key whose
 *      value does not live in `.env`, and any key when the schema did not load.
 *      A refusal writes nothing, even when another pair in the call was allowed.
 *   2. The upsert replaces the active line in place, keeps its inline comment,
 *      keeps comment lines and every other line byte-identical, and appends a
 *      missing key.
 *   3. Nothing printed carries a value: neither the one written nor any other.
 *   4. The committed QA schema marks the core credentials sensitive (real
 *      varlock, so it needs `bun install`).
 */

import type { VarlockOverrides } from '../cli/lib/env-drift.ts';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { loadVarlockMetadata } from '../cli/lib/env-drift.ts';
import { formatValue, parsePairs, refusalFor, run, upsertEnvLine } from './env-set.ts';

const OTHER_SECRET = 'canary-other-secret-value';

const SCHEMA: VarlockOverrides = {
  overrideKeys: [],
  sensitive: new Set(['XRAY_CLIENT_SECRET', 'STAGING_ADMIN_SECRETISH']),
  declared: new Set(['XRAY_CLIENT_SECRET', 'STAGING_ADMIN_SECRETISH', 'TEST_ENV', 'PORTAL_URL', 'STAGING_ADMIN_PASSWORD', 'ATLASSIAN_URL']),
};
const schema = (): VarlockOverrides => SCHEMA;

let root: string;
let printed: string[];
const out = (line: string): void => { printed.push(line); };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'env-set-'));
  printed = [];
  writeFileSync(join(root, '.env'), [
    '# local env',
    `XRAY_CLIENT_SECRET=${OTHER_SECRET}`,
    'TEST_ENV=local',
    '# TEST_ENV=commented-out',
    '',
  ].join('\n'));
});

afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const envText = (): string => readFileSync(join(root, '.env'), 'utf8');

describe('refusal', () => {
  it('refuses a key the schema marks @sensitive', () => {
    expect(refusalFor('XRAY_CLIENT_SECRET', SCHEMA)).toContain('is a secret');
    const before = envText();
    expect(run(['XRAY_CLIENT_SECRET=new-value'], root, schema, out)).toBe(1);
    expect(envText()).toBe(before);
  });

  it('refuses a declared key whose name reads as a secret, even when the schema forgot @sensitive', () => {
    expect(refusalFor('STAGING_ADMIN_PASSWORD', SCHEMA)).toContain('is a secret');
  });

  it('refuses a key the schema does not declare (default = refuse)', () => {
    expect(refusalFor('SOME_UNDECLARED_KEY', SCHEMA)).toContain('not declared');
  });

  it('refuses a key whose value does not live in .env', () => {
    expect(refusalFor('ATLASSIAN_URL', SCHEMA)).toContain('not read from .env');
  });

  it('refuses every key when the schema did not load', () => {
    expect(refusalFor('TEST_ENV', null)).toContain('did not load');
    expect(run(['TEST_ENV=staging'], root, () => null, out)).toBe(1);
  });

  it('writes nothing when any pair in the call is refused', () => {
    const before = envText();
    expect(run(['TEST_ENV=staging', 'XRAY_CLIENT_SECRET=x'], root, schema, out)).toBe(1);
    expect(envText()).toBe(before);
    expect(printed.join('\n')).toContain('nothing written');
  });

  it('accepts a declared, non-sensitive key', () => {
    expect(refusalFor('TEST_ENV', SCHEMA)).toBeNull();
    expect(refusalFor('PORTAL_URL', SCHEMA)).toBeNull();
  });
});

describe('write', () => {
  it('replaces the active line in place and leaves every other line alone', () => {
    expect(run(['TEST_ENV=staging'], root, schema, out)).toBe(0);
    expect(envText()).toBe([
      '# local env',
      `XRAY_CLIENT_SECRET=${OTHER_SECRET}`,
      'TEST_ENV=staging',
      '# TEST_ENV=commented-out',
      '',
    ].join('\n'));
  });

  it('appends a key that has no active line', () => {
    expect(upsertEnvLine('A=1', 'PORTAL_URL', 'https://reports.example.test')).toBe('A=1\nPORTAL_URL=https://reports.example.test\n');
  });

  it('keeps an export prefix', () => {
    expect(upsertEnvLine('export TEST_ENV=local\n', 'TEST_ENV', 'staging')).toBe('export TEST_ENV=staging\n');
  });

  it('keeps an inline comment on the replaced line, quoted or not', () => {
    expect(upsertEnvLine('TEST_ENV=local # which env the suite runs\n', 'TEST_ENV', 'staging')).toBe('TEST_ENV=staging # which env the suite runs\n');
    expect(upsertEnvLine('TEST_ENV="a # b"   # quoted value\n', 'TEST_ENV', 'staging')).toBe('TEST_ENV=staging   # quoted value\n');
    expect(upsertEnvLine('TEST_ENV=\'x\' # single\n', 'TEST_ENV', 'two words')).toBe('TEST_ENV="two words" # single\n');
  });

  it('does not read a # inside an unquoted value as a comment', () => {
    expect(upsertEnvLine('PORTAL_URL=https://h/#frag\n', 'PORTAL_URL', 'https://h/x')).toBe('PORTAL_URL=https://h/x\n');
  });

  it('notes a .env.local line that shadows the write, by name only', () => {
    writeFileSync(join(root, '.env.local'), 'TEST_ENV=local-override\n');
    expect(run(['TEST_ENV=staging'], root, schema, out)).toBe(0);
    const all = printed.join('\n');
    expect(all).toContain('.env.local also sets TEST_ENV');
    expect(all).not.toContain('local-override');
  });

  it('never prints a value', () => {
    run(['PORTAL_URL=https://reports.example.test'], root, schema, out);
    run(['XRAY_CLIENT_SECRET=attempted-secret'], root, schema, out);
    const all = printed.join('\n');
    expect(all).toContain('PORTAL_URL');
    expect(all).not.toContain('reports.example.test');
    expect(all).not.toContain('attempted-secret');
    expect(all).not.toContain(OTHER_SECRET);
  });

  it('refuses when .env does not exist', () => {
    rmSync(join(root, '.env'));
    expect(run(['TEST_ENV=staging'], root, schema, out)).toBe(1);
  });
});

describe('parsing and formatting', () => {
  it('keeps an = inside the value', () => {
    expect(parsePairs(['PORTAL_URL=https://h/?a=b'])).toEqual([{ name: 'PORTAL_URL', value: 'https://h/?a=b' }]);
  });

  it('rejects a multi-line value and a bare word', () => {
    expect(typeof parsePairs(['PORTAL_URL=a\nb'])).toBe('string');
    expect(typeof parsePairs(['PORTAL_URL'])).toBe('string');
    expect(run([], root, schema, out)).toBe(2);
  });

  it('quotes a value a loader would split or strip', () => {
    expect(formatValue('https://h.example.com:8080/x')).toBe('https://h.example.com:8080/x');
    expect(formatValue('two words')).toBe('"two words"');
    expect(formatValue('a#b')).toBe('"a#b"');
  });
});

describe('the committed QA schema (pinned varlock)', () => {
  it('marks the core credentials @sensitive and declares the plain settings', () => {
    // Loaded against a throwaway checkout holding only the two schema files, so
    // no real .env is read.
    const repo = join(import.meta.dir, '..');
    writeFileSync(join(root, '.env.schema'), readFileSync(join(repo, '.env.schema'), 'utf8'));
    writeFileSync(join(root, '.env.core.schema'), readFileSync(join(repo, '.env.core.schema'), 'utf8'));
    rmSync(join(root, '.env'));
    const meta = loadVarlockMetadata(root, { PATH: `${join(repo, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`, HOME: process.env.HOME });
    for (const name of ['XRAY_CLIENT_SECRET', 'ATLASSIAN_API_TOKEN', 'STAGING_USER_PASSWORD', 'DBHUB_PASSWORD']) {
      expect(refusalFor(name, meta)).toContain('is a secret');
    }
    for (const name of ['TEST_ENV', 'XRAY_PROJECT_KEY', 'DBHUB_PORT']) {
      expect(refusalFor(name, meta)).toBeNull();
    }
  });
});
