---
name: business-domain-context
description: "Business vocabulary of the system under test: what the product is for, who pays, and what each domain term means. Use when a task names or explains a domain concept: writing ACs or an ATP, naming test cases, filing a bug in business language, asking what a term means."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# business-domain-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Upstream delivers it once as a placeholder, then the project owns it: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- Read the map through `bun run context:map business-domain-context`, or add `--section term-<slug>` for one term. The raw `references/business-domain-map.html` is generated markup, so the reader is the only way in.
- A placeholder map means there is no glossary. Say so and hand the user `project-discovery` Phase 1. Test cases and ACs named in invented vocabulary mislead the whole team.
- Use the business term the map gives, and quote the UI label when a step talks about the screen. The code identifier belongs in code and selectors, not in a TC title or a bug summary.
- When a session observes a term the map lacks, or a label or meaning that contradicts a section, propose the one-section edit with its evidence to the user (to the conductor when you are a supervised worker) and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`: no Jira, no `.context/`, no other skill, no test code, no product code.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Figures are optional here because the glossary is tables. Before a step that draws one, run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8.

**Read full SKILL.md when**: building a briefing for an ATP, TC naming or AC refinement dispatch, deciding whether a term is stale, or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: its business and its words. It covers the problem the product solves, for whom, how it earns, and what each domain term means to the people who use it. Loading it changes what the agent knows. The only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/business-domain-map.html` | the synthesis: `overview`, `business-model`, a `term-<slug>` section per core term, `enumerations`, `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the product repos (`{{FRONTEND_REPO}}`, `{{BACKEND_REPO}}`) | UI copy, i18n files, model and enum names | wins over the map on any conflict |
| the backlog (`.context/PBI/`, synced from Jira) | the words the team writes in stories and ACs | evidence for a term, not a copy |
| `business-data-context` | the structure and lifecycle behind each term | cited per term |
| `project-discovery` Phase 1 | the generator that creates the map and updates its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Entities' structure, triggers and state machines: `business-data-context`.
- Endpoint groups, auth and error semantics: `business-api-context`.
- Personas, journeys and the feature catalog: `business-e2e-context`.
- Stack, environments and deploy: `infra-context`.
- Jira stories and their ACs: `.context/PBI/` (synced cache).

## References

- `references/business-domain-map.html`: the map (generated; read through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's vocabulary.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
