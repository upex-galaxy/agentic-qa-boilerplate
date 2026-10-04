# Instruction sections (progressive disclosure)

`AGENTS.md` is the always-on layer: every host loads it on every session (Claude Code through the `CLAUDE.md` import, OpenCode and Codex natively). It holds only what must bind on every turn: the binding sentence of each critical rule, the behavioural layer, the orchestration core, the load protocol, the ROUTER and the memory triggers.

Everything else lives here, one file per topic. A model reads a section when the ROUTER in `AGENTS.md` names it for the request at hand, or when the per-prompt hook injects a `ROUTE:` line naming it. A section binds exactly like `AGENTS.md` once it applies.

## How a section is shaped

Each file opens with a frontmatter block the hook and the lint read:

```yaml
---
id: git                       # kebab-case, unique
title: 'Git workflow'
load_when: 'any git, branch, commit, push or PR intent'
triggers: ['\bgit\b', '\bcommit', '\bpush']   # regex sources, case-insensitive
paths: ['.husky/', '.github/']                 # paths whose edit implies this section
---
```

The numeric prefix fixes the reading order; the `id` is what the hook routes. The headings inside a section keep the numbers they carry in `AGENTS.md` citations (`§9` is the `## 9.` heading of the PBI section), so a citation resolves through the ROUTER's `Was` column.

## Ownership

| File | Owner | On `bun run up` |
|---|---|---|
| `AGENTS.md` | the project | parity rows, never overwritten |
| every section here except `project.md` | upstream | synced like a skill |
| `project.md` | the project | delivered once, never touched again |
| this `README.md` | upstream | synced |

A project's own rule goes in `project.md` (or a project context skill for knowledge about the system under test), never into a synced section, where the next sync would replace it.

## Editing rules

- Edit the section that owns the topic; never paste section prose back into `AGENTS.md`.
- A new topic gets a ROUTER row only when no existing row's request kind covers it; usually it grows an existing section and its `triggers:` instead.
- A `NEVER` / `MUST` line in a section must stay reachable by the actor: its sentence is verbatim in `AGENTS.md`, or it cites `Rule #N`, binding: `/<skill>` (whose compact rules carry it) or enforced: `bun run <script>` (a gate).
- Critical rules: the binding sentence lives in `AGENTS.md` §1 verbatim; the full text lives in `01-critical-rules.md` under the same number and name.

`bun run instructions:check` proves all of the above: the L0 byte budget, every section routed, every ROUTER row resolving, frontmatter shape, triggers that compile, rule sentences verbatim and every binding line reachable.
