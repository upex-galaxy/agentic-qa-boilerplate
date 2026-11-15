---
name: project-context
description: "Generate or refresh the business context maps and the master test plan. Use when asked for a data, API or e2e (user journeys) map, a feature inventory, a master test plan, or a refresh of project context; to scaffold an <aspect>-context skill; or to find coverage gaps (what is not tested)."
license: MIT
compatibility: [claude-code, copilot, cursor, codex, opencode, pi]
complementary_categories: [testing-e2e, testing-api, meta-skill]
metadata:
  kind: workflow
  requires_capabilities: [db, api-schema, diagrams]
---

# Project Context

Own the regenerative project-context artifacts without duplicating their workflows across harness commands. The business maps live inside their context skills as HTML (`agentic-qa-core/references/business-context-maps.md`); this skill generates them and updates their stale sections.

## Compact Rules

- One mode per run: `data`, `e2e` (synonym `features`), `api`, `test-plan`, `refresh-all`, `context-skill` or `coverage`. Load only that mode's reference, and open a second one only when `refresh-all` reaches it.
- `context-skill` scaffolds a project-owned `<aspect>-context` for an aspect the shipped context map skills (`CONTEXT_MAP_SKILLS`) do not cover (`../agentic-qa-core/references/skill-scaffold.md` §3). It cites its sources and copies nothing from them. `refresh-all` never includes it. Its router row goes in the `## Project context skills` table of `.agents/instructions/agent-project.md` and its trigger phrases in that file's `triggers:`; `agent-skills-and-mcps.md` is the wrong place, because `bun sync` overwrites it.
- `coverage` reads the maps, the KATA manifest and the TMS, and puts every behaviour in one bucket (`automated`, `manual-only`, `weak`, `uncovered`). `refresh-all` never includes it. It writes only `<<PRIMARY_ROOT>>/.session/project-context/coverage/` (companion files: this skill opts out of the session Phase 0) and edits no test and no map. The `weak` verdict and the risk level are agent judgments with one evidence line per row; the buckets, order and diff come from `bun run context:coverage classify`. Coverage Tech Stories are created only after a person approves the gap list, picked by weight (`mkd` deck for per-item choices, the question tool for one yes/no).
- A map mode writes only its own skill's `references/<map>.html`. The legacy markdown files a project may hold (the skill's `legacy` list in `CONTEXT_MAP_SKILLS`, `cli/lib/context-maps.ts`) are read as input and are never deleted. Domain vocabulary and architecture come from the maps `project-discovery` generates (`bun run context:map business-domain-context` and `bun run context:map infra-context`), not from a `.context/` file. `test-plan` writes the `## Master Test Plan` section of the `QA Master Test Plan` Epic description in Jira (cached by the sync at `.context/PBI/qa-artifacts/master-test-plan.md`), never a local file.
- When the user did not name a mode, ask. A generic "refresh the context" is not `refresh-all`.
- `refresh-all` runs `data`, `e2e`, `api`, `test-plan` in that order, one at a time. Each reference's own validation and approval gate closes before the next one loads.
- A missing artifact (or a placeholder map) is CREATE mode: write once the analysis completes. An existing artifact is UPDATE mode: generate a candidate (for a map, only its stale sections), show the diff summary and wait for explicit approval. Overwriting an existing artifact without that approval, or regenerating a whole generated map, loses work the maps' readers depend on.
- Stop the run on a hard dependency failure or a rejected overwrite. A missing soft dependency is a Discovery Gap: record it and continue, as the selected reference defines.
- Business facts come from sources. Read every source the selected reference requires; what stays unverified goes under the output's mandatory `## Discovery Gaps`, not into the body. In `coverage` the gap list is a recomputed session file, so the approval gate applies to the tracker write it proposes.
- After a successful artifact write, add the pointer to `.agents/instructions/agent-project.md` when it is missing, and only there: `AGENTS.md` is boilerplate-owned and size-budgeted, and `CLAUDE.md` takes no operational prose. Placement follows `framework-development/references/instructions-doctrine.md` §4, then `bun run instructions:check`; any other instruction change is `/framework-development` mode `instructions`.
- Mode from `$ARGUMENTS`: when its first token matches a mode in the Mode routing table, that token is the mode and the rest is forwarded to it unchanged (`/project-context data` on Claude Code, "project-context mode data" in prose on OpenCode and Codex, `/skill:project-context data` on Pi). No matching first token: ask which mode.
- Before a step that uses a declared capability (`metadata.requires_capabilities`: `db`, `api-schema`, `diagrams` for the maps' figures), run the point-of-use check in `agentic-qa-core/references/preflight-gate.md` §8. It resolves the capability by tool-name suffix; when no available tool provides it, stop and name the capability and how to enable it.

**Read full SKILL.md when**: the requested mode is ambiguous, a `refresh-all` chain fails mid-sequence, or you need the selected reference's own analysis steps and validation gate.

## Mode routing

Resolve one mode from the invocation: the first token of `$ARGUMENTS` when it names a mode below (or `features`, the synonym of `e2e`), otherwise ask. Load only the reference in that row. The former `business-*-map` and `master-test-plan` command names survive as trigger phrases only.

| Mode | Trigger phrases | Reference | Output |
|---|---|---|---|
| `data` | `business-data-map`, entity/data map | `references/data.md` | `.agents/skills/business-data-context/references/business-data-map.html` |
| `e2e` | `business-e2e-map`, `business-feature-map`, `features`, user journeys, feature inventory | `references/e2e.md` | `.agents/skills/business-e2e-context/references/business-e2e-map.html` |
| `api` | `business-api-map`, API business map | `references/api.md` | `.agents/skills/business-api-context/references/business-api-map.html` |
| `test-plan` | `master-test-plan`, risk-ranked test roadmap | `references/test-plan.md` | MTP Epic description in Jira (cache: `.context/PBI/qa-artifacts/master-test-plan.md`) |
| `refresh-all` | refresh all project context | all four references, one at a time | all four outputs |
| `context-skill` | `context skill`, scaffold `<aspect>-context` for another aspect | `references/context-skill.md` | `.agents/skills/<aspect>-context/` (project-owned, never shipped upstream) |
| `coverage` | coverage inventory, coverage gaps, gap list, weak tests, what is not tested, behaviours vs tests | `references/coverage.md` | `<<PRIMARY_ROOT>>/.session/project-context/coverage/gap-list.{json,md}`; coverage Tech Stories in Jira only after approval |

## `refresh-all` dependency order

Run sequentially and complete each reference's own validation and approval gate before loading the next:

1. `data`
2. `e2e`
3. `api`
4. `test-plan`

A hard dependency failure or a rejected overwrite stops the chain. Missing soft dependencies stay Discovery Gaps, as each reference defines.

## After a map write

- A map mode writes into a business context skill that already exists (delivered by `bun sync`, never scaffolded here). After the write, it reviews that skill's `## Rules` and gotchas against the new map and proposes any change. It does not rewrite a rule.

## With nobody at the keyboard

Decision rules live in `agentic-qa-core/references/decision-protocol.md`. The waits in this skill resolve as follows when a supervised worker or a routine runs it:

| Wait | Supervised worker | Routine with nobody |
|---|---|---|
| Mode not named | the launcher names it | the brief's mode; none in the brief, stop and report |
| UPDATE diff approval | the launcher approves or rejects | write the candidate under `<<PRIMARY_ROOT>>/.session/project-context/candidates/`, leave the artifact untouched, report the diff summary; apply only when the brief approves that overwrite |
| Coverage run with no TMS read | the launcher decides manifest-only | stop unless the brief asks for a manifest-only run, then label it |
| Tech Story creation from the gap list | the launcher holds the gate | stop at `proposals/` and report; no tracker write without the brief's approval |

CREATE mode, the coverage session files and read-only analysis proceed in every case.
