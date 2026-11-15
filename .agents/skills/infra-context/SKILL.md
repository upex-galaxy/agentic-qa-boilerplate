---
name: infra-context
description: "Infra context: how the system under test is built, run and deployed. Use when a task touches its architecture, stack and run commands, auth flow, environments, CI/CD pipelines or performance and security budgets, or wires the test framework to the stack. Not for editing CI (framework-development)."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: context
  writes: [references/]
  requires_capabilities: [diagrams]
---

# infra-context

> Kind `context` with a declared write scope (`agentic-qa-core/references/skill-composition-strategy.md` §2b). Upstream delivers it once as a placeholder, then the project owns it: the map inside is this project's synthesis. Procedure: `agentic-qa-core/references/business-context-maps.md`.

## Compact Rules

- Read the map through `bun run context:map infra-context`, or add `--section backend`, `--section environments` and so on. The raw `references/infra-map.html` is mostly SVG, so the reader is the only way in.
- A placeholder map means there is no infra map. Say so and hand the user `project-discovery` Phases 2-3. A guessed run command, environment URL or auth flow sends the whole session down the wrong path.
- Take environment URLs from `.agents/project.yaml` and credentials from `.env`. The map says which environments exist and how they differ; it holds no secret and no value that has its own source.
- When a session observes something that contradicts a section (a command that no longer runs, a changed pipeline step, a changed auth request), propose the one-section edit with its evidence to the user (to the conductor when you are a supervised worker) and apply it only on approval. Procedure: `references/refresh.md`.
- Write only inside this skill's own `references/`: no Jira, no `.context/`, no CI files, no other skill, no product code.
- Keep map content out of this SKILL.md. Judgment goes in `## Rules` or `references/gotchas.md`, dated and measured.
- Before a step that redraws the architecture figure (`diagrams`), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8. A table is fine where it says it better.

**Read full SKILL.md when**: building a briefing for framework adaptation, an environment or CI change, an auth-in-tests decision or a non-functional check; deciding whether a section is stale; or proposing an edit to the map.

## What this skill knows

One aspect of the system under test: how it is built and where it runs. That covers its containers and external services, the stack and commands of each side, how a user authenticates, which environments exist, how code reaches them, and the budgets that turn a slow or fragile build into a defect. Loading it changes what the agent knows. The only thing it ever does is propose an edit to its own map.

## Sources of truth (cited, never copied)

| Source | What lives there | Role |
|---|---|---|
| `references/infra-map.html` | the synthesis: `overview`, `architecture`, `external-services`, `nfr-<slug>`, `backend`, `frontend`, `environments`, `ci-cd`, `discovery-gaps` | this skill's map, read via `bun run context:map` |
| the product repos (`{{BACKEND_REPO}}`, `{{FRONTEND_REPO}}`), their manifests, compose files and CI workflows | the real stack, commands and pipelines | wins over the map on any conflict |
| `.agents/project.yaml` `environments` | environment URLs | the only source for a URL |
| `.env` / `.env.example` | credentials and their key names | the only source for a secret |
| `.context/ADR/` | the test-architecture decisions that pass the three ADR gates | cited from `architecture` |
| `project-discovery` Phases 2-3 | the generator that creates the map and updates its stale sections | owns regeneration |

## Rules (judgment, dated)

_(none yet: each rule carries `YYYY-MM-DD · rule · measured: how`)_

## Not here

- Business vocabulary and the business model: `business-domain-context`.
- Entities, triggers and state machines: `business-data-context`.
- Endpoint groups and error semantics: `business-api-context`.
- This framework's own KATA wiring: `test-framework-adaptation`, and the code under `tests/`.

## References

- `references/infra-map.html`: the map (generated; read it through the reader).
- `references/refresh.md`: the self-update procedure and this aspect's staleness signals.
- `references/gotchas.md`: measured traps in reading this project's stack.

## Refinements

Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
