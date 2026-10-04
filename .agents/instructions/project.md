---
id: project
title: 'Project-specific instructions'
load_when: 'anything specific to this project: its own conventions, guardrails, environments or vocabulary not covered by another section'
triggers: []
paths: []
---

# Project-specific instructions

> Project-owned overlay. The boilerplate delivers this file once and never overwrites it; every other file in this folder is synced from upstream. Write this project's own rules here, one heading per topic, instead of editing `AGENTS.md` or a synced section. Knowledge about the system under test belongs in a project context skill (`<aspect>-context`), not here.

Add `triggers:` regex sources to the frontmatter above when a rule here should be routed by keyword (the hook reads them), and keep every `NEVER` / `MUST` line reachable: cite `Rule #N`, binding: `/<skill>`, or enforced: `bun run <script>` (checked by `bun run instructions:check`).

## Git Strategy (this repository)

This repository's strategy is chosen, not inherited (`meta.strategy_source` in the yaml records it; ADR-0006 records when): do not re-offer Strategy Setup here unless the user asks to change the strategy.

**Accepted divergence, declared policy vs enforced ruleset.** The one intended disagreement between yaml and host is formally declared in `git_strategy.policy.accepted_divergences` (`.agents/project.yaml`):

```
main.direct_push_to_protected   declared: allowed   enforced: blocked (pull_request rule)
```

The ruleset named in that entry requires a pull request on `main`. This repo pushes directly anyway, because the push credential sits in that ruleset's bypass list (the ruleset id: ADR-0006). The remote line `Bypassed rule violations ... Changes must be made through a pull request` is expected here and is not an error. The yaml stays `allowed` because that is how work actually lands (standing authorization: Critical Rule #5 resolves to it); the host rule keeps protecting every non-bypass contributor. Both sides are correct on purpose. How `verify`, `--stamp` and `apply` treat an accepted field: `80-git.md` → Accepted divergences (mechanism).

This exception belongs to THIS repository and travels nowhere: this file is project-owned, and a downstream project receives a generic stub, never this text. A project scaffolded from this boilerplate defines its own answer during Strategy Setup, and `git-flow-master` reports what THAT host enforces.
