# Instruction sections (progressive disclosure)

`AGENTS.md` is the always-on layer: every host loads it on every session (Claude Code through the `CLAUDE.md` import, OpenCode and Codex natively). It holds only what must bind on every turn: the binding sentence of each critical rule, the behavioural layer, the orchestration core, the load protocol, the ROUTER and the memory triggers.

Everything else lives here, one file per topic. A model reads a section when the ROUTER in `AGENTS.md` names it for the request at hand, or when the per-prompt hook injects a `ROUTE:` line naming it. A section binds exactly like `AGENTS.md` once it applies.

## How a section reaches the model

Two paths, and the LOAD PROTOCOL in `AGENTS.md` makes both binding:

1. **The ROUTER.** The table between `<!-- router:start -->` and `<!-- router:end -->` in `AGENTS.md`. Its rows are request kinds, not features, so it stays fixed: a new topic grows a section and its `triggers:`, not a row.
2. **The `ROUTE:` line.** `.agents/hooks/personality-reinject.mjs` reads that same table and every section's frontmatter from disk on each prompt, classifies the prompt, and adds one line per file the session has not been routed to yet: `ROUTE: read .agents/instructions/agent-git.md (git, <n> lines) before acting on this prompt`, or `ROUTE: read package.json (<n> lines) before acting on this prompt` for an import. There is no generated copy of the router, so the table the model reads and the one the classifier runs cannot drift.

The classifier rules:

- A row fires when the prompt matches its ANCHOR, the first file of its `Read` cell; every file of a fired row is routed. A file shared by two rows therefore does not drag the other row in.
- A section matches through its `triggers:` (regex sources, case-insensitive, English and Spanish) or its `paths:` (a repo path named in the prompt). An import that anchors a row alone (`@package.json`) has no frontmatter and uses the generic `IMPORT_ROW_TRIGGERS` in the emitter, kept identical across the boilerplates.
- **Scope.** A `ROUTE-SCOPE:` line in the prompt (opening a line or following a sentence) replaces the prompt for classification: each comma-separated item is a section `id`, routed directly, or words, classified; `none` routes nothing. Without one, a prompt that carries an orchestrator preamble is classified on the task block after its marker (`TASK_BLOCK_MARKERS` in the emitter), because the preamble is vendor text identical for every worker. Absolute paths are neutralized first: one into this checkout becomes repo-relative, any other is blanked, so a directory name is never read as intent.
- **Rank and cap.** Fired rows are ranked by their anchor's strength: an `id` named in the scope, then `paths:` hits (each worth two trigger hits), then distinct `triggers:` hits, then the earliest match. Anchors come first and companions after them. At most `MAX_ROUTED_SECTIONS` section files get a binding `ROUTE:` line; the rest share one `ROUTE-OPTIONAL:` line, offered once and never recorded as routed, so a later prompt about that topic still routes it. Imports never count against the cap (Claude Code expands them at launch). The reason is measured: an agent reads a lone route far more often than one of five in the same turn (the numbers are in ADR-0017).
- **Re-surface (Claude Code).** A `PostToolUse` hook runs the same emitter: the first tool call after the prompt that reads none of the routed sections, while some are still unread, gets ONE `ROUTE-PENDING:` line naming them. It never repeats in the turn, stays quiet for a subagent's calls, and costs one `node` start per tool call. Codex and OpenCode get the `ROUTE:` cue only.
- **Per-session dedupe.** A state file per checkout and session, under the system temp directory, remembers what was routed: a prompt that needs nothing new adds nothing.
- **Re-arm after compaction or `/clear`.** `SessionStart` with matcher `compact` or `clear` (Claude Code, Codex) or `experimental.session.compacting` (OpenCode 1) clears that state, so a file the compaction or the clear dropped is routed again the next time a prompt needs it.
- **OpenCode 2 is router-only**: no documented hook hands a plugin the prompt text, so the model follows the ROUTER and the LOAD PROTOCOL with no `ROUTE:` cue. A declared degradation, re-verified on OpenCode upgrades.

A miss is fixed in the section's `triggers:` and the prompt is added to the labelled set in `cli/lib/fixtures/instruction-router-eval.json`, whose `targets` (recall, precision) `cli/lib/instruction-router.test.ts` asserts. Relabelling a prompt to hide a false hit is not a fix. A trigger that fires on everything also costs a binding slot: under the cap it pushes a section the prompt needed onto the optional line.

## How a section is shaped

Each file opens with a frontmatter block the hook and the lint read:

```yaml
---
id: git                       # kebab-case, unique: the file stem without `agent-` (agent-git.md)
title: 'Git workflow'
load_when: 'any git, branch, commit, push or PR intent'
triggers: ['\bgit\b', '\bcommit', '\bpush']   # regex sources, case-insensitive
paths: ['.husky/', '.github/']                 # paths whose edit implies this section
---
```

Every file here but this `README.md` starts with `agent-`, so its name says it comes from the agent setup, and carries no number: the order of the ROUTER rows is the order. The `id` is what the hook routes and the tag a `ROUTE:` line shows. The headings inside a section keep the numbers they carry in `AGENTS.md` citations (`§9` is the `## 9.` heading of the PBI section), so a citation resolves through the ROUTER's `Was` column.

## Sections

One row per section file, so a reader finds a topic's home without opening every file. `instructions:check` fails a section with no row here and a row naming a file that is gone. The ROUTER in `AGENTS.md` decides when each one loads; this table only says what it holds.

| File | Holds |
|---|---|
| `agent-critical-rules.md` | the full text of every critical rule, under the number and name its L0 binding sentence carries |
| `agent-harnesses.md` | the multi-harness contract: instruction files, hooks, MCP configs, the updater, `cli/`, root configs |
| `agent-context-map.md` | the task to skill to context map for every workflow request |
| `agent-skills-and-mcps.md` | skill tiers, the skill trigger router, modes and the MCP capability rules |
| `agent-tool-resolution.md` | `[TAG_TOOL]` resolution, TMS modalities and the CLI to skill mapping |
| `agent-project-variables.md` | `{{VAR}}` resolution, environments and the Jira instance-identity anchor |
| `agent-ticket-work.md` | AI behaviour while testing a story or bug: test design, defects, artifact lifecycle |
| `agent-local-context-pbi.md` | the `.context/PBI/` cache of Jira: tiers, tree, sync and reads |
| `agent-code-quickref.md` | the KATA quick reference for writing or reviewing test code |
| `agent-git.md` | git workflow and the pointer to the project's `git_strategy:` |
| `agent-orchestration-detail.md` | executors, dispatch patterns, value provenance, fail-closed gates, session material |
| `agent-project.md` | the project's own rules and its project context skills table (project-owned) |

## Ownership

| File | Owner | On `bun run up` |
|---|---|---|
| `AGENTS.md` | the project | parity rows, never overwritten |
| every section here except `agent-project.md` | upstream | synced like a skill: overwritten, a project edit saved to `.backups/` with an "overwritten edit" parity row; list the path in `updater.protected_paths` to keep a merge |
| `agent-project.md` | the project | never synced; a project without one receives `agent-project.md.template`, once |
| `agent-project.md.template` | upstream | synced: the generic stub a project's `agent-project.md` starts from (never the boilerplate's own `agent-project.md`, which holds its own exceptions) |
| this `README.md` | upstream | synced |

A project's own rule goes in `agent-project.md` (or a project context skill for knowledge about the system under test), never into a synced section, where the next sync would replace it. The same holds for the router row of a skill the project authored: it goes in the `## Project context skills` table of `agent-project.md`, its trigger phrases in that file's `triggers:`.

A project scaffolded before this split keeps its monolith `AGENTS.md`: the sync delivers the sections, never rewrites `AGENTS.md`, and the parity report maps each old heading to the section that now carries it and names the headings that are the project's own (they move to `agent-project.md`). `instructions:check` skips such a project until its `AGENTS.md` has the ROUTER.

## Editing rules

Every change to `AGENTS.md`, a section, the ROUTER or a `triggers:` list goes through `framework-development` mode `instructions`, which places each sentence with the decision tree in `.agents/skills/framework-development/references/instructions-doctrine.md` and closes with the checks below.

- Edit the section that owns the topic; never paste section prose back into `AGENTS.md`.
- A new topic gets a ROUTER row only when no existing row's request kind covers it; usually it grows an existing section and its `triggers:` instead.
- A `NEVER` / `MUST` line in a section must stay reachable by the actor: its sentence is verbatim in `AGENTS.md`, or it cites `Rule #N`, binding: `/<skill>` (whose compact rules carry it) or enforced: `bun run <script>` (a gate).
- Critical rules: the binding sentence lives in `AGENTS.md` §1 verbatim; the full text lives in `agent-critical-rules.md` under the same number and name.

`bun run instructions:check` proves all of the above: the L0 byte budget (a target that warns, a ceiling that fails, a higher ceiling for a project's own additions, and Codex's cut: the constants at the top of `scripts/lint-instructions.ts`), a stub that carries none of the boilerplate's identity, every file named `agent-<id>`, every section routed, every ROUTER row resolving, frontmatter shape, triggers that compile, rule sentences verbatim and every binding line reachable.

It also holds three locks (ADR-0013), errors in the maintainers' copy and warnings in a project:

- **ROUTER lock.** The comment `<!-- router:lock <fingerprint> <ADR-NNNN> -->` under the ROUTER records the fingerprint of the table and the ADR that decided it. Any change to a row, header included, fails until a decision covers it: write the ADR (or an Amendments line on the one that owns the router), run `bun run instructions:check --accept-router ADR-NNNN`, and cite the fingerprint it prints in that ADR. Whitespace-only reflows keep the fingerprint.
- **Router eval.** Every run scores the hook's classifier against the labelled prompts in `cli/lib/fixtures/instruction-router-eval.json` and fails under any of three floors (`scripts/lib/router-eval.ts`): recall (an expected section named on any line), binding recall (named on a binding line, so the cap did not push it out) and precision (binding lines only: an optional line binds nothing). A `triggers:` or `paths:` edit is proved here, on the same pre-commit call, before any test run.
- **Complete section.** Every section but `agent-project.md` ships with frontmatter, a ROUTER row, at least three labelled prompts that expect its `id`, and a row in the `## Sections` table above.

`bun run instructions:audit` measures the other half from local transcripts: of the `ROUTE:` lines the hook injected, how many the agent actually read in the same turn, and how many reads followed a `ROUTE-PENDING:` reminder.
