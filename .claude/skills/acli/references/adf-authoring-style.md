# ADF authoring style — making Jira field content visually excellent

The bundled converter (`scripts/md-to-adf.ts`) and the "Publishing rich text" section in `SKILL.md` cover the **mechanics** — how Markdown becomes ADF and reaches a Jira field. `references/gotchas.md` covers what **breaks**. This file covers what makes field content **good**: when to reach for a table, a panel, a nested list, or a heading so a reader scanning the Jira UI grasps the content fast — instead of a wall of flat prose.

It is a **style guide, not a mandate generator**. It teaches the generic palette and the decision rules. *Which* structure suits *which* field (an ATP body vs an acceptance-criteria field vs a scope list) is domain knowledge owned by the consuming workflow skill — this file is what those skills cite so the generic doctrine stays single-source and DRY across every field and both boilerplates.

> **Doctrine anchor**: the host `CLAUDE.md` already prescribes a **Visual Mapping Bias** for the AI's own replies — "prefer a table / diagram over a paragraph when content is naturally mappable." This file extends that exact belief to the artifacts the AI writes *into Jira*. Same philosophy, new surface. It is not new doctrine — it is consistency.

## Table of contents

1. [The one principle: richness with purpose](#principle)
2. [Field hard-rules always win](#hard-rules)
3. [The block palette — when to reach for each](#palette)
4. [Before / after — flat vs structured](#before-after)
5. [The publish path + what can break](#publish)
6. [How a consuming skill cites this file (the thin-hook contract)](#contract)

## <a id="principle"></a>1. The one principle: richness with purpose

Structure earns its place by making the content **faster to read**, not by decorating it. A table that replaces six parallel bullets is a win; a table wrapping a single value is noise. Before adding any block, ask: *does this help a tester / PO / dev scan the field faster?* If not, plain prose or a simple list is the right answer.

Three failure modes to avoid:

- **Decoration** — panels and tables added for visual flair, not comprehension. A one-row "table", a panel holding one sentence that a `**bold**` line would carry.
- **Over-nesting** — four indent levels where two suffice. Depth is a cost the reader pays.
- **Fighting the field's law** — see §2. Some fields mandate a fixed shape; richness must live *around* it, never replace it.

The bar: **every block must replace prose that would be slower to read.** Visual form *replaces* prose; it does not sit alongside it as ornament.

## <a id="hard-rules"></a>2. Field hard-rules always win

A field may carry a **hard format law** defined by its consuming skill — a fixed shape that must not be overridden. The most common example: an acceptance-criteria field that requires every scenario wrapped in a fenced ` ```gherkin ` block (that fence is the only shape that renders monospaced + highlighted in the Jira ADF view). When a field has such a law:

- The law's shape is non-negotiable. **Never** replace a mandated Gherkin block with a table because a table "looks cleaner."
- Enrichment is allowed only in the **free** regions of that field — e.g. a short intro heading above the scenarios, or a panel calling out a shared precondition *between* fenced blocks — and only if the consuming skill permits it.
- When unsure whether a field has a law, **default to the field's documented template** and add nothing. The consuming skill's reference is the authority; this file never overrides it.

Precedence, top wins:

```
field hard-rule (consuming skill)  >  this style guide  >  author preference
```

## <a id="palette"></a>3. The block palette — when to reach for each

Every block below is emitted by the bundled converter from ordinary Markdown — author Markdown, never hand-write ADF JSON (anti-pattern T1). The exact Markdown the converter accepts is in `SKILL.md` → "Covered markdown subset".

| Block | Reach for it when… | Do NOT use it for… | Markdown you write |
|---|---|---|---|
| **Table** | comparing items across the same dimensions; any grid (test step → expected, field → value, option → trade-off, criteria matrix); ≥3 rows that share columns | a single key/value pair; one row; free-flowing narrative | `\| H1 \| H2 \|` then `\|---\|---\|` then rows |
| **Nested list** | genuine hierarchy (phase → sub-task, precondition → detail); 2 levels deep, rarely 3 | flat peers (use a single-level list); faking a table | indent 2 spaces under the parent item |
| **Panel** | one callout that must not be missed — a risk, a blocking precondition, a "results invalidated if…" warning | routine content; more than ~2 per field (callout inflation kills the signal) | `> [!WARNING]` / `[!NOTE]` / `[!INFO]` / `[!SUCCESS]` / `[!ERROR]` then `> body` |
| **Heading** | breaking a long field (impl plan, ATP body) into scannable sections | a field under ~1 screen; replacing what a bold lead-in does | `## Section` / `### Subsection` |
| **Code block** | commands, payloads, API responses, IDs, config — anything monospaced or copy-pasted; Gherkin scenarios (fenced) | ordinary prose; emphasis (use bold) | ` ```lang … ``` ` |
| **Blockquote** | quoting a source — a stakeholder line, a spec excerpt, an error message verbatim | callouts (use a panel); general emphasis | `> quoted line` |
| **Expand** | long supporting detail that would bury the main content — full logs, an exhaustive enumeration, optional deep-dive | content the reader needs up front (expands hide it behind a click) | `<details><summary>Title</summary>` … `</details>` |
| **Bold / inline code** | a key term, a literal value, an identifier inline | whole sentences; never put inline `code` *inside* `**bold**` — Jira rejects the combined marks (HTTP 400) | `**term**`, `` `value` `` |
| **Emoji** (Jira-native) | a per-line status mark in a checklist or report so a human reads pass/fail/pending at a glance | sprinkling for tone; more than one idea per line | `:white_check_mark:` `:x:` `:warning:` … any `:short_name:` |
| **Status lozenge** | a transition/lifecycle state as a coloured pill — `DONE`, `IN PROGRESS`, `BLOCKED`, `TODO` | ordinary emphasis; a value that is not a state | `{status:green\|DONE}` (colors: `neutral` `purple` `blue` `red` `yellow` `green`) |

Panel-type semantics (GitHub-alert keyword → ADF `panelType`): `[!NOTE]`/`[!INFO]` → info (blue) · `[!TIP]`/`[!SUCCESS]` → success (green) · `[!IMPORTANT]` → note (purple) · `[!WARNING]` → warning (yellow) · `[!CAUTION]`/`[!ERROR]` → error (red). Pick the colour that matches the *meaning*, not the one that looks nicest.

**Emoji & status — the curated set for reports.** A report or checklist where the AI marks each item reads far better with a glyph or a coloured pill than with the word "passed". Keep to this small, meaningful set — do not flood content with emoji:

| Intent | Emoji (`:short_name:`) | Status lozenge |
|---|---|---|
| pass / done | `:white_check_mark:` ✅ | `{status:green\|DONE}` |
| fail | `:x:` ❌ | `{status:red\|FAIL}` |
| in progress | `:hourglass_flowing_sand:` ⏳ | `{status:yellow\|IN PROGRESS}` |
| pending / to-do | `:white_circle:` ⚪ | `{status:neutral\|TODO}` |
| blocked | `:no_entry:` ⛔ | `{status:red\|BLOCKED}` |
| warning / risk | `:warning:` ⚠️ | — |
| note / info | `:information_source:` ℹ️ | `{status:blue\|INFO}` |

Use the **lozenge** for a single transition state of the whole item (a pill reads as a state); use the **emoji** for a per-line mark inside a list or table cell (a glyph reads as a tick). A checklist with a leading `:white_check_mark:` / `:x:` per line is exactly the high-value case — a human scans the list and sees every item's status without reading a word.

**Mentions — resolve the `accountId` first (one external step).** A mention needs the target's opaque Atlassian `accountId`, not their name — Jira has no way to resolve a bare `@name`. The converter emits the node from an explicit `@[Display Name](accountId)`; you supply the id, resolved out-of-band once:

```bash
# by email (exact match)
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$ATLASSIAN_URL/rest/api/3/user/search?query=person@example.com" | jq -r '.[0].accountId'
# your own account
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$ATLASSIAN_URL/rest/api/3/myself" | jq -r '.accountId'
```

Then author `@[Person Name](<accountId>)`. Verified live: the node round-trips as `{id:<accountId>, text:"@Name", accessLevel:""}` — a real, notifying tag. Use mentions sparingly (a mention pings the person); reserve them for assignment / hand-off / blocker call-outs, not decoration.

**Media (images / videos) — upload first, then embed (use the helper).** `![](path)` does NOT work in Jira ADF: a media node needs the opaque media-services UUID of an uploaded file, which the public attachments API does not hand back directly. The bundled helper `scripts/jira-attach-media.ts` runs the verified 3-step recipe (upload attachment → resolve the UUID from the attachment-content redirect → build the `mediaSingle > media` node) so you never assemble it by hand:

```bash
# attach a screenshot to a bug AND post it as an evidence comment in one call
bun .claude/skills/acli/scripts/jira-attach-media.ts BUG-123 ./repro-step-3.png \
  --caption "Repro step 3 — validation error not shown" --publish

# or just emit the media node JSON to splice into a larger ADF body you are assembling
bun .claude/skills/acli/scripts/jira-attach-media.ts BUG-123 ./diagram.png --doc > media.adf.json
```

The helper auto-detects PNG / JPEG / GIF dimensions (pass `--width`/`--height` for video or other formats), and `collection` is always stored as `""` (Jira ignores the input). Reach for media when a picture genuinely beats words — a bug screenshot, a failing-UI capture, an architecture diagram — not for decoration. The image must be uploaded to the *same issue* it is embedded in.

## <a id="before-after"></a>4. Before / after — flat vs structured

**Test steps** — parallel data across the same columns → a table out-scans bullets every time:

```
Before (flat):                          After (table):
- Step 1: open login, expect form       | # | Action            | Expected        |
- Step 2: submit blank, expect error     |---|-------------------|-----------------|
- Step 3: submit valid, expect redirect   | 1 | Open login        | Form renders    |
                                          | 2 | Submit blank      | Validation error|
                                          | 3 | Submit valid      | Redirect to home|
```

**A risk that must not be missed** — paragraph buries it; a panel makes it unmissable:

```
Before:  Note that results are invalid if run before the nightly sync completes.
After:   > [!WARNING]
         > Results are invalid if the suite runs before the nightly sync completes.
```

**Multi-level workflow** — real hierarchy → nested list, not flattened prose:

```
- Checkout
  - validate cart
  - reserve stock
- Payment
  - authorize
  - capture
```

## <a id="publish"></a>5. The publish path + what can break

The style choices above are authored as Markdown, then converted and published through the standard path — there is no separate mechanism for "rich" content:

1. Author the field content as Markdown (using the palette above).
2. Convert + validate: `bun scripts/md-to-adf.ts field.md field.adf.json` (the validator gates structure before publish).
3. Publish via the matching surface (`--description-file`, `comment create -F`, `--from-json` `additionalAttributes`, or REST `PUT` for a custom field on an existing item). Full recipe table in `SKILL.md` → "Publishing rich text".

Two failure modes that bite at publish time, not author time — read `references/gotchas.md` before publishing ADF:

- **Combined marks** — inline `code` co-occurring with `strong`/`em` → HTTP 400. Keep code spans outside bold/italic.
- **Batched custom fields via MCP** — the MCP variant of the issue-tracker tool silently drops ADF conversion on batched custom-field updates. Publish rich custom fields one at a time, then round-trip `GET` to confirm Jira stored the nodes (it silently coerces some).

## <a id="contract"></a>6. How a consuming skill cites this file (the thin-hook contract)

Workflow skills do **not** restate the palette. They add a **thin hook** at each point where they instruct the AI to fill a Jira rich-text field — one or two lines that (a) point here for the generic rules and (b) name the structure(s) that suit *that* field's content. Shape of a hook:

> When writing `{{jira.<field>}}`, format per `acli/references/adf-authoring-style.md`. For this field, prefer **<structure>** for <content shape> — but the field's hard-rule (if any) wins (§2).

Examples of field-appropriate hooks a consuming skill might carry (the skill owns these, not this file):

| Field (illustrative) | Suggested structure | Note |
|---|---|---|
| Test steps / ATP scenarios | table (step → expected) | per the law of the field if it mandates Gherkin |
| ATR / results summary | table (case → status) + panel for blockers | |
| Scope / Out-of-Scope | single-level list; nested only for real sub-scopes | |
| Business rules | nested list or table for rule → boundary | |
| Implementation plan | headings per section; table for option trade-offs; panel for risk | |
| Acceptance criteria | **fenced Gherkin only** — hard-rule, do not enrich the scenarios | §2 |

The authority for *which* structure a given field uses is the consuming skill's own reference. This file is the *how* and *when*; the skill supplies the *which*. That separation is what keeps the doctrine DRY and the field semantics where they belong.
