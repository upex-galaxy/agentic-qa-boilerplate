# `.agents/` — agent-consumed project configuration

Tool-agnostic source of truth for the data AI agents need to operate on this repository.

## Purpose

`.agents/` separates portable, per-project values from the implementation detail of any specific agent (`.claude/`, `.cursor/`, `.gemini/`, …). Whenever a skill, command, template or doc references a variable like `{{PROJECT_NAME}}` or `{{jira.severity}}`, the resolver looks here first.

The directory has two roles:

1. **Per-project config** — values you fill in once when you adopt the boilerplate (`project.yaml`).
2. **Workspace-resolved metadata** — auto-generated catalogs of your Jira workspace's custom fields (`jira.json`) and workflows (`jira-workflows.json`), both validated against the methodology's declarative manifest (`jira-required.yaml`).

## Files

| File | What it is | Who edits it | How to regenerate |
|---|---|---|---|
| `project.yaml` | Human-edited project config: project name, repo paths, URLs, MCP server names, issue-tracker metadata, default env. | You (project owner) | `bun run agents:setup` (future S6 CLI) or edit by hand. |
| `jira.json` | Auto-generated catalog of every custom field in your Jira workspace, keyed by canonical slug. Each entry has `id`, `type`, optional `name`, `options`, `system`, `provider`. | Generated only — **do not edit by hand** | `bun run jira:sync-fields` |
| `jira-workflows.json` | Auto-generated catalog of workflow statuses + transitions per `work_type`, keyed by canonical slug. Each `work_type` entry has `jira_issue_type`, `workflow_scheme`, `workflow`, `statuses`, `transitions`. | Generated only — **do not edit by hand** | `bun run jira:sync-workflows` |
| `jira-required.yaml` | Declarative manifest of the custom fields AND `work_types:` (issue types + canonical statuses + canonical transitions) the methodology requires. The contract between skills and the user's Jira. | Methodology maintainers | Updated when a skill adds or drops a `{{jira.<slug>}}` / `{{jira.work_type.*}}` / `{{jira.status.*}}` / `{{jira.transition.*}}` reference. |
| `README.md` | This file. | Methodology maintainers | — |

## Variable syntax conventions

Three syntaxes coexist across skills, commands and docs. Each resolves from a different place:

| Syntax | Meaning | Resolves from | Validated by |
|---|---|---|---|
| `{{VAR_NAME}}` | **Project variable** — static, per-repo value configured once. Two flavours: **flat** (top-level section, e.g. `{{PROJECT_KEY}}` → `project.project_key`) and **env-scoped** (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_MCP}}`, `{{API_MCP}}`) which resolve to the active environment's value. | `.agents/project.yaml`. Flat keys are looked up lexically (`{{PROJECT_NAME}}` → `project.project_name`). Env-scoped keys resolve via the active env (see below). | `bun run lint:agents` (key must exist either at top level or under at least one environment). |
| `{{environments.<env>.<var>}}` | **Explicit env-scoped reference** — bypasses active-env resolution and always points at a specific environment. Used in multi-env documents (e.g. a comparison table that shows local AND staging URLs side-by-side). | `.agents/project.yaml` → `environments.<env>.<var>` directly. | `bun run lint:agents` (env must be declared under `environments:` and var must exist under it). |
| `<<VAR_NAME>>` | **Session variable** — computed at runtime by the calling command (e.g. `<<ISSUE_KEY>>` extracted from a git branch name) or used as a sentinel marker (`<<PLACEHOLDER>>`, `<<REDACTED>>`). Never persisted. | The skill / command's runtime context. | Linter only counts them — never declared. |
| `{{jira.<slug>}}` | **Jira custom field reference** — portable pointer to a Jira custom field. | `.agents/jira-required.yaml` (canonical declaration of expected fields) AND `.agents/jira.json` (workspace-resolved IDs). Skills never hardcode `customfield_XXXXX`. | `bun run lint:agents` (slug must be declared in the manifest) AND `bun run jira:check` (slug must resolve to a real field in `jira.json`). |
| `{{jira.<slug>.<option>}}` | **Jira option-value reference** — portable pointer to a single option value of a select-type custom field. Use the two-segment form for plain `option` and `array`-of-option fields. For cascading-select (`option-with-child`) fields, use the three-segment form `{{jira.<slug>.<parent>.<child>}}` to reach a child option. | `.agents/jira.json` → `<slug>.options.<option>` for plain options, or `<slug>.options.<parent>.children.<child>` for cascading. The slug must also be declared in `.agents/jira-required.yaml`. | `bun run lint:agents` (slug must be declared in the manifest AND the option must exist in the catalog). |
| `{{jira.work_type.<slug>}}` | **Jira issue-type reference** — portable pointer to the literal issue-type name (e.g. `"Story"`, `"Bug"`, `"Test"`). Use case: `acli workitem create --type "{{jira.work_type.story}}"`. Resolves to the `name` string in the catalog. | `.agents/jira-workflows.json` → `<slug>.jira_issue_type.name`. The `<slug>` must be declared in `.agents/jira-required.yaml` under `work_types:`. | `bun run lint:agents` (slug must be declared in the manifest AND the work-type must exist in the catalog). |
| `{{jira.status.<work_type>.<slug>}}` | **Jira status reference** — portable pointer to a workflow status's literal name (e.g. `"Ready For QA"`). Use case: `acli workitem update --status "{{jira.status.story.ready_for_qa}}"`. Optional sub-keys: `.id` (numeric status id) and `.category` (`new` / `indeterminate` / `done`). | `.agents/jira-workflows.json` → `<work_type>.statuses.<slug>` (default sub-key: `.name`). Both `<work_type>` and `<slug>` must be declared in `.agents/jira-required.yaml` under `work_types.<work_type>.required_statuses`. | `bun run lint:agents` (manifest declaration + catalog presence + valid sub-key). |
| `{{jira.transition.<work_type>.<slug>}}` | **Jira transition reference** — portable pointer to a workflow transition's `id` (e.g. `"41"`). The default sub-key is `.id` because it removes the ambiguous-transition gotcha documented in `.claude/skills/acli/references/gotchas.md` — invoke transitions unambiguously via REST `POST /rest/api/3/issue/{key}/transitions` with `{"transition":{"id":"…"}}`. Optional sub-key: `.name` (transition literal name) for callers that prefer `acli`'s name-based interface. | `.agents/jira-workflows.json` → `<work_type>.transitions.<slug>` (default sub-key: `.id`). Both `<work_type>` and `<slug>` must be declared in `.agents/jira-required.yaml` under `work_types.<work_type>.required_transitions`. | `bun run lint:agents` (manifest declaration + catalog presence + valid sub-key). |

The `{{…}}` vs `<<…>>` distinction is intentional: it removes the previous ambiguity where both project data and ephemeral session data shared the same `{{VAR}}` syntax.

### Active environment

`project.yaml` has a top-level `environments:` map (defaults: `local` + `staging`; you can add `production`, `qa`, `dev`, `uat`, etc.). Each environment declares the same four leaves: `web_url`, `api_url`, `db_mcp`, `api_mcp`. Skills don't hardcode "staging" or "local" anywhere — they reference the bare form (`{{WEB_URL}}` etc.) and the AI resolves it against the **active environment** for the current session:

1. If the user explicitly chose an env this session ("run regression against production"), use that.
2. Otherwise fall back to `testing.default_env` from `project.yaml`.

When a document genuinely needs to compare environments (e.g. the constitution's environment-table or context-generator examples that demonstrate URL-shape differences), use the explicit form `{{environments.local.web_url}}` / `{{environments.staging.web_url}}` instead. Both forms are validated by `bun run lint:agents`.

## Workflows

### 5.1 New user setup

When you clone this boilerplate into a new project:

1. Copy `.env.example` to `.env` and fill in:
   - `LOCAL_USER_EMAIL` / `STAGING_USER_EMAIL` and the matching passwords (test users).
   - `ATLASSIAN_URL` / `ATLASSIAN_EMAIL` / `ATLASSIAN_API_TOKEN` (get a token at <https://id.atlassian.com/manage-profile/security/api-tokens>).
2. Run `bun run agents:setup` to walk through the project variables interactively. The CLI walks the flat sections (project, backend, frontend, database, issue_tracker, testing) first, then asks which environments your project has (default: `local` + `staging`; you can add `production`, `dev`, `qa`, `uat`, etc.) and prompts for the four env-scoped vars (`web_url`, `api_url`, `db_mcp`, `api_mcp`) in each. It validates `testing.default_env` against the env list, shows the `# TODO:` description and example for every field, and writes back to `.agents/project.yaml` preserving comments. Alternative: edit `.agents/project.yaml` by hand.
3. Run `bun run jira:sync-fields` to discover your Jira workspace's custom fields. Writes `.agents/jira.json` (~100-150 fields typical). Resolves slug collisions deterministically — see `--allow-collisions` if you hit one.
4. Run `bun run jira:sync-workflows` to discover your Jira workspace's workflow statuses + transitions for every `work_type` declared in `jira-required.yaml`. Writes `.agents/jira-workflows.json`. Interactive on first run (prompts when a canonical slug doesn't auto-resolve to a workflow's real status / transition); idempotent on subsequent runs unless you pass `--force`.
5. Run `bun run jira:check` to validate your Jira against the methodology's required-fields **and** required-`work_types` manifest. Address any output:
   - **❌ MISSING** — for a custom field: create the field in Jira admin (Settings → Issues → Custom fields) with the suggested name, type, and options. Re-run `bun run jira:sync-fields --force` then `bun run jira:check`. For a `work_type` / status / transition: amend the workflow in Jira admin so it exposes the required status / transition, then re-run `bun run jira:sync-workflows --force` then `bun run jira:check`.
   - **⚠️ MISMATCHED** — rename, retype, or extend the field in Jira so it matches the manifest, OR (if the methodology can adapt) update `jira-required.yaml`. This severity also fires when a field declared as `type: option` (or `type: option-with-child`) has an empty `options: {}` map in `jira.json` — usually a missing field-context permission; re-run `bun run jira:sync-fields` after fixing it in Jira admin.
   - **💡 INFO** — informational only; safe to ignore unless you want the optional or unmapped feature.
   - Iterate until all required fields and `work_types` are ✅ OK.
6. Run `bun run lint:agents` — should report 0 errors. Confirms every `{{VAR}}`, `{{jira.<slug>}}`, `{{jira.<slug>.<option>}}`, `{{jira.work_type.*}}`, `{{jira.status.*}}` and `{{jira.transition.*}}` reference in skills resolves against your config.

You're now ready to invoke any skill (`/sprint-testing`, `/test-documentation`, etc.) without setup friction.

### 5.2 Adding or updating a skill

When you add or edit a skill that references project values or Jira fields:

- **Project values** (paths, URLs, project keys, etc.) — use `{{VAR_NAME}}`. Add the variable to `.agents/project.yaml` with `null` plus a `# TODO:` comment so a new user knows what to fill in. The next `bun run agents:setup` (or a manual edit) will populate it.

- **Session values** (computed at runtime) — use `<<VAR_NAME>>`. No declaration needed; it's a documentation marker for the skill consumer.

- **Jira custom fields** — use `{{jira.<slug>}}`. The slug **must** be declared in `.agents/jira-required.yaml` under `required:` or `optional:`. Workflow:

  1. Identify the slug your skill needs. It must match how `bun run jira:sync-fields` slugifies the Jira field name (lowercase, underscores, no emojis/accents).
  2. Add an entry to `jira-required.yaml`:
     - `name:` — human-readable name expected in the Jira admin UI.
     - `type:` — `string` / `option` / `number` / `date` / `array` / `user` / etc.
     - `options:` — only if `type: option`; list of option slugs the methodology depends on.
     - `description:` — 1-line explanation.
     - `used_by:` — list of skill names referencing this slug.
   3. Reference `{{jira.<slug>}}` in your skill markdown.
   4. Run `bun run lint:agents` — must pass (proves the slug is declared).
   5. Run `bun run jira:check` against your own Jira. If your Jira is missing the field, create it in Jira admin and re-run `bun run jira:sync-fields --force`. End users of your skill will hit the same `bun run jira:check` flow when they adopt the change.

- **Jira option values** — when your skill needs to set a field VALUE (not just reference the field ID), use `{{jira.<slug>.<option>}}`. The option slug must be declared in the `options:` array of that field's entry in `jira-required.yaml`. If the field is `type: option-with-child`, the manifest can declare `options:` as either a flat `string[]` of parent slugs or a `Record<string, string[]>` mapping parent slugs to their declared children; consumers reach a child via the three-segment form `{{jira.<slug>.<parent>.<child>}}`. Example: a skill that sets `Severity 🚩` to "Critica" via `acli` should write `--field 'Severity 🚩={{jira.severity.critica}}'` (resolves to `--field 'Severity 🚩=10188'`). Both the slug declaration and the option presence in `.agents/jira.json` are checked by `bun run lint:agents`.

When deleting a skill or removing a `{{jira.<slug>}}` reference:

- If no other skill uses the slug, you may remove the entry from `jira-required.yaml`. Otherwise leave it — the slug is shared.
- The linter may then report `DECLARED_BUT_UNUSED` warnings; safe to ignore for transitional periods.

### 5.3 Adding a new required Jira custom field

When the methodology evolves and needs a brand-new custom field that doesn't exist anywhere yet:

1. Decide the canonical slug (lowercase, underscores, descriptive).
2. Add an entry to `jira-required.yaml` under `required:` (or `unmapped:` if it can't yet be mapped — see ATR pattern below).
3. Update relevant skills to reference `{{jira.<slug>}}`.
4. Update this README's troubleshooting section if behavior is non-trivial.
5. Communicate to all boilerplate users (release notes / changelog) that they must create the field in their Jira and rerun `bun run jira:sync-fields --force`.

**The "unmapped" pattern.** When a field is required semantically but no Jira field exists yet, put the slug under `unmapped:` with a `description:` and `used_by:`. Skills then reference it as a literal marker (e.g. `customfield_<slug>`) with HTML-comment TODOs pointing at the manifest. Once a real field is created, move the entry from `unmapped:` to `required:` (with full metadata: `name`, `type`, `options`, …) and replace the literal markers with `{{jira.<slug>}}` syntax. (This is exactly how `acceptance_test_results_atr` was migrated when ATR was first configured: it lived under `unmapped:` while skills referenced `customfield_ATR`, and was promoted once the user created the matching field in Jira admin.)

### 5.4 Adding a new required Jira `work_type` / status / transition

When the methodology evolves and needs a brand-new canonical status or transition (or a new `work_type` altogether) on top of the existing `story` / `bug` / `test_case`:

1. Decide the canonical slug (lowercase, underscores, descriptive — e.g. `ready_for_qa`, `qa_sign_off`, `re_open`). Slugs are **agnostic** — they describe the methodology, not your Jira's literal status names.
2. Add an entry to `jira-required.yaml` under `work_types.<work_type>.required_statuses.<slug>` (or `…required_transitions.<slug>`) with a 1-line `description:`. For transitions, also declare `from:` and `to:` (use the canonical status slugs, NOT literal Jira names; if it's a global transition, use `from: any`). For a brand-new `work_type`, mirror the shape of the existing `story` / `bug` / `test_case` entries (`jira_issue_type`, `description`, `required_statuses`, `required_transitions`, `used_by`).
3. Reference `{{jira.status.<work_type>.<slug>}}` (or `{{jira.transition.<work_type>.<slug>}}` / `{{jira.work_type.<slug>}}`) in your skill markdown.
4. Run `bun run lint:agents` — must pass (proves the slug is declared in the manifest).
5. Run `bun run jira:sync-workflows --force` to remap the catalog. The script auto-resolves slugs that match the workspace's actual status / transition names; if the new canonical slug doesn't auto-resolve, the script prompts interactively to map it to one of the workflow's real statuses / transitions.
6. Run `bun run jira:check` — must pass (proves the catalog now contains the resolved value for the new slug).
7. Communicate to all boilerplate users (release notes / changelog) that they must re-run `bun run jira:sync-workflows --force` after pulling the change, then `bun run jira:check` to verify their Jira workflow exposes the required status / transition (and amend their workflow in Jira admin if it doesn't).

## Commands reference

| Command | Purpose |
|---|---|
| `bun run jira:sync-fields` | Discover Jira custom fields → write `jira.json`. Flags: `--force` (overwrite), `--allow-collisions` (suffix slug duplicates), `--dry-run`, `--verbose`, `--json`. |
| `bun run jira:sync-workflows` | Discover Jira workflows (statuses + transitions per `work_type`) → write `jira-workflows.json`. Interactive on first run for slugs that don't auto-resolve. Flags: `--force` (re-prompt for already-mapped slugs), `--allow-collisions`, `--dry-run`, `--verbose`, `--json`, `--help`. |
| `bun run jira:check` | Compare `jira-required.yaml` vs `jira.json` (custom fields) AND vs `jira-workflows.json` (work types, statuses, transitions) → setup report. Flags: `--json` (machine-readable), `--verbose` (include OK rows), `--help`. Exits 1 if any required field, `work_type`, status or transition is missing or mismatched. |
| `bun run lint:agents` | Validate every `{{VAR}}`, `{{jira.<slug>}}`, `{{jira.<slug>.<option>}}`, `{{jira.work_type.*}}`, `{{jira.status.*}}` and `{{jira.transition.*}}` reference across `.claude/`, `templates/`, `.context/`, `AGENTS.md`. Exits 1 if any are undeclared. |
| `bun run agents:setup` | Interactive CLI to fill / edit `.agents/project.yaml`. Flags: `--non-interactive` (env-driven for CI), `--dry-run`, `--reset`, `--help`. |

## Troubleshooting

- **`lint:agents` reports `UNDECLARED: {{jira.foo}}`** — the slug is referenced in a skill but not declared in `jira-required.yaml`. Add the entry under `required:` or `optional:` (see workflow §5.2).
- **`jira:check` reports `❌ MISSING: bar`** — the manifest declares `bar` as required, but your Jira has no field that slugifies to `bar`. Create the field in Jira admin with the suggested name/type/options, then re-run `bun run jira:sync-fields --force` and `bun run jira:check`.
- **`jira:check` reports `⚠️ MISMATCHED`** — a field exists but its type or option list disagrees with the manifest. Either fix it in Jira (rename, change type, add options) or update `jira-required.yaml` if the methodology can accept the variant.
- **`jira:sync-fields` aborts with exit 2 (slug collisions)** — two Jira custom fields slugify to the same key. Rename the duplicate in Jira admin, or pass `--allow-collisions` to suffix them with `_2`, `_3`, …. Plugin-managed (system) collisions are auto-suffixed silently — see the script's `--verbose` flag.
- **Which variable syntax should I use?** — see §"Variable syntax conventions". Short version: bare `{{VAR}}` is project-scoped (declared in `project.yaml`; env-scoped vars resolve to the active env); `{{environments.<env>.<var>}}` pins to a specific env (multi-env docs only); `<<VAR>>` is session-scoped (computed at runtime); `{{jira.<slug>}}` is Jira-scoped (declared in `jira-required.yaml`, resolved via `jira.json`).

### For AI agents

When invoked in this repository, treat this README as a contract:

- To resolve `{{VAR_NAME}}`, read `.agents/project.yaml`. For env-scoped vars (`{{WEB_URL}}`, `{{API_URL}}`, `{{DB_MCP}}`, `{{API_MCP}}`), use the active environment for the session — the user's explicit choice if they made one, otherwise `testing.default_env`.
- To resolve `{{environments.<env>.<var>}}`, read the named environment directly from `.agents/project.yaml`, regardless of active env.
- To resolve `<<VAR_NAME>>`, the source is the calling skill / command's runtime context.
- To resolve `{{jira.<slug>}}` (or `{{jira.<slug>.<option>}}` / `…<parent>.<child>`), read `.agents/jira-required.yaml` (canonical declaration) AND `.agents/jira.json` (workspace-resolved IDs / option ids).
- To resolve `{{jira.work_type.<slug>}}`, `{{jira.status.<work_type>.<slug>[.id|.category]}}`, or `{{jira.transition.<work_type>.<slug>[.name]}}`, read `.agents/jira-required.yaml` `work_types:` (canonical declaration) AND `.agents/jira-workflows.json` (workspace-resolved status / transition / issue-type metadata).
- To validate any change touching skills, commands, or templates, run `bun run lint:agents` and treat ERROR entries as blocking.
- When asked to add a new skill or modify an existing one, follow the workflow in §5.2 — add manifest entries before referencing slugs.
