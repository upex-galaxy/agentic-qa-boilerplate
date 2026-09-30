---
name: infra-context
description: "How the system under test is built, run and deployed: its architecture and external services, the backend and frontend stacks with their run and test commands, the auth flow, the environments and their URLs, the CI/CD pipelines, and the non-functional budgets it must hold (performance, security, reliability, observability). Load it whenever a task wires the test framework to the stack, touches an environment, a deploy, a pipeline, auth in tests, test IDs, or a performance or security budget, or asks how the product runs or where it is deployed, even when nobody says 'infrastructure' or 'architecture'. Reads its map through `bun run context:map infra-context`. Pure knowledge plus a self-update proposal path: NOT for running a QA stage or editing CI, NOT for business vocabulary (business-domain-context) or data lifecycles (business-data-context)."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# infra-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Delivered once by upstream as a placeholder, then owned by the project: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- DO: read the map through `bun run context:map infra-context` (or `--section backend`, `--section environments`, ...). NEVER read `references/infra-map.html` raw: its SVG is most of the bytes and none of the facts.
- DO: treat a placeholder map as "no infra map". Say so and hand the user `project-discovery` Phases 2-3; never guess a run command, an environment URL or an auth flow.
- DO: take environment URLs from `.agents/project.yaml` and credentials from `.env`. The map says which environments exist and how they differ; it never holds a secret or a value that has its own source.
- WHEN a session observes something that contradicts a section (a command that no longer runs, a pipeline step, an auth request that changed): PROPOSE the one-section edit with its evidence to the user (or to the conductor when you are a supervised worker), apply it only on approval. Procedure: `references/refresh.md`.
- DO NOT: write anywhere but this skill's own `references/`. No Jira, no `.context/`, no CI files, no other skill, no product code.
- DO NOT: copy map content into this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that uses `diagrams` (redrawing the architecture figure), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8. A table is fine where it says it better.

**Read full SKILL.md when**: building a briefing for framework adaptation, an environment or CI change, an auth-in-tests decision or a non-functional check; deciding whether a section is stale; or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: **how it is built and where it runs**. Its containers and external services, the stacks and commands of each side, how a user authenticates, which environments exist, how code reaches them, and the budgets that make a slow or fragile build a defect. Loading it changes what the agent KNOWS; the only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/infra-map.html` | the synthesis: `overview`, `architecture`, `external-services`, `nfr-<slug>`, `backend`, `frontend`, `environments`, `ci-cd`, `discovery-gaps` | this skill's map (read via `bun run context:map`) |
| the product repos (`{{BACKEND_REPO}}`, `{{FRONTEND_REPO}}`), their manifests, compose files and CI workflows | the real stack, commands and pipelines | wins over the map on any conflict |
| `.agents/project.yaml` `environments` | environment URLs | the only source for a URL |
| `.env` / `.env.example` | credentials and their key names | the only source for a secret |
| `.context/ADR/` | the hard-to-reverse test-architecture decisions | cited from `architecture` |
| `project-discovery` Phases 2-3 | the generator that CREATEs the map and UPDATEs its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Business vocabulary and the business model → `business-domain-context`.
- Entities, triggers and state machines → `business-data-context`.
- Endpoint groups and error semantics → `business-api-context`.
- This framework's own KATA wiring → `test-framework-adaptation`, and the code under `tests/`.

## References

- `references/infra-map.html` — the map (generated; read through the reader).
- `references/refresh.md` — the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md` — measured traps in reading this project's stack.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
