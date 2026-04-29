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

## The three-selector pattern

Every mutating command on `workitem` (except `create`, `view`) accepts **exactly one** of:

| Flag               | Form                         | Example                                   |
| ------------------ | ---------------------------- | ----------------------------------------- |
| `-k, --key`        | Comma-separated keys         | `--key "TEAM-1,TEAM-2,TEAM-3"`            |
| `--jql`            | JQL query string             | `--jql "project = TEAM AND status = '{{jira.status.story.backlog}}'"` |
| `--filter`         | Saved filter ID              | `--filter 10001`                          |
| `-f, --from-file`  | File listing keys            | `--from-file keys.txt` (some commands)    |

JQL and filter selectors can target many items at once — the command becomes a batch. Always pair with `-y, --yes` (skip confirmation) and usually `--ignore-errors` (do not abort the batch on a single failure).

## <a id="create"></a>create

Three input modes:

```bash
# 1. Direct flags — simplest
acli jira workitem create \
  --project "TEAM" \
  --type "Task" \
  --summary "Draft release notes" \
  --assignee "@me" \
  --label "docs,release" \
  --parent "TEAM-100"

# 2. Summary/description from a file
acli jira workitem create \
  --project "TEAM" \
  --type "Bug" \
  --from-file "bug-report.txt" \
  --assignee "user@example.com"

# 3. Full JSON payload — needed for custom fields and rich ADF
acli jira workitem create --generate-json > workitem.json   # scaffold
$EDITOR workitem.json                                        # edit
acli jira workitem create --from-json workitem.json          # submit
```

Useful flags:

| Flag               | Meaning                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `-p, --project`    | Project key (e.g. `TEAM`)                                               |
| `-t, --type`       | Work item type name (`Epic`, `Story`, `Task`, `Bug`, …)                  |
| `-s, --summary`    | One-line title                                                          |
| `-d, --description`| Plain text or ADF. Markdown is **not** interpreted.                     |
| `--description-file`| Description from a file                                                |
| `-a, --assignee`   | Email, account ID, `@me` (self), or `default` (project's default)       |
| `-l, --label`      | Comma-separated labels                                                  |
| `--parent`         | Parent work item key (for subtasks, epic children)                      |
| `-e, --editor`     | Open `$EDITOR` to write summary + description                           |
| `--json`           | Emit result as JSON                                                     |

### create-bulk

For many items at once, use JSON or CSV input:

```bash
# CSV path — fastest for spreadsheet-style input
acli jira workitem create-bulk --from-csv issues.csv --yes
```

Required CSV columns (literal names, comma-separated header row):

```
summary,projectKey,issueType,description,label,parentIssueId,assignee
Draft Q3 OKRs,TEAM,Task,Write first draft,docs,TEAM-100,you@example.com
Fix login bug,TEAM,Bug,User sees blank page,urgent,,auto
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
# Default fields
acli jira workitem view TEAM-123

# Select fields
acli jira workitem view TEAM-123 --fields "summary,assignee,status,comment"

# JSON for scripting
acli jira workitem view TEAM-123 --json | jq '.fields.assignee.emailAddress'

# Open in browser
acli jira workitem view TEAM-123 --web
```

The `--fields` selector supports meta-tokens documented by the CLI:

| Token         | Meaning                                          |
| ------------- | ------------------------------------------------ |
| `*all`        | All fields                                       |
| `*navigable`  | All navigable fields                             |
| `fieldName`   | Include named field                              |
| `-fieldName`  | Exclude named field                              |

Example: `--fields "*navigable,-comment"` — everything navigable except the comment list.

Default view fields: `key,issuetype,summary,status,assignee,description`.

## <a id="search"></a>search

```bash
# JQL search
acli jira workitem search --jql "project = TEAM AND status = '{{jira.status.story.backlog}}'"

# Saved filter
acli jira workitem search --filter 10001

# Count only
acli jira workitem search --jql "project = TEAM" --count

# Full result set — always pass --paginate when iterating
acli jira workitem search --jql "project = TEAM" --paginate --json

# CSV for spreadsheets
acli jira workitem search --jql "project = TEAM" --fields "key,summary,assignee" --csv > team.csv

# Open search in browser
acli jira workitem search --jql "project = TEAM" --web
```

Flags:

| Flag              | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `-j, --jql`       | JQL query (mutually exclusive with `--filter`)                   |
| `--filter`        | Saved filter ID                                                  |
| `--count`         | Return row count only                                            |
| `-f, --fields`    | Comma-separated field list (default `issuetype,key,assignee,priority,status,summary`) |
| `--json` / `--csv`| Output format                                                    |
| `-l, --limit`     | Max rows (default ~50, server-capped; truncates silently)        |
| `--paginate`      | Fetch all pages. Ignores `--limit`. **Use this in any automation script.** |
| `-w, --web`       | Open the search in the browser                                   |

**Silent truncation** is the top pitfall here. Without `--paginate`, `search` stops at the server page size (~30-50) with no warning. If your logic relies on "all matching items", always pass `--paginate`.

## <a id="edit"></a>edit

```bash
# Simple flag-based edit
acli jira workitem edit --key "TEAM-1,TEAM-2" --summary "Updated summary" --yes

# JQL-scoped batch edit
acli jira workitem edit --jql "project = TEAM AND status = {{jira.status.story.backlog}}" \
  --assignee "triage@example.com" --yes --ignore-errors

# Remove labels / assignee (cannot be done by passing empty values)
acli jira workitem edit --key "TEAM-1" --remove-labels "stale,deprecated"
acli jira workitem edit --key "TEAM-1" --remove-assignee
```

Editable flags via `acli jira workitem edit`: `--summary`, `--description`, `--description-file`, `--assignee`, `--labels`, `--type`.
Removal flags: `--remove-assignee`, `--remove-labels`.

**Critical limitation**: `acli jira workitem edit` does **NOT** document any way to set custom-field values. `edit --generate-json` produces a template with only built-in fields — no `additionalAttributes` block. To edit a custom-field value on an existing item, use REST or MCP. See [Custom fields](#custom-fields) below for the full picture.

## <a id="transition"></a>transition

```bash
# Single or few
acli jira workitem transition --key "TEAM-1,TEAM-2" --status "{{jira.status.story.in_review}}"

# Batch via JQL
acli jira workitem transition --jql "project = TEAM AND status = '{{jira.status.story.in_review}}'" \
  --status "{{jira.status.story.deployed_to_production}}" --yes --ignore-errors

# Via saved filter
acli jira workitem transition --filter 10001 --status "{{jira.status.story.backlog}}" --yes
```

`--status` is a **status name**, not a transition ID. The target must be reachable from the current status through the project's workflow.

Two known limitations:

- **No `--transition-id`.** If two transitions lead to the same status with different validators (e.g. both "Accept" and "Cancel" end in "{{jira.status.bug.closed}}"), `acli` may pick the wrong one and fail.
- **Loop transitions** (actions that keep the status the same) are supported — just pass the same status name.

Fallback when the CLI cannot disambiguate: call `POST /rest/api/3/issue/{key}/transitions` directly.

## <a id="assign"></a>assign

```bash
# Self-assign
acli jira workitem assign --key "TEAM-1" --assignee "@me"

# Batch reassign via JQL
acli jira workitem assign --jql "project = TEAM AND assignee = formerdev@example.com" \
  --assignee "newdev@example.com" --yes

# Reset to the project default
acli jira workitem assign --key "TEAM-1" --assignee "default"

# Unassign
acli jira workitem assign --key "TEAM-1" --remove-assignee
```

Assignee values: email, Atlassian account ID, `@me`, or `default`.

## <a id="clone"></a>clone

`clone` accepts the full selector set (`--key`, `--jql`, `--filter`, `--from-file`) — useful for cloning many items at once into a target project or site.

```bash
# Clone within the same project (single or many)
acli jira workitem clone --key "TEAM-1,TEAM-2" --to-project "TEAM"

# Clone into another project on the same site
acli jira workitem clone --key "TEAM-1" --to-project "OTHER"

# Clone every backlog item into another project
acli jira workitem clone --jql "project = TEAM AND status = 'Backlog'" \
  --to-project "ARCHIVE" --yes --ignore-errors

# Clone a saved-filter result set
acli jira workitem clone --filter 10001 --to-project "OTHER" --yes

# Clone to a project on another site (cross-site)
acli jira workitem clone --key "TEAM-1" --to-project "OTHER" --to-site "othersite.atlassian.net"
```

The clone copies summary, description, labels, and most routine fields. Attachments and comment history are **not** cloned. Parent/epic links may or may not carry depending on project settings.

## <a id="archive"></a>archive / unarchive / delete

```bash
# Archive — reversible
acli jira workitem archive --key "TEAM-1,TEAM-2" --yes
acli jira workitem archive --jql "project = TEAM AND resolved < -180d" --yes --ignore-errors

# Unarchive — only --key and --from-file selectors are supported
acli jira workitem unarchive --key "TEAM-1,TEAM-2" --yes

# Delete — destructive, use with care
acli jira workitem delete --key "TEAM-1" --yes
```

Archived items no longer appear in normal search results and cannot be edited, but the key remains stable and can be restored.

## <a id="comment"></a>comment

### create

```bash
# Plain text — renders as a single ADF paragraph, no markdown
acli jira workitem comment create --key "TEAM-1" --body "Looks good to me."

# Comment body from a file
acli jira workitem comment create --key "TEAM-1" --body-file comment.txt

# Batch the same comment across many items
acli jira workitem comment create --jql "labels = needs-review" \
  --body "Please review by Friday." --ignore-errors

# Edit the author's last comment instead of adding a new one
acli jira workitem comment create --key "TEAM-1" --body "Updated message" --edit-last

# Open $EDITOR for the body
acli jira workitem comment create --key "TEAM-1" --editor
```

`comment create` has **no** `--body-adf` flag. If you need rich ADF formatting on creation, the workaround is: create with a placeholder body, then `comment update --body-adf adf.json`.

### list

```bash
acli jira workitem comment list --key "TEAM-1" --json
acli jira workitem comment list --key "TEAM-1" --order "+created"
acli jira workitem comment list --key "TEAM-1" --paginate
```

### delete

```bash
# First find the comment ID via `comment list --json`
CID=$(acli jira workitem comment list --key "TEAM-1" --json | jq -r '.[] | select(.body | contains("typo")) | .id')

# Then delete by ID
acli jira workitem comment delete --key "TEAM-1" --id "$CID"
```

Flags: `--key` (target work item), `--id` (comment ID). No batch selectors — operates on one comment at a time.

### update

```bash
acli jira workitem comment update --key "TEAM-1" --id 10001 --body "Updated text"
acli jira workitem comment update --key "TEAM-1" --id 10001 --body-adf rich.json
acli jira workitem comment update --key "TEAM-1" --id 10001 --body "Internal note" \
  --visibility-role "Administrators" --notify
```

### visibility

Discover available visibility options before setting them:

```bash
# Project roles (requires --project)
acli jira workitem comment visibility --role --project TEAM

# Atlassian groups
acli jira workitem comment visibility --group
```

## <a id="link"></a>link

### create

```bash
# Single link, inline
acli jira workitem link create --out TEAM-1 --in TEAM-2 --type "Blocks"

# Batch via JSON
acli jira workitem link create --generate-json > links.json
$EDITOR links.json
acli jira workitem link create --from-json links.json --yes

# Batch via CSV — 3 columns, header row ignored
#   outwardId,inwardId,linkType
acli jira workitem link create --from-csv links.csv --yes
```

### list / type

```bash
# All links on an item
acli jira workitem link list --key "TEAM-1" --json

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

## <a id="attachment"></a>attachment

```bash
acli jira workitem attachment list --key "TEAM-1" --json
acli jira workitem attachment delete --key "TEAM-1" --id 12345
```

Upload is not yet covered by the CLI — use REST (`POST /rest/api/3/issue/{key}/attachments`).

## <a id="watcher"></a>watcher

### list

```bash
# All watchers on a work item
acli jira workitem watcher list --key "TEAM-1" --json
```

Returns the watch count and the list of watcher accounts (each with `accountId`, `displayName`, `emailAddress` — the same shape Jira REST returns).

### remove

```bash
acli jira workitem watcher remove --key "TEAM-1" --user 5b10ac8d82e05b22cc7d4ef5
```

`--user` takes an Atlassian account ID (not email). To get an account ID, run `watcher list --json` first (or look it up via `GET /rest/api/3/user/search?query=email`).

**Adding watchers is not exposed by `acli`** — REST fallback: `POST /rest/api/3/issue/{key}/watchers` with the account ID as a quoted JSON string in the body.

## <a id="custom-fields"></a>Custom fields

This is one of the rougher edges in `acli`. Read this section carefully — the CLI exposes first-class flags only for built-in fields (`summary`, `description`, `assignee`, `labels`, `priority`, `parent`, `type`). Everything else — story points, sprint, components, versions, custom dropdowns — must go through `--from-json` on `create`. **Editing custom-field values on existing items has no documented `acli` path** and requires REST/MCP.

### What `acli` documents officially

`acli jira workitem create --generate-json` is the only place in the CLI that documents how to express custom fields. The output template uses a top-level wrapper called `additionalAttributes`:

```json
{
  "summary": "Summary/Title of work item",
  "type": "Work item type, case sensitive, e.g. 'Task'",
  "projectKey": "Project key to associate the work item with, e.g. 'PROJ'",
  "assignee": "Assignee email or ID (optional)",
  "labels": ["feature", "optional"],
  "additionalAttributes": {
    "customfield_10000": { "value": "Custom field value" },
    "customfield_10001": 50,
    "customfield_10002": "string value"
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

| Field type            | Likely input shape inside `additionalAttributes`                                  |
| --------------------- | --------------------------------------------------------------------------------- |
| Multi-select          | `[{"value": "A"}, {"value": "B"}]`                                                |
| Date (date-only)      | `"2026-01-18"` (YYYY-MM-DD)                                                       |
| Datetime              | `"2026-01-18T19:28:09.762-0300"` (ISO-8601 with offset)                           |
| URL                   | bare string (`"https://example.com"`)                                             |
| Epic Link             | bare string (issue key, e.g. `"TEAM-18"`)                                         |
| User picker           | `{"accountId": "5b10ac8d82e05b22cc7d4ef5"}`                                       |
| Cascading select      | `{"value": "Parent", "child": {"value": "Child"}}`                                |
| Rich text (ADF)       | full ADF doc tree (same shape as `description`)                                   |
| Sprint                | array of sprint IDs `[5]` — but **`JRACLOUD-97107` makes this fail in practice**, see [Sprint field cannot be set](./gotchas.md#sprint) |

If a shape isn't listed here, the safest source of truth is `acli jira workitem view <KEY-WITH-FIELD-SET> --fields "*all" --json` — the read shape is usually identical to the write shape for that field type.

### Critical limitation: `workitem edit` does not document custom-field input

Running `acli jira workitem edit --generate-json` produces:

```json
{
  "summary": "...",
  "type": "...",
  "assignee": "...",
  "description": { /* ADF */ },
  "issues": ["KEY-1", "KEY-2"],
  "labelsToAdd": ["feature"],
  "labelsToRemove": ["feature"]
}
```

**No `additionalAttributes` block.** The flag list on `edit --help` confirms: only built-in fields are supported (`--summary`, `--description`, `--description-file`, `--assignee`, `--labels`, `--type`, `--remove-assignee`, `--remove-labels`).

For editing a custom-field value on an existing work item, fall back to REST:

```bash
curl -s -u "$EMAIL:$TOKEN" \
  -X PUT "https://mysite.atlassian.net/rest/api/3/issue/TEAM-1" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"customfield_10016": 8}}'
```

Note the REST shape uses `{"fields": {...}}`, not `additionalAttributes`.

### Critical limitation: bulk operations do not document custom-field input

`acli jira workitem create-bulk --generate-json` and the CSV column list (`summary, projectKey, issueType, description, label, parentIssueId, assignee`) both omit any way to set custom fields. If you need bulk creation with custom fields, the workaround is single-create-in-a-loop or REST batch.

### Finding a custom field ID

`acli` cannot enumerate custom fields (`field` group only does create/update/delete/cancel-delete). To discover IDs:

```bash
# From an existing item that has the field set
acli jira workitem view TEAM-123 --json | jq '.fields | keys[] | select(startswith("customfield_"))'

# From the field admin UI — the ID is in the URL when editing the field
# https://mysite.atlassian.net/secure/admin/EditCustomField!default.jspa?id=10016

# From REST — the only way to enumerate ALL fields on the site
curl -s -u "$EMAIL:$TOKEN" \
  "https://mysite.atlassian.net/rest/api/3/field" | jq '.[] | {id, name, custom, schema}'
```

In this boilerplate, `bun run jira:sync-fields` writes the canonical map to `.agents/jira-fields.json`. Reference fields by slug via `{{jira.<slug>}}` instead of hardcoding numeric IDs.

### Putting it together — full `create` example with custom fields

```bash
# 1. Scaffold
acli jira workitem create --generate-json > new-item.json

# 2. Edit to include custom fields
cat > new-item.json <<'JSON'
{
  "summary": "Implement OAuth refresh flow",
  "type": "Story",
  "projectKey": "TEAM",
  "assignee": "you@example.com",
  "labels": ["auth", "security"],
  "additionalAttributes": {
    "customfield_10016": 8,
    "customfield_10040": { "value": "High" },
    "customfield_10131": "2026-02-15"
  }
}
JSON

# 3. Submit
acli jira workitem create --from-json new-item.json
```

*(IDs like `customfield_10016` are illustrative. Your actual IDs come from `.agents/jira-fields.json` after `bun run jira:sync-fields`.)*
