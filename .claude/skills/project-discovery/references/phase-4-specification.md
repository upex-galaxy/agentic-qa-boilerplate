# Phase 4 — Specification (Backlog Mapping + Access Recipe)

> Read this when running the Phase 4 sub-step: PBI Backlog Mapping. Phase 4 runs after Phase 3 is complete. Do NOT duplicate backlog content into the repo — document HOW to access it.

> **Per-ticket PBI is NOT a Phase-4 output.** It is materialized later by `/sprint-testing` via `bun run jira:sync-issues get <KEY> --include-comments`, which syncs Jira issues into the canonical tree `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic, 1:1). Those local `.md` files are a READ-ONLY cache of Jira (Jira = source of truth). Phase 4 only produces the backlog access recipe (`ACCESS.md`) — it never authors `story.md` or any per-ticket file locally.

---

## Phase 4 outputs

| File | Purpose |
|------|---------|
| `.context/PBI/ACCESS.md` | PM tool, project key, backlog location + access methods, project structure, common queries, discovery gaps. |

Every output MUST include a `## Discovery Gaps` section if a field could not be verified (e.g., workflow states are assumed, no access to create-meta).

> **Hands off `.context/PBI/README.md` and `templates/`.** `README.md` is a `[COMMIT]` framework document holding the tier doctrine and gitignore ladder for the whole PBI tree — overwriting it destroys framework doctrine, so Phase 4 NEVER writes it. `templates/` (`PROGRESS-template.md`, `ROADMAP-template.md`, `module-context-template.md`) ships committed with the framework and is not authored per-project either. Phase 4's only write target is `ACCESS.md`, regenerated on every re-run of discovery.

---

## Golden rules

1. **Do NOT copy the backlog.** The issue tracker is the source of truth for tickets. `.context/PBI/` holds the backlog access recipe (`ACCESS.md`) plus the committed framework skeletons (`templates/`), never a copy of the full backlog. Per-ticket PBI is synced on demand from Jira by `/sprint-testing` (`bun run jira:sync-issues`) as a read-only cache.
2. **Per-ticket PBI is synced, not authored.** The canonical synced tree is `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/`, materialized by `/sprint-testing` from Jira. It is a read-only cache and can always be re-synced — this skill does not create it.
3. **Tracker credentials in `.env` only.** Two keys: `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN` — consumed by MCP, acli, xray-cli, sync scripts, and the Jira-Direct TMS provider. The site HOST is NOT a credential and NOT in `.env`: it lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url` (read it with `bun run --silent jira:url`). No `JIRA_*` credential aliases exist; if you see them in old docs or `.env` files, migrate them. Never paste tokens in markdown; if the user pastes one in chat, scrub it and redirect them to `.env`. See SKILL.md §Gotchas for the general credential policy.
4. **Tool resolution.** When you see `[ISSUE_TRACKER_TOOL]` in this document, resolve via the project's CLAUDE.md Tool Resolution table. Priority order: CLI (fewer tokens) -> MCP (fallback) -> REST API -> manual. For Jira, that means load `/acli` skill first; only fall back to Atlassian MCP if acli is unavailable.

---

## Step 1 — PM Tool Identification

### Detection

| Source | What to look for |
|--------|------------------|
| `.context/project-config.md` | Existing `jira` / `azure-devops` / `clickup` / `linear` / `asana` mention |
| `package.json`, `.github/workflows/**` | Integrations, webhooks, bot tokens |
| Commit footers, PR templates | `PROJ-123` style refs -> Jira; `#123` -> GitHub; `AB#123` -> Azure Boards |
| `.gitlab-ci.yml` / `.circleci/config.yml` | Tracker hooks |

If nothing is detectable, ask once:

```
What tool manages your backlog? (Jira Cloud, Jira DC, Azure DevOps, Linear, ClickUp, GitHub Issues)
What is the project key or board name?
```

### Output of this step

- PM tool name + instance URL
- Project key / board name
- Whether the team uses sprints (Scrum), continuous flow (Kanban), or hybrid

> **Tooling coverage by tracker**: Jira uses `/acli` (primary skill); GitHub Issues uses `gh issue` CLI. Azure DevOps / Linear / ClickUp have no dedicated skill in this ecosystem — fall back to MCP (if available) or document REST API + token in `.context/PBI/ACCESS.md`. Flag the absence of a proprietary skill as a Discovery Gap so future adopters know what's unsupported.

---

## Step 2 — Project Structure Mapping

> **Prerequisite**: Load `/acli` skill before executing the commands below.

### Jira

```
[ISSUE_TRACKER_TOOL] List Projects:
  filter: {{PROJECT_KEY}}

[ISSUE_TRACKER_TOOL] List Boards:
  project: {{PROJECT_KEY}}

[ISSUE_TRACKER_TOOL] Get Create Meta:
  project: {{PROJECT_KEY}}
```

### Azure DevOps

```
[ISSUE_TRACKER_TOOL] List Projects
[ISSUE_TRACKER_TOOL] List Iterations:
  project: {{PROJECT_KEY}}
[ISSUE_TRACKER_TOOL] List Work Item Types:
  project: {{PROJECT_KEY}}
```

### Capture

- Issue types in use (Epic / Story / Task / Bug / Sub-task / custom)
- Workflow states and transitions (paste into a Mermaid state diagram)
- Sprint cadence (length, current sprint, next sprint)
- Required custom fields (if any)

If tool access is unavailable, ask the user for project key + board type and flag the rest as a Discovery Gap.

---

## Step 3 — Access Method Priority

| Rank | Method | When it fits |
|------|--------|--------------|
| 1 | MCP (e.g., Atlassian MCP) | Preferred — rich integration, live queries, schema-aware |
| 2 | CLI (e.g., `acli` for Jira, `gh issue` for GitHub, `az boards` for Azure DevOps) | Scriptable, no MCP available |
| 3 | REST API + token | Fallback, document `curl` recipe |
| 4 | Manual (Web UI) | Last resort; note in Discovery Gaps |

Record the chosen method and fallback in `.context/PBI/ACCESS.md`.

### Required env keys (emit to user)

```
# Atlassian credentials (no JIRA_* aliases)
# NOTE: the Atlassian site HOST is not a .env variable. It lives in
# .agents/project.yaml -> issue_tracker.atlassian_url (`bun run agents:setup`).
ATLASSIAN_EMAIL=
ATLASSIAN_API_TOKEN=
```

---

## Step 4 — Query Patterns

Document the four canonical QA queries. Resolve to the tracker's query language.

| Need | Jira JQL | Azure DevOps WIQL |
|------|----------|-------------------|
| Current sprint ready for QA | `project = {{PROJECT_KEY}} AND sprint in openSprints() AND status = "{{jira.status.story.ready_for_qa}}"` | `State = 'Ready for Test' AND [System.IterationPath] = @CurrentIteration` |
| All open bugs | `project = {{PROJECT_KEY}} AND type = Bug AND resolution = Unresolved ORDER BY priority DESC` | `Work Item Type = 'Bug' AND State <> 'Closed'` |
| My testing tasks | `project = {{PROJECT_KEY}} AND status = "{{jira.status.story.in_test}}" AND assignee = currentUser()` | `State = 'Testing' AND [System.AssignedTo] = @Me` |
| Recently updated | `project = {{PROJECT_KEY}} AND updated >= -1d ORDER BY updated DESC` | `[Changed Date] > @Today - 1` |

Also record the `[ISSUE_TRACKER_TOOL]` pseudocode equivalents so other skills can reuse them.

---

## `.context/PBI/ACCESS.md` structure

Produce with these sections, in order:

1. **Header** — PM tool, project key, board, access method, last updated.
2. **Backlog Location** — URL, project key, board name + type.
3. **Access Configuration** — primary method (MCP/CLI/API), setup steps, fallback method, required env vars.
4. **Project Structure** — issue types table, workflow state diagram (Mermaid), sprint cadence.
5. **Common Queries** — the four canonical queries above, plus any project-specific ones.
6. **Integration with KATA** — when to fetch (during sprint-testing, bug triage, documentation, automation handoff), local storage rules.
7. **Credentials** — which env vars must be set; never paste secrets (see SKILL.md §Gotchas).
8. **Discovery Gaps** — anything not verifiable from code or tracker access.

### Local storage layout

```
.context/PBI/
|-- README.md                 # [COMMIT] framework-owned — tier doctrine + gitignore ladder; Phase 4 NEVER writes it
|-- ACCESS.md                 # Phase 4 output — backlog access recipe + common queries
|-- templates/                # [COMMIT] framework skeletons — shipped with the repo, NOT Phase-4 outputs
|   |-- PROGRESS-template.md
|   |-- ROADMAP-template.md
|   `-- module-context-template.md
`-- epics/                    # synced from Jira by /sprint-testing — read-only cache, NOT created here
    `-- EPIC-{{PROJECT_KEY}}-100-<slug>/
        `-- stories/
            `-- STORY-{{PROJECT_KEY}}-123-<slug>/
                `-- ...        # materialized by `bun run jira:sync-issues get <KEY> --include-comments`
```

> Phase 4 produces ONLY `ACCESS.md`. The `epics/.../stories/...` tree is synced from Jira on demand by `/sprint-testing` (Module = Epic, 1:1) and is a read-only cache of Jira — this skill never writes it.


## Gotchas

- **Undocumented tickets.** Teams frequently open stories with "TBD" ACs or empty descriptions. When mapping, record the prevalence ("~30% of recent stories lack ACs") as a Discovery Gap — this becomes the shift-left opportunity for the QA role.
- **Missing ACs.** Do NOT invent ACs. ACs live in Jira (source of truth); if recent tickets frequently lack them, record the prevalence as a Discovery Gap (the shift-left opportunity) rather than back-filling. Per-ticket emptiness is surfaced later by `/sprint-testing` from the synced Jira cache, not authored here.
- **Orphaned stories.** Stories with no Epic, or Epics with no parent theme, are common. Document the orphan count but do not attempt to re-parent from the skill.
- **Custom workflow states.** Every team renames states (`Ready for QA` vs `In QA` vs `Testing`). Capture the real state names in the workflow diagram; do not force a generic template.
- **Workflow drift.** The create-meta endpoint may list states that the current board does not actually use. When in doubt, read recent tickets to see which states appear in practice.
- **Permission gaps.** The QA user may not have permission to transition tickets. Test a state transition manually before committing a workflow diagram to `ACCESS.md`.
- **Sprint naming inconsistency.** Sprints named `Sprint 42`, `S42`, `2026-W15`, `Hawking` all coexist in mature teams. Record the naming convention in use, do not normalize it.
- **Required custom fields.** `Story Points`, `Epic Link`, `Acceptance Criteria` (as a field, not description), `Components`. Fetch these from create-meta and record them in `ACCESS.md` §Project Structure; missing required fields will block ticket creation from CLI.
- **Two states named "Done".** Jira commonly has both `Done` and `Closed`; some workflows have `Resolved` in between. Capture all terminal states.
- **Do not hardcode issue types.** A project may not use `Sub-task`; another may have `Spike`, `Chore`, or `Incident`. Enumerate what the project actually uses.
- **Do not embed secrets in examples.** CLI invocations must use env-var interpolation (`$ATLASSIAN_API_TOKEN`), not literal tokens.

---

## When to re-run Phase 4

| Trigger | Action |
|---------|--------|
| New PM tool adopted | Re-run Step 1-3; rewrite `.context/PBI/ACCESS.md`. |
| Workflow states changed | Re-run Step 2; update state diagram only. |
| New required custom fields | Update the required-fields list in `ACCESS.md` §Project Structure. |
| Team switches Scrum <-> Kanban | Update Project Structure section and queries. |
| Tracker URL migration (e.g., Jira Cloud move) | Update env keys and setup instructions. |

---

## Completion checklist

Before reporting Phase 4 complete:

- [ ] `.context/PBI/ACCESS.md` exists with project key + access recipe + four common queries.
- [ ] `.context/PBI/README.md` and `.context/PBI/templates/` were NOT touched (framework-owned, committed).
- [ ] All outputs include a `## Discovery Gaps` section (can be empty, but must be present).
- [ ] No credentials pasted in markdown; env-var references only.
- [ ] Per-ticket PBI sync is documented as out of scope (synced from Jira by `/sprint-testing`, not created here).
- [ ] User has confirmed the workflow diagram matches reality (manual transition test or recent ticket review).

Emit the phase completion ping and wait for user confirmation before moving to the context generators. KATA adaptation is out of scope for this skill — it is owned by the `/adapt-framework` command and runs after discovery outputs exist.
