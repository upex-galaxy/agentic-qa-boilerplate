/**
 * WokiToki (`toki`) — client interactivity.
 *
 * Vanilla browser JavaScript, no build step, no framework, no imports. Inlined
 * by render.ts after the `window.__TOKI__` spec script. render.ts server-renders
 * the static shell + each block's markdown content; this file builds the
 * interactive parts (controls, quote chips, textarea, expand panel, validation,
 * submit) at runtime and produces a `Result` that matches cli/toki/schema.ts.
 *
 * Kept dependency-free so cli/toki stays extractable to a standalone package.
 */

(function tokiApp() {
  'use strict';

  // --------------------------------------------------------------------------
  // Spec + state
  // --------------------------------------------------------------------------

  /** @type {{ title: string, intro?: string, submitLabel: string, blocks: any[] }} */
  const spec = (window.__TOKI__ && typeof window.__TOKI__ === 'object')
    ? window.__TOKI__
    : { title: '', submitLabel: 'Submit', blocks: [] };

  const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];

  // Per-run token echoed back on submit so the server accepts only the page it
  // served (CSRF / forgery gate — see server.ts).
  const submitToken = typeof window.__TOKI_TOKEN__ === 'string' ? window.__TOKI_TOKEN__ : '';

  // open-state class app.css transitions on (`.toki-expand.is-open`); the panel
  // also carries the [hidden] attribute (see openExpand/closeExpand for the
  // two-frame dance).
  const EXPAND_OPEN_CLASS = 'is-open';

  /**
   * Per-block UI state, keyed by block id. `controlAnswer` is encoded exactly
   * as schema.ts requires: single -> string|null, multi -> string[],
   * toggle -> boolean, no controls -> null.
   *
   * A table block instead holds `rows`, a map keyed by row id where each entry
   * is the same `{ controlAnswer, text, quotes, images }` shape (the block-level
   * `controlAnswer`/`text` stay at their inert defaults). `quotes` on a table
   * block captures selections from its `content` intro. `images` holds the
   * data URLs of any pasted images for that answer (block or row), submitted as
   * data URLs and persisted to `.toki/` file paths server-side.
   * @type {Record<string, { controlAnswer: string | string[] | boolean | null, text: string, quotes: string[], images: string[], rows?: Record<string, { controlAnswer: string | string[] | boolean | null, text: string, quotes: string[], images: string[] }> }>}
   */
  const state = Object.create(null);

  /**
   * Inline `.toki-text__input` textarea per block id, registered by
   * buildTextarea so the expand panel can mirror its value two-way.
   * @type {Record<string, HTMLTextAreaElement>}
   */
  const inlineTextareas = Object.create(null);

  /** The block id the floating panel is currently editing, or null when closed. */
  let currentExpandBlockId = null;

  for (const block of blocks) {
    if (!block || typeof block.id !== 'string') {
      continue;
    }
    const entry = {
      controlAnswer: initialControlAnswer(block.controls),
      text: '',
      quotes: [],
      images: [],
    };
    if (isTableBlock(block)) {
      const rows = Object.create(null);
      for (const row of block.table.rows) {
        if (!row || typeof row.id !== 'string') {
          continue;
        }
        rows[row.id] = {
          controlAnswer: initialControlAnswer(block.table.rowControls),
          text: '',
          quotes: [],
          images: [],
        };
      }
      entry.rows = rows;
    }
    state[block.id] = entry;
  }

  /** True for a well-formed table block (has a `table` with a `rows` array). */
  function isTableBlock(block) {
    return Boolean(
      block && block.table && Array.isArray(block.table.rows),
    );
  }

  /** Initial `controlAnswer` for a `controls`-shaped config (or `null`). */
  function initialControlAnswer(controls) {
    if (!controls) {
      return null;
    }
    switch (controls.type) {
      case 'single':
        return null;
      case 'multi':
        return [];
      case 'toggle':
        return false;
      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Small DOM helpers
  // --------------------------------------------------------------------------

  function el(tag, className, attrs) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (attrs) {
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        if (value !== null && value !== undefined) {
          node.setAttribute(key, String(value));
        }
      }
    }
    return node;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function blockSection(id) {
    return document.querySelector(
      `section.toki-block[data-block-id="${cssAttrEscape(id)}"]`,
    );
  }

  /** Escape a string for safe use inside an `[attr="..."]` selector. */
  function cssAttrEscape(value) {
    return String(value).replace(/["\\]/g, '\\$&');
  }

  // --------------------------------------------------------------------------
  // Cached top-level elements
  // --------------------------------------------------------------------------

  const form = byId('toki-form');
  const submitBtn = byId('toki-submit');
  const remainingEl = byId('toki-remaining');
  const progressFill = byId('toki-progress-fill');
  const progressLabel = byId('toki-progress-label');
  const quoteBtn = byId('toki-quote-btn');
  const expand = byId('toki-expand');
  const expandBackdrop = byId('toki-expand-backdrop');
  const expandClose = byId('toki-expand-close');
  const expandTitle = byId('toki-expand-title');
  const expandRefContent = byId('toki-expand-ref-content');
  const expandQuotes = byId('toki-expand-quotes');
  const expandInput = byId('toki-expand-input');
  const doneEl = byId('toki-done');
  const bar = document.querySelector('.toki-bar');
  const themeToggle = byId('toki-theme-toggle');

  // --------------------------------------------------------------------------
  // THEME (light / dark) — persisted, no-flash, localStorage-guarded
  // --------------------------------------------------------------------------

  /** localStorage key holding 'light' | 'dark'. */
  const THEME_STORAGE_KEY = 'toki-theme';
  /** In-memory fallback when localStorage is unavailable (private mode, etc.). */
  let themeMemory = null;
  /** Current applied theme ('light' | 'dark'); dark is the default. */
  let currentTheme = 'dark';

  /** Read the stored theme, tolerating a throwing/absent localStorage. */
  function readStoredTheme() {
    try {
      const value = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (value === 'light' || value === 'dark') {
        return value;
      }
    }
    catch {
      // localStorage blocked — fall back to the in-memory value.
    }
    return themeMemory;
  }

  /** Persist the theme, tolerating a throwing/absent localStorage. */
  function writeStoredTheme(theme) {
    themeMemory = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    catch {
      // localStorage blocked — the in-memory value still carries the session.
    }
  }

  /**
   * Resolve the initial theme: an explicit stored choice, else the dark default.
   * WokiToki is dark-branded, so dark is the hard default regardless of the OS
   * preference — the user opts into light via the header toggle (and it sticks).
   */
  function resolveInitialTheme() {
    const stored = readStoredTheme();
    return stored === 'light' ? 'light' : 'dark';
  }

  /**
   * Apply `theme` to the document: light sets `data-theme="light"` on <html>,
   * dark removes the attribute (so the default :root tokens apply). Also keeps
   * the toggle's glyph / aria-pressed in sync.
   */
  function applyTheme(theme) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    if (currentTheme === 'light') {
      root.dataset.theme = 'light';
    }
    else {
      delete root.dataset.theme;
    }
    if (themeToggle) {
      const isLight = currentTheme === 'light';
      // Show the glyph for the theme you'd switch TO.
      themeToggle.textContent = isLight ? '☀' : '☾'; // ☀ when light, ☾ when dark
      themeToggle.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    }
  }

  function toggleTheme() {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(next);
    writeStoredTheme(next);
  }

  // --------------------------------------------------------------------------
  // A. BUILD INTERACTIVE PARTS
  // --------------------------------------------------------------------------

  function buildBlock(block) {
    const section = blockSection(block.id);
    if (!section) {
      // Spec block whose server-rendered section is missing — skip gracefully.
      return;
    }

    if (isTableBlock(block)) {
      buildTableBlock(block, section);
      return;
    }

    const host = section.querySelector('.toki-block__interactive');
    if (!host) {
      return;
    }

    const target = blockTarget(block);
    if (block.controls) {
      host.appendChild(buildControls(block.controls, target));
    }
    host.appendChild(buildQuotesArea(target));
    host.appendChild(buildTextarea(block.text, target, () => openExpand(block.id)));
    host.appendChild(buildImagesArea(target));
  }

  /**
   * Fill each row's server-rendered `.toki-table__answer` cell with the row
   * controls, the row quote-chips area and the row textarea — same builders as
   * a normal block, parameterized by a per-row state target.
   */
  function buildTableBlock(block, section) {
    const table = block.table;
    for (const row of table.rows) {
      if (!row || typeof row.id !== 'string') {
        continue;
      }
      const cell = section.querySelector(
        `td.toki-table__answer[data-row-id="${cssAttrEscape(row.id)}"]`,
      );
      if (!cell || !state[block.id] || !state[block.id].rows[row.id]) {
        // Missing row <tr>/<td> or state — skip gracefully.
        continue;
      }
      const target = rowTarget(block, row.id);
      if (table.rowControls) {
        cell.appendChild(buildControls(table.rowControls, target));
      }
      cell.appendChild(buildQuotesArea(target));
      cell.appendChild(buildTextarea(table.rowText, target, null));
      cell.appendChild(buildImagesArea(target));
    }
  }

  /**
   * A "target" abstracts where an interactive part reads/writes its answer:
   * a normal block writes `state[id]`; a table row writes `state[id].rows[rowId]`.
   * `key` is a DOM-unique handle used for the input `name`, the quote area
   * `data-block-id`, and the inline-textarea registry. `entry()` returns the
   * live state object.
   */
  function blockTarget(block) {
    return {
      key: block.id,
      blockId: block.id,
      entry: () => state[block.id],
    };
  }

  function rowTarget(block, rowId) {
    return {
      key: `${block.id}::${rowId}`,
      blockId: block.id,
      rowId,
      entry: () => state[block.id].rows[rowId],
    };
  }

  function buildControls(controls, target) {
    const group = el('div', 'toki-controls', { 'data-control-type': controls.type });

    if (controls.required) {
      const header = el('div', 'toki-controls__header');
      header.appendChild(requiredMarker());
      group.appendChild(header);
    }

    if (controls.type === 'toggle') {
      group.appendChild(buildToggle(target));
    }
    else if (controls.type === 'multi') {
      buildOptionInputs(controls, group, 'checkbox', target);
    }
    else {
      // single
      buildOptionInputs(controls, group, 'radio', target);
    }

    return group;
  }

  function buildOptionInputs(controls, group, inputType, target) {
    const options = Array.isArray(controls.options) ? controls.options : [];
    for (const opt of options) {
      const label = el('label', 'toki-option');
      const input = el('input', null, {
        type: inputType,
        name: `ctrl-${target.key}`,
        value: opt.value,
      });
      const span = el('span');
      span.textContent = opt.label;
      label.appendChild(input);
      label.appendChild(span);

      input.addEventListener('change', () => {
        if (inputType === 'radio') {
          target.entry().controlAnswer = input.value;
        }
        else {
          target.entry().controlAnswer = collectChecked(group);
        }
        refresh();
      });

      group.appendChild(label);
    }
  }

  function collectChecked(group) {
    const checked = group.querySelectorAll('input[type="checkbox"]:checked');
    const values = [];
    for (const input of checked) {
      values.push(input.value);
    }
    return values;
  }

  function buildToggle(target) {
    const label = el('label', 'toki-switch');
    const input = el('input', 'toki-switch__input', { type: 'checkbox' });
    const track = el('span', 'toki-switch__track');
    const text = el('span', 'toki-switch__label');
    text.textContent = toggleLabel();

    input.addEventListener('change', () => {
      target.entry().controlAnswer = input.checked;
      refresh();
    });

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);
    return label;
  }

  function toggleLabel() {
    // Generic on/off caption (the schema has no per-toggle label field).
    return 'on / off';
  }

  function buildQuotesArea(target) {
    return el('div', 'toki-quotes', { 'data-block-id': target.key });
  }

  /**
   * Build a `.toki-text` label + textarea bound to `target`. `text` is the
   * `{ required, placeholder }` config (block.text or table.rowText). `onExpand`
   * is an optional click handler for the expand affordance (table rows pass
   * `null` — the expand panel is block-level only).
   */
  function buildTextarea(text, target, onExpand) {
    const config = text || {};
    const label = el('label', 'toki-text');
    const labelText = el('span', 'toki-text__label');
    labelText.textContent = 'Your response';
    if (config.required) {
      labelText.appendChild(requiredMarker());
    }

    const field = el('div', 'toki-text__field');

    const textarea = el('textarea', 'toki-text__input', {
      'data-block-id': target.key,
      'rows': '4',
      'placeholder': typeof config.placeholder === 'string' ? config.placeholder : '',
    });
    inlineTextareas[target.key] = textarea;

    textarea.addEventListener('input', () => {
      target.entry().text = textarea.value;
      // Mirror into the big panel textarea when it is open for this block.
      if (currentExpandBlockId === target.key && expandInput) {
        expandInput.value = textarea.value;
        autoGrowExpandInput();
      }
      refresh();
    });

    // Paste an image from the clipboard → capture it as an attachment on this
    // answer (block or row). Non-image pastes fall through to normal text paste.
    textarea.addEventListener('paste', event => handleImagePaste(event, target.key));

    field.appendChild(textarea);

    if (onExpand) {
      const expandBtn = el('button', 'toki-text__expand', {
        'type': 'button',
        'aria-label': 'Expand to write',
        'title': 'Expand to write',
      });
      expandBtn.textContent = 'Expand';
      expandBtn.addEventListener('click', onExpand);
      field.appendChild(expandBtn);
    }

    label.appendChild(labelText);
    label.appendChild(field);
    return label;
  }

  function requiredMarker() {
    const mark = el('span', 'toki-required', { 'aria-label': 'required' });
    mark.textContent = '*';
    return mark;
  }

  // --------------------------------------------------------------------------
  // C. HIGHLIGHT-TO-QUOTE
  // --------------------------------------------------------------------------

  /** The state key (block id, or `block::row`) the quote button captures into. */
  let pendingQuoteKey = null;
  /** The text the current floating quote button would capture. */
  let pendingQuoteText = '';

  function hideQuoteButton() {
    pendingQuoteKey = null;
    pendingQuoteText = '';
    if (quoteBtn) {
      quoteBtn.classList.remove('is-visible');
      quoteBtn.hidden = true;
    }
  }

  function handleSelectionChange() {
    if (!quoteBtn) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      hideQuoteButton();
      return;
    }

    const text = selection.toString().trim();
    if (text.length === 0) {
      hideQuoteButton();
      return;
    }

    // Resolve which quote-source the selection anchors into, then which state
    // target (block, or a specific table row) owns it.
    const source = quoteSourceForSelection(selection);
    if (!source) {
      hideQuoteButton();
      return;
    }
    const key = quoteKeyForSource(source);
    if (!key || !quoteEntryForKey(key)) {
      hideQuoteButton();
      return;
    }

    pendingQuoteKey = key;
    pendingQuoteText = text;
    positionQuoteButton(selection);
  }

  /**
   * Find the `[data-quote-source]` element that contains the selection — either
   * a block's `.toki-block__content` (intro/report text) or a table cell
   * `td.toki-table__cell`. Both ends must live inside the same source.
   */
  function quoteSourceForSelection(selection) {
    const node = selection.anchorNode;
    if (!node) {
      return null;
    }
    const start = node.nodeType === 1 ? node : node.parentElement;
    if (!start) {
      return null;
    }
    const source = start.closest(
      '.toki-block__content[data-quote-source], td.toki-table__cell[data-quote-source]',
    );
    if (!source) {
      return null;
    }
    // Guard: ignore selections that escape the source (focus node outside).
    const focus = selection.focusNode;
    if (focus && !source.contains(focus)) {
      return null;
    }
    return source;
  }

  /**
   * Map a quote-source element to the state key that owns it. A table cell maps
   * to its row (`block::row`); any other source maps to its block id.
   */
  function quoteKeyForSource(source) {
    if (source.classList.contains('toki-table__cell')) {
      const tr = source.closest('tr.toki-table__row');
      const section = source.closest('section.toki-block');
      const rowId = tr ? tr.getAttribute('data-row-id') : null;
      const blockId = section ? section.getAttribute('data-block-id') : null;
      if (!rowId || !blockId) {
        return null;
      }
      return `${blockId}::${rowId}`;
    }
    const section = source.closest('section.toki-block');
    return section ? section.getAttribute('data-block-id') : null;
  }

  /** Resolve the live state entry for a quote key (block or `block::row`). */
  function quoteEntryForKey(key) {
    const separator = key.indexOf('::');
    if (separator === -1) {
      return state[key] || null;
    }
    const blockId = key.slice(0, separator);
    const rowId = key.slice(separator + 2);
    const block = state[blockId];
    if (!block || !block.rows) {
      return null;
    }
    return block.rows[rowId] || null;
  }

  function positionQuoteButton(selection) {
    let rect;
    try {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    }
    catch {
      hideQuoteButton();
      return;
    }
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideQuoteButton();
      return;
    }

    quoteBtn.hidden = false;
    // Measure after unhiding so offsetWidth/Height are real.
    const btnWidth = quoteBtn.offsetWidth || 0;
    const btnHeight = quoteBtn.offsetHeight || 0;

    let left = rect.left + window.scrollX + (rect.width / 2) - (btnWidth / 2);
    let top = rect.top + window.scrollY - btnHeight - 8;

    // Keep the button on-screen.
    const maxLeft = window.scrollX + document.documentElement.clientWidth - btnWidth - 4;
    const minLeft = window.scrollX + 4;
    left = Math.max(minLeft, Math.min(left, maxLeft));
    if (top < window.scrollY + 4) {
      // Not enough room above — drop below the selection.
      top = rect.bottom + window.scrollY + 8;
    }

    quoteBtn.style.left = `${Math.round(left)}px`;
    quoteBtn.style.top = `${Math.round(top)}px`;

    // Add the visible class next frame so the fade/scale-in transition runs
    // (the button was display:none under [hidden] until this call).
    requestAnimationFrame(() => {
      if (!quoteBtn.hidden) {
        quoteBtn.classList.add('is-visible');
      }
    });
  }

  function captureQuote() {
    if (!pendingQuoteKey || pendingQuoteText.length === 0) {
      return;
    }
    const key = pendingQuoteKey;
    const text = pendingQuoteText;
    const entry = quoteEntryForKey(key);
    if (!entry) {
      hideQuoteButton();
      return;
    }

    entry.quotes.push(text);
    addQuoteChip(key, text);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    hideQuoteButton();
    refresh();
  }

  function addQuoteChip(key, text) {
    const area = document.querySelector(
      `.toki-quotes[data-block-id="${cssAttrEscape(key)}"]`,
    );
    if (!area) {
      return;
    }
    const chip = el('span', 'toki-quote-chip');
    chip.appendChild(document.createTextNode(text));
    const remove = el('button', 'toki-quote-chip__x', {
      'type': 'button',
      'aria-label': 'Remove quote',
    });
    remove.textContent = 'x';
    remove.addEventListener('click', () => removeQuote(key, text, chip));
    chip.appendChild(remove);
    area.appendChild(chip);
  }

  function removeQuote(key, text, chip) {
    const entry = quoteEntryForKey(key);
    if (entry) {
      const index = entry.quotes.indexOf(text);
      if (index !== -1) {
        entry.quotes.splice(index, 1);
      }
    }
    if (chip && chip.parentNode) {
      chip.parentNode.removeChild(chip);
    }
    refresh();
  }

  // --------------------------------------------------------------------------
  // C2. PASTE-TO-ATTACH IMAGES
  // --------------------------------------------------------------------------

  /** Per-answer images host. Keyed (data-block-id) by `target.key`, like quotes. */
  function buildImagesArea(target) {
    return el('div', 'toki-images', { 'data-block-id': target.key });
  }

  /** Resolve the live state entry for an answer key (block or `block::row`). */
  function imageEntryForKey(key) {
    return quoteEntryForKey(key);
  }

  /**
   * Clipboard-paste handler bound to every response textarea (block, row, and
   * the expand panel input). If the clipboard carries an image, capture each one
   * as a data URL on `key`'s state and render a removable thumbnail. Non-image
   * pastes are left alone (no preventDefault) so normal text paste still works.
   */
  function handleImagePaste(event, key) {
    const data = event.clipboardData;
    if (!data) {
      return;
    }
    const files = [];
    // Prefer items (richer); fall back to files. De-dupe by reference.
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.kind === 'file' && typeof item.type === 'string' && item.type.indexOf('image/') === 0) {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
    }
    if (files.length === 0 && data.files && data.files.length > 0) {
      for (const file of data.files) {
        if (file && typeof file.type === 'string' && file.type.indexOf('image/') === 0) {
          files.push(file);
        }
      }
    }
    if (files.length === 0) {
      // No image in the clipboard — let the normal text paste proceed.
      return;
    }
    // We are handling image(s); stop the browser pasting them as text/markup.
    event.preventDefault();
    for (const file of files) {
      readImageFile(file, key);
    }
  }

  function readImageFile(file, key) {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string' || result.indexOf('data:') !== 0) {
        return;
      }
      const entry = imageEntryForKey(key);
      if (!entry) {
        return;
      }
      entry.images.push(result);
      addImageChip(key, result);
      refresh();
    };
    reader.readAsDataURL(file);
  }

  function addImageChip(key, dataUrl) {
    const area = document.querySelector(
      `.toki-images[data-block-id="${cssAttrEscape(key)}"]`,
    );
    if (!area) {
      return;
    }
    const chip = el('span', 'toki-img-chip');
    const img = el('img', 'toki-img-chip__img', { alt: 'Pasted image', src: dataUrl });
    chip.appendChild(img);
    const remove = el('button', 'toki-img-chip__x', {
      'type': 'button',
      'aria-label': 'Remove image',
    });
    remove.textContent = 'x';
    remove.addEventListener('click', () => removeImage(key, dataUrl, chip));
    chip.appendChild(remove);
    area.appendChild(chip);
  }

  function removeImage(key, dataUrl, chip) {
    const entry = imageEntryForKey(key);
    if (entry) {
      const index = entry.images.indexOf(dataUrl);
      if (index !== -1) {
        entry.images.splice(index, 1);
      }
    }
    if (chip && chip.parentNode) {
      chip.parentNode.removeChild(chip);
    }
    refresh();
  }

  // --------------------------------------------------------------------------
  // D. EXPAND-TO-WRITE PANEL
  // --------------------------------------------------------------------------

  /** Grow the big panel textarea to fit its content (CSS caps max-height). */
  function autoGrowExpandInput() {
    if (!expandInput) {
      return;
    }
    expandInput.style.height = 'auto';
    expandInput.style.height = `${expandInput.scrollHeight}px`;
  }

  function openExpand(blockId) {
    if (!expand || !state[blockId]) {
      return;
    }
    currentExpandBlockId = blockId;

    // Title: 1-based block index when known, else a generic label.
    if (expandTitle) {
      const index = blocks.findIndex(b => b && b.id === blockId);
      expandTitle.textContent = index >= 0 ? `Block ${index + 1}` : 'Your response';
    }

    // Reference: a clone of the server-rendered block content (collapsible).
    if (expandRefContent) {
      expandRefContent.textContent = '';
      const section = blockSection(blockId);
      const source = section ? section.querySelector('.toki-block__content') : null;
      if (source) {
        const clone = source.cloneNode(true);
        clone.removeAttribute('data-quote-source');
        expandRefContent.appendChild(clone);
      }
    }

    // Quotes: read-only chip row of this block's captured quotes.
    fillExpandQuotes(blockId);

    // Seed the big textarea from current state and grow it.
    if (expandInput) {
      expandInput.value = state[blockId].text;
    }

    // Two-frame dance: drop [hidden] now, add the open class next frame so the
    // CSS transition actually runs (hidden->visible in the same frame as the
    // class change will not transition).
    expand.hidden = false;
    expand.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        expand.classList.add(EXPAND_OPEN_CLASS);
      });
    });

    if (expandInput) {
      expandInput.focus();
      autoGrowExpandInput();
    }
  }

  function fillExpandQuotes(blockId) {
    if (!expandQuotes) {
      return;
    }
    expandQuotes.textContent = '';
    const entry = state[blockId];
    if (!entry || entry.quotes.length === 0) {
      return;
    }
    for (const quote of entry.quotes) {
      const chip = el('span', 'toki-quote-chip');
      chip.appendChild(document.createTextNode(quote));
      expandQuotes.appendChild(chip);
    }
  }

  function closeExpand() {
    if (!expand) {
      return;
    }
    expand.classList.remove(EXPAND_OPEN_CLASS);
    expand.setAttribute('aria-hidden', 'true');
    expand.hidden = true;
    currentExpandBlockId = null;
  }

  // --------------------------------------------------------------------------
  // E. VALIDATION + PROGRESS
  // --------------------------------------------------------------------------

  /** True if `entry.controlAnswer` is a real selection for the `controls` type. */
  function entryHasControlSelection(entry, controls) {
    if (!controls) {
      return false;
    }
    const answer = entry.controlAnswer;
    switch (controls.type) {
      case 'single':
        return typeof answer === 'string' && answer.length > 0;
      case 'multi':
        return Array.isArray(answer) && answer.length > 0;
      case 'toggle':
        return answer === true;
      default:
        return false;
    }
  }

  /** True if `entry.text` has non-whitespace content. */
  function entryHasText(entry) {
    return entry.text.trim().length > 0;
  }

  /** True if `entry` is satisfied given its `controls`/`text` requirements. */
  function entrySatisfied(entry, controls, text) {
    if (controls && controls.required && !entryHasControlSelection(entry, controls)) {
      return false;
    }
    if (text && text.required && !entryHasText(entry)) {
      return false;
    }
    return true;
  }

  /** A block counts as answered if it has any control selection and/or text. */
  function isAnswered(block) {
    if (isTableBlock(block)) {
      // A table block is "answered" if ANY row has any answer (control or text).
      const rows = state[block.id].rows;
      for (const row of block.table.rows) {
        const entry = rows[row.id];
        if (!entry) {
          continue;
        }
        if (entryHasText(entry) || entryHasControlSelection(entry, block.table.rowControls)) {
          return true;
        }
      }
      return false;
    }
    const entry = state[block.id];
    return entryHasText(entry) || entryHasControlSelection(entry, block.controls);
  }

  /** A block is satisfied when every required field (per row, for tables) is met. */
  function isSatisfied(block) {
    if (isTableBlock(block)) {
      // EVERY row must be satisfied for the table block to be satisfied.
      const rows = state[block.id].rows;
      for (const row of block.table.rows) {
        const entry = rows[row.id];
        if (!entry) {
          continue;
        }
        if (!entrySatisfied(entry, block.table.rowControls, block.table.rowText)) {
          return false;
        }
      }
      return true;
    }
    return entrySatisfied(state[block.id], block.controls, block.text);
  }

  function refresh() {
    let answered = 0;
    let unsatisfied = 0;
    for (const block of blocks) {
      if (!state[block.id]) {
        continue;
      }
      if (isAnswered(block)) {
        answered += 1;
      }
      if (!isSatisfied(block)) {
        unsatisfied += 1;
      }
    }

    const total = blocks.length;

    if (submitBtn) {
      submitBtn.disabled = unsatisfied > 0;
    }
    if (remainingEl) {
      remainingEl.textContent = unsatisfied > 0
        ? `${unsatisfied} required remaining`
        : 'Ready to submit';
    }
    if (progressFill) {
      const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
      progressFill.style.width = `${pct}%`;
    }
    if (progressLabel) {
      progressLabel.textContent = `${answered}/${total} answered`;
    }
  }

  function allSatisfied() {
    for (const block of blocks) {
      if (state[block.id] && !isSatisfied(block)) {
        return false;
      }
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // F. SUBMIT
  // --------------------------------------------------------------------------

  let submitting = false;

  function buildResult() {
    const resultBlocks = blocks.map((block) => {
      const entry = state[block.id] || { controlAnswer: null, text: '', quotes: [], images: [] };

      if (isTableBlock(block)) {
        // Table block: block-level answer is inert; rows carry the data, in
        // spec order. `quotes` holds any quotes captured from the intro content.
        const rows = entry.rows || {};
        const rowResults = block.table.rows.map((row) => {
          const rowEntry = rows[row.id] || { controlAnswer: null, text: '', quotes: [], images: [] };
          const rowResult = {
            id: row.id,
            controlAnswer: rowEntry.controlAnswer,
            text: rowEntry.text,
            quotes: rowEntry.quotes.slice(),
          };
          // Attach images only when non-empty, mirroring how rows[] is omitted
          // on normal blocks — keeps untouched answers byte-identical to before.
          if (rowEntry.images && rowEntry.images.length > 0) {
            rowResult.images = rowEntry.images.slice();
          }
          return rowResult;
        });
        const tableResult = {
          id: block.id,
          controlAnswer: null,
          text: '',
          quotes: entry.quotes.slice(),
          rows: rowResults,
        };
        if (entry.images && entry.images.length > 0) {
          tableResult.images = entry.images.slice();
        }
        return tableResult;
      }

      const blockResult = {
        id: block.id,
        controlAnswer: entry.controlAnswer,
        text: entry.text,
        quotes: entry.quotes.slice(),
      };
      if (entry.images && entry.images.length > 0) {
        blockResult.images = entry.images.slice();
      }
      return blockResult;
    });

    let answered = 0;
    for (const block of blocks) {
      if (state[block.id] && isAnswered(block)) {
        answered += 1;
      }
    }

    return {
      submittedAt: new Date().toISOString(),
      blocks: resultBlocks,
      meta: { answered, total: blocks.length },
    };
  }

  async function submit() {
    if (submitting || !allSatisfied()) {
      return;
    }
    submitting = true;
    clearSubmitError();
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    const result = buildResult();
    try {
      const response = await fetch('/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-toki-token': submitToken },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        throw new Error(`Submit failed with status ${response.status}`);
      }
      showDone();
    }
    catch (error) {
      submitting = false;
      showSubmitError();
      // Re-enable the button so the user can retry.
      refresh();
      console.error('toki: submit failed', error);
    }
  }

  function showDone() {
    if (form) {
      form.hidden = true;
    }
    if (bar) {
      bar.hidden = true;
    }
    if (doneEl) {
      doneEl.hidden = false;
    }
    closeExpand();
  }

  function showSubmitError() {
    let errorEl = byId('toki-submit-error');
    if (!errorEl) {
      errorEl = el('span', 'toki-bar__error', { id: 'toki-submit-error' });
      if (bar) {
        bar.appendChild(errorEl);
      }
    }
    errorEl.textContent = 'Could not submit. Check your connection and try again.';
  }

  function clearSubmitError() {
    const errorEl = byId('toki-submit-error');
    if (errorEl) {
      errorEl.textContent = '';
    }
  }

  // --------------------------------------------------------------------------
  // Global wiring (throttled selection / resize / scroll)
  // --------------------------------------------------------------------------

  function throttle(fn, wait) {
    let last = 0;
    let timer = null;
    return function throttled() {
      const now = Date.now();
      const remaining = wait - (now - last);
      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        last = now;
        fn();
      }
      else if (!timer) {
        timer = setTimeout(() => {
          last = Date.now();
          timer = null;
          fn();
        }, remaining);
      }
    };
  }

  function wireGlobals() {
    const onSelection = throttle(handleSelectionChange, 80);
    document.addEventListener('selectionchange', onSelection);

    // Selection bounds shift on scroll/resize — hide the floating button.
    const onMove = throttle(hideQuoteButton, 100);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);

    if (quoteBtn) {
      // mousedown (not click) so it fires before the selection is torn down.
      quoteBtn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        captureQuote();
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        void submit();
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener('click', toggleTheme);
    }

    if (expandInput) {
      expandInput.addEventListener('input', () => {
        const blockId = currentExpandBlockId;
        if (!blockId || !state[blockId]) {
          return;
        }
        state[blockId].text = expandInput.value;
        // Mirror back into that block's inline textarea (two-way sync).
        const inline = inlineTextareas[blockId];
        if (inline) {
          inline.value = expandInput.value;
        }
        refresh();
        autoGrowExpandInput();
      });

      // Pasting an image in the big panel attaches it to the SAME block answer
      // (the panel is block-level only). The chip renders in the block's inline
      // images area, keeping it consistent with how text mirrors two-way.
      expandInput.addEventListener('paste', (event) => {
        const blockId = currentExpandBlockId;
        if (!blockId) {
          return;
        }
        handleImagePaste(event, blockId);
      });
    }

    if (expandClose) {
      expandClose.addEventListener('click', () => closeExpand());
    }
    if (expandBackdrop) {
      expandBackdrop.addEventListener('click', () => closeExpand());
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeExpand();
        return;
      }
      // Cmd/Ctrl+Enter submits when valid.
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Boot
  // --------------------------------------------------------------------------

  function init() {
    // Apply the theme FIRST so there is no dark->light flash on a light choice.
    applyTheme(resolveInitialTheme());
    for (const block of blocks) {
      if (state[block.id]) {
        buildBlock(block);
      }
    }
    wireGlobals();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
  else {
    init();
  }
})();
