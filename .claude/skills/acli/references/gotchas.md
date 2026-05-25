# Gotchas, known bugs, REST fallbacks

Everything the official docs do not make obvious. Every item here is something that has surprised at least one user in production; most are confirmed by multiple sources or by explicit language in the docs.

## Table of contents

1. [Silent pagination truncation](#pagination)
2. [The `issue` vs `workitem` split](#terminology)
3. [Custom field payload shape on `create`](#custom-fields)
4. [Custom fields cannot be edited via `acli`](#custom-field-edit)
5. [Custom fields cannot be enumerated via `acli`](#custom-field-list)
6. [No admin for workflows, issue types, priorities, resolutions, versions, components](#no-admin)
7. [Unknown subcommands silently fall back to parent help](#silent-fallback)
8. [Sprint field cannot be set](#sprint)
9. [Transition by status name only](#transitions)
10. [Auth has four namespaces, not three](#auth-scope)
11. [OAuth cannot be automated](#oauth)
12. [Name collision with the Appfire `acli`](#appfire)
13. [Issue-type resolution is global](#issue-types)
14. [Comment create accepts ADF via -F](#comment-adf)
15. [Trace IDs and no verbose mode](#trace)
16. [The 2026 point-based rate limits](#rate-limits)
17. [CI install `latest/` risk](#ci-install)
18. [Naming convention: kebab-case is universal](#naming)
19. [REST fallback checklist](#rest-fallback)

## <a id="pagination"></a>1. Silent pagination truncation

**The problem.** `workitem search`, `project list`, and every other list/search command stops at the server default (30–50 rows) when `--paginate` is not set. There is no warning, no non-zero exit code, no stderr message.

**Why it matters.** Audit scripts that count tickets, batch scripts that iterate over keys, or anything making decisions based on the result set will silently make the wrong decision.

**Fix.** Always pass `--paginate` in automation. If your use case truly wants only the top N, pass an explicit `--limit N` to make the cap intentional.

## <a id="terminology"></a>2. "Issue" → "workitem" rename is surface only

**The problem.** The CLI renamed `acli jira issue` → `acli jira workitem` during 2025. But:

- JSON responses from `workitem search` still have `{"issues": [...]}` at the top level.
- `create-bulk` CSV columns are still `summary, projectKey, issueType, description, label, parentIssueId, assignee`.
- The underlying REST v3 endpoints (`/rest/api/3/issue/{id}`) were not renamed.

**Fix.** When writing `jq` filters, use `.issues[]`. When writing CSVs for `create-bulk`, use the old column names. Do not try to "modernize" payloads — the CLI rejects anything but the documented shapes.

## <a id="custom-fields"></a>3. Custom field payload shape on `create`

**The problem.** `acli jira workitem create --from-json` expects custom fields wrapped in a top-level `additionalAttributes` object — NOT `fields`, NOT flat at the root:

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

Two things to remember about the shape:

- **Numeric IDs only.** Name-addressing (`"Story Points"`) is not supported.
- **The three documented value shapes** are: single-select option `{"value": "..."}`, bare number, bare string. All other shapes (multiselect, date, datetime, user-picker, cascading select, ADF rich text) are inferred from the Jira REST contract and not officially documented by acli — see `references/workitem.md` §Custom fields.

**Fix.** Always run `acli jira workitem create --generate-json` to get the canonical template before composing a payload. Validate by trial when using shapes not in the documented three.

## <a id="custom-field-edit"></a>4. Custom fields cannot be edited via `acli`

**The problem.** `acli workitem edit` exposes no channel for custom-field values. Beyond what `edit --help` reveals (no `--customfield-*` flag of any kind), the JSON schema for `edit --from-json` is **strict-mode**: every unrecognized key triggers a hard error and exit 1.

**Empirical proof.** Three payload shapes tested against a real Jira workitem with `acli workitem edit --from-json`:

```text
{issues:[...], additionalAttributes:{customfield_X:<ADF>}}  → ✗ Error: json: unknown field "additionalAttributes"  (exit 1)
{issues:[...], fields:{customfield_X:<ADF>}}                → ✗ Error: json: unknown field "fields"               (exit 1)
{issues:[...], customfield_X:<ADF>}                         → ✗ Error: json: unknown field "customfield_X"        (exit 1)
```

This is asymmetric with `acli workitem create`, which **does** accept custom fields via `additionalAttributes`. Many users assume `edit` works the same way; it does not — and the failure is loud, not silent.

**Fix — WORKAROUND via REST PUT** (the only working path as of v1.3.18).

Prerequisites: `ATLASSIAN_URL`, `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` are exported in the current shell.

```bash
# Simple value (number, string, single-select)
curl -sS -w "\nHTTP %{http_code}\n" \
  -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X PUT "$ATLASSIAN_URL/rest/api/3/issue/{{PROJECT_KEY}}-123" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"customfield_NNNN": 8}}'
# Expected: HTTP 204 (no body on success)
```

For rich-text custom fields (ADF), see the dedicated **"WORKAROUND: Editing rich-text custom fields on existing work items (REST PUT)"** section in `SKILL.md` — same `curl` shape, payload built by piping the `md-to-adf.ts` output through `jq` to wrap it as `{"fields": {customfield_NNNNN: <ADF>}}`.

Reference (official Jira REST v3 PUT endpoint): <https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-put>.

Note the REST envelope key is `fields`, **not** `additionalAttributes` (which is the `acli create` wrapper). They are not interchangeable.

Bulk create (`create-bulk`) has the same blind spot: no `additionalAttributes` in its template, no documented custom-field path. For bulk creates that carry custom fields, loop single-create or batch via REST.

## <a id="custom-field-list"></a>5. Custom fields cannot be enumerated via `acli`

**The problem.** `acli jira field` only exposes `create`, `update`, `delete`, `cancel-delete`. There is no `list`, `get`, `view`, or `search` subcommand. Running `acli jira field list --help` does NOT error — it silently falls back to the parent `field` help (see gotcha #7).

**Fix.** Two workarounds:

```bash
# 1. From an item that has the field set — extract IDs
acli jira workitem view {{PROJECT_KEY}}-123 --json \
  | jq '.fields | keys[] | select(startswith("customfield_"))'

# 2. From REST — enumerate ALL fields on the site
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$ATLASSIAN_URL/rest/api/3/field" \
  | jq '.[] | {id, name, custom, schema}'
```

> Repo integration: host repos commonly cache the field catalog under `.agents/` and reference fields by stable slug rather than numeric ID. See the host repo's `<repo-core>/references/acli-integration.md` for the slug catalog and refresh recipe.

## <a id="no-admin"></a>6. No admin for workflows, issue types, priorities, resolutions, versions, components

**The problem.** As of v1.3.18, `acli` has zero coverage for these admin/schema surfaces:

| Surface                | `acli` coverage                                                        |
| ---------------------- | ---------------------------------------------------------------------- |
| Workflows              | None. No `jira workflow` group at all.                                 |
| Workflow schemes       | None.                                                                  |
| Statuses               | None (read-only — appears as nested object inside `workitem view`).    |
| Transition definitions | None (only `workitem transition` to _execute_ an existing transition). |
| Issue types            | None — neither read nor write.                                         |
| Priorities             | None.                                                                  |
| Resolutions            | None.                                                                  |
| Project versions       | None.                                                                  |
| Project components     | None.                                                                  |
| Custom-field options   | None — `field create/update/delete` doesn't manage dropdown options.   |
| Permission schemes     | None.                                                                  |

Running e.g. `acli jira workflow --help` does NOT error — it silently falls back to `acli jira` help. So "no error" ≠ "command exists" (see gotcha #7).

**Fix.** Use REST or MCP for all schema/admin work. Common endpoints:

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

**The problem.** Typing a subcommand that doesn't exist — e.g. `acli jira workflow --help`, `acli jira field list --help`, `acli jira issuetype --help` — does NOT produce an error. The CLI prints the parent group's help (`acli jira --help`, `acli jira field --help`) and exits 0.

**Why it matters.** "No error" is not evidence the command exists. Scripts that key off exit code 0 may silently do nothing useful for entire branches.

**Fix.**

- After a help call, verify the help body actually changed. If `acli jira workflow --help` prints the same body as `acli jira --help`, the subcommand does not exist.
- For programmatic discovery, parse `acli <parent> --help` for the `Available Commands:` section and check membership.
- Always cross-reference against `acli --version` — features land per release.

## <a id="sprint"></a>8. Sprint field cannot be set

**The problem.** There is no working way to add a work item to a sprint via `acli`. Community attempts using `--from-json` with either a sprint ID or a sprint name fail ("Number value expected as the Sprint id", "failed to generate JSON"). Atlassian tracks this as `JRACLOUD-97107`.

`acli jira sprint create / update / view / delete` do exist — you can manage the sprint container itself — but moving tickets in/out of one is REST-only.

**Fix.** Call the Jira Software REST endpoint directly:

```bash
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST "$ATLASSIAN_URL/rest/agile/1.0/sprint/$SPRINT_ID/issue" \
  -H "Content-Type: application/json" \
  -d "{\"issues\": [\"{{PROJECT_KEY}}-123\", \"{{PROJECT_KEY}}-124\"]}"
```

Holding a separate basic-auth token for REST calls is unavoidable here — `acli` does not expose its cached token.

## <a id="transitions"></a>9. `transition` matches by status name, not transition ID

**The problem.** The Jira REST API distinguishes transitions by ID, but `acli`'s `--status` flag accepts only the target status _name_. When two transitions land on the same status (e.g. both "Approve" and "Cancel" end in "In Review") with different validators, `acli` picks one heuristically and may fail validation with `InvalidPayloadException`. There is no `--transition-id` escape hatch in the CLI.

**Acceptable acli usage** — when the project's workflow exposes exactly one transition into the target status:

```bash
# Single, unambiguous path
acli jira workitem transition --key "{{PROJECT_KEY}}-123" --status "In Progress"
```

**REST fallback** — when the target status has multiple incoming transitions (e.g. "Start working" from `Ready For Dev` AND "Reopen" from `In Review`), `acli --status` may pick the wrong one. Fall back to the REST `transitions` endpoint with an explicit transition ID:

```bash
# 1. Discover the available transitions on the issue
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$ATLASSIAN_URL/rest/api/3/issue/{{PROJECT_KEY}}-123/transitions" | jq

# 2. POST with the chosen transition ID (here illustrated as <TRANSITION_ID>)
curl -s -X POST -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ATLASSIAN_URL/rest/api/3/issue/{{PROJECT_KEY}}-123/transitions" \
  -d '{"transition":{"id":"<TRANSITION_ID>"}}'
```

> Repo integration: host repos often maintain a slug → transition-ID catalog so skill authors can reference unambiguous transitions by name (e.g. `<slug>` resolves to a workspace-specific numeric ID). See the host repo's `<repo-core>/references/acli-integration.md` for the catalog and the refresh recipe.

## <a id="auth-scope"></a>10. Auth has four namespaces, not three

**The problem.** `acli` exposes four independent auth namespaces:

| Namespace    | Login command                | Credential                  |
| ------------ | ---------------------------- | --------------------------- |
| Jira         | `acli jira auth login`       | API token                   |
| Confluence   | `acli confluence auth login` | API token                   |
| Org admin    | `acli admin auth login`      | Org admin API key           |
| Global OAuth | `acli auth login`            | Browser OAuth (interactive) |

Logging in to one does not authenticate the others. Each scope keeps its own session. A `forbidden` on `admin user activate` after a successful `jira auth login` is the most common symptom.

**Fix.** Run the matching `auth login` for each scope you intend to use. For CI, use per-product API tokens — they're scope-limited (a leaked Jira token can't touch Confluence or admin).

The global `acli auth login` (interactive OAuth) is the exception — it covers multiple products in one step, but it cannot be automated.

## <a id="oauth"></a>11. OAuth (`--web` or global `acli auth`) cannot be scripted

**The problem.** Both `acli jira auth login --web` and the top-level `acli auth login` open a browser, let the user pick a site, then require the same site to be picked in the terminal. There is no way to pre-select the site, no callback hook, and on WSL or remote shells the callback can hang indefinitely.

**Fix.** Use API-token auth (`--token` with stdin) for any non-interactive context. OAuth is strictly for humans at a terminal.

## <a id="appfire"></a>12. Name collision with the Appfire/Bob Swift `acli`

**The problem.** There is an older commercial CLI from Appfire (formerly Bob Swift) also called `acli`. It is a Java JAR, uses `acli.properties` config, and has completely different syntax (`--action getIssueList` instead of `acli jira workitem search`). If a user has both installed, `which acli` picks whichever is first on PATH.

**Fix.** Use `acli --version` to confirm which binary is active. The official Atlassian one reports a version like `1.3.18` and has the subcommand structure documented on `developer.atlassian.com/cloud/acli/`.

## <a id="issue-types"></a>13. Issue-type resolution is global, not project-scoped

**The problem.** When you pass `--type Task`, `acli` looks up the issue-type ID globally across the site. If multiple team-managed projects each define their own "Task" type, the CLI may pick the wrong one and fail with "The selected issue type is invalid" even when the target project clearly has a "Task".

**Fix.** In sites with heavy team-managed project use, fall back to REST with an explicit issue-type ID for the project. Or consolidate issue-type names across projects.

## <a id="comment-adf"></a>14. `comment create` accepts ADF via `-F` (previous claim was outdated)

**Previous claim (incorrect for v1.3.18+).** Older skill documentation stated `comment create` had no ADF input and required a two-step workaround: create placeholder body → `comment update --body-adf`. This was based on `comment update` having a dedicated `--body-adf` flag while `comment create` had only `--body` and `--body-file`.

**Current behavior.** `comment create -F <file>` (alias `--body-file <file>`) accepts both plain text and ADF JSON. The flag's `--help` text states: "Plain text file with text or Atlassian Document Format (ADF)". When the file content begins with a JSON object (`{`), `acli` forwards it as ADF to the underlying REST call. Validated against Jira Cloud on `acli` v1.3.18.

The plain `-b, --body` flag remains plain text only — Markdown syntax is stored literally as a single ADF paragraph.

**Recommended pattern.** Author the comment body in Markdown, convert via `scripts/md-to-adf.ts`, post with `-F`:

```bash
bun .claude/skills/acli/scripts/md-to-adf.ts notes.md notes.adf.json
acli jira workitem comment create --key {{PROJECT_KEY}}-123 -F notes.adf.json
```

The legacy two-step pattern still works and may be useful if you want a placeholder visible before composing the final body:

```bash
CID=$(acli jira workitem comment create --key {{PROJECT_KEY}}-123 --body "init" --json | jq -r '.id')
acli jira workitem comment update --key {{PROJECT_KEY}}-123 --id "$CID" --body-adf formatted.json
```

It is no longer required for rich-text creation.

## <a id="trace"></a>15. Trace IDs are the only debug signal

**The problem.** Backend failures print `unexpected error, trace id: XXXXXXXX` with no other detail. There is no `--verbose`, `--debug`, or `--log-level` flag.

**Fix.** Always capture stderr in logs. For single-command errors, one trace ID; for bulk, multiple IDs — one per failed item. When opening a support case, include every trace ID you saw.

## <a id="rate-limits"></a>16. 2026 point-based rate limits

**Coming change.** Atlassian is rolling out per-org point buckets (65k–500k points per hour depending on plan tier) across the REST API that `acli` calls under the hood. A batch `--jql`-scoped edit over thousands of items can burn the whole hourly budget in one shot and produce 429s for the rest of the hour.

**Fix.** For sweeping operations:

- Shard by date/assignee/component so each run touches a bounded number of items.
- Capture 429 responses and implement `Retry-After` backoff in wrapper scripts.
- Run during off-peak windows when the org-wide bucket is less contended.

## <a id="ci-install"></a>17. CI install from `latest/` risk

**The problem.** The official CI guide uses `curl -LO "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli"`. A silent minor bump has broken pipelines in the field (late 2025, 1.3.11 → 1.3.13 transition).

**Fix.** Pin a specific version in the URL: `https://acli.atlassian.com/linux/1.3.18/acli_linux_amd64/acli`. Upgrade intentionally, not incidentally.

## <a id="naming"></a>18. Naming convention: kebab-case is universal

**The problem.** Every multi-word flag in the binary uses kebab-case. CamelCase variants (sometimes seen in older docs or examples) will fail with "unknown flag".

| Wrong (camelCase) | Right (kebab-case) |
| ----------------- | ------------------ |
| `--searcherKey`   | `--searcher-key`   |
| `--orderBy`       | `--order-by`       |
| `--filterId`      | `--filter-id`      |
| `--projectKey`    | `--project-key`    |
| `--leadEmail`     | `--lead-email`     |
| `--fromJson`      | `--from-json`      |
| `--fromFile`      | `--from-file`      |

The flag _value_ may still use camelCase (e.g. CSV column header `projectKey` or JSON key `parentIssueId`) — the convention only applies to flag _names_.

**Fix.** When in doubt, run `acli <path> --help` and copy the flag name verbatim. Never guess casing.

## <a id="rest-fallback"></a>19. When to fall back to REST

`acli` does not (yet) cover:

- Adding work items to a sprint (`POST /rest/agile/1.0/sprint/{sprintId}/issue`)
- Editing custom-field values on existing work items (`PUT /rest/api/3/issue/{key}` with `{"fields":{...}}`)
- Enumerating custom fields on a site (`GET /rest/api/3/field`)
- Managing custom-field options (`POST/DELETE /rest/api/3/field/{fieldId}/option/{optionId}`)
- Managing workflows, workflow schemes, statuses, or transition definitions
- Managing issue types, priorities, resolutions, project versions, project components, permission schemes
- Uploading attachments (`POST /rest/api/3/issue/{key}/attachments`)
- Adding watchers (`POST /rest/api/3/issue/{key}/watchers`)
- Creating remote links / web links — e.g. attaching a URL to a story (`POST /rest/api/3/issue/{key}/remotelink`)
- Transition by ID when the status-name match is ambiguous (see item 9)
- Retrieving the cached auth token for reuse
- Bitbucket command-line operations (out of scope entirely)
- Confluence page CRUD beyond `page view` (space and blog have full CRUD)
- Creating epics with a specific parent hierarchy beyond the `--parent` flag

For any of these, hold a separate basic-auth credential (email + API token base64-encoded) and use `curl`:

```bash
AUTH=$(printf '%s:%s' "$ATLASSIAN_EMAIL" "$ATLASSIAN_API_TOKEN" | base64)
curl -s -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" \
  "$ATLASSIAN_URL/rest/api/3/issue/{{PROJECT_KEY}}-123"
```

## Meta-gotcha: documentation dates

Every command-reference page on `developer.atlassian.com/cloud/acli/` shows "Last updated" dates from 2024–2025. The CLI ships updates more often than the docs — when `acli --help` shows a flag that isn't in the online docs, the CLI is the source of truth. As of this writing the binary (v1.3.18) is meaningfully ahead of the public Reference docs in several groups: `board`, `sprint`, `filter`, `field` all have subcommands the docs omit.
