/**
 * Tests for the shared separator normaliser.
 *
 * These run on the HOST platform, so on macOS/Linux `relativePosix` has nothing
 * to normalise. `toPosix` is therefore tested with literal Windows-shaped
 * strings — the only way to exercise the win32 behaviour from a POSIX runner.
 */

import { relative } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { relativePosix, toPosix } from './posix-path';

describe('toPosix', () => {
  it('rewrites Windows separators', () => {
    expect(toPosix('tests\\components\\api\\AuthApi.ts')).toBe('tests/components/api/AuthApi.ts');
  });

  it('leaves an already-POSIX path untouched', () => {
    expect(toPosix('tests/components/api/AuthApi.ts')).toBe('tests/components/api/AuthApi.ts');
  });

  it('is idempotent', () => {
    const once = toPosix('a\\b\\c');
    expect(toPosix(once)).toBe(once);
  });

  it('normalises a drive-letter absolute path', () => {
    expect(toPosix('C:\\repo\\docs\\onboarding.html')).toBe('C:/repo/docs/onboarding.html');
  });

  it('passes an empty string through', () => {
    expect(toPosix('')).toBe('');
  });
});

describe('relativePosix', () => {
  it('agrees with node:path on this platform', () => {
    const from = process.cwd();
    const to = `${process.cwd()}/scripts/lib/posix-path.ts`;
    expect(relativePosix(from, to)).toBe(toPosix(relative(from, to)));
  });

  it('never emits a backslash', () => {
    const out = relativePosix(process.cwd(), `${process.cwd()}/scripts/lib/posix-path.ts`);
    expect(out).not.toContain('\\');
    expect(out).toBe('scripts/lib/posix-path.ts');
  });

  it('keeps an upward traversal POSIX-shaped', () => {
    const out = relativePosix(`${process.cwd()}/scripts/lib`, process.cwd());
    expect(out).not.toContain('\\');
  });
});
