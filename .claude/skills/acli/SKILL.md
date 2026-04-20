---
name: acli
description: "Atlassian CLI (official `acli` binary, GA 2025) for Jira Cloud and org admin tasks from the terminal. Use whenever the user wants to create, view, edit, transition, assign, clone, archive, comment on, link, or bulk-operate on Jira work items; list or manage projects, boards, sprints, filters, dashboards, or custom fields; activate/deactivate users at the org level; or authenticate to Atlassian from a shell or CI pipeline. Triggers on: `acli`, Atlassian CLI, Jira from the terminal, bulk Jira operations, scripting Jira, automate Jira tickets, transition a bunch of issues, create issues from a JSON/CSV file, CI pipeline that touches Jira, log in to Jira CLI, switch Atlassian sites, API-token auth for Jira. Use this skill even when the user does not say the word `acli` — if the task is CLI-driven Jira work, this is the right tool. Do NOT use for: Atlassian MCP server work (that is a different integration), REST-API-only workflows where no CLI is involved, Confluence or Bitbucket command-line needs (acli does not cover them yet), or the legacy Appfire/Bob Swift `acli` tool (a different product that happens to share the binary name)."
license: MIT
compatibility: [claude-code, cursor, codex, opencode]
allowed-tools: Bash(acli:*)
---

# Atlassian CLI (`acli`)

`acli` is Atlassian's official command-line tool for Jira Cloud and org admin operations, released in 2025. It replaces terminal-based Jira automation that previously required raw REST calls, and it unifies Jira + admin actions behind one binary with one credential store.

This skill teaches how to drive `acli` for any intent: one-off commands, batch mutations, scripted pipelines, and CI jobs.

## Why this skill exists

`acli` has three traits that make it easy to misuse:

1. **Silent pagination truncation.** `workitem search` without `--paginate` returns the first page only — no warning. Scripts that count or iterate keys read the wrong number of items.
2. **Product-scoped auth.** `acli jira auth login` does not authenticate you for `acli admin` or `acli rovodev`. Each product has its own login.
3. **The "work item" vs "issue" split.** The CLI renamed commands (`jira issue` → `jira workitem`) but the JSON response still has a top-level `issues[]` array and CSV inputs still use `issueType`/`parentIssueId` spellings. Mixing old and new terminology in the same script works, but confuses readers.

The body below covers the core that applies to almost every session. The `references/` directory holds the deep material — load only the one you need.

## Command structure

```
acli <product> [<feature>] <action> [flags]
```

| Product   | Purpose                                                   |
| --------- | --------------------------------------------------------- |
| `jira`    | Jira Cloud — work items, projects, boards, sprints, etc.  |
| `admin`   | Organization admin — API-key-auth, user lifecycle         |
| `rovodev` | Rovo Dev AI coding agent (separate beta product)          |
| `feedback`| Send feedback or a bug report to Atlassian                |

Every level has `--help`. Use it aggressively when unsure:

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
  --site "mysite.atlassian.net" \
  --email "you@example.com" \
  --token

# 2. Verify
acli jira auth status

# 3. Create a work item
acli jira workitem create --project "TEAM" --type "Task" --summary "Draft the Q3 OKRs"

# 4. Search with JQL — ALWAYS pass --paginate or --limit explicitly
acli jira workitem search --jql "project = TEAM AND status = 'To Do'" --paginate --json

# 5. Transition one or many
acli jira workitem transition --jql "project = TEAM AND assignee = currentUser()" \
  --status "In Progress" --yes --ignore-errors
```

## Top-level command map

### Jira (`acli jira`)

| Subcommand                        | What it covers                                            |
| --------------------------------- | --------------------------------------------------------- |
| `auth`                            | login / logout / status / switch — API-token or OAuth     |
| `workitem`                        | archive · assign · attachment · clone · comment · create · create-bulk · delete · edit · link · search · transition · unarchive · view · watcher |
| `project`                         | archive · create · delete · list · restore · update · view |
| `board`                           | search · list-sprints                                     |
| `sprint`                          | list-workitems                                            |
| `filter`                          | add-favourite · change-owner · list · search              |
| `dashboard`                       | search                                                    |
| `field`                           | create · delete · cancel-delete (custom fields)           |

### Admin (`acli admin`)

| Subcommand | What it covers                               |
| ---------- | -------------------------------------------- |
| `auth`     | login / logout / status / switch — API key   |
| `user`     | activate · deactivate · delete · cancel-delete|

## The selector pattern (the thing to internalize)

Most mutating `workitem` commands (`edit`, `transition`, `assign`, `archive`, `clone`, `comment create`) accept **one of** these target selectors:

| Selector         | When to use                                                     |
| ---------------- | --------------------------------------------------------------- |
| `--key KEY-1,KEY-2` | You already know the exact keys                              |
| `--jql "..."`    | You want everything matching a JQL query                        |
| `--filter 10001` | You want to reuse a saved Jira filter                           |
| `--from-file f`  | You have a file listing keys (`archive`/`unarchive`/`assign`)   |

When the selector matches many items, the command is **a batch operation**. Two flags almost always matter:

- `-y, --yes` — skip the interactive confirmation prompt. Required in CI; if omitted the command hangs waiting on stdin.
- `--ignore-errors` — do not abort the batch when a single item fails.

## Output and piping

All list/search/view commands support three shapes:

- default table (human-readable)
- `--json` (for `jq` / scripts)
- `--csv` (spreadsheet-friendly)

Example pipe patterns:

```bash
# Count only
acli jira workitem search --jql "project = TEAM" --count

# Save full result set to CSV
acli jira workitem search --jql "project = TEAM" --paginate --csv > team.csv

# Extract a single field with jq
acli jira workitem view TEAM-123 --json | jq '.fields.summary'
```

The JSON shape from `workitem search` has a top-level `issues` array (not `workitems`) — the Jira REST v3 wire format shows through.

## Four gotchas to keep in mind always

1. **`--paginate` is opt-in.** Default limit is server-side (30–50 depending on command). No warning on truncation. If you are counting, iterating, or making decisions based on the result, pass `--paginate`.
2. **Custom fields go through `--from-json`, not flags.** There is no `--custom-field` flag. The payload shape for `edit` is flat: `{"issues":["KEY-1"],"customfield_10122":"value"}` — **not** the `{"fields": {...}}` shape you would send to REST.
3. **Transitions match by status name, not transition ID.** When two transitions lead to the same status with different validators, the CLI picks one and may fail. No `--transition-id` escape hatch exists — fall back to REST if this hits.
4. **Trace IDs are the only debug signal.** An `unexpected error, trace id: XXXXXXXX` line is all you get on backend failures. Capture and log the trace ID always; Atlassian Support needs it.

## Navigation — when to load which reference

Load the reference that matches the user's current need. Do not preload all of them.

| If the user wants to…                                                | Load                                        |
| -------------------------------------------------------------------- | ------------------------------------------- |
| Log in, switch sites, handle tokens, authenticate in CI              | `references/auth.md`                        |
| Work with Jira tickets (create, edit, transition, search, bulk, comments, links, watchers) | `references/workitem.md`  |
| Manage projects, boards, sprints, filters, dashboards, fields        | `references/project-board-sprint.md`       |
| Run org-level admin tasks (API key, user lifecycle)                  | `references/admin.md`                       |
| Pipe output, produce JSON/CSV, dry-run, run on CI/CD                 | `references/output-and-automation.md`      |
| Diagnose surprising behavior, known bugs, REST fallback points       | `references/gotchas.md`                     |

## Working style

- **Prefer API-token auth in scripted contexts.** `--web` / OAuth is for humans at a terminal.
- **Always pass `--yes` in CI** for any mutating command.
- **Always pass `--paginate`** when a downstream script consumes the result.
- **Scaffold complex payloads with `--generate-json`** (create, edit, project create, project update, link create, create-bulk). Pipe to a file, edit, submit with `--from-json`.
- **Capture the trace ID on any failure** and surface it when reporting to the user.
- **Do not invent flags.** When unsure, run `acli <path> --help` — it is authoritative and version-pinned to the installed binary.
- **Know what `acli` cannot do.** Sprint assignment, rich-ADF comments on create, retrieving the auth token, transition-by-ID, and Confluence/Bitbucket operations require REST. See `references/gotchas.md`.

## Installation (reference only)

Users usually already have `acli` installed. If not, point them at:

- Official guide: https://developer.atlassian.com/cloud/acli/guides/install-acli/
- CI one-liner (Linux): `curl -LO "https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli" && chmod +x acli`

Pin to a version URL in production pipelines — `latest/` has caused same-day mass failures.

Each `acli` release is supported for six months. Run `acli --version` to check.
