/**
 * The page bundle and its brand slot. `model.ts`, `merge.ts`, `sweep.ts` and `app/` run in the browser, so they
 * may import only pure modules: a `node:` import (from `hosts.ts`, `config.ts`, ...) breaks the page.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { BRAND_SLOT, brandHtml, brandMarkup } from './brand.ts';
import { buildApp } from './build.ts';

describe('page bundle', () => {
  test('builds for the browser with no node: import', async () => {
    const { js, css } = await buildApp();
    expect(js.length).toBeGreaterThan(1000);
    expect(js).not.toMatch(/["']node:/);
    expect(css).toContain('.brand-logo');
    expect(css).toContain('.dk-sheet');
    expect(js).toContain('/api/sweep/send');
  });
});

describe('brand slot', () => {
  test('every id in the page is unique (the footer\'s local-data line and tracker line are two spans)', () => {
    // the page as the server sends it (brand slot filled)
    const html = brandHtml(readFileSync(join(import.meta.dir, 'app', 'index.html'), 'utf8'), { name: 'Shop', logo: null });
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    expect(ids).toContain('foot-source');
    expect(ids).toContain('foot-tracker');
  });

  test('index.html carries the slot and the label placeholder', () => {
    const html = readFileSync(join(import.meta.dir, 'app', 'index.html'), 'utf8');
    expect(html).toContain(BRAND_SLOT);
    expect(html).toContain('aria-label="__BRAND_NAME__"');
  });

  test('no logo: the name as text, the first letter for the rail, escaped', () => {
    const out = brandHtml(`<span aria-label="__BRAND_NAME__">${BRAND_SLOT}</span>`, { name: 'Shop <b>', logo: null });
    expect(out).toBe('<span aria-label="Shop &lt;b&gt;"><span class="logo-full logo-text">Shop &lt;b&gt;</span><span class="logo-mark logo-text">S</span></span>');
  });

  test('an SVG logo is inlined twice (full and mark) with scripts and handlers removed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sprint-board-brand-'));
    try {
      writeFileSync(join(dir, 'logo.svg'), '<?xml version="1.0"?><!-- c --><svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><path d="M0 0h10"/></svg>');
      const out = brandMarkup({ name: 'Shop', logo: 'logo.svg' }, dir);
      expect(out.match(/<svg /g)).toHaveLength(2);
      expect(out).toContain('<svg class="logo-full" focusable="false" viewBox');
      expect(out).toContain('<svg class="logo-mark" focusable="false" viewBox');
      expect(out).not.toContain('script');
      expect(out).not.toContain('onload');
    }
    finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('an SVG that already has a class keeps it, folded into ours (one class attribute)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sprint-board-brand-'));
    try {
      writeFileSync(join(dir, 'logo.svg'), '<svg class="brand-art" viewBox="0 0 10 10"><path d="M0 0h10"/></svg>');
      const out = brandMarkup({ name: 'Shop', logo: 'logo.svg' }, dir);
      expect(out).toContain('<svg class="logo-full brand-art" focusable="false" viewBox');
      expect(out.match(/class=/g)).toHaveLength(2);
    }
    finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a logo path that does not exist falls back to the text brand', () => {
    expect(brandMarkup({ name: 'Shop', logo: 'missing/logo.svg' })).toContain('logo-text');
  });
});
