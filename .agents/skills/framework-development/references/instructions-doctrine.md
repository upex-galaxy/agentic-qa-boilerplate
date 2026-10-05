# Instructions doctrine: where does this sentence go?

> Read by `framework-development` mode `instructions` before any change to `AGENTS.md`, a section under `.agents/instructions/`, the ROUTER or a `triggers:` list, and by every skill whose own flow writes a project fact into `agent-project.md`. Decision record: `.context/ADR/ADR-0009-progressive-disclosure-of-instructions.md` (the split) and `.context/ADR/ADR-0013-instructions-maintenance-locks.md` (what holds it in place). Folder guide: `.agents/instructions/README.md`.

## 1. The layers, by cost

Every host loads L0 on every session; everything else costs nothing until a request needs it. So the question for a new sentence is never "is it important?" but "does it have to be in the context of a session that is doing something else?".

| Layer | File | Loaded | Holds |
|---|---|---|---|
| L0 | `AGENTS.md` | every session, every host | the LOAD PROTOCOL, each critical rule's binding sentence, the behavioural layer (§2), the orchestration core (§3), the ROUTER, the memory triggers |
| L1 | `.agents/instructions/agent-<id>.md` | when the ROUTER or a `ROUTE:` line names it | one request kind each: its rules, tables and pointers |
| L1, project | `.agents/instructions/agent-project.md` | routed by its own `triggers:` | this project's own rules, guardrails, pointers and its project context skills table; never synced |
| L2 | `.agents/skills/<skill>/SKILL.md` and `references/` | when the skill is invoked, or a reference is named | the HOW of one workflow: steps, flags, templates, doctrine |
| Knowledge | `.agents/skills/<aspect>-context/` | when a dispatch touches the aspect | judgment about the system under test, citing the `.context/` caches |

## 2. The decision tree

Ask the questions in order and stop at the first yes.

```
Q1  Must it bind on EVERY turn, whatever the request is?
    (how the agent speaks and reasons, a critical rule, the LOAD PROTOCOL,
     how it dispatches subagents, when it saves memory, the ROUTER itself)
      yes -> L0, and only the binding sentence:
             - a critical rule: the sentence in AGENTS.md §1, the full text,
               rationale and examples in agent-critical-rules.md under the same
               number and name (the L0 line is a verbatim fragment of it)
             - a ROUTER row: see Q4, it is a decision, not an edit
      no  -> Q2

Q2  Is it true only for THIS project?
      knowledge about the system under test (entities, flows, environments,
      vocabulary, how it is deployed)
          -> the matching <aspect>-context skill (project-context mode context-skill)
      a rule, guardrail or pointer for the agent working here
          -> agent-project.md, one heading per topic
      no  -> Q3

Q3  Does one skill own the workflow it describes (steps, flags, a template,
    the syntax of a tool, a stage's doctrine)?
      yes -> that skill: references/ for the detail; one ## Compact Rules
             bullet as well when it must bind an executor (AGENTS.md §3 RULE
             REACHABILITY); a shared doctrine several skills cite goes in
             agentic-qa-core/references/
      no  -> Q4

Q4  Which REQUEST KIND needs it? Find the ROUTER row whose kind covers it and
    write it in that row's anchor section (agent-<id>.md).
      the section exists but prompts of that kind do not reach it
          -> widen that section's triggers: (or paths:), add the missed
             prompts to the eval set, let instructions:check score them
      no row's kind covers it
          -> first try harder: rows are broad on purpose, and most "new
             kinds" are an existing kind seen from a new angle
          -> truly new: write the ADR that decides the new kind, add the row
             and its section, then `bun run instructions:check --accept-router
             ADR-NNNN` and cite the printed fingerprint in that ADR
```

## 3. Rules that hold whatever the tree answers

- **L0 never grows by prose.** A paragraph that explains a rule belongs in the rule's full text; a paragraph that explains a topic belongs in its section. L0 keeps the sentence that binds.
- **A `NEVER` / `MUST` line must stay reachable** from where the actor always looks: verbatim in L0, under a numbered heading of `agent-critical-rules.md`, or tagged `Rule #N`, binding: `/<skill>` (whose compact rules carry it) or enforced: `bun run <script>`. `instructions:check` fails an orphan.
- **Committed prose names the source of truth, never its current value** (Rule #17): no counts of sections, prompts or rows, no measured size, no claim about the present state.
- **A synced file never holds a project fact.** Every section but `agent-project.md` is overwritten by `bun run up`; a project's rule, pointer or skill row goes in `agent-project.md`.
- **A trigger miss is fixed in `triggers:`, never by relabelling the eval set.** A false hit is fixed by narrowing the trigger. The set grows with every miss found.
- **A new section ships complete**: frontmatter (`id`, `title`, `load_when`, `triggers`, `paths`), a ROUTER row (which is an ADR, see Q4), at least three labelled prompts that expect its `id`, and a row in the `## Sections` table of `.agents/instructions/README.md`. `instructions:check` fails each missing piece.

## 4. Writes from other skills

A workflow skill whose own flow records a project fact (a context pointer after a map is generated, a project context skill row and its trigger phrases, the adapted auth strategy) writes that one place, `agent-project.md`, following §2 Q2 and §3, and closes with `bun run instructions:check`. It never touches `AGENTS.md`, a synced section, the ROUTER or another section's `triggers:`; those changes go through `framework-development` mode `instructions`.

## 5. Worked examples

1. **"Add to the credentials rule that a HAR file counts as a secret."** Q1 yes, but the rule exists: the addition goes in the full text of rule 1 in `agent-critical-rules.md`. The L0 sentence does not change, because it stays a verbatim fragment of the longer text; `instructions:check` would fail a reworded L0 line.
2. **"When the agent files a bug, it must scrub the trace before attaching it."** Q3: `sprint-testing` owns filing, and the scrub rule is evidence doctrine shared by several skills, so the detail lives in `agentic-qa-core/references/evidence-conventions.md`, and the skill that dispatches the executor carries one compact rule bullet so the executor sees it.
3. **"Staging's database resets every night; tests that write must not run near the reset."** Q2: the reset schedule is knowledge about the system under test, so it goes in the `infra-context` skill's map. The behavioural consequence ("do not run writing suites in that window") is a rule for the agent in this project: a heading in `agent-project.md` that cites the map.
4. **"The Xray CLI needs the project flag on every call."** Q3: the syntax of one tool belongs to `xray-cli` (`references/`). Nothing goes in a section: `agent-tool-resolution.md` only says which skill to load before the binary.
5. **"Prompts about Allure reports do not get the tool-resolution section."** Q4, a trigger miss: widen the `triggers:` of `agent-tool-resolution.md`, add the missed prompts (both languages) to `cli/lib/fixtures/instruction-router-eval.json` with the ids a careful reader would load, run `bun run instructions:check`: the eval scores the change in the same call and fails if the new trigger floods other prompts.
6. **"We need a ROUTER row for performance testing."** Q4: performance testing is a testing request; the `agent-context-map.md` row ("any workflow task") and the stage skills already cover it. Grow that section's task map and its `triggers:`. A row is added only when no kind fits, through an ADR and `--accept-router`.
7. **"A teammate pasted thirty lines explaining our branching model into `AGENTS.md`."** Undo it: the git section (`agent-git.md`) is a pointer, the strategy itself is `git_strategy:` in `.agents/project.yaml`, and `git-flow-master` owns the policy. L0 keeps nothing of it.
8. **"Our team calls a story 'card'; the agent should understand both words."** Q2: project vocabulary is knowledge about the system under test: the `business-domain-context` map gets the term. If prompts that say "card" then miss a project rule, the trigger goes in `agent-project.md`'s own `triggers:`, which the project owns; a synced section's `triggers:` are upstream's and the next `bun run up` would drop the edit.

## 6. Measuring the routes

The router eval proves the hook names the right section; `bun run instructions:audit` measures whether the agent then read it, from this machine's Claude Code transcripts (OpenCode and Codex transcripts are not parsed yet). It prints file names and counts only. A team that wants a trend can run it monthly (an Orca automation or a calendar reminder); the repo ships no routine for it.
