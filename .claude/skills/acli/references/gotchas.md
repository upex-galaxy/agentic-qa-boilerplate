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
14. [Comment create has no ADF flag](#comment-adf)
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
  "projectKey": "TEAM",
  "additionalAttributes": {
    "customfield_10122": { "value": "High" },
    "customfield_10016": 8
  }
}
```

Two things to remember about the shape:

- **Numeric IDs only.** Name-addressing (`"Story Points"`) is not supported.
- **The three documented value shapes** are: single-select option `{"value": "..."}`, bare number, bare string. All other shapes (multiselect, date, datetime, user-picker, cascading select, ADF rich text) are inferred from the Jira REST contract and not officially documented by acli — see `references/workitem.md` §Custom fields.

**Fix.** Always run `acli jira workitem create --generate-json` to get the canonical template before composing a payload. Validate by trial when using shapes not in the documented three.

## <a id="custom-field-edit"></a>4. Custom fields cannot be edited via `acli`

**The problem.** `acli jira workitem edit` does NOT document any way to set custom-field values. `edit --generate-json` produces a template with only built-in fields (summary, description, assignee, labels, type, labelsToAdd, labelsToRemove). The `edit --help` flag list confirms — only built-in field flags are exposed.

This is asymmetric with `create` (which does support custom fields via `additionalAttributes`). Many users assume edit works the same way; it does not.

**Fix.** Use REST `PUT /rest/api/3/issue/{key}` with the `{"fields": {...}}` shape:

```bash
curl -s -u "$EMAIL:$TOKEN" \
  -X PUT "https://mysite.atlassian.net/rest/api/3/issue/TEAM-1" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"customfield_10016": 8}}'
```

Note the REST shape uses `{"fields": {...}}` — different from the `additionalAttributes` wrapper that `create` uses.

Bulk create (`create-bulk`) has the same limitation: no `additionalAttributes` in its template, no documented custom-field path. For custom-field-bearing bulk creates, loop single-create or batch via REST.

## <a id="custom-field-list"></a>5. Custom fields cannot be enumerated via `acli`

**The problem.** `acli jira field` only exposes `create`, `update`, `delete`, `cancel-delete`. There is no `list`, `get`, `view`, or `search` subcommand. Running `acli jira field list --help` does NOT error — it silently falls back to the parent `field` help (see gotcha #7).

**Fix.** Three workarounds:

```bash
# 1. From an item that has the field set — extract IDs
acli jira workitem view TEAM-123 --json \
  | jq '.fields | keys[] | select(startswith("customfield_"))'

# 2. From REST — enumerate ALL fields on the site
curl -s -u "$EMAIL:$TOKEN" \
  "https://mysite.atlassian.net/rest/api/3/field" \
  | jq '.[] | {id, name, custom, schema}'

# 3. From the boilerplate's substrate
cat .agents/jira-fields.json
```

In this boilerplate, prefer reference-by-slug (`{{jira.<slug>}}`) over hardcoding numeric IDs.

## <a id="no-admin"></a>6. No admin for workflows, issue types, priorities, resolutions, versions, components

**The problem.** As of v1.3.18, `acli` has zero coverage for these admin/schema surfaces:

| Surface              | `acli` coverage                                                |
| -------------------- | -------------------------------------------------------------- |
| Workflows            | None. No `jira workflow` group at all.                         |
| Workflow schemes     | None.                                                          |
| Statuses             | None (read-only — appears as nested object inside `workitem view`). |
| Transition definitions | None (only `workitem transition` to *execute* an existing transition). |
| Issue types          | None — neither read nor write.                                 |
| Priorities           | None.                                                          |
| Resolutions          | None.                                                          |
| Project versions     | None.                                                          |
| Project components   | None.                                                          |
| Custom-field options | None — `field create/update/delete` doesn't manage dropdown options. |
| Permission schemes   | None.                                                          |

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
curl -s -u "$EMAIL:$TOKEN" \
  -X POST "https://mysite.atlassian.net/rest/agile/1.0/sprint/$SPRINT_ID/issue" \
  -H "Content-Type: application/json" \
  -d "{\"issues\": [\"TEAM-1\", \"TEAM-2\"]}"
```

Holding a separate basic-auth token for REST calls is unavoidable here — `acli` does not expose its cached token.

## <a id="transitions"></a>9. `transition` matches by status name, not transition ID

**The underlying problem.** The Jira REST API distinguishes transitions by ID, but `acli`'s `--status` flag accepts only the target status *name*. When two transitions land on the same status (e.g. both "Accept" and "Cancel" end in `{{jira.status.bug.closed}}`) with different validators, `acli` picks one heuristically and may fail validation with `InvalidPayloadException`. There is no `--transition-id` escape hatch in the CLI.

**How this boilerplate solves it.** The Jira workflow substrate (`bun run jira:sync-workflows` → `.agents/jira-workflows.json`, validated by `bun run jira:check`) maps every workflow transition to its canonical ID at sync time. Skill authors reference transitions by canonical slug — `{{jira.transition.<work_type>.<slug>}}` resolves to the transition ID, which is unambiguous on the REST endpoint. Status names remain available via `{{jira.status.<work_type>.<slug>}}` for the cases where `acli` *can* disambiguate.

**Worked example — bug retest, the canonical "verified" path:**

```bash
# OLD problem-prone pattern (avoid when the target status has multiple incoming transitions)
acli jira workitem transition --key "BUG-123" --status "Closed"
# → may fail when the workflow exposes more than one transition into "Closed"

# NEW substrate-aware pattern (preferred when ambiguity is possible)
# Transition a bug from Ready For QA to Closed via the canonical "verified" path
curl -s -X POST -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -H "Content-Type: application/json" \
  "$ATLASSIAN_URL/rest/api/3/issue/BUG-123/transitions" \
  -d '{"transition":{"id":"{{jira.transition.bug.retest_passed}}"}}'
# {{jira.transition.bug.retest_passed}} resolves to the canonical transition ID,
# bypassing any name-based ambiguity.
```

**Acceptable acli pattern when the path is unambiguous.** When only one transition leads to the target status, `acli --status` is still safe — and the substrate makes that safety verifiable. For example, `Story → In Progress` has only one transition (`Start working`), so:

```bash
acli jira workitem transition --key "STORY-1" --status "{{jira.status.story.in_progress}}"
```

is fine. The substrate-resolved status name and the substrate-resolved transition ID describe the same workflow facts; pick the form that matches your call site (acli vs REST).

**Discovery + validation.** The mapping is populated by `bun run jira:sync-workflows` and validated by `bun run jira:check`. If a required transition slug is missing, the check exits non-zero so the gap is caught before a skill tries to use it.

If you genuinely need to enumerate transitions on the fly (e.g. a transition not declared in the manifest), the raw REST recipe still works:

```bash
# Discover available transitions on a specific issue
curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "$ATLASSIAN_URL/rest/api/3/issue/BUG-123/transitions" | jq
```

## <a id="auth-scope"></a>10. Auth has four namespaces, not three

**The problem.** `acli` exposes four independent auth namespaces:

| Namespace      | Login command              | Credential                |
| -------------- | -------------------------- | ------------------------- |
| Jira           | `acli jira auth login`     | API token                 |
| Confluence     | `acli confluence auth login` | API token               |
| Org admin      | `acli admin auth login`    | Org admin API key         |
| Global OAuth   | `acli auth login`          | Browser OAuth (interactive) |

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

## <a id="comment-adf"></a>14. `comment create` has no `--body-adf`

**The problem.** `acli jira workitem comment update` accepts `--body-adf <file>` for rich ADF-formatted comments. `acli jira workitem comment create` does **not**. If you need a formatted initial comment, you have to create with a placeholder body and then update.

**Fix.** Two-step pattern:

```bash
# 1. Create a placeholder comment, capture the ID
CID=$(acli jira workitem comment create --key TEAM-1 --body "init" --json | jq -r '.id')

# 2. Replace with ADF
acli jira workitem comment update --key TEAM-1 --id "$CID" --body-adf formatted.json
```

Plain `--body` is interpreted as a single ADF paragraph. Markdown syntax (headings, code fences, lists, tables) is **not** rendered.

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

The flag *value* may still use camelCase (e.g. CSV column header `projectKey` or JSON key `parentIssueId`) — the convention only applies to flag *names*.

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
- Rich ADF comment on create (see item 14 for a two-step workaround that avoids REST)
- Transition by ID when the status-name match is ambiguous (see item 9)
- Retrieving the cached auth token for reuse
- Bitbucket command-line operations (out of scope entirely)
- Confluence page CRUD beyond `page view` (space and blog have full CRUD)
- Creating epics with a specific parent hierarchy beyond the `--parent` flag

For any of these, hold a separate basic-auth credential (email + API token base64-encoded) and use `curl`:

```bash
AUTH=$(printf '%s:%s' "$EMAIL" "$TOKEN" | base64)
curl -s -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" \
  "https://mysite.atlassian.net/rest/api/3/issue/TEAM-1"
```

## Meta-gotcha: documentation dates

Every command-reference page on `developer.atlassian.com/cloud/acli/` shows "Last updated" dates from 2024–2025. The CLI ships updates more often than the docs — when `acli --help` shows a flag that isn't in the online docs, the CLI is the source of truth. As of this writing the binary (v1.3.18) is meaningfully ahead of the public Reference docs in several groups: `board`, `sprint`, `filter`, `field` all have subcommands the docs omit.
