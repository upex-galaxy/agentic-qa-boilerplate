---
name: business-data-context
description: "The system under test at the data level: entities, relationships, state machines, triggers, cron jobs, webhooks, integrations. Use when a task touches the database, a SQL query, test data setup, a status transition or a background job; when the data map needs a fix. Endpoint contracts are business-api-context."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams, db]
---

# business-data-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Upstream delivers it once as a placeholder, then the project owns it: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- Read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). Skip `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
- A placeholder map means there is no map. Say so and hand the user `project-context` mode `data`, so nobody mistakes an empty map for an empty system.
- Cite a fact with its section id and `data-updated` date. A section older than the code it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
- When a session observes something that contradicts a section, propose the one-section edit with its evidence to the user, or to the conductor when you are a supervised worker, and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`. Jira, `.context/`, other skills and product code are out of scope, because this skill owns one map and nothing else.
- Keep map content out of this SKILL.md. A rule for reading the data goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a DB-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

The system's data: which business entities exist and why, how they relate, which states each one moves through and what fires the transitions, what runs automatically, which external services read or write it, and the end-to-end flows (`User -> API -> Logic -> DB -> Response`) that move it. Loading it changes what the agent knows. The only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-data-map.html` | the synthesis, one `<section>` per entity, flow, state machine, process and integration, plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the live database of the active environment (`[DB_TOOL]`) | schema, constraints, enums, real rows | wins over the map on any conflict |
| the backend repo (`{{BACKEND_REPO}}`) | services, models, validation, triggers, jobs | wins over the map on any conflict |
| `project-context` mode `data` | the generator that creates the map and updates its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Column lists and raw DDL: the database itself, on demand through `[DB_TOOL]`.
- Endpoint contracts, auth levels, payloads: `business-api-context`.
- User journeys and the feature catalog: `business-e2e-context`.
- Jira stories and their ACs: `.context/PBI/` (synced cache).

## References

- `references/business-data-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's data.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
