import type { DaemonProfile } from './browser-profiles.ts';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { ageDays, daemonBaseDir, deleteProfile, formatBytes, isDeletableProfile, parseListAll, scanDaemonProfiles, selectStale } from './browser-profiles.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 9);
const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'browser-profiles '));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

function profile(name: string, daysOld: number, hash = '7b8b0496f1474dba'): DaemonProfile {
  return { path: `/cache/daemon/${hash}/${name}`, workspaceHash: hash, workspaceDir: null, name, bytes: 1000, lastUsedMs: NOW - daysOld * DAY };
}

describe('daemonBaseDir', () => {
  test('follows the CLI source per platform', () => {
    expect(daemonBaseDir('darwin', {}, '/Users/me')).toBe('/Users/me/Library/Caches/ms-playwright/daemon');
    expect(daemonBaseDir('linux', {}, '/home/me')).toBe('/home/me/.cache/ms-playwright/daemon');
    expect(daemonBaseDir('linux', { XDG_CACHE_HOME: '/xdg' }, '/home/me')).toBe('/xdg/ms-playwright/daemon');
    expect(daemonBaseDir('win32', { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'C:\\Users\\me')).toBe('C:\\Users\\me\\AppData\\Local\\ms-playwright\\daemon');
    expect(daemonBaseDir('win32', {}, 'C:\\Users\\me')).toBe('C:\\Users\\me\\AppData\\Local\\ms-playwright\\daemon');
    expect(daemonBaseDir('darwin', { PWTEST_DAEMON_SESSION_DIR: '/override' }, '/Users/me')).toBe('/override');
    expect(() => daemonBaseDir('aix', {}, '/home/me')).toThrow('Unsupported platform');
  });
});

describe('parseListAll', () => {
  test('keeps open sessions with their data dir; skips workspace headers, servers and attachable channels', () => {
    const output = [
      '### Browsers',
      '../webapp:',
      '- mapa:',
      '  - status: open',
      '  - browser-type: chrome',
      '  - user-data-dir: /cache/daemon/7b8b0496f1474dba/ud-mapa-chrome',
      '  - headed: false',
      '/:',
      '- BK-12:',
      '  - status: open',
      '  - browser-type: chromium',
      '  - user-data-dir: <in-memory>',
      '',
      '### Browser servers available for attach',
      '- browser "shared":',
      '  - browser: chromium',
      '',
      '### Browsers available to attach via CDP',
      '- chrome:',
      '  - data-dir: /Users/me/Library/Application Support/Google/Chrome',
    ].join('\n');
    expect(parseListAll(output)).toEqual([
      { name: 'mapa', userDataDir: '/cache/daemon/7b8b0496f1474dba/ud-mapa-chrome' },
      { name: 'BK-12', userDataDir: null },
    ]);
    expect(parseListAll('  (no browsers)\n')).toEqual([]);
  });
});

describe('selectStale', () => {
  test('deletes only dirs older than the gate that no live session holds', () => {
    const profiles = [
      profile('ud-old-chrome', 30),
      profile('ud-recent-chrome', 2),
      profile('ud-mapa-chrome', 90),
      profile('ud-exact-chrome', 90, 'aaaa'),
      profile('ud-edge-chrome', 7),
    ];
    const live = [
      { name: 'mapa', userDataDir: null },
      { name: 'other', userDataDir: '/cache/daemon/aaaa/ud-exact-chrome' },
    ];
    expect(selectStale(profiles, live, 7, NOW).map(d => [d.profile.name, d.verdict])).toEqual([
      ['ud-old-chrome', 'delete'],
      ['ud-recent-chrome', 'keep: recent'],
      ['ud-mapa-chrome', 'keep: live session'],
      ['ud-exact-chrome', 'keep: live session'],
      ['ud-edge-chrome', 'delete'],
    ]);
  });

  test('a shared name prefix keeps the dir rather than risk the one in use', () => {
    const decisions = selectStale([profile('ud-a-b-chrome', 60)], [{ name: 'a', userDataDir: null }], 7, NOW);
    expect(decisions[0].verdict).toBe('keep: live session');
  });

  test('a zero-day gate selects every dir no live session holds', () => {
    expect(selectStale([profile('ud-x-chrome', 0.5)], [], 0, NOW)[0].verdict).toBe('delete');
  });
});

describe('scan and delete on disk', () => {
  test('scans only real ud-* dirs, sizes them and dates them by their newest file', () => {
    const base = temporaryRoot();
    const hash = join(base, '7b8b0496f1474dba');
    mkdirSync(join(hash, 'ud-shots-chrome', 'Default'), { recursive: true });
    writeFileSync(join(hash, 'ud-shots-chrome', 'Default', 'Cookies'), 'x'.repeat(5000));
    writeFileSync(join(hash, 'shots.session'), JSON.stringify({ name: 'shots', workspaceDir: '/work/webapp' }));
    mkdirSync(join(hash, 'not-a-profile'));
    const outside = temporaryRoot();
    symlinkSync(outside, join(hash, 'ud-link-chrome'));
    const old = new Date(NOW - 40 * DAY);
    utimesSync(join(hash, 'ud-shots-chrome', 'Default', 'Cookies'), old, old);
    utimesSync(join(hash, 'ud-shots-chrome', 'Default'), old, old);
    utimesSync(join(hash, 'ud-shots-chrome'), old, old);

    const found = scanDaemonProfiles(base);
    expect(found.map(p => p.name)).toEqual(['ud-shots-chrome']);
    expect(found[0].workspaceDir).toBe('/work/webapp');
    expect(found[0].bytes).toBeGreaterThanOrEqual(5000);
    expect(ageDays(found[0].lastUsedMs, NOW)).toBe(40);
    expect(scanDaemonProfiles(join(base, 'missing'))).toEqual([]);
  });

  test('deletes a ud-* dir under the base and refuses everything else', () => {
    const base = temporaryRoot();
    const target = join(base, 'hash', 'ud-old-chrome');
    mkdirSync(join(target, 'Default'), { recursive: true });
    const owner = temporaryRoot();
    const ownerProfile = join(owner, '.agentic-qa', 'playwright-profiles', 'loom');
    mkdirSync(ownerProfile, { recursive: true });
    mkdirSync(join(base, 'hash', 'deep', 'ud-nested-chrome'), { recursive: true });
    symlinkSync(ownerProfile, join(base, 'hash', 'ud-link-chrome'));

    expect(isDeletableProfile(ownerProfile, base)).toBe(false);
    expect(isDeletableProfile(join(base, 'hash'), base)).toBe(false);
    expect(isDeletableProfile(join(base, 'hash', 'deep', 'ud-nested-chrome'), base)).toBe(false);
    expect(isDeletableProfile(join(base, 'hash', 'ud-link-chrome'), base)).toBe(false);
    expect(isDeletableProfile(join(base, 'hash', '..', '..', 'ud-escape'), base)).toBe(false);
    expect(deleteProfile(ownerProfile, base)).toStartWith('refused:');
    expect(existsSync(ownerProfile)).toBe(true);

    expect(deleteProfile(target, base)).toBeNull();
    expect(existsSync(target)).toBe(false);
    expect(existsSync(ownerProfile)).toBe(true);
  });
});

test('formatBytes', () => {
  expect(formatBytes(6.1 * 1024 ** 3)).toBe('6.1 GB');
  expect(formatBytes(24 * 1024 ** 2)).toBe('24 MB');
  expect(formatBytes(2048)).toBe('2 KB');
});
