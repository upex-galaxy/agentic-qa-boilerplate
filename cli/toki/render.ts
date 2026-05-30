/**
 * WokiToki (`toki`) - full HTML document assembler.
 *
 * Server-renders the static shell (the exact class/id contract shared with
 * `ui/app.css` and `ui/app.js`) plus each block's markdown content, so text
 * nodes are stable for highlight-to-quote anchoring. `ui/app.js` then builds
 * the interactive parts (controls, textarea, quote chips, drawer, validation,
 * submit) at runtime from `window.__TOKI__`.
 *
 * Synchronous by contract: `server.ts` calls `opts.render(spec)` synchronously
 * to produce the page served on `GET /`. The two vanilla UI assets are read
 * ONCE at module load (no per-call I/O) via `node:fs` - a Bun built-in, so this
 * honors the decoupling rule (Bun built-ins only, zero external deps) and stays
 * extractable to a standalone package.
 */

import type { NormalizedSpec } from './schema.ts';

import { readFileSync } from 'node:fs';

import { md } from './markdown.ts';

// ============================================================================
// ASSETS (read ONCE at module load - render() stays synchronous + I/O-free)
// ============================================================================

/** Inlined verbatim into a `<style>` tag. */
const APP_CSS = readFileSync(new URL('./ui/app.css', import.meta.url), 'utf8');

/** Inlined verbatim into the second `<script>` tag (after the spec script). */
const APP_JS = readFileSync(new URL('./ui/app.js', import.meta.url), 'utf8');

// ============================================================================
// ESCAPING
// ============================================================================

/** Escape a string for safe interpolation into HTML text / attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * JSON-encode the spec for embedding inside a `<script>` block, then neutralize
 * the only sequences that could break out of that script context: `<` (so a
 * literal `</script>` inside any content string cannot terminate the tag) and
 * `>` for symmetry. Both become their `\uXXXX` escapes, which `JSON.parse`
 * decodes back to the original characters - so the client sees the exact spec.
 */
function embedSpecJson(spec: NormalizedSpec): string {
  return JSON.stringify(spec)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
}

// ============================================================================
// SECTION RENDERING
// ============================================================================

/**
 * Render one block as a `<section>`: server-rendered markdown content (stable
 * text nodes for quoting) plus an EMPTY interactive host that `app.js` fills.
 */
function renderBlockSection(block: NormalizedSpec['blocks'][number], index: number): string {
  const id = escapeHtml(block.id);
  const content = md(block.content);
  return `      <section class="toki-block" data-block-id="${id}" data-block-index="${index}">
        <div class="toki-block__content" data-quote-source>${content}</div>
        <div class="toki-block__interactive" data-block-id="${id}"></div>
      </section>`;
}

// ============================================================================
// DOCUMENT ASSEMBLY
// ============================================================================

/**
 * Build the full HTML document for `spec`, exactly per the shared DOM contract.
 * Synchronous; returns the complete document string.
 */
export function render(spec: NormalizedSpec, submitToken: string): string {
  const title = escapeHtml(spec.title);
  const submitLabel = escapeHtml(spec.submitLabel);

  const intro
    = typeof spec.intro === 'string' && spec.intro.length > 0
      ? `<div class="toki-intro">${md(spec.intro)}</div>`
      : '';

  const sections = spec.blocks
    .map((block, index) => renderBlockSection(block, index))
    .join('\n');

  const specJson = embedSpecJson(spec);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${APP_CSS}</style>
</head>
<body>
  <main id="toki-app">
    <header class="toki-header">
      <h1 class="toki-title">${title}</h1>${intro ? `\n      ${intro}` : ''}
    </header>
    <div class="toki-progress" id="toki-progress" role="status" aria-live="polite">
      <div class="toki-progress__track"><div class="toki-progress__fill" id="toki-progress-fill"></div></div>
      <span class="toki-progress__label" id="toki-progress-label"></span>
    </div>
    <form id="toki-form" class="toki-blocks">
${sections}
    </form>
    <footer class="toki-bar">
      <span class="toki-bar__remaining" id="toki-remaining"></span>
      <button type="button" class="toki-bar__submit" id="toki-submit" disabled>${submitLabel}</button>
    </footer>
    <aside class="toki-drawer" id="toki-drawer" hidden aria-hidden="true">
      <div class="toki-drawer__scrim" id="toki-drawer-scrim"></div>
      <div class="toki-drawer__panel" role="dialog" aria-label="Reference">
        <button type="button" class="toki-drawer__close" id="toki-drawer-close" aria-label="Close reference">close</button>
        <div class="toki-drawer__content" id="toki-drawer-content"></div>
      </div>
    </aside>
    <button type="button" class="toki-quote-btn" id="toki-quote-btn" hidden>quote</button>
    <div class="toki-done" id="toki-done" hidden>Submitted. You can close this tab.</div>
  </main>
  <script>window.__TOKI__ = ${specJson};window.__TOKI_TOKEN__ = ${JSON.stringify(submitToken)};</script>
  <script>${APP_JS}</script>
</body>
</html>
`;
}
