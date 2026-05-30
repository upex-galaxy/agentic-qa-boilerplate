---
name: wokitoki
description: "WokiToki (`toki`) — a local, browser-based human-in-the-loop feedback CLI the AI drives mid-conversation to collect structured, anchored, point-by-point answers. WHEN to use: the AI needs the user to react to MORE THAN ~3 decision points at once, OR to a long multi-section explanation/report the user may want to answer one point at a time. It beats `AskUserQuestion` (which is capped at ~4 questions × ~4 options, terminal-bound, has no rich free-text, and cannot show the reference content while answering) and it beats an inline prose questionnaire (which produces unanchored replies the AI must guess-map back to each question/paragraph). HOW it works: the AI writes a spec JSON of `blocks` (a block WITH `controls` is a question, a block WITHOUT `controls` is a report paragraph, and a mix is a hybrid form), runs `bun run toki <specPath>`, and the user answers in a local dark-themed web UI with single/multi/toggle controls + a per-block free-text field + highlight-to-quote; on submit the tool prints ONLY the Result JSON to stdout (banners/errors go to stderr), which the AI reads the SAME turn and continues with precise, anchored feedback. Triggers on: `wokitoki`, `toki`, `feedback UI`, `ask me point by point`, `let me answer in the browser`, `decision form`, `interactive feedback`, `review this plan point by point`, `react to each section`, `more than three questions`, `long explanation I want to respond to piece by piece`. Use this skill even when the user does not say `toki` — if the task is to collect granular anchored feedback on many decisions or a long report, this is the right tool. Do NOT use for: a trivial 1–2 option pick or a single yes/no (use `AskUserQuestion`), or any non-interactive / CI / one-shot output where there is no human at a browser to answer."
license: MIT
compatibility: [claude-code, opencode, cursor, codex]
allowed-tools: Bash(bun run toki:*)
complementary_categories: [meta-skill]
---

# WokiToki (`toki`)

WokiToki is a local, blocking feedback CLI the AI invokes mid-conversation. It serves a dark web UI, opens the browser, waits for the user to answer, and on submit prints a single Result JSON to stdout that the AI parses the same turn. The branding is "walkie-talkie": back-and-forth, one answer per thing. Binary / command / dir = `toki` / `.toki/`.

Everything is one engine: a spec is a list of **blocks**. A block with `controls` is a question; a block without `controls` is a report paragraph; mixing them in one spec is a hybrid form — for free.

## When to use vs `AskUserQuestion` vs inline prose

| Situation | Use |
| --- | --- |
| 1–2 option pick, single yes/no, ≤3 simple decisions | `AskUserQuestion` |
| >3 decision points at once (mix of single/multi/toggle) | **WokiToki** |
| A long multi-section explanation/report the user may want to react to one point at a time | **WokiToki** |
| You need the reply ANCHORED to the exact phrase it is about | **WokiToki** (highlight-to-quote) |
| Non-interactive / CI / no human at a browser | neither — emit plain output |

Why not the alternatives:

- **`AskUserQuestion`** is capped (~4 questions × ~4 options), terminal-bound, has no rich free-text, and cannot display the reference content while the user answers.
- **Inline prose questionnaire** produces unanchored replies: the AI has to guess which paragraph/point each sentence of the reply maps to. WokiToki returns per-block answers keyed by a stable `id`, so the mapping is exact.

## Spec schema in brief

```jsonc
{
  "title": "Auth plan — decisions",      // required, non-empty
  "intro": "Optional markdown at top",   // optional
  "submitLabel": "Submit answers",        // optional (default "Submit")
  "blocks": [                              // required, non-empty
    {
      "id": "q1",                          // required, unique within the spec
      "content": "Which token strategy?",  // markdown string (may be empty "")
      "controls": {                        // OMIT for a report paragraph
        "type": "single",                  // single | multi | toggle
        "options": [                        // required for single/multi, FORBIDDEN for toggle
          { "value": "jwt", "label": "JWT stateless" },
          { "value": "session", "label": "Server-side session" }
        ],
        "required": true                    // optional (default false)
      },
      "text": { "required": true, "placeholder": "Justify" }  // text ALWAYS present at runtime; required decided per-block
    }
  ]
}
```

- `controls` absent → report paragraph. Present → question. Mixed list → hybrid.
- `controls.type`: `single` (radio), `multi` (checkbox), `toggle` (boolean switch, no `options`).
- `controls.required` and `text.required` are independent — either, both, or neither can be required per block.
- `id` is the stable AI-assigned key the answer is mapped back to.

Full contract (every field, defaults, validation rules) → `.claude/skills/wokitoki/references/schema.md`. Worked copy-pasteable specs → `.claude/skills/wokitoki/references/examples.md`.

## Exact invocation

1. **Write the spec** to a JSON file. Convention: `.toki/spec-<name>.json` (a `spec-<name>.json` filename makes the backup land at `.toki/result-<name>.json`). The `.toki/` dir is git-ignored.
2. **Run it (blocking):** `bun run toki <specPath>`. This serves the UI, opens the browser, and waits.
   - Flags: `--port <n>` (default 4747, auto-increments if busy), `--timeout <min>` (default 30, fractional ok), `--no-open` (print the URL but do not open the browser), `--help`.
3. **Parse stdout.** stdout carries **ONLY** the Result JSON — one object, no banner. All progress lines, the waiting URL, and errors go to **stderr**. Read stdout, `JSON.parse` it, continue the same turn.

Exit codes:

| Code | Meaning |
| --- | --- |
| 0 | submitted OK — Result JSON is on stdout |
| 1 | timeout (no submit within `--timeout`) or runtime error — nothing usable on stdout |
| 2 | bad spec (file unreadable or failed validation) — `[toki] invalid spec at <path>: …` on stderr |

A backup of the Result is also written to `.toki/result-<name>.json`, but the stdout copy is authoritative for the AI.

## Reading the Result

```jsonc
{
  "submittedAt": "2026-05-29T12:34:56.000Z",
  "blocks": [
    { "id": "q1", "controlAnswer": "jwt", "text": "Prefer JWT for scale", "quotes": ["token strategy"] }
  ],
  "meta": { "answered": 5, "total": 8 }
}
```

Per `ResultBlock`, decode `controlAnswer` by the block's control type:

- `single` → `string` (the chosen option `value`) or `null` if unanswered.
- `multi` → `string[]` (chosen option `value`s; `[]` if none).
- `toggle` → `boolean`.
- report block / no controls → `null`.

Other fields:

- `text` — the user's free-text for that block (empty string `""` if untouched).
- `quotes` — `string[]` of exact phrases the user highlighted from that block's `content`. These tell you precisely which words the reply emphasizes; weight them when interpreting `text`.
- `meta.answered` — count of blocks with any answer (a control selection and/or non-empty text); `meta.total` — block count.

Match each `blocks[].id` back to the `id` you assigned in the spec to anchor every answer to its decision/paragraph.

## Notes

- UI chrome is English (repo-artifact rule); the block `content` is whatever language you authored it in.
- The CLI is decoupled (Bun built-ins only, zero external deps) so it can be extracted to a standalone package later — see `cli/toki/README.md`.
