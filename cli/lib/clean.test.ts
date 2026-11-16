import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { isDeletable, planClean, removeEntry, TARGETS } from './clean.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 16);
const roots: string[] = [];

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'clean-'));
  roots.push(root);
  return root;
}

function file(root: string, rel: string, daysOld = 0): void {
  const full = join(root, ...rel.split('/'));
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, 'x');
  const when = new Date(NOW - daysOld * DAY);
  // A directory's mtime counts too (the age gate reads the newest mtime in the tree).
  for (let dir = full; dir !== root; dir = dirname(dir)) { utimesSync(dir, when, when); }
}

const options = (levels: Parameters<typeof planClean>[1]['levels']) => ({ levels, olderThanDays: 30, nowMs: NOW });
const rels = (root: string, levels: Parameters<typeof planClean>[1]['levels']): string[] => planClean(root, options(levels)).map(e => e.rel).sort();

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

describe('planClean', () => {
  test('level safe finds test output, playwright-cli logs and .DS_Store, nothing else', () => {
    const root = repo();
    for (const rel of ['test-results/a.json', 'allure-results/b.json', '.playwright/output/c.yml', '.context/reports/.playwright-cli/d.log', 'docs/.DS_Store']) { file(root, rel); }
    for (const rel of ['.env', '.auth/staging-admin.json', '.allure/history.jsonl', '.backups/x.json', '.context/PBI/epics/e.md', '.context/reports/hand-made.html', 'tests/spec.ts', 'node_modules/p/.DS_Store']) { file(root, rel); }
    expect(rels(root, ['safe'])).toEqual(['.context/reports/.playwright-cli', '.playwright/output', 'allure-results', 'docs/.DS_Store', 'test-results']);
  });

  test('history: .allure and every .backups* sibling, only when asked for', () => {
    const root = repo();
    for (const rel of ['.allure/history.jsonl', '.backups/a.json', '.backups-2026-08-31-site71/b.json', '.backups.old-69to71-migration/c.json', '.backupsnot/d.json', 'src/.backups/e.json']) { file(root, rel); }
    expect(rels(root, ['safe'])).toEqual([]);
    expect(rels(root, ['history'])).toEqual(['.allure', '.backups', '.backups-2026-08-31-site71', '.backups.old-69to71-migration', '.backupsnot']);
  });

  test('profiles, sessions and builds stay out unless asked for', () => {
    const root = repo();
    for (const rel of ['.playwright/user-data/Default/Cookies', '.session/spikes/x/a.md', 'node_modules/p/i.js']) { file(root, rel); }
    expect(rels(root, ['safe'])).toEqual([]);
    expect(rels(root, ['profiles'])).toEqual(['.playwright/user-data']);
    expect(rels(root, ['builds'])).toEqual(['node_modules']);
  });

  test('sessions: only the scratch subtrees, and a young one is kept', () => {
    const root = repo();
    file(root, '.session/spikes/old/a.md', 60);
    file(root, '.session/spikes/new/a.md', 2);
    file(root, '.session/.archive/2026-01-01-x/plan.md', 90);
    file(root, '.session/decisions/d.md', 90);
    file(root, '.session/handoffs/h.md', 90);
    file(root, '.session/framework-development/clean/plan.md', 90);
    const plan = planClean(root, options(['sessions']));
    expect(plan.map(e => e.rel).sort()).toEqual(['.session/.archive/2026-01-01-x', '.session/spikes/new', '.session/spikes/old']);
    expect(plan.filter(e => e.verdict === 'delete').map(e => e.rel).sort()).toEqual(['.session/.archive/2026-01-01-x', '.session/spikes/old']);
  });

  test('builds expands packages/*', () => {
    const root = repo();
    file(root, 'packages/a/node_modules/x.js');
    file(root, 'packages/a/dist/y.js');
    file(root, 'packages/a/src/z.ts');
    expect(rels(root, ['builds'])).toEqual(['packages/a/dist', 'packages/a/node_modules']);
  });
});

describe('isDeletable', () => {
  test('refuses the root, paths outside it, protected trees and symlinks', () => {
    const root = repo();
    const outside = repo();
    file(root, '.auth/a.json');
    file(root, '.context/PBI/epics/e.md');
    file(root, '.env.local');
    file(root, 'test-results/a.json');
    symlinkSync(outside, join(root, 'allure-results'));
    expect(isDeletable(root, root)).toBe(false);
    expect(isDeletable(root, outside)).toBe(false);
    expect(isDeletable(root, join(root, '.auth'))).toBe(false);
    expect(isDeletable(root, join(root, '.context', 'PBI'))).toBe(false);
    expect(isDeletable(root, join(root, '.env.local'))).toBe(false);
    expect(isDeletable(root, join(root, 'allure-results'))).toBe(false);
    expect(isDeletable(root, join(root, 'test-results'))).toBe(true);
  });

  test('no registry row points into a protected tree', () => {
    const root = repo();
    for (const target of TARGETS) {
      const full = join(root, ...target.path.replace('/*', '').split('/'));
      mkdirSync(full, { recursive: true });
      expect(isDeletable(root, full)).toBe(true);
    }
  });
});

describe('removeEntry', () => {
  test('deletes a planned entry and leaves the rest', () => {
    const root = repo();
    file(root, 'test-results/a.json');
    file(root, '.auth/keep.json');
    const [entry] = planClean(root, options(['safe']));
    expect(removeEntry(root, entry)).toBeNull();
    expect(existsSync(join(root, 'test-results'))).toBe(false);
    expect(existsSync(join(root, '.auth', 'keep.json'))).toBe(true);
  });

  test('refuses an entry the guard rejects', () => {
    const root = repo();
    file(root, '.auth/keep.json');
    const error = removeEntry(root, { level: 'safe', rel: '.auth', bytes: 1, lastUsedMs: 0, regen: '', verdict: 'delete' });
    expect(error).toContain('refused');
    expect(existsSync(join(root, '.auth', 'keep.json'))).toBe(true);
  });
});
