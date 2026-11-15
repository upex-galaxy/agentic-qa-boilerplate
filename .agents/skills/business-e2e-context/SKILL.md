---
name: business-e2e-context
description: "Knowledge of how people use the product end to end: personas, user journeys, the feature catalog and cross-feature flows. Use when a task touches an E2E or UI test, a user flow, a smoke or regression scope or an exploratory session, or asks what a user can do in the product. Not for entities (business-data-context) or endpoints (business-api-context)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# business-e2e-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- Read the map through `bun run context:map business-e2e-context` (or `--section <id>` for one journey or feature). Do not read `references/business-e2e-map.html` raw: its SVG is most of the bytes and none of the facts.
- A placeholder map counts as no map. Say so and hand the user `project-context` mode `e2e`; do not plan E2E coverage as if the product had no journeys.
- Start from the journey, then the feature. A story is tested inside the journey that reaches it; the feature catalog answers "what exists", the journeys answer "what a user does and where it breaks".
- When a session observes something that contradicts a section (a step, a branch, a state the UI shows), propose the one-section edit with its evidence to the user, or to the conductor when you are a supervised worker, and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`: no Jira, no `.context/`, no other skill, no test code, no product code.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing a figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for a UI or E2E dispatch, scoping a smoke or regression run, deciding whether a section is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: how it is used end to end. Who the users are, which journeys they take and where each can fail, which features exist and which journeys cross them, and the flows that only make sense across several features. Loading it changes what the agent knows; the only thing it does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-e2e-map.html` | the synthesis: a `<section>` per journey first, then per feature, plus `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the frontend repo (`{{FRONTEND_REPO}}`) | routes, pages, forms, guards | wins over the map on any conflict |
| the running app of the active environment | what a user really sees | wins for behaviour |
| `business-data-context`, `business-api-context` | the data and API behind each step | cited per step, never restated |
| `project-context` mode `e2e` | the generator that creates the map and updates its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Entities, triggers and state machines: `business-data-context`.
- Endpoint groups, auth and error semantics: `business-api-context`.
- Selectors, page objects and test code: `tests/components/` (KATA), owned by `/test-automation`.
- Jira stories and their ACs: `.context/PBI/` (synced cache).

## References

- `references/business-e2e-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's journeys.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, not as direct edits.
