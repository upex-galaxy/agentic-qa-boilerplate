---
id: project
title: 'Project-specific instructions'
load_when: 'anything specific to this project: its own conventions, guardrails, environments or vocabulary not covered by another section'
triggers: []
paths: []
---

# Project-specific instructions

> Project-owned overlay. The boilerplate delivers this file once and never overwrites it, while every other file in this folder is synced from upstream. Write this project's own rules here, one heading per topic, instead of editing `AGENTS.md` or a synced section. Knowledge about the system under test belongs in a project context skill (`<aspect>-context`).

To route a rule here by keyword, add `triggers:` regex sources to the frontmatter above (the hook reads them). Keep every `NEVER` / `MUST` line reachable by citing `Rule #N`, binding: `/<skill>`, or enforced: `bun run <script>`; `bun run instructions:check` checks it.

## Project context skills

One row per skill this project authored: the `<aspect>-context` skills that `project-context` mode `context-skill` creates, and any other skill the project added. Write the row here and not in the skill router of `agent-skills-and-mcps.md`, because that file is synced and `bun sync` overwrites a row written there. Add each skill's trigger phrases to `triggers:` above as regex sources too, so the hook routes this file when a prompt names them. `bun run instructions:check` fails a row whose `.agents/skills/<slug>/SKILL.md` does not exist.

| Skill | Trigger | Purpose |
|---|---|---|

## Git Strategy (this repository)

This repository chose its strategy; it did not inherit it (`meta.strategy_source` in the yaml records that, and ADR-0006 records when). Do not re-offer Strategy Setup here unless the user asks to change the strategy.

**Accepted divergence between declared policy and enforced ruleset.** The yaml and the host disagree on one point, and `git_strategy.policy.accepted_divergences` (`.agents/project.yaml`) declares it:

```
main.direct_push_to_protected   declared: allowed   enforced: blocked (pull_request rule)
```

The ruleset named in that entry requires a pull request on `main`. This repo pushes directly anyway, because the push credential is in that ruleset's bypass list (the ruleset id is in ADR-0006). The remote line `Bypassed rule violations ... Changes must be made through a pull request` is expected here and is not an error. The yaml stays `allowed` because that is how work lands (a standing authorization, which Critical Rule #5 resolves to), and the host rule keeps protecting every contributor who is not on the bypass list. Both sides are correct on purpose. For how `verify`, `--stamp` and `apply` treat an accepted field, see `agent-git.md` > Accepted divergences (mechanism).

This exception belongs to this repository and travels nowhere. The file is project-owned, so a downstream project receives a generic stub and never this text. A project scaffolded from this boilerplate defines its own answer during Strategy Setup, and `git-flow-master` reports what that host enforces.
