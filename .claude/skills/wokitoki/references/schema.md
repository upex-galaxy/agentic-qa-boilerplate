# WokiToki — Full data contract

The authoritative source is `cli/toki/schema.ts` (`validateSpec` + the exported types). This reference mirrors it. If the two ever disagree, the TypeScript wins.

There are two shapes: the **Spec** the AI writes (input), and the **Result** the browser returns (output). In between, `validateSpec` produces a `NormalizedSpec` (every default filled, every `text` present) which the UI renders — the AI never writes the normalized form directly.

---

## Spec (input — the AI writes it)

### `Spec`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | `string` | yes | Must be a **non-empty** string. |
| `intro` | `string` | no | Markdown shown at the top. Must be a string when present. |
| `submitLabel` | `string` | no | CTA label. Must be a string when present. Defaults to `"Submit"` when absent or empty. |
| `blocks` | `Block[]` | yes | Must be a **non-empty** array. |

### `Block`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Non-empty AND **unique** across the spec. Used to map answers back. |
| `content` | `string` | yes | Markdown. May be the empty string `""`, but the key must be a string. On a **table block** this is an optional intro shown ABOVE the table. |
| `controls` | `Controls` | no | **Omit** → the block is a report paragraph. Present → the block is a question. Forbidden on a table block. |
| `text` | `TextField` | no | Defaults to `{ required: false }` when omitted. The textarea is ALWAYS rendered; this only governs whether it is required. Forbidden on a table block. |
| `table` | `BlockTable` | no | Present → the block is an **answerable table** (one row = one answer). **Mutually exclusive** with `controls`/`text` — having `table` AND either of them fails validation. `content` is still allowed. |

A block is EITHER a normal block (`controls`/`text`) OR a table block (`table`) — never both.

### `Controls`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `type` | `'single' \| 'multi' \| 'toggle'` | yes | Anything else fails validation. |
| `options` | `ControlOption[]` | conditional | **Required + non-empty** for `single` and `multi`. **Must be ABSENT** for `toggle` (present `options` on a toggle fails validation). |
| `required` | `boolean` | no | Defaults to `false` (normalizer treats `required === true` as the only truthy form). |

`ControlOption`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `value` | `string` | yes | Non-empty AND **unique** within the block. This is what comes back in `controlAnswer`. |
| `label` | `string` | yes | Non-empty. Shown to the user. |

Control type semantics:

- `single` — radio group. Exactly one `value` chosen → `controlAnswer: string`.
- `multi` — checkbox group. Zero or more `value`s → `controlAnswer: string[]`.
- `toggle` — boolean switch, no `options` → `controlAnswer: boolean`.

### `TextField`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `required` | `boolean` | yes (in the type) | Whether the free-text answer is mandatory. When the whole `text` object is omitted on a block, it normalizes to `{ required: false }`. |
| `placeholder` | `string` | no | Placeholder text for the textarea. Must be a string when present. |

**Per-block `text.required` semantics:** `required` is decided per block by the AI, independently of `controls.required`. A block can require text but not a control, require a control but not text, require both, or require neither. The textarea is always rendered regardless; `required` only gates the submit button.

### `BlockTable` (the answerable-table shape)

A table block renders a real `<table>` where **each row is independently answerable**. The user can highlight-to-quote any **cell** (the quote attaches to THAT row), and each row carries its own controls + textarea defined once by `rowControls`/`rowText`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `columns` | `string[]` | yes | Column header labels. **Non-empty** array of **non-empty** strings. Rendered as `<th>` (escaped). |
| `rows` | `TableRow[]` | yes | **Non-empty** array. One answerable row each. |
| `rowControls` | `Controls` | no | Same shape + rules as a block `controls` (`single`/`multi` need `options[]`; `toggle` rejects `options`). Applied to EVERY row. Omit → rows have no control, only a textarea. |
| `rowText` | `TextField` | no | Same shape as block `text`. Defaults to `{ required: false }` when omitted. Applied to EVERY row. The per-row textarea is always rendered. |

`TableRow`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Non-empty AND **unique within the block**. Echoed back in each `RowResult.id`. |
| `cells` | `string[]` | yes | One string per column, **length must equal `columns.length`**. Each cell is a string; the empty string `""` is allowed. Rendered escaped (stable quote-source text). |

**Row-answer model:** the AI authors the table once (`columns` + `rows` + one `rowControls`/`rowText`). The UI gives every row that same control + textarea in a trailing "Answer" column, and lets the user quote any cell into that row. The block-level answer is inert for a table block (always `null`/`""` in the result); the data lives in `rows[]`.

---

## NormalizedSpec (internal — output of `validateSpec`)

`validateSpec(raw)` returns a `NormalizedSpec` with defaults resolved:

- `submitLabel` is always present (default `"Submit"`).
- Every block's `text` is always present (default `{ required: false }`).
- Every present `controls.required` is a concrete `boolean`.
- For `single`/`multi`, `options` is guaranteed present + non-empty; for `toggle`, `options` is omitted.
- A table block carries a normalized `table` with `rowText` always present (default `{ required: false }`); `rowControls` only when authored. Its block-level `text` default is unused.

The AI does not author this shape — it is what the UI consumes after validation.

---

## Result (output — JSON to stdout + `.toki/result-<name>.json`)

### `Result`

| Field | Type | Notes |
| --- | --- | --- |
| `submittedAt` | `string` | ISO-8601 timestamp of the submission. |
| `blocks` | `ResultBlock[]` | One entry per spec block, in order. |
| `meta` | `{ answered: number, total: number }` | See below. |

### `ResultBlock`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Echoes the spec block `id` — anchor every answer with this. |
| `controlAnswer` | `string \| string[] \| boolean \| null` | Encoded by control type (see below). **Always `null` for a table block.** |
| `text` | `string` | The user's free-text. Empty string `""` if untouched. **Always `""` for a table block.** |
| `quotes` | `string[]` | Exact phrases the user highlighted from this block's `content`. Empty array if none. For a table block this holds quotes from the **intro content** only — per-cell quotes live in `rows[].quotes`. |
| `images` | `string[]` | **Present ONLY when the user pasted at least one image** onto this block (the key is omitted otherwise — never an empty array). In the final result each entry is a **relative file path under `.toki/`** the AI can `Read`. See [Pasted images](#pasted-images-paste-to-attach) below. |
| `rows` | `RowResult[]` | **Present ONLY for a table block** (absent on every normal block). One entry per spec row, in order. |

### `RowResult` (table blocks only)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Echoes the spec `TableRow.id`. |
| `controlAnswer` | `string \| string[] \| boolean \| null` | This row's `rowControls` answer, encoded by type (same table as below). `null` when `rowControls` is absent or a `single`/`multi` is unanswered. |
| `text` | `string` | This row's free-text from its `rowText` textarea. `""` if untouched. |
| `quotes` | `string[]` | Exact phrases the user highlighted from THIS row's cells. Empty array if none. |
| `images` | `string[]` | **Present ONLY when the user pasted at least one image** onto this row (key omitted otherwise). Each entry is a **relative file path under `.toki/`** in the final result. See [Pasted images](#pasted-images-paste-to-attach) below. |

### Pasted images (paste-to-attach)

The user can paste an image from the clipboard into any response textarea (a block textarea, a table-row textarea, or the expand-to-write panel). Each pasted image becomes an entry in that answer's `images` array.

`images` has a **dual nature by stage** — the field carries a different kind of string depending on where the result is observed:

| Stage | What each `images[]` entry is |
| --- | --- |
| In transit (browser → server `POST /submit`) | A `data:` URL: `data:image/png;base64,...`. The server preserves these strings verbatim (no disk IO). |
| Final result (stdout + `.toki/result-<name>.json` backup) | A **relative file path under `.toki/`**, e.g. `.toki/demo-img-summary-1.png`. The CLI decodes the base64, writes the bytes to that file, and rewrites the entry to the path **before** both writes — so the AI reading stdout gets a path it can `Read`, never inline base64. |

**File naming:** `.toki/<resultName>-img-<blockId>[-<rowId>]-<n>.<ext>` where:

- `<resultName>` is the same name used for `result-<name>.json` (derived from `spec-<name>.json`, else a short epoch id);
- `<blockId>` / `<rowId>` are the block / table-row ids, **sanitized** (any character outside `[A-Za-z0-9._-]` becomes `_`); the `-<rowId>` segment is present only for table-row images;
- `<n>` is the 1-based index of the data-URL image within that answer (pre-existing path entries do not consume a number);
- `<ext>` is chosen from the image mime: `image/png`→`png`, `image/jpeg`/`image/jpg`→`jpg`, `image/gif`→`gif`, `image/webp`→`webp`, `image/svg+xml`→`svg`, any other image mime→`bin`.

Robustness: an entry that is already a plain path (not a `data:` URL) passes through unchanged; an image that fails to decode or write is logged to **stderr** and dropped from the array (it never breaks the handshake or pollutes stdout).

### `controlAnswer` encoding (by control type)

| Block control | `controlAnswer` |
| --- | --- |
| `single` | `string` (the chosen option `value`) — or `null` if unanswered |
| `multi` | `string[]` (chosen `value`s; `[]` if none chosen) |
| `toggle` | `boolean` |
| no `controls` (report paragraph) | `null` |

### `meta`

- `meta.answered` — number of blocks that have **any** answer: a control selection (a chosen `single`/`multi`/`toggle`) and/or non-empty trimmed `text`. A **table block counts as one block** and is "answered" if **any** of its rows has any answer (a row control selection and/or non-empty row text).
- `meta.total` — total block count in the spec. A table block is **one** block here regardless of row count.

---

## Validation rules (what `validateSpec` rejects → exit 2)

Each violation throws a `SpecError` with a `path` (e.g. `blocks[2].id`) and exits the CLI with code 2 (stderr: `[toki] invalid spec at <path>: <message>`).

- Spec is not a plain object.
- `title` missing or not a non-empty string.
- `intro` present but not a string.
- `submitLabel` present but not a string.
- `blocks` not an array, or an empty array.
- A block is not a plain object.
- A block `id` missing / not a non-empty string / **duplicated**.
- A block `content` not a string.
- `controls` present but not a plain object.
- `controls.type` not one of `single` / `multi` / `toggle`.
- `controls.options` present on a `toggle`.
- `controls.options` missing or empty on a `single` / `multi`.
- An option not an object, or `value` / `label` missing or not non-empty strings.
- A duplicated option `value` within a block.
- `text` present but not a plain object.
- `text.required` present but not a boolean.
- `text.placeholder` present but not a string.

Table-block specific:

- `table` co-present with `controls` or `text` on the same block.
- `table` present but not a plain object.
- `table.columns` not a non-empty array, or any column not a non-empty string.
- `table.rows` not a non-empty array, or a row not an object.
- A row `id` missing / not a non-empty string / **duplicated within the block**.
- A row `cells` not an array, or its length **not equal to** `columns.length`, or any cell not a string.
- `table.rowControls` present but failing the `Controls` rules (bad type, missing `options` on `single`/`multi`, `options` on `toggle`, etc.).
- `table.rowText` present but failing the `TextField` rules.

---

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Submitted — Result JSON on stdout (and backed up to `.toki/result-<name>.json`). |
| 1 | Timeout (no submit within `--timeout`) or a runtime error. Nothing usable on stdout. SIGINT (Ctrl-C) exits 130. |
| 2 | Spec file unreadable or failed validation. |

stdout discipline: **only** the Result JSON is ever written to stdout. Banners, the waiting URL, port-fallback notices, and errors all go to stderr — so the AI can `JSON.parse` stdout cleanly.
