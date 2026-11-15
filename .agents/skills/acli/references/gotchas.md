# Gotchas, known bugs, REST fallbacks

What the official docs do not make obvious. Each item has surprised at least one user in production, and most are confirmed by several sources or by explicit language in the docs. When this file and `acli <path> --help` disagree, trust `--help`: the binary ships ahead of its docs.

## Table of contents

1. [Silent pagination truncation](#pagination)
2. [The issue to workitem rename is surface only](#terminology)
3. [Custom field payload shape on `create`](#custom-fields)
4. [Custom fields cannot be edited via `acli`](#custom-field-edit)
5. [Custom fields cannot be enumerated via `acli`](#custom-field-list)
6. [No admin for workflows, issue types, priorities, resolutions, versions, components](#no-admin)
7. [Unknown subcommands silently fall back to parent help](#silent-fallback)
8. [Sprint field cannot be set](#sprint)
9. [Transition by status name only](#transitions)
10. [Auth has four namespaces](#auth-scope)
11. [OAuth cannot be automated](#oauth)
12. [Name collision with the Appfire `acli`](#appfire)
13. [Issue-type resolution is global](#issue-types)
14. [Comment create accepts ADF via -F](#comment-adf)
15. [Trace IDs and no verbose mode](#trace)
16. [Point-based rate limits](#rate-limits)
17. [CI install `latest/` risk](#ci-install)
18. [Naming convention: kebab-case is universal](#naming)
19. [REST fallback checklist](#rest-fallback)

## <a id="pagination"></a>1. Silent pagination truncation

`workitem search`, `project list` and every other list or search command stops at the server default (30 to 50 rows) when `--paginate` is not set. It gives no warning, no non-zero exit code and nothing on stderr, so an audit script that counts tickets, or a batch that iterates over keys, quietly decides on a partial result set.

Pass `--paginate` in automation. When you want only the top N, pass an explicit `--limit N` so the cap is intentional.

## <a id="terminology"></a>2. The "issue" to "workitem" rename is surface only

The CLI renamed `acli jira issue` to `acli jira workitem`, but the payloads kept the old spelling:

- JSON responses from `workitem search` still have `{"issues": [...]}` at the top level.
- `create-bulk` CSV columns are still `summary, projectKey, issueType, description, label, parentIssueId, assignee`.
- The underlying REST v3 endpoints (`/rest/api/3/issue/{id}`) were not renamed.

Write `jq` filters against `.issues[]` and CSVs for `create-bulk` with the old column names. The CLI rejects anything but the documented shapes, so a "modernized" payload fails.

## <a id="custom-fields"></a>3. Custom field payload shape on `create`

`acli jira workitem create --from-json` expects custom fields wrapped in a top-level `additionalAttributes` object. `fields` and flat keys at the root are both rejected:

```json
{
  "summary": "...",
  "type": "Story",
  "projectKey": "{{PROJECT_KEY}}",
  "additionalAttributes": {
    "customfield_NNNN": { "value": "High" },
    "customfield_NNNN": 8
  }
}
```

Two things hold for the shape:

- Fields are addressed by numeric ID only. Name-addressing (`"AI Effort"`) is not supported.
- Three value shapes are documented: single-select option `{"value": "..."}`, bare number, bare string. Every other shape (multiselect, date, datetime, user-picker, cascading select, ADF rich text) is inferred from the Jira REST contract and not documented by acli. See `references/workitem.md` §Custom fields.

Run `acli jira workitem create --generate-json` to get the canonical template before composing a payload, and validate by trial any shape outside the documented three.

## <a id="custom-field-edit"></a>4. Custom fields cannot be edited via `acli`

`acli workitem edit` has no channel for custom-field values. `edit --help` shows no `--customfield-*` flag of any kind, and the JSON schema for `edit --from-json` is strict: every unrecognized key is a hard error with exit 1. Three payload shapes tested against a real Jira workitem with `acli workitem edit --from-json`:

```text
{issues:[...], additionalAttributes:{customfield_X:<ADF>}}  → ✗ Error: json: unknown field "additionalAttributes"  (exit 1)
{issues:[...], fields:{customfield_X:<ADF>}}                → ✗ Error: json: unknown field "fields"               (exit 1)
{issues:[...], customfield_X:<ADF>}                         → ✗ Error: json: unknown field "customfield_X"        (exit 1)
```

This differs from `acli workitem create`, which does accept custom fields via `additionalAttributes`. Many users assume `edit` works the same way. It does not, and the failure is loud.

The working path is a REST PUT, because `acli` has no native channel for it. It needs `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` set in `.env`. They are never exported into the shell: the `curl` runs inside the `.env` loader, which hands them to that one process. The host is not an env var: `bun run --silent jira:url` reads it from `.agents/project.yaml`.

```bash
# Simple value (number, string, single-select)
bunx varlock run --filter ATLASSIAN_EMAIL,ATLASSIAN_API_TOKEN -- sh -c '
  curl -sS -w "\nHTTP %{http_code}\n" \
    -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
    -X PUT "$(bun run --silent jira:url)/rest/api/3/issue/{{PROJECT_KEY}}-123" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -d "{\"fields\": {\"customfield_NNNN\": 8}}"'
# Expected: HTTP 204 (no body on success)
```

For rich-text custom fields (ADF), see the "WORKAROUND: Editing rich-text custom fields on existing work items (REST PUT)" section in `SKILL.md`: same `curl` shape, with the payload built by piping the `md-to-adf.ts` output through `jq` to wrap it as `{"fields": {customfield_NNNNN: <ADF>}}`.

Reference (official Jira REST v3 PUT endpoint): <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put>.

The REST envelope key is `fields`. `additionalAttributes` is the `acli create` wrapper, and the two are not interchangeable.

`create-bulk` has the same blind spot: no `additionalAttributes` in its template and no documented custom-field path. For bulk creates that carry custom fields, loop single-create or batch via REST.

## <a id="custom-field-list"></a>5. Custom fields cannot be enumerated via `acli`

`acli jira field` only exposes `create`, `update`, `delete` and `cancel-delete`. There is no `list`, `get`, `view` or `search` subcommand, and `acli jira field list --help` does not error: it silently falls back to the parent `field` help (gotcha #7). Two workarounds:

```bash
# 1. From an item that has the field set, extract the IDs
acli jira workitem view {{PROJECT_KEY}}-123 --json \
  | jq '.fields | keys[] | select(startswith("customfield_"))'

# 2. From REST, enumerate every field on the site
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$(bun run --silent jira:url)/rest/api/3/field" \
  | jq '.[] | {id, name, custom, schema}'
```

> Repo integration: host repos commonly cache the field catalog under `.agents/` and reference fields by stable slug rather than numeric ID. See the host repo's `<repo-core>/references/acli-integration.md` for the slug catalog and refresh recipe.

## <a id="no-admin"></a>6. No admin for workflows, issue types, priorities, resolutions, versions, components

`acli` has no coverage for these admin and schema surfaces (confirm with `acli jira --help`; the CLI ships ahead of its docs):

| Surface                | `acli` coverage                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| Workflows              | None. No `jira workflow` group at all.                                 |
| Workflow schemes       | None.                                                                  |
| Statuses               | None (read-only, appears as nested object inside `workitem view`).     |
| Transition definitions | None (only `workitem transition` to _execute_ an existing transition). |
| Issue types            | None, neither read nor write.                                           |
| Priorities             | None.                                                                  |
| Resolutions            | None.                                                                  |
| Project versions       | None.                                                                  |
| Project components     | None.                                                                  |
| Custom-field options   | None, `field create/update/delete` does not manage dropdown options.    |
| Permission schemes     | None.                                                                  |

`acli jira workflow --help` does not error either: it silently falls back to `acli jira` help, so "no error" does not mean "command exists" (gotcha #7). Use REST or MCP for all schema and admin work. Common endpoints:

```bash
# Issue types
GET /rest/api/3/issuetype
GET /rest/api/3/project/{projectIdOrKey}

# Workflows
GET /rest/api/3/workflow/search
GET /rest/api/3/workflowscheme/{id}

# Custom-field options
POST /rest/api/3/field/{fieldId}/option
```

## <a id="silent-fallback"></a>7. Unknown subcommands silently fall back to parent help

A subcommand that does not exist, such as `acli jira workflow --help`, `acli jira field list --help` or `acli jira issuetype --help`, produces no error. The CLI prints the parent group's help (`acli jira --help`, `acli jira field --help`) and exits 0, so a script that keys off exit code 0 can silently do nothing useful for a whole branch.

To check that a command exists:

- After a help call, verify the help body actually changed. If `acli jira workflow --help` prints the same body as `acli jira --help`, the subcommand does not exist.
- For programmatic discovery, parse `acli <parent> --help` for the `Available Commands:` section and check membership.
- Cross-reference against `acli --version`, because features land per release.

## <a id="sprint"></a>8. Sprint field cannot be set

There is no working way to add a work item to a sprint via `acli`. Community attempts using `--from-json` with either a sprint ID or a sprint name fail ("Number value expected as the Sprint id", "failed to generate JSON"); Atlassian tracks it as `JRACLOUD-97107`. `acli jira sprint create / update / view / delete` do exist, so the sprint container is manageable, but moving tickets in or out of one is REST-only. Call the Jira Software REST endpoint directly:

```bash
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST "$(bun run --silent jira:url)/rest/agile/1.0/sprint/$SPRINT_ID/issue" \
  -H "Content-Type: application/json" \
  -d "{\"issues\": [\"{{PROJECT_KEY}}-123\", \"{{PROJECT_KEY}}-124\"]}"
```

The REST call needs its own basic-auth token, because `acli` does not expose its cached token.

## <a id="transitions"></a>9. `transition` matches by status name, not transition ID

The Jira REST API distinguishes transitions by ID, but `acli`'s `--status` flag accepts only the target status _name_. When two transitions land on the same status (both "Approve" and "Cancel" end in "In Review", say) with different validators, `acli` picks one heuristically and may fail validation with `InvalidPayloadException`. The CLI has no `--transition-id` escape hatch.

Use `acli` when the project's workflow exposes exactly one transition into the target status:

```bash
# Single, unambiguous path
acli jira workitem transition --key "{{PROJECT_KEY}}-123" --status "In Progress"
```

When the target status has several incoming transitions (for example "Start working" from `Ready For Dev` and "Reopen" from `In Review`), `acli --status` may pick the wrong one. Use the REST `transitions` endpoint with an explicit transition ID:

```bash
# 1. List the available transitions on the issue
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$(bun run --silent jira:url)/rest/api/3/issue/{{PROJECT_KEY}}-123/transitions" | jq

# 2. POST with the chosen transition ID (here illustrated as <TRANSITION_ID>)
curl -s -X POST -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$(bun run --silent jira:url)/rest/api/3/issue/{{PROJECT_KEY}}-123/transitions" \
  -d '{"transition":{"id":"<TRANSITION_ID>"}}'
```

> Repo integration: host repos often maintain a slug-to-transition-ID catalog so skill authors can reference unambiguous transitions by name (`<slug>` resolves to a workspace-specific numeric ID). See the host repo's `<repo-core>/references/acli-integration.md` for the catalog and the refresh recipe.

## <a id="auth-scope"></a>10. Auth has four namespaces

`acli` exposes four independent auth namespaces:

| Namespace    | Login command                | Credential                  |
| ------------ | ---------------------------- | --------------------------- |
| Jira         | `acli jira auth login`       | API token                   |
| Confluence   | `acli confluence auth login` | API token                   |
| Org admin    | `acli admin auth login`      | Org admin API key           |
| Global OAuth | `acli auth login`            | Browser OAuth (interactive) |

Logging in to one does not authenticate the others, because each scope keeps its own session. The most common symptom is a `forbidden` on `admin user activate` after a successful `jira auth login`.

Run the matching `auth login` for each scope you intend to use. For CI, use per-product API tokens: they are scope-limited, so a leaked Jira token cannot touch Confluence or admin. The global `acli auth login` (interactive OAuth) covers several products in one step, but it cannot be automated.

## <a id="oauth"></a>11. OAuth (`--web` or global `acli auth`) cannot be scripted

Both `acli jira auth login --web` and the top-level `acli auth login` open a browser, let the user pick a site, then require the same site to be picked in the terminal. The site cannot be pre-selected, there is no callback hook, and on WSL or remote shells the callback can hang indefinitely. Use API-token auth (`--token` with stdin) for any non-interactive context; OAuth is for humans at a terminal.

## <a id="appfire"></a>12. Name collision with the Appfire/Bob Swift `acli`

An older commercial CLI from Appfire (formerly Bob Swift) is also called `acli`. It is a Java JAR, uses `acli.properties` config, and has completely different syntax (`--action getIssueList` instead of `acli jira workitem search`). With both installed, `which acli` picks whichever is first on PATH. Run `acli --version` to confirm which binary is active: the official Atlassian one reports a plain semantic version and has the subcommand structure documented on `developer.atlassian.com/cloud/acli/`.

## <a id="issue-types"></a>13. Issue-type resolution is global, not project-scoped

When you pass `--type Task`, `acli` looks up the issue-type ID globally across the site. If several team-managed projects each define their own "Task" type, the CLI may pick the wrong one and fail with "The selected issue type is invalid" even when the target project clearly has a "Task". On sites with heavy team-managed use, fall back to REST with an explicit issue-type ID for the project, or consolidate issue-type names across projects.

## <a id="comment-adf"></a>14. `comment create` accepts ADF via `-F`

`comment create -F <file>` (alias `--body-file <file>`) accepts both plain text and ADF JSON. The flag's `--help` text states: "Plain text file with text or Atlassian Document Format (ADF)". When the file content begins with a JSON object (`{`), `acli` forwards it as ADF to the underlying REST call. Validated against Jira Cloud.

The plain `-b, --body` flag remains plain text only: Markdown syntax is stored literally as a single ADF paragraph.

Author the comment body in Markdown, convert it with `scripts/md-to-adf.ts`, and post with `-F`:

```bash
bun .agents/skills/acli/scripts/md-to-adf.ts notes.md notes.adf.json
acli jira workitem comment create --key {{PROJECT_KEY}}-123 -F notes.adf.json
```

A two-step pattern also works when you want a placeholder visible before composing the final body:

```bash
CID=$(acli jira workitem comment create --key {{PROJECT_KEY}}-123 --body "init" --json | jq -r '.id')
acli jira workitem comment update --key {{PROJECT_KEY}}-123 --id "$CID" --body-adf formatted.json
```

## <a id="trace"></a>15. Trace IDs are the only debug signal

Backend failures print `unexpected error, trace id: XXXXXXXX` with no other detail, and there is no `--verbose`, `--debug` or `--log-level` flag. Capture stderr in logs: a single command yields one trace ID, a bulk run one per failed item. Include every trace ID you saw when opening a support case.

## <a id="rate-limits"></a>16. Point-based rate limits

Atlassian's point-based rate limits (per-org point buckets; see the vendor docs for the current buckets) apply to the REST API that `acli` calls under the hood. A batch `--jql`-scoped edit over thousands of items can burn the whole hourly budget in one shot and produce 429s for the rest of the hour. For sweeping operations:

- Shard by date/assignee/component so each run touches a bounded number of items.
- Capture 429 responses and implement `Retry-After` backoff in wrapper scripts.
- Run during off-peak windows when the org-wide bucket is less contended.

## <a id="ci-install"></a>17. CI install from `latest/` risk

The official CI guide uses `curl -LO "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli"`, and a silent minor bump of `latest` has broken pipelines in the field. Pin a specific version in the URL, such as `https://acli.atlassian.com/linux/1.3.18/acli_linux_amd64/acli`, and upgrade on purpose.

## <a id="naming"></a>18. Naming convention: kebab-case is universal

Every multi-word flag in the binary uses kebab-case. The camelCase variants some older docs and examples show fail with "unknown flag".

| Wrong (camelCase) | Right (kebab-case) |
| ----------------- | ------------------ |
| `--searcherKey`   | `--searcher-key`   |
| `--orderBy`       | `--order-by`       |
| `--filterId`      | `--filter-id`      |
| `--projectKey`    | `--project-key`    |
| `--leadEmail`     | `--lead-email`     |
| `--fromJson`      | `--from-json`      |
| `--fromFile`      | `--from-file`      |

Flag _values_ may still use camelCase (CSV column header `projectKey`, JSON key `parentIssueId`); kebab-case applies to flag _names_ only. When in doubt, run `acli <path> --help` and copy the flag name verbatim instead of guessing the casing.

## <a id="rest-fallback"></a>19. When to fall back to REST

`acli` does not cover (confirm with `acli <path> --help` before falling back):

- Adding work items to a sprint (`POST /rest/agile/1.0/sprint/{sprintId}/issue`)
- Editing custom-field values on existing work items (`PUT /rest/api/3/issue/{key}` with `{"fields":{...}}`)
- Enumerating custom fields on a site (`GET /rest/api/3/field`)
- Managing custom-field options (`POST/DELETE /rest/api/3/field/{fieldId}/option/{optionId}`)
- Managing workflows, workflow schemes, statuses, or transition definitions
- Managing issue types, priorities, resolutions, project versions, project components, permission schemes
- Uploading attachments (`POST /rest/api/3/issue/{key}/attachments`)
- Adding watchers (`POST /rest/api/3/issue/{key}/watchers`)
- Creating remote links or web links, such as attaching a URL to a story (`POST /rest/api/3/issue/{key}/remotelink`)
- Transition by ID when the status-name match is ambiguous (see item 9)
- Retrieving the cached auth token for reuse
- Bitbucket command-line operations (out of scope entirely)
- Confluence page CRUD beyond `page view` (space and blog have full CRUD)
- Creating epics with a specific parent hierarchy beyond the `--parent` flag

For any of these, use `curl` with a separate basic-auth credential (email and API token, base64-encoded):

```bash
AUTH=$(printf '%s:%s' "$ATLASSIAN_EMAIL" "$ATLASSIAN_API_TOKEN" | base64)
curl -s -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" \
  "$(bun run --silent jira:url)/rest/api/3/issue/{{PROJECT_KEY}}-123"
```

## Meta-gotcha: documentation dates

The command-reference pages on `developer.atlassian.com/cloud/acli/` lag the binary: the CLI ships updates more often than the docs, and in several groups `--help` shows subcommands and flags the online reference omits. Trust `--help`.
