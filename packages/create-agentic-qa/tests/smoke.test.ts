import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { parseArgs } from '../src/args.ts';
import { CliError } from '../src/errors.ts';
import { pruneBootstrapExcludes, sanitizeProjectName } from '../src/prepare.ts';

describe('parseArgs', () => {
  test('accepts a project name as positional', () => {
    const a = parseArgs(['my-app']);
    expect(a.projectName).toBe('my-app');
    expect(a.here).toBe(false);
    expect(a.template).toBe('main');
  });

  test('rejects missing project name without --here', () => {
    expect(() => parseArgs([])).toThrow(CliError);
  });

  test('accepts --here without a name', () => {
    const a = parseArgs(['--here']);
    expect(a.here).toBe(true);
    expect(a.projectName).toBeUndefined();
  });

  test('parses --template and --template-repo', () => {
    const a = parseArgs(['my-app', '--template', 'develop', '--template-repo', 'fork/agentic-qa-boilerplate']);
    expect(a.template).toBe('develop');
    expect(a.templateRepo).toBe('fork/agentic-qa-boilerplate');
  });

  test('parses skip flags', () => {
    const a = parseArgs(['my-app', '--no-install', '--no-setup', '--no-git']);
    expect(a.noInstall).toBe(true);
    expect(a.noSetup).toBe(true);
    expect(a.noGit).toBe(true);
  });

  test('rejects unknown flag', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(CliError);
  });

  test('rejects flag missing value', () => {
    expect(() => parseArgs(['my-app', '--template'])).toThrow(CliError);
  });

  test('parses --menu flag', () => {
    const a = parseArgs(['--menu', 'foo']);
    expect(a.menu).toBe(true);
    expect(a.projectName).toBe('foo');
  });

  test('parses --no-banner flag', () => {
    const a = parseArgs(['--no-banner', 'foo']);
    expect(a.noBanner).toBe(true);
  });
});

describe('sanitizeProjectName', () => {
  test('lowercases and replaces invalid chars', () => {
    expect(sanitizeProjectName('My App!')).toBe('my-app');
  });

  test('collapses repeated dashes', () => {
    expect(sanitizeProjectName('foo---bar')).toBe('foo-bar');
  });

  test('trims leading/trailing dashes', () => {
    expect(sanitizeProjectName('-foo-')).toBe('foo');
  });

  test('clamps to 214 chars', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeProjectName(long).length).toBeLessThanOrEqual(214);
  });
});

describe('pruneBootstrapExcludes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'caq-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('removes hardcoded excludes from project dir', async () => {
    mkdirSync(join(dir, 'packages', 'foo'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'foo', 'a.ts'), '// a');
    writeFileSync(join(dir, 'keep.txt'), 'keep me');

    await pruneBootstrapExcludes(dir);

    expect(existsSync(join(dir, 'packages'))).toBe(false);
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
  });

  test('is a no-op when hardcoded excludes are absent', async () => {
    writeFileSync(join(dir, 'keep.txt'), 'keep me');
    await pruneBootstrapExcludes(dir);
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
  });
});
