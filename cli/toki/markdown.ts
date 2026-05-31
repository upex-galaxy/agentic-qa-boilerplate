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
 *   - GitHub tables (`| a | b |` + `| --- |` row)    -> <table> (aligned cells)
 *   - blockquotes (`> ...`)                          -> <blockquote>
 *   - blank-line-separated paragraphs                -> <p> (single newline -> <br>)
 *
 * OUT OF SCOPE (renders as escaped plain text): images, nested blockquotes,
 * and nested lists deeper than one level.
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

/**
 * True for a blockquote line (`> ...` or a bare `>`). The source `>` has
 * already been escaped to `&gt;` by the time the block loop inspects the line,
 * so the marker is matched in its escaped form.
 */
function isBlockquote(line: string): boolean {
  return /^&gt;(?:\s|$)/.test(line);
}

/** True for a table-shaped line (contains a `|`, escaped or not). */
function isTableRow(line: string): boolean {
  return line.includes('|');
}

/**
 * True for a GitHub table delimiter row (`| --- | :--: |`). The cells must
 * contain only dashes with optional leading/trailing alignment colons.
 */
function isTableDelimiter(line: string): boolean {
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every(cell => /^:?-+:?$/.test(cell.trim()));
}

/**
 * Split one table row into its cell strings. Surrounding pipes are optional;
 * `&#124;`-style escaping is out of scope, so a literal `|` always splits.
 */
function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

type CellAlignment = 'left' | 'center' | 'right' | 'none';

/** Map a delimiter cell (`:--`, `:--:`, `--:`, `---`) to its alignment. */
function alignmentFor(delimiterCell: string): CellAlignment {
  const cell = delimiterCell.trim();
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) {
    return 'center';
  }
  if (right) {
    return 'right';
  }
  if (left) {
    return 'left';
  }
  return 'none';
}

/** `style` attribute fragment for a cell alignment (empty for `none`). */
function alignAttr(alignment: CellAlignment): string {
  return alignment === 'none' ? '' : ` style="text-align: ${alignment}"`;
}

/**
 * Render a GitHub table from its (already escaped) header, delimiter and body
 * rows. Inline formatting is applied per cell; alignment maps to inline style.
 */
function renderTable(
  headerLine: string,
  delimiterLine: string,
  bodyLines: string[],
): string {
  const alignments = splitTableCells(delimiterLine).map(alignmentFor);
  const alignAt = (column: number): CellAlignment =>
    alignments[column] ?? 'none';

  const headCells = splitTableCells(headerLine)
    .map(
      (cell, column) =>
        `<th${alignAttr(alignAt(column))}>${renderInline(cell)}</th>`,
    )
    .join('');
  const head = `<thead><tr>${headCells}</tr></thead>`;

  const bodyRows = bodyLines
    .map((line) => {
      const cells = splitTableCells(line)
        .map(
          (cell, column) =>
            `<td${alignAttr(alignAt(column))}>${renderInline(cell)}</td>`,
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  const body = `<tbody>${bodyRows}</tbody>`;

  return `<table>${head}${body}</table>`;
}

/**
 * Render a run of `> ` lines (already escaped) as one `<blockquote>`. The
 * leading marker is stripped per line; inline formatting applies, and a single
 * newline inside the quote becomes a `<br>`.
 */
function renderBlockquote(lines: string[]): string {
  const inner = lines
    .map(line => renderInline(line.replace(/^&gt;\s?/, '')))
    .join('<br>');
  return `<blockquote>${inner}</blockquote>`;
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

    // Blockquote: consume the contiguous run of `> ` lines.
    if (isBlockquote(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isBlockquote(lines[index])) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      out.push(renderBlockquote(quoteLines));
      continue;
    }

    // GitHub table: a header row immediately followed by a delimiter row. A
    // header with no valid delimiter is NOT a table -> falls through to the
    // paragraph branch below, so a stray `|` never crashes the renderer.
    if (
      isTableRow(line)
      && index + 1 < lines.length
      && isTableDelimiter(lines[index + 1])
    ) {
      const headerLine = line;
      const delimiterLine = lines[index + 1];
      index += 2;
      const bodyLines: string[] = [];
      while (
        index < lines.length
        && lines[index].trim() !== ''
        && isTableRow(lines[index])
      ) {
        bodyLines.push(lines[index]);
        index += 1;
      }
      out.push(renderTable(headerLine, delimiterLine, bodyLines));
      continue;
    }

    // Paragraph: consume until a blank line or a structural line begins.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const startsTable
        = isTableRow(current)
          && index + 1 < lines.length
          && isTableDelimiter(lines[index + 1]);
      if (
        current.trim() === ''
        || current.startsWith('```')
        || isHeading(current)
        || isUnorderedItem(current)
        || isOrderedItem(current)
        || isBlockquote(current)
        || startsTable
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
