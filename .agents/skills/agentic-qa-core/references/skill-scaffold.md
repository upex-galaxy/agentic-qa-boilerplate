# Skill Scaffold — the contract every new T1 skill is born with

> Cited by: `/framework-development` (boilerplate skills: the change IS a skill) and `project-context` mode `context-skill` (consumer SUT context skills). `skill-creator` (T3, installed at project level by `cli/install.ts`) is ALWAYS the builder: both entry points load it for the draft, the test prompts, the evals and the description pass; the CONTRACT below is this repo's and `skill-creator` does not own it. On a machine where the install is missing, the scaffold still works from the template in §4, and the run says so.
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
| **context** | `-context` (mandatory) | `SKILL.md`, `references/gotchas.md`; a skill that holds a generated map adds `references/<map>.html` + `references/refresh.md` and declares `metadata.writes: [references/]` | `## What this skill knows` (one aspect), `## Sources of truth` (what it CITES), `## Rules` (judgment, each dated), `## Not here` (what belongs elsewhere) |
| **workflow** | none | `SKILL.md`, `references/`, `evals/evals.json` | the session banner + `## Phase 0` (register the slug in `SESSION_RETROFITTED_SKILLS`, `scripts/lint-skills.ts`, so the `SESSION-BANNER-MISSING`, `SESSION-PHASE-0-MISSING` and `SESSION-SCOPE-INVALID` checks bind), `## Compact Rules`, `## Subagent Dispatch Strategy` (7-component briefing), a session-close step citing `session-footer-contract.md` and `skill-refinement-protocol.md`, a blocker path citing `upstream-feedback.md` |
| **utility** | `-cli` / `-tool` / `-app` (mandatory) | `SKILL.md` with `allowed-tools: Bash(<binary>:*)`, `references/gotchas.md` | `## Compact Rules`, the tool's grammar (verbs, flags, auth, errors), a §6.5 row in `AGENTS.md` if a Bash binary must auto-load it |
| **core** | none | `SKILL.md` + `references/` | no write path of its own; other skills cite its references |

`references/gotchas.md` uses the measured genre (`orca-orchestration/references/gotchas.md`): columns `# · Gotcha · Symptom · Fix · Measured · Verified against`, plus a `## No longer true` section rows move to instead of being deleted.

## 3 · Context skills: what goes where

**The principle.** `.context/` holds what a SCRIPT pulls from an external source of truth, plus the few things this repo itself is the source of truth for. What an AI SYNTHESIZES lives in a skill. A cache is cheap to rebuild and identical on two machines; a synthesis is authored (by an AI, but authored), two sessions write it differently, rebuilding it costs thousands of tokens, and it is exactly the knowledge that should arrive unasked. Ask about each piece of knowledge:

| Question | Yes → |
|---|---|
| 1. Does a script pull it from an external source of truth? (Jira, OpenAPI, a CI log) | `.context/` as a `[SYNC]` cache, recovered by that script (`bun run context:hydrate`, `bun run api:sync`) |
| 2. Is this repo itself the source of truth for it? (a decision record, an automation plan versioned with the code) | `.context/` as `[COMMIT]` |
| 3. Otherwise: the AI synthesizes it from code, DB and contracts, or a human writes judgment about it | a context skill: the synthesis as the skill's generated map (`references/<map>.html`, `./business-context-maps.md`), the judgment in `## Rules` / `references/gotchas.md` |

Judgment vs fact inside a context skill: would two competent sessions write it differently? Yes → a dated rule. No → a fact, which belongs in the map (or the cache) and never in `SKILL.md`.

| Content | Home |
|---|---|
| Entity map, flows, state machines, endpoint groups, journeys (synthesis) | the business context skills' generated maps (`business-data-context`, `business-api-context`, `business-e2e-context`), read through `bun run context:map <slug>` |
| Business model, domain glossary (synthesis) | `business-domain-context`'s generated map, read through `bun run context:map business-domain-context` |
| Architecture, NFRs, backend / frontend / infrastructure facts (synthesis) | `infra-context`'s generated map, read through `bun run context:map infra-context` |
| The rule for READING that map ("orders are soft-deleted; a count without `deleted_at IS NULL` is wrong") | the skill's `## Rules` or `references/gotchas.md` |
| Jira mirror | `.context/PBI/` (never hand-written) |
| A test-architecture decision | `.context/ADR/` |
| The repo's own methodology (index + invariants) | `iql-context` (shipped upstream) |

**Hard rule: a `-context` skill CITES `.context/` paths, it does not copy them.** A context skill that restates a `.context/` fact is a second source of truth and fails review. Its generated map is not a copy: it is the ONLY copy of that synthesis, and the legacy markdown files a project may still hold (each entry's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) are generator input, never a second source. The STALE-PATH check (`scripts/lint-skills.ts`) enforces the citing half with a kind-scoped rule: inside a `metadata.kind: context` skill every `.context/` cite must exist on disk (the map is born before the skill; only the gitignored `.context/PBI/` mirror is exempt), while in every other skill the outputs the generators write per project (`project-discovery`, the `project-context` maps, the skill reports) are exempt in both directions, because they do not exist in the boilerplate checkout. The "does not copy" half stays a review rule.

**Ownership rule:** SUT context skills (`billing-context`, `auth-context`, ...) are project-owned and NEVER shipped upstream. The updater enforces it: any `.agents/skills/<slug>-context/` other than the ones upstream owns (`iql-context`, the grandfathered workflow slug `project-context`, and the retired `sync-ai-context`, kept so the updater still removes a downstream copy) is project-local by construction, never delivered, overwritten or deleted by `bun run up`, even if upstream ever ships a same-slug example (`isProjectLocalSkillPath` in `cli/lib/updater-core.ts`). Upstream ships `iql-context` (synced; its `references/project-overrides.md` is bootstrap-only), plus one narrow exception: the context map skills listed in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`) arrive as placeholders whose whole folder is DELIVERED ONCE when absent, then belongs to the project and is never overwritten or deleted.

**The write-scope amendment.** A context skill that holds a generated map keeps it honest: when a session observes something that contradicts a section, it PROPOSES the one-section edit (to the user, or to the conductor for a supervised worker) and applies it on approval, under its own `references/` and nowhere else. It declares that in frontmatter (`metadata.writes: [references/]`), carries the procedure in `references/refresh.md`, and `CONTEXT-WRITES` (`scripts/lint-skills.ts`) gates it. It still never runs a stage, never touches Jira and never edits another skill.

**Who proposes, who creates:** the context map skills already exist (delivered as placeholders); each entry's `generator` writes its map (`project-context` modes `data` / `api` / `e2e` for the business maps, `project-discovery` for the domain and infra maps), and their dated rules accrue in the same skill through its refresh and refinement paths. For any OTHER aspect, `project-discovery` PROPOSES the context skills a fresh repo could carry, at its close (one line per aspect, never a file), and `project-context` mode `context-skill` CREATES them, always through `skill-creator`. UPDATE appends dated rules; it never rewrites one.

**Who loads them:** a context skill triggers by its `description` in the main thread. In a subagent briefing the Skill Resolver injects only the context skills whose ASPECT the dispatch touches (`skill-resolver.md` §"How the orchestrator picks relevant skills"), never all of them.

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
- `<the path or command it cites>` — <what to read there>

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
- every rule the skill means to BIND an executor (a prohibition, a gate, a credential, evidence or cleanup duty) has its bullet in `## Compact Rules`, not only a paragraph in `references/` (`AGENTS.md` §3 "RULE REACHABILITY")
- a router row and a loader: which flow loads it and when (`agentic-qa-onboard` table rule: an install nothing loads should not exist). The row goes in `.agents/instructions/agent-skills-and-mcps.md` for a T1 skill upstream ships, and in the `## Project context skills` table of `.agents/instructions/agent-project.md` for a skill the project authored (its trigger phrases in that file's `triggers:` too), because `bun run up` overwrites the synced section
- `evals/evals.json` for a workflow skill (validated by `scripts/run-skill-evals.ts`); optional for the other kinds at creation
