---
id: project-variables
title: 'Project variables and the instance-identity anchor'
load_when: 'a {{VAR}} or <<VAR>>, an environment, the Jira host or a Jira field, .agents/project.yaml, any project value'
triggers: ['\{\{[^}]+\}\}', '<<[A-Z_]+>>', 'project\.yaml', '\benvironment', '\bentorno', '\bstaging\b', '\bproduction\b', '\bATLASSIAN', '\b(?:jira|atlassian) (?:host|url|site)\b', '\b(?:host|url|sitio) de (?:jira|atlassian)\b', '\bjira\.', '\bactive_env\b', '\bvariab']
paths: ['.agents/project.yaml', '.agents/jira-required.yaml', 'config/variables.ts', '.env.example']
---

# Project variables

## 7. PROJECT VARIABLES: POINTER

> ALL variable syntax + Jira field references documented in **`.agents/README.md`**. READ ONCE per session, cache values.

Project values live in **`.agents/project.yaml`**: load once per session, cache. NEVER hardcode identity, env URLs, Jira URL, project key, MCP names.

**Variable syntaxes** (full ref → `.agents/README.md`):

- `{{VAR_NAME}}` → static project var (flat or env-scoped via `environments[active_env].<var>`). Examples: `{{PROJECT_KEY}}`, `{{WEB_URL}}`, `{{environments.<env>.web_url}}`.
- `<<VAR_NAME>>` → session var computed at runtime (e.g. `<<ISSUE_KEY>>` from git branch). Never persisted.
- `{{jira.*}}` → Jira custom fields + workflow refs (see `.agents/jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`). Sub-forms: `{{jira.<slug>.<option>}}`, `{{jira.work_type.<slug>}}`, `{{jira.transition.<work_type>.<slug>}}`.

**Active env**: `active_env` defaults to `testing.default_env` in `.agents/project.yaml`. User says "test against production" → switch `active_env` to `production` for that session, ignore `default_env` until session ends.

**INSTANCE-IDENTITY ANCHOR (binding)**: the Atlassian host is `.agents/project.yaml` → `issue_tracker.atlassian_url` and **NOWHERE ELSE locally**. `ATLASSIAN_URL` is NOT a `.env` variable: it is absent from `.env` and `.env.example` on purpose, because a second copy is what goes stale. Canonical resolver: `cli/lib/atlassian-instance.ts`, never read `process.env.ATLASSIAN_URL` directly in a new script. From a shell, call the accessor: `bun run --silent jira:url` (base URL) / `--slug` (bare host for `acli --site`; NEVER hand-strip `https://`). This binds the TEST RUNTIME too: `config/variables.ts` resolves the host through the same resolver, so `config.tms.jira.url` — which the Jira-Direct TMS provider uses to WRITE results back onto issues — cannot be misdirected by an inherited variable. The resolver still reads the env var LAST as a transitional fallback for a repo whose yaml is unset; on disagreement the yaml wins AND a warning names both values, because a hit there means a stale copy is loose in the environment. **Deliberate inversion vs. `project_key`**, where the env var wins: a project key is a legitimate per-run override, the host is project identity that changes on site migrations: the exact value that goes stale. Credentials (`ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`) stay env-only and are NEVER mirrored into the versioned yaml; the host is a public hostname, not a secret, so the reverse split is safe. `scripts/agents-setup.ts` refuses to seed this one field from the environment (`envVar: null`) so an unattended run can never overwrite the versioned value. The NAME survives only as an optional CI variable, pushed FROM the yaml by `bun run setup --variables` (manifest `valueSource: 'atlassian-instance'`); `regression.yml` deliberately has no `ATLASSIAN_URL` secret, since CI reads the checked-out yaml. Class-wide guard: `bun run vars:env:check` fails on ANY `.env`-sourced manifest var whose process value differs from `.env`, and warns when a yaml-sourced var still has a dead line in `.env`. Applies the test: **does a stale value here corrupt data in silence, or fail loudly?** Silent corruption → one versioned source, no local duplicate, is not optional. Since the variables split, `config/variables.ts` resolves the host through `config/variables.core.ts`, which is SYNCED, so a project that adapted its environment map still receives resolver fixes. (binding: `/acli`; enforced: `bun run vars:env:check`)
