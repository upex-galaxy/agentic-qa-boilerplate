# Business API Map — placeholder

> **Run `project-context` mode `api` (`/project-context api` on Claude Code) to populate or refresh this file.**

A business-first map of how the system's API powers user journeys: permission & auth model, 3–7 critical journeys, architecture behind the API, external integrations, cross-references to entities (`business-data-map.md`) and features (`business-feature-map.md`).

- **Not a complete endpoint catalog** — technical endpoint sync lives in `bun run api:sync` + the generated `api/schemas/` types.
- **Consumed by**: `project-context` mode `test-plan`, `sprint-testing`, `test-automation`.

That mode replaces this placeholder with the 7-section output (summary, permission model, critical journeys, architecture, integrations, cross-references, discovery gaps). Keep this file checked in as the expected anchor.

See `.agents/skills/project-context/references/api.md` for the exact output contract.
