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
   * @type {Record<string, { controlAnswer: string | string[] | boolean | null, text: string, quotes: string[] }>}
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
    state[block.id] = {
      controlAnswer: initialControlAnswer(block),
      text: '',
      quotes: [],
    };
  }

  function initialControlAnswer(block) {
    if (!block.controls) {
      return null;
    }
    switch (block.controls.type) {
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

  // --------------------------------------------------------------------------
  // A. BUILD INTERACTIVE PARTS
  // --------------------------------------------------------------------------

  function buildBlock(block) {
    const section = blockSection(block.id);
    if (!section) {
      // Spec block whose server-rendered section is missing — skip gracefully.
      return;
    }
    const host = section.querySelector('.toki-block__interactive');
    if (!host) {
      return;
    }

    if (block.controls) {
      host.appendChild(buildControls(block));
    }
    host.appendChild(buildQuotesArea(block));
    host.appendChild(buildTextarea(block));
  }

  function buildControls(block) {
    const controls = block.controls;
    const group = el('div', 'toki-controls', { 'data-control-type': controls.type });

    if (controls.required) {
      const header = el('div', 'toki-controls__header');
      header.appendChild(requiredMarker());
      group.appendChild(header);
    }

    if (controls.type === 'toggle') {
      group.appendChild(buildToggle(block));
    }
    else if (controls.type === 'multi') {
      buildOptionInputs(block, group, 'checkbox');
    }
    else {
      // single
      buildOptionInputs(block, group, 'radio');
    }

    return group;
  }

  function buildOptionInputs(block, group, inputType) {
    const options = Array.isArray(block.controls.options) ? block.controls.options : [];
    for (const opt of options) {
      const label = el('label', 'toki-option');
      const input = el('input', null, {
        type: inputType,
        name: `ctrl-${block.id}`,
        value: opt.value,
      });
      const span = el('span');
      span.textContent = opt.label;
      label.appendChild(input);
      label.appendChild(span);

      input.addEventListener('change', () => {
        if (inputType === 'radio') {
          state[block.id].controlAnswer = input.value;
        }
        else {
          state[block.id].controlAnswer = collectChecked(group);
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

  function buildToggle(block) {
    const label = el('label', 'toki-switch');
    const input = el('input', 'toki-switch__input', { type: 'checkbox' });
    const track = el('span', 'toki-switch__track');
    const text = el('span', 'toki-switch__label');
    text.textContent = toggleLabel();

    input.addEventListener('change', () => {
      state[block.id].controlAnswer = input.checked;
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

  function buildQuotesArea(block) {
    return el('div', 'toki-quotes', { 'data-block-id': block.id });
  }

  function buildTextarea(block) {
    const text = block.text || {};
    const label = el('label', 'toki-text');
    const labelText = el('span', 'toki-text__label');
    labelText.textContent = 'Your response';
    if (text.required) {
      labelText.appendChild(requiredMarker());
    }

    const field = el('div', 'toki-text__field');

    const textarea = el('textarea', 'toki-text__input', {
      'data-block-id': block.id,
      'rows': '4',
      'placeholder': typeof text.placeholder === 'string' ? text.placeholder : '',
    });
    inlineTextareas[block.id] = textarea;

    textarea.addEventListener('input', () => {
      state[block.id].text = textarea.value;
      // Mirror into the big panel textarea when it is open for this block.
      if (currentExpandBlockId === block.id && expandInput) {
        expandInput.value = textarea.value;
        autoGrowExpandInput();
      }
      refresh();
    });

    const expandBtn = el('button', 'toki-text__expand', {
      'type': 'button',
      'aria-label': 'Expand to write',
      'title': 'Expand to write',
    });
    expandBtn.textContent = 'Expand';
    expandBtn.addEventListener('click', () => openExpand(block.id));

    field.appendChild(textarea);
    field.appendChild(expandBtn);

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

  /** The block id the current floating quote button would capture into. */
  let pendingQuoteBlockId = null;
  /** The text the current floating quote button would capture. */
  let pendingQuoteText = '';

  function hideQuoteButton() {
    pendingQuoteBlockId = null;
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

    // Resolve which quote-source the selection anchors into.
    const source = quoteSourceForSelection(selection);
    if (!source) {
      hideQuoteButton();
      return;
    }
    const section = source.closest('section.toki-block');
    const blockId = section ? section.getAttribute('data-block-id') : null;
    if (!blockId || !state[blockId]) {
      hideQuoteButton();
      return;
    }

    pendingQuoteBlockId = blockId;
    pendingQuoteText = text;
    positionQuoteButton(selection);
  }

  /**
   * Find the `.toki-block__content[data-quote-source]` that contains the
   * selection. Both ends must live inside the same source for a clean quote.
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
    const source = start.closest('.toki-block__content[data-quote-source]');
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
    if (!pendingQuoteBlockId || pendingQuoteText.length === 0) {
      return;
    }
    const blockId = pendingQuoteBlockId;
    const text = pendingQuoteText;
    const entry = state[blockId];
    if (!entry) {
      hideQuoteButton();
      return;
    }

    entry.quotes.push(text);
    addQuoteChip(blockId, text);

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    hideQuoteButton();
    refresh();
  }

  function addQuoteChip(blockId, text) {
    const area = document.querySelector(
      `.toki-quotes[data-block-id="${cssAttrEscape(blockId)}"]`,
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
    remove.addEventListener('click', () => removeQuote(blockId, text, chip));
    chip.appendChild(remove);
    area.appendChild(chip);
  }

  function removeQuote(blockId, text, chip) {
    const entry = state[blockId];
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

  function hasControlSelection(block) {
    const answer = state[block.id].controlAnswer;
    if (!block.controls) {
      return false;
    }
    switch (block.controls.type) {
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

  function hasText(block) {
    return state[block.id].text.trim().length > 0;
  }

  function isAnswered(block) {
    return hasText(block) || hasControlSelection(block);
  }

  function isSatisfied(block) {
    if (block.controls && block.controls.required && !hasControlSelection(block)) {
      return false;
    }
    if (block.text && block.text.required && !hasText(block)) {
      return false;
    }
    return true;
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
      const entry = state[block.id] || { controlAnswer: null, text: '', quotes: [] };
      return {
        id: block.id,
        controlAnswer: entry.controlAnswer,
        text: entry.text,
        quotes: entry.quotes.slice(),
      };
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
