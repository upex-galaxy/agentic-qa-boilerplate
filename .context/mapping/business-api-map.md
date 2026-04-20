# Business API Map — placeholder

> **Run `/business-api-map` (Claude Code command) to populate or refresh this file.**

A business-first map of how the system's API powers user journeys: permission & auth model, 3–7 critical journeys, architecture behind the API, external integrations, cross-references to entities (`business-data-map.md`) and features (`business-feature-map.md`).

- **Not a complete endpoint catalog** — technical endpoint sync lives in `bun run api:sync` + the generated `api/schemas/` types.
- **Consumed by**: `/master-test-plan`, `sprint-testing`, `test-automation`.

The command replaces this placeholder with the 7-section output (summary, permission model, critical journeys, architecture, integrations, cross-references, discovery gaps). Keep this file checked in as the expected anchor.

See `.claude/commands/business-api-map.md` for the exact output contract.
