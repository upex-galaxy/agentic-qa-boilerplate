# Skill scaffold: how a skill is written and what it is born with

> Cited by: `/framework-development` (boilerplate skills: the change IS a skill) and `project-context` mode `context-skill` (consumer SUT context skills). `skill-creator` (T3, installed at project level by `cli/install.ts`) is always the builder: both entry points load it for the draft, the test prompts, the evals and the description pass. The contract below is this repo's and `skill-creator` does not own it. On a machine where that install is missing, the scaffold still works from the template in §4, and the run says so.
> Axes and kinds: `skill-composition-strategy.md` §2b. Lint: `scripts/lint-skills.ts`.

## How a skill is written (the canon)

Two user-level skills are the canon, and every skill in this repo is written with both:

- Call the Skill tool with "writing-for-agents" for structure: lead with what the file is for and when it applies, point to material instead of copying it, push what only some branches need behind a pointer, delete any sentence whose removal would not change what the agent does, state the goal and the reason, and say when the work is done.
- Call the Skill tool with "humanizer" for prose: plain verbs ("is", "has"), no em or en dashes, no arrows used as verbs, no bold-label lists, no shouting capitals, sentences of different lengths.

Agents follow reasons better than step lists. A skill states the intent and the why, and keeps a concrete step, variable or command only where it changes behaviour. A prohibition stays only where the wrong move is likely and costly, and it carries its reason next to the positive target.

What this repo adds on top of the canon is below: frontmatter, kinds, context skills, compact rules, stage owners, lint, and the invocation classes (§6).

## 1 · Frontmatter every T1 skill carries

```yaml
---
name: <slug>                                   # equals the directory name
description: "<Leading word> <what it does>. Use when <branch>; <branch>."   # form per class, §6
license: MIT
compatibility: [claude-code, codex, opencode, pi]
complementary_categories: [<from strategy §5.1>] # optional, audited when present
metadata:
  kind: <context | workflow | utility | core>  # mandatory, gated (KIND-MISSING / KIND-VOCAB / KIND-SUFFIX)
---
```

Only `allowed-tools, compatibility, description, license, metadata, name` are spec top-level keys; anything else project-specific goes under `metadata`. A manual skill also carries `disable-model-invocation: true` (§6). `compact_rules` (frontmatter block scalar) is optional and consumed verbatim by `scripts/build-skill-registry.ts`; without it the registry extracts a `## Compact Rules` section from the body.

## 2 · Per kind: files, suffix, sections

| Kind | Slug suffix | Files | Body sections that must exist |
|---|---|---|---|
| **context** | `-context` (mandatory) | `SKILL.md`, `references/gotchas.md`; a skill that holds a generated map adds `references/<map>.html` + `references/refresh.md` and declares `metadata.writes: [references/]` | `## What this skill knows` (one aspect), `## Sources of truth` (what it cites), `## Rules` (judgment, each dated), `## Not here` (what belongs elsewhere) |
| **workflow** | none | `SKILL.md`, `references/`, `evals/evals.json` | the session banner + `## Phase 0` (register the slug in `SESSION_RETROFITTED_SKILLS`, `scripts/lint-skills.ts`, so the `SESSION-BANNER-MISSING`, `SESSION-PHASE-0-MISSING` and `SESSION-SCOPE-INVALID` checks bind), `## Compact Rules`, `## Subagent Dispatch Strategy` (7-component briefing), a session-close step citing `session-footer-contract.md` and `skill-refinement-protocol.md`, a blocker path citing `upstream-feedback.md` |
| **utility** | `-cli` / `-tool` / `-app` (mandatory) | `SKILL.md` with `allowed-tools: Bash(<binary>:*)`, `references/gotchas.md` | `## Compact Rules`, the tool's grammar (verbs, flags, auth, errors), a §6.5 row in `AGENTS.md` if a Bash binary must auto-load it |
| **core** | none | `SKILL.md` + `references/` | no write path of its own; other skills cite its references |

`references/gotchas.md` uses the measured genre (`/agent-orchestration` gotchas): columns `# · Gotcha · Symptom · Fix · Measured · Verified against`, plus a `## No longer true` section that rows move to instead of being deleted.

A skill marked `metadata.stage_owner: true` has the `## Subagent Dispatch Strategy` heading, and a workflow skill that must bind an executor with a rule puts that rule in `## Compact Rules`, because an executor sees its briefing and the registry's compact rules, not the `references/` folder (`AGENTS.md` §3 "RULE REACHABILITY").

## 3 · Context skills: what goes where

The principle: `.context/` holds what a script pulls from an external source of truth, plus the few things this repo itself is the source of truth for. What an AI synthesizes lives in a skill. A cache is cheap to rebuild and identical on two machines. A synthesis is authored (by an AI, but authored): two sessions write it differently, rebuilding it costs thousands of tokens, and it is exactly the knowledge that should arrive unasked. Ask about each piece of knowledge:

| Question | If yes, it goes to |
|---|---|
| 1. Does a script pull it from an external source of truth? (Jira, OpenAPI, a CI log) | `.context/` as a `[SYNC]` cache, recovered by that script (`bun run context:hydrate`, `bun run api:sync`) |
| 2. Is this repo itself the source of truth for it? (a decision record, an automation plan versioned with the code) | `.context/` as `[COMMIT]` |
| 3. Otherwise: the AI synthesizes it from code, DB and contracts, or a human writes judgment about it | a context skill: the synthesis as the skill's generated map (`references/<map>.html`, `./business-context-maps.md`), the judgment in `## Rules` / `references/gotchas.md` |

Judgment versus fact inside a context skill: would two competent sessions write it differently? If yes it is a dated rule. If no it is a fact, which belongs in the map (or the cache) and never in `SKILL.md`.

| Content | Home |
|---|---|
| Entity map, flows, state machines, endpoint groups, journeys (synthesis) | the business context skills' generated maps (`business-data-context`, `business-api-context`, `business-e2e-context`), read through `bun run context:map <slug>` |
| Business model, domain glossary (synthesis) | `business-domain-context`'s generated map, read through `bun run context:map business-domain-context` |
| Architecture, NFRs, backend / frontend / infrastructure facts (synthesis) | `infra-context`'s generated map, read through `bun run context:map infra-context` |
| The rule for reading that map ("orders are soft-deleted; a count without `deleted_at IS NULL` is wrong") | the skill's `## Rules` or `references/gotchas.md` |
| Jira mirror | `.context/PBI/` (never hand-written) |
| A test-architecture decision | `.context/ADR/` |
| The repo's own methodology (index + invariants) | `iql-context` (shipped upstream) |

A `-context` skill cites `.context/` paths and does not copy them. A context skill that restates a `.context/` fact is a second source of truth and fails review. Its generated map is not a copy: it is the only copy of that synthesis, and the legacy markdown files a project may still hold (each entry's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) are generator input, never a second source. The STALE-PATH check (`scripts/lint-skills.ts`) enforces the citing half with a kind-scoped rule. Inside a `metadata.kind: context` skill every `.context/` cite must exist on disk (the map is born before the skill; only the gitignored `.context/PBI/` mirror is exempt). In every other skill the outputs the generators write per project (`project-discovery`, the `project-context` maps, the skill reports) are exempt in both directions, because they do not exist in the boilerplate checkout. The "does not copy" half stays a review rule.

Ownership: SUT context skills (`billing-context`, `auth-context`, ...) are project-owned and never shipped upstream. The updater enforces it. Any `.agents/skills/<slug>-context/` other than the ones upstream owns (`iql-context`, the grandfathered workflow slug `project-context`, and the retired `sync-ai-context`, kept so the updater still removes a downstream copy) is project-local by construction, and `bun sync` never delivers, overwrites or deletes it, even if upstream ever ships a same-slug example (`isProjectLocalSkillPath` in `cli/lib/updater-core.ts`). Upstream ships `iql-context` (synced; its `references/project-overrides.md` is bootstrap-only), plus one narrow exception: the context map skills listed in `CONTEXT_MAP_SKILLS` (`cli/lib/context-maps.ts`) arrive as placeholders whose whole folder is delivered once when absent, then belongs to the project and is never overwritten or deleted.

The write-scope amendment: a context skill that holds a generated map keeps it honest. When a session observes something that contradicts a section, it proposes the one-section edit (to the user, or to the conductor for a supervised worker) and applies it on approval, under its own `references/` and nowhere else. It declares that in frontmatter (`metadata.writes: [references/]`), carries the procedure in `references/refresh.md`, and `CONTEXT-WRITES` (`scripts/lint-skills.ts`) gates it. It still never runs a stage, never touches Jira and never edits another skill.

Who proposes, who creates: the context map skills already exist (delivered as placeholders). Each entry's `generator` writes its map (`project-context` modes `data` / `api` / `e2e` for the business maps, `project-discovery` for the domain and infra maps), and their dated rules accrue in the same skill through its refresh and refinement paths. For any other aspect, `project-discovery` proposes the context skills a fresh repo could carry, at its close (one line per aspect, never a file), and `project-context` mode `context-skill` creates them, always through `skill-creator`. An update appends dated rules and never rewrites one.

Who loads them: a context skill triggers by its `description` in the main thread. In a subagent briefing the Skill Resolver injects only the context skills whose aspect the dispatch touches (`skill-resolver.md` §"How the orchestrator picks relevant skills"), never all of them.

## 4 · Minimal `SKILL.md` for a context skill

```markdown
---
name: <aspect>-context
description: "<Aspect> judgment layer over .context/<map>. Use when <aspect question>; <domain words>."
license: MIT
compatibility: [claude-code, codex, opencode, pi]
metadata:
  kind: context
---

# <aspect>-context

## What this skill knows
One aspect of the SUT: <aspect>. Loading it changes what the agent knows, not what it does next.

## Sources of truth (cited, never copied)
- `<the path or command it cites>`: <what to read there>

## Rules (judgment, dated)
- <YYYY-MM-DD> · <rule> · measured: <how>

## Not here
- <fact class>: see `.context/<path>` (regenerable)

## Refinements
Lessons land as proposals per `agentic-qa-core/references/skill-refinement-protocol.md`, never as direct edits.
```

## 5 · Definition of Done for a new skill

- `bun run skills:check` green (kind declared, suffix matches, no stale path)
- `bun run skills:registry` regenerated; `bun run skills:registry:check` green
- every rule the skill means to bind an executor (a prohibition, a gate, a credential, evidence or cleanup duty) has its bullet in `## Compact Rules`, not only a paragraph in `references/` (`AGENTS.md` §3 "RULE REACHABILITY")
- a router row and a loader: which flow loads it and when (`agentic-qa-onboard` table rule: an install nothing loads should not exist). The row goes in `.agents/instructions/agent-skills-and-mcps.md` for a T1 skill upstream ships, and in the `## Project context skills` table of `.agents/instructions/agent-project.md` for a skill the project authored (its trigger phrases in that file's `triggers:` too), because `bun sync` overwrites the synced section
- the description matches its invocation class (§6) and is English
- both writing passes ran: `writing-for-agents` for structure, `humanizer` for prose
- `evals/evals.json` for a workflow skill (validated by `scripts/run-skill-evals.ts`); optional for the other kinds at creation

## 6 · Invocation classes and descriptions

Every skill belongs to exactly one class, and the class fixes how it starts and what its description looks like. The description is a pointer that sits in context on every turn, so each word has to earn its place: lead with the word that triggers it, give one trigger per branch (synonyms that rename one branch are one branch written twice), and leave out anything the body already says.

| Class | Started by | Frontmatter | Description |
|---|---|---|---|
| A | talking: the agent fires it when the request matches | model-invocable (no `disable-model-invocation`) | `<Leading word> <what it does in one clause>. Use when <branch>; <branch>.` Aim under 300 characters, hard limit 450. The first sentence stands alone in 140 characters, because the registry cuts there. |
| B | a person typing `/name`, never loaded by anything else | `disable-model-invocation: true`, plus `agents/openai.yaml` with `policy.allow_implicit_invocation: false` for Codex | one-line human summary, no trigger list. It costs no context. |
| C | another skill, which names it | model-invocable (a manual skill cannot be loaded by another skill) | one line: what it is and which skills load it. The parent says `Call the Skill tool with "<name>"`. |

The classes follow one rule: a skill that the ROUTER, an instruction section, a hook or another skill tells the agent to load cannot be manual. A manual skill has no description the agent can reach, so that load would silently fail. Before marking a skill class B, measure who loads it (search the ROUTER, `.agents/instructions/`, `.agents/hooks/`, `cli/`, and every other `SKILL.md`) and keep it model-invocable if anything does. A manual skill is mentioned to a person as "run `/<name>`", never as something the agent loads.

Not every harness has a manual switch; the per-harness keys are in the `writing-for-agents` skill's `SKILL-MECHANICS.md`. Where a harness has none, the skill stays model-invoked there and the one-line summary keeps its context cost small.

Descriptions and triggers are English. Skills load by meaning in any language, so a prompt in Spanish or any other language reaches the same skill as its English equivalent, and replies still mirror the user's language (Critical Rule 14). Do not add literal trigger phrases in other languages to a description or to an instruction's `triggers:`.

The user-level skills this repo installs are `USER_LEVEL_SKILLS` in `cli/install.ts`; the ones a QA step loads are model-invocable, so the step says `Call the Skill tool with "<name>"`. A manual one (`disable-model-invocation: true` upstream) is only mentioned to a person as `/<name>`.
