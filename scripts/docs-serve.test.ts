import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createDocsHandler, DEFAULT_PORT, normalizePage, parseServeArgs } from './docs-serve.ts';

let docs: string;

beforeEach(() => {
  docs = mkdtempSync(join(tmpdir(), 'docs-serve-'));
  mkdirSync(join(docs, 'core'), { recursive: true });
  writeFileSync(join(docs, 'index.html'), '<title>Portal</title>');
  writeFileSync(join(docs, 'core', 'page.html'), '<head><title>Page</title></head>');
});

afterEach(() => {
  rmSync(docs, { recursive: true, force: true });
});

describe('parseServeArgs', () => {
  test('defaults', () => {
    expect(parseServeArgs([])).toEqual({ flags: { port: DEFAULT_PORT, noOpen: false, page: null, help: false }, unknown: [] });
  });

  test('accepts both flag spellings and reports unknown flags', () => {
    const { flags, unknown } = parseServeArgs(['--port', '4000', '--page=docs/core/page.html', '--no-open', '--wat']);
    expect(flags).toMatchObject({ port: 4000, page: 'core/page.html', noOpen: true });
    expect(unknown).toEqual(['--wat']);
    expect(parseServeArgs(['--port=5000', '--page', '/core/x.html']).flags).toMatchObject({ port: 5000, page: 'core/x.html' });
  });

  test('rejects a bad port', () => {
    expect(() => parseServeArgs(['--port=abc'])).toThrow('Invalid --port value');
    expect(() => parseServeArgs(['--port', '70000'])).toThrow('Invalid --port value');
  });
});

describe('normalizePage', () => {
  test('strips a leading docs/ and slashes, converts backslashes', () => {
    expect(normalizePage('docs\\core\\a.html')).toBe('core/a.html');
  });
});

describe('createDocsHandler', () => {
  const get = async (path: string): Promise<Response> => createDocsHandler(docs)(new Request(`http://127.0.0.1${path}`));

  test('serves the portal at / and pages with a content type', async () => {
    const root = await get('/');
    expect(root.status).toBe(200);
    expect(root.headers.get('content-type')).toContain('text/html');
    expect(await (await get('/core/page.html')).text()).toContain('Page');
  });

  test('builds /manifest.json live from disk', async () => {
    writeFileSync(join(docs, 'core', 'new.html'), '<head><title>New</title></head>');
    const manifest = await (await get('/manifest.json')).json() as { children: Array<{ children: Array<{ path: string }> }> };
    expect(manifest.children[0].children.map(c => c.path)).toEqual(['core/new.html', 'core/page.html']);
  });

  test('404s a missing file and refuses traversal', async () => {
    expect((await get('/core/missing.html')).status).toBe(404);
    expect((await get('/..%2f..%2fetc%2fpasswd')).status).toBe(403);
  });
});
