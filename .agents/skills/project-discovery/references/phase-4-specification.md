# Phase 4: Specification (Backlog Connection Check)

> Read this when running Phase 4, after Phase 3 is complete. Phase 4 proves the framework can reach the team's issue tracker and **writes no file**. Do not duplicate backlog content into the repo.

> Per-ticket PBI is not a Phase 4 output. `/sprint-testing` materializes it later through `bun run jira:sync-issues get <KEY> --include-comments`, which syncs Jira issues into the canonical tree `.context/PBI/epics/EPIC-<KEY>-<slug>/stories/STORY-<KEY>-<slug>/` (Module = Epic, 1:1). Those local `.md` files are a read-only cache of Jira, which stays the source of truth.

> The access recipe already exists. How the backlog is reached, cached and re-hydrated is framework doctrine in `.context/PBI/README.md` and `.agents/instructions/agent-local-context-pbi.md`. Phase 4 never writes `.context/PBI/README.md` or the committed `templates/`; it checks that the recipe works for this project.

---

## Golden rules

1. The issue tracker is the source of truth for tickets, so do not copy the backlog. `.context/PBI/` is a synced cache, never an authored copy.
2. Tracker credentials live in `.env` only, as two keys: `ATLASSIAN_EMAIL` and `ATLASSIAN_API_TOKEN`, consumed by MCP, acli, xray-cli, the sync scripts and the Jira-Direct TMS provider. The site host is not a credential and is not in `.env`: it lives in `.agents/project.yaml` under `issue_tracker.atlassian_url` (read it with `bun run --silent jira:url`). No `JIRA_*` credential aliases exist; if old docs or `.env` files still carry them, migrate them. Never paste a token anywhere. If the user pastes one in chat, scrub it and redirect them to `.env`.
3. Resolve `[ISSUE_TRACKER_TOOL]` through the AGENTS.md Tool Resolution table: CLI first, MCP fallback. For Jira, load `/acli` before any call.
4. Open `package.json` and confirm each script below exists before quoting or running it.

---

## The check

> **Prerequisite**: load the `/acli` skill before executing the commands below.

1. **Tracker identified.** Take it from `.context/project-config.md` §Tools and Access (Phase 1), or ask once which tool manages the backlog and what the project key is. Jira uses `/acli`; GitHub Issues uses `gh issue`. Any other tracker has no dedicated skill here: record that as a discovery gap in `project-config.md`.
2. **Connection.** One read through `[ISSUE_TRACKER_TOOL]` proves credentials and host:
   ```
   [ISSUE_TRACKER_TOOL] Get Issue:
     key: {{PROJECT_KEY}}-1
   ```
3. **Project key.** `.agents/project.yaml` carries the key the team actually uses (`{{PROJECT_KEY}}`). Fix a mismatch in the yaml (`bun run agents:setup`), not in a skill.
4. **Field catalog.** Run `bun run jira:check`. It compares `.agents/jira-required.yaml` against the synced `.agents/jira-fields.json`; when that catalog is absent or stale, run `bun run jira:sync-fields` first. A missing required field is reported, never invented: the skills fall back to a structured comment per the manifest's `fallback:`.
5. **Hierarchy.** The work types the sync pulls are declared in `.agents/jira-required.yaml` (`work_types`, with `sync:` per type). Confirm the project's real hierarchy (Epic, Story, Bug, and any custom type the team uses) is declared there. Do not hardcode issue types: a project may have no `Sub-task` and a `Spike` instead.

When nobody is present to answer step 1 or to confirm the completion ping, the autonomous paths in the "Waiting for a person" section of `SKILL.md` apply. The check itself only reads, so a routine can run it.

---

## Completion gate

- `bun run jira:check` exits green, or the reason it cannot yet (no tracker access, no API token, non-Jira tracker) is recorded in `.context/project-config.md` `## Discovery Gaps` with the next step.
- `.context/PBI/README.md` and `.context/PBI/templates/` were not touched.
- No credential is pasted anywhere; env-var references only.

Emit the phase completion ping with the `jira:check` result and wait for user confirmation before the `project-context` handoff. KATA adaptation is out of scope here: `/test-framework-adaptation` owns it and runs after discovery outputs exist.

---

## Gotchas

- **Undocumented tickets.** Teams often open stories with "TBD" ACs or empty descriptions. If a sample of recent stories shows it, record the prevalence as a discovery gap: it is the shift-left opportunity for the QA role. Do not invent ACs.
- **Custom workflow states.** Every team renames states (`Ready for QA` versus `In QA` versus `Testing`). The status catalog is the `bun run jira:sync-workflows` output, never a hand-written diagram.
- **Permission gaps.** The QA user may lack permission to transition tickets. Surface it now as a discovery gap, not at the first sprint.
- **Secrets in examples.** CLI invocations use env-var interpolation (`$ATLASSIAN_API_TOKEN`), never literal tokens.

## When to re-run Phase 4

| Trigger | Action |
|---------|--------|
| New PM tool adopted | Re-run the whole check. |
| New required custom fields | `bun run jira:sync-fields`, then `bun run jira:check`. |
| Tracker URL migration (e.g., Jira Cloud move) | Update `issue_tracker.atlassian_url` in `.agents/project.yaml`, then re-run the check. |
