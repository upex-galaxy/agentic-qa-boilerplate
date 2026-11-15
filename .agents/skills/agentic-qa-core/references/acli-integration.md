# `acli` repo integration: agentic-qa-boilerplate

> Purpose: plug the tool-agnostic `acli` skill (`.agents/skills/acli/SKILL.md`) into the QA boilerplate's workflow doctrine, TMS modality model, slug catalog and anti-patterns. `acli/SKILL.md` stays shared, tool-agnostic content between the QA and DEV boilerplates. In the boilerplate source repos, changes sync into both copies. In derived repos, treat it as managed content that receives updates only through the updater, and do not attempt cross-boilerplate maintenance. Everything QA-specific lives here, so the tool surface has one source of truth.
> Use when: a QA workflow skill calls `[ISSUE_TRACKER_TOOL]` or `[TMS_TOOL]` and resolves it to `/acli`. Load this before invoking the tool. It answers which slug, which status, which custom field and which modality; `acli/SKILL.md` then answers how the binary works.
> Companion references: `acli/SKILL.md` (tool surface), `acli/references/*.md` (per-command deep refs), `agentic-qa-core/references/jira-publishing-gotchas.md` (ADF / MD converter edges, what breaks), `acli/references/adf-authoring-style.md` (ADF visual-formatting style, what reads well), `test-documentation/references/jira-setup.md` (TMS modality bootstrap), `.agents/jira-fields.json` + `.agents/jira-required.yaml` + `.agents/jira-workflows.json` (slug catalogs).

---

## Role inside the QA workflow

`acli` resolves two tool tags in this repo, depending on configuration:

| Tag | Resolution | Notes |
|---|---|---|
| `[ISSUE_TRACKER_TOOL]` | Always `/acli` | Generic Jira: Story, Bug, Epic, Task. Resolution is unconditional in the QA boilerplate (the Atlassian MCP is opt-in only, `mcp-atlassian-optin.md`). |
| `[TMS_TOOL]` | `/acli` only in Modality `jira-native` | When the modality resolves to `jira-native` (no Xray plugin: `.agents/project.yaml` `testing.tms_cli` unset or `acli`; resolver: `test-documentation/SKILL.md` §Phase 0). In Modality `jira-xray` (`testing.tms_cli` names an Xray CLI, e.g. `bun xray`), `[TMS_TOOL]` routes to `/xray-cli` instead. |

Workflow skills do not invoke `acli` directly. They invoke the pseudocode tag, you resolve the tag, then you load the matching skill (this file plus `acli/SKILL.md`). The indirection lets the methodology survive a future tool swap.

### Reads vs writes: the `jira:sync-issues` split

`[ISSUE_TRACKER_TOOL]` covers two very different operations, and they resolve to different tools:

| Operation | Tool | Why |
|---|---|---|
| Detailed READ of an issue (custom fields, ACs, ATP/ATR, description, comments) | `bun run jira:sync-issues get <KEY> [--include-comments]`, then read the synced `.md` | An `acli view` returns `null` for `customfield_*` unless you pass `--fields "*all"` and hand-parse jq. The sync script resolves every slug, converts ADF to Markdown and writes per-field files: one canonical read path. |
| Batch READ (many issues by JQL) | `bun run jira:sync-issues jql "<query>"` | Same materialization for every match. |
| WRITE (create, transition, comment, link, assign, custom-field update) | `/acli` (`workitem create/transition/comment/link …`) | The script is read-only (pull). All mutations stay on `acli`. |
| Trivial lookup (summary, status or a key list, no custom fields) | `/acli` `workitem view`/`search` is fine | No materialization needed, and it is cheaper than a sync. |
| Traceability (link graph Story, ATP, ATR, TC; Xray run status) | `/acli` / `/xray-cli` | The sync mirrors `issuelinks` but not Xray run or coverage state, so read the live source. |

When you need the content of a custom field, sync it instead of running `acli view`. The synced files live under `.context/PBI/` per `.agents/instructions/agent-local-context-pbi.md` (Jira is the source of truth; the local `.md` is a read-only cache). When a custom field is absent from the instance, the sync emits a pointer stub and the content lives in the issue's comments or description per `.agents/jira-required.yaml` → `fallback:`.

### Role in TMS Modality `jira-native` (no Xray)

When the project operates without the Xray plugin (Modality `jira-native`, resolved by `test-documentation/SKILL.md` §Phase 0 reading `.agents/project.yaml` `testing.tms_cli`), this skill also owns the `[TMS_TOOL]` tag. Every TMS operation maps to a native Jira operation handled by `acli`:

- Test: a Jira work item with `--type Test` (or the configured custom issue type per `.agents/jira-required.yaml`).
- Test Plan / Test Execution: real Jira items. A Test Plan item holds the ATP (`ATP: {STORY-KEY}: {title}`) and a Test Execution item holds the ATR (`ATR: {STORY-KEY}: Story Testing`). Story custom fields are a degraded fallback, used only when those work types are unavailable (field mapping in `test-documentation/references/jira-setup.md`).
- Pre-Condition: a Jira work item or a Test custom field, depending on project setup.

### Role in TMS Modality `jira-xray`

When the modality resolves to `jira-xray` (`.agents/project.yaml` `testing.tms_cli` names an Xray CLI, e.g. `bun xray`; resolver: `test-documentation/SKILL.md` §Phase 0), TMS operations (Test, Test Plan, Test Execution, Pre-Condition) route to `/xray-cli`. In that mode `acli` handles only `[ISSUE_TRACKER_TOOL]` operations (Story, Bug, Epic). Do not invoke `acli` for Test issues under `jira-xray` (anti-pattern Q3 below).

---

## QA Quick Start (slug substitutions on top of `acli/SKILL.md`)

The command shapes live in `acli/SKILL.md` §Quick Start. The QA flow uses the same shapes with slug-resolved arguments. Each row below maps a QA step to the action and its substitutions. Load `acli/SKILL.md` for the canonical form of the binary call instead of retyping it from here.

| QA step | Action (see `acli/SKILL.md`) | QA-specific substitutions |
|---|---|---|
| Auth | `jira auth login` | `--site "$(bun run --silent jira:url --slug)"` (host from `.agents/project.yaml`, not an env var), `--email "$ATLASSIAN_EMAIL"`, token piped from `$ATLASSIAN_API_TOKEN` (both from `.env`) |
| Verify auth | `jira auth status` | None (same as generic). Run it before any bulk mutation. |
| Fetch a story DETAIL (input for `/sprint-testing` Phase 1) | Not acli: `bun run jira:sync-issues get <KEY> --include-comments` | `<KEY>` = `{{PROJECT_KEY}}-NNN`. Reads ACs, scope, ATP and comments from the synced `.md` files, because `acli view` returns null for custom fields. See "Reads vs writes" above. |
| Transition Ready For QA to In Test | `jira workitem transition --key <KEY> --status <STATUS>` | `<STATUS>` = `{{jira.status.story.in_test}}` |
| Search QA work in flight (sprint dashboard) | `jira workitem search --jql <JQL> --paginate --json` | `<JQL>` = `project = {{PROJECT_KEY}} AND assignee = currentUser() AND status in ({{jira.status.story.ready_for_qa}}, {{jira.status.story.in_test}}, {{jira.status.story.qa_approved}})` (resolve the slugs to names before running) |
| File a bug found mid-session | `jira workitem create --project <P> --type Bug --summary <S> --parent <PARENT>` | `<P>` = `{{PROJECT_KEY}}`; `<PARENT>` = parent Story key (`{{PROJECT_KEY}}-NNN`) |
| Capture the key of what you just created | add `--json` to the create and read the `key` field | Applies to every create on both tools. Do not scrape the human success line: `acli` decorates it, and `/xray-cli` prints colour codes around the key. In Modality `jira-xray` the `/xray-cli` creates also emit a bare `KEY <PROJ-123>` line for shell capture. A create whose key was not captured leaves an orphan artifact that nothing downstream can link. |

Resolve anything wrapped in `{{jira.<slug>}}` against `.agents/jira-fields.json` (custom-field IDs) or `.agents/jira-workflows.json` (status and transition names) before the command runs. Substituting a literal `customfield_` ID or a literal status name breaks on the next workspace (see the anti-patterns below).

---

## Anti-patterns, QA-specific

These are repo-flavored companions to the tool-level anti-patterns T1-T4 in `acli/SKILL.md`. Both layers apply.

- Q1. Never invoke `acli` directly from a workflow skill. Workflow skills cite the `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]` pseudocode and load this file plus `acli/SKILL.md` instead, because the methodology survives tool rotation only if the how lives behind the tag.
- Q2. Never hardcode project keys (`UPEX`, `MYM`, `SQ`, etc.) in commands, JQL or docs. Resolve via `{{PROJECT_KEY}}` from `.agents/project.yaml`. A hardcoded key breaks portability across downstream consumers and re-installs of the boilerplate.
- Q3. Never mix Modality `jira-xray` and Modality `jira-native` operations on the same TMS entity. `acli` owns generic Jira (`[ISSUE_TRACKER_TOOL]`) plus Modality `jira-native` TMS (Jira-native Test issues; ATP and ATR as Test Plan and Test Execution items, with Story custom fields only as fallback). Modality `jira-xray` routes Test, Test Plan and Test Execution through `/xray-cli`, never through `acli workitem` against Xray-owned issue types.
- Q4. Never hardcode Jira `customfield_NNNNN` IDs in skills, scripts, prompts or output. Resolve via the slug catalog (`{{jira.<slug>}}` against `.agents/jira-required.yaml` + `.agents/jira-fields.json`). IDs differ per workspace and slugs travel. Regenerate the catalog with `bun run jira:sync-fields` if a field is missing.
- Q5. Never publish ADF rich text to Jira without first reading `agentic-qa-core/references/jira-publishing-gotchas.md`. The MD→ADF converter at `acli/scripts/md-to-adf.ts` has one known mark-combination edge (inline `code` + `strong`/`em`), and the MCP variant of `[ISSUE_TRACKER_TOOL]` silently drops ADF conversion on batched custom-field updates. Both surface as HTTP 400 only at publish time, so check for them first. For any field whose content maps naturally (test steps to expected results, results to status, multi-level preconditions), format it per `acli/references/adf-authoring-style.md` (tables, panels, nested lists) instead of flat prose. Use richness with purpose, never decoration, and let the field's hard rule win (mandated Gherkin stays fenced).
- Q6. Never read a custom field via `acli workitem view`. It returns `null` for `customfield_*` (ACs, ATP, ATR, scope, business rules, bug fields). For any detailed read use `bun run jira:sync-issues get <KEY> [--include-comments]` or `jql "<query>"` and read the synced `.md` under `.context/PBI/`. `acli view`/`search` is for trivial summary, status and key-list lookups only. See "Reads vs writes" above.
- Q7. Never hand-write a Jira-mirrored file in `.context/PBI/` (`story.md`, `epic.md`, `acceptance-*.md`, `implementation-plan.md`, `feature-*.md`, per-field files). Generate the content, push it to the Jira field (or the `fallback:` comment), run the sync, then read the materialized file. Only non-Jira files (`context.md`, `evidence/`, `test-specs/`, etc.) are hand-authored. The sync overwrites every `[SYNC]` file on every run, because Jira is the source of truth and no file is hard-protected.
- Q8. Never plan a QA field write around `acli workitem edit`. Its editable surface (`acli jira workitem edit --help`) excludes custom fields and components, and every field the QA workflow actually writes falls outside it. Custom fields (ACs, ATP, ATR, severity, QA assignee) are hard-rejected with exit 1. Components, which are mandatory on every quality issue per `agentic-qa-core/references/defect-management-doctrine.md`, have no flag at all, so the edit reports success and leaves them as they were. Set components and every mandatory field at create time (a create takes them). When an existing issue must be corrected, route the write through Jira REST `PUT` on the issue's `fields`; the turnkey recipe lives in `acli/SKILL.md` §WORKAROUND and `acli/references/workitem.md` §edit. Read the field back afterwards, because the REST path also coerces silently. Measured on a live instance across a sprint's worth of writes.

---

## Slug catalog references

| File | Owns | Regenerate with |
|---|---|---|
| `.agents/jira-fields.json` | Custom-field slug to numeric ID map | `bun run jira:sync-fields` |
| `.agents/jira-workflows.json` | Status and transition slugs per work type. It is the authoritative source for every status and transition name: a name that is not there does not exist in the instance. | `bun run jira:sync-workflows` |
| `.agents/jira-required.yaml` | Which fields are required per work type | Hand-curated; aligns with `jira-fields.json` |

Slug syntax (per `.agents/instructions/agent-project-variables.md`):

- `{{jira.<slug>}}`: custom field ID (e.g. `{{jira.acceptance_criteria}}` resolves to the numeric, workspace-specific ID)
- `{{jira.status.<work_type>.<slug>}}`: status name (`{{jira.status.story.in_test}}` resolves to `"In Test"`)
- `{{jira.transition.<work_type>.<slug>}}`: transition name (`{{jira.transition.story.start_testing}}` resolves to `"Start Testing"`)
- `{{jira.work_type.<slug>}}`: Jira issue-type name (e.g. `{{jira.work_type.story}}` resolves to `"Story"`)

If a slug fails to resolve at runtime, stop and do not fall back to a literal. Report the missing entry and re-run the matching sync script.

---

## Composability: who loads this

Every workflow skill that resolves `[ISSUE_TRACKER_TOOL]` / `[TMS_TOOL]` to `/acli` loads `agentic-qa-core/references/acli-integration.md` on demand (alongside `acli/SKILL.md`) and declares `acli` plus this integration file in its `## Dependencies` block. The set of skills that do is whatever `.agents/skills/REGISTRY.md` (`bun run skills:registry`) lists with that dependency; this file keeps no copy.

---

## When the integration changes

Update this file when:

- a new Jira custom field is added to `.agents/jira-fields.json` and a workflow skill needs to read or write it;
- TMS modality semantics change (e.g. a project moves from `jira-native` to `jira-xray` or back);
- a new anti-pattern surfaces from a real QA session and applies repo-wide;
- the slug syntax in `.agents/instructions/agent-project-variables.md` evolves.

Tool-binary changes belong in `acli/SKILL.md`, which propagates to both the QA and DEV boilerplates identically. The boundary rule: a change about `acli` the binary goes in `acli/SKILL.md`, and a change about how QA uses `acli` goes here.
