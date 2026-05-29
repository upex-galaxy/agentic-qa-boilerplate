# `acli` repo integration — agentic-qa-boilerplate

> **Purpose**: Plug the tool-agnostic `acli` skill (`.claude/skills/acli/SKILL.md`) into the QA boilerplate's workflow doctrine, TMS modality model, slug catalog, and anti-patterns. The `acli/SKILL.md` itself is byte-identical between the QA and DEV boilerplates; everything QA-specific lives here so the tool surface stays single-source-of-truth.
> **Use when**: Any QA workflow skill (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`, `framework-development`) calls `[ISSUE_TRACKER_TOOL]` or `[TMS_TOOL]` and resolves it to `/acli`. Load this BEFORE invoking the tool — it answers *which slug, which status, which custom field, which modality* before `acli/SKILL.md` answers *how the binary works*.
> **Companion references**: `acli/SKILL.md` (tool surface), `acli/references/*.md` (per-command deep refs), `agentic-qa-core/references/jira-publishing-gotchas.md` (ADF / MD converter edges), `test-documentation/references/jira-setup.md` (TMS modality bootstrap), `.agents/jira-fields.json` + `.agents/jira-required.yaml` + `.agents/jira-workflows.json` (slug catalogs).

---

## Role inside the QA workflow

`acli` resolves two tool tags in this repo, depending on configuration:

| Tag | Resolution | Notes |
|---|---|---|
| `[ISSUE_TRACKER_TOOL]` | **Always** `/acli` | Generic Jira: Story, Bug, Epic, Task. Resolution is unconditional in QA boilerplate (Atlassian MCP is opt-in only — `docs/mcp/`). |
| `[TMS_TOOL]` | `/acli` **only in Modality `jira-native`** | When `.agents/project.yaml` `testing.tms_cli` is `jira-native` (no Xray plugin). In Modality `jira-xray`, `[TMS_TOOL]` routes to `/xray-cli` instead. |

Workflow skills MUST NOT invoke `acli` directly. They invoke the pseudocode tag, the AI resolves the tag, then loads the matching skill (this file plus `acli/SKILL.md`). The indirection is what lets the methodology survive a future tool swap.

### Role in TMS Modality `jira-native` (no Xray)

When the project operates without the Xray plugin (Modality `jira-native` resolved by `test-documentation/SKILL.md` §Phase 0 reading `.agents/project.yaml` `testing.tms_cli`), this skill also serves as the owner of the `[TMS_TOOL]` tag. All TMS operations map to native Jira operations handled by `acli`:

- **Test** → Jira work item with `--type Test` (or the configured custom issue type per `.agents/jira-required.yaml`).
- **Test Plan / Test Execution** → Jira work items linked via custom fields (see `test-documentation/references/jira-setup.md` for the field mapping).
- **Pre-Condition** → Jira work item or Test custom field, depending on project setup.

### Role in TMS Modality `jira-xray`

When `.agents/project.yaml` `testing.tms_cli` is `jira-xray`, TMS operations (Test / Test Plan / Test Execution / Pre-Condition) route to `/xray-cli` instead. In that mode, `acli` handles only `[ISSUE_TRACKER_TOOL]` operations (Story, Bug, Epic). Never invoke `acli` for Test issues under `jira-xray` — see anti-pattern Q3 below.

---

## QA Quick Start (slug substitutions on top of `acli/SKILL.md`)

The command shapes live in `acli/SKILL.md` §Quick Start. The QA flow uses the same shapes with slug-resolved arguments. Each row below maps a QA step to the action and the substitutions; never re-type the literal binary call from here — load `acli/SKILL.md` for the canonical form.

| QA step | Action (see `acli/SKILL.md`) | QA-specific substitutions |
|---|---|---|
| Auth | `jira auth login` | `--site "${ATLASSIAN_URL#https://}"` (slug derived from `ATLASSIAN_URL`), `--email "$ATLASSIAN_EMAIL"`, token piped from `$ATLASSIAN_API_TOKEN` (all from `.env`) |
| Verify auth | `jira auth status` | None (same as generic). MUST run before any bulk mutation — see Q6 below. |
| Fetch a story (input for `/sprint-testing` Phase 1) | `jira workitem view <KEY> --json` | `<KEY>` = `{{PROJECT_KEY}}-NNN`; jq filter picks `.fields.{{jira.acceptance_criteria}}` + `.fields.{{jira.scope}}` |
| Transition Ready For QA → In Testing | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_test}}` |
| Search QA work in flight (sprint dashboard) | `jira workitem search --jql <JQL> --paginate --json` | `<JQL>` = `project = {{PROJECT_KEY}} AND assignee = currentUser() AND status in ('Ready For QA','In Testing','Tested')` |
| File a bug found mid-session | `jira workitem create --project <P> --type Bug --summary <S> --parent <PARENT>` | `<P>` = `{{PROJECT_KEY}}`; `<PARENT>` = parent Story key (`{{PROJECT_KEY}}-NNN`) |

Slug resolution rule: anything wrapped in `{{jira.<slug>}}` MUST be resolved against `.agents/jira-fields.json` (custom-field IDs) or `.agents/jira-workflows.json` (status / transition names) before the command runs. Never substitute literal `customfield_` IDs or literal status names — see anti-patterns below.

---

## Anti-patterns — QA-specific (NEVER do these)

These are repo-flavored companions to the tool-level anti-patterns T1-T4 in `acli/SKILL.md`. Both layers apply.

- **Q1. NEVER invoke `acli` directly from workflow skills** (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`, `framework-development`). Workflow skills cite `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]` pseudo-code and load THIS file + `acli/SKILL.md` instead — methodology survives tool rotation only if the HOW lives behind the tag.
- **Q2. NEVER hardcode project keys** (`UPEX`, `MYM`, `SQ`, etc.) in commands, JQL, or docs. Resolve via `{{PROJECT_KEY}}` from `.agents/project.yaml`. Hardcoding breaks portability across downstream consumers and re-installs of the boilerplate.
- **Q3. NEVER mix Modality `jira-xray` and Modality `jira-native` operations on the same TMS entity.** `acli` owns generic Jira (`[ISSUE_TRACKER_TOOL]`) plus Modality `jira-native` TMS (Jira-native Test issues, ATP/ATR as custom fields). Modality `jira-xray` routes Test / Test Plan / Test Execution through `/xray-cli` — never via `acli workitem` against Xray-owned issue types.
- **Q4. NEVER hardcode Jira `customfield_NNNNN` IDs** in skills, scripts, prompts, or AI output. Resolve via the slug catalog (`{{jira.<slug>}}` against `.agents/jira-required.yaml` + `.agents/jira-fields.json`). IDs differ per workspace; slugs travel. Regenerate the catalog with `bun run jira:sync-fields` if a field is missing.
- **Q5. NEVER publish ADF rich text to Jira without first reading `agentic-qa-core/references/jira-publishing-gotchas.md`.** The MD→ADF converter at `acli/scripts/md-to-adf.ts` has one known mark-combination edge (inline `code` + `strong`/`em`), and the MCP variant of `[ISSUE_TRACKER_TOOL]` silently drops ADF conversion on batched custom-field updates. Both surface as HTTP 400 only at publish time. Pre-empt both.

---

## Slug catalog references

| File | Owns | Regenerate with |
|---|---|---|
| `.agents/jira-fields.json` | Custom-field slug → numeric ID map | `bun run jira:sync-fields` |
| `.agents/jira-workflows.json` | Status + transition slugs per work type | `bun run jira:sync-workflows` |
| `.agents/jira-required.yaml` | Which fields are required per work type | Hand-curated; aligns with `jira-fields.json` |

Slug syntax (per `CLAUDE.md` §7):

- `{{jira.<slug>}}` — custom field ID (e.g. `{{jira.acceptance_criteria}}` → numeric workspace-specific ID)
- `{{jira.status.<work_type>.<slug>}}` — status name (`{{jira.status.story.in_test}}` → `"In Testing"`)
- `{{jira.transition.<work_type>.<slug>}}` — transition name (`{{jira.transition.story.start_testing}}` → `"Start Testing"`)
- `{{jira.work_type.<slug>}}` — Jira issue-type name (e.g. `{{jira.work_type.story}}` → `"Story"`)

If a slug fails to resolve at runtime, STOP — do not fall back to a literal. Report the missing entry and re-run the matching sync script.

---

## Composability — who loads this

The following workflow skills load `agentic-qa-core/references/acli-integration.md` on demand (alongside `acli/SKILL.md`):

| Skill | When this file is loaded |
|---|---|
| `shift-left-testing` | Backlog refinement: fetch Story ACs, transition to `shift_left_qa` / `estimation` |
| `sprint-testing` | In-sprint QA: fetch ticket, transition through `in_testing` / `tested` / `closed`, file Bug under parent Story |
| `test-documentation` | TMS docs: create Test / Test Plan / Test Execution issues (Modality `jira-native`), link to Stories |
| `test-automation` | Stage 5: read implementation-plan + ACs from Story, comment automated-test status |
| `regression-testing` | Stage 6: bulk-query Test issues by label, comment Test Execution results |
| `project-discovery` | Reverse-engineering: inventory existing issue types, statuses, custom fields |
| `framework-development` | When evolving the slug catalog or `.agents/jira-*` files themselves |

Each of these skills declares `acli` + this integration file in their `## Dependencies` block.

---

## When the integration changes

This file evolves whenever:

- New Jira custom field is added to `.agents/jira-fields.json` and a workflow skill needs to read or write it.
- TMS modality semantics change (e.g. project moves from `jira-native` to `jira-xray` or vice versa).
- A new anti-pattern surfaces from a real QA session and applies repo-wide.
- The slug syntax in `CLAUDE.md` §7 evolves.

Do NOT push tool-binary changes here — those belong in `acli/SKILL.md` (and therefore propagate to both QA and DEV boilerplates identically). Boundary rule: if the change is about `acli` the binary, it goes in `acli/SKILL.md`. If it's about how QA uses `acli`, it goes here.
