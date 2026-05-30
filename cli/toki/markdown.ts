/**
 * WokiToki (`toki`) - minimal Markdown -> HTML renderer.
 *
 * Pure, synchronous, dependency-free. Used server-side by `render.ts` to turn
 * the AI-authored block `content` (and spec `intro`) into safe HTML.
 *
 * SECURITY MODEL: HTML special chars (`& < > " '`) in the SOURCE text are
 * escaped FIRST, then markdown transforms run on top of the escaped text. The
 * only raw HTML tags in the output are the structural ones this module emits
 * itself, so user/AI content can never inject a live `<script>` or `<img>` tag.
 *
 * Supported subset:
 *   - ATX headings, level 1-6 (`#`..`######`)        -> <h1>..<h6>
 *   - bold (`**...**`)                               -> <strong>
 *   - italic (`*...*` or `_..._`)                    -> <em>
 *   - inline code (`` `...` ``)                      -> <code> (no inner transforms)
 *   - fenced code blocks (```lang ... ```)           -> <pre><code> (escaped, no transforms)
 *   - links `[text](url)`                            -> <a> (http/https/mailto only)
 *   - unordered lists (`- ` / `* `)                  -> <ul><li>
 *   - ordered lists (`1. `)                          -> <ol><li>
 *   - blank-line-separated paragraphs                -> <p> (single newline -> <br>)
 *
 * OUT OF SCOPE (renders as escaped plain text): tables, nested blockquotes,
 * images, and nested lists deeper than one level.
 *
 * Bun built-ins only, zero external deps (stays extractable).
 */

/** Escape HTML special chars so source text can never inject raw markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) and mailto links are safe to emit; everything else is dropped. */
function isSafeUrl(url: string): boolean {
  return /^(?:https?:|mailto:)/i.test(url.trim());
}

/** Transform links, bold and italic in a span of escaped text (NO inline code). */
function renderEmphasisAndLinks(escaped: string): string {
  // Links: [text](url). `url` is escaped text, so a `&` is already `&amp;`;
  // unescape the few entities that can legally appear in a URL before checking
  // the scheme, then keep the escaped form in the emitted href.
  const withLinks = escaped.replace(
    /\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_match, text: string, href: string) => {
      const rawHref = href
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, '\'')
        .replace(/&quot;/g, '"');
      if (!isSafeUrl(rawHref)) {
        return text;
      }
      return `<a href="${href}">${text}</a>`;
    },
  );

  // Bold before italic so `**x**` is not mis-parsed as nested emphasis.
  return withLinks
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

/**
 * Apply inline transforms to a line of ALREADY HTML-escaped text. The line is
 * split on inline-code spans (`` `...` ``) so code contents pass through
 * untouched while every other segment gets link/bold/italic treatment.
 */
function renderInline(escaped: string): string {
  // Odd indices are the captured code contents; even indices are plain text.
  const parts = escaped.split(/`([^`]+)`/);
  return parts
    .map((part, partIndex) =>
      partIndex % 2 === 1
        ? `<code>${part}</code>`
        : renderEmphasisAndLinks(part),
    )
    .join('');
}

/** True for an unordered-list marker line (`- foo` / `* foo`). */
function isUnorderedItem(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

/** True for an ordered-list marker line (`1. foo`). */
function isOrderedItem(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

/** True for an ATX-heading line (`#`..`######` + space). */
function isHeading(line: string): boolean {
  return /^#{1,6}\s+/.test(line);
}

/** Render a run of `- ` / `* ` lines (already escaped) as a `<ul>`. */
function renderUnorderedList(lines: string[]): string {
  const items = lines
    .map(line => `<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`)
    .join('');
  return `<ul>${items}</ul>`;
}

/** Render a run of `1. ` lines (already escaped) as an `<ol>`. */
function renderOrderedList(lines: string[]): string {
  const items = lines
    .map(line => `<li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`)
    .join('');
  return `<ol>${items}</ol>`;
}

/**
 * Render a paragraph block (one or more consecutive non-blank, non-structural
 * lines). A single newline inside the block becomes a `<br>`.
 */
function renderParagraph(lines: string[]): string {
  const inner = lines.map(line => renderInline(line)).join('<br>');
  return `<p>${inner}</p>`;
}

/**
 * Convert a minimal Markdown subset in `src` to safe HTML. Pure + synchronous.
 */
export function md(src: string): string {
  const escaped = escapeHtml(src);
  const lines = escaped.split('\n');
  const out: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    // Blank line: paragraph/list separator, emit nothing.
    if (line.trim() === '') {
      index += 1;
      continue;
    }

    // Fenced code block: ``` (optional language) ... ```. Content is kept
    // verbatim (already escaped) with NO further transforms.
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== '```') {
        body.push(lines[index]);
        index += 1;
      }
      // Skip the closing fence if present (tolerate an unterminated block).
      if (index < lines.length) {
        index += 1;
      }
      const classAttr = lang ? ` class="language-${lang}"` : '';
      out.push(`<pre><code${classAttr}>${body.join('\n')}</code></pre>`);
      continue;
    }

    // ATX heading: leading 1-6 `#` followed by a space.
    if (isHeading(line)) {
      const level = line.length - line.replace(/^#+/, '').length;
      const content = line.slice(level).trim();
      out.push(`<h${level}>${renderInline(content)}</h${level}>`);
      index += 1;
      continue;
    }

    // Unordered list: consume the contiguous run of `- ` / `* ` lines.
    if (isUnorderedItem(line)) {
      const items: string[] = [];
      while (index < lines.length && isUnorderedItem(lines[index])) {
        items.push(lines[index]);
        index += 1;
      }
      out.push(renderUnorderedList(items));
      continue;
    }

    // Ordered list: consume the contiguous run of `1. ` lines.
    if (isOrderedItem(line)) {
      const items: string[] = [];
      while (index < lines.length && isOrderedItem(lines[index])) {
        items.push(lines[index]);
        index += 1;
      }
      out.push(renderOrderedList(items));
      continue;
    }

    // Paragraph: consume until a blank line or a structural line begins.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        current.trim() === ''
        || current.startsWith('```')
        || isHeading(current)
        || isUnorderedItem(current)
        || isOrderedItem(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    out.push(renderParagraph(paragraph));
  }

  return out.join('\n');
}
