# `toki` — WokiToki interactive feedback CLI

WokiToki (`toki`) is a local, blocking human-in-the-loop feedback CLI. An AI agent (or any caller) writes a **spec** JSON describing a set of blocks — questions and/or report paragraphs — and runs `toki`. The CLI serves a dark web UI, opens the browser, and waits for the user to answer. On submit it writes a **Result** JSON to stdout (and a backup file) and exits. The caller reads stdout and continues.

The branding is "walkie-talkie": back-and-forth, one answer per thing. Everything is one engine — a spec is a list of `blocks`; a block with `controls` is a question, a block without is a report paragraph, and a mix is a hybrid form.

## Decoupling guarantee

`cli/toki/` imports **only Bun built-ins** — no repo aliases, no `cli/lib/*`, **zero external npm dependencies**. The HTTP server is native `Bun.serve`; the markdown renderer is a small hand-rolled function; spec validation is hand-rolled (no zod). This is intentional so the tool can be extracted to a standalone global package later without a rewrite.

## Install / run

Inside this repo:

```bash
bun run toki <specPath>          # via the package.json script
bun cli/toki/index.ts <specPath> # direct invocation
```

Standalone (after a future extraction), it runs the same way against `index.ts` with any Bun runtime. No build step.

## Flags

| Flag | Default | Meaning |
| --- | --- | --- |
| `<specPath>` | — | **Required** positional. Path to a spec JSON file. |
| `--port <n>` | `4747` | Preferred port. Auto-increments to the next free port (up to ~20 attempts) if busy. |
| `--timeout <min>` | `30` | Minutes to wait for a submission. Fractional allowed (e.g. `0.5`). No submit in the window → exit 1. |
| `--no-open` | off | Do not auto-open the browser. The waiting URL is still printed to stderr so you can open it manually. |
| `--help` | — | Print usage to stderr and exit 0. |

## Spec + Result contract (brief)

A spec is `{ title, intro?, submitLabel?, blocks[] }`. Each block is `{ id, content, controls?, text? }`:

- `controls` **absent** → report paragraph. **Present** → question.
- `controls.type` is `single` (radio), `multi` (checkbox), or `toggle` (boolean, no `options`). `single`/`multi` need a non-empty `options[]` of `{ value, label }`.
- `text` (a `{ required, placeholder? }`) is always rendered; `text.required` is decided per block.

The Result is `{ submittedAt, blocks[], meta }`. Each result block is `{ id, controlAnswer, text, quotes }`:

- `controlAnswer`: `string` (single) | `string[]` (multi) | `boolean` (toggle) | `null` (report block).
- `text`: the user's free-text (`""` if untouched).
- `quotes`: phrases the user highlighted from the block `content`, anchoring the reply.
- `meta`: `{ answered, total }` — `answered` counts blocks with any control selection and/or non-empty text.

The full field-by-field contract and validation rules live in `schema.ts` (the source of truth) and are mirrored for the AI in `.claude/skills/wokitoki/references/schema.md`. Worked example specs + results: `.claude/skills/wokitoki/references/examples.md`.

## stdout discipline

stdout carries **only** the final Result JSON — a single object, emitted once. Every banner, the waiting URL, port-fallback notices, the result-backup path, and all errors go to **stderr** (`console.error`). The CLI never calls `console.log`. This lets a caller `JSON.parse` stdout cleanly without stripping noise.

A backup copy of the Result is also written to `.toki/result-<name>.json` (where `<name>` is derived from a `spec-<name>.json` filename, otherwise a short epoch id). The stdout copy is authoritative.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Submitted OK — Result JSON on stdout. |
| `1` | Timeout (no submission within `--timeout`) or a runtime error. SIGINT (Ctrl-C) exits `130`. |
| `2` | Spec file unreadable, or failed validation (stderr: `[toki] invalid spec at <path>: …`). |

## Markdown subset supported

Block `content` and the spec `intro` are rendered by a dependency-free renderer (`markdown.ts`). Source HTML special characters are escaped first, then markdown transforms run on top, so AI/user content can never inject live markup.

Supported:

- ATX headings, levels 1–6 (`#` … `######`)
- Bold (`**…**`), italic (`*…*` or `_…_`)
- Inline code (`` `…` ``) and fenced code blocks (```` ```lang ````), kept verbatim
- Links `[text](url)` — `http`/`https`/`mailto` only (other schemes drop to plain text)
- Unordered lists (`- ` / `* `) and ordered lists (`1. `)
- Blank-line-separated paragraphs (a single newline becomes `<br>`)

Out of scope (rendered as escaped plain text): tables, images, nested blockquotes, and nested lists deeper than one level.

## File layout

```
cli/toki/
  index.ts     # CLI entry: parseArgs, read+validate spec, serve, open browser, await, write+print result, exit codes
  server.ts    # Bun.serve: GET / -> page | POST /submit -> resolve; port fallback, timeout, SIGINT teardown
  render.ts    # builds the full HTML document from a normalized spec (inline CSS + JS + spec JSON)
  schema.ts    # Spec / Block / Controls / TextField / Result types + hand-rolled validateSpec (source of truth)
  markdown.ts  # minimal markdown -> HTML (dependency-free)
  ui/app.css   # dark theme (string asset inlined by render.ts)
  ui/app.js    # client logic: controls, highlight-quote, focus drawer, validation, submit
  README.md    # this file
```
