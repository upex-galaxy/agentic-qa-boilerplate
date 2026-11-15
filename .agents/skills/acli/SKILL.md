---
name: acli
description: "Atlassian CLI (`acli`) for Jira, Confluence and org admin from a terminal. Use when creating, viewing, searching, editing, transitioning, commenting on, linking or bulk-changing Jira work items; managing projects, boards, sprints, filters or field definitions; managing Confluence spaces, blogs or pages; activating org users; logging in or switching sites; publishing rich text to Jira. Not for the Atlassian MCP, Bitbucket or the Appfire acli."
license: MIT
compatibility: [claude-code, cursor, codex, opencode, pi]
allowed-tools: Bash(acli:*)
complementary_categories: [issue-tracker]
metadata:
  kind: utility
---

# Atlassian CLI (`acli`)

`acli` is Atlassian's official command-line tool for Jira Cloud, Confluence Cloud and org admin. It replaces terminal Jira automation that used to need raw REST calls, and puts Jira, Confluence and admin behind one binary with one credential store per product.

This skill covers driving `acli` for any intent: one-off commands, batch mutations, scripted pipelines and CI jobs. How the host repo plugs it into its workflow (TMS modality, project conventions, repo-specific anti-patterns) lives in `<repo-core>/references/acli-integration.md`; load it whenever a session touches the host repo's Jira workflow.

## Compact Rules

- Pass `--paginate` (or an explicit `--limit`) on any search whose result is counted, iterated or decided on. Pagination is opt-in and truncation is silent: there is no warning.
- Exit 0 does not prove a subcommand exists. An unknown subcommand falls back to the parent help and exits 0, so check that the help body actually changed. Every multi-word flag is kebab-case; do not invent flags.
- Verify auth status before any bulk mutation (`acli jira auth status`). Auth is per product (jira, confluence, admin and global are separate sessions), and a silent expiry leaves the batch half-applied with no clean rollback (anti-pattern T4).
- Pass the non-interactive confirmation flag on every mutating command in CI, or the command hangs waiting on stdin.
- Author rich text in Markdown, convert it with `scripts/md-to-adf.ts` and pass the ADF (anti-pattern T1). The CLI never converts Markdown and stores the literal characters, and hand-written ADF trips the combined-marks bug.
- Let the converter's validation gate run on every ADF document before publishing, and read the field back after writing. The gate catches node-level errors; only the read-back catches Jira's silent server-side coercion.
- Measure the serialized ADF of every rich-text value (description, comment, rich-text custom field) before writing it: `jq -c . <file>.adf.json | wc -m` must stay at or under 30000 (T5). Jira's cap counts the ADF JSON, which is several times longer than the Markdown. Over budget means stop and propose which sections move where; truncating, or splitting one value across two fields or comments, is off the table. Detail: "Size budget" under "Publishing rich text".
- `workitem edit` takes no custom-field values. It hard-rejects every shape with exit 1, so editing a custom field on an existing item works only through the REST PUT path (anti-pattern T3).
- `workitem edit` does not set COMPONENTS either: there is no flag and no `--from-json` key, so the edit succeeds and leaves components untouched without saying so. Set them at create time, or change them through the same REST PUT path.
- The vendor's own `--help` examples are not safe to copy. Several omit the subcommand the flags live on (`workitem comment --key …` instead of `workitem comment create --key …`) and fail with `unknown flag`. The forms in this skill's references are the tested ones.
- Resolve a `customfield_NNNNN` id through the host project's slug catalog instead of hardcoding it in a script or generated output (T2). Ids differ per workspace; slugs travel.
- The Atlassian host lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` and is read through the accessor. An environment copy goes stale and points scripts at the wrong site.
- Creating an issue link: `--out` and `--in` are empirically inverted against Jira's semantics. `--out` takes the prerequisite, `--in` the dependent. List the link afterwards to verify the direction, and delete and recreate it with swapped flags if it landed backwards.
- Capture and surface the trace id from any backend failure. It is the only debug signal, and Atlassian Support needs it.
- Known blind spots (enumerating custom fields, editing custom-field values, workflows, issue types, versions, components, attachments, watchers, adding an item to a sprint) go through REST or the opt-in Atlassian MCP, not through forcing the CLI.
- A REST fallback that needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` runs inside the `.env` loader (`bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '...'`) or through a bundled script that loads `.env` itself (`scripts/jira-attach-media.ts`). Exporting them, running `source .env` or printing them in the agent's shell is off the table.
- Prefer API-token auth in scripted contexts, and pin the binary to an explicit version in production pipelines: tracking `latest` has caused same-day mass failures.

**Read full SKILL.md when**: composing a specific command, publishing rich text, running the REST PUT workaround, or working any surface outside Jira work items.

## Why this skill exists

`acli` is easy to misuse, for five reasons.

1. `workitem search` without `--paginate` returns the first page only, with no warning, so scripts that count or iterate keys read the wrong number of items.
2. `acli jira auth login` does not authenticate `acli admin`, `acli confluence` or `acli rovodev`. A top-level `acli auth` (global OAuth, the newer surface) is a fourth scope. Each has its own session.
3. The CLI renamed `jira issue` to `jira workitem`, but the JSON response still has a top-level `issues[]` array and CSV inputs still use `issueType` and `parentIssueId`. Mixing the two vocabularies works, and confuses readers.
4. `acli jira workflow --help` does not error: it falls back to `acli jira --help` with exit 0, so "no error" says nothing about whether the command exists.
5. The binary has hard limits the docs do not advertise (see "What `acli` cannot do").

This body covers what applies to almost every session. `references/` holds the deep material; load only the one you need.

## Composable skills

`acli` is itself the canonical `issue-tracker` skill, so the category usually has no overlapping tier-T3 skills. To resolve it anyway:

1. Read `complementary_categories` from this frontmatter (`issue-tracker`).
2. Scan the skills actually installed (the host repo's strategy doc §3.1): the session's skill list plus every `.agents/skills/*/SKILL.md` on disk, git-ignored community folders included. `.agents/skills/REGISTRY.md` lists committed skills only, so it is not that scan.
3. Apply the threshold rule from the host repo's skill-composition strategy doc (tier-T1 and tier-T3 silent; tier-T4 silent only when a doctrine names it for this moment, otherwise ask).

If the catalog is unavailable, skip the scan and log `skill_resolution: "fallback-inline"` plus `missing: [<categories>]`, per the strategy doc's composability fallback contract. Which workflow skills load `acli` is in `<repo-core>/references/acli-integration.md` §Composability.

## Fallback: Atlassian MCP

The Atlassian MCP is opt-in and absent from the default boilerplate. To use it, add the atlassian block from `agentic-qa-core/references/mcp-atlassian-optin.md` to `.mcp.json`, `opencode.jsonc`, `.codex/config.toml` AND `.pi/mcp.json` (parity is checked), make sure the `ATLASSIAN_*` values in `.env` are set, and restart the agent. Everything below applies only after that. Its tools carry the `mcp__atlassian__*` prefix or similar; check the MCP tool list for the exact one.

Prefer MCP over `acli` when:

- the `acli` binary is not installed;
- `acli` auth fails and cannot be fixed in this session;
- the operation is a documented blind spot (see "What `acli` cannot do").

Prefer `acli` over MCP for bulk operations (far fewer tokens per call), scripts and CI, and anything returning a large result set. MCP and `acli` overlap for issues, projects, boards, sprints, comments and basic Confluence. For org-admin user lifecycle and Confluence space CRUD, `acli` is more direct; for schema reads (field catalog, workflow definitions), MCP or REST is the only path.

## Command structure

```
acli <product> [<feature>] <action> [flags]
```

| Product       | Purpose                                                          |
| ------------- | ---------------------------------------------------------------- |
| `jira`        | Jira Cloud: work items, projects, boards, sprints, filters, dashboards, custom-field definitions |
| `confluence`  | Confluence Cloud: spaces (CRUD), blog posts, page view           |
| `admin`       | Organization admin: API-key auth, user lifecycle                 |
| `auth`        | Global OAuth (cross-product, newer top-level surface)            |
| `rovodev`     | Rovo Dev AI coding agent (separate beta product)                 |
| `feedback`    | Send feedback or a bug report to Atlassian                       |
| `config`      | Atlassian Government Cloud configuration (`gov-cloud`)           |
| `completion`  | Generate shell-autocompletion script (bash / zsh / fish / powershell) |

Every level has `--help`. Use it when unsure:

```bash
acli --help
acli jira --help
acli jira workitem --help
acli jira workitem create --help
```

## Quick start

```bash
# 1. Authenticate against a site using an API token (scriptable path)
echo "$ATLASSIAN_API_TOKEN" | acli jira auth login \
  --site "<your-site>.atlassian.net" \
  --email "you@example.com" \
  --token

# 2. Verify
acli jira auth status

# 3. Create a work item
acli jira workitem create --project "{{PROJECT_KEY}}" --type "Task" --summary "Draft the Q3 OKRs"

# 4. Search with JQL; always pass --paginate or --limit explicitly
acli jira workitem search --jql "project = {{PROJECT_KEY}} AND status = 'To Do'" --paginate --json

# 5. Transition one or many
acli jira workitem transition --jql "project = {{PROJECT_KEY}} AND assignee = currentUser()" \
  --status "In Progress" --yes --ignore-errors
```

The host repo's own variant of these steps (status names, project keys, slug-resolved custom fields) is in `<repo-core>/references/acli-integration.md`.

## Top-level command map

### Jira (`acli jira`)

| Subcommand   | What it covers                                            |
| ------------ | --------------------------------------------------------- |
| `auth`       | login · logout · status · switch (API-token or OAuth)     |
| `workitem`   | archive · assign · attachment (list / delete) · clone · comment (create / delete / list / update / visibility) · create · create-bulk · delete · edit · link (create / delete / list / type) · search · transition · unarchive · view · watcher (list / remove) |
| `project`    | archive · create · delete · list · restore · update · view |
| `board`      | create · delete · get · list-projects · list-sprints · search |
| `sprint`     | create · delete · list-workitems · update · view          |
| `filter`     | add-favourite · change-owner · get · get-columns · list · reset-columns · search · update |
| `dashboard`  | search                                                    |
| `field`      | cancel-delete · create · delete · update (custom-field DEFINITIONS only, not values, and **no listing**) |

### Confluence (`acli confluence`)

| Subcommand | What it covers                                                       |
| ---------- | -------------------------------------------------------------------- |
| `auth`     | login · logout · status · switch, same model as `jira auth`          |
| `space`    | archive · create · list · restore · update · view (full CRUD)        |
| `blog`     | create · list · view                                                 |
| `page`     | view (read-only: page CRUD is not exposed; confirm with `acli confluence page --help`) |

### Admin (`acli admin`)

| Subcommand | What it covers                                |
| ---------- | --------------------------------------------- |
| `auth`     | login · logout · status · switch (API key)    |
| `user`     | activate · deactivate · delete · cancel-delete |

## The selector pattern

Most mutating `workitem` commands (`edit`, `transition`, `assign`, `archive`, `clone`, `comment create`) accept one of these target selectors:

| Selector            | When to use                                                    |
| ------------------- | -------------------------------------------------------------- |
| `--key KEY-1,KEY-2` | You already know the exact keys                                |
| `--jql "..."`       | You want everything matching a JQL query                       |
| `--filter 10001`    | You want to reuse a saved Jira filter                          |
| `--from-file f`     | You have a file listing keys (`archive`/`unarchive`/`assign`)  |

A selector that matches many items makes the command a batch operation. Two flags almost always matter:

- `-y, --yes` skips the interactive confirmation prompt. CI needs it, since without it the command hangs on stdin. The flag does not exist on `admin user delete` or `admin user cancel-delete`; use `--ignore-errors` there.
- `--ignore-errors` keeps the batch going when a single item fails.

## Output and piping

Every list, search and view command supports three shapes: the default table (human-readable), `--json` (for `jq` and scripts) and `--csv` (spreadsheet-friendly).

```bash
# Count only
acli jira workitem search --jql "project = {{PROJECT_KEY}}" --count

# Save full result set to CSV
acli jira workitem search --jql "project = {{PROJECT_KEY}}" --paginate --csv > team.csv

# Extract a single field with jq
acli jira workitem view {{PROJECT_KEY}}-123 --json | jq '.fields.summary'
```

The JSON from `workitem search` has a top-level `issues` array (not `workitems`): the Jira REST v3 wire format shows through.

## Publishing rich text (the default workflow)

Jira stores rich text (descriptions, comments, any rich-text field) as ADF, Atlassian Document Format: a JSON tree of typed nodes (`heading`, `paragraph`, `bulletList`, `orderedList`, `codeBlock`, `blockquote`, `rule`, `table`, `panel`, `expand`) with inline marks (`strong`, `em`, `code`, `link`, `strike`).

`acli` accepts ADF JSON in every rich-text input and never converts Markdown: passing `# Heading` to `--description` or `--body` stores the literal string `# Heading` in a single ADF paragraph.

`create` and `edit` are asymmetric for custom-field rich text. `acli workitem create --from-json` accepts custom fields through `additionalAttributes` (ADF doc payloads work). `acli workitem edit --from-json` hard-rejects every custom-field shape (`additionalAttributes`, `fields`, flat `customfield_X`) with exit 1 and an `unknown field` error, with no silent drop and no escape hatch in the binary. Updating a rich-text custom field on an existing work item takes the REST PUT workaround below.

For anything richer than plain prose, work in three steps:

```
1. Author the content in Markdown.
2. Convert MD → ADF JSON using scripts/md-to-adf.ts.
3. Pass the ADF JSON to the matching acli flag, or, for cases acli cannot cover, into a REST body.
```

### The bundled converter

Location: `.agents/skills/acli/scripts/md-to-adf.ts`. Runtime: Bun.

CLI usage:

```bash
bun .agents/skills/acli/scripts/md-to-adf.ts input.md output.adf.json
# stdin form
cat input.md | bun .agents/skills/acli/scripts/md-to-adf.ts - output.adf.json
# stdout form (omit output arg)
bun .agents/skills/acli/scripts/md-to-adf.ts input.md > output.adf.json
```

Programmatic usage, when batching across many fields or many work items in one script:

```typescript
import { mdToAdf, validateAdf } from "./.agents/skills/acli/scripts/md-to-adf.ts";
const adf = mdToAdf(markdownString);  // returns { type: "doc", version: 1, content: [...] }
const { valid, errors } = validateAdf(adf);  // gate ANY ADF before publishing
```

Covered Markdown subset: headings 1 to 6, bullet lists, ordered lists, nested lists (indentation-based), GFM tables (`| a | b |` plus a `|---|---|` separator), panels (GitHub-alert blockquotes), expand blocks (`<details><summary>`), Jira-native emoji (`:short_name:`), status lozenges (`{status:color|TEXT}`), mentions (`@[Name](accountId)`), fenced code blocks (with optional language tag), inline code, bold, italic (snake_case-safe), strikethrough, links, blockquotes, horizontal rule and paragraphs.

Rich-block syntax:

| Markdown you write | ADF node produced |
|---|---|
| `\| H1 \| H2 \|` then `\| --- \| --- \|` then body rows | `table` (header row → `tableHeader`, body → `tableCell`; inline marks work inside cells; `\|` escapes a literal pipe) |
| `> [!NOTE]` / `[!INFO]` (blue) · `[!TIP]` / `[!SUCCESS]` (green) · `[!IMPORTANT]` (purple) · `[!WARNING]` (yellow) · `[!CAUTION]` / `[!ERROR]` (red), then `> body` lines | `panel` with `panelType` `info` / `success` / `note` / `warning` / `error`. Body re-parsed as Markdown (can hold lists, code, etc.) |
| Two-space (or deeper) indentation under a list item | nested `bulletList` / `orderedList` inside that `listItem`; depth = indent width; bullet/ordered mix per level |
| `<details>` / `<summary>Title</summary>` / body / `</details>` | `expand` with `attrs.title`; body re-parsed as Markdown |
| `:white_check_mark:` `:x:` `:warning:` and any `:short_name:` | `emoji` node (Jira resolves the shortName; curated status marks also carry a Unicode `text` fallback). Inline code is parsed first, so a colon inside `` `code` `` is safe |
| `{status:green\|DONE}` (colors: `neutral` `purple` `blue` `red` `yellow` `green`) | `status` node, the coloured lozenge for transition states. `localId` is not required (Jira injects none on publish) |
| `@[Display Name](accountId)` | `mention` node. Supply the `accountId` explicitly (resolve it via `/rest/api/3/user/search`, see `references/adf-authoring-style.md` §mentions); a bare `@name` is not converted |

Media (images, videos) is not Markdown: `![](path)` does not work, because an ADF media node needs the opaque media-services UUID of an uploaded file. Use the bundled helper `scripts/jira-attach-media.ts` (upload, resolve the UUID, emit or publish the `mediaSingle > media` node). Example: `bun .agents/skills/acli/scripts/jira-attach-media.ts BUG-123 ./repro.png --caption "Repro step 3" --publish`. The full recipe is in `references/adf-authoring-style.md` §media.

Out of scope (extend the converter if a project needs it): `nestedExpand` (expand inside a table cell).

This section covers how Markdown becomes ADF. For when to reach for a table, a panel or a nested list, so field content scans instead of reading as flat prose, see `references/adf-authoring-style.md`. Workflow skills cite that file wherever they fill a Jira rich-text field.

### Validation gate (fail fast before Jira)

The converter validates its output by default against an embedded ADF allowlist, then refuses to write and exits non-zero when the document is invalid. An opaque Jira `HTTP 400 INVALID_INPUT` at publish time becomes a node-level diagnostic at author time. The gate has zero dependencies: it does not use `@atlaskit/adf-utils`, which transitively pulls ProseMirror and Statsig and would break the converter's zero-dep contract. The rules are inlined in `md-to-adf.ts`.

It catches unknown node types, unknown or invalid marks, `code` co-occurring with `strong`/`em`/`strike`/`underline`/`subsup`/`textColor` (the HTTP 400 combined-marks bug), `heading` level outside 1 to 6, a missing `link` `href`, empty `text` nodes, illegal containment (a `paragraph` directly under a `bulletList`) and a malformed root (`type` other than `doc`, or `version` other than 1).

```bash
# validate is on by default during conversion; bypass with --no-validate
bun .agents/skills/acli/scripts/md-to-adf.ts input.md out.adf.json --no-validate

# gate an ALREADY-assembled ADF doc (jq create payload field, or a REST PUT body)
bun .agents/skills/acli/scripts/md-to-adf.ts --check field.adf.json   # exit 0 valid, 1 invalid
```

After splicing ADF into a `--from-json` create payload or a REST `PUT` body (where the wrapper is assembled outside the converter), run `--check` on each ADF field before sending. The gate is necessary but not sufficient: a round-trip `GET` of the field after the write is still the only way to catch server-side coercion, since Jira silently drops some invalid nodes.

### Size budget (Jira counts the serialized ADF, not the text)

Jira Cloud caps every rich-text value (description, comment, rich-text custom field) at 32,767 characters, and Cloud does not make the cap configurable. The cap counts the serialized ADF JSON of the value, not the visible text: every node, mark and attribute is paid for. ADF runs several times longer than the Markdown it came from, and structure-heavy content (tables, nested lists, panels, code blocks) expands the most. The measurements behind this are in `.context/ADR/ADR-0006-forensic-measurements-ledger.md`.

So every write of a rich-text value measures the full value as it will be stored, before sending it:

```bash
bun .agents/skills/acli/scripts/md-to-adf.ts body.md body.adf.json
jq -c . body.adf.json | wc -m        # must stay at or under 30000
```

The budget is 30,000, which leaves room under the cap for text a human adds to the same field later. When the field already holds content you keep (a section rewrite inside a longer description), measure the merged document, not only your part.

Over budget means stopping before the write, and proposing which sections move out of this field and where (the owning workflow names the destinations), with the size each move saves. A Jira rejection for length (`CONTENT_LIMIT_EXCEEDED` on REST v3, or a `400` naming the field length) is the same stop. Truncating, splitting one value across two fields or two comments, and dropping the formatting to squeeze under the cap are all off the table. The proposal waits for a person; see "With nobody at the keyboard".

### Recipe by Jira surface

| Surface | How to publish ADF | Notes |
|---|---|---|
| `description` on `workitem create` | `--from-json` payload, `description` key holds an ADF doc | Custom-field values live in `additionalAttributes` of the same payload, same ADF shape |
| `description` on `workitem edit` | `--description-file <file>` accepts a JSON file containing an ADF doc | `acli` auto-detects ADF vs plain text by file content |
| Rich-text custom field on `workitem create` | `additionalAttributes.customfield_NNNNN` = ADF doc inside `--from-json` | Same shape as `description` |
| Rich-text custom field on an existing item | **`acli` cannot do this; use the REST PUT workaround.** `PUT /rest/api/3/issue/{KEY}` with `{"fields": {customfield_NNNNN: <ADF>}}` via `curl` | `acli workitem edit` hard-rejects `additionalAttributes`, `fields`, and flat `customfield_X` with `✗ Error: json: unknown field …`. Confirmed empirically. See gotcha #4 + dedicated workaround section below. |
| Comment create | `comment create --body-file <file>` (alias `-F`) accepts ADF | The `--body` (plain) flag remains plain text only |
| Comment update | `comment update --body-adf <file>` | Dedicated ADF flag |

### Worked end-to-end example

```bash
# 1. Author each rich-text field as Markdown
cat > /tmp/desc.md <<'MD'
## User Story

- As a user
- I want X
- So that Y

## Context

Some context paragraph with **bold** and `inline_code`.
MD

cat > /tmp/ac.md <<'MD'
## Scenario: happy path

Given a valid input
When the user submits
Then the response is 200 OK
MD

# 2. Convert each MD file to ADF JSON
bun .agents/skills/acli/scripts/md-to-adf.ts /tmp/desc.md /tmp/desc.adf.json
bun .agents/skills/acli/scripts/md-to-adf.ts /tmp/ac.md   /tmp/ac.adf.json

# 3. Splice the ADF docs into the create-from-json payload
jq -n \
  --arg pk "{{PROJECT_KEY}}" \
  --slurpfile desc /tmp/desc.adf.json \
  --slurpfile ac   /tmp/ac.adf.json \
  '{
    projectKey: $pk,
    type: "Story",
    summary: "Example summary",
    description: $desc[0],
    labels: ["example"],
    additionalAttributes: {
      customfield_NNNNN: $ac[0]
    }
  }' > /tmp/story.json

# 4. Submit
acli jira workitem create --from-json /tmp/story.json --json
```

### Batch pattern (many work items, many rich fields)

Populating N work items with M rich-text fields each scales linearly, with negligible converter overhead:

1. Write one generator script (`generate.ts`) that holds the per-field Markdown content for every item as inline string literals.
2. The script imports `mdToAdf` and converts every field in-process, with no shell hop per conversion.
3. The script writes one `create --from-json` payload per item (`/tmp/item-N.json`).
4. A shell loop runs `acli jira workitem create --from-json /tmp/item-N.json --json` per file, capturing the new key from stdout.
5. Comments follow the same approach: write the comment Markdown inline, convert in-process, post with `acli jira workitem comment create -k <KEY> -F /tmp/comment-N.adf.json`.

This holds for dozens of items in one run. The bottleneck is authoring quality, not conversion.

### WORKAROUND: Editing rich-text custom fields on existing work items (REST PUT)

This is the only working path: `acli` has no channel for editing custom-field values on existing items. The recipe below is the turnkey workaround.

Prerequisites: two variables set in `.env` (or in the secret manager the varlock schema names). Nothing is exported into your shell. Each `curl` below runs inside the `.env` loader, `bunx varlock run --filter <names> -- sh -c '...'`, which hands the two values to that one child process and to nothing else:

- `ATLASSIAN_EMAIL`: the API-token owner's email
- `ATLASSIAN_API_TOKEN`: the API token paired with the email

The site host is not an env var. It lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url`, and the recipes below read it with `$(bun run --silent jira:url)`. A copy in `.env` goes stale, and one inherited from the parent shell silently shadows the file. Resolve the host in a recipe; do not reintroduce `ATLASSIAN_URL` as a shell variable.

Recipe:

```bash
# 1. Author the new value as Markdown
cat > /tmp/new.md <<'MD'
## New content
- with **bold**, `inline code`, and a [link](https://example.com)
MD

# 2. Convert MD → ADF
bun .agents/skills/acli/scripts/md-to-adf.ts /tmp/new.md /tmp/new.adf.json

# 3. Wrap the ADF doc in the REST `{ "fields": { ... } }` envelope
#    (NOTE: same ADF payload acli would consume; only the wrapper key changes)
jq -n --slurpfile adf /tmp/new.adf.json \
  '{fields: {customfield_NNNNN: $adf[0]}}' > /tmp/put.json

# 4. PUT against the issue, credentials loaded for this one process only
bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '
  curl -sS -w "\nHTTP %{http_code}\n" \
    -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
    -X PUT "$(bun run --silent jira:url)/rest/api/3/issue/{{PROJECT_KEY}}-123" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/put.json'
# Expected: HTTP 204 (Jira returns no body on a successful PUT)
```

Every other REST recipe in this skill (`references/gotchas.md`, `references/workitem.md`, `references/adf-authoring-style.md`) that names `$ATLASSIAN_EMAIL` or `$ATLASSIAN_API_TOKEN` runs the same way: wrap the command in `bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '...'` (double quotes inside), without `export` or `source .env` first.

Official Atlassian REST v3 PUT endpoint: <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put>

Three variants were tested against `acli workitem edit --from-json` on a real workitem, and none works:

| Payload shape sent to `acli edit` | Result |
|---|---|
| `{issues:[...], additionalAttributes:{customfield_X:<ADF>}}` | `✗ Error: json: unknown field "additionalAttributes"` · exit 1 |
| `{issues:[...], fields:{customfield_X:<ADF>}}` | `✗ Error: json: unknown field "fields"` · exit 1 |
| `{issues:[...], customfield_X:<ADF>}` | `✗ Error: json: unknown field "customfield_X"` · exit 1 |

The same ADF doc through REST PUT: HTTP 204 OK.

Batch variant: loop the recipe per `--data-binary @/tmp/put-N.json` and capture HTTP codes:

```bash
bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '
  host=$(bun run --silent jira:url)
  for KEY in {{PROJECT_KEY}}-1 {{PROJECT_KEY}}-2 {{PROJECT_KEY}}-3; do
    status=$(curl -sS -o /dev/null -w "%{http_code}" \
      -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
      -X PUT "$host/rest/api/3/issue/$KEY" \
      -H "Content-Type: application/json" \
      --data-binary @/tmp/put-"$KEY".json)
    echo "$KEY -> HTTP $status"
  done'
```

If Atlassian adds an `additionalAttributes`-style channel to `acli workitem edit`, retire this workaround and update the recipe table.

Identifier-heavy prose (snake_case, kebab-case) survives the conversion because the italic detection has word-boundary guards, and one workflow covers every rich-text surface the same way.

## Gotchas

These are tool-level and apply whatever the host repo. The full list with REST recipes is `references/gotchas.md`.

1. `--paginate` is opt-in. The default limit is server-side (30 to 50 depending on the command) and truncation gives no warning (see Compact Rules).
2. Custom fields on `workitem create` go through `additionalAttributes` in `--from-json`: numeric ids only (`customfield_NNNN`), no name-addressing. The value shapes the `create` template documents are `{"value": "..."}` (single-select), a bare number and a bare string. `workitem edit` rejects custom-field input outright (hard error, exit 1, empirically confirmed across all three shapes). The only working path for an existing item is REST `PUT /rest/api/3/issue/{KEY}` via `curl`; see the WORKAROUND subsection above, `references/gotchas.md` §4 and `references/workitem.md`.
3. `acli` cannot enumerate custom fields: `acli jira field` only does create, update, delete and cancel-delete. To discover field ids, run `workitem view --json | jq` against an item that has the field set, or call `GET /rest/api/3/field` directly. Host repos typically cache the catalog under `.agents/` and resolve fields by slug; see `<repo-core>/references/acli-integration.md`.
4. Transitions match by status name, not transition id. When two transitions lead to the same status with different validators, the CLI picks one and may fail. There is no `--transition-id` escape hatch, so fall back to REST if this hits.
5. An `unexpected error, trace id: XXXXXXXX` line is all a backend failure gives you. Capture and log the trace id every time.
6. `workitem link create` flag names are misleading. `acli jira workitem link create --out X --in Y --type Dependencies` produces "Y depends on X", not "X depends on Y". Y becomes the outward party (the one that performs the outward verb: "depends on", "blocks", "causes") and X the inward party. This was confirmed against Dependencies, and the same inversion applies to every outward-asymmetric link type (Blocks, Blocking, Causes, Duplicate, Cloners, Defect, Test, Test Automation, Test Design, Test Execute). Symmetric types (Relates) are immune, since direction is lost either way. Rule of thumb: `--out` takes the PREREQUISITE (the inward partner in Jira's UI) and `--in` takes the DEPENDENT (the outward partner in Jira's UI). After every link create, run `acli jira workitem link list --key <expected-dependent> --json` and confirm the response shows `outwardIssueKey: <expected-prerequisite>`. If the direction is wrong, delete the link first and recreate it with swapped flags: Jira dedupes a link between the same pair and type regardless of direction, so adding the corrected link on top of the wrong one is a silent no-op. The per-type mapping table is in `references/workitem.md`.
7. The vendor's `--help` examples are sometimes stale, and they fail exactly as a typo would. `acli jira workitem comment create --help` prints its examples without the `create` subcommand (`acli jira workitem comment --key "KEY-1" --body "..."`), which exits non-zero with `unknown flag: --key`, because the flags live on `create`. An agent copying the example loses a round trip and may conclude the command does not exist. Trust the forms in `references/workitem.md`. Two fields also document narrower behaviour than they have: `parentIssueId` describes itself as sub-task-only and parents to an Epic fine.

## Top-level utilities

These sit outside any product and need no separate reference file.

### `acli completion`: shell autocompletion

```bash
acli completion bash       > /etc/bash_completion.d/acli
acli completion zsh        > "${fpath[1]}/_acli"
acli completion fish       > ~/.config/fish/completions/acli.fish
acli completion powershell > acli.ps1
```

Each subcommand prints a shell script to stdout; pipe it to the location your shell expects (above are the conventional paths).

### `acli feedback`: report a problem to Atlassian

```bash
acli feedback \
  --summary "JSON shape on edit --generate-json is misleading" \
  --details "The template doesn't include additionalAttributes for custom fields..." \
  --email "you@example.com" \
  --time "1h" \
  --attachments error.log,trace.txt
```

Flags: `-s, --summary` (required-ish), `-d, --details` (required-ish), `-e, --email`, `-t, --time` (estimated timeframe like `1h`, `15m`), `-a, --attachments` (multiple files).

### `acli auth`: global OAuth (newer surface)

A top-level OAuth login that authenticates across products in one step, distinct from per-product `jira auth`, `admin auth` and `confluence auth`. Use the per-product login for token-based CI and the global one for interactive multi-product browsing.

```bash
acli auth login           # interactive OAuth
acli auth status
acli auth switch
acli auth logout
```

The full auth model is in `references/auth.md`.

### `acli config gov-cloud`: Atlassian Government Cloud

```bash
acli config gov-cloud --enable
acli config gov-cloud --status
```

Only relevant when the org is on Atlassian Government Cloud.

## Navigation: which reference to load

Load the reference that matches the current need, and only that one.

| If the user wants to…                                                | Load                                        |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Log in, switch sites, handle tokens, authenticate in CI              | `references/auth.md`                        |
| Work with Jira tickets (create, edit, transition, search, bulk, comments, links, watchers, custom-field shapes) | `references/workitem.md`  |
| Manage projects, boards, sprints, filters, dashboards, custom-field definitions | `references/project-board-sprint.md` |
| Work with Confluence spaces, blogs, pages                            | `references/confluence.md`                  |
| Run org-level admin tasks (API key, user lifecycle)                  | `references/admin.md`                       |
| Pipe output, produce JSON/CSV, dry-run, run on CI/CD                 | `references/output-and-automation.md`       |
| Diagnose surprising behavior, known bugs, REST fallback points       | `references/gotchas.md`                     |
| Publish rich text to descriptions, comments, or custom fields        | Inline section "Publishing rich text" + `scripts/md-to-adf.ts` |
| Make Jira field content visually excellent (when to use tables / panels / nested lists for readability) | `references/adf-authoring-style.md` |
| Plug `acli` into the host repo's workflow (TMS modality, slug catalog, project conventions, anti-patterns specific to this repo) | `<repo-core>/references/acli-integration.md` |

## Working style

- Author every rich-text field in Markdown and convert it with `scripts/md-to-adf.ts`. `acli` does not convert Markdown, so a raw Markdown string in `--description`, `--body` or a custom-field value is stored literally.
- `--web` and OAuth are for humans at a terminal; scripts use API-token auth.
- Scaffold complex payloads with `--generate-json` (create, edit, project create, project update, link create, create-bulk). Pipe it to a file, edit it, submit with `--from-json`. `--generate-json` is static: it does not introspect the actual project schema, so custom-field shapes may need a look at a real item.
- When unsure of a flag, run `acli <path> --help`. It is authoritative and tied to the installed binary. The convention is kebab-case for every multi-word flag (`--from-json`, `--searcher-key`, `--filter-id`, `--order-by`); camelCase variants fail.

### What `acli` cannot do

Each of these needs REST or MCP (confirm against the installed binary with `acli <path> --help`):

- enumerate custom fields (`field` has no `list`);
- edit custom-field values on existing work items (`workitem edit` does not document custom-field input);
- manage workflows, workflow schemes, statuses or transition definitions;
- manage issue types, priorities, resolutions, project versions or project components;
- add a work item to a sprint (Atlassian tracks it as `JRACLOUD-97107`);
- upload attachments or add watchers;
- retrieve the cached auth token for reuse in another tool;
- Bitbucket operations (out of scope entirely);
- Confluence page CRUD beyond `page view` (space and blog have a fuller CRUD surface; see `references/confluence.md`).

`references/gotchas.md` has the full list with REST recipes.

## With nobody at the keyboard

Where this skill stops for a person: the over-budget proposal in "Size budget", the tier-T4 composable-skill question, and an `acli` auth that cannot be fixed (which switches to the MCP or REST path).

| Case | What happens |
|---|---|
| A person is present | Unchanged: they decide which sections move, answer the tier-T4 question, and fix the login. |
| A supervised worker | The conductor or launcher holds the decision and answers through the dispatch channel. |
| A routine with nobody | The delegating brief is the approval source when it names the decision. Without one, do the reversible work (author, convert, measure, read back), make no Jira write that depends on the open decision, and report the proposal with its sizes. An unfixable auth is reported with the exact variable name; the link direction check is automatic, so a backwards link is deleted and recreated. |

`agentic-qa-core/references/decision-protocol.md` says which decisions reach a person at all.

## Installation (reference only)

Users usually already have `acli` installed. If not, point them at:

- Official guide: https://developer.atlassian.com/cloud/acli/guides/install-acli/
- macOS: `brew tap atlassian/homebrew-acli && brew install acli`
- Linux (Debian/Ubuntu): `apt install acli` (after adding the Atlassian apt repo)
- Linux (RHEL/Fedora): `yum install acli` (after adding the Atlassian yum repo)
- Windows: PowerShell `curl` install (no Chocolatey/MSI yet)
- CI one-liner (Linux): `curl -LO "https://acli.atlassian.com/linux/1.3.18/acli_linux_amd64/acli" && chmod +x acli`

Pin to a version URL in production pipelines, since `latest/` has caused same-day mass failures. Each release has a support window; check the vendor policy. `acli --version` shows the installed version.
