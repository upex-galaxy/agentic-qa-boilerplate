import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildManifest, DEFAULT_ORDER, manifestPaths, readPageMeta, titleCase } from './docs-manifest.ts';

let docs: string;

function page(rel: string, meta: { title?: string, description?: string, order?: number, section?: string } = {}): void {
  const full = join(docs, rel);
  mkdirSync(dirname(full), { recursive: true });
  const tags = [
    meta.title === undefined ? '' : `<title>${meta.title}</title>`,
    meta.description === undefined ? '' : `<meta name="description" content="${meta.description}" />`,
    meta.order === undefined ? '' : `<meta name="docs-order" content="${meta.order}" />`,
    meta.section === undefined ? '' : `<meta name="docs-section-title" content="${meta.section}" />`,
  ].join('');
  writeFileSync(full, `<!doctype html><html><head>${tags}</head><body><title>not this</title></body></html>`);
}

beforeEach(() => {
  docs = mkdtempSync(join(tmpdir(), 'docs-manifest-'));
});

afterEach(() => {
  rmSync(docs, { recursive: true, force: true });
});

describe('readPageMeta', () => {
  test('reads title, description, order and section title from the head only', () => {
    const meta = readPageMeta('<head><title> Setup &amp; MCP </title><meta content="Guías." name="description"><meta name="docs-order" content="20"><meta name="docs-section-title" content="Setup"></head><title>x</title>');
    expect(meta).toEqual({ title: 'Setup & MCP', description: 'Guías.', order: 20, sectionTitle: 'Setup' });
  });

  test('falls back to the default order and nulls', () => {
    expect(readPageMeta('<p>no head</p>')).toEqual({ title: null, description: null, order: DEFAULT_ORDER, sectionTitle: null });
  });
});

describe('buildManifest', () => {
  test('builds the tree, skipping the portal, assets and dotfiles, sorted by order then title', () => {
    page('index.html', { title: 'Portal' });
    page('assets/ignored.html', { title: 'Asset' });
    page('.hidden/x.html', { title: 'Hidden' });
    page('core/empezar-aqui.html', { title: 'Empezar aquí', description: 'Inicio.', order: 10 });
    page('core/setup/index.html', { title: 'Setup page', section: 'Setup', order: 20 });
    page('core/setup/zeta.html', { title: 'Zeta' });
    page('core/setup/alfa.html', { title: 'Alfa' });
    page('team/runbooks/deploy.html');

    const manifest = buildManifest(docs, new Date('2026-09-24T00:00:00Z'));
    expect(manifest.generatedAt).toBe('2026-09-24T00:00:00.000Z');
    expect(manifestPaths(manifest.children)).toEqual([
      'core/empezar-aqui.html',
      'core/setup/index.html',
      'core/setup/alfa.html',
      'core/setup/zeta.html',
      'team/runbooks/deploy.html',
    ]);

    const [core, team] = manifest.children;
    expect(core).toMatchObject({ type: 'folder', path: 'core', title: 'Core', index: null });
    expect(team).toMatchObject({ type: 'folder', title: 'Team' });
    const setup = core.type === 'folder' ? core.children[1] : null;
    expect(setup).toMatchObject({ type: 'folder', path: 'core/setup', title: 'Setup', order: 20, index: 'core/setup/index.html' });
    const deploy = manifestPaths(manifest.children).at(-1);
    expect(deploy).toBe('team/runbooks/deploy.html');
  });

  test('titles a page without <title> from its file name', () => {
    page('team/sql-cookbook.html');
    const team = buildManifest(docs).children[0];
    expect(team.type === 'folder' ? team.children[0].title : null).toBe('Sql Cookbook');
  });

  test('returns an empty tree when docs/ is missing', () => {
    expect(buildManifest(join(docs, 'nope')).children).toEqual([]);
  });
});

describe('titleCase', () => {
  test('turns a slug into words', () => {
    expect(titleCase('early-game.html')).toBe('Early Game');
  });
});
