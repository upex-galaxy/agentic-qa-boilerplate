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

## Compact Rules

<!--
  This section is Strategy A for scripts/build-skill-registry.ts, and it is
  load-bearing for CORRECTNESS, not just for quality. Without it the builder
  fell through to Strategy B, which scrapes bare bullets and cannot see the
  `agentic-qa-core does not:` sentence that governs the "Out of scope" list —
  so every prohibition below shipped into REGISTRY.md as a PERMISSION, and from
  there into subagent briefings that AGENTS.md §3 labels authoritative.
  Keep each rule self-contained: a rule that needs a preceding sentence to mean
  what it says is a rule that will eventually be extracted without it.
-->

- DO NOT create, modify, or delete ANY file while acting as `agentic-qa-core`. It is a passive reference library with no write path of its own.
- DO NOT write `.context/` artifacts here (that is `/project-discovery`), scaffold tests / fixtures / KATA components (that is `/adapt-framework` and `/test-automation`), adapt the framework to a stack (`/adapt-framework`), sync AI-critical docs (`/sync-ai-context`), or sync OpenAPI schemas (`bun run api:sync`).
- DO NOT orchestrate a workflow or bootstrap a target repo from this skill. It hosts doctrine; the workflow skills execute it.
- WHEN a workflow skill cites `agentic-qa-core/references/*.md`: load ONLY the files that skill's `## Dependencies` block names. Never preload the whole reference set.
- WHEN deriving test cases or coverage from acceptance criteria in ANY testing skill: `references/test-design-doctrine.md` is mandatory reading first.
- WHEN filing any bug / defect / improvement: `references/defect-management-doctrine.md` is mandatory reading first.
- WHEN dispatching a subagent: use the 7-component briefing in `references/briefing-template.md` and pick the pattern via `references/dispatch-patterns.md`. A subagent that must answer the user directly also loads `references/behavioral-layer.md` — it inherits no register from the orchestrator.
- WHEN closing a workflow stage: verify that stage's Definition of Done in `references/stage-gates.md` BEFORE advancing.
- DO edit the owning skill's `references/*.md` when a rule changes, then run `bun run skills:registry`, then refresh the deck under `packages/decks/agentic-qa-core/`. That order keeps prose, registry, and decks from drifting.
- DO treat this boilerplate as clone-in-full. Copying a single skill directory in isolation leaves it without the foundation files it depends on, and it will not function.

**Read full SKILL.md when**: you need the full table of hosted references and who cites each one, the deck-hosting details, or the exact `## Dependencies` block shape to add to a skill.

---

## References hosted

| File | Cited by | Purpose |
|------|----------|---------|
| `references/test-design-doctrine.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation` | **Canonical doctrine for deriving test cases / ATCs from acceptance criteria**: the 5 principles (AC-verify ≠ testing; AC = floor not ceiling; criterion-vs-test-case; 1:N explode-default/justify-collapse; risk-outside-criterion), the redefined coverage model, and the formal techniques (EP, BVA, State-Transition, Decision Tables, Pairwise, Error Guessing, Risk-based) with binding triggers + the Test-Design Checklist gate. |
| `references/briefing-template.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `project-discovery` | The 7-component subagent briefing template, with concrete filled examples per dispatch pattern. |
| `references/dispatch-patterns.md` | All workflow skills with a "Subagent Dispatch Strategy" section | Decision table + heuristic for picking Single / Sequential / Parallel / Background. |
| `references/stage-gates.md` | All workflow skills (`shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`) | Definition-of-Done checklist per workflow stage. The orchestrator verifies each stage's DoD (planning stages include the Test-Design Checklist) before appending the progress checkpoint and advancing — turns the prose doctrine into an enforced gate. |
| `references/orchestration-doctrine.md` | Subagents that need orchestration rules without pulling the whole `AGENTS.md` | Cacheable mirror of `AGENTS.md` §"Orchestration Mode (Subagent Strategy)". |
| `references/behavioral-layer.md` | Subagents that must answer the user directly, in any workflow skill | Cacheable mirror of `AGENTS.md` §2: caveman compression, Butler granularity, PM Voice register, Visual Mapping. A dispatched subagent inherits none of that from the orchestrator, so its report reads in a different voice unless it pulls this. |
| `references/skill-composition-strategy.md` | `framework-development`, every workflow skill | T1-T4 tier model + SDD boundary + composition contract. |
| `references/skill-resolver.md` | Skills that resolve composable skills at runtime via the registry | Skill Resolver Protocol used by sub-agent launches. Companion: `scripts/build-skill-registry.ts` → `.agents/skills/REGISTRY.md`. |
| `references/preflight-gate.md` | `shift-left-testing`, `sprint-testing`, `test-documentation`, `test-automation`, `regression-testing`, `framework-development` | Readiness Preflight Gate doctrine — probe tools/MCPs/CLIs/credentials and surface a user checklist BEFORE a skill starts its real work. Owns the secret/token handling + OpenAPI `api-login` → RESTART flow. |
| `references/adr-doctrine.md` | `project-discovery`, `framework-development`, `sprint-testing`, `test-automation` | When a test-architecture decision earns an ADR (two-gate test: architectural AND hard-to-reverse) + the detect → draft → record procedure. Test architecture = runner/framework choice, Page-Object vs Screenplay, fixture/data strategy, isolation & parallelization, auth-in-tests, selector contract, exploratory-vs-scripted boundary, reporting/CI sharding, flake-retry policy. |
| `references/api-testing-doctrine.md` | `sprint-testing`, `test-automation`, `test-documentation` | **Canonical API-testing maneuver** (agentic level, not KATA code): the three-tool split — OpenAPI MCP = schema READ-ONLY (discover endpoints/schemas), `bun run api:login` = mint token only (→ `.auth/tokens.env` env var `API_TOKEN_<ROLE>_<ENV>` + `.auth/tokens.json` keyed `<ROLE>_<ENV>`), curl = authenticated execution. Covers the schema-drift caveat (dev/latest vs target env), token-freshness checks, and the "shell env vars don't persist across the agent's Bash calls → `source` per curl call" rule. |

When a skill cites one of these, it includes a Dependencies block at the top so the AI knows to load `agentic-qa-core` before continuing.

---

## Core reference decks (visual, human-facing)

`agentic-qa-core` hosts two canonical presentations under `packages/decks/agentic-qa-core/` (published on the GitHub Pages hub; see `agentic-qa-onboard` for the opening protocol):

| File | Teaches | Language |
|------|---------|----------|
| `naming-conventions.es.html` | The Naming Codex — every test-artifact title format across the seven layers (CASE · GROUP · CONTAINER · CODE · JIRA · GIT · FILESYSTEM), plus a coverage audit of open naming gaps. | Spanish (technical terms in English) |
| `skills-io-flow.es.html` | The E2E flow (Historia → Refinamiento → Dev → Testing) seen through each skill's **inputs & outputs** — what every phase reads (stdin), which skills it loads (deps), what it produces (stdout), and which Jira fields/transitions it touches. Mac-terminal UI with one tab per phase. | Spanish (technical terms in English) |

They are the human-facing mirror of the rules that live in prose across the workflow skills' `references/*.md`. The Naming Codex answers "how is this artifact named"; the skills-io deck answers "what does this skill need and emit". Navigate with arrow keys (naming deck: `O` = overview, `F` = fullscreen; skills-io deck: tabs + `1-9`). Offer the matching deck when a user asks about naming or about how the skills chain together end-to-end.

**Keep them canonical**: when a rule changes, edit the owning skill's `references/*.md`, regenerate `REGISTRY.md` (`bun run skills:registry`), then refresh the deck in `packages/decks/agentic-qa-core/` (the only copy — skill-side HTML copies were removed) so the decks never drift from the prose source.

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

This boilerplate is designed to be cloned in full. The workflow skills under `.agents/skills/` depend on foundation files that live at the repo root (`AGENTS.md`, `.agents/`, `scripts/`, `package.json`, `tests/`) and on shared references under `agentic-qa-core/references/`. Installing only a subset of skills (e.g. copying one skill directory in isolation) leaves those skills without their dependencies and they will not function.

If a downstream user has only the skills and not the rest of the repo, the supported path is to clone the full boilerplate repository and integrate it as a single unit. No per-skill scaffolding action is provided by this skill — the skill set is intentionally inseparable from the foundation.

---

## Out of scope

`agentic-qa-core` does not:

- Create or modify any files. It is a passive reference library.
- Create or modify `.context/` files (that belongs to `/project-discovery`).
- Generate or scaffold tests, fixtures, or KATA components (that belongs to `/adapt-framework` and `/test-automation`).
- Adapt the framework to a specific stack (that belongs to `/adapt-framework`).
- Sync AI-critical documents or project-specific facts in `AGENTS.md` (that belongs to `/sync-ai-memory`).
- Sync OpenAPI / API schemas (that's `bun run api:sync`).

For framework evolution (changes to KATA bases, fixtures, `cli/`, `scripts/`, `api/schemas/` pipeline), see `/framework-development`.
