# Phase 4 — Specification (Backlog Connection Check)

> Read this when running Phase 4. Phase 4 runs after Phase 3 is complete. It proves the framework can reach the team's issue tracker and **writes no file**. Do NOT duplicate backlog content into the repo.

> **Per-ticket PBI is NOT a Phase-4 output.** It is materialized later by `/sprint-testing` via `bun run jira:sync-issues get <KEY> --include-comments`, which syncs Jira issues into the canonical tree `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic, 1:1). Those local `.md` files are a READ-ONLY cache of Jira (Jira = source of truth).

> **The access recipe already exists.** How the backlog is reached, cached and re-hydrated is framework doctrine in `.context/PBI/README.md` and `.agents/instructions/agent-local-context-pbi.md`. Phase 4 NEVER writes `.context/PBI/README.md` or the committed `templates/`; it checks that the recipe works for this project.

---

## Golden rules

1. **Do NOT copy the backlog.** The issue tracker is the source of truth for tickets. `.context/PBI/` is a synced cache, never an authored copy.
2. **Tracker credentials in `.env` only.** Two keys: `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, consumed by MCP, acli, xray-cli, sync scripts, and the Jira-Direct TMS provider. The site HOST is NOT a credential and NOT in `.env`: it lives in `.agents/project.yaml` -> `issue_tracker.atlassian_url` (read it with `bun run --silent jira:url`). No `JIRA_*` credential aliases exist; if you see them in old docs or `.env` files, migrate them. Never paste tokens anywhere; if the user pastes one in chat, scrub it and redirect them to `.env`.
3. **Tool resolution.** Resolve `[ISSUE_TRACKER_TOOL]` via the AGENTS.md Tool Resolution table: CLI first, MCP fallback. For Jira, load `/acli` before any call.
4. **Scripts from `package.json`.** Open `package.json` and confirm each script below exists before quoting or running it.

---

## The check

> **Prerequisite**: Load `/acli` skill before executing the commands below.

1. **Tracker identified.** From `.context/project-config.md` §Tools and Access (Phase 1), or ask once: which tool manages the backlog and what is the project key. Jira uses `/acli`; GitHub Issues uses `gh issue`. Any other tracker has no dedicated skill here: record that as a discovery gap in `project-config.md`.
2. **Connection.** One read through `[ISSUE_TRACKER_TOOL]` proves credentials and host:
   ```
   [ISSUE_TRACKER_TOOL] Get Issue:
     key: {{PROJECT_KEY}}-1
   ```
3. **Project key.** `.agents/project.yaml` carries the key the team actually uses (`{{PROJECT_KEY}}`). A mismatch is fixed in the yaml (`bun run agents:setup`), never worked around in a skill.
4. **Field catalog.** `bun run jira:check`. It compares `.agents/jira-required.yaml` against the synced `.agents/jira-fields.json`; when that catalog is absent or stale, run `bun run jira:sync-fields` first. A missing required field is reported, never invented: the skills fall back to a structured comment per the manifest's `fallback:`.
5. **Hierarchy.** The work types the sync will pull are declared in `.agents/jira-required.yaml` (`work_types`, with `sync:` per type). Confirm the project's real hierarchy (Epic, Story, Bug, and any custom type the team uses) is declared there. Do not hardcode issue types: a project may have no `Sub-task` and a `Spike` instead.

---

## Completion gate

- `bun run jira:check` exits green, OR the reason it cannot yet (no tracker access, no API token, non-Jira tracker) is recorded in `.context/project-config.md` `## Discovery Gaps` with the next step.
- `.context/PBI/README.md` and `.context/PBI/templates/` were NOT touched.
- No credential pasted anywhere; env-var references only.

Emit the phase completion ping with the `jira:check` result and wait for user confirmation before the `project-context` handoff. KATA adaptation is out of scope for this skill; it is owned by `/test-framework-adaptation` and runs after discovery outputs exist.

---

## Gotchas

- **Undocumented tickets.** Teams frequently open stories with "TBD" ACs or empty descriptions. If a sample of recent stories shows it, record the prevalence as a discovery gap: it is the shift-left opportunity for the QA role. Do NOT invent ACs.
- **Custom workflow states.** Every team renames states (`Ready for QA` vs `In QA` vs `Testing`). The status catalog is `bun run jira:sync-workflows` output, never a hand-written diagram.
- **Permission gaps.** The QA user may not have permission to transition tickets. Surface it now as a discovery gap rather than at the first sprint.
- **Do not embed secrets in examples.** CLI invocations must use env-var interpolation (`$ATLASSIAN_API_TOKEN`), not literal tokens.

## When to re-run Phase 4

| Trigger | Action |
|---------|--------|
| New PM tool adopted | Re-run the whole check. |
| New required custom fields | `bun run jira:sync-fields`, then `bun run jira:check`. |
| Tracker URL migration (e.g., Jira Cloud move) | Update `issue_tracker.atlassian_url` in `.agents/project.yaml`, then re-run the check. |
