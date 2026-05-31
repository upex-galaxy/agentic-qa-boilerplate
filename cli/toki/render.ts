/**
 * WokiToki (`toki`) - full HTML document assembler.
 *
 * Server-renders the static shell (the exact class/id contract shared with
 * `ui/app.css` and `ui/app.js`) plus each block's markdown content, so text
 * nodes are stable for highlight-to-quote anchoring. `ui/app.js` then builds
 * the interactive parts (controls, textarea, quote chips, expand panel,
 * validation, submit) at runtime from `window.__TOKI__`.
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
 * Table blocks branch to `renderTableSection`.
 */
function renderBlockSection(block: NormalizedSpec['blocks'][number], index: number): string {
  if (block.table) {
    return renderTableSection(block, block.table, index);
  }
  const id = escapeHtml(block.id);
  const content = md(block.content);
  return `      <section class="toki-block" data-block-id="${id}" data-block-index="${index}">
        <div class="toki-block__content" data-quote-source>${content}</div>
        <div class="toki-block__interactive" data-block-id="${id}"></div>
      </section>`;
}

/**
 * Render a table block. Cells are server-rendered (escaped) so they are stable
 * quote-source text nodes; `app.js` fills each row's `.toki-table__answer` cell
 * with the row controls, the row textarea and that row's quote chips.
 */
function renderTableSection(
  block: NormalizedSpec['blocks'][number],
  table: NonNullable<NormalizedSpec['blocks'][number]['table']>,
  index: number,
): string {
  const id = escapeHtml(block.id);

  const intro
    = block.content.length > 0
      ? `\n        <div class="toki-block__content" data-quote-source>${md(block.content)}</div>`
      : '';

  const headCells = table.columns
    .map(column => `<th>${escapeHtml(column)}</th>`)
    .join('');

  const bodyRows = table.rows
    .map((row) => {
      const rowId = escapeHtml(row.id);
      const cells = row.cells
        .map(cell => `<td class="toki-table__cell" data-quote-source>${escapeHtml(cell)}</td>`)
        .join('');
      return `            <tr class="toki-table__row" data-row-id="${rowId}">${cells}<td class="toki-table__answer" data-row-id="${rowId}"></td></tr>`;
    })
    .join('\n');

  return `      <section class="toki-block toki-block--table" data-block-id="${id}" data-block-index="${index}">${intro}
        <div class="toki-table__scroll">
          <table class="toki-table">
            <thead><tr>${headCells}<th class="toki-table__answer-head">Answer</th></tr></thead>
            <tbody>
${bodyRows}
            </tbody>
          </table>
        </div>
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
      <button type="button" class="toki-theme-toggle" id="toki-theme-toggle" aria-label="Toggle light/dark theme" aria-pressed="false" title="Toggle light/dark theme"></button>
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
    <div class="toki-expand" id="toki-expand" hidden aria-hidden="true">
      <div class="toki-expand__backdrop" id="toki-expand-backdrop"></div>
      <div class="toki-expand__panel" role="dialog" aria-modal="true" aria-label="Write your response">
        <header class="toki-expand__head">
          <span class="toki-expand__title" id="toki-expand-title">Your response</span>
          <button type="button" class="toki-expand__close" id="toki-expand-close" aria-label="Close">close</button>
        </header>
        <details class="toki-expand__ref" id="toki-expand-ref">
          <summary class="toki-expand__ref-summary">Reference</summary>
          <div class="toki-expand__ref-content" id="toki-expand-ref-content"></div>
        </details>
        <div class="toki-expand__quotes" id="toki-expand-quotes"></div>
        <textarea class="toki-expand__input" id="toki-expand-input" rows="10"></textarea>
      </div>
    </div>
    <button type="button" class="toki-quote-btn" id="toki-quote-btn" hidden>quote</button>
    <div class="toki-done" id="toki-done" hidden>Submitted. You can close this tab.</div>
  </main>
  <script>window.__TOKI__ = ${specJson};window.__TOKI_TOKEN__ = ${JSON.stringify(submitToken)};</script>
  <script>${APP_JS}</script>
</body>
</html>
`;
}
