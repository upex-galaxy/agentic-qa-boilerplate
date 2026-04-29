# Projects, boards, sprints, filters, dashboards, fields

Everything outside the `workitem` surface. These commands are narrower but share the same output conventions (`--json`, `--csv`, `--paginate`, `--limit`) and the same confirmation/error flags on mutations (`--yes`, `--ignore-errors`).

## Table of contents

1. [Projects](#projects)
2. [Boards](#boards)
3. [Sprints](#sprints)
4. [Filters](#filters)
5. [Dashboards](#dashboards)
6. [Custom fields (definitions, NOT values)](#fields)

## <a id="projects"></a>Projects (`acli jira project`)

Subcommands: `create`, `view`, `list`, `update`, `archive`, `restore`, `delete`.

### list

```bash
# All visible projects — default limit 30
acli jira project list

# Recently viewed (up to 20)
acli jira project list --recent

# Full list for scripting
acli jira project list --paginate --json
```

`--paginate` overrides `--limit`.

### view

```bash
acli jira project view --key TEAM
acli jira project view --key TEAM --json | jq '.lead.displayName'
```

### create

Two input modes: clone an existing project, or supply a JSON payload.

```bash
# Clone from TEAM into NEWTEAM (only company-managed projects can be cloned)
acli jira project create \
  --from-project "TEAM" \
  --key "NEWTEAM" \
  --name "New Team Project" \
  --description "Cloned from TEAM" \
  --lead-email "lead@example.com" \
  --url "https://example.com"

# JSON payload
acli jira project create --generate-json > project.json
$EDITOR project.json
acli jira project create --from-json project.json
```

Notes:

- **Only company-managed projects can be cloned.** Team-managed projects cannot be used as `--from-project` sources.
- If `--lead-email` is omitted, the new project inherits the parent project's lead.
- `project create` does NOT let you pick the issue-type scheme or workflow scheme — clone-from-existing is the only way to inherit those. For projects with custom schemes, fall back to REST.

### update

```bash
# Change the key (takes effect across all linked work items)
acli jira project update --project-key "TEAM1" --key "TEAM"

# Multi-field update via JSON
acli jira project update --project-key "TEAM1" --from-json project-changes.json

# Scaffold
acli jira project update --generate-json
```

`--project-key` identifies the project to update; `--key` is the new key value. Updatable fields are limited to: `key, name, description, lead-email, url`. Workflow / issue-type / permission scheme changes still require REST.

### archive / restore / delete

```bash
acli jira project archive --key "TEAM"
acli jira project restore --key "TEAM"
acli jira project delete --key "TEAM" --yes
```

## <a id="boards"></a>Boards (`acli jira board`)

Subcommands: `create`, `delete`, `get`, `list-projects`, `list-sprints`, `search`.

### search

```bash
acli jira board search
acli jira board search --name "team" --type scrum
acli jira board search --project TEAM --paginate --csv
```

Flags:

| Flag         | Meaning                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| `--name`     | Case-insensitive partial match                                          |
| `--type`     | `scrum` · `kanban` · `simple`                                           |
| `--project`  | Project key filter                                                      |
| `--filter`   | Saved filter ID (**not supported for next-gen / team-managed boards**)  |
| `--order-by` | `name` · `-name` · `+name` (kebab-case — NOT `--orderBy`)               |
| `--private`  | Include private boards (name/type filters ignored when set)             |
| `--limit`    | Default **50**                                                          |
| `--paginate` | Pull all pages                                                          |

### get

```bash
# Fetch a single board by ID
acli jira board get --id 123 --json
```

### create

```bash
# Scrum board scoped to one project, sourced from a saved filter
acli jira board create \
  --name "Team Scrum" \
  --type scrum \
  --filter-id 10001 \
  --location-type project \
  --project TEAM \
  --json

# Kanban board scoped to a user's location
acli jira board create \
  --name "Personal Kanban" \
  --type kanban \
  --filter-id 10042 \
  --location-type user
```

Flags:

| Flag              | Meaning                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `--name`          | Board name (required)                                            |
| `--type`          | `scrum` · `kanban`                                               |
| `--filter-id`     | Saved filter that defines what the board shows (required)        |
| `--location-type` | `project` · `user`                                               |
| `--project`       | Project key when `--location-type project`                       |
| `--json`          | Emit the created board as JSON                                   |

### delete

```bash
# Single or multiple board IDs (comma-separated)
acli jira board delete --id 123,124,125 --yes
```

### list-projects

```bash
# All projects associated with a board
acli jira board list-projects --id 123 --paginate --json
```

### list-sprints

```bash
# Required: board ID
acli jira board list-sprints --id 123

# Filter by sprint state(s)
acli jira board list-sprints --id 123 --state active,closed

# CSV for spreadsheets
acli jira board list-sprints --id 123 --paginate --csv
```

`--state` values: `future`, `active`, `closed`. Comma-separated.

## <a id="sprints"></a>Sprints (`acli jira sprint`)

Subcommands: `create`, `delete`, `list-workitems`, `update`, `view`.

### create

```bash
# Minimum: name + board
acli jira sprint create --name "Sprint 42" --board 6 --json

# Full sprint with start/end and goal
acli jira sprint create \
  --name "Sprint 42" \
  --board 6 \
  --start "2026-05-01T09:00:00.000-0300" \
  --end "2026-05-15T18:00:00.000-0300" \
  --goal "Ship the OAuth refresh flow"
```

Flags: `--name` (required), `--board` (required), `--start`, `--end`, `--goal`, `--json`. Dates are ISO-8601 with offset.

### view

```bash
acli jira sprint view --id 42 --json
```

### update

```bash
# Move sprint to active state
acli jira sprint update --id 42 --state active

# Close out and set the actual completion date
acli jira sprint update --id 42 --state closed --complete-date "2026-05-15T18:00:00.000-0300"

# Adjust dates and goal mid-sprint
acli jira sprint update --id 42 \
  --end "2026-05-17T18:00:00.000-0300" \
  --goal "Updated goal: ship OAuth + audit log"
```

Flags: `--id` (required), `--name`, `--goal`, `--state` (`future` · `active` · `closed`), `--start`, `--end`, `--complete-date`, `--board`, `--json`.

### delete

```bash
# Single or batch (comma-separated IDs)
acli jira sprint delete --id 41,42,43 --yes
```

### list-workitems

```bash
acli jira sprint list-workitems --sprint 42 --board 6

# Further filter via JQL, restrict fields, output JSON
acli jira sprint list-workitems \
  --sprint 42 --board 6 \
  --jql "assignee = currentUser()" \
  --fields "key,summary,status" \
  --paginate --json
```

Both `--sprint` (sprint ID, integer) and `--board` (board ID, integer) are required.

**Adding individual work items to a sprint is NOT supported by `acli`** (see `references/gotchas.md` for the REST fallback). You CAN create / update / close the sprint itself — just not move tickets in or out of one via the CLI.

## <a id="filters"></a>Filters (`acli jira filter`)

Subcommands: `add-favourite`, `change-owner`, `get`, `get-columns`, `list`, `reset-columns`, `search`, `update`.

### list

```bash
# My filters
acli jira filter list --my

# Starred filters
acli jira filter list --favourite

# JSON output
acli jira filter list --my --json
```

### get

```bash
# Single filter detail
acli jira filter get --id 10001 --json

# Open in browser
acli jira filter get --id 10001 --web
```

### search

```bash
acli jira filter search --name "release"
acli jira filter search --owner "user@example.com"
acli jira filter search --name "release" --owner "user@example.com" --csv --paginate
```

Search params are ANDed. Default limit **30**. `--paginate` to bypass.

### add-favourite

```bash
acli jira filter add-favourite --filter-id 10001
```

**Flag is `--filter-id`, NOT `--id`.** This is the only filter subcommand with that exception — `change-owner`, `update`, `reset-columns` all use `--id`.

### change-owner

```bash
# Single
acli jira filter change-owner --id 10001 --owner "newowner@example.com"

# Bulk via file (one ID per line)
acli jira filter change-owner --from-file filter-ids.txt --owner "newowner@example.com" --ignore-errors --json
```

### update

```bash
# Update name/description
acli jira filter update --id 10001 --name "Active sprint" --description "Open issues in active sprint"

# Update the JQL backing the filter
acli jira filter update --id 10001 --jql "project = TEAM AND sprint in openSprints()"

# Update share / edit permissions (JSON arrays per the Jira REST contract)
acli jira filter update --id 10001 --share-permissions '[{"type":"project","projectId":"10000"}]'
```

Flags: `--id` (required), `--name`, `--description`, `--jql`, `--share-permissions`, `--edit-permissions`, `--json`.

### get-columns / reset-columns

Filters can override the default issue-list columns shown in Jira's UI. These two commands inspect and reset that override.

```bash
# Inspect (--key takes a filter ID despite the flag name)
acli jira filter get-columns --key 10001 --json

# Reset to the default project / global columns
acli jira filter reset-columns --id 10001
```

## <a id="dashboards"></a>Dashboards (`acli jira dashboard`)

Only subcommand: `search`. Same flag shape as `filter search`:

```bash
acli jira dashboard search
acli jira dashboard search --name "sprint health" --owner "user@example.com"
acli jira dashboard search --paginate --csv
```

## <a id="fields"></a>Custom fields (`acli jira field`)

Subcommands: `cancel-delete`, `create`, `delete`, `update`.

> **Important — what this group does and does not do**:
>
> - **What it manages**: custom-field DEFINITIONS at the site/admin level (the schema — name, type, description, searcher).
> - **What it does NOT manage**: custom-field VALUES on individual work items (use `workitem create --from-json` with `additionalAttributes` instead — and even that has limitations; see `references/workitem.md` §Custom fields).
> - **What is missing entirely**: there is **no `list`, `get`, `view`, or `search` subcommand**. To enumerate all custom fields on a site, fall back to REST `GET /rest/api/3/field`.
> - **What is also missing**: there is no command to manage select/dropdown OPTIONS for an existing field. To add or remove dropdown options, fall back to REST `/rest/api/3/field/{fieldId}/option`.

### create

```bash
acli jira field create \
  --name "Customer Name" \
  --type "com.atlassian.jira.plugin.system.customfieldtypes:textfield"

# Select field with a multi-select searcher
acli jira field create \
  --name "Priority Level" \
  --type "com.atlassian.jira.plugin.system.customfieldtypes:select" \
  --searcher-key "com.atlassian.jira.plugin.system.customfieldtypes:multiselectsearcher"

# Date picker with description
acli jira field create \
  --name "Release Date" \
  --type "com.atlassian.jira.plugin.system.customfieldtypes:datepicker" \
  --description "The planned release date"
```

Flags: `--name`, `--type`, `--searcher-key` (kebab-case — NOT `--searcherKey`), `--description`, `--json`.

`--type` takes the Atlassian field-type key, **not** a friendly name. Common values:

| Friendly name        | Type key                                                                      |
| -------------------- | ----------------------------------------------------------------------------- |
| Short text           | `com.atlassian.jira.plugin.system.customfieldtypes:textfield`                 |
| Paragraph            | `com.atlassian.jira.plugin.system.customfieldtypes:textarea`                  |
| Number               | `com.atlassian.jira.plugin.system.customfieldtypes:float`                     |
| Date picker          | `com.atlassian.jira.plugin.system.customfieldtypes:datepicker`                |
| Datetime picker      | `com.atlassian.jira.plugin.system.customfieldtypes:datetime`                  |
| Select list (single) | `com.atlassian.jira.plugin.system.customfieldtypes:select`                   |
| Select list (multi)  | `com.atlassian.jira.plugin.system.customfieldtypes:multiselect`              |
| Checkbox             | `com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes`           |
| User picker (single) | `com.atlassian.jira.plugin.system.customfieldtypes:userpicker`               |
| User picker (multi)  | `com.atlassian.jira.plugin.system.customfieldtypes:multiuserpicker`           |
| Cascading select     | `com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect`           |
| URL                  | `com.atlassian.jira.plugin.system.customfieldtypes:url`                       |
| Labels               | `com.atlassian.jira.plugin.system.customfieldtypes:labels`                    |

The full catalog is available in Jira's field-type admin UI.

### update

```bash
# Rename a custom field
acli jira field update --id customfield_10122 --name "Updated Field Name"

# Update description and searcher
acli jira field update --id customfield_10122 \
  --description "Now used for the audit-log link" \
  --searcher-key "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher"

# Multi-property update via JSON
acli jira field update --id customfield_10122 --from-json field-changes.json
```

Flags: `--id` (required), `--name`, `--description`, `--searcher-key`, `--from-json`, `--json`. Note: changing `--type` after creation is NOT supported by Jira itself — to change a field's type you must delete and recreate.

### delete / cancel-delete

Field deletion is a two-phase operation in Jira (scheduled, then executed). `cancel-delete` undoes a pending deletion if the field has not yet been removed.

```bash
# Schedule a field for deletion
acli jira field delete --id customfield_10122

# Cancel before the scheduled deletion runs
acli jira field cancel-delete --id customfield_10122
```
