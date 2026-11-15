---
name: business-api-context
description: "The business meaning of the system's API: endpoint groups, callers, auth, flows, errors, integrations. Loaded by exploratory-testing and by the skill resolver for API-level dispatches."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams, api-schema]
---

# business-api-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Upstream delivers it once as a placeholder, then the project owns it: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- Read the map through `bun run context:map business-api-context` (or `--section <id>` for one endpoint group). Skip `references/business-api-map.html` raw: its SVG is most of the bytes and none of the facts.
- A placeholder map means there is no map. Say so and hand the user `project-context` mode `api`, so nobody mistakes an empty map for an empty API.
- Take field names, types and required flags from the schema (`[API_TOOL]` schema read, `api/schemas/`) and the meaning from the map. When they conflict, the schema wins for shape and the running API wins for behaviour.
- When a session observes something that contradicts a section (a status, a field, an auth rule), propose the one-section edit with its evidence to the user, or to the conductor when you are a supervised worker, and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`. Jira, `.context/`, other skills, `api/schemas/` and product code are out of scope, because this skill owns one map and nothing else.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `api-schema` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an API-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

The system's API as a business surface: which endpoint groups exist and what each is for, who may call them, what they change, how a multi-call flow chains them, what each error means to a user, and which third parties sit behind them. Loading it changes what the agent knows. The only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, not copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-api-map.html` | the synthesis, one `<section>` per fact unit (`overview`, `auth-model`, `journey-<slug>`, `architecture`, `integrations`, `cross-references`), plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the OpenAPI contract (`[API_TOOL]` schema read, `api/schemas/` after `bun run api:sync`) | paths, methods, payload shapes | wins for shape |
| the running API of the active environment (`curl`, `agentic-qa-core/references/api-testing-doctrine.md`) | real statuses and bodies | wins for behaviour |
| `project-context` mode `api` | the generator that creates the map and updates its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Elsewhere

- Payload schemas and types: the OpenAPI contract and `api/schemas/`.
- Entities, state machines and triggers: `business-data-context`.
- User journeys and the feature catalog: `business-e2e-context`.
- Tokens and credentials: `.env` and `bun run api:login`, never a map.

## References

- `references/business-api-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's API.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
