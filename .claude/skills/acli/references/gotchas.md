# Gotchas, known bugs, REST fallbacks

Everything the official docs do not make obvious. Every item here is something that has surprised at least one user in production; most are confirmed by multiple sources or by explicit language in the docs.

## Table of contents

1. [Silent pagination truncation](#pagination)
2. [The `issue` vs `workitem` split](#terminology)
3. [Custom field payload shape](#custom-fields)
4. [Sprint field cannot be set](#sprint)
5. [Transition by status name only](#transitions)
6. [Auth is product-scoped](#auth-scope)
7. [OAuth cannot be automated](#oauth)
8. [Name collision with the Appfire `acli`](#appfire)
9. [Issue-type resolution is global](#issue-types)
10. [Comment create has no ADF flag](#comment-adf)
11. [Trace IDs and no verbose mode](#trace)
12. [The 2026 point-based rate limits](#rate-limits)
13. [CI install `latest/` risk](#ci-install)
14. [REST fallback checklist](#rest-fallback)

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

## <a id="custom-fields"></a>3. Custom field payload shape on `--from-json`

**The problem.** `acli jira workitem edit --from-json` expects a **flat** document — not the REST `{"fields": {...}}` nested shape:

```json
{
  "issues": ["TEAM-1"],
  "customfield_10122": "High"
}
```

Passing `{"issues":["TEAM-1"], "fields": {"customfield_10122": "High"}}` — the REST shape — fails with an uninformative error.

**Fix.** Always use the flat shape for `edit`. The shape for `create` (via `--from-json`) is different and closer to REST — generate it with `--generate-json` and follow the scaffold exactly.

**Sources.** Multiple forum threads and the `--generate-json` output itself.

## <a id="sprint"></a>4. Sprint field cannot be set

**The problem.** There is no working way to add a work item to a sprint via `acli`. Community attempts using `--from-json` with either a sprint ID or a sprint name fail ("Number value expected as the Sprint id", "failed to generate JSON"). Atlassian tracks this as `JRACLOUD-97107`.

**Fix.** Call the Jira Software REST endpoint directly:

```bash
curl -s -u "$EMAIL:$TOKEN" \
  -X POST "https://mysite.atlassian.net/rest/agile/1.0/sprint/$SPRINT_ID/issue" \
  -H "Content-Type: application/json" \
  -d "{\"issues\": [\"TEAM-1\", \"TEAM-2\"]}"
```

Holding a separate basic-auth token for REST calls is unavoidable here — `acli` does not expose its cached token.

## <a id="transitions"></a>5. `transition` matches by status name, not transition ID

**The problem.** `--status` specifies the target status *name*, not the transition ID. When multiple transitions lead to the same status (e.g. "Accept" and "Cancel" both land on "Closed") with different validators, `acli` picks one and may fail validation with `InvalidPayloadException`.

**Fix.** For workflows with ambiguous transitions, call REST directly:

```bash
# Discover available transitions
curl -s -u "$EMAIL:$TOKEN" \
  "https://mysite.atlassian.net/rest/api/3/issue/TEAM-1/transitions" | jq

# Execute a specific transition by ID
curl -s -u "$EMAIL:$TOKEN" \
  -X POST "https://mysite.atlassian.net/rest/api/3/issue/TEAM-1/transitions" \
  -H "Content-Type: application/json" \
  -d '{"transition": {"id": "41"}}'
```

## <a id="auth-scope"></a>6. Auth is per-product, not per-account

**The problem.** `acli jira auth login` authenticates **only** for `acli jira *`. Running `acli admin user activate` afterwards returns `unauthorized: use acli [product] auth login`. Same for `acli rovodev`.

**Fix.** Run the matching `auth login` for each product you intend to use. The credentials are different: `jira` uses a personal API token, `admin` uses an org API key.

## <a id="oauth"></a>7. OAuth (`--web`) cannot be scripted

**The problem.** `acli jira auth login --web` opens a browser, lets the user pick a site, then requires the same site to be picked in the terminal. There is no way to pre-select the site, no callback hook, and on WSL or remote shells the callback can hang indefinitely.

**Fix.** Use API-token auth (`--token` with stdin) for any non-interactive context. `--web` is strictly for humans at a terminal.

## <a id="appfire"></a>8. Name collision with the Appfire/Bob Swift `acli`

**The problem.** There is an older commercial CLI from Appfire (formerly Bob Swift) also called `acli`. It is a Java JAR, uses `acli.properties` config, and has completely different syntax (`--action getIssueList` instead of `acli jira workitem search`). If a user has both installed, `which acli` picks whichever is first on PATH.

**Fix.** Use `acli --version` to confirm which binary is active. The official Atlassian one reports a version like `1.3.13` and has the subcommand structure documented on `developer.atlassian.com/cloud/acli/`.

## <a id="issue-types"></a>9. Issue-type resolution is global, not project-scoped

**The problem.** When you pass `--type Task`, `acli` looks up the issue-type ID globally across the site. If multiple team-managed projects each define their own "Task" type, the CLI may pick the wrong one and fail with "The selected issue type is invalid" even when the target project clearly has a "Task".

**Fix.** In sites with heavy team-managed project use, fall back to REST with an explicit issue-type ID for the project. Or consolidate issue-type names across projects.

## <a id="comment-adf"></a>10. `comment create` has no `--body-adf`

**The problem.** `acli jira workitem comment update` accepts `--body-adf <file>` for rich ADF-formatted comments. `acli jira workitem comment create` does **not**. If you need a formatted initial comment, you have to create with a placeholder body and then update.

**Fix.** Two-step pattern:

```bash
# 1. Create a placeholder comment, capture the ID
CID=$(acli jira workitem comment create --key TEAM-1 --body "init" --json | jq -r '.id')

# 2. Replace with ADF
acli jira workitem comment update --key TEAM-1 --id "$CID" --body-adf formatted.json
```

Plain `--body` is interpreted as a single ADF paragraph. Markdown syntax (headings, code fences, lists, tables) is **not** rendered.

## <a id="trace"></a>11. Trace IDs are the only debug signal

**The problem.** Backend failures print `unexpected error, trace id: XXXXXXXX` with no other detail. There is no `--verbose`, `--debug`, or `--log-level` flag.

**Fix.** Always capture stderr in logs. For single-command errors, one trace ID; for bulk, multiple IDs — one per failed item. When opening a support case, include every trace ID you saw.

## <a id="rate-limits"></a>12. 2026 point-based rate limits

**Coming change.** Atlassian is rolling out per-org point buckets (65k–500k points per hour depending on plan tier) across the REST API that `acli` calls under the hood. A batch `--jql`-scoped edit over thousands of items can burn the whole hourly budget in one shot and produce 429s for the rest of the hour.

**Fix.** For sweeping operations:

- Shard by date/assignee/component so each run touches a bounded number of items.
- Capture 429 responses and implement `Retry-After` backoff in wrapper scripts.
- Run during off-peak windows when the org-wide bucket is less contended.

## <a id="ci-install"></a>13. CI install from `latest/` risk

**The problem.** The official CI guide uses `curl -LO "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli"`. A silent minor bump has broken pipelines in the field (late 2025, 1.3.11 → 1.3.13 transition).

**Fix.** Pin a specific version in the URL: `https://acli.atlassian.com/linux/1.3.13/acli_linux_amd64/acli`. Upgrade intentionally, not incidentally.

## <a id="rest-fallback"></a>14. When to fall back to REST

`acli` does not (yet) cover:

- Adding work items to a sprint (`POST /rest/agile/1.0/sprint/{sprintId}/issue`)
- Uploading attachments (`POST /rest/api/3/issue/{key}/attachments`)
- Adding watchers (`POST /rest/api/3/issue/{key}/watchers`)
- Rich ADF comment on create (see item 10 for a two-step workaround that avoids REST)
- Transition by ID when the status-name match is ambiguous
- Retrieving the cached auth token for reuse
- Confluence, Bitbucket, or JSM command-line operations (out of scope entirely)
- Creating epics with a specific parent hierarchy beyond the `--parent` flag
- Setting initial values for many custom field types at create time (date-pickers, user-pickers, cascading selects sometimes need `--from-json` scaffolding or REST)

For any of these, hold a separate basic-auth credential (email + API token base64-encoded) and use `curl`:

```bash
AUTH=$(printf '%s:%s' "$EMAIL" "$TOKEN" | base64)
curl -s -H "Authorization: Basic $AUTH" -H "Content-Type: application/json" \
  "https://mysite.atlassian.net/rest/api/3/issue/TEAM-1"
```

## Meta-gotcha: documentation dates

Every command-reference page on `developer.atlassian.com/cloud/acli/` shows "Last updated" dates from 2024–2025. The CLI ships updates more often than the docs — when `acli --help` shows a flag that isn't in the online docs, the CLI is the source of truth.
