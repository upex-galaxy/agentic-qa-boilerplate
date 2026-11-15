---
id: project-variables
title: 'Project variables and the instance-identity anchor'
load_when: 'a {{VAR}} or <<VAR>>, an environment, the Jira host or a Jira field, .agents/project.yaml, any project value'
triggers: ['\{\{[^}]+\}\}', '<<[A-Z_]+>>', 'project\.yaml', '\benvironment', '\bstaging\b', '\bproduction\b', '\bATLASSIAN', '\b(?:jira|atlassian) (?:host|url|site)\b', '\bjira\.', '\bactive_env\b', '\bvariab']
paths: ['.agents/project.yaml', '.agents/jira-required.yaml', 'config/variables.ts', '.env.example']
---

# Project variables

## 7. PROJECT VARIABLES: POINTER

> Every variable syntax and Jira field reference is documented in `.agents/README.md`. Read it once per session and cache the values.

Project values live in `.agents/project.yaml`: load it once per session and cache it. NEVER hardcode identity, env URLs, Jira URL, project key, MCP names.

### Variable syntaxes

Full reference in `.agents/README.md`.

- `{{VAR_NAME}}` is a static project variable, flat or env-scoped through `environments[active_env].<var>`. Examples: `{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{environments.<env>.web_url}}`.
- `<<VAR_NAME>>` is a session variable computed at runtime (for example `<<ISSUE_KEY>>` from the git branch). It is never persisted.
- `{{jira.*}}` covers Jira custom fields and workflow references (see `.agents/jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`). Sub-forms: `{{jira.<slug>.<option>}}`, `{{jira.work_type.<slug>}}`, `{{jira.transition.<work_type>.<slug>}}`.

### Active environment

`active_env` defaults to `testing.default_env` in `.agents/project.yaml`. When the person says "test against production", switch `active_env` to `production` for that session and ignore `default_env` until it ends.

### Instance-identity anchor

The Atlassian host is `.agents/project.yaml` > `issue_tracker.atlassian_url` and nowhere else locally. `ATLASSIAN_URL` is not a `.env` variable: it is absent from `.env` and `.env.example` on purpose, because a second copy is what goes stale. The test behind the rule: does a stale value here corrupt data in silence, or fail loudly? Silent corruption calls for one versioned source and no local duplicate.

| Aspect | Rule |
| --- | --- |
| Resolver | `cli/lib/atlassian-instance.ts` is canonical. A new script reads the host through it, not through `process.env.ATLASSIAN_URL`. From a shell, call the accessor: `bun run --silent jira:url` for the base URL, `--slug` for the bare host that `acli --site` takes (do not strip `https://` by hand). |
| Test runtime | `config/variables.ts` resolves the host through the same resolver, by way of `config/variables.core.ts`, which is synced, so a project that adapted its environment map still receives resolver fixes. That keeps `config.tms.jira.url`, which the Jira-Direct TMS provider uses to write results back onto issues, from being misdirected by an inherited variable. |
| Fallback | The resolver still reads the env var last, as a transitional fallback for a repo whose yaml is unset. When the two disagree the yaml wins and a warning names both values, because a hit there means a stale copy is loose in the environment. |
| Inversion against `project_key` | For `project_key` the env var wins, since a project key is a legitimate per-run override. The host is project identity that changes on site migrations, which is the value that goes stale. |
| Credentials | `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN` stay env-only and never get mirrored into the versioned yaml. The host is a public hostname, not a secret, so the reverse split is safe. |
| Setup and CI | `scripts/agents-setup.ts` refuses to seed this field from the environment (`envVar: null`), so an unattended run cannot overwrite the versioned value. The name survives only as an optional CI variable pushed from the yaml by `bun setup --variables` (manifest `valueSource: 'atlassian-instance'`). `regression.yml` has no `ATLASSIAN_URL` secret on purpose, since CI reads the checked-out yaml. |
| Class-wide guard | `bun run vars:env:check` fails on any `.env`-sourced manifest variable whose process value differs from `.env`, and warns when a yaml-sourced variable still has a dead line in `.env`. |

(binding: `/acli`; enforced: `bun run vars:env:check`)
