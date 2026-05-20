#!/usr/bin/env bun
/**
 * Minimal Markdown → ADF (Atlassian Document Format) converter.
 *
 * Bundled with the acli skill so any caller can publish rich text to Jira
 * via the standard MD → ADF → acli (or REST) workflow.
 *
 * Covered Markdown subset:
 *   - Headings: # / ## / ### / #### / ##### / ###### → ADF heading levels 1-6
 *   - Bullet lists: -, * (single level)
 *   - Ordered lists: 1. (single level)
 *   - Fenced code blocks: ```lang ... ``` (language tag preserved as attrs.language)
 *   - Inline code: `code`
 *   - Bold: **text** or __text__
 *   - Italic: *text* or _text_ (snake_case-safe — will not mangle identifiers)
 *   - Strikethrough: ~~text~~
 *   - Links: [label](url)
 *   - Blockquotes: > line
 *   - Horizontal rule: ---
 *   - Paragraphs (default block)
 *
 * Out of scope (extend if your project needs them):
 *   nested lists, tables, mentions, panels, status macros, expand blocks,
 *   media / images.
 *
 * Runtime: Bun ≥ 1.0. Uses Bun.file / Bun.stdin / Bun.write.
 *
 * CLI:
 *   bun md-to-adf.ts <input.md> [output.json]
 *   bun md-to-adf.ts -                # read MD from stdin
 *   cat input.md | bun md-to-adf.ts - output.json
 *
 * Module:
 *   import { mdToAdf } from "./md-to-adf.ts";
 *   const adf = mdToAdf(markdownString);  // returns { type: "doc", version: 1, content: [...] }
 */

type ADFNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ADFNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
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
            const hasStrong = existing.some((m) => m.type === "strong");
            n.marks = hasStrong ? existing : [...existing, { type: "strong" }];
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
              const hasEm = existing.some((m) => m.type === "em");
              n.marks = hasEm ? existing : [...existing, { type: "em" }];
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

    // Default: accumulate plain text until the next special char
    let chunkEnd = i;
    while (chunkEnd < input.length) {
      const c = input[chunkEnd];
      if (c === "`" || c === "[" || c === "*" || c === "_" || c === "~") {
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

  const consumeBulletList = (): ADFNode | null => {
    if (!/^[\-*]\s+/.test(lines[i])) return null;
    const items: ADFNode[] = [];
    while (i < lines.length && /^[\-*]\s+/.test(lines[i])) {
      const itemText = lines[i].replace(/^[\-*]\s+/, "");
      items.push({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInline(itemText) }],
      });
      i++;
    }
    return { type: "bulletList", content: items };
  };

  const consumeOrderedList = (): ADFNode | null => {
    if (!/^\d+\.\s+/.test(lines[i])) return null;
    const items: ADFNode[] = [];
    while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
      const itemText = lines[i].replace(/^\d+\.\s+/, "");
      items.push({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInline(itemText) }],
      });
      i++;
    }
    return { type: "orderedList", content: items };
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
      !/^[\-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i])
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
    block = consumeHeading();
    if (block) { blocks.push(block); continue; }
    block = consumeHorizontalRule();
    if (block) { blocks.push(block); continue; }
    block = consumeBulletList();
    if (block) { blocks.push(block); continue; }
    block = consumeOrderedList();
    if (block) { blocks.push(block); continue; }
    block = consumeBlockquote();
    if (block) { blocks.push(block); continue; }
    blocks.push(consumeParagraph());
  }

  return { type: "doc", version: 1, content: blocks };
}

// ---------- CLI entry ----------

export { mdToAdf };

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: bun md-to-adf.ts <input.md|-> [output.json]");
    process.exit(2);
  }
  const inputArg = args[0];
  const outputArg = args[1];

  let md: string;
  if (inputArg === "-") {
    md = await Bun.stdin.text();
  } else {
    md = await Bun.file(inputArg).text();
  }

  const adf = mdToAdf(md);
  const json = JSON.stringify(adf, null, 2);

  if (outputArg) {
    await Bun.write(outputArg, json);
  } else {
    process.stdout.write(json);
  }
}
