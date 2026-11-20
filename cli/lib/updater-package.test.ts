import type { PackageJsonSpec } from './updater-types';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';
import { applyPackageJsonAppend } from './updater-package';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

function fixture(_upstream: Record<string, unknown>, local: Record<string, unknown>): { repo: string } {
  const repo = mkdtempSync(join(tmpdir(), 'updater package '));
  roots.push(repo);
  writeFileSync(join(repo, 'package.json'), `${JSON.stringify(local, null, 2)}\n`);
  return { repo };
}

function readLocal(repo: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repo, 'package.json'), 'utf-8')) as Record<string, unknown>;
}

describe('a dependency section in ascending order stays in ascending order', () => {
  const DEPS: PackageJsonSpec = { path: 'package.json', sections: ['scripts', 'devDependencies'] };

  test('a new devDependency lands at its sorted position, not at the end', () => {
    const { repo } = fixture({}, { devDependencies: { husky: '^9.0.0', prettier: '^3.0.0', typescript: '^5.0.0' } });
    applyPackageJsonAppend(DEPS, { devDependencies: { 'oxlint': '1.0.0', 'eslint-plugin-x': '^1.0.0' } }, repo);
    expect(Object.keys(readLocal(repo).devDependencies as Record<string, string>)).toEqual(['eslint-plugin-x', 'husky', 'oxlint', 'prettier', 'typescript']);
  });

  test('a hand-ordered devDependencies keeps its order and gets the new key at the end', () => {
    const { repo } = fixture({}, { devDependencies: { typescript: '^5.0.0', husky: '^9.0.0' } });
    applyPackageJsonAppend(DEPS, { devDependencies: { oxlint: '1.0.0' } }, repo);
    expect(Object.keys(readLocal(repo).devDependencies as Record<string, string>)).toEqual(['typescript', 'husky', 'oxlint']);
  });

  test('scripts are never re-sorted, even when they happen to be ascending', () => {
    const { repo } = fixture({}, { scripts: { b: 'x', c: 'y' } });
    applyPackageJsonAppend(DEPS, { scripts: { a: 'z' } }, repo);
    expect(Object.keys(readLocal(repo).scripts as Record<string, string>)).toEqual(['b', 'c', 'a']);
  });
});
