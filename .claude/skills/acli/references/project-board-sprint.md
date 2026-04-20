# Projects, boards, sprints, filters, dashboards, fields

Everything outside the `workitem` surface. These commands are narrower but share the same output conventions (`--json`, `--csv`, `--paginate`, `--limit`) and the same confirmation/error flags on mutations (`--yes`, `--ignore-errors`).

## Table of contents

1. [Projects](#projects)
2. [Boards](#boards)
3. [Sprints](#sprints)
4. [Filters](#filters)
5. [Dashboards](#dashboards)
6. [Custom fields](#fields)

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

### update

```bash
# Change the key (takes effect across all linked work items)
acli jira project update --project-key "TEAM1" --key "TEAM"

# Multi-field update via JSON
acli jira project update --project-key "TEAM1" --from-json project-changes.json

# Scaffold
acli jira project update --generate-json
```

`--project-key` identifies the project to update; `--key` is the new key value.

### archive / restore / delete

```bash
acli jira project archive --key "TEAM"
acli jira project restore --key "TEAM"
acli jira project delete --key "TEAM" --yes
```

## <a id="boards"></a>Boards (`acli jira board`)

Subcommands: `search`, `list-sprints`.

### search

```bash
acli jira board search
acli jira board search --name "team" --type scrum
acli jira board search --project TEAM --paginate --csv
```

Flags:

| Flag        | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `--name`    | Case-insensitive partial match                                          |
| `--type`    | `scrum` · `kanban` · `simple`                                           |
| `--project` | Project key filter                                                      |
| `--filter`  | Saved filter ID (**not supported for next-gen / team-managed boards**) |
| `--orderBy` | `name` · `-name` · `+name`                                              |
| `--private` | Include private boards (name/type filters ignored when set)             |
| `--limit`   | Default **50**                                                          |
| `--paginate`| Pull all pages                                                          |

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

Only subcommand: `list-workitems`.

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

**Adding items to a sprint is NOT supported by `acli`.** See `references/gotchas.md` for the REST fallback.

## <a id="filters"></a>Filters (`acli jira filter`)

Subcommands: `list`, `search`, `add-favourite`, `change-owner`.

### list

```bash
# My filters
acli jira filter list --my

# Starred filters
acli jira filter list --favourite

# JSON output
acli jira filter list --my --json
```

### search

```bash
acli jira filter search --name "release"
acli jira filter search --owner "user@example.com"
acli jira filter search --name "release" --owner "user@example.com" --csv --paginate
```

Search params are ANDed. Default limit **30**. `--paginate` to bypass.

### add-favourite / change-owner

```bash
acli jira filter add-favourite --id 10001
acli jira filter change-owner --id 10001 --owner "newowner@example.com"
```

## <a id="dashboards"></a>Dashboards (`acli jira dashboard`)

Only subcommand: `search`. Same flag shape as `filter search`:

```bash
acli jira dashboard search
acli jira dashboard search --name "sprint health" --owner "user@example.com"
acli jira dashboard search --paginate --csv
```

## <a id="fields"></a>Custom fields (`acli jira field`)

Subcommands: `create`, `delete`, `cancel-delete`.

### create

```bash
acli jira field create \
  --name "Customer Name" \
  --type "com.atlassian.jira.plugin.system.customfieldtypes:textfield"

# Select field with a multi-select searcher
acli jira field create \
  --name "Priority Level" \
  --type "com.atlassian.jira.plugin.system.customfieldtypes:select" \
  --searcherKey "com.atlassian.jira.plugin.system.customfieldtypes:multiselectsearcher"

# Date picker
acli jira field create \
  --name "Release Date" \
  --type "com.atlassian.jira.plugin.system.customfieldtypes:datepicker" \
  --description "The planned release date"
```

`--type` takes the Atlassian field-type key, **not** a friendly name. Common values:

| Friendly name     | Type key                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| Short text        | `com.atlassian.jira.plugin.system.customfieldtypes:textfield`                 |
| Paragraph         | `com.atlassian.jira.plugin.system.customfieldtypes:textarea`                  |
| Number            | `com.atlassian.jira.plugin.system.customfieldtypes:float`                     |
| Date picker       | `com.atlassian.jira.plugin.system.customfieldtypes:datepicker`                |
| Select list (single) | `com.atlassian.jira.plugin.system.customfieldtypes:select`                 |
| Select list (multi)  | `com.atlassian.jira.plugin.system.customfieldtypes:multiselect`            |
| Checkbox          | `com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes`           |
| User picker (single) | `com.atlassian.jira.plugin.system.customfieldtypes:userpicker`             |
| URL               | `com.atlassian.jira.plugin.system.customfieldtypes:url`                       |
| Labels            | `com.atlassian.jira.plugin.system.customfieldtypes:labels`                    |

The full catalog is available in Jira's field-type admin UI.

### delete / cancel-delete

Field deletion is a two-phase operation in Jira (scheduled, then executed). `cancel-delete` undoes a pending deletion if the field has not yet been removed.
