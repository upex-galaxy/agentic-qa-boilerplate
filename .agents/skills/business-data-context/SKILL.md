---
name: business-data-context
description: "What the system under test IS at the data level: business entities and why they exist, their relationships, state machines, automatic processes (DB triggers, cron jobs, webhooks), external integrations and the business flows that move data between them. Load it whenever a task touches the database, data validation, a SQL query, test data setup, an entity's lifecycle or status transitions, a trigger or a background job, or asks how the product works under the hood, even when nobody says 'data map'. Reads its map through `bun run context:map business-data-context`. Pure knowledge plus a self-update proposal path: NOT for running a QA stage, NOT for endpoint contracts (business-api-context) or user journeys (business-e2e-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams, db]
---

# business-data-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map business-data-context` (or `--section <id>` for one entity or flow). NEVER read `references/business-data-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `data`; never answer data questions as if the system were empty.
- DO: cite a fact with its section id and `data-updated` date. A section older than the code it describes is a hypothesis to check with `[DB_TOOL]`, not an answer.
- WHEN a session observes something that contradicts a section: PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment (a rule for READING the data) goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `db` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a DB-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: **its data**. Which business entities exist and why, how they relate, which states each one moves through and what fires the transitions, what runs automatically, which external services read or write it, and the end-to-end flows (`User -> API -> Logic -> DB -> Response`) that move it. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-data-map.html` | the synthesis, one `<section>` per entity, flow, state machine, process and integration, plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the live database of the active environment (`[DB_TOOL]`) | schema, constraints, enums, real rows | wins over the map on any conflict |
| the backend repo (`{{BACKEND_REPO}}`) | services, models, validation, triggers, jobs | wins over the map on any conflict |
| `project-context` mode `data` | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Column lists and raw DDL → the database itself, on demand through `[DB_TOOL]`.
- Endpoint contracts, auth levels, payloads → `business-api-context`.
- User journeys and the feature catalog → `business-e2e-context`.
- Jira stories and their ACs → `.context/PBI/` (synced cache).

## References

- `references/business-data-map.html` — the map (generated; read through the reader).
- `references/refresh.md` — the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md` — measured traps in reading this project's data.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
