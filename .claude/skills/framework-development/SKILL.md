---
name: framework-development
description: "Framework evolution mode — evolves the QA boilerplate itself (KATA, fixtures, cli/, scripts/, api/schemas/ pipeline, package.json deps). Single legitimate entry point for chaining SDD-* skills in this repo. Use when adding new fixture APIs, refactoring KATA base classes, evolving the installer, modifying the OpenAPI sync pipeline, or any change to the framework infrastructure that is NOT per-ticket test writing or manual QA. Triggers on: /framework-development, \"evolve framework\", \"framework refactor\", \"new fixture API\", \"modify KATA base\", \"refactor cli\", \"boilerplate evolution\". Do NOT use for: writing tests for a ticket (use /test-automation), manual QA per ticket (use /sprint-testing), documenting test cases (use /test-documentation), running regression suites (use /regression-testing)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode]
complementary_categories: [framework-evolution, meta-skill]
---

# Framework Development — Evolve the QA Boilerplate

> ⚠️ **TRANSITIONAL STATE (2026-05-18)**: This skill still chains SDD-* skills that are NO LONGER installed by `bun run setup`. The installer now uses `gentle-ai install --preset minimal` (engram only). A self-contained refactor of this skill (Plan → Code → Verify with no SDD-* dependencies) is scheduled for the next session.
>
> **If you need to use this skill before the refactor lands**, install the SDD bundle manually:
> ```bash
> gentle-ai install --components engram,sdd --agent <claude-code|opencode|cursor>
> ```
> Restart your agent after install so the SDD-* skills appear in the system-reminder list. Then the chain below works as-is.

Gateway skill for changes to the framework itself (KATA layers, fixtures, installer, OpenAPI pipeline, scripts, doctrine docs). It is the **only** legitimate entry point for chaining the SDD-* skills inside this repo. Per-ticket QA work, test specs, and TMS documentation are owned by other workflow skills and MUST NOT trigger SDD chains.

The skill exists because SDD planning, applied to per-ticket test writing, doubles cost without adding value (test-automation already has Plan → Code → Review). SDD's value lands when the change is architectural — new fixture, new layer helper, installer rewrite, manifest extractor — and that is the surface this skill gates.

---

## Subagent Dispatch Strategy

This skill is compliant with the doctrine in `CLAUDE.md` §"Orchestration Mode (Subagent Strategy)". Every dispatch follows the 6-component briefing format defined in `.claude/skills/agentic-qa-core/references/briefing-template.md`, and the pattern selected per phase matches the decision guide in `.claude/skills/agentic-qa-core/references/dispatch-patterns.md`. Each SDD phase runs as one subagent — fresh context, KATA invariants pre-injected, ALLOWED/FORBIDDEN path guardrails copied verbatim into the briefing.

| Phase                              | Pattern    | Subagent role                                                                                                                                  |
|------------------------------------|------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase 0 — path self-check          | inline     | orchestrator only; no subagent. Lists target paths against ALLOWED/FORBIDDEN tables; aborts on violation                                       |
| `sdd-explore`                      | Single     | one subagent investigates affected surface; reads `references/kata-invariants.md`; returns approach options                                    |
| `sdd-propose`                      | Single     | one subagent drafts the proposal; receives kata-invariants + path guardrails inline                                                            |
| `sdd-spec`                         | Single     | one subagent writes delta specs for the framework capability                                                                                   |
| `sdd-design`                       | Single     | one subagent writes the technical design; cites which KATA invariants are touched and which extension points are used                          |
| `sdd-tasks`                        | Single     | one subagent breaks down the implementation; emits Review Workload Forecast                                                                    |
| `sdd-apply`                        | Sequential | one subagent per task batch; receives strict TDD flag from `sdd-init`; merges apply-progress across batches                                    |
| `sdd-verify`                       | Single     | one subagent validates against spec + kata-invariants; runs `bun run test`, `bun run types:check`, `bun run lint:check`                               |
| `sdd-archive`                      | Single     | one subagent merges delta specs into main, closes the change, writes archive report                                                            |

- **Path guardrails injected per dispatch**: every SDD subagent prompt MUST include the ALLOWED + FORBIDDEN tables verbatim under a `## Project Standards (auto-resolved)` block, plus the line: `KATA invariants reference: .claude/skills/framework-development/references/kata-invariants.md (read first if your task touches tests/components/, api/schemas/, or fixtures).`
- **On any subagent failure**: STOP, return the failing report, do NOT auto-rerun. The orchestrator decides retry / skip / abort. See `.claude/skills/agentic-qa-core/references/orchestration-doctrine.md`.

---

## Phase 0 — Path self-check (mandatory, runs first)

Before invoking any SDD skill, the orchestrator MUST list the files / directories the change will touch and verify each one against the tables below. Skipping Phase 0 is the most common way framework changes leak into ticket-owned surface area.

1. Ask the user (or infer from the request): "Which paths will this change touch?"
2. For each path, look it up in the ALLOWED table → proceed. Or in the FORBIDDEN table → abort and redirect to the correct skill named in the row.
3. If a path matches neither table, ASK the user explicitly — never assume.
4. If a single change spans both ALLOWED and FORBIDDEN paths (e.g. "refactor `tests/components/ui/UiBase.ts` AND update the e2e tests that consume it"), split the work: framework-development handles the base-class change; `/test-automation` handles the test-spec migration in a follow-up.

---

## ALLOWED paths (framework surface)

| Path                                                  | Why it lives here                                                                                                |
|-------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| `cli/`                                                | Installer + agents:setup + lint:agents — project-level tooling, ships with every clone                           |
| `scripts/`                                            | `bun run` script implementations (`api:sync`, `kata:manifest`, `jira:sync-fields`, `lint:skills`, etc.)          |
| `.agents/` (structure changes only)                   | Schema for `project.yaml`, `jira-fields.json`, `jira-workflows.json`, `jira-required.yaml`. Values stay manual.  |
| `tests/utils/`                                        | Agnostic utilities — Allure attach helpers, decorators, formatters. Evolution of the utility layer.              |
| `tests/components/` (Layer 2 + 3 base classes only)   | `TestContext.ts`, `ApiBase.ts`, `UiBase.ts`. NOT per-module `*Api.ts` / `*Page.ts` (those are test-automation).  |
| `tests/components/` (fixture files)                   | Fixture registry evolution — `ApiFixture.ts`, `UiFixture.ts`, `TestFixture.ts`. New fixture APIs.                |
| `scripts/sync-openapi.ts` and the sync pipeline       | Pipeline source. NOT generated `api/openapi-types.ts` (that is regenerated by `bun run api:sync`).               |
| `package.json` deps + scripts                         | Dependency upgrades, script registry, engines. Not test specs in `tests/`.                                       |
| `.claude/skills/agentic-qa-core/references/`          | Briefing template, dispatch patterns, orchestration doctrine, skill-composition-strategy.                        |
| `.claude/skills/framework-development/`               | This skill itself — references, scripts, agents/.                                                                |
| `.claude/commands/`                                   | Slash-command source (`/sync-ai-memory`, `/business-*-map`, `/master-test-plan`, etc.).                          |

---

## FORBIDDEN paths (redirect map)

| Path                                                | Owned by                                                          |
|-----------------------------------------------------|-------------------------------------------------------------------|
| `tests/e2e/`                                        | `/test-automation` — per-ticket E2E specs                         |
| `tests/integration/`                                | `/test-automation` — per-ticket API/integration specs             |
| `tests/components/{module}/` (Page/Api/Steps)       | `/test-automation` — module-specific Domain components and Steps  |
| `.context/PBI/`                                     | `/sprint-testing` — per-ticket QA context                         |
| `.context/master-test-plan.md`                      | `/master-test-plan` command — regenerative                        |
| `.context/business/`                                | `/business-data-map`, `/business-feature-map`, `/business-api-map` commands — regenerative |
| `.context/test-management-system.md`                | `/test-documentation` — TMS modality + setup                      |
| `api/openapi-types.ts`                              | Generated artifact — regenerated by `bun run api:sync`            |
| `kata-manifest.json`, `reports/atc_results.json`    | Generated artifacts — runtime / build outputs                     |
| `.env`, credentials                                 | Manual edit only — no skill, no AI rewrite                        |

---

## SDD chain orchestration

After Phase 0 passes, run the SDD chain in dependency order. Each phase is one subagent; the orchestrator coordinates and pauses between phases per the user's chosen execution mode (Interactive default, Auto on request). Briefing scaffold for every dispatch (fill the `<...>` slots per phase):

```
Goal: <one-sentence outcome for this SDD phase, scoped to the framework change>

Context docs:
  - .claude/skills/framework-development/references/kata-invariants.md
  - <prior phase artifact path or engram topic_key, e.g. sdd/<change>/proposal>
  - <relevant ALLOWED-path file(s) the phase will read or touch>

Skills to load: /sdd-<phase>

Exact instructions:
  1. Read the kata-invariants reference fully before drafting.
  2. <phase-specific step — e.g. "draft proposal", "write delta spec", "implement task batch 1">
  3. Save the artifact at the engram topic_key sdd/<change>/<phase> (or openspec path if openspec mode).
  4. Return the executive summary inline.

Report format:
  - status: ready | blocked | failed
  - artifacts: [<topic_key or path>]
  - next_recommended: <phase or "stop">
  - risks: [<one-liner per risk>]
  - skill_resolution: injected | fallback-*

Rules:
  - ALLOWED paths only (table copied below). FORBIDDEN → abort.
  - <ALLOWED table verbatim>
  - <FORBIDDEN table verbatim>
  - Do NOT modify generated artifacts (api/openapi-types.ts, kata-manifest.json, reports/).
  - If strict TDD mode is active (cached from sdd-init), follow strict-tdd.md without fallback.
  - On uncertainty, STOP and report — do not improvise on framework surface.
```

Phase order (re-read after every phase to decide whether to continue):

```
Phase 0 (inline) -> sdd-explore -> sdd-propose -> sdd-spec -> sdd-design -> sdd-tasks -> sdd-apply -> sdd-verify -> sdd-archive
```

`sdd-design` is optional for low-risk changes (single utility helper, dependency bump). `sdd-spec` is mandatory whenever the change introduces or modifies a public framework API (anything in `tests/components/`, `cli/`, exported `scripts/`).

---

## References

- `references/kata-invariants.md` — INVARIANT vs EXTENSIBLE rules for the 4 KATA layers, fixture selection, ATC identity, DRY scope, import aliases, public-method contract, extension points, evolution checklist, and out-of-scope surfaces. Required reading before any SDD subagent that touches `tests/components/` or `api/schemas/`.
- `../agentic-qa-core/references/skill-composition-strategy.md` — T1/T2/T3/T4 tier model, framework-development ↔ SDD anti-leak contract, category vocabulary, validation rules. Required reading the first time you orchestrate framework-development in a session.
- `../agentic-qa-core/references/briefing-template.md` — 6-component briefing examples per pattern.
- `../agentic-qa-core/references/dispatch-patterns.md` — Single / Sequential / Parallel / Background decision guide.
- `../agentic-qa-core/references/orchestration-doctrine.md` — failure protocol, ASK-on-error rule, no auto-fix.
