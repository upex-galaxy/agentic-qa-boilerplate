---
name: agentic-qa-core
description: "Foundation skill that hosts shared references cited by other workflow skills (briefing template, dispatch patterns, orchestration doctrine, skill composition strategy). Loaded on demand by `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery`, `adapt-framework`, `framework-development`. Do NOT use for: syncing AI-critical docs (use `/sync-ai-memory`), adapting KATA tests (use `/adapt-framework`), or onboarding the target project (use `/project-discovery`)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [meta-skill]
---

# Agentic QA Core — Foundation reference host

`agentic-qa-core` is the shared reference library that every workflow skill in this repo cites. It exists so doctrine (briefing template, dispatch patterns, orchestration rules, skill composition tiers) lives in one place instead of being duplicated across every `SKILL.md`.

Loading a workflow skill (e.g. `shift-left-testing`, `sprint-testing`, `test-automation`) implies loading the relevant `agentic-qa-core/references/*.md` on demand — workflow skills declare a `## Dependencies` block at the top so the AI knows what to pull in.

This skill does NOT orchestrate workflows, does NOT generate files, and does NOT bootstrap a target repo. The entire framework (skills, foundation files, scripts) ships together as one repo; à la carte adoption is not supported — see "Install model" below.

---

## References hosted

| File | Cited by | Purpose |
|------|----------|---------|
| `references/briefing-template.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery` | The 7-component subagent briefing template, with concrete filled examples per dispatch pattern. |
| `references/dispatch-patterns.md` | All workflow skills with a "Subagent Dispatch Strategy" section | Decision table + heuristic for picking Single / Sequential / Parallel / Background. |
| `references/orchestration-doctrine.md` | Subagents that need orchestration rules without pulling the whole `CLAUDE.md` | Cacheable mirror of `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)". |
| `references/skill-composition-strategy.md` | `framework-development`, every workflow skill | T1-T4 tier model + SDD boundary + composition contract. |
| `references/skill-resolver.md` | Skills that resolve composable skills at runtime via the registry | Skill Resolver Protocol used by sub-agent launches. Companion: `scripts/build-skill-registry.ts` → `.claude/skills/REGISTRY.md`. |

When a skill cites one of these, it includes a Dependencies block at the top so the AI knows to load `agentic-qa-core` before continuing.

---

## Dependency declaration for downstream skills

Every workflow skill that cites `agentic-qa-core/references/*.md` should declare it explicitly so the AI knows what to load on demand. Example block to add near the top of the skill's `SKILL.md`:

```markdown
## Dependencies
Requires `agentic-qa-core`. Loads on demand:
- agentic-qa-core/references/briefing-template.md
- agentic-qa-core/references/dispatch-patterns.md
```

The block is documentation — the AI reads it and pulls the cited files. There is no automated wiring: skills are markdown, not code.

---

## Install model

This boilerplate is designed to be cloned in full. The workflow skills under `.claude/skills/` depend on foundation files that live at the repo root (`CLAUDE.md`, `.agents/`, `scripts/`, `package.json`, `tests/`) and on shared references under `agentic-qa-core/references/`. Installing only a subset of skills (e.g. copying one skill directory in isolation) leaves those skills without their dependencies and they will not function.

If a downstream user has only the skills and not the rest of the repo, the supported path is to clone the full boilerplate repository and integrate it as a single unit. No per-skill scaffolding action is provided by this skill — the skill set is intentionally inseparable from the foundation.

---

## Out of scope

`agentic-qa-core` does not:

- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/project-discovery`).
- Generate or scaffold tests, fixtures, or KATA components (that belongs to `/adapt-framework` and `/test-automation`).
- Adapt the framework to a specific stack (that belongs to `/adapt-framework`).
- Sync AI-critical documents or project-specific facts in `CLAUDE.md` (that belongs to `/sync-ai-memory`).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).

For framework evolution (changes to KATA bases, fixtures, `cli/`, `scripts/`, `api/schemas/` pipeline), see `/framework-development`.
