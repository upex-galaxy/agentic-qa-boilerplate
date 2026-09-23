# Skill Scaffold — the contract every new T1 skill is born with

> Cited by: `/framework-development` (boilerplate skills: the change IS a skill) and `project-context` mode `context-skill` (consumer SUT context skills). `skill-creator` (T4, ask-before-load) is loaded for the halves it is good at, the test prompts and the description optimizer; the scaffold below works WITHOUT it.
> Axes and kinds: `skill-composition-strategy.md` §2b. Lint: `scripts/lint-skills.ts`.

---

## 1 · Frontmatter every T1 skill carries

```yaml
---
name: <slug>                                   # equals the directory name
description: "<trigger phrases + what it does + what it is NOT for>"
license: MIT
compatibility: [claude-code, codex, opencode]
complementary_categories: [<from strategy §5.1>] # optional, audited when present
metadata:
  kind: <context | workflow | utility | core>  # mandatory, gated (KIND-MISSING / KIND-VOCAB / KIND-SUFFIX)
---
```

Only `allowed-tools, compatibility, description, license, metadata, name` are spec top-level keys; anything else project-specific goes under `metadata`. `compact_rules` (frontmatter block scalar) is optional and consumed verbatim by `scripts/build-skill-registry.ts`; without it the registry extracts a `## Compact Rules` section from the body.

## 2 · Per kind: files, suffix, sections

| Kind | Slug suffix | Files | Body sections that must exist |
|---|---|---|---|
| **context** | `-context` (mandatory) | `SKILL.md`, `references/gotchas.md` | `## What this skill knows` (one aspect), `## Sources of truth` (the `.context/` paths it CITES), `## Rules` (judgment, each dated), `## Not here` (what belongs in `.context/` instead) |
| **workflow** | none | `SKILL.md`, `references/`, `evals/evals.json` | the session banner + `## Phase 0` (register the slug in `SESSION_RETROFITTED_SKILLS`, `scripts/lint-skills.ts`, so checks 10-12 bind), `## Compact Rules`, `## Subagent Dispatch Strategy` (7-component briefing), a session-close step citing `session-footer-contract.md` and `skill-refinement-protocol.md`, a blocker path citing `upstream-feedback.md` |
| **utility** | `-cli` / `-tool` / `-app` (mandatory) | `SKILL.md` with `allowed-tools: Bash(<binary>:*)`, `references/gotchas.md` | `## Compact Rules`, the tool's grammar (verbs, flags, auth, errors), a §6.5 row in `AGENTS.md` if a Bash binary must auto-load it |
| **core** | none | `SKILL.md` + `references/` | no write path of its own; other skills cite its references |

`references/gotchas.md` uses the measured genre (`orca-orchestration/references/gotchas.md`): columns `# · Gotcha · Symptom · Fix · Measured · Verified against`, plus a `## No longer true` section rows move to instead of being deleted.

## 3 · Context skills: the three-question test (what goes where)

Ask about each piece of knowledge:

1. **Can a command regenerate it from a source of truth?** (code, OpenAPI, Jira, a live DB, a CI log) → yes: `.context/` (owned by `/project-discovery`, `project-context`, `bun run context:hydrate`, `bun run api:sync`). A context skill never holds regenerable facts.
2. **Would two competent sessions write it differently?** → yes: judgment (a rule, an interpretation, a gotcha paid for on a date) → the `-context` skill. No: a fact → `.context/`.
3. **Must it trigger by itself when the topic comes up?** A skill has a `description` the harness matches; a `.context/` file is read only when a skill's read list names it. Unasked-for knowledge → skill. Pulled-at-a-known-step knowledge → `.context/`.

| Content | Home |
|---|---|
| Entity map, CRUD matrix, endpoint list, auth model, infra topology | `.context/business/*.md`, `.context/SRS/*` |
| The rule for READING that map ("orders are soft-deleted; a count without `deleted_at IS NULL` is wrong") | `<aspect>-context/SKILL.md` or its `references/gotchas.md` |
| Jira mirror | `.context/PBI/` (never hand-written) |
| A test-architecture decision | `.context/ADR/` |
| The repo's own methodology (index + invariants) | `iql-context` (shipped upstream) |

**Hard rule: a `-context` skill CITES `.context/` paths, it does not copy them.** A context skill that restates a `.context/` fact is a second source of truth and fails review. (The `.context/` prefix is NOT in the STALE-PATH lint on purpose: 23 legitimate citations in this repo point at files `project-discovery` generates per project, measured 2026-09-23.)

**Ownership rule:** SUT context skills (`data-context`, `api-context`, `infra-context`, ...) are project-owned and NEVER shipped upstream. The `skills` component syncs the whole `.agents/skills/` directory, and a same-slug directory upstream would overwrite the project's. Upstream ships templates and `iql-context` only.

## 4 · Minimal `SKILL.md` for a context skill

```markdown
---
name: <aspect>-context
description: "Trigger: <aspect> questions, <domain words>. Judgment layer over .context/<map>. NOT the map itself."
license: MIT
compatibility: [claude-code, codex, opencode]
metadata:
  kind: context
---

# <aspect>-context

## What this skill knows
One aspect of the SUT: <aspect>. Loading it changes what the agent KNOWS, not what it does next.

## Sources of truth (cited, never copied)
- `.context/business/business-data-map.md` — <what to read there>

## Rules (judgment, dated)
- <YYYY-MM-DD> · <rule> · measured: <how>

## Not here
- <fact class> → `.context/<path>` (regenerable)

## Refinements
Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
```

## 5 · Definition of Done for a new skill

- `bun run skills:check` green (kind declared, suffix matches, no stale path)
- `bun run skills:registry` regenerated; `bun run skills:registry:check` green
- `AGENTS.md` §5 row (T1 only), and a loader: which flow loads it and when (`agentic-qa-onboard` table rule: an install nothing loads should not exist)
- `evals/evals.json` for a workflow skill (validated by `scripts/run-skill-evals.ts`); optional for the other kinds at creation
