---
name: business-api-context
description: "What the API of the system under test MEANS to the business: every endpoint group, who calls it and why, what it changes, which auth level and role it needs, the business flows that cross several endpoints, error semantics and the external integrations behind them. Load it whenever a task touches an API test, a request or response, an auth or permission question, a status code that looks wrong, contract coverage, or asks which endpoint does what, even when nobody says 'API map'. Reads its map through `bun run context:map business-api-context`. Pure knowledge plus a self-update proposal path: NOT the OpenAPI contract itself (that is the schema), NOT for running a QA stage, NOT for entities (business-data-context) or user journeys (business-e2e-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams, api-schema]
---

# business-api-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map business-api-context` (or `--section <id>` for one endpoint group). NEVER read `references/business-api-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no map". Say so and hand the user `project-context` mode `api`; never answer API questions as if the API were empty.
- DO: take field names, types and required flags from the schema (`[API_TOOL]` schema read, `api/schemas/`), and the MEANING from the map. On a conflict the schema wins for shape, the running API wins for behaviour.
- WHEN a session observes something that contradicts a section (a status, a field, an auth rule): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no `api/schemas/`, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `api-schema` (verifying a section) or `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an API-level dispatch, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: **its API as a business surface**. Which endpoint groups exist and what each one is for, who is allowed to call them, what they change, how a multi-call flow chains them, what each error means to a user, and which third parties sit behind them. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-api-map.html` | the synthesis, one `<section>` per endpoint group or cross-endpoint flow, plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the OpenAPI contract (`[API_TOOL]` schema read, `api/schemas/` after `bun run api:sync`) | paths, methods, payload shapes | wins for shape |
| the running API of the active environment (`curl`, `agentic-qa-core/references/api-testing-doctrine.md`) | real statuses and bodies | wins for behaviour |
| `project-context` mode `api` | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Payload schemas and types → the OpenAPI contract and `api/schemas/`.
- Entities, state machines and triggers → `business-data-context`.
- User journeys and the feature catalog → `business-e2e-context`.
- Tokens and credentials → `.env` and `bun run api:login`, never a map.

## References

- `references/business-api-map.html` — the map (generated; read through the reader).
- `references/refresh.md` — the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md` — measured traps in reading this project's API.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
