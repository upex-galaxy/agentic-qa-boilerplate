---
name: business-domain-context
description: "The vocabulary and the business of the system under test: what the product is for, who pays and why, and what every domain term means (the business meaning, the label the UI shows, the identifier the code uses, how it relates to other terms). Load it whenever a task names, labels or explains a domain concept: writing or refining acceptance criteria, authoring an ATP, naming a test case or a test file, filing a bug in business language, or asking what a term means or why a feature exists, even when nobody says 'glossary' or 'business model'. Reads its map through `bun run context:map business-domain-context`. Pure knowledge plus a self-update proposal path: NOT for running a QA stage, NOT for data structure and lifecycles (business-data-context), endpoints (business-api-context) or journeys (business-e2e-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# business-domain-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map business-domain-context` (or `--section term-<slug>` for one term). NEVER read `references/business-domain-map.html` raw.
- DO: treat a placeholder map as "no glossary". Say so and hand the user `project-discovery` Phase 1; never name test cases or rewrite ACs in invented vocabulary.
- DO: use the business term the map gives, and quote the UI label when a step talks about the screen. The code identifier belongs in code and selectors, never in a TC title or a bug summary.
- WHEN a session observes a term the map lacks, or a label or meaning that contradicts a section: PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no other skill, no test code, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Figures are optional here: the glossary is tables. Before a step that draws one, run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an ATP, TC naming or AC refinement dispatch, deciding whether a term is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: **its business and its words**. What problem the product solves, for whom, how it earns, and what each domain term means to the people who use it. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-domain-map.html` | the synthesis: `overview`, `business-model`, a `term-<slug>` section per core term, `enumerations`, `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the product repos (`{{FRONTEND_REPO}}`, `{{BACKEND_REPO}}`) | UI copy, i18n files, model and enum names | wins over the map on any conflict |
| the backlog (`.context/PBI/`, synced from Jira) | the words the team writes in stories and ACs | evidence for a term, never a copy |
| `business-data-context` | the structure and lifecycle behind each term | cited per term, never restated |
| `project-discovery` Phase 1 | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Entities' structure, triggers and state machines → `business-data-context`.
- Endpoint groups, auth and error semantics → `business-api-context`.
- Personas, journeys and the feature catalog → `business-e2e-context`.
- Stack, environments and deploy → `infra-context`.
- Jira stories and their ACs → `.context/PBI/` (synced cache).

## References

- `references/business-domain-map.html` — the map (generated; read through the reader).
- `references/refresh.md` — the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md` — measured traps in reading this project's vocabulary.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
