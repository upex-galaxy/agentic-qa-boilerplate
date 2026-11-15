# Context Skill Scaffolder (`context-skill` mode)

Scaffold a project-owned `<aspect>-context` skill for an aspect the shipped context map skills (`CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) do not already cover. Contract: `../../agentic-qa-core/references/skill-scaffold.md` §3-§5. The sources hold facts; the skill holds the rules for reading them.

**Target**: $ARGUMENTS (`<aspect>`: a project-chosen aspect; optional path to what it sits over)

Data, API, end-to-end, domain and infrastructure knowledge already have their skills (the entries of `CONTEXT_MAP_SKILLS`). Each map comes from the entry's `generator` (modes `data`, `api` and `e2e` here, `project-discovery` for `business-domain-context` and `infra-context`), and their rules accrue in the same skill. A request for `data-context`, `api-context`, `glossary-context` or `infra-context` is answered by pointing to the shipped skill.

---

## Inputs

| Aspect | What it sits over | Produced by |
|---|---|---|
| other | the path the user names | whoever owns it |

What it sits over must exist. If it is missing, run the owning step first: a context skill scaffolded over nothing becomes the source by accident.

## Mode detection

- `.agents/skills/<aspect>-context/` absent: **CREATE**. Write the scaffold after the analysis below.
- Present: **UPDATE**. Generate the candidate, show the diff summary and wait for explicit approval. Rules already in `## Rules` stay as written; new ones are appended with their date.

## Analysis (before writing)

1. Read the map in full. List every place a competent session could misread it: soft deletes, derived fields, status names that differ between API and UI, environment-only behaviour, auth edge cases.
2. Run each candidate through the three-question test (`skill-scaffold.md` §3). Regenerable stays in the map. A fact stays in the map. A judgment that must arrive unasked becomes a rule in the skill.
3. Every rule carries a date and how it was measured (a query, a request, a session label). A candidate with no measurement is not a rule yet: record it in Engram instead.

## Output

`.agents/skills/<aspect>-context/SKILL.md` from the template in `skill-scaffold.md` §4 with `metadata.kind: context`, plus `references/gotchas.md` (measured genre, empty table allowed at creation). Build it through `skill-creator` (T3, installed at project level; load it silently): its draft loop, a description pass and three test prompts under `evals/evals.json`. If the install is missing on this machine, scaffold from the template and say so in the report.

## Validation gate

- `bun run skills:check` shows `KIND-SUFFIX` and `STALE-PATH` green. STALE-PATH is strict for a context skill: every `.context/` path it cites must exist on disk (only `.context/PBI/` is exempt), which is why the map must exist first
- `bun run skills:registry` adds the new block to `REGISTRY.md`
- A row in the `## Project context skills` table of `.agents/instructions/agent-project.md` (add the heading when an older `agent-project.md` lacks it), naming the loader: the workflow skills that touch the aspect. Its trigger phrases also go into that file's `triggers:` frontmatter, so the hook routes it. `agent-skills-and-mcps.md` is the wrong place: that section is synced and `bun sync` overwrites the row (`bun run instructions:check` warns when one is left there). Placement rules: `framework-development/references/instructions-doctrine.md` §4
- The skill body has no sentence that is also in the map (spot-check three rules)

## Never

- Copy a table, an entity list or an endpoint list from the map into the skill.
- Ship a SUT context skill upstream: it is project-owned by construction.
- Auto-apply a refinement: `skill-refinement-protocol.md` governs every later edit.

## After its sources change (the UPDATE reminder)

When what a project-owned context skill sits over is regenerated, offer to run this mode in UPDATE for it. The facts just changed and a person is already looking at a diff, so a review of the judgment layer is cheapest now. UPDATE appends dated rules and leaves existing ones alone; a rule the new sources contradict moves to the gotchas' "No longer true" section. (The context map skills get the same review from their generators, over their own maps: modes `data`, `api` and `e2e` here, `project-discovery` for the domain and infra maps.)

With nobody at the keyboard, the table in `../SKILL.md` applies: CREATE proceeds, and an UPDATE candidate goes to the candidates folder instead of the skill.
