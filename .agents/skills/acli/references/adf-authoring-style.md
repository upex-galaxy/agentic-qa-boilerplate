# ADF authoring style: making Jira field content easy to scan

The bundled converter (`scripts/md-to-adf.ts`) and the "Publishing rich text" section in `SKILL.md` cover the mechanics of turning Markdown into ADF and getting it into a Jira field. `references/gotchas.md` covers what breaks. This file covers what makes field content good: when a table, a panel, a nested list or a heading helps a reader scanning the Jira UI, and when plain prose is the better choice.

It is a style guide. It teaches the generic palette and the decision rules. Which structure suits which field (an ATP body, an acceptance-criteria field, a scope list) is domain knowledge that the consuming workflow skill owns; those skills cite this file so the generic doctrine lives in one place.

The host `AGENTS.md` already asks for a Visual Mapping bias in the AI's own replies: a table or diagram instead of a paragraph when the content maps naturally. This file applies the same belief to what the AI writes into Jira.

## Table of contents

1. [The one principle: richness with purpose](#principle)
2. [Field hard-rules always win](#hard-rules)
3. [The block palette: when to reach for each](#palette)
4. [Before / after: flat vs structured](#before-after)
5. [The publish path and what can break](#publish)
6. [How a consuming skill cites this file (the thin-hook contract)](#contract)

## <a id="principle"></a>1. The one principle: richness with purpose

A block earns its place when it makes the content faster to read. A table that replaces six parallel bullets is a win; a table around a single value is noise. Before adding a block, ask whether it helps a tester, PO or dev scan the field faster. If not, plain prose or a simple list is the right answer.

Three failure modes:

- Decoration: panels and tables added for looks. A one-row table, or a panel around one sentence that a bold line would carry.
- Over-nesting: four indent levels where two would do. Each level costs the reader.
- Fighting the field's law (see §2). Richness goes around a mandated shape, never in place of it.

The bar: every block replaces prose that would be slower to read. The visual form substitutes for the prose, it does not sit beside it as ornament.

## <a id="hard-rules"></a>2. Field hard-rules always win

A consuming skill can define a hard format law for a field. The common case is an acceptance-criteria field that requires every scenario inside a fenced ` ```gherkin ` block, because that fence is the only shape that renders monospaced and highlighted in the Jira ADF view. When a field has such a law:

- Keep its shape. Do not swap a mandated Gherkin block for a table because the table looks cleaner.
- Enrich only the free regions of the field, such as a short heading above the scenarios or a panel for a shared precondition between fenced blocks, and only if the consuming skill permits it.
- When you are unsure whether a field has a law, use the field's documented template and add nothing. The consuming skill's reference is the authority; this file never overrides it.

Precedence, top wins:

```
field hard-rule (consuming skill)  >  this style guide  >  author preference
```

## <a id="palette"></a>3. The block palette: when to reach for each

The converter emits every block below from ordinary Markdown. Author Markdown and never hand-write ADF JSON (anti-pattern T1). The exact Markdown subset the converter accepts is in `SKILL.md` under "Covered markdown subset".

| Block | Reach for it when | Do not use it for | Markdown you write |
|---|---|---|---|
| **Table** | comparing items across the same dimensions; any grid (test step to expected, field to value, option to trade-off, criteria matrix); 3 or more rows that share columns | a single key/value pair; one row; free-flowing narrative | `\| H1 \| H2 \|` then `\|---\|---\|` then rows |
| **Nested list** | genuine hierarchy (phase to sub-task, precondition to detail); 2 levels deep, rarely 3 | flat peers (use a single-level list); faking a table | indent 2 spaces under the parent item |
| **Panel** | one callout that must not be missed: a risk, a blocking precondition, a "results invalid if" warning | routine content; more than about 2 per field (too many callouts kill the signal) | `> [!WARNING]` / `[!NOTE]` / `[!INFO]` / `[!SUCCESS]` / `[!ERROR]` then `> body` |
| **Heading** | breaking a long field (implementation plan, ATP body) into scannable sections | a field under about one screen; replacing what a bold lead-in does | `## Section` / `### Subsection` |
| **Code block** | commands, payloads, API responses, IDs, config, anything monospaced or copy-pasted; fenced Gherkin scenarios | ordinary prose; emphasis (use bold) | ` ```lang … ``` ` |
| **Blockquote** | quoting a source: a stakeholder line, a spec excerpt, an error message verbatim | callouts (use a panel); general emphasis | `> quoted line` |
| **Expand** | long supporting detail that would bury the main content: full logs, an exhaustive enumeration, an optional deep-dive | content the reader needs up front (an expand hides it behind a click) | `<details><summary>Title</summary>` … `</details>` |
| **Bold / inline code** | a key term, a literal value, an identifier inline | whole sentences; never put inline `code` inside `**bold**`, because Jira rejects the combined marks (HTTP 400) | `**term**`, `` `value` `` |
| **Emoji** (Jira-native) | a per-line status mark in a checklist or report so a reader sees pass, fail or pending at a glance | tone; more than one idea per line | `:white_check_mark:` `:x:` `:warning:` or any `:short_name:` |
| **Status lozenge** | a transition or lifecycle state as a coloured pill: `DONE`, `IN PROGRESS`, `BLOCKED`, `TODO` | emphasis; a value that is not a state | `{status:green\|DONE}` (colors: `neutral` `purple` `blue` `red` `yellow` `green`) |

Panel-type semantics (GitHub-alert keyword to ADF `panelType`): `[!NOTE]`/`[!INFO]` give info (blue), `[!TIP]`/`[!SUCCESS]` give success (green), `[!IMPORTANT]` gives note (purple), `[!WARNING]` gives warning (yellow), `[!CAUTION]`/`[!ERROR]` give error (red). Pick the colour that matches the meaning, not the one that looks nicest.

### Emoji and status for reports

A report or checklist where the AI marks each item reads better with a glyph or a coloured pill than with the word "passed". Keep to this small set and do not flood content with emoji:

| Intent | Emoji (`:short_name:`) | Status lozenge |
|---|---|---|
| pass / done | `:white_check_mark:` ✅ | `{status:green\|DONE}` |
| fail | `:x:` ❌ | `{status:red\|FAIL}` |
| in progress | `:hourglass_flowing_sand:` ⏳ | `{status:yellow\|IN PROGRESS}` |
| pending / to-do | `:white_circle:` ⚪ | `{status:neutral\|TODO}` |
| blocked | `:no_entry:` ⛔ | `{status:red\|BLOCKED}` |
| warning / risk | `:warning:` ⚠️ | none |
| note / info | `:information_source:` ℹ️ | `{status:blue\|INFO}` |

Use a lozenge for the single state of a whole item, because a pill reads as a state. Use an emoji for a per-line mark inside a list or table cell, because a glyph reads as a tick. A checklist with a leading `:white_check_mark:` or `:x:` on each line is the high-value case: a reader sees every item's status without reading a word.

### Mentions

A mention needs the target's opaque Atlassian `accountId`, not their name. Jira cannot resolve a bare `@name`. The converter emits the node from an explicit `@[Display Name](accountId)`, and you supply the id, resolved once outside the converter:

```bash
# by email (exact match)
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$(bun run --silent jira:url)/rest/api/3/user/search?query=person@example.com" | jq -r '.[0].accountId'
# your own account
curl -sS -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$(bun run --silent jira:url)/rest/api/3/myself" | jq -r '.accountId'
```

Then author `@[Person Name](<accountId>)`. Verified live: the node round-trips as `{id:<accountId>, text:"@Name", accessLevel:""}`, a real notifying tag. A mention pings the person, so reserve it for assignment, hand-off and blocker call-outs.

### Issue links

A plain-text issue key (`UPEX-512`) in an ADF body does not auto-link. It publishes as inert text the reader cannot click, unlike the legacy wiki renderer. Any blocking, filed or referenced ticket named inside a comment, ATR or description body must be written as a real Markdown link to the issue's browse URL, `[UPEX-512: short title](https://<your-site>.atlassian.net/browse/UPEX-512)`. The converter emits a `link` mark and the Jira UI upgrades it to a smart-link card. Bare keys are fine only inside code blocks and in machine-read artifact ID lists (such as the `Artifacts:` line) where the consuming skill says so.

This matters most for blockers: a blocking bug named as plain text defeats the point of naming it, since the reader should be one click away. The traceability issuelink from `agentic-qa-core/references/traceability-linking.md` is a separate, additional requirement. The link mark helps the human and the issuelink feeds the graph, so one never replaces the other.

### Media (images and videos)

`![](path)` does not work in Jira ADF. A media node needs the opaque media-services UUID of an uploaded file, which the public attachments API does not return directly. The bundled helper `scripts/jira-attach-media.ts` runs the verified 3-step recipe (upload attachment, resolve the UUID from the attachment-content redirect, build the `mediaSingle > media` node), so you never assemble it by hand:

```bash
# attach a screenshot to a bug AND post it as an evidence comment in one call
bun .agents/skills/acli/scripts/jira-attach-media.ts BUG-123 ./repro-step-3.png \
  --caption "Repro step 3 — validation error not shown" --publish

# or just emit the media node JSON to splice into a larger ADF body you are assembling
bun .agents/skills/acli/scripts/jira-attach-media.ts BUG-123 ./diagram.png --doc > media.adf.json
```

The helper detects PNG, JPEG and GIF dimensions (pass `--width` and `--height` for video or other formats), and `collection` is always stored as `""` because Jira ignores the input. Use media when a picture beats words, such as a bug screenshot, a failing-UI capture or an architecture diagram. The image must be uploaded to the same issue it is embedded in.

## <a id="before-after"></a>4. Before / after: flat vs structured

Test steps are parallel data across the same columns, so a table out-scans bullets:

```
Before (flat):                          After (table):
- Step 1: open login, expect form       | # | Action            | Expected        |
- Step 2: submit blank, expect error     |---|-------------------|-----------------|
- Step 3: submit valid, expect redirect   | 1 | Open login        | Form renders    |
                                          | 2 | Submit blank      | Validation error|
                                          | 3 | Submit valid      | Redirect to home|
```

A risk that must not be missed gets buried in a paragraph; a panel makes it hard to skip:

```
Before:  Note that results are invalid if run before the nightly sync completes.
After:   > [!WARNING]
         > Results are invalid if the suite runs before the nightly sync completes.
```

A multi-level workflow is real hierarchy, so use a nested list instead of flattened prose:

```
- Checkout
  - validate cart
  - reserve stock
- Payment
  - authorize
  - capture
```

## <a id="publish"></a>5. The publish path and what can break

Style choices are authored as Markdown, then converted and published through the standard path. There is no separate mechanism for rich content:

1. Author the field content as Markdown, using the palette above.
2. Convert and validate: `bun .agents/skills/acli/scripts/md-to-adf.ts field.md field.adf.json` (the validator checks structure before publish).
3. Publish through the matching surface (`--description-file`, `comment create -F`, `--from-json` `additionalAttributes`, or REST `PUT` for a custom field on an existing item). The full recipe table is in `SKILL.md` under "Publishing rich text".

Two failures show up at publish time, not at authoring time. Read `references/gotchas.md` before publishing ADF:

- Combined marks: inline `code` together with `strong` or `em` returns HTTP 400. Keep code spans outside bold and italic.
- Batched custom fields via MCP: the MCP variant of the issue-tracker tool silently drops ADF conversion on batched custom-field updates. Publish rich custom fields one at a time, then `GET` the item to confirm Jira stored the nodes (it silently coerces some).

## <a id="contract"></a>6. How a consuming skill cites this file (the thin-hook contract)

Workflow skills do not restate the palette. At each point where they tell the AI to fill a Jira rich-text field, they add a thin hook of one or two lines that points here for the generic rules and names the structures that suit that field's content. Shape of a hook:

> When writing `{{jira.<field>}}`, format per `acli/references/adf-authoring-style.md`. For this field, prefer **<structure>** for <content shape>, but the field's hard-rule (if any) wins (§2).

Examples a consuming skill might carry (the skill owns these, not this file):

| Field (illustrative) | Suggested structure | Note |
|---|---|---|
| Test steps / ATP scenarios | table (step to expected) | per the law of the field if it mandates Gherkin |
| ATR / results summary | table (case to status) + panel for blockers | |
| Scope / Out-of-Scope | single-level list; nested only for real sub-scopes | |
| Business rules | nested list or table for rule to boundary | |
| Implementation plan | headings per section; table for option trade-offs; panel for risk | |
| Acceptance criteria | **fenced Gherkin only**: hard-rule, do not enrich the scenarios | §2 |

The consuming skill's own reference decides which structure a given field uses. This file supplies the how and the when, the skill supplies the which, and that split keeps the field semantics where they belong.
