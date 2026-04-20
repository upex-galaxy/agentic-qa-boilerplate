# Output formats, piping, automation, CI

Everything related to getting data **out** of `acli` and feeding it into other tools.

## Output flags

Every list/search/view command supports:

| Flag       | Use                                                                 |
| ---------- | ------------------------------------------------------------------- |
| (default)  | Human-readable table — do not parse in scripts                      |
| `--json`   | JSON blob. Structured, stable, script-friendly                      |
| `--csv`    | Spreadsheet-friendly flat columns                                   |

Most search/list commands also take:

| Flag          | Use                                                              |
| ------------- | ---------------------------------------------------------------- |
| `--paginate`  | Fetch all pages. Silently overrides `--limit`.                    |
| `-l, --limit` | Cap at N rows. Default ~30–50 depending on endpoint.              |
| `--count`     | Return only the row count (no rows). Fast and cheap.              |
| `-f, --fields`| Restrict returned columns.                                        |

### Critical pagination rule

`workitem search`, `project list`, `filter search`, `dashboard search`, `board search`, `sprint list-workitems`, `board list-sprints` and the comment/attachment/link list variants **all** silently truncate at the server default when `--paginate` is not set. No warning. No exit code signal.

**Any script that counts, iterates, or makes decisions on the result set must pass `--paginate`.** The only case where you can skip it is when you have already passed an explicit `--limit` you are comfortable with.

## JSON structure — what to expect

The JSON emitted by `workitem search`, `workitem view`, and similar commands mirrors the Jira REST v3 shape. Two key facts:

- The top-level array from `search` is `issues`, **not** `workitems` (the rename is UI/CLI-surface only).
- Each issue has the standard REST shape: `{ id, key, self, fields: { summary, status, assignee, customfield_X, ... } }`.

```bash
# Extract the summary from a view
acli jira workitem view TEAM-1 --json | jq '.fields.summary'

# Extract all keys from a search
acli jira workitem search --jql "project = TEAM" --paginate --json \
  | jq -r '.issues[].key'

# Count by assignee
acli jira workitem search --jql "project = TEAM" --paginate --json \
  | jq -r '.issues[].fields.assignee.displayName' \
  | sort | uniq -c | sort -rn

# Pluck a custom field
acli jira workitem view TEAM-1 --json \
  | jq '.fields.customfield_10016'
```

## Piping with `jq`

Patterns that come up repeatedly:

```bash
# All keys
jq -r '.issues[].key'

# Key + summary TSV
jq -r '.issues[] | [.key, .fields.summary] | @tsv'

# Filter by status
jq '.issues[] | select(.fields.status.name == "Done")'

# Count
jq '.issues | length'

# All custom-field IDs present on an item
jq '.fields | keys[] | select(startswith("customfield_"))'
```

## CSV output

`--csv` emits a header row and one row per record. Column set follows the `--fields` flag.

```bash
# Default fields (issuetype,key,assignee,priority,status,summary)
acli jira workitem search --jql "project = TEAM" --paginate --csv > team.csv

# Custom columns
acli jira workitem search --jql "project = TEAM" --paginate \
  --fields "key,summary,assignee,status,priority,created,updated" \
  --csv > team-detailed.csv
```

CSV is simpler than JSON for spreadsheet handoff and works cleanly with `csvkit`, `xsv`, or `Miller (mlr)`.

## Redirection, chaining, piping

From the official docs:

```bash
# Redirect to file
acli jira workitem search --jql 'project = TEST' --limit 10 --csv > output.csv

# Chain with &&
acli jira workitem search --jql 'project = TEST' --limit 10 && echo "Completed"

# Pipe through grep
acli jira workitem search --jql 'project = ACLI' --limit 10 | grep "To Do"

# Pipe through jq
acli jira workitem view ACLI-100 --json | jq '.fields.summary'
```

The default human-readable table is stable enough for `grep`/`awk` inspection, but not for production parsing — use `--json` or `--csv`.

## Confirmation, errors, batches

| Flag             | Purpose                                                                   |
| ---------------- | ------------------------------------------------------------------------- |
| `-y, --yes`      | Skip the interactive confirmation prompt. **Required in CI.**              |
| `--ignore-errors`| Continue after a per-item failure in a batch.                              |
| `--generate-json`| Emit an input-template JSON document to stdout.                            |
| `--from-json`    | Read payload from a JSON file.                                             |
| `--from-csv`     | Read payload from a CSV file (create-bulk, link create).                   |
| `--from-file`    | Read a plain-text list (summary/description file, or list of keys).        |

`--yes` and `--ignore-errors` are independent:

- Without `--yes`, `acli` prints a preview and waits for user confirmation on stdin. In CI this causes the command to hang until the pipeline times out.
- Without `--ignore-errors`, the first item that fails aborts the remaining batch.

## Error handling & trace IDs

When something fails server-side, `acli` prints:

```
unexpected error, trace id: XXXXXXXX
```

The trace ID is the only thing Atlassian Support can correlate. Capture it in logs:

```bash
acli jira workitem create --project TEAM --type Task --summary "Ship it" 2>&1 \
  | tee -a acli.log
```

There is **no `--verbose` or `--debug` flag**. If a command misbehaves and you need more context, options are:

- Re-run with `--json` — error bodies may include more detail in JSON form.
- Fall back to the equivalent REST call with curl — `-v` gives wire-level detail.
- File a support ticket with the trace ID.

## Dry-run pattern (the CLI has none built in)

There is no `--dry-run` on any `acli` command. For high-blast-radius batches, wrap the operation:

```bash
#!/usr/bin/env bash
set -euo pipefail

JQL="project = TEAM AND status = Backlog"
NEW_STATUS="In Progress"

echo "Preview — items that would transition to '$NEW_STATUS':"
acli jira workitem search --jql "$JQL" --paginate \
  --fields "key,summary,assignee" --csv

read -rp "Type YES to proceed: " confirm
[[ "$confirm" == "YES" ]] || { echo "Aborted."; exit 1; }

acli jira workitem transition --jql "$JQL" --status "$NEW_STATUS" \
  --yes --ignore-errors --json > transition.log
```

## CI pipelines

Three pieces to every pipeline:

1. **Install a pinned binary.** Do not use `latest/` in production — a same-day minor bump has broken pipelines in the field.
2. **Authenticate via stdin-piped token** against a bot account.
3. **Always pass `--yes`** on mutating commands.

### GitHub Actions

```yaml
name: Sync Jira
on: { workflow_dispatch: {} }

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Install acli
        run: |
          curl -sSL -o /usr/local/bin/acli \
            "https://acli.atlassian.com/linux/1.3.13/acli_linux_amd64/acli"
          chmod +x /usr/local/bin/acli
          acli --version

      - name: Authenticate
        run: |
          echo "${{ secrets.ATLASSIAN_BOT_TOKEN }}" | acli jira auth login \
            --site "${{ vars.ATLASSIAN_SITE }}" \
            --email "${{ vars.ATLASSIAN_BOT_EMAIL }}" \
            --token

      - name: Run batch transition
        run: |
          acli jira workitem transition \
            --jql "project = REL AND fixVersion = '${{ inputs.release }}' AND status = 'Ready'" \
            --status "Released" --yes --ignore-errors --json
```

### Bitbucket Pipelines (Atlassian's sample pattern)

```yaml
image: atlassian/default-image:3
pipelines:
  default:
    - step:
        name: Jira sync
        script:
          - curl -LO "https://acli.atlassian.com/linux/1.3.13/acli_linux_amd64/acli"
          - chmod +x ./acli
          - echo "$BOT_API_TOKEN" | ./acli jira auth login \
              --email "$BOT_EMAIL" --site "$SITE" --token
          - ./acli jira workitem search --jql "updated > -1d" --paginate --csv > changes.csv
```

### GitLab CI

```yaml
sync-jira:
  image: curlimages/curl:latest
  script:
    - curl -LO "https://acli.atlassian.com/linux/1.3.13/acli_linux_amd64/acli"
    - chmod +x acli
    - echo "$ATLASSIAN_BOT_TOKEN" | ./acli jira auth login --site "$ATLASSIAN_SITE" --email "$ATLASSIAN_BOT_EMAIL" --token
    - ./acli jira workitem search --jql "project = TEAM AND updated > -1d" --paginate --json > changes.json
  artifacts:
    paths: [changes.json]
```

### Points-based rate limits (2026)

Atlassian is rolling out a per-organization point-based rate-limit scheme (65k–500k points/hour depending on plan tier, per-org bucket) for the REST API that `acli` calls under the hood. A batch edit over 3000 items can exhaust the hourly budget in one shot and produce 429s for the rest of the hour.

Mitigation:

- Spread work across the hour, not all at once.
- Prefer `--jql` scoped batches of predictable size over full-project sweeps.
- Capture 429 responses (trace ID + HTTP status appear in output) and implement retry-after backoff in wrapper scripts.
