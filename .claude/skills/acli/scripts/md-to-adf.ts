#!/usr/bin/env bun
/**
 * Minimal Markdown → ADF (Atlassian Document Format) converter.
 *
 * Bundled with the acli skill so any caller can publish rich text to Jira
 * via the standard MD → ADF → acli (or REST) workflow.
 *
 * Covered Markdown subset:
 *   - Headings: # / ## / ### / #### / ##### / ###### → ADF heading levels 1-6
 *   - Bullet lists: -, * (nested via indentation — 2+ spaces deepens a level)
 *   - Ordered lists: 1. (nested via indentation; mixes with bullets per level)
 *   - Tables: GFM pipe tables (| a | b | + |---|---| separator) → ADF table
 *   - Panels: GitHub-alert blockquotes (> [!NOTE] / [!WARNING] / [!INFO] /
 *     [!SUCCESS] / [!ERROR] / [!TIP] / [!IMPORTANT] / [!CAUTION]) → ADF panel
 *   - Expand: <details><summary>Title</summary> … </details> → ADF expand
 *   - Fenced code blocks: ```lang ... ``` (language tag preserved as attrs.language)
 *   - Inline code: `code`
 *   - Bold: **text** or __text__
 *   - Italic: *text* or _text_ (snake_case-safe — will not mangle identifiers)
 *   - Strikethrough: ~~text~~
 *   - Emoji (Jira-native): :short_name: → ADF emoji node (Jira resolves the name)
 *   - Status lozenge: {status:color|TEXT} → ADF status pill
 *     (color: neutral | purple | blue | red | yellow | green)
 *   - Mention: @[Display Name](accountId) → ADF mention node (accountId is the
 *     opaque Atlassian id, resolved out-of-band — a bare @name cannot mention)
 *   - Links: [label](url)
 *   - Blockquotes: > line
 *   - Horizontal rule: ---
 *   - Paragraphs (default block)
 *
 * Out of scope (extend if your project needs them):
 *   mentions, status macros, media / images, nestedExpand (expand inside a
 *   table cell).
 *
 * Validation gate (zero-dependency):
 *   Conversion output is validated against an embedded ADF allowlist BEFORE it
 *   is written, so structural errors fail fast at author time instead of as an
 *   opaque HTTP 400 from Jira at publish time. No external packages — the
 *   @atlaskit/adf-* validators pull ProseMirror + Statsig and break this
 *   converter's zero-dep contract, so the rules live inline here.
 *
 * Runtime: Bun ≥ 1.0. Uses Bun.file / Bun.stdin / Bun.write.
 *
 * CLI:
 *   bun md-to-adf.ts <input.md> [output.json]   # convert (validates by default)
 *   bun md-to-adf.ts -                          # read MD from stdin
 *   cat input.md | bun md-to-adf.ts - output.json
 *   bun md-to-adf.ts <input.md> --no-validate   # skip the validation gate
 *   bun md-to-adf.ts --check <file.adf.json>    # validate an existing ADF doc and exit
 *
 * Module:
 *   import { mdToAdf, validateAdf } from "./md-to-adf.ts";
 *   const adf = mdToAdf(markdownString);  // returns { type: "doc", version: 1, content: [...] }
 *   const { valid, errors } = validateAdf(adf);  // gate any ADF (converted, jq-assembled, REST body)
 */

type ADFNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ADFNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
};

// Curated Unicode fallback for the most useful Jira-native emoji shortNames.
// Jira resolves the shortName on its own; the `text` fallback only helps where
// the shortName is unknown to a renderer. Unlisted `:short_names:` still convert
// (shortName-only) — this map exists so the common status marks carry a glyph.
const EMOJI_TEXT: Record<string, string> = {
  ":white_check_mark:": "✅",
  ":heavy_check_mark:": "✔️",
  ":x:": "❌",
  ":warning:": "⚠️",
  ":hourglass_flowing_sand:": "⏳",
  ":white_circle:": "⚪",
  ":no_entry:": "⛔",
  ":information_source:": "ℹ️",
};

// ---------- inline parser ----------
//
// Walks the line left→right and emits text + nested marks. Order of checks
// matters: code (backtick) wins over bold/italic, bold wins over italic,
// links are matched before bare text so URL contents don't get re-parsed.

function parseInline(input: string): ADFNode[] {
  const nodes: ADFNode[] = [];
  let i = 0;

  const pushText = (text: string, marks?: ADFNode["marks"]) => {
    if (!text) return;
    const node: ADFNode = { type: "text", text };
    if (marks && marks.length) node.marks = marks;
    nodes.push(node);
  };

  while (i < input.length) {
    // Inline code: `...`
    if (input[i] === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i) {
        pushText(input.slice(i + 1, end), [{ type: "code" }]);
        i = end + 1;
        continue;
      }
    }

    // Link: [text](url)
    if (input[i] === "[") {
      const closeBracket = input.indexOf("]", i + 1);
      if (closeBracket > i && input[closeBracket + 1] === "(") {
        const closeParen = input.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket) {
          const label = input.slice(i + 1, closeBracket);
          const href = input.slice(closeBracket + 2, closeParen);
          pushText(label, [{ type: "link", attrs: { href } }]);
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold: **...** or __...__
    if (input.startsWith("**", i) || input.startsWith("__", i)) {
      const delim = input.slice(i, i + 2);
      const end = input.indexOf(delim, i + 2);
      if (end > i + 1) {
        const inner = input.slice(i + 2, end);
        // recurse to allow inline code / italic inside bold
        const innerNodes = parseInline(inner);
        for (const n of innerNodes) {
          if (n.type === "text") {
            const existing = n.marks ?? [];
            // Jira ADF rejects (HTTP 400) any text node carrying both `code` and
            // `strong` marks. When they would co-occur, keep `code` and drop
            // `strong`: inline code is semantically dominant, and bolding an
            // inline-code span is rare and usually accidental authoring.
            if (existing.some((m) => m.type === "code")) {
              n.marks = existing;
            } else {
              const hasStrong = existing.some((m) => m.type === "strong");
              n.marks = hasStrong ? existing : [...existing, { type: "strong" }];
            }
          }
          nodes.push(n);
        }
        i = end + 2;
        continue;
      }
    }

    // Italic: *...* or _..._  (snake_case-safe)
    if (input[i] === "*" || input[i] === "_") {
      const delim = input[i];
      // Avoid bold (already handled above)
      if (input[i + 1] === delim) {
        // Not italic — pass through as text
      } else {
        // Find matching delim; require it does NOT abut alphanumerics inside snake_case
        let end = -1;
        for (let j = i + 1; j < input.length; j++) {
          if (input[j] === delim && input[j + 1] !== delim) {
            // Underscore italic: refuse if both sides are word chars (snake_case)
            if (delim === "_") {
              const before = input[i - 1];
              const after = input[j + 1];
              if (/[\w]/.test(before ?? "") || /[\w]/.test(after ?? "")) {
                break;
              }
            }
            end = j;
            break;
          }
        }
        if (end > i) {
          const inner = input.slice(i + 1, end);
          const innerNodes = parseInline(inner);
          for (const n of innerNodes) {
            if (n.type === "text") {
              const existing = n.marks ?? [];
              // See bold branch above: Jira rejects `code` + `em` on the same
              // text node. Keep `code` and drop `em` — inline code is dominant.
              if (existing.some((m) => m.type === "code")) {
                n.marks = existing;
              } else {
                const hasEm = existing.some((m) => m.type === "em");
                n.marks = hasEm ? existing : [...existing, { type: "em" }];
              }
            }
            nodes.push(n);
          }
          i = end + 1;
          continue;
        }
      }
    }

    // Strikethrough: ~~...~~
    if (input.startsWith("~~", i)) {
      const end = input.indexOf("~~", i + 2);
      if (end > i + 1) {
        const inner = input.slice(i + 2, end);
        const innerNodes = parseInline(inner);
        for (const n of innerNodes) {
          if (n.type === "text") {
            const existing = n.marks ?? [];
            n.marks = [...existing, { type: "strike" }];
          }
          nodes.push(n);
        }
        i = end + 2;
        continue;
      }
    }

    // Jira mention: @[Display Name](accountId) → mention node. The accountId must
    // be supplied explicitly — a bare @name cannot mention (Jira needs the opaque
    // Atlassian accountId, resolved out-of-band; see references/adf-authoring-style.md).
    if (input[i] === "@" && input[i + 1] === "[") {
      const m = /^@\[([^\]]+)\]\(([^)]+)\)/.exec(input.slice(i));
      if (m) {
        nodes.push({
          type: "mention",
          attrs: { id: m[2].trim(), text: `@${m[1].trim()}` },
        });
        i += m[0].length;
        continue;
      }
    }

    // Jira-native emoji: :short_name: → emoji node (Jira resolves the shortName).
    // Pattern is the GitHub/Slack shortname shape; inline code is parsed earlier,
    // so a colon inside `code` never reaches here.
    if (input[i] === ":") {
      const m = /^:([a-z0-9][a-z0-9_+-]*):/.exec(input.slice(i));
      if (m) {
        const shortName = `:${m[1]}:`;
        const attrs: Record<string, unknown> = { shortName };
        if (EMOJI_TEXT[shortName]) attrs.text = EMOJI_TEXT[shortName];
        nodes.push({ type: "emoji", attrs });
        i += m[0].length;
        continue;
      }
    }

    // Jira status lozenge: {status:color|TEXT} → status node (the coloured pill).
    if (input[i] === "{") {
      const m = /^\{status:(neutral|purple|blue|red|yellow|green)\|([^}]+)\}/i.exec(
        input.slice(i),
      );
      if (m) {
        nodes.push({
          type: "status",
          attrs: { text: m[2].trim(), color: m[1].toLowerCase() },
        });
        i += m[0].length;
        continue;
      }
    }

    // Default: accumulate plain text until the next special char
    let chunkEnd = i;
    while (chunkEnd < input.length) {
      const c = input[chunkEnd];
      if (c === "`" || c === "[" || c === "*" || c === "_" || c === "~" || c === ":" || c === "{" || c === "@") {
        break;
      }
      chunkEnd++;
    }
    if (chunkEnd === i) {
      pushText(input[i]);
      i++;
    } else {
      pushText(input.slice(i, chunkEnd));
      i = chunkEnd;
    }
  }

  return nodes;
}

// ---------- block parser ----------

function mdToAdf(markdown: string): {
  type: "doc";
  version: 1;
  content: ADFNode[];
} {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ADFNode[] = [];
  let i = 0;

  // A list line at any indentation: capture (indent, marker, text).
  const LIST_LINE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  // A GFM table separator row: |---|:--:|---| (pipes optional at the edges).
  const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
  // GitHub-alert blockquote opener: > [!NOTE] etc. (alone on its own line).
  const PANEL_OPEN = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|ERROR)\]\s*$/i;
  // GitHub alert keyword → ADF panelType (info | note | success | warning | error).
  const PANEL_TYPE: Record<string, string> = {
    note: "info",
    info: "info",
    tip: "success",
    success: "success",
    important: "note",
    warning: "warning",
    caution: "error",
    error: "error",
  };

  // Split a table row on unescaped pipes, honouring `\|`, then trim the empty
  // cells produced by leading/trailing edge pipes.
  const splitRow = (row: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    for (let k = 0; k < row.length; k++) {
      if (row[k] === "\\" && row[k + 1] === "|") {
        cur += "|";
        k++;
        continue;
      }
      if (row[k] === "|") {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += row[k];
    }
    cells.push(cur);
    if (cells.length && cells[0].trim() === "") cells.shift();
    if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
    return cells.map((c) => c.trim());
  };

  const consumeFencedCode = (): ADFNode | null => {
    const open = lines[i].match(/^```(\w*)\s*$/);
    if (!open) return null;
    const lang = open[1] || "";
    const codeLines: string[] = [];
    i++;
    while (i < lines.length && !/^```\s*$/.test(lines[i])) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length) i++; // consume closing ```
    const text = codeLines.join("\n");
    return {
      type: "codeBlock",
      attrs: lang ? { language: lang } : {},
      content: text ? [{ type: "text", text }] : [],
    };
  };

  // Nested-list parser. Indentation defines depth: a list line whose indent is
  // strictly greater than the current item's becomes a sublist attached inside
  // that item's listItem. List type (bullet vs ordered) is fixed per level by
  // the first marker seen at that indent.
  const parseListAtIndent = (indent: number): ADFNode => {
    const first = lines[i].match(LIST_LINE)!;
    const ordered = /\d+\./.test(first[2]);
    const items: ADFNode[] = [];
    while (i < lines.length) {
      const m = lines[i].match(LIST_LINE);
      if (!m) break;
      const curIndent = m[1].length;
      if (curIndent !== indent) break; // dedent or deeper indent → not our level
      const itemContent: ADFNode[] = [
        { type: "paragraph", content: parseInline(m[3]) },
      ];
      i++;
      const next = i < lines.length ? lines[i].match(LIST_LINE) : null;
      if (next && next[1].length > indent) {
        itemContent.push(parseListAtIndent(next[1].length));
      }
      items.push({ type: "listItem", content: itemContent });
    }
    return { type: ordered ? "orderedList" : "bulletList", content: items };
  };

  const consumeList = (): ADFNode | null => {
    const m = lines[i].match(LIST_LINE);
    if (!m) return null;
    return parseListAtIndent(m[1].length);
  };

  // GFM pipe table. Recognised only when the line contains a pipe AND the next
  // line is a separator row (|---|---|), which disambiguates it from prose that
  // happens to contain a pipe character.
  const consumeTable = (): ADFNode | null => {
    if (!lines[i].includes("|")) return null;
    if (i + 1 >= lines.length || !TABLE_SEP.test(lines[i + 1])) return null;
    const headerCells = splitRow(lines[i]);
    i += 2; // consume the header row + the separator row
    const rows: ADFNode[] = [
      {
        type: "tableRow",
        content: headerCells.map((c) => ({
          type: "tableHeader",
          content: [{ type: "paragraph", content: parseInline(c) }],
        })),
      },
    ];
    while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
      const cells = splitRow(lines[i]);
      rows.push({
        type: "tableRow",
        content: cells.map((c) => ({
          type: "tableCell",
          content: [{ type: "paragraph", content: parseInline(c) }],
        })),
      });
      i++;
    }
    return {
      type: "table",
      attrs: { isNumberColumnEnabled: false, layout: "default" },
      content: rows,
    };
  };

  // GitHub-alert blockquote → ADF panel. The body (every following `>` line) is
  // re-parsed as Markdown so panels can hold lists, code, paragraphs, etc.
  const consumePanel = (): ADFNode | null => {
    const m = lines[i].match(PANEL_OPEN);
    if (!m) return null;
    const panelType = PANEL_TYPE[m[1].toLowerCase()];
    i++;
    const body: string[] = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      body.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    const inner = mdToAdf(body.join("\n")).content;
    return {
      type: "panel",
      attrs: { panelType },
      content: inner.length ? inner : [{ type: "paragraph", content: [] }],
    };
  };

  // <details><summary>Title</summary> … </details> → ADF expand. The body is
  // re-parsed as Markdown so expand blocks can hold any block content.
  const consumeExpand = (): ADFNode | null => {
    if (!/^<details>\s*$/.test(lines[i])) return null;
    i++;
    let title = "";
    const sm = i < lines.length ? lines[i].match(/^<summary>(.*)<\/summary>\s*$/) : null;
    if (sm) {
      title = sm[1].trim();
      i++;
    }
    const body: string[] = [];
    while (i < lines.length && !/^<\/details>\s*$/.test(lines[i])) {
      body.push(lines[i]);
      i++;
    }
    if (i < lines.length) i++; // consume the closing </details>
    const inner = mdToAdf(body.join("\n")).content;
    return {
      type: "expand",
      attrs: { title },
      content: inner.length ? inner : [{ type: "paragraph", content: [] }],
    };
  };

  const consumeBlockquote = (): ADFNode | null => {
    if (!/^>\s?/.test(lines[i])) return null;
    const chunks: string[] = [];
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      chunks.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    return {
      type: "blockquote",
      content: [
        { type: "paragraph", content: parseInline(chunks.join("\n")) },
      ],
    };
  };

  const consumeHeading = (): ADFNode | null => {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (!m) return null;
    const level = Math.min(m[1].length, 6);
    const text = m[2];
    i++;
    return {
      type: "heading",
      attrs: { level },
      content: parseInline(text),
    };
  };

  const consumeHorizontalRule = (): ADFNode | null => {
    if (!/^---+\s*$/.test(lines[i]) && !/^\*\*\*+\s*$/.test(lines[i])) {
      return null;
    }
    i++;
    return { type: "rule" };
  };

  const consumeParagraph = (): ADFNode => {
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^<details>\s*$/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    const text = buf.join("\n");
    return { type: "paragraph", content: parseInline(text) };
  };

  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    let block: ADFNode | null = null;
    block = consumeFencedCode();
    if (block) { blocks.push(block); continue; }
    block = consumeExpand();
    if (block) { blocks.push(block); continue; }
    block = consumeHeading();
    if (block) { blocks.push(block); continue; }
    block = consumeHorizontalRule();
    if (block) { blocks.push(block); continue; }
    block = consumeTable();
    if (block) { blocks.push(block); continue; }
    block = consumePanel();
    if (block) { blocks.push(block); continue; }
    block = consumeBlockquote();
    if (block) { blocks.push(block); continue; }
    block = consumeList();
    if (block) { blocks.push(block); continue; }
    blocks.push(consumeParagraph());
  }

  return { type: "doc", version: 1, content: blocks };
}

// ---------- ADF validator (zero-dependency gate) ----------
//
// Validates an ADF document against an embedded allowlist of node types, mark
// types, required attrs, mark co-occurrence rules, and parent→child containment.
// This is intentionally NOT the @atlaskit/adf-utils validator: that package
// transitively pulls @atlaskit/editor-prosemirror + @atlaskit/tmp-editor-statsig,
// which breaks this converter's zero-dep contract. The ADF core node/mark set is
// small and stable, so the rules are inlined and maintained here.
//
// Scope note: the JSON-schema-valid set is broader than what the Jira REST API
// actually accepts ("marks and nodes in the schema may not be valid in this
// implementation"). This validator encodes the subset this converter emits plus
// the structural nodes a hand-extension or builder is likely to add (tables,
// panels). It is a fail-fast gate, not a full schema; a round-trip GET remains
// the only way to catch server-side coercion.

export type AdfValidationError = { path: string; message: string };

// children: "block" = all children must be block nodes; "inline" = all children
// must be inline nodes; "none" = node must not carry content; string[] = children
// must be exactly one of the listed types.
type ChildRule = "block" | "inline" | "none" | string[];

const NODE_RULES: Record<
  string,
  { kind: "block" | "inline"; children: ChildRule; requiredAttrs?: string[] }
> = {
  doc: { kind: "block", children: "block" },
  paragraph: { kind: "block", children: "inline" },
  heading: { kind: "block", children: "inline", requiredAttrs: ["level"] },
  blockquote: { kind: "block", children: "block" },
  bulletList: { kind: "block", children: ["listItem"] },
  orderedList: { kind: "block", children: ["listItem"] },
  listItem: { kind: "block", children: "block" },
  codeBlock: { kind: "block", children: ["text"] },
  panel: { kind: "block", children: "block", requiredAttrs: ["panelType"] },
  expand: { kind: "block", children: "block" },
  rule: { kind: "block", children: "none" },
  table: { kind: "block", children: ["tableRow"] },
  tableRow: { kind: "block", children: ["tableCell", "tableHeader"] },
  tableCell: { kind: "block", children: "block" },
  tableHeader: { kind: "block", children: "block" },
  mediaSingle: { kind: "block", children: ["media"] },
  media: { kind: "block", children: "none", requiredAttrs: ["type", "id"] },
  text: { kind: "inline", children: "none" },
  hardBreak: { kind: "inline", children: "none" },
  emoji: { kind: "inline", children: "none", requiredAttrs: ["shortName"] },
  mention: { kind: "inline", children: "none", requiredAttrs: ["id"] },
  date: { kind: "inline", children: "none" },
  status: { kind: "inline", children: "none", requiredAttrs: ["text", "color"] },
  inlineCard: { kind: "inline", children: "none" },
};

const VALID_PANEL_TYPES = new Set(["info", "note", "success", "warning", "error"]);

const VALID_STATUS_COLORS = new Set(["neutral", "purple", "blue", "red", "yellow", "green"]);

const VALID_MARKS = new Set([
  "code",
  "em",
  "strong",
  "strike",
  "link",
  "subsup",
  "textColor",
  "underline",
  "border",
  "alignment",
]);

// Jira rejects (HTTP 400) a text node carrying `code` alongside any of these
// formatting marks. `code` is mutually exclusive with text decoration.
const CODE_INCOMPATIBLE = new Set([
  "strong",
  "em",
  "strike",
  "underline",
  "subsup",
  "textColor",
]);

function checkChildAllowed(
  parentType: string,
  rule: ChildRule,
  child: ADFNode,
  childPath: string,
  errors: AdfValidationError[],
): void {
  const childRule = NODE_RULES[child?.type];
  if (Array.isArray(rule)) {
    if (!rule.includes(child?.type)) {
      errors.push({
        path: childPath,
        message: `node "${child?.type}" not allowed as child of "${parentType}" (expected one of: ${rule.join(", ")})`,
      });
    }
    return;
  }
  // unknown child types are reported by validateNode; skip kind comparison
  if (!childRule) return;
  if (rule === "inline" && childRule.kind !== "inline") {
    errors.push({
      path: childPath,
      message: `block node "${child.type}" not allowed inside "${parentType}" (expects inline content)`,
    });
  } else if (rule === "block" && childRule.kind !== "block") {
    errors.push({
      path: childPath,
      message: `inline node "${child.type}" not allowed directly inside "${parentType}" (expects block content)`,
    });
  }
}

function validateNode(
  node: ADFNode,
  path: string,
  errors: AdfValidationError[],
): void {
  if (!node || typeof node !== "object" || typeof node.type !== "string") {
    errors.push({ path, message: "node is not an object with a string `type`" });
    return;
  }

  const rule = NODE_RULES[node.type];
  if (!rule) {
    errors.push({
      path,
      message: `unknown node type "${node.type}" (not in supported ADF allowlist)`,
    });
    return;
  }

  if (rule.requiredAttrs) {
    for (const attr of rule.requiredAttrs) {
      if (!node.attrs || node.attrs[attr] === undefined) {
        errors.push({
          path,
          message: `node "${node.type}" missing required attr "${attr}"`,
        });
      }
    }
  }

  if (node.type === "heading" && node.attrs && node.attrs.level !== undefined) {
    const level = node.attrs.level;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 6) {
      errors.push({
        path,
        message: `heading level must be an integer 1-6, got ${JSON.stringify(level)}`,
      });
    }
  }

  if (node.type === "text" && (typeof node.text !== "string" || node.text.length === 0)) {
    errors.push({ path, message: "text node must have a non-empty string `text`" });
  }

  if (node.type === "panel" && node.attrs && node.attrs.panelType !== undefined) {
    const pt = node.attrs.panelType;
    if (typeof pt !== "string" || !VALID_PANEL_TYPES.has(pt)) {
      errors.push({
        path,
        message: `panel panelType must be one of ${Array.from(VALID_PANEL_TYPES).join(" | ")}, got ${JSON.stringify(pt)}`,
      });
    }
  }

  if (node.type === "status" && node.attrs && node.attrs.color !== undefined) {
    const color = node.attrs.color;
    if (typeof color !== "string" || !VALID_STATUS_COLORS.has(color)) {
      errors.push({
        path,
        message: `status color must be one of ${Array.from(VALID_STATUS_COLORS).join(" | ")}, got ${JSON.stringify(color)}`,
      });
    }
  }

  if (node.marks) {
    const markTypes: string[] = [];
    node.marks.forEach((mark, m) => {
      if (!mark || typeof mark.type !== "string" || !VALID_MARKS.has(mark.type)) {
        errors.push({
          path: `${path}.marks[${m}]`,
          message: `unknown or invalid mark type ${JSON.stringify(mark?.type)}`,
        });
        return;
      }
      markTypes.push(mark.type);
      if (
        mark.type === "link" &&
        (!mark.attrs || typeof mark.attrs.href !== "string" || (mark.attrs.href as string).length === 0)
      ) {
        errors.push({
          path: `${path}.marks[${m}]`,
          message: "link mark missing required attrs.href",
        });
      }
    });
    if (markTypes.includes("code")) {
      const bad = markTypes.filter((t) => CODE_INCOMPATIBLE.has(t));
      if (bad.length) {
        errors.push({
          path,
          message: `mark "code" cannot co-occur with ${bad.join(", ")} on the same text node (Jira rejects with HTTP 400)`,
        });
      }
    }
  }

  if (rule.children === "none") {
    if (Array.isArray(node.content) && node.content.length > 0) {
      errors.push({ path, message: `node "${node.type}" must not have content` });
    }
    return;
  }

  if (node.content !== undefined && !Array.isArray(node.content)) {
    errors.push({ path, message: `node "${node.type}" content must be an array` });
    return;
  }

  const kids = Array.isArray(node.content) ? node.content : [];
  kids.forEach((child, c) => {
    const childPath = `${path}.content[${c}]`;
    checkChildAllowed(node.type, rule.children, child, childPath, errors);
    validateNode(child, childPath, errors);
  });
}

function validateAdf(doc: unknown): { valid: boolean; errors: AdfValidationError[] } {
  const errors: AdfValidationError[] = [];
  if (!doc || typeof doc !== "object") {
    return { valid: false, errors: [{ path: "$", message: "document is not an object" }] };
  }
  const root = doc as ADFNode & { version?: unknown };
  if (root.type !== "doc") {
    errors.push({ path: "$", message: `root node type must be "doc", got ${JSON.stringify(root.type)}` });
  }
  if (root.version !== 1) {
    errors.push({ path: "$", message: `root must have version: 1, got ${JSON.stringify(root.version)}` });
  }
  validateNode(root, "$", errors);
  return { valid: errors.length === 0, errors };
}

function formatErrors(errors: AdfValidationError[]): string {
  return errors.map((e) => `  ✗ ${e.path}: ${e.message}`).join("\n");
}

// ---------- CLI entry ----------

export { mdToAdf, validateAdf };

if (import.meta.main) {
  const argv = process.argv.slice(2);

  // --check <file.adf.json>: validate an existing ADF document and exit.
  // Use this to gate jq-assembled create payloads or REST PUT bodies before send.
  const checkIdx = argv.indexOf("--check");
  if (checkIdx !== -1) {
    const file = argv[checkIdx + 1];
    if (!file) {
      console.error("usage: bun md-to-adf.ts --check <file.adf.json>");
      process.exit(2);
    }
    let doc: unknown;
    try {
      doc = JSON.parse(await Bun.file(file).text());
    } catch (e) {
      console.error(`✗ cannot read/parse ${file}: ${(e as Error).message}`);
      process.exit(2);
    }
    const { valid, errors } = validateAdf(doc);
    if (valid) {
      console.error(`✓ ${file}: valid ADF`);
      process.exit(0);
    }
    console.error(
      `✗ ${file}: invalid ADF (${errors.length} error${errors.length === 1 ? "" : "s"}):\n${formatErrors(errors)}`,
    );
    process.exit(1);
  }

  const skipValidate = argv.includes("--no-validate");
  const positional = argv.filter((a) => a !== "--no-validate");
  if (positional.length === 0) {
    console.error("usage: bun md-to-adf.ts <input.md|-> [output.json] [--no-validate]");
    console.error("       bun md-to-adf.ts --check <file.adf.json>");
    process.exit(2);
  }
  const inputArg = positional[0];
  const outputArg = positional[1];

  let md: string;
  if (inputArg === "-") {
    md = await Bun.stdin.text();
  } else {
    md = await Bun.file(inputArg).text();
  }

  const adf = mdToAdf(md);

  if (!skipValidate) {
    const { valid, errors } = validateAdf(adf);
    if (!valid) {
      console.error(
        `✗ converted ADF failed validation (${errors.length} error${errors.length === 1 ? "" : "s"}) — NOT writing output:\n${formatErrors(errors)}`,
      );
      console.error("  (pass --no-validate to bypass; see acli/SKILL.md §Publishing rich text)");
      process.exit(1);
    }
  }

  const json = JSON.stringify(adf, null, 2);
  if (outputArg) {
    await Bun.write(outputArg, json);
  } else {
    process.stdout.write(json);
  }
}
