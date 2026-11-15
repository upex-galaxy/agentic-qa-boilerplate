# Project overrides for `iql-context`

> Project-owned. The scaffold or `bun sync` delivers it once when it is missing and never overwrites it afterwards (bootstrap-only path in the updater). The shipped `SKILL.md` and its other references keep syncing from upstream. Everything a project needs to say about its own way of running the IQL goes here, and here it wins over the index for this project only. Values (which stages run, gate strictness, execution profile) live in `qa.methodology` in `.agents/project.yaml`, not here.

## What belongs here

- A stage the team runs differently, with the reason and the date it was agreed.
- A renamed artifact or a title the tracker forces (state the grammar the team uses instead of `{ACRONYM}: {scope-id}: {descriptor}`).
- A gate the team consciously collapsed under light mode, with its condition, its cost and the debt item that records it.
- A local vocabulary note (what the team calls a thing that the method names otherwise).

## What does NOT belong here

- Facts about the product under test: they go in `.context/` maps and the project's `<aspect>-context` skills.
- A lesson about the method itself: send a refinement proposal upstream (`agentic-qa-core/references/upstream-feedback.md`) so every project gets it.
- Status or transition names: they live in `.agents/jira-workflows.json`.

## Overrides

| Date | Topic | Rule this project follows | Why | Measured |
|---|---|---|---|---|
| 2026-10-24 | Never-collapsed gates | Five, not four: the person-signed ROI verdict before automation joins the site's list (`agentic-qa-core/references/stage-gates.md`, "Signed ROI before automation is a hard gate") | A TC that reaches automation without a signed verdict skips the >50% Candidate/Manual alarm and the person's signature; light mode has no path around it | none |
