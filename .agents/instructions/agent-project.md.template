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

## Project context skills

One row per skill this project authored: the `<aspect>-context` skills `project-context` mode `context-skill` creates, and any other skill the project added. The skill router in `agent-skills-and-mcps.md` is synced, so `bun run up` overwrites a row written there; this file is never overwritten. Add each skill's trigger phrases to `triggers:` above as regex sources too, so the hook routes this file when a prompt names them. `bun run instructions:check` fails a row whose `.agents/skills/<slug>/SKILL.md` does not exist.

| Skill | Trigger | Purpose |
|---|---|---|
