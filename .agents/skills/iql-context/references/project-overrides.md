# Project overrides for `iql-context`

> Project-owned. Delivered once by the scaffold or by `bun run up` when missing, then NEVER overwritten (bootstrap-only path in the updater). The shipped `SKILL.md` and its other references keep syncing from upstream; everything a project needs to say about ITS way of running the IQL goes here, and here it wins over the index for this project only. Values (which stages run, gate strictness, execution profile) do not go here: they live in `.agents/project.yaml` → `qa.methodology`.

## What belongs here

- A stage the team runs differently, with the reason and the date it was agreed.
- A renamed artifact or a title the tracker forces (state the grammar the team uses instead of `{ACRONYM}: {scope-id}: {descriptor}`).
- A gate the team consciously collapsed under light mode, with its condition, its cost and the debt item that records it.
- A local vocabulary note (what the team calls a thing that the method names otherwise).

## What does NOT belong here

- Facts about the product under test → `.context/` maps and the project's `<aspect>-context` skills.
- A lesson about the method itself → a refinement proposal upstream (`agentic-qa-core/references/upstream-feedback.md`), so every project gets it.
- Status or transition names → `.agents/jira-workflows.json`.

## Overrides

| Date | Topic | Rule this project follows | Why | Measured |
|---|---|---|---|---|
| _(none yet)_ | | | | |
