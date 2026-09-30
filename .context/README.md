# .context/ - caches of a source of truth, plus what this repo owns

`.context/` holds two kinds of file, and nothing else:

1. **What a script pulls from a source of truth.** The file is regenerable, so it is never committed.
2. **The few files this repo is itself the source of truth for.** Those are committed.

What an AI **synthesizes** (the business model, the glossary, the architecture, the data and API maps, the user journeys) does not live here. It lives inside a context skill, next to the judgment that reads it. Why: `.agents/skills/agentic-qa-core/references/skill-scaffold.md` §3.

## What lives here

| Path | Kind | Owner | Recovered by |
|---|---|---|---|
| `PBI/` (the Jira mirror) | script cache | `scripts/sync-jira-issues.ts` | `bun run context:hydrate` |
| `PBI/qa-artifacts/master-test-plan.md` | script cache | the `QA Master Test Plan` Epic description in Jira (`project-context` mode `test-plan` writes it) | `bun run context:hydrate` |
| `reports/` | script cache | the command that writes each report | re-running that command |
| `_framework/` | script cache | the framework scripts that write it | re-running them |
| `PBI/README.md`, `PBI/templates/`, `PBI/epics/*/test-specs/` | repo-owned | this repo (automation plans version with the test code) | `git checkout` |
| `ADR/` | repo-owned | test-architecture decisions, append-only (`ADR/README.md`) | `git checkout` |
| `project-config.md` | repo-owned | `/project-discovery` writes it once; the team edits it | `git checkout` |
| `regression-history/` | repo-owned | the hand-curated known-failures list `/regression-testing` reads | `git checkout` |
| `README.md` (this file), `reports/README.md` | repo-owned | this repo | `git checkout` |

The PBI tree has its own tier rules (`[SYNC]` / `[COMMIT]` / `[LOCAL]`): `PBI/README.md` and `AGENTS.md` §9.

## Ignored by default

Everything under `.context/` is ignored unless it is re-included by name. `.gitignore` (the `.context/` block) is the one owner of that list: read it there, never from a copy in a doc. The effect is that a new cache never gets committed by accident, and nobody has to remember to add an ignore line for it.

Git cannot re-include a file whose parent directory is excluded, so the block descends level by level down to `PBI/epics/*/test-specs/`. Probe any change with `git check-ignore -v` on a `test-specs/` file (must NOT be ignored) and on a synced `stories/.../story.md` (must be ignored).

## Where the synthesis lives

Every generated map is HTML inside its context map skill. The one list of those skills, each with its generator, is `CONTEXT_MAP_SKILLS` in `cli/lib/context-maps.ts`. Read a map through its reader, never the raw HTML:

```bash
bun run context:map <slug>                 # the whole map
bun run context:map <slug> --list          # its section ids
bun run context:map <slug> --section <id>  # one section
```

A map that still prints the placeholder notice has not been generated yet: the notice names the generator to run (`/project-discovery` for the domain and infra maps, `project-context` for the data, API and E2E maps). Procedure and anatomy: `.agents/skills/agentic-qa-core/references/business-context-maps.md`. Skill list with tiers and kinds: `.agents/skills/REGISTRY.md`.

## Legacy folders

A project scaffolded before this layout may still hold `business/`, `PRD/`, `SRS/`, `infrastructure/`, `master-test-plan.md`, `risk-assessment.md` or `PBI/ACCESS.md` at this level. They are left alone:

- They stay tracked. An ignore rule never untracks a file already committed.
- Where a context skill replaces one, its generator reads the old file as input the first time it builds the map (each skill's `legacy` list in `CONTEXT_MAP_SKILLS`). After that, the map is the one to read.
- Nothing upstream ships deletes them: `bun run up` and `bun run setup:doctor` only name them in an informational line. Removing them is the project's own decision, made after the matching map is generated.

The outputs that were retired without a replacement file (`PRD/executive-summary.md`, `risk-assessment.md`, `PBI/ACCESS.md`) have no reader any more: product risks travel in the Master Test Plan in Jira, and the backlog recipe is `PBI/README.md` plus `AGENTS.md` §9.

## References

- `AGENTS.md` (§4 key paths, §9 local context), read by Claude Code through the generated `CLAUDE.md` shim.
- `../CONTEXT.md`: the context-engineering rationale.
- `.agents/skills/`: every workflow and context skill self-describes in its `SKILL.md`.
