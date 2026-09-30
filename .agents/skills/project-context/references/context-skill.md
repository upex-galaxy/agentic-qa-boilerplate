# Context Skill Scaffolder (`context-skill` mode)

Scaffold a project-owned `<aspect>-context` skill for an aspect the business context skills do not already cover. Contract: `../../agentic-qa-core/references/skill-scaffold.md` §3-§5. The sources hold facts; the skill holds the rules for reading them.

**Target**: $ARGUMENTS (`<aspect>`: `infra` · a project-chosen aspect; optional path to what it sits over)

Data, API and end-to-end knowledge already have their skills (`business-data-context`, `business-api-context`, `business-e2e-context`): their maps come from modes `data` / `api` / `e2e` and their rules accrue in the same skill. A request for `data-context` or `api-context` is answered by pointing there, never by scaffolding a second skill over the same aspect.

---

## Inputs

| Aspect | What it sits over | Produced by |
|---|---|---|
| `infra` | `.context/SRS/` (infrastructure complements the SRS) | `/project-discovery` Phase 3 |
| other | the path the user names | whoever owns it |

What it sits over MUST exist. Missing → run the owning step first; never scaffold a context skill over nothing (it would become the source by accident).

## Mode detection

- `.agents/skills/<aspect>-context/` absent → **CREATE**: write the scaffold after the analysis below.
- Present → **UPDATE**: generate the candidate, show the diff summary, WAIT for explicit approval. Rules already in `## Rules` are never rewritten; new ones are appended with their date.

## Analysis (before writing)

1. Read the map in full. List every place a competent session could misread it: soft deletes, derived fields, status names that differ between API and UI, environment-only behaviour, auth edge cases.
2. Run each candidate through the three-question test (`skill-scaffold.md` §3). Regenerable → stays in the map. Fact → stays in the map. Judgment that must arrive unasked → a rule in the skill.
3. Every rule carries a date and how it was measured (a query, a request, a session label). No measurement, no rule: record it in Engram instead.

## Output

`.agents/skills/<aspect>-context/SKILL.md` from the template in `skill-scaffold.md` §4 with `metadata.kind: context`, plus `references/gotchas.md` (measured genre, empty table allowed at creation). Build it THROUGH `skill-creator` (T3, installed at project level; load it silently): its draft loop, a description pass and three test prompts under `evals/evals.json`. If the install is missing on this machine, scaffold from the template and say so in the report; never skip the skill silently.

## Validation gate

- `bun run skills:check` → `KIND-SUFFIX` and `STALE-PATH` green. STALE-PATH is STRICT for a context skill: every `.context/` path it cites must exist on disk (only `.context/PBI/` is exempt), which is why the map must exist first
- `bun run skills:registry` → the new block appears in `REGISTRY.md`
- `AGENTS.md` §5 row added by the project (T1), naming the loader: the workflow skills that touch the aspect
- The skill body contains no sentence that is also in the map (spot-check three rules)

## Never

- Copy a table, an entity list or an endpoint list from the map into the skill.
- Ship a SUT context skill upstream: it is project-owned by construction.
- Auto-apply a refinement: `skill-refinement-protocol.md` governs every later edit.

## After its sources change (the UPDATE reminder)

When what a project-owned context skill sits over is regenerated, offer to run THIS mode in UPDATE for it. The facts just changed and a human is already looking at a diff, so that is the one moment a review of the judgment layer is cheap. UPDATE appends dated rules and never rewrites an existing one; a rule the new sources contradict is moved to the gotchas' "No longer true" section, not deleted. (The business context skills do the same review inside modes `data` / `api` / `e2e`, over their own maps.)
