# Work items (`acli jira workitem`)

This is the largest surface in `acli`. Every Jira ticket operation routes through `jira workitem`. Actions covered: `create`, `create-bulk`, `view`, `search`, `edit`, `transition`, `assign`, `clone`, `archive`, `unarchive`, `delete`, `comment`, `link`, `attachment`, `watcher`.

> Note on terminology: Atlassian renamed `issue` → `workitem` across CLI and UI throughout 2025. The JSON payload shape still uses the old spelling — the response from `workitem search --json` has a top-level `issues[]` array, and `create-bulk` CSV columns are `summary, projectKey, issueType, description, label, parentIssueId, assignee`. The rename is surface-level only.

## Table of contents

1. [The three-selector pattern](#the-three-selector-pattern)
2. [create / create-bulk](#create)
3. [view](#view)
4. [search](#search)
5. [edit](#edit)
6. [transition](#transition)
7. [assign](#assign)
8. [clone](#clone)
9. [archive / unarchive / delete](#archive)
10. [comment (create / delete / list / update / visibility)](#comment)
11. [link (create / delete / list / type)](#link)
12. [attachment](#attachment)
13. [watcher (list / remove)](#watcher)
14. [Custom fields](#custom-fields)

## <a id="the-three-selector-pattern"></a>The three-selector pattern

Every mutating command on `workitem` (except `create`, `view`) accepts **exactly one** of:

| Flag              | Form                 | Example                                                                     |
| ----------------- | -------------------- | --------------------------------------------------------------------------- |
| `-k, --key`       | Comma-separated keys | `--key "{{PROJECT_KEY}}-123,{{PROJECT_KEY}}-124"`                                           |
| `--jql`           | JQL query string     | `--jql "project = {{PROJECT_KEY}} AND status = 'Ready For Dev'"`                    |
| `--filter`        | Saved filter ID      | `--filter 10001`                                                            |
| `-f, --from-file` | File listing keys    | `--from-file keys.txt` (some commands)                                      |

JQL and filter selectors can target many items at once — the command becomes a batch. Always pair with `-y, --yes` (skip confirmation) and usually `--ignore-errors` (do not abort the batch on a single failure).

## <a id="create"></a>create

Three input modes:

```bash
# 1. Direct flags — simplest case
acli jira workitem create \
  --project "{{PROJECT_KEY}}" \
  --type "Story" \
  --summary "Add empty-states to the dashboard" \
  --assignee "@me" \
  --label "frontend,empty-states"

# Create a Bug linked to a parent Story
acli jira workitem create \
  --project "{{PROJECT_KEY}}" \
  --type "Bug" \
  --summary "Login button does nothing on Safari 17" \
  --assignee "@me" \
  --label "ui,bug" \
  --parent "{{PROJECT_KEY}}-123"

# 2. Summary/description from a file (longer bug repro)
acli jira workitem create \
  --project "{{PROJECT_KEY}}" \
  --type "Bug" \
  --from-file "bug-repro.md" \
  --assignee "user@example.com"

# 3. Full JSON payload — needed for custom fields and rich ADF
acli jira workitem create --generate-json > workitem.json   # scaffold
$EDITOR workitem.json                                        # edit
acli jira workitem create --from-json workitem.json          # submit
```

Useful flags:

| Flag                 | Meaning                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `-p, --project`      | Project key (e.g. `{{PROJECT_KEY}}`)                                       |
| `-t, --type`         | Work item type name (`Epic`, `Story`, `Task`, `Bug`)               |
| `-s, --summary`      | One-line title                                                     |
| `-d, --description`  | Plain text or ADF. Markdown is **not** interpreted.                |
| `--description-file` | Description from a file                                            |
| `-a, --assignee`     | Email, account ID, `@me` (self), or `default` (project's default)  |
| `-l, --label`        | Comma-separated labels                                             |
| `--parent`           | Parent work item key (for subtasks, epic children, bug→story link) |
| `-e, --editor`       | Open `$EDITOR` to write summary + description                      |
| `--json`             | Emit result as JSON                                                |

**Publishing rich text in `description` or custom-field values**: pass an ADF JSON document, not Markdown. `acli` does not interpret Markdown. Use `scripts/md-to-adf.ts` (bundled with this skill) to produce the ADF document, then inject it into the `--from-json` payload. See the "Publishing rich text" section in `SKILL.md` for the full recipe and a worked example.

### create-bulk

For many items at once, use JSON or CSV input:

```bash
# CSV path — fastest for spreadsheet-style input
acli jira workitem create-bulk --from-csv stories.csv --yes
```

Required CSV columns (literal names, comma-separated header row):

```
summary,projectKey,issueType,description,label,parentIssueId,assignee
Add empty-states to dashboard,{{PROJECT_KEY}},Story,FE story for empty states,frontend,{{PROJECT_KEY}}-100,you@example.com
Fix login button on Safari,{{PROJECT_KEY}},Bug,Reported by QA,ui,{{PROJECT_KEY}}-123,auto
```

Or scaffold a JSON template:

```bash
acli jira workitem create-bulk --generate-json > bulk.json
$EDITOR bulk.json
acli jira workitem create-bulk --from-json bulk.json --yes
```

`--yes` is **mandatory** in non-interactive contexts — without it, `create-bulk` hangs waiting for stdin confirmation.

## <a id="view"></a>view

```bash
# Default fields — quick peek at a story
acli jira workitem view {{PROJECT_KEY}}-123

# Select fields
acli jira workitem view {{PROJECT_KEY}}-123 --fields "summary,status,assignee,description,parent"

# JSON for scripting — feed a downstream generator
acli jira workitem view {{PROJECT_KEY}}-123 --json | jq '.fields | {
  summary,
  status: .status.name,
  assignee: .assignee.emailAddress,
  acceptance_criteria: .customfield_NNNNN,
  scope: .customfield_NNNNN,
  mockup: .customfield_NNNNN
}'

# Open in browser
acli jira workitem view {{PROJECT_KEY}}-123 --web
```

The `--fields` selector supports meta-tokens documented by the CLI:

| Token        | Meaning              |
| ------------ | -------------------- |
| `*all`       | All fields           |
| `*navigable` | All navigable fields |
| `fieldName`  | Include named field  |
| `-fieldName` | Exclude named field  |

Example: `--fields "*navigable,-comment"` — everything navigable except the comment list.

Default view fields: `key,issuetype,summary,status,assignee,description`.

> The `customfield_NNNNN` IDs above are placeholders. Real IDs are workspace-specific and have no name-addressing in `acli` — see the "Custom fields" section below for the discovery recipe.

## <a id="search"></a>search

```bash
# JQL search — what's ready for someone to pick up
acli jira workitem search --jql "project = {{PROJECT_KEY}} AND status = 'Ready For Dev' AND assignee = currentUser()"

# Saved filter (sprint dashboard, etc.)
acli jira workitem search --filter 10001

# Count only — sprint scorecards
acli jira workitem search --jql "project = {{PROJECT_KEY}} AND sprint in openSprints() AND status = 'In Progress'" --count

# Full result set — always pass --paginate when iterating
acli jira workitem search --jql "project = {{PROJECT_KEY}} AND sprint in openSprints()" --paginate --json

# CSV for spreadsheets
acli jira workitem search --jql "project = {{PROJECT_KEY}} AND sprint in openSprints()" --fields "key,summary,assignee,status" --csv > sprint.csv

# Open search in browser
acli jira workitem search --jql "project = {{PROJECT_KEY}} AND assignee = currentUser()" --web
```

Flags:

| Flag               | Meaning                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `-j, --jql`        | JQL query (mutually exclusive with `--filter`)                                        |
| `--filter`         | Saved filter ID                                                                       |
| `--count`          | Return row count only                                                                 |
| `-f, --fields`     | Comma-separated field list (default `issuetype,key,assignee,priority,status,summary`) |
| `--json` / `--csv` | Output format                                                                         |
| `-l, --limit`      | Max rows (default ~50, server-capped; truncates silently)                             |
| `--paginate`       | Fetch all pages. Ignores `--limit`. **Use this in any automation script.**            |
| `-w, --web`        | Open the search in the browser                                                        |

**Silent truncation** is the top pitfall here. Without `--paginate`, `search` stops at the server page size (~30-50) with no warning. If your logic relies on "all matching items", always pass `--paginate`.

## <a id="edit"></a>edit

```bash
# Simple flag-based edit — fix a typo in the summary
acli jira workitem edit --key "{{PROJECT_KEY}}-123" --summary "Updated story title" --yes

# Re-assign a batch of stories with JQL
acli jira workitem edit --jql "project = {{PROJECT_KEY}} AND assignee = formerdev@example.com" \
  --assignee "newdev@example.com" --yes --ignore-errors

# Remove labels / assignee (cannot be done by passing empty values)
acli jira workitem edit --key "{{PROJECT_KEY}}-123" --remove-labels "stale,deprecated"
acli jira workitem edit --key "{{PROJECT_KEY}}-123" --remove-assignee
```

Editable flags via `acli jira workitem edit`: `--summary`, `--description`, `--description-file`, `--assignee`, `--labels`, `--type`.
Removal flags: `--remove-assignee`, `--remove-labels`.

**Critical limitation — `workitem edit` hard-rejects custom fields.** `acli jira workitem edit --from-json` validates the payload against a strict whitelist of built-in keys (`summary`, `description`, `assignee`, `labels`, `type`, `issues`, `labelsToAdd`, `labelsToRemove`). Every custom-field shape — `additionalAttributes.customfield_X`, `fields.customfield_X`, or `customfield_X` at the root — raises `✗ Error: json: unknown field …` and exits 1. Confirmed empirically against a live workitem; no silent drop, no escape hatch.

**The only working path** is REST `PUT /rest/api/3/issue/{KEY}` with `{"fields": {customfield_NNNNN: <value-or-ADF>}}` — see the dedicated `SKILL.md` "WORKAROUND" subsection for the turnkey curl recipe and `references/gotchas.md` §4 for the wire-level detail. Both use the session env vars `$ATLASSIAN_URL`, `$ATLASSIAN_EMAIL`, `$ATLASSIAN_API_TOKEN` exported from the shell.

## <a id="transition"></a>transition

```bash
# Transition by key
acli jira workitem transition --key "{{PROJECT_KEY}}-123" --status "In Progress"

# Common forward-flow transitions
acli jira workitem transition --key "{{PROJECT_KEY}}-123" --status "In Review"
acli jira workitem transition --key "{{PROJECT_KEY}}-123" --status "Ready For QA"

# Batch via JQL — close out everything that shipped last release
acli jira workitem transition --jql "project = {{PROJECT_KEY}} AND fixVersion = '2026.05'" \
  --status "Done" --yes --ignore-errors

# Via saved filter
acli jira workitem transition --filter 10001 --status "Ready For Dev" --yes
```

`--status` is a **status name**, not a transition ID. The target must be reachable from the current status through the project's workflow.

Two known limitations:

- **No `--transition-id`.** If two transitions lead to the same status with different validators (e.g. both "Resolve" and "Cancel" end in "Closed"), `acli` may pick the wrong one and fail.
- **Loop transitions** (actions that keep the status the same) are supported — just pass the same status name.

Fallback when the CLI cannot disambiguate: call `POST /rest/api/3/issue/{key}/transitions` directly with an explicit transition ID. See `references/gotchas.md` §9 for the wire-level pattern.

## <a id="assign"></a>assign

```bash
# Self-assign
acli jira workitem assign --key "{{PROJECT_KEY}}-123" --assignee "@me"

# Batch reassign via JQL — handover when someone leaves the team
acli jira workitem assign --jql "project = {{PROJECT_KEY}} AND assignee = formerdev@example.com" \
  --assignee "newdev@example.com" --yes

# Reset to the project default
acli jira workitem assign --key "{{PROJECT_KEY}}-123" --assignee "default"

# Unassign — putting it back in the pool
acli jira workitem assign --key "{{PROJECT_KEY}}-123" --remove-assignee
```

Assignee values: email, Atlassian account ID, `@me`, or `default`.

## <a id="clone"></a>clone

`clone` accepts the full selector set (`--key`, `--jql`, `--filter`, `--from-file`) — useful for cloning stories from a template project, or duplicating a recurring chore.

```bash
# Clone within the same project (single or many)
acli jira workitem clone --key "{{PROJECT_KEY}}-100,{{PROJECT_KEY}}-101" --to-project "{{PROJECT_KEY}}"

# Clone into another project on the same site
acli jira workitem clone --key "TEMPLATE-1" --to-project "{{PROJECT_KEY}}"

# Clone every backlog item into another project
acli jira workitem clone --jql "project = TEMPLATE AND status = 'Backlog'" \
  --to-project "{{PROJECT_KEY}}" --yes --ignore-errors

# Clone a saved-filter result set
acli jira workitem clone --filter 10001 --to-project "{{PROJECT_KEY}}" --yes

# Clone to a project on another site (cross-site)
acli jira workitem clone --key "{{PROJECT_KEY}}-1" --to-project "{{PROJECT_KEY}}" --to-site "othersite.atlassian.net"
```

The clone copies summary, description, labels, and most routine fields. Attachments and comment history are **not** cloned. Parent/epic links may or may not carry depending on project settings.

## <a id="archive"></a>archive / unarchive / delete

```bash
# Archive — reversible
acli jira workitem archive --key "{{PROJECT_KEY}}-100,{{PROJECT_KEY}}-101" --yes
acli jira workitem archive --jql "project = {{PROJECT_KEY}} AND resolved < -180d" --yes --ignore-errors

# Unarchive — only --key and --from-file selectors are supported
acli jira workitem unarchive --key "{{PROJECT_KEY}}-100,{{PROJECT_KEY}}-101" --yes

# Delete — destructive, use with care (only for items created by mistake)
acli jira workitem delete --key "{{PROJECT_KEY}}-999" --yes
```

Archived items no longer appear in normal search results and cannot be edited, but the key remains stable and can be restored.

## <a id="comment"></a>comment

### create

```bash
# Plain text — renders as a single ADF paragraph, no markdown
acli jira workitem comment create --key "{{PROJECT_KEY}}-123" --body "PR opened: https://github.com/org/repo/pull/456"

# Comment body from a file (longer notes)
acli jira workitem comment create --key "{{PROJECT_KEY}}-123" --body-file notes.md

# Batch the same comment across many items
acli jira workitem comment create --jql "labels = needs-review" \
  --body "Please review by Friday." --ignore-errors

# Edit the author's last comment instead of adding a new one
acli jira workitem comment create --key "{{PROJECT_KEY}}-123" --body "Updated message" --edit-last

# Open $EDITOR for the body
acli jira workitem comment create --key "{{PROJECT_KEY}}-123" --editor
```

`comment create` accepts ADF via `-F, --body-file`. The flag's `--help` text reads "Plain text file with text or Atlassian Document Format (ADF)"; when the file begins with `{`, `acli` forwards the content as ADF. The legacy two-step workaround (create placeholder body → `comment update --body-adf`) is no longer required as of `acli` v1.3.18+. To author rich comments:

```bash
bun .claude/skills/acli/scripts/md-to-adf.ts notes.md notes.adf.json
acli jira workitem comment create --key {{PROJECT_KEY}}-123 -F notes.adf.json
```

The plain `-b, --body` flag is plain text only — Markdown syntax in `--body` is stored literally as a single ADF paragraph. For any rich content, use `-F` with an ADF file produced by the bundled converter. See "Publishing rich text" in `SKILL.md` for the full workflow.

### list

```bash
acli jira workitem comment list --key "{{PROJECT_KEY}}-123" --json
acli jira workitem comment list --key "{{PROJECT_KEY}}-123" --order "+created"
acli jira workitem comment list --key "{{PROJECT_KEY}}-123" --paginate
```

### delete

```bash
# First find the comment ID via `comment list --json`
CID=$(acli jira workitem comment list --key "{{PROJECT_KEY}}-123" --json | jq -r '.[] | select(.body | contains("typo")) | .id')

# Then delete by ID
acli jira workitem comment delete --key "{{PROJECT_KEY}}-123" --id "$CID"
```

Flags: `--key` (target work item), `--id` (comment ID). No batch selectors — operates on one comment at a time.

### update

```bash
acli jira workitem comment update --key "{{PROJECT_KEY}}-123" --id 10001 --body "Updated text"
acli jira workitem comment update --key "{{PROJECT_KEY}}-123" --id 10001 --body-adf rich.json
acli jira workitem comment update --key "{{PROJECT_KEY}}-123" --id 10001 --body "Internal note" \
  --visibility-role "Administrators" --notify
```

### visibility

Discover available visibility options before setting them:

```bash
# Project roles (requires --project)
acli jira workitem comment visibility --role --project {{PROJECT_KEY}}

# Atlassian groups
acli jira workitem comment visibility --group
```

## <a id="link"></a>link

### Directionality — EMPIRICAL FLAG INVERSION (read this before any `link create`)

The flag names `--out` and `--in` suggest "outward" and "inward" as defined by Jira's link-type catalog (outward description = "depends on" / "blocks" / "causes"; inward description = "is dependency for" / "is blocked by" / "is caused by"). **Empirically, acli swaps them.** Running:

```bash
acli jira workitem link create --out X --in Y --type Dependencies
```

produces "**Y** depends on **X**" — i.e. **Y becomes the outward party**, **X becomes the inward party**, the opposite of what the flag names suggest. The same inversion applies to every outward-asymmetric link type.

**Reverse-mapping rule of thumb**:

- `--out` takes the **prerequisite** (the issue that satisfies someone else's dependency / is blocked / causes / is duplicated)
- `--in` takes the **dependent** (the issue that depends on / blocks / is caused by / duplicates)

#### Per-link-type quick reference

| Type            | Outward desc.        | Inward desc.            | `--out` takes                | `--in` takes                |
| --------------- | -------------------- | ----------------------- | ---------------------------- | --------------------------- |
| `Dependencies`  | depends on           | is dependency for       | prerequisite                 | dependent                   |
| `Blocks` / `Blocking` | blocks         | is blocked by           | the work being blocked       | the blocker                 |
| `Causes` (Problem/Incident) | causes  | is caused by            | the caused issue             | the root cause              |
| `Cloners`       | clones               | is cloned by            | the original                 | the clone                   |
| `Duplicate`     | duplicates           | is duplicated by        | the canonical issue          | the duplicate               |
| `Defect`        | created              | created by              | the originating work         | the defect                  |
| `Test`          | tests                | is tested by            | the story / requirement      | the test                    |
| `Test Automation` | automation test for | is automated by         | the manual test              | the automation              |
| `Test Design`   | designs              | is designed by          | the test                     | the design                  |
| `Test Execute`  | executes             | is executed by          | the test                     | the execution               |
| `Relates`       | relates to           | relates to              | either                       | either (symmetric)          |

> Symmetric types (`Relates`) are immune to the inversion — direction is lost regardless of argument order. All outward-asymmetric types are affected.

#### Mandatory post-create verification

Every `link create` call MUST be followed by a direction check:

```bash
# Confirm direction for "DEPENDENT depends on PREREQUISITE"
acli jira workitem link list --key DEPENDENT --json | jq '.[] | select(.id == "<linkId>")'
# Expected: outwardIssueKey == PREREQUISITE
# Wrong direction? -> acli link delete --id <linkId> --yes && retry with swapped --out/--in
```

The `outwardIssueKey` field in the JSON response names the outward partner from the DEPENDENT's perspective. If it matches the intended prerequisite, the link is correct; otherwise the link is inverted and must be deleted + recreated.

### create

Apply the reverse-mapping rule from the section above: `--out` takes the inward partner (the prerequisite, blocker, canonical, etc.), `--in` takes the outward partner (the dependent, blocked work, duplicate, etc.). Then verify direction immediately after.

```bash
# Intent: "{{PROJECT_KEY}}-123 BLOCKS {{PROJECT_KEY}}-124"
#   123 = blocker (outward partner in Jira UI)
#   124 = blocked work (inward partner in Jira UI)
#   Per inversion: --out takes the inward = 124, --in takes the outward = 123
acli jira workitem link create --out {{PROJECT_KEY}}-124 --in {{PROJECT_KEY}}-123 --type "Blocks" --yes

# Verify direction (mandatory)
acli jira workitem link list --key {{PROJECT_KEY}}-123 --json
# Expected: outwardIssueKey == {{PROJECT_KEY}}-124 (123 is the outward party, looking outward "blocks" → 124)

# Intent: "{{PROJECT_KEY}}-456 RELATES TO {{PROJECT_KEY}}-123" — symmetric, immune to inversion
acli jira workitem link create --out {{PROJECT_KEY}}-456 --in {{PROJECT_KEY}}-123 --type "Relates" --yes

# Batch via JSON — the same inversion applies to outwardIssue / inwardIssue keys in the payload
acli jira workitem link create --generate-json > links.json
$EDITOR links.json
acli jira workitem link create --from-json links.json --yes

# Batch via CSV — 3 columns, header row ignored
#   outwardId,inwardId,linkType
# CSV column names carry the inversion too: outwardId column = inward partner; inwardId column = outward partner.
acli jira workitem link create --from-csv links.csv --yes
```

### list / type

```bash
# All links on a story
acli jira workitem link list --key "{{PROJECT_KEY}}-123" --json

# Available link types on the site (use these as --type values)
acli jira workitem link type --json
```

### delete

```bash
# Single link by ID (find IDs via `link list --json`)
acli jira workitem link delete --id 10042

# Batch via JSON
acli jira workitem link delete --from-json links-to-remove.json --yes --ignore-errors

# Batch via CSV (one ID per row)
acli jira workitem link delete --from-csv link-ids.csv --yes
```

Flags: `--id`, `--from-csv`, `--from-json`, `--ignore-errors`, `--yes`. No work-item selector — operates on link IDs directly.

### Linking an external URL via remote link

`acli` does not expose remote-link (web link) creation. To attach a URL (e.g. a GitHub PR) to a story, fall back to REST:

```bash
SITE="${ATLASSIAN_URL#https://}"
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST "https://${SITE}/rest/api/3/issue/{{PROJECT_KEY}}-123/remotelink" \
  -H "Content-Type: application/json" \
  -d '{
    "object": {
      "url": "https://github.com/org/repo/pull/456",
      "title": "PR #456: Add empty-states to the dashboard",
      "icon": { "url16x16": "https://github.githubassets.com/favicons/favicon.png" }
    }
  }'
```

If a GitHub-for-Jira integration is installed on the org, mentioning the story key (e.g. `{{PROJECT_KEY}}-123`) in the PR title or body is enough — the integration auto-links. The REST recipe above is the manual fallback.

## <a id="attachment"></a>attachment

```bash
acli jira workitem attachment list --key "{{PROJECT_KEY}}-123" --json
acli jira workitem attachment delete --key "{{PROJECT_KEY}}-123" --id 12345
```

Upload is not yet covered by the CLI — use REST (`POST /rest/api/3/issue/{key}/attachments`).

## <a id="watcher"></a>watcher

### list

```bash
# All watchers on a work item
acli jira workitem watcher list --key "{{PROJECT_KEY}}-123" --json
```

Returns the watch count and the list of watcher accounts (each with `accountId`, `displayName`, `emailAddress` — the same shape Jira REST returns).

### remove

```bash
acli jira workitem watcher remove --key "{{PROJECT_KEY}}-123" --user 5b10ac8d82e05b22cc7d4ef5
```

`--user` takes an Atlassian account ID (not email). To get an account ID, run `watcher list --json` first (or look it up via `GET /rest/api/3/user/search?query=email`).

**Adding watchers is not exposed by `acli`** — REST fallback: `POST /rest/api/3/issue/{key}/watchers` with the account ID as a quoted JSON string in the body.

## <a id="custom-fields"></a>Custom fields

This is one of the rougher edges in `acli`. Read this section carefully — the CLI exposes first-class flags only for built-in fields (`summary`, `description`, `assignee`, `labels`, `priority`, `parent`, `type`). Everything else — story points, acceptance criteria, business rules, scope, mockup, workflow — must go through `--from-json` on `create`. **Editing custom-field values on existing items has no documented `acli` path** and requires REST/MCP.

### What `acli` documents officially

`acli jira workitem create --generate-json` is the only place in the CLI that documents how to express custom fields. The output template uses a top-level wrapper called `additionalAttributes`:

```json
{
  "summary": "Summary/Title of work item",
  "type": "Work item type, case sensitive, e.g. 'Story'",
  "projectKey": "Project key to associate the work item with, e.g. '{{PROJECT_KEY}}'",
  "assignee": "Assignee email or ID (optional)",
  "labels": ["feature", "optional"],
  "additionalAttributes": {
    "customfield_NNNN": { "value": "Custom field value" },
    "customfield_NNNN": 50,
    "customfield_NNNN": "string value"
  }
}
```

Three things to internalize:

1. **Wrapper key**: `additionalAttributes` (NOT `fields`, NOT flat at the root).
2. **Field address**: numeric `customfield_NNNNN` ID only. **Name-addressing (`"Story Points"`) is not supported.**
3. **Documented value shapes** (only three are illustrated by the template):
   - **Single-select / option**: `{"value": "..."}`
   - **Number**: bare numeric literal (e.g. `50`)
   - **String / text**: bare string

### What `acli` does NOT document — inferred from the Jira REST contract

`acli` forwards `additionalAttributes` straight to the Jira REST `/rest/api/3/issue` endpoint, so the Jira REST shape applies for everything beyond the three documented types. The shapes below are inferred from REST and from `workitem view --json` output — validate by trial:

| Field type       | Likely input shape inside `additionalAttributes`                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-select     | `[{"value": "A"}, {"value": "B"}]`                                                                                                      |
| Date (date-only) | `"2026-01-18"` (YYYY-MM-DD)                                                                                                             |
| Datetime         | `"2026-01-18T19:28:09.762-0300"` (ISO-8601 with offset)                                                                                 |
| URL              | bare string (`"https://example.com"`)                                                                                                   |
| Epic Link        | bare string (issue key, e.g. `"{{PROJECT_KEY}}-100"`)                                                                                           |
| User picker      | `{"accountId": "5b10ac8d82e05b22cc7d4ef5"}`                                                                                             |
| Cascading select | `{"value": "Parent", "child": {"value": "Child"}}`                                                                                      |
| Rich text (ADF)  | full ADF doc tree (same shape as `description`). Produce the tree from Markdown via `scripts/md-to-adf.ts`, then nest the result inside `additionalAttributes` for `create`, or inside `{"fields": {...}}` for a REST `PUT` on an existing item. See "Publishing rich text" in `SKILL.md`. |
| Sprint           | array of sprint IDs `[5]` — but **`JRACLOUD-97107` makes this fail in practice**, see [Sprint field cannot be set](./gotchas.md#sprint) |

If a shape isn't listed here, the safest source of truth is `acli jira workitem view <KEY-WITH-FIELD-SET> --fields "*all" --json` — the read shape is usually identical to the write shape for that field type.

### Critical limitation: `workitem edit` does not document custom-field input

Running `acli jira workitem edit --generate-json` produces:

```json
{
  "summary": "...",
  "type": "...",
  "assignee": "...",
  "description": {
    /* ADF */
  },
  "issues": ["KEY-1", "KEY-2"],
  "labelsToAdd": ["feature"],
  "labelsToRemove": ["feature"]
}
```

**No `additionalAttributes` block.** The flag list on `edit --help` confirms: only built-in fields are supported (`--summary`, `--description`, `--description-file`, `--assignee`, `--labels`, `--type`, `--remove-assignee`, `--remove-labels`).

For editing a custom-field value on an existing work item (e.g. updating Story Points after estimation, polishing ACs after a 3-amigos), fall back to REST:

```bash
SITE="${ATLASSIAN_URL#https://}"
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X PUT "https://${SITE}/rest/api/3/issue/{{PROJECT_KEY}}-123" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"customfield_NNNNN": 8}}'
```

Note the REST shape uses `{"fields": {...}}`, not `additionalAttributes`.

### Critical limitation: bulk operations do not document custom-field input

`acli jira workitem create-bulk --generate-json` and the CSV column list (`summary, projectKey, issueType, description, label, parentIssueId, assignee`) both omit any way to set custom fields. If you need bulk creation with custom fields (e.g. seeding a backlog with ACs already attached), the workaround is single-create-in-a-loop or REST batch.

### Finding a custom field ID

`acli` cannot enumerate custom fields (`field` group only does create/update/delete/cancel-delete). To discover IDs:

```bash
SITE="${ATLASSIAN_URL#https://}"

# From an existing item that has the field set
acli jira workitem view {{PROJECT_KEY}}-123 --json | jq '.fields | keys[] | select(startswith("customfield_"))'

# From the field admin UI — the ID is in the URL when editing the field
# https://${SITE}/secure/admin/EditCustomField!default.jspa?id=NNNNN

# From REST — the only way to enumerate ALL fields on the site
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://${SITE}/rest/api/3/field" | jq '.[] | {id, name, custom, schema}'
```

> Repo integration: host repos typically cache the field catalog under `.agents/` and reference fields by stable slug rather than numeric ID. See the host repo's `<repo-core>/references/acli-integration.md` for the slug catalog and refresh script.

### Putting it together — full `create` example with custom fields

```bash
# 1. Scaffold
acli jira workitem create --generate-json > new-story.json

# 2. Edit to include custom fields (IDs come from your workspace — see "Finding a custom field ID" above)
cat > new-story.json <<'JSON'
{
  "summary": "Add empty-states to the dashboard",
  "type": "Story",
  "projectKey": "{{PROJECT_KEY}}",
  "assignee": "you@example.com",
  "labels": ["frontend", "empty-states"],
  "additionalAttributes": {
    "customfield_NNNN": 5,
    "customfield_NNNNN": "Given a user with no items\nWhen they open the dashboard\nThen they see the empty-state illustration"
  }
}
JSON

# 3. Submit
acli jira workitem create --from-json new-story.json
```

_(IDs like `customfield_NNNN` and `customfield_NNNNN` are placeholders — substitute your workspace's real IDs.)_
