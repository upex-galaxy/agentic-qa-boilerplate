# Confluence Cloud (`acli confluence`)

Confluence surface added in `acli` v1.x. Coverage as of v1.3.18:

| Group   | Subcommands                                                              | Completeness |
| ------- | ------------------------------------------------------------------------ | ------------ |
| `auth`  | login · logout · status · switch                                         | Full         |
| `space` | archive · create · list · restore · update · view                        | Near-full (no `delete` — only archive/restore) |
| `blog`  | create · list · view                                                     | Read + create only (no update / delete) |
| `page`  | view                                                                     | **Read only** — no create / update / delete / list |

**Critical limitation**: `page` is read-only. To create or modify Confluence pages from the CLI you must fall back to REST (`POST/PUT/DELETE /wiki/api/v2/pages`). Despite this, blog posts and spaces have a usable CRUD-ish surface — fine for the common workflows of "publish release notes", "set up a new team space", "archive a deprecated workspace".

## Table of contents

1. [auth](#auth)
2. [space](#space)
3. [blog](#blog)
4. [page](#page)
5. [Body formats and Confluence storage format](#body-formats)
6. [REST fallback for pages](#rest-fallback)

## <a id="auth"></a>auth

Same model as `acli jira auth` — see `references/auth.md` for the full picture. Subcommands: `login`, `logout`, `status`, `switch`. Confluence keeps its own session even when authenticated to the same Atlassian site as Jira.

```bash
# API token (scriptable)
echo "$ATLASSIAN_API_TOKEN" | acli confluence auth login \
  --site "mysite.atlassian.net" \
  --email "you@example.com" \
  --token

# OAuth (interactive)
acli confluence auth login --web

# Status / switch / logout
acli confluence auth status
acli confluence auth switch --site mysite.atlassian.net --email you@example.com
acli confluence auth logout
```

Token is the same Atlassian-account token you'd use for Jira. The session is stored independently from the Jira session, so you typically log in to both even with identical credentials.

## <a id="space"></a>space

Confluence space CRUD. The most fleshed-out group in the Confluence surface.

### list

```bash
# All accessible spaces (default limit 50)
acli confluence space list

# Personal spaces only
acli confluence space list --type personal

# Filter by specific keys
acli confluence space list --keys "ENG,PRODUCT,RND" --json

# Include extra detail
acli confluence space list --expand description,homepage,permissions --json

# Archived spaces
acli confluence space list --status archived
```

Flags:

| Flag       | Meaning                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `--type`   | `global` · `personal`                                                  |
| `--status` | `current` (default) · `archived`                                       |
| `--keys`   | Comma-separated space keys to filter by                                |
| `--expand` | Comma-separated: `description, homepage, permissions`                  |
| `-l, --limit` | Max rows (default **50**)                                           |
| `--json`   | JSON output                                                            |

### view

```bash
# By space ID (note: this is the numeric ID, not the key)
acli confluence space view --id 123456

# Include all the optional sections
acli confluence space view --id 123456 --include-all --json

# Selective inclusion
acli confluence space view --id 123456 --icon --labels --permissions
```

Flags: `--id` (numeric), `--icon`, `--labels`, `--operations`, `--permissions`, `--properties`, `--role-assignments` (EAP sites only), `--include-all`, `--desc-format` (`plain` · `view`), `--json`.

> **Asymmetry**: `space view` takes `--id` (numeric), but `space create / update / archive / restore` use `--key` (the human-readable key like `ENG`). Use `space list --json` to find the numeric ID for a known key.

### create

```bash
# Minimum: key + name
acli confluence space create --key "ENG" --name "Engineering"

# With description and template
acli confluence space create \
  --key "ENG" \
  --name "Engineering" \
  --description "All engineering documentation, ADRs, runbooks" \
  --template-key "default" \
  --json

# Private space
acli confluence space create --key "EXEC" --name "Executive" --private

# Custom URL alias
acli confluence space create --key "ENG" --name "Engineering" --alias "engineering"
```

Flags: `--key`, `--name`, `--description`, `--alias` (URL identifier), `--template-key`, `--private`, `--json`.

### update

```bash
# Rename
acli confluence space update --key "ENG" --name "Engineering — Platform"

# Update description
acli confluence space update --key "ENG" --description "Platform engineering: services, infra, observability"
```

Flags: `--key` (required), `--name`, `--description`, `--status`, `--type`, `--json`.

### archive / restore

Spaces are NOT permanently deletable via the CLI — only `archive`/`restore`. Permanent deletion requires the Confluence UI (admin → space management) or REST.

```bash
# Archive
acli confluence space archive --key "OLDPROJ"

# Restore from archive (or trash)
acli confluence space restore --key "OLDPROJ"
```

## <a id="blog"></a>blog

Create + list + view. No `update` or `delete` (use REST for either).

### create

The richest single Confluence command — supports `--body`, `--body-file`, `--from-json`, `--generate-json`, drafts, scheduled timestamps, and private posts.

```bash
# Inline body (HTML / Confluence storage format)
acli confluence blog create \
  --space-id 12345 \
  --title "Release Notes — v2026.04" \
  --body "<p>This release includes...</p>"

# Body from a file (HTML or Markdown-as-HTML)
acli confluence blog create \
  --space-id 12345 \
  --title "Quarterly review" \
  --from-file ./review.html

# Draft (does not publish — visible only to author)
acli confluence blog create \
  --space-id 12345 \
  --title "Work in progress" \
  --status draft \
  --body "<p>Draft content</p>"

# Private (published but visibility-restricted)
acli confluence blog create \
  --space-id 12345 \
  --title "Internal announcement" \
  --private \
  --body "<p>...</p>"

# Backdated post
acli confluence blog create \
  --space-id 12345 \
  --title "Backfilled history" \
  --created-at "2026-01-16T10:20:30.000Z" \
  --body "<p>...</p>"

# JSON payload (for programmatic generation)
acli confluence blog create --generate-json > blog.json
$EDITOR blog.json
acli confluence blog create --from-json blog.json --json
```

Flags:

| Flag             | Meaning                                                                |
| ---------------- | ---------------------------------------------------------------------- |
| `--space-id`     | Numeric space ID (find via `space list --json`)                        |
| `--title`        | Post title                                                             |
| `--body`         | Inline body in Confluence storage format (XHTML)                       |
| `--from-file`    | Read body from file                                                    |
| `--from-json`    | Full JSON payload                                                      |
| `--generate-json`| Print example JSON template                                            |
| `--status`       | `current` (published, default) · `draft`                               |
| `--private`      | Restrict visibility                                                    |
| `--created-at`   | ISO-8601 timestamp (e.g. `"2026-04-28T15:00:00.000Z"`)                  |
| `-j, --json`     | Output JSON                                                            |

### list

```bash
# Latest blog posts in a space (default limit 25)
acli confluence blog list --space-id 12345

# By blog post ID(s)
acli confluence blog list --id 98765 --json

# Across multiple spaces, with status filter
acli confluence blog list --space-id 12345,67890 --status current --limit 50

# Title filter
acli confluence blog list --space-id 12345 --title "Release Notes"

# Include body in storage format
acli confluence blog list --space-id 12345 --body-format storage --limit 10

# Pagination via cursor
acli confluence blog list --cursor "<cursor-from-previous-call>" --limit 25 --json
```

Flags: `--id`, `--space-id`, `--title`, `--status` (`current` · `deleted` · `trashed`), `--body-format` (`storage` · `atlas_doc_format` · etc.), `--cursor` (pagination token), `--sort`, `-l, --limit` (default **25**), `-j, --json`, `--csv`.

> Pagination on `blog list` uses `--cursor`, NOT `--paginate`. The cursor token comes from the previous response (in JSON output). This is the only Confluence command that exposes cursor-based pagination.

### view

```bash
# By blog ID
acli confluence blog view --id 98765

# With body
acli confluence blog view --id 98765 --body-format storage

# Specific version
acli confluence blog view --id 98765 --version 2

# Draft view
acli confluence blog view --id 98765 --draft

# Include extras
acli confluence blog view --id 98765 --include labels,properties,likes
```

Flags: `--id` (required), `--body-format`, `--version` (int), `--draft`, `--status` (`current` · `trashed` · `deleted` · `historical` · `draft`), `--include` (comma-separated: `labels, properties, operations, likes, versions, version, favorited, webresources, collaborators, all`), `-j, --json`.

> `blog view` uses a single `--include` flag with comma-separated values. `page view` (next section) uses individual `--include-*` boolean flags. Inconsistent across the surface — copy from `--help`, do not guess.

## <a id="page"></a>page

**Read only.** The only subcommand is `view`. No create, no update, no delete, no list. To make any page change, fall back to REST (see [§REST fallback for pages](#rest-fallback)).

```bash
# By page ID
acli confluence page view --id 123456789

# With body in a specific format
acli confluence page view --id 123456789 --body-format storage
acli confluence page view --id 123456789 --body-format atlas_doc_format
acli confluence page view --id 123456789 --body-format view

# Include children, labels, likes, versions
acli confluence page view --id 123456789 \
  --include-direct-children \
  --include-labels \
  --include-likes \
  --include-versions

# Get a draft version
acli confluence page view --id 123456789 --get-draft

# Specific historical version
acli confluence page view --id 123456789 --version 5

# Filter by status (comma-separated list)
acli confluence page view --id 123456789 --status current,draft,archived
```

Include flags (each is a separate boolean): `--include-collaborators`, `--include-direct-children`, `--include-favorited-by-current-user-status`, `--include-labels`, `--include-likes`, `--include-operations`, `--include-properties`, `--include-version`, `--include-versions`, `--include-webresources`. Plus `--get-draft`, `--version <int>`, `--status`, `--body-format`, `--json`.

## <a id="body-formats"></a>Body formats and Confluence storage format

Several commands accept `--body-format` (read) or expect a body in a particular format on input (write). The values you'll encounter:

| Value              | What it is                                                            | When to use                                          |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `storage`          | Confluence "storage format" — XHTML with Confluence-specific macros   | Writing body content for `blog create`               |
| `atlas_doc_format` | ADF (the same JSON structure used in Jira rich text)                  | Programmatic content generation, especially for AI-assisted authoring |
| `view`             | Pre-rendered HTML as displayed to readers                             | Reading rendered content for downstream rendering   |
| `plain`            | Plain text (only valid for `space view --desc-format`)                | Simple display                                       |

For input via `--body` or `--body-file`, the documented expectation is **storage format** (XHTML). Markdown is not converted automatically — convert it yourself before submission, or use a JSON payload via `--from-json` with `atlas_doc_format`.

Quick reference for storage format:

```html
<p>A paragraph.</p>
<h2>A heading</h2>
<ul><li>List item</li></ul>
<ac:structured-macro ac:name="info">
  <ac:rich-text-body><p>Info macro content</p></ac:rich-text-body>
</ac:structured-macro>
<a href="https://example.com">Link</a>
```

## <a id="rest-fallback"></a>REST fallback for pages and update/delete operations

Anything `acli confluence` does not cover, route through Confluence Cloud REST v2 at `/wiki/api/v2/`:

```bash
# Auth header (basic with email + API token)
AUTH=$(printf '%s:%s' "$EMAIL" "$TOKEN" | base64)

# Create a page
curl -s -X POST "https://mysite.atlassian.net/wiki/api/v2/pages" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "spaceId": "12345",
    "status": "current",
    "title": "New Page",
    "body": {
      "representation": "storage",
      "value": "<p>Content here</p>"
    }
  }'

# Update a page (must include current version + 1)
curl -s -X PUT "https://mysite.atlassian.net/wiki/api/v2/pages/$PAGE_ID" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'"$PAGE_ID"'",
    "status": "current",
    "title": "Updated title",
    "body": { "representation": "storage", "value": "<p>Updated content</p>" },
    "version": { "number": 4 }
  }'

# Delete a page
curl -s -X DELETE "https://mysite.atlassian.net/wiki/api/v2/pages/$PAGE_ID" \
  -H "Authorization: Basic $AUTH"

# Update a blog post (no acli equivalent)
curl -s -X PUT "https://mysite.atlassian.net/wiki/api/v2/blogposts/$BLOG_ID" \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -d '{ "id": "'"$BLOG_ID"'", "status": "current", "title": "...", "body": {...}, "version": {"number": N+1} }'

# Permanently delete a space (acli only does archive/restore)
curl -s -X DELETE "https://mysite.atlassian.net/wiki/rest/api/space/$SPACE_KEY" \
  -H "Authorization: Basic $AUTH"
```

> Pages REST takes the **numeric page ID**, not the title or URL slug. To find a page ID, navigate to the page in the browser and look at the URL: `https://mysite.atlassian.net/wiki/spaces/ENG/pages/<PAGE_ID>/Title`.
> The `version.number` on update must be the current version + 1, otherwise you'll get `409 Conflict`. Read first via `acli confluence page view --id $PAGE_ID --include-version --json | jq '.version.number'`.

## When to prefer MCP over `acli`

For Confluence specifically, the Atlassian MCP server tends to be more ergonomic for page CRUD because the MCP wraps the REST endpoints and handles the version-bumping dance. Use it when:

- You need to create or update Confluence pages from an AI session.
- You're chaining many page operations and don't want to manage version increments by hand.
- You want a uniform interface alongside Jira MCP calls in the same session.

Use `acli confluence` instead when:

- You're scripting a one-off bulk operation (create 50 spaces from a CSV).
- You need CSV/JSON output piped into other shell tools.
- You're already authenticated to `acli` and don't want to negotiate MCP credentials separately.
