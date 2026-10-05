/**
 * @fileoverview Tests for the inherited-variable drift rule behind the launcher
 * and `vars:env:check`.
 *
 * What they guard:
 *   1. The compare rule: a DIFFERENT inherited value is a hit; an equal one, a
 *      key the files leave empty, and a key the process does not carry are not.
 *   2. `.env.local` layers over `.env`, as varlock layers them.
 *   3. Only names and flags leave the varlock metadata parser.
 *   4. The real pinned varlock lists only schema items the process overrides
 *      (shells out to `node_modules/.bin/varlock`, so it needs `bun install`).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { fileValues, findDrift, hasEnvFiles, loadVarlockMetadata, parseVarlockMetadata } from './env-drift.ts';

let root: string;

beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'env-drift-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const meta = (overrideKeys: string[], sensitive: string[] = []) => ({
  overrideKeys,
  sensitive: new Set(sensitive),
  declared: new Set(overrideKeys),
});

describe('findDrift', () => {
  const files = new Map([['HOST', 'https://new.example.test'], ['TOKEN', 'file-token'], ['EMPTY', '']]);

  test('a different inherited value is a hit, with its sensitivity', () => {
    const hits = findDrift(meta(['HOST', 'TOKEN'], ['TOKEN']), { HOST: 'https://old.example.test', TOKEN: 'stale-token' }, files);
    expect(hits.map(h => [h.name, h.sensitive])).toEqual([['HOST', false], ['TOKEN', true]]);
  });

  test('equal values, empty file values and keys absent from the process pass', () => {
    expect(findDrift(meta(['HOST', 'EMPTY', 'TOKEN', 'NOT_IN_FILES']), {
      HOST: 'https://new.example.test',
      EMPTY: 'from-ci',
      NOT_IN_FILES: 'exported-on-purpose',
    }, files)).toEqual([]);
  });

  test('only names varlock reports as overridden are compared', () => {
    expect(findDrift(meta([]), { HOST: 'https://old.example.test' }, files)).toEqual([]);
  });
});

describe('fileValues', () => {
  test('.env.local wins over .env', () => {
    writeFileSync(join(root, '.env'), 'A=from-env\nB=only-env\n');
    writeFileSync(join(root, '.env.local'), 'A=from-local\n');
    expect(fileValues(root)).toEqual(new Map([['A', 'from-local'], ['B', 'only-env']]));
  });

  test('hasEnvFiles is false on a checkout with neither file', () => {
    expect(hasEnvFiles(root)).toBe(false);
    writeFileSync(join(root, '.env.local'), 'A=1\n');
    expect(hasEnvFiles(root)).toBe(true);
  });
});

describe('parseVarlockMetadata', () => {
  test('keeps names and the sensitive flag, never a value', () => {
    const parsed = parseVarlockMetadata(JSON.stringify({
      overrideKeys: ['A'],
      config: { A: { isSensitive: false, value: 'visible' }, B: { isSensitive: true, value: 'se▒▒▒' } },
    }));
    expect(parsed?.overrideKeys).toEqual(['A']);
    expect([...(parsed?.sensitive ?? [])]).toEqual(['B']);
    expect([...(parsed?.declared ?? [])]).toEqual(['A', 'B']);
    expect(JSON.stringify([...(parsed?.declared ?? []), ...(parsed?.sensitive ?? [])])).not.toContain('visible');
  });

  test('anything that is not the json-full shape is null', () => {
    expect(parseVarlockMetadata('not json')).toBeNull();
    expect(parseVarlockMetadata('{"config":{}}')).toBeNull();
  });
});

describe('loadVarlockMetadata (pinned varlock)', () => {
  test('lists the schema items the process overrides, not undeclared keys', () => {
    const repoRoot = join(import.meta.dir, '..', '..');
    writeFileSync(join(root, '.env.schema'), '# @defaultRequired=false\n# ---\nHOST=\n# @sensitive\nTOKEN=\n');
    writeFileSync(join(root, '.env'), 'HOST=https://file.example.test\n');
    const env = { PATH: `${join(repoRoot, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`, HOME: process.env.HOME, HOST: 'https://old.example.test', UNDECLARED_PROBE: 'x' };
    const loaded = loadVarlockMetadata(root, env);
    expect(loaded?.overrideKeys).toEqual(['HOST']);
    expect(loaded?.sensitive.has('TOKEN')).toBe(true);
    expect(findDrift(loaded!, env, fileValues(root)).map(h => h.name)).toEqual(['HOST']);
  });
});
